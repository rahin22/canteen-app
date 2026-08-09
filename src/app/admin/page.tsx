import Link from "next/link";
import { requireRole } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { formatMoney } from "@/lib/money";
import { startOfSchoolDay } from "@/lib/day";
import { currentSchoolName, schoolFilter, studentSchoolFilter } from "@/lib/schools";

export const dynamic = "force-dynamic";

export default async function AdminDashboard() {
  await requireRole("ADMIN");

  // Shares its idea of "today" with the daily spend caps, so the dashboard and
  // the till can't disagree about when the day rolled over.
  const startOfDay = startOfSchoolDay();
  // Every figure below is scoped to the school selected in the header, so the
  // dashboard answers "how is this school doing" rather than mixing them.
  const [txScope, studentScope, schoolName] = await Promise.all([
    studentSchoolFilter(),
    schoolFilter(),
    currentSchoolName(),
  ]);

  const [salesToday, topupsToday, studentCount, lowBalance, outstanding, recent] =
    await Promise.all([
      prisma.transaction.aggregate({
        where: { type: "PURCHASE", createdAt: { gte: startOfDay }, ...txScope },
        _sum: { amount: true },
        _count: true,
      }),
      prisma.transaction.aggregate({
        where: {
          type: { in: ["TOPUP_CASH", "TOPUP_STRIPE"] },
          createdAt: { gte: startOfDay },
          ...txScope,
        },
        _sum: { amount: true },
        _count: true,
      }),
      prisma.user.count({ where: { role: "STUDENT", active: true, ...studentScope } }),
      prisma.user.count({
        where: { role: "STUDENT", active: true, balance: { lt: 500 }, ...studentScope },
      }),
      prisma.user.aggregate({
        where: { role: "STUDENT", active: true, ...studentScope },
        _sum: { balance: true },
      }),
      prisma.transaction.findMany({
        orderBy: { createdAt: "desc" },
        take: 10,
        where: txScope,
        include: { student: { select: { name: true } } },
      }),
    ]);

  const stats = [
    {
      label: "Sales today",
      value: formatMoney(Math.abs(salesToday._sum.amount ?? 0)),
      sub: `${salesToday._count} purchases`,
    },
    {
      label: "Top-ups today",
      value: formatMoney(topupsToday._sum.amount ?? 0),
      sub: `${topupsToday._count} top-ups`,
    },
    {
      label: "Active students",
      value: String(studentCount),
      sub: `${lowBalance} below ${formatMoney(500)}`,
    },
    {
      label: "Money on cards",
      value: formatMoney(outstanding._sum.balance ?? 0),
      sub: "total student balances",
    },
  ];

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Dashboard</h1>
          <p className="text-sm text-slate-500">{schoolName ?? "All schools"}</p>
        </div>
        <Link
          href="/scan"
          className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700"
        >
          Open till →
        </Link>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {stats.map((s) => (
          <div
            key={s.label}
            className="rounded-2xl border border-slate-200 bg-white p-4"
          >
            <p className="text-sm text-slate-500">{s.label}</p>
            <p className="mt-1 text-2xl font-bold text-slate-900">{s.value}</p>
            <p className="mt-0.5 text-xs text-slate-400">{s.sub}</p>
          </div>
        ))}
      </div>

      <h2 className="mb-3 mt-8 text-lg font-semibold text-slate-900">
        Recent activity
      </h2>
      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
        {recent.length === 0 && (
          <p className="p-6 text-sm text-slate-500">
            No transactions yet. Add students and menu items to get started.
          </p>
        )}
        {recent.map((tx) => (
          <div
            key={tx.id}
            className="flex items-center justify-between border-b border-slate-100 px-4 py-3 last:border-0"
          >
            <div>
              <p className="text-sm font-medium text-slate-900">{tx.student.name}</p>
              <p className="text-xs text-slate-400">
                {txLabel(tx.type)} · {tx.createdAt.toLocaleString()}
              </p>
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
    </div>
  );
}

function txLabel(type: string) {
  switch (type) {
    case "PURCHASE":
      return "Purchase";
    case "TOPUP_CASH":
      return "Cash top-up";
    case "TOPUP_STRIPE":
      return "Online top-up";
    case "ADJUSTMENT":
      return "Adjustment";
    case "REFUND":
      return "Refund";
    default:
      return type;
  }
}
