import { createCipheriv, createDecipheriv, randomBytes } from "crypto";
import sharp from "sharp";

/**
 * Identification photos of children are the most sensitive data this app
 * holds, so they get treated differently from everything else:
 *
 *  - Stored as AES-256-GCM ciphertext in Postgres, never on disk and never
 *    behind a public URL. A stolen database dump or backup file is useless
 *    without PHOTO_ENCRYPTION_KEY, which lives only in the environment.
 *  - Re-encoded through sharp on upload. That normalises the format, caps
 *    the dimensions, and drops all EXIF metadata — including the GPS
 *    coordinates phone cameras attach, which would otherwise record where a
 *    child's photo was taken.
 *  - Served only by /api/photo/[kind]/[id], which authorises every request.
 */

const MAX_UPLOAD_BYTES = 8 * 1024 * 1024; // 8MB before processing
const OUTPUT_SIZE = 512; // px, square
const IV_BYTES = 12;
const TAG_BYTES = 16;

export const PHOTO_MIME = "image/jpeg";
export const ACCEPTED_UPLOAD_TYPES = "image/jpeg,image/png,image/webp";

function encryptionKey(): Buffer {
  const hex = process.env.PHOTO_ENCRYPTION_KEY;
  if (!hex) {
    throw new Error(
      "PHOTO_ENCRYPTION_KEY is not set — required to store identification photos. " +
        "Generate one with: openssl rand -hex 32"
    );
  }
  const key = Buffer.from(hex, "hex");
  if (key.length !== 32) {
    throw new Error("PHOTO_ENCRYPTION_KEY must be 64 hex characters (32 bytes).");
  }
  return key;
}

/** Returns iv | authTag | ciphertext. */
export function encryptPhoto(plain: Buffer): Buffer {
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv("aes-256-gcm", encryptionKey(), iv);
  const body = Buffer.concat([cipher.update(plain), cipher.final()]);
  return Buffer.concat([iv, cipher.getAuthTag(), body]);
}

export function decryptPhoto(stored: Buffer): Buffer {
  const iv = stored.subarray(0, IV_BYTES);
  const tag = stored.subarray(IV_BYTES, IV_BYTES + TAG_BYTES);
  const body = stored.subarray(IV_BYTES + TAG_BYTES);
  const decipher = createDecipheriv("aes-256-gcm", encryptionKey(), iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(body), decipher.final()]);
}

/**
 * Sniffs the real file type from its leading bytes. The browser-supplied
 * Content-Type is attacker-controlled and never trusted.
 */
function looksLikeImage(buf: Buffer): boolean {
  if (buf.length < 12) return false;
  const jpeg = buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff;
  const png =
    buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47;
  const webp =
    buf.subarray(0, 4).toString("ascii") === "RIFF" &&
    buf.subarray(8, 12).toString("ascii") === "WEBP";
  return jpeg || png || webp;
}

// Uint8Array rather than Buffer: that's what Prisma's Bytes column expects.
export type ProcessedPhoto = {
  data: Uint8Array<ArrayBuffer>;
  mimeType: string;
  byteSize: number;
};

/**
 * Validates and normalises an uploaded photo, returning encrypted bytes ready
 * to persist. Throws PhotoError with a message safe to show the uploader.
 */
export class PhotoError extends Error {}

export async function processPhotoUpload(file: File): Promise<ProcessedPhoto> {
  if (!file || file.size === 0) throw new PhotoError("Choose a photo to upload.");
  if (file.size > MAX_UPLOAD_BYTES) {
    throw new PhotoError("That photo is too large — please use one under 8MB.");
  }

  const raw = Buffer.from(await file.arrayBuffer());
  if (!looksLikeImage(raw)) {
    throw new PhotoError("That file isn't a JPEG, PNG or WebP image.");
  }

  let normalised: Buffer;
  try {
    normalised = await sharp(raw, { limitInputPixels: 50_000_000 })
      // .rotate() with no argument applies the EXIF orientation, so the photo
      // stays the right way up once the metadata is discarded below.
      .rotate()
      .resize(OUTPUT_SIZE, OUTPUT_SIZE, { fit: "cover", position: "attention" })
      // sharp drops metadata unless withMetadata() is called — EXIF and any
      // embedded GPS location go away here.
      .jpeg({ quality: 82, mozjpeg: true })
      .toBuffer();
  } catch {
    throw new PhotoError("That image couldn't be read. Try a different photo.");
  }

  return {
    data: new Uint8Array(encryptPhoto(normalised)),
    mimeType: PHOTO_MIME,
    byteSize: normalised.length,
  };
}
