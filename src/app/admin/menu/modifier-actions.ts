"use server";

import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { parseAmount } from "@/lib/money";
import { resolveSchoolId } from "@/lib/schools";

export type ModifierState = { error?: string; success?: string };

function revalidateMenu() {
  revalidatePath("/admin/menu");
  revalidatePath("/scan");
  revalidatePath("/kiosk");
  revalidatePath("/family");
}

/**
 * Creates a choice group — "Sauces", "Salad", "Drink", "Combo meal".
 *
 * min/max express the rule: 0/3 is an optional multi-pick, 1/1 forces exactly
 * one. Everything downstream reads those numbers rather than special-casing
 * particular group names.
 */
export async function createModifierGroup(
  _prev: ModifierState,
  formData: FormData
): Promise<ModifierState> {
  await requireRole("ADMIN");
  const schoolId = await resolveSchoolId(formData.get("schoolId"));
  const name = String(formData.get("name") || "").trim();
  const minSelect = Number(formData.get("minSelect") ?? 0);
  const maxSelect = Number(formData.get("maxSelect") ?? 1);

  if (!schoolId) return { error: "Choose a school." };
  if (!name) return { error: "Give the group a name, e.g. Sauces." };
  if (!Number.isInteger(minSelect) || minSelect < 0 || minSelect > 20) {
    return { error: "Minimum must be between 0 and 20." };
  }
  if (!Number.isInteger(maxSelect) || maxSelect < 1 || maxSelect > 20) {
    return { error: "Maximum must be between 1 and 20." };
  }
  if (minSelect > maxSelect) {
    return { error: "The minimum can't be more than the maximum." };
  }

  const last = await prisma.modifierGroup.findFirst({
    where: { schoolId },
    orderBy: { sortOrder: "desc" },
  });
  await prisma.modifierGroup.create({
    data: {
      schoolId,
      name,
      minSelect,
      maxSelect,
      sortOrder: (last?.sortOrder ?? -1) + 1,
    },
  });
  revalidateMenu();
  return { success: `Added ${name}.` };
}

export async function updateModifierGroup(
  _prev: ModifierState,
  formData: FormData
): Promise<ModifierState> {
  await requireRole("ADMIN");
  const id = String(formData.get("id") || "");
  const name = String(formData.get("name") || "").trim();
  const minSelect = Number(formData.get("minSelect") ?? 0);
  const maxSelect = Number(formData.get("maxSelect") ?? 1);

  if (!name) return { error: "Give the group a name." };
  if (!Number.isInteger(minSelect) || minSelect < 0 || minSelect > 20) {
    return { error: "Minimum must be between 0 and 20." };
  }
  if (!Number.isInteger(maxSelect) || maxSelect < 1 || maxSelect > 20) {
    return { error: "Maximum must be between 1 and 20." };
  }
  if (minSelect > maxSelect) {
    return { error: "The minimum can't be more than the maximum." };
  }

  await prisma.modifierGroup.update({
    where: { id },
    data: { name, minSelect, maxSelect },
  });
  revalidateMenu();
  return { success: "Saved." };
}

export async function setModifierGroupActive(id: string, active: boolean) {
  await requireRole("ADMIN");
  await prisma.modifierGroup.update({ where: { id }, data: { active } });
  revalidateMenu();
}

/**
 * Deletes a group and every choice in it, and detaches it from the items that
 * used it.
 *
 * Orders keep their own copy of what was chosen, so deleting "Sauces" doesn't
 * rewrite a ticket that said "Garlic" — it only stops the question being asked
 * from now on. Hiding stays available for a group that's coming back.
 */
export async function deleteModifierGroup(id: string): Promise<ModifierState> {
  await requireRole("ADMIN");
  const group = await prisma.modifierGroup.findUnique({
    where: { id },
    select: { name: true },
  });
  if (!group) return { error: "That group has already been removed." };

  await prisma.modifierGroup.delete({ where: { id } });
  revalidateMenu();
  return { success: `Deleted ${group.name}.` };
}

/** Adds one choice to a group. A blank price means it's free. */
export async function createModifierOption(
  _prev: ModifierState,
  formData: FormData
): Promise<ModifierState> {
  await requireRole("ADMIN");
  const groupId = String(formData.get("groupId") || "");
  const name = String(formData.get("name") || "").trim();
  const rawPrice = String(formData.get("price") || "").trim();

  if (!name) return { error: "Name the choice, e.g. Garlic sauce." };
  // Most sauces cost nothing, so an empty box means free rather than invalid.
  const price = rawPrice ? parseAmount(rawPrice) : 0;
  if (price === null) return { error: "Enter a valid price, or leave it blank for free." };

  const group = await prisma.modifierGroup.findUnique({ where: { id: groupId } });
  if (!group) return { error: "That group no longer exists." };

  const last = await prisma.modifierOption.findFirst({
    where: { groupId },
    orderBy: { sortOrder: "desc" },
  });
  await prisma.modifierOption.create({
    data: { groupId, name, price, sortOrder: (last?.sortOrder ?? -1) + 1 },
  });
  revalidateMenu();
  return { success: `Added ${name}.` };
}

/** Renames a choice or changes what it costs. Blank price still means free. */
export async function updateModifierOption(
  _prev: ModifierState,
  formData: FormData
): Promise<ModifierState> {
  await requireRole("ADMIN");
  const id = String(formData.get("id") || "");
  const name = String(formData.get("name") || "").trim();
  const rawPrice = String(formData.get("price") || "").trim();

  if (!name) return { error: "Name the choice, e.g. Garlic sauce." };
  const price = rawPrice ? parseAmount(rawPrice) : 0;
  if (price === null) {
    return { error: "Enter a valid price, or leave it blank for free." };
  }

  await prisma.modifierOption.update({ where: { id }, data: { name, price } });
  revalidateMenu();
  return { success: "Saved." };
}

/** Out of stock for one choice — the group simply offers fewer options. */
export async function setModifierOptionSoldOut(id: string, soldOut: boolean) {
  await requireRole("ADMIN");
  await prisma.modifierOption.update({ where: { id }, data: { soldOut } });
  revalidateMenu();
}

export async function deleteModifierOption(id: string) {
  await requireRole("ADMIN");
  await prisma.modifierOption.delete({ where: { id } });
  revalidateMenu();
}

/**
 * Attaches or detaches a choice group from a menu item.
 *
 * Groups are reusable: one "Sauces" group can hang off every roll and burger,
 * so adding a sauce to the list adds it everywhere at once.
 */
export async function toggleItemModifier(
  menuItemId: string,
  groupId: string,
  attached: boolean
) {
  await requireRole("ADMIN");
  await prisma.menuItem.update({
    where: { id: menuItemId },
    data: {
      modifierGroups: attached
        ? { connect: { id: groupId } }
        : { disconnect: { id: groupId } },
    },
  });
  revalidateMenu();
}
