// Lightweight performance tracker for the long-standing "random slowdowns" hunt. Counts interesting
// events (scene rebuilds, broadcast syncs) and watches the frame rate; when a 5-second window averages
// below 45fps it logs ONE compact line with the counters and the JS heap, so a slow spell leaves
// evidence of what was busy. Inspect any time via window.__ssePerf. Zero overhead beyond a counter
// increment per event and one division every 5s.
export const perfCounters: Record<string, number> = {};
export function perfCount(name: string, n = 1) {
  perfCounters[name] = (perfCounters[name] ?? 0) + n;
}

let winStart = 0;
let frames = 0;
export function perfFrame(nowMs: number) {
  if (!winStart) { winStart = nowMs; frames = 0; return; }
  frames++;
  const dt = nowMs - winStart;
  if (dt < 5000) return;
  const fps = (frames * 1000) / dt;
  winStart = nowMs;
  frames = 0;
  if (fps < 45) {
    const mem = (performance as unknown as { memory?: { usedJSHeapSize: number } }).memory?.usedJSHeapSize;
    console.warn('[sse-perf]', `${fps.toFixed(1)}fps over 5s`, mem ? `heap ${(mem / 1048576).toFixed(0)}MB` : '', JSON.stringify(perfCounters));
  }
}

if (typeof window !== 'undefined') (window as unknown as Record<string, unknown>).__ssePerf = { counters: perfCounters };
