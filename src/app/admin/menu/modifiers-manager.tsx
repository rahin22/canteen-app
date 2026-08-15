"use client";

import { useActionState, useState, useTransition } from "react";
import { formatMoney } from "@/lib/money";
import {
  createModifierGroup,
  createModifierOption,
  updateModifierGroup,
  updateModifierOption,
  deleteModifierGroup,
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

/** How a group's min/max reads in plain English. */
function describeRule(minSelect: number, maxSelect: number): string {
  if (minSelect === 0) return `optional, up to ${maxSelect}`;
  if (minSelect === maxSelect) return `choose exactly ${minSelect}`;
  return `choose ${minSelect}–${maxSelect}`;
}

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
  const [editing, setEditing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [editState, editAction, saving] = useActionState<ModifierState, FormData>(
    async (prev, fd) => {
      const result = await updateModifierGroup(prev, fd);
      if (result.success) setEditing(false);
      return result;
    },
    {}
  );

  return (
    <div
      className={`rounded-2xl border border-slate-200 bg-white p-4 ${
        group.active ? "" : "opacity-60"
      }`}
    >
      {editing ? (
        <form action={editAction} className="flex flex-wrap items-end gap-2">
          <input type="hidden" name="id" value={group.id} />
          <div className="flex-1 min-w-40">
            <label className="mb-1 block text-xs text-slate-500">Name</label>
            <input
              name="name"
              defaultValue={group.name}
              required
              className={inputCls + " w-full"}
            />
          </div>
          <div className="w-20">
            <label className="mb-1 block text-xs text-slate-500">Min</label>
            <input
              name="minSelect"
              type="number"
              min={0}
              max={20}
              defaultValue={group.minSelect}
              className={inputCls + " w-full"}
            />
          </div>
          <div className="w-20">
            <label className="mb-1 block text-xs text-slate-500">Max</label>
            <input
              name="maxSelect"
              type="number"
              min={1}
              max={20}
              defaultValue={group.maxSelect}
              className={inputCls + " w-full"}
            />
          </div>
          <button
            disabled={saving}
            className="rounded-lg bg-indigo-600 px-3 py-2 text-sm font-semibold text-white disabled:opacity-50"
          >
            Save
          </button>
          <button
            type="button"
            onClick={() => setEditing(false)}
            className="px-2 text-sm text-slate-500 hover:underline"
          >
            Cancel
          </button>
          {editState.error && (
            <p className="w-full text-sm text-red-700">{editState.error}</p>
          )}
        </form>
      ) : (
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <p className="font-semibold text-slate-900">
            {group.name}
            <span className="ml-2 text-xs font-normal text-slate-500">
              {describeRule(group.minSelect, group.maxSelect)}
            </span>
            {!group.active && (
              <span className="ml-2 rounded bg-slate-100 px-1.5 py-0.5 text-xs text-slate-500">
                hidden
              </span>
            )}
          </p>
          <div className="flex items-center gap-3 text-sm">
            <button
              onClick={() => setEditing(true)}
              className="font-medium text-slate-600 hover:underline"
            >
              Edit
            </button>
            <button
              disabled={pending}
              onClick={() =>
                startTransition(async () => {
                  await setModifierGroupActive(group.id, !group.active);
                })
              }
              className="font-medium text-slate-600 hover:underline disabled:opacity-50"
            >
              {group.active ? "Hide" : "Show"}
            </button>
            <button
              disabled={pending}
              onClick={() => {
                if (
                  !confirm(
                    `Delete the ${group.name} group and all ${group.options.length} of its choices?\n\nIt comes off the ${group.itemIds.length} item${
                      group.itemIds.length === 1 ? "" : "s"
                    } using it. Orders already placed keep what was chosen.`
                  )
                )
                  return;
                setError(null);
                startTransition(async () => {
                  const result = await deleteModifierGroup(group.id);
                  if (result.error) setError(result.error);
                });
              }}
              className="font-medium text-red-600 hover:underline disabled:opacity-50"
            >
              Delete
            </button>
          </div>
        </div>
      )}
      {error && <p className="mt-2 text-sm text-red-700">{error}</p>}

      <div className="mt-3 space-y-1.5">
        {group.options.length === 0 && (
          <p className="text-sm text-slate-500">No choices yet.</p>
        )}
        {group.options.map((option) => (
          <OptionRow key={option.id} option={option} groupName={group.name} />
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

/** One choice in a group — renamed, repriced, taken out of stock or removed. */
function OptionRow({
  option,
  groupName,
}: {
  option: AdminOption;
  groupName: string;
}) {
  const [editing, setEditing] = useState(false);
  const [pending, startTransition] = useTransition();
  const [state, formAction, saving] = useActionState<ModifierState, FormData>(
    async (prev, fd) => {
      const result = await updateModifierOption(prev, fd);
      if (result.success) setEditing(false);
      return result;
    },
    {}
  );

  if (editing) {
    return (
      <form action={formAction} className="flex flex-wrap items-center gap-2">
        <input type="hidden" name="id" value={option.id} />
        <input
          name="name"
          defaultValue={option.name}
          required
          className={inputCls + " flex-1 min-w-36"}
        />
        <input
          name="price"
          defaultValue={option.price > 0 ? (option.price / 100).toFixed(2) : ""}
          inputMode="decimal"
          placeholder="free"
          className={inputCls + " w-24"}
        />
        <button
          disabled={saving}
          className="rounded-lg bg-indigo-600 px-3 py-1.5 text-sm font-semibold text-white disabled:opacity-50"
        >
          Save
        </button>
        <button
          type="button"
          onClick={() => setEditing(false)}
          className="text-sm text-slate-500 hover:underline"
        >
          Cancel
        </button>
        {state.error && <p className="w-full text-sm text-red-700">{state.error}</p>}
      </form>
    );
  }

  return (
    <div
      className={`flex flex-wrap items-center justify-between gap-2 rounded-lg border px-3 py-1.5 ${
        option.soldOut
          ? "border-amber-300 bg-amber-50"
          : "border-slate-200 bg-slate-50"
      }`}
    >
      <span
        className={`text-sm font-medium ${
          option.soldOut ? "text-amber-900" : "text-slate-800"
        }`}
      >
        {option.name}
        {option.price > 0 && (
          <span className="ml-1.5 font-normal text-slate-500">
            +{formatMoney(option.price)}
          </span>
        )}
        {option.soldOut && (
          <span className="ml-2 text-xs font-semibold uppercase tracking-wide">
            sold out
          </span>
        )}
      </span>
      <div className="flex items-center gap-3 text-sm">
        <button
          onClick={() => setEditing(true)}
          className="font-medium text-slate-600 hover:underline"
        >
          Edit
        </button>
        <button
          disabled={pending}
          onClick={() =>
            startTransition(async () => {
              await setModifierOptionSoldOut(option.id, !option.soldOut);
            })
          }
          className="font-medium text-slate-600 hover:underline disabled:opacity-50"
        >
          {option.soldOut ? "Restock" : "Sold out"}
        </button>
        <button
          disabled={pending}
          onClick={() => {
            if (!confirm(`Remove ${option.name} from ${groupName}?`)) return;
            startTransition(async () => {
              await deleteModifierOption(option.id);
            });
          }}
          className="font-medium text-red-600 hover:underline disabled:opacity-50"
        >
          Delete
        </button>
      </div>
    </div>
  );
}
