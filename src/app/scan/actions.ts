"use server";

import { prisma } from "@/lib/db";
import { requireRole } from "@/lib/auth";
import {
  chargeStudent,
  getDailySpend,
  LedgerError,
  type DailySpend,
  type PurchaseLine,
} from "@/lib/ledger";
import { resolveCardInput } from "@/lib/cards";
import { canActOnSchool, schoolMenu } from "@/lib/schools";
import {
  handOverPreorder,
  pendingPreorders,
  PreorderError,
  type PreorderSummary,
} from "@/lib/preorders";

/**
 * The student's most recent purchase, shown at the top of the order screen so
 * an operator can spot that this card was already charged a few minutes ago —
 * students routinely come back to the counter while waiting for their food.
 */
export type LastPurchase = {
  /** Positive cents. */
  total: number;
  /** Epoch milliseconds, so the client can render "4 minutes ago". */
  at: number;
  /** e.g. "Sausage roll ×2, Juice". */
  summary: string;
  /** Name of the operator who took it, when we recorded one. */
  operator: string | null;
};

export type ScanStudent = {
  studentId: string;
  name: string;
  className: string | null;
  username: string;
  balance: number;
  /** Whether an ID photo exists — the image itself is fetched authenticated. */
  hasPhoto: boolean;
  /** Daily spend cap set by a parent, and how much of it is left today. */
  daily: DailySpend;
  lastPurchase: LastPurchase | null;
  /** Orders placed ahead at the kiosk or by a parent, waiting to be collected. */
  pendingOrders: PreorderSummary[];
  /**
   * This student's school menu. Sent with the lookup rather than baked into
   * the page so one till can serve either school — the menu follows whoever
   * presents a card, and nobody has to configure the device.
   */
  menu: MenuItem[];
  schoolName: string | null;
};

export type MenuItem = {
  id: string;
  name: string;
  price: number;
  category: string | null;
};

export type LookupResult =
  | { ok: true; student: ScanStudent }
  | { ok: false; error: string };

/**
 * Resolves a scanned QR token (or a manually typed username) to a student.
 */
export async function lookupCard(rawInput: string): Promise<LookupResult> {
  await requireRole("ADMIN", "OPERATOR");

  const found = await resolveCardInput(rawInput);
  if (!found.ok) return { ok: false, error: found.error };

  const user = found.student;
  // An operator's till only serves their own school. Refuses by name rather
  // than pretending the card doesn't exist, so staff can tell a wrong-school
  // card from a broken one and send the student to the right counter.
  if (!(await canActOnSchool(user.schoolId))) {
    return {
      ok: false,
      error: "That card belongs to a student at another school.",
    };
  }
  const studentId = user.id;
  const [daily, recent, pendingOrders, menu, school] = await Promise.all([
    getDailySpend(studentId),
    prisma.transaction.findMany({
      where: { studentId, type: "PURCHASE" },
      orderBy: { createdAt: "desc" },
      take: 5,
      include: {
        operator: { select: { name: true } },
        preorder: { select: { status: true } },
      },
    }),
    pendingPreorders(studentId),
    schoolMenu(user.schoolId),
    user.schoolId
      ? prisma.school.findUnique({
          where: { id: user.schoolId },
          select: { name: true },
        })
      : null,
  ]);

  // A preorder paid for this morning is a charge, but it isn't a *serving* —
  // the food is still behind the counter. Counting it as one would put a
  // "already served 5 minutes ago" warning in front of every child who
  // ordered at the kiosk and walked straight over. Once it's been handed
  // over it belongs in the banner like any other sale.
  const previous =
    recent.find((tx) => tx.preorder === null || tx.preorder.status !== "PENDING") ??
    null;

  return {
    ok: true,
    student: {
      studentId,
      name: user.name,
      className: user.className,
      username: user.username,
      balance: user.balance,
      hasPhoto: Boolean(user.photoId),
      daily,
      lastPurchase: previous
        ? {
            total: Math.abs(previous.amount),
            at: previous.createdAt.getTime(),
            summary: describeItems(previous.items),
            operator: previous.operator?.name ?? null,
          }
        : null,
      pendingOrders,
      menu,
      schoolName: school?.name ?? null,
    },
  };
}

