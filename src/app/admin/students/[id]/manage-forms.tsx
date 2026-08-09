"use client";

import { useActionState, useEffect, useRef, useState, useTransition } from "react";
import { PhotoInput } from "@/components/photo-input";
import type { SchoolOption } from "@/lib/school-constants";
import {
  updateStudent,
  cashTopup,
  adjustment,
  resetPassword,
  setStudentActive,
  reissueCard,
  setCardStatus,
  attachNfcCard,
  createParent,
  linkParent,
  unlinkParent,
  resetParentPassword,
  uploadStudentPhoto,
  removeStudentPhoto,
  type ActionState,
} from "../actions";

const inputCls =
  "w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-indigo-500";
const btnPrimary =
  "rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-50";
const btnGhost =
  "rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50";

function Feedback({ state }: { state: ActionState }) {
  if (state.error)
    return (
      <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{state.error}</p>
    );
  if (state.credentials)
    return (
      <p className="rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
        New password for <b className="font-mono">{state.credentials.username}</b>:{" "}
        <b className="font-mono">{state.credentials.password}</b> — write it down now.
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

export function EditForm(props: {
  id: string;
  name: string;
  className: string;
  schoolId: string | null;
  schools: SchoolOption[];
}) {
  const [state, formAction, pending] = useActionState<ActionState, FormData>(
    updateStudent,
    {}
  );
  return (
    <form action={formAction} className="space-y-3">
      <input type="hidden" name="id" value={props.id} />
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="mb-1 block text-xs font-medium text-slate-500">Name</label>
          <input name="name" defaultValue={props.name} required className={inputCls} />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-slate-500">Class</label>
          <input name="className" defaultValue={props.className} className={inputCls} />
        </div>
      </div>
      <div>
        <label className="mb-1 block text-xs font-medium text-slate-500">School</label>
        <select
          name="school"
          defaultValue={props.schoolId ?? ""}
          required
          className={inputCls}
        >
          <option value="" disabled>
            Choose a school…
          </option>
          {props.schools.map((school) => (
            <option key={school.id} value={school.id}>
              {school.name}
              {school.active ? "" : " (retired)"}
            </option>
          ))}
        </select>
        <p className="mt-1 text-xs text-slate-400">
          Decides which menu they&apos;re offered. Past transactions keep the
          prices they were charged.
        </p>
      </div>
      <Feedback state={state} />
      <button disabled={pending} className={btnPrimary}>
        {pending ? "Saving…" : "Save"}
      </button>
    </form>
  );
}

export function TopupForm({ studentId }: { studentId: string }) {
  const [state, formAction, pending] = useActionState<ActionState, FormData>(
    cashTopup,
    {}
  );
  return (
    <form action={formAction} className="space-y-3">
      <input type="hidden" name="studentId" value={studentId} />
      <div className="flex gap-2">
        <input
          name="amount"
          inputMode="decimal"
          placeholder="Amount, e.g. 20"
          required
          className={inputCls}
        />
        <input name="note" placeholder="Note (optional)" className={inputCls} />
      </div>
      <Feedback state={state} />
      <button disabled={pending} className={btnPrimary}>
        {pending ? "Recording…" : "Record cash top-up"}
      </button>
      <p className="text-xs text-slate-400">
        Use this when a student or parent hands over cash in person.
      </p>
    </form>
  );
}

export function AdjustForm({ studentId }: { studentId: string }) {
  const [state, formAction, pending] = useActionState<ActionState, FormData>(
    adjustment,
    {}
  );
  return (
    <form action={formAction} className="space-y-3">
      <input type="hidden" name="studentId" value={studentId} />
      <div className="flex gap-2">
        <select name="direction" className={inputCls + " max-w-28"}>
          <option value="add">Add</option>
          <option value="remove">Remove</option>
        </select>
        <input
          name="amount"
          inputMode="decimal"
          placeholder="Amount"
          required
          className={inputCls}
        />
      </div>
      <input
        name="note"
        placeholder="Reason (required, e.g. refund for wrong charge)"
        required
        className={inputCls}
      />
      <Feedback state={state} />
      <button disabled={pending} className={btnPrimary}>
        {pending ? "Recording…" : "Record adjustment"}
      </button>
    </form>
  );
}

export function CredentialActions({ id, active }: { id: string; active: boolean }) {
  const [result, setResult] = useState<ActionState>({});
  const [pending, startTransition] = useTransition();

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        <button
          disabled={pending}
          onClick={() =>
            startTransition(async () => setResult(await resetPassword(id)))
          }
          className={btnGhost}
        >
          Reset password
        </button>
        <button
          disabled={pending}
          onClick={() => {
            if (
              active &&
              !confirm("Disable this account? The student won't be able to pay or log in.")
            )
              return;
            startTransition(async () => {
              await setStudentActive(id, !active);
              setResult({});
            });
          }}
          className={
            active
              ? "rounded-lg border border-red-200 bg-white px-3 py-1.5 text-sm font-medium text-red-600 hover:bg-red-50"
              : "rounded-lg border border-emerald-300 bg-white px-3 py-1.5 text-sm font-medium text-emerald-700 hover:bg-emerald-50"
          }
        >
          {active ? "Disable account" : "Re-enable account"}
        </button>
      </div>
      <Feedback state={result} />
    </div>
  );
}

export function CardStatusToggle({
  card,
}: {
  card: { id: string; status: string };
}) {
  const [pending, startTransition] = useTransition();
  if (card.status === "REPLACED") return null;
  const blocked = card.status === "BLOCKED";

  return (
    <button
      disabled={pending}
      onClick={() => {
        if (!blocked && !confirm("Block this card? It stops working at the till immediately."))
          return;
        startTransition(async () => {
          await setCardStatus(card.id, blocked ? "ACTIVE" : "BLOCKED");
        });
      }}
      className={`rounded px-2 py-1 text-xs font-medium ${
        blocked
          ? "border border-emerald-300 text-emerald-700 hover:bg-emerald-50"
          : "border border-red-200 text-red-600 hover:bg-red-50"
      }`}
    >
      {blocked ? "Unblock" : "Block"}
    </button>
  );
}

export function CardActions({ studentId }: { studentId: string }) {
  const [pending, startTransition] = useTransition();

  return (
    <button
      disabled={pending}
      onClick={() => {
        if (
          !confirm(
            "Issue a replacement QR card? Existing QR cards stop working and a new one is generated for printing. NFC cards are unaffected."
          )
        )
          return;
        startTransition(async () => {
          await reissueCard(studentId);
        });
      }}
      className={btnGhost}
    >
      {pending ? "Working…" : "Replace QR card"}
    </button>
  );
}

export function NfcAttach({ studentId }: { studentId: string }) {
  const [supported, setSupported] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [serial, setSerial] = useState("");
  const [result, setResult] = useState<ActionState>({});
  const [pending, startTransition] = useTransition();
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    // Deliberately in an effect, not lazy initial state: the server can't know
    // whether the browser has Web NFC, so deciding during render would
    // hydration-mismatch on Android Chrome.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setSupported(typeof window !== "undefined" && Boolean(window.NDEFReader));
    return () => abortRef.current?.abort();
  }, []);

  const attach = (raw: string) =>
    startTransition(async () => {
      setResult(await attachNfcCard(studentId, raw));
      setSerial("");
    });

  const scanTag = () => {
    if (!window.NDEFReader) return;
    const controller = new AbortController();
    abortRef.current = controller;
    const reader = new window.NDEFReader();
    setScanning(true);
    setResult({});
    reader
      .scan({ signal: controller.signal })
      .then(() => {
        reader.onreading = (event) => {
          controller.abort();
          setScanning(false);
          if (event.serialNumber) attach(event.serialNumber);
          else setResult({ error: "Tag has no readable serial number." });
        };
      })
      .catch(() => {
        setScanning(false);
        setResult({ error: "NFC scan failed — check NFC is on and permission granted." });
      });
  };

  return (
    <div className="mt-4 border-t border-slate-100 pt-4">
      <p className="mb-2 text-sm font-medium text-slate-700">Attach NFC card</p>
      <div className="flex flex-wrap items-center gap-2">
        {supported && (
          <button
            disabled={pending || scanning}
            onClick={scanTag}
            className="rounded-lg bg-sky-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-sky-700 disabled:opacity-50"
          >
            {scanning ? "Tap the tag now…" : "📶 Scan tag with this device"}
          </button>
        )}
        <form
          className="flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            if (serial.trim()) attach(serial);
          }}
        >
          <input
            value={serial}
            onChange={(e) => setSerial(e.target.value)}
            placeholder="or type serial, e.g. 04:1a:2b:3c…"
            className="w-52 rounded-lg border border-slate-300 px-3 py-1.5 font-mono text-xs outline-none focus:border-indigo-500"
          />
          <button disabled={pending || !serial.trim()} className={btnGhost}>
            Attach
          </button>
        </form>
      </div>
      {!supported && (
        <p className="mt-2 text-xs text-slate-400">
          Tip: open this page in Chrome on an Android phone to scan tags directly.
        </p>
      )}
      <div className="mt-2">
        <Feedback state={result} />
      </div>
    </div>
  );
}

