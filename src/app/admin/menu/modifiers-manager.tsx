"use client";

import { useActionState, useState, useTransition } from "react";
import { formatMoney } from "@/lib/money";
import {
  createModifierGroup,
  createModifierOption,
  setModifierGroupActive,
  setModifierOptionSoldOut,
  deleteModifierOption,
  toggleItemModifier,
  type ModifierState,
} from "./modifier-actions";

export type AdminOption = {
  id: string;
  name: string;
  price: number;
  soldOut: boolean;
};

export type AdminGroup = {
  id: string;
  name: string;
  minSelect: number;
  maxSelect: number;
  active: boolean;
  options: AdminOption[];
  /** Which menu items currently use this group. */
  itemIds: string[];
};

const inputCls =
  "rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-indigo-500";

/**
 * Choice groups for a school's menu — sauces, salad, combo meals and drinks.
 *
 * Groups are reusable across items on purpose: one "Sauces" list attached to
 * every roll means adding a sauce adds it everywhere, which is how the canteen
 * actually thinks about it.
 */
export function ModifiersManager({
  schoolId,
  groups,
  items,
}: {
  schoolId: string;
  groups: AdminGroup[];
  items: { id: string; name: string }[];
}) {
  const [state, formAction, pending] = useActionState<ModifierState, FormData>(
    createModifierGroup,
    {}
  );

  return (
    <div>
      <div className="space-y-3">
        {groups.length === 0 && (
          <p className="rounded-xl border border-slate-200 bg-white p-5 text-sm text-slate-500">
            No choice groups yet. Add one below — for example <b>Sauces</b> with
            a minimum of 0 and a maximum of 3, then attach it to your rolls and
            burgers.
          </p>
        )}
        {groups.map((group) => (
          <GroupCard key={group.id} group={group} items={items} />
        ))}
      </div>

      <form
        action={formAction}
        className="mt-4 rounded-2xl border border-slate-200 bg-white p-4"
      >
        <input type="hidden" name="schoolId" value={schoolId} />
        <p className="mb-2 text-xs font-medium uppercase tracking-wide text-slate-400">
          Add a choice group
        </p>
        <div className="flex flex-wrap items-end gap-2">
          <div className="flex-1 min-w-40">
            <label className="mb-1 block text-xs text-slate-500">Name</label>
            <input
              name="name"
              required
              placeholder="e.g. Sauces"
              className={inputCls + " w-full"}
            />
          </div>
          <div className="w-24">
            <label className="mb-1 block text-xs text-slate-500">Min</label>
            <input
              name="minSelect"
              type="number"
              min={0}
              max={20}
              defaultValue={0}
              className={inputCls + " w-full"}
            />
          </div>
          <div className="w-24">
            <label className="mb-1 block text-xs text-slate-500">Max</label>
            <input
              name="maxSelect"
              type="number"
              min={1}
              max={20}
              defaultValue={1}
              className={inputCls + " w-full"}
            />
          </div>
          <button
            disabled={pending}
            className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-50"
          >
            {pending ? "Adding…" : "Add group"}
          </button>
        </div>
        <p className="mt-2 text-xs text-slate-400">
          Min 0 makes the group optional; min 1 forces a choice. Max is how many
          can be picked at once.
        </p>
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
    </div>
  );
}

function GroupCard({
  group,
  items,
}: {
  group: AdminGroup;
  items: { id: string; name: string }[];
}) {
  const [optionState, optionAction, adding] = useActionState<
    ModifierState,
    FormData
  >(createModifierOption, {});
  const [pending, startTransition] = useTransition();
  const [showItems, setShowItems] = useState(false);

  return (
    <div
      className={`rounded-2xl border border-slate-200 bg-white p-4 ${
        group.active ? "" : "opacity-60"
      }`}
    >
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="font-semibold text-slate-900">
          {group.name}
          <span className="ml-2 text-xs font-normal text-slate-500">
            {group.minSelect === 0
              ? `optional, up to ${group.maxSelect}`
              : group.minSelect === group.maxSelect
              ? `choose exactly ${group.minSelect}`
              : `choose ${group.minSelect}–${group.maxSelect}`}
          </span>
          {!group.active && (
            <span className="ml-2 rounded bg-slate-100 px-1.5 py-0.5 text-xs text-slate-500">
              hidden
            </span>
          )}
        </p>
        <button
          disabled={pending}
          onClick={() =>
            startTransition(async () => {
              await setModifierGroupActive(group.id, !group.active);
            })
          }
          className="text-sm font-medium text-slate-600 hover:underline disabled:opacity-50"
        >
          {group.active ? "Hide" : "Show"}
        </button>
      </div>

      <div className="mt-3 flex flex-wrap gap-1.5">
        {group.options.length === 0 && (
          <p className="text-sm text-slate-500">No choices yet.</p>
        )}
        {group.options.map((option) => (
          <span
            key={option.id}
            className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-sm ${
              option.soldOut
                ? "border-amber-300 bg-amber-50 text-amber-800"
                : "border-slate-200 bg-slate-50 text-slate-700"
            }`}
          >
            {option.name}
            {option.price > 0 && (
              <span className="text-xs text-slate-500">
                +{formatMoney(option.price)}
              </span>
            )}
            <button
              disabled={pending}
              title={option.soldOut ? "Back in stock" : "Mark sold out"}
              onClick={() =>
                startTransition(async () => {
                  await setModifierOptionSoldOut(option.id, !option.soldOut);
                })
              }
              className="text-xs font-semibold hover:underline disabled:opacity-50"
            >
              {option.soldOut ? "restock" : "sold out"}
            </button>
            <button
              disabled={pending}
              title="Remove"
              onClick={() => {
                if (!confirm(`Remove ${option.name} from ${group.name}?`)) return;
                startTransition(async () => {
                  await deleteModifierOption(option.id);
                });
              }}
              className="text-xs text-red-600 hover:underline disabled:opacity-50"
            >
              ×
            </button>
          </span>
        ))}
      </div>

      <form action={optionAction} className="mt-3 flex flex-wrap gap-2">
        <input type="hidden" name="groupId" value={group.id} />
        <input
          name="name"
          required
          placeholder="Add a choice, e.g. Garlic"
          className={inputCls + " flex-1 min-w-40"}
        />
        <input
          name="price"
          inputMode="decimal"
          placeholder="free"
          className={inputCls + " w-24"}
        />
        <button
          disabled={adding}
          className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
        >
          Add
        </button>
      </form>
      {optionState.error && (
        <p className="mt-2 text-sm text-red-700">{optionState.error}</p>
      )}

      <div className="mt-3 border-t border-slate-100 pt-3">
        <button
          onClick={() => setShowItems((v) => !v)}
          className="text-sm font-medium text-indigo-600 hover:underline"
        >
          Used on {group.itemIds.length} item
          {group.itemIds.length === 1 ? "" : "s"} {showItems ? "▲" : "▼"}
        </button>
        {showItems && (
          <div className="mt-2 flex flex-wrap gap-1.5">
            {items.map((item) => {
              const on = group.itemIds.includes(item.id);
              return (
                <button
                  key={item.id}
                  disabled={pending}
                  onClick={() =>
                    startTransition(async () => {
                      await toggleItemModifier(item.id, group.id, !on);
                    })
                  }
                  className={`rounded-full border px-2.5 py-1 text-sm disabled:opacity-50 ${
                    on
                      ? "border-indigo-500 bg-indigo-50 font-medium text-indigo-700"
                      : "border-slate-200 bg-white text-slate-600"
                  }`}
                >
                  {on ? "✓ " : ""}
                  {item.name}
                </button>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
