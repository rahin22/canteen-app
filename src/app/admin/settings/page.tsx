import { requireRole } from "@/lib/auth";
import { getFlags, SETTINGS } from "@/lib/settings";
import { Toggle } from "./settings-toggles";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  await requireRole("ADMIN");
  const flags = await getFlags();
  const stripeConfigured = Boolean(process.env.STRIPE_SECRET_KEY);

  return (
    <div className="max-w-2xl">
      <h1 className="text-2xl font-bold text-slate-900">Settings</h1>
      <p className="mb-6 mt-1 text-sm text-slate-500">
        Turn features on and off for the whole school.
      </p>

      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
        <Toggle
          settingKey={SETTINGS.onlineTopups}
          initial={flags.onlineTopups}
          disabled={!stripeConfigured}
          disabledReason="Stripe isn't connected yet — add STRIPE_SECRET_KEY to the server before turning this on."
          title="Online top-ups (card payments)"
          description="When off, students and parents are told to pay cash at the canteen or office. Cash top-ups recorded by an admin always work either way."
        />
        <Toggle
          settingKey={SETTINGS.parentSignup}
          initial={flags.parentSignup}
          title="Parent self-registration"
          description="Lets parents create their own account and register their children. Every child they submit waits for your approval before anything is created."
        />
      </div>

      <div className="mt-6 rounded-2xl border border-slate-200 bg-slate-50 p-5 text-sm text-slate-600">
        <p className="font-medium text-slate-800">Cash top-ups</p>
        <p className="mt-1">
          Always available regardless of the settings above — open a student
          from <b>Students</b> and use <b>Record cash top-up</b>. It credits the
          balance immediately and is recorded in the ledger.
        </p>
      </div>
    </div>
  );
}
