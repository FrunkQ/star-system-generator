// FICTION NEVER REACHES A REAL STAR (D25).
//
// THE FAULT: Astrophage and Taumoeba are inventions of Project Hail Mary, and they were defined in
// `starter-sf` - the DEFAULT rule pack, which by definition is what every campaign receives. A
// real-sky import generates atmospheres from that same pack, so a genuine catalogued star's world
// could be given a substance from a novel. The owner reported exactly that, and it is the opposite
// direction from D4d: that one is about the fiction being CORRECT on the science-fiction map.
//
// THE FIX IS A MOVE, NOT A FLAG, and it is the owner's own architecture (2026-08-14: "the DEFAULT
// list is what everyone gets; otherwise it is stored IN THE STARMAP FILE to be integrated on load";
// 2026-09-08: "those SHOULD be sci-fi map defined rather than default defined"). No `fictional: true`
// flag, no pack split, no allow-list that rots - the engine already had the extension point, and a
// GM's own invented gas has always travelled this way.
//
// THIS FILE IS THE GUARANTEE. It is deliberately about DATA rather than about code, because the
// fault was data in the wrong place and nothing in the code was wrong. If somebody adds the next
// fictional gas to the default pack, this is what should stop them.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

const json = (p: string) => JSON.parse(readFileSync(p, 'utf8'));

const PACK = 'static/rulepacks/starter-sf';
const REAL_MAP = 'static/example-starmaps/Local_Neighbourhood-Starmap.json';
const SCIFI_MAP = 'static/example-starmaps/Local_Neighbourhood_SciFi-Starmap.json';

/** The named inventions. Add to this list, not to the default pack. */
const FICTION = ['Astrophage', 'Taumoeba'];
const FICTION_LIQUIDS = ['astrophage-bloom', 'taumoeba-bloom'];

describe('D25 - the default pack carries no fiction', () => {
  it('no fictional GAS is defined in the pack every campaign receives', () => {
    const gases = Object.keys(json(`${PACK}/atmospheres.json`).gasPhysics);
    for (const f of FICTION) expect(gases, `${f} is in the DEFAULT pack`).not.toContain(f);
    // ...and the pack is not empty, so a broken path cannot pass this by accident.
    expect(gases.length).toBeGreaterThan(20);
  });

  it('no fictional LIQUID is in the engine defaults', () => {
    const names = json('src/lib/data/liquids.json').map((l: any) => l.name);
    for (const f of FICTION_LIQUIDS) expect(names, `${f} is a built-in default`).not.toContain(f);
    expect(names.length).toBeGreaterThan(15);
  });

  it('no fictional ENGINE or FUEL is in the default pack', () => {
    const engines = json(`${PACK}/engine-definitions.json`).entries.map((e: any) => e.id);
    const fuels = json(`${PACK}/fuel-definitions.json`).entries.map((f: any) => f.id);
    expect(engines).not.toContain('engine-astrophage-spin');
    expect(fuels).not.toContain('fuel-astrophage');
    expect(engines.length).toBeGreaterThan(5);
    expect(fuels.length).toBeGreaterThan(5);
  });

  it('THE WHOLE DEFAULT PACK does not mention them anywhere, under any key', () => {
    // The three tests above name the places we know about. This one catches the place we do not:
    // a distribution weight, a climate model term, a description. It is the general form of the
    // fault, and the specific tests stay because they say WHERE when this goes red.
    for (const file of ['atmospheres.json', 'engine-definitions.json', 'fuel-definitions.json', 'planets.json', 'classification.json']) {
      const raw = readFileSync(`${PACK}/${file}`, 'utf8');
      for (const f of [...FICTION, ...FICTION_LIQUIDS]) {
        expect(raw.includes(f), `${file} mentions ${f}`).toBe(false);
      }
    }
  });
});

describe('D25 - the fiction rides on the map that uses it', () => {
  it('the SCIENCE-FICTION map carries every definition its own worlds need', () => {
    const o = json(SCIFI_MAP).rulePackOverrides;
    expect(o, 'the SciFi map has no rulePackOverrides at all').toBeTruthy();
    for (const f of FICTION) expect(Object.keys(o.gasPhysics)).toContain(f);
    for (const f of FICTION_LIQUIDS) expect(Object.keys(o.liquids.entries)).toContain(f);
    expect(o.engineDefinitions.map((e: any) => e.id)).toContain('engine-astrophage-spin');
    expect(o.fuelDefinitions.map((f: any) => f.id)).toContain('fuel-astrophage');
  });

  it('and its liquids are a DELTA, so the other twenty-two are not frozen with them', () => {
    const o = json(SCIFI_MAP).rulePackOverrides;
    // A whole-list override would silently drop every liquid the map does not name, or - shipped
    // complete - would pin all of them against later improvements (rulepackDelta.ts cost #2).
    expect(Array.isArray(o.liquids)).toBe(false);
    expect(Object.keys(o.liquids.entries).length).toBe(FICTION_LIQUIDS.length);
  });

  it('its worlds still USE them, which is what the definitions are for', () => {
    // Adrian's air. If this goes red the move dropped something the map depends on, and
    // cloudDecks.spec.ts proves the merged pack still derives his two decks.
    expect(readFileSync(SCIFI_MAP, 'utf8')).toContain('Astrophage');
  });
});

describe('D25 - the REAL map is clean', () => {
  it('the real Local Neighbourhood carries no overrides and names no fiction', () => {
    const raw = readFileSync(REAL_MAP, 'utf8');
    expect(json(REAL_MAP).rulePackOverrides).toBeUndefined();
    for (const f of [...FICTION, ...FICTION_LIQUIDS]) expect(raw.includes(f), `real map mentions ${f}`).toBe(false);
  });
});
