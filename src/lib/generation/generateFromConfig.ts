// Config-driven generation (Phase A) — the entry the new wizard calls. Unlike the legacy random
// generateSystem(), this accepts EXPLICIT star seeds (picked on the HR diagram, or from a preset), a
// chosen AGE (which evolves the stars — a 12 Gyr G-star is a red giant; a 13 Gyr one a white dwarf),
// and an "empty" flag (create the star(s) only, leaving the GM to add planets via §4c).
import type { CelestialBody, Barycenter, RulePack, System, Tag } from '$lib/types';
import { SeededRNG } from '../rng';
import { bodyFactory } from '../core/BodyFactory';
import { systemProcessor } from '../core/SystemProcessor';
import { _generatePlanetaryBody } from './planet';
import { generateBodyOfType, viableTypesAt } from './generateBodyOfType';
import { drawTypeForSlot, rarityOf, rarityTier } from './typeDraw';
import { calculateOrbitalSlots } from './placement-strategy';
import { randomFromRange, weightedChoice } from '../utils';
import { calculateEquilibriumTemperature } from '../physics/temperature';
import { makeSystemName, makeWorldName, namesWorlds, planetNameChance, type NamingStrategy } from './naming';
import { ageStar, determineSpectralClass, type StarSeed, type StarPhase } from '../physics/stellar-evolution';
import { G, AU_KM } from '../constants';

// Physical "starting condition" knobs, each 0..1 (0.5 = neutral). Presets are just saved knob sets.
export interface GenerationKnobs {
  metallicity?: number;       // low → ice/gas worlds; high → rocky/iron/carbon worlds
  diskMass?: number;          // sparse → few worlds; massive → many
  dynamicalHistory?: number;  // calm → near-circular; violent → eccentric, migrated
  rarity?: number;         // 0 = common worlds only … 1 = legendary exotica (drives the type-draw)
}
export interface GenerationConfig {
  seeds?: StarSeed[];          // explicit stars (HR / preset); omit for legacy random
  ageGyr?: number;             // system age — evolves the stars + drives planet physics
  emptyPlanets?: boolean;      // create the star(s) only (GM adds planets via §4c)
  name?: string;
  knobs?: GenerationKnobs;
  naming?: NamingStrategy;      // how to name the system/stars/worlds (default 'scientific')
}

// Apply the metallicity + dynamical-history knobs to the freshly-generated bodies (before the
// processor re-derives). Metallicity reshapes interior makeup; dynamical history stirs orbits.
function applyKnobBias(nodes: (CelestialBody | Barycenter)[], rng: SeededRNG, knobs: GenerationKnobs): void {
  const met = knobs.metallicity ?? 0.5;
  const dyn = knobs.dynamicalHistory ?? 0.5;
  for (const n of nodes) {
    if (n.kind !== 'body' || (n.roleHint !== 'planet' && n.roleHint !== 'moon')) continue;
    const b = n as CelestialBody;
    // Metallicity → makeup: high metallicity favours metal+rock, low favours ice+gas. Skip giants.
    if ((met < 0.45 || met > 0.55) && b.makeup) {
      const shift = (met - 0.5) * 0.6; // ±0.3
      const mk: any = { ...b.makeup };
      const heavy = (mk.metal ?? 0) + (mk.rock ?? 0) + (mk.carbon ?? 0);
      const light = (mk.ice ?? 0) + (mk.gas ?? 0);
      if (heavy > 0.05 && light > 0.05) {
        mk.metal = Math.max(0, (mk.metal ?? 0) * (1 + shift));
        mk.rock = Math.max(0, (mk.rock ?? 0) * (1 + shift));
        mk.ice = Math.max(0, (mk.ice ?? 0) * (1 - shift));
        mk.gas = Math.max(0, (mk.gas ?? 0) * (1 - shift));
        b.makeup = mk;
      }
    }
    // Dynamical history → eccentricity (calm 0 → e≈0.02; violent 1 → e up to ~0.4) + retrograde.
    if (b.orbit?.elements) {
      const eMax = 0.02 + dyn * dyn * 0.45;
      b.orbit.elements.e = Math.min(0.6, 0.01 + rng.nextFloat() * eMax);
      // Chaotic systems flip / capture bodies into RETROGRADE orbits — increasingly common with dyn.
      // A retrograde orbit is the signature of a captured body, so tag it origin/captured too.
      if (rng.nextFloat() < dyn * dyn * 0.4) {
        b.orbit.isRetrogradeOrbit = true;
        b.tags = b.tags || [];
        if (!b.tags.some((t) => t.key === 'orbit/retrograde')) b.tags.push({ key: 'orbit/retrograde' });
        if (!b.tags.some((t) => t.key === 'origin/captured')) b.tags.push({ key: 'origin/captured' });
      }
    }
  }
}

