import type { PurchaseLine } from "./ledger";

/**
 * Pure formatting helpers for order lines.
 *
 * Kept apart from src/lib/preorders.ts so client components can use them —
 * importing that module would drag Prisma into the browser bundle.
 */

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

/** e.g. "Chicken roll ×2, Juice". */
export function describeLines(items: PurchaseLine[]): string {
  const parts = items.map((l) => (l.qty > 1 ? `${l.name} ×${l.qty}` : l.name));
  return parts.length ? parts.join(", ") : "Order";
}
