import { prisma } from "./db";

/**
 * Admin-editable app settings, stored one row per key in the Setting table.
 * Values are strings; helpers below wrap the booleans we actually use.
 */

export const SETTINGS = {
  onlineTopups: "online_topups_enabled",
  parentSignup: "parent_signup_enabled",
} as const;

// Both default to off: the school starts cash-only, and registration is
// opened deliberately by an admin rather than being public from day one.
const DEFAULTS: Record<string, string> = {
  [SETTINGS.onlineTopups]: "off",
  [SETTINGS.parentSignup]: "off",
};

export async function getSetting(key: string): Promise<string> {
  const row = await prisma.setting.findUnique({ where: { key } });
  return row?.value ?? DEFAULTS[key] ?? "";
}

export async function setSetting(key: string, value: string) {
  await prisma.setting.upsert({
    where: { key },
    create: { key, value },
    update: { value },
  });
}

export async function getFlags() {
  const rows = await prisma.setting.findMany({
    where: { key: { in: [SETTINGS.onlineTopups, SETTINGS.parentSignup] } },
  });
  const value = (key: string) =>
    (rows.find((r) => r.key === key)?.value ?? DEFAULTS[key]) === "on";
  return {
    onlineTopups: value(SETTINGS.onlineTopups),
    parentSignup: value(SETTINGS.parentSignup),
  };
}

/**
 * Online top-ups need both a configured Stripe key and the admin toggle.
 * Every top-up surface and the checkout action itself go through this.
 */
export async function onlineTopupsAvailable(): Promise<boolean> {
  if (!process.env.STRIPE_SECRET_KEY) return false;
  return (await getSetting(SETTINGS.onlineTopups)) === "on";
}

export async function parentSignupOpen(): Promise<boolean> {
  return (await getSetting(SETTINGS.parentSignup)) === "on";
}
