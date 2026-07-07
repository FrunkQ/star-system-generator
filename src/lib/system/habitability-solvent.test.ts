import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import { systemProcessor } from '../core/SystemProcessor';
import { solventCoverageWeight } from '../physics/liquids';
import type { System, RulePack, CelestialBody } from '../types';

// The liquid-solvent habitability factor is presence-FIRST but no longer a step function: a trace sea
// scores most of the marks, a modest sea scores full, and the two are no longer identical (the "2% water
// = ocean world" complaint). See /physics#habitability.

function isObject(x: any) { return x && typeof x === 'object' && !Array.isArray(x); }
function deepMerge(t: any, s: any): any {
  const o = { ...t };
  if (isObject(t) && isObject(s)) Object.keys(s).forEach((k) => { o[k] = isObject(s[k]) && k in t ? deepMerge(t[k], s[k]) : s[k]; });
  return o;
}
function loadRulePack(): RulePack {
  const base = path.resolve('static/rulepacks/starter-sf');
  let pack = JSON.parse(fs.readFileSync(path.join(base, 'main.json'), 'utf-8')) as RulePack;
  for (const f of ['liquids.json', 'classification.json', 'atmospheres.json']) {
    const p = path.join(base, f);
    if (fs.existsSync(p)) pack = deepMerge(pack, JSON.parse(fs.readFileSync(p, 'utf-8')));
  }
  return pack;
}
const EARTH = 5.972e24, R_E = 6371;

function makeWaterWorld(coverage: number): System {
  return {
    id: 'sys', name: 'Sys', seed: 'seed', epochT0: 0, age_Gyr: 5,
    nodes: [
      { id: 'star', name: 'Star', kind: 'body', parentId: null, roleHint: 'star', massKg: 1.989e30, radiusKm: 696340,
        temperatureK: 5778, radiationOutput: 1, classes: ['star/G'], axial_tilt_deg: 0, rotation_period_hours: 600 },
      { id: 'p', name: 'P', kind: 'body', parentId: 'star', roleHint: 'planet', massKg: 1.0 * EARTH, radiusKm: 1.0 * R_E,
        axial_tilt_deg: 23, rotation_period_hours: 24, makeup: { metal: 0.3, rock: 0.7 }, classes: [], tags: [],
        hydrosphere: { composition: 'water', coverage },
        atmosphere: { main: 'N2', pressure_bar: 1, composition: { N2: 0.77, O2: 0.21, CO2: 0.02 } }, // enough greenhouse to keep water liquid
        orbit: { hostId: 'star', elements: { a_AU: 0.95, e: 0.02, i_deg: 0, omega_deg: 0, Omega_deg: 0, M0_rad: 0 } } }
    ]
  } as any;
}

const solventPoints = (s: System) => {
  const p = s.nodes.find((n) => n.id === 'p') as CelestialBody;
  return (p.habitabilityBreakdown as any).factors.find((f: any) => f.label === 'Liquid solvent').points as number;
};

describe('liquid-solvent habitability factor — presence-first coverage ramp', () => {
  const pack = loadRulePack();

  it('the ramp: floor at low coverage, full by ~18%, clamped, monotonic', () => {
    expect(solventCoverageWeight(0)).toBeCloseTo(0.6, 5);      // presence floor
    expect(solventCoverageWeight(0.02)).toBeGreaterThan(0.6);  // a little more than the floor
    expect(solventCoverageWeight(0.02)).toBeLessThan(0.72);    // ...but nowhere near full (the "lol" case)
    expect(solventCoverageWeight(0.18)).toBeCloseTo(1, 5);     // full marks by ~18%
    expect(solventCoverageWeight(0.7)).toBe(1);                // clamped, not >1
    expect(solventCoverageWeight(0.05)).toBeLessThan(solventCoverageWeight(0.12)); // monotonic
  });

  it('a 2% sea scores high but NOT the same as a global ocean (was a step function)', () => {
    const puddle = solventPoints(systemProcessor.process(makeWaterWorld(0.02), pack));
    const ocean = solventPoints(systemProcessor.process(makeWaterWorld(0.7), pack));
    expect(ocean).toBe(25);            // water at good coverage → full solvent marks
    expect(puddle).toBeGreaterThan(14); // still high — presence is most of the value
    expect(puddle).toBeLessThan(ocean); // but no longer tied to the ocean world
  });
});
