import { requireRole } from "@/lib/auth";
import { schoolScope } from "@/lib/schools";
import { logout } from "@/app/login/actions";
import ScanClient from "./scan-client";

export const dynamic = "force-dynamic";

/**
 * The till. Deliberately not tied to a school: the menu and prices arrive with
 * whoever presents a card, so the same device works at either canteen and
 * nobody has to remember to configure it.
 */
export default async function ScanPage() {
  const session = await requireRole("ADMIN", "OPERATOR");
  // An operator with no school can't serve anyone — say so plainly rather than
  // letting every scan fail with "another school".
  const scope = await schoolScope();
  const stranded = session.role === "OPERATOR" && scope.kind === "none";

  return (
    <main className="flex flex-1 flex-col">
      <header className="no-print flex items-center justify-between border-b border-slate-200 bg-white px-4 py-3">
        <div className="flex items-center gap-2">
          <span className="text-xl">🍎</span>
          <span className="font-semibold text-slate-900">Canteen till</span>
        </div>
        <div className="flex items-center gap-3 text-sm">
          {session.role === "ADMIN" && (
            <a href="/admin" className="font-medium text-indigo-600 hover:underline">
              Admin
            </a>
          )}
          <a href="/password" className="text-slate-500 hover:text-slate-800">
            Password
          </a>
          <form action={logout}>
            <button className="text-slate-500 hover:text-slate-800">Sign out</button>
          </form>
        </div>
      </header>
      {stranded ? (
        <div className="mx-auto mt-16 max-w-md px-6 text-center">
          <div className="text-5xl">🏫</div>
          <h1 className="mt-4 text-xl font-bold text-slate-900">
            No school assigned
          </h1>
          <p className="mt-2 text-slate-600">
            Ask an admin to set your school under Admin → Staff before using the
            till.
          </p>
        </div>
      ) : (
        <ScanClient />
      )}
    </main>
  );
}
