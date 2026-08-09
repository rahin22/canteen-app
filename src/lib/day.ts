/**
 * The canteen's local day.
 *
 * The server almost certainly runs in UTC, which in Australia lands the day
 * boundary at 10 or 11am — the middle of the lunch rush. Anything that means
 * "today" to a human (the daily spend cap, "spent today" figures) has to be
 * measured against the school's own timezone instead, so the reset happens
 * overnight where nobody is standing at the till.
 */

const FALLBACK_TZ = "Australia/Sydney";

/**
 * Uses SCHOOL_TIMEZONE if set, otherwise the server's own TZ, which the
 * deployment docs already ask you to set. Falling back to a real school
 * timezone rather than UTC is deliberate: an unset variable should give a
 * sensible overnight reset, not one at lunchtime.
 */
function resolveTimeZone(): string {
  for (const candidate of [process.env.SCHOOL_TIMEZONE, process.env.TZ]) {
    const configured = candidate?.trim();
    if (!configured) continue;
    try {
      // Throws RangeError on an unknown IANA name.
      new Intl.DateTimeFormat("en-GB", { timeZone: configured });
      return configured;
    } catch {
      console.warn(
        `"${configured}" is not a known IANA timezone — falling back to ${FALLBACK_TZ}.`
      );
    }
  }
  return FALLBACK_TZ;
}

export const SCHOOL_TIMEZONE = resolveTimeZone();

const clockFormat = new Intl.DateTimeFormat("en-GB", {
  timeZone: SCHOOL_TIMEZONE,
  hourCycle: "h23",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
});

/**
 * The instant local midnight most recently passed, as a UTC Date.
 *
 * Works by reading the local wall clock and subtracting it, which avoids
 * pulling in a timezone library. The one inaccuracy is a DST changeover
 * earlier the same day, which shifts the boundary by an hour — in Australia
 * that happens at 2am on a Sunday, when the canteen is shut.
 */
export function startOfSchoolDay(now: Date = new Date()): Date {
  return new Date(now.getTime() - msIntoSchoolDay(now));
}

function msIntoSchoolDay(now: Date): number {
  const parts = clockFormat.formatToParts(now);
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value ?? 0);
  return (
    (get("hour") * 3600 + get("minute") * 60 + get("second")) * 1000 +
    now.getMilliseconds()
  );
}

/** Minutes elapsed since local midnight — for comparing against a cutoff. */
export function schoolClockMinutes(now: Date = new Date()): number {
  return Math.floor(msIntoSchoolDay(now) / 60000);
}

/** Turns a stored "HH:MM" cutoff into minutes since midnight. */
export function parseClockMinutes(hhmm: string): number {
  const [hours, minutes] = hhmm.split(":").map(Number);
  return hours * 60 + minutes;
}

/** Renders "09:30" the way the school would read it, e.g. "9:30 am". */
export function formatClock(hhmm: string): string {
  const [hours, minutes] = hhmm.split(":").map(Number);
  // Any date works — only the time-of-day fields are formatted.
  const when = new Date(Date.UTC(2000, 0, 1, hours, minutes));
  return new Intl.DateTimeFormat(process.env.NEXT_PUBLIC_LOCALE || "en-AU", {
    timeZone: "UTC",
    hour: "numeric",
    minute: "2-digit",
  }).format(when);
}

const dateFormat = new Intl.DateTimeFormat(
  process.env.NEXT_PUBLIC_LOCALE || "en-AU",
  { timeZone: SCHOOL_TIMEZONE, weekday: "short", day: "numeric", month: "short" }
);

/** e.g. "Sun, 9 Aug" — used to label which day a cap applies to. */
export function formatSchoolDay(date: Date = new Date()): string {
  return dateFormat.format(date);
}
