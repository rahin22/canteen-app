import Link from "next/link";
import { requireRole } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { formatMoney } from "@/lib/money";
import { currentSchoolName, studentSchoolFilter } from "@/lib/schools";
import type { Prisma } from "@/generated/prisma/client";

export const dynamic = "force-dynamic";

const PAGE_SIZE = 50;
const TYPES = ["PURCHASE", "TOPUP_CASH", "TOPUP_STRIPE", "ADJUSTMENT", "REFUND"] as const;

export default async function TransactionsPage({
  searchParams,
}: {
  searchParams: Promise<{ type?: string; page?: string; from?: string; to?: string }>;
}) {
  await requireRole("ADMIN", "OPERATOR");
  const params = await searchParams;
  const page = Math.max(1, Number(params.page) || 1);
  const type = TYPES.includes(params.type as (typeof TYPES)[number])
    ? (params.type as (typeof TYPES)[number])
    : undefined;

  const where: Prisma.TransactionWhereInput = {
    // Scoped to the school selected in the header.
    ...(await studentSchoolFilter()),
    ...(type ? { type } : {}),
    ...(params.from || params.to
      ? {
          createdAt: {
            ...(params.from ? { gte: new Date(params.from) } : {}),
            ...(params.to ? { lt: endOfDay(params.to) } : {}),
          },
        }
      : {}),
  };

  const [transactions, total, sums] = await Promise.all([
    prisma.transaction.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
      include: {
        student: { select: { name: true, id: true } },
        operator: { select: { name: true } },
      },
    }),
    prisma.transaction.count({ where }),
    prisma.transaction.aggregate({ where, _sum: { amount: true } }),
  ]);

  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const query = (overrides: Record<string, string | undefined>) => {
    const merged = { ...params, ...overrides };
    const usp = new URLSearchParams();
    for (const [k, v] of Object.entries(merged)) if (v) usp.set(k, v);
    return `?${usp.toString()}`;
  };

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Transactions</h1>
          <p className="text-sm text-slate-500">
            {(await currentSchoolName()) ?? "All schools"}
          </p>
        </div>
        <a
          href={`/admin/transactions/export${query({ page: undefined })}`}
          className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
        >
          Export CSV
        </a>
      </div>

      <form className="mb-4 flex flex-wrap items-end gap-2">
        <div>
          <label className="mb-1 block text-xs font-medium text-slate-500">Type</label>
          <select
            name="type"
            defaultValue={type || ""}
            className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"
          >
            <option value="">All</option>
            <option value="PURCHASE">Purchases</option>
            <option value="TOPUP_CASH">Cash top-ups</option>
            <option value="TOPUP_STRIPE">Online top-ups</option>
            <option value="ADJUSTMENT">Adjustments</option>
            <option value="REFUND">Refunds</option>
          </select>
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-slate-500">From</label>
          <input
            type="date"
            name="from"
            defaultValue={params.from || ""}
            className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"
          />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-slate-500">To</label>
          <input
            type="date"
            name="to"
            defaultValue={params.to || ""}
            className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"
          />
        </div>
        <button className="rounded-lg bg-slate-800 px-4 py-2 text-sm font-semibold text-white">
          Filter
        </button>
        <span className="ml-auto text-sm text-slate-500">
          {total} rows · net {formatMoney(sums._sum.amount ?? 0)}
        </span>
      </form>

      <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-200 text-left text-xs uppercase tracking-wide text-slate-400">
              <th className="px-4 py-3">When</th>
              <th className="px-4 py-3">Student</th>
              <th className="px-4 py-3">Type</th>
              <th className="px-4 py-3">Detail</th>
              <th className="px-4 py-3">By</th>
              <th className="px-4 py-3 text-right">Amount</th>
            </tr>
          </thead>
          <tbody>
            {transactions.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-slate-500">
                  No transactions found.
                </td>
              </tr>
            )}
            {transactions.map((tx) => (
              <tr key={tx.id} className="border-b border-slate-100 last:border-0">
                <td className="whitespace-nowrap px-4 py-2.5 text-slate-500">
                  {tx.createdAt.toLocaleString()}
                </td>
                <td className="px-4 py-2.5">
                  <Link
                    href={`/admin/students/${tx.student.id}`}
                    className="font-medium text-slate-900 hover:text-indigo-600"
                  >
                    {tx.student.name}
                  </Link>
                </td>
                <td className="px-4 py-2.5 text-slate-600">{typeLabel(tx.type)}</td>
                <td className="max-w-64 truncate px-4 py-2.5 text-slate-500">
                  {detail(tx.items, tx.note)}
                </td>
                <td className="px-4 py-2.5 text-slate-500">{tx.operator?.name || "—"}</td>
                <td
                  className={`whitespace-nowrap px-4 py-2.5 text-right font-semibold ${
                    tx.amount < 0 ? "text-slate-900" : "text-emerald-600"
                  }`}
                >
                  {tx.amount > 0 ? "+" : ""}
                  {formatMoney(tx.amount)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {pages > 1 && (
        <div className="mt-4 flex items-center justify-center gap-3 text-sm">
          {page > 1 && (
            <Link href={query({ page: String(page - 1) })} className="text-indigo-600 hover:underline">
              ← Newer
            </Link>
          )}
          <span className="text-slate-500">
            Page {page} of {pages}
          </span>
          {page < pages && (
            <Link href={query({ page: String(page + 1) })} className="text-indigo-600 hover:underline">
              Older →
            </Link>
          )}
        </div>
      )}
    </div>
  );
}

function endOfDay(date: string) {
  const d = new Date(date);
  d.setDate(d.getDate() + 1);
  return d;
}

function typeLabel(type: string) {
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

function detail(items: unknown, note: string | null): string {
  const parts: string[] = [];
  if (Array.isArray(items)) {
    for (const raw of items) {
      const line = raw as { name?: string; qty?: number };
      if (line.name) parts.push(line.qty && line.qty > 1 ? `${line.name} ×${line.qty}` : line.name);
    }
  }
  if (note) parts.push(note);
  return parts.join(", ") || "—";
}
