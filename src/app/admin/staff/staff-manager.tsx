"use client";

import { useActionState, useState, useTransition } from "react";
import {
  createOperator,
  resetOperatorPassword,
  setOperatorActive,
  setOperatorSchool,
  type StaffActionState,
} from "./actions";
import type { SchoolOption } from "@/lib/school-constants";

type Staff = {
  id: string;
  name: string;
  username: string;
  role: string;
  active: boolean;
  /** Operators are pinned to one school; admins oversee all, so null. */
  schoolId: string | null;
  schoolName: string | null;
};

const inputCls =
  "rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-indigo-500";

function Feedback({ state }: { state: StaffActionState }) {
  if (state.error)
    return (
      <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{state.error}</p>
    );
  if (state.credentials)
    return (
      <p className="rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
        Login <b className="font-mono">{state.credentials.username}</b> · password{" "}
        <b className="font-mono">{state.credentials.password}</b> — write it down now,
        it won&apos;t be shown again.
      </p>
    );
  if (state.success)
    return (
      <p className="rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
        {state.success}
      </p>
    );
  return null;
}

export function StaffManager({
  staff,
  schools,
}: {
  staff: Staff[];
  schools: SchoolOption[];
}) {
  const [createState, createAction, createPending] = useActionState<
    StaffActionState,
    FormData
  >(createOperator, {});

  return (
    <div>
      <form
        action={createAction}
        className="mb-6 space-y-3 rounded-2xl border border-slate-200 bg-white p-4"
      >
        <p className="text-sm font-semibold text-slate-900">Add till operator</p>
        <div className="flex flex-wrap gap-2">
          <input name="name" required placeholder="Name" className={inputCls + " flex-1 min-w-36"} />
          <input
            name="username"
            required
            placeholder="Login username"
            autoCapitalize="none"
            className={inputCls + " flex-1 min-w-36"}
          />
          <select
            name="school"
            required
            defaultValue={schools.length === 1 ? schools[0].id : ""}
            className={inputCls + " flex-1 min-w-36"}
          >
            <option value="" disabled>
              School…
            </option>
            {schools.map((school) => (
              <option key={school.id} value={school.id}>
                {school.name}
              </option>
            ))}
          </select>
          <button
            disabled={createPending}
            className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-50"
          >
            {createPending ? "Creating…" : "Create"}
          </button>
        </div>
        <Feedback state={createState} />
      </form>

      <div className="space-y-2">
        {staff.map((member) => (
          <StaffRow key={member.id} member={member} schools={schools} />
        ))}
      </div>
    </div>
  );
}

function StaffRow({
  member,
  schools,
}: {
  member: Staff;
  schools: SchoolOption[];
}) {
  const [result, setResult] = useState<StaffActionState>({});
  const [pending, startTransition] = useTransition();
  const isOperator = member.role === "OPERATOR";

  return (
    <div
      className={`rounded-xl border border-slate-200 bg-white p-3 ${
        member.active ? "" : "opacity-60"
      }`}
    >
      <div className="flex items-center justify-between">
        <div>
          <p className="font-medium text-slate-900">
            {member.name}
            <span
              className={`ml-2 rounded px-1.5 py-0.5 text-xs font-medium ${
                member.role === "ADMIN"
                  ? "bg-indigo-100 text-indigo-700"
                  : "bg-slate-100 text-slate-600"
              }`}
            >
              {member.role.toLowerCase()}
            </span>
            {!member.active && (
              <span className="ml-1 rounded bg-red-100 px-1.5 py-0.5 text-xs text-red-700">
                disabled
              </span>
            )}
          </p>
          <p className="font-mono text-xs text-slate-400">{member.username}</p>
          {isOperator && (
            <label className="mt-1.5 flex items-center gap-2 text-xs text-slate-500">
              School
              <select
                value={member.schoolId ?? ""}
                disabled={pending}
                onChange={(e) =>
                  startTransition(async () =>
                    setResult(await setOperatorSchool(member.id, e.target.value))
                  )
                }
                className="rounded-lg border border-slate-300 px-2 py-1 text-xs font-medium text-slate-700 outline-none focus:border-indigo-500 disabled:opacity-50"
              >
                <option value="" disabled>
                  Not set — sees nothing
                </option>
                {schools.map((school) => (
                  <option key={school.id} value={school.id}>
                    {school.name}
                    {school.active ? "" : " (retired)"}
                  </option>
                ))}
              </select>
            </label>
          )}
        </div>
        {isOperator && (
          <div className="flex gap-2">
            <button
              disabled={pending}
              onClick={() =>
                startTransition(async () =>
                  setResult(await resetOperatorPassword(member.id))
                )
              }
              className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
            >
              Reset password
            </button>
            <button
              disabled={pending}
              onClick={() => {
                if (
                  member.active &&
                  !confirm(`Disable ${member.name}'s till access?`)
                )
                  return;
                startTransition(async () => {
                  await setOperatorActive(member.id, !member.active);
                  setResult({});
                });
              }}
              className={
                member.active
                  ? "rounded-lg border border-red-200 px-3 py-1.5 text-sm font-medium text-red-600 hover:bg-red-50"
                  : "rounded-lg border border-emerald-300 px-3 py-1.5 text-sm font-medium text-emerald-700 hover:bg-emerald-50"
              }
            >
              {member.active ? "Disable" : "Enable"}
            </button>
          </div>
        )}
      </div>
      <div className="mt-2 empty:hidden">
        <Feedback state={result} />
      </div>
    </div>
  );
}
