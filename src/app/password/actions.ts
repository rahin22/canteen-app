"use server";

import bcrypt from "bcryptjs";
import { prisma } from "@/lib/db";
import { bumpSessionVersion, createSession, getSession } from "@/lib/auth";

export type PasswordState = { error?: string; success?: string };

export async function changePassword(
  _prev: PasswordState,
  formData: FormData
): Promise<PasswordState> {
  const session = await getSession();
  if (!session) return { error: "You're signed out — sign in again." };

  const current = String(formData.get("current") || "");
  const next = String(formData.get("next") || "");
  const confirm = String(formData.get("confirm") || "");

  if (next.length < 8) return { error: "New password must be at least 8 characters." };
  if (next !== confirm) return { error: "New passwords don't match." };

  const user = await prisma.user.findUnique({ where: { id: session.uid } });
  if (!user || !(await bcrypt.compare(current, user.passwordHash))) {
    return { error: "Current password is incorrect." };
  }

  if (next === current) return { error: "Choose a password different from your current one." };

  await prisma.user.update({
    where: { id: user.id },
    data: { passwordHash: await bcrypt.hash(next, 10) },
  });

  // Sign every other device out, then re-issue this one so the person
  // changing their password isn't the one who gets kicked.
  const version = await bumpSessionVersion(user.id);
  await createSession({ uid: user.id, role: user.role, name: user.name, version });

  return { success: "Password changed. Other devices have been signed out." };
}
