// Minimal Web NFC declarations (Android Chrome only) — not in lib.dom yet.
interface NDEFReadingEvent extends Event {
  serialNumber: string;
}

declare class NDEFReader {
  constructor();
  scan(options?: { signal?: AbortSignal }): Promise<void>;
  onreading: ((event: NDEFReadingEvent) => void) | null;
  onreadingerror: ((event: Event) => void) | null;
}

interface Window {
  NDEFReader?: typeof NDEFReader;
}
