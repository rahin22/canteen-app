import { prisma } from "./db";
import {
  formatClock,
  parseClockMinutes,
  schoolClockMinutes,
  startOfSchoolDay,
} from "./day";
import { formatMoney } from "./money";
import { readLines } from "./preorder-format";
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

export { describeLines, readLines } from "./preorder-format";

/** Nobody needs more than this many orders waiting on one day. */
export const MAX_PENDING_PER_DAY = 3;
/** Guards against a stuck kiosk racking up a huge order. */
const MAX_LINES = 20;
const MAX_QTY_PER_LINE = 10;

export type PreorderLine = { menuItemId: string; qty: number };

export type PreorderSummary = {
  id: string;
  items: PurchaseLine[];
  total: number;
  source: PreorderSource;
  placedByName: string | null;
  createdAt: number;
};

/**
 * Whether orders are being taken, and if not, why.
 *
 * `enabled` separates "the school doesn't do preordering" from "today's
 * orders have closed" — surfaces hide the feature outright in the first case
 * and explain the cutoff in the second.
 */
export type PreorderWindow =
  | { open: true; enabled: true; cutoff: string; cutoffLabel: string }
  | { open: false; enabled: boolean; reason: string };

/**
 * Whether orders can be placed at this moment.
 *
 * Checked on every render *and* again inside placePreorder — a kiosk left
 * open on a windowsill would otherwise happily submit an order at 2pm.
 */
export async function preorderWindow(now: Date = new Date()): Promise<PreorderWindow> {
  if (!(await preordersOpen())) {
    return {
      open: false,
      enabled: false,
      reason: "Preordering is switched off at the moment.",
    };
  }
  const cutoff = await preorderCutoff();
  const cutoffLabel = formatClock(cutoff);
  if (schoolClockMinutes(now) >= parseClockMinutes(cutoff)) {
    return {
      open: false,
      enabled: true,
      reason: `Orders for today closed at ${cutoffLabel}. Come to the canteen counter instead.`,
    };
  }
  return { open: true, enabled: true, cutoff, cutoffLabel };
}

/** Pending orders a student has for today, newest first. */
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
    include: { placedBy: { select: { name: true } } },
  });
  return rows.map(toSummary);
}

function toSummary(row: {
  id: string;
  items: unknown;
  total: number;
  source: PreorderSource;
  createdAt: Date;
  placedBy?: { name: string } | null;
}): PreorderSummary {
  return {
    id: row.id,
    items: readLines(row.items),
    total: row.total,
    source: row.source,
    placedByName: row.placedBy?.name ?? null,
    createdAt: row.createdAt.getTime(),
  };
}

/**
 * Prices an order from the live menu. Never trusts client-supplied prices —
 * the kiosk in particular is a device children can poke at all day.
 */
async function priceLines(
  lines: PreorderLine[],
  schoolId: string
): Promise<{
  priced: PurchaseLine[];
  total: number;
}> {
  if (lines.length === 0) throw new PreorderError("Nothing chosen yet.");
  if (lines.length > MAX_LINES) throw new PreorderError("That's too many items for one order.");

  const ids = lines.map((l) => l.menuItemId);
  // Scoped to the student's own school, so neither the kiosk nor a crafted
  // request can order from the other school's menu.
  const menuItems = await prisma.menuItem.findMany({
    where: { id: { in: ids }, active: true, schoolId },
  });
  if (menuItems.length !== new Set(ids).size) {
    throw new PreorderError("The menu changed — please choose again.");
  }

  const priced: PurchaseLine[] = [];
  let total = 0;
  for (const line of lines) {
    const item = menuItems.find((m) => m.id === line.menuItemId)!;
    const qty = Math.floor(line.qty);
    if (!Number.isFinite(qty) || qty < 1 || qty > MAX_QTY_PER_LINE) {
      throw new PreorderError("Invalid quantity.");
    }
    priced.push({ name: item.name, price: item.price, qty });
    total += item.price * qty;
  }
  if (total <= 0) throw new PreorderError("Nothing chosen yet.");
  return { priced, total };
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
}): Promise<PreorderSummary> {
  const { studentId, placedById, source, lines } = opts;

  const window = await preorderWindow();
  if (!window.open) throw new PreorderError(window.reason);

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

  const { priced, total } = await priceLines(lines, student.schoolId);

  const existing = await pendingPreorders(studentId);
  if (existing.length >= MAX_PENDING_PER_DAY) {
    throw new PreorderError(
      `There are already ${existing.length} orders waiting to be collected today.`
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
      note: source === "KIOSK" ? "Preorder (kiosk)" : "Preorder (parent)",
      onCharged: async (tx, transactionId) => {
        created = await tx.preorder.create({
          data: {
            studentId,
            placedById,
            source,
            items: priced as unknown as Prisma.InputJsonValue,
            total,
            serviceDate: startOfSchoolDay(),
            transactionId,
          },
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
