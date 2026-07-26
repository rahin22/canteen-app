import Link from "next/link";
import QRCode from "qrcode";
import { requireRole } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { PrintButton } from "./print-button";

export const dynamic = "force-dynamic";

export default async function PrintCardsPage({
  searchParams,
}: {
  searchParams: Promise<{ id?: string; class?: string }>;
}) {
  await requireRole("ADMIN");
  const { id, class: className } = await searchParams;

  const students = await prisma.user.findMany({
    where: {
      role: "STUDENT",
      active: true,
      ...(id ? { id } : {}),
      ...(className ? { className } : {}),
      cards: { some: { status: "ACTIVE", type: "QR" } },
    },
    orderBy: [{ className: "asc" }, { name: "asc" }],
    include: {
      cards: {
        where: { status: "ACTIVE", type: "QR" },
        orderBy: { createdAt: "desc" },
        take: 1,
      },
    },
  });

  const classes = await prisma.user.findMany({
    where: { role: "STUDENT", className: { not: null } },
    select: { className: true },
    distinct: ["className"],
    orderBy: { className: "asc" },
  });

  const cards = await Promise.all(
    students.map(async (s) => ({
      student: s,
      qr: await QRCode.toDataURL(s.cards[0].token, {
        margin: 0,
        width: 240,
        errorCorrectionLevel: "M",
      }),
    }))
  );

  const school = process.env.NEXT_PUBLIC_SCHOOL_NAME || "School Canteen";

  return (
    <div>
      <div className="no-print mb-6">
        <Link href="/admin/students" className="text-sm text-slate-500 hover:underline">
          ← Students
        </Link>
        <div className="mt-2 flex flex-wrap items-center justify-between gap-3">
          <h1 className="text-2xl font-bold text-slate-900">Print cards</h1>
          <PrintButton />
        </div>
        <div className="mt-3 flex flex-wrap gap-2 text-sm">
          <Link
            href="/admin/students/print"
            className={`rounded-lg border px-3 py-1.5 ${!className ? "border-indigo-500 bg-indigo-50 text-indigo-700" : "border-slate-300 bg-white text-slate-600"}`}
          >
            All classes
          </Link>
          {classes.map((c) => (
            <Link
              key={c.className}
              href={`/admin/students/print?class=${encodeURIComponent(c.className!)}`}
              className={`rounded-lg border px-3 py-1.5 ${className === c.className ? "border-indigo-500 bg-indigo-50 text-indigo-700" : "border-slate-300 bg-white text-slate-600"}`}
            >
              {c.className}
            </Link>
          ))}
        </div>
        <p className="mt-3 text-sm text-slate-500">
          {cards.length} card{cards.length === 1 ? "" : "s"} — standard credit-card size
          (85.6 × 54 mm). Print on card stock or laminate.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-4 print:gap-[4mm]">
        {cards.map(({ student, qr }) => (
          <div
            key={student.id}
            className="flex items-center gap-4 rounded-xl border border-slate-300 bg-white p-4"
            style={{ width: "85.6mm", height: "54mm", breakInside: "avoid" }}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={qr} alt="" style={{ width: "38mm", height: "38mm" }} />
            <div className="min-w-0">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-indigo-600">
                {school}
              </p>
              <p className="mt-1 truncate text-base font-bold leading-tight text-slate-900">
                {student.name}
              </p>
              <p className="text-sm text-slate-500">{student.className || ""}</p>
              <p className="mt-2 font-mono text-[10px] text-slate-400">
                {student.username}
              </p>
            </div>
          </div>
        ))}
      </div>
      {cards.length === 0 && (
        <p className="text-sm text-slate-500">No active cards to print.</p>
      )}
    </div>
  );
}
