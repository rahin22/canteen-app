"use client";

import { useActionState, useState, useTransition } from "react";
import { setFlag, setPreorderCutoff, type CutoffState } from "./actions";

export function Toggle({
  settingKey,
  initial,
  title,
  description,
  disabled,
  disabledReason,
}: {
  settingKey: string;
  initial: boolean;
  title: string;
  description: string;
  disabled?: boolean;
  disabledReason?: string;
}) {
  const [on, setOn] = useState(initial);
  const [pending, startTransition] = useTransition();

  const toggle = () => {
    if (disabled) return;
    const next = !on;
    setOn(next);
    startTransition(async () => {
      await setFlag(settingKey, next);
    });
  };

  return (
    <div className="flex items-start justify-between gap-6 border-b border-slate-100 px-5 py-4 last:border-0">
      <div className="min-w-0">
        <p className="font-medium text-slate-900">{title}</p>
        <p className="mt-0.5 text-sm text-slate-500">{description}</p>
        {disabled && disabledReason && (
          <p className="mt-1.5 rounded-lg bg-amber-50 px-2.5 py-1.5 text-xs text-amber-800">
            {disabledReason}
          </p>
        )}
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={on && !disabled}
        aria-label={title}
        onClick={toggle}
        disabled={disabled || pending}
        className={`relative mt-1 h-7 w-12 shrink-0 rounded-full transition disabled:opacity-40 ${
          on && !disabled ? "bg-emerald-500" : "bg-slate-300"
        }`}
      >
        <span
          className={`absolute top-1 h-5 w-5 rounded-full bg-white shadow transition-all ${
            on && !disabled ? "left-6" : "left-1"
          }`}
        />
      </button>
    </div>
  );
}

/** Time of day after which the kiosk and parent portal stop taking orders. */
export function CutoffField({ initial }: { initial: string }) {
  const [state, formAction, pending] = useActionState<CutoffState, FormData>(
    setPreorderCutoff,
    {}
  );

  return (
    <form
      action={formAction}
      className="border-b border-slate-100 px-5 py-4 last:border-0"
    >
      <label
        htmlFor="cutoff"
        className="font-medium text-slate-900"
      >
        Orders close at
      </label>
      <p className="mt-0.5 text-sm text-slate-500">
        After this time the kiosk and the parent portal stop accepting orders
        for the day, so the kitchen knows what it&apos;s making. Uses the
        school&apos;s local time.
      </p>
      <div className="mt-2 flex items-center gap-2">
        <input
          id="cutoff"
          name="cutoff"
          type="time"
          defaultValue={initial}
          required
          className="rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-indigo-500"
        />
        <button
          disabled={pending}
          className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-50"
        >
          {pending ? "Saving…" : "Save"}
        </button>
      </div>
      {(state.error || state.success) && (
        <p
          className={`mt-2 rounded-lg px-3 py-2 text-sm ${
            state.error ? "bg-red-50 text-red-700" : "bg-emerald-50 text-emerald-800"
          }`}
        >
          {state.error || state.success}
        </p>
      )}
    </form>
  );
}
