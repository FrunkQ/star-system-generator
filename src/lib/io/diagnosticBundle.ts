// DIAGNOSTIC BUNDLE — everything needed to debug a load that would not finish, in one zip a user
// can hand over.
//
// WHY THIS EXISTS. A load hang is the one fault a user cannot usefully report: the app is frozen,
// there is no console on a phone, and the only visible evidence is a progress bar that has stopped
// (and which may read 100%, since the overlay outlives the work it reports — engine map UI-L1).
// The reported case cost a campaign: the user's only escape was resetting Chrome data. So when a
// load is stopped or fails, the app offers to package the ACTUAL EVIDENCE — the map it was trying
// to load, how far it got, and what the device had to work with.
//
// PRIVACY / TRUST. This is the user's campaign data, including GM notes, so it is only ever built
// when they ask for it, it downloads to their own device, and nothing is uploaded from here — they
// choose whether to send it. README.txt inside says exactly what is in the file, so nobody is
// handing over something they have not been told about.
//
// LAYOUT:
//   README.txt              what this is, what is in it, and where to send it
//   report.json             the machine-readable half: stages, memory, device, counters, per-system state
//   starmap.json            the map as STORED — the input that reproduces it, and always the file to load
//   starmap-in-memory.json  the map as it stood in memory, when that differs (see below)
//
// WHY TWO COPIES. During a load the recalc rewrites systems IN PLACE, so the live map is a half
// re-derived mixture that never existed on disk. The stored copy answers "does this data break the
// loader anywhere" — test-load it elsewhere. The live copy answers "how far did it get, and what had
// it produced". A mid-load failure wants both; on demand they differ only by unsaved edits.
import { zipSync, strToU8 } from 'fflate';
import { readMemory } from '$lib/memoryWatch';

export interface DiagnosticInput {
  /** What the user did / what happened — 'stopped by user', 'load guard tripped', … */
  reason: string;
  /**
   * THE INPUT: the map exactly as it sits in storage. This is the test-loadable copy — the bytes
   * the loader choked on — and it is what separates "this map's data breaks the loader" from "this
   * device is too slow". Null only when storage itself could not be read.
   */
  starmap: unknown | null;
  /**
   * THE STATE: the map as it was in memory at the moment of capture. During a load these differ and
   * BOTH are wanted — `recalcAllSystems` rewrites `node.system` in place, so this is a half
   * re-derived mixture that shows how far the engine got and what it produced before it stopped.
   * On demand there is no half state: this is simply the live campaign, which may hold unsaved
   * edits the stored copy does not. Omitted when it would be the same object as `starmap`.
   */
  liveStarmap?: unknown | null;
  /** Load stages recorded so far (window.__ssePerf.loadStages). */
  stages: { stage: string; atMs: number; sinceLastMs: number }[];
  /** Perf counters (window.__ssePerf.counters). */
  counters: Record<string, number>;
  /** Systems fully re-derived before the stop, in order. */
  processed: string[];
  /** The system in progress when it stopped — the prime suspect. */
  stalledOn: string | null;
  /** Where the load guard says it got to, when there is one. */
  guardStage?: string | null;
  /**
   * What the app was DOING when the bundle was built — only meaningful for an on-demand bundle
   * (Settings → System), where there is no load failure to describe and the question is instead
   * "what was on screen while this went wrong". Absent for a load-failure bundle.
   */
  runtime?: {
    openSystem?: string | null;
    view?: string | null;
    storage?: { usageBytes: number; quotaBytes: number } | null;
    perfTracingOn?: boolean;
    note?: string | null;
  } | null;
  /**
   * Where `starmap` came from. `stored` is the reproducible INPUT — the exact bytes the loader
   * choked on, test-loadable elsewhere, which is what separates a data fault from a slow device.
   * `in-memory` means storage could not be read and this is the live map, which during a load is
   * PARTLY RE-DERIVED (recalcAllSystems rewrites in place) and so is not a faithful input. Say
   * which, loudly: silently shipping the second as the first would send a debugger chasing a state
   * that never existed on disk.
   */
  mapSource?: 'stored' | 'in-memory' | 'none';
}

/**
 * A system's map coordinates. They live under `position`, NOT on the node — reading `node.x` gives
 * undefined on every real map, which is how the first version of this reported an extent of zero
 * across 42 systems. The flat spelling is kept as a fallback because hand-made and test fixtures
 * use it.
 */
function coordsOf(node: any): { x: number; y: number; z: number } {
  const p = node?.position ?? node ?? {};
  return { x: p.x ?? 0, y: p.y ?? 0, z: p.z ?? 0 };
}

