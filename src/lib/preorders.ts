import { prisma } from "./db";
import { formatClock, formatSchoolDay, startOfSchoolDay } from "./day";
import { describeSlot, orderingPlan } from "./pickup";
import { formatMoney } from "./money";
import { MAX_NOTE_LENGTH, readLines } from "./preorder-format";
import { ModifierError, priceLinesWithModifiers } from "./modifiers";
import { preorderCutoff, preordersOpen } from "./settings";
import {
  chargeStudent,
  creditStudent,
  getDailySpend,
  LedgerError,
  type PurchaseLine,
} from "./ledger";
import type { Prisma } from "@/generated/prisma/client";
import type { PreorderSource } from "@/generated/prisma/enums";

/**
 * Preordering, shared by the office kiosk and the parent portal.
 *
 * Both entry points authenticate completely differently — the kiosk is a
 * staff-authorised device where a child taps a card, the portal is a
 * logged-in parent — but neither is trusted to decide what may be ordered.
 * Everything past "which student" runs through this module, so the two
 * surfaces cannot drift apart on prices, cutoffs, limits or affordability.
 */

export class PreorderError extends Error {}

export {
  describeLines,
  MAX_NOTE_LENGTH,
  orderLabel,
  readLines,
} from "./preorder-format";

/** Nobody needs more than this many orders waiting on one day. */
export const MAX_PENDING_PER_DAY = 3;
/** Guards against a stuck kiosk racking up a huge order. */
const MAX_LINES = 20;
const MAX_QTY_PER_LINE = 10;

export type PreorderLine = {
  menuItemId: string;
  qty: number;
  /** Chosen sauces, salad, drink — validated and priced server-side. */
  optionIds?: string[];
};

/** Orders a student still has coming, today or on a later service day. */
export async function upcomingPreorders(
  studentId: string
): Promise<PreorderSummary[]> {
  const rows = await prisma.preorder.findMany({
    where: {
      studentId,
      status: "PENDING",
      serviceDate: { gte: startOfSchoolDay() },
    },
    orderBy: [{ serviceDate: "asc" }, { createdAt: "asc" }],
    include: {
      placedBy: { select: { name: true } },
      pickupSlot: true,
    },
  });
  return rows.map(toSummary);
}

export type PreorderSummary = {
  id: string;
  /** The short number both the canteen and the family call it by — null on
   *  orders taken before numbering existed. */
  orderNumber: number | null;
  items: PurchaseLine[];
  total: number;
  /** The special request left with the order, if there was one. */
  notes: string | null;
  source: PreorderSource;
  placedByName: string | null;
  createdAt: number;
  /** Which day the food is for, and when it can be collected. */
  serviceDate: number;
  dayLabel: string;
  /** The collection window's name on its own, e.g. "Secondary Lunch". */
  pickupLabel: string | null;
  /** The same window with its times, e.g. "Secondary Lunch · 12:00 – 12:20". */
  pickup: string | null;
};

/** Whether the school does preordering at all, for admin headings. */
export async function preorderStatus(): Promise<{
  enabled: boolean;
  cutoffLabel: string;
}> {
  return {
    enabled: await preordersOpen(),
    cutoffLabel: formatClock(await preorderCutoff()),
  };
}

/**
 * Orders for *today* that are still to be collected — what the till offers to
 * hand over. Deliberately not tomorrow's: that food doesn't exist yet.
 */
export async function pendingPreorders(
  studentId: string,
  client: Prisma.TransactionClient | typeof prisma = prisma
): Promise<PreorderSummary[]> {
  const rows = await client.preorder.findMany({
    where: {
      studentId,
      status: "PENDING",
      serviceDate: startOfSchoolDay(),
    },
    orderBy: { createdAt: "desc" },
    include: { placedBy: { select: { name: true } }, pickupSlot: true },
  });
  return rows.map(toSummary);
}

function toSummary(row: {
  id: string;
  orderNumber: number | null;
  items: unknown;
  total: number;
  notes?: string | null;
  source: PreorderSource;
  createdAt: Date;
  serviceDate: Date;
  placedBy?: { name: string } | null;
  pickupSlot?: {
    label: string;
    startTime: string;
    endTime: string;
  } | null;
}): PreorderSummary {
  return {
    id: row.id,
    orderNumber: row.orderNumber,
    items: readLines(row.items),
    total: row.total,
    notes: row.notes ?? null,
    source: row.source,
    placedByName: row.placedBy?.name ?? null,
    createdAt: row.createdAt.getTime(),
    serviceDate: row.serviceDate.getTime(),
    dayLabel: formatSchoolDay(row.serviceDate),
    pickupLabel: row.pickupSlot?.label ?? null,
    pickup: row.pickupSlot ? describeSlot(row.pickupSlot) : null,
  };
}

/**
 * What a student can spend right now.
 *
 * Orders are paid for as they're placed, so the balance and the day's spend
 * already account for anything waiting to be collected — there's no separate
 * pot of committed money to subtract.
 */