// Spectral classes for a (possibly evolved) star seed → the engine's class array.
function classesForPhase(seed: StarSeed, phase: StarPhase | undefined): string[] {
  if (phase === 'white-dwarf') return ['star/WD'];
  if (phase === 'neutron-star') return ['star/NS'];
  if (phase === 'black-hole') return ['star/BH'];
  if (phase === 'giant' || phase === 'subgiant') return ['star/red-giant'];
  const sp = determineSpectralClass(seed.temperatureK);
  return [`star/${sp}`];
}
function categoryForClass(cls: string): CelestialBody['starCategory'] {
  const sp = cls.split('/')[1];
  if (['O', 'B'].includes(sp)) return 'massive_star';
  if (['WD', 'NS', 'BH', 'magnetar'].includes(sp)) return 'star_remnant';
  if (sp === 'M') return 'low_mass_star';
  return 'main_sequence_star';
}

function starSeedToBody(seed: StarSeed, pack: RulePack, id: string, parentId: string | null): CelestialBody {
  const star = bodyFactory.createBody({ name: '', roleHint: 'star', parentId, seed: id, massKg: seed.massKg, radiusKm: seed.radiusKm });
  star.id = id;
  const classes = classesForPhase(seed, (seed as any).phase);
  star.classes = classes;
  star.starCategory = categoryForClass(classes[0]);
  star.temperatureK = seed.temperatureK;
  star.radiationOutput = Math.max(0.0001, seed.luminositySolar); // luminosity drives zones + flux
  const img = pack.classifier?.starImages?.[classes[0]] ?? pack.classifier?.starImages?.[`star/${classes[0].split('/')[1][0]}`];
  star.image = img ? { url: img } : undefined;
  const tags: Tag[] = [];
  if (seed.luminositySolar > 100 && (seed as any).phase === 'main-sequence') tags.push({ key: 'hazard/flaring' });
  star.tags = tags;
  return star;
}

// A leaf star that can host its own little (S-type) system, bounded by its tightest pairing.
interface StarHost { star: CelestialBody; outerAU: number; }
// A barycentre that can host circumbinary (P-type) planets in a stable annulus.
interface BaryHost { bary: Barycenter; innerAU: number; outerAU: number; }

const SOLAR = 1.989e30;
const HIER_STEP = 7;       // each level's separation ≥ ~7× the one below → hierarchical stability
const S_TYPE_FRAC = 0.37;  // a star's planets are stable out to ~0.37× the distance to its companion
const P_TYPE_FRAC = 2.3;   // circumbinary planets are stable beyond ~2.3× the pair separation

// A tight-pair base separation (AU), scaled by combined mass; multiplied by HIER_STEP^level above.
const closeSepAU = (totalMassKg: number) => 0.3 + Math.cbrt(totalMassKg / SOLAR) * 0.9;

// Give a child (star or barycentre) an orbit around its parent barycentre. The processor reconciles
// hostMu / n_rad_per_s / effectiveMass afterwards, so we only need parentId + a_AU + phase.
function orbitAround(child: CelestialBody | Barycenter, parentId: string, parentMassKg: number, aAU: number, M0: number) {
  child.parentId = parentId;
  const aM = aAU * AU_KM * 1000;
  child.orbit = { hostId: parentId, hostMu: G * parentMassKg, t0: Date.now(),
    n_rad_per_s: aM > 0 ? Math.sqrt((G * parentMassKg) / Math.pow(aM, 3)) : 0,
    elements: { a_AU: aAU, e: 0, i_deg: 0, omega_deg: 0, Omega_deg: 0, M0_rad: M0 } };
}

