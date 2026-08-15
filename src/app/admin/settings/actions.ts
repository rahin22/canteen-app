"use server";

import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { normalizeCutoff, setSetting, SETTINGS } from "@/lib/settings";

export async function setFlag(key: string, enabled: boolean) {
  await requireRole("ADMIN");
  // Only known keys — never let a client name an arbitrary setting row.
  const allowed: string[] = [
    SETTINGS.onlineTopups,
    SETTINGS.parentSignup,
    SETTINGS.email,
    SETTINGS.preorders,
  ];
  if (!allowed.includes(key)) return;

  await setSetting(key, enabled ? "on" : "off");
  revalidatePath("/kiosk");
  revalidatePath("/admin/settings");
  revalidatePath("/me");
  revalidatePath("/me/topup");
  revalidatePath("/family");
  revalidatePath("/login");
  // The email flag changes whether these render a form or an "ask the office"
  // notice, and both are otherwise cacheable.
  revalidatePath("/forgot-password");
  revalidatePath("/verify-email");
}

export type SchoolState = { error?: string; success?: string };

const MAX_SCHOOL_NAME = 80;

/** Adds a school. It starts with an empty menu and no students. */
export async function addSchool(
  _prev: SchoolState,
  formData: FormData
): Promise<SchoolState> {
  await requireRole("ADMIN");
  const name = String(formData.get("name") || "").trim();
  if (!name) return { error: "Enter a school name." };
  if (name.length > MAX_SCHOOL_NAME) return { error: "That name is too long." };

  const clash = await prisma.school.findFirst({
    where: { name: { equals: name, mode: "insensitive" } },
  });
  if (clash) return { error: `"${name}" already exists.` };

  const last = await prisma.school.findFirst({ orderBy: { sortOrder: "desc" } });
  await prisma.school.create({
    data: { name, sortOrder: (last?.sortOrder ?? -1) + 1 },
  });

  revalidateSchools();
  return { success: `Added ${name}. Switch to it in the header to build its menu.` };
}

export async function renameSchool(
  schoolId: string,
  rawName: string
): Promise<SchoolState> {
  await requireRole("ADMIN");
  const name = rawName.trim();
  if (!name) return { error: "Enter a school name." };
  if (name.length > MAX_SCHOOL_NAME) return { error: "That name is too long." };

  const clash = await prisma.school.findFirst({
    where: { name: { equals: name, mode: "insensitive" }, id: { not: schoolId } },
  });
  if (clash) return { error: `"${name}" already exists.` };

  await prisma.school.update({ where: { id: schoolId }, data: { name } });
  revalidateSchools();
  return { success: "Saved." };
}

/**
 * Retires or reinstates a school. Never deletes: students, transactions and
 * orders stay attached to the school they belong to, and a retired school
 * simply stops appearing where new records are created.
 */
export async function setSchoolActive(schoolId: string, active: boolean) {
  await requireRole("ADMIN");
  await prisma.school.update({ where: { id: schoolId }, data: { active } });
  revalidateSchools();
}

/**
 * Deletes a school that never got going — added by mistake, or set up and
 * then abandoned.
 *
 * Only while nobody is attached to it. Once a school has staff, students or
 * registrations, deleting would orphan people rather than records: their
 * accounts survive with no school, which is the one state the ordering code
 * treats as "shows nothing". Retiring covers that case properly, so this
 * refuses and says so.
 *
 * Its menu, choice groups and pick-up windows go with it — none of them mean
 * anything without the school, and orders keep their own snapshot regardless.
 */
export async function deleteSchool(schoolId: string): Promise<SchoolState> {
  await requireRole("ADMIN");
  const school = await prisma.school.findUnique({
    where: { id: schoolId },
    select: {
      name: true,
      _count: { select: { users: true, registrations: true, preorders: true } },
    },
  });
  if (!school) return { error: "That school has already been removed." };

  const attached =
    school._count.users + school._count.registrations + school._count.preorders;
  if (attached > 0) {
    const parts = [
      school._count.users && `${school._count.users} account${school._count.users === 1 ? "" : "s"}`,
      school._count.registrations &&
        `${school._count.registrations} registration${school._count.registrations === 1 ? "" : "s"}`,
      school._count.preorders &&
        `${school._count.preorders} order${school._count.preorders === 1 ? "" : "s"}`,
    ].filter(Boolean);
    return {
      error: `${school.name} still has ${parts.join(" and ")}, so it can't be deleted. Retire it instead — it stops taking new students and orders, and everything stays where it belongs.`,
    };
  }

  await prisma.school.delete({ where: { id: schoolId } });
  revalidateSchools();
  return { success: `Deleted ${school.name}.` };
}

function revalidateSchools() {
  revalidatePath("/admin/settings");
  revalidatePath("/admin/menu");
  revalidatePath("/admin/students");
  revalidatePath("/family/register");
}

export type CutoffState = { error?: string; success?: string };

/** Sets the time of day after which today's orders stop being accepted. */
export async function setPreorderCutoff(
  _prev: CutoffState,
  formData: FormData
): Promise<CutoffState> {
  await requireRole("ADMIN");
  const raw = String(formData.get("cutoff") || "").trim();
  const match = /^(\d{1,2}):(\d{2})$/.exec(raw);
  if (!match) return { error: "Enter a time like 09:30." };
  if (Number(match[1]) > 23 || Number(match[2]) > 59) {
    return { error: "Enter a valid time between 00:00 and 23:59." };
  }

  const normalized = normalizeCutoff(raw);
  await setSetting(SETTINGS.preorderCutoff, normalized);
  revalidatePath("/admin/settings");
  revalidatePath("/kiosk");
  revalidatePath("/family");
  return { success: `Orders now close at ${normalized}.` };
}