export async function orderHeadroom(studentId: string): Promise<{
  balance: number;
  spendable: number;
  dailyLimit: number | null;
  dailyRemaining: number | null;
}> {
  const [student, daily] = await Promise.all([
    prisma.user.findUniqueOrThrow({
      where: { id: studentId },
      select: { balance: true },
    }),
    getDailySpend(studentId),
  ]);

  return {
    balance: student.balance,
    spendable:
      daily.remaining === null
        ? student.balance
        : Math.min(student.balance, daily.remaining),
    dailyLimit: daily.limit,
    dailyRemaining: daily.remaining,
  };
}

/**
 * Places and pays for an order. `placedById` is the parent for portal orders
 * and null at the kiosk, where a card tap identifies the child without signing
 * anyone in.
 *
 * The money comes off as the order is placed: the ledger charge and the order
 * row are written in one database transaction, so there's no window where a
 * child has been charged for an order that doesn't exist, or vice versa. The
 * balance check and the parent's daily cap are enforced by that same charge.
 */
export async function placePreorder(opts: {
  studentId: string;
  placedById: string | null;
  source: PreorderSource;
  lines: PreorderLine[];
  /** Which collection window; must be one the plan currently offers. */
  pickupSlotId: string;
  /** Optional special request to pass to the kitchen. */
  notes?: string | null;
}): Promise<PreorderSummary> {
  const { studentId, placedById, source, lines, pickupSlotId } = opts;
  const notes = cleanNote(opts.notes);

  const student = await prisma.user.findUnique({
    where: { id: studentId },
    select: { id: true, role: true, active: true, schoolId: true },
  });
  if (!student || student.role !== "STUDENT") {
    throw new PreorderError("Student not found.");
  }
  if (!student.active) throw new PreorderError("This account is disabled.");
  if (!student.schoolId) {
    throw new PreorderError(
      "This student isn't assigned to a school yet — ask the office to set one."
    );
  }

  // Which day this order lands on, and which windows are still collectable,
  // is decided here rather than trusted from the client — the page may have
  // been open since before the cutoff.
  const plan = await orderingPlan(student.schoolId);
  if (!plan.open) throw new PreorderError(plan.reason);

  const slot = plan.slots.find((s) => s.id === pickupSlotId);
  if (!slot) {
    throw new PreorderError(
      "That pickup time isn't available any more — choose another."
    );
  }

  // Modifier problems ("choose a drink", "that sauce just sold out") are
  // ordinary user-facing messages, so they surface as PreorderError like
  // everything else the caller already knows how to display.
  let priced: PurchaseLine[];
  let total: number;
  try {
    ({ priced, total } = await priceLinesWithModifiers(lines, student.schoolId, {
      maxLines: MAX_LINES,
      maxQtyPerLine: MAX_QTY_PER_LINE,
    }));
  } catch (err) {
    if (err instanceof ModifierError) throw new PreorderError(err.message);
    throw err;
  }

  const existing = await prisma.preorder.count({
    where: { studentId, status: "PENDING", serviceDate: plan.serviceDate },
  });
  if (existing >= MAX_PENDING_PER_DAY) {
    throw new PreorderError(
      `There are already ${existing} orders waiting for ${plan.dayLabel}.`
    );
  }

  // Checked up front purely so the child gets a sentence they can act on
  // rather than a bare "insufficient balance" from the ledger. The charge
  // below re-checks both ceilings atomically and is what actually decides.
  const headroom = await orderHeadroom(studentId);
  if (total > headroom.spendable) {
    throw new PreorderError(affordabilityMessage(headroom, total));
  }

  let created: Awaited<ReturnType<typeof prisma.preorder.create>> | null = null;
  try {
    await chargeStudent({
      studentId,
      amount: total,
      // Kiosk orders have no operator: the child served themselves. The
      // ledger keeps the row without one rather than crediting a staff member
      // who wasn't there.
      operatorId: placedById ?? undefined,
      items: priced,
      note: `Preorder — ${slot.label}, ${plan.dayLabel}`,
      onCharged: async (tx, transactionId) => {
        created = await tx.preorder.create({
          data: {
            studentId,
            placedById,
            source,
            orderNumber: await nextOrderNumber(
              tx,
              student.schoolId!,
              plan.serviceDate
            ),
            schoolId: student.schoolId,
            items: priced as unknown as Prisma.InputJsonValue,
            total,
            notes,
            serviceDate: plan.serviceDate,
            pickupSlotId: slot.id,
            transactionId,
          },
          include: { pickupSlot: true },
        });
      },
    });
  } catch (err) {
    // Surface the ledger's own wording for the cases it owns.
    if (err instanceof LedgerError) throw new PreorderError(err.message);
    throw err;
  }

  const placedBy = placedById
    ? await prisma.user.findUnique({
        where: { id: placedById },
        select: { name: true },
      })
    : null;
  return toSummary({ ...created!, placedBy });
}

/**
 * Tidies a special request into something worth putting on the kitchen's list.
 *
 * Line breaks are folded into spaces so a note can't push the rest of an order
 * off the screen, and an empty one is stored as null rather than "" so the
 * board can simply ask whether there is a note at all. Over-long notes are
 * refused rather than cut short — half an allergy warning is worse than none.
 */
