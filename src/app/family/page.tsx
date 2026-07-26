import Link from "next/link";
import { requireRole } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { formatMoney } from "@/lib/money";
import { parentSignupOpen } from "@/lib/settings";
import { logout } from "@/app/login/actions";
import { WithdrawButton } from "./withdraw-button";

export const dynamic = "force-dynamic";

export default async function FamilyPage({
  searchParams,
}: {
  searchParams: Promise<{ submitted?: string }>;
}) {
  const session = await requireRole("PARENT");
  const { submitted } = await searchParams;

  const [parent, registrations, canRegister] = await Promise.all([
    prisma.user.findUniqueOrThrow({
      where: { id: session.uid },
      include: {
        children: {
          where: { role: "STUDENT" },
          orderBy: { name: "asc" },
          select: {
            id: true,
            name: true,
            className: true,
            balance: true,
            active: true,
            photoId: true,
          },
        },
      },
    }),
    // Anything not yet approved — approved ones show up as children above.
    prisma.childRegistration.findMany({
      where: { parentId: session.uid, status: { in: ["PENDING", "REJECTED"] } },
      orderBy: { createdAt: "desc" },
    }),
    parentSignupOpen(),
  ]);

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

      {!parent.emailVerifiedAt && (
        <Link
          href="/verify-email"
          className="mb-4 block rounded-2xl border border-amber-200 bg-amber-50 p-4 transition hover:border-amber-300"
        >
          <p className="font-semibold text-amber-900">Confirm your email ✉️</p>
          <p className="mt-1 text-sm text-amber-800">
            We sent a code to {parent.email}. You&apos;ll need to confirm it
            before you can register a child —{" "}
            <span className="font-medium underline">enter the code</span>.
          </p>
        </Link>
      )}

      {submitted && (
        <div className="mb-4 rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-900">
          <p className="font-semibold">Request submitted ✓</p>
          <p className="mt-1">
            The school office will review it and your child&apos;s card will
            appear here once it&apos;s approved.
          </p>
        </div>
      )}

      <div className="space-y-3">
        {parent.children.map((child) => (
          <Link
            key={child.id}
            href={`/family/${child.id}`}
            className="block rounded-2xl border border-slate-200 bg-white p-5 transition hover:border-indigo-300 hover:shadow-sm"
          >
            <div className="flex items-center justify-between gap-3">
              <div className="flex min-w-0 items-center gap-3">
                <Avatar
                  src={child.photoId ? `/api/photo/student/${child.id}` : null}
                  name={child.name}
                />
                <div className="min-w-0">
                  <p className="truncate font-bold text-slate-900">
                    {child.name}
                    {!child.active && (
                      <span className="ml-2 rounded bg-red-100 px-1.5 py-0.5 text-xs text-red-700">
                        disabled
                      </span>
                    )}
                  </p>
                  <p className="text-sm text-slate-500">{child.className || ""}</p>
                </div>
              </div>
              <div className="shrink-0 text-right">
                <p className="text-xs uppercase tracking-wide text-slate-400">
                  Balance
                </p>
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

        {registrations.map((reg) => (
          <div
            key={reg.id}
            className="rounded-2xl border border-slate-200 bg-white p-5"
          >
            <div className="flex items-center gap-3">
              <Avatar
                src={reg.photoId ? `/api/photo/registration/${reg.id}` : null}
                name={reg.name}
                muted
              />
              <div className="min-w-0 flex-1">
                <p className="truncate font-bold text-slate-900">{reg.name}</p>
                <p className="text-sm text-slate-500">
                  {[reg.className, reg.schoolId].filter(Boolean).join(" · ")}
                </p>
              </div>
              {reg.status === "PENDING" ? (
                <span className="shrink-0 rounded-full bg-amber-100 px-2.5 py-1 text-xs font-semibold text-amber-800">
                  Awaiting approval
                </span>
              ) : (
                <span className="shrink-0 rounded-full bg-red-100 px-2.5 py-1 text-xs font-semibold text-red-700">
                  Not approved
                </span>
              )}
            </div>
            {reg.status === "REJECTED" && reg.note && (
              <p className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800">
                {reg.note}
              </p>
            )}
            {reg.status === "PENDING" && <WithdrawButton registrationId={reg.id} />}
          </div>
        ))}
      </div>

      {parent.children.length === 0 && registrations.length === 0 && (
        <p className="rounded-2xl border border-slate-200 bg-white p-6 text-sm text-slate-500">
          No children on your account yet.
          {canRegister
            ? " Use the button below to register one."
            : " Ask the school office to link your children."}
        </p>
      )}

      {canRegister && parent.emailVerifiedAt && (
        <Link
          href="/family/register"
          className="mt-4 block rounded-2xl border-2 border-dashed border-slate-300 p-4 text-center font-semibold text-indigo-600 transition hover:border-indigo-400 hover:bg-indigo-50"
        >
          + Register a child
        </Link>
      )}
    </main>
  );
}

function Avatar({
  src,
  name,
  muted,
}: {
  src: string | null;
  name: string;
  muted?: boolean;
}) {
  return (
    <div
      className={`flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-full ${
        muted ? "bg-slate-100" : "bg-indigo-100"
      }`}
    >
      {src ? (
        // Private, no-store response — must bypass the image optimiser.
        // eslint-disable-next-line @next/next/no-img-element
        <img src={src} alt="" className="h-full w-full object-cover" />
      ) : (
        <span className="text-lg font-bold text-slate-500">
          {name.charAt(0).toUpperCase()}
        </span>
      )}
    </div>
  );
}