export function ParentsManager({
  studentId,
  parents,
}: {
  studentId: string;
  parents: { id: string; name: string; username: string }[];
}) {
  const [createState, createAction, createPending] = useActionState<
    ActionState,
    FormData
  >(createParent, {});
  const [linkState, linkAction, linkPending] = useActionState<ActionState, FormData>(
    linkParent,
    {}
  );
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<ActionState>({});

  return (
    <div>
      {parents.length > 0 ? (
        <div className="mb-3 space-y-2">
          {parents.map((p) => (
            <div
              key={p.id}
              className="flex items-center justify-between rounded-lg border border-slate-200 px-3 py-2"
            >
              <div>
                <p className="text-sm font-medium text-slate-900">{p.name}</p>
                <p className="font-mono text-xs text-slate-400">{p.username}</p>
              </div>
              <div className="flex items-center gap-3">
                <button
                  disabled={pending}
                  onClick={() => {
                    if (
                      !confirm(
                        `Reset ${p.name}'s password? They'll be signed out on every device and you'll need to read them the new password.`
                      )
                    )
                      return;
                    startTransition(async () =>
                      setResult(await resetParentPassword(p.id))
                    );
                  }}
                  className="text-xs font-medium text-slate-600 hover:underline"
                >
                  Reset password
                </button>
                <button
                  disabled={pending}
                  onClick={() => {
                    if (!confirm(`Unlink ${p.name} from this student?`)) return;
                    startTransition(async () => {
                      setResult({});
                      await unlinkParent(studentId, p.id);
                    });
                  }}
                  className="text-xs font-medium text-red-600 hover:underline"
                >
                  Unlink
                </button>
              </div>
            </div>
          ))}
          <Feedback state={result} />
        </div>
      ) : (
        <p className="mb-3 text-sm text-slate-500">
          No parents linked. Parents can see this student&apos;s balance and top up
          online from their own login.
        </p>
      )}

      <form action={createAction} className="space-y-2">
        <p className="text-xs font-medium uppercase tracking-wide text-slate-400">
          Create new parent
        </p>
        <input type="hidden" name="studentId" value={studentId} />
        <div className="flex gap-2">
          <input name="name" placeholder="Parent name" required className={inputCls} />
          <input
            name="username"
            placeholder="Login username"
            autoCapitalize="none"
            required
            className={inputCls}
          />
        </div>
        <Feedback state={createState} />
        <button disabled={createPending} className={btnPrimary}>
          {createPending ? "Creating…" : "Create + link parent"}
        </button>
      </form>

      <form action={linkAction} className="mt-4 space-y-2 border-t border-slate-100 pt-3">
        <p className="text-xs font-medium uppercase tracking-wide text-slate-400">
          Link existing parent (e.g. a sibling&apos;s parent)
        </p>
        <input type="hidden" name="studentId" value={studentId} />
        <div className="flex gap-2">
          <input
            name="username"
            placeholder="Parent's username"
            autoCapitalize="none"
            required
            className={inputCls}
          />
          <button disabled={linkPending} className={btnGhost}>
            Link
          </button>
        </div>
        <Feedback state={linkState} />
      </form>
    </div>
  );
}

