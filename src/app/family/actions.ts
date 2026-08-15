"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { requireRole } from "@/lib/auth";
import { emailAvailable, parentSignupOpen } from "@/lib/settings";
import { rateLimit } from "@/lib/ratelimit";
import { normalizeUsername } from "@/lib/username";
import { PhotoError, processPhotoUpload } from "@/lib/photos";
import { formatMoney } from "@/lib/money";
import { MAX_DAILY_LIMIT } from "@/lib/ledger";
import { resolveSchoolId } from "@/lib/schools";
import {
  cancelPreorder,
  placePreorder,
  PreorderError,
  type PreorderLine,
} from "@/lib/preorders";

export type RegisterState = { error?: string };

const MAX_PENDING = 5;
const MAX_CHILDREN = 12;

/**
 * A parent submits one of their children for approval. This never creates a
 * student account, a card or a balance — it only files a request an admin has
 * to action, so the public signup flow can't be used to mint accounts.
 */
export async function registerChild(
  _prev: RegisterState,
  formData: FormData
): Promise<RegisterState> {
  const session = await requireRole("PARENT");
  if (!(await parentSignupOpen())) {
    return {
      error: "Registration is closed at the moment. Please contact the school office.",
    };
  }
  if (!rateLimit(`register:${session.uid}`, 10, 60 * 60 * 1000)) {
    return { error: "Too many submissions. Please try again later." };
  }

  // A confirmed email is required before anything reaches the approval queue:
  // it keeps fake signups out and guarantees the school can contact the
  // parent. Only enforceable while we're sending email — when we aren't, the
  // admin approval step is the gate, and it always was the one that mattered.
  if (await emailAvailable()) {
    const parent = await prisma.user.findUniqueOrThrow({
      where: { id: session.uid },
      select: { emailVerifiedAt: true },
    });
    if (!parent.emailVerifiedAt) {
      return { error: "Confirm your email address first — check your inbox for the code." };
    }
  }

  const name = String(formData.get("name") || "").trim();
  const studentIdCode = normalizeUsername(String(formData.get("studentIdCode") || ""));
  const schoolId = await resolveSchoolId(formData.get("school"));
  const className = String(formData.get("className") || "").trim();
  const photo = formData.get("photo");

  if (!name) return { error: "Enter your child's full name." };
  if (!schoolId) return { error: "Choose which school your child attends." };
  if (!studentIdCode) return { error: "Enter your child's school student ID." };
  if (!(photo instanceof File)) return { error: "Attach a photo of your child." };

  const [pendingCount, childCount, duplicate] = await Promise.all([
    prisma.childRegistration.count({
      where: { parentId: session.uid, status: "PENDING" },
    }),
    prisma.user.count({ where: { parents: { some: { id: session.uid } } } }),
    prisma.childRegistration.findFirst({
      where: { parentId: session.uid, studentIdCode, schoolId, status: "PENDING" },
    }),
  ]);

  if (duplicate) {
    return {
      error: `You've already submitted a request for student ID "${studentIdCode}" at that school.`,
    };
  }
  if (pendingCount >= MAX_PENDING) {
    return { error: "You have too many requests waiting for approval." };
  }
  if (childCount >= MAX_CHILDREN) {
    return { error: "You've reached the maximum number of children per account." };
  }

  let processed;
  try {
    processed = await processPhotoUpload(photo);
  } catch (err) {
    if (err instanceof PhotoError) return { error: err.message };
    throw err;
  }

  await prisma.childRegistration.create({
    data: {
      parent: { connect: { id: session.uid } },
      name,
      studentIdCode,
      school: { connect: { id: schoolId } },
      className: className || null,
      photo: {
        create: {
          data: processed.data,
          mimeType: processed.mimeType,
          byteSize: processed.byteSize,
        },
      },
    },
  });

  revalidatePath("/family");
  redirect("/family?submitted=1");
}

/**
 * Places an order for a child from the parent portal. Identical rules to the
 * office kiosk — same cutoff, same limits, same affordability check — the only
 * difference is that here we know who placed it.
 */
