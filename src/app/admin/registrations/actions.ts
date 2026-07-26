"use server";

import bcrypt from "bcryptjs";
import { prisma } from "@/lib/db";
import { requireRole } from "@/lib/auth";
import { generateCardToken, generatePassword } from "@/lib/cards";

export type ReviewState = {
  error?: string;
  success?: string;
  credentials?: { name: string; username: string; password: string };
};

/**
 * Approves a parent's request.
 *
 * If a student with that school ID already exists (the usual case — the school
 * bulk-imports its roll), the parent is linked to that existing record rather
 * than a duplicate being created. Otherwise a new student account and QR card
 * are created and the login details are handed back to the admin.
 */
export async function approveRegistration(
  registrationId: string
): Promise<ReviewState> {
  const session = await requireRole("ADMIN");

  const registration = await prisma.childRegistration.findFirst({
    where: { id: registrationId, status: "PENDING" },
  });
  if (!registration) return { error: "That request has already been actioned." };

  const existing = await prisma.user.findUnique({
    where: { username: registration.schoolId },
    select: { id: true, role: true, name: true, photoId: true },
  });

  if (existing && existing.role !== "STUDENT") {
    return {
      error: `"${registration.schoolId}" is already in use by a non-student account. Ask the parent to check the ID.`,
    };
  }

  const reviewed = {
    status: "APPROVED" as const,
    reviewerId: session.uid,
    reviewedAt: new Date(),
    note: null,
  };

  // Link to the existing student record.
  if (existing) {
    const previousPhotoId = existing.photoId;
    await prisma.$transaction(async (tx) => {
      await tx.user.update({
        where: { id: existing.id },
        data: {
          parents: { connect: { id: registration.parentId } },
          // The photo the parent supplied becomes the student's ID photo.
          ...(registration.photoId ? { photoId: registration.photoId } : {}),
        },
      });
      if (registration.photoId && previousPhotoId) {
        await tx.photo.delete({ where: { id: previousPhotoId } });
      }
      await tx.childRegistration.update({
        where: { id: registration.id },
        data: { ...reviewed, studentId: existing.id },
      });
    });

    return { success: `Linked to the existing record for ${existing.name}.` };
  }

  // No match — create the student account and their first card.
  const password = generatePassword();
  try {
    await prisma.$transaction(async (tx) => {
      const student = await tx.user.create({
        data: {
          role: "STUDENT",
          name: registration.name,
          username: registration.schoolId,
          className: registration.className,
          passwordHash: await bcrypt.hash(password, 10),
          photoId: registration.photoId,
          parents: { connect: { id: registration.parentId } },
          cards: { create: { token: generateCardToken() } },
        },
      });
      await tx.childRegistration.update({
        where: { id: registration.id },
        data: { ...reviewed, studentId: student.id },
      });
    });
  } catch {
    return {
      error: "Couldn't create that student — the school ID may have just been taken.",
    };
  }

  return {
    success: `Created a card for ${registration.name}.`,
    credentials: {
      name: registration.name,
      username: registration.schoolId,
      password,
    },
  };
}

/**
 * Declines a request. The child's photo is deleted straight away — there's no
 * reason to keep an image of a child the school didn't accept.
 */
export async function rejectRegistration(
  registrationId: string,
  reason: string
): Promise<ReviewState> {
  const session = await requireRole("ADMIN");
  const note = reason.trim();
  if (!note) return { error: "Give the parent a reason." };

  const registration = await prisma.childRegistration.findFirst({
    where: { id: registrationId, status: "PENDING" },
    select: { id: true, photoId: true },
  });
  if (!registration) return { error: "That request has already been actioned." };

  await prisma.$transaction(async (tx) => {
    await tx.childRegistration.update({
      where: { id: registration.id },
      data: {
        status: "REJECTED",
        note,
        reviewerId: session.uid,
        reviewedAt: new Date(),
      },
    });
    if (registration.photoId) {
      await tx.photo.delete({ where: { id: registration.photoId } });
    }
  });

  return { success: "Request declined." };
}
