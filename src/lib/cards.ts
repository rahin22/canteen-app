import { randomBytes } from "crypto";
import { prisma } from "./db";
import { normalizeNfcSerial, NFC_SCAN_PREFIX } from "./nfc";
import type { UserModel } from "@/generated/prisma/models/User";

/**
 * Card tokens are printed inside the QR code. 20 random bytes in base32 —
 * unguessable, no ambiguous characters, survives OCR/manual entry if needed.
 */
export function generateCardToken(): string {
  const alphabet = "ABCDEFGHJKMNPQRSTVWXYZ0123456789";
  const bytes = randomBytes(20);
  let out = "";
  for (let i = 0; i < bytes.length; i++) out += alphabet[bytes[i] % 32];
  return out;
}

/** Generates a readable initial password like "TIGER-4829". */
export function generatePassword(): string {
  const words = [
    "TIGER", "EAGLE", "RIVER", "MAPLE", "STONE", "CLOUD", "FROST", "SOLAR",
    "CEDAR", "NOVA", "PIXEL", "COMET", "DELTA", "ECHO", "FLARE", "ORBIT",
  ];
  const word = words[randomBytes(1)[0] % words.length];
  const num = (randomBytes(2).readUInt16BE(0) % 9000) + 1000;
  return `${word}-${num}`;
}

export type CardLookup =
  | { ok: true; student: UserModel }
  | { ok: false; error: string };

/**
 * Resolves whatever came off a scanner — a QR token, an NFC serial, or a
 * student ID an operator typed — to the student it belongs to.
 *
 * Shared by the till and the office kiosk so the two can't disagree about
 * which cards are accepted. Note this identifies a student; it never
 * authenticates one. Neither caller signs anybody in off the back of it.
 */
export async function resolveCardInput(rawInput: string): Promise<CardLookup> {
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

  if (card && card.status !== "ACTIVE") {
    return {
      ok: false,
      error: `This card is ${card.status.toLowerCase()}. Ask the office for a replacement.`,
    };
  }

  let user = card?.user ?? null;
  if (!card) {
    // Manual fallback: someone typed a student ID/username.
    user = await prisma.user.findUnique({ where: { username: input.toLowerCase() } });
    if (user && user.role !== "STUDENT") user = null;
  }

  if (!user) return { ok: false, error: "Card not recognised." };
  if (!user.active) return { ok: false, error: "This account is disabled." };
  return { ok: true, student: user };
}
