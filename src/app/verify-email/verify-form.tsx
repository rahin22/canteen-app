"use client";

import { useActionState, useState, useTransition } from "react";
import { CodeInput } from "@/components/code-input";
import { confirmEmail, sendVerificationCode, type VerifyState } from "./actions";

export function VerifyForm({ email }: { email: string }) {
  const [state, formAction, pending] = useActionState<VerifyState, FormData>(
    confirmEmail,
    {}
  );
  const [resend, setResend] = useState<VerifyState>({});
  const [resending, startResend] = useTransition();

  return (
    <div className="space-y-4 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
      <p className="text-sm text-slate-600">
        We&apos;ve emailed a 6-digit code to <b className="break-all">{email}</b>.
        Enter it below to confirm your address.
      </p>

      <form action={formAction} className="space-y-4">
        <CodeInput />
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
          {pending ? "Checking…" : "Confirm email"}
        </button>
      </form>

      <div className="border-t border-slate-100 pt-4">
        {resend.error && (
          <p className="mb-2 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
            {resend.error}
          </p>
        )}
        {resend.success && (
          <p className="mb-2 rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
            {resend.success}
          </p>
        )}
        <button
          type="button"
          disabled={resending}
          onClick={() => startResend(async () => setResend(await sendVerificationCode()))}
          className="text-sm font-medium text-indigo-600 hover:underline disabled:opacity-50"
        >
          {resending ? "Sending…" : "Send me a new code"}
        </button>
        <p className="mt-2 text-xs text-slate-500">
          Codes expire after 15 minutes. Check your junk folder if it hasn&apos;t
          arrived.
        </p>
      </div>
    </div>
  );
}
