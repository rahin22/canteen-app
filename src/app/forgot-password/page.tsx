import Link from "next/link";
import { emailAvailable } from "@/lib/settings";
import { ForgotForm } from "./forgot-form";

export const dynamic = "force-dynamic";

export default async function ForgotPasswordPage() {
  const canReset = await emailAvailable();

  return (
    <main className="flex flex-1 items-center justify-center p-6">
      <div className="w-full max-w-sm py-8">
        <div className="mb-8 text-center">
          <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-2xl bg-indigo-600 text-3xl">
            🔑
          </div>
          <h1 className="text-2xl font-bold text-slate-900">Forgot password</h1>
          <p className="mt-1 text-sm text-slate-500">
            {canReset
              ? "We'll email you a code to set a new one."
              : "Passwords are reset by the school office."}
          </p>
        </div>

        {canReset ? (
          <ForgotForm />
        ) : (
          <div className="rounded-2xl border border-slate-200 bg-white p-6 text-sm leading-relaxed text-slate-600 shadow-sm">
            <p>
              This canteen system doesn&apos;t send email, so there&apos;s no
              self-service reset. Contact the school office and they&apos;ll
              issue you a new password.
            </p>
            <p className="mt-3">
              If you can still sign in, you can change your password yourself
              from the <b>Password</b> link once you&apos;re in.
            </p>
            <Link
              href="/login"
              className="mt-4 block text-center font-medium text-indigo-600 hover:underline"
            >
              Back to sign in
            </Link>
          </div>
        )}
      </div>
    </main>
  );
}
