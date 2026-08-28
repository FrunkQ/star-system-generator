// THE MEGA-CONSTRUCT REGISTRY — one record per type, and the ONLY place any of them is described.
// (G53 phase 1, docs/dev/mega-constructs-design.md §5b.)
//
// THE PATTERN IS G37'S OVERRIDE ROSTER (`src/lib/physics/overrides.ts`), copied deliberately — its
// header argues the case: one record per quantity replaced four scattered implementations that each
// had their own seed, clamp, reset and wording. Same here: a mega type is a RECORD; adding a
// Shkadov thruster is a new record, not a new branch. The params are `OverrideDef`-shaped on
// purpose, so the existing override row, badge, two-tier warning (amber = no known mechanism,
// red = breaks conservation) and Newton-trace rendering already know how to display them.
//
// `derive()` AND `shape()` ARE PURE AND RETURN DATA — THREE.js appears at one edge (phase 3's
// builder) and nowhere else. The reason is E7, measured 2026-08-08: a canvas cannot be verified by
// a worker session at all (the pane runs `document.hidden`, rAF never fires), so maths inside
// geometry construction can never be gated. Maths in a pure function is an ordinary headless test:
// a ringworld's area, a tether's required strength, a shell's coverage are just numbers, asserted
// like any other. This is the load-bearing decision in the whole feature (§5b.3).
//
// NO LUMINOSITY IS COMPUTED HERE, DELIBERATELY (inbox B110): a star's output already has two
// independent R²T⁴ sites and this module must not become the third. Power figures are therefore
// FRACTIONS OF THE HOST STAR'S OUTPUT (`powerHarvestedLstarFrac`); the multiply into watts waits
// for B110's single luminosity function (a phase-4 prerequisite, not part of this feature).
//
// PLACEMENT PREDICATES (`requires`) ARE SPLIT BY CLAUSE KIND (§3.5), the owner's own correction:
// `hard` is RELEVANCE — the option has no referent without it (a space elevator with no surface to
// anchor to is not implausible, it is meaningless) — so it greys, and that is final. `steer` is
// PLAUSIBILITY — the placement is meaningful and the numbers are bad — so it tags and explains and
// NEVER refuses; this is where alien tech, unobtanium and PlotDevice live. `inHabitableZone` is a
// steer clause and must never be hard: a ring at 3 AU is legitimate and cold, and the engine owes
// it a temperature rather than a refusal. The records below carry the DEFAULTS; a rule-pack
// template may state its own `requires`, and the pack wins (constants are data).
//
// PHASE 1 SCOPE: nothing reads `shape()` yet (every type still renders as today's ellipsoid), no
// occlusion feeds any physics, and `kind` stays 'construct'. Docking (`dockNodes`, §7) joins the
// record in phase 5 with the transit-planner work, not before.
import type { CelestialBody, MegaRequires } from '$lib/types';
import { G, AU_KM, EARTH_GRAVITY, EARTH_RADIUS_KM } from '$lib/constants';
import type { ConstructIconShape } from './constructIcon';

// ── The placement vocabulary, as DATA (§4.2) ─────────────────────────────────────────────────────
// The clause interfaces live in `$lib/types` because they are PACK DATA (templates author them);
// re-exported here so registry consumers have one import. The vocabulary is complete for the seven
// shipped types and deliberately no wider: `clearOrbitBand` (undefined semantics), `minTechLevel`
// (open question 5 — nothing carries a tech level) and `minHostLuminosityLsun` (blocked by B110)
// are all NAMED in the design and NOT implemented; an evaluator meeting an unknown clause must
// pass it with a warning rather than grey on a rule it cannot state (steer-do-not-stop, applied to
// pack authors).
export type { MegaRequires, MegaHardClauses, MegaSteerClauses } from '$lib/types';

// ── The record ───────────────────────────────────────────────────────────────────────────────────

/** §5b.4: six render paths collapsed to THREE families and one new generator. `sphere-section` is
 *  the parametric unfinished sphere (faces or points) covering shell, ringworld, orbital ring and
 *  swarm; `tether` is a line; `spheroid` is today's `attachHullVolume` ellipsoid. */
