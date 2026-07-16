import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import { classifyByFingerprint } from './classification';
import type { Fingerprint } from '$lib/types';

// Phase 04 — fingerprint classifier. Each type is parameter bands; best base wins, modifiers
// stack. Soft edges are RELATIVE to the boundary (so a tiny moon can't half-match a giant).
const FPS: Fingerprint[] = [
  { class: 'planet/terrestrial', kind: 'base', match: { radius_Re: [0.3, 1.8], density: [3, 8.5] } },
  { class: 'planet/earth-analogue', kind: 'base', match: { mass_Me: [0.8, 1.3], 'hydrosphere.coverage': [0.5, 0.85], 'atm.composition.O2': [0.1, 0.35], Teq_K: [255, 300] } },
  { class: 'planet/gas-giant', kind: 'base', match: { mass_Me: [50, 4000], radius_Re: [3.5, 25] } },
  { class: 'planet/ice-giant', kind: 'base', match: { mass_Me: [8, 50], radius_Re: [2.5, 6], Teq_K: [0, 200] } },
  { class: 'planet/ringed', kind: 'modifier', match: { has_ring_child: [1, 1] } }
];

describe('classifyByFingerprint', () => {
  it('classifies an Earth twin as the specific type, not the generic one', () => {
    const earth = { mass_Me: 1, radius_Re: 1, density: 5.5, 'hydrosphere.coverage': 0.7, 'atm.composition.O2': 0.21, Teq_K: 255 };
    expect(classifyByFingerprint(earth, FPS, 4)[0]).toBe('planet/earth-analogue');
  });

  it('more specific (more matched bands) outranks the generic base', () => {
    // A gas giant matches both gas-giant (2 bands) and nothing else here.
    const jup = { mass_Me: 318, radius_Re: 11, density: 1.3, has_ring_child: 1 };
    const cls = classifyByFingerprint(jup, FPS, 4);
    expect(cls[0]).toBe('planet/gas-giant');
    expect(cls).toContain('planet/ringed'); // modifier stacks
  });

  it('a tiny moon does NOT half-match a giant (relative soft edge)', () => {
    const moon = { mass_Me: 0.02, radius_Re: 0.27, density: 3.3, Teq_K: 90 };
    const cls = classifyByFingerprint(moon, FPS, 4);
    expect(cls).not.toContain('planet/gas-giant');
    expect(cls).not.toContain('planet/ice-giant');
  });

  it('falls back to terrestrial/gas-giant when nothing matches', () => {
    const odd = { mass_Me: 0.4, radius_Re: 2.5, density: 0.2 }; // matches no band well
    expect(classifyByFingerprint(odd, FPS, 4).length).toBeGreaterThan(0);
  });

  it('weak modifier slivers are not added', () => {
    const noRing = { mass_Me: 318, radius_Re: 11, has_ring_child: 0 };
    expect(classifyByFingerprint(noRing, FPS, 4)).not.toContain('planet/ringed');
  });
});

