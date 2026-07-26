import { cache } from "react";
import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { prisma } from "./db";
import type { Role } from "@/generated/prisma/enums";

const COOKIE_NAME = "canteen_session";
const SESSION_DAYS = 30;

export type Session = {
  uid: string;
  role: Role;
  name: string;
};

function secretKey() {
  const secret = process.env.SESSION_SECRET;
  if (!secret) throw new Error("SESSION_SECRET is not set");
  return new TextEncoder().encode(secret);
}

export async function createSession(session: Session & { version?: number }) {
  const version =
    session.version ??
    (await prisma.user.findUnique({
      where: { id: session.uid },
      select: { sessionVersion: true },
    }))?.sessionVersion ??
    0;

  const token = await new SignJWT({
    uid: session.uid,
    role: session.role,
    name: session.name,
    v: version,
  })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${SESSION_DAYS}d`)
    .sign(secretKey());

  const store = await cookies();
  store.set(COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_DAYS * 24 * 60 * 60,
  });
}

export async function destroySession() {
  const store = await cookies();
  store.delete(COOKIE_NAME);
}

/**
 * Resolves the current session.
 *
 * A valid signature isn't enough on its own: the account must still exist, be
 * active, and carry the session version baked into the cookie. That's what
 * makes "disable this account" and "reset my password" take effect
 * immediately instead of waiting out the cookie's 30-day life.
 *
 * Wrapped in React's cache so the extra lookup happens once per request even
 * though layouts and pages both call it.
 */
export const getSession = cache(async function getSession(): Promise<Session | null> {
  const store = await cookies();
  const token = store.get(COOKIE_NAME)?.value;
  if (!token) return null;

  let payload;
  try {
    ({ payload } = await jwtVerify(token, secretKey()));
  } catch {
    return null;
  }

  const uid = payload.uid as string | undefined;
  if (!uid) return null;

  const user = await prisma.user.findUnique({
    where: { id: uid },
    select: { id: true, role: true, name: true, active: true, sessionVersion: true },
  });
  if (!user || !user.active) return null;
  if (user.sessionVersion !== ((payload.v as number) ?? 0)) return null;

  // Read role and name from the database, not the cookie, so a role change
  // takes effect straight away.
  return { uid: user.id, role: user.role, name: user.name };
});

/** Redirects to /login unless the session role is one of `roles`. */
export async function requireRole(...roles: Role[]): Promise<Session> {
  const session = await getSession();
  if (!session) redirect("/login");
  if (!roles.includes(session.role)) redirect("/");
  return session;
}

/** Invalidates every existing session for a user (after a password change). */
export async function bumpSessionVersion(userId: string): Promise<number> {
  const user = await prisma.user.update({
    where: { id: userId },
    data: { sessionVersion: { increment: 1 } },
    select: { sessionVersion: true },
  });
  return user.sessionVersion;
}

export const SESSION_COOKIE = COOKIE_NAME;