export type MegaShapeFamily = 'sphere-section' | 'tether' | 'spheroid';

/** A tunable on a mega type. OverrideDef-shaped (G37) so the existing override row, badge and
 *  two-tier warning render it: `plausible` is the amber band (no known mechanism, breaks no law),
 *  `possible` the red one (breaks conservation or the quantity's own definition). Neither is ever
 *  a refusal — bands produce SENTENCES, not clamps. */
export interface MegaParamDef {
  key: string;
  label: string;
  /** Appended to the number everywhere it is shown. Empty for a dimensionless fraction. */
  unit: string;
  /** One line under the row: what this knob actually does. */
  hint: string;
  /** Slider travel — the range a GM normally wants. */
  soft: readonly [number, number];
  /** How far a TYPED number may go. Absurd on purpose; nothing clamps below this. */
  hard: readonly [number, number];
  step: number;
  decimals: number;
  /** Log-scaled slider — for quantities spanning decades. */
  log?: boolean;
  /** The default for this host — the value a fresh instance starts at. Seeds are chosen to COHERE:
   *  at all-default params the derived numbers make sense together (e.g. a ring's default rotation
   *  gives about Earth gravity at its default radius — a human-default on the OUTPUT side, swapped
   *  by moving the knob, never baked into a derivation). */
  seed(host: CelestialBody): number;
  /** The band this knob plausibly occupies. Outside it the row warns (amber). */
  plausible(host: CelestialBody): readonly [number, number] | null;
  /** What being outside that band MEANS — the second half of the amber sentence. */
  absurd: string;
  /** THE HARDER BAND: outside it the figure breaks conservation or its own definition (red). */
  possible?(host: CelestialBody): readonly [number, number] | null;
  /** What being outside the POSSIBLE band means. Give it whenever `possible` is given. */
  breaks?: string;
}

export type MegaParams = Record<string, number>;

/** What `derive()` publishes. Every field names WHAT it measures and IN WHAT UNITS (the A33/B27
 *  rule: a correct quantity can still be published as a lie). All optional — each type fills the
 *  rows that mean something for it and no derivation prints a number that has no meaning (§3.4
 *  item 1). */
export interface MegaDerived {
  /** Spin gravity ω²r at the named ring/band radius, m/s². The same quantity as a body's surface
   *  g and belongs on the same card in the same units (§6 — do not invent a second display). */
  spinGravityMs2?: number;
  /** Living/collecting area, km². For a band: circumference × width; for a shell: coverage × 4πr². */
  areaKm2?: number;
  /** The same area in Earth surface areas — the headline number that makes a megastructure land. */
  areaEarths?: number;
  /** Share of the host star's output intercepted, 0..1. DATA ONLY in phase 1 — nothing feeds the
   *  insolation chain until phase 4 (after B110 unifies the luminosity sites). */
  starOcclusion?: number;
  /** Power harvested as a FRACTION of the host star's bolometric output (occlusion × efficiency).
   *  Dimensionless on purpose — the watts multiply waits for B110's one luminosity function. */
  powerHarvestedLstarFrac?: number;
  /** Geostationary altitude above the host surface, km — the elevator's top anchor. `null` when
   *  the host has no real geostationary (tidally locked, no rotation data, or fallback figure). */
  geoAltitudeKm?: number | null;
  /** Specific strength the tether material must reach for taper e, in GPa·cm³/g (= MJ/kg / 1e6·…):
   *  the potential difference surface→geo. Steel is ~2, carbon nanotube ~50 (§6's sentence). */
  tetherSpecificStrengthGPa?: number;
  /** Taper ratio exp(ΔV/σ) at the chosen material strength — how much fatter the ribbon is at geo
   *  than at the ground. */
  taperRatio?: number;
  /** Surface gravity G·m/r² of a spheroid mega at its own authored/param mass and size, m/s². */
  surfaceGravityMs2?: number;
  /** Bulk density of a spheroid mega, g/cc — the honesty check (denser than osmium is amber). */
  bulkDensityGcc?: number;
  /** A rigid ring around a mass has no restoring force against lateral displacement (the classic
   *  result) and needs active station-keeping forever. A tag-and-explain fact, never a refusal. */
  ringUnstable?: true;
}

