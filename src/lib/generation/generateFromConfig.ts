// Config-driven generation (Phase A) — the entry the new wizard calls. Unlike the legacy random
// generateSystem(), this accepts EXPLICIT star seeds (picked on the HR diagram, or from a preset), a
// chosen AGE (which evolves the stars — a 12 Gyr G-star is a red giant; a 13 Gyr one a white dwarf),
// and an "empty" flag (create the star(s) only, leaving the GM to add planets via §4c).
import type { CelestialBody, Barycenter, RulePack, System, Tag } from '$lib/types';
import { SeededRNG } from '../rng';
import { bodyFactory } from '../core/BodyFactory';
import { systemProcessor } from '../core/SystemProcessor';
import { generatePlanets } from './planet-generation';
import { ageStar, determineSpectralClass, type StarSeed, type StarPhase } from '../physics/stellar-evolution';
import { G, AU_KM } from '../constants';

// Physical "starting condition" knobs, each 0..1 (0.5 = neutral). Presets are just saved knob sets.
export interface GenerationKnobs {
  metallicity?: number;       // low → ice/gas worlds; high → rocky/iron/carbon worlds
  diskMass?: number;          // sparse → few worlds; massive → many
  dynamicalHistory?: number;  // calm → near-circular; violent → eccentric, migrated
  weirdness?: number;         // mundane → exotic (reserved — type-draw biasing is a follow-up)
}
export interface GenerationConfig {
  seeds?: StarSeed[];          // explicit stars (HR / preset); omit for legacy random
  ageGyr?: number;             // system age — evolves the stars + drives planet physics
  emptyPlanets?: boolean;      // create the star(s) only (GM adds planets via §4c)
  name?: string;
  knobs?: GenerationKnobs;
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
      if (dyn > 0.7 && rng.nextFloat() < (dyn - 0.7) * 0.6) b.orbit.isRetrogradeOrbit = true;
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

// Assemble star bodies into a single star or a binary (barycentre + two stars). 3+ are placed with
// the two most massive as the central binary; extra wide companions are a follow-up (logged).
function setupStarsFromSeeds(seeds: StarSeed[], pack: RulePack, ageGyr: number | undefined, baseName: string) {
  const evolved = seeds.map((s) => (ageGyr ? ageStar(s, ageGyr * 1e9) : s) as StarSeed);
  evolved.sort((a, b) => b.massKg - a.massKg); // most massive first
  const nodes: (CelestialBody | Barycenter)[] = [];

  if (evolved.length === 1) {
    const star = starSeedToBody(evolved[0], pack, `${baseName}-star-a`, null);
    star.name = baseName;
    nodes.push(star);
    return { nodes, systemRoot: star, systemName: star.name, isBinary: false, starA: star, starB: undefined };
  }

  // Binary (use the two most massive; 3+ extras dropped for now).
  if (evolved.length > 2) console.warn(`setupStarsFromSeeds: ${evolved.length} stars — using the 2 most massive as a binary (N>2 hierarchy is a follow-up).`);
  const baryId = `${baseName}-barycenter-0`;
  const starA = starSeedToBody(evolved[0], pack, `${baseName}-star-a`, baryId);
  const starB = starSeedToBody(evolved[1], pack, `${baseName}-star-b`, baryId);
  starA.name = `${baseName} A`; starB.name = `${baseName} B`;
  const m1 = starA.massKg || 0, m2 = starB.massKg || 0, totalMass = m1 + m2;
  // Separation: a few AU scaled by the combined mass (wider for heavier pairs).
  const sepAU = 2 + Math.cbrt(totalMass / 2e30) * 8;
  const n = Math.sqrt((G * totalMass) / Math.pow(sepAU * AU_KM * 1000, 3));
  starA.orbit = { hostId: baryId, hostMu: G * totalMass, t0: Date.now(), n_rad_per_s: n,
    elements: { a_AU: sepAU * (m2 / totalMass), e: 0, i_deg: 0, omega_deg: 0, Omega_deg: 0, M0_rad: 0 } };
  starB.orbit = { hostId: baryId, hostMu: G * totalMass, t0: Date.now(), n_rad_per_s: n,
    elements: { a_AU: sepAU * (m1 / totalMass), e: 0, i_deg: 0, omega_deg: 0, Omega_deg: 0, M0_rad: Math.PI } };
  const bary: Barycenter = { id: baryId, parentId: null, name: `${baseName} Barycentre`, kind: 'barycenter',
    memberIds: [starA.id, starB.id], effectiveMassKg: totalMass, tags: [] };
  nodes.push(bary, starA, starB);
  return { nodes, systemRoot: bary, systemName: `${baseName} System`, isBinary: true, starA, starB };
}

export function generateSystemFromConfig(seed: string, pack: RulePack, config: GenerationConfig): System {
  const rng = new SeededRNG(seed);
  const baseName = config.name || `System ${seed.slice(-5)}`;
  if (!config.seeds || config.seeds.length === 0) {
    throw new Error('generateSystemFromConfig requires at least one star seed (use generateSystem for fully random).');
  }
  const { nodes, systemRoot, systemName, isBinary, starA, starB } = setupStarsFromSeeds(config.seeds, pack, config.ageGyr, baseName);

  // Planets — unless the GM chose stars-only. Disk-mass knob scales the count.
  const diskMass = config.knobs?.diskMass ?? 0.5;
  const countMultiplier = 0.4 + diskMass * 1.6; // 0.4× (sparse) → 2× (massive)
  generatePlanets(systemRoot, nodes, pack, rng, systemName, isBinary, starA, starB as any, !!config.emptyPlanets, { countMultiplier });

  // Metallicity + dynamical-history knobs reshape makeup + orbits before the processor re-derives.
  if (config.knobs && !config.emptyPlanets) applyKnobBias(nodes, rng, config.knobs);

  const system: System = {
    id: seed, name: systemName, seed, epochT0: Date.now(),
    age_Gyr: config.ageGyr ?? 4.6, nodes, rulePackId: pack.id, rulePackVersion: pack.version,
    tags: [], toytownFactor: 0, visualScalingMultiplier: 0.5, isManuallyEdited: false
  };
  return systemProcessor.process(system, pack);
}
