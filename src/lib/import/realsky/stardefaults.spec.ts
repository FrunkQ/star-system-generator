// Real-sky import — star-completion tests: catalogue stars get the pack-band
// magnetic field and spin tilt the generator gives its own stars, seeded per
// star id (deterministic), and never overwrite a value that is present.
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { CelestialBody } from '$lib/types';
import { SOL_CENTRE } from './query.mjs';
import { convertArchiveRows } from './convert.mjs';
import { buildSgrAStarSystem } from './sgrastar.mjs';
import { completeImportedStars } from './stardefaults';
import { loadStarterPack } from './testPack';

const repo = resolve(__dirname, '..', '..', '..', '..');
const cache = JSON.parse(readFileSync(join(repo, 'scripts', 'starmap-build', 'data', 'cache', 'archive-pscomppars.json'), 'utf-8'));

const rulePack = loadStarterPack();
const stars = (systems: any[]) =>
  systems.flatMap((s) => s.system.nodes.filter((n: any) => n.roleHint === 'star')) as CelestialBody[];

describe('completeImportedStars', () => {
  it('every imported star gains a magnetic field and a spin tilt', () => {
    const { systems } = convertArchiveRows(cache, { region: { centre: SOL_CENTRE, radiusLy: 30 }, generated: 'test' });
    completeImportedStars(systems, rulePack);
    for (const s of stars(systems)) {
      expect(s.magneticField?.strengthGauss, `${s.id} field`).toBeGreaterThan(0);
      expect(s.axial_tilt_deg, `${s.id} tilt`).toBeGreaterThanOrEqual(0);
    }
  });

  it('is deterministic per star id across independent runs', () => {
    const a = convertArchiveRows(cache, { region: { centre: SOL_CENTRE, radiusLy: 30 }, generated: 'test' }).systems;
    const b = convertArchiveRows(cache, { region: { centre: SOL_CENTRE, radiusLy: 30 }, generated: 'test' }).systems;
    completeImportedStars(a, rulePack);
    completeImportedStars(b, rulePack);
    expect(stars(a).map((s) => [s.id, s.magneticField?.strengthGauss, s.axial_tilt_deg]))
      .toEqual(stars(b).map((s) => [s.id, s.magneticField?.strengthGauss, s.axial_tilt_deg]));
  });

  it('never overwrites a value that is already present', () => {
    const { systems } = convertArchiveRows(cache, { region: { centre: SOL_CENTRE, radiusLy: 20 }, generated: 'test' });
    const first = stars(systems)[0];
    first.magneticField = { strengthGauss: 123, manual: true };
    first.axial_tilt_deg = 7;
    completeImportedStars(systems, rulePack);
    expect(first.magneticField.strengthGauss).toBe(123);
    expect(first.axial_tilt_deg).toBe(7);
  });

  it('completes the Sgr A* cluster too (B-star fields, black hole band-zero)', () => {
    const entry = buildSgrAStarSystem();
    completeImportedStars([entry], rulePack);
    for (const s of stars([entry])) {
      if (s.id === 'sgr-a-star') {
        // The pack's star/BH band is 0 by design — a black hole has no surface
        // field to quote. Defined-and-zero, not absent.
        expect(s.magneticField?.strengthGauss, `${s.id}`).toBe(0);
      } else {
        expect(s.magneticField?.strengthGauss, `${s.id}`).toBeGreaterThan(0);
      }
    }
  });
});