/** `shape()`'s output: a geometry SPEC, still no THREE (§5b.3). The one generator is the
 *  parametric sphere section (§5b.4): latitude and longitude extents are arguments, `drawnAs`
 *  switches faces (shell, ring) to points (swarm — apexes only; the builder must use a Fibonacci
 *  distribution for points, §5b.4's pole-clustering trap). */
export type MegaShapeSpec =
  | {
      family: 'sphere-section';
      radiusKm: number;
      /** Polar angle where the band starts, radians from the +pole (SphereGeometry convention). */
      thetaStartRad: number;
      thetaLengthRad: number;
      phiStartRad: number;
      phiLengthRad: number;
      drawnAs: 'faces' | 'points';
      /** Points path only: the density knob, 0..1 — one number drives apex count, occlusion AND
       *  harvested power (§5b.4). The builder maps it to a count; the mapping is its data. */
      pointDensityFrac?: number;
    }
  | {
      family: 'tether';
      /** Surface to top anchor, km. `null` when the host has no real geostationary — there is no
       *  tether to draw, and the spec says so rather than inventing a length. */
      topAltitudeKm: number | null;
    }
  | { family: 'spheroid'; dimensionsM: readonly [number, number, number] };

export interface MegaTypeDef {
  key: string;
  label: string;
  family: MegaShapeFamily;
  /** One line: what this thing IS. */
  hint: string;
  /** 2D chrome, from the ONE glyph vocabulary (constructIcon.ts, A34) — never a private shape. */
  icon: ConstructIconShape;
  /** Placement, as DATA (§3.5): `hard` clauses grey it, `steer` clauses tag and explain. These are
   *  the DEFAULTS; a pack template's own `requires` wins. */
  requires: MegaRequires;
  /** The GM-facing sentence shown when the hard clauses grey this type, `{host}` interpolated. */
  explain: string;
  /** The per-TEMPLATE half of the placement axis (§2.2): which of the picker's host-derived
   *  placement options make sense for this type at all. Absent = all of them. */
  allowedPlacements?: readonly string[];
  /** Display only: the spheroid PREVIEW draws a concave dish. Data on the record rather than a
   *  key-switch in the preview module, for the same reason everything else is. */
  dished?: true;
  /** The knobs. Each OverrideDef-shaped — see `MegaParamDef`. */
  params: readonly MegaParamDef[];
  /** PURE. params + host → the NUMBERS. No THREE, no DOM, no globals, no mutation of `host`. */
  derive(params: MegaParams, host: CelestialBody): MegaDerived;
  /** PURE. params + host → a geometry SPEC. Still no THREE. */
  shape(params: MegaParams, host: CelestialBody): MegaShapeSpec;
}

// ── Shared derivations (one copy each — the duplication rule) ────────────────────────────────────

/** Earth's surface area, km² — the divisor behind `areaEarths`. */
const EARTH_AREA_KM2 = 4 * Math.PI * EARTH_RADIUS_KM * EARTH_RADIUS_KM;

/** The host's real geostationary altitude, km above the surface, or null. ONE SOURCE: the
 *  processor-stamped `orbitalBoundaries` (SystemProcessor pass 4). Recomputing it here from mass
 *  and rotation would be a second answer to one question — exactly the fault §3.2 records at
 *  `SystemProcessor.ts:602`. A fallback figure is NOT a geostationary: `isGeoFallback` means the
 *  boundary logic substituted something, and an elevator hung from a substitute is fiction wearing
 *  a measurement's clothes. */
function realGeoAltitudeKm(host: CelestialBody): number | null {
  const b = host.orbitalBoundaries;
  if (!b || !b.geoStationaryKm || b.isGeoFallback) return null;
  return b.geoStationaryKm;
}

/** Potential difference surface→geo for a uniform-stress tether, in GPa·cm³/g (≡ MJ/kg): the
 *  specific strength a material needs for taper ratio e. ΔV = (μ/R − μ/r_geo) − ω²(r_geo² − R²)/2.
 *  Anchor: Earth ≈ 48.5 — the owner's "about 50 GPa·cm³/g; steel is 2, nanotube around 50". */
