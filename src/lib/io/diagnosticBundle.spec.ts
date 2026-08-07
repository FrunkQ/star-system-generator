import { describe, it, expect } from 'vitest';
import { unzipSync, strFromU8 } from 'fflate';
import { buildDiagnosticBundle, buildDiagnosticReport, type DiagnosticInput } from './diagnosticBundle';

// The bundle exists so a user whose app froze can hand over evidence. Every assertion here is about
// a claim the README makes to that user, or a fact the debugger needs to reproduce the fault.

// SHAPED LIKE A REAL SAVED MAP, deliberately: coordinates live under `position` and are stored in
// PIXELS, with `scale.pixelsPerUnit` converting to the unit a user talks in. The first version of
// this module read `system.x` and therefore reported an extent of ZERO across a real 42-system map
// — caught only by opening a bundle produced by the running app, which is why the fixture now
// matches the producer rather than the type (engine map RENDER-S17's rule, in another family).
const PX_PER_LY = 43.30127018922193;
const farApart = {
  id: 'map-1',
  name: 'Wide Map',
  distanceUnit: 'ly',
  scale: { unit: 'ly', pixelsPerUnit: PX_PER_LY, showScaleBar: true },
  systems: [
    { id: 'a', name: 'Origin', position: { x: 0, y: 0, z: 0 }, system: { nodes: [{ id: 'n1', kind: 'star' }], constructs: [] } },
    { id: 'b', name: 'Far Away', position: { x: 85103 * PX_PER_LY, y: 0, z: 0 }, system: { nodes: [{ id: 'n2', kind: 'star' }, { id: 'n3', kind: 'planet' }], constructs: [] } }
  ]
};

const input: DiagnosticInput = {
  reason: 'the user stopped the load',
  starmap: farApart,
  stages: [{ stage: 'physics:Origin', atMs: 100, sinceLastMs: 40 }],
  counters: { 'holo.setSystem.same': 4 },
  processed: ['Origin'],
  stalledOn: 'Far Away',
  guardStage: 'physics: Far Away'
};

function members(bytes: Uint8Array): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [name, data] of Object.entries(unzipSync(bytes))) out[name] = strFromU8(data);
  return out;
}