// A PLANNED star hierarchy node (pure — no bodies). Shared by the generator and the wizard preview so
// the preview shows the EXACT structure that will be built. A 'pair' is a binary of two children
// (each a star or a tighter pair) at separation sepAU.
export type StarPlanNode =
  | { kind: 'star'; seed: StarSeed; massKg: number; index: number }
  | { kind: 'pair'; a: StarPlanNode; b: StarPlanNode; sepAU: number; level: number; massKg: number };

// Pair stars into a nested hierarchy. The baseline is sort-by-mass + pair-adjacent, so TIGHT pairs are
// similar-mass "twins" (the real close-binary preference), nesting bottom-up with each level's
// separation widening ~7× (hierarchical stability). On top of that we add controlled SCATTER so it's
// not always perfectly uniform: a mild chance to swap adjacent partners (an unequal-mass pair), and a
// chance to leave a star SINGLE so it pairs at a wider level — giving single-orbited-by-a-binary forms
// ((A·B)·C) and the occasional "missed" star, like real multiples. The randomness is seeded from the
// STAR SET (masses/temps), so it's deterministic — the wizard preview matches the generated system.
// Pairs by FORMATION mass, so a star going remnant doesn't un-pair its binary.
export function planStarHierarchy(seeds: StarSeed[]): StarPlanNode | null {
  if (!seeds.length) return null;
  const rng = new SeededRNG('hier|' + seeds.map((s) => Math.round(s.massKg) + ':' + Math.round(s.temperatureK)).join('|'));
  let comps: StarPlanNode[] = [...seeds]
    .sort((a, b) => b.massKg - a.massKg)
    .map((seed, index) => ({ kind: 'star', seed, massKg: seed.massKg, index } as StarPlanNode));
  let level = 0;
  while (comps.length > 1) {
    // Mild mass-scatter so pairs aren't strictly twins (real binaries have a spread).
    for (let k = 0; k < comps.length - 1; k++) if (rng.nextFloat() < 0.18) { const t = comps[k]; comps[k] = comps[k + 1]; comps[k + 1] = t; }

    const next: StarPlanNode[] = [];
    let i = 0;
    while (i < comps.length) {
      const remaining = comps.length - i;
      // Leave a single (it pairs at a wider level → single + binary forms) when it's the odd one out,
      // or by chance when ≥3 remain — but never strand the whole round (guard below ensures a pair).
      if (remaining === 1 || (remaining >= 3 && rng.nextFloat() < 0.22)) { next.push(comps[i]); i += 1; continue; }
      const a = comps[i], b = comps[i + 1], total = a.massKg + b.massKg;
      next.push({ kind: 'pair', a, b, sepAU: closeSepAU(total) * Math.pow(HIER_STEP, level), level, massKg: total });
      i += 2;
    }
    // Progress guard: if scatter/singling formed no pair, force-pair the two heaviest so we converge.
    if (next.length === comps.length) {
      const a = comps[0], b = comps[1], total = a.massKg + b.massKg;
      next.length = 0;
      next.push({ kind: 'pair', a, b, sepAU: closeSepAU(total) * Math.pow(HIER_STEP, level), level, massKg: total }, ...comps.slice(2));
    }
    next.sort((x, y) => y.massKg - x.massKg);   // heavier components stay inner, singles drift outward
    comps = next; level++;
  }
  return comps[0];
}

