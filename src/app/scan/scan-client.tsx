"use client";

import { useCallback, useEffect, useState } from "react";
import { formatMoney, parseAmount } from "@/lib/money";
import type { DailySpend } from "@/lib/ledger";
import { CardScanner } from "@/components/card-scanner";
import { describeLines } from "@/lib/preorder-format";
import {
  lookupCard,
  charge,
  handOverOrder,
  type ScanStudent,
  type ChargeInput,
  type LastPurchase,
  type MenuItem,
} from "./actions";

type Mode =
  | { step: "scan" }
  | { step: "order"; student: ScanStudent }
  | {
      step: "done";
      student: ScanStudent;
      total: number;
      newBalance: number;
      daily: DailySpend;
    };

export default function ScanClient() {
  const [mode, setMode] = useState<Mode>({ step: "scan" });
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const handleToken = useCallback(async (token: string) => {
    setBusy(true);
    setError(null);
    const result = await lookupCard(token);
    setBusy(false);
    if (result.ok) {
      setMode({ step: "order", student: result.student });
    } else {
      setError(result.error);
    }
  }, []);

  return (
    <div className="mx-auto w-full max-w-lg flex-1 p-4">
      {mode.step === "scan" && (
        <CardScanner
          title="Scan a student card"
          onToken={handleToken}
          busy={busy}
          error={error}
        />
      )}
      {mode.step === "order" && (
        <OrderBuilder
          student={mode.student}
          onDone={(total, newBalance, daily) =>
            setMode({ step: "done", student: mode.student, total, newBalance, daily })
          }
          onCancel={() => {
            setError(null);
            setMode({ step: "scan" });
          }}
        />
      )}
      {mode.step === "done" && (
        <div className="mt-10 rounded-2xl border border-emerald-200 bg-emerald-50 p-8 text-center">
          <div className="text-5xl">✅</div>
          <h2 className="mt-3 text-xl font-bold text-emerald-900">
            Charged {formatMoney(mode.total)}
          </h2>
          <p className="mt-1 text-emerald-800">
            {mode.student.name} — new balance{" "}
            <span className="font-semibold">{formatMoney(mode.newBalance)}</span>
          </p>
          {mode.daily.remaining !== null && (
            <p className="mt-1 text-sm text-emerald-700">
              {formatMoney(mode.daily.remaining)} left of today&apos;s{" "}
              {formatMoney(mode.daily.limit!)} limit
            </p>
          )}
          <button
            autoFocus
            onClick={() => setMode({ step: "scan" })}
            className="mt-6 w-full rounded-xl bg-emerald-600 py-3.5 text-lg font-semibold text-white hover:bg-emerald-700"
          >
            Scan next student
          </button>
        </div>
      )}
    </div>
  );
}

/** Below this, the previous order is treated as "probably the same visit". */
const RECENT_ORDER_MS = 30 * 60 * 1000;

function timeAgo(ms: number): string {
  const mins = Math.floor(ms / 60000);
  if (mins < 1) return "just now";
  if (mins === 1) return "1 minute ago";
  if (mins < 60) return `${mins} minutes ago`;
  const hours = Math.floor(mins / 60);
  if (hours === 1) return "1 hour ago";
  if (hours < 24) return `${hours} hours ago`;
  const days = Math.floor(hours / 24);
  return days === 1 ? "yesterday" : `${days} days ago`;
}

/**
 * Shows what this card was last charged for. The common double-charge is a
 * student rejoining the queue while their food is still being made, so a
 * recent order is called out loudly rather than tucked into a history list.
 */