describe('diagnostic bundle', () => {
  it('carries the map, the report and a readme that explains both', () => {
    const { bytes, filename } = buildDiagnosticBundle(input, '2.1.488-beta');
    const files = members(bytes);
    expect(Object.keys(files).sort()).toEqual(['README.txt', 'report.json', 'starmap.json']);
    expect(filename).toMatch(/^sse-load-diagnostic-.*\.zip$/);
    // The map must round-trip EXACTLY: it is the input that reproduces the fault, and the readme
    // tells the user they can load it back as a backup.
    expect(JSON.parse(files['starmap.json'])).toEqual(farApart);
    expect(files['README.txt']).toContain('FrunkQ');
    expect(files['README.txt']).toContain('starmap.json');
  });

  it('names where loading stopped, which is the whole point of it', () => {
    const report = buildDiagnosticReport(input, '2.1.488-beta') as any;
    expect(report.load.stalledOn).toBe('Far Away');
    expect(report.load.processed).toEqual(['Origin']);
    expect(report.load.processedCount).toBe(1);
    expect(report.load.totalSystems).toBe(2);
    expect(report.load.stages).toHaveLength(1);
    expect(report.perfCounters['holo.setSystem.same']).toBe(4);
  });

  it('measures the map extent, the suspect in the reported case', () => {
    const report = buildDiagnosticReport(input, '2.1.488-beta') as any;
    // 85,103 ly apart is the report that started this: anything scaling with extent is a suspect,
    // so the number is computed here rather than left for someone to derive from coordinates.
    // It must come out in the unit the REPORT was phrased in, or nobody can match the two up.
    expect(report.map.extent.count).toBe(2);
    expect(report.map.extent.diagonalInUnits).toBeCloseTo(85103, 6);
    expect(report.map.extent.distanceUnit).toBe('ly');
    expect(report.map.extent.units).toBe('pixels');
    // The regression: coordinates are under `position`, so reading `system.x` gives a flat zero on
    // every real map — which is exactly what shipped and was caught by opening a real bundle.
    expect(report.map.extent.spanX).toBeGreaterThan(0);
    expect(report.map.systems[1].x).toBeGreaterThan(0);
  });

  it('states the extent in the README, where a human will actually see it', () => {
    const { bytes } = buildDiagnosticBundle(input, 'v');
    expect(members(bytes)['README.txt']).toContain('85,103 ly across');
  });

  it('summarises each system by shape, never by contents', () => {
    const report = buildDiagnosticReport(input, '2.1.488-beta') as any;
    const far = report.map.systems.find((s: any) => s.name === 'Far Away');
    expect(far.nodeCount).toBe(2);
    expect(far.kinds).toEqual({ star: 1, planet: 1 });
    // The per-system summary must not smuggle the bodies themselves in: the campaign travels once,
    // in starmap.json, where the readme says it is and where a user can delete it.
    expect(JSON.stringify(report.map.systems)).not.toContain('n1');
  });

  it('still produces a usable report when the map could not be read at all', () => {
    // Storage failing is exactly when a diagnostic matters most, so a missing map must degrade to a
    // smaller bundle rather than to no bundle.
    const { bytes } = buildDiagnosticBundle({ ...input, starmap: null }, '2.1.488-beta');
    const files = members(bytes);
    expect(Object.keys(files).sort()).toEqual(['README.txt', 'report.json']);
    const report = JSON.parse(files['report.json']);
    expect(report.load.stalledOn).toBe('Far Away');
    expect(report.map.storedBytes).toBeNull();
  });

  it('ships BOTH copies when they differ, with the loadable one under the plain name', () => {
    // A mid-load failure needs both: the stored map is the input to test-load, and the in-memory
    // map is the half re-derived state that shows how far the engine got. The file to LOAD must
    // always be starmap.json whichever failure produced the bundle.
    const halfDerived = { ...farApart, name: 'Wide Map (half derived)' };
    const { bytes } = buildDiagnosticBundle({ ...input, liveStarmap: halfDerived }, 'v');
    const files = members(bytes);
    expect(Object.keys(files).sort()).toEqual(['README.txt', 'report.json', 'starmap-in-memory.json', 'starmap.json']);
    expect(JSON.parse(files['starmap.json'])).toEqual(farApart);
    expect(JSON.parse(files['starmap-in-memory.json'])).toEqual(halfDerived);
    expect(files['README.txt']).toContain('Load starmap.json, not this one');
  });

  it('does not duplicate the map when the two copies are the same object', () => {
    const { bytes } = buildDiagnosticBundle({ ...input, liveStarmap: farApart }, 'v');
    expect(Object.keys(members(bytes)).sort()).toEqual(['README.txt', 'report.json', 'starmap.json']);
  });

  it('falls back to the in-memory copy under the loadable name when storage is unreadable', () => {
    const live = { ...farApart, name: 'only copy' };
    const { bytes } = buildDiagnosticBundle({ ...input, starmap: null, liveStarmap: live, mapSource: 'in-memory' }, 'v');
    const files = members(bytes);
    expect(Object.keys(files).sort()).toEqual(['README.txt', 'report.json', 'starmap.json']);
    expect(JSON.parse(files['starmap.json'])).toEqual(live);
  });

  it('says where the map came from, because only the stored copy is test-loadable', () => {
    // The whole point of shipping the map is that it can be loaded elsewhere to settle "is this a
    // data fault or a slow device". The in-memory map during a load is half re-derived (the recalc
    // rewrites in place), so it is NOT that input and must never be presented as if it were.
    const stored = buildDiagnosticReport({ ...input, mapSource: 'stored' }, 'v') as any;
    expect(stored.map.source).toBe('stored');
    const live = buildDiagnosticBundle({ ...input, mapSource: 'in-memory' }, 'v');
    const files = members(live.bytes);
    expect(JSON.parse(files['report.json']).map.source).toBe('in-memory');
    expect(files['README.txt']).toContain('AS CURRENTLY LOADED');
    expect(files['README.txt']).not.toContain('exactly as it is stored');
  });

  it('carries what the app was doing when built on demand', () => {
    const report = buildDiagnosticReport({
      ...input,
      reason: 'requested by the user from Settings',
      stalledOn: null,
      runtime: { openSystem: 'Sol', view: 'system view', storage: { usageBytes: 100, quotaBytes: 200 }, perfTracingOn: true }
    }, 'v') as any;
    expect(report.runtime.openSystem).toBe('Sol');
    expect(report.runtime.storage.usageBytes).toBe(100);
  });

  it('reports memory honestly when the browser will not say', () => {
    const report = buildDiagnosticReport(input, '2.1.488-beta') as any;
    // Under vitest's jsdom there is no performance.memory, which is the same situation as Firefox
    // or Safari: it must say so rather than reporting a fabricated zero.
    if (!report.memory.supported) {
      expect(report.memory.note).toMatch(/does not report/);
      expect(report.memory.usedMB).toBeUndefined();
    }
  });
});