export function PhotoManager({
  studentId,
  hasPhoto,
}: {
  studentId: string;
  hasPhoto: boolean;
}) {
  const [state, formAction, pending] = useActionState<ActionState, FormData>(
    uploadStudentPhoto,
    {}
  );
  const [removing, startRemoving] = useTransition();

  return (
    <div>
      <form action={formAction} className="space-y-3">
        <input type="hidden" name="studentId" value={studentId} />
        <PhotoInput
          name="photo"
          required
          initialPreview={hasPhoto ? `/api/photo/student/${studentId}` : null}
        />
        <Feedback state={state} />
        <div className="flex gap-2">
          <button disabled={pending} className={btnPrimary}>
            {pending ? "Saving…" : hasPhoto ? "Replace photo" : "Save photo"}
          </button>
          {hasPhoto && (
            <button
              type="button"
              disabled={removing}
              onClick={() =>
                startRemoving(async () => {
                  await removeStudentPhoto(studentId);
                })
              }
              className={btnGhost}
            >
              {removing ? "Removing…" : "Remove photo"}
            </button>
          )}
        </div>
      </form>
      <p className="mt-3 text-xs text-slate-400">
        Shown to canteen staff at the till so they can check the card belongs to
        the student. Stored encrypted; removing it deletes the image.
      </p>
    </div>
  );
}
