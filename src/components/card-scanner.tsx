"use client";

import { useEffect, useRef, useState } from "react";
import { NFC_SCAN_PREFIX } from "@/lib/nfc";

/**
 * Camera QR reader plus Web NFC tap, shared by the till and the office kiosk.
 *
 * Emits whatever the card yields; resolving that to a student is the caller's
 * job (and the server's). Both readers debounce repeats, because a camera
 * decodes the same code many times a second and a child will happily hold
 * their card against the reader for a while.
 */
export function CardScanner({
  onToken,
  busy,
  error,
  title,
  manualLabel = "Or type student ID…",
  size = "till",
}: {
  onToken: (token: string) => void;
  busy?: boolean;
  error?: string | null;
  title: string;
  manualLabel?: string;
  size?: "till" | "kiosk";
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [manual, setManual] = useState("");
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [nfcReady, setNfcReady] = useState(false);
  const kiosk = size === "kiosk";

  const onTokenRef = useRef(onToken);
  useEffect(() => {
    onTokenRef.current = onToken;
  }, [onToken]);

  // Web NFC (Android Chrome): tap a registered card instead of showing a QR
  // code. Silently unavailable elsewhere, including on iPadOS.
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
      <h1
        className={`mb-3 text-center font-semibold text-slate-800 ${
          kiosk ? "text-3xl" : "text-lg"
        }`}
      >
        {title}
        {nfcReady && (
          <span className="ml-2 rounded-full bg-sky-100 px-2 py-0.5 align-middle text-xs font-medium text-sky-700">
            NFC ready — or tap a card
          </span>
        )}
      </h1>
      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-black">
        <div
          id="qr-reader"
          ref={containerRef}
          className={`w-full ${kiosk ? "min-h-80" : "min-h-64"}`}
        />
      </div>
      {cameraError && (
        <p className="mt-3 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800">
          {cameraError}
        </p>
      )}
      {error && (
        <p
          className={`mt-3 rounded-lg bg-red-50 px-3 py-2 font-medium text-red-700 ${
            kiosk ? "text-lg" : "text-sm"
          }`}
        >
          {error}
        </p>
      )}
      {busy && (
        <p className="mt-3 text-center text-sm text-slate-500">Looking up…</p>
      )}

      <form
        className="mt-5 flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          if (manual.trim()) {
            onToken(manual.trim());
            setManual("");
          }
        }}
      >
        <input
          value={manual}
          onChange={(e) => setManual(e.target.value)}
          placeholder={manualLabel}
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
