/**
 * Support debug dump — triggered by Ctrl+Alt+Shift+D (or window.SSE_DEBUG_DUMP()
 * from the devtools console). Produces:
 *   1. SSE-DebugDump-<date>.json — environment, storage, errors, full IndexedDB +
 *      localStorage contents (API keys redacted).
 *   2. <name>-Starmap-RECOVERED.json — best-available starmap in the normal
 *      import format (runtime store, else IndexedDB save, else legacy localStorage).
 *   3. <name>-System-RECOVERED.json — the system currently on screen, if any.
 *
 * Deliberately framework-free and defensive: every section is wrapped so a
 * broken storage layer (the very thing being diagnosed) can't prevent the dump.
 * Lives at the layout level so it works even when the main view fails to render.
 */

export interface DebugBuildInfo {
  version: string;
  commit: string;
  time: string;
}

export interface DebugRuntimeSnapshot {
  currentSystemId: string | null;
  currentSystem: unknown | null;
  starmap: unknown | null;
}

type StateProvider = () => DebugRuntimeSnapshot;

let stateProvider: StateProvider | null = null;

/** The app shell registers a function returning the live stores' contents. */
export function registerDebugStateProvider(fn: StateProvider | null): void {
  stateProvider = fn;
}

// ---------------------------------------------------------------------------
// Console / error capture (ring buffer, installed once at app start)
// ---------------------------------------------------------------------------

interface CapturedEntry {
  when: string;
  kind: 'console.error' | 'console.warn' | 'window.error' | 'unhandledrejection';
  message: string;
}

const MAX_CAPTURED = 200;
const capturedErrors: CapturedEntry[] = [];
let captureInstalled = false;

function pushCaptured(kind: CapturedEntry['kind'], parts: unknown[]): void {
  const message = parts
    .map((p) => {
      if (p instanceof Error) return `${p.name}: ${p.message}\n${p.stack ?? ''}`;
      if (typeof p === 'string') return p;
      try {
        return JSON.stringify(p);
      } catch {
        return String(p);
      }
    })
    .join(' ')
    .slice(0, 4000);
  capturedErrors.push({ when: new Date().toISOString(), kind, message });
  if (capturedErrors.length > MAX_CAPTURED) capturedErrors.shift();
}

/** Install console/window error capture + the global console hook. Idempotent. */
export function installDebugCapture(): void {
  if (captureInstalled || typeof window === 'undefined') return;
  captureInstalled = true;

  const origError = console.error.bind(console);
  const origWarn = console.warn.bind(console);
  console.error = (...args: unknown[]) => {
    pushCaptured('console.error', args);
    origError(...args);
  };
  console.warn = (...args: unknown[]) => {
    pushCaptured('console.warn', args);
    origWarn(...args);
  };

  window.addEventListener('error', (e) => {
    pushCaptured('window.error', [
      `${e.message} (${e.filename ?? '?'}:${e.lineno ?? '?'}:${e.colno ?? '?'})`,
      e.error instanceof Error ? e.error : ''
    ]);
  });
  window.addEventListener('unhandledrejection', (e) => {
    pushCaptured('unhandledrejection', [e.reason]);
  });

  // Console escape hatch for support: works even if the key combo is awkward.
  (window as unknown as Record<string, unknown>).SSE_DEBUG_DUMP = () => runDebugDump(null);
}

// ---------------------------------------------------------------------------
// Redaction — never let API keys leave the browser in a support file
// ---------------------------------------------------------------------------

const SECRET_KEY_RE = /apikey|api_key|secret|token|password/i;

export function redactSecrets<T>(value: T, depth = 0): T {
  if (depth > 24 || value === null || typeof value !== 'object') return value;
  if (Array.isArray(value)) {
    return value.map((v) => redactSecrets(v, depth + 1)) as unknown as T;
  }
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
    if (SECRET_KEY_RE.test(k) && typeof v === 'string' && v.length > 0) {
      out[k] = '[REDACTED]';
    } else {
      out[k] = redactSecrets(v, depth + 1);
    }
  }
  return out as T;
}

// ---------------------------------------------------------------------------
// Collectors — each isolated so one failure can't sink the dump
// ---------------------------------------------------------------------------

async function safe<T>(label: string, fn: () => T | Promise<T>): Promise<T | { __error: string }> {
  try {
    return await fn();
  } catch (err) {
    return { __error: `${label} failed: ${err instanceof Error ? err.message : String(err)}` };
  }
}

function collectEnvironment(): Record<string, unknown> {
  const nav = navigator as Navigator & {
    userAgentData?: { brands?: unknown; platform?: string; mobile?: boolean };
    deviceMemory?: number;
  };
  return {
    url: location.href,
    referrer: document.referrer || null,
    userAgent: nav.userAgent,
    userAgentData: nav.userAgentData
      ? { brands: nav.userAgentData.brands, platform: nav.userAgentData.platform, mobile: nav.userAgentData.mobile }
      : null,
    platform: nav.platform,
    language: nav.language,
    languages: nav.languages,
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    cookieEnabled: nav.cookieEnabled,
    online: nav.onLine,
    hardwareConcurrency: nav.hardwareConcurrency,
    deviceMemory: nav.deviceMemory ?? null,
    maxTouchPoints: nav.maxTouchPoints,
    screen: {
      width: screen.width,
      height: screen.height,
      availWidth: screen.availWidth,
      availHeight: screen.availHeight,
      colorDepth: screen.colorDepth,
      devicePixelRatio: window.devicePixelRatio
    },
    window: { innerWidth: window.innerWidth, innerHeight: window.innerHeight },
    localTime: new Date().toString()
  };
}

