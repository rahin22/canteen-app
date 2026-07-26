import { requireRole } from "@/lib/auth";
import { logout } from "@/app/login/actions";
import Link from "next/link";

import { prisma } from "@/lib/db";

const NAV = [
  { href: "/admin", label: "Dashboard" },
  { href: "/admin/students", label: "Students" },
  { href: "/admin/registrations", label: "Registrations", badge: true },
  { href: "/admin/menu", label: "Menu" },
  { href: "/admin/transactions", label: "Transactions" },
  { href: "/admin/staff", label: "Staff" },
  { href: "/admin/settings", label: "Settings" },
  { href: "/scan", label: "Till" },
];

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  await requireRole("ADMIN");
  const pendingRegistrations = await prisma.childRegistration.count({
    where: { status: "PENDING" },
  });

  return (
    <div className="flex min-h-screen flex-1 flex-col">
      <header className="no-print sticky top-0 z-10 border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-3">
          <Link href="/admin" className="flex items-center gap-2 font-bold text-slate-900">
            <span className="text-xl">🍎</span>
            {process.env.NEXT_PUBLIC_SCHOOL_NAME || "School Canteen"}
          </Link>
          <div className="flex items-center gap-3 text-sm">
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
          {NAV.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="whitespace-nowrap rounded-lg px-3 py-1.5 text-sm font-medium text-slate-600 hover:bg-slate-100 hover:text-slate-900"
            >
              {item.label}
              {item.badge && pendingRegistrations > 0 && (
                <span className="ml-1.5 rounded-full bg-indigo-600 px-1.5 py-0.5 text-xs font-semibold text-white">
                  {pendingRegistrations}
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
