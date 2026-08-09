import Link from "next/link";
import { requireRole } from "@/lib/auth";
import { preorderWindow } from "@/lib/preorders";
import { logout } from "@/app/login/actions";
import KioskClient from "./kiosk-client";

export const dynamic = "force-dynamic";

/**
 * The office kiosk — an iPad students order from at the start of the day.
 *
 * The *device* is signed in as a staff account, which is what gates this page.
 * Children never sign in here; they tap their card, which identifies them for
 * the length of one order and nothing more.
 */
export default async function KioskPage() {
  await requireRole("ADMIN", "OPERATOR");

  // No menu is loaded here on purpose — it arrives with whichever student
  // taps their card, so one kiosk works in either school's front office.
  const window = await preorderWindow();

  return (
    <main className="flex flex-1 flex-col bg-slate-50">
      <header className="flex items-center justify-between border-b border-slate-200 bg-white px-5 py-3">
        <div className="flex items-center gap-2">
          <span className="text-2xl">🍎</span>
          <span className="text-lg font-semibold text-slate-900">
            {process.env.NEXT_PUBLIC_SCHOOL_NAME || "School Canteen"} — order ahead
          </span>
        </div>
        {/* Deliberately understated: this is staff plumbing on a device kids
            use, not something to invite them to press. */}
        <div className="flex items-center gap-3 text-xs text-slate-400">
          <Link href="/admin/preorders" className="hover:text-slate-700">
            Orders
          </Link>
          <Link href="/scan" className="hover:text-slate-700">
            Till
          </Link>
          <form action={logout}>
            <button className="hover:text-slate-700">Sign out</button>
          </form>
        </div>
      </header>

      {window.open ? (
        <KioskClient cutoffLabel={window.cutoffLabel} />
      ) : (
        <div className="mx-auto mt-20 max-w-lg px-6 text-center">
          <div className="text-6xl">🕘</div>
          <h1 className="mt-4 text-3xl font-bold text-slate-900">
            Ordering is closed
          </h1>
          <p className="mt-3 text-xl text-slate-600">{window.reason}</p>
        </div>
      )}
    </main>
  );
}
