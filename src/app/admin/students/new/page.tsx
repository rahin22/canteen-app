"use client";

import { useActionState } from "react";
import Link from "next/link";
import { createStudent, type ActionState } from "../actions";

export default function NewStudentPage() {
  const [state, formAction, pending] = useActionState<ActionState, FormData>(
    createStudent,
    {}
  );

  return (
    <div className="mx-auto max-w-md">
      <Link href="/admin/students" className="text-sm text-slate-500 hover:underline">
        ← Students
      </Link>
      <h1 className="mb-6 mt-2 text-2xl font-bold text-slate-900">Add student</h1>

      <form
        action={formAction}
        className="space-y-4 rounded-2xl border border-slate-200 bg-white p-6"
      >
        <div>
          <label className="mb-1 block text-sm font-medium text-slate-700">
            Full name
          </label>
          <input
            name="name"
            required
            className="w-full rounded-lg border border-slate-300 px-3 py-2 outline-none focus:border-indigo-500"
          />
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium text-slate-700">Class</label>
          <input
            name="className"
            placeholder="e.g. Year 8B"
            className="w-full rounded-lg border border-slate-300 px-3 py-2 outline-none focus:border-indigo-500"
          />
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
            className="w-full rounded-lg border border-slate-300 px-3 py-2 outline-none focus:border-indigo-500"
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
    </div>
  );
}
