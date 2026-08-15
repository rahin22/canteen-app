import type { PurchaseLine } from "./ledger";

/**
 * Pure formatting helpers for order lines.
 *
 * Kept apart from src/lib/preorders.ts so client components can use them —
 * importing that module would drag Prisma into the browser bundle.
 */

/**
 * How long a special request may be. A note is a line the kitchen reads at a
 * glance while making the food, not correspondence — and the box that collects
 * it has to agree with the server that rejects it.
 */
export const MAX_NOTE_LENGTH = 200;

/** Narrows a stored `items` Json blob back to the shape we wrote. */
export function readLines(items: unknown): PurchaseLine[] {
  if (!Array.isArray(items)) return [];
  return items.filter(
    (l): l is PurchaseLine =>
      typeof l === "object" &&
      l !== null &&
      typeof (l as PurchaseLine).name === "string" &&
      typeof (l as PurchaseLine).price === "number" &&
      typeof (l as PurchaseLine).qty === "number"
  );
}

/**
 * How everyone refers to one order — "#3".
 *
 * Short on purpose: it's read aloud across a counter and matched against a
 * list, so it counts from 1 each morning per school rather than being a long
 * unique id. Orders taken before numbering existed have none.
 */
export function orderLabel(orderNumber: number | null): string {
  return orderNumber === null ? "no number" : `#${orderNumber}`;
}

/** e.g. "Chicken roll ×2, Juice" — names only, for tight spaces. */
export function describeLines(items: PurchaseLine[]): string {
  const parts = items.map((l) => (l.qty > 1 ? `${l.name} ×${l.qty}` : l.name));
  return parts.length ? parts.join(", ") : "Order";
}

/**
 * A line's chosen options gathered under the question each answered —
 * `[{ groupName: "Sauce", names: ["Tomato", "Garlic"] }]`.
 *
 * For the places that lay an order out as a ticket rather than a sentence,
 * which is how the kitchen reads it: one line per question, so nobody has to
 * work out which of five words in a bracket was the salad.
 */
export function groupOptions(
  line: PurchaseLine
): { groupName: string; names: string[] }[] {
  const groups: { groupName: string; names: string[] }[] = [];
  for (const option of line.options ?? []) {
    const existing = groups.find((g) => g.groupName === option.groupName);
    if (existing) existing.names.push(option.name);
    else groups.push({ groupName: option.groupName, names: [option.name] });
  }
  return groups;
}

/**
 * The full order including chosen options, for anyone who has to *make* it —
 * "Combo ×1 (Beef Burger, Garlic, Slushy)". Names only, no prices: the kitchen
 * is reading this to assemble food, not to check the maths.
 */
export function describeLinesDetailed(items: PurchaseLine[]): string {
  const parts = items.map((line) => {
    const base = line.qty > 1 ? `${line.name} ×${line.qty}` : line.name;
    if (!line.options?.length) return base;
    return `${base} (${line.options.map((o) => o.name).join(", ")})`;
  });
  return parts.length ? parts.join(", ") : "Order";
}
