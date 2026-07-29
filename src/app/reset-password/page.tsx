import { redirect } from "next/navigation";
import { emailAvailable } from "@/lib/settings";
import { ResetForm } from "./reset-form";

export const dynamic = "force-dynamic";

export default async function ResetPasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ email?: string }>;
}) {
  const { email } = await searchParams;
  // No codes go out when email is off, so there is nothing to enter here —
  // send them to the page that explains how to get a new password instead.
  if (!(await emailAvailable())) redirect("/forgot-password");

  return (
    <main className="flex flex-1 items-center justify-center p-6">
      <div className="w-full max-w-sm py-8">
        <div className="mb-8 text-center">
          <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-2xl bg-indigo-600 text-3xl">
            🔑
          </div>
          <h1 className="text-2xl font-bold text-slate-900">Set a new password</h1>
          <p className="mt-1 text-sm text-slate-500">
            Enter the code we emailed you, then choose a new password.
          </p>
        </div>
        <ResetForm defaultEmail={email} />
      </div>
    </main>
  );
}
