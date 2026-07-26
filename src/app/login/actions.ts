"use server";

import { redirect } from "next/navigation";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/db";
import { createSession, destroySession } from "@/lib/auth";

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

  await createSession({ uid: user.id, role: user.role, name: user.name });

  if (user.role === "ADMIN") redirect("/admin");
  if (user.role === "OPERATOR") redirect("/scan");
  if (user.role === "PARENT") redirect("/family");
  redirect("/me");
}

export async function logout() {
  await destroySession();
  redirect("/login");
}
