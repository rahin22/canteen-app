"use client";

import { useActionState, useState, useTransition } from "react";
import { formatMoney } from "@/lib/money";
import {
  createMenuItem,
  updateMenuItem,
  setMenuItemActive,
  setMenuItemSoldOut,
  type MenuActionState,
} from "./actions";

type Item = {
  id: string;
  name: string;
  price: number;
  category: string | null;
  active: boolean;
  /** Out of stock today — hidden from ordering, still on the menu. */
  soldOut: boolean;
};

const inputCls =
  "rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-indigo-500";

export function MenuManager({
  items,
  schoolId,
}: {
  items: Item[];
  /** The school whose menu this is — submitted with every new item. */
  schoolId: string;
}) {
  const [addState, addAction, addPending] = useActionState<MenuActionState, FormData>(
    createMenuItem,
    {}
  );

  return (
    <div>
      <form
        action={addAction}
        className="mb-6 flex flex-wrap items-end gap-2 rounded-2xl border border-slate-200 bg-white p-4"
      >
        <input type="hidden" name="schoolId" value={schoolId} />
        <div className="flex-1 min-w-36">
          <label className="mb-1 block text-xs font-medium text-slate-500">Item</label>
          <input name="name" required placeholder="e.g. Chicken roll" className={inputCls + " w-full"} />
        </div>
        <div className="w-28">
          <label className="mb-1 block text-xs font-medium text-slate-500">Price</label>
          <input name="price" required inputMode="decimal" placeholder="3.50" className={inputCls + " w-full"} />
        </div>
        <div className="w-32">
          <label className="mb-1 block text-xs font-medium text-slate-500">Category</label>
          <input name="category" placeholder="optional" className={inputCls + " w-full"} />
        </div>
        <button
          disabled={addPending}
          className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-50"
        >
          Add
        </button>
        {addState.error && (
          <p className="w-full text-sm text-red-600">{addState.error}</p>
        )}
      </form>

      <div className="space-y-2">
        {items.length === 0 && (
          <p className="rounded-xl border border-slate-200 bg-white p-5 text-sm text-slate-500">
            No menu items yet — add your first one above.
          </p>
        )}
        {items.map((item) => (
          <MenuRow key={item.id} item={item} />
        ))}
      </div>
    </div>
  );
}

function MenuRow({ item }: { item: Item }) {
  const [editing, setEditing] = useState(false);
  const [state, formAction, pending] = useActionState<MenuActionState, FormData>(
    async (prev, fd) => {
      const result = await updateMenuItem(prev, fd);
      if (result.success) setEditing(false);
      return result;
    },
    {}
  );
  const [togglePending, startTransition] = useTransition();

  if (editing) {
    return (
      <form
        action={formAction}
        className="flex flex-wrap items-center gap-2 rounded-xl border border-indigo-300 bg-white p-3"
      >
        <input type="hidden" name="id" value={item.id} />
        <input name="name" defaultValue={item.name} required className={inputCls + " flex-1 min-w-32"} />
        <input
          name="price"
          defaultValue={(item.price / 100).toFixed(2)}
          inputMode="decimal"
          required
          className={inputCls + " w-24"}
        />
        <input
          name="category"
          defaultValue={item.category || ""}
          placeholder="category"
          className={inputCls + " w-28"}
        />
        <button
          disabled={pending}
          className="rounded-lg bg-indigo-600 px-3 py-2 text-sm font-semibold text-white disabled:opacity-50"
        >
          Save
        </button>
        <button
          type="button"
          onClick={() => setEditing(false)}
          className="px-2 text-sm text-slate-500"
        >
          Cancel
        </button>
        {state.error && <p className="w-full text-sm text-red-600">{state.error}</p>}
      </form>
    );
  }

  return (
    <div
      className={`flex items-center justify-between rounded-xl border bg-white p-3 ${
        item.active ? "border-slate-200" : "border-slate-200 opacity-50"
      }`}
    >
      <div>
        <p className="font-medium text-slate-900">
          {item.name}
          {item.category && (
            <span className="ml-2 rounded bg-slate-100 px-1.5 py-0.5 text-xs text-slate-500">
              {item.category}
            </span>
          )}
          {!item.active && (
            <span className="ml-2 text-xs text-slate-400">(hidden from till)</span>
          )}
          {item.active && item.soldOut && (
            <span className="ml-2 rounded bg-amber-100 px-1.5 py-0.5 text-xs font-semibold text-amber-800">
              Sold out
            </span>
          )}
        </p>
        <p className="text-sm text-slate-500">{formatMoney(item.price)}</p>
      </div>
      <div className="flex gap-2">
        <button
          onClick={() => setEditing(true)}
          className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
        >
          Edit
        </button>
        {item.active && (
          <button
            disabled={togglePending}
            onClick={() =>
              startTransition(async () => {
                await setMenuItemSoldOut(item.id, !item.soldOut);
              })
            }
            className={
              item.soldOut
                ? "rounded-lg border border-emerald-300 px-3 py-1.5 text-sm font-medium text-emerald-700 hover:bg-emerald-50 disabled:opacity-50"
                : "rounded-lg border border-amber-300 px-3 py-1.5 text-sm font-medium text-amber-700 hover:bg-amber-50 disabled:opacity-50"
            }
          >
            {item.soldOut ? "Back in stock" : "Sold out"}
          </button>
        )}
        <button
          disabled={togglePending}
          onClick={() =>
            startTransition(async () => {
              await setMenuItemActive(item.id, !item.active);
            })
          }
          className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
        >
          {item.active ? "Hide" : "Show"}
        </button>
      </div>
    </div>
  );
}
