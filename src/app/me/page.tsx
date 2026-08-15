import Link from "next/link";
import { redirect } from "next/navigation";
import QRCode from "qrcode";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { formatMoney } from "@/lib/money";
import { onlineTopupsAvailable } from "@/lib/settings";
import { getDailySpend } from "@/lib/ledger";
import { pendingPreorders } from "@/lib/preorders";
import { describeLines, orderLabel } from "@/lib/preorder-format";
import { logout } from "@/app/login/actions";
import { ShowCardButton } from "./show-card";

export const dynamic = "force-dynamic";

export default async function StudentHome() {
  const session = await getSession();
  if (!session) redirect("/login");
  if (session.role !== "STUDENT") redirect("/");

  const user = await prisma.user.findUniqueOrThrow({
    where: { id: session.uid },
    include: {
      cards: { where: { status: "ACTIVE", type: "QR" }, take: 1 },
      transactions: { orderBy: { createdAt: "desc" }, take: 20 },
    },
  });

  const card = user.cards[0];
  const qr = card
    ? await QRCode.toDataURL(card.token, { margin: 1, width: 280 })
    : null;
  const [onlineTopups, daily, pendingOrders] = await Promise.all([
    onlineTopupsAvailable(),
    getDailySpend(user.id),
    pendingPreorders(user.id),
  ]);

  return (
    <main className="mx-auto w-full max-w-lg flex-1 p-4">
      <header className="mb-6 flex items-center justify-between pt-2">
        <div>
          <p className="text-sm text-slate-500">
            {process.env.NEXT_PUBLIC_SCHOOL_NAME || "School Canteen"}
          </p>
          <h1 className="text-xl font-bold text-slate-900">Hi, {user.name.split(" ")[0]} 👋</h1>
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

      <div className="rounded-3xl bg-gradient-to-br from-indigo-600 to-violet-600 p-6 text-white shadow-lg">
        <p className="text-sm text-indigo-200">Canteen balance</p>
        <p className="mt-1 text-4xl font-bold">{formatMoney(user.balance)}</p>
        <div className="mt-5 flex gap-2">
          <Link
            href="/me/topup"
            className="flex-1 rounded-xl bg-white/95 py-2.5 text-center font-semibold text-indigo-700 hover:bg-white"
          >
            {onlineTopups ? "Top up" : "How to top up"}
          </Link>
          {qr && <ShowCardButton qr={qr} name={user.name} username={user.username} />}
        </div>
      </div>

      {pendingOrders.length > 0 && (
        <div className="mt-3 rounded-2xl border-2 border-emerald-200 bg-emerald-50 p-4">
          <p className="font-bold text-emerald-900">🥪 Waiting at the canteen</p>
          {pendingOrders.map((order) => (
            <div key={order.id} className="mt-2 text-sm text-emerald-800">
              <p className="font-bold text-emerald-900">
                Order {orderLabel(order.orderNumber)}
                {order.pickupLabel ? ` — ${order.pickupLabel}` : ""}
              </p>
              {order.pickup && (
                <p className="text-emerald-700">{order.pickup}</p>
              )}
              {order.notes && (
                <p className="text-emerald-700">Note: {order.notes}</p>
              )}
              <p>
                {describeLines(order.items)} —{" "}
                <span className="font-semibold">{formatMoney(order.total)}</span>{" "}
                already paid, just pick it up
              </p>
            </div>
          ))}
        </div>
      )}

      {daily.limit !== null && (
        <p className="mt-3 rounded-xl bg-slate-50 px-4 py-3 text-sm text-slate-600">
          {daily.limit === 0
            ? "Your family has paused canteen spending on your card."
            : `Your family set a ${formatMoney(daily.limit)} daily spending limit. You've spent ${formatMoney(daily.spent)} today${
                daily.remaining === 0
                  ? " — that's the lot until tomorrow."
                  : `, so ${formatMoney(daily.remaining!)} is left.`
              }`}
        </p>
      )}

      {user.balance < 500 && (
        <p className="mt-3 rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-800">
          Your balance is running low — {onlineTopups ? "top up" : "bring cash to the canteen"}{" "}
          so you don&apos;t miss out at lunch.
        </p>
      )}

      <h2 className="mb-3 mt-8 font-semibold text-slate-900">Recent activity</h2>
      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
        {user.transactions.length === 0 && (
          <p className="p-5 text-sm text-slate-500">
            Nothing yet — your purchases and top-ups will appear here.
          </p>
        )}
        {user.transactions.map((tx) => (
          <div
            key={tx.id}
            className="flex items-center justify-between border-b border-slate-100 px-4 py-3 last:border-0"
          >
            <div>
              <p className="text-sm font-medium text-slate-900">{describe(tx.type, tx.items, tx.note)}</p>
              <p className="text-xs text-slate-400">{tx.createdAt.toLocaleString()}</p>
            </div>
            <span
              className={`font-semibold ${
                tx.amount < 0 ? "text-slate-900" : "text-emerald-600"
              }`}
            >
              {tx.amount > 0 ? "+" : ""}
              {formatMoney(tx.amount)}
            </span>
          </div>
        ))}
      </div>
    </main>
  );
}

function describe(type: string, items: unknown, note: string | null): string {
  if (type === "PURCHASE") {
    if (Array.isArray(items)) {
      const parts = (items as { name?: string; qty?: number }[])
        .filter((l) => l.name)
        .map((l) => (l.qty && l.qty > 1 ? `${l.name} ×${l.qty}` : l.name));
      if (parts.length) return parts.join(", ");
    }
    return "Canteen purchase";
  }
  if (type === "TOPUP_CASH") return "Top-up (in person)";
  if (type === "TOPUP_STRIPE") return "Top-up (online)";
  if (type === "REFUND") return note ? `Refund — ${note}` : "Refund";
  return note ? `Adjustment — ${note}` : "Adjustment";
}