function describeItems(items: unknown): string {
  if (Array.isArray(items)) {
    const parts = (items as { name?: string; qty?: number }[])
      .filter((l) => l.name)
      .map((l) => (l.qty && l.qty > 1 ? `${l.name} ×${l.qty}` : l.name));
    if (parts.length) return parts.join(", ");
  }
  return "Purchase";
}

export type HandOverResult =
  | { ok: true; total: number }
  | { ok: false; error: string };

/**
 * Records that a prepaid order left the counter. Takes no money — that was
 * done when the order was placed.
 */
export async function handOverOrder(preorderId: string): Promise<HandOverResult> {
  const session = await requireRole("ADMIN", "OPERATOR");

  const order = await prisma.preorder.findUnique({
    where: { id: preorderId },
    select: { student: { select: { schoolId: true } } },
  });
  if (!order || !(await canActOnSchool(order.student.schoolId))) {
    return { ok: false, error: "That order belongs to another school." };
  }

  try {
    const result = await handOverPreorder({ preorderId, operatorId: session.uid });
    return { ok: true, total: result.total };
  } catch (err) {
    if (err instanceof LedgerError || err instanceof PreorderError) {
      return { ok: false, error: err.message };
    }
    throw err;
  }
}

export type ChargeInput = {
  studentId: string;
  lines: { menuItemId: string; qty: number }[];
  customAmount?: number; // cents
};

export type ChargeResult =
  | { ok: true; newBalance: number; total: number; daily: DailySpend }
  | { ok: false; error: string; daily?: DailySpend };

export async function charge(input: ChargeInput): Promise<ChargeResult> {
  const session = await requireRole("ADMIN", "OPERATOR");

  // Recompute the total server-side from live menu prices — never trust
  // client-provided prices. Scoped to the student's own school, so a stale or
  // tampered payload can't charge them for another school's item.
  const student = await prisma.user.findUnique({
    where: { id: input.studentId },
    select: { schoolId: true },
  });
  if (!student) return { ok: false, error: "Student not found." };
  if (!(await canActOnSchool(student.schoolId))) {
    return { ok: false, error: "That student is at another school." };
  }
  if (!student.schoolId && input.lines.length > 0) {
    return {
      ok: false,
      error: "This student isn't assigned to a school — set one on their record.",
    };
  }

  const ids = input.lines.map((l) => l.menuItemId);
  const menuItems = ids.length
    ? await prisma.menuItem.findMany({
        where: {
          id: { in: ids },
          active: true,
          schoolId: student.schoolId!,
        },
      })
    : [];
  if (menuItems.length !== new Set(ids).size) {
    return { ok: false, error: "Menu changed — please rebuild the order." };
  }

  const lines: PurchaseLine[] = [];
  let total = 0;
  for (const l of input.lines) {
    const item = menuItems.find((m) => m.id === l.menuItemId)!;
    const qty = Math.floor(l.qty);
    if (qty < 1 || qty > 50) return { ok: false, error: "Invalid quantity." };
    lines.push({ name: item.name, price: item.price, qty });
    total += item.price * qty;
  }
  if (input.customAmount) {
    const c = Math.floor(input.customAmount);
    if (!Number.isFinite(c) || c <= 0 || c > 50000) {
      return { ok: false, error: "Invalid custom amount." };
    }
    lines.push({ name: "Custom amount", price: c, qty: 1 });
    total += c;
  }
  if (total <= 0) return { ok: false, error: "Order is empty." };

  try {
    const result = await chargeStudent({
      studentId: input.studentId,
      amount: total,
      operatorId: session.uid,
      items: lines,
    });
    return {
      ok: true,
      newBalance: result.newBalance,
      total,
      daily: await getDailySpend(input.studentId),
    };
  } catch (err) {
    if (err instanceof LedgerError) {
      // Hand back the fresh figures so the till reflects reality even when the
      // cap moved under the operator (a second till, or a stale screen).
      return {
        ok: false,
        error: err.message,
        daily: await getDailySpend(input.studentId),
      };
    }
    throw err;
  }
}
