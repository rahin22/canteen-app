"use server";

import { requireRole } from "@/lib/auth";
import { resolveCardInput } from "@/lib/cards";
import { canActOnSchool, canActOnStudent, schoolMenu } from "@/lib/schools";
import { orderingPlan, type OrderingPlan } from "@/lib/pickup";
import {
  cancelPreorder,
  orderHeadroom,
  placePreorder,
  upcomingPreorders,
  PreorderError,
  type PreorderLine,
  type PreorderSummary,
} from "@/lib/preorders";
import { prisma } from "@/lib/db";

/**
 * The office kiosk.
 *
 * The iPad itself is signed in as a staff account — that session is what
 * authorises these actions. A student tapping their card is *identified*, not
 * authenticated: no session is created for them, and nothing here exposes
 * anything beyond the name, balance and today's orders that a child would see
 * on their own card anyway. That's why every action re-checks the device role
 * rather than trusting a studentId the page happens to be holding.
 */

/** What the kiosk shows a student once their card is recognised. */
export type KioskStudent = {
  studentId: string;
  name: string;
  className: string | null;
  balance: number;
  /** Cents this student may commit to right now. */
  spendable: number;
  dailyLimit: number | null;
  pending: PreorderSummary[];
  /**
   * This student's own school menu. Sent with the lookup so one kiosk can sit
   * in either front office without being configured for a school.
   */
  menu: { id: string; name: string; price: number; category: string | null }[];
  schoolName: string | null;
  /** Which day this student is ordering for, and the free windows. */
  plan: OrderingPlan;
};

export type KioskLookupResult =
  | { ok: true; student: KioskStudent }
  | { ok: false; error: string };

async function loadStudent(studentId: string): Promise<KioskStudent> {
  const [student, headroom, pending] = await Promise.all([
    prisma.user.findUniqueOrThrow({
      where: { id: studentId },
      select: {
        id: true,
        name: true,
        className: true,
        balance: true,
        schoolId: true,
        school: { select: { name: true } },
      },
    }),
    orderHeadroom(studentId),
    upcomingPreorders(studentId),
  ]);
  return {
    studentId: student.id,
    name: student.name,
    className: student.className,
    balance: student.balance,
    spendable: headroom.spendable,
    dailyLimit: headroom.dailyLimit,
    pending,
    menu: await schoolMenu(student.schoolId),
    plan: await orderingPlan(student.schoolId),
    schoolName: student.school?.name ?? null,
  };
}

export async function kioskLookup(rawInput: string): Promise<KioskLookupResult> {
  await requireRole("ADMIN", "OPERATOR");

  const found = await resolveCardInput(rawInput);
  if (!found.ok) return { ok: false, error: found.error };
  if (found.student.role !== "STUDENT") {
    return { ok: false, error: "Only student cards can order here." };
  }
  // A kiosk signed in as one school's operator won't serve the other school,
  // so an iPad in the wrong office can't take orders it shouldn't.
  if (!(await canActOnSchool(found.student.schoolId))) {
    return { ok: false, error: "That card belongs to a student at another school." };
  }

  return { ok: true, student: await loadStudent(found.student.id) };
}

export type KioskOrderResult =
  | { ok: true; student: KioskStudent; placed: PreorderSummary }
  | { ok: false; error: string; student?: KioskStudent };

export async function kioskPlaceOrder(
  studentId: string,
  lines: PreorderLine[],
  pickupSlotId: string
): Promise<KioskOrderResult> {
  await requireRole("ADMIN", "OPERATOR");
  if (!(await canActOnStudent(studentId))) {
    return { ok: false, error: "That student is at another school." };
  }
  try {
    const placed = await placePreorder({
      studentId,
      // Nobody is signed in as this child, and the staff account that owns the
      // device didn't choose the food — so the order has no separate placer.
      placedById: null,
      source: "KIOSK",
      lines,
      pickupSlotId,
    });
    return { ok: true, student: await loadStudent(studentId), placed };
  } catch (err) {
    if (err instanceof PreorderError) {
      return { ok: false, error: err.message, student: await loadStudent(studentId) };
    }
    throw err;
  }
}

/** Lets a student take back an order they just placed, at the kiosk. */
export async function kioskCancelOrder(
  studentId: string,
  preorderId: string
): Promise<KioskLookupResult> {
  await requireRole("ADMIN", "OPERATOR");
  if (!(await canActOnStudent(studentId))) {
    return { ok: false, error: "That student is at another school." };
  }

  // Scope the cancel to the student on screen so a stale id can't reach
  // somebody else's lunch.
  const order = await prisma.preorder.findFirst({
    where: { id: preorderId, studentId, status: "PENDING" },
    select: { id: true },
  });
  if (order) await cancelPreorder(order.id);

  return { ok: true, student: await loadStudent(studentId) };
}
