import Link from "next/link";
import { requireRole } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { parentSignupOpen } from "@/lib/settings";
import { ReviewCard, type PendingRegistration } from "./review-card";

export const dynamic = "force-dynamic";

const dateFormat = new Intl.DateTimeFormat(
  process.env.NEXT_PUBLIC_LOCALE || "en-AU",
  { dateStyle: "medium", timeStyle: "short" }
);

export default async function RegistrationsPage() {
  await requireRole("ADMIN");

  const [pending, recent, signupOpen] = await Promise.all([
    prisma.childRegistration.findMany({
      where: { status: "PENDING" },
      orderBy: { createdAt: "asc" },
      include: {
        parent: { select: { name: true, username: true, phone: true } },
      },
    }),
    prisma.childRegistration.findMany({
      where: { status: { in: ["APPROVED", "REJECTED"] } },
      orderBy: { reviewedAt: "desc" },
      take: 20,
      include: {
        parent: { select: { name: true } },
        reviewer: { select: { name: true } },
      },
    }),
    parentSignupOpen(),
  ]);

  // Look up which school IDs already exist so the admin can see, before
  // approving, whether this links to a record or creates a new one.
  const matches = pending.length
    ? await prisma.user.findMany({
        where: {
          username: { in: pending.map((r) => r.schoolId) },
        },
        select: {
          username: true,
          name: true,
          role: true,
          className: true,
          parents: { select: { id: true } },
        },
      })
    : [];

  const cards: PendingRegistration[] = pending.map((reg) => {
    const match = matches.find(
      (m) => m.username === reg.schoolId && m.role === "STUDENT"
    );
    return {
      id: reg.id,
      name: reg.name,
      schoolId: reg.schoolId,
      className: reg.className,
      hasPhoto: Boolean(reg.photoId),
      createdAt: dateFormat.format(reg.createdAt),
      parent: reg.parent,
      match: match
        ? {
            name: match.name,
            className: match.className,
            alreadyLinked: match.parents.some((p) => p.id === reg.parentId),
          }
        : null,
    };
  });

  return (
    <div className="max-w-3xl">
      <h1 className="text-2xl font-bold text-slate-900">Registrations</h1>
      <p className="mb-6 mt-1 text-sm text-slate-500">
        Children submitted by parents. Nothing is created until you approve it.
      </p>

      {!signupOpen && (
        <p className="mb-5 rounded-2xl border border-slate-200 bg-slate-50 px-5 py-4 text-sm text-slate-600">
          Parent self-registration is currently <b>off</b>, so no new requests
          can arrive. Turn it on under{" "}
          <Link href="/admin/settings" className="font-medium text-indigo-600 hover:underline">
            Settings
          </Link>
          .
        </p>
      )}

      {cards.length === 0 ? (
        <p className="rounded-2xl border border-slate-200 bg-white p-6 text-sm text-slate-500">
          Nothing waiting for review.
        </p>
      ) : (
        <div className="space-y-4">
          {cards.map((registration) => (
            <ReviewCard key={registration.id} registration={registration} />
          ))}
        </div>
      )}

      {recent.length > 0 && (
        <>
          <h2 className="mb-3 mt-10 font-semibold text-slate-900">
            Recently actioned
          </h2>
          <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
            {recent.map((reg) => (
              <div
                key={reg.id}
                className="flex items-center justify-between gap-4 border-b border-slate-100 px-4 py-3 text-sm last:border-0"
              >
                <div className="min-w-0">
                  <p className="truncate font-medium text-slate-900">
                    {reg.name}{" "}
                    <span className="font-mono text-xs text-slate-400">
                      {reg.schoolId}
                    </span>
                  </p>
                  <p className="text-xs text-slate-500">
                    from {reg.parent.name}
                    {reg.reviewer ? ` · actioned by ${reg.reviewer.name}` : ""}
                    {reg.reviewedAt ? ` · ${dateFormat.format(reg.reviewedAt)}` : ""}
                  </p>
                  {reg.note && (
                    <p className="mt-0.5 text-xs text-slate-500">
                      Reason: {reg.note}
                    </p>
                  )}
                </div>
                <span
                  className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-semibold ${
                    reg.status === "APPROVED"
                      ? "bg-emerald-100 text-emerald-800"
                      : "bg-red-100 text-red-700"
                  }`}
                >
                  {reg.status === "APPROVED" ? "Approved" : "Declined"}
                </span>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
