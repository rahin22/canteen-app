"use client";

import { useState, useTransition } from "react";
import {
  approveRegistration,
  rejectRegistration,
  type ReviewState,
} from "./actions";

export type PendingRegistration = {
  id: string;
  name: string;
  /** School-issued student ID printed on their card. */
  studentIdCode: string;
  /** Which school the parent enrolled them at. */
  schoolName: string | null;
  className: string | null;
  hasPhoto: boolean;
  createdAt: string;
  parent: {
    name: string;
    username: string;
    phone: string | null;
    /** null when email confirmation is switched off — there's nothing to report. */
    emailVerified: boolean | null;
  };
  match: { name: string; className: string | null; alreadyLinked: boolean } | null;
};

export function ReviewCard({ registration }: { registration: PendingRegistration }) {
  const [state, setState] = useState<ReviewState>({});
  const [rejecting, setRejecting] = useState(false);
  const [reason, setReason] = useState("");
  const [pending, startTransition] = useTransition();
  const [done, setDone] = useState(false);

  const run = (fn: () => Promise<ReviewState>) =>
    startTransition(async () => {
      const result = await fn();
      setState(result);
      if (!result.error) setDone(true);
    });

  if (done) {
    return (
      <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-5">
        <p className="font-semibold text-emerald-900">
          {registration.name} — {state.success}
        </p>
        {state.credentials && (
          <div className="mt-3 rounded-xl border border-emerald-300 bg-white p-4">
            <p className="text-sm text-slate-600">
              Give these login details to the student. This is the only time the
              password is shown.
            </p>
            <dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
              <dt className="text-slate-500">Student ID</dt>
              <dd className="font-mono font-semibold">
                {state.credentials.username}
              </dd>
              <dt className="text-slate-500">Password</dt>
              <dd className="font-mono font-semibold">
                {state.credentials.password}
              </dd>
            </dl>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5">
      <div className="flex gap-4">
        <div className="flex h-20 w-20 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-slate-100">
          {registration.hasPhoto ? (
            // Private, no-store response — must bypass the image optimiser.
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={`/api/photo/registration/${registration.id}`}
              alt={`Photo of ${registration.name}`}
              className="h-full w-full object-cover"
            />
          ) : (
            <span className="text-3xl text-slate-300">👤</span>
          )}
        </div>

        <div className="min-w-0 flex-1">
          <p className="text-lg font-bold text-slate-900">{registration.name}</p>
          <p className="text-sm text-slate-500">
            ID <span className="font-mono">{registration.studentIdCode}</span>
            {registration.className ? ` · ${registration.className}` : ""}
          </p>
          {registration.schoolName && (
            <p className="text-sm font-medium text-indigo-600">
              {registration.schoolName}
            </p>
          )}
          <p className="mt-2 text-sm text-slate-600">
            Submitted by <b>{registration.parent.name}</b> ·{" "}
            <span className="text-slate-500">{registration.parent.username}</span>
            {registration.parent.emailVerified === true && (
              <span
                title="This parent confirmed their email address"
                className="ml-1.5 rounded bg-emerald-100 px-1.5 py-0.5 text-xs font-medium text-emerald-800"
              >
                email verified
              </span>
            )}
            {registration.parent.emailVerified === false && (
              <span className="ml-1.5 rounded bg-amber-100 px-1.5 py-0.5 text-xs font-medium text-amber-800">
                email unverified
              </span>
            )}
            {registration.parent.phone ? ` · ${registration.parent.phone}` : ""}
          </p>
          <p className="mt-0.5 text-xs text-slate-400">{registration.createdAt}</p>

          {registration.match ? (
            <p className="mt-3 rounded-lg bg-sky-50 px-3 py-2 text-sm text-sky-900">
              Matches existing student <b>{registration.match.name}</b>
              {registration.match.className ? ` (${registration.match.className})` : ""}.
              {registration.match.alreadyLinked
                ? " This parent is already linked."
                : " Approving links this parent to that record."}
            </p>
          ) : (
            <p className="mt-3 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900">
              No student with this ID yet — approving creates a new account and
              card.
            </p>
          )}
        </div>
      </div>

      {state.error && (
        <p className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
          {state.error}
        </p>
      )}

      {rejecting ? (
        <div className="mt-4 border-t border-slate-100 pt-4">
          <label className="mb-1 block text-sm font-medium text-slate-700">
            Reason (the parent sees this)
          </label>
          <input
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="e.g. Student ID doesn't match our records"
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-indigo-500"
          />
          <div className="mt-3 flex gap-2">
            <button
              disabled={pending || !reason.trim()}
              onClick={() => run(() => rejectRegistration(registration.id, reason))}
              className="rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-50"
            >
              {pending ? "Declining…" : "Confirm decline"}
            </button>
            <button
              onClick={() => setRejecting(false)}
              className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700"
            >
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <div className="mt-4 flex gap-2 border-t border-slate-100 pt-4">
          <button
            disabled={pending}
            onClick={() => run(() => approveRegistration(registration.id))}
            className="rounded-lg bg-emerald-600 px-5 py-2 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-50"
          >
            {pending ? "Approving…" : "Approve"}
          </button>
          <button
            disabled={pending}
            onClick={() => setRejecting(true)}
            className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
          >
            Decline
          </button>
        </div>
      )}
    </div>
  );
}
