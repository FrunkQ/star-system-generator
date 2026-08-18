import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import type { CelestialBody, RulePack } from '$lib/types';
import { buildGiantLab, giantRecipe, giantRecipeJson } from './galleryExamples';
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
    temperatureK: r.temperatureK, equilibriumTempK: r.equilibriumTempK,
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
    expect(Object.keys(JSON.parse(json)).sort()).toEqual(['atmosphere', 'equilibriumTempK', 'temperatureK']);
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
