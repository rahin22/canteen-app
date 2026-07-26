import { randomBytes } from "crypto";

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
