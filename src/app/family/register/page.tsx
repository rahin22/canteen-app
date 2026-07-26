import Link from "next/link";
import { requireRole } from "@/lib/auth";
import { parentSignupOpen } from "@/lib/settings";
import { RegisterForm } from "./register-form";

export const dynamic = "force-dynamic";

export default async function RegisterChildPage({
  searchParams,
}: {
  searchParams: Promise<{ welcome?: string }>;
}) {
  await requireRole("PARENT");
  const { welcome } = await searchParams;
  const open = await parentSignupOpen();

  return (
    <main className="mx-auto w-full max-w-lg flex-1 p-4">
      <Link href="/family" className="text-sm text-slate-500 hover:underline">
        ← Family
      </Link>

      <h1 className="mb-1 mt-2 text-2xl font-bold text-slate-900">
        Register a child
      </h1>
      <p className="mb-6 text-sm text-slate-500">
        The school office checks every request before the canteen card is
        activated.
      </p>

      {welcome && (
        <div className="mb-5 rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-900">
          <p className="font-semibold">Account created 🎉</p>
          <p className="mt-1">
            Now add your first child below. You can add more later.
          </p>
        </div>
      )}

      {open ? (
        <RegisterForm />
      ) : (
        <div className="rounded-2xl border border-slate-200 bg-white p-6 text-sm text-slate-600">
          Registration is closed at the moment. Please contact the school office
          to have your children added.
        </div>
      )}

      <div className="mt-6 rounded-2xl border border-slate-200 bg-slate-50 p-5 text-xs leading-relaxed text-slate-600">
        <p className="mb-1 font-semibold text-slate-800">
          How the photo is used
        </p>
        <p>
          The photo is only shown to canteen staff when your child&apos;s card is
          scanned, so they can check the card is being used by the right
          student. It is stored encrypted, is never public, and you can remove
          it at any time from your child&apos;s page.
        </p>
      </div>
    </main>
  );
}