/** A system's shape, without its contents: enough to spot the outlier that broke the load. */
function systemShape(node: any): Record<string, unknown> {
  const sys = node?.system;
  const nodes: any[] = sys?.nodes ?? [];
  const kinds: Record<string, number> = {};
  for (const n of nodes) kinds[n?.kind ?? 'unknown'] = (kinds[n?.kind ?? 'unknown'] ?? 0) + 1;
  const { x, y, z } = coordsOf(node);
  return {
    name: node?.name ?? null,
    id: node?.id ?? null,
    x, y, z,
    nodeCount: nodes.length,
    kinds,
    constructs: (sys?.constructs ?? []).length,
    journeys: (sys?.journeys ?? []).length
  };
}

/**
 * The map's own extent, which is the measurement the reported case turns on: two systems 85,103 ly
 * apart. Anything that scales with extent (grids, lattices, scale bars) is a first-render suspect,
 * so the number goes in the report rather than being left for someone to work out from coordinates.
 */
function mapExtent(systems: any[], map: any): Record<string, unknown> {
  if (!systems.length) return { count: 0, diagonal: null };
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity, minZ = Infinity, maxZ = -Infinity;
  for (const s of systems) {
    const { x, y, z } = coordsOf(s);
    minX = Math.min(minX, x); maxX = Math.max(maxX, x);
    minY = Math.min(minY, y); maxY = Math.max(maxY, y);
    minZ = Math.min(minZ, z); maxZ = Math.max(maxZ, z);
  }
  const spanX = maxX - minX, spanY = maxY - minY, spanZ = maxZ - minZ;
  const diagonal = Math.hypot(spanX, spanY, spanZ);
  // Coordinates are stored in PIXELS; the reported figure ("85,103 ly apart") is in map units, so
  // both are given. Without the conversion nobody can match a report to a bundle.
  const perUnit = map?.scale?.pixelsPerUnit ?? null;
  const unit = map?.scale?.unit ?? map?.distanceUnit ?? null;
  return {
    count: systems.length,
    spanX, spanY, spanZ, diagonal,
    units: 'pixels',
    pixelsPerUnit: perUnit,
    distanceUnit: unit,
    diagonalInUnits: perUnit ? diagonal / perUnit : null
  };
}

export function buildDiagnosticReport(input: DiagnosticInput, appVersion: string): Record<string, unknown> {
  const mem = readMemory();
  const nav = typeof navigator !== 'undefined' ? navigator : ({} as Navigator);
  const systems: any[] = (input.starmap as any)?.systems ?? [];
  return {
    what: input.runtime ? 'Star System Explorer diagnostic' : 'Star System Explorer load diagnostic',
    appVersion,
    // Wall-clock only, for correlating with a Discord message. Nothing here depends on it.
    generatedAt: new Date().toISOString(),
    reason: input.reason,
    load: {
      guardStage: input.guardStage ?? null,
      stalledOn: input.stalledOn,
      processedCount: input.processed.length,
      totalSystems: systems.length,
      processed: input.processed,
      stages: input.stages
    },
    runtime: input.runtime ?? null,
    memory: mem.supported
      ? { usedMB: Math.round(mem.usedMB), limitMB: Math.round(mem.limitMB), percentOfLimit: Math.round(mem.frac * 100) }
      : { supported: false, note: 'this browser does not report memory usage' },
    device: {
      userAgent: (nav as any).userAgent ?? null,
      platform: (nav as any).platform ?? null,
      // The two numbers that separate a low-end phone from a desktop, which is the whole question
      // in the reported case. Both are widely supported and neither identifies anyone.
      deviceMemoryGB: (nav as any).deviceMemory ?? null,
      cpuCores: (nav as any).hardwareConcurrency ?? null,
      screen: typeof window !== 'undefined'
        ? { w: window.screen?.width ?? null, h: window.screen?.height ?? null, dpr: window.devicePixelRatio ?? null }
        : null,
      online: (nav as any).onLine ?? null
    },
    map: {
      source: input.mapSource ?? (input.starmap ? 'stored' : 'none'),
      hasInMemoryCopy: !!(input.liveStarmap && input.liveStarmap !== input.starmap),
      name: (input.starmap as any)?.name ?? null,
      id: (input.starmap as any)?.id ?? null,
      distanceUnit: (input.starmap as any)?.distanceUnit ?? null,
      mapMode: (input.starmap as any)?.mapMode ?? null,
      extent: mapExtent(systems, input.starmap),
      storedBytes: input.starmap ? JSON.stringify(input.starmap).length : null,
      systems: systems.map(systemShape)
    },
    perfCounters: input.counters
  };
}

