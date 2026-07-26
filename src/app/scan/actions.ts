"use server";

import { prisma } from "@/lib/db";
import { requireRole } from "@/lib/auth";
import { chargeStudent, LedgerError, type PurchaseLine } from "@/lib/ledger";
import { normalizeNfcSerial, NFC_SCAN_PREFIX } from "@/lib/nfc";

export type ScanStudent = {
  studentId: string;
  name: string;
  className: string | null;
  username: string;
  balance: number;
  /** Whether an ID photo exists — the image itself is fetched authenticated. */
  hasPhoto: boolean;
};

export type LookupResult =
  | { ok: true; student: ScanStudent }
  | { ok: false; error: string };

/**
 * Resolves a scanned QR token (or a manually typed username) to a student.
 */
export async function lookupCard(rawInput: string): Promise<LookupResult> {
  await requireRole("ADMIN", "OPERATOR");
  let input = rawInput.trim();
  if (!input) return { ok: false, error: "Nothing scanned." };

  // NFC taps arrive as a raw hardware serial; map to the stored token form.
  if (input.startsWith(NFC_SCAN_PREFIX)) {
    const token = normalizeNfcSerial(input.slice(NFC_SCAN_PREFIX.length));
    if (!token) return { ok: false, error: "Unreadable NFC card." };
    input = token;
  }

  const card = await prisma.card.findUnique({
    where: { token: input },
    include: { user: true },
  });

  let user = card?.user ?? null;
  if (card && card.status !== "ACTIVE") {
    return { ok: false, error: `This card is ${card.status.toLowerCase()}. Ask the office for a replacement.` };
  }
  if (!card) {
    // Manual fallback: operator typed a student ID/username.
    user = await prisma.user.findUnique({
      where: { username: input.toLowerCase() },
    });
    if (user && user.role !== "STUDENT") user = null;
  }

  if (!user) return { ok: false, error: "Card not recognised." };
  if (!user.active) return { ok: false, error: "This account is disabled." };

  return {
    ok: true,
    student: {
      studentId: user.id,
      name: user.name,
      className: user.className,
      username: user.username,
      balance: user.balance,
      hasPhoto: Boolean(user.photoId),
    },
  };
}

export type ChargeInput = {
  studentId: string;
  lines: { menuItemId: string; qty: number }[];
  customAmount?: number; // cents
};

export type ChargeResult =
  | { ok: true; newBalance: number; total: number }
  | { ok: false; error: string };

export async function charge(input: ChargeInput): Promise<ChargeResult> {
  const session = await requireRole("ADMIN", "OPERATOR");

  // Recompute the total server-side from live menu prices — never trust
  // client-provided prices.
  const ids = input.lines.map((l) => l.menuItemId);
  const menuItems = ids.length
    ? await prisma.menuItem.findMany({ where: { id: { in: ids }, active: true } })
    : [];
  if (menuItems.length !== new Set(ids).size) {
    return { ok: false, error: "Menu changed — please rebuild the order." };
  }

  const lines: PurchaseLine[] = [];
  let total = 0;
  for (const l of input.lines) {
    const item = menuItems.find((m) => m.id === l.menuItemId)!;
    const qty = Math.floor(l.qty);
    if (qty < 1 || qty > 50) return { ok: false, error: "Invalid quantity." };
    lines.push({ name: item.name, price: item.price, qty });
    total += item.price * qty;
  }
  if (input.customAmount) {
    const c = Math.floor(input.customAmount);
    if (!Number.isFinite(c) || c <= 0 || c > 50000) {
      return { ok: false, error: "Invalid custom amount." };
    }
    lines.push({ name: "Custom amount", price: c, qty: 1 });
    total += c;
  }
  if (total <= 0) return { ok: false, error: "Order is empty." };

  try {
    const result = await chargeStudent({
      studentId: input.studentId,
      amount: total,
      operatorId: session.uid,
      items: lines,
    });
    return { ok: true, newBalance: result.newBalance, total };
  } catch (err) {
    if (err instanceof LedgerError) return { ok: false, error: err.message };
    throw err;
  }
}
