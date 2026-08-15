"use client";

import { useTransition } from "react";
import { adminCancelOrder } from "./actions";

export function CancelOrderButton({
  preorderId,
  studentName,
  orderLabel,
  total,
}: {
  preorderId: string;
  studentName: string;
  /** e.g. "#3" — named in the confirmation so nobody voids the wrong ticket. */
  orderLabel: string;
  /** Formatted for the confirmation — this puts real money back on the card. */
  total: string;
}) {
  const [pending, startTransition] = useTransition();

  return (
    <button
      disabled={pending}
      onClick={() => {
        if (
          !confirm(
            `Cancel order ${orderLabel} — ${studentName} — and refund ${total} to their card?`
          )
        )
          return;
        startTransition(async () => {
          await adminCancelOrder(preorderId);
        });
      }}
      className="rounded-lg border border-red-200 bg-white px-3 py-1.5 text-sm font-medium text-red-600 hover:bg-red-50 disabled:opacity-50"
    >
      {pending ? "Refunding…" : "Cancel & refund"}
    </button>
  );
}
