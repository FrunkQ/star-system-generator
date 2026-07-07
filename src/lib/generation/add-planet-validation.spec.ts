import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import { systemProcessor } from '../core/SystemProcessor';
import { generateBodyOfType } from './generateBodyOfType';
import type { System, RulePack, CelestialBody, Fingerprint } from '$lib/types';

// Validates the WHOLE "add planet → pick a type" pipeline for EVERY offered planet type: generate the
// body, run it through the real processor, and check ALL its derived stats are physically sane (mass,
// radius, density, gravity, escape velocity, temperature) AND that it classifies back as (near) the
// type that was picked. Guards against the class of bug that made brown dwarfs / heavy giants come out
// with impossible densities or the wrong class.

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

const R_E_KM = 6371;
// Distance (AU) around a Sun that yields ~the target bare equilibrium temperature (T ≈ 278/√a).
function auForTeq(teqK: number): number { return Math.max(0.02, Math.pow(278 / Math.max(50, teqK), 2)); }

function targetTeq(fp: Fingerprint): number {
  const band = (fp.match as any)['Teq_K'];
  if (Array.isArray(band) && typeof band[0] === 'number') return (band[0] + band[1]) / 2;
  return 255; // no temperature constraint → drop it at a temperate orbit
}

function makeSystem(fp: Fingerprint, teq: number): { sys: System; a: number } {
  const a = auForTeq(teq);
  const body = generateBodyOfType(fp, { distAU: a, hostMassKg: 1.989e30, role: 'planet', rng: () => 0.5, teqK: teq });
  const sys = {
    id: 'val', name: 'val', seed: 'val-seed', epochT0: 0, age_Gyr: 4.6,
    nodes: [
      { id: 'star', name: 'Star', kind: 'body', parentId: null, roleHint: 'star', massKg: 1.989e30,
        radiusKm: 696340, temperatureK: 5778, radiationOutput: 1, classes: ['star/G'], axial_tilt_deg: 0, rotation_period_hours: 600 },
      { id: 'p', name: 'P', kind: 'body', parentId: 'star', roleHint: 'planet', axial_tilt_deg: 0, rotation_period_hours: 12,
        ...body,
        orbit: { hostId: 'star', elements: { a_AU: a, e: 0.01, i_deg: 0, omega_deg: 0, Omega_deg: 0, M0_rad: 0 } } }
    ]
  } as any;
  return { sys, a };
}

const G = 6.674e-11;
const EARTH_MASS_KG = 5.972e24;

describe('add-planet — every type produces physically sane stats + round-trips its class', () => {
  const pack = loadRulePack();
  const fps = ((pack.classifier?.fingerprints ?? []) as Fingerprint[]).filter((f) => f.kind === 'base' && !/rogue/.test(f.class));

  it('generates + processes every base type without impossible stats', () => {
    const rows: string[] = [];
    const problems: string[] = [];
    let mismatch = 0;

    for (const fp of fps) {
      const teq = targetTeq(fp);
      const { sys, a } = makeSystem(fp, teq);
      const out = systemProcessor.process(sys, pack);
      const b = out.nodes.find((n) => n.id === 'p') as CelestialBody;

      const massMe = (b.massKg ?? 0) / EARTH_MASS_KG;
      const radiusRe = (b.radiusKm ?? 0) / R_E_KM;
      const rM = (b.radiusKm ?? 1) * 1000;
      const density = (b.massKg ?? 0) / ((4 / 3) * Math.PI * rM * rM * rM) / 1000; // g/cc
      const gravG = (G * (b.massKg ?? 0)) / (rM * rM) / 9.81;
      const vEsc = Math.sqrt((2 * G * (b.massKg ?? 0)) / rM) / 1000; // km/s
      const gotClass = b.classes?.[0] ?? '(none)';
      const want = fp.class;
      const ok = gotClass === want;
      if (!ok) mismatch++;

      rows.push(`${ok ? '  ' : '≠ '}${want.padEnd(34)} → ${gotClass.padEnd(30)} | ${massMe.toExponential(2)} M⊕  ${radiusRe.toFixed(2)} R⊕  ${density.toFixed(2)} g/cc  ${gravG.toFixed(2)} g  T=${(b.temperatureK ?? 0).toFixed(0)}K  a=${a.toFixed(2)}AU`);

      // --- Physical sanity gates (these SHOULD hold for every generated body) ---
      if (!(massMe > 0)) problems.push(`${want}: non-positive mass`);
      if (!(radiusRe > 0)) problems.push(`${want}: non-positive radius`);
      // Brown-dwarf-mass bodies (≥ ~8 M_jup / 2500 M⊕) are electron-degenerate and legitimately reach
      // tens–hundreds of g/cc; everything below that must stay under a compressed-metal ceiling.
      const densityCeil = massMe >= 2500 ? 250 : 25;
      if (!(density > 0.05 && density < densityCeil)) problems.push(`${want}: density ${density.toFixed(2)} g/cc out of 0.05–${densityCeil} (mass ${massMe.toExponential(1)} M⊕)`);
      if (!(gravG >= 0 && gravG < 1000)) problems.push(`${want}: gravity ${gravG.toFixed(1)} g absurd`);
      if (!(vEsc >= 0 && vEsc < 1000)) problems.push(`${want}: escape velocity ${vEsc.toFixed(1)} km/s absurd`);
      if (!Number.isFinite(b.temperatureK ?? NaN)) problems.push(`${want}: non-finite temperature`);
    }

    console.log(`\n=== add-planet round-trip (${fps.length} types, ${mismatch} class mismatches) ===\n` + rows.join('\n') + '\n');
    if (problems.length) console.log('PHYSICAL PROBLEMS:\n' + problems.join('\n'));

    // Hard gate: no impossible physical stats anywhere.
    expect(problems).toEqual([]);
    // Soft gate: the vast majority should round-trip to their own class (some legitimate borderline overlap).
    expect(mismatch).toBeLessThanOrEqual(Math.ceil(fps.length * 0.25));
  });
});
