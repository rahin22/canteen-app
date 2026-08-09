import { NextResponse } from "next/server";
import QRCode from "qrcode";
import { getSession } from "@/lib/auth";

/**
 * Returns a QR code as its raw module matrix rather than an image.
 *
 * The thermal label printer is 1-bit at 203dpi, so the caller draws each module
 * as a whole number of printer dots. Scaling a rasterised QR would antialias the
 * edges and then get thresholded back to 1-bit, which frays the finder patterns
 * and hurts scan reliability — emitting the matrix avoids resampling entirely.
 *
 * Encoding only; the text to encode is supplied by the caller, so this reads no
 * student data. Still admin-gated, since card tokens are what it is used for.
 */
export async function GET(req: Request) {
  const session = await getSession();
  if (!session || session.role !== "ADMIN") {
    return new NextResponse("Unauthorized", { status: 401 });
  }

  const text = new URL(req.url).searchParams.get("text");
  if (!text) return new NextResponse("Missing ?text", { status: 400 });
  if (text.length > 512) return new NextResponse("Text too long", { status: 400 });

  // "M" matches the card tokens /scan expects.
  const qr = QRCode.create(text, { errorCorrectionLevel: "M" });
  const { size, data } = qr.modules;

  // One char per module keeps the payload small and trivial to index.
  let bits = "";
  for (let i = 0; i < data.length; i++) bits += data[i] ? "1" : "0";

  return NextResponse.json(
    { size, bits },
    { headers: { "Cache-Control": "private, no-store, max-age=0" } }
  );
}
