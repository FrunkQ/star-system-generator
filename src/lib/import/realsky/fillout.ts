// Real-sky import — fill-out mode (design doc §5).
//
// The confirmed-planet catalogue is a floor, not a census: surveys are blind
// to most small, long-period worlds. Fill-out asks the EXISTING generator to
// complete each imported system, constrained by what is actually known:
//
// - The star is pinned: the generator receives a StarSeed built from the real
//   star's measured mass/radius/temperature/luminosity, so its habitable zone,
//   snow line and planet slots derive from the real star.
// - Confirmed planets are ANCHORS. They are never moved or removed, and any
//   generated planet landing within 3.5 mutual Hill radii of one is dropped
//   (the standard dynamical-packing limit).
// - DETERMINISM IS A FEATURE: the RNG seed is derived from the system's own
//   catalogue slug, so one person's Polaris is everyone's Polaris — a strange
//   world reported by one GM reproduces on every machine. Generated orbits'
//   t0 is pinned to the shared EPOCH for the same reason (the generator
//   stamps Date.now(), which would make phases differ run to run).
// - HONESTY IS TAGGED: every generated body carries `origin/generated`, so a
//   GM (and any future re-import) can always tell a measured world from a
//   plausible one. Confirmed planets carry no such tag.
//
// App-side only (TypeScript, $lib imports) — the plain-node build kit never
// fills out; the bundled REAL map is confirmed-only by policy.

import type { RulePack, System, CelestialBody, Barycenter, Tag } from '$lib/types';
import type { StarSeed } from '$lib/physics/stellar-evolution';
import { generateSystemFromConfig } from '$lib/generation/generateFromConfig';
import { EPOCH } from './constants.mjs';

export const GENERATED_TAG = 'origin/generated';
const MUTUAL_HILL_EXCLUSION = 3.5;

type AnyNode = CelestialBody | Barycenter;

function mutualHillAU(a1: number, m1: number, a2: number, m2: number, starMassKg: number): number {
  return Math.cbrt((m1 + m2) / (3 * starMassKg)) * ((a1 + a2) / 2);
}

// Continue the planet letter sequence after the confirmed ones: confirmed
// worlds keep their catalogue letters (b, c, ...); generated ones take the
// next free letters in order of semi-major axis.
function nextLetters(usedNames: string[], count: number): string[] {
  const used = new Set(usedNames.map((n) => n.trim().split(/\s+/).pop()?.toLowerCase()));
  const out: string[] = [];
  for (let c = 98; out.length < count && c < 123; c++) { // 'b'..'z'
    const letter = String.fromCharCode(c);
    if (!used.has(letter)) out.push(letter);
  }
  return out;
}

export interface FillOutResult {
  addedPlanets: number;
  addedMoons: number;
  droppedNearAnchors: number;
}

// Fill out ONE imported single-star system in place. Returns what happened so
// the UI can report it. Systems whose star the converter skipped, or with a
// structure fill-out does not understand (no star), are left untouched.
export function fillOutSystem(system: System, rulePack: RulePack): FillOutResult {
  const none: FillOutResult = { addedPlanets: 0, addedMoons: 0, droppedNearAnchors: 0 };
  const star = system.nodes.find((n) => n.kind === 'body' && (n as CelestialBody).roleHint === 'star') as CelestialBody | undefined;
  if (!star || star.massKg == null || star.radiusKm == null) return none;

  const anchors = system.nodes.filter(
    (n) => n.kind === 'body' && (n as CelestialBody).roleHint === 'planet'
  ) as CelestialBody[];

  const seedStr = `realsky-fill-${system.seed}`; // deterministic per catalogue slug
  const starSeed: StarSeed = {
    id: star.id,
    temperatureK: star.temperatureK ?? 5000,
    luminositySolar: star.radiationOutput ?? 0.05,
    massKg: star.massKg,
    radiusKm: star.radiusKm,
    spectralClass: (star.classes ?? []).map((c) => c.split('/')[1]).find((c) => c && c.length > 1) ?? 'M',
    category: '',
    luminosityClass: 'V',
    isRemnant: (star.classes ?? []).some((c) => /WD|NS|BH/.test(c)),
    pos: { x: 0, y: 0, z: 0 },
    vel: { x: 0, y: 0, z: 0 }
  };

  const generated = generateSystemFromConfig(seedStr, rulePack, {
    seeds: [starSeed],
    ageGyr: system.age_Gyr,
    name: system.name,
    naming: 'scientific'
  });

  const genStar = generated.nodes.find((n) => n.kind === 'body' && (n as CelestialBody).roleHint === 'star');
  if (!genStar) return none;

  // Generated planets, checked against the anchors; their moons/rings follow
  // their planet's fate.
  const genPlanets = generated.nodes.filter(
    (n) => n.kind === 'body' && (n as CelestialBody).roleHint === 'planet' && n.parentId === genStar.id
  ) as CelestialBody[];
  const childrenOf = (id: string) => generated.nodes.filter((n) => n.parentId === id);

  const result: FillOutResult = { addedPlanets: 0, addedMoons: 0, droppedNearAnchors: 0 };
  const kept: CelestialBody[] = [];
  for (const p of genPlanets) {
    const aGen = p.orbit?.elements.a_AU;
    if (aGen == null) { result.droppedNearAnchors++; continue; }
    const tooClose = anchors.some((anchor) => {
      const aConf = anchor.orbit?.elements.a_AU;
      if (aConf == null) return false;
      const rh = mutualHillAU(aGen, p.massKg ?? 0, aConf, anchor.massKg ?? 0, star.massKg!);
      return Math.abs(aGen - aConf) < MUTUAL_HILL_EXCLUSION * rh;
    });
    if (tooClose) { result.droppedNearAnchors++; continue; }
    kept.push(p);
  }

  // Order by distance and hand out the letters the catalogue has not used.
  kept.sort((a, b) => (a.orbit?.elements.a_AU ?? 0) - (b.orbit?.elements.a_AU ?? 0));
  const letters = nextLetters(anchors.map((a) => a.name), kept.length);

  const markGenerated = (node: AnyNode) => {
    const tags: Tag[] = (node.tags ?? []).filter((t) => t.key !== GENERATED_TAG);
    tags.push({ key: GENERATED_TAG });
    node.tags = tags;
    const body = node as CelestialBody;
    if (body.orbit) body.orbit.t0 = EPOCH; // determinism: never Date.now()
  };

  kept.forEach((p, idx) => {
    p.parentId = star.id;
    if (p.orbit) p.orbit.hostId = star.id;
    if (letters[idx]) p.name = `${system.name} ${letters[idx]}`;
    markGenerated(p);
    p.description = `A plausible world generated around the real star (seeded from the catalogue, so every import agrees). Not a detection: no planet has been confirmed here.${p.description ? '\n\n' + p.description : ''}`;
    system.nodes.push(p);
    result.addedPlanets++;
    for (const child of childrenOf(p.id)) {
      markGenerated(child);
      system.nodes.push(child);
      if ((child as CelestialBody).roleHint === 'moon') result.addedMoons++;
    }
  });

  return result;
}

// Fill out every system of an imported batch (the converter's output). Mutates
// in place; returns per-system results keyed by system id for the UI report.
export function fillOutAll(
  entries: { id: string; system: System }[],
  rulePack: RulePack
): Record<string, FillOutResult> {
  const report: Record<string, FillOutResult> = {};
  for (const entry of entries) report[entry.id] = fillOutSystem(entry.system, rulePack);
  return report;
}
