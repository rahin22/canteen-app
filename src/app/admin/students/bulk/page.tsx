import Link from "next/link";
import { requireRole } from "@/lib/auth";
import { activeSchools, currentSchoolId } from "@/lib/schools";
import { BulkImportForm } from "./bulk-form";

export const dynamic = "force-dynamic";

export default async function BulkImportPage() {
  await requireRole("ADMIN");
  const [schools, selected] = await Promise.all([
    activeSchools(),
    currentSchoolId(),
  ]);

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
      {schools.length === 0 ? (
        <p className="rounded-2xl border border-amber-200 bg-amber-50 p-5 text-sm text-amber-900">
          Add a school in <b>Settings</b> before importing students.
        </p>
      ) : (
        <BulkImportForm schools={schools} defaultSchoolId={selected} />
      )}
    </div>
  );
}
