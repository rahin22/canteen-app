"use client";

import Link from "next/link";
import { useActionState } from "react";
import { login, type LoginState } from "./actions";

export function LoginForm({
  signupOpen,
  justReset,
}: {
  signupOpen: boolean;
  justReset?: boolean;
}) {
  const [state, formAction, pending] = useActionState<LoginState, FormData>(
    login,
    {}
  );

  return (
    <main className="flex flex-1 items-center justify-center p-6">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-2xl bg-indigo-600 text-3xl">
            🍎
          </div>
          <h1 className="text-2xl font-bold text-slate-900">
            {process.env.NEXT_PUBLIC_SCHOOL_NAME || "School Canteen"}
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            Sign in to your canteen account
          </p>
        </div>

        {justReset && (
          <p className="mb-4 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">
            <b className="font-semibold">Password updated ✓</b> Sign in with your
            new password.
          </p>
        )}

        <form
          action={formAction}
          className="space-y-4 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm"
        >
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700">
              Username / Student ID
            </label>
            <input
              name="username"
              autoComplete="username"
              autoCapitalize="none"
              required
              className="w-full rounded-lg border border-slate-300 px-3 py-2.5 text-base outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200"
            />
          </div>
          <div>
            <div className="mb-1 flex items-baseline justify-between">
              <label className="block text-sm font-medium text-slate-700">
                Password
              </label>
              <Link
                href="/forgot-password"
                className="text-sm text-indigo-600 hover:underline"
              >
                Forgot?
              </Link>
            </div>
            <input
              name="password"
              type="password"
              autoComplete="current-password"
              required
              className="w-full rounded-lg border border-slate-300 px-3 py-2.5 text-base outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200"
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
            {pending ? "Signing in…" : "Sign in"}
          </button>

          {signupOpen && (
            <p className="border-t border-slate-100 pt-4 text-center text-sm text-slate-500">
              Are you a parent?{" "}
              <Link
                href="/signup"
                className="font-medium text-indigo-600 hover:underline"
              >
                Create an account
              </Link>
            </p>
          )}
        </form>
      </div>
    </main>
  );
}
