import Link from "next/link";
import { redirect } from "next/navigation";
import { requireRole } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { logout } from "@/app/login/actions";
import { VerifyForm } from "./verify-form";

export const dynamic = "force-dynamic";

export default async function VerifyEmailPage() {
  const session = await requireRole("PARENT");
  const user = await prisma.user.findUniqueOrThrow({
    where: { id: session.uid },
    select: { email: true, emailVerifiedAt: true },
  });
  if (user.emailVerifiedAt) redirect("/family");

  return (
    <main className="flex flex-1 items-center justify-center p-6">
      <div className="w-full max-w-sm py-8">
        <div className="mb-8 text-center">
          <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-2xl bg-indigo-600 text-3xl">
            ✉️
          </div>
          <h1 className="text-2xl font-bold text-slate-900">Confirm your email</h1>
          <p className="mt-1 text-sm text-slate-500">
            One quick step before you can register your children.
          </p>
        </div>

        <VerifyForm email={user.email ?? ""} />

        <div className="mt-6 flex items-center justify-between text-sm">
          <Link href="/family" className="text-slate-500 hover:text-slate-800">
            Skip for now
          </Link>
          <form action={logout}>
            <button className="text-slate-500 hover:text-slate-800">Sign out</button>
          </form>
        </div>
      </div>
    </main>
  );
}