// E2 — an eyeball world needs STAR-lock (a permanent substellar point). A moon is tidally locked
// to its PLANET, not the star, so its far side still cycles through stellar day/night — it can
// never be an eyeball. The real rulepack's eyeball fingerprints key on `starTidallyLocked`, which
// the processor sets to 1 only when the body is tidally locked AND orbits a star (orbitsStar=1).
// Asteroid taxonomy (composition-editor redesign, stage 3): spectral classes fall out of the
// makeup fractions + a small-body mass gate; rubble-pile is a modifier keyed on the DERIVED
// macroporosity feature. Fixtures are real bodies.
describe('asteroid classes derive from composition at small-body mass', () => {
  const realFps = JSON.parse(
    fs.readFileSync(path.resolve('static/rulepacks/starter-sf/classification.json'), 'utf-8')
  ).classifier.fingerprints as Fingerprint[];

  it('Bennu: carbonaceous rubble pile → c-type + rubble-pile modifier', () => {
    const bennu = {
      mass_Me: 1.2e-14, radius_Re: 3.9e-5, density: 1.19, porosity: 0.55,
      'makeup.carbon': 0.5, 'makeup.rock': 0.5, 'makeup.metal': 0, 'makeup.ice': 0, 'makeup.gas': 0
    };
    const cls = classifyByFingerprint(bennu, realFps, 4);
    expect(cls[0]).toBe('asteroid/c-type');
    expect(cls).toContain('asteroid/rubble-pile');
  });

  it('Eros: stony, low porosity → s-type, no rubble-pile', () => {
    const eros = {
      mass_Me: 1.12e-9, radius_Re: 1.3e-3, density: 2.67, porosity: 0.1,
      'makeup.rock': 0.85, 'makeup.metal': 0.15, 'makeup.carbon': 0, 'makeup.ice': 0, 'makeup.gas': 0
    };
    const cls = classifyByFingerprint(eros, realFps, 4);
    expect(cls[0]).toBe('asteroid/s-type');
    expect(cls).not.toContain('asteroid/rubble-pile');
  });

  it('16 Psyche: metal-dominant → m-type', () => {
    const psyche = {
      mass_Me: 3.8e-6, radius_Re: 0.017, density: 3.9, porosity: 0.05,
      'makeup.metal': 0.6, 'makeup.rock': 0.4, 'makeup.carbon': 0, 'makeup.ice': 0, 'makeup.gas': 0
    };
    expect(classifyByFingerprint(psyche, realFps, 4)[0]).toBe('asteroid/m-type');
  });

  it('67P: porous dirty snowball → comet', () => {
    const cg67p = {
      mass_Me: 1.7e-12, radius_Re: 3.1e-4, density: 0.53, porosity: 0.7,
      'makeup.ice': 0.55, 'makeup.carbon': 0.25, 'makeup.rock': 0.2, 'makeup.metal': 0, 'makeup.gas': 0
    };
    expect(classifyByFingerprint(cg67p, realFps, 4)[0]).toBe('asteroid/comet');
  });

  it('Ceres sits above the asteroid mass gate — stays a planet-class body', () => {
    const ceres = {
      mass_Me: 1.57e-4, radius_Re: 0.0737, density: 2.16, porosity: 0,
      'makeup.rock': 0.7, 'makeup.ice': 0.3, 'makeup.metal': 0, 'makeup.carbon': 0, 'makeup.gas': 0
    };
    const cls = classifyByFingerprint(ceres, realFps, 4);
    expect(cls[0]).not.toMatch(/^asteroid\//);
    expect(cls[0]).toMatch(/^planet\//);
  });

  it('an Earth-mass world never reads as an asteroid, whatever its mix', () => {
    const ironEarth = {
      mass_Me: 1, radius_Re: 0.85, density: 8.9, porosity: 0,
      'makeup.metal': 0.8, 'makeup.rock': 0.2, 'makeup.carbon': 0, 'makeup.ice': 0, 'makeup.gas': 0
    };
    const cls = classifyByFingerprint(ironEarth, realFps, 4);
    expect(cls.some((c) => c.startsWith('asteroid/'))).toBe(false);
  });
});

describe('eyeball classes require star-lock, not planet-lock (E2)', () => {
  const realFps = JSON.parse(
    fs.readFileSync(path.resolve('static/rulepacks/starter-sf/classification.json'), 'utf-8')
  ).classifier.fingerprints as Fingerprint[];

  // A cold, tidally-locked terrestrial: icy except the substellar point.
  const coldEyeball = {
    tidallyLocked: 1, starTidallyLocked: 1, orbitsStar: 1,
    Teq_K: 200, radius_Re: 0.9, density: 4, mass_Me: 0.8
  };

  it('a STAR-locked world in the cold band classifies as a cold-eyeball', () => {
    expect(classifyByFingerprint(coldEyeball, realFps, 4)[0]).toBe('planet/cold-eyeball');
  });

  it('a moon locked to its PLANET (starTidallyLocked=0) is never an eyeball', () => {
    // Same body, but it orbits a planet: still tidallyLocked, but not star-locked.
    const moon = { ...coldEyeball, starTidallyLocked: 0, orbitsStar: 0 };
    const cls = classifyByFingerprint(moon, realFps, 4);
    expect(cls).not.toContain('planet/cold-eyeball');
    expect(cls).not.toContain('planet/eyeball');
    expect(cls).not.toContain('planet/hot-eyeball');
  });
});