// Walk a planned hierarchy into actual star bodies + nested barycentres, collecting the S-type and
// P-type host bounds for the planet placer. (The processor reconciles barycentre dynamics afterwards.)
function setupStarsFromSeeds(seeds: StarSeed[], pack: RulePack, ageGyr: number | undefined, baseName: string) {
  const nodes: (CelestialBody | Barycenter)[] = [];
  const LETTERS = 'ABCDEFGHIJKLMNOP';
  const massOf = (n: CelestialBody | Barycenter) => n.kind === 'barycenter' ? (n.effectiveMassKg || 0) : ((n as CelestialBody).massKg || 0);

  if (seeds.length === 1) {
    const star = starSeedToBody(ageGyr ? ageStar(seeds[0], ageGyr * 1e9) : seeds[0], pack, `${baseName}-star-a`, null);
    star.name = baseName;
    nodes.push(star);
    return { nodes, systemRoot: star, systemName: star.name, isBinary: false, hierarchical: false,
      starA: star, starB: undefined as CelestialBody | undefined, starHosts: [] as StarHost[], baryHosts: [] as BaryHost[] };
  }

  const plan = planStarHierarchy(seeds)!;
  const starHosts: StarHost[] = [];
  const baryHosts: BaryHost[] = [];
  let baryN = 0;

  // Build a plan node; parentSepAU is the separation of the pair this node sits inside (∞ at the root),
  // which sets the node's OUTER stability bound (~0.37× the parent separation).
  const build = (node: StarPlanNode, parentIdForStar: string | null, parentSepAU: number): CelestialBody | Barycenter => {
    if (node.kind === 'star') {
      const body = starSeedToBody(ageGyr ? ageStar(node.seed, ageGyr * 1e9) : node.seed, pack, `${baseName}-star-${node.index}`, parentIdForStar);
      body.name = `${baseName} ${LETTERS[node.index] ?? node.index + 1}`;
      nodes.push(body);
      starHosts.push({ star: body, outerAU: parentSepAU === Infinity ? Infinity : S_TYPE_FRAC * parentSepAU });
      return body;
    }
    const baryId = `${baseName}-bary-${baryN++}`;
    const childA = build(node.a, baryId, node.sepAU);
    const childB = build(node.b, baryId, node.sepAU);
    const mA = massOf(childA), mB = massOf(childB), total = mA + mB;
    orbitAround(childA, baryId, total, node.sepAU * (mB / total), 0);
    orbitAround(childB, baryId, total, node.sepAU * (mA / total), Math.PI);
    const bary: Barycenter = { id: baryId, parentId: null, name: `${baseName} Barycentre ${baryN}`,
      kind: 'barycenter', memberIds: [childA.id, childB.id], effectiveMassKg: total, tags: [] };
    nodes.push(bary);
    baryHosts.push({ bary, innerAU: P_TYPE_FRAC * node.sepAU, outerAU: parentSepAU === Infinity ? Infinity : S_TYPE_FRAC * parentSepAU });
    return bary;
  };

  const root = build(plan, null, Infinity);
  return { nodes, systemRoot: root, systemName: baseName, isBinary: true, hierarchical: true,
    starA: starHosts[0].star, starB: starHosts[1]?.star, starHosts, baryHosts };
}

// Honour star TYPE for planet richness: massive O/B/A stars blow their disks away (few worlds),
// main-sequence F/G/K/M keep rich disks, remnants rarely retain anything. Same tables the single-
// star path uses, so a multi-star system's per-star counts track each star's class.
function planetCountForStar(star: CelestialBody, pack: RulePack, rng: SeededRNG): number {
  const cls = star.classes?.[0]?.split('/')[1] ?? '';
  const sp = cls[0];
  let table;
  if (['O', 'B', 'A'].includes(sp)) table = pack.distributions?.['planet_count_massive'];
  else if (cls === 'red-giant' || ['F', 'G', 'K', 'M'].includes(sp)) table = pack.distributions?.['planet_count_main_sequence'];
  else table = pack.distributions?.['planet_count_remnant'];
  return table ? weightedChoice<number>(rng, table) : rng.nextInt(0, 5);
}

// Lay out up to `maxCount` geometrically-spaced orbital radii inside (innerAU, outerAU).
function geomSlots(innerAU: number, outerAU: number, maxCount: number, rng: SeededRNG): number[] {
  const slots: number[] = [];
  if (!(outerAU > innerAU * 1.3) || maxCount <= 0) return slots;
  let a = innerAU * randomFromRange(rng, 1.15, 1.6);
  while (a < outerAU && slots.length < maxCount) {
    slots.push(a);
    a *= randomFromRange(rng, 1.5, 2.2);
  }
  return slots;
}

const minOrbitFor = (s: CelestialBody) => {
  const roche = (s.radiusKm * 2.44) / AU_KM;
  const soot = ((s.radiusKm / 2) * Math.pow((s.temperatureK || 5000) / 1800, 2)) / AU_KM;
  return Math.max(roche, soot, 0.05) * 1.2;
};

