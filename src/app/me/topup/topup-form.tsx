"use client";

import { useActionState, useState } from "react";
import { formatMoney } from "@/lib/money";
import { startCheckout, type TopupState } from "./actions";

const PRESETS = [500, 1000, 2000, 5000];

export function TopupForm({ studentId }: { studentId?: string }) {
  const [selected, setSelected] = useState<number | null>(1000);
  const [custom, setCustom] = useState("");
  const [state, formAction, pending] = useActionState<TopupState, FormData>(
    startCheckout,
    {}
  );

  return (
    <form action={formAction}>
      {studentId && <input type="hidden" name="studentId" value={studentId} />}
      <div className="grid grid-cols-2 gap-2">
        {PRESETS.map((cents) => (
          <button
            key={cents}
            type="button"
            onClick={() => {
              setSelected(cents);
              setCustom("");
            }}
            className={`rounded-xl border py-4 text-lg font-bold transition ${
              selected === cents
                ? "border-indigo-500 bg-indigo-50 text-indigo-700"
                : "border-slate-200 bg-white text-slate-800 hover:border-slate-300"
            }`}
          >
            {formatMoney(cents)}
          </button>
        ))}
      </div>

      <input
        value={custom}
        onChange={(e) => {
          setCustom(e.target.value);
          setSelected(null);
        }}
        inputMode="decimal"
        placeholder="Or a custom amount…"
        className="mt-3 w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-base outline-none focus:border-indigo-500"
      />
      <input type="hidden" name="preset" value={selected ?? ""} />
      <input type="hidden" name="custom" value={custom} />

      {state.error && (
        <p className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
          {state.error}
        </p>
      )}

      <button
        disabled={pending || (!selected && !custom.trim())}
        className="mt-4 w-full rounded-xl bg-indigo-600 py-3.5 text-lg font-semibold text-white hover:bg-indigo-700 disabled:opacity-40"
      >
        {pending ? "Redirecting…" : "Pay with card"}
      </button>
      <p className="mt-3 text-center text-xs text-slate-400">
        Secure payment via Stripe. The balance appears on your card immediately
        after payment.
      </p>
    </form>
  );
}
