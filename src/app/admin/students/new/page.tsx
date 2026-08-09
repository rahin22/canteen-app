import Link from "next/link";
import { requireRole } from "@/lib/auth";
import { activeSchools, currentSchoolId } from "@/lib/schools";
import { NewStudentForm } from "./new-student-form";

export const dynamic = "force-dynamic";

export default async function NewStudentPage() {
  await requireRole("ADMIN");
  const [schools, selected] = await Promise.all([
    activeSchools(),
    currentSchoolId(),
  ]);

  return (
    <div className="mx-auto max-w-md">
      <Link href="/admin/students" className="text-sm text-slate-500 hover:underline">
        ← Students
      </Link>
      <h1 className="mb-6 mt-2 text-2xl font-bold text-slate-900">Add student</h1>
      {schools.length === 0 ? (
        <p className="rounded-2xl border border-amber-200 bg-amber-50 p-5 text-sm text-amber-900">
          Add a school in <b>Settings</b> before creating students.
        </p>
      ) : (
        <NewStudentForm schools={schools} defaultSchoolId={selected} />
      )}
    </div>
  );
}
