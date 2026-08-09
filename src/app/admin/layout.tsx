import { requireRole } from "@/lib/auth";
import { logout } from "@/app/login/actions";
import Link from "next/link";

import { prisma } from "@/lib/db";
import { startOfSchoolDay } from "@/lib/day";
import {
  allSchools,
  currentSchoolId,
  currentSchoolName,
  studentSchoolFilter,
} from "@/lib/schools";
import { SchoolSwitcher } from "./school-switcher";

/**
 * `operator: true` marks the pages a canteen operator may use. Everything else
 * — the menu, staff, settings, registrations — stays admin-only. This list is
 * for the navigation; each page enforces its own access.
 */
const NAV = [
  { href: "/admin", label: "Dashboard", operator: true },
  { href: "/admin/students", label: "Students", operator: true },
  { href: "/admin/registrations", label: "Registrations", badge: "registrations" },
  { href: "/admin/preorders", label: "Orders", badge: "preorders", operator: true },
  { href: "/admin/menu", label: "Menu" },
  { href: "/admin/transactions", label: "Transactions", operator: true },
  { href: "/admin/staff", label: "Staff" },
  { href: "/admin/settings", label: "Settings" },
  { href: "/scan", label: "Till", operator: true },
  { href: "/kiosk", label: "Kiosk", operator: true },
] as const;

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await requireRole("ADMIN", "OPERATOR");
  const isAdmin = session.role === "ADMIN";
  const nav = NAV.filter((item) => isAdmin || "operator" in item);

  const [schools, selectedSchool, schoolScope, pinnedSchool] = await Promise.all([
    allSchools(),
    currentSchoolId(),
    studentSchoolFilter(),
    currentSchoolName(),
  ]);
  const [pendingRegistrations, pendingPreorders] = await Promise.all([
    prisma.childRegistration.count({
      where: {
        status: "PENDING",
        ...(selectedSchool ? { schoolId: selectedSchool } : {}),
      },
    }),
    prisma.preorder.count({
      where: {
        status: "PENDING",
        serviceDate: startOfSchoolDay(),
        ...schoolScope,
      },
    }),
  ]);
  const counts = {
    registrations: pendingRegistrations,
    preorders: pendingPreorders,
  };

  return (
    <div className="flex min-h-screen flex-1 flex-col">
      <header className="no-print sticky top-0 z-10 border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-3">
          <Link href="/admin" className="flex items-center gap-2 font-bold text-slate-900">
            <span className="text-xl">🍎</span>
            {process.env.NEXT_PUBLIC_SCHOOL_NAME || "School Canteen"}
          </Link>
          <div className="flex items-center gap-3 text-sm">
            {isAdmin ? (
              <SchoolSwitcher schools={schools} current={selectedSchool} />
            ) : (
              /* Operators are pinned to one school — show it, don't offer a
                 choice they don't have. */
              <span className="rounded-lg bg-slate-100 px-2.5 py-1.5 text-sm font-medium text-slate-700">
                {pinnedSchool ?? "No school assigned"}
              </span>
            )}
            <Link href="/password" className="text-slate-500 hover:text-slate-800">
              Password
            </Link>
            <form action={logout}>
              <button className="text-slate-500 hover:text-slate-800">
                Sign out
              </button>
            </form>
          </div>
        </div>
        <nav className="mx-auto flex max-w-5xl gap-1 overflow-x-auto px-4 pb-2">
          {nav.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="whitespace-nowrap rounded-lg px-3 py-1.5 text-sm font-medium text-slate-600 hover:bg-slate-100 hover:text-slate-900"
            >
              {item.label}
              {"badge" in item && counts[item.badge] > 0 && (
                <span className="ml-1.5 rounded-full bg-indigo-600 px-1.5 py-0.5 text-xs font-semibold text-white">
                  {counts[item.badge]}
                </span>
              )}
            </Link>
          ))}
        </nav>
      </header>
      <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-6">{children}</main>
    </div>
  );
}
