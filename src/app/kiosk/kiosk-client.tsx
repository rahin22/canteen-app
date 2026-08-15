"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { formatMoney } from "@/lib/money";
import { CardScanner } from "@/components/card-scanner";
import { OrderComposer, type ComposerLine } from "@/components/order-composer";
import { describeLines, orderLabel } from "@/lib/preorder-format";
import {
  kioskLookup,
  kioskPlaceOrder,
  kioskCancelOrder,
  type KioskStudent,
} from "./actions";
import type { PreorderSummary } from "@/lib/preorders";

/**
 * How long a student's details stay on screen with nobody touching anything.
 * An unattended kiosk showing the last child's name and balance is the main
 * privacy risk here, so it clears itself rather than waiting for the next tap.
 */
const IDLE_MS = 60_000;
/** The receipt screen clears faster — there's nothing left to do on it. */
const RECEIPT_MS = 12_000;

type Mode =
  | { step: "scan" }
  | { step: "order"; student: KioskStudent }
  | { step: "done"; student: KioskStudent; placed: PreorderSummary };

export default function KioskClient({ cutoffLabel }: { cutoffLabel: string }) {
  const [mode, setMode] = useState<Mode>({ step: "scan" });
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const reset = useCallback(() => {
    setError(null);
    setBusy(false);
    setMode({ step: "scan" });
  }, []);

  const handleToken = useCallback(async (token: string) => {
    setBusy(true);
    setError(null);
    const result = await kioskLookup(token);
    setBusy(false);
    if (result.ok) setMode({ step: "order", student: result.student });
    else setError(result.error);
  }, []);

  return (
    <div className="mx-auto w-full max-w-3xl flex-1 p-5">
      {mode.step === "scan" && (
        <>
          <CardScanner
            size="kiosk"
            title="Scan your card to order"
            manualLabel="Or type your student ID…"
            onToken={handleToken}
            busy={busy}
            error={error}
          />
          <p className="mt-4 text-center text-slate-500">
            Orders close at {cutoffLabel}. It&apos;s paid from your card when
            you order, then you just pick it up.
          </p>
        </>
      )}

      {mode.step === "order" && (
        <IdleTimeout ms={IDLE_MS} onExpire={reset}>
          <OrderStep
            student={mode.student}
            onPlaced={(student, placed) => setMode({ step: "done", student, placed })}
            onStudentChange={(student) => setMode({ step: "order", student })}
            onCancel={reset}
          />
        </IdleTimeout>
      )}

      {mode.step === "done" && (
        <IdleTimeout ms={RECEIPT_MS} onExpire={reset}>
          <div className="mt-10 rounded-3xl border-2 border-emerald-300 bg-emerald-50 p-10 text-center">
            <div className="text-7xl">✅</div>
            <h2 className="mt-4 text-4xl font-bold text-emerald-900">
              Order {orderLabel(mode.placed.orderNumber)}
              {mode.placed.pickupLabel ? ` — ${mode.placed.pickupLabel}` : ""}
            </h2>
            {/* The number is the thing to remember, so it gets its own line
                at a size that reads from arm's length. */}
            {mode.placed.orderNumber !== null && (
              <p className="mt-1 text-lg text-emerald-700">
                Tell the canteen this number when you collect.
              </p>
            )}
            <p className="mt-2 text-2xl text-emerald-800">
              {mode.student.name.split(" ")[0]} — {describeLines(mode.placed.items)}
            </p>
            {mode.placed.pickup && (
              <p className="mt-3 text-2xl font-bold text-emerald-900">
                {mode.placed.dayLabel} · {mode.placed.pickup}
              </p>
            )}
            <p className="mt-4 text-xl text-emerald-800">
              <span className="font-bold">{formatMoney(mode.placed.total)}</span>{" "}
              paid from your card. Just pick it up at the canteen.
            </p>
            <p className="mt-1 text-lg text-emerald-700">
              {formatMoney(mode.student.balance)} left on your card.
            </p>
            <button
              autoFocus
              onClick={reset}
              className="mt-8 w-full rounded-2xl bg-emerald-600 py-6 text-2xl font-semibold text-white hover:bg-emerald-700"
            >
              Done
            </button>
          </div>
        </IdleTimeout>
      )}
    </div>
  );
}

