"use server";

import { redirect } from "next/navigation";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/db";
import { createSession, destroySession } from "@/lib/auth";
import { emailAvailable } from "@/lib/settings";

export type LoginState = { error?: string };

export async function login(
  _prev: LoginState,
  formData: FormData
): Promise<LoginState> {
  const username = String(formData.get("username") || "").trim().toLowerCase();
  const password = String(formData.get("password") || "");
  if (!username || !password) return { error: "Enter your username and password." };

  const user = await prisma.user.findUnique({ where: { username } });
  if (!user || !user.active || !(await bcrypt.compare(password, user.passwordHash))) {
    return { error: "Wrong username or password." };
  }

  await createSession({
    uid: user.id,
    role: user.role,
    name: user.name,
    version: user.sessionVersion,
  });

  if (user.role === "ADMIN") redirect("/admin");
  if (user.role === "OPERATOR") redirect("/scan");
  // Parents who haven't confirmed their address land on the code screen —
  // but only while we're actually able to send them a code.
  if (user.role === "PARENT") {
    const needsConfirming =
      Boolean(user.email) && !user.emailVerifiedAt && (await emailAvailable());
    redirect(needsConfirming ? "/verify-email" : "/family");
  }
  redirect("/me");
}

export async function logout() {
  await destroySession();
  redirect("/login");
}