function readme(report: Record<string, unknown>): string {
  const load = report.load as any;
  const map = report.map as any;
  const runtime = report.runtime as any;
  // Two audiences for one file: someone whose load failed, and someone deliberately reporting a bug
  // from a working app. The heading and the "got as far as" line are the only parts that differ —
  // everything below is identical, because the evidence wanted is the same either way.
  const onDemand = !!runtime;
  return [
    onDemand ? 'STAR SYSTEM EXPLORER - DIAGNOSTIC REPORT' : 'STAR SYSTEM EXPLORER - LOAD DIAGNOSTIC',
    '',
    `App version:   ${report.appVersion}`,
    `Created:       ${report.generatedAt}`,
    `What happened: ${report.reason}`,
    onDemand
      ? `On screen:     ${runtime.openSystem ? `the system "${runtime.openSystem}"` : (runtime.view ?? 'the starmap')}`
      : `Got as far as: ${load.stalledOn ? `starting "${load.stalledOn}"` : (load.guardStage ?? 'unknown')}`,
    onDemand ? '' : `Progress:      ${load.processedCount} of ${load.totalSystems} systems re-derived`,
    `Map:           ${map.name ?? 'unnamed'} (${map.extent?.count ?? 0} systems, `
      + `${map.extent?.diagonalInUnits != null
        ? `${Math.round(map.extent.diagonalInUnits).toLocaleString('en-GB')} ${map.extent.distanceUnit ?? 'units'} across`
        : 'extent unknown'})`,
    '',
    'WHAT IS IN THIS FILE',
    '  report.json    what the app was doing, timings, memory and device details, and a',
    '                 summary of each system on the map (sizes and counts only).',
    map.source === 'in-memory'
      ? '  starmap.json   your starmap AS CURRENTLY LOADED. The saved copy could not be read,\n'
        + '                 so this one may differ from what is in storage.'
      : '  starmap.json   your starmap, exactly as it is stored in your browser. It is what\n'
        + '                 makes the problem reproducible on someone else\'s machine, and it is\n'
        + '                 your full campaign, including any GM notes.',
    map.hasInMemoryCopy
      ? '  starmap-in-memory.json\n'
        + '                 the same map as it stood in memory at that moment. During a load it is\n'
        + '                 part-way through being updated, so it shows how far the app got; when\n'
        + '                 saved from Settings it is simply the version on screen, which may hold\n'
        + '                 changes you have not saved. Load starmap.json, not this one.'
      : '',
    '',
    'IT IS ALSO A BACKUP. starmap.json can be loaded straight back into the app',
    '(File > Load) on this or any other device, so keep a copy.',
    '',
    'NOTHING HAS BEEN SENT ANYWHERE. This file was saved to your device and only you',
    'can share it.',
    '',
    'WHERE TO SEND IT',
    '  Post it to FrunkQ on the Discord, along with what you were doing at the time.',
    '  If you would rather not share the campaign itself, delete the starmap files from',
    '  this zip first - report.json on its own is still useful, just less conclusive.'
  ]
    // Optional lines are emitted as '' rather than spliced in, so collapse any run of blanks the
    // omissions leave behind - otherwise the layout depends on which branch produced the file.
    .filter((line, i, all) => !(line === '' && all[i - 1] === ''))
    .join('\n');
}

/** Build the zip. Returns the bytes and a suggested filename. */
export function buildDiagnosticBundle(input: DiagnosticInput, appVersion: string): { bytes: Uint8Array; filename: string } {
  const report = buildDiagnosticReport(input, appVersion);
  const files: Record<string, Uint8Array> = {
    'README.txt': strToU8(readme(report)),
    'report.json': strToU8(JSON.stringify(report, null, 2))
  };
  // `starmap.json` is always the thing to LOAD, whichever copy that turns out to be, so the file to
  // reach for never depends on which failure produced the bundle. The half-derived state, when it
  // exists, rides alongside under a name that says what it is rather than displacing the input.
  if (input.starmap) files['starmap.json'] = strToU8(JSON.stringify(input.starmap, null, 2));
  if (input.liveStarmap && input.liveStarmap !== input.starmap) {
    files[input.starmap ? 'starmap-in-memory.json' : 'starmap.json'] =
      strToU8(JSON.stringify(input.liveStarmap, null, 2));
  }
  // A stamped name so several attempts do not overwrite each other in the downloads folder.
  const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  return { bytes: zipSync(files, { level: 6 }), filename: `sse-load-diagnostic-${stamp}.zip` };
}