export async function parentPlaceOrder(
  childId: string,
  lines: PreorderLine[],
  pickupSlotId: string,
  notes?: string
): Promise<{ ok: true } | { ok: false; error: string }> {
  const session = await requireRole("PARENT");
  const child = await ownChild(session.uid, childId);
  if (!child) return { ok: false, error: "Child not found." };

  try {
    await placePreorder({
      studentId: child.id,
      placedById: session.uid,
      source: "PARENT",
      lines,
      pickupSlotId,
      notes,
    });
  } catch (err) {
    if (err instanceof PreorderError) return { ok: false, error: err.message };
    throw err;
  }

  revalidatePath(`/family/${child.id}`);
  return { ok: true };
}

/** Lets a parent take back an order that hasn't been collected yet. */
export async function parentCancelOrder(childId: string, preorderId: string) {
  const session = await requireRole("PARENT");
  const child = await ownChild(session.uid, childId);
  if (!child) return;

  // Scoped to this parent's child, so a stray id can't reach another family.
  const order = await prisma.preorder.findFirst({
    where: { id: preorderId, studentId: child.id, status: "PENDING" },
    select: { id: true },
  });
  if (order) await cancelPreorder(order.id);
  revalidatePath(`/family/${child.id}`);
}

export type LimitState = { error?: string; success?: string };

/**
 * Parses a cap the parent typed. Unlike parseAmount this accepts zero — "$0"
 * is a meaningful cap, meaning the child can't spend anything today — while
 * still rejecting negatives and anything past MAX_DAILY_LIMIT.
 */
function parseLimit(input: string): number | null {
  const cleaned = input.trim().replace(/[^0-9.]/g, "");
  if (!cleaned) return null;
  const value = Number(cleaned);
  if (!Number.isFinite(value) || value < 0) return null;
  const cents = Math.round(value * 100);
  if (cents > MAX_DAILY_LIMIT) return null;
  return cents;
}

/** Confirms a child belongs to the signed-in parent before touching them. */
async function ownChild(parentId: string, childId: string) {
  return prisma.user.findFirst({
    where: { id: childId, role: "STUDENT", parents: { some: { id: parentId } } },
    select: { id: true, name: true },
  });
}

/**
 * Sets (or clears) a child's daily spend cap.
 *
 * The cap only bounds canteen purchases — it is not a hold on the balance, so
 * money already on the card stays there and rolls over to the next day.
 */
export async function setDailyLimit(
  _prev: LimitState,
  formData: FormData
): Promise<LimitState> {
  const session = await requireRole("PARENT");
  const childId = String(formData.get("childId") || "");
  const child = await ownChild(session.uid, childId);
  if (!child) return { error: "Child not found." };

  const raw = String(formData.get("amount") || "");
  if (!raw.trim()) {
    return { error: "Enter an amount, or use Remove limit to lift the cap." };
  }
  const cents = parseLimit(raw);
  if (cents === null) {
    return {
      error: `Enter an amount between ${formatMoney(0)} and ${formatMoney(MAX_DAILY_LIMIT)}.`,
    };
  }

  await prisma.user.update({
    where: { id: child.id },
    data: { dailyLimit: cents },
  });

  revalidatePath(`/family/${child.id}`);
  return {
    success:
      cents === 0
        ? `${child.name} can't spend anything at the canteen until you change this.`
        : `${child.name} can now spend up to ${formatMoney(cents)} per day.`,
  };
}

/** Lifts a child's daily cap entirely. */
export async function clearDailyLimit(childId: string): Promise<LimitState> {
  const session = await requireRole("PARENT");
  const child = await ownChild(session.uid, childId);
  if (!child) return { error: "Child not found." };

  await prisma.user.update({
    where: { id: child.id },
    data: { dailyLimit: null },
  });

  revalidatePath(`/family/${child.id}`);
  return { success: `Daily limit removed for ${child.name}.` };
}

/** Lets a parent take back a request that hasn't been actioned yet. */
export async function withdrawRegistration(registrationId: string) {
  const session = await requireRole("PARENT");
  const registration = await prisma.childRegistration.findFirst({
    where: { id: registrationId, parentId: session.uid, status: "PENDING" },
    select: { id: true, photoId: true },
  });
  if (!registration) return;

  await prisma.$transaction([
    prisma.childRegistration.delete({ where: { id: registration.id } }),
    // Don't leave the child's photo behind once the request is gone.
    ...(registration.photoId
      ? [prisma.photo.delete({ where: { id: registration.photoId } })]
      : []),
  ]);
  revalidatePath("/family");
}
