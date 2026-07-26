import Link from "next/link";
import { requireRole } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { formatMoney } from "@/lib/money";
import { onlineTopupsAvailable } from "@/lib/settings";
import { CashOnlyNotice } from "@/components/cash-only-notice";
import { TopupForm } from "./topup-form";

export const dynamic = "force-dynamic";

export default async function TopupPage() {
  const session = await requireRole("STUDENT");
  const user = await prisma.user.findUniqueOrThrow({
    where: { id: session.uid },
    select: { balance: true },
  });
  const onlineTopups = await onlineTopupsAvailable();

  return (
    <main className="mx-auto w-full max-w-lg flex-1 p-4">
      <Link href="/me" className="text-sm text-slate-500 hover:underline">
        ← Back
      </Link>
      <h1 className="mb-1 mt-2 text-2xl font-bold text-slate-900">Top up</h1>
      <p className="mb-6 text-sm text-slate-500">
        Current balance: <b>{formatMoney(user.balance)}</b>
      </p>

      {onlineTopups ? <TopupForm /> : <CashOnlyNotice />}
    </main>
  );
}
