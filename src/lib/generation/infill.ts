// ONE INFILL FOR EVERY IMPORTER — and for generate-after-star-pick, which is infill with no anchors.
//
// Generalised from `import/realsky/fillout.ts fillOutSystem`, which was already the right shape and
// the only one that shared anything with the wizard: seed the wizard's own generator from the star,
// keep every generated world that does not crowd an IMPORTED one, hand out the free letters, tag them
// `origin/generated`, stay deterministic. What it lacked was the four dials (it ran at defaults), an
// age that was not just `system.age_Gyr`, more than one star, and a way to ask for a COUNT — which
// Traveller needs, because a UWP's population digit is a hard number of worlds.
//
// THREE RULES, all the owner's:
//   1. IMPORTED WORLDS ARE TRUTH. An anchor is never moved, re-typed or aged; a generated world that
//      would sit within a few mutual Hill radii of one is dropped, not the anchor. The multiplier is
//      pack data (`generation_parameters.infill_anchor_exclusion_hill_radii`).
//   2. THE IMPORTED STAR IS TRUTH TOO. The generator is fed the star as it is NOW and told not to age
//      it (`starsAreCurrentState`); its own copy of the star is thrown away and the new worlds are
//      re-parented onto the imported one. `ageGyr` still dates the GENERATED worlds — birth windows,
//      escape, cratering — because they are being born into the system's era; the imported worlds
//      are current state and are not aged (design note §3b).
//   3. SAME DIALS EVERYWHERE. The four knobs are the wizard's, with the wizard's meaning, and the
//      panel that shows them is one component. A GM who has learned what "disk mass" does in the
//      wizard has learned what it does here.
import type { System, RulePack, CelestialBody, Barycenter, Tag } from '$lib/types';
import type { StarSeed } from '$lib/physics/stellar-evolution';
import { generateSystemFromConfig, type GenerationKnobs } from './generateFromConfig';
import { formatStellarType } from '$lib/import/realsky/stars.mjs';

export const GENERATED_TAG = 'origin/generated';
const DEFAULT_ANCHOR_EXCLUSION_HILL_RADII = 3.5;
// Determinism: never Date.now() on a generated orbit. ONE epoch, the real-sky importer's — a second
// constant here would be exactly the duplication this file exists to remove.
import { EPOCH } from '$lib/import/realsky/constants.mjs';

type AnyNode = CelestialBody | Barycenter;

export interface InfillOptions {
  knobs?: GenerationKnobs;
  /** System age, Gyr — dates the GENERATED worlds only. Defaults to system.age_Gyr. */
  ageGyr?: number;
  /**
   * A HARD count of primary planets the system should end up with (Traveller's `W`), anchors
   * included. Infill adds up to (target − anchors) and stops. Moons are never counted — a Traveller
   * "home world is a moon" designation is a planet-sized body round a giant and is the caller's to
   * place as an anchor before infilling. Absent = as many as the dials produce.
   */
  targetPlanetCount?: number;
  /** Deterministic seed; defaults to a stable derivation of the system seed. */
  seed?: string;
}

export interface InfillResult {
  addedPlanets: number;
  addedMoons: number;
  droppedNearAnchors: number;
  /** True when the system had no luminous star to seed from — nothing was generated. */
  noStar: boolean;
  /** True when a targetPlanetCount was asked for and the dials could not reach it (the count table + spacing ran out). */
  underTarget?: boolean;
}

function mutualHillAU(a1: number, m1: number, a2: number, m2: number, hostMassKg: number): number {
  return Math.cbrt((m1 + m2) / (3 * hostMassKg)) * ((a1 + a2) / 2);
}

// Continue the planet letter sequence after the ones already taken: imported worlds keep their
// letters; generated ones take the next free ones in order of semi-major axis.
function nextLetters(usedNames: string[], count: number): string[] {
  const used = new Set(usedNames.map((n) => n.trim().split(/\s+/).pop()?.toLowerCase()));
  const out: string[] = [];
  for (let c = 98; out.length < count && c < 123; c++) {
    const letter = String.fromCharCode(c);
    if (!used.has(letter)) out.push(letter);
  }
  return out;
}

const isStar = (n: AnyNode): n is CelestialBody => n.kind === 'body' && (n as CelestialBody).roleHint === 'star';
const isPlanet = (n: AnyNode): n is CelestialBody => n.kind === 'body' && (n as CelestialBody).roleHint === 'planet';

/** A seed describing an imported star AS IT IS NOW. */
function seedFromStar(star: CelestialBody): StarSeed {
  return {
    id: star.id,
    temperatureK: star.temperatureK ?? 5000,
    luminositySolar: star.radiationOutput ?? 0.05,
    massKg: star.massKg ?? 0,
    radiusKm: star.radiusKm ?? 0,
    spectralClass: (star.stellarType ? formatStellarType(star.stellarType) : '')
      || (star.classes ?? []).map((c) => c.split('/')[1]).find((c) => c && c.length > 1) || 'M',
    category: '',
    luminosityClass: star.stellarType?.luminosity ?? 'V',
    isRemnant: (star.classes ?? []).some((c) => /WD|NS|BH|magnetar/.test(c)),
    pos: { x: 0, y: 0, z: 0 },
    vel: { x: 0, y: 0, z: 0 }
  };
}

/**
 * Add plausible worlds to a system around its stars, respecting the ones already there. Mutates
 * `system.nodes` in place. Works for a single star or a hierarchy: each imported star that carries
 * mass and radius becomes a seed, and the generator's own S-type / P-type placement decides where
 * the new worlds go; every generated world is then re-parented onto the imported star it was
 * generated around and checked against that star's anchors.
 */
