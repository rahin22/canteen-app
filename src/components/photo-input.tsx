"use client";

import { useEffect, useRef, useState } from "react";

const MAX_EDGE = 1024; // px — the server crops to 512 square from this
// Kept in sync with src/lib/photos.ts by hand — that module pulls in sharp,
// which must never reach the client bundle.
const ACCEPTED_UPLOAD_TYPES = "image/jpeg,image/png,image/webp";

/**
 * File picker for identification photos with a live preview.
 *
 * The chosen image is downscaled in the browser before it is uploaded, which
 * keeps a 12MP phone photo from becoming a 10MB upload on school wifi. The
 * canvas re-encode also happens to drop EXIF, though the server re-encodes
 * again and is the authority on that.
 */
export function PhotoInput({
  name = "photo",
  initialPreview,
  required,
}: {
  name?: string;
  initialPreview?: string | null;
  required?: boolean;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<string | null>(initialPreview ?? null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const objectUrl = useRef<string | null>(null);

  useEffect(() => {
    return () => {
      if (objectUrl.current) URL.revokeObjectURL(objectUrl.current);
    };
  }, []);

  async function handleChange(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    setError(null);
    setBusy(true);
    try {
      const resized = await downscale(file);
      // Swap the picked file for the smaller one so the plain form submission
      // sends the downscaled version.
      if (resized && inputRef.current) {
        const transfer = new DataTransfer();
        transfer.items.add(resized);
        inputRef.current.files = transfer.files;
      }
      if (objectUrl.current) URL.revokeObjectURL(objectUrl.current);
      objectUrl.current = URL.createObjectURL(resized ?? file);
      setPreview(objectUrl.current);
    } catch {
      setError("Couldn't read that image. Try a different photo.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex items-center gap-4">
      <div className="flex h-24 w-24 shrink-0 items-center justify-center overflow-hidden rounded-full border-2 border-dashed border-slate-300 bg-slate-50">
        {preview ? (
          // Plain <img>: these are private, authenticated, no-store responses,
          // so they must not go through the image optimiser or any CDN.
          // eslint-disable-next-line @next/next/no-img-element
          <img src={preview} alt="" className="h-full w-full object-cover" />
        ) : (
          <span className="text-3xl text-slate-300">👤</span>
        )}
      </div>
      <div className="min-w-0">
        <input
          ref={inputRef}
          type="file"
          name={name}
          accept={ACCEPTED_UPLOAD_TYPES}
          required={required}
          onChange={handleChange}
          className="block w-full text-sm text-slate-600 file:mr-3 file:cursor-pointer file:rounded-lg file:border-0 file:bg-indigo-50 file:px-3 file:py-2 file:text-sm file:font-medium file:text-indigo-700 hover:file:bg-indigo-100"
        />
        <p className="mt-1.5 text-xs text-slate-500">
          {busy
            ? "Preparing photo…"
            : "A clear head-and-shoulders photo. JPEG, PNG or WebP."}
        </p>
        {error && <p className="mt-1 text-xs text-red-600">{error}</p>}
      </div>
    </div>
  );
}

/** Draws the image into a canvas at most MAX_EDGE on its longest side. */
async function downscale(file: File): Promise<File | null> {
  if (typeof createImageBitmap !== "function") return null;
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, MAX_EDGE / Math.max(bitmap.width, bitmap.height));
  if (scale === 1 && file.size < 1_000_000) {
    bitmap.close();
    return null; // already small enough, send as-is
  }

  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    bitmap.close();
    return null;
  }
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();

  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob(resolve, "image/jpeg", 0.85)
  );
  if (!blob) return null;
  return new File([blob], "photo.jpg", { type: "image/jpeg" });
}
