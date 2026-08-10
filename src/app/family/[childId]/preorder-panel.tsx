"use client";

import { useState, useTransition } from "react";
import { formatMoney } from "@/lib/money";
import { describeLines } from "@/lib/preorder-format";
import {
  OrderComposer,
  type ComposerLine,
  type ComposerMenuItem,
} from "@/components/order-composer";
import { parentPlaceOrder, parentCancelOrder } from "../actions";
import type { PreorderSummary } from "@/lib/preorders";
import type { OrderingPlan } from "@/lib/pickup";

/**
 * The parent-facing half of preordering. Same component and same server rules
 * as the office kiosk — a parent just gets here by being logged in rather than
 * by tapping a card at the front desk.
 */
export function PreorderPanel({
  childId,
  childName,
  menu,
  pending,
  spendable,
  plan,
}: {
  childId: string;
  childName: string;
  menu: ComposerMenuItem[];
  pending: PreorderSummary[];
  spendable: number;
  plan: OrderingPlan;
}) {
  const [composing, setComposing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [cancelling, startCancelling] = useTransition();

  const submit = async (lines: ComposerLine[], pickupSlotId: string) => {
    setBusy(true);
    setError(null);
    const result = await parentPlaceOrder(childId, lines, pickupSlotId);
    setBusy(false);
    if (result.ok) setComposing(false);
    else setError(result.error);
  };

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="font-semibold text-slate-900">Order ahead</h2>
        <span className="text-xs font-medium text-slate-400">
          {plan.open ? `For ${plan.dayLabel}` : "Unavailable"}
        </span>
      </div>
      <p className="mt-1 text-sm text-slate-500">
        Order {childName.split(" ")[0]}&apos;s food now and it&apos;ll be ready
        at the canteen — nothing to pay at the counter. It comes off their card
        straight away, and cancelling puts it back.
      </p>

      {pending.length > 0 && (
        <div className="mt-4 space-y-2">
          {pending.map((order) => (
            <div
              key={order.id}
              className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3"
            >
              <div className="min-w-0">
                <p className="font-medium text-emerald-900">
                  {describeLines(order.items)}
                </p>
                <p className="text-sm text-emerald-700">
                  {formatMoney(order.total)} paid · {order.dayLabel}
                  {order.pickup ? ` · ${order.pickup}` : ""}
                </p>
                {order.source === "KIOSK" && (
                  <p className="text-xs text-emerald-600">Ordered at school</p>
                )}
              </div>
              <button
                type="button"
                disabled={cancelling}
                onClick={() =>
                  startCancelling(async () => {
                    await parentCancelOrder(childId, order.id);
                  })
                }
                className="shrink-0 text-sm font-medium text-red-600 hover:underline disabled:opacity-50"
              >
                {cancelling ? "Refunding…" : "Cancel & refund"}
              </button>
            </div>
          ))}
        </div>
      )}

      {!plan.open ? (
        <p className="mt-4 rounded-xl bg-slate-50 px-4 py-3 text-sm text-slate-500">
          {plan.reason}
        </p>
      ) : composing ? (
        <div className="mt-4">
          <OrderComposer
            menu={menu}
            slots={plan.slots}
            dayLabel={plan.dayLabel}
            forNextDay={plan.forNextDay}
            spendable={spendable}
            submitLabel="Place order"
            busy={busy}
            error={error}
            onSubmit={submit}
            onCancel={() => {
              setError(null);
              setComposing(false);
            }}
          />
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setComposing(true)}
          className="mt-4 w-full rounded-xl border-2 border-dashed border-slate-300 py-3 font-semibold text-indigo-600 transition hover:border-indigo-400 hover:bg-indigo-50"
        >
          + Order for {plan.dayLabel}
        </button>
      )}
    </div>
  );
}
