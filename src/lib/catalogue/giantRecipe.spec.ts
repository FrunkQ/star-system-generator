import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import type { CelestialBody, RulePack } from '$lib/types';
import { buildGiantLab } from './galleryExamples';
import { giantRecipe, giantRecipeJson, parseGiantRecipe, recipeToPreset, uniquePresetName } from './giantRecipe';
import { deriveCloudDecks, applyCloudDeckTags, deriveWeather } from '$lib/physics/cloudDecks';
import { deriveApparentColorParts } from '$lib/rendering/apparentColor';

const pack = JSON.parse(readFileSync('static/rulepacks/starter-sf/atmospheres.json', 'utf8')) as unknown as RulePack;

/** Rebuild a world from nothing but the recipe, exactly as a GM pasting it would get. */
function fromRecipe(json: string, pack: RulePack): CelestialBody {
  const r = JSON.parse(json);
  const body = {
    id: 'pasted', roleHint: 'planet', name: 'Pasted',
    makeup: { gas: 0.95, ice: 0.04, rock: 0.01 },
    radiusKm: 60000, massKg: 1.5e27, rotationPeriodHours: 10,
    temperatureK: r.requires.temperatureK, equilibriumTempK: r.requires.equilibriumTempK,
    atmosphere: r.atmosphere, tags: [] as unknown[]
  } as unknown as CelestialBody;
  const decks = deriveCloudDecks(body, pack);
  (body as { tags: unknown[] }).tags = applyCloudDeckTags((body as { tags: unknown[] }).tags, decks, deriveWeather(body, decks, pack));
  return body;
}

describe('G7 — the copied recipe REPRODUCES the giant', () => {
  const rows = buildGiantLab(pack);
  const bodies = rows.flatMap((r) => r.bodies);

  it('has something to test', () => {
    expect(bodies.length).toBeGreaterThan(20);
  });

  // THE ROW'S OWN ACCEPTANCE TEST, and the reason it is a test rather than an eyeball: "the test is
  // whether pasting it into a real world reproduces the giant". If the recipe ever misses an input
  // the colour depends on, this goes red with the world that broke it named.
  it.each(bodies.map((b) => [b.name as string, b] as const))(
    'reproduces %s exactly from its recipe alone',
    (_name, b) => {
      const json = giantRecipeJson(b);
      expect(json).toBeTruthy();
      const rebuilt = fromRecipe(json!, pack);
      const ap = deriveApparentColorParts(rebuilt, pack);
      expect(ap.hex).toBe((b as unknown as { apparentColorHex: string }).apparentColorHex);
    }
  );

  it('carries INPUTS ONLY — never the derived colour or the deck tags', () => {
    // Pasting a derived value back would freeze an answer beside its question: change the pack's
    // condensation constants and the pasted world would keep a colour the engine no longer computes.
    const json = giantRecipeJson(bodies[0])!;
    expect(json).not.toContain('apparentColor');
    expect(json).not.toContain('structure/cloud-deck');
    expect(json).not.toContain('tags');
    // Split in two on purpose: `atmosphere` is what you SET, `requires` is what must be TRUE.
    // Temperature is DERIVED per pass and cannot be pasted, so promising it as a setting would be a lie.
    expect(Object.keys(JSON.parse(json)).sort()).toEqual(['atmosphere', 'requires']);
    expect(Object.keys(JSON.parse(json).requires).sort()).toEqual(['equilibriumTempK', 'temperatureK']);
  });

  it('pastes as clean numbers rather than float noise', () => {
    // H2/He are computed as (1 - trace) shares, so they arrive as 0.8569999999999999 unrounded.
    const json = giantRecipeJson(bodies[0])!;
    expect(json).not.toMatch(/\d\.\d{10,}/);
  });

  it('returns null for a body with no atmosphere, rather than half a recipe', () => {
    expect(giantRecipe({ id: 'x', name: 'x' } as unknown as CelestialBody)).toBeNull();
  });
});

describe('G7 — the recipe travels back IN', () => {
  const rows = buildGiantLab(pack);
  const sample = rows.flatMap((r) => r.bodies)[0];

  it('round trips: copied text parses back to the same recipe', () => {
    const json = giantRecipeJson(sample)!;
    const out = parseGiantRecipe(json);
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    expect(out.recipe.atmosphere.composition).toEqual(JSON.parse(json).atmosphere.composition);
    expect(out.recipe.requires.temperatureK).toBeCloseTo(JSON.parse(json).requires.temperatureK, 6);
  });

  it('gives a REASON when the paste is wrong, because a GM is the only one who sees it', () => {
    expect(parseGiantRecipe('not json')).toMatchObject({ ok: false });
    const r = parseGiantRecipe('{"hello":1}');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/composition/i);
    const bad = parseGiantRecipe('{"atmosphere":{"composition":{"H2":"lots"}}}');
    if (!bad.ok) expect(bad.error).toMatch(/H2/);
  });

  it('mints a preset whose pressure band is ZERO WIDTH, or the midpoint rule would change it', () => {
    // The editor applies a preset by taking the MIDPOINT of pressure_range_bar. A recipe that stated
    // a real range would come back as something the gallery never showed.
    const rec = parseGiantRecipe(giantRecipeJson(sample)!);
    expect(rec.ok).toBe(true);
    if (!rec.ok) return;
    const preset = recipeToPreset(rec.recipe, 'Test giant');
    const band = preset.value.pressure_range_bar as number[];
    expect(band[0]).toBe(band[1]);
    expect((band[0] + band[1]) / 2).toBeCloseTo(rec.recipe.atmosphere.pressure_bar, 9);
    // weight 0: a GM's named look must not start turning up on randomly generated worlds.
    expect(preset.weight).toBe(0);
  });

  it('does not collide when the same recipe is imported twice', () => {
    expect(uniquePresetName('Jovian', [])).toBe('Jovian');
    expect(uniquePresetName('Jovian', ['Jovian'])).toBe('Jovian (2)');
    expect(uniquePresetName('Jovian', ['Jovian', 'Jovian (2)'])).toBe('Jovian (3)');
  });
});

describe('G7 — the mix carries its own NAME', () => {
  const sample = buildGiantLab(pack).flatMap((r) => r.bodies)[0];

  it('carries the label when the gallery supplies one, and omits it otherwise', () => {
    expect(JSON.parse(giantRecipeJson(sample)!).label).toBeUndefined();
    const withLabel = JSON.parse(giantRecipeJson(sample, 'sodium overcast · potassium veil')!);
    expect(withLabel.label).toBe('sodium overcast · potassium veil');
  });

  it('is a LABEL and never an input — it sits beside the recipe, not inside it', () => {
    // It is derived text (the deck list). Keeping it out of `atmosphere` and `requires` is what stops
    // any future derivation reading it back as though it were authored.
    const r = JSON.parse(giantRecipeJson(sample, 'ammonia deck')!);
    expect(Object.keys(r).sort()).toEqual(['atmosphere', 'label', 'requires']);
    expect(r.atmosphere.label).toBeUndefined();
  });

  it('round trips through the parser', () => {
    const out = parseGiantRecipe(giantRecipeJson(sample, 'sodium overcast · potassium veil')!);
    expect(out.ok).toBe(true);
    if (out.ok) expect(out.recipe.label).toBe('sodium overcast · potassium veil');
  });

  it('ignores a blank label rather than naming a preset with whitespace', () => {
    expect(JSON.parse(giantRecipeJson(sample, '   ')!).label).toBeUndefined();
  });
});
