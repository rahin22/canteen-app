"use client";

import { useMemo, useState } from "react";
import { formatMoney } from "@/lib/money";
import { ItemChoices } from "./item-choices";
import type { ItemOffer } from "@/lib/modifiers";

export type ComposerMenuItem = ItemOffer;

export type ComposerLine = {
  menuItemId: string;
  qty: number;
  optionIds?: string[];
};

export type ComposerSlot = {
  id: string;
  label: string;
  timeLabel: string;
};

type CartLine = {
  /** Unique per distinct set of choices, so two differently-sauced rolls
   *  stay separate lines rather than merging into a quantity. */
  key: string;
  menuItemId: string;
  name: string;
  price: number;
  qty: number;
  optionIds: string[];
  optionLabel: string;
};

/**
 * Menu picker and running total, shared by the office kiosk and the parent
 * portal. It owns no policy: how much may be spent, whether ordering is open
 * and who the order is for are all decided by the caller and, authoritatively,
 * on the server.
 *
 * `size="kiosk"` scales everything up for a wall-mounted iPad being poked at
 * by a seven-year-old; the default suits a phone in a parent's hand.
 */
export function OrderComposer({
  menu,
  spendable,
  submitLabel,
  busy,
  error,
  size = "portal",
  slots,
  dayLabel,
  forNextDay,
  onSubmit,
  onCancel,
}: {
  menu: ComposerMenuItem[];
  /** Cents this order must stay within, or null for no ceiling. */
  spendable: number | null;
  submitLabel: string;
  busy?: boolean;
  error?: string | null;
  size?: "portal" | "kiosk";
  /** Collection windows still available for the day being ordered for. */
  slots: ComposerSlot[];
  dayLabel: string;
  /** True when the cutoff has passed and this order is for the next day. */
  forNextDay: boolean;
  onSubmit: (lines: ComposerLine[], pickupSlotId: string) => void;
  onCancel?: () => void;
}) {
  const [cart, setCart] = useState<CartLine[]>([]);
  // Pre-selected when there's only one window left, so the common
  // last-minute case is one tap fewer.
  const [slotId, setSlotId] = useState(slots.length === 1 ? slots[0].id : "");
  const kiosk = size === "kiosk";

  const total = cart.reduce((sum, l) => sum + l.price * l.qty, 0);
  const overBudget = spendable !== null && total > spendable;

  const categories = useMemo(() => {
    const groups = new Map<string, ComposerMenuItem[]>();
    for (const item of menu) {
      const key = item.category || "Other";
      const list = groups.get(key);
      if (list) list.push(item);
      else groups.set(key, [item]);
    }
    return [...groups.entries()];
  }, [menu]);

  // Items with choices open the sheet first; plain ones go straight in.
  const [choosing, setChoosing] = useState<ItemOffer | null>(null);

  const addToCart = (
    item: ComposerMenuItem,
    optionIds: string[],
    unitPrice: number
  ) =>
    setCart((prev) => {
      const key = [item.id, ...[...optionIds].sort()].join("|");
      const existing = prev.find((l) => l.key === key);
      if (existing) {
        return prev.map((l) => (l.key === key ? { ...l, qty: l.qty + 1 } : l));
      }
      const optionLabel = item.groups
        .flatMap((g) => g.options.filter((o) => optionIds.includes(o.id)))
        .map((o) => o.name)
        .join(", ");
      return [
        ...prev,
        {
          key,
          menuItemId: item.id,
          name: item.name,
          price: unitPrice,
          qty: 1,
          optionIds,
          optionLabel,
        },
      ];
    });

  const add = (item: ComposerMenuItem) => {
    if (item.groups.length > 0) setChoosing(item);
    else addToCart(item, [], item.price);
  };

  const remove = (key: string) =>
    setCart((prev) =>
      prev
        .map((l) => (l.key === key ? { ...l, qty: l.qty - 1 } : l))
        .filter((l) => l.qty > 0)
    );

  // While choosing, the sheet takes over — a child part-way through building a
  // combo shouldn't be able to wander off into the rest of the menu.
  if (choosing) {
    return (
      <ItemChoices
        item={choosing}
        size={size}
        onConfirm={(optionIds, unitPrice) => {
          addToCart(choosing, optionIds, unitPrice);
          setChoosing(null);
        }}
        onCancel={() => setChoosing(null)}
      />
    );
  }

  return (
    <div>
      <div
        className={`mb-4 rounded-2xl border-2 p-4 ${
          forNextDay
            ? "border-amber-300 bg-amber-50"
            : "border-slate-200 bg-white"
        }`}
      >
        <p
          className={`font-bold ${
            kiosk ? "text-xl" : "text-sm"
          } ${forNextDay ? "text-amber-900" : "text-slate-900"}`}
        >
          {forNextDay ? `📅 For ${dayLabel}` : `Collecting today, ${dayLabel}`}
        </p>
        {forNextDay && (
          <p className={`mt-0.5 text-amber-800 ${kiosk ? "text-lg" : "text-sm"}`}>
            Today&apos;s orders have closed, so this one is for the next school
            day.
          </p>
        )}
        <p
          className={`mb-2 mt-3 font-medium text-slate-600 ${
            kiosk ? "text-lg" : "text-sm"
          }`}
        >
          Pick-up time
        </p>
        <div className={`grid gap-2 ${kiosk ? "sm:grid-cols-2" : ""}`}>
          {slots.map((slot) => (
            <button
              key={slot.id}
              type="button"
              onClick={() => setSlotId(slot.id)}
              className={`rounded-xl border text-left transition ${
                kiosk ? "p-4" : "p-3"
              } ${
                slotId === slot.id
                  ? "border-indigo-500 bg-indigo-50 ring-2 ring-indigo-200"
                  : "border-slate-200 bg-white hover:border-slate-300"
              }`}
            >
              <p
                className={`font-semibold text-slate-900 ${
                  kiosk ? "text-lg" : "text-sm"
                }`}
              >
                {slot.label}
              </p>
              <p className={`text-slate-500 ${kiosk ? "text-base" : "text-xs"}`}>
                {slot.timeLabel}
              </p>
            </button>
          ))}
        </div>
      </div>

      {spendable !== null && (
        <p
          className={`mb-3 rounded-xl px-4 py-2.5 ${
            kiosk ? "text-lg" : "text-sm"
          } ${
            spendable === 0
              ? "bg-red-50 font-medium text-red-800"
              : "bg-slate-50 text-slate-600"
          }`}
        >
          {spendable === 0
            ? "There's nothing left to spend today."
            : `You can spend up to ${formatMoney(spendable)} on this order.`}
        </p>
      )}

      {categories.map(([category, items]) => (
        <section key={category} className="mb-4">
          <h3
            className={`mb-2 font-semibold uppercase tracking-wide text-slate-400 ${
              kiosk ? "text-sm" : "text-xs"
            }`}
          >
            {category}
          </h3>
          <div
            className={`grid gap-2 ${
              kiosk ? "grid-cols-2 sm:grid-cols-3" : "grid-cols-2"
            }`}
          >
            {items.map((item) => {
              const inCart = cart.find((l) => l.menuItemId === item.id);
              const qty = cart
                .filter((l) => l.menuItemId === item.id)
                .reduce((sum, l) => sum + l.qty, 0);
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => add(item)}
                  className={`rounded-2xl border text-left transition active:scale-95 ${
                    kiosk ? "p-5" : "p-3"
                  } ${
                    inCart
                      ? "border-indigo-500 bg-indigo-50"
                      : "border-slate-200 bg-white hover:border-slate-300"
                  }`}
                >
                  <p
                    className={`font-semibold leading-tight text-slate-900 ${
                      kiosk ? "text-xl" : "text-sm"
                    }`}
                  >
                    {item.name}
                    {qty > 0 && (
                      <span className="ml-1.5 text-indigo-600">×{qty}</span>
                    )}
                  </p>
                  {item.description && (
                    <p
                      className={`mt-0.5 leading-tight text-slate-500 ${
                        kiosk ? "text-base" : "text-xs"
                      }`}
                    >
                      {item.description}
                    </p>
                  )}
                  <p
                    className={`mt-1 text-slate-500 ${kiosk ? "text-lg" : "text-sm"}`}
                  >
                    {formatMoney(item.price)}
                    {item.groups.length > 0 && (
                      <span className={kiosk ? "text-base" : "text-xs"}>
                        {" "}
                        · choices
                      </span>
                    )}
                  </p>
                </button>
              );
            })}
          </div>
        </section>
      ))}

      {menu.length === 0 && (
        <p className="rounded-2xl border border-slate-200 bg-white p-6 text-sm text-slate-500">
          Nothing is on the menu right now.
        </p>
      )}

      {cart.length > 0 && (
        <div
          className={`mt-4 rounded-2xl border border-slate-200 bg-white ${
            kiosk ? "p-5" : "p-4"
          }`}
        >
          {cart.map((line) => (
            <div
              key={line.key}
              className="flex items-start justify-between py-1.5"
            >
              <span className={`text-slate-700 ${kiosk ? "text-lg" : "text-sm"}`}>
                {line.name} × {line.qty}
                {line.optionLabel && (
                  <span
                    className={`block text-slate-500 ${
                      kiosk ? "text-base" : "text-xs"
                    }`}
                  >
                    {line.optionLabel}
                  </span>
                )}
              </span>
              <span className="flex items-center gap-3">
                <span
                  className={`font-medium ${kiosk ? "text-lg" : "text-sm"}`}
                >
                  {formatMoney(line.price * line.qty)}
                </span>
                <button
                  type="button"
                  onClick={() => remove(line.key)}
                  aria-label={`Remove one ${line.name}`}
                  className={`flex items-center justify-center rounded-full bg-slate-100 text-slate-600 ${
                    kiosk ? "h-10 w-10 text-xl" : "h-7 w-7"
                  }`}
                >
                  −
                </button>
              </span>
            </div>
          ))}
          <div className="mt-2 flex items-center justify-between border-t border-slate-100 pt-3">
            <span
              className={`font-semibold text-slate-900 ${kiosk ? "text-xl" : ""}`}
            >
              Total
            </span>
            <span
              className={`font-bold text-slate-900 ${kiosk ? "text-3xl" : "text-xl"}`}
            >
              {formatMoney(total)}
            </span>
          </div>
        </div>
      )}

      {overBudget && (
        <p className="mt-3 rounded-xl bg-red-50 px-4 py-2.5 text-sm font-medium text-red-700">
          That&apos;s {formatMoney(total - spendable!)} more than can be spent
          today. Take something off to keep going.
        </p>
      )}
      {error && (
        <p className="mt-3 rounded-xl bg-red-50 px-4 py-2.5 text-sm font-medium text-red-700">
          {error}
        </p>
      )}
      {total > 0 && !slotId && (
        <p className="mt-3 rounded-xl bg-slate-50 px-4 py-2.5 text-sm font-medium text-slate-600">
          Choose a pick-up time above to finish.
        </p>
      )}

      <div className={`mt-4 flex gap-2 ${kiosk ? "pb-4" : "pb-8"}`}>
        {onCancel && (
          <button
            type="button"
            onClick={onCancel}
            className={`rounded-2xl border border-slate-300 bg-white font-semibold text-slate-700 ${
              kiosk ? "px-8 py-5 text-xl" : "px-5 py-3.5"
            }`}
          >
            Cancel
          </button>
        )}
        <button
          type="button"
          onClick={() =>
            onSubmit(
              cart.map((l) => ({
                menuItemId: l.menuItemId,
                qty: l.qty,
                optionIds: l.optionIds,
              })),
              slotId
            )
          }
          disabled={busy || total <= 0 || overBudget || !slotId}
          className={`flex-1 rounded-2xl bg-indigo-600 font-semibold text-white transition hover:bg-indigo-700 disabled:opacity-40 ${
            kiosk ? "py-6 text-2xl" : "py-3.5 text-lg"
          }`}
        >
          {busy ? "Sending…" : submitLabel}
          {total > 0 && !busy ? ` · ${formatMoney(total)}` : ""}
        </button>
      </div>
    </div>
  );
}
