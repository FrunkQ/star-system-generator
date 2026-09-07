// THE ONE EVALUATOR of a mega-construct's placement predicate (G53 §4.2). The picker greys and
// prints what this returns; nothing else in the UI knows the rules — no switch in a modal, ever.
//
// TWO CLAUSE KINDS, TWO FUNCTIONS, AND THEY MUST NOT BE MERGED (§3.5, the owner's correction):
//   megaHardCheck   — RELEVANCE. Greys the option, final. "i cant have a space elevator as an
//                     option in deep space... You cant put a death star on a planet. That simple."
//   megaSteerNotes  — PLAUSIBILITY. Tags and explains, NEVER refuses. Its return type cannot say
//                     no: it is a list of notes, each a tag plus a sentence with the numbers in it.
//                     Alien tech, unobtanium and PlotDevice are valid answers to every one of them.
//
// A clause this build does not know PASSES with a warning — greying on a rule we cannot state
// would be refusing for a reason nobody can read, which is the wrong half of steer-do-not-stop.
// And `inHabitableZone` found in `hard` (a hand-written pack) is DEMOTED to steer, not honoured:
// the goldilocks zone is a recommendation (the owner's word), and no pack file may turn it into
// a wall.
//
// PURE ON PURPOSE (E7, same as derive/shape): everything here is host + context in, data out, so
// the greying logic and every sentence are ordinary headless tests. The caller supplies the
// goldilocks band (zones.ts needs allNodes; this module must not reach into a store).
import type { Barycenter, CelestialBody, MegaRequires, MegaHardClauses, MegaSteerClauses, Tag } from '$lib/types';

/** A mega host may be a barycentre (a Death Star at a binary's balance point is pack-legal), and
 *  every clause answers honestly for one: no surface, not a star, no boundaries, kind 'barycenter'. */
export type MegaHost = CelestialBody | Barycenter;
import type { MegaTypeDef } from './megaTypes';

export interface MegaHardResult {
  ok: boolean;
  /** GM-facing, host interpolated — present exactly when `ok` is false. */
  reason?: string;
}

export interface MegaSteerNote {
  clause: keyof MegaSteerClauses;
  /** Stamped on the created node. The `mega` namespace is declared `authored` provenance
   *  (tagDefaults.ENGINE_NAMESPACES): written at creation, kept by a re-process — until a later
   *  phase re-derives these each pass, when the namespace flips to `physics` in the same change. */
  tag: Tag;
  /** The explanation, numbers included. Shown beside the placement and kept in the tag's value. */
  sentence: string;
}

export interface MegaPlacementContext {
  /** The chosen distance for a star/barycentre 'AU Distance' placement, when one is chosen. */
  placementAU?: number;
  /** The host star's goldilocks band, AU — supplied by the caller (zones.ts needs allNodes).
   *  This is the HUMAN-baseline band (G19): the note says whose zone it measured. */
  goldilocks?: { inner: number; outer: number } | null;
}

/** Does this host have a surface something can anchor to? One answer for the evaluator and the
 *  picker both — not a gas giant, not a star, not a barycentre or belt. */
export function hostHasSurface(host: MegaHost): boolean {
  if (host.kind !== 'body') return false;
  if (host.roleHint !== 'planet' && host.roleHint !== 'moon') return false;
  return !((host as CelestialBody).classes?.some((c) => c.includes('gas-giant')) ?? false);
}

/** The requires that actually applies: the pack template's own wins (constants are data, and a
 *  pack author may re-rule any type); the registry record is the default beneath it. */
export function effectiveMegaRequires(
  template: Pick<CelestialBody, 'requires'>,
  def: MegaTypeDef | undefined
): MegaRequires {
  return template.requires ?? def?.requires ?? {};
}

const warned = new Set<string>();
function warnOnce(key: string, message: string): void {
  if (warned.has(key)) return;
  warned.add(key);
  console.warn(`[mega-placement] ${message}`);
}

const KNOWN_HARD: ReadonlySet<string> = new Set(['hostKind', 'hasSurface', 'hostIsStar', 'needsGeostationary']);

/** What the host IS, for sentences: 'barycentre' for a barycentre node, else its roleHint. */
function hostKindWord(host: MegaHost): string {
  return host.kind === 'barycenter' ? 'barycentre' : (host as CelestialBody).roleHint;
}

/** A real geostationary altitude, km — never the fallback figure (an elevator hung from a
 *  substitute is fiction wearing a measurement's clothes). Same rule as megaTypes' derive. */
function realGeoKm(host: MegaHost): number | null {
  const b = (host as CelestialBody).orbitalBoundaries;
  if (!b || !b.geoStationaryKm || b.isGeoFallback) return null;
  return b.geoStationaryKm;
}

/**
 * RELEVANCE. Evaluates the `hard` clauses of `requires` against the host. The first failing clause
 * decides the sentence: the template's own `explain` when it has one (with `{host}` interpolated),
 * else a per-clause default a GM can read. `steer` clauses are never consulted here and an
 * `inHabitableZone` smuggled into `hard` is ignored (see megaSteerNotes, which picks it up).
 */
