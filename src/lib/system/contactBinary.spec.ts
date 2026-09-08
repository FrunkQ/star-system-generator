// THE CONTACT-BINARY MODIFIER (G90), against the SHIPPED pack.
//
// `lobeSeam.spec.ts` proves the seam with a throwaway fingerprint. This proves the real one, and the
// reason it is a MODIFIER rather than a sixth base type: a modifier says how a rock is SHAPED
// without overruling what it is MADE OF, so one entry gives both real objects the owner had in mind.
// Two of the three bodies below are the actual things —
//
//   67P/Churyumov-Gerasimenko  comet + contact-binary   (the bilobate nucleus Rosetta photographed)
//   25143 Itokawa              s-type + rubble-pile + contact-binary
//
// — and a base type could not have expressed either without deleting the more important half.
//
// SEEN RED against three deliberate breakages: the fingerprint removed from the pack (every stacking
// test fails); its `lobes` band widened to [1, 8] (the "never without the fact" tests fail); and its
// `mass_Me` band removed (Earth gains the class).
import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import { systemProcessor } from '../core/SystemProcessor';
import type { System, RulePack, CelestialBody } from '$lib/types';

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
const pack = loadRulePack();
const CB = 'asteroid/contact-binary';

// Real figures, so that a band retuned past reality fails here rather than passing quietly.
const BODIES: Record<string, Partial<CelestialBody>> = {
  // 9.98e12 kg over a 1.65 km volume-equivalent radius = 0.53 g/cc, and ice-rich.
  '67P': { massKg: 9.982e12, radiusKm: 1.65, makeup: { ice: 0.5, rock: 0.3, carbon: 0.2 } },
  // 3.51e10 kg over 165 m = 1.9 g/cc against a compacted ~3.3, so about 40% void: a rubble pile.
  Itokawa: { massKg: 3.51e10, radiusKm: 0.165, makeup: { rock: 0.9, metal: 0.1 } },
  // A dense solid rock of the same size — the control for "the fact, not the porosity, is what
  // carries this class".
  solid: { massKg: 1.6e14, radiusKm: 2.0, makeup: { rock: 0.6, metal: 0.4 } },
  // And a world, to prove the small-body window holds.
  Earth: { massKg: 5.972e24, radiusKm: 6371, makeup: { metal: 0.32, rock: 0.68 } }
};

function classesOf(which: keyof typeof BODIES, lobes: number | undefined, passes = 1): string[] {
  const sys = {
    id: 'cb', name: 'cb', seed: 'cb-seed', epochT0: 0, age_Gyr: 4.6,
    nodes: [
      { id: 'star', name: 'Star', kind: 'body', parentId: null, roleHint: 'star', massKg: 1.989e30,
        radiusKm: 696340, temperatureK: 5778, radiationOutput: 1, classes: ['star/G'],
        axial_tilt_deg: 0, rotation_period_hours: 600 },
      { id: 'rock', name: 'Rock', kind: 'body', parentId: 'star', roleHint: 'planet',
        axial_tilt_deg: 0, rotation_period_hours: 13, tags: [],
        orbit: { hostId: 'star', elements: { a_AU: 3.4, e: 0.04, i_deg: 0, omega_deg: 0, Omega_deg: 0, M0_rad: 0 } },
        ...BODIES[which], ...(lobes === undefined ? {} : { lobes }) }
    ]
  } as any as System;
  let cur = JSON.parse(JSON.stringify(sys)) as System;
  for (let i = 0; i < passes; i++) {
    cur = systemProcessor.process(cur, pack);
    cur = JSON.parse(JSON.stringify(cur));
  }
  return (cur.nodes.find((n) => n.id === 'rock') as CelestialBody).classes ?? [];
}

describe('the contact-binary modifier stacks rather than competing', () => {
  it('67P is a COMET that is also a contact binary — the ice is not lost to the shape', () => {
    const c = classesOf('67P', 2);
    expect(c, c.join(', ')).toContain('asteroid/comet');
    expect(c, c.join(', ')).toContain(CB);
  });

  it('Itokawa is a rubble pile that is also a contact binary — two modifiers on one base', () => {
    const c = classesOf('Itokawa', 2);
    expect(c, c.join(', ')).toContain('asteroid/rubble-pile');
    expect(c, c.join(', ')).toContain(CB);
    // ...and it still has a composition base under both of them.
    expect(c.filter((x) => x.startsWith('asteroid/') && x !== CB && x !== 'asteroid/rubble-pile'),
      c.join(', ')).not.toEqual([]);
  });

  it('a dense solid rock can be one too — the shape is the fact, not the porosity', () => {
    expect(classesOf('solid', 2)).toContain(CB);
    // The point of NOT banding this on porosity: a GM who authors a compact bilobate rock keeps the
    // class. A fingerprint that demanded rubble would have taken it away on the next reprocess,
    // which is a physics criterion REFUSING an authored fact rather than explaining it.
    expect(classesOf('solid', 2)).not.toContain('asteroid/rubble-pile');
  });
});

describe('and never turns up where it should not', () => {
  it('not on the same three bodies without the fact', () => {
    for (const which of ['67P', 'Itokawa', 'solid'] as const) {
      expect(classesOf(which, undefined), which).not.toContain(CB);
      expect(classesOf(which, 1), `${which} (1 lobe)`).not.toContain(CB);
    }
  });

  it('not on a planet, however many lobes it is told it has', () => {
    const c = classesOf('Earth', 2);
    expect(c, c.join(', ')).not.toContain(CB);
    // It is still a PLANET, and no small-body class at all — the mass window is what holds that, and
    // removing it puts the modifier on an Earth. (Which planet it is depends on the orbit this probe
    // sits at, so the assertion is on the namespace, not on the type.)
    expect(c.filter((x) => x.startsWith('planet/')), c.join(', ')).not.toEqual([]);
    expect(c.filter((x) => x.startsWith('asteroid/')), c.join(', ')).toEqual([]);
  });

  // THE SEAM, on the shipped fingerprint this time: three passes, each fed the last one's output.
  it('survives three reprocesses on both real objects', () => {
    for (const which of ['67P', 'Itokawa'] as const) {
      for (const passes of [1, 2, 3]) {
        expect(classesOf(which, 2, passes), `${which} pass ${passes}`).toContain(CB);
      }
    }
  });
});
