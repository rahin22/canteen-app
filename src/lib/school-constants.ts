/**
 * The parts of school handling that client components need.
 *
 * Kept apart from src/lib/schools.ts because that module talks to the
 * database — importing a value from it in a client component would pull
 * Prisma and its pg driver into the browser bundle.
 */

export const SCHOOL_COOKIE = "admin_school";

/** Sentinel for the "no filter" option in the admin school switcher. */
export const ALL_SCHOOLS = "all";

export type SchoolOption = { id: string; name: string; active: boolean };
