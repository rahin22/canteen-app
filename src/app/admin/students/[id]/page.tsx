import Link from "next/link";
import { notFound } from "next/navigation";
import QRCode from "qrcode";
import { requireRole } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { formatMoney } from "@/lib/money";
import { getDailySpend } from "@/lib/ledger";
import { allSchools, canActOnStudent } from "@/lib/schools";
import { PrintLabelButton } from "./print-label-button";
import type { LabelData } from "@/lib/label-design";
import {
  EditForm,
  TopupForm,
  AdjustForm,
  CredentialActions,
  CardActions,
  CardStatusToggle,
  NfcAttach,
  ParentsManager,
  PhotoManager,
} from "./manage-forms";

export const dynamic = "force-dynamic";

export default async function StudentDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ pw?: string }>;
}) {
  const session = await requireRole("ADMIN", "OPERATOR");
  const isAdmin = session.role === "ADMIN";
  const { id } = await params;
  const { pw } = await searchParams;

  // Operators may open their own school's students only. Treated as not found
  // rather than forbidden — there's no reason to confirm the id exists.
  if (!(await canActOnStudent(id))) notFound();

  const student = await prisma.user.findUnique({
    where: { id, role: "STUDENT" },
    include: {
      school: { select: { name: true } },
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

  const [daily, schools] = await Promise.all([
    getDailySpend(student.id),
    allSchools(),
  ]);

  // QR matrix is built here so the label can draw each module as a whole number
  // of printer dots — scaling a rasterised QR frays the finder patterns.
  const qrCard = student.cards.find((c) => c.status === "ACTIVE" && c.type === "QR");
  let label: LabelData | null = null;
  if (qrCard) {
    const { size, data } = QRCode.create(qrCard.token, {
      errorCorrectionLevel: "M",
    }).modules;
    let bits = "";
    for (let i = 0; i < data.length; i++) bits += data[i] ? "1" : "0";
    label = {
      id: student.id,
      name: student.name,
      username: student.username,
      token: qrCard.token,
      qrSize: size,
      qrBits: bits,
    };
  }
  const school = process.env.NEXT_PUBLIC_SCHOOL_NAME || "School Canteen";

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
            Write this down now — it won&apos;t be shown again. Print their label from{" "}
            <Link href={`/admin/students/labels?id=${student.id}`} className="underline">
              Print labels
            </Link>
            .
          </p>
        </div>
      )}

      <div className="mt-4 flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-center gap-4">
          <div className="flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-slate-100">
            {student.photoId ? (
              // Private, no-store response — must bypass the image optimiser.
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={`/api/photo/student/${student.id}`}
                alt={`Photo of ${student.name}`}
                className="h-full w-full object-cover"
              />
            ) : (
              <span className="text-2xl font-bold text-slate-400">
                {student.name.charAt(0).toUpperCase()}
              </span>
            )}
          </div>
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
          <p className="text-sm font-medium text-indigo-600">
            {student.school?.name ?? "No school assigned"}
          </p>
          </div>
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

        {isAdmin && (
          <section className="rounded-2xl border border-slate-200 bg-white p-5">
            <h2 className="mb-3 font-semibold text-slate-900">Balance adjustment</h2>
            <AdjustForm studentId={student.id} />
          </section>
        )}

        <section className="rounded-2xl border border-slate-200 bg-white p-5">
          <h2 className="mb-3 font-semibold text-slate-900">Details</h2>
          {isAdmin && (
            <EditForm
              id={student.id}
              name={student.name}
              className={student.className || ""}
              schoolId={student.schoolId}
              schools={schools}
            />
          )}
          <div className={isAdmin ? "mt-4 border-t border-slate-100 pt-4" : ""}>
            <p className="text-xs font-medium uppercase tracking-wide text-slate-400">
              Daily spending limit
            </p>
            {daily.limit === null ? (
              <p className="mt-1 text-sm text-slate-500">
                No limit set. Only a linked parent can set one, from their own
                login.
              </p>
            ) : (
              <p className="mt-1 text-sm text-slate-700">
                <span className="font-semibold">{formatMoney(daily.limit)}</span>{" "}
                per day, set by a parent · {formatMoney(daily.spent)} spent today
                {daily.remaining === 0
                  ? " — limit reached, further purchases will be declined"
                  : ` · ${formatMoney(daily.remaining!)} left`}
              </p>
            )}
          </div>
          {isAdmin && (
            <div className="mt-4 border-t border-slate-100 pt-4">
              <CredentialActions id={student.id} active={student.active} />
            </div>
          )}
        </section>

        {isAdmin && (
          <>
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
            <PrintLabelButton label={label} school={school} />
          </section>

          <section className="rounded-2xl border border-slate-200 bg-white p-5">
            <h2 className="mb-3 font-semibold text-slate-900">Identification photo</h2>
            <PhotoManager studentId={student.id} hasPhoto={Boolean(student.photoId)} />
          </section>

          <section className="rounded-2xl border border-slate-200 bg-white p-5">
            <h2 className="mb-3 font-semibold text-slate-900">Parents</h2>
            <ParentsManager
              studentId={student.id}
              parents={student.parents}
            />
          </section>
          </>
        )}
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
                  : tx.type === "REFUND"
                  ? `Refund${tx.note ? ` — ${tx.note}` : ""}`
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
