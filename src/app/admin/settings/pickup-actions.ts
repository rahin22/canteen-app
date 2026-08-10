"use server";

import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { resolveSchoolId } from "@/lib/schools";

export type SlotState = { error?: string; success?: string };

/** "9:50", "09:50" and "0950" all normalise to "09:50"; anything else fails. */
function parseTime(raw: string): string | null {
  const match = /^(\d{1,2}):?(\d{2})$/.exec(raw.trim());
  if (!match) return null;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (hours > 23 || minutes > 59) return null;
  return `${String(hours).padStart(2, "0")}:${match[2]}`;
}

/**
 * Adds a collection window to one school's timetable.
 *
 * Per school because the two schools ring their bells at different times —
 * a single shared list would force one of them onto the other's schedule.
 */
export async function addPickupSlot(
  _prev: SlotState,
  formData: FormData
): Promise<SlotState> {
  await requireRole("ADMIN");
  const schoolId = await resolveSchoolId(formData.get("school"));
  const label = String(formData.get("label") || "").trim();
  const startTime = parseTime(String(formData.get("startTime") || ""));
  const endTime = parseTime(String(formData.get("endTime") || ""));

  if (!schoolId) return { error: "Choose a school." };
  if (!label) return { error: "Give the window a name, e.g. Primary Lunch." };
  if (!startTime || !endTime) return { error: "Enter times like 09:50." };
  if (endTime <= startTime) return { error: "The end time must be after the start." };

  const last = await prisma.pickupSlot.findFirst({
    where: { schoolId },
    orderBy: { sortOrder: "desc" },
  });
  await prisma.pickupSlot.create({
    data: {
      schoolId,
      label,
      startTime,
      endTime,
      sortOrder: (last?.sortOrder ?? -1) + 1,
    },
  });

  revalidateOrdering();
  return { success: `Added ${label}.` };
}

export async function updatePickupSlot(
  _prev: SlotState,
  formData: FormData
): Promise<SlotState> {
  await requireRole("ADMIN");
  const id = String(formData.get("id") || "");
  const label = String(formData.get("label") || "").trim();
  const startTime = parseTime(String(formData.get("startTime") || ""));
  const endTime = parseTime(String(formData.get("endTime") || ""));

  if (!label) return { error: "Give the window a name." };
  if (!startTime || !endTime) return { error: "Enter times like 09:50." };
  if (endTime <= startTime) return { error: "The end time must be after the start." };

  await prisma.pickupSlot.update({
    where: { id },
    data: { label, startTime, endTime },
  });
  revalidateOrdering();
  return { success: "Saved." };
}

/**
 * Retires or restores a window. Never deletes: orders already booked into it
 * keep pointing at it, so the kitchen can still see when they're due.
 */
export async function setPickupSlotActive(id: string, active: boolean) {
  await requireRole("ADMIN");
  await prisma.pickupSlot.update({ where: { id }, data: { active } });
  revalidateOrdering();
}

function revalidateOrdering() {
  revalidatePath("/admin/settings");
  revalidatePath("/admin/preorders");
  revalidatePath("/kiosk");
  revalidatePath("/scan");
  revalidatePath("/family");
}
