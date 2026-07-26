import Link from "next/link";
import { requireRole } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { formatMoney } from "@/lib/money";
import { TopupForm } from "./topup-form";

export const dynamic = "force-dynamic";

export default async function TopupPage() {
  const session = await requireRole("STUDENT");
  const user = await prisma.user.findUniqueOrThrow({
    where: { id: session.uid },
    select: { balance: true },
  });
  const stripeConfigured = Boolean(process.env.STRIPE_SECRET_KEY);

  return (
    <main className="mx-auto w-full max-w-lg flex-1 p-4">
      <Link href="/me" className="text-sm text-slate-500 hover:underline">
        ← Back
      </Link>
      <h1 className="mb-1 mt-2 text-2xl font-bold text-slate-900">Top up</h1>
      <p className="mb-6 text-sm text-slate-500">
        Current balance: <b>{formatMoney(user.balance)}</b>
      </p>

      {stripeConfigured ? (
        <TopupForm />
      ) : (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 p-5 text-amber-900">
          <p className="font-semibold">Online top-ups aren&apos;t available yet</p>
          <p className="mt-1 text-sm">
            For now, top up with cash at the canteen or school office — it&apos;s
            credited to your card straight away.
          </p>
        </div>
      )}
    </main>
  );
}
