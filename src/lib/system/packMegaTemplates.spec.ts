// THE BUNDLED MEGA TEMPLATES MUST BE COHERENT WITH THE MACHINERY THAT READS THEM (G53 phase 1).
// Same idea as packSmallBodyPlausibility.spec.ts one file up: this is a check on the PACK, because
// data nothing validates is data that rots — three impossible small-body templates shipped exactly
// that way. Steer-do-not-stop is not at stake: these are OUR OWN shipped templates, not a GM's map.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { megaTypeDef } from '$lib/constructs/megaTypes';
import { CONSTRUCT_ICON_SHAPES } from '$lib/constructs/constructIcon';

const pack = JSON.parse(readFileSync('static/rulepacks/starter-sf/construct_templates.json', 'utf8'));
const mega: any[] = pack.mega ?? [];

const KNOWN_HARD = new Set(['hostKind', 'hasSurface', 'hostIsStar', 'needsGeostationary']);
const KNOWN_STEER = new Set(['geoBelowHillFraction', 'inHabitableZone', 'maxPlacementAU', 'minHostMassKg', 'maxHostMassKg']);

describe('bundled mega templates', () => {
  it('the category exists and carries the seven designed types', () => {
    expect(mega.map((t) => t.megaType).sort()).toEqual([
      'death-star', 'dyson-sphere', 'dyson-swarm', 'energy-collector',
      'planetary-torus', 'ringworld', 'space-elevator'
    ]);
  });

  it('every template names a registry record, is artificial, and does NOT propagate the B109 roleHint fault', () => {
    for (const t of mega) {
      expect(megaTypeDef(t.megaType), `${t.name}: unknown megaType`).toBeDefined();
      expect(t.artificial, `${t.name}: a shipped megastructure is BUILT`).toBe(true);
      expect(t.kind, t.name).toBe('construct'); // phase 1: no hybrid yet, deliberately
      // The small_body templates author roleHints outside the declared union (inbox B109 / §3.4
      // item 9). The mega category must not add to that pile.
      expect(t.roleHint, t.name).toBe('construct');
      expect((CONSTRUCT_ICON_SHAPES as string[]).includes(t.icon_type), `${t.name} icon_type`).toBe(true);
    }
  });

  it('every requires clause is in the implemented vocabulary, and inHabitableZone is never hard', () => {
    for (const t of mega) {
      expect(t.requires, `${t.name} must carry its placement rules as data`).toBeDefined();
      for (const k of Object.keys(t.requires.hard ?? {})) expect(KNOWN_HARD.has(k), `${t.name} hard.${k}`).toBe(true);
      for (const k of Object.keys(t.requires.steer ?? {})) expect(KNOWN_STEER.has(k), `${t.name} steer.${k}`).toBe(true);
      expect(t.requires.hard?.inHabitableZone, `${t.name}: the goldilocks zone is a recommendation, never a wall`).toBeUndefined();
    }
  });

  it('every explain interpolates the host, so a greyed row can name what refused it', () => {
    for (const t of mega) {
      expect(typeof t.explain, t.name).toBe('string');
      expect(t.explain, t.name).toContain('{host}');
    }
  });

  it('authored mass and dimensions stay self-consistent where the physics will one day read them', () => {
    // Not the small-body density gate — an artificial structure may be almost hollow — but a shape
    // check: positive mass, three positive dimensions, and the Death Star (the one spheroid that
    // will really orbit things in phase 5) below osmium and above vacuum.
    for (const t of mega) {
      const p = t.physical_parameters;
      expect(p.massKg, t.name).toBeGreaterThan(0);
      expect(p.dimensionsM, t.name).toHaveLength(3);
      for (const d of p.dimensionsM) expect(d, t.name).toBeGreaterThan(0);
    }
    const ds = mega.find((t) => t.megaType === 'death-star')!;
    const [a, b, c] = ds.physical_parameters.dimensionsM.map((d: number) => d / 2);
    const gcc = ds.physical_parameters.massKg / ((4 / 3) * Math.PI * a * b * c) / 1000;
    expect(gcc).toBeGreaterThan(0.01);
    expect(gcc).toBeLessThan(22.6);
  });
});
