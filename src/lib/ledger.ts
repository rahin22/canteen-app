import { prisma } from "./db";
import type { Prisma } from "@/generated/prisma/client";
import type { TxType } from "@/generated/prisma/enums";

export class LedgerError extends Error {}

export type PurchaseLine = { name: string; price: number; qty: number };

/**
 * Atomically deducts `amount` (positive cents) from a student's balance and
 * records the purchase. Fails without side effects if the balance is short,
 * the account is inactive, or the student doesn't exist.
 */
export async function chargeStudent(opts: {
  studentId: string;
  amount: number;
  operatorId: string;
  items?: PurchaseLine[];
  note?: string;
}) {
  const { studentId, amount, operatorId, items, note } = opts;
  if (!Number.isInteger(amount) || amount <= 0) {
    throw new LedgerError("Invalid amount");
  }

  return prisma.$transaction(async (tx) => {
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
  type: Extract<TxType, "TOPUP_CASH" | "TOPUP_STRIPE" | "ADJUSTMENT">;
  operatorId?: string;
  note?: string;
  stripeSessionId?: string;
}) {
  const { studentId, amount, type, operatorId, note, stripeSessionId } = opts;
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
    return { transaction: record, newBalance: student.balance };
  });
}
