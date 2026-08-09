import { prisma } from "./db";
import { startOfSchoolDay } from "./day";
import { formatMoney } from "./money";
import type { Prisma } from "@/generated/prisma/client";
import type { TxType } from "@/generated/prisma/enums";

export class LedgerError extends Error {}

/** Raised when a purchase would push a student past their daily spend cap. */
export class DailyLimitError extends LedgerError {
  constructor(readonly status: DailySpend) {
    super(
      status.limit === 0
        ? "Spending is blocked — their parent has set a daily limit of nothing."
        : status.remaining! > 0
        ? `Daily limit reached — only ${formatMoney(status.remaining!)} of today's ${formatMoney(status.limit!)} limit is left.`
        : `Daily limit reached — ${formatMoney(status.limit!)} already spent today.`
    );
  }
}

export type PurchaseLine = { name: string; price: number; qty: number };

/** Largest cap a parent may set, so a typo can't become a $10,000 allowance. */
export const MAX_DAILY_LIMIT = 20000;

export type DailySpend = {
  /** Cap in cents, or null when the student has no cap set. */
  limit: number | null;
  /** Cents already spent on purchases since local midnight. */
  spent: number;
  /** Cents still spendable today, or null when there's no cap. */
  remaining: number | null;
};

/**
 * How much of today's cap a student has used.
 *
 * PURCHASE rows count against it and REFUND rows net back off — a cancelled
 * preorder never became food, so it shouldn't eat into the day's allowance.
 * Top-ups obviously aren't spending, and manual ADJUSTMENT rows stay excluded
 * on purpose: an admin correcting a balance shouldn't quietly hand back
 * headroom that the school can't tell apart from a top-up.
 */
export async function getDailySpend(
  studentId: string,
  client: Prisma.TransactionClient | typeof prisma = prisma
): Promise<DailySpend> {
  const student = await client.user.findUnique({
    where: { id: studentId },
    select: { dailyLimit: true },
  });
  const limit = student?.dailyLimit ?? null;

  const sum = await client.transaction.aggregate({
    _sum: { amount: true },
    where: {
      studentId,
      type: { in: ["PURCHASE", "REFUND"] },
      createdAt: { gte: startOfSchoolDay() },
    },
  });
  // Purchases are negative and refunds positive, so the signed sum is already
  // the net movement; flip it to report spending as a positive number.
  const spent = Math.max(0, -(sum._sum.amount ?? 0));

  return {
    limit,
    spent,
    remaining: limit === null ? null : Math.max(0, limit - spent),
  };
}

/**
 * Atomically deducts `amount` (positive cents) from a student's balance and
 * records the purchase. Fails without side effects if the balance is short,
 * the account is inactive, the student doesn't exist, or the charge would
 * breach the student's daily spend cap.
 */
export async function chargeStudent(opts: {
  studentId: string;
  amount: number;
  /** Omitted when nobody served the sale — a student ordering at the kiosk. */
  operatorId?: string;
  items?: PurchaseLine[];
  note?: string;
  /**
   * Runs inside the same database transaction as the charge, once the money
   * has moved and the ledger row exists. Throwing from here rolls the whole
   * charge back — which is how collecting a preorder claims it exactly once.
   */
  onCharged?: (
    tx: Prisma.TransactionClient,
    transactionId: string
  ) => Promise<void>;
}) {
  const { studentId, amount, operatorId, items, note, onCharged } = opts;
  if (!Number.isInteger(amount) || amount <= 0) {
    throw new LedgerError("Invalid amount");
  }

  return prisma.$transaction(async (tx) => {
    // Take a row lock before reading the day's spend. The balance check below
    // is atomic on its own, but the cap check is read-then-write, so without
    // this two tills charging the same card at once could both see room under
    // the cap and both commit.
    await tx.$queryRaw`SELECT id FROM "User" WHERE id = ${studentId} FOR UPDATE`;

    const status = await getDailySpend(studentId, tx);
    if (status.remaining !== null && amount > status.remaining) {
      throw new DailyLimitError(status);
    }

    const updated = await tx.user.updateMany({
      where: { id: studentId, active: true, balance: { gte: amount } },
      data: { balance: { decrement: amount } },
    });
    if (updated.count === 0) {
      const student = await tx.user.findUnique({ where: { id: studentId } });
      if (!student || !student.active) throw new LedgerError("Account is not active");
      throw new LedgerError("Insufficient balance");
    }
    const record = await tx.transaction.create({
      data: {
        type: "PURCHASE",
        amount: -amount,
        studentId,
        operatorId,
        items: items ? (items as unknown as Prisma.InputJsonValue) : undefined,
        note,
      },
    });
    await onCharged?.(tx, record.id);
    const student = await tx.user.findUniqueOrThrow({
      where: { id: studentId },
      select: { balance: true, name: true },
    });
    return { transaction: record, newBalance: student.balance };
  });
}

/**
 * Atomically credits a student's balance and records the top-up.
 * For Stripe credits pass stripeSessionId — its unique constraint makes
 * webhook + success-page crediting idempotent (second attempt throws P2002).
 */
export async function creditStudent(opts: {
  studentId: string;
  amount: number;
  type: Extract<TxType, "TOPUP_CASH" | "TOPUP_STRIPE" | "ADJUSTMENT" | "REFUND">;
  operatorId?: string;
  note?: string;
  stripeSessionId?: string;
  /**
   * Runs inside the credit's own transaction, once the money is back. Throwing
   * rolls the refund back — how a cancelled preorder is reversed exactly once.
   */
  onCredited?: (
    tx: Prisma.TransactionClient,
    transactionId: string
  ) => Promise<void>;
}) {
  const { studentId, amount, type, operatorId, note, stripeSessionId, onCredited } =
    opts;
  if (!Number.isInteger(amount) || amount === 0) {
    throw new LedgerError("Invalid amount");
  }
  if (amount < 0 && type !== "ADJUSTMENT") {
    throw new LedgerError("Only adjustments may be negative");
  }

  return prisma.$transaction(async (tx) => {
    const record = await tx.transaction.create({
      data: { type, amount, studentId, operatorId, note, stripeSessionId },
    });
    const student = await tx.user.update({
      where: { id: studentId },
      data: { balance: { increment: amount } },
      select: { balance: true },
    });
    await onCredited?.(tx, record.id);
    return { transaction: record, newBalance: student.balance };
  });
}
