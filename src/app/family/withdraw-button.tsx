"use client";

import { useState, useTransition } from "react";
import { withdrawRegistration } from "./actions";

export function WithdrawButton({ registrationId }: { registrationId: string }) {
  const [confirming, setConfirming] = useState(false);
  const [pending, startTransition] = useTransition();

  if (!confirming) {
    return (
      <button
        onClick={() => setConfirming(true)}
        className="mt-3 text-sm text-slate-500 hover:text-slate-800 hover:underline"
      >
        Withdraw request
      </button>
    );
  }

  return (
    <div className="mt-3 flex items-center gap-2 text-sm">
      <span className="text-slate-600">Withdraw this request?</span>
      <button
        disabled={pending}
        onClick={() =>
          startTransition(async () => {
            await withdrawRegistration(registrationId);
          })
        }
        className="rounded-lg bg-red-600 px-3 py-1.5 font-medium text-white hover:bg-red-700 disabled:opacity-50"
      >
        {pending ? "Withdrawing…" : "Yes, withdraw"}
      </button>
      <button
        onClick={() => setConfirming(false)}
        className="rounded-lg border border-slate-300 px-3 py-1.5 font-medium text-slate-700"
      >
        Keep
      </button>
    </div>
  );
}
