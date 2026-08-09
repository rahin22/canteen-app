"use server";

import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { cancelPreorder } from "@/lib/preorders";
import { canActOnSchool } from "@/lib/schools";

/**
 * Cancels an order from the kitchen list — a student went home sick, an item
 * ran out — and refunds what was paid for it back onto the card.
 *
 * Operators can do this for their own school; admins for any.
 */
export async function adminCancelOrder(preorderId: string) {
  const session = await requireRole("ADMIN", "OPERATOR");

  const order = await prisma.preorder.findUnique({
    where: { id: preorderId },
    select: { student: { select: { schoolId: true } } },
  });
  if (!order || !(await canActOnSchool(order.student.schoolId))) return;

  await cancelPreorder(preorderId, session.uid);
  revalidatePath("/admin/preorders");
}
