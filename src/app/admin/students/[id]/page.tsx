import Link from "next/link";
import { notFound } from "next/navigation";
import { requireRole } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { formatMoney } from "@/lib/money";
import {
  EditForm,
  TopupForm,
  AdjustForm,
  CredentialActions,
  CardActions,
  CardStatusToggle,
  NfcAttach,
  ParentsManager,
} from "./manage-forms";

export const dynamic = "force-dynamic";

export default async function StudentDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ pw?: string }>;
}) {
  await requireRole("ADMIN");
  const { id } = await params;
  const { pw } = await searchParams;

  const student = await prisma.user.findUnique({
    where: { id, role: "STUDENT" },
    include: {
      cards: { orderBy: { createdAt: "desc" } },
      parents: { select: { id: true, name: true, username: true } },
      transactions: {
        orderBy: { createdAt: "desc" },
        take: 15,
        include: { operator: { select: { name: true } } },
      },
    },
  });
  if (!student) notFound();

  return (
    <div>
      <Link href="/admin/students" className="text-sm text-slate-500 hover:underline">
        ← Students
      </Link>

      {pw && (
        <div className="mt-3 rounded-xl border border-emerald-200 bg-emerald-50 p-4">
          <p className="font-semibold text-emerald-900">Student created ✓</p>
          <p className="mt-1 text-sm text-emerald-800">
            Login: <span className="font-mono font-bold">{student.username}</span>{" "}
            · Password: <span className="font-mono font-bold">{pw}</span>
          </p>
          <p className="mt-1 text-xs text-emerald-700">
            Write this down now — it won&apos;t be shown again. Print their card from{" "}
            <Link href={`/admin/students/print?id=${student.id}`} className="underline">
              Print cards
            </Link>
            .
          </p>
        </div>
      )}

      <div className="mt-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">
            {student.name}
            {!student.active && (
              <span className="ml-2 align-middle rounded bg-red-100 px-2 py-0.5 text-xs font-medium text-red-700">
                disabled
              </span>
            )}
          </h1>
          <p className="text-sm text-slate-500">
            {student.className || "No class"} · <span className="font-mono">{student.username}</span>
          </p>
        </div>
        <div className="rounded-xl bg-slate-900 px-5 py-3 text-right text-white">
          <p className="text-xs uppercase tracking-wide text-slate-400">Balance</p>
          <p className="text-2xl font-bold">{formatMoney(student.balance)}</p>
        </div>
      </div>

      <div className="mt-6 grid gap-4 lg:grid-cols-2">
        <section className="rounded-2xl border border-slate-200 bg-white p-5">
          <h2 className="mb-3 font-semibold text-slate-900">Cash top-up</h2>
          <TopupForm studentId={student.id} />
        </section>

        <section className="rounded-2xl border border-slate-200 bg-white p-5">
          <h2 className="mb-3 font-semibold text-slate-900">Balance adjustment</h2>
          <AdjustForm studentId={student.id} />
        </section>

        <section className="rounded-2xl border border-slate-200 bg-white p-5">
          <h2 className="mb-3 font-semibold text-slate-900">Details</h2>
          <EditForm
            id={student.id}
            name={student.name}
            className={student.className || ""}
          />
          <div className="mt-4 border-t border-slate-100 pt-4">
            <CredentialActions id={student.id} active={student.active} />
          </div>
        </section>

        <section className="rounded-2xl border border-slate-200 bg-white p-5">
          <h2 className="mb-3 font-semibold text-slate-900">Cards</h2>
          <div className="space-y-2">
            {student.cards.map((card) => (
              <div
                key={card.id}
                className="flex items-center justify-between rounded-lg border border-slate-200 px-3 py-2"
              >
                <div>
                  <p className="font-mono text-xs text-slate-600">
                    {card.type === "NFC" ? "📶 " : ""}
                    {card.token.slice(0, 12)}…
                  </p>
                  <p className="text-xs text-slate-400">
                    {card.type} · issued {card.createdAt.toLocaleDateString()}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <span
                    className={`rounded px-2 py-0.5 text-xs font-medium ${
                      card.status === "ACTIVE"
                        ? "bg-emerald-100 text-emerald-700"
                        : card.status === "BLOCKED"
                        ? "bg-red-100 text-red-700"
                        : "bg-slate-100 text-slate-500"
                    }`}
                  >
                    {card.status.toLowerCase()}
                  </span>
                  <CardStatusToggle card={{ id: card.id, status: card.status }} />
                </div>
              </div>
            ))}
          </div>
          <div className="mt-3">
            <CardActions studentId={student.id} />
          </div>
          <NfcAttach studentId={student.id} />
          <p className="mt-3 text-xs text-slate-400">
            <Link
              href={`/admin/students/print?id=${student.id}`}
              className="text-indigo-600 hover:underline"
            >
              Print this student&apos;s card →
            </Link>
          </p>
        </section>

        <section className="rounded-2xl border border-slate-200 bg-white p-5 lg:col-span-2">
          <h2 className="mb-3 font-semibold text-slate-900">Parents</h2>
          <ParentsManager
            studentId={student.id}
            parents={student.parents}
          />
        </section>
      </div>

      <h2 className="mb-3 mt-8 text-lg font-semibold text-slate-900">
        Recent transactions
      </h2>
      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
        {student.transactions.length === 0 && (
          <p className="p-5 text-sm text-slate-500">No transactions yet.</p>
        )}
        {student.transactions.map((tx) => (
          <div
            key={tx.id}
            className="flex items-center justify-between border-b border-slate-100 px-4 py-3 last:border-0"
          >
            <div>
              <p className="text-sm font-medium text-slate-900">
                {tx.type === "PURCHASE"
                  ? describeItems(tx.items)
                  : tx.type === "TOPUP_CASH"
                  ? "Cash top-up"
                  : tx.type === "TOPUP_STRIPE"
                  ? "Online top-up"
                  : `Adjustment${tx.note ? ` — ${tx.note}` : ""}`}
              </p>
              <p className="text-xs text-slate-400">
                {tx.createdAt.toLocaleString()}
                {tx.operator ? ` · by ${tx.operator.name}` : ""}
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

function describeItems(items: unknown): string {
  if (Array.isArray(items)) {
    const parts = items
      .map((i) => {
        const line = i as { name?: string; qty?: number };
        if (!line.name) return null;
        return line.qty && line.qty > 1 ? `${line.name} ×${line.qty}` : line.name;
      })
      .filter(Boolean);
    if (parts.length) return parts.join(", ");
  }
  return "Purchase";
}
