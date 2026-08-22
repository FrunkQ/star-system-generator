// THE ANOMALY CATEGORY AND ITS BINDING TO AN OVERRIDE (G37 phase 2).
//
// Two things are being held here and they are different in kind:
//
//   1. THE TAG SAYS WHAT IS ANOMALOUS, not merely that something is. That is the owner's ask in so
//      many words, and a bare `anomaly/magic` on a body would satisfy the letter of the feature
//      while failing its point.
//   2. A SECRET REASON DOES NOT LEAK. The tag is redacted by the one redaction point (TAG-9), and
//      the assignment MAP — which names the reason in plain text next to the pin — is stripped from
//      the player snapshot as well. Verified rather than assumed, which is what the brief asked for.
import { describe, it, expect, beforeEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import { get } from 'svelte/store';
import { SystemProcessor } from '$lib/core/SystemProcessor';
import { computePlayerSnapshot } from '$lib/system/utils';
import { tagCategories, setCategoryPlayerHidden, isSystemCategory } from './tagCategories';
import { redactTagsForPlayers, tagOrigin } from './tagLifecycle';
import { setOverride, clearOverride } from '$lib/physics/overrides';
import { EARTH_MASS_KG, EARTH_RADIUS_KM } from '$lib/constants';
import type { System, CelestialBody } from '$lib/types';

function isObject(x: unknown) { return !!x && typeof x === 'object' && !Array.isArray(x); }
function deepMerge(t: Record<string, unknown>, s: Record<string, unknown>): Record<string, unknown> {
  const o = { ...t };
  if (isObject(t) && isObject(s)) {
    for (const k of Object.keys(s)) {
      o[k] = isObject(s[k]) && k in t
        ? deepMerge(t[k] as Record<string, unknown>, s[k] as Record<string, unknown>)
        : s[k];
    }
  }
  return o;
}
function loadRulePack() {
  const base = path.resolve('static/rulepacks/starter-sf');
  let pack = JSON.parse(fs.readFileSync(path.join(base, 'main.json'), 'utf-8'));
  for (const f of ['liquids.json', 'classification.json', 'atmospheres.json']) {
    const p = path.join(base, f);
    if (fs.existsSync(p)) pack = deepMerge(pack, JSON.parse(fs.readFileSync(p, 'utf-8')));
  }
  return pack;
}
const pack = loadRulePack();

// A cold outer moon — the shape of world the whole feature was requested for (a body past the
// habitable zone that a GM wants at 1100 K without tides or a greenhouse to explain it).
function world(): CelestialBody {
  return {
    id: 'p', kind: 'body', name: 'Callisto', roleHint: 'moon', parentId: 'star',
    massKg: EARTH_MASS_KG * 0.025, radiusKm: EARTH_RADIUS_KM * 0.378,
    axial_tilt_deg: 0, rotation_period_hours: 400,
    tags: [], classes: [], makeup: { metal: 0.1, rock: 0.5, carbon: 0, ice: 0.4, gas: 0 },
    orbit: { hostId: 'star', elements: { a_AU: 5.2, e: 0, i_deg: 0, omega_deg: 0, Omega_deg: 0, M0_rad: 0 } }
  } as unknown as CelestialBody;
}

function systemWith(body: CelestialBody): System {
  return {
    id: 'sys', name: 'Test', seed: 'seed', epochT0: 0, age_Gyr: 4.6,
    rulePackId: 'test', rulePackVersion: '1', tags: [],
    nodes: [
      { id: 'star', name: 'Star', kind: 'body', parentId: null, roleHint: 'star',
        massKg: 1.989e30, radiusKm: 696340, temperatureK: 5778, radiationOutput: 1,
        classes: ['star/G'], axial_tilt_deg: 0, rotation_period_hours: 600 },
      body
    ]
  } as unknown as System;
}
const subject = (sys: System) => sys.nodes.find((n) => n.id === 'p') as CelestialBody;

const anomalyTags = (b: CelestialBody) => (b.tags ?? []).filter((t) => t.key.startsWith('anomaly/'));

describe('the Anomaly category exists, is undeletable, and carries the agreed vocabulary', () => {
  it('is seeded on load with the owner’s twelve', () => {
    const cat = get(tagCategories).find((c) => c.id === 'anomaly');
    expect(cat).toBeTruthy();
    expect(cat!.longName).toBe('Anomaly');
    const keys = cat!.tags.map((t) => t.key);
    for (const k of [
      'anomaly/unknown-origin', 'anomaly/alien-technology', 'anomaly/alien-biosphere',
      'anomaly/subsurface-structure', 'anomaly/unobtanium', 'anomaly/magic',
      'anomaly/precursor-engineering', 'anomaly/exotic-matter', 'anomaly/divine-will',
      'anomaly/nanite-ecology', 'anomaly/reality-fault', 'anomaly/experimental-terraforming'
    ]) expect(keys, k).toContain(k);
    // Every seed explains itself — the same promise `tagPresentation.spec` holds the engine to.
    for (const t of cat!.tags) expect(t.description, t.key).toBeTruthy();
  });

  it('is a SYSTEM category: undeletable, because the engine matches `anomaly/` by hand', () => {
    expect(isSystemCategory('anomaly')).toBe(true);
    expect(get(tagCategories).find((c) => c.id === 'anomaly')!.system).toBe(true);
  });

  it('applies to worlds, not to constructs', () => {
    const cat = get(tagCategories).find((c) => c.id === 'anomaly')!;
    expect(cat.appliesTo).toContain('planet');
    expect(cat.appliesTo).toContain('moon');
    expect(cat.appliesTo).toContain('star');
    expect(cat.appliesTo).not.toContain('construct');
  });
});

describe('a reason is bound to its override, and says what it is accounting for', () => {
  it('names the QUANTITY, so a player learns what is odd rather than that something is', () => {
    const b = world();
    setOverride(b, 'radiogenicHeatK', 1100);
    b.overrides!.anomalies = { radiogenicHeatK: { tag: 'anomaly/magic' } };
    const out = subject(new SystemProcessor().process(systemWith(b), pack));
    const tags = anomalyTags(out);
    expect(tags).toHaveLength(1);
    expect(tags[0].key).toBe('anomaly/magic');
    expect(tags[0].value).toBe('Anomalous radiogenic heat');
  });

  it('one reason serving several pins produces ONE tag listing all of them', () => {
    const b = world();
    setOverride(b, 'radiogenicHeatK', 1100);
    setOverride(b, 'albedo', -2);
    b.overrides!.anomalies = {
      radiogenicHeatK: { tag: 'anomaly/precursor-engineering' },
      albedo: { tag: 'anomaly/precursor-engineering' }
    };
    const tags = anomalyTags(subject(new SystemProcessor().process(systemWith(b), pack)));
    expect(tags).toHaveLength(1);
    // Roster order, so the list is stable rather than dependent on how the GM happened to click.
    expect(tags[0].value).toBe('Anomalous bond albedo, radiogenic heat');
  });

  it('two reasons produce two tags', () => {
    const b = world();
    setOverride(b, 'radiogenicHeatK', 1100);
    setOverride(b, 'albedo', -2);
    b.overrides!.anomalies = {
      radiogenicHeatK: { tag: 'anomaly/divine-will' },
      albedo: { tag: 'anomaly/exotic-matter' }
    };
    const tags = anomalyTags(subject(new SystemProcessor().process(systemWith(b), pack)));
    expect(tags.map((t) => t.key).sort()).toEqual(['anomaly/divine-will', 'anomaly/exotic-matter']);
  });

  it('an override with NO reason is invisible — the GM may pass their world off as right (Q6)', () => {
    const b = world();
    setOverride(b, 'radiogenicHeatK', 1100);
    const out = subject(new SystemProcessor().process(systemWith(b), pack));
    expect(anomalyTags(out)).toHaveLength(0);
  });

  it('resetting the override takes the tag with it, on the very next pass', () => {
    const b = world();
    setOverride(b, 'radiogenicHeatK', 1100);
    b.overrides!.anomalies = { radiogenicHeatK: { tag: 'anomaly/magic' } };
    let out = subject(new SystemProcessor().process(systemWith(b), pack));
    expect(anomalyTags(out)).toHaveLength(1);
    clearOverride(out, 'radiogenicHeatK');
    out = subject(new SystemProcessor().process(systemWith(out), pack));
    expect(anomalyTags(out)).toHaveLength(0);
  });

  it('is re-derived every pass, so processing twice changes nothing (PHY-1)', () => {
    const b = world();
    setOverride(b, 'albedo', -2);
    b.overrides!.anomalies = { albedo: { tag: 'anomaly/reality-fault' } };
    const p = new SystemProcessor();
    const once = subject(p.process(systemWith(b), pack));
    const twice = subject(p.process(systemWith(once), pack));
    expect(anomalyTags(twice)).toEqual(anomalyTags(once));
  });

  it('spares a hand-added anomaly tag that no override claims', () => {
    // Adding `anomaly/legend` on the Tags tab with no pin behind it is a legitimate GM move and the
    // program does not stop them. Only a BOUND key is this pass's to own.
    const b = world();
    b.tags = [{ key: 'anomaly/legend', manual: true }];
    setOverride(b, 'albedo', -2);
    b.overrides!.anomalies = { albedo: { tag: 'anomaly/magic' } };
    const tags = anomalyTags(subject(new SystemProcessor().process(systemWith(b), pack)));
    expect(tags.map((t) => t.key).sort()).toEqual(['anomaly/legend', 'anomaly/magic']);
  });

  it('but a BOUND key wins over a hand-added twin, or the informative value would be dropped', () => {
    const b = world();
    b.tags = [{ key: 'anomaly/magic', manual: true }];   // no value
    setOverride(b, 'albedo', -2);
    b.overrides!.anomalies = { albedo: { tag: 'anomaly/magic' } };
    const tags = anomalyTags(subject(new SystemProcessor().process(systemWith(b), pack)));
    expect(tags).toHaveLength(1);
    expect(tags[0].value).toBe('Anomalous bond albedo');
  });
});

describe('a secret reason does not reach a player, by either route', () => {
  beforeEach(() => setCategoryPlayerHidden('anomaly', false));

  it('the TAG is stripped by the one redaction point', () => {
    const b = world();
    setOverride(b, 'radiogenicHeatK', 1100);
    b.overrides!.anomalies = { radiogenicHeatK: { tag: 'anomaly/magic', secret: true } };
    const out = subject(new SystemProcessor().process(systemWith(b), pack));
    expect(anomalyTags(out)[0].secret).toBe(true);
    expect(redactTagsForPlayers(out.tags, get(tagCategories)).filter((t) => t.key.startsWith('anomaly/')))
      .toHaveLength(0);
  });

  it('and the ASSIGNMENT MAP never travels at all, secret or not', () => {
    const b = world();
    setOverride(b, 'radiogenicHeatK', 1100);
    b.overrides!.anomalies = { radiogenicHeatK: { tag: 'anomaly/magic', secret: true } };
    const processed = new SystemProcessor().process(systemWith(b), pack);
    const player = subject(computePlayerSnapshot(processed));
    expect(player.overrides?.anomalies).toBeUndefined();
    expect(player.tags.some((t) => t.key.startsWith('anomaly/'))).toBe(false);
    // The pinned VALUE does travel — the players are looking at its consequences.
    expect(player.overrides?.radiogenicHeatK).toBe(1100);
  });

  it('a player-hidden Anomaly category redacts every reason at once', () => {
    const b = world();
    setOverride(b, 'albedo', -2);
    b.overrides!.anomalies = { albedo: { tag: 'anomaly/unobtanium' } };   // NOT secret
    const processed = new SystemProcessor().process(systemWith(b), pack);
    setCategoryPlayerHidden('anomaly', true);
    const player = subject(computePlayerSnapshot(processed));
    expect(player.tags.some((t) => t.key.startsWith('anomaly/'))).toBe(false);
    setCategoryPlayerHidden('anomaly', false);
  });

  it('a visible reason DOES reach the player, with its list of quantities intact', () => {
    const b = world();
    setOverride(b, 'albedo', -2);
    b.overrides!.anomalies = { albedo: { tag: 'anomaly/alien-technology' } };
    const processed = new SystemProcessor().process(systemWith(b), pack);
    const player = subject(computePlayerSnapshot(processed));
    const t = player.tags.find((x) => x.key === 'anomaly/alien-technology');
    expect(t?.value).toBe('Anomalous bond albedo');
  });
});

describe('provenance', () => {
  it('an anomaly tag is engine-emitted, not a hand-added manual tag', () => {
    const b = world();
    setOverride(b, 'albedo', -2);
    b.overrides!.anomalies = { albedo: { tag: 'anomaly/magic' } };
    const out = subject(new SystemProcessor().process(systemWith(b), pack));
    expect(tagOrigin(anomalyTags(out)[0])).toBe('physics');
  });
});
