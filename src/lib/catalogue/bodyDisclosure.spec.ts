// THE REDACTION TEST for the "observed from a distance only" level (bodyDisclosure.ts).
//
// Modelled on tagDisclosure.spec.ts: a hidden fact is not one field, it is everything a surface can
// derive from the body - a row, the Type, a tag pill and its colour, the heading's subtitle, the
// picture, the class swatch. So the central gate does not check a row at a time. It takes a REAL
// processed Earth, stamps a distinctive sentinel into EVERY field that is not on the allow-list
// (and adds fields the engine does not have yet), and asserts that no sentinel reaches anything a
// player surface is handed. That is the assertion that still holds the day a body grows a field.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import derived from '../../../tests/output/solar-system-derived.json';
import { bodyFacts } from './bodyFacts';
import { buildGuideDocument } from './document/guideDocument';
import {
  bodyDisclosureFor, observedBody, discloseBody, discloseSystem, genericTypeLabel, isHandAddedTag,
  graphicModeFor, isVeilable
} from './bodyDisclosure';
import { anonymousTag } from '$lib/tags/tagLifecycle';
import { getClassColor } from '$lib/rendering/colors';

const sol = derived as any;
const node = (name: string) => structuredClone(sol.nodes.find((n: any) => n.name === name));
const labels = (facts: { label: string }[]) => facts.map((f) => f.label);
const SENTINEL = 'ZZLEAKZZ';

// What a ship can measure from a distance, and the GM's own words. The spec states the list itself
// rather than importing it: widening the allow-list should be a decision someone has to make twice.
const OBSERVABLE = new Set([
  'id', 'name', 'kind', 'roleHint', 'parentId', 'ui_parentId', 'placement',
  'orbit', 'orbital_period_days', 'rotation_period_hours', 'axial_tilt_deg', 'tidallyLocked',
  'massKg', 'radiusKm', 'description'
]);

/** Earth with a sentinel in every non-observable field, plus two fields no engine has written yet. */
function poisonedEarth(): any {
  const e = node('Earth');
  const poison = (v: any): any => {
    if (typeof v === 'string') return SENTINEL;
    if (Array.isArray(v)) return v.length ? v.map(poison) : [SENTINEL];
    if (v && typeof v === 'object') return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, poison(x)]));
    return v; // numbers and booleans are checked by the row gates below
  };
  for (const k of Object.keys(e)) {
    if (OBSERVABLE.has(k) || k === 'tags' || k === 'image') continue;
    e[k] = poison(e[k]);
  }
  e.classes = [`planet/${SENTINEL}`];
  e.class = SENTINEL;
  e.atmosphere = { ...e.atmosphere, name: SENTINEL, composition: { [SENTINEL]: 0.9 } };
  e.hydrosphere = { coverage: 0.7, composition: SENTINEL };
  e.fieldInventedNextMonth = SENTINEL;
  e.anotherDerivedThing = { verdict: SENTINEL };
  e.image = { url: `/images/planet_types/${SENTINEL}.jpg` }; // a stock TYPE picture
  e.tags = [
    { key: `habitability/${SENTINEL}` },                                 // physics
    { key: `resource/${SENTINEL}`, source: 'rule:d7' },                  // rule
    { key: `traveller/${SENTINEL}`, value: SENTINEL },                   // generated ("authored")
    { key: 'faction/red-hand', value: 'ascendant', manual: true }        // the GM's own
  ];
  return e;
}
const systemWith = (body: any) => ({ ...sol, nodes: sol.nodes.map((n: any) => (n.id === body.id ? body : n)) });

describe('the level is decided in one place, and absent means nothing changes', () => {
  it('reads full for every preset that predates the field', () => {
    expect(bodyDisclosureFor(null)).toBe('full');
    expect(bodyDisclosureFor(undefined)).toBe('full');
    expect(bodyDisclosureFor({})).toBe('full');
    expect(bodyDisclosureFor({ bodyDisclosure: 'full' })).toBe('full');
    expect(bodyDisclosureFor({ bodyDisclosure: 'observed' })).toBe('observed');
  });

  it('is not a default: a built-in preset does not carry the field at all', async () => {
    const { DEFAULT_PRESET, BUILTIN_PRESETS } = await import('$lib/player/presets');
    expect('bodyDisclosure' in DEFAULT_PRESET).toBe(false);
    for (const p of BUILTIN_PRESETS) expect(bodyDisclosureFor(p)).toBe('full');
  });

  it('hands back the SAME body and the SAME facts at full - byte for byte', () => {
    const earth = node('Earth');
    expect(discloseBody(earth, 'full')).toBe(earth);
    expect(discloseBody(earth, undefined)).toBe(earth);
    expect(discloseSystem(sol, 'full')).toBe(sol);
    expect(bodyFacts(earth, {}, { disclosure: 'full' })).toEqual(bodyFacts(earth));
    const opts = { panel: true, imagery: 'sphere' as const };
    expect(JSON.stringify(buildGuideDocument(sol, earth.id, { ...opts, disclosure: 'full' })))
      .toBe(JSON.stringify(buildGuideDocument(sol, earth.id, opts)));
  });
});

