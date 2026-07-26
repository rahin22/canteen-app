"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { requireRole } from "@/lib/auth";
import { parseAmount } from "@/lib/money";

export type MenuActionState = { error?: string; success?: string };

export async function createMenuItem(
  _prev: MenuActionState,
  formData: FormData
): Promise<MenuActionState> {
  await requireRole("ADMIN");
  const name = String(formData.get("name") || "").trim();
  const price = parseAmount(String(formData.get("price") || ""));
  const category = String(formData.get("category") || "").trim();
  if (!name) return { error: "Name is required." };
  if (price === null) return { error: "Enter a valid price." };

  await prisma.menuItem.create({
    data: { name, price, category: category || null },
  });
  revalidatePath("/admin/menu");
  revalidatePath("/scan");
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
  if (!name) return { error: "Name is required." };
  if (price === null) return { error: "Enter a valid price." };

  await prisma.menuItem.update({
    where: { id },
    data: { name, price, category: category || null },
  });
  revalidatePath("/admin/menu");
  revalidatePath("/scan");
  return { success: "Saved." };
}

export async function setMenuItemActive(id: string, active: boolean) {
  await requireRole("ADMIN");
  await prisma.menuItem.update({ where: { id }, data: { active } });
  revalidatePath("/admin/menu");
  revalidatePath("/scan");
}
