/** Shown wherever online top-ups would appear while they're switched off. */
export function CashOnlyNotice() {
  return (
    <div className="rounded-2xl border border-amber-200 bg-amber-50 p-5 text-amber-900">
      <p className="font-semibold">Top up with cash</p>
      <p className="mt-1 text-sm">
        Online card payments aren&apos;t available at the moment. Bring cash to
        the canteen or the school office and it&apos;s credited to the card
        straight away.
      </p>
    </div>
  );
}
