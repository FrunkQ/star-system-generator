import { describe, it, expect, vi, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import { classifyBody, warnIfLegacyRules } from './classification';
import { loadRulePack } from '../rulepack-loader';
import type { RulePack, CelestialBody } from '../types';

/**
 * ONE classifier (inbox B67 / D12). The additive `classifier.rules[]` seam is gone; this pins what
 * replaced it and what a pack author is told.
 *
 * WHY IT WENT, MEASURED BEFORE REMOVAL on the 167 planets and moons in the bundled examples, run
 * through a pack with its fingerprints stripped:
 *   - 43 of the 50 rules DID fire, so the seam was not inert — it was merely never reached, because
 *     every shipped pack carries fingerprints and the early return took them.
 *   - The output was materially worse on every body compared. `planet/silicate` (density > 1.5) hit
 *     136 of 167. Io lost its sulfur, Europa its subsurface ocean, Luna came out as
 *     desert+barren+silicate+dwarf-planet, and `hot-eyeball` landed on a gas giant.
 *   - It held a copy of the classifier that predated TWO corrections that never reached it: B6 moved
 *     the eyeball family onto surface temperature (the legacy rules still keyed Teq_K) and B25 added
 *     the surface gate (the legacy rules had none). The fingerprints carry both.
 *   - Rule 8 called any body under 10 Earth masses with irradiation over 1000 a `planet/chthonian` —
 *     a stripped gas-giant core. The chthonian FINGERPRINT additionally requires density 4-12 and
 *     Teq 1200-5000, which is why the same fault does not exist on the live path.
 */
function deepMerge(t: any, s: any): any {
  if (typeof t !== 'object' || t === null || Array.isArray(t)) return s;
  const out = { ...t };
  for (const k of Object.keys(s || {})) out[k] = (k in out) ? deepMerge(out[k], s[k]) : s[k];
  return out;
}
function pack(): RulePack {
  const base = path.resolve('static/rulepacks/starter-sf');
  let p: any = JSON.parse(fs.readFileSync(path.join(base, 'main.json'), 'utf-8'));
  for (const f of ['stars.json', 'planets.json', 'classification.json', 'atmospheres.json', 'liquids.json']) {
    const fp = path.join(base, f);
    if (fs.existsSync(fp)) p = deepMerge(p, JSON.parse(fs.readFileSync(fp, 'utf-8')));
  }
  return p as RulePack;
}
const planet = { id: 'p', name: 'P', kind: 'body', roleHint: 'planet', tags: [] } as unknown as CelestialBody;

afterEach(() => vi.restoreAllMocks());

describe('the shipped pack no longer carries the legacy seam', () => {
  it('starter-sf has fingerprints and no rules or minScore', () => {
    const c = pack().classifier as any;
    expect(c.fingerprints.length).toBeGreaterThan(50);
    expect(c.rules ?? []).toHaveLength(0);
    expect(c.minScore).toBeUndefined();
  });
});

describe('a pack with NO fingerprints', () => {
  const bare = (): RulePack => {
    const p = pack();
    (p.classifier as any).fingerprints = [];
    return p;
  };

  it('gets one honest base class from mass, not a flood of drifted ones', () => {
    const rocky = classifyBody(planet, { id: 'p', mass_Me: 1, radius_Re: 1, density: 5.5, Teq_K: 255 }, bare(), []);
    expect(rocky).toEqual(['planet/terrestrial']);
    const giant = classifyBody(planet, { id: 'p', mass_Me: 300, radius_Re: 11, density: 1.3, Teq_K: 120 }, bare(), []);
    expect(giant).toEqual(['planet/gas-giant']);
  });

  it('says so rather than guessing when it cannot even weigh the body', () => {
    expect(classifyBody(planet, { id: 'p' }, bare(), [])).toEqual(['planet/unclassified']);
  });

  it('NEVER reaches the deleted rules: a small hot world is not called a stripped giant core', () => {
    // The exact shape of the old rule 8 — mass < 10, irradiation > 1000. Io was handed 26,279 to
    // that feature before B34, so a fingerprint-less pack would have classified the Galileans as
    // stripped gas-giant cores.
    const io = { id: 'p', mass_Me: 0.015, radius_Re: 0.286, density: 3.5, Teq_K: 110, stellarIrradiation: 26279 };
    expect(classifyBody(planet, io, bare(), [])).not.toContain('planet/chthonian');
    // ...and not on the live path either, because the fingerprint wants density 4-12 and Teq 1200+.
    expect(classifyBody(planet, io, pack(), [])).not.toContain('planet/chthonian');
  });

  it('NEVER reaches the deleted eyeball rules, which had no surface test and the wrong temperature', () => {
    // Tidally locked, Teq in the old rule's band, and a GAS body. The legacy rule keyed Teq_K with
    // no surface gate, so this scored `planet/cold-eyeball`; the fingerprint keys SurfaceTemp_K and
    // gates on makeup.gas <= 0.5, so it cannot.
    const lockedGiant = {
      id: 'p', mass_Me: 300, radius_Re: 11, density: 1.3,
      Teq_K: 250, SurfaceTemp_K: 250, starTidallyLocked: 1, 'makeup.gas': 0.9
    };
    for (const p of [bare(), pack()]) {
      expect(classifyBody(planet, lockedGiant, p, [])).not.toContain('planet/cold-eyeball');
      expect(classifyBody(planet, lockedGiant, p, [])).not.toContain('planet/hot-eyeball');
    }
  });
});

describe('a pack author who still ships rules is told, once', () => {
  it('warns naming the pack and the count, and does not repeat for the same pack', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const legacy = { id: 'legacy-pack-b67', version: '1', name: 'x', distributions: {},
      classifier: { maxClasses: 4, rules: [{ when: {}, addClass: 'planet/x', score: 10 }] } } as any;
    loadRulePack(legacy);
    loadRulePack(legacy);
    expect(warn).toHaveBeenCalledTimes(1);
    expect(String(warn.mock.calls[0][0])).toMatch(/legacy-pack-b67/);
    expect(String(warn.mock.calls[0][0])).toMatch(/NOT read/);
  });

  it('stays quiet for a pack that has moved on', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    warnIfLegacyRules({ id: 'clean-pack-b67', classifier: { maxClasses: 4, fingerprints: [] } } as any);
    expect(warn).not.toHaveBeenCalled();
  });
});
