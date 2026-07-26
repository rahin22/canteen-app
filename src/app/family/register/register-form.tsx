"use client";

import { useActionState } from "react";
import { PhotoInput } from "@/components/photo-input";
import { registerChild, type RegisterState } from "../actions";

const field =
  "w-full rounded-lg border border-slate-300 px-3 py-2.5 text-base outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200";
const label = "mb-1 block text-sm font-medium text-slate-700";

export function RegisterForm() {
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
        <label className={label} htmlFor="schoolId">
          School student ID
        </label>
        <input
          id="schoolId"
          name="schoolId"
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
