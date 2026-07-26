import { requireRole } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { StaffManager } from "./staff-manager";

export const dynamic = "force-dynamic";

export default async function StaffPage() {
  await requireRole("ADMIN");
  const staff = await prisma.user.findMany({
    where: { role: { in: ["ADMIN", "OPERATOR"] } },
    orderBy: [{ role: "asc" }, { name: "asc" }],
    select: { id: true, name: true, username: true, role: true, active: true },
  });

  return (
    <div className="mx-auto max-w-2xl">
      <h1 className="mb-2 text-2xl font-bold text-slate-900">Staff</h1>
      <p className="mb-6 text-sm text-slate-500">
        Operators can only use the till — they can&apos;t see reports or manage
        students. Everyone changes their own password from the{" "}
        <a href="/password" className="text-indigo-600 hover:underline">
          Change password
        </a>{" "}
        page.
      </p>
      <StaffManager staff={staff} />
    </div>
  );
}
