import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { decryptPhoto } from "@/lib/photos";

/**
 * The only route that serves identification photos. Every request is
 * authorised individually — there is no public or guessable URL for a
 * child's photo, and responses are marked no-store so they never land in a
 * shared cache or CDN.
 *
 *   /api/photo/student/<userId>       admin, operator (the till), the student
 *                                     themselves, or a linked parent
 *   /api/photo/registration/<regId>   admin, or the parent who submitted it
 */

const NOT_FOUND = new NextResponse("Not found", { status: 404 });

export async function GET(
  _req: Request,
  ctx: { params: Promise<{ kind: string; id: string }> }
) {
  const session = await getSession();
  if (!session) return new NextResponse("Unauthorized", { status: 401 });

  const { kind, id } = await ctx.params;

  let photoId: string | null = null;

  if (kind === "student") {
    const student = await prisma.user.findFirst({
      where: { id, role: "STUDENT" },
      select: { id: true, photoId: true, parents: { select: { id: true } } },
    });
    if (!student) return NOT_FOUND;

    // Admins and operators (the till) see any student; a student sees only
    // their own photo; a parent sees only children linked to their account.
    const allowed =
      session.role === "ADMIN" ||
      session.role === "OPERATOR" ||
      (session.role === "STUDENT" && student.id === session.uid) ||
      (session.role === "PARENT" &&
        student.parents.some((parent) => parent.id === session.uid));
    if (!allowed) return NOT_FOUND;

    photoId = student.photoId;
  } else if (kind === "registration") {
    const registration = await prisma.childRegistration.findFirst({
      where: { id },
      select: { photoId: true, parentId: true },
    });
    if (!registration) return NOT_FOUND;

    const allowed =
      session.role === "ADMIN" ||
      (session.role === "PARENT" && registration.parentId === session.uid);
    if (!allowed) return NOT_FOUND;

    photoId = registration.photoId;
  } else {
    return NOT_FOUND;
  }

  // Unauthorised and genuinely-missing look identical, so this endpoint can't
  // be used to probe which students exist.
  if (!photoId) return NOT_FOUND;

  const photo = await prisma.photo.findUnique({ where: { id: photoId } });
  if (!photo) return NOT_FOUND;

  let image: Buffer;
  try {
    image = decryptPhoto(Buffer.from(photo.data));
  } catch {
    // Wrong/rotated key, or tampered ciphertext — GCM authentication failed.
    return new NextResponse("Photo unavailable", { status: 500 });
  }

  return new NextResponse(new Uint8Array(image), {
    headers: {
      "Content-Type": photo.mimeType,
      "Content-Length": String(image.length),
      "Content-Disposition": "inline",
      "Cache-Control": "private, no-store, max-age=0",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
