import { requireRole } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { formatMoney } from "@/lib/money";
import { formatClock, formatSchoolDay, startOfSchoolDay } from "@/lib/day";
import { describeLinesDetailed, readLines } from "@/lib/preorder-format";
import { preorderStatus } from "@/lib/preorders";
import { nextSchoolDay } from "@/lib/pickup";
import { currentSchoolName, studentSchoolFilter } from "@/lib/schools";
import { CancelOrderButton } from "./cancel-button";

export const dynamic = "force-dynamic";

/**
 * What the kitchen cooks this morning.
 *
 * Leads with a tally per menu item — that's the number someone actually works
 * from — then lists the individual orders for packing and handing over.
 */
export default async function PreordersPage() {
  await requireRole("ADMIN", "OPERATOR");

  const today = startOfSchoolDay();
  // Each canteen only cooks its own school's orders, so this list follows the
  // header filter. "All schools" is still useful for an overview.
  const [scope, schoolName] = await Promise.all([
    studentSchoolFilter(),
    currentSchoolName(),
  ]);
  const tomorrow = nextSchoolDay(today);
  const orderInclude = {
    student: {
      select: { name: true, className: true, school: { select: { name: true } } },
    },
    placedBy: { select: { name: true } },
    pickupSlot: true,
  };
  const [orders, tomorrowOrders, status] = await Promise.all([
    prisma.preorder.findMany({
      where: { serviceDate: today, ...scope },
      orderBy: [{ status: "asc" }, { createdAt: "asc" }],
      include: orderInclude,
    }),
    // Orders placed after the cutoff land on the next day, so the kitchen
    // needs to see what's already booked in for tomorrow.
    prisma.preorder.findMany({
      where: { serviceDate: tomorrow, status: "PENDING", ...scope },
      orderBy: { createdAt: "asc" },
      include: orderInclude,
    }),
    preorderStatus(),
  ]);

  const pending = orders.filter((o) => o.status === "PENDING");
  const collected = orders.filter((o) => o.status === "COLLECTED");

  // Tally across everything still to be made, counting each *variant*
  // separately — three combos are three different burgers as far as the
  // kitchen is concerned, so collapsing them by base name would be useless.
  const tally = new Map<string, { qty: number; value: number }>();
  for (const order of pending) {
    for (const line of readLines(order.items)) {
      const label = line.options?.length
        ? `${line.name} (${line.options.map((o) => o.name).join(", ")})`
        : line.name;
      const entry = tally.get(label) ?? { qty: 0, value: 0 };
      entry.qty += line.qty;
      entry.value += line.price * line.qty;
      tally.set(label, entry);
    }
  }
  const tallied = [...tally.entries()].sort((a, b) => b[1].qty - a[1].qty);
  const pendingValue = pending.reduce((sum, o) => sum + o.total, 0);

  return (
    <div>
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Orders to make</h1>
          <p className="text-sm text-slate-500">{schoolName ?? "All schools"}</p>
        </div>
        <p className="text-sm text-slate-500">{formatSchoolDay(today)}</p>
      </div>
      <p className="mb-6 mt-1 text-sm text-slate-500">
        {status.enabled
          ? `Orders placed before ${status.cutoffLabel} are for today; after that they go on tomorrow's list.`
          : "Preordering is switched off — turn it on in Settings."}
      </p>

      {pending.length === 0 ? (
        <p className="rounded-2xl border border-slate-200 bg-white p-6 text-sm text-slate-500">
          Nothing waiting to be made.
          {collected.length > 0 &&
            ` All ${collected.length} of today's orders have been collected.`}
        </p>
      ) : (
        <>
          <section className="mb-6 rounded-2xl border border-slate-200 bg-white p-5">
            <div className="mb-3 flex items-baseline justify-between">
              <h2 className="font-semibold text-slate-900">Prep list</h2>
              <p className="text-sm text-slate-500">
                {pending.length} order{pending.length === 1 ? "" : "s"} ·{" "}
                {formatMoney(pendingValue)}
              </p>
            </div>
            <div className="grid gap-2 sm:grid-cols-2">
              {tallied.map(([name, entry]) => (
                <div
                  key={name}
                  className="flex items-center justify-between rounded-xl bg-slate-50 px-4 py-2.5"
                >
                  <span className="font-medium text-slate-800">{name}</span>
                  <span className="text-lg font-bold text-slate-900">
                    ×{entry.qty}
                  </span>
                </div>
              ))}
            </div>
          </section>

          <h2 className="mb-2 font-semibold text-slate-900">
            Waiting to be collected
          </h2>
          <p className="mb-2 text-sm text-slate-500">
            All paid for already — the till just records the hand-over.
            Cancelling refunds the card.
          </p>
          <div className="mb-8 overflow-hidden rounded-2xl border border-slate-200 bg-white">
            {pending.map((order) => (
              <div
                key={order.id}
                className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 px-4 py-3 last:border-0"
              >
                <div className="min-w-0">
                  <p className="font-medium text-slate-900">
                    {order.student.name}
                    {order.student.className && (
                      <span className="ml-2 text-sm font-normal text-slate-400">
                        {order.student.className}
                      </span>
                    )}
                  </p>
                  <p className="text-sm text-slate-600">
                    {describeLinesDetailed(readLines(order.items))}
                  </p>
                  <p className="text-sm font-medium text-indigo-600">
                    {order.pickupSlot
                      ? `${order.pickupSlot.label} · ${formatClock(
                          order.pickupSlot.startTime
                        )}`
                      : "No pickup time"}
                  </p>
                  <p className="text-xs text-slate-400">
                    {[
                      !schoolName ? order.student.school?.name : null,
                      order.source === "KIOSK"
                        ? "Office kiosk"
                        : order.source === "STAFF"
                        ? `Taken by ${order.placedBy?.name ?? "staff"}`
                        : `Ordered by ${order.placedBy?.name ?? "a parent"}`,
                    ]
                      .filter(Boolean)
                      .join(" · ")}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-3">
                  <span className="font-semibold text-slate-900">
                    {formatMoney(order.total)}
                  </span>
                  <CancelOrderButton
                    preorderId={order.id}
                    studentName={order.student.name}
                    total={formatMoney(order.total)}
                  />
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      {tomorrowOrders.length > 0 && (
        <div className="mb-8 rounded-2xl border-2 border-amber-300 bg-amber-50 p-5">
          <h2 className="font-semibold text-amber-900">
            Booked in for {formatSchoolDay(tomorrow)} ({tomorrowOrders.length})
          </h2>
          <p className="mb-3 mt-0.5 text-sm text-amber-800">
            Already paid for. Prep these with tomorrow&apos;s service.
          </p>
          <div className="space-y-1.5">
            {tomorrowOrders.map((order) => (
              <div
                key={order.id}
                className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-white px-4 py-2.5"
              >
                <div className="min-w-0">
                  <p className="text-sm font-medium text-slate-900">
                    {order.student.name}
                    {order.student.className && (
                      <span className="ml-2 text-xs font-normal text-slate-400">
                        {order.student.className}
                      </span>
                    )}
                  </p>
                  <p className="text-sm text-slate-600">
                    {describeLinesDetailed(readLines(order.items))}
                  </p>
                  <p className="text-xs font-medium text-indigo-600">
                    {order.pickupSlot
                      ? `${order.pickupSlot.label} · ${formatClock(
                          order.pickupSlot.startTime
                        )}`
                      : "No pickup time"}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-3">
                  <span className="font-semibold text-slate-900">
                    {formatMoney(order.total)}
                  </span>
                  <CancelOrderButton
                    preorderId={order.id}
                    studentName={order.student.name}
                    total={formatMoney(order.total)}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {collected.length > 0 && (
        <>
          <h2 className="mb-2 font-semibold text-slate-900">
            Collected today ({collected.length})
          </h2>
          <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
            {collected.map((order) => (
              <div
                key={order.id}
                className="flex items-center justify-between border-b border-slate-100 px-4 py-2.5 last:border-0"
              >
                <div>
                  <p className="text-sm font-medium text-slate-700">
                    {order.student.name}
                  </p>
                  <p className="text-xs text-slate-400">
                    {describeLinesDetailed(readLines(order.items))}
                  </p>
                </div>
                <span className="text-sm text-slate-500">
                  {formatMoney(order.total)} ✓
                </span>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
