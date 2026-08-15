"use client";

import { useActionState, useState, useTransition } from "react";
import {
  addPickupSlot,
  updatePickupSlot,
  deletePickupSlot,
  setPickupSlotActive,
  type SlotState,
} from "./pickup-actions";
import type { SchoolOption } from "@/lib/school-constants";

type Slot = {
  id: string;
  schoolId: string;
  label: string;
  startTime: string;
  endTime: string;
  active: boolean;
};

const inputCls =
  "rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-indigo-500";

/**
 * The collection windows each school offers. Times are per school because the
 * two schools run different bell schedules.
 */
export function PickupSlotsManager({
  schools,
  slots,
}: {
  schools: SchoolOption[];
  slots: Slot[];
}) {
  return (
    <div className="space-y-4">
      {schools.map((school) => (
        <SchoolSlots
          key={school.id}
          school={school}
          slots={slots.filter((s) => s.schoolId === school.id)}
        />
      ))}
      {schools.length === 0 && (
        <p className="rounded-2xl border border-amber-200 bg-amber-50 p-5 text-sm text-amber-900">
          Add a school above before setting pick-up times.
        </p>
      )}
    </div>
  );
}

function SchoolSlots({
  school,
  slots,
}: {
  school: SchoolOption;
  slots: Slot[];
}) {
  const [state, formAction, pending] = useActionState<SlotState, FormData>(
    addPickupSlot,
    {}
  );

  return (
    <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
      <p className="border-b border-slate-100 px-5 py-3 font-semibold text-slate-900">
        {school.name}
      </p>

      <div className="space-y-2 px-5 py-4">
        {slots.length === 0 && (
          <p className="text-sm text-slate-500">
            No pick-up times yet — students can&apos;t preorder here until you
            add one.
          </p>
        )}
        {slots.map((slot) => (
          <SlotRow key={slot.id} slot={slot} />
        ))}
      </div>

      <form action={formAction} className="border-t border-slate-100 px-5 py-4">
        <input type="hidden" name="school" value={school.id} />
        <div className="flex flex-wrap gap-2">
          <input
            name="label"
            required
            placeholder="e.g. Primary Lunch"
            className={inputCls + " flex-1 min-w-40"}
          />
          <input name="startTime" type="time" required className={inputCls} />
          <input name="endTime" type="time" required className={inputCls} />
          <button
            disabled={pending}
            className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-50"
          >
            {pending ? "Adding…" : "Add"}
          </button>
        </div>
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

function SlotRow({ slot }: { slot: Slot }) {
  const [editing, setEditing] = useState(false);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [state, formAction, saving] = useActionState<SlotState, FormData>(
    async (prev, fd) => {
      const result = await updatePickupSlot(prev, fd);
      if (result.success) setEditing(false);
      return result;
    },
    {}
  );

  if (editing) {
    return (
      <form action={formAction} className="flex flex-wrap items-center gap-2">
        <input type="hidden" name="id" value={slot.id} />
        <input
          name="label"
          defaultValue={slot.label}
          required
          className={inputCls + " flex-1 min-w-36"}
        />
        <input
          name="startTime"
          type="time"
          defaultValue={slot.startTime}
          required
          className={inputCls}
        />
        <input
          name="endTime"
          type="time"
          defaultValue={slot.endTime}
          required
          className={inputCls}
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
      className={`rounded-lg border border-slate-200 px-3 py-2 ${
        slot.active ? "" : "opacity-50"
      }`}
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="font-medium text-slate-900">
          {slot.label}
          <span className="ml-2 font-normal text-slate-500">
            {slot.startTime} – {slot.endTime}
          </span>
          {!slot.active && (
            <span className="ml-2 rounded bg-slate-100 px-1.5 py-0.5 text-xs text-slate-500">
              retired
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
                await setPickupSlotActive(slot.id, !slot.active);
              })
            }
            className={
              slot.active
                ? "font-medium text-amber-700 hover:underline disabled:opacity-50"
                : "font-medium text-emerald-700 hover:underline disabled:opacity-50"
            }
          >
            {slot.active ? "Retire" : "Restore"}
          </button>
          <button
            disabled={pending}
            onClick={() => {
              if (!confirm(`Delete the ${slot.label} window?`)) return;
              setError(null);
              startTransition(async () => {
                const result = await deletePickupSlot(slot.id);
                if (result.error) setError(result.error);
              });
            }}
            className="font-medium text-red-600 hover:underline disabled:opacity-50"
          >
            Delete
          </button>
        </div>
      </div>
      {error && <p className="mt-1.5 text-sm text-red-700">{error}</p>}
    </div>
  );
}
