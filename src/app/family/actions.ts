"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { requireRole } from "@/lib/auth";
import { emailAvailable, parentSignupOpen } from "@/lib/settings";
import { rateLimit } from "@/lib/ratelimit";
import { normalizeUsername } from "@/lib/username";
import { PhotoError, processPhotoUpload } from "@/lib/photos";

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
  const schoolId = normalizeUsername(String(formData.get("schoolId") || ""));
  const className = String(formData.get("className") || "").trim();
  const photo = formData.get("photo");

  if (!name) return { error: "Enter your child's full name." };
  if (!schoolId) return { error: "Enter your child's school student ID." };
  if (!(photo instanceof File)) return { error: "Attach a photo of your child." };

  const [pendingCount, childCount, duplicate] = await Promise.all([
    prisma.childRegistration.count({
      where: { parentId: session.uid, status: "PENDING" },
    }),
    prisma.user.count({ where: { parents: { some: { id: session.uid } } } }),
    prisma.childRegistration.findFirst({
      where: { parentId: session.uid, schoolId, status: "PENDING" },
    }),
  ]);

  if (duplicate) {
    return { error: `You've already submitted a request for student ID "${schoolId}".` };
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
      schoolId,
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
