// Real-sky import — Sagittarius A* flagship tests: the published S-star
// values survive into the data, the Kepler-derived axes agree with the
// measured periods, and the whole system survives the real load path.
import { readFileSync, existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { systemProcessor } from '$lib/core/SystemProcessor';
import { fixUpImportedSystem } from '$lib/system/importFixup';
import { G, SECONDS_PER_YEAR, AU_KM } from './constants.mjs';
import { buildSgrAStarSystem, SGR_A_MASS_MSUN } from './sgrastar.mjs';

const repo = resolve(__dirname, '..', '..', '..', '..');

describe('buildSgrAStarSystem', () => {
  const entry = buildSgrAStarSystem();
  const nodes = entry.system.nodes;
  const bh = nodes.find((n) => n.id === 'sgr-a-star');
  const s2 = nodes.find((n) => n.name === 'S2');

  it('the black hole carries the measured mass and a horizon-scale radius', () => {
    expect(bh.classes).toContain('star/BH');
    expect(bh.massKg / 1.989e30 / 1e6).toBeCloseTo(SGR_A_MASS_MSUN / 1e6, 2);
    expect(bh.radiusKm).toBeGreaterThan(1e7); // ~1.27e7 km Schwarzschild
    expect(bh.radiusKm).toBeLessThan(2e7);
  });

  it("S2's derived semi-major axis reproduces its measured 16.05-year period", () => {
    const a = s2.orbit.elements.a_AU;
    expect(a).toBeGreaterThan(900);
    expect(a).toBeLessThan(1100);
    const T = 2 * Math.PI * Math.sqrt((a * AU_KM * 1000) ** 3 / (G * bh.massKg)) / SECONDS_PER_YEAR;
    expect(T).toBeCloseTo(16.05, 1);
    expect(s2.orbit.elements.e).toBe(0.884);
  });

  it('every S-star orbits the black hole with unique ids and the gate quotes a playable timescale', () => {
    const stars = nodes.filter((n) => n.roleHint === 'star' && n.id !== 'sgr-a-star');
    expect(stars.length).toBe(10);
    for (const s of stars) expect(s.orbit.hostId).toBe('sgr-a-star');
    const ids = nodes.map((n) => n.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(entry.gate.tDynYr).toBeLessThan(10_000);
  });

  it('is deterministic: two builds are identical', () => {
    expect(buildSgrAStarSystem()).toEqual(buildSgrAStarSystem());
  });

  it('survives the real load path with finite physics', () => {
    function deepMerge(target, source) {
      const output = { ...target };
      for (const key of Object.keys(source ?? {})) {
        if (source[key] && typeof source[key] === 'object' && !Array.isArray(source[key]) && key in target) {
          output[key] = deepMerge(target[key], source[key]);
        } else output[key] = source[key];
      }
      return output;
    }
    const base = join(repo, 'static', 'rulepacks', 'starter-sf');
    let pack = JSON.parse(readFileSync(join(base, 'main.json'), 'utf-8'));
    for (const f of ['construct_templates.json', 'engine-definitions.json', 'fuel-definitions.json', 'liquids.json', 'classification.json', 'atmospheres.json']) {
      const p = join(base, f);
      if (existsSync(p)) pack = deepMerge(pack, JSON.parse(readFileSync(p, 'utf-8')));
    }
    const processed = systemProcessor.process(fixUpImportedSystem(structuredClone(entry.system), pack), pack);
    for (const n of processed.nodes) {
      if (n.kind !== 'body') continue;
      expect(Number.isFinite(n.massKg), `${n.id} massKg`).toBe(true);
      if (n.roleHint === 'star' && n.id !== 'sgr-a-star') {
        expect(Number.isFinite(n.orbital_period_days), `${n.id} period`).toBe(true);
        // The whole point: playable timescales. S55 ~12.8 yr, S1 ~166 yr.
        expect(n.orbital_period_days).toBeGreaterThan(4000);
        expect(n.orbital_period_days).toBeLessThan(70000);
      }
    }
  });
});
