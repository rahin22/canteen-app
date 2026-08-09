import { PRINT_WIDTH_DOTS } from "@/lib/r22";

/**
 * The artwork for a student's thermal label, shared by the batch printer and
 * the one-click button on a student's page so both produce identical labels.
 * Canvas-based, so client components only.
 */

export interface LabelData {
  id: string;
  name: string;
  username: string;
  token: string;
  qrSize: number;
  qrBits: string;
}

export const LABEL_W = PRINT_WIDTH_DOTS;

/**
 * The printer parks its head ~8mm into each fresh label and cannot back-feed,
 * so a single-label job can only reach the lower ~22mm of the 30mm stock.
 * 160 dots (20mm) fits that with margin.
 */
export const LABEL_H = 160;

/** Shrink until it fits the column; returns the px size used. */
function fitFont(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number,
  startPx: number,
  weight = ""
) {
  for (let px = startPx; px > 8; px--) {
    ctx.font = `${weight} ${px}px Arial`.trim();
    if (ctx.measureText(text).width <= maxWidth) return px;
  }
  return 9;
}

/** Draw one student label at printer resolution. */
export function drawLabel(
  canvas: HTMLCanvasElement,
  label: LabelData,
  school: string
) {
  canvas.width = LABEL_W;
  canvas.height = LABEL_H;
  const g = canvas.getContext("2d");
  if (!g) return;

  g.fillStyle = "#fff";
  g.fillRect(0, 0, LABEL_W, LABEL_H);
  g.fillStyle = "#000";
  g.textBaseline = "alphabetic";

  // QR: whole dots per module only, so the modules stay square and crisp.
  const pad = 8;
  const scale = Math.max(1, Math.floor((LABEL_H - pad * 2) / label.qrSize));
  const qrPx = label.qrSize * scale;
  const oy = Math.floor((LABEL_H - qrPx) / 2);
  for (let y = 0; y < label.qrSize; y++) {
    for (let x = 0; x < label.qrSize; x++) {
      if (label.qrBits[y * label.qrSize + x] === "1") {
        g.fillRect(pad + x * scale, oy + y * scale, scale, scale);
      }
    }
  }

  const tx = pad + qrPx + 12;
  const tw = LABEL_W - tx - pad;

  let px = fitFont(g, school.toUpperCase(), tw, 16);
  g.font = `${px}px Arial`;
  g.fillText(school.toUpperCase(), tx, 26);

  px = fitFont(g, label.name, tw, 34, "bold");
  g.font = `bold ${px}px Arial`;
  g.fillText(label.name, tx, 74);

  g.fillRect(tx, 88, tw, 3);

  px = fitFont(g, label.username, tw, 24);
  g.font = `${px}px Arial`;
  g.fillText(label.username, tx, 122);

  px = fitFont(g, label.token, tw, 13);
  g.font = `${px}px monospace`;
  g.fillText(label.token, tx, 150);
}
