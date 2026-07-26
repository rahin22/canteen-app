"use client";

import Link from "next/link";
import { useActionState } from "react";
import { requestReset, type ForgotState } from "./actions";

const field =
  "w-full rounded-lg border border-slate-300 px-3 py-2.5 text-base outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200";

export function ForgotForm() {
  const [state, formAction, pending] = useActionState<ForgotState, FormData>(
    requestReset,
    {}
  );

  if (state.sent) {
    return (
      <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <p className="font-semibold text-slate-900">Check your email</p>
        <p className="mt-2 text-sm text-slate-600">
          If an account exists for that address, we&apos;ve sent it a 6-digit
          reset code. It expires in 15 minutes.
        </p>
        <Link
          href="/reset-password"
          className="mt-5 block w-full rounded-lg bg-indigo-600 py-2.5 text-center font-semibold text-white hover:bg-indigo-700"
        >
          I have a code
        </Link>
        <Link
          href="/login"
          className="mt-3 block text-center text-sm text-slate-500 hover:text-slate-800"
        >
          Back to sign in
        </Link>
      </div>
    );
  }

  return (
    <form
      action={formAction}
      className="space-y-4 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm"
    >
      <div>
        <label className="mb-1 block text-sm font-medium text-slate-700" htmlFor="email">
          Email address
        </label>
        <input
          id="email"
          name="email"
          type="email"
          autoComplete="email"
          autoCapitalize="none"
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
        {pending ? "Sending…" : "Send reset code"}
      </button>

      <div className="border-t border-slate-100 pt-4 text-sm text-slate-500">
        <p>
          <b className="font-medium text-slate-700">Students and canteen staff:</b>{" "}
          your account doesn&apos;t use an email address. Ask the school office
          to reset your password.
        </p>
        <Link
          href="/login"
          className="mt-3 block text-center text-slate-500 hover:text-slate-800"
        >
          Back to sign in
        </Link>
      </div>
    </form>
  );
}