function tetherSpecificStrengthGPa(host: CelestialBody, geoAltKm: number): number | undefined {
  const massKg = host.massKg ?? 0;
  const radiusM = (host.radiusKm ?? 0) * 1000;
  const periodS = (host as { calculatedRotationPeriod_s?: number }).calculatedRotationPeriod_s
    ?? (host.rotation_period_hours ? host.rotation_period_hours * 3600 : 0);
  if (!(massKg > 0) || !(radiusM > 0) || !(periodS > 0)) return undefined;
  const mu = G * massKg;
  const rGeoM = radiusM + geoAltKm * 1000;
  const omega = (2 * Math.PI) / periodS;
  const deltaV = (mu / radiusM - mu / rGeoM) - (omega * omega * (rGeoM * rGeoM - radiusM * radiusM)) / 2; // J/kg
  return deltaV / 1e6; // 1 GPa·cm³/g = 1 MJ/kg
}

/** ω²r for a ring spun at `periodHours` with radius `radiusKm`, m/s². */
function spinGravityMs2(radiusKm: number, periodHours: number): number | undefined {
  if (!(periodHours > 0) || !(radiusKm > 0)) return undefined;
  const omega = (2 * Math.PI) / (periodHours * 3600);
  return omega * omega * radiusKm * 1000;
}

/** The rotation period, hours, that gives about Earth gravity at `radiusKm` — a SEED, i.e. a
 *  human-comfort DEFAULT on the output side (§6: "comfortable for humans" is a default you can
 *  swap, not the model). T = 2π√(r/g). */
function earthGravityPeriodHours(radiusKm: number): number {
  return (2 * Math.PI * Math.sqrt((radiusKm * 1000) / EARTH_GRAVITY)) / 3600;
}

/** A latitude band `widthKm` wide on a sphere of `radiusKm`, as a sphere-section spec centred on
 *  the equator. A 1 AU ring 1,000 km wide subtends ~4e-6 rad — the difference from a true
 *  cylinder ribbon is far below a pixel at any zoom (§5b.4). */
function equatorialBand(radiusKm: number, widthKm: number): Extract<MegaShapeSpec, { family: 'sphere-section' }> {
  const thetaLengthRad = Math.min(Math.PI, widthKm / radiusKm);
  return {
    family: 'sphere-section',
    radiusKm,
    thetaStartRad: Math.PI / 2 - thetaLengthRad / 2,
    thetaLengthRad,
    phiStartRad: 0,
    phiLengthRad: 2 * Math.PI,
    drawnAs: 'faces'
  };
}

const ORBIT_BAND_PLACEMENTS = ['Low Orbit', 'Mid Orbit', 'High Orbit', 'Geostationary Orbit'] as const;

