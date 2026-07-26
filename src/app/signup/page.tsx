import Link from "next/link";
import { parentSignupOpen } from "@/lib/settings";
import { SignupForm } from "./signup-form";

export const dynamic = "force-dynamic";

export default async function SignupPage() {
  const open = await parentSignupOpen();
  const school = process.env.NEXT_PUBLIC_SCHOOL_NAME || "School Canteen";

  return (
    <main className="flex flex-1 items-center justify-center p-6">
      <div className="w-full max-w-sm py-8">
        <div className="mb-8 text-center">
          <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-2xl bg-indigo-600 text-3xl">
            🍎
          </div>
          <h1 className="text-2xl font-bold text-slate-900">{school}</h1>
          <p className="mt-1 text-sm text-slate-500">
            Create a parent account to manage your children&apos;s canteen cards
          </p>
        </div>

        {open ? (
          <SignupForm />
        ) : (
          <div className="rounded-2xl border border-slate-200 bg-white p-6 text-center shadow-sm">
            <p className="font-semibold text-slate-900">Registration is closed</p>
            <p className="mt-2 text-sm text-slate-600">
              Parent accounts aren&apos;t open for self-registration right now.
              Please contact the school office and they&apos;ll set one up for you.
            </p>
            <Link
              href="/login"
              className="mt-5 inline-block rounded-lg bg-indigo-600 px-5 py-2.5 font-semibold text-white hover:bg-indigo-700"
            >
              Sign in
            </Link>
          </div>
        )}
      </div>
    </main>
  );
}
