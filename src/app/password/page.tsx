"use client";

import { useActionState } from "react";
import Link from "next/link";
import { changePassword, type PasswordState } from "./actions";

const inputCls =
  "w-full rounded-lg border border-slate-300 px-3 py-2.5 text-base outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200";

export default function PasswordPage() {
  const [state, formAction, pending] = useActionState<PasswordState, FormData>(
    changePassword,
    {}
  );

  return (
    <main className="flex flex-1 items-center justify-center p-6">
      <div className="w-full max-w-sm">
        <Link href="/" className="text-sm text-slate-500 hover:underline">
          ← Back
        </Link>
        <h1 className="mb-6 mt-2 text-2xl font-bold text-slate-900">
          Change password
        </h1>
        <form
          action={formAction}
          className="space-y-4 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm"
        >
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700">
              Current password
            </label>
            <input
              name="current"
              type="password"
              autoComplete="current-password"
              required
              className={inputCls}
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700">
              New password
            </label>
            <input
              name="next"
              type="password"
              autoComplete="new-password"
              minLength={8}
              required
              className={inputCls}
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700">
              Confirm new password
            </label>
            <input
              name="confirm"
              type="password"
              autoComplete="new-password"
              minLength={8}
              required
              className={inputCls}
            />
          </div>

          {state.error && (
            <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
              {state.error}
            </p>
          )}
          {state.success && (
            <p className="rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
              {state.success}
            </p>
          )}

          <button
            disabled={pending}
            className="w-full rounded-lg bg-indigo-600 py-2.5 font-semibold text-white hover:bg-indigo-700 disabled:opacity-50"
          >
            {pending ? "Saving…" : "Change password"}
          </button>
        </form>
      </div>
    </main>
  );
}
