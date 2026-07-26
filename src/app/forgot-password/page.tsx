import { ForgotForm } from "./forgot-form";

export const dynamic = "force-dynamic";

export default function ForgotPasswordPage() {
  return (
    <main className="flex flex-1 items-center justify-center p-6">
      <div className="w-full max-w-sm py-8">
        <div className="mb-8 text-center">
          <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-2xl bg-indigo-600 text-3xl">
            🔑
          </div>
          <h1 className="text-2xl font-bold text-slate-900">Forgot password</h1>
          <p className="mt-1 text-sm text-slate-500">
            We&apos;ll email you a code to set a new one.
          </p>
        </div>
        <ForgotForm />
      </div>
    </main>
  );
}
