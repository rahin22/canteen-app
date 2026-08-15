"use client";

import { useMemo, useState } from "react";
import { formatMoney } from "@/lib/money";
import { groupOptions, orderLabel } from "@/lib/preorder-format";
import type { PurchaseLine } from "@/lib/ledger";
import type { PreorderStatus, PreorderSource } from "@/generated/prisma/enums";
import { CancelOrderButton } from "./cancel-button";

/** One order, flattened for the board. Dates are already formatted server-side. */
export type BoardOrder = {
  id: string;
  orderNumber: number | null;
  studentName: string;
  className: string | null;
  /** Only shown when an admin is looking at every school at once. */
  schoolName: string | null;
  slotId: string | null;
  slotLabel: string | null;
  /** "HH:MM" local — what pickup-time sorting actually orders on. */
  slotStart: string | null;
  /** e.g. "12:00 pm – 12:20 pm". */
  slotTimes: string | null;
  lines: PurchaseLine[];
  total: number;
  /** A special request from whoever ordered — allergies, "no sauce". */
  notes: string | null;
  status: PreorderStatus;
  source: PreorderSource;
  placedByName: string | null;
};

type SortKey = "pickup" | "number" | "class" | "name";
type Show = "pending" | "collected" | "all";

const SORTS: { key: SortKey; label: string }[] = [
  { key: "pickup", label: "Pickup time" },
  { key: "number", label: "Order number" },
  { key: "class", label: "Class" },
  { key: "name", label: "Name" },
];

const ALL = "";

const selectCls =
  "rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 outline-none focus:border-indigo-500";

/**
 * The day's orders, as the canteen works through them.
 *
 * Sorting and filtering happen in the browser rather than through the server:
 * a service is a few dozen orders, they're all on the page already, and staff
 * flick between "everything for second lunch" and "where's number 12" many
 * times a minute — a round trip for each would be the slowest part of the job.
 */
