// Lightweight performance tracker for the long-standing "random slowdowns" hunt. Counts interesting
// events (scene rebuilds, broadcast syncs) and watches the frame rate; when a 5-second window averages
// below 45fps it logs ONE compact line with the counters and the JS heap, so a slow spell leaves
// evidence of what was busy. Inspect any time via window.__ssePerf. Zero overhead beyond a counter
// increment per event and one division every 5s.
//
// VERBOSE MODE (the perf-comb instrument, 2026-08): switched on with ?perf=1 on any route, with
// localStorage['sse-perf']='1', or at runtime via window.__ssePerf.enable(). When on:
//   - the 5s line logs EVERY window, not only slow ones, so a healthy heap timeline is evidence too;
//   - registered providers (renderer.info.memory etc.) are appended, so GPU-side resource counts sit
//     beside the JS heap in the same line;
//   - load-stage stamps ([sse-load]) are printed as they land rather than only banked.
// Counters and stage stamps are ALWAYS collected (they are a map write); only the console output is
// gated. window.__ssePerf.report() dumps everything on demand, enabled or not.
export const perfCounters: Record<string, number> = {};
export function perfCount(name: string, n = 1) {
  perfCounters[name] = (perfCounters[name] ?? 0) + n;
}

// --- on/off switch -------------------------------------------------------------------------------
let verbose = false;
function detectEnabled(): boolean {
  try {
    if (new URLSearchParams(location.search).get('perf') === '1') return true;
    return localStorage.getItem('sse-perf') === '1';
  } catch { return false; }
}
export function perfEnabled(): boolean { return verbose; }
function setEnabled(on: boolean) {
  verbose = on;
  try { localStorage.setItem('sse-perf', on ? '1' : '0'); } catch { /* private mode */ }
  console.info('[sse-perf]', on ? 'verbose tracing ON' : 'verbose tracing off');
}

// --- providers: live gauges appended to every verbose line ---------------------------------------
// A provider returns a small flat object (e.g. three's renderer.info.memory: {geometries, textures}).
// Registered by the subsystem that owns the resource, read only when a line is printed.
const providers: Record<string, () => Record<string, number>> = {};
export function perfProvider(name: string, fn: () => Record<string, number>) { providers[name] = fn; }
function readProviders(): string {
  const parts: string[] = [];
  for (const [name, fn] of Object.entries(providers)) {
    try { parts.push(`${name} ${JSON.stringify(fn())}`); } catch { /* provider gone */ }
  }
  return parts.join(' ');
}

export function heapMB(): number | null {
  const mem = (performance as unknown as { memory?: { usedJSHeapSize: number } }).memory?.usedJSHeapSize;
  return mem ? mem / 1048576 : null;
}

// --- load-stage stamps ---------------------------------------------------------------------------
// One stamp per named stage of a cold load (storage read, per-system physics, first frame...), so a
// hang names the LAST STAGE THAT COMPLETED — the difference between "physics is slow" and "physics
// finished and the first render hung", which reads identically from a stuck progress bar.
// Always collected; window.__ssePerf.report() prints the table, verbose mode prints stamps live.
const loadStages: { stage: string; atMs: number; sinceLastMs: number }[] = [];
let lastStageAt = 0;
export function perfStage(stage: string) {
  if (typeof performance === 'undefined') return;
  const now = performance.now();
  loadStages.push({ stage, atMs: Math.round(now), sinceLastMs: Math.round(now - (lastStageAt || now)) });
  lastStageAt = now;
  if (verbose) {
    const h = heapMB();
    console.info('[sse-load]', stage, `+${Math.round(now - (loadStages.length > 1 ? loadStages[loadStages.length - 2].atMs : now))}ms`, h ? `heap ${h.toFixed(0)}MB` : '');
  }
}

function report() {
  const h = heapMB();
  console.info('[sse-perf] counters', JSON.stringify(perfCounters));
  console.info('[sse-perf] heap', h ? `${h.toFixed(0)}MB` : 'unavailable', readProviders());
  if (loadStages.length) console.table(loadStages);
}

// --- frame watcher -------------------------------------------------------------------------------
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
  if (fps < 45 || verbose) {
    const h = heapMB();
    const line = [`${fps.toFixed(1)}fps over 5s`, h ? `heap ${h.toFixed(0)}MB` : '', readProviders(), JSON.stringify(perfCounters)];
    (fps < 45 ? console.warn : console.info)('[sse-perf]', ...line.filter(Boolean));
  }
}

if (typeof window !== 'undefined') {
  verbose = detectEnabled();
  if (verbose) console.info('[sse-perf] verbose tracing ON (?perf=1 or localStorage sse-perf)');
  (window as unknown as Record<string, unknown>).__ssePerf = {
    counters: perfCounters,
    loadStages,
    enable: () => setEnabled(true),
    disable: () => setEnabled(false),
    report
  };
}
