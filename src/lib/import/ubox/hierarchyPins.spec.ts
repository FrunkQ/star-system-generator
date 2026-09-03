// THE SINGLE-STAR PIN (B114). The multi-root hierarchy in `hierarchy.ts` must import a one-star file
// EXACTLY as the single-root code did — same parents, same roles, same elements to the last bit,
// same skips — and "exactly" is only checkable against a record made BEFORE the change. This file
// is that record: `tests/fixtures/ubox/hierarchy-pins.json` was generated from the importer at
// v3.0.287 (the last single-root version) over every committed single-star fixture, and this spec
// compares today's output against it field for field.
//
// Regenerate ONLY when an importer change is meant to move the numbers, in its own commit, with the
// diff read: `UBOX_PIN_WRITE=1 npx vitest run src/lib/import/ubox/hierarchyPins.spec.ts`.
import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import type { System, CelestialBody, Barycenter } from '$lib/types';
import { convertUbox } from './convert';
import { importUbox } from './index';
import type { ParsedUbox, UsSimulation, UboxImportResult } from './types';

const FIX = path.resolve('tests/fixtures/ubox');
const PINS = path.join(FIX, 'hierarchy-pins.json');

function parsedFixture(file: string): ParsedUbox {
  const simText = fs.readFileSync(path.join(FIX, file), 'utf-8');
  return { manifest: null, sim: JSON.parse(simText) as UsSimulation, simText, buildRevision: 48569, buildName: 'fixture' };
}

/** Everything the hierarchy pass decides, keyed by body NAME so the pin reads like a map. */
function pin(result: UboxImportResult) {
  const sys = result.system as System;
  const byId = new Map(sys.nodes.map((n) => [n.id, n]));
  const nameOf = (id: string | null | undefined) => (id ? (byId.get(id)?.name ?? `<missing ${id}>`) : null);
  const nodes: Record<string, unknown> = {};
  for (const n of sys.nodes) {
    const o = (n as CelestialBody).orbit;
    nodes[n.name] = {
      kind: n.kind,
      roleHint: (n as CelestialBody).roleHint ?? null,
      parent: nameOf(n.parentId),
      memberIds: n.kind === 'barycenter' ? (n as Barycenter).memberIds.map(nameOf) : undefined,
      orbit: o ? { host: nameOf(o.hostId), hostMu: o.hostMu, t0: o.t0, n_rad_per_s: o.n_rad_per_s ?? null,
        retrograde: o.isRetrogradeOrbit ?? false, elements: o.elements } : null
    };
  }
  return {
    counts: result.counts,
    skipped: result.skipped.map((s) => `${s.reason}: ${s.name}`).sort(),
    age_Gyr: sys.age_Gyr,
    nodes
  };
}

function pinAll() {
  const out: Record<string, unknown> = {};
  for (const f of ['sol-realistic.json', 'moons.json', 'hystrine-blank-category-star.json']) {
    out[f] = pin(convertUbox(parsedFixture(f)));
    out[`${f} @1e20`] = pin(convertUbox(parsedFixture(f), { minBodyMassKg: 1e20 }));
  }
  out['minimal.ubox'] = pin(importUbox(new Uint8Array(fs.readFileSync(path.join(FIX, 'minimal.ubox')))));
  return out;
}

describe('ubox hierarchy — a one-star file imports exactly as it did before multi-root (B114 pin)', () => {
  if (process.env.UBOX_PIN_WRITE === '1') {
    it('WRITES the pin (UBOX_PIN_WRITE=1)', () => {
      fs.writeFileSync(PINS, JSON.stringify(pinAll(), null, 1) + '\n');
      expect(fs.existsSync(PINS)).toBe(true);
    });
    return;
  }
  const expected = JSON.parse(fs.readFileSync(PINS, 'utf-8'));
  const actual = pinAll();
  for (const key of Object.keys(expected)) {
    it(`${key}: parents, roles, elements, skips and counts are bit-identical to the v3.0.287 record`, () => {
      expect(actual[key]).toEqual(expected[key]);
    });
  }
  it('the pin covers every fixture the suite converts (nothing added silently)', () => {
    expect(Object.keys(actual).sort()).toEqual(Object.keys(expected).sort());
  });
});