// A slot's equilibrium temperature (for the typed draw) via a probe orbit around the host.
function teqAtSlot(host: CelestialBody | Barycenter, hostMassKg: number, aAU: number, nodes: (CelestialBody | Barycenter)[]): number {
  const probe = { id: '__probe', kind: 'body', roleHint: 'planet', parentId: host.id,
    orbit: { hostId: host.id, hostMu: G * hostMassKg, elements: { a_AU: Math.max(aAU, 1e-6), e: 0, i_deg: 0, omega_deg: 0, Omega_deg: 0, M0_rad: 0 } } } as any;
  return calculateEquilibriumTemperature(probe, nodes, 0.3);
}

// Spawn ONE body at a slot: draw a fine type (physics-viable, then rarity/star-weighted), BUILD it
// to match that type (makeup/atmosphere/hydrosphere → the classifier lands on it), then run it through
// _generatePlanetaryBody so moons/rings/belts still attach. Falls back to the basic broad-type
// generator when no type survives the draw (e.g. rarity 0 with nothing common viable there).
function spawnTypedSlot(opts: {
  host: CelestialBody | Barycenter; hostMassKg: number; aAU: number; name: string; idx: number;
  nodes: (CelestialBody | Barycenter)[]; pack: RulePack; rng: SeededRNG; ageGyr: number;
  rarity: number; starClass: string; role: 'planet' | 'moon';
}) {
  const { host, hostMassKg, aAU, name, idx, nodes, pack, rng, ageGyr, rarity, starClass, role } = opts;
  const teq = teqAtSlot(host, hostMassKg, aAU, nodes);
  const fps = pack.classifier?.fingerprints ?? [];
  const fp = drawTypeForSlot(viableTypesAt(teq, role, fps), rarity, starClass, rng, pack);
  const orbit = { hostId: host.id, hostMu: G * hostMassKg, t0: Date.now(),
    elements: { a_AU: aAU, e: randomFromRange(rng, 0.01, 0.12), i_deg: Math.pow(rng.nextFloat(), 3) * 12,
      omega_deg: 0, Omega_deg: 0, M0_rad: randomFromRange(rng, 0, 2 * Math.PI) } };
  // generateBodyOfType wants a plain () => number RNG; adapt the SeededRNG instance.
  const overrides = fp ? generateBodyOfType(fp, { distAU: aAU, hostMassKg, role, rng: () => rng.nextFloat(), teqK: teq }) : undefined;
  // For a non-giant typed draw, the type's own recipe is authoritative — skip the legacy random
  // atmosphere so rarity isn't bypassed. Giants still need their H2/He envelope from it.
  const isGiantType = fp ? /giant|jupiter|neptune|brown|puff/.test(fp.class) : false;
  const built = _generatePlanetaryBody(rng, pack, host.id.split('-')[0], idx, host, orbit, name, nodes, ageGyr, fp?.class, true, overrides, true, !!fp && !isGiantType);
  nodes.push(...built);
}

// Single star: an orbit-slot system around it, each slot a TYPED draw (rarity/star-weighted).
function placePlanetsSingleTyped(
  star: CelestialBody, nodes: (CelestialBody | Barycenter)[], pack: RulePack, rng: SeededRNG,
  ageGyr: number, countMultiplier: number, rarity: number
) {
  const count = Math.max(0, Math.min(12, Math.round(planetCountForStar(star, pack, rng) * countMultiplier)));
  const starClass = star.classes?.[0] ?? 'star/G';
  calculateOrbitalSlots(star, pack, rng, count).forEach((a, i) =>
    spawnTypedSlot({ host: star, hostMassKg: star.massKg || SOLAR, aAU: a, name: `${star.name} ${String.fromCharCode(98 + i)}`, idx: i, nodes, pack, rng, ageGyr, rarity, starClass, role: 'planet' }));
}

