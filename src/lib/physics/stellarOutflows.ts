// WHAT A STAR THROWS OFF — jets and a shed wind, as TAGS from quantities every star already carries.
// (physics->tags->visuals: docs/dev/architecture-physics-tags-visuals.md; inbox G26.)
//
// Two decorations the starmap and the system view draw, and the rule is that neither renderer may
// decide for itself which star gets one. The engine derives it here, publishes it as a tag, and the
// renderers read the tag — so the Tags panel lists the mark, removing the tag removes the mark, and
// the 2D and 3D maps cannot disagree.
//
// NO CLASS BRANCH. A relativistic jet wants a deep well to launch from, an ordered field to
// collimate along, and an energy source to tap (infall, or the magnetosphere's own stored spin/field
// energy). All three are numbers on the body: compactness from mass and radius, the field from
// `magneticField`, the feed from `accretionEddington`. A fed black hole and a neutron star score; a
// quiescent hole (no field, no feed) and a white dwarf (a well a thousand times too shallow) do
// not, and the Sun sits six decades below the gate. Nothing asks "is this an NS".
//
// Reimers' relation for the wind is the same shape of claim: mass loss proportional to L*R/M, from
// the luminosity, radius and mass the body holds. An evolved giant sheds, a dwarf does not; an O
// star's line-driven wind falls out of the same law because it is bright and big for its mass.
import type { Tag } from '$lib/types';
import { C_MS, G, SOLAR_MASS_KG, SOLAR_RADIUS_KM } from '$lib/constants';
import { luminositySolarFromRT } from './luminosity';
import { breakupPeriodHours } from './rotation';
import { meanDensityGcc } from './stellarRotation';

/** The fields the two verdicts read, structurally — `magneticField` and `radiationOutput` are
 *  written by the processor and the importers but are not on the `CelestialBody` interface. */
export interface StarLike {
	massKg?: number;
	radiusKm?: number;
	temperatureK?: number;
	radiationOutput?: number;
	magneticField?: { strengthGauss?: number };
	accretionEddington?: number;
	rotation_period_hours?: number;
	classes?: string[];
}

export const STELLAR_JETS_TAG = 'stellar/jets';
export const STELLAR_SHEDDING_TAG = 'stellar/shedding';

export const JET_BUCKETS = ['moderate', 'strong'] as const;
export type JetBucket = (typeof JET_BUCKETS)[number];
export const SHEDDING_BUCKETS = ['wind', 'shell'] as const;
export type SheddingBucket = (typeof SHEDDING_BUCKETS)[number];

// ── Jets ─────────────────────────────────────────────────────────────────────────────────────────

/** Schwarzschild radius over the body's own radius: 1 at a horizon, ~0.35 for a neutron star, ~2e-4
 *  for a white dwarf, 4e-6 for the Sun. WHAT: how relativistic the surface is. UNITS: none. */
export function compactness(massKg: number | undefined, radiusKm: number | undefined): number {
	if (!(massKg && massKg > 0) || !(radiusKm && radiusKm > 0)) return 0;
	const rs = (2 * G * massKg) / (C_MS * C_MS);   // metres
	return Math.min(1, rs / (radiusKm * 1000));
}

/** The well term: 0 below a hundredth of a horizon, 1 at one. A neutron star lands at ~0.8; a white
 *  dwarf at 0, which is the whole reason a magnetic white dwarf does not jet. */
export function jetWellTerm(compact: number): number {
	if (!(compact > 0)) return 0;
	return Math.max(0, Math.min(1, (Math.log10(compact) + 2) / 2));
}

/** The field term: 0 at a megagauss (the top of a white dwarf), 1 at a teragauss (a pulsar); a
 *  magnetar's 1e15 G clamps at 1. Log-scaled because the range is nine decades. */
export function jetFieldTerm(fieldGauss: number | undefined): number {
	if (!(fieldGauss && fieldGauss > 0)) return 0;
	return Math.max(0, Math.min(1, (Math.log10(fieldGauss) - 6) / 6));
}

/**
 * The feed, as an Eddington fraction 0..1. `accretionEddington` is the stored lever; a hole AUTHORED
 * as feeding (`star/BH_active`) with no fraction stored takes the same 0.5 default `flareActivity`
 * already applies to it, so the two derivations cannot disagree about what "fed, level unstated"
 * means. This is the one place the class is consulted, and only to read a default the class name
 * itself states.
 */
export function accretionFraction(body: { accretionEddington?: number; classes?: string[] } | null | undefined): number {
	if (!body) return 0;
	const e = body.accretionEddington;
	if (typeof e === 'number' && e >= 0) return Math.min(1, e);
	return (body.classes ?? []).some((c) => /BH_active$/.test(String(c))) ? 0.5 : 0;
}

/** Spin as a fraction of breakup, 0 when the body carries no period (remnants usually do not — see
 *  `stellarRotationHours`; absence is a real answer, so it boosts nothing rather than being guessed). */
