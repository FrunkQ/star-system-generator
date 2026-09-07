// JS-heap gauge for the perf comb (2026-08): the app has genuinely run out of memory in a live
// session, so the headroom needs to be visible before the tab dies, not diagnosable after.
//
// Chrome (and Chromium-family) expose performance.memory: usedJSHeapSize and jsHeapSizeLimit — the
// limit is the allocation ceiling the tab will actually be killed against, which is exactly the
// "max memory allocated" a warning must be judged on. The values are coarse-grained (bucketed for
// privacy unless cross-origin isolated) but easily good enough for a gauge. Firefox/Safari expose
// nothing: report that honestly rather than guessing.
//
// The store only polls while something subscribes (the Settings panel, the warning watcher), so an
// idle app pays nothing.
import { readable } from 'svelte/store';

export interface MemoryReading {
  supported: boolean;
  usedMB: number;
  limitMB: number;
  frac: number; // used / limit, 0 when unsupported
}

type PerfMemory = { usedJSHeapSize: number; jsHeapSizeLimit: number };

export function readMemory(): MemoryReading {
  const mem = typeof performance !== 'undefined'
    ? (performance as unknown as { memory?: PerfMemory }).memory
    : undefined;
  if (!mem || !mem.jsHeapSizeLimit) return { supported: false, usedMB: 0, limitMB: 0, frac: 0 };
  const usedMB = mem.usedJSHeapSize / 1048576;
  const limitMB = mem.jsHeapSizeLimit / 1048576;
  return { supported: true, usedMB, limitMB, frac: limitMB > 0 ? usedMB / limitMB : 0 };
}

export const memoryReading = readable<MemoryReading>(readMemory(), (set) => {
  if (typeof window === 'undefined') return;
  const id = setInterval(() => set(readMemory()), 5000);
  set(readMemory());
  return () => clearInterval(id);
});

// Warning ladder: warn once at 80% of the limit, once more at 90%, and re-arm only after usage
// falls back below 65% — so a session hovering at the line gets one warning, not a nag per poll.
export const MEMORY_WARN_FRAC = 0.8;
export const MEMORY_CRITICAL_FRAC = 0.9;
export const MEMORY_REARM_FRAC = 0.65;

export function formatMB(mb: number): string {
  return mb >= 1024 ? `${(mb / 1024).toFixed(1)} GB` : `${Math.round(mb)} MB`;
}

// The rail strip's ladder (owner, 2026-08-28): ABSOLUTE gigabytes, because the observed collapse is
// absolute — "things tend to collapse at 3.5Gb" — regardless of what fraction of the allocation
// limit that happens to be on a given machine. The strip goes orange at 2 GB and red at 3 GB.
// The FRACTION ladder above still applies too: on a browser profile whose limit is below ~3.4 GB
// the absolute ladder alone would warn too late, so the level is the WORST of the two readings.
export const MEMORY_ORANGE_MB = 2048;
export const MEMORY_RED_MB = 3072;

export type MemoryLevel = 'green' | 'orange' | 'red';

/** The strip's colour for a reading — worst of the absolute-GB and fraction-of-limit ladders. */
export function memoryLevel(r: MemoryReading): MemoryLevel {
  if (!r.supported) return 'green';
  if (r.usedMB >= MEMORY_RED_MB || r.frac >= MEMORY_CRITICAL_FRAC) return 'red';
  if (r.usedMB >= MEMORY_ORANGE_MB || r.frac >= MEMORY_WARN_FRAC) return 'orange';
  return 'green';
}
