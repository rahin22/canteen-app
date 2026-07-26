"use server";

import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { requireRole } from "@/lib/auth";
import { getStripe } from "@/lib/stripe";
import { onlineTopupsAvailable } from "@/lib/settings";
import { parseAmount } from "@/lib/money";

export type TopupState = { error?: string };

const MIN_TOPUP = 500; // cents
const MAX_TOPUP = 20000;

/**
 * Starts a Stripe Checkout for a wallet top-up. Students top up themselves;
 * parents pass the child's id and must be linked to that child.
 */
export async function startCheckout(
  _prev: TopupState,
  formData: FormData
): Promise<TopupState> {
  const session = await requireRole("STUDENT", "PARENT");
  // Authoritative check — the UI hides the form when online top-ups are off,
  // but the action must refuse regardless of what the client submits.
  if (!(await onlineTopupsAvailable())) {
    return {
      error: "Online top-ups are turned off. Please top up with cash at the canteen.",
    };
  }
  const stripe = getStripe();
  if (!stripe) {
    return { error: "Online payments aren't set up yet. Please top up in person." };
  }

  let target: { id: string; name: string } | null = null;
  if (session.role === "STUDENT") {
    target = { id: session.uid, name: session.name };
  } else {
    const childId = String(formData.get("studentId") || "");
    const child = await prisma.user.findFirst({
      where: {
        id: childId,
        role: "STUDENT",
        active: true,
        parents: { some: { id: session.uid } },
      },
      select: { id: true, name: true },
    });
    if (!child) return { error: "That student isn't linked to your account." };
    target = child;
  }

  const preset = String(formData.get("preset") || "");
  const amount = preset
    ? Number(preset)
    : parseAmount(String(formData.get("custom") || ""));
  if (!amount || !Number.isInteger(amount)) return { error: "Enter a valid amount." };
  if (amount < MIN_TOPUP || amount > MAX_TOPUP) {
    return { error: `Top-ups must be between ${MIN_TOPUP / 100} and ${MAX_TOPUP / 100}.` };
  }

  const appUrl = process.env.APP_URL || "http://localhost:3000";
  const currency = (process.env.NEXT_PUBLIC_CURRENCY || "USD").toLowerCase();
  const cancelPath =
    session.role === "PARENT" ? `/family/${target.id}` : "/me/topup";

  const checkout = await stripe.checkout.sessions.create({
    mode: "payment",
    line_items: [
      {
        price_data: {
          currency,
          unit_amount: amount,
          product_data: {
            name: `Canteen top-up — ${target.name}`,
          },
        },
        quantity: 1,
      },
    ],
    metadata: { userId: target.id },
    success_url: `${appUrl}/me/topup/success?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${appUrl}${cancelPath}`,
  });

  redirect(checkout.url!);
}
