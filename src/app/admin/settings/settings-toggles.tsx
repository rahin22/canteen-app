"use client";

import { useState, useTransition } from "react";
import { setFlag } from "./actions";

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
