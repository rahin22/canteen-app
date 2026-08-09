"use client";

import { useActionState } from "react";
import { createStudent, type ActionState } from "../actions";
import type { SchoolOption } from "@/lib/school-constants";

const field =
  "w-full rounded-lg border border-slate-300 px-3 py-2 outline-none focus:border-indigo-500";

export function NewStudentForm({
  schools,
  defaultSchoolId,
}: {
  schools: SchoolOption[];
  /** The school selected in the header, so the common case is pre-filled. */
  defaultSchoolId: string | null;
}) {
  const [state, formAction, pending] = useActionState<ActionState, FormData>(
    createStudent,
    {}
  );

  return (
    <form
      action={formAction}
      className="space-y-4 rounded-2xl border border-slate-200 bg-white p-6"
    >
      <div>
        <label className="mb-1 block text-sm font-medium text-slate-700">
          School
        </label>
        <select
          name="school"
          required
          defaultValue={defaultSchoolId ?? (schools.length === 1 ? schools[0].id : "")}
          className={field}
        >
          <option value="" disabled>
            Choose a school…
          </option>
          {schools.map((school) => (
            <option key={school.id} value={school.id}>
              {school.name}
            </option>
          ))}
        </select>
      </div>
      <div>
        <label className="mb-1 block text-sm font-medium text-slate-700">
          Full name
        </label>
        <input name="name" required className={field} />
      </div>
      <div>
        <label className="mb-1 block text-sm font-medium text-slate-700">Class</label>
        <input name="className" placeholder="e.g. Year 8B" className={field} />
      </div>
      <div>
        <label className="mb-1 block text-sm font-medium text-slate-700">
          Student ID (login username)
        </label>
        <input
          name="username"
          required
          autoCapitalize="none"
          placeholder="e.g. s2026041"
          className={field}
        />
      </div>

      {state.error && (
        <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
          {state.error}
        </p>
      )}

      <button
        disabled={pending}
        className="w-full rounded-lg bg-indigo-600 py-2.5 font-semibold text-white hover:bg-indigo-700 disabled:opacity-50"
      >
        {pending ? "Creating…" : "Create student + card"}
      </button>
      <p className="text-xs text-slate-400">
        A login password and QR card are generated automatically — you&apos;ll see
        them on the next screen.
      </p>
    </form>
  );
}
