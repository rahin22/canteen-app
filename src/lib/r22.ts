/**
 * Driver for the Rongta R22 Bluetooth label printer, over Web Bluetooth.
 *
 * The R22 speaks Rongta's proprietary "PN81" protocol — not TSPL, CPCL or
 * ESC/POS, all of which the printer accepts and silently discards. The wire
 * format below was recovered from `librt_printer_sdk.so` inside the vendor's
 * RLabel app (`HAL_RT_Protocol_PacketBuid`) and verified byte-for-byte by
 * executing the real function under a CPU emulator.
 *
 * The printer is dual-mode Bluetooth. Its Classic/SPP channel (a COM port on
 * Windows) accepts data under genuine flow control but is NOT wired to the
 * print engine — it is a dead end. All printing goes over BLE GATT, which is
 * also why Web Bluetooth is the right API here and Web Serial cannot work.
 */

// ---------------------------------------------------------------- transport

export const R22_SERVICE = 0x0000ff00;
export const R22_WRITE_CHAR = 0x0000ff02;
export const R22_NOTIFY_CHARS = [0x0000ff01, 0x0000ff03];

/** Microchip/ISSC transparent-UART service the printer also exposes. Declared
 *  so Chrome permits access; the ff00 service is what we actually drive. */
const ISSC_SERVICE = "49535343-fe7d-4ae5-8fa9-9fafd205e455";

// ------------------------------------------------------------------ geometry

/** 203 dpi = 8 dots/mm. Confirmed by the printer itself via GET_PRODUCT_MODEL. */
export const DOTS_PER_MM = 8;
/** Print head is 48mm wide = 384 dots, even on a 50mm-wide label. */
export const PRINT_WIDTH_DOTS = 384;
export const BYTES_PER_ROW = PRINT_WIDTH_DOTS / 8;

/**
 * The printer begins printing ~10mm into each label: its gap sensor sits
 * upstream of the print head, and this firmware never back-feeds to
 * compensate. Every documented remedy (LEARN_TAG_PAPER, SET_FEEDBACK_LENGTH,
 * MOVE_PAPER, page mode) is acknowledged and ignored, so the first 10mm of
 * the label under the head can never be printed.
 *
 * The firmware does, however, print straight across label gaps — a too-tall
 * image simply overruns onto the next label. `printLabels` exploits that:
 * each job leads with blank rows spanning the rest of the current label plus
 * the gap, so the artwork lands top-aligned on the NEXT label at full 30mm
 * height. The label under the head at job start comes out blank — one
 * sacrificial label per job, which is why batch printing chains every label
 * into a single job.
 */
/**
 * HEAD_OFFSET_DOTS and GAP_DOTS are EFFECTIVE values, calibrated from chained
 * ruler prints — not physical measurements. The caliper says the backing gap
 * is 4.8mm, but closing the observed per-label drift needs 48 dots (6mm): the
 * printer under-feeds ~1.2mm per 35mm of travel, and the effective numbers
 * absorb that. If a future roll drifts, recalibrate with the lab page:
 * per-label drift tunes GAP_DOTS, then constant clipping tunes this offset.
 */
export const HEAD_OFFSET_DOTS = 67;
/** Full height of a 30mm die-cut label. */
export const LABEL_HEIGHT_DOTS = 240;
/** Effective label-to-label spacing (see HEAD_OFFSET_DOTS above). */
export const GAP_DOTS = 48;

// --------------------------------------------------------------- PN81 packets

/** Standard reflected CRC-32 table (poly 0xEDB88320). */
const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (c & 1 ? 0xedb88320 : 0);
    t[i] = c >>> 0;
  }
  return t;
})();

/**
 * PN81 seeds its CRC with 0x896ACADE rather than the usual 0xFFFFFFFF. The
 * compiler had folded this into the first loop iteration as `byte ^ 0xDE`
 * followed by `^ 0x00896ACA`, which is the only reason it was recoverable.
 */
