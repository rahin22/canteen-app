"use server";

import { redirect } from "next/navigation";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/db";
import { bumpSessionVersion, destroySession } from "@/lib/auth";
import { clientIp, rateLimit } from "@/lib/ratelimit";
import { consumeCode, issueCode } from "@/lib/verification";
import { passwordResetEmail, sendEmail } from "@/lib/email";
import { normalizeUsername } from "@/lib/username";

export type ForgotState = { error?: string; sent?: boolean };
export type ResetState = { error?: string };

const MIN_PASSWORD = 8;

/**
 * Starts a password reset.
 *
 * The response is identical whether or not an account exists, so this can't
 * be used to discover which parents are registered. Only accounts that have
 * an email address can reset this way — students and operators are issued
 * credentials by the office and are told to go there instead.
 */
export async function requestReset(
  _prev: ForgotState,
  formData: FormData
): Promise<ForgotState> {
  const email = normalizeUsername(String(formData.get("email") || ""));
  if (!email) return { error: "Enter your email address." };

  const ip = await clientIp();
  if (!rateLimit(`reset-ip:${ip}`, 10, 60 * 60 * 1000)) {
    return { error: "Too many attempts. Please try again later." };
  }
  // A per-address limit as well, so one address can't be spammed from a
  // botnet of IPs.
  if (!rateLimit(`reset-email:${email}`, 5, 60 * 60 * 1000)) {
    return { sent: true };
  }

  const user = await prisma.user.findUnique({ where: { username: email } });
  if (user && user.active && user.email) {
    const issued = await issueCode(user.id, "PASSWORD_RESET");
    if (issued.ok) {
      await sendEmail({
        to: user.email,
        ...passwordResetEmail(issued.code, user.name.split(" ")[0]),
      });
    }
  }

  // Always the same answer.
  return { sent: true };
}

export async function resetPassword(
  _prev: ResetState,
  formData: FormData
): Promise<ResetState> {
  const email = normalizeUsername(String(formData.get("email") || ""));
  const code = String(formData.get("code") || "");
  const password = String(formData.get("password") || "");
  const confirm = String(formData.get("confirm") || "");

  if (!email) return { error: "Enter your email address." };
  if (password.length < MIN_PASSWORD) {
    return { error: `Choose a password of at least ${MIN_PASSWORD} characters.` };
  }
  if (password !== confirm) return { error: "The two passwords don't match." };

  const ip = await clientIp();
  if (!rateLimit(`reset-submit:${ip}`, 20, 60 * 60 * 1000)) {
    return { error: "Too many attempts. Please try again later." };
  }

  const user = await prisma.user.findUnique({ where: { username: email } });
  if (!user || !user.active || !user.email) {
    // Same wording as a bad code, so a wrong address reveals nothing.
    return { error: "That code is not valid. Request a new one." };
  }

  const result = await consumeCode(user.id, "PASSWORD_RESET", code);
  if (!result.ok) return { error: result.error };

  await prisma.user.update({
    where: { id: user.id },
    data: {
      passwordHash: await bcrypt.hash(password, 10),
      // Receiving the code proves they control the address, so treat it as
      // confirmed — otherwise an unverified parent could get stuck.
      emailVerifiedAt: user.emailVerifiedAt ?? new Date(),
    },
  });

  // Sign out every existing session, including any the attacker may hold.
  await bumpSessionVersion(user.id);
  await destroySession();
  redirect("/login?reset=1");
}
