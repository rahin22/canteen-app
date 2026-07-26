"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { formatMoney, parseAmount } from "@/lib/money";
import { NFC_SCAN_PREFIX } from "@/lib/nfc";
import {
  lookupCard,
  charge,
  type ScanStudent,
  type ChargeInput,
} from "./actions";

type MenuItem = { id: string; name: string; price: number; category: string | null };

type Mode =
  | { step: "scan" }
  | { step: "order"; student: ScanStudent }
  | { step: "done"; student: ScanStudent; total: number; newBalance: number };

export default function ScanClient({ menu }: { menu: MenuItem[] }) {
  const [mode, setMode] = useState<Mode>({ step: "scan" });
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const handleToken = useCallback(async (token: string) => {
    setBusy(true);
    setError(null);
    const result = await lookupCard(token);
    setBusy(false);
    if (result.ok) {
      setMode({ step: "order", student: result.student });
    } else {
      setError(result.error);
    }
  }, []);

  return (
    <div className="mx-auto w-full max-w-lg flex-1 p-4">
      {mode.step === "scan" && (
        <Scanner onToken={handleToken} busy={busy} error={error} />
      )}
      {mode.step === "order" && (
        <OrderBuilder
          student={mode.student}
          menu={menu}
          onDone={(total, newBalance) =>
            setMode({ step: "done", student: mode.student, total, newBalance })
          }
          onCancel={() => {
            setError(null);
            setMode({ step: "scan" });
          }}
        />
      )}
      {mode.step === "done" && (
        <div className="mt-10 rounded-2xl border border-emerald-200 bg-emerald-50 p-8 text-center">
          <div className="text-5xl">✅</div>
          <h2 className="mt-3 text-xl font-bold text-emerald-900">
            Charged {formatMoney(mode.total)}
          </h2>
          <p className="mt-1 text-emerald-800">
            {mode.student.name} — new balance{" "}
            <span className="font-semibold">{formatMoney(mode.newBalance)}</span>
          </p>
          <button
            autoFocus
            onClick={() => setMode({ step: "scan" })}
            className="mt-6 w-full rounded-xl bg-emerald-600 py-3.5 text-lg font-semibold text-white hover:bg-emerald-700"
          >
            Scan next student
          </button>
        </div>
      )}
    </div>
  );
}

function Scanner({
  onToken,
  busy,
  error,
}: {
  onToken: (token: string) => void;
  busy: boolean;
  error: string | null;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [manual, setManual] = useState("");
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [nfcReady, setNfcReady] = useState(false);
  const onTokenRef = useRef(onToken);
  useEffect(() => {
    onTokenRef.current = onToken;
  }, [onToken]);

  // Web NFC (Android Chrome): tap a registered NFC card/wristband on the
  // phone instead of showing a QR code. Silently unavailable elsewhere.
  useEffect(() => {
    if (typeof window === "undefined" || !window.NDEFReader) return;
    const controller = new AbortController();
    const reader = new window.NDEFReader();
    let lastSerial = "";
    let lastTime = 0;
    reader
      .scan({ signal: controller.signal })
      .then(() => {
        setNfcReady(true);
        reader.onreading = (event) => {
          const serial = event.serialNumber;
          if (!serial) return;
          const now = Date.now();
          if (serial === lastSerial && now - lastTime < 3000) return;
          lastSerial = serial;
          lastTime = now;
          onTokenRef.current(`${NFC_SCAN_PREFIX}${serial}`);
        };
      })
      .catch(() => {
        // Permission denied or NFC off — QR scanning still works.
      });
    return () => controller.abort();
  }, []);

  useEffect(() => {
    let cancelled = false;
    // html5-qrcode touches window at import time — load it client-side only.
    let scanner: { stop: () => Promise<void>; clear: () => void } | null = null;

    (async () => {
      const { Html5Qrcode } = await import("html5-qrcode");
      if (cancelled || !containerRef.current) return;
      const instance = new Html5Qrcode("qr-reader");
      let lastToken = "";
      let lastTime = 0;
      try {
        await instance.start(
          { facingMode: "environment" },
          { fps: 10, qrbox: { width: 240, height: 240 } },
          (decoded) => {
            const now = Date.now();
            // Debounce: the camera fires the same code many times per second.
            if (decoded === lastToken && now - lastTime < 3000) return;
            lastToken = decoded;
            lastTime = now;
            onTokenRef.current(decoded.trim());
          },
          undefined
        );
        scanner = instance;
        if (cancelled) await instance.stop();
      } catch {
        if (!cancelled) {
          setCameraError(
            "Camera unavailable. Check permissions, or type the student ID below."
          );
        }
      }
    })();

    return () => {
      cancelled = true;
      if (scanner) scanner.stop().then(() => scanner!.clear()).catch(() => {});
    };
  }, []);

  return (
    <div className="mt-4">
      <h1 className="mb-3 text-center text-lg font-semibold text-slate-800">
        Scan a student card
        {nfcReady && (
          <span className="ml-2 rounded-full bg-sky-100 px-2 py-0.5 align-middle text-xs font-medium text-sky-700">
            NFC ready — or tap a card
          </span>
        )}
      </h1>
      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-black">
        <div id="qr-reader" ref={containerRef} className="min-h-64 w-full" />
      </div>
      {cameraError && (
        <p className="mt-3 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800">
          {cameraError}
        </p>
      )}
      {error && (
        <p className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm font-medium text-red-700">
          {error}
        </p>
      )}
      {busy && <p className="mt-3 text-center text-sm text-slate-500">Looking up…</p>}

      <form
        className="mt-5 flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          if (manual.trim()) onToken(manual.trim());
        }}
      >
        <input
          value={manual}
          onChange={(e) => setManual(e.target.value)}
          placeholder="Or type student ID…"
          autoCapitalize="none"
          className="flex-1 rounded-xl border border-slate-300 bg-white px-3 py-3 text-base outline-none focus:border-indigo-500"
        />
        <button
          type="submit"
          disabled={busy}
          className="rounded-xl bg-slate-800 px-5 font-semibold text-white disabled:opacity-50"
        >
          Find
        </button>
      </form>
    </div>
  );
}