const CRC_SEED = 0x896acade;

function crc32(bytes: Uint8Array): number {
  let c = CRC_SEED >>> 0;
  for (let i = 0; i < bytes.length; i++) {
    c = (CRC_TABLE[(c ^ bytes[i]) & 0xff] ^ (c >>> 8)) >>> 0;
  }
  return (~c) >>> 0;
}

/** 28 = RTProtocalPN81, the protocol RLabel initialises the SDK with. */
const PROTOCOL_PN81 = 0x1c;

/**
 * Build one PN81 packet.
 *
 *   A3 1E | type | enc | len16 | 11 | super | sub | payloadLen16 | payload | crc32
 *
 * `enc` is the encryption type in its high nibble; 0x00 is ENCRYPT_TYPE_NONE
 * and is what every image builder uses. The CRC does NOT cover this byte, so a
 * wrong value is happily acknowledged and then misparsed — which is exactly how
 * a mis-set encrypt byte cost us several labels during development.
 */
export function pn81(
  superCode: number,
  subCode: number,
  payload: Uint8Array = new Uint8Array(0),
  enc = 0x00
): Uint8Array {
  const body = new Uint8Array(5 + payload.length);
  body[0] = 0x11;
  body[1] = superCode & 0xff;
  body[2] = subCode & 0xff;
  body[3] = payload.length & 0xff;
  body[4] = (payload.length >> 8) & 0xff;
  body.set(payload, 5);

  const out = new Uint8Array(6 + body.length + 4);
  out[0] = 0xa3;
  out[1] = 0x1e;
  out[2] = PROTOCOL_PN81;
  out[3] = enc;
  out[4] = body.length & 0xff;
  out[5] = (body.length >> 8) & 0xff;
  out.set(body, 6);

  const crc = crc32(body);
  const o = 6 + body.length;
  out[o] = crc & 0xff;
  out[o + 1] = (crc >>> 8) & 0xff;
  out[o + 2] = (crc >>> 16) & 0xff;
  out[o + 3] = (crc >>> 24) & 0xff;
  return out;
}

/** Command codes, from the SDK's FunCodeEnum. */
export const CMD = {
  GET_PRODUCT_MODEL: [1, 4],
  GET_SERIAL: [1, 6],
  GET_FIRMWARE: [1, 11],
  GET_STATUS: [1, 19],
  PRINT_SELF_TEST: [5, 9],
  PRINT_START: [5, 11],
  PRINT_STOP: [5, 12],
  PRINT_DATA: [5, 13],
  SET_PAPER_TYPE: [5, 17],
} as const;

/** RTPaperTypeEnum. Die-cut label rolls are GAP; CONTINUOUS makes the printer
 *  feed forever because there is no gap for it to stop at. */
export const PAPER = { CONTINUOUS: 0, GAP: 1, BLACK: 2, WHITE: 3, TRANSPARENT: 4 } as const;

// ------------------------------------------------------------------ rasterise

/**
 * Pack a canvas into the printer's 1-bit raster: MSB = leftmost pixel, a set
 * bit meaning "burn this dot". Plain luminance threshold, no dithering — label
 * artwork is text and QR modules, where dithering only softens edges.
 */
export function rasterise(canvas: HTMLCanvasElement): Uint8Array {
  const { width: w, height: h } = canvas;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("canvas 2d context unavailable");
  const px = ctx.getImageData(0, 0, w, h).data;

  const out = new Uint8Array(BYTES_PER_ROW * h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < Math.min(w, PRINT_WIDTH_DOTS); x++) {
      const i = (y * w + x) * 4;
      const lum = 0.299 * px[i] + 0.587 * px[i + 1] + 0.114 * px[i + 2];
      if (lum < 128) out[y * BYTES_PER_ROW + (x >> 3)] |= 0x80 >> (x & 7);
    }
  }
  return out;
}

// -------------------------------------------------------------------- driving

