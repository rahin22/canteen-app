"use server";

import { revalidatePath } from "next/cache";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/db";
import { requireRole } from "@/lib/auth";
import { generatePassword } from "@/lib/cards";
import { resolveSchoolId } from "@/lib/schools";

export type StaffActionState = {
  error?: string;
  success?: string;
  credentials?: { username: string; password: string };
};

export async function createOperator(
  _prev: StaffActionState,
  formData: FormData
): Promise<StaffActionState> {
  await requireRole("ADMIN");
  const name = String(formData.get("name") || "").trim();
  const username = String(formData.get("username") || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "");
  const schoolId = await resolveSchoolId(formData.get("school"));
  if (!name || !username) return { error: "Name and username are required." };
  // An operator without a school can't see anything, so requiring it here is
  // kinder than letting someone create an account that appears broken.
  if (!schoolId) return { error: "Choose which school this operator works at." };

  const existing = await prisma.user.findUnique({ where: { username } });
  if (existing) return { error: `Username "${username}" is already taken.` };

  const password = generatePassword();
  await prisma.user.create({
    data: {
      role: "OPERATOR",
      name,
      username,
      schoolId,
      passwordHash: await bcrypt.hash(password, 10),
    },
  });
  revalidatePath("/admin/staff");
  return {
    success: "Operator account created.",
    credentials: { username, password },
  };
}

/** Resets an OPERATOR's password (admins change their own via /password). */
export async function resetOperatorPassword(id: string): Promise<StaffActionState> {
  await requireRole("ADMIN");
  const user = await prisma.user.findUnique({ where: { id } });
  if (!user || user.role !== "OPERATOR") return { error: "Not an operator account." };

  const password = generatePassword();
  await prisma.user.update({
    where: { id },
    // Bumping the version signs the operator out everywhere immediately.
    data: {
      passwordHash: await bcrypt.hash(password, 10),
      sessionVersion: { increment: 1 },
    },
  });
  return {
    success: "Password reset.",
    credentials: { username: user.username, password },
  };
}

/**
 * Moves an operator to a different school. Takes effect on their next page
 * load — the scope is read from the database per request, not from their
 * session cookie, so there's no need to sign them out.
 */
export async function setOperatorSchool(
  id: string,
  school: string
): Promise<StaffActionState> {
  await requireRole("ADMIN");
  const schoolId = await resolveSchoolId(school);
  if (!schoolId) return { error: "Unknown school." };

  const user = await prisma.user.findUnique({ where: { id } });
  if (!user || user.role !== "OPERATOR") return { error: "Not an operator account." };

  await prisma.user.update({ where: { id }, data: { schoolId } });
  revalidatePath("/admin/staff");
  return { success: "School updated." };
}

export async function setOperatorActive(id: string, active: boolean) {
  await requireRole("ADMIN");
  await prisma.user.update({
    where: { id, role: "OPERATOR" },
    data: { active },
  });
  revalidatePath("/admin/staff");
}
