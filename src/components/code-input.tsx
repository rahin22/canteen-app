"use client";

/** Big, numeric, one-time-code field — sized for phones and SMS autofill. */
export function CodeInput({ name = "code" }: { name?: string }) {
  return (
    <input
      name={name}
      inputMode="numeric"
      autoComplete="one-time-code"
      pattern="[0-9]*"
      maxLength={6}
      required
      placeholder="000000"
      aria-label="6-digit code"
      className="w-full rounded-lg border border-slate-300 px-3 py-3 text-center font-mono text-2xl tracking-[0.4em] outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200"
    />
  );
}
