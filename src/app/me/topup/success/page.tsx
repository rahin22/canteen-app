import Link from "next/link";
import { requireRole } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { formatMoney } from "@/lib/money";
import { getStripe, creditFromStripeSession } from "@/lib/stripe";

export const dynamic = "force-dynamic";

export default async function TopupSuccessPage({
  searchParams,
}: {
  searchParams: Promise<{ session_id?: string }>;
}) {
  const session = await requireRole("STUDENT", "PARENT");
  const { session_id } = await searchParams;

  let ok = false;
  let targetId: string | null = null;
  const stripe = getStripe();
  if (stripe && session_id) {
    try {
      const checkout = await stripe.checkout.sessions.retrieve(session_id);
      const userId = checkout.metadata?.userId;
      // Only credit sessions that belong to this login: their own wallet,
      // or a child linked to this parent.
      const authorized =
        userId === session.uid ||
        (session.role === "PARENT" &&
          userId &&
          (await prisma.user.findFirst({
            where: { id: userId, parents: { some: { id: session.uid } } },
            select: { id: true },
          })) !== null);
      if (userId && authorized) {
        // Credit directly as a fallback for slow/undelivered webhooks —
        // creditFromStripeSession is idempotent so double delivery is safe.
        const result = await creditFromStripeSession(checkout);
        ok = result.credited;
        targetId = userId;
      }
    } catch {
      ok = false;
    }
  }

  const target = targetId
    ? await prisma.user.findUnique({
        where: { id: targetId },
        select: { name: true, balance: true },
      })
    : null;

  const homeHref = session.role === "PARENT" ? "/family" : "/me";

  return (
    <main className="mx-auto w-full max-w-lg flex-1 p-4">
      <div className="mt-16 rounded-3xl border border-slate-200 bg-white p-8 text-center">
        {ok && target ? (
          <>
            <div className="text-5xl">🎉</div>
            <h1 className="mt-3 text-2xl font-bold text-slate-900">Top-up complete</h1>
            <p className="mt-2 text-slate-600">
              {session.role === "PARENT" ? `${target.name}'s` : "Your"} new balance
              is <b className="text-emerald-600">{formatMoney(target.balance)}</b>.
            </p>
          </>
        ) : (
          <>
            <div className="text-5xl">⏳</div>
            <h1 className="mt-3 text-2xl font-bold text-slate-900">Processing payment</h1>
            <p className="mt-2 text-slate-600">
              If the balance doesn&apos;t update in a couple of minutes, contact the
              school office.
            </p>
          </>
        )}
        <Link
          href={homeHref}
          className="mt-6 inline-block w-full rounded-xl bg-indigo-600 py-3 font-semibold text-white hover:bg-indigo-700"
        >
          Done
        </Link>
      </div>
    </main>
  );
}
