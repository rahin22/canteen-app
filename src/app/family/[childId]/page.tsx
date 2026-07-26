import Link from "next/link";
import { notFound } from "next/navigation";
import { requireRole } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { formatMoney } from "@/lib/money";
import { onlineTopupsAvailable } from "@/lib/settings";
import { CashOnlyNotice } from "@/components/cash-only-notice";
import { TopupForm } from "@/app/me/topup/topup-form";

export const dynamic = "force-dynamic";

export default async function ChildPage({
  params,
}: {
  params: Promise<{ childId: string }>;
}) {
  const session = await requireRole("PARENT");
  const { childId } = await params;

  const child = await prisma.user.findFirst({
    where: {
      id: childId,
      role: "STUDENT",
      parents: { some: { id: session.uid } },
    },
    include: {
      transactions: { orderBy: { createdAt: "desc" }, take: 20 },
    },
  });
  if (!child) notFound();

  const onlineTopups = await onlineTopupsAvailable();

  return (
    <main className="mx-auto w-full max-w-lg flex-1 p-4">
      <Link href="/family" className="text-sm text-slate-500 hover:underline">
        ← Family
      </Link>

      <div className="mt-3 rounded-3xl bg-gradient-to-br from-indigo-600 to-violet-600 p-6 text-white shadow-lg">
        <p className="text-sm text-indigo-200">
          {child.name}
          {child.className ? ` · ${child.className}` : ""}
        </p>
        <p className="mt-1 text-4xl font-bold">{formatMoney(child.balance)}</p>
      </div>

      <h2 className="mb-3 mt-6 font-semibold text-slate-900">Top up</h2>
      {onlineTopups ? <TopupForm studentId={child.id} /> : <CashOnlyNotice />}

      <h2 className="mb-3 mt-8 font-semibold text-slate-900">Recent activity</h2>
      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
        {child.transactions.length === 0 && (
          <p className="p-5 text-sm text-slate-500">No transactions yet.</p>
        )}
        {child.transactions.map((tx) => (
          <div
            key={tx.id}
            className="flex items-center justify-between border-b border-slate-100 px-4 py-3 last:border-0"
          >
            <div>
              <p className="text-sm font-medium text-slate-900">
                {describe(tx.type, tx.items, tx.note)}
              </p>
              <p className="text-xs text-slate-400">{tx.createdAt.toLocaleString()}</p>
            </div>
            <span
              className={`font-semibold ${
                tx.amount < 0 ? "text-slate-900" : "text-emerald-600"
              }`}
            >
              {tx.amount > 0 ? "+" : ""}
              {formatMoney(tx.amount)}
            </span>
          </div>
        ))}
      </div>
    </main>
  );
}

function describe(type: string, items: unknown, note: string | null): string {
  if (type === "PURCHASE") {
    if (Array.isArray(items)) {
      const parts = (items as { name?: string; qty?: number }[])
        .filter((l) => l.name)
        .map((l) => (l.qty && l.qty > 1 ? `${l.name} ×${l.qty}` : l.name));
      if (parts.length) return parts.join(", ");
    }
    return "Canteen purchase";
  }
  if (type === "TOPUP_CASH") return "Top-up (in person)";
  if (type === "TOPUP_STRIPE") return "Top-up (online)";
  return note ? `Adjustment — ${note}` : "Adjustment";
}
