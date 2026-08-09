import Link from "next/link";
import QRCode from "qrcode";
import { requireRole } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { LabelPrinter, type LabelData } from "./label-printer";

export const dynamic = "force-dynamic";

/**
 * Thermal labels for the Rongta R22, to be stuck onto the NFC cards.
 *
 * QR matrices are built here rather than in the browser so the label can draw
 * each module as a whole number of printer dots. Scaling a rasterised QR would
 * antialias the edges and then get thresholded back to 1-bit, fraying the
 * finder patterns; emitting the matrix avoids resampling entirely.
 *
 * The QR encodes the card token at "M" error correction, so /scan treats a
 * thermal label exactly like any other card.
 */
export default async function StudentLabelsPage({
  searchParams,
}: {
  searchParams: Promise<{ class?: string; id?: string }>;
}) {
  await requireRole("ADMIN");
  const { class: className, id } = await searchParams;

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

  const labels: LabelData[] = students.map((s) => {
    const token = s.cards[0].token;
    const { size, data } = QRCode.create(token, { errorCorrectionLevel: "M" }).modules;
    let bits = "";
    for (let i = 0; i < data.length; i++) bits += data[i] ? "1" : "0";
    return {
      id: s.id,
      name: s.name,
      username: s.username,
      token,
      qrSize: size,
      qrBits: bits,
    };
  });

  const school = process.env.NEXT_PUBLIC_SCHOOL_NAME || "School Canteen";

  return (
    <div>
      <Link href="/admin/students" className="text-sm text-slate-500 hover:underline">
        ← Students
      </Link>
      <h1 className="mt-2 text-2xl font-bold text-slate-900">Thermal labels</h1>
      <p className="mt-1 text-sm text-slate-500">
        Prints 50 × 30 mm labels on the Rongta R22 over Bluetooth, to stick onto
        the NFC cards. Needs Chrome or Edge.
      </p>

      {/* Filtering by student is only reachable from a student's own page, so
          the class chips would just be a way to lose that context. */}
      {!id && (
        <div className="mt-3 flex flex-wrap gap-2 text-sm">
          <Link
            href="/admin/students/labels"
            className={`rounded-lg border px-3 py-1.5 ${!className ? "border-indigo-500 bg-indigo-50 text-indigo-700" : "border-slate-300 bg-white text-slate-600"}`}
          >
            All classes
          </Link>
          {classes.map((c) => (
            <Link
              key={c.className}
              href={`/admin/students/labels?class=${encodeURIComponent(c.className!)}`}
              className={`rounded-lg border px-3 py-1.5 ${className === c.className ? "border-indigo-500 bg-indigo-50 text-indigo-700" : "border-slate-300 bg-white text-slate-600"}`}
            >
              {c.className}
            </Link>
          ))}
        </div>
      )}

      <LabelPrinter labels={labels} school={school} />
    </div>
  );
}
