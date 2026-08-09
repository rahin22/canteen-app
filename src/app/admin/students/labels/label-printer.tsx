"use client";

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import {
  connect,
  reconnect,
  printLabel,
  rasterise,
  unsupportedReason,
  type R22Connection,
} from "@/lib/r22";
import { drawLabel, LABEL_H as H, type LabelData } from "@/lib/label-design";

export type { LabelData };

/** Capability never changes within a page load, so there is nothing to subscribe to. */
const neverChanges = () => () => {};
const serverSnapshot = () => null;

export function LabelPrinter({
  labels,
  school,
}: {
  labels: LabelData[];
  school: string;
}) {
  const [conn, setConn] = useState<R22Connection | null>(null);
  const [status, setStatus] = useState("Not connected");
  const [busy, setBusy] = useState(false);
  const [selected, setSelected] = useState<string | null>(labels[0]?.id ?? null);
  const [done, setDone] = useState<Set<string>>(new Set());
  const canvasRef = useRef<HTMLCanvasElement>(null);
  // Browser capability is a client-only value: the server has no `navigator`,
  // so it renders null and the client fills it in without a hydration mismatch.
  const blocked = useSyncExternalStore(neverChanges, unsupportedReason, serverSnapshot);

  const current = labels.find((l) => l.id === selected) ?? null;

  useEffect(() => {
    if (canvasRef.current && current) drawLabel(canvasRef.current, current, school);
  }, [current, school]);

  const onConnect = useCallback(async () => {
    try {
      setStatus("Choose “R22_2A0E” in the Bluetooth prompt…");
      const c = await connect();
      setConn(c);
      setStatus(`Connected to ${c.device.name ?? "printer"}`);
      c.device.addEventListener("gattserverdisconnected", () =>
        setStatus("Printer disconnected (it sleeps when idle) — printing will reconnect")
      );
    } catch (e) {
      setStatus(e instanceof Error ? e.message : "Connection failed");
    }
  }, []);

  const print = useCallback(
    async (list: LabelData[]) => {
      if (!conn || !canvasRef.current) return;
      setBusy(true);
      try {
        let c = conn;
        for (let i = 0; i < list.length; i++) {
          const label = list[i];
          setStatus(`Printing ${i + 1} of ${list.length}: ${label.name}…`);
          // The printer sleeps between jobs; reconnect rather than fail.
          c = await reconnect(c);
          setConn(c);
          drawLabel(canvasRef.current, label, school);
          await printLabel(c.characteristic, rasterise(canvasRef.current), H);
          setDone((d) => new Set(d).add(label.id));
          if (i < list.length - 1) await new Promise((r) => setTimeout(r, 2500));
        }
        setStatus(`Printed ${list.length} label${list.length === 1 ? "" : "s"}`);
      } catch (e) {
        setStatus(e instanceof Error ? `Print failed: ${e.message}` : "Print failed");
      } finally {
        setBusy(false);
      }
    },
    [conn, school]
  );

  return (
    <div className="mt-6">
      <div className="flex flex-wrap items-center gap-3">
        {!conn ? (
          <button
            onClick={onConnect}
            disabled={blocked !== null}
            className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-40"
          >
            Connect printer
          </button>
        ) : (
          <>
            <button
              disabled={busy || !current}
              onClick={() => current && print([current])}
              className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-40"
            >
              Print selected
            </button>
            <button
              disabled={busy || labels.length === 0}
              onClick={() => print(labels)}
              className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-40"
            >
              Print all ({labels.length})
            </button>
          </>
        )}
        <span className={`text-sm ${blocked ? "text-amber-700" : "text-slate-500"}`}>
          {blocked ?? status}
        </span>
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-[320px_1fr]">
        <div>
          <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-500">
            Preview (48 × 20 mm)
          </p>
          <canvas
            ref={canvasRef}
            className="w-full rounded-lg border border-slate-300 bg-white"
            style={{ imageRendering: "pixelated" }}
          />
          <p className="mt-2 text-xs text-slate-500">
            The R22 starts printing ~8 mm into each label and its firmware
            ignores every repositioning command, so labels use the lower 20 mm
            of the 30 mm stock. (Full-bleed printing is possible but wastes a
            blank label per job.)
          </p>
        </div>

        <div>
          <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-500">
            Students ({labels.length})
          </p>
          <ul className="max-h-[28rem] divide-y divide-slate-200 overflow-y-auto rounded-lg border border-slate-200">
            {labels.map((l) => (
              <li key={l.id}>
                <button
                  onClick={() => setSelected(l.id)}
                  className={`flex w-full items-center justify-between px-3 py-2 text-left text-sm ${
                    selected === l.id ? "bg-indigo-50 text-indigo-800" : "hover:bg-slate-50"
                  }`}
                >
                  <span>
                    <span className="font-medium">{l.name}</span>{" "}
                    <span className="text-slate-500">{l.username}</span>
                  </span>
                  {done.has(l.id) && <span className="text-xs text-green-600">printed</span>}
                </button>
              </li>
            ))}
            {labels.length === 0 && (
              <li className="px-3 py-4 text-sm text-slate-500">
                No active students with QR cards.
              </li>
            )}
          </ul>
        </div>
      </div>
    </div>
  );
}