export function infillSystem(system: System, pack: RulePack, opts: InfillOptions = {}): InfillResult {
  const none: InfillResult = { addedPlanets: 0, addedMoons: 0, droppedNearAnchors: 0, noStar: false };
  const stars = system.nodes.filter(isStar).filter((s) => s.massKg != null && s.radiusKm != null && (s.massKg ?? 0) > 0);
  if (!stars.length) return { ...none, noStar: true };

  const ageGyr = opts.ageGyr ?? system.age_Gyr;
  const exclusion = pack.generation_parameters?.infill_anchor_exclusion_hill_radii ?? DEFAULT_ANCHOR_EXCLUSION_HILL_RADII;

  // Anchors per host: imported planets already round each star.
  const anchorsOf = (hostId: string) => system.nodes.filter(isPlanet).filter((p) => p.parentId === hostId);
  const existingPlanets = system.nodes.filter(isPlanet).length;
  const remaining = typeof opts.targetPlanetCount === 'number' ? Math.max(0, opts.targetPlanetCount - existingPlanets) : Infinity;
  if (remaining === 0) return none;

  const seeds = stars.map(seedFromStar);
  const generated = generateSystemFromConfig(opts.seed ?? `infill-${system.seed}`, pack, {
    seeds, ageGyr, name: system.name, naming: 'scientific', knobs: opts.knobs,
    starsAreCurrentState: true
  });

  // Map each generated star back to the imported star it was seeded from. NOT by position: the
  // generator's hierarchy planner SORTS seeds by mass before numbering them (`planStarHierarchy`), so
  // `-star-N` is the N-th most massive, not the N-th seed. Mass is the key it sorted on and the seed
  // carried it through unchanged (`starsAreCurrentState`), so it is the stable join; nearest-mass
  // pairing tolerates the planner's own tiny mass scatter.
  const genStars = generated.nodes.filter(isStar);
  const genToImported = new Map<string, CelestialBody>();
  const unclaimed = [...stars];
  for (const gs of genStars) {
    let best = -1, bestErr = Infinity;
    unclaimed.forEach((imp, i) => {
      const err = Math.abs((imp.massKg ?? 0) - (gs.massKg ?? 0)) / Math.max(1, imp.massKg ?? 1);
      if (err < bestErr) { bestErr = err; best = i; }
    });
    if (best >= 0) { genToImported.set(gs.id, unclaimed[best]); unclaimed.splice(best, 1); }
  }
  if (!genToImported.size) return none;

  const childrenOf = (id: string) => generated.nodes.filter((n) => n.parentId === id);
  const result: InfillResult = { ...none };
  const kept: { p: CelestialBody; host: CelestialBody }[] = [];

  for (const [genStarId, host] of genToImported) {
    const anchors = anchorsOf(host.id);
    const hostMass = host.massKg ?? 0;
    const genPlanets = generated.nodes.filter(isPlanet).filter((p) => p.parentId === genStarId);
    for (const p of genPlanets) {
      const aGen = p.orbit?.elements.a_AU;
      if (aGen == null) { result.droppedNearAnchors++; continue; }
      const tooClose = anchors.some((anchor) => {
        const aConf = anchor.orbit?.elements.a_AU;
        if (aConf == null) return false;
        const rh = mutualHillAU(aGen, p.massKg ?? 0, aConf, anchor.massKg ?? 0, hostMass);
        return Math.abs(aGen - aConf) < exclusion * rh;
      });
      if (tooClose) { result.droppedNearAnchors++; continue; }
      kept.push({ p, host });
    }
  }

  // Order by distance within each host, hand out free letters, respect the hard count.
  kept.sort((x, y) => (x.p.orbit?.elements.a_AU ?? 0) - (y.p.orbit?.elements.a_AU ?? 0));
  const take = kept.slice(0, Number.isFinite(remaining) ? remaining : kept.length);
  if (Number.isFinite(remaining) && take.length < remaining) result.underTarget = true;

  const markGenerated = (node: AnyNode) => {
    const tags: Tag[] = (node.tags ?? []).filter((t) => t.key !== GENERATED_TAG);
    tags.push({ key: GENERATED_TAG });
    node.tags = tags;
    const body = node as CelestialBody;
    if (body.orbit) body.orbit.t0 = EPOCH;
  };

  // Letters are per host in a multi-star system (each star's worlds are "<Star> b, c ...").
  const lettersByHost = new Map<string, string[]>();
  for (const host of stars) {
    const count = take.filter((k) => k.host.id === host.id).length;
    lettersByHost.set(host.id, nextLetters(anchorsOf(host.id).map((a) => a.name), count));
  }
  const used = new Map<string, number>();

  for (const { p, host } of take) {
    const idx = used.get(host.id) ?? 0; used.set(host.id, idx + 1);
    const letter = lettersByHost.get(host.id)?.[idx];
    p.parentId = host.id;
    if (p.orbit) p.orbit.hostId = host.id;
    // A lone star's worlds are "<System> b, c ..." exactly as the real-sky importer named them; in a
    // multi-star system each star's worlds take the star's own name so "b" is not ambiguous.
    if (letter) p.name = `${stars.length === 1 ? system.name : host.name} ${letter}`;
    markGenerated(p);
    p.description = `A plausible world generated around this star to fill out the system. Not part of the import.${p.description ? '\n\n' + p.description : ''}`;
    system.nodes.push(p);
    result.addedPlanets++;
    for (const child of childrenOf(p.id)) {
      markGenerated(child);
      system.nodes.push(child);
      if ((child as CelestialBody).roleHint === 'moon') result.addedMoons++;
    }
  }
  return result;
}
