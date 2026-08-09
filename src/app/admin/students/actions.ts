"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/db";
import { requireRole } from "@/lib/auth";
import { generateCardToken, generatePassword } from "@/lib/cards";
import { creditStudent, LedgerError } from "@/lib/ledger";
import { parseAmount, formatMoney } from "@/lib/money";
import { normalizeNfcSerial } from "@/lib/nfc";
import { normalizeUsername } from "@/lib/username";
import { canActOnStudent, resolveSchoolId } from "@/lib/schools";
import { PhotoError, processPhotoUpload } from "@/lib/photos";

export type ActionState = {
  error?: string;
  success?: string;
  credentials?: { username: string; password: string };
};

export async function createStudent(
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  await requireRole("ADMIN");
  const name = String(formData.get("name") || "").trim();
  const className = String(formData.get("className") || "").trim();
  const username = normalizeUsername(String(formData.get("username") || ""));
  const schoolId = await resolveSchoolId(formData.get("school"));
  if (!name || !username) return { error: "Name and student ID are required." };
  if (!schoolId) return { error: "Choose which school this student attends." };

  const existing = await prisma.user.findUnique({ where: { username } });
  if (existing) return { error: `Student ID "${username}" is already taken.` };

  const password = generatePassword();
  const student = await prisma.user.create({
    data: {
      role: "STUDENT",
      name,
      className: className || null,
      username,
      schoolId,
      passwordHash: await bcrypt.hash(password, 10),
      cards: { create: { token: generateCardToken() } },
    },
  });

  revalidatePath("/admin/students");
  redirect(`/admin/students/${student.id}?pw=${encodeURIComponent(password)}`);
}

export type BulkResult = {
  created: { name: string; className: string; username: string; password: string }[];
  errors: string[];
};

/**
 * Each line: "Name, Class" or "Name, Class, student-id".
 * Missing IDs are generated from the name plus a number.
 */
export async function bulkImport(
  text: string,
  school: string
): Promise<BulkResult> {
  await requireRole("ADMIN");
  const created: BulkResult["created"] = [];

  // Every row lands in one school — the import screen makes you pick which.
  const schoolId = await resolveSchoolId(school);
  if (!schoolId) {
    return { created, errors: ["Choose which school these students attend."] };
  }

  const lines = text
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);
  const errors: string[] = [];
  if (lines.length > 1000) return { created, errors: ["Maximum 1000 rows per import."] };

  for (const [index, line] of lines.entries()) {
    const parts = line.split(",").map((p) => p.trim());
    const [name, className = "", rawUsername = ""] = parts;
    if (!name) {
      errors.push(`Row ${index + 1}: missing name.`);
      continue;
    }
    let username = normalizeUsername(rawUsername);
    if (!username) {
      const base = normalizeUsername(name).replace(/[^a-z0-9]/g, "").slice(0, 12);
      username = `${base}${Math.floor(Math.random() * 900) + 100}`;
    }
    const password = generatePassword();
    try {
      await prisma.user.create({
        data: {
          role: "STUDENT",
          name,
          className: className || null,
          username,
          schoolId,
          passwordHash: await bcrypt.hash(password, 10),
          cards: { create: { token: generateCardToken() } },
        },
      });
      created.push({ name, className, username, password });
    } catch {
      errors.push(`Row ${index + 1} (${name}): student ID "${username}" already exists.`);
    }
  }

  revalidatePath("/admin/students");
  return { created, errors };
}

export async function updateStudent(
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  await requireRole("ADMIN");
  const id = String(formData.get("id"));
  const name = String(formData.get("name") || "").trim();
  const className = String(formData.get("className") || "").trim();
  const schoolId = await resolveSchoolId(formData.get("school"));
  if (!name) return { error: "Name is required." };
  if (!schoolId) return { error: "Choose which school this student attends." };

  await prisma.user.update({
    where: { id },
    // Moving a school changes which menu they're offered from the next scan.
    // Past transactions keep the prices they were actually charged.
    data: { name, className: className || null, schoolId },
  });
  revalidatePath(`/admin/students/${id}`);
  revalidatePath("/admin/students");
  return { success: "Saved." };
}