type CartLine = { menuItemId: string; name: string; price: number; qty: number };

function OrderBuilder({
  student,
  menu,
  onDone,
  onCancel,
}: {
  student: ScanStudent;
  menu: MenuItem[];
  onDone: (total: number, newBalance: number) => void;
  onCancel: () => void;
}) {
  const [cart, setCart] = useState<CartLine[]>([]);
  const [customInput, setCustomInput] = useState("");
  const [customAmount, setCustomAmount] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const itemsTotal = cart.reduce((sum, l) => sum + l.price * l.qty, 0);
  const total = itemsTotal + customAmount;
  const shortfall = total - student.balance;

  const addItem = (item: MenuItem) =>
    setCart((prev) => {
      const existing = prev.find((l) => l.menuItemId === item.id);
      if (existing) {
        return prev.map((l) =>
          l.menuItemId === item.id ? { ...l, qty: l.qty + 1 } : l
        );
      }
      return [...prev, { menuItemId: item.id, name: item.name, price: item.price, qty: 1 }];
    });

  const removeItem = (id: string) =>
    setCart((prev) =>
      prev
        .map((l) => (l.menuItemId === id ? { ...l, qty: l.qty - 1 } : l))
        .filter((l) => l.qty > 0)
    );

  const applyCustom = () => {
    const cents = parseAmount(customInput);
    if (cents === null) {
      setError("Enter a valid amount.");
      return;
    }
    setError(null);
    setCustomAmount(cents);
  };

  const submit = async () => {
    setBusy(true);
    setError(null);
    const payload: ChargeInput = {
      studentId: student.studentId,
      lines: cart.map((l) => ({ menuItemId: l.menuItemId, qty: l.qty })),
      customAmount: customAmount || undefined,
    };
    const result = await charge(payload);
    setBusy(false);
    if (result.ok) {
      onDone(result.total, result.newBalance);
    } else {
      setError(result.error);
    }
  };

  return (
    <div className="mt-2">
      <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="flex items-center gap-3">
          {/* Photo first — staff check the face before charging the card. */}
          <div className="flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-slate-100">
            {student.hasPhoto ? (
              // Private, no-store response — must bypass the image optimiser.
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={`/api/photo/student/${student.studentId}`}
                alt={`Photo of ${student.name}`}
                className="h-full w-full object-cover"
              />
            ) : (
              <span className="text-2xl font-bold text-slate-400">
                {student.name.charAt(0).toUpperCase()}
              </span>
            )}
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-lg font-bold text-slate-900">
              {student.name}
            </p>
            <p className="truncate text-sm text-slate-500">
              {student.className ? `${student.className} · ` : ""}
              {student.username}
            </p>
          </div>
          <div className="shrink-0 text-right">
            <p className="text-xs uppercase tracking-wide text-slate-400">Balance</p>
            <p
              className={`text-lg font-bold ${
                student.balance < 500 ? "text-amber-600" : "text-emerald-600"
              }`}
            >
              {formatMoney(student.balance)}
            </p>
          </div>
        </div>
      </div>

      {menu.length > 0 && (
        <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-3">
          {menu.map((item) => {
            const inCart = cart.find((l) => l.menuItemId === item.id);
            return (
              <button
                key={item.id}
                onClick={() => addItem(item)}
                className={`rounded-xl border p-3 text-left transition active:scale-95 ${
                  inCart
                    ? "border-indigo-500 bg-indigo-50"
                    : "border-slate-200 bg-white hover:border-slate-300"
                }`}
              >
                <p className="text-sm font-semibold leading-tight text-slate-900">
                  {item.name}
                  {inCart && (
                    <span className="ml-1 text-indigo-600">×{inCart.qty}</span>
                  )}
                </p>
                <p className="mt-0.5 text-sm text-slate-500">{formatMoney(item.price)}</p>
              </button>
            );
          })}
        </div>
      )}

      <div className="mt-3 flex gap-2">
        <input
          value={customInput}
          onChange={(e) => setCustomInput(e.target.value)}
          onBlur={applyCustom}
          inputMode="decimal"
          placeholder="Custom amount"
          className="flex-1 rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-base outline-none focus:border-indigo-500"
        />
        <button
          onClick={applyCustom}
          className="rounded-xl border border-slate-300 bg-white px-4 font-medium text-slate-700"
        >
          Add
        </button>
      </div>

      {(cart.length > 0 || customAmount > 0) && (
        <div className="mt-4 rounded-2xl border border-slate-200 bg-white p-4">
          {cart.map((l) => (
            <div key={l.menuItemId} className="flex items-center justify-between py-1">
              <span className="text-sm text-slate-700">
                {l.name} × {l.qty}
              </span>
              <span className="flex items-center gap-3">
                <span className="text-sm font-medium">{formatMoney(l.price * l.qty)}</span>
                <button
                  onClick={() => removeItem(l.menuItemId)}
                  aria-label={`Remove one ${l.name}`}
                  className="flex h-7 w-7 items-center justify-center rounded-full bg-slate-100 text-slate-600"
                >
                  −
                </button>
              </span>
            </div>
          ))}
          {customAmount > 0 && (
            <div className="flex items-center justify-between py-1">
              <span className="text-sm text-slate-700">Custom amount</span>
              <span className="flex items-center gap-3">
                <span className="text-sm font-medium">{formatMoney(customAmount)}</span>
                <button
                  onClick={() => {
                    setCustomAmount(0);
                    setCustomInput("");
                  }}
                  aria-label="Remove custom amount"
                  className="flex h-7 w-7 items-center justify-center rounded-full bg-slate-100 text-slate-600"
                >
                  −
                </button>
              </span>
            </div>
          )}
          <div className="mt-2 flex items-center justify-between border-t border-slate-100 pt-3">
            <span className="font-semibold text-slate-900">Total</span>
            <span className="text-xl font-bold text-slate-900">{formatMoney(total)}</span>
          </div>
        </div>
      )}

      {shortfall > 0 && total > 0 && (
        <p className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm font-medium text-red-700">
          Balance too low — short by {formatMoney(shortfall)}.
        </p>
      )}
      {error && (
        <p className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm font-medium text-red-700">
          {error}
        </p>
      )}

      <div className="mt-4 flex gap-2 pb-8">
        <button
          onClick={onCancel}
          className="rounded-xl border border-slate-300 bg-white px-5 py-3.5 font-semibold text-slate-700"
        >
          Cancel
        </button>
        <button
          onClick={submit}
          disabled={busy || total <= 0 || shortfall > 0}
          className="flex-1 rounded-xl bg-indigo-600 py-3.5 text-lg font-semibold text-white transition hover:bg-indigo-700 disabled:opacity-40"
        >
          {busy ? "Charging…" : `Charge ${total > 0 ? formatMoney(total) : ""}`}
        </button>
      </div>
    </div>
  );
}
