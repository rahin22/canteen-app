import { requireRole } from "@/lib/auth";
import { getFlags, SETTINGS } from "@/lib/settings";
import { emailConfigured } from "@/lib/email";
import { allSchools } from "@/lib/schools";
import { CutoffField, Toggle } from "./settings-toggles";
import { SchoolsManager } from "./schools-manager";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  await requireRole("ADMIN");
  const [flags, schools] = await Promise.all([getFlags(), allSchools()]);
  const stripeConfigured = Boolean(process.env.STRIPE_SECRET_KEY);
  // Configured = a provider exists; on = configured *and* switched on.
  const mailWorks = emailConfigured();
  const mailOn = mailWorks && flags.email;

  return (
    <div className="max-w-2xl">
      <h1 className="text-2xl font-bold text-slate-900">Settings</h1>
      <p className="mb-6 mt-1 text-sm text-slate-500">
        Turn features on and off for the whole school.
      </p>

      <h2 className="mb-2 text-lg font-semibold text-slate-900">Schools</h2>
      <p className="mb-3 text-sm text-slate-500">
        Each school has its own students, menu and canteen orders. Switch
        between them with the selector in the header.
      </p>
      <div className="mb-8">
        <SchoolsManager schools={schools} />
      </div>

      <h2 className="mb-2 text-lg font-semibold text-slate-900">Features</h2>
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
          description={
            mailOn
              ? "Lets parents create their own account and register their children. They must confirm their email first, and every child they submit waits for your approval before anything is created."
              : "Lets parents create their own account and register their children. Every child they submit waits for your approval before anything is created."
          }
        />
        <Toggle
          settingKey={SETTINGS.email}
          initial={flags.email}
          disabled={!mailWorks}
          disabledReason="No email provider is connected — set RESEND_API_KEY and EMAIL_FROM on the server before turning this on."
          title="Email confirmation & password reset"
          description="When off, the app never sends email: parents sign up without confirming an address, and the “Forgot password” page tells them to contact the office. Reset a parent's password yourself from their child's page."
        />
      </div>

      <h2 className="mb-2 mt-8 text-lg font-semibold text-slate-900">Preordering</h2>
      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
        <Toggle
          settingKey={SETTINGS.preorders}
          initial={flags.preorders}
          title="Preordering"
          description="Lets students order at the office kiosk and parents order from their own login. Orders are paid for at the counter when they're collected — nothing is deducted when one is placed."
        />
        <CutoffField initial={flags.preorderCutoff} />
      </div>

      {flags.preorders && (
        <div className="mt-4 rounded-2xl border border-slate-200 bg-slate-50 p-5 text-sm text-slate-600">
          <p className="font-medium text-slate-800">Setting up the office kiosk</p>
          <p className="mt-1">
            Sign the iPad in as an <b>operator</b> account and leave it on{" "}
            <code className="rounded bg-slate-200 px-1">/kiosk</code>. Students
            tap or scan their own card to order — the kiosk never signs them in
            and never shows anything beyond their name, balance and today&apos;s
            orders.
          </p>
        </div>
      )}

      {!mailOn && (
        <div className="mt-4 rounded-2xl border border-amber-200 bg-amber-50 p-5 text-sm text-amber-900">
          <p className="font-semibold">
            {mailWorks
              ? "Email is turned off"
              : "No email provider is connected"}
          </p>
          <p className="mt-1">
            Nobody can reset their own password. When a parent is locked out,
            open one of their children under <b>Students</b> and use{" "}
            <b>Reset password</b> in the Parents section — it shows a new
            password once, which you read back to them.
          </p>
          {!mailWorks && (
            <p className="mt-2">
              To enable it, set{" "}
              <code className="rounded bg-amber-100 px-1">RESEND_API_KEY</code>{" "}
              and <code className="rounded bg-amber-100 px-1">EMAIL_FROM</code>{" "}
              on the server, then turn the switch above on.
            </p>
          )}
        </div>
      )}

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
