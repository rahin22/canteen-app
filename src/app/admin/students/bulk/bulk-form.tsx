"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { bulkImport, type BulkResult } from "../actions";
import type { SchoolOption } from "@/lib/school-constants";

export function BulkImportForm({
  schools,
  defaultSchoolId,
}: {
  schools: SchoolOption[];
  defaultSchoolId: string | null;
}) {
  const [text, setText] = useState("");
  const [school, setSchool] = useState(
    defaultSchoolId ?? (schools.length === 1 ? schools[0].id : "")
  );
  const [result, setResult] = useState<BulkResult | null>(null);
  const [pending, startTransition] = useTransition();

  const downloadCsv = () => {
    if (!result) return;
    const rows = [
      "Name,Class,Student ID,Password",
      ...result.created.map(
        (r) => `"${r.name.replace(/"/g, '""')}","${r.className}",${r.username},${r.password}`
      ),
    ];
    const blob = new Blob([rows.join("\n")], { type: "text/csv" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "student-logins.csv";
    a.click();
    URL.revokeObjectURL(a.href);
  };

  return (
    <div className="mx-auto max-w-2xl">
      {!result && (
        <>
          <label className="mb-1 block text-sm font-medium text-slate-700">
            School for every student in this import
          </label>
          <select
            value={school}
            onChange={(e) => setSchool(e.target.value)}
            className="mb-3 w-full max-w-sm rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-indigo-500"
          >
            <option value="" disabled>
              Choose a school…
            </option>
            {schools.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={12}
            placeholder={"Aisha Rahman, Year 7A\nBen Cooper, Year 7A, s2026042\nChloe Nguyen, Year 8C"}
            className="w-full rounded-xl border border-slate-300 bg-white p-3 font-mono text-sm outline-none focus:border-indigo-500"
          />
          <button
            disabled={pending || !text.trim() || !school}
            onClick={() =>
              startTransition(async () => setResult(await bulkImport(text, school)))
            }
            className="mt-3 rounded-lg bg-indigo-600 px-5 py-2.5 font-semibold text-white hover:bg-indigo-700 disabled:opacity-50"
          >
            {pending ? "Importing…" : "Import students"}
          </button>
        </>
      )}

      {result && (
        <div>
          <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4">
            <p className="font-semibold text-emerald-900">
              {result.created.length} student{result.created.length === 1 ? "" : "s"} created
            </p>
            <p className="mt-1 text-sm text-emerald-800">
              Download the login sheet now — passwords are not shown again.
            </p>
            <div className="mt-3 flex gap-2">
              <button
                onClick={downloadCsv}
                className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700"
              >
                Download logins CSV
              </button>
              <Link
                href="/admin/students/labels"
                className="rounded-lg border border-emerald-300 bg-white px-4 py-2 text-sm font-semibold text-emerald-800"
              >
                Print labels
              </Link>
            </div>
          </div>

          {result.errors.length > 0 && (
            <div className="mt-4 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
              <p className="mb-1 font-semibold">Skipped rows</p>
              <ul className="list-inside list-disc">
                {result.errors.map((e, i) => (
                  <li key={i}>{e}</li>
                ))}
              </ul>
            </div>
          )}

          <table className="mt-4 w-full rounded-xl border border-slate-200 bg-white text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-left text-xs uppercase text-slate-400">
                <th className="px-3 py-2">Name</th>
                <th className="px-3 py-2">Class</th>
                <th className="px-3 py-2">Student ID</th>
                <th className="px-3 py-2">Password</th>
              </tr>
            </thead>
            <tbody>
              {result.created.map((r) => (
                <tr key={r.username} className="border-b border-slate-100 last:border-0">
                  <td className="px-3 py-2">{r.name}</td>
                  <td className="px-3 py-2">{r.className || "—"}</td>
                  <td className="px-3 py-2 font-mono text-xs">{r.username}</td>
                  <td className="px-3 py-2 font-mono text-xs">{r.password}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