// Multi-star: an S-type typed system around each leaf star (richness set by the star's TYPE), plus
// P-type circumbinary typed planets around each tight barycentre.
function placePlanetsHierarchical(
  starHosts: StarHost[], baryHosts: BaryHost[], nodes: (CelestialBody | Barycenter)[],
  pack: RulePack, rng: SeededRNG, ageGyr: number, countMultiplier: number, rarity: number, systemName: string
) {
  const primaryClass = starHosts[0]?.star.classes?.[0] ?? 'star/G';
  let idx = 0;
  for (const h of starHosts) {
    const inner = minOrbitFor(h.star);
    const outer = Math.min(h.outerAU, 40); // never sprawl past a sane disk extent
    const maxCount = Math.max(0, Math.min(8, Math.round(planetCountForStar(h.star, pack, rng) * countMultiplier)));
    const starClass = h.star.classes?.[0] ?? 'star/G';
    geomSlots(inner, outer, maxCount, rng).forEach((a, n) =>
      spawnTypedSlot({ host: h.star, hostMassKg: h.star.massKg || SOLAR, aAU: a, name: `${h.star.name} ${String.fromCharCode(98 + n)}`, idx: idx++, nodes, pack, rng, ageGyr, rarity, starClass, role: 'planet' }));
  }
  for (const h of baryHosts) {
    if (h.innerAU > 50) continue; // a very wide pair has no close circumbinary disk
    const outer = Math.min(h.outerAU, h.innerAU * 3.5);
    const maxCount = Math.max(0, Math.min(4, Math.round(2 * countMultiplier)));
    geomSlots(h.innerAU, outer, maxCount, rng).forEach((a, n) =>
      spawnTypedSlot({ host: h.bary, hostMassKg: h.bary.effectiveMassKg || SOLAR, aAU: a, name: `${systemName} ${String.fromCharCode(98 + n)}`, idx: idx++, nodes, pack, rng, ageGyr, rarity, starClass: primaryClass, role: 'planet' }));
  }
}

export function generateSystemFromConfig(seed: string, pack: RulePack, config: GenerationConfig): System {
  const rng = new SeededRNG(seed);
  const naming = config.naming ?? 'scientific';
  const baseName = config.name || makeSystemName(naming, rng);
  if (!config.seeds || config.seeds.length === 0) {
    throw new Error('generateSystemFromConfig requires at least one star seed (use generateSystem for fully random).');
  }
  const setup = setupStarsFromSeeds(config.seeds, pack, config.ageGyr, baseName);
  const { nodes, systemRoot, systemName, isBinary, starA, starB, hierarchical, starHosts, baryHosts } = setup;

  // Planets — unless the GM chose stars-only. Disk-mass knob scales the count.
  const diskMass = config.knobs?.diskMass ?? 0.5;
  const countMultiplier = 0.4 + diskMass * 1.6; // 0.4× (sparse) → 2× (massive)
  if (!config.emptyPlanets) {
    // Weirdness drives the TYPE rarity (basic rock → exotic); the other knobs shape standard worlds.
    const rarity = config.knobs?.rarity ?? 0.5;
    const age = config.ageGyr ?? 4.6;
    if (hierarchical) {
      // 2+ stars: a typed S-type system around each star + P-type circumbinary typed planets.
      placePlanetsHierarchical(starHosts, baryHosts, nodes, pack, rng, age, countMultiplier, rarity, systemName);
    } else {
      // Single star: typed slot-based placement.
      placePlanetsSingleTyped(starA, nodes, pack, rng, age, countMultiplier, rarity);
    }
  }

  // Metallicity + dynamical-history knobs reshape makeup + orbits before the processor re-derives.
  if (config.knobs && !config.emptyPlanets) applyKnobBias(nodes, rng, config.knobs);

  const system: System = {
    id: seed, name: systemName, seed, epochT0: Date.now(),
    age_Gyr: config.ageGyr ?? 4.6, nodes, rulePackId: pack.id, rulePackVersion: pack.version,
    tags: [], toytownFactor: 0, visualScalingMultiplier: 0.5, isManuallyEdited: false
  };
  const processed = systemProcessor.process(system, pack);

  // Worlds earn a PROPER name by chance scaled to their rarity (legendary almost always, common rarely)
  // — and a habitable world almost always, since it'd be charted & settled. Some named, some not, which
  // reads more real than naming everything. (Catalogue stays cold — no proper names.) Done AFTER
  // processing, which is what fixes both habitability and the final classified type.
  if (namesWorlds(naming)) {
    const used = new Set<string>();
    for (const n of processed.nodes) {
      const b = n as CelestialBody;
      if (b.kind !== 'body' || b.roleHint !== 'planet') continue;
      const habitable = (b.habitabilityScore ?? 0) >= 40;
      const tier = rarityTier(rarityOf(b.classes?.[0] ?? '', pack)).key;
      if (rng.nextFloat() < planetNameChance(tier, habitable)) b.name = makeWorldName(rng, used);
    }
  }
  return processed;
}
