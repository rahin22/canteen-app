"use server";

import { redirect } from "next/navigation";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/db";
import { createSession } from "@/lib/auth";
import { emailAvailable, parentSignupOpen } from "@/lib/settings";
import { clientIp, rateLimit } from "@/lib/ratelimit";
import { issueCode } from "@/lib/verification";
import { sendEmail, verificationEmail } from "@/lib/email";

export type SignupState = { error?: string };

const MIN_PASSWORD = 8;
// Deliberately loose — the point is to reject obvious typos, not to police
// what a valid address looks like.
const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

/**
 * Creates a PARENT account from the public signup form.
 *
 * A parent account on its own can do nothing: it has no children attached and
 * no balance. Children are added separately and only become real student
 * accounts once an admin approves them.
 */
export async function signup(
  _prev: SignupState,
  formData: FormData
): Promise<SignupState> {
  if (!(await parentSignupOpen())) {
    return { error: "Parent registration is closed. Please contact the school office." };
  }

  // Unauthenticated endpoint — throttle per IP before touching the database.
  const ip = await clientIp();
  if (!rateLimit(`signup:${ip}`, 5, 60 * 60 * 1000)) {
    return { error: "Too many attempts. Please try again later." };
  }

  const name = String(formData.get("name") || "").trim();
  const email = String(formData.get("email") || "").trim().toLowerCase();
  const phone = String(formData.get("phone") || "").trim();
  const password = String(formData.get("password") || "");
  const confirm = String(formData.get("confirm") || "");

  if (!name) return { error: "Enter your full name." };
  if (!EMAIL_RE.test(email)) return { error: "Enter a valid email address." };
  // The office needs a way to reach a parent about their child at short
  // notice, so a contactable number is required rather than nice-to-have.
  // Deliberately loose: accept +61, spaces, brackets and hyphens, and only
  // insist on enough digits to be a real number.
  if (phone.replace(/\D/g, "").length < 8) {
    return { error: "Enter a valid mobile number." };
  }
  if (password.length < MIN_PASSWORD) {
    return { error: `Choose a password of at least ${MIN_PASSWORD} characters.` };
  }
  if (password !== confirm) return { error: "The two passwords don't match." };

  // The email doubles as the login username, so parents have one thing to
  // remember and the school has a way to contact them.
  const existing = await prisma.user.findUnique({ where: { username: email } });
  if (existing) {
    return { error: "That email is already registered — sign in instead." };
  }

  const parent = await prisma.user.create({
    data: {
      role: "PARENT",
      name,
      username: email,
      email,
      phone,
      passwordHash: await bcrypt.hash(password, 10),
    },
  });

  await createSession({ uid: parent.id, role: "PARENT", name: parent.name });

  // With email switched off there is no code to send and nothing to confirm,
  // so send them straight on to add their first child. Nothing is weakened by
  // skipping it: a parent account grants no access on its own, and every
  // child they submit still waits for an admin to approve it.
  if (!(await emailAvailable())) redirect("/family/register?welcome=1");

  // Otherwise email a confirmation code straight away. A failure to send must
  // not strand a parent with an account they can't get into, so it's logged
  // rather than surfaced — they can request another code on the next page.
  const issued = await issueCode(parent.id, "EMAIL_VERIFY");
  if (issued.ok) {
    await sendEmail({
      to: email,
      ...verificationEmail(issued.code, name.split(" ")[0]),
    });
  }

  redirect("/verify-email");
}