export interface R22Connection {
  device: BluetoothDevice;
  characteristic: BluetoothRemoteGATTCharacteristic;
}

/**
 * Why printing is unavailable, phrased so the person at the desk knows what to
 * do — returns null when it should work.
 *
 * The iOS case is worth spelling out: Apple requires every iOS browser to use
 * WebKit, and WebKit has never implemented Web Bluetooth, so Chrome/Edge/Firefox
 * on an iPhone are all Safari underneath and none of them can print. Installing
 * a different browser is the obvious thing to try and it does not help.
 */
export function unsupportedReason(): string | null {
  if (typeof navigator === "undefined") return null;
  const ua = navigator.userAgent || "";
  const isIOS =
    /iPad|iPhone|iPod/.test(ua) ||
    // iPadOS reports itself as a Mac; touch points give it away.
    (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);

  if (isIOS) {
    return (
      "iPhones and iPads can't print labels. Apple makes every iOS browser use " +
      "Safari's engine, which has no Bluetooth support — installing Chrome won't " +
      "help. Use a computer with Chrome or Edge, an Android phone, or the free " +
      "Bluefy browser from the App Store."
    );
  }
  if (!window.isSecureContext) {
    return "Printing needs a secure (https://) connection. Open the app over HTTPS and try again.";
  }
  if (!navigator.bluetooth) {
    return "This browser can't print labels. Use Chrome or Edge, on a computer or Android.";
  }
  return null;
}

/** Prompts the chooser. Must be called from a user gesture. */
export async function connect(): Promise<R22Connection> {
  const reason = unsupportedReason();
  if (reason) throw new Error(reason);
  if (!navigator.bluetooth) throw new Error("Web Bluetooth unavailable.");
  const device = await navigator.bluetooth.requestDevice({
    filters: [{ namePrefix: "R22" }, { services: [R22_SERVICE] }],
    optionalServices: [R22_SERVICE, ISSC_SERVICE],
  });
  const server = await device.gatt!.connect();
  const service = await server.getPrimaryService(R22_SERVICE);
  const characteristic = await service.getCharacteristic(R22_WRITE_CHAR);
  return { device, characteristic };
}

/** The printer sleeps aggressively; reconnecting needs no fresh chooser. */
export async function reconnect(conn: R22Connection): Promise<R22Connection> {
  if (conn.device.gatt?.connected) return conn;
  const server = await conn.device.gatt!.connect();
  const service = await server.getPrimaryService(R22_SERVICE);
  const characteristic = await service.getCharacteristic(R22_WRITE_CHAR);
  return { device: conn.device, characteristic };
}

/** BLE MTU negotiates to 250, so 240-byte writes are safe and ~9x faster than
 *  the 100-byte chunks the vendor's own web tooling uses. */
const BLE_CHUNK = 240;
const BLE_DELAY_MS = 8;

async function write(ch: BluetoothRemoteGATTCharacteristic, bytes: Uint8Array) {
  for (let o = 0; o < bytes.length; o += BLE_CHUNK) {
    const part = bytes.slice(o, o + BLE_CHUNK);
    if (ch.properties.writeWithoutResponse) await ch.writeValueWithoutResponse(part);
    else await ch.writeValueWithResponse(part);
    if (BLE_DELAY_MS) await new Promise((r) => setTimeout(r, BLE_DELAY_MS));
  }
}

export interface PrintOptions {
  /** Inter-label gap in dots. ~2mm of backing between die-cut labels. */
  gap?: number;
  paperType?: number;
  /** Max PN81 payload per DATA packet; chunks are rounded down to whole rows. */
  maxPacket?: number;
  /**
   * Fine trim, in dots, added to the blank lead of a full-bleed job. Positive
   * pushes the artwork further down the label, negative pulls it up, if the
   * real head offset turns out to differ slightly from HEAD_OFFSET_DOTS.
   */
  trim?: number;
}

