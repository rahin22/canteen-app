/**
 * NFC cards are identified by their hardware serial number (UID), read via
 * Web NFC on Android Chrome. We store the serial as a Card token with an
 * "nfc:" prefix so it can never collide with QR tokens (base32, no colons).
 */
export function normalizeNfcSerial(raw: string): string | null {
  const hex = raw.toLowerCase().replace(/[^0-9a-f]/g, "");
  if (hex.length < 8 || hex.length > 20) return null;
  return `nfc:${hex}`;
}

/** Prefix used when the till forwards a raw serial for server-side lookup. */
export const NFC_SCAN_PREFIX = "nfc-serial:";
