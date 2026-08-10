import { prisma } from "./db";
import type { PurchaseLine } from "./ledger";

/**
 * Menu item options — sauces, salad, a combo's meal and drink.
 *
 * The rules live in the data rather than in code: a group carries how many
 * options must and may be chosen, and each option carries its own extra cost.
 * That one shape covers a free multi-pick (salad), a required single pick
 * (which drink), and a paid extra, so the canteen can add whatever the menu
 * needs without a deploy.
 */

export class ModifierError extends Error {}

export type ChosenLine = {
  menuItemId: string;
  qty: number;
  /** Ids of the options picked, across all of the item's groups. */
  optionIds?: string[];
};

export type OptionOffer = {
  id: string;
  name: string;
  /** Extra cost in cents; 0 for a free choice. */
  price: number;
};

export type GroupOffer = {
  id: string;
  name: string;
  minSelect: number;
  maxSelect: number;
  options: OptionOffer[];
};

/** A menu item as offered to a customer, with whatever choices it carries. */
export type ItemOffer = {
  id: string;
  name: string;
  price: number;
  category: string | null;
  description: string | null;
  groups: GroupOffer[];
};

/**
 * The orderable menu for a school: active, in-stock items with their choices.
 *
 * Sold-out options are dropped the same way sold-out items are, so a group
 * whose stock has run out simply offers fewer choices.
 */
export async function schoolMenuWithModifiers(
  schoolId: string | null
): Promise<ItemOffer[]> {
  if (!schoolId) return [];
  const items = await prisma.menuItem.findMany({
    where: { schoolId, active: true, soldOut: false },
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
    include: {
      modifierGroups: {
        where: { active: true },
        orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
        include: {
          options: {
            where: { soldOut: false },
            orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
          },
        },
      },
    },
  });

  return items.map((item) => ({
    id: item.id,
    name: item.name,
    price: item.price,
    category: item.category,
    description: item.description,
    groups: item.modifierGroups
      // A group with nothing left in stock would be an unanswerable question.
      .filter((g) => g.options.length > 0)
      .map((g) => ({
        id: g.id,
        name: g.name,
        minSelect: g.minSelect,
        maxSelect: Math.max(1, g.maxSelect),
        options: g.options.map((o) => ({ id: o.id, name: o.name, price: o.price })),
      })),
  }));
}

/**
 * Prices ordered lines from live data, including their chosen options.
 *
 * Nothing about price or validity is taken from the client — it sends ids and
 * quantities only. Every option is checked to belong to a group actually
 * attached to that item, and each group's min/max is enforced here rather than
 * only in the UI, so a stale page or a crafted request can't produce a combo
 * with no drink or three mains.
 */
export async function priceLinesWithModifiers(
  lines: ChosenLine[],
  schoolId: string,
  opts: { maxLines: number; maxQtyPerLine: number }
): Promise<{ priced: PurchaseLine[]; total: number }> {
  if (lines.length === 0) throw new ModifierError("Nothing chosen yet.");
  if (lines.length > opts.maxLines) {
    throw new ModifierError("That's too many items for one order.");
  }

  const itemIds = [...new Set(lines.map((l) => l.menuItemId))];
  const items = await prisma.menuItem.findMany({
    where: { id: { in: itemIds }, active: true, soldOut: false, schoolId },
    include: {
      modifierGroups: {
        where: { active: true },
        include: { options: true },
      },
    },
  });
  if (items.length !== itemIds.length) {
    throw new ModifierError("The menu changed — please choose again.");
  }

  const priced: PurchaseLine[] = [];
  let total = 0;

  for (const line of lines) {
    const item = items.find((i) => i.id === line.menuItemId)!;
    const qty = Math.floor(line.qty);
    if (!Number.isFinite(qty) || qty < 1 || qty > opts.maxQtyPerLine) {
      throw new ModifierError("Invalid quantity.");
    }

    const wanted = new Set(line.optionIds ?? []);
    const chosen: { groupName: string; name: string; price: number }[] = [];
    let unitPrice = item.price;

    for (const group of item.modifierGroups) {
      const picks = group.options.filter((o) => wanted.has(o.id));
      for (const pick of picks) wanted.delete(pick.id);

      if (picks.some((p) => p.soldOut)) {
        throw new ModifierError(
          `${picks.find((p) => p.soldOut)!.name} has just sold out — please choose again.`
        );
      }
      if (picks.length < group.minSelect) {
        throw new ModifierError(
          group.minSelect === 1
            ? `Choose a ${group.name.toLowerCase()} for ${item.name}.`
            : `Choose at least ${group.minSelect} from ${group.name} for ${item.name}.`
        );
      }
      if (picks.length > Math.max(1, group.maxSelect)) {
        throw new ModifierError(
          `You can only choose ${Math.max(1, group.maxSelect)} from ${group.name}.`
        );
      }

      for (const pick of picks) {
        chosen.push({ groupName: group.name, name: pick.name, price: pick.price });
        unitPrice += pick.price;
      }
    }

    // Anything left over didn't belong to this item at all.
    if (wanted.size > 0) {
      throw new ModifierError("The menu changed — please choose again.");
    }

    priced.push({
      name: item.name,
      price: unitPrice,
      qty,
      ...(chosen.length > 0 ? { options: chosen } : {}),
    });
    total += unitPrice * qty;
  }

  if (total <= 0) throw new ModifierError("Nothing chosen yet.");
  return { priced, total };
}
