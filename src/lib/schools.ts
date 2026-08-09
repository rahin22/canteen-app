import { cache } from "react";
import { cookies } from "next/headers";
import { prisma } from "./db";

/**
 * Multi-school support.
 *
 * One deployment serves several schools. Students, menus and registrations
 * each belong to exactly one; admins and parents don't, because a parent may
 * have children at more than one and an admin oversees the lot.
 *
 * Which school an admin is *looking at* is a view preference, so it lives in a
 * cookie rather than in the URL — otherwise every link in the admin would have
 * to carry it. `null` means "all schools".
 */

import { ALL_SCHOOLS, SCHOOL_COOKIE, type SchoolOption } from "./school-constants";

// Re-exported so server code can reach everything school-related from here.
export { SCHOOL_COOKIE, ALL_SCHOOLS };
export type { SchoolOption };

/** Schools that can take new students. Cached per request. */
export const activeSchools = cache(async function activeSchools(): Promise<
  SchoolOption[]
> {
  return prisma.school.findMany({
    where: { active: true },
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
    select: { id: true, name: true, active: true },
  });
});

/** Every school including retired ones, for admin screens. */
export const allSchools = cache(async function allSchools(): Promise<SchoolOption[]> {
  return prisma.school.findMany({
    orderBy: [{ active: "desc" }, { sortOrder: "asc" }, { name: "asc" }],
    select: { id: true, name: true, active: true },
  });
});

/**
 * The school the current admin has selected, or null for "all schools".
 *
 * A cookie naming a school that has since been deleted falls back to "all"
 * rather than silently showing an empty admin.
 */
export const currentSchoolId = cache(async function currentSchoolId(): Promise<
  string | null
> {
  const store = await cookies();
  const value = store.get(SCHOOL_COOKIE)?.value;
  if (!value || value === ALL_SCHOOLS) return null;

  const schools = await allSchools();
  return schools.some((s) => s.id === value) ? value : null;
});

/**
 * Spreadable Prisma filter for the selected school — `{}` when viewing all.
 * Use on models that have a schoolId of their own (User, MenuItem, …).
 */
export async function schoolFilter(): Promise<{ schoolId?: string }> {
  const id = await currentSchoolId();
  return id ? { schoolId: id } : {};
}

/**
 * Same idea for models reached through a student, e.g. transactions and
 * preorders, which take their school from whoever they belong to.
 */
export async function studentSchoolFilter(): Promise<{
  student?: { schoolId: string };
}> {
  const id = await currentSchoolId();
  return id ? { student: { schoolId: id } } : {};
}

/** Name of the selected school, for headings. Null when viewing all. */
export async function currentSchoolName(): Promise<string | null> {
  const id = await currentSchoolId();
  if (!id) return null;
  const schools = await allSchools();
  return schools.find((s) => s.id === id)?.name ?? null;
}

/**
 * The active menu for one school, in till order.
 *
 * Every ordering surface goes through this, so a student can only ever be
 * shown — and charged for — items from their own school. A student with no
 * school gets an empty menu rather than everything.
 */
export async function schoolMenu(schoolId: string | null) {
  if (!schoolId) return [];
  return prisma.menuItem.findMany({
    where: { schoolId, active: true },
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
    select: { id: true, name: true, price: true, category: true },
  });
}

/**
 * Validates a school id submitted from a form. Returns null when the id is
 * missing or doesn't name a real school, so callers can reject rather than
 * quietly filing a student under nothing.
 */
export async function resolveSchoolId(value: unknown): Promise<string | null> {
  const id = typeof value === "string" ? value.trim() : "";
  if (!id) return null;
  const schools = await allSchools();
  return schools.some((s) => s.id === id) ? id : null;
}
