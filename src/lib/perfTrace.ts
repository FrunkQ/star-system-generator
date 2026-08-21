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
//
// EVENT RING (P2, 2026-08-17): counters say how often, never WHY. perfEvent() records one cheap row
// per occurrence into a bounded ring that is ALWAYS on, and window.__ssePerf.events() dumps it —
// built for faults that are intermittent and cleared by the refresh you would use to go and look.
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

// --- event ring: WHY something happened, not just how often ---------------------------------------
// A counter says four rebuilds happened; it cannot say who asked for them. This is the bounded log
// that answers that, and it is the shape __camDebug had to grow before it settled RENDER-S15:
// one row per occurrence, one field per possible cause.
//
// THE RING IS ALWAYS RECORDING, and that is the whole point (P2): the fault it was built for is
// INTERMITTENT and a hard refresh clears it, so an instrument you have to switch on beforehand
// arrives too late every time. Keep rows CHEAP — a few numbers and short strings, no payload
// inspection — so always-on costs nothing. Anything expensive belongs behind an explicit opt-in
// inside the caller (see holo/scene.ts's __rebuildDebug content hash).
const EVENT_RING_MAX = 300;
const perfEvents: Record<string, unknown>[] = [];
export function perfEvent(name: string, data: Record<string, unknown> = {}) {
  if (typeof performance === 'undefined') return;
  perfEvents.push({ t: Math.round(performance.now()), name, ...data });
  if (perfEvents.length > EVENT_RING_MAX) perfEvents.shift();
}
/** Dump the ring, newest last. `name` filters to one event kind. THE one action to run mid-fault. */
function events(n = 60, name?: string) {
  const rows = (name ? perfEvents.filter((e) => e.name === name) : perfEvents).slice(-n);
  if (!rows.length) { console.info('[sse-perf] no events recorded'); return rows; }
  // Deltas are what make a storm legible: even spacing is a driver, bursts are a retrigger.
  const withGap = rows.map((r, i) => ({ ...r, dt: i ? (r.t as number) - (rows[i - 1].t as number) : 0 }));
  console.table(withGap);
  return withGap;
}

function report() {
  const h = heapMB();
  console.info('[sse-perf] counters', JSON.stringify(perfCounters));
  console.info('[sse-perf] heap', h ? `${h.toFixed(0)}MB` : 'unavailable', readProviders());
  if (loadStages.length) console.table(loadStages);
  if (perfEvents.length) events();
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
    perfEvents,
    // Opt-in, and deliberately NOT implied by ?perf=1: sizing an inbound payload means stringifying
    // it on the receive path, which is the cost class the rebuild-storm hunt is chasing.
    rxBytes: false,
    enable: () => setEnabled(true),
    disable: () => setEnabled(false),
    report,
    events
  };
}