export async function resetPassword(id: string): Promise<ActionState> {
  await requireRole("ADMIN");
  const password = generatePassword();
  await prisma.user.update({
    where: { id, role: "STUDENT" },
    // Bumping the version signs the student out everywhere immediately.
    data: {
      passwordHash: await bcrypt.hash(password, 10),
      sessionVersion: { increment: 1 },
    },
  });
  const user = await prisma.user.findUniqueOrThrow({ where: { id } });
  return {
    success: "Password reset.",
    credentials: { username: user.username, password },
  };
}

export async function setStudentActive(id: string, active: boolean) {
  await requireRole("ADMIN");
  await prisma.user.update({ where: { id, role: "STUDENT" }, data: { active } });
  revalidatePath(`/admin/students/${id}`);
  revalidatePath("/admin/students");
}

/**
 * Blocks the student's existing QR cards and issues a fresh one (lost/stolen
 * card). NFC cards are left alone — block those individually.
 */
export async function reissueCard(studentId: string) {
  await requireRole("ADMIN");
  await prisma.$transaction([
    prisma.card.updateMany({
      where: { userId: studentId, status: "ACTIVE", type: "QR" },
      data: { status: "REPLACED" },
    }),
    prisma.card.create({
      data: { userId: studentId, token: generateCardToken() },
    }),
  ]);
  revalidatePath(`/admin/students/${studentId}`);
}

/** Registers a physical NFC card/wristband (by hardware serial) to a student. */
export async function attachNfcCard(
  studentId: string,
  rawSerial: string
): Promise<ActionState> {
  await requireRole("ADMIN");
  const token = normalizeNfcSerial(rawSerial);
  if (!token) return { error: "That doesn't look like a valid NFC serial number." };

  const existing = await prisma.card.findUnique({
    where: { token },
    include: { user: { select: { name: true } } },
  });
  if (existing) {
    return { error: `This NFC card is already registered to ${existing.user.name}.` };
  }

  await prisma.card.create({
    data: { userId: studentId, token, type: "NFC" },
  });
  revalidatePath(`/admin/students/${studentId}`);
  return { success: "NFC card attached." };
}

export async function setCardStatus(cardId: string, status: "ACTIVE" | "BLOCKED") {
  await requireRole("ADMIN");
  await prisma.card.update({ where: { id: cardId }, data: { status } });
  revalidatePath("/admin/students");
}

export async function cashTopup(
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  // Operators take cash at the counter, so this is one of the few admin
  // actions they're trusted with — for their own school's students only.
  const session = await requireRole("ADMIN", "OPERATOR");
  const studentId = String(formData.get("studentId"));
  const amount = parseAmount(String(formData.get("amount") || ""));
  const note = String(formData.get("note") || "").trim();
  if (amount === null) return { error: "Enter a valid amount." };
  if (amount > 100000) return { error: "Amount too large." };
  if (!(await canActOnStudent(studentId))) {
    return { error: "That student is at another school." };
  }

  try {
    const result = await creditStudent({
      studentId,
      amount,
      type: "TOPUP_CASH",
      operatorId: session.uid,
      note: note || undefined,
    });
    revalidatePath(`/admin/students/${studentId}`);
    return { success: `Top-up recorded. New balance: ${formatMoney(result.newBalance)}.` };
  } catch (err) {
    if (err instanceof LedgerError) return { error: err.message };
    throw err;
  }
}

/** Creates a PARENT account and links it to the student. */
export async function createParent(
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  await requireRole("ADMIN");
  const studentId = String(formData.get("studentId"));
  const name = String(formData.get("name") || "").trim();
  const username = normalizeUsername(String(formData.get("username") || ""));
  if (!name || !username) return { error: "Name and username are required." };

  const existing = await prisma.user.findUnique({ where: { username } });
  if (existing) return { error: `Username "${username}" is already taken.` };

  const password = generatePassword();
  await prisma.user.create({
    data: {
      role: "PARENT",
      name,
      username,
      passwordHash: await bcrypt.hash(password, 10),
      children: { connect: { id: studentId } },
    },
  });
  revalidatePath(`/admin/students/${studentId}`);
  return {
    success: "Parent account created and linked.",
    credentials: { username, password },
  };
}

/**
 * Resets a parent's password and shows the new one once.
 *
 * Parents can reset their own by email, but only when the school has email
 * switched on — otherwise this is the only way back in for a locked-out
 * parent, and the office identifying them in person is the check that
 * replaces the emailed code.
 */
