"use server";

import { cookies } from "next/headers";
import { requireRole } from "@/lib/auth";
import { allSchools, ALL_SCHOOLS, SCHOOL_COOKIE } from "@/lib/schools";

/** Records which school the admin is viewing. A view preference, not a grant. */
export async function selectSchool(schoolId: string) {
  await requireRole("ADMIN");

  const valid =
    schoolId === ALL_SCHOOLS ||
    (await allSchools()).some((s) => s.id === schoolId);
  if (!valid) return;

  const store = await cookies();
  store.set(SCHOOL_COOKIE, schoolId, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: 365 * 24 * 60 * 60,
  });
}