function collectGpuInfo(): Record<string, unknown> {
  const canvas = document.createElement('canvas');
  const gl = (canvas.getContext('webgl2') ?? canvas.getContext('webgl')) as WebGLRenderingContext | null;
  if (!gl) return { webgl: false };
  const dbg = gl.getExtension('WEBGL_debug_renderer_info');
  return {
    webgl: true,
    vendor: dbg ? gl.getParameter(dbg.UNMASKED_VENDOR_WEBGL) : gl.getParameter(gl.VENDOR),
    renderer: dbg ? gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER)
  };
}

async function collectStorageInfo(): Promise<Record<string, unknown>> {
  const out: Record<string, unknown> = {};
  if (navigator.storage?.estimate) {
    const est = await navigator.storage.estimate();
    out.quotaBytes = est.quota ?? null;
    out.usageBytes = est.usage ?? null;
  }
  if (navigator.storage?.persisted) {
    out.persisted = await navigator.storage.persisted();
  }
  return out;
}

async function collectServiceWorkerInfo(): Promise<Record<string, unknown>> {
  const out: Record<string, unknown> = { supported: 'serviceWorker' in navigator };
  if ('serviceWorker' in navigator) {
    const regs = await navigator.serviceWorker.getRegistrations();
    out.registrations = regs.map((r) => ({
      scope: r.scope,
      active: r.active?.state ?? null,
      waiting: r.waiting?.state ?? null,
      installing: r.installing?.state ?? null
    }));
  }
  if ('caches' in window) {
    out.cacheKeys = await caches.keys();
  }
  return out;
}

function collectLocalStorage(): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (key === null) continue;
    const raw = localStorage.getItem(key);
    if (raw === null) continue;
    try {
      out[key] = redactSecrets(JSON.parse(raw));
    } catch {
      out[key] = SECRET_KEY_RE.test(key) ? '[REDACTED]' : raw;
    }
  }
  return out;
}

async function listIndexedDbNames(): Promise<string[]> {
  const idb = window.indexedDB as IDBFactory & { databases?: () => Promise<{ name?: string }[]> };
  if (idb.databases) {
    const dbs = await idb.databases();
    const names = dbs.map((d) => d.name).filter((n): n is string => !!n);
    if (names.length > 0) return names;
  }
  // Fallback for browsers without indexedDB.databases(): the known SSE database.
  return ['stargen_storage'];
}

function dumpObjectStore(db: IDBDatabase, storeName: string): Promise<unknown> {
  return new Promise((resolve) => {
    try {
      const tx = db.transaction(storeName, 'readonly');
      const store = tx.objectStore(storeName);
      const keysReq = store.getAllKeys();
      const valsReq = store.getAll();
      tx.oncomplete = () => {
        const keys = keysReq.result ?? [];
        const vals = valsReq.result ?? [];
        const records: Record<string, unknown> = {};
        keys.forEach((k, i) => {
          records[String(k)] = redactSecrets(vals[i]);
        });
        resolve({ recordCount: keys.length, records });
      };
      tx.onerror = () => resolve({ __error: String(tx.error ?? 'transaction failed') });
      tx.onabort = () => resolve({ __error: String(tx.error ?? 'transaction aborted') });
    } catch (err) {
      resolve({ __error: err instanceof Error ? err.message : String(err) });
    }
  });
}

async function collectIndexedDb(): Promise<Record<string, unknown>> {
  if (typeof window.indexedDB === 'undefined') return { available: false };
  const out: Record<string, unknown> = { available: true, databases: {} };
  const names = await listIndexedDbNames();
  for (const name of names) {
    out.databases = out.databases as Record<string, unknown>;
    (out.databases as Record<string, unknown>)[name] = await safe(`indexedDB ${name}`, async () => {
      const db = await new Promise<IDBDatabase>((resolve, reject) => {
        const req = window.indexedDB.open(name); // no version → opens latest, never upgrades
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error ?? new Error('open failed'));
        req.onblocked = () => reject(new Error('open blocked'));
      });
      try {
        const stores: Record<string, unknown> = {};
        for (const storeName of Array.from(db.objectStoreNames)) {
          stores[storeName] = await dumpObjectStore(db, storeName);
        }
        return { version: db.version, objectStores: stores };
      } finally {
        db.close();
      }
    });
  }
  return out;
}

// ---------------------------------------------------------------------------
// Assembly + download
// ---------------------------------------------------------------------------

