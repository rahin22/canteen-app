"use client";

import { useActionState, useState, useTransition } from "react";
import {
  addSchool,
  renameSchool,
  setSchoolActive,
  type SchoolState,
} from "./actions";
import type { SchoolOption } from "@/lib/school-constants";

const inputCls =
  "rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-indigo-500";

/**
 * Add and retire schools. Retiring rather than deleting keeps every past
 * student, transaction and order attached to the school it happened at.
 */
export function SchoolsManager({ schools }: { schools: SchoolOption[] }) {
  const [addState, addAction, addPending] = useActionState<SchoolState, FormData>(
    addSchool,
    {}
  );

  return (
    <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
      <div className="space-y-2 border-b border-slate-100 px-5 py-4">
        {schools.length === 0 && (
          <p className="text-sm text-slate-500">
            No schools yet. Add the first one below.
          </p>
        )}
        {schools.map((school) => (
          <SchoolRow key={school.id} school={school} />
        ))}
      </div>

      <form action={addAction} className="px-5 py-4">
        <p className="mb-2 text-xs font-medium uppercase tracking-wide text-slate-400">
          Add a school
        </p>
        <div className="flex flex-wrap gap-2">
          <input
            name="name"
            required
            placeholder="e.g. Taqwa School"
            className={inputCls + " flex-1 min-w-48"}
          />
          <button
            disabled={addPending}
            className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-50"
          >
            {addPending ? "Adding…" : "Add school"}
          </button>
        </div>
        {(addState.error || addState.success) && (
          <p
            className={`mt-2 rounded-lg px-3 py-2 text-sm ${
              addState.error
                ? "bg-red-50 text-red-700"
                : "bg-emerald-50 text-emerald-800"
            }`}
          >
            {addState.error || addState.success}
          </p>
        )}
        <p className="mt-2 text-xs text-slate-400">
          A new school starts with an empty menu — add its items under{" "}
          <b>Menu</b> once you&apos;ve switched to it in the header.
        </p>
      </form>
    </div>
  );
}

function SchoolRow({ school }: { school: SchoolOption }) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(school.name);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  if (editing) {
    return (
      <form
        className="flex flex-wrap items-center gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          startTransition(async () => {
            const result = await renameSchool(school.id, name);
            if (result.error) setError(result.error);
            else {
              setError(null);
              setEditing(false);
            }
          });
        }}
      >
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          required
          className={inputCls + " flex-1 min-w-40"}
        />
        <button
          disabled={pending}
          className="rounded-lg bg-indigo-600 px-3 py-1.5 text-sm font-semibold text-white disabled:opacity-50"
        >
          Save
        </button>
        <button
          type="button"
          onClick={() => {
            setName(school.name);
            setEditing(false);
            setError(null);
          }}
          className="text-sm text-slate-500 hover:underline"
        >
          Cancel
        </button>
        {error && <p className="w-full text-sm text-red-700">{error}</p>}
      </form>
    );
  }

  return (
    <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-slate-200 px-3 py-2">
      <span className="font-medium text-slate-900">
        {school.name}
        {!school.active && (
          <span className="ml-2 rounded bg-slate-100 px-1.5 py-0.5 text-xs font-normal text-slate-500">
            retired
          </span>
        )}
      </span>
      <div className="flex items-center gap-3 text-sm">
        <button
          onClick={() => setEditing(true)}
          className="font-medium text-slate-600 hover:underline"
        >
          Rename
        </button>
        <button
          disabled={pending}
          onClick={() => {
            if (
              school.active &&
              !confirm(
                `Retire ${school.name}? It stops accepting new students and orders. Existing records are kept.`
              )
            )
              return;
            startTransition(async () => {
              await setSchoolActive(school.id, !school.active);
            });
          }}
          className={
            school.active
              ? "font-medium text-red-600 hover:underline disabled:opacity-50"
              : "font-medium text-emerald-700 hover:underline disabled:opacity-50"
          }
        >
          {school.active ? "Retire" : "Reinstate"}
        </button>
      </div>
    </div>
  );
}
