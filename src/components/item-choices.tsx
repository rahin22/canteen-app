"use client";

import { useState } from "react";
import { formatMoney } from "@/lib/money";
import type { GroupOffer, ItemOffer } from "@/lib/modifiers";

/**
 * The choices sheet that opens after picking an item with options — sauces,
 * salad, the combo's meal and drink.
 *
 * Everything is on one scrolling sheet rather than a wizard: a combo is four
 * short questions, and a child tapping "back" through four screens to change
 * a sauce is worse than seeing the lot at once. The confirm button names what
 * is still outstanding so nothing is silently incomplete.
 */
export function ItemChoices({
  item,
  size = "portal",
  onConfirm,
  onCancel,
}: {
  item: ItemOffer;
  size?: "portal" | "kiosk";
  onConfirm: (optionIds: string[], unitPrice: number) => void;
  onCancel: () => void;
}) {
  const kiosk = size === "kiosk";
  const [picked, setPicked] = useState<Record<string, string[]>>({});

  const toggle = (group: GroupOffer, optionId: string) =>
    setPicked((prev) => {
      const current = prev[group.id] ?? [];
      if (current.includes(optionId)) {
        return { ...prev, [group.id]: current.filter((id) => id !== optionId) };
      }
      // A single-choice group swaps rather than refusing the tap — the
      // customer clearly means "this one instead".
      if (group.maxSelect === 1) return { ...prev, [group.id]: [optionId] };
      if (current.length >= group.maxSelect) return prev;
      return { ...prev, [group.id]: [...current, optionId] };
    });

  const allIds = Object.values(picked).flat();
  const extras = item.groups
    .flatMap((g) => g.options.filter((o) => (picked[g.id] ?? []).includes(o.id)))
    .reduce((sum, o) => sum + o.price, 0);
  const unitPrice = item.price + extras;

  const missing = item.groups.filter(
    (g) => (picked[g.id] ?? []).length < g.minSelect
  );

  return (
    <div className="rounded-2xl border-2 border-indigo-300 bg-white p-4">
      <div className="flex items-baseline justify-between gap-2">
        <p className={`font-bold text-slate-900 ${kiosk ? "text-2xl" : "text-lg"}`}>
          {item.name}
        </p>
        <p className={`font-bold text-slate-900 ${kiosk ? "text-2xl" : ""}`}>
          {formatMoney(unitPrice)}
        </p>
      </div>
      {item.description && (
        <p className={`mt-0.5 text-slate-500 ${kiosk ? "text-lg" : "text-sm"}`}>
          {item.description}
        </p>
      )}

      {item.groups.map((group) => {
        const current = picked[group.id] ?? [];
        return (
          <section key={group.id} className="mt-4">
            <p
              className={`font-semibold text-slate-800 ${
                kiosk ? "text-lg" : "text-sm"
              }`}
            >
              {group.name}
              <span className="ml-2 font-normal text-slate-400">
                {rule(group, current.length)}
              </span>
            </p>
            <div
              className={`mt-2 grid gap-2 ${
                kiosk ? "grid-cols-2 sm:grid-cols-3" : "grid-cols-2"
              }`}
            >
              {group.options.map((option) => {
                const on = current.includes(option.id);
                return (
                  <button
                    key={option.id}
                    type="button"
                    onClick={() => toggle(group, option.id)}
                    className={`rounded-xl border text-left transition active:scale-95 ${
                      kiosk ? "p-4" : "p-2.5"
                    } ${
                      on
                        ? "border-indigo-500 bg-indigo-50"
                        : "border-slate-200 bg-white hover:border-slate-300"
                    }`}
                  >
                    <p
                      className={`font-medium leading-tight text-slate-900 ${
                        kiosk ? "text-lg" : "text-sm"
                      }`}
                    >
                      {on ? "✓ " : ""}
                      {option.name}
                    </p>
                    {option.price > 0 && (
                      <p
                        className={`text-slate-500 ${kiosk ? "text-base" : "text-xs"}`}
                      >
                        +{formatMoney(option.price)}
                      </p>
                    )}
                  </button>
                );
              })}
            </div>
          </section>
        );
      })}

      <div className="mt-5 flex gap-2">
        <button
          type="button"
          onClick={onCancel}
          className={`rounded-xl border border-slate-300 bg-white font-semibold text-slate-700 ${
            kiosk ? "px-6 py-4 text-lg" : "px-4 py-3"
          }`}
        >
          Cancel
        </button>
        <button
          type="button"
          disabled={missing.length > 0}
          onClick={() => onConfirm(allIds, unitPrice)}
          className={`flex-1 rounded-xl bg-indigo-600 font-semibold text-white transition hover:bg-indigo-700 disabled:opacity-40 ${
            kiosk ? "py-5 text-xl" : "py-3"
          }`}
        >
          {missing.length > 0
            ? `Choose ${missing[0].name.toLowerCase()}`
            : `Add · ${formatMoney(unitPrice)}`}
        </button>
      </div>
    </div>
  );
}

/** "Choose 1", "Choose up to 3", "2 of 3 chosen" — whichever is most useful. */
function rule(group: GroupOffer, chosen: number): string {
  if (group.minSelect > 0 && chosen < group.minSelect) {
    return group.minSelect === 1 ? "Choose 1" : `Choose ${group.minSelect}`;
  }
  if (group.maxSelect > 1) return `${chosen} of ${group.maxSelect} chosen`;
  return "Optional";
}