export function OrdersBoard({
  orders,
  showSchool,
}: {
  orders: BoardOrder[];
  /** True when viewing all schools, so rows name which one they're for. */
  showSchool: boolean;
}) {
  const [sort, setSort] = useState<SortKey>("pickup");
  const [slotId, setSlotId] = useState(ALL);
  const [className, setClassName] = useState(ALL);
  const [show, setShow] = useState<Show>("pending");
  const [query, setQuery] = useState("");

  // Built from the day's own orders, so the dropdowns only ever offer windows
  // and classes that actually have food waiting.
  const slots = useMemo(() => {
    const seen = new Map<string, { label: string; start: string }>();
    for (const order of orders) {
      if (order.slotId && !seen.has(order.slotId)) {
        seen.set(order.slotId, {
          label: order.slotLabel ?? "Pickup",
          start: order.slotStart ?? "",
        });
      }
    }
    return [...seen.entries()]
      .map(([id, s]) => ({ id, ...s }))
      .sort((a, b) => a.start.localeCompare(b.start));
  }, [orders]);

  const classes = useMemo(
    () =>
      [...new Set(orders.map((o) => o.className).filter((c): c is string => !!c))].sort(
        (a, b) => a.localeCompare(b, undefined, { numeric: true })
      ),
    [orders]
  );

  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase();
    // "#12" and "12" should both find order twelve.
    const asNumber = Number(needle.replace(/^#/, ""));
    const filtered = orders.filter((order) => {
      if (show === "pending" && order.status !== "PENDING") return false;
      if (show === "collected" && order.status !== "COLLECTED") return false;
      if (slotId && order.slotId !== slotId) return false;
      if (className && order.className !== className) return false;
      if (!needle) return true;
      return (
        order.studentName.toLowerCase().includes(needle) ||
        order.className?.toLowerCase().includes(needle) ||
        (Number.isInteger(asNumber) && order.orderNumber === asNumber)
      );
    });
    return filtered.sort(comparators[sort]);
  }, [orders, show, slotId, className, query, sort]);

  // Headings only earn their space when they group several rows together;
  // sorting by name or number is a flat list by nature.
  const groupBy: "slot" | "class" | null =
    sort === "pickup" ? "slot" : sort === "class" ? "class" : null;

  const groupSizes = useMemo(() => {
    const sizes = new Map<string, number>();
    for (const order of visible) {
      const heading = groupHeading(order, groupBy);
      if (heading !== null) sizes.set(heading, (sizes.get(heading) ?? 0) + 1);
    }
    return sizes;
  }, [visible, groupBy]);

  const pending = visible.filter((o) => o.status === "PENDING");
  const tally = useMemo(() => tallyLines(pending), [pending]);
  const pendingValue = pending.reduce((sum, o) => sum + o.total, 0);
  const filtering = Boolean(slotId || className || query.trim());

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center gap-2 rounded-2xl border border-slate-200 bg-white p-3">
        <div className="flex items-center gap-1 rounded-lg bg-slate-100 p-1">
          {SORTS.map((option) => (
            <button
              key={option.key}
              onClick={() => setSort(option.key)}
              className={`rounded-md px-3 py-1.5 text-sm font-medium transition ${
                sort === option.key
                  ? "bg-white text-slate-900 shadow-sm"
                  : "text-slate-500 hover:text-slate-800"
              }`}
            >
              {option.label}
            </button>
          ))}
        </div>

        <select
          value={slotId}
          onChange={(e) => setSlotId(e.target.value)}
          className={selectCls}
        >
          <option value={ALL}>All pickup times</option>
          {slots.map((slot) => (
            <option key={slot.id} value={slot.id}>
              {slot.label}
            </option>
          ))}
        </select>

        <select
          value={className}
          onChange={(e) => setClassName(e.target.value)}
          className={selectCls}
        >
          <option value={ALL}>All classes</option>
          {classes.map((name) => (
            <option key={name} value={name}>
              {name}
            </option>
          ))}
        </select>

        <select
          value={show}
          onChange={(e) => setShow(e.target.value as Show)}
          className={selectCls}
        >
          <option value="pending">To make</option>
          <option value="collected">Collected</option>
          <option value="all">Everything</option>
        </select>

        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Find a name or number…"
          className="min-w-40 flex-1 rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-indigo-500"
        />

        {filtering && (
          <button
            onClick={() => {
              setSlotId(ALL);
              setClassName(ALL);
              setQuery("");
            }}
            className="text-sm font-medium text-slate-500 hover:text-slate-800 hover:underline"
          >
            Clear
          </button>
        )}
      </div>

      {pending.length > 0 && (
        <section className="mb-4 rounded-2xl border border-slate-200 bg-white p-5">
          <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
            <h2 className="font-semibold text-slate-900">
              Prep list
              {filtering && (
                <span className="ml-2 text-sm font-normal text-indigo-600">
                  for what&apos;s shown
                </span>
              )}
            </h2>
            <p className="text-sm text-slate-500">
              {pending.length} order{pending.length === 1 ? "" : "s"} ·{" "}
              {formatMoney(pendingValue)}
            </p>
          </div>
          <div className="grid gap-2 sm:grid-cols-2">
            {tally.map(([name, qty]) => (
              <div
                key={name}
                className="flex items-center justify-between gap-3 rounded-xl bg-slate-50 px-4 py-2.5"
              >
                <span className="font-medium text-slate-800">{name}</span>
                <span className="text-lg font-bold text-slate-900">×{qty}</span>
              </div>
            ))}
          </div>
        </section>
      )}

      {visible.length === 0 ? (
        <p className="rounded-2xl border border-slate-200 bg-white p-6 text-sm text-slate-500">
          {orders.length === 0
            ? "No orders for today yet."
            : "Nothing matches those filters."}
        </p>
      ) : (
        <div className="space-y-2">
          {visible.map((order, index) => {
            const heading = groupHeading(order, groupBy);
            const newGroup =
              heading !== null && heading !== groupHeading(visible[index - 1], groupBy);
            const size = heading === null ? 0 : groupSizes.get(heading) ?? 0;
            return (
              <div key={order.id}>
                {newGroup && (
                  <h2
                    className={`mb-2 flex items-baseline gap-2 text-sm font-bold uppercase tracking-wide text-slate-500 ${
                      index === 0 ? "" : "mt-5"
                    }`}
                  >
                    {heading}
                    <span className="text-xs font-medium normal-case tracking-normal text-slate-400">
                      {size} order{size === 1 ? "" : "s"}
                    </span>
                  </h2>
                )}
                <OrderCard order={order} showSchool={showSchool} />
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

/**
 * One order, laid out the way it gets read: number first because that's what
 * gets called across the counter, then who it's for, then what to make.
 */
function OrderCard({
  order,
  showSchool,
}: {
  order: BoardOrder;
  showSchool: boolean;
}) {
  const collected = order.status === "COLLECTED";

  return (
    <div
      className={`flex flex-wrap items-start gap-4 rounded-2xl border bg-white p-4 ${
        collected ? "border-slate-200 opacity-60" : "border-slate-200"
      }`}
    >
      <div
        className={`flex min-w-14 flex-col items-center rounded-xl px-3 py-2 ${
          collected ? "bg-slate-100 text-slate-500" : "bg-indigo-50 text-indigo-700"
        }`}
      >
        <span className="text-xs font-medium uppercase tracking-wide">Order</span>
        <span className="text-2xl font-bold leading-tight">
          {order.orderNumber ?? "–"}
        </span>
      </div>

      <div className="min-w-48 flex-1">
        <p className="font-semibold text-slate-900">
          {order.studentName}
          {order.className && (
            <span className="ml-2 rounded bg-slate-100 px-1.5 py-0.5 text-xs font-medium text-slate-600">
              {order.className}
            </span>
          )}
          {collected && (
            <span className="ml-2 text-xs font-medium text-emerald-600">
              collected ✓
            </span>
          )}
        </p>
        <p className="text-sm font-medium text-indigo-600">
          {order.slotLabel
            ? `${order.slotLabel}${order.slotTimes ? ` · ${order.slotTimes}` : ""}`
            : "No pickup time"}
        </p>

        <ul className="mt-2 space-y-1.5">
          {order.lines.map((line, i) => (
            <li key={i}>
              <p className="font-medium text-slate-900">
                {line.name}
                {line.qty > 1 && (
                  <span className="ml-1.5 font-bold text-slate-900">×{line.qty}</span>
                )}
              </p>
              {groupOptions(line).map((group) => (
                <p key={group.groupName} className="pl-3 text-sm text-slate-600">
                  <span className="text-slate-400">{group.groupName}:</span>{" "}
                  {group.names.join(", ")}
                </p>
              ))}
            </li>
          ))}
        </ul>

        {/* Loud on purpose: it's the one part of the order that isn't on the
            menu, so it's the easiest thing to make without noticing. */}
        {order.notes && (
          <p className="mt-2 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-sm font-medium text-amber-900">
            <span className="uppercase tracking-wide text-amber-700">Note</span>{" "}
            · {order.notes}
          </p>
        )}

        <p className="mt-2 text-xs text-slate-400">
          {[
            showSchool ? order.schoolName : null,
            order.source === "KIOSK"
              ? "Office kiosk"
              : order.source === "STAFF"
              ? `Taken by ${order.placedByName ?? "staff"}`
              : `Ordered by ${order.placedByName ?? "a parent"}`,
          ]
            .filter(Boolean)
            .join(" · ")}
        </p>
      </div>

      <div className="flex shrink-0 flex-col items-end gap-2">
        <span className="font-semibold text-slate-900">{formatMoney(order.total)}</span>
        {!collected && (
          <CancelOrderButton
            preorderId={order.id}
            studentName={order.studentName}
            orderLabel={orderLabel(order.orderNumber)}
            total={formatMoney(order.total)}
          />
        )}
      </div>
    </div>
  );
}

/** Sorts unnumbered and unslotted orders last rather than first. */
const LAST = "￿";

const comparators: Record<SortKey, (a: BoardOrder, b: BoardOrder) => number> = {
  // Within a window, by number — that's the order they were promised in.
  pickup: (a, b) =>
    (a.slotStart ?? LAST).localeCompare(b.slotStart ?? LAST) ||
    (a.orderNumber ?? Infinity) - (b.orderNumber ?? Infinity),
  number: (a, b) => (a.orderNumber ?? Infinity) - (b.orderNumber ?? Infinity),
  class: (a, b) =>
    (a.className ?? LAST).localeCompare(b.className ?? LAST, undefined, {
      numeric: true,
    }) || a.studentName.localeCompare(b.studentName),
  name: (a, b) => a.studentName.localeCompare(b.studentName),
};

function groupHeading(
  order: BoardOrder | undefined,
  groupBy: "slot" | "class" | null
): string | null {
  if (!order || !groupBy) return null;
  if (groupBy === "slot") {
    if (!order.slotLabel) return "No pickup time";
    return order.slotTimes ? `${order.slotLabel} · ${order.slotTimes}` : order.slotLabel;
  }
  return order.className ?? "No class";
}

/**
 * How many of each thing to make, counting every *variant* separately — three
 * combos with different sauces are three different jobs at the bench, so
 * collapsing them by base name would give the kitchen a useless number.
 */
function tallyLines(orders: BoardOrder[]): [string, number][] {
  const counts = new Map<string, number>();
  for (const order of orders) {
    for (const line of order.lines) {
      const label = line.options?.length
        ? `${line.name} (${line.options.map((o) => o.name).join(", ")})`
        : line.name;
      counts.set(label, (counts.get(label) ?? 0) + line.qty);
    }
  }
  return [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
}
