"use server";

import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { requireRole } from "@/lib/auth";
import { consumeCode, issueCode } from "@/lib/verification";
import { sendEmail, verificationEmail } from "@/lib/email";

export type VerifyState = { error?: string; success?: string };

/** Emails the signed-in parent a fresh confirmation code. */
export async function sendVerificationCode(): Promise<VerifyState> {
  const session = await requireRole("PARENT");
  const user = await prisma.user.findUniqueOrThrow({
    where: { id: session.uid },
    select: { email: true, name: true, emailVerifiedAt: true },
  });
  if (!user.email) return { error: "No email address on this account." };
  if (user.emailVerifiedAt) return { success: "Your email is already confirmed." };

  const issued = await issueCode(session.uid, "EMAIL_VERIFY");
  if (!issued.ok) return { error: issued.error };

  const { sent } = await sendEmail({
    to: user.email,
    ...verificationEmail(issued.code, user.name.split(" ")[0]),
  });
  return {
    success: sent
      ? `We've sent a code to ${user.email}.`
      : "Code generated, but email isn't set up on this server yet — ask the school office.",
  };
}

export async function confirmEmail(
  _prev: VerifyState,
  formData: FormData
): Promise<VerifyState> {
  const session = await requireRole("PARENT");
  const result = await consumeCode(
    session.uid,
    "EMAIL_VERIFY",
    String(formData.get("code") || "")
  );
  if (!result.ok) return { error: result.error };

  await prisma.user.update({
    where: { id: session.uid },
    data: { emailVerifiedAt: new Date() },
  });
  redirect("/family/register?verified=1");
}