describe('what an observed body can leak, which must be nothing', () => {
  it('carries no non-observable field through the copy', () => {
    const out = observedBody(poisonedEarth());
    expect(JSON.stringify(out)).not.toContain(SENTINEL);
    for (const k of Object.keys(out)) {
      expect(OBSERVABLE.has(k) || k === 'tags' || k === 'observedType', `unexpected field ${k}`).toBe(true);
    }
  });

  it('prints none of it in the fact rows', () => {
    const facts = bodyFacts(poisonedEarth(), {}, { disclosure: 'observed', system: sol, nowMs: 0 });
    expect(JSON.stringify(facts)).not.toContain(SENTINEL);
  });

  it('builds none of it into the info panel or the document page - heading, rows, tags or picture', () => {
    const e = poisonedEarth();
    const system = systemWith(e);
    const fakePicture = { leak: SENTINEL } as any; // a caller that loaded the type picture anyway
    for (const imagery of ['sphere', 'disc', 'flat', 'photo', 'none'] as const) {
      for (const panel of [true, false]) {
        const blocks = buildGuideDocument(system, e.id, {
          panel, imagery, disclosure: 'observed', image: fakePicture, imageAspect: 1.5, photoFrame: 'sliver',
          highlights: [{ ref: `habitability/${SENTINEL}` }, { ref: 'habitability' }] as any, tagCategories: [],
          pageWidth: 1600, pageHeight: 900
        });
        // The schematic block holds the whole system for the chart; it is not a fact surface.
        const facts = blocks.filter((b: any) => b.kind !== 'schematic');
        expect(JSON.stringify(facts), `${imagery} panel=${panel}`).not.toContain(SENTINEL);
      }
    }
  });

  it('does not wear the class in the swatch colour either', () => {
    // Earth's class colour is the habitable blue; a veiled Earth takes the same plain swatch as Mars.
    const earth = node('Earth'), mars = node('Mars');
    expect(getClassColor(earth)).not.toBe(getClassColor(mars));
    expect(getClassColor(observedBody(earth))).toBe(getClassColor(observedBody(mars)));
  });

  it('draws the plain disc in place of the live globe, and only for a veiled body', () => {
    expect(graphicModeFor('sphere', true)).toBe('disc');
    expect(graphicModeFor('flat', true)).toBe('disc');
    expect(graphicModeFor('disc', true)).toBe('disc');
    expect(graphicModeFor('photo', true)).toBe('photo');
    expect(graphicModeFor('none', true)).toBe('none');
    expect(graphicModeFor('sphere', false)).toBe('sphere');
    const earth = node('Earth');
    const disc = (level: 'full' | 'observed') => buildGuideDocument(sol, earth.id, { panel: true, imagery: 'sphere', disclosure: level })
      .find((b: any) => b.kind === 'bodyDisc') as any;
    expect(disc('full').mode).toBe('sphere');
    expect(disc('full').body.classes).toBeDefined();
    expect(disc('observed').mode).toBe('disc');
    expect(disc('observed').body.classes).toBeUndefined();
    expect(disc('observed').body.atmosphere).toBeUndefined();
  });

  it('keeps a picture the GM uploaded and drops the type picture', () => {
    const earth = node('Earth');
    expect(earth.image?.url).toBeTruthy();
    expect(observedBody(earth).image).toBeUndefined();
    const custom = { url: 'data:image/png;base64,AAAA', custom: true };
    expect(observedBody({ ...earth, image: custom }).image).toEqual(custom);
    const picture = { mine: true } as any;
    const shown = (image: any) => buildGuideDocument(systemWith({ ...earth, image }), earth.id,
      { panel: true, imagery: 'photo', disclosure: 'observed', image: picture })
      .some((b: any) => b.kind === 'image');
    expect(shown(earth.image)).toBe(false);
    expect(shown(custom)).toBe(true);
  });
});

