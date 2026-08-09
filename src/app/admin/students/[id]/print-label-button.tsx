"use client";

import { useCallback, useRef, useState, useSyncExternalStore } from "react";
import {
  connect,
  reconnect,
  printLabel,
  rasterise,
  unsupportedReason,
  type R22Connection,
} from "@/lib/r22";
import { drawLabel, LABEL_H, type LabelData } from "@/lib/label-design";

/**
 * One-click label print from a student's page.
 *
 * Deliberately does not navigate to the batch screen: issuing a card and
 * printing its label is one action, and bouncing to a list to find the student
 * you were already looking at is friction. The batch screen stays for printing
 * a whole class at once.
 *
 * The connection is held in a ref rather than state so it survives re-renders,
 * and the first click has to prompt the chooser — Web Bluetooth requires a user
 * gesture, so it cannot be done ahead of time.
 */
/** Capability never changes within a page load, so there is nothing to subscribe to. */
const neverChanges = () => () => {};
const serverSnapshot = () => null;

export function PrintLabelButton({
  label,
  school,
}: {
  label: LabelData | null;
  school: string;
}) {
  const connRef = useRef<R22Connection | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [ok, setOk] = useState(false);
  // Browser capability is a client-only value: the server has no `navigator`,
  // so it renders null and the client fills it in without a hydration mismatch.
  const blocked = useSyncExternalStore(neverChanges, unsupportedReason, serverSnapshot);

  const onClick = useCallback(async () => {
    if (!label) return;
    setBusy(true);
    setOk(false);
    try {
      if (!connRef.current) {
        setStatus("Choose the printer…");
        connRef.current = await connect();
      } else {
        connRef.current = await reconnect(connRef.current);
      }

      if (!canvasRef.current) canvasRef.current = document.createElement("canvas");
      drawLabel(canvasRef.current, label, school);

      setStatus("Printing…");
      await printLabel(connRef.current.characteristic, rasterise(canvasRef.current), LABEL_H);
      setStatus("Label printed");
      setOk(true);
    } catch (e) {
      // A dropped GATT link is the common failure; clear it so the next click
      // re-prompts rather than retrying a dead handle forever.
      connRef.current = null;
      setStatus(e instanceof Error ? e.message : "Print failed");
    } finally {
      setBusy(false);
    }
  }, [label, school]);

  if (!label) {
    return (
      <p className="mt-4 text-xs text-slate-400">
        No active QR card to print — issue one first.
      </p>
    );
  }

  return (
    <div className="mt-4 border-t border-slate-100 pt-4">
      <button
        onClick={onClick}
        disabled={busy || blocked !== null}
        className="w-full rounded-lg bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-50"
      >
        {busy ? "Printing…" : "🏷 Print label"}
      </button>
      {status && (
        <p className={`mt-2 text-xs ${ok ? "text-emerald-600" : "text-slate-500"}`}>
          {status}
        </p>
      )}
      <p className="mt-2 text-xs text-slate-400">
        {blocked ?? "Prints straight to the Rongta R22 over Bluetooth. Chrome or Edge only."}
      </p>
    </div>
  );
}