/**
 * Print one label. The job is START → DATA… → STOP; the DATA payload carries an
 * 11-byte sub-header before each run of whole raster rows.
 */
export async function printLabel(
  ch: BluetoothRemoteGATTCharacteristic,
  raster: Uint8Array,
  heightDots: number,
  opts: PrintOptions = {}
): Promise<void> {
  const gap = opts.gap ?? 16;
  const paperType = opts.paperType ?? PAPER.GAP;
  const maxPacket = opts.maxPacket ?? 512;

  const start = new Uint8Array([
    PRINT_WIDTH_DOTS & 0xff,
    (PRINT_WIDTH_DOTS >> 8) & 0xff,
    heightDots & 0xff,
    (heightDots >> 8) & 0xff,
    paperType,
    gap,
    0, // isPageMode — makes no difference on this firmware
  ]);
  await write(ch, pn81(...CMD.PRINT_START, start));
  await new Promise((r) => setTimeout(r, 250));

  const rowsPerPacket = Math.max(1, Math.floor((maxPacket - 7) / BYTES_PER_ROW));
  const chunkBytes = rowsPerPacket * BYTES_PER_ROW;

  let packet = 0;
  let row = 0;
  for (let o = 0; o < raster.length; o += chunkBytes, packet++) {
    const chunk = raster.subarray(o, Math.min(o + chunkBytes, raster.length));
    const payload = new Uint8Array(11 + chunk.length);
    payload[0] = packet & 0xff;
    payload[1] = (packet >> 8) & 0xff;
    const declared = chunk.length + 7;
    payload[2] = declared & 0xff;
    payload[3] = (declared >> 8) & 0xff;
    payload[4] = 1;
    payload[5] = BYTES_PER_ROW & 0xff;
    payload[6] = (BYTES_PER_ROW >> 8) & 0xff;
    payload[7] = row & 0xff;
    payload[8] = (row >> 8) & 0xff;
    payload[9] = 0;
    payload[10] = 0;
    payload.set(chunk, 11);
    await write(ch, pn81(...CMD.PRINT_DATA, payload));
    row += chunk.length / BYTES_PER_ROW;
  }

  await new Promise((r) => setTimeout(r, 250));
  await write(ch, pn81(...CMD.PRINT_STOP));
}

/**
 * Print full-bleed 30mm labels by chaining them into one continuous job.
 *
 * At job start the head sits HEAD_OFFSET_DOTS into a label whose top has
 * already passed it, so the job opens with blank rows that run out that label
 * and its gap; every raster after that lands top-aligned on a fresh label.
 * The first label of each job therefore feeds through blank — chain a whole
 * batch into one call to pay that cost once, not per label.
 *
 * Each raster must be a whole number of BYTES_PER_ROW rows, normally
 * LABEL_HEIGHT_DOTS tall. Alignment across the chain relies on the physical
 * pitch matching LABEL_HEIGHT_DOTS + gap exactly; the stock is die-cut, so
 * there is no cumulative drift for it to correct anyway.
 */
export async function printLabels(
  ch: BluetoothRemoteGATTCharacteristic,
  rasters: Uint8Array[],
  opts: PrintOptions = {}
): Promise<void> {
  if (rasters.length === 0) return;
  const gap = opts.gap ?? GAP_DOTS;
  const lead = Math.max(
    0,
    LABEL_HEIGHT_DOTS - HEAD_OFFSET_DOTS + gap + (opts.trim ?? 0)
  );

  let rows = lead;
  for (const r of rasters) rows += r.length / BYTES_PER_ROW + gap;
  rows -= gap; // no trailing gap: end the job at the last label's bottom edge

  const job = new Uint8Array(rows * BYTES_PER_ROW);
  let at = lead;
  for (const r of rasters) {
    job.set(r, at * BYTES_PER_ROW);
    at += r.length / BYTES_PER_ROW + gap;
  }

  await printLabel(ch, job, rows, opts);
}