export function megaHardCheck(
  requires: MegaRequires,
  host: MegaHost,
  explain?: string
): MegaHardResult {
  const hard = (requires.hard ?? {}) as MegaHardClauses & Record<string, unknown>;
  const say = (fallback: string): MegaHardResult => ({
    ok: false,
    reason: (explain ?? fallback).replaceAll('{host}', host.name)
  });

  for (const key of Object.keys(hard)) {
    if (KNOWN_HARD.has(key)) continue;
    if (key === 'inHabitableZone') {
      warnOnce(`hz-hard`, `'inHabitableZone' is a STEER clause and never greys (§3.5) — demoted.`);
      continue;
    }
    warnOnce(`hard-${key}`, `unknown hard clause '${key}' — passed, not greyed: greying on a rule this build cannot state would refuse for an unreadable reason.`);
  }

  if (hard.hostKind) {
    const kindWord = host.kind === 'barycenter' ? 'barycenter' : (host as CelestialBody).roleHint;
    if (!hard.hostKind.includes(kindWord)) {
      return say(`This needs a ${listWords(hard.hostKind)} to attach to — {host} is a ${hostKindWord(host)}.`);
    }
  }
  if (hard.hostIsStar && (host as CelestialBody).roleHint !== 'star') {
    return say(`This circles a star, and {host} is a ${hostKindWord(host)} — there is nothing here to circle.`);
  }
  if (hard.hasSurface && !hostHasSurface(host)) {
    return say(`This anchors to a surface, and {host} has none to anchor to.`);
  }
  if (hard.needsGeostationary && realGeoKm(host) === null) {
    return say(`This hangs from a geostationary orbit, and {host} has no real geostationary altitude to hang it from.`);
  }
  return { ok: true };
}

function listWords(kinds: readonly string[]): string {
  const words = kinds.map((k) => (k === 'barycenter' ? 'barycentre' : k));
  if (words.length === 1) return words[0];
  return `${words.slice(0, -1).join(', ')} or ${words[words.length - 1]}`;
}

const fmt = (v: number): string => {
  if (!Number.isFinite(v)) return String(v);
  if (v !== 0 && (Math.abs(v) >= 1e5 || Math.abs(v) < 1e-3)) return v.toExponential(2);
  return String(Number(v.toPrecision(3)));
};

/**
 * PLAUSIBILITY. Evaluates the `steer` clauses — plus any `inHabitableZone` a pack author wrongly
 * promoted to `hard` — and returns notes: a tag and a sentence each, nothing else. It cannot
 * refuse; a clause whose inputs are absent (no placement chosen yet, no goldilocks supplied)
 * simply produces no note, because a warning with no number in it is a mood, not a steer.
 */
export function megaSteerNotes(
  requires: MegaRequires,
  host: MegaHost,
  ctx: MegaPlacementContext = {}
): MegaSteerNote[] {
  const steer = { ...(requires.steer ?? {}) } as MegaSteerClauses;
  if ((requires.hard as Record<string, unknown> | undefined)?.inHabitableZone) {
    steer.inHabitableZone = true; // the demotion: the recommendation survives, the wall does not
  }
  const notes: MegaSteerNote[] = [];
  const note = (clause: keyof MegaSteerClauses, slug: string, sentence: string): void => {
    notes.push({
      clause,
      tag: { key: `mega/${slug}`, value: sentence, source: 'mega-placement' },
      sentence
    });
  };

  if (steer.geoBelowHillFraction !== undefined) {
    const geo = realGeoKm(host);
    const reach = (host as CelestialBody).orbitalBoundaries?.heoUpperBoundaryKm;
    if (geo !== null && reach && reach > 0) {
      const frac = geo / reach;
      if (frac > steer.geoBelowHillFraction) {
        note('geoBelowHillFraction', 'geo-near-hill-edge',
          `Geostationary sits at ${fmt(100 * frac)}% of ${host.name}'s gravitational reach (comfortable below ${fmt(100 * steer.geoBelowHillFraction)}%) — the counterweight rides near the edge of the well, so the tether needs active station-keeping or something stronger holding it taut.`);
      }
    }
  }

  if (steer.inHabitableZone && ctx.placementAU !== undefined && ctx.goldilocks) {
    const { inner, outer } = ctx.goldilocks;
    if (ctx.placementAU < inner || ctx.placementAU > outer) {
      const side = ctx.placementAU < inner ? 'hot side' : 'cold side';
      note('inHabitableZone', 'outside-goldilocks',
        `${fmt(ctx.placementAU)} AU sits outside ${host.name}'s goldilocks zone (${fmt(inner)} to ${fmt(outer)} AU, measured for water-and-sunlight life) on the ${side} — legitimate, and the surface will take the real temperature at that distance. Builders with hotter or colder tastes may want exactly this.`);
    }
  }

  if (steer.maxPlacementAU !== undefined && ctx.placementAU !== undefined && ctx.placementAU > steer.maxPlacementAU) {
    note('maxPlacementAU', 'far-from-star',
      `At ${fmt(ctx.placementAU)} AU the collector is ${fmt((ctx.placementAU / steer.maxPlacementAU) ** 2)}x further into the dark than its design distance (${fmt(steer.maxPlacementAU)} AU) — starlight thins with the square of distance, so it harvests a whisper of what it could closer in.`);
  }

  const massKg = (host.kind === 'barycenter' ? host.effectiveMassKg : (host as CelestialBody).massKg) ?? 0;
  if (steer.minHostMassKg !== undefined && massKg > 0 && massKg < steer.minHostMassKg) {
    note('minHostMassKg', 'host-mass-low',
      `${host.name} masses ${fmt(massKg)} kg, below the ${fmt(steer.minHostMassKg)} kg this structure was imagined for — the anchoring gravity is thin, which is a challenge, not a wall.`);
  }
  if (steer.maxHostMassKg !== undefined && massKg > steer.maxHostMassKg) {
    note('maxHostMassKg', 'host-mass-high',
      `${host.name} masses ${fmt(massKg)} kg, above the ${fmt(steer.maxHostMassKg)} kg this structure was imagined for — the loads grow with the well it sits in, which is a challenge, not a wall.`);
  }

  return notes;
}
