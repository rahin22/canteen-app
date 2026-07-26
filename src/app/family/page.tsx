import Link from "next/link";
import { requireRole } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { formatMoney } from "@/lib/money";
import { logout } from "@/app/login/actions";

export const dynamic = "force-dynamic";

export default async function FamilyPage() {
  const session = await requireRole("PARENT");

  const parent = await prisma.user.findUniqueOrThrow({
    where: { id: session.uid },
    include: {
      children: {
        where: { role: "STUDENT" },
        orderBy: { name: "asc" },
        select: { id: true, name: true, className: true, balance: true, active: true },
      },
    },
  });

  return (
    <main className="mx-auto w-full max-w-lg flex-1 p-4">
      <header className="mb-6 flex items-center justify-between pt-2">
        <div>
          <p className="text-sm text-slate-500">
            {process.env.NEXT_PUBLIC_SCHOOL_NAME || "School Canteen"}
          </p>
          <h1 className="text-xl font-bold text-slate-900">
            Hi, {parent.name.split(" ")[0]} 👋
          </h1>
        </div>
        <div className="flex items-center gap-3 text-sm">
          <Link href="/password" className="text-slate-500 hover:text-slate-800">
            Password
          </Link>
          <form action={logout}>
            <button className="text-slate-500 hover:text-slate-800">Sign out</button>
          </form>
        </div>
      </header>

      {parent.children.length === 0 && (
        <p className="rounded-2xl border border-slate-200 bg-white p-6 text-sm text-slate-500">
          No students are linked to your account yet — ask the school office to
          link your children.
        </p>
      )}

      <div className="space-y-3">
        {parent.children.map((child) => (
          <Link
            key={child.id}
            href={`/family/${child.id}`}
            className="block rounded-2xl border border-slate-200 bg-white p-5 transition hover:border-indigo-300 hover:shadow-sm"
          >
            <div className="flex items-center justify-between">
              <div>
                <p className="font-bold text-slate-900">
                  {child.name}
                  {!child.active && (
                    <span className="ml-2 rounded bg-red-100 px-1.5 py-0.5 text-xs text-red-700">
                      disabled
                    </span>
                  )}
                </p>
                <p className="text-sm text-slate-500">{child.className || ""}</p>
              </div>
              <div className="text-right">
                <p className="text-xs uppercase tracking-wide text-slate-400">Balance</p>
                <p
                  className={`text-xl font-bold ${
                    child.balance < 500 ? "text-amber-600" : "text-emerald-600"
                  }`}
                >
                  {formatMoney(child.balance)}
                </p>
              </div>
            </div>
            <p className="mt-3 text-sm font-medium text-indigo-600">
              View history &amp; top up →
            </p>
          </Link>
        ))}
      </div>
    </main>
  );
}
