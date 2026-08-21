import { describe, it, expect } from 'vitest';
import { rarityGate, metallicityFactor } from './typeDraw';
import { requiresTidalLock, viableTypesAt } from './generateBodyOfType';
import type { Fingerprint } from '$lib/types';

/**
 * THE FAULT THIS GUARDS (inbox G24): the rarity dial was a STEP FUNCTION. Every type at or below the
 * dial got weight 1 and anything above fell off a cliff, so at the default an airless terrestrial, a
 * superhabitable and an eyeball were all EQUALLY likely — "allowed" and "likely" were the same
 * thing. Measured at v2.1.763 that put one exotic class, `hot-eyeball`, on 28% of every world
 * generated around a Sun-like star.
 *
 * The replacement is a LADDER: w(r) = ratio^r, with ln(ratio) moving linearly with the dial. The
 * realistic mix is anchored at `realistic_dial` (0.25), NOT at the midpoint, because the dial's
 * useful travel is asymmetric — below the realistic point a system only gets duller.
 */

const W = { realistic_dial: 0.25, exotic_ratio_at_min: 0.0005, exotic_ratio_at_realistic: 0.02, exotic_ratio_at_max: 5 };

describe('the rarity ladder', () => {
  it('is monotonic in rarity at every dial setting below the inversion point', () => {
    for (const dial of [0, 0.1, 0.25, 0.5]) {
      let prev = Infinity;
      for (const r of [0, 0.2, 0.4, 0.6, 0.8, 1]) {
        const w = rarityGate(r, dial, W);
        expect(w, `dial ${dial}, rarity ${r}`).toBeLessThan(prev);
        prev = w;
      }
    }
  });

  it('INVERTS at the top of the dial — exotica lead, which is the point of the top end', () => {
    expect(rarityGate(1, 1, W)).toBeGreaterThan(rarityGate(0, 1, W));
    expect(rarityGate(1, 1, W) / rarityGate(0, 1, W)).toBeCloseTo(5, 1);
  });

  it('NEVER excludes anything — a legendary world stays possible even at rarity 0', () => {
    // "Possible, just unlikely" is the vocabulary the banded slider needs; a hard zero would make the
    // bottom of the dial a filter rather than a preference.
    for (const dial of [0, 0.25, 0.5, 1]) expect(rarityGate(1, dial, W)).toBeGreaterThan(0);
  });

  it('moves smoothly and monotonically with the dial for a given type', () => {
    let prev = -Infinity;
    for (const dial of [0, 0.25, 0.5, 0.75, 1]) {
      const w = rarityGate(0.9, dial, W);
      expect(w).toBeGreaterThan(prev);
      prev = w;
    }
  });

  it('anchors the realistic mix at realistic_dial, not at the midpoint', () => {
    // The whole point of the asymmetry: the ratio at 0.25 is the pack's realistic value, and the
    // midpoint is already well above it.
    expect(rarityGate(1, 0.25, W) / rarityGate(0, 0.25, W)).toBeCloseTo(W.exotic_ratio_at_realistic, 3);
    expect(rarityGate(1, 0.5, W)).toBeGreaterThan(rarityGate(1, 0.25, W));
  });
});

describe('a type may not require a circumstance the orbit cannot produce', () => {
  const fp = (cls: string, match: any): Fingerprint => ({ class: cls, kind: 'base', match } as unknown as Fingerprint);
  const FPS = [
    fp('planet/hot-eyeball', { starTidallyLocked: [1, 1], SurfaceTemp_K: [320, 1200] }),
    fp('planet/terrestrial', {}),
  ];

  it('spots a fingerprint that requires tidal locking', () => {
    expect(requiresTidalLock(FPS[0])).toBe(true);
    expect(requiresTidalLock(FPS[1])).toBe(false);
  });

  it('drops lock-requiring types where the orbit cannot despin a planet', () => {
    const out = viableTypesAt(500, 'planet', FPS, 0, { canTidallyLock: false }).map(f => f.class);
    expect(out).not.toContain('planet/hot-eyeball');
    expect(out).toContain('planet/terrestrial');
  });

  it('keeps them where it CAN — a close-in world round a red dwarf really is locked', () => {
    const out = viableTypesAt(500, 'planet', FPS, 0, { canTidallyLock: true }).map(f => f.class);
    expect(out).toContain('planet/hot-eyeball');
  });

  it('OMITTED means allowed, so the manual picker is unaffected', () => {
    // Hand authoring is hand authoring — the standing rule is to show the problem in tags rather
    // than forbid the choice. Only the GENERATOR passes the flag.
    const out = viableTypesAt(500, 'planet', FPS, 0).map(f => f.class);
    expect(out).toContain('planet/hot-eyeball');
  });
});

describe('the metallicity factor', () => {
  // Fischer & Valenti: giant occurrence rises with metallicity because core accretion needs solids.
  // Low metallicity means FEWER giants; the floor is the metallicity-blind instability channel.
  const W = { realistic_dial: 0.65, decades_across_dial: 2.0, giant_floor: 0.05, sensitivity: {
    'giant|jupiter|neptune|puff|helium': 1.0, 'iron|silicate|carbon': 0.5,
    'terrestrial|desert|barren|earth': 0.25, 'ice|ocean|hycean|methane|ammonia|cold': -0.35 } };

  it('is exactly 1 at the realistic point for every class — the default draw is undisturbed', () => {
    for (const c of ['planet/gas-giant', 'planet/iron', 'planet/terrestrial', 'planet/ice'])
      expect(metallicityFactor(c, 0.65, W)).toBeCloseTo(1, 6);
  });

  it('giants rise steeply with metallicity and fall toward a floor below it', () => {
    expect(metallicityFactor('planet/gas-giant', 1, W)).toBeGreaterThan(3);
    expect(metallicityFactor('planet/gas-giant', 0, W)).toBeLessThan(0.15);
    expect(metallicityFactor('planet/gas-giant', 0, W)).toBeGreaterThan(0.04);   // the floor holds
  });

  it('never drives a giant to ZERO — the instability channel is metallicity-blind', () => {
    expect(metallicityFactor('planet/gas-giant', 0, W)).toBeGreaterThan(0);
  });

  it('iron worlds rise, ice worlds fall, an unlisted class is untouched', () => {
    expect(metallicityFactor('planet/iron', 1, W)).toBeGreaterThan(1);
    expect(metallicityFactor('planet/ice', 1, W)).toBeLessThan(1);
    expect(metallicityFactor('planet/ice', 0, W)).toBeGreaterThan(1);
    expect(metallicityFactor('planet/coreless', 1, W)).toBe(1);
  });

  it('is monotonic across the dial for a giant', () => {
    let prev = -1;
    for (const d of [0, 0.25, 0.5, 0.65, 0.85, 1]) { const f = metallicityFactor('planet/gas-giant', d, W); expect(f).toBeGreaterThan(prev); prev = f; }
  });
});
