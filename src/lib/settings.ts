import { prisma } from "./db";
import { emailConfigured } from "./email";

/**
 * Admin-editable app settings, stored one row per key in the Setting table.
 * Values are strings; helpers below wrap the booleans we actually use.
 */

export const SETTINGS = {
  onlineTopups: "online_topups_enabled",
  parentSignup: "parent_signup_enabled",
  email: "email_enabled",
} as const;

// All default to off: the school starts cash-only, registration is opened
// deliberately by an admin rather than being public from day one, and email
// stays off until a sending provider is actually connected.
const DEFAULTS: Record<string, string> = {
  [SETTINGS.onlineTopups]: "off",
  [SETTINGS.parentSignup]: "off",
  [SETTINGS.email]: "off",
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
    where: {
      key: { in: [SETTINGS.onlineTopups, SETTINGS.parentSignup, SETTINGS.email] },
    },
  });
  const value = (key: string) =>
    (rows.find((r) => r.key === key)?.value ?? DEFAULTS[key]) === "on";
  return {
    onlineTopups: value(SETTINGS.onlineTopups),
    parentSignup: value(SETTINGS.parentSignup),
    email: value(SETTINGS.email),
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

/**
 * Whether the app sends email at all.
 *
 * Like online top-ups, this needs both a configured provider and the admin
 * toggle — a toggle that claims to send mail with no provider behind it would
 * strand parents on a screen waiting for a code that can never arrive.
 *
 * Everything email-shaped keys off this: address confirmation, the
 * forgot-password flow, and the reminder banners. When it's false those
 * routes are closed outright rather than silently failing, and parents are
 * pointed at the school office instead. Note that this is checked live, so
 * turning email on later immediately reinstates confirmation for parents who
 * signed up without it — we never write a fake `emailVerifiedAt` to paper
 * over the feature being off.
 */
export async function emailAvailable(): Promise<boolean> {
  if (!emailConfigured()) return false;
  return (await getSetting(SETTINGS.email)) === "on";
}
