"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { bulkImport, type BulkResult } from "../actions";

export default function BulkImportPage() {
  const [text, setText] = useState("");
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
      <Link href="/admin/students" className="text-sm text-slate-500 hover:underline">
        ← Students
      </Link>
      <h1 className="mb-2 mt-2 text-2xl font-bold text-slate-900">Bulk import</h1>
      <p className="mb-4 text-sm text-slate-500">
        One student per line: <span className="font-mono">Name, Class</span> or{" "}
        <span className="font-mono">Name, Class, student-id</span>. Passwords and QR
        cards are generated automatically.
      </p>

      {!result && (
        <>
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={12}
            placeholder={"Aisha Rahman, Year 7A\nBen Cooper, Year 7A, s2026042\nChloe Nguyen, Year 8C"}
            className="w-full rounded-xl border border-slate-300 bg-white p-3 font-mono text-sm outline-none focus:border-indigo-500"
          />
          <button
            disabled={pending || !text.trim()}
            onClick={() =>
              startTransition(async () => setResult(await bulkImport(text)))
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
                href="/admin/students/print"
                className="rounded-lg border border-emerald-300 bg-white px-4 py-2 text-sm font-semibold text-emerald-800"
              >
                Print cards
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