function cleanNote(input: string | null | undefined): string | null {
  const text = (input ?? "").replace(/\s+/g, " ").trim();
  if (!text) return null;
  if (text.length > MAX_NOTE_LENGTH) {
    throw new PreorderError(
      `Please keep the note under ${MAX_NOTE_LENGTH} characters — the canteen reads it off a list.`
    );
  }
  return text;
}

/**
 * Claims the next ticket number for one school's service day.
 *
 * The insert-or-increment is a single statement, so the row lock Postgres
 * takes on the counter is what serialises two orders placed at the same
 * moment — the second waits and gets the number after the first. It runs
 * inside the caller's transaction, so an order that fails to save gives its
 * number back rather than leaving a gap in the kitchen's list.
 *
 * Always after the student row lock in chargeStudent, never before, so the two
 * locks are taken in the same order everywhere and can't deadlock.
 */
async function nextOrderNumber(
  tx: Prisma.TransactionClient,
  schoolId: string,
  serviceDate: Date
): Promise<number> {
  const rows = await tx.$queryRaw<{ issued: number }[]>`
    INSERT INTO "OrderCounter" ("schoolId", "serviceDate", "issued")
    VALUES (${schoolId}, ${serviceDate}, 1)
    ON CONFLICT ("schoolId", "serviceDate")
    DO UPDATE SET "issued" = "OrderCounter"."issued" + 1
    RETURNING "issued"
  `;
  return rows[0].issued;
}

function affordabilityMessage(
  headroom: Awaited<ReturnType<typeof orderHeadroom>>,
  total: number
): string {
  // Which of the two ceilings actually bit, so the message names the one the
  // reader can do something about.
  const capBinds =
    headroom.dailyRemaining !== null && headroom.dailyRemaining < headroom.balance;

  if (headroom.spendable === 0) {
    return capBinds
      ? "Today's spending limit has already been used up."
      : "There's nothing left on the card to order with.";
  }

  const cost = formatMoney(total);
  return capBinds
    ? `That comes to ${cost}, but only ${formatMoney(headroom.spendable)} of today's ${formatMoney(headroom.dailyLimit!)} limit is left.`
    : `That comes to ${cost}, but there's only ${formatMoney(headroom.balance)} on the card.`;
}

/**
 * Cancels a pending order and puts the money back.
 *
 * The refund and the status change happen in one transaction, and the status
 * only moves from PENDING, so two people cancelling at once can't refund the
 * same order twice — the loser's update matches no rows and its refund rolls
 * back with it. Returns false when there was nothing pending to cancel.
 *
 * `operatorId` is recorded when a staff member did it; a parent or the student
 * cancelling their own order leaves it unset.
 */
export async function cancelPreorder(
  preorderId: string,
  operatorId?: string
): Promise<boolean> {
  const order = await prisma.preorder.findUnique({
    where: { id: preorderId },
    select: { id: true, studentId: true, total: true, status: true },
  });
  if (!order || order.status !== "PENDING") return false;

  try {
    await creditStudent({
      studentId: order.studentId,
      amount: order.total,
      type: "REFUND",
      operatorId,
      note: "Preorder cancelled",
      onCredited: async (tx) => {
        const claimed = await tx.preorder.updateMany({
          where: { id: order.id, status: "PENDING" },
          data: { status: "CANCELLED", cancelledAt: new Date() },
        });
        if (claimed.count === 0) {
          throw new AlreadyResolved();
        }
      },
    });
  } catch (err) {
    // Somebody else got there first — not an error worth showing anyone.
    if (err instanceof AlreadyResolved) return false;
    throw err;
  }
  return true;
}

/** Internal signal that a concurrent update already resolved the order. */
class AlreadyResolved extends Error {}

/**
 * Hands a paid order over at the counter.
 *
 * No money moves — it was taken when the order was placed. This only records
 * that the food left the counter, and only from PENDING, so a second tap
 * can't quietly mark somebody else's order collected.
 */
export async function handOverPreorder(opts: {
  preorderId: string;
  operatorId: string;
}): Promise<{ total: number; items: PurchaseLine[]; studentName: string }> {
  const order = await prisma.preorder.findUnique({
    where: { id: opts.preorderId },
    select: {
      id: true,
      items: true,
      total: true,
      status: true,
      student: { select: { name: true } },
    },
  });
  if (!order) throw new PreorderError("Order not found.");
  if (order.status !== "PENDING") {
    throw new PreorderError(
      order.status === "COLLECTED"
        ? "That order has already been handed over."
        : "That order was cancelled and refunded."
    );
  }

  const claimed = await prisma.preorder.updateMany({
    where: { id: order.id, status: "PENDING" },
    data: { status: "COLLECTED", collectedAt: new Date() },
  });
  if (claimed.count === 0) {
    throw new PreorderError("That order was just handed over by someone else.");
  }

  return {
    total: order.total,
    items: readLines(order.items),
    studentName: order.student.name,
  };
}
