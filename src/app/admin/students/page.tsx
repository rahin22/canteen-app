import Link from "next/link";
import { requireRole } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { formatMoney } from "@/lib/money";
import { allSchools, currentSchoolName, schoolFilter } from "@/lib/schools";

export const dynamic = "force-dynamic";

export default async function StudentsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const session = await requireRole("ADMIN", "OPERATOR");
  // Operators come here to top up cards, not to run the roll — creating,
  // importing and label-printing stay with the office.
  const isAdmin = session.role === "ADMIN";
  const { q = "" } = await searchParams;
  const [scope, schoolName, schools] = await Promise.all([
    schoolFilter(),
    currentSchoolName(),
    allSchools(),
  ]);
  const showSchool = schools.length > 1 && !schoolName;

  const students = await prisma.user.findMany({
    where: {
      role: "STUDENT",
      ...scope,
      ...(q
        ? {
            OR: [
              { name: { contains: q, mode: "insensitive" } },
              { username: { contains: q, mode: "insensitive" } },
              { className: { contains: q, mode: "insensitive" } },
            ],
          }
        : {}),
    },
    orderBy: [{ className: "asc" }, { name: "asc" }],
    take: 200,
    include: { school: { select: { name: true } } },
  });

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Students</h1>
          <p className="text-sm text-slate-500">
            {schoolName ?? "All schools"}
          </p>
        </div>
        {isAdmin && (
        <div className="flex gap-2">
          <Link
            href="/admin/students/labels"
            className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
          >
            Print labels
          </Link>
          <Link
            href="/admin/students/bulk"
            className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
          >
            Bulk import
          </Link>
          <Link
            href="/admin/students/new"
            className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700"
          >
            + Add student
          </Link>
        </div>
        )}
      </div>

      <form className="mb-4">
        <input
          name="q"
          defaultValue={q}
          placeholder="Search name, ID or class…"
          className="w-full max-w-sm rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-indigo-500"
        />
      </form>

      <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-200 text-left text-xs uppercase tracking-wide text-slate-400">
              <th className="px-4 py-3">Name</th>
              {showSchool && <th className="px-4 py-3">School</th>}
              <th className="px-4 py-3">Class</th>
              <th className="px-4 py-3">Student ID</th>
              <th className="px-4 py-3 text-right">Balance</th>
              <th className="px-4 py-3"></th>
            </tr>
          </thead>
          <tbody>
            {students.length === 0 && (
              <tr>
                <td colSpan={showSchool ? 6 : 5} className="px-4 py-8 text-center text-slate-500">
                  {q ? "No students match your search." : "No students yet — add one to get started."}
                </td>
              </tr>
            )}
            {students.map((s) => (
              <tr key={s.id} className="border-b border-slate-100 last:border-0 hover:bg-slate-50">
                <td className="px-4 py-3 font-medium text-slate-900">
                  {s.name}
                  {!s.active && (
                    <span className="ml-2 rounded bg-red-100 px-1.5 py-0.5 text-xs text-red-700">
                      disabled
                    </span>
                  )}
                </td>
                {showSchool && (
                  <td className="px-4 py-3 text-slate-600">
                    {s.school?.name ?? "—"}
                  </td>
                )}
                <td className="px-4 py-3 text-slate-600">{s.className || "—"}</td>
                <td className="px-4 py-3 font-mono text-xs text-slate-600">{s.username}</td>
                <td
                  className={`px-4 py-3 text-right font-semibold ${
                    s.balance < 500 ? "text-amber-600" : "text-slate-900"
                  }`}
                >
                  {formatMoney(s.balance)}
                </td>
                <td className="px-4 py-3 text-right">
                  <Link
                    href={`/admin/students/${s.id}`}
                    className="font-medium text-indigo-600 hover:underline"
                  >
                    Manage
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
