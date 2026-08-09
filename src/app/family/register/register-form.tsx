"use client";

import { useActionState } from "react";
import { PhotoInput } from "@/components/photo-input";
import { registerChild, type RegisterState } from "../actions";
import type { SchoolOption } from "@/lib/school-constants";

const field =
  "w-full rounded-lg border border-slate-300 px-3 py-2.5 text-base outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200";
const label = "mb-1 block text-sm font-medium text-slate-700";

export function RegisterForm({ schools }: { schools: SchoolOption[] }) {
  const [state, formAction, pending] = useActionState<RegisterState, FormData>(
    registerChild,
    {}
  );

  return (
    <form
      action={formAction}
      className="space-y-5 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm"
    >
      <div>
        <label className={label} htmlFor="name">
          Child&apos;s full name
        </label>
        <input id="name" name="name" required className={field} />
      </div>

      <div>
        <label className={label} htmlFor="school">
          School
        </label>
        {/* Pre-selected only when there's genuinely no choice to make. */}
        <select
          id="school"
          name="school"
          required
          defaultValue={schools.length === 1 ? schools[0].id : ""}
          className={field}
        >
          {schools.length !== 1 && (
            <option value="" disabled>
              Choose a school…
            </option>
          )}
          {schools.map((school) => (
            <option key={school.id} value={school.id}>
              {school.name}
            </option>
          ))}
        </select>
        <p className="mt-1 text-xs text-slate-500">
          Each school has its own canteen and menu — pick the one your child
          attends.
        </p>
      </div>

      <div>
        <label className={label} htmlFor="studentIdCode">
          School student ID
        </label>
        <input
          id="studentIdCode"
          name="studentIdCode"
          autoCapitalize="none"
          required
          className={field}
        />
        <p className="mt-1 text-xs text-slate-500">
          As printed on their school ID card or report — this is how the school
          matches them to their record.
        </p>
      </div>

      <div>
        <label className={label} htmlFor="className">
          Class <span className="font-normal text-slate-400">(optional)</span>
        </label>
        <input id="className" name="className" className={field} />
      </div>

      <div>
        <span className={label}>Photo</span>
        <PhotoInput name="photo" required />
      </div>

      {state.error && (
        <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
          {state.error}
        </p>
      )}

      <button
        type="submit"
        disabled={pending}
        className="w-full rounded-lg bg-indigo-600 py-2.5 font-semibold text-white transition hover:bg-indigo-700 disabled:opacity-50"
      >
        {pending ? "Submitting…" : "Submit for approval"}
      </button>
    </form>
  );
}