export async function resetParentPassword(parentId: string): Promise<ActionState> {
  await requireRole("ADMIN");
  const password = generatePassword();
  const parent = await prisma.user.update({
    // role is part of the filter so this can never be pointed at a student,
    // an operator or another admin.
    where: { id: parentId, role: "PARENT" },
    data: {
      passwordHash: await bcrypt.hash(password, 10),
      // Signs the parent out everywhere, in case the lockout is because
      // someone else has their old password.
      sessionVersion: { increment: 1 },
    },
    select: { username: true },
  });
  return {
    success: "Password reset.",
    credentials: { username: parent.username, password },
  };
}

/** Links an existing PARENT account (by username) to the student. */
export async function linkParent(
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  await requireRole("ADMIN");
  const studentId = String(formData.get("studentId"));
  const username = normalizeUsername(String(formData.get("username") || ""));
  if (!username) return { error: "Enter the parent's username." };

  const parent = await prisma.user.findUnique({ where: { username } });
  if (!parent || parent.role !== "PARENT") {
    return { error: "No parent account with that username." };
  }

  await prisma.user.update({
    where: { id: studentId },
    data: { parents: { connect: { id: parent.id } } },
  });
  revalidatePath(`/admin/students/${studentId}`);
  return { success: `Linked ${parent.name}.` };
}

export async function unlinkParent(studentId: string, parentId: string) {
  await requireRole("ADMIN");
  await prisma.user.update({
    where: { id: studentId },
    data: { parents: { disconnect: { id: parentId } } },
  });
  revalidatePath(`/admin/students/${studentId}`);
}

/** Sets or replaces a student's identification photo. */
export async function uploadStudentPhoto(
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  await requireRole("ADMIN");
  const studentId = String(formData.get("studentId"));
  const photo = formData.get("photo");
  if (!(photo instanceof File)) return { error: "Choose a photo to upload." };

  const student = await prisma.user.findUnique({
    where: { id: studentId, role: "STUDENT" },
    select: { photoId: true },
  });
  if (!student) return { error: "Student not found." };

  let processed;
  try {
    processed = await processPhotoUpload(photo);
  } catch (err) {
    if (err instanceof PhotoError) return { error: err.message };
    throw err;
  }

  const previousPhotoId = student.photoId;
  await prisma.$transaction(async (tx) => {
    const created = await tx.photo.create({
      data: {
        data: processed.data,
        mimeType: processed.mimeType,
        byteSize: processed.byteSize,
      },
    });
    await tx.user.update({
      where: { id: studentId },
      data: { photoId: created.id },
    });
    if (previousPhotoId) {
      await tx.photo.delete({ where: { id: previousPhotoId } });
    }
  });

  revalidatePath(`/admin/students/${studentId}`);
  return { success: "Photo saved." };
}

/** Deletes a student's photo outright — the bytes go, not just the link. */
export async function removeStudentPhoto(studentId: string) {
  await requireRole("ADMIN");
  const student = await prisma.user.findUnique({
    where: { id: studentId, role: "STUDENT" },
    select: { photoId: true },
  });
  if (!student?.photoId) return;

  await prisma.$transaction([
    prisma.user.update({ where: { id: studentId }, data: { photoId: null } }),
    prisma.photo.delete({ where: { id: student.photoId } }),
  ]);
  revalidatePath(`/admin/students/${studentId}`);
}

export async function adjustment(
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  const session = await requireRole("ADMIN");
  const studentId = String(formData.get("studentId"));
  const direction = String(formData.get("direction")) === "remove" ? -1 : 1;
  const amount = parseAmount(String(formData.get("amount") || ""));
  const note = String(formData.get("note") || "").trim();
  if (amount === null) return { error: "Enter a valid amount." };
  if (!note) return { error: "A note is required for adjustments." };

  try {
    await creditStudent({
      studentId,
      amount: amount * direction,
      type: "ADJUSTMENT",
      operatorId: session.uid,
      note,
    });
    revalidatePath(`/admin/students/${studentId}`);
    return { success: "Adjustment recorded." };
  } catch (err) {
    if (err instanceof LedgerError) return { error: err.message };
    throw err;
  }
}
