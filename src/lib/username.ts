/**
 * Usernames are case- and space-insensitive: student IDs get typed by hand at
 * the till, and parents sign in with an email address.
 */
export function normalizeUsername(raw: string): string {
  return raw.trim().toLowerCase().replace(/\s+/g, "");
}