/**
 * Returns the kiosk to the scan screen after a period with no interaction,
 * so one student's details aren't left up for the next child in the queue.
 */
function IdleTimeout({
  ms,
  onExpire,
  children,
}: {
  ms: number;
  onExpire: () => void;
  children: React.ReactNode;
}) {
  const onExpireRef = useRef(onExpire);
  useEffect(() => {
    onExpireRef.current = onExpire;
  }, [onExpire]);

  const [nudge, setNudge] = useState(0);
  useEffect(() => {
    const id = setTimeout(() => onExpireRef.current(), ms);
    return () => clearTimeout(id);
    // `nudge` changes on every interaction, restarting the timer.
  }, [ms, nudge]);

  return (
    <div
      onPointerDown={() => setNudge((n) => n + 1)}
      onKeyDown={() => setNudge((n) => n + 1)}
    >
      {children}
    </div>
  );
}

function OrderStep({
  student,
  onPlaced,
  onStudentChange,
  onCancel,
}: {
  student: KioskStudent;
  onPlaced: (student: KioskStudent, placed: PreorderSummary) => void;
  onStudentChange: (student: KioskStudent) => void;
  onCancel: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (lines: ComposerLine[], pickupSlotId: string) => {
    setBusy(true);
    setError(null);
    const result = await kioskPlaceOrder(student.studentId, lines, pickupSlotId);
    setBusy(false);
    if (result.ok) onPlaced(result.student, result.placed);
    else {
      setError(result.error);
      if (result.student) onStudentChange(result.student);
    }
  };

  const cancel = async (preorderId: string) => {
    setBusy(true);
    const result = await kioskCancelOrder(student.studentId, preorderId);
    setBusy(false);
    if (result.ok) onStudentChange(result.student);
  };

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-white p-5">
        <div>
          <p className="text-3xl font-bold text-slate-900">
            Hi, {student.name.split(" ")[0]} 👋
          </p>
          <p className="text-lg text-slate-500">
            {[student.className, student.schoolName].filter(Boolean).join(" · ")}
          </p>
        </div>
        <div className="text-right">
          <p className="text-sm uppercase tracking-wide text-slate-400">
            On your card
          </p>
          <p
            className={`text-3xl font-bold ${
              student.balance < 500 ? "text-amber-600" : "text-emerald-600"
            }`}
          >
            {formatMoney(student.balance)}
          </p>
        </div>
      </div>

      {student.pending.length > 0 && (
        <div className="mb-4 rounded-2xl border-2 border-emerald-200 bg-emerald-50 p-5">
          <p className="text-lg font-bold text-emerald-900">
            Already ordered and paid for today
          </p>
          {student.pending.map((order) => (
            <div
              key={order.id}
              className="mt-2 flex flex-wrap items-center justify-between gap-2"
            >
              <span className="text-lg text-emerald-900">
                <span className="font-bold">
                  Order {orderLabel(order.orderNumber)}
                </span>{" "}
                — {describeLines(order.items)} · {formatMoney(order.total)}
                <span className="block text-base text-emerald-700">
                  {[order.dayLabel, order.pickup].filter(Boolean).join(" · ")}
                </span>
              </span>
              <button
                type="button"
                disabled={busy}
                onClick={() => cancel(order.id)}
                className="rounded-full border border-emerald-300 bg-white px-4 py-1.5 text-sm font-semibold text-emerald-800 disabled:opacity-50"
              >
                Cancel &amp; refund
              </button>
            </div>
          ))}
        </div>
      )}

      {student.plan.open ? (
        <OrderComposer
          size="kiosk"
          menu={student.menu}
          slots={student.plan.slots}
          dayLabel={student.plan.dayLabel}
          forNextDay={student.plan.forNextDay}
          spendable={student.spendable}
          submitLabel="Place order"
          busy={busy}
          error={error}
          onSubmit={submit}
          onCancel={onCancel}
        />
      ) : (
        <p className="rounded-2xl border-2 border-amber-300 bg-amber-50 p-6 text-xl text-amber-900">
          {student.plan.reason}
        </p>
      )}
    </div>
  );
}