function LastOrderBanner({ last }: { last: LastPurchase | null }) {
  // Re-render on a timer so "2 minutes ago" doesn't go stale while an
  // operator builds the order. Only worth doing while it's still recent.
  const [now, setNow] = useState(() => Date.now());
  const recent = last !== null && now - last.at < RECENT_ORDER_MS;
  useEffect(() => {
    if (!recent) return;
    const id = setInterval(() => setNow(Date.now()), 15000);
    return () => clearInterval(id);
  }, [recent]);

  if (!last) {
    return (
      <p className="mb-3 rounded-xl bg-slate-50 px-3 py-2 text-sm text-slate-500">
        No previous orders on this card.
      </p>
    );
  }

  const elapsed = timeAgo(now - last.at);

  if (!recent) {
    return (
      <p className="mb-3 rounded-xl bg-slate-50 px-3 py-2 text-sm text-slate-500">
        Last order {elapsed} · {formatMoney(last.total)} · {last.summary}
      </p>
    );
  }

  return (
    <div
      role="alert"
      className="mb-3 rounded-2xl border-2 border-amber-400 bg-amber-50 p-3"
    >
      <div className="flex items-baseline justify-between gap-2">
        <p className="font-bold text-amber-900">⚠️ Already served {elapsed}</p>
        <p className="shrink-0 font-bold text-amber-900">
          {formatMoney(last.total)}
        </p>
      </div>
      <p className="mt-0.5 text-sm text-amber-800">
        {last.summary}
        {last.operator ? ` · by ${last.operator}` : ""}
      </p>
      <p className="mt-1 text-xs font-medium text-amber-700">
        Check this isn&apos;t the same order before charging again.
      </p>
    </div>
  );
}

type CartLine = { menuItemId: string; name: string; price: number; qty: number };

