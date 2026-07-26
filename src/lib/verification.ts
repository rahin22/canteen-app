import { randomInt } from "crypto";
import bcrypt from "bcryptjs";
import { prisma } from "./db";
import type { VerificationPurpose } from "@/generated/prisma/enums";

/**
 * One-time email codes for confirming an address and resetting a password.
 *
 * Six digits is only a million possibilities, so the security here comes from
 * the surrounding limits rather than the code itself: codes live 15 minutes,
 * are single-use, allow 5 wrong guesses before being burned, and issuing is
 * rate limited. Only a bcrypt hash is stored.
 */

const CODE_TTL_MINUTES = 15;
const MAX_ATTEMPTS = 5;
const RESEND_COOLDOWN_SECONDS = 60;
const MAX_CODES_PER_HOUR = 5;

function generateCode(): string {
  // randomInt avoids the modulo bias a naive random()*900000 would introduce.
  return String(randomInt(0, 1_000_000)).padStart(6, "0");
}

export type IssueResult =
  | { ok: true; code: string }
  | { ok: false; error: string };

/**
 * Creates a fresh code, invalidating any outstanding ones for the same
 * purpose so only the most recent email works.
 */
export async function issueCode(
  userId: string,
  purpose: VerificationPurpose
): Promise<IssueResult> {
  const now = new Date();

  const recent = await prisma.verificationCode.findMany({
    where: {
      userId,
      purpose,
      createdAt: { gt: new Date(now.getTime() - 60 * 60 * 1000) },
    },
    orderBy: { createdAt: "desc" },
  });

  if (recent.length >= MAX_CODES_PER_HOUR) {
    return { ok: false, error: "Too many codes requested. Try again in an hour." };
  }
  const last = recent[0];
  if (last && now.getTime() - last.createdAt.getTime() < RESEND_COOLDOWN_SECONDS * 1000) {
    const wait = Math.ceil(
      (RESEND_COOLDOWN_SECONDS * 1000 - (now.getTime() - last.createdAt.getTime())) / 1000
    );
    return { ok: false, error: `Please wait ${wait} seconds before requesting another code.` };
  }

  const code = generateCode();
  await prisma.$transaction([
    prisma.verificationCode.updateMany({
      where: { userId, purpose, consumedAt: null },
      data: { consumedAt: now },
    }),
    prisma.verificationCode.create({
      data: {
        userId,
        purpose,
        codeHash: await bcrypt.hash(code, 10),
        expiresAt: new Date(now.getTime() + CODE_TTL_MINUTES * 60 * 1000),
      },
    }),
  ]);

  return { ok: true, code };
}

export type VerifyResult = { ok: true } | { ok: false; error: string };

/** Checks a submitted code and burns it on success. */
export async function consumeCode(
  userId: string,
  purpose: VerificationPurpose,
  submitted: string
): Promise<VerifyResult> {
  const code = submitted.replace(/\D/g, "");
  if (code.length !== 6) return { ok: false, error: "Enter the 6-digit code from your email." };

  const record = await prisma.verificationCode.findFirst({
    where: { userId, purpose, consumedAt: null, expiresAt: { gt: new Date() } },
    orderBy: { createdAt: "desc" },
  });
  if (!record) {
    return { ok: false, error: "That code has expired. Request a new one." };
  }
  if (record.attempts >= MAX_ATTEMPTS) {
    await prisma.verificationCode.update({
      where: { id: record.id },
      data: { consumedAt: new Date() },
    });
    return { ok: false, error: "Too many incorrect attempts. Request a new code." };
  }

  if (!(await bcrypt.compare(code, record.codeHash))) {
    const updated = await prisma.verificationCode.update({
      where: { id: record.id },
      data: { attempts: { increment: 1 } },
    });
    const left = MAX_ATTEMPTS - updated.attempts;
    if (left <= 0) {
      // Burn it now rather than on the next request, so a spent code is never
      // left sitting in the table as still-usable.
      await prisma.verificationCode.update({
        where: { id: record.id },
        data: { consumedAt: new Date() },
      });
      return { ok: false, error: "Too many incorrect attempts. Request a new code." };
    }
    return {
      ok: false,
      error: `Incorrect code. ${left} attempt${left === 1 ? "" : "s"} left.`,
    };
  }

  await prisma.verificationCode.update({
    where: { id: record.id },
    data: { consumedAt: new Date() },
  });
  return { ok: true };
}

/** Housekeeping: drop codes that are long dead. Safe to call opportunistically. */
export async function purgeExpiredCodes() {
  await prisma.verificationCode.deleteMany({
    where: { expiresAt: { lt: new Date(Date.now() - 24 * 60 * 60 * 1000) } },
  });
}
