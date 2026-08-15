import { requireRole } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { formatMoney } from "@/lib/money";
import { formatClock, formatSchoolDay, startOfSchoolDay } from "@/lib/day";
import { describeLinesDetailed, orderLabel, readLines } from "@/lib/preorder-format";
import { preorderStatus } from "@/lib/preorders";
import { nextSchoolDay } from "@/lib/pickup";
import { currentSchoolName, studentSchoolFilter } from "@/lib/schools";
import { CancelOrderButton } from "./cancel-button";
import { OrdersBoard, type BoardOrder } from "./orders-board";

export const dynamic = "force-dynamic";

const orderInclude = {
  student: {
    select: { name: true, className: true, school: { select: { name: true } } },
  },
  placedBy: { select: { name: true } },
  pickupSlot: true,
} as const;

type OrderRow = {
  id: string;
  orderNumber: number | null;
  items: unknown;
  total: number;
  notes: string | null;
  status: BoardOrder["status"];
  source: BoardOrder["source"];
  student: {
    name: string;
    className: string | null;
    school: { name: string } | null;
  };
  placedBy: { name: string } | null;
  pickupSlot: { id: string; label: string; startTime: string; endTime: string } | null;
};

/** Flattens a database row into what the board renders. */
function toBoardOrder(order: OrderRow): BoardOrder {
  return {
    id: order.id,
    orderNumber: order.orderNumber,
    studentName: order.student.name,
    className: order.student.className,
    schoolName: order.student.school?.name ?? null,
    slotId: order.pickupSlot?.id ?? null,
    slotLabel: order.pickupSlot?.label ?? null,
    slotStart: order.pickupSlot?.startTime ?? null,
    slotTimes: order.pickupSlot
      ? `${formatClock(order.pickupSlot.startTime)} – ${formatClock(
          order.pickupSlot.endTime
        )}`
      : null,
    lines: readLines(order.items),
    total: order.total,
    notes: order.notes,
    status: order.status,
    source: order.source,
    placedByName: order.placedBy?.name ?? null,
  };
}

/**
 * What the kitchen cooks today, and who each plate belongs to.
 *
 * The day's orders go to the board as one list; sorting by pickup time, order
 * number or class happens there, in the browser, so staff can re-cut the list
 * mid-service without waiting on the server.
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
  const [orders, tomorrowOrders, status] = await Promise.all([
    prisma.preorder.findMany({
      where: { serviceDate: today, status: { not: "CANCELLED" }, ...scope },
      orderBy: [{ orderNumber: "asc" }, { createdAt: "asc" }],
      include: orderInclude,
    }),
    // Orders placed after the cutoff land on the next day, so the kitchen
    // needs to see what's already booked in for tomorrow.
    prisma.preorder.findMany({
      where: { serviceDate: tomorrow, status: "PENDING", ...scope },
      orderBy: [{ orderNumber: "asc" }, { createdAt: "asc" }],
      include: orderInclude,
    }),
    preorderStatus(),
  ]);

  const board = orders.map(toBoardOrder);

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

      <OrdersBoard orders={board} showSchool={!schoolName} />

      {tomorrowOrders.length > 0 && (
        <div className="mt-8 rounded-2xl border-2 border-amber-300 bg-amber-50 p-5">
          <h2 className="font-semibold text-amber-900">
            Booked in for {formatSchoolDay(tomorrow)} ({tomorrowOrders.length})
          </h2>
          <p className="mb-3 mt-0.5 text-sm text-amber-800">
            Already paid for. Prep these with tomorrow&apos;s service — they get
            their own numbers on the day.
          </p>
          <div className="space-y-1.5">
            {tomorrowOrders.map((order) => (
              <div
                key={order.id}
                className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-white px-4 py-2.5"
              >
                <div className="min-w-0">
                  <p className="text-sm font-medium text-slate-900">
                    <span className="mr-2 font-bold text-indigo-700">
                      {orderLabel(order.orderNumber)}
                    </span>
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
                  {order.notes && (
                    <p className="text-sm font-medium text-amber-800">
                      Note: {order.notes}
                    </p>
                  )}
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
                    orderLabel={orderLabel(order.orderNumber)}
                    total={formatMoney(order.total)}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
