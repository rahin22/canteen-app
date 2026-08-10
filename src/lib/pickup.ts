import { prisma } from "./db";
import {
  formatClock,
  formatSchoolDay,
  parseClockMinutes,
  schoolClockMinutes,
  startOfSchoolDay,
} from "./day";
import { preorderCutoff, preordersOpen } from "./settings";

/**
 * When an order is for, and when it can be collected.
 *
 * Ordering never "closes" any more. Before the cutoff you're ordering for
 * today; after it, for the next school day — which is what the canteen asked
 * for, since the point of preordering is to have food ready in advance rather
 * than to shut the shop at teatime.
 */

export type PickupSlotOption = {
  id: string;
  label: string;
  /** "HH:MM" local. */
  startTime: string;
  endTime: string;
  /** e.g. "9:50 am – 10:20 am". */
  timeLabel: string;
};

export type OrderingPlan =
  | {
      open: true;
      /** Local midnight of the day being ordered for. */
      serviceDate: Date;
      /** True when the cutoff has passed and this is tomorrow's service. */
      forNextDay: boolean;
      /** e.g. "Mon, 11 Aug". */
      dayLabel: string;
      slots: PickupSlotOption[];
      cutoffLabel: string;
    }
  | { open: false; enabled: boolean; reason: string };

function timeLabel(start: string, end: string): string {
  return `${formatClock(start)} – ${formatClock(end)}`;
}

/**
 * Local midnight of the day after `day`.
 *
 * Steps forward 30 hours and floors, rather than adding exactly 24 — on the
 * two days a year the clocks change, a flat day is 23 or 25 hours and plain
 * arithmetic lands an hour either side of midnight, which would then fail the
 * exact-match serviceDate queries.
 */
export function nextSchoolDay(day: Date): Date {
  return startOfSchoolDay(new Date(day.getTime() + 30 * 60 * 60 * 1000));
}

function toOption(slot: {
  id: string;
  label: string;
  startTime: string;
  endTime: string;
}): PickupSlotOption {
  return {
    id: slot.id,
    label: slot.label,
    startTime: slot.startTime,
    endTime: slot.endTime,
    timeLabel: timeLabel(slot.startTime, slot.endTime),
  };
}

/** Every collection window a school runs, in timetable order. */
export async function schoolPickupSlots(schoolId: string) {
  return prisma.pickupSlot.findMany({
    where: { schoolId, active: true },
    orderBy: [{ sortOrder: "asc" }, { startTime: "asc" }],
  });
}

/**
 * Works out which day a new order is for and which windows are still
 * collectable, for one school.
 *
 * Slots whose window has already ended are dropped from today's list — you
 * can't collect at first recess at two in the afternoon. If that leaves
 * nothing, the order rolls to the next day rather than being refused, which
 * also covers ordering in the gap between the last slot and the cutoff.
 */
export async function orderingPlan(
  schoolId: string | null,
  now: Date = new Date()
): Promise<OrderingPlan> {
  if (!(await preordersOpen())) {
    return {
      open: false,
      enabled: false,
      reason: "Preordering is switched off at the moment.",
    };
  }
  if (!schoolId) {
    return {
      open: false,
      enabled: true,
      reason: "This student isn't assigned to a school yet.",
    };
  }

  const slots = await schoolPickupSlots(schoolId);
  if (slots.length === 0) {
    return {
      open: false,
      enabled: true,
      reason: "No pickup times have been set up for this school yet.",
    };
  }

  const cutoff = await preorderCutoff();
  const cutoffLabel = formatClock(cutoff);
  const minutesNow = schoolClockMinutes(now);
  const pastCutoff = minutesNow >= parseClockMinutes(cutoff);

  // Before the cutoff, today is still on the table — but only for windows
  // that haven't finished.
  const remainingToday = pastCutoff
    ? []
    : slots.filter((s) => parseClockMinutes(s.endTime) > minutesNow);

  const forNextDay = remainingToday.length === 0;
  const today = startOfSchoolDay(now);
  const serviceDate = forNextDay ? nextSchoolDay(today) : today;

  return {
    open: true,
    serviceDate,
    forNextDay,
    dayLabel: formatSchoolDay(serviceDate),
    slots: (forNextDay ? slots : remainingToday).map(toOption),
    cutoffLabel,
  };
}

/** Renders a stored slot for display, e.g. "Primary Lunch · 1:10 pm – 1:50 pm". */
export function describeSlot(
  slot: { label: string; startTime: string; endTime: string } | null
): string {
  if (!slot) return "No pickup time";
  return `${slot.label} · ${timeLabel(slot.startTime, slot.endTime)}`;
}
