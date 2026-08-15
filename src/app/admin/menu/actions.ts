"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { requireRole } from "@/lib/auth";
import { parseAmount } from "@/lib/money";
import { resolveSchoolId } from "@/lib/schools";

export type MenuActionState = { error?: string; success?: string };

function revalidateMenu() {
  revalidatePath("/admin/menu");
  revalidatePath("/scan");
  revalidatePath("/kiosk");
  revalidatePath("/family");
}

export async function createMenuItem(
  _prev: MenuActionState,
  formData: FormData
): Promise<MenuActionState> {
  await requireRole("ADMIN");
  const name = String(formData.get("name") || "").trim();
  const price = parseAmount(String(formData.get("price") || ""));
  const category = String(formData.get("category") || "").trim();
  const description = String(formData.get("description") || "").trim();
  // The school comes from the form rather than the header cookie: the page was
  // rendered for a particular menu, and the admin may have switched schools in
  // another tab since.
  const schoolId = await resolveSchoolId(formData.get("schoolId"));
  if (!name) return { error: "Name is required." };
  if (price === null) return { error: "Enter a valid price." };
  if (!schoolId) return { error: "Choose which school this item belongs to." };

  await prisma.menuItem.create({
    data: {
      name,
      price,
      category: category || null,
      description: description || null,
      schoolId,
    },
  });
  revalidateMenu();
  return { success: `Added ${name}.` };
}

export async function updateMenuItem(
  _prev: MenuActionState,
  formData: FormData
): Promise<MenuActionState> {
  await requireRole("ADMIN");
  const id = String(formData.get("id"));
  const name = String(formData.get("name") || "").trim();
  const price = parseAmount(String(formData.get("price") || ""));
  const category = String(formData.get("category") || "").trim();
  const description = String(formData.get("description") || "").trim();
  if (!name) return { error: "Name is required." };
  if (price === null) return { error: "Enter a valid price." };

  await prisma.menuItem.update({
    where: { id },
    data: {
      name,
      price,
      category: category || null,
      description: description || null,
    },
  });
  revalidateMenu();
  return { success: "Saved." };
}

/**
 * Marks an item out of stock, or back in.
 *
 * Separate from hiding it: sold-out is a daily switch the canteen flips when
 * they run out, and it drops the item from every ordering surface without
 * disturbing how it's set up. Orders already paid for are untouched — the
 * kitchen still owes that food.
 */
export async function setMenuItemSoldOut(id: string, soldOut: boolean) {
  await requireRole("ADMIN");
  await prisma.menuItem.update({ where: { id }, data: { soldOut } });
  revalidateMenu();
}

export async function setMenuItemActive(id: string, active: boolean) {
  await requireRole("ADMIN");
  await prisma.menuItem.update({ where: { id }, data: { active } });
  revalidateMenu();
}

/**
 * Removes an item from the menu for good.
 *
 * Safe to do at any time: every sale and every order stores its own snapshot
 * of what was bought and what it cost, so history reads the same afterwards.
 * The only thing that disappears is the button on the till.
 *
 * Hiding remains the gentler option — it keeps the item ready to bring back —
 * but a mistyped item nobody ever wants again shouldn't have to sit in the
 * list forever.
 */
export async function deleteMenuItem(id: string): Promise<MenuActionState> {
  await requireRole("ADMIN");
  const item = await prisma.menuItem.findUnique({
    where: { id },
    select: { name: true },
  });
  if (!item) return { error: "That item has already been removed." };

  await prisma.menuItem.delete({ where: { id } });
  revalidateMenu();
  return { success: `Deleted ${item.name}.` };
}
