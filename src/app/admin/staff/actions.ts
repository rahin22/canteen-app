"use server";

import { revalidatePath } from "next/cache";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/db";
import { requireRole } from "@/lib/auth";
import { generatePassword } from "@/lib/cards";

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
  if (!name || !username) return { error: "Name and username are required." };

  const existing = await prisma.user.findUnique({ where: { username } });
  if (existing) return { error: `Username "${username}" is already taken.` };

  const password = generatePassword();
  await prisma.user.create({
    data: {
      role: "OPERATOR",
      name,
      username,
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
    data: { passwordHash: await bcrypt.hash(password, 10) },
  });
  return {
    success: "Password reset.",
    credentials: { username: user.username, password },
  };
}

export async function setOperatorActive(id: string, active: boolean) {
  await requireRole("ADMIN");
  await prisma.user.update({
    where: { id, role: "OPERATOR" },
    data: { active },
  });
  revalidatePath("/admin/staff");
}
