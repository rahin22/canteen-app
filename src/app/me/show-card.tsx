"use client";

import { useState } from "react";

export function ShowCardButton({
  qr,
  name,
  username,
}: {
  qr: string;
  name: string;
  username: string;
}) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="flex-1 rounded-xl border border-white/40 py-2.5 text-center font-semibold text-white hover:bg-white/10"
      >
        My card
      </button>
      {open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-6"
          onClick={() => setOpen(false)}
        >
          <div
            className="w-full max-w-xs rounded-3xl bg-white p-6 text-center"
            onClick={(e) => e.stopPropagation()}
          >
            <p className="font-bold text-slate-900">{name}</p>
            <p className="mb-4 font-mono text-xs text-slate-400">{username}</p>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={qr} alt="Your canteen card QR code" className="mx-auto w-full max-w-60" />
            <p className="mt-3 text-xs text-slate-500">
              Show this at the canteen if you forgot your card.
            </p>
            <button
              onClick={() => setOpen(false)}
              className="mt-4 w-full rounded-xl bg-slate-900 py-2.5 font-semibold text-white"
            >
              Close
            </button>
          </div>
        </div>
      )}
    </>
  );
}
