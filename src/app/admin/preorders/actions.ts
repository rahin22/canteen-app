"use server";

import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/auth";
import { cancelPreorder } from "@/lib/preorders";

/**
 * Cancels an order from the kitchen list — a student went home sick, an item
 * ran out — and refunds what was paid for it back onto the card.
 */
export async function adminCancelOrder(preorderId: string) {
  const session = await requireRole("ADMIN");
  await cancelPreorder(preorderId, session.uid);
  revalidatePath("/admin/preorders");
}
