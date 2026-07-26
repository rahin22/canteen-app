import Stripe from "stripe";
import { prisma } from "./db";
import { creditStudent } from "./ledger";
import { Prisma } from "@/generated/prisma/client";

export function getStripe(): Stripe | null {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) return null;
  return new Stripe(key);
}

/**
 * Credits a student's wallet from a completed Stripe Checkout session.
 * Idempotent via the unique stripeSessionId — the webhook and the success
 * page can both call this without double-crediting.
 */
export async function creditFromStripeSession(session: Stripe.Checkout.Session) {
  if (session.payment_status !== "paid") return { credited: false as const };
  const userId = session.metadata?.userId;
  const amount = session.amount_total;
  if (!userId || !amount || amount <= 0) return { credited: false as const };

  const student = await prisma.user.findUnique({ where: { id: userId } });
  if (!student || student.role !== "STUDENT") return { credited: false as const };

  try {
    await creditStudent({
      studentId: userId,
      amount,
      type: "TOPUP_STRIPE",
      stripeSessionId: session.id,
      note: "Online top-up",
    });
    return { credited: true as const };
  } catch (err) {
    // P2002 = unique violation on stripeSessionId: already credited. Fine.
    if (
      err instanceof Prisma.PrismaClientKnownRequestError &&
      err.code === "P2002"
    ) {
      return { credited: true as const };
    }
    throw err;
  }
}
