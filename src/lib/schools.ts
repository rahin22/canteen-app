import { cache } from "react";
import { cookies } from "next/headers";
import { prisma } from "./db";
import { getSession } from "./auth";

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
 * What the signed-in staff member is allowed to see.
 *
 * Deliberately three cases rather than `string | null`. An operator whose
 * account has no school must see *nothing*, and with a nullable id that state
 * is indistinguishable from an admin's "all schools" — one missing assignment
 * would quietly hand them every school. `none` makes that impossible to get
 * wrong.
 */
export type SchoolScope =
  | { kind: "all" }
  | { kind: "school"; id: string }
  | { kind: "none" };

/**
 * Resolves the scope for this request.
 *
 * Admins pick a school from the header (a view preference, held in a cookie).
 * Operators are pinned to the one school on their account and can't switch —
 * the cookie is ignored for them entirely, so setting it by hand achieves
 * nothing.
 */
export const schoolScope = cache(async function schoolScope(): Promise<SchoolScope> {
  const session = await getSession();
  if (!session) return { kind: "none" };

  if (session.role === "OPERATOR") {
    const staff = await prisma.user.findUnique({
      where: { id: session.uid },
      select: { schoolId: true },
    });
    return staff?.schoolId ? { kind: "school", id: staff.schoolId } : { kind: "none" };
  }

  if (session.role !== "ADMIN") return { kind: "none" };

  const store = await cookies();
  const value = store.get(SCHOOL_COOKIE)?.value;
  if (!value || value === ALL_SCHOOLS) return { kind: "all" };

  const schools = await allSchools();
  // A cookie naming a school that has since been deleted falls back to "all"
  // rather than silently showing an empty admin.
  return schools.some((s) => s.id === value)
    ? { kind: "school", id: value }
    : { kind: "all" };
});

/**
 * The school in view, or null for "all schools".
 *
 * Only for display and for pre-filling forms — never as a security filter,
 * because it flattens `none` to null. Use schoolFilter()/studentSchoolFilter()
 * for queries.
 */
export const currentSchoolId = cache(async function currentSchoolId(): Promise<
  string | null
> {
  const scope = await schoolScope();
  return scope.kind === "school" ? scope.id : null;
});

/** Whether the viewer may switch schools (admins) or is pinned to one. */
export async function canSwitchSchools(): Promise<boolean> {
  const session = await getSession();
  return session?.role === "ADMIN";
}

/** Matches nothing — how `none` is expressed as a Prisma filter. */
const MATCH_NOTHING = { in: [] as string[] };

type SchoolWhere = { schoolId?: string | { in: string[] } };

/**
 * Spreadable Prisma filter for the current scope — `{}` when viewing all.
 * Use on models that have a schoolId of their own (User, MenuItem, …).
 */
export async function schoolFilter(): Promise<SchoolWhere> {
  const scope = await schoolScope();
  if (scope.kind === "all") return {};
  if (scope.kind === "none") return { schoolId: MATCH_NOTHING };
  return { schoolId: scope.id };
}

/**
 * Same idea for models reached through a student, e.g. transactions and
 * preorders, which take their school from whoever they belong to.
 */
export async function studentSchoolFilter(): Promise<{ student?: SchoolWhere }> {
  const scope = await schoolScope();
  if (scope.kind === "all") return {};
  if (scope.kind === "none") return { student: { schoolId: MATCH_NOTHING } };
  return { student: { schoolId: scope.id } };
}

/** Name of the selected school, for headings. Null when viewing all. */
export async function currentSchoolName(): Promise<string | null> {
  const id = await currentSchoolId();
  if (!id) return null;
  const schools = await allSchools();
  return schools.find((s) => s.id === id)?.name ?? null;
}

/**
 * The security boundary for staff acting on a particular school's data.
 *
 * Admins may act anywhere — their header selection is only a view filter.
 * Operators may act solely on the school their account is tied to. Every
 * server action that touches a student, sale or order runs through this, so
 * a crafted request can't reach across schools even though the UI would
 * never offer it.
 */
export async function canActOnSchool(schoolId: string | null): Promise<boolean> {
  const session = await getSession();
  if (!session) return false;
  if (session.role === "ADMIN") return true;
  if (session.role !== "OPERATOR") return false;

  if (!schoolId) return false;
  const staff = await prisma.user.findUnique({
    where: { id: session.uid },
    select: { schoolId: true },
  });
  return staff?.schoolId === schoolId;
}

/** Same check for a student, by id. False if the student doesn't exist. */
export async function canActOnStudent(studentId: string): Promise<boolean> {
  const student = await prisma.user.findUnique({
    where: { id: studentId },
    select: { schoolId: true },
  });
  if (!student) return false;
  return canActOnSchool(student.schoolId);
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
