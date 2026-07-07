import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import { systemProcessor } from '../core/SystemProcessor';
import type { System, RulePack, CelestialBody } from '../types';

// Barycentres "arrived late" (Alex) — this guards the tags/barycentres/classification
// interaction: every multi-star example must process end-to-end without throwing, and its
// planets/moons must come out classified (parent may be a star-pair barycentre).
function loadRulePack(): RulePack {
  const base = path.resolve('static/rulepacks/starter-sf');
  let pack = JSON.parse(fs.readFileSync(path.join(base, 'main.json'), 'utf-8')) as RulePack;
  for (const f of ['classification.json', 'atmospheres.json']) {
    const p = path.join(base, f);
    if (fs.existsSync(p)) pack = { ...pack, ...JSON.parse(fs.readFileSync(p, 'utf-8')) };
  }
  return pack;
}

const MULTI_STAR = [
  'Triple-Alpha_Centauri-System.json',
  'Triple-Algol-System.json',
  'GJ_86-System.json',
  'p_Eridani_-System.json'
];

describe('barycentre systems classify without breaking', () => {
  const pack = loadRulePack();
  for (const file of MULTI_STAR) {
    it(`processes ${file}`, () => {
      const p = path.resolve('static/examples', file);
      if (!fs.existsSync(p)) return; // example optional
      const sys = JSON.parse(fs.readFileSync(p, 'utf-8')) as System;
      expect(sys.nodes.some((n) => n.kind === 'barycenter')).toBe(true);

      const processed = systemProcessor.process(sys, pack); // must not throw

      const planets = processed.nodes.filter(
        (n) => n.kind === 'body' && ['planet', 'moon'].includes((n as CelestialBody).roleHint)
      ) as CelestialBody[];
      for (const pl of planets) {
        expect(Array.isArray(pl.classes)).toBe(true);
        expect(pl.classes!.length).toBeGreaterThan(0);
        expect(pl.classes!.every((c) => typeof c === 'string' && c.startsWith('planet/'))).toBe(true);
      }
    });
  }
});
