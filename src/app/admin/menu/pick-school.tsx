"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { selectSchool } from "../school-actions";
import type { SchoolOption } from "@/lib/school-constants";

/** Shown on the menu page when the header filter is set to "All schools". */
export function PickSchool({ schools }: { schools: SchoolOption[] }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  if (schools.length === 0) {
    return (
      <p className="rounded-2xl border border-amber-200 bg-amber-50 p-5 text-sm text-amber-900">
        No schools are set up yet. Add one in <b>Settings</b> first.
      </p>
    );
  }

  return (
    <div className="grid gap-2 sm:grid-cols-2">
      {schools.map((school) => (
        <button
          key={school.id}
          disabled={pending}
          onClick={() =>
            startTransition(async () => {
              await selectSchool(school.id);
              router.refresh();
            })
          }
          className="rounded-2xl border border-slate-200 bg-white p-5 text-left font-semibold text-slate-900 transition hover:border-indigo-400 hover:bg-indigo-50 disabled:opacity-50"
        >
          {school.name}
          <span className="mt-1 block text-sm font-normal text-slate-500">
            Edit this menu →
          </span>
        </button>
      ))}
    </div>
  );
}