function downloadJson(filename: string, data: unknown): boolean {
  try {
    const json = JSON.stringify(data, null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    return true;
  } catch (err) {
    console.error('Debug dump download failed:', filename, err);
    return false;
  }
}

function safeFileStem(name: unknown): string {
  return String(name ?? '').replace(/\s+/g, '_').replace(/[^\w-]/g, '') || 'unnamed';
}

/**
 * Collect + download the dump and the recovery files. Files are written
 * INCREMENTALLY in reverse likelihood of failure, so the rawest data escapes
 * the browser even if a later step hangs or throws:
 *   1. raw IndexedDB contents (fewest moving parts — no app code involved)
 *   2. session/browser data (environment, localStorage, errors, SW state)
 *   3. in-app recovery saves (depends on the running app's state — riskiest)
 * Returns a human-readable summary (also shown in an alert for the end user).
 */
export async function runDebugDump(buildInfo: DebugBuildInfo | null): Promise<string> {
  const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-');
  const produced: string[] = [];
  const failed: string[] = [];
  const app = { name: 'Star System Explorer', build: buildInfo, host: location.hostname };

  // STEP 1 — raw IndexedDB straight to disk before anything else runs.
  const idbDump = await safe('indexedDB', collectIndexedDb);
  (downloadJson(`SSE-IndexedDB-RAW-${stamp}.json`, {
    dumpFormat: 1,
    generatedAt: new Date().toISOString(),
    app,
    indexedDB: idbDump
  })
    ? produced
    : failed
  ).push('raw IndexedDB dump');

  // STEP 2 — session/browser diagnostics.
  const runtime = stateProvider
    ? await safe('runtime state', () => stateProvider!())
    : { __error: 'no runtime state provider registered (app shell may not have mounted)' };
  const runtimePartial = runtime as Partial<DebugRuntimeSnapshot>;
  (downloadJson(`SSE-DebugDump-${stamp}.json`, {
    dumpFormat: 1,
    generatedAt: new Date().toISOString(),
    app,
    environment: await safe('environment', collectEnvironment),
    gpu: await safe('gpu', collectGpuInfo),
    storageQuota: await safe('storage quota', collectStorageInfo),
    serviceWorker: await safe('service worker', collectServiceWorkerInfo),
    capturedErrors,
    localStorage: await safe('localStorage', collectLocalStorage),
    // Summary only — the full payloads travel in the RAW + RECOVERED files.
    runtimeState: {
      providerRegistered: !!stateProvider,
      currentSystemId: runtimePartial.currentSystemId ?? null,
      currentSystemName: (runtimePartial.currentSystem as { name?: string } | null)?.name ?? null,
      starmapName: (runtimePartial.starmap as { name?: string } | null)?.name ?? null,
      starmapSystemCount:
        (runtimePartial.starmap as { systems?: unknown[] } | null)?.systems?.length ?? null,
      error: (runtime as { __error?: string }).__error ?? null
    }
  })
    ? produced
    : failed
  ).push('debug dump');

  // STEP 3 — in-app recovery saves, riskiest last. Starmap prefers the live
  // store, else the saved copy from IndexedDB (already collected above), else
  // the legacy localStorage save. Written in the normal import format.
  let starmap: unknown = runtimePartial.starmap ?? null;
  let starmapSource = 'live app state';
  if (!starmap) {
    try {
      const idb = idbDump as { databases?: Record<string, { objectStores?: Record<string, { records?: Record<string, unknown> }> }> };
      starmap = idb?.databases?.['stargen_storage']?.objectStores?.['kv']?.records?.['saved_starmap'] ?? null;
      starmapSource = 'IndexedDB saved copy';
    } catch {
      /* fall through */
    }
  }
  if (!starmap) {
    starmap = await safe('legacy localStorage starmap', () => {
      const raw = localStorage.getItem('stargen_saved_starmap');
      return raw ? (JSON.parse(raw) as unknown) : null;
    });
    if (starmap && (starmap as { __error?: string }).__error) starmap = null;
    starmapSource = 'legacy localStorage save';
  }
  if (starmap) {
    const name = safeFileStem((starmap as { name?: string }).name);
    (downloadJson(`${name}-Starmap-RECOVERED.json`, starmap) ? produced : failed).push(
      `starmap (${starmapSource})`
    );
  } else {
    failed.push('starmap (none found in app, IndexedDB or localStorage)');
  }

  if (runtimePartial.currentSystem) {
    const name = safeFileStem((runtimePartial.currentSystem as { name?: string }).name);
    (downloadJson(`${name}-System-RECOVERED.json`, runtimePartial.currentSystem) ? produced : failed).push(
      'current system'
    );
  }

  const summary =
    `SSE debug dump complete.\n\nSaved to your Downloads folder:\n` +
    produced.map((p) => `  • ${p}`).join('\n') +
    (failed.length ? `\n\nCould not produce:\n` + failed.map((f) => `  • ${f}`).join('\n') : '') +
    `\n\nPlease send the SSE-IndexedDB-RAW and SSE-DebugDump files to the developer.` +
    ` The RECOVERED files can be re-imported via Upload if your starmap is not loading.`;
  return summary;
}
