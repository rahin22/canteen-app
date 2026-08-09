import { requireRole } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { allSchools } from "@/lib/schools";
import { StaffManager } from "./staff-manager";

export const dynamic = "force-dynamic";

export default async function StaffPage() {
  await requireRole("ADMIN");
  const [staff, schools] = await Promise.all([
    prisma.user.findMany({
      where: { role: { in: ["ADMIN", "OPERATOR"] } },
      orderBy: [{ role: "asc" }, { name: "asc" }],
      select: {
        id: true,
        name: true,
        username: true,
        role: true,
        active: true,
        schoolId: true,
        school: { select: { name: true } },
      },
    }),
    allSchools(),
  ]);

  return (
    <div className="mx-auto max-w-2xl">
      <h1 className="mb-2 text-2xl font-bold text-slate-900">Staff</h1>
      <p className="mb-6 text-sm text-slate-500">
        Each operator belongs to one school and only ever sees that school. They
        can run the till and kiosk, take cash top-ups, and manage orders and
        transactions — but not the menu, staff, settings, registrations, or
        student accounts and cards. Everyone changes their own password from the{" "}
        <a href="/password" className="text-indigo-600 hover:underline">
          Change password
        </a>{" "}
        page.
      </p>
      <StaffManager
        staff={staff.map((m) => ({
          id: m.id,
          name: m.name,
          username: m.username,
          role: m.role,
          active: m.active,
          schoolId: m.schoolId,
          schoolName: m.school?.name ?? null,
        }))}
        schools={schools}
      />
    </div>
  );
}
