"use client";

import { useActionState, useState, useTransition } from "react";
import { formatMoney } from "@/lib/money";
import { setDailyLimit, clearDailyLimit, type LimitState } from "../actions";

const PRESETS = [500, 1000, 1500];

export function DailyLimitForm({
  childId,
  childName,
  limit,
  spentToday,
}: {
  childId: string;
  childName: string;
  /** Current cap in cents, or null when there isn't one. */
  limit: number | null;
  spentToday: number;
}) {
  const [state, formAction, pending] = useActionState<LimitState, FormData>(
    setDailyLimit,
    {}
  );
  const [cleared, setCleared] = useState<LimitState>({});
  const [clearing, startClearing] = useTransition();
  const [amount, setAmount] = useState(
    limit === null ? "" : (limit / 100).toFixed(2)
  );

  // The action revalidates the page, so `limit` is authoritative on re-render;
  // the local messages just explain what happened.
  const feedback = state.error || state.success || cleared.error || cleared.success;
  const isError = Boolean(state.error || cleared.error);

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="font-semibold text-slate-900">Daily spending limit</h2>
        {limit === null ? (
          <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-500">
            No limit
          </span>
        ) : (
          <span className="rounded-full bg-indigo-100 px-2.5 py-1 text-xs font-semibold text-indigo-700">
            {formatMoney(limit)} per day
          </span>
        )}
      </div>

      <p className="mt-1 text-sm text-slate-500">
        Caps how much {childName.split(" ")[0]}{" "}
        can spend at the canteen each day. It doesn&apos;t lock the money away —
        anything unspent stays on the card for another day.
      </p>

      {limit !== null && (
        <div className="mt-3">
          <div className="h-2 overflow-hidden rounded-full bg-slate-100">
            <div
              className={`h-full rounded-full ${
                spentToday >= limit ? "bg-red-500" : "bg-indigo-500"
              }`}
              style={{
                width: `${limit === 0 ? 100 : Math.min(100, (spentToday / limit) * 100)}%`,
              }}
            />
          </div>
          <p className="mt-1.5 text-sm text-slate-600">
            {formatMoney(spentToday)} spent today
            {spentToday >= limit
              ? " — limit reached"
              : ` · ${formatMoney(limit - spentToday)} left`}
          </p>
        </div>
      )}

      <form action={formAction} className="mt-4 space-y-3">
        <input type="hidden" name="childId" value={childId} />
        <div className="flex gap-2">
          <input
            name="amount"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            inputMode="decimal"
            placeholder="e.g. 10"
            aria-label="Daily limit amount"
            className="w-full rounded-xl border border-slate-300 px-3 py-2.5 text-base outline-none focus:border-indigo-500"
          />
          <button
            disabled={pending || clearing}
            className="shrink-0 rounded-xl bg-indigo-600 px-5 font-semibold text-white hover:bg-indigo-700 disabled:opacity-50"
          >
            {pending ? "Saving…" : "Save"}
          </button>
        </div>

        <div className="flex flex-wrap gap-2">
          {PRESETS.map((preset) => (
            <button
              key={preset}
              type="button"
              onClick={() => setAmount((preset / 100).toFixed(2))}
              className="rounded-full border border-slate-300 px-3 py-1 text-sm font-medium text-slate-600 hover:border-indigo-400 hover:text-indigo-700"
            >
              {formatMoney(preset)}
            </button>
          ))}
          {limit !== null && (
            <button
              type="button"
              disabled={pending || clearing}
              onClick={() =>
                startClearing(async () => setCleared(await clearDailyLimit(childId)))
              }
              className="rounded-full px-3 py-1 text-sm font-medium text-slate-500 underline hover:text-red-600 disabled:opacity-50"
            >
              {clearing ? "Removing…" : "Remove limit"}
            </button>
          )}
        </div>

        {feedback && (
          <p
            className={`rounded-lg px-3 py-2 text-sm ${
              isError ? "bg-red-50 text-red-700" : "bg-emerald-50 text-emerald-800"
            }`}
          >
            {feedback}
          </p>
        )}
      </form>
    </div>
  );
}