export function spinFractionOf(massKg: number | undefined, radiusKm: number | undefined, rotationHours: number | undefined): number {
	const T = Math.abs(rotationHours ?? 0);
	if (!(T > 0) || !Number.isFinite(T)) return 0;
	const rho = meanDensityGcc(massKg ?? 0, radiusKm ?? 0);
	if (!(rho > 0)) return 0;
	return Math.max(0, Math.min(1, breakupPeriodHours(rho) / T));
}

/**
 * Jet index 0..1: well * max(feed, field) * (1 + spin/2), clamped.
 *
 * Feed and field are the two POWER sources and either suffices — an X-ray binary jets on infall with
 * a modest disc field, a radio pulsar beams on its magnetosphere with nothing falling in. Spin, when
 * it is known, multiplies up: a millisecond pulsar outshines a slow one. The well gates all of it.
 */
export function jetIndex(p: {
	massKg?: number; radiusKm?: number; fieldGauss?: number; accretion?: number; rotationHours?: number;
}): number {
	const well = jetWellTerm(compactness(p.massKg, p.radiusKm));
	if (well <= 0) return 0;
	const power = Math.max(Math.max(0, Math.min(1, p.accretion ?? 0)), jetFieldTerm(p.fieldGauss));
	const spin = spinFractionOf(p.massKg, p.radiusKm, p.rotationHours);
	return Math.max(0, Math.min(1, well * power * (1 + spin / 2)));
}

/** Presentation buckets. Below `moderate` there is no jet and no tag. */
export const JET_MODERATE_AT = 0.1;
export const JET_STRONG_AT = 0.45;
export function jetBucket(index: number): JetBucket | undefined {
	if (index >= JET_STRONG_AT) return 'strong';
	if (index >= JET_MODERATE_AT) return 'moderate';
	return undefined;
}

/** The jet verdict for a star node, from the fields it carries. */
export function starJetBucket(s: StarLike): JetBucket | undefined {
	return jetBucket(jetIndex({
		massKg: s.massKg, radiusKm: s.radiusKm,
		fieldGauss: s.magneticField?.strengthGauss,
		accretion: accretionFraction(s),
		rotationHours: s.rotation_period_hours
	}));
}

// ── Shedding (Reimers) ───────────────────────────────────────────────────────────────────────────

/** Reimers' constant, eta = 1: Mdot = 4e-13 * L*R/M solar masses per year (L, R, M in solar units).
 *  The classic 1975 value; modern fits put eta at 0.5 for red giants, inside the bucket widths. */
export const REIMERS_COEFF = 4e-13;

/** Reimers mass loss. WHAT: wind mass flux. UNITS: solar masses per year. */
export function reimersMassLossMsunYr(lumSolar: number, radiusSolar: number, massSolar: number): number {
	if (!(lumSolar > 0) || !(radiusSolar > 0) || !(massSolar > 0)) return 0;
	return REIMERS_COEFF * lumSolar * radiusSolar / massSolar;
}

/** Presentation buckets. The Sun sits at 4e-13; a K giant at ~1e-9; a red supergiant at ~1e-6. */
export const SHEDDING_WIND_AT = 1e-9;
export const SHEDDING_SHELL_AT = 1e-7;
export function sheddingBucket(mdotMsunYr: number): SheddingBucket | undefined {
	if (mdotMsunYr >= SHEDDING_SHELL_AT) return 'shell';
	if (mdotMsunYr >= SHEDDING_WIND_AT) return 'wind';
	return undefined;
}

/**
 * The shedding verdict for a star node. Luminosity is `radiationOutput` (which IS solar
 * luminosity; never recomputed when it is present, because a GM may have pinned it); only a node
 * carrying none falls back to Stefan-Boltzmann from its radius and temperature.
 */
export function starSheddingBucket(s: StarLike): SheddingBucket | undefined {
	const L = typeof s.radiationOutput === 'number' && s.radiationOutput > 0
		? s.radiationOutput
		: luminositySolarFromRT(s.radiusKm ?? 0, s.temperatureK ?? 0);
	return sheddingBucket(reimersMassLossMsunYr(L, (s.radiusKm ?? 0) / SOLAR_RADIUS_KM, (s.massKg ?? 0) / SOLAR_MASS_KG));
}

// ── The renderers' readers ───────────────────────────────────────────────────────────────────────
// Both maps read the TAG, never the number: the bucket is the published decision. 0 = none.

export function jetStrength(tags: Tag[] | undefined): 0 | 1 | 2 {
	const t = (tags ?? []).find((x) => x.key === STELLAR_JETS_TAG);
	switch (t?.value as JetBucket | undefined) {
		case 'strong': return 2;
		case 'moderate': return 1;
		default: return 0;
	}
}

export function sheddingStrength(tags: Tag[] | undefined): 0 | 1 | 2 {
	const t = (tags ?? []).find((x) => x.key === STELLAR_SHEDDING_TAG);
	switch (t?.value as SheddingBucket | undefined) {
		case 'shell': return 2;
		case 'wind': return 1;
		default: return 0;
	}
}
