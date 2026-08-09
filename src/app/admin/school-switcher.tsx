"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { selectSchool } from "./school-actions";
import { ALL_SCHOOLS, type SchoolOption } from "@/lib/school-constants";

/**
 * Switches which school the admin is looking at. The choice is a cookie, so it
 * sticks across every admin page without threading a query parameter through
 * all of them.
 */
export function SchoolSwitcher({
  schools,
  current,
}: {
  schools: SchoolOption[];
  /** Selected school id, or null for all. */
  current: string | null;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  if (schools.length === 0) return null;

  return (
    <label className="flex items-center gap-2 text-sm">
      <span className="sr-only">School</span>
      <select
        value={current ?? ALL_SCHOOLS}
        disabled={pending}
        onChange={(e) => {
          const next = e.target.value;
          startTransition(async () => {
            await selectSchool(next);
            // The cookie changes what every page queries, so pull fresh data.
            router.refresh();
          });
        }}
        className="rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-sm font-medium text-slate-700 outline-none focus:border-indigo-500 disabled:opacity-50"
      >
        <option value={ALL_SCHOOLS}>All schools</option>
        {schools.map((school) => (
          <option key={school.id} value={school.id}>
            {school.name}
            {school.active ? "" : " (retired)"}
          </option>
        ))}
      </select>
    </label>
  );
}