function OrderBuilder({
  student,
  onDone,
  onCancel,
}: {
  student: ScanStudent;
  onDone: (total: number, newBalance: number, daily: DailySpend) => void;
  onCancel: () => void;
}) {
  // The menu arrives with the student so one till can serve either school.
  const menu = student.menu;
  const [cart, setCart] = useState<CartLine[]>([]);
  const [customInput, setCustomInput] = useState("");
  const [customAmount, setCustomAmount] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  // Kept in state because a rejected charge sends back refreshed figures —
  // another till may have spent against the same cap in the meantime.
  const [daily, setDaily] = useState<DailySpend>(student.daily);
  // Collected orders drop off the list without needing a re-scan.
  const [orders, setOrders] = useState(student.pendingOrders);

  const itemsTotal = cart.reduce((sum, l) => sum + l.price * l.qty, 0);
  const total = itemsTotal + customAmount;
  const shortfall = total - student.balance;
  const capExceeded = daily.remaining !== null && total > daily.remaining;

  const addItem = (item: MenuItem) =>
    setCart((prev) => {
      const existing = prev.find((l) => l.menuItemId === item.id);
      if (existing) {
        return prev.map((l) =>
          l.menuItemId === item.id ? { ...l, qty: l.qty + 1 } : l
        );
      }
      return [...prev, { menuItemId: item.id, name: item.name, price: item.price, qty: 1 }];
    });

  const removeItem = (id: string) =>
    setCart((prev) =>
      prev
        .map((l) => (l.menuItemId === id ? { ...l, qty: l.qty - 1 } : l))
        .filter((l) => l.qty > 0)
    );

  const applyCustom = () => {
    const cents = parseAmount(customInput);
    if (cents === null) {
      setError("Enter a valid amount.");
      return;
    }
    setError(null);
    setCustomAmount(cents);
  };

  // No money moves here — the order was paid for when it was placed, so this
  // just clears it off the list and leaves the operator on the same screen in
  // case the student also wants to buy something.
  const handOver = async (preorderId: string) => {
    setBusy(true);
    setError(null);
    const result = await handOverOrder(preorderId);
    setBusy(false);
    if (result.ok) {
      setOrders((prev) => prev.filter((o) => o.id !== preorderId));
    } else {
      setError(result.error);
    }
  };

  const submit = async () => {
    setBusy(true);
    setError(null);
    const payload: ChargeInput = {
      studentId: student.studentId,
      lines: cart.map((l) => ({ menuItemId: l.menuItemId, qty: l.qty })),
      customAmount: customAmount || undefined,
    };
    const result = await charge(payload);
    setBusy(false);
    if (result.daily) setDaily(result.daily);
    if (result.ok) {
      onDone(result.total, result.newBalance, result.daily);
    } else {
      setError(result.error);
    }
  };

  return (
    <div className="mt-2">
      <LastOrderBanner last={student.lastPurchase} />

      <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="flex items-center gap-3">
          {/* Photo first — staff check the face before charging the card. */}
          <div className="flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-slate-100">
            {student.hasPhoto ? (
              // Private, no-store response — must bypass the image optimiser.
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={`/api/photo/student/${student.studentId}`}
                alt={`Photo of ${student.name}`}
                className="h-full w-full object-cover"
              />
            ) : (
              <span className="text-2xl font-bold text-slate-400">
                {student.name.charAt(0).toUpperCase()}
              </span>
            )}
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-lg font-bold text-slate-900">
              {student.name}
            </p>
            <p className="truncate text-sm text-slate-500">
              {student.className ? `${student.className} · ` : ""}
              {student.username}
            </p>
            {student.schoolName && (
              <p className="truncate text-xs font-medium text-indigo-600">
                {student.schoolName}
              </p>
            )}
          </div>
          <div className="shrink-0 text-right">
            <p className="text-xs uppercase tracking-wide text-slate-400">Balance</p>
            <p
              className={`text-lg font-bold ${
                student.balance < 500 ? "text-amber-600" : "text-emerald-600"
              }`}
            >
              {formatMoney(student.balance)}
            </p>
          </div>
        </div>

        {daily.limit !== null && (
          <div
            className={`mt-3 flex items-center justify-between rounded-xl px-3 py-2 text-sm ${
              daily.remaining === 0
                ? "bg-red-50 text-red-800"
                : "bg-slate-50 text-slate-600"
            }`}
          >
            <span>
              Daily limit {formatMoney(daily.limit)}
              <span className="text-slate-400"> · set by parent</span>
            </span>
            <span className="font-semibold">
              {daily.remaining === 0
                ? "none left today"
                : `${formatMoney(daily.remaining!)} left`}
            </span>
          </div>
        )}
      </div>

      {orders.length > 0 && (
        <div className="mt-3 rounded-2xl border-2 border-emerald-400 bg-emerald-50 p-4">
          <p className="font-bold text-emerald-900">
            🥪 Ordered ahead — already paid, just hand it over
          </p>
          {orders.map((order) => (
            <div
              key={order.id}
              className="mt-2 flex flex-wrap items-center justify-between gap-2 border-t border-emerald-100 pt-2 first:border-0 first:pt-0"
            >
              <div className="min-w-0">
                <p className="text-sm font-medium text-emerald-900">
                  {describeLines(order.items)}
                </p>
                <p className="text-xs text-emerald-700">
                  Paid {formatMoney(order.total)} ·{" "}
                  {order.source === "KIOSK"
                    ? "ordered at the office kiosk"
                    : `ordered by ${order.placedByName ?? "a parent"}`}
                </p>
              </div>
              <button
                onClick={() => handOver(order.id)}
                disabled={busy}
                className="shrink-0 rounded-xl bg-emerald-600 px-4 py-2.5 font-semibold text-white hover:bg-emerald-700 disabled:opacity-50"
              >
                {busy ? "Working…" : "Handed over ✓"}
              </button>
            </div>
          ))}
          <p className="mt-2 text-xs font-medium text-emerald-800">
            Don&apos;t charge for these again. Anything extra goes below as a
            separate sale.
          </p>
        </div>
      )}

      {menu.length > 0 && (
        <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-3">
          {menu.map((item) => {
            const inCart = cart.find((l) => l.menuItemId === item.id);
            return (
              <button
                key={item.id}
                onClick={() => addItem(item)}
                className={`rounded-xl border p-3 text-left transition active:scale-95 ${
                  inCart
                    ? "border-indigo-500 bg-indigo-50"
                    : "border-slate-200 bg-white hover:border-slate-300"
                }`}
              >
                <p className="text-sm font-semibold leading-tight text-slate-900">
                  {item.name}
                  {inCart && (
                    <span className="ml-1 text-indigo-600">×{inCart.qty}</span>
                  )}
                </p>
                <p className="mt-0.5 text-sm text-slate-500">{formatMoney(item.price)}</p>
              </button>
            );
          })}
        </div>
      )}

      <div className="mt-3 flex gap-2">
        <input
          value={customInput}
          onChange={(e) => setCustomInput(e.target.value)}
          onBlur={applyCustom}
          inputMode="decimal"
          placeholder="Custom amount"
          className="flex-1 rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-base outline-none focus:border-indigo-500"
        />
        <button
          onClick={applyCustom}
          className="rounded-xl border border-slate-300 bg-white px-4 font-medium text-slate-700"
        >
          Add
        </button>
      </div>

      {(cart.length > 0 || customAmount > 0) && (
        <div className="mt-4 rounded-2xl border border-slate-200 bg-white p-4">
          {cart.map((l) => (
            <div key={l.menuItemId} className="flex items-center justify-between py-1">
              <span className="text-sm text-slate-700">
                {l.name} × {l.qty}
              </span>
              <span className="flex items-center gap-3">
                <span className="text-sm font-medium">{formatMoney(l.price * l.qty)}</span>
                <button
                  onClick={() => removeItem(l.menuItemId)}
                  aria-label={`Remove one ${l.name}`}
                  className="flex h-7 w-7 items-center justify-center rounded-full bg-slate-100 text-slate-600"
                >
                  −
                </button>
              </span>
            </div>
          ))}
          {customAmount > 0 && (
            <div className="flex items-center justify-between py-1">
              <span className="text-sm text-slate-700">Custom amount</span>
              <span className="flex items-center gap-3">
                <span className="text-sm font-medium">{formatMoney(customAmount)}</span>
                <button
                  onClick={() => {
                    setCustomAmount(0);
                    setCustomInput("");
                  }}
                  aria-label="Remove custom amount"
                  className="flex h-7 w-7 items-center justify-center rounded-full bg-slate-100 text-slate-600"
                >
                  −
                </button>
              </span>
            </div>
          )}
          <div className="mt-2 flex items-center justify-between border-t border-slate-100 pt-3">
            <span className="font-semibold text-slate-900">Total</span>
            <span className="text-xl font-bold text-slate-900">{formatMoney(total)}</span>
          </div>
        </div>
      )}

      {shortfall > 0 && total > 0 && (
        <p className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm font-medium text-red-700">
          Balance too low — short by {formatMoney(shortfall)}.
        </p>
      )}
      {capExceeded && total > 0 && (
        <p className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm font-medium text-red-700">
          Over the daily limit set by {student.name.split(" ")[0]}&apos;s parent —{" "}
          {daily.limit === 0
            ? "they're not allowed to spend anything today."
            : daily.remaining === 0
            ? `they've already spent today's ${formatMoney(daily.limit!)}.`
            : `only ${formatMoney(daily.remaining!)} of ${formatMoney(
                daily.limit!
              )} is left today.`}
        </p>
      )}
      {error && (
        <p className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm font-medium text-red-700">
          {error}
        </p>
      )}

      <div className="mt-4 flex gap-2 pb-8">
        <button
          onClick={onCancel}
          className="rounded-xl border border-slate-300 bg-white px-5 py-3.5 font-semibold text-slate-700"
        >
          Cancel
        </button>
        <button
          onClick={submit}
          disabled={busy || total <= 0 || shortfall > 0 || capExceeded}
          className="flex-1 rounded-xl bg-indigo-600 py-3.5 text-lg font-semibold text-white transition hover:bg-indigo-700 disabled:opacity-40"
        >
          {busy ? "Charging…" : `Charge ${total > 0 ? formatMoney(total) : ""}`}
        </button>
      </div>
    </div>
  );
}