describe('what stays, because a ship could measure it', () => {
  const earth = node('Earth');
  const full = bodyFacts(earth, {}, { system: sol, nowMs: 0 });
  const seen = bodyFacts(earth, {}, { disclosure: 'observed', system: sol, nowMs: 0 });
  // The eclipse row is orbital geometry - a navigator predicts it from the same orbits.
  const KEPT = ['Orbit distance', 'Orbital period', 'Day length', 'Axial tilt', 'Next eclipse', 'Mass', 'Radius', 'Gravity', 'Density'];

  it('keeps the orbital and bulk rows with the SAME values', () => {
    for (const label of KEPT) {
      const a = full.find((f) => f.label === label)?.value;
      expect(a, label).toBeTruthy();
      expect(seen.find((f) => f.label === label)?.value, label).toBe(a);
    }
  });

  it('hides every derived row - the list is absolute, not "fewer than before"', () => {
    expect(labels(seen)).toEqual(['Type', ...KEPT]);
    for (const hidden of ['Surface temp', 'Temp range', 'Atmosphere', 'Air mix', 'Surface liquid', 'Magnetosphere',
      'Geology', 'Ascent Δv', 'Habitability score', 'Native life', 'Tags']) {
      expect(labels(full), `${hidden} should be a real row at full`).toContain(hidden);
      expect(labels(seen)).not.toContain(hidden);
    }
    expect(labels(full).some((l) => l.startsWith('Radiation'))).toBe(true);
    expect(labels(seen).some((l) => l.startsWith('Radiation'))).toBe(false);
  });

  it('names a generic type from what is visibly true, never the class', () => {
    const type = (name: string) => bodyFacts(node(name), {}, { disclosure: 'observed' })[0];
    expect(full[0]).toEqual({ label: 'Type', value: 'Earth Analogue · Terrestrial' });
    expect(type('Earth')).toEqual({ label: 'Type', value: 'Planet' });
    expect(type('Mars').value).toBe('Planet');
    expect(type('Jupiter').value).toBe('Gas giant');
    expect(type('Neptune').value).toBe('Gas giant');
    expect(type('Luna').value).toBe('Moon');
    expect(genericTypeLabel({ roleHint: 'belt' })).toBe('Belt');
    // ...and the copy carries the answer, because the makeup that decides "giant" is gone from it.
    expect(genericTypeLabel(observedBody(node('Jupiter')))).toBe('Gas giant');
  });

  it('still says how a resonant world turns, though that fact is stored as a derived tag', () => {
    const rotation = (level: 'full' | 'observed') =>
      bodyFacts(node('Mercury'), {}, { disclosure: level }).find((f) => f.label === 'Rotation')?.value;
    expect(rotation('full')).toContain('resonance');
    expect(rotation('observed')).toBe(rotation('full'));
  });

  it('keeps the description, which is the GM speaking to the players', () => {
    const e = { ...node('Earth'), description: 'The cradle. Do not land.' };
    const blocks = buildGuideDocument(systemWith(e), e.id, { panel: true, disclosure: 'observed' });
    expect(blocks.some((b: any) => b.kind === 'text' && b.text === 'The cradle. Do not land.')).toBe(true);
  });
});

describe('tags: the GM\'s own stay, the engine\'s go', () => {
  it('keeps hand-added tags and the anonymous placeholder, and nothing derived, ruled or generated', () => {
    expect(isHandAddedTag({ key: 'faction/red-hand', manual: true })).toBe(true);
    expect(isHandAddedTag({ key: 'habitability/earth-like', manual: true, override: true })).toBe(true);
    expect(isHandAddedTag({ key: 'coi/port', coi: true })).toBe(true);
    expect(isHandAddedTag(anonymousTag())).toBe(true);
    expect(isHandAddedTag({ key: 'habitability/earth-like' })).toBe(false);
    expect(isHandAddedTag({ key: 'resource/water-ice', source: 'rule:d7' })).toBe(false);
    expect(isHandAddedTag({ key: 'traveller/uwp', value: 'A867A69-F' })).toBe(false);
    expect(isHandAddedTag({ key: 'spin/axis-inferred' })).toBe(false);
  });

  it('shows exactly the hand-added ones in the rows and in the tags block', () => {
    const e = poisonedEarth();
    const row = bodyFacts(e, {}, { disclosure: 'observed' }).find((f) => f.label === 'Tags')!.value;
    expect(row).toContain('ascendant');
    const tagBlocks = buildGuideDocument(systemWith(e), e.id, { panel: true, disclosure: 'observed' })
      .filter((b: any) => b.kind === 'tags') as any[];
    expect(tagBlocks).toHaveLength(1);
    expect(tagBlocks[0].tags).toHaveLength(1);
    // Every real derived tag on a real Earth is gone, and at full they are all there.
    const earth = node('Earth');
    expect(earth.tags.length).toBeGreaterThan(10);
    expect(observedBody(earth).tags).toBeUndefined();
  });
});

