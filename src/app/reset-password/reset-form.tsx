"use client";

import Link from "next/link";
import { useActionState } from "react";
import { CodeInput } from "@/components/code-input";
import { resetPassword, type ResetState } from "@/app/forgot-password/actions";

const field =
  "w-full rounded-lg border border-slate-300 px-3 py-2.5 text-base outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200";
const label = "mb-1 block text-sm font-medium text-slate-700";

export function ResetForm({ defaultEmail }: { defaultEmail?: string }) {
  const [state, formAction, pending] = useActionState<ResetState, FormData>(
    resetPassword,
    {}
  );

  return (
    <form
      action={formAction}
      className="space-y-4 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm"
    >
      <div>
        <label className={label} htmlFor="email">
          Email address
        </label>
        <input
          id="email"
          name="email"
          type="email"
          autoComplete="email"
          autoCapitalize="none"
          defaultValue={defaultEmail}
          required
          className={field}
        />
      </div>

      <div>
        <label className={label} htmlFor="code">
          Code from your email
        </label>
        <CodeInput />
      </div>

      <div>
        <label className={label} htmlFor="password">
          New password
        </label>
        <input
          id="password"
          name="password"
          type="password"
          autoComplete="new-password"
          minLength={8}
          required
          className={field}
        />
        <p className="mt-1 text-xs text-slate-500">At least 8 characters.</p>
      </div>

      <div>
        <label className={label} htmlFor="confirm">
          Confirm new password
        </label>
        <input
          id="confirm"
          name="confirm"
          type="password"
          autoComplete="new-password"
          required
          className={field}
        />
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
        {pending ? "Saving…" : "Set new password"}
      </button>

      <p className="text-center text-sm text-slate-500">
        Need a new code?{" "}
        <Link href="/forgot-password" className="font-medium text-indigo-600 hover:underline">
          Send another
        </Link>
      </p>
    </form>
  );
}