// ── THE ROSTER ───────────────────────────────────────────────────────────────────────────────────
export const MEGA_TYPE_DEFS: readonly MegaTypeDef[] = [
  {
    key: 'space-elevator',
    label: 'Space Elevator',
    family: 'tether',
    hint: 'A ribbon from the surface to a counterweight above geostationary — surface to orbit at almost no delta-v.',
    icon: 'cross',
    requires: {
      hard: { hostKind: ['planet', 'moon'], hasSurface: true, needsGeostationary: true },
      steer: { geoBelowHillFraction: 0.5 }
    },
    explain: 'A space elevator hangs from a geostationary orbit above a surface. {host} has no real geostationary altitude to hang it from.',
    allowedPlacements: ['Surface'],
    params: [
      {
        key: 'materialStrengthGPa',
        label: 'Tether material strength',
        unit: 'GPa·cm³/g',
        hint: 'Specific strength of the ribbon material. Steel is about 2, carbon nanotube around 50 — what this world NEEDS is derived beside it.',
        soft: [1, 100], hard: [0.01, 100000], step: 1, decimals: 1, log: true,
        seed: () => 50,
        plausible: () => [0.5, 60],
        absurd: 'no bulk material yet made reaches this specific strength — unobtanium, and worth saying so.'
      }
    ],
    derive(params, host) {
      const out: MegaDerived = {};
      const geo = realGeoAltitudeKm(host);
      out.geoAltitudeKm = geo;
      if (geo != null) {
        const need = tetherSpecificStrengthGPa(host, geo);
        if (need !== undefined) {
          out.tetherSpecificStrengthGPa = need;
          const sigma = params.materialStrengthGPa;
          if (sigma > 0) out.taperRatio = Math.exp(need / sigma);
        }
      }
      return out;
    },
    shape(_params, host) {
      return { family: 'tether', topAltitudeKm: realGeoAltitudeKm(host) };
    }
  },
  {
    key: 'planetary-torus',
    label: 'Planetary Torus / Orbital Ring',
    family: 'sphere-section',
    hint: 'A rigid ring circling a world — spun for gravity, carrying ports and, one day, tethers down.',
    icon: 'circle',
    requires: {
      hard: { hostKind: ['planet', 'moon'] } // gas giants allowed — the ring circles, it does not land (§8)
    },
    explain: 'An orbital ring circles a planet or moon. {host} is not one.',
    allowedPlacements: ORBIT_BAND_PLACEMENTS,
    params: [
      {
        key: 'ringRadiusKm',
        label: 'Ring radius',
        unit: 'km',
        hint: 'From the host\'s centre to the ring. The spin-gravity and area figures follow it.',
        soft: [1000, 1e6], hard: [1, 1e9], step: 100, decimals: 0, log: true,
        seed: (host) => Math.max(1000, 2 * (host.radiusKm ?? 500)),
        plausible: (host) => {
          const r = host.radiusKm ?? 0;
          return r > 0 ? [1.02 * r, 100 * r] : null;
        },
        absurd: 'inside the host\'s own radius the ring is underground; far beyond its gravity well it is not that world\'s ring at all.'
      },
      {
        key: 'widthKm',
        label: 'Ring width',
        unit: 'km',
        hint: 'The habitable/working ribbon along the spin axis.',
        soft: [1, 10000], hard: [0.001, 1e6], step: 1, decimals: 0, log: true,
        seed: () => 100,
        plausible: () => [0.1, 50000],
        absurd: 'a ribbon this wide is a shell wearing a ring\'s name.'
      },
      {
        key: 'rotationPeriodHours',
        label: 'Rotation period',
        unit: 'h',
        hint: 'How fast the ring spins. The default gives about Earth gravity at the default radius — a comfort choice, not physics; move it.',
        soft: [0.01, 100], hard: [0.0001, 100000], step: 0.01, decimals: 2, log: true,
        seed: (host) => earthGravityPeriodHours(Math.max(1000, 2 * (host.radiusKm ?? 500))),
        plausible: () => [0.001, 10000],
        absurd: 'spun this hard the floor is a centrifuge, not a place; this slow it is a bridge, not gravity.'
      }
    ],
    derive(params) {
      const out: MegaDerived = { ringUnstable: true };
      const g = spinGravityMs2(params.ringRadiusKm, params.rotationPeriodHours);
      if (g !== undefined) out.spinGravityMs2 = g;
      if (params.ringRadiusKm > 0 && params.widthKm > 0) {
        out.areaKm2 = 2 * Math.PI * params.ringRadiusKm * params.widthKm;
        out.areaEarths = out.areaKm2 / EARTH_AREA_KM2;
      }
      return out;
    },
    shape(params) {
      return equatorialBand(params.ringRadiusKm, params.widthKm);
    }
  },
  {
    key: 'ringworld',
    label: 'Ringworld',
    family: 'sphere-section',
    hint: 'A band circling a star, spun for gravity — an inside-out world whose floor is built and whose climate is real.',
    icon: 'circle',
    requires: {
      hard: { hostIsStar: true },
      steer: { inHabitableZone: true }
    },
    explain: 'A ringworld circles a star. {host} is not a star.',
    allowedPlacements: ['AU Distance'],
    params: [
      {
        key: 'radiusAU',
        label: 'Ring radius',
        unit: 'AU',
        hint: 'Distance from the star. The inner surface takes the REAL temperature at this distance — the goldilocks zone is a recommendation, never a wall.',
        soft: [0.1, 10], hard: [0.001, 1000], step: 0.01, decimals: 2, log: true,
        seed: () => 1,
        plausible: () => [0.1, 50],
        absurd: 'this close the band is inside the star\'s own weather; this far the ring circles darkness.'
      },
      {
        key: 'widthKm',
        label: 'Band width',
        unit: 'km',
        hint: 'The living ribbon. Niven\'s is about 1.6 million km — the default, and the source of the three-million-Earths headline.',
        soft: [1000, 5e6], hard: [1, 1e8], step: 1000, decimals: 0, log: true,
        seed: () => 1.6e6,
        plausible: () => [100, 1e7],
        absurd: 'narrower than this it is a wire; wider, a sphere section wearing a ring\'s name.'
      },
      {
        key: 'rotationPeriodHours',
        label: 'Rotation period',
        unit: 'h',
        hint: 'The spin that makes the floor a floor. The default gives about Earth gravity at 1 AU — a comfort choice; aliens may want otherwise.',
        soft: [10, 2000], hard: [0.01, 1e6], step: 1, decimals: 1, log: true,
        seed: () => earthGravityPeriodHours(AU_KM),
        plausible: () => [1, 100000],
        absurd: 'the spin no longer resembles gravity anyone could live under.'
      }
    ],
    derive(params) {
      const out: MegaDerived = { ringUnstable: true };
      const radiusKm = params.radiusAU * AU_KM;
      const g = spinGravityMs2(radiusKm, params.rotationPeriodHours);
      if (g !== undefined) out.spinGravityMs2 = g;
      if (radiusKm > 0 && params.widthKm > 0) {
        out.areaKm2 = 2 * Math.PI * radiusKm * params.widthKm;
        out.areaEarths = out.areaKm2 / EARTH_AREA_KM2;
      }
      return out;
    },
    shape(params) {
      return equatorialBand(params.radiusAU * AU_KM, params.widthKm);
    }
  },
  {
    key: 'dyson-sphere',
    label: 'Dyson Sphere',
    family: 'sphere-section',
    hint: 'A shell closing around a star. Coverage grows to 100% — and the sky dims as it does.',
    icon: 'circle',
    requires: {
      hard: { hostIsStar: true }
    },
    explain: 'A Dyson sphere closes around a star. {host} is not a star.',
    allowedPlacements: ['AU Distance'],
    params: [
      {
        key: 'radiusAU',
        label: 'Shell radius',
        unit: 'AU',
        hint: 'How far out the shell stands.',
        soft: [0.1, 10], hard: [0.001, 1000], step: 0.01, decimals: 2, log: true,
        seed: () => 1,
        plausible: () => [0.05, 100],
        absurd: 'this close the shell is inside the star\'s atmosphere; this far it encloses mostly nothing.'
      },
      {
        key: 'coveragePct',
        label: 'Shell coverage',
        unit: '%',
        hint: 'How much of the sphere is closed — watch it grow. Drives the intercepted starlight one-for-one.',
        soft: [0, 100], hard: [0, 100], step: 1, decimals: 0,
        seed: () => 100,
        plausible: () => [0, 100],
        absurd: 'coverage is a fraction of a sphere; there is no more sphere than all of it.',
        possible: () => [0, 100],
        breaks: 'more than the whole sphere, or less than none of it, is not a coverage.'
      }
    ],
    derive(params) {
      const out: MegaDerived = {};
      const frac = params.coveragePct / 100;
      out.starOcclusion = frac;
      const radiusKm = params.radiusAU * AU_KM;
      if (radiusKm > 0) {
        out.areaKm2 = frac * 4 * Math.PI * radiusKm * radiusKm;
        out.areaEarths = out.areaKm2 / EARTH_AREA_KM2;
      }
      return out;
    },
    shape(params) {
      // Growth eats longitude (§5b.4's table: "partial, growing to full"), so a half-built shell
      // is a deepening orange-peel strip rather than a thinning veil.
      return {
        family: 'sphere-section',
        radiusKm: params.radiusAU * AU_KM,
        thetaStartRad: 0,
        thetaLengthRad: Math.PI,
        phiStartRad: 0,
        phiLengthRad: 2 * Math.PI * (params.coveragePct / 100),
        drawnAs: 'faces'
      };
    }
  },
  {
    key: 'dyson-swarm',
    label: 'Dyson Swarm',
    family: 'sphere-section',
    hint: 'Independent collectors sharing an orbit shell — the buildable sibling of the sphere. One object, shaded appropriately.',
    icon: 'diamond',
    requires: {
      hard: { hostIsStar: true }
    },
    explain: 'A Dyson swarm orbits a star. {host} is not a star.',
    allowedPlacements: ['AU Distance'],
    params: [
      {
        key: 'radiusAU',
        label: 'Swarm radius',
        unit: 'AU',
        hint: 'The shell of orbits the collectors share.',
        soft: [0.1, 10], hard: [0.001, 1000], step: 0.01, decimals: 2, log: true,
        seed: () => 1,
        plausible: () => [0.05, 100],
        absurd: 'this close the collectors are in the corona; this far they harvest starlight that barely arrives.'
      },
      {
        key: 'densityFrac',
        label: 'Swarm density',
        unit: '',
        hint: 'How much of the sky the swarm fills, 0 to 1. One number drives the drawn collectors, the dimming AND the harvest (§5b.4).',
        soft: [0, 1], hard: [0, 1], step: 0.01, decimals: 2,
        seed: () => 0.3,
        plausible: () => [0, 1],
        absurd: 'a swarm cannot fill more than the whole sky.',
        possible: () => [0, 1],
        breaks: 'intercepting more light than the star emits, or a negative amount of it, is not interception.'
      },
      {
        key: 'efficiencyFrac',
        label: 'Collector efficiency',
        unit: '',
        hint: 'Fraction of intercepted light converted to useful power.',
        soft: [0, 1], hard: [0, 1], step: 0.01, decimals: 2,
        seed: () => 0.25,
        plausible: () => [0.05, 0.6],
        absurd: 'no known collector converts this fraction of raw starlight to useful power.',
        possible: () => [0, 1],
        breaks: 'converting more energy than arrives breaks conservation — the red case the two-tier warning exists for.'
      }
    ],
    derive(params) {
      return {
        starOcclusion: params.densityFrac,
        powerHarvestedLstarFrac: params.densityFrac * params.efficiencyFrac
      };
    },
    shape(params) {
      return {
        family: 'sphere-section',
        radiusKm: params.radiusAU * AU_KM,
        thetaStartRad: 0,
        thetaLengthRad: Math.PI,
        phiStartRad: 0,
        phiLengthRad: 2 * Math.PI,
        drawnAs: 'points',
        pointDensityFrac: params.densityFrac
      };
    }
  },
  {
    key: 'energy-collector',
    label: 'Massive Energy Collector',
    family: 'sphere-section',
    hint: 'A collector array close to a star — a Dyson swarm that stopped early, on purpose.',
    icon: 'diamond',
    requires: {
      hard: { hostIsStar: true },
      steer: { maxPlacementAU: 5 }
    },
    explain: 'An energy collector harvests a star. {host} is not a star.',
    allowedPlacements: ['AU Distance'],
    params: [
      {
        key: 'radiusAU',
        label: 'Array radius',
        unit: 'AU',
        hint: 'How close to the star the array sits — closer is brighter.',
        soft: [0.05, 5], hard: [0.001, 100], step: 0.01, decimals: 2, log: true,
        seed: () => 0.5,
        plausible: () => [0.02, 10],
        absurd: 'this close the array is being smelted; this far it is a gesture.'
      },
      {
        key: 'densityFrac',
        label: 'Array density',
        unit: '',
        hint: 'How much of the sky the array fills, 0 to 1.',
        soft: [0, 0.5], hard: [0, 1], step: 0.01, decimals: 2,
        seed: () => 0.05,
        plausible: () => [0, 0.5],
        absurd: 'past half the sky this is a Dyson swarm and deserves the name.',
        possible: () => [0, 1],
        breaks: 'filling more than the whole sky is not a density.'
      },
      {
        key: 'efficiencyFrac',
        label: 'Collector efficiency',
        unit: '',
        hint: 'Fraction of intercepted light converted to useful power.',
        soft: [0, 1], hard: [0, 1], step: 0.01, decimals: 2,
        seed: () => 0.25,
        plausible: () => [0.05, 0.6],
        absurd: 'no known collector converts this fraction of raw starlight to useful power.',
        possible: () => [0, 1],
        breaks: 'converting more energy than arrives breaks conservation.'
      }
    ],
    derive(params) {
      return {
        starOcclusion: params.densityFrac,
        powerHarvestedLstarFrac: params.densityFrac * params.efficiencyFrac
      };
    },
    shape(params) {
      return {
        family: 'sphere-section',
        radiusKm: params.radiusAU * AU_KM,
        thetaStartRad: 0,
        thetaLengthRad: Math.PI,
        phiStartRad: 0,
        phiLengthRad: 2 * Math.PI,
        drawnAs: 'points',
        pointDensityFrac: params.densityFrac
      };
    }
  },
  {
    key: 'death-star',
    label: 'Death Star',
    family: 'spheroid',
    hint: 'A mobile battle station the size of a moon — mass enough that, one day, ships will orbit it.',
    icon: 'circle',
    requires: {
      // "Anywhere" (§8) means any real mass to orbit: a construct or belt host has no gravity to
      // hold it, which is relevance, not plausibility (the §3.2 propagation cliff).
      hard: { hostKind: ['planet', 'moon', 'star', 'barycenter'] }
    },
    explain: 'A battle station orbits a real mass. {host} has no gravity to hold an orbit.',
    // Every orbital placement, never the surface — the owner: "You cant put a death star on a
    // planet. That simple."
    allowedPlacements: [...ORBIT_BAND_PLACEMENTS, 'AU Distance', 'L1', 'L2', 'L3', 'L4', 'L5'],
    dished: true,
    params: [
      {
        key: 'diameterKm',
        label: 'Station diameter',
        unit: 'km',
        hint: 'The canonical battle station is about 160 km across.',
        soft: [1, 2000], hard: [0.1, 20000], step: 1, decimals: 0, log: true,
        seed: () => 160,
        plausible: () => [1, 5000],
        absurd: 'past this size the station is a dwarf planet with opinions.'
      },
      {
        key: 'massKg',
        label: 'Station mass',
        unit: 'kg',
        hint: 'What the station weighs — and, from phase 5, what ships will feel.',
        soft: [1e12, 1e22], hard: [1, 1e30], step: 1e12, decimals: 0, log: true,
        seed: () => 1e18,
        plausible: () => [1e10, 1e24],
        absurd: 'lighter than this it is a shell of vacuum; heavier, a captured moon wearing armour.'
      }
    ],
    derive(params) {
      const out: MegaDerived = {};
      const rM = (params.diameterKm * 1000) / 2;
      if (rM > 0 && params.massKg > 0) {
        out.surfaceGravityMs2 = (G * params.massKg) / (rM * rM);
        const volM3 = (4 / 3) * Math.PI * rM * rM * rM;
        out.bulkDensityGcc = params.massKg / volM3 / 1000;
      }
      return out;
    },
    shape(params) {
      const dM = params.diameterKm * 1000;
      return { family: 'spheroid', dimensionsM: [dM, dM, dM] };
    }
  }
];

const BY_KEY = new Map(MEGA_TYPE_DEFS.map((d) => [d.key, d]));

/** The registry record for a `megaType` key, or undefined — a pack may name a type this build does
 *  not know, and an unknown key degrades to an ordinary construct rather than erroring. */
export function megaTypeDef(key: string | undefined | null): MegaTypeDef | undefined {
  return key ? BY_KEY.get(key) : undefined;
}

/** All-default params for this host — the values a fresh instance starts at. */
export function defaultMegaParams(def: MegaTypeDef, host: CelestialBody): MegaParams {
  const out: MegaParams = {};
  for (const p of def.params) out[p.key] = p.seed(host);
  return out;
}