describe('who is veiled', () => {
  it('leaves stars, constructs and barycentres exactly as they are', () => {
    const sun = sol.nodes.find((n: any) => n.roleHint === 'star');
    expect(isVeilable(sun)).toBe(false);
    expect(observedBody(sun)).toBe(sun);
    expect(bodyFacts(sun, {}, { disclosure: 'observed' })).toEqual(bodyFacts(sun));
    const ship = { id: 's', name: 'Ship', kind: 'construct', class: 'Ship/Scout', tags: [{ key: 'drive/fusion', inherited: true }] } as any;
    expect(observedBody(ship)).toBe(ship);
    expect(bodyFacts(ship, {}, { disclosure: 'observed' })).toEqual(bodyFacts(ship));
    const bary = { id: 'b', kind: 'barycenter' };
    expect(observedBody(bary)).toBe(bary);
  });

  it('veils every natural body in a system and leaves the object alone', () => {
    const out = discloseSystem(sol, 'observed');
    expect(out).not.toBe(sol);
    for (const n of out.nodes) if (isVeilable(n)) expect((n as any).classes).toBeUndefined();
    expect(sol.nodes.find((n: any) => n.name === 'Earth').classes).toBeDefined();
  });
});

// THE WIRING. The gates above prove the builders withhold; this one proves every surface ASKS them
// to. `liveReadings` is the flag this one was threaded beside, so its thread sites are the census of
// player surfaces that show a body's facts: any line that hands `liveReadings` on must hand the
// disclosure level on with it. A new surface copied from an old one inherits the gate.
describe('every player surface that shows facts is told the level', () => {
  const SURFACES = [
    'src/routes/catalogue/+page.svelte', 'src/lib/components/DocPanel.svelte',
    'src/lib/components/FilteredDocumentView.svelte', 'src/lib/components/PlayerPresetEditor.svelte',
    'src/lib/catalogue/document/guideDocument.ts'
  ];
  const threadSites = (file: string) => readFileSync(file, 'utf8').split('\n')
    .map((text, i) => ({ file, line: i + 1, text }))
    // a hand-on: `liveReadings={...}`, `liveReadings: x` inside a call, or the shorthand in an options bag
    .filter((l) => /liveReadings(=\{|: [!o]|, )/.test(l.text) && !/^\s*(\/\/|export let)/.test(l.text));

  it('finds the sites it is supposed to be guarding', () => {
    expect(SURFACES.flatMap(threadSites).length).toBe(9);
  });

  it('hands the level on wherever liveReadings is handed on', () => {
    for (const site of SURFACES.flatMap(threadSites)) {
      expect(/disclosure/.test(site.text), `${site.file}:${site.line} passes liveReadings without the disclosure level`).toBe(true);
    }
  });

  it('draws the panel subtitle, the card subtitle and the list swatch from the veiled copy', () => {
    const page = readFileSync('src/routes/catalogue/+page.svelte', 'utf8');
    expect(page).toMatch(/class="insp-sub">\{#if bodyVeiled\}\{genericTypeLabel\(shownSelectedBody\)/);
    expect(page).toMatch(/sub: bodyVeiled \? genericTypeLabel\(shownSelectedBody\)/);
    expect(page).toMatch(/\.map\(\(n\) => discloseBody\(n, bodyDisclosureFor\(activePreset, n\)\)\)/);
    // ...and nothing on the page reads the preset's field for itself: one decider.
    expect(page).not.toMatch(/\.bodyDisclosure\b/);
  });

  it('gives both picture components the veiled body and the shared mode rule', () => {
    for (const f of ['src/lib/components/DocPanel.svelte', 'src/lib/components/FilteredDocumentView.svelte']) {
      const src = readFileSync(f, 'utf8');
      expect(src, f).toMatch(/<BodyGraphic[^>]*body=\{shownBody\}/);
      expect(src, f).not.toMatch(/<BodyGraphic[^>]*body=\{subjectBody\}/);
      expect(src, f).toMatch(/gfxImagery = graphicModeFor\(imagery, shownBody !== subjectBody\)/);
      expect(src, f).toMatch(/discloseSystem\(system, disclosure\)/); // the photo loader's lookup
    }
  });
});
