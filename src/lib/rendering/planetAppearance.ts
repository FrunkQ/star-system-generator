// src/lib/rendering/planetAppearance.ts
//
// THE shared planet-appearance model (WS1). One pure function resolves every tag/property-driven
// surface feature a body should show, so the 2D SVG disc (PlanetDisc.svelte), the 2D orrery canvas
// (SystemVisualizer) and the 3D holo (holo/scene.ts) can all draw the SAME features from ONE source
// instead of each re-deriving them (or, in the 3D/orrery case, silently missing them).
//
// This is deliberately RENDERER-AGNOSTIC: it returns feature FLAGS + SCALAR PARAMETERS (strengths,
// counts, colours), never SVG paths or canvas geometry. Each renderer turns these into its own
// primitives (an SVG crater circle, a 3D crater decal, an equirect texture splat) — and, crucially,
// generates any seeded positions itself, so extracting this changes NO existing pixels.
//
// The logic here is lifted verbatim from PlanetDisc.svelte's reactive block; see that file's history
// for the per-feature rationale. Extend HERE (add cratered-asymmetric, cryovolcanism, etc.) and every
// renderer gains it at once.

import type { CelestialBody, ApparentColorStop } from '$lib/types';
import { starColorFromTempK } from './apparentColor';
import { oblatePolarFactor } from './bodyShape';
import { auroraEmitter, auroraEmitters } from '$lib/physics/aurora';
import { rendersAsGiant } from '$lib/physics/makeup';
import { isSmallBodyShape } from '$lib/catalogue/smallBodyShape';

// ── colour helpers (shared; were inline in PlanetDisc) ──────────────────────────────────────────
export function rgbHex(rgb: [number, number, number]): string {
	const c = (v: number) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0');
	return `#${c(rgb[0])}${c(rgb[1])}${c(rgb[2])}`;
}
export function hexToRgb(hex: string): [number, number, number] {
	const h = hex.replace('#', '');
	const n = h.length === 3 ? h.split('').map((c) => c + c).join('') : h;
	return [parseInt(n.slice(0, 2), 16), parseInt(n.slice(2, 4), 16), parseInt(n.slice(4, 6), 16)];
}
/** Blend two hex colours: t=0 → a, t=1 → b. */
export function mixHex(a: string, b: string, t: number): string {
	const [ar, ag, ab] = hexToRgb(a), [br, bg, bb] = hexToRgb(b);
	return rgbHex([ar + (br - ar) * t, ag + (bg - ag) * t, ab + (bb - ab) * t]);
}
/** Lighten (f>0) or darken (f<0) a hex colour by fraction f. */
export function shade(hex: string, f: number): string {
	const [r, g, b] = hexToRgb(hex);
	return f >= 0
		? rgbHex([r + (255 - r) * f, g + (255 - g) * f, b + (255 - b) * f])
		: rgbHex([r * (1 + f), g * (1 + f), b * (1 + f)]);
}
/** Emission colour for a self-luminous brown dwarf by effective temperature (K): cool→deep red,
 *  hot young L-dwarf→amber. Never blue (brown dwarfs are cool). */
export function bdGlowColour(teff: number): string {
	const stops: [number, string][] = [
		[250, '#3a0f06'], [600, '#6e1808'], [1000, '#a3320c'], [1400, '#c85614'],
		[1800, '#e07d22'], [2300, '#f2a03e'], [2800, '#ffbf6e']
	];
	if (teff <= stops[0][0]) return stops[0][1];
	for (let i = 1; i < stops.length; i++) {
		if (teff <= stops[i][0]) {
			const [t0, c0] = stops[i - 1], [t1, c1] = stops[i];
			const f = (teff - t0) / (t1 - t0);
			const a = hexToRgb(c0), b = hexToRgb(c1);
			return rgbHex([a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f, a[2] + (b[2] - a[2]) * f]);
		}
	}
	return stops[stops.length - 1][1];
}

// ── feature parameter shapes ────────────────────────────────────────────────────────────────────
export interface MagmaSpec {
	vents: number; // how many glowing vents to scatter (renderer seeds their positions)
	lava: boolean; // a full lava world (tidal/lava-flows) vs. discrete volcanism/hotspots
}
export interface AuroraSpec {
	strength: number; // 0..1.3
	coreHex: string;  // dominant emitter colour (2D primary / fallback)
	tipHex: string;   // second emitter colour (2D gradient tip)
	brilliant: boolean; // strength >= 0.55 → add a bright tip stroke
	// One per emitting gas, weight-sorted. altitude (0 low fringe / 1 main / 2 high tenuous) stacks the
	// 3D shells in physical order (purple N₂ fringe below the green O band, crimson O crown on top);
	// weight fades the lower-concentration gases — so the colours hint at the composition.
	emitters: { colorHex: string; weight: number; altitude: number }[];
}
export interface AtmGlowSpec {
	strength: number; // 0..1 (log-scaled from pressure)
	colorHex: string;
}
export interface CloudSpec {
	coverage: number;  // 0..1 completeness/opacity of the deck (Venus ≈ opaque, Earth ≈ patchy)
	colorHex: string;  // main (low) deck tint — water = white, a haze takes the atmosphere colour
	colorHex2: string; // high deck tint — nudged toward the dominant gas's colour, for per-world variety
}
export interface SelfLumSpec {
	teff: number;
	colorHex: string;
}
export interface CryoPlumeSpec {
	jets: number; // how many plume jets (clustered near a pole, Enceladus-style)
	reachRadii: number; // how far the jets throw, in body radii — driven by (low) surface gravity
}
export interface ThermalGlowSpec {
	tempK: number;     // the incandescing (hottest) surface temperature
	colorHex: string;  // blackbody-ish glow colour (dull red → orange → yellow-white)
	strength: number;  // 0..1, ramps in above ~1000 K toward molten
}
export interface EyeballSpec {
	substellarK: number;   // day-side (substellar) temperature — temperatureRangeK.max
	antistellarK: number;  // night-side (antistellar) temperature — temperatureRangeK.min
	dayHex: string;        // substellar surface tint (baked-dark, or molten glow colour)
	nightHex: string;      // antistellar surface tint (frost / cold)
	molten: boolean;       // substellar above rock melting → a glowing molten day hemisphere
	kind: 'hot' | 'cold';  // hot eyeball (baked day) vs cold eyeball (a warm eye on a frozen world)
}
export interface CraterSpec {
	density: number;   // 0..1 impact-record density, from SURFACE AGE (young resurfaced → 0, ancient → 1)
	rayed: number;     // count of FRESH bright-ejecta-ray craters punched into an old surface (0..4)
	farSideBias: number;  // 0..1 crater asymmetry on a tidally-locked body: the parent occults impactors, so the ANTI-parent (far) hemisphere takes more hits
}
export interface IceCrackSpec {
	severity: number;  // 0..1 density of the fracture/ridge network (Europa lineae, Charon striae)
	colorHex: string;  // ridge tint (icy blue-white, or organic-stained when tholins present)
}
export interface RiftSpec {
	extent: number;    // 0..1 — a frozen former subsurface ocean expanded and split the crust (Charon canyon)
}
export interface TholinSpec {
	strength: number;      // 0..1 how reddened/darkened (from IRRADIATION DOSE, needs CH4/N2 precursors)
	colorHex: string;      // organic tint: low pressure → dark red, higher → pale yellow-brown
	atmospheric: boolean;  // Titan-style haze (thick CH4/N2 air) vs surface patches (Pluto)
}
export interface FrostSpec {
	coverage: number;  // 0..1 bright volatile-ice cover from retained species
	colorHex: string;  // N2/CO2/water → white-blue; SO2 → sulphur yellow
}
export interface PolarVortexSpec {
	sides: number;     // a polar jet-stream polygon (Saturn's hexagon=6; Jupiter's poles run 5–9)
}

/** Everything about a body's appearance that follows from its data + tags, renderer-agnostic. */
export interface AppearanceModel {
	// classification
	isStar: boolean;
	isBelt: boolean; // belt or ring role
	isToroid: boolean; // spun past break-up
	isSmallBody: boolean; // too small to pull round → irregular
	// base look
	baseColorHex: string;
	oblatePolarFactor: number; // <1 = squashed by fast rotation
	axialTiltDeg: number;
	palette: ApparentColorStop[];
	bandingRaw: number; // fallback banding count (renderer suppresses it when it has a real texture)
	isEarth: boolean;
	// atmosphere / surface state
	atmPressureBar: number;
	tidallyLocked: boolean;
	// surface features (flags + params; renderers seed any positions themselves)
	polarIce: boolean;
	regolith: number;             // 0..1 space-weathering desaturation of an airless silicate surface (Moon/Mercury grey)
	craters: CraterSpec | null;   // rocky impact record (icy worlds fracture instead — see iceCracks)
	iceCracks: IceCrackSpec | null;
	rifts: RiftSpec | null;
	tholin: TholinSpec | null;
	frost: FrostSpec | null;
	thermalGlow: ThermalGlowSpec | null; // incandescent glow of a super-hot surface (uniform)
	eyeball: EyeballSpec | null;         // day/night hemisphere split of a tidally-locked world
	polarVortex: PolarVortexSpec | null; // a gas giant's geometric polar jet (Saturn hexagon)
	magma: MagmaSpec | null;
	cryoPlumes: CryoPlumeSpec | null;
	aurora: AuroraSpec | null;
	atmGlow: AtmGlowSpec | null;
	clouds: CloudSpec | null;
	selfLumGlow: SelfLumSpec | null;
}

const clamp01 = (x: number) => Math.max(0, Math.min(1, x));

const GRAV_CONST = 6.674e-11;
/** Surface gravity (m/s²) from mass + radius; a safe mid value if either is missing. */
function surfaceGravity(body: CelestialBody): number {
	const rM = (body.radiusKm ?? 0) * 1000;
	const m = (body as any).massKg ?? 0;
	return rM > 0 && m > 0 ? (GRAV_CONST * m) / (rM * rM) : 1.5;
}

const isStarRole = (b: CelestialBody) => b.roleHint === 'star';
const isBeltRole = (b: CelestialBody) => b.roleHint === 'belt' || b.roleHint === 'ring';

/**
 * Resolve a body's full appearance model from its data + tags. Pure; no DOM, no canvas — safe in
 * tests and on the server. See planetAppearance for the per-feature reasoning.
 */
export function deriveAppearance(body: CelestialBody): AppearanceModel {
	const isStar = isStarRole(body);
	const isBelt = isBeltRole(body);
	const tagKeys = (body.tags ?? []).map((t) => t.key);
	const has = (k: string) => tagKeys.includes(k);

	const isToroid = !isStar && !isBelt && (body.oblateness ?? 0) >= 0.8;
	const isSmallBody = !isStar && !isBelt && !isToroid && isSmallBodyShape(body);

	const baseColorHex = isStar
		? (body.apparentColorHex ?? rgbHex(starColorFromTempK(body.temperatureK)))
		: (body.apparentColorHex ?? body.apparentColor?.hex ?? '#8a8f99');

	const palette = (body.apparentColor?.palette ?? []) as ApparentColorStop[];
	const bandingRaw = (isStar || isBelt) ? 0 : (body.apparentColor?.banding ?? 0);

	const atmPressureBar =
		(body.atmosphere?.pressure_bar ?? (body.atmosphere as any)?.pressure_atm ?? 0) as number;

	// Polar ice caps (tag-driven).
	const polarIce = !isStar && !isBelt && has('climate/polar-ice');

	// ── Foundation-driven surface weathering (geo-foundations.md consumers) ──────────────────────────
	const solid = !isStar && !isBelt && !rendersAsGiant(body);
	const regime = (body as any).geoActivity?.regime as string | undefined;
	const surfaceAgeGyr = (body as any).geoActivity?.surfaceAgeGyr ?? 0;
	const dose = (body as any).irradiationDose ?? 0;
	const retained: string[] = (body as any).volatiles?.retained ?? [];
	const iceFrac = ((body as any).makeup?.ice ?? 0) as number;
	// An ICY-surfaced world (bulk ice, a cryovolcanic crust, or supervolatile ice) FRACTURES under
	// stress rather than holding impact craters; a ROCKY world keeps the crater record. This split is
	// the "ice cracks, doesn't crater" rule.
	const icyShell = iceFrac > 0.2 || regime === 'cryovolcanic'
		|| retained.includes('nitrogen') || retained.includes('methane')
		|| (retained.includes('water') && iceFrac > 0.1);
	// A world with a STANDING LIQUID SEA (a surface hydrosphere layer) has a liquid surface, not a
	// frozen crust — so it neither craters nor fractures. Only a FROZEN icy shell cracks into lineae.
	const hydro = (body as any).hydrosphere;
	const hasSurfaceLiquid = (hydro?.coverage ?? 0) > 0.05
		&& ((hydro?.layers ?? []).some((l: any) => l?.location === 'surface') || (hydro?.composition && regime !== 'cryovolcanic'));
	const frozenIcySurface = icyShell && !hasSurfaceLiquid;
	const thickAir = atmPressureBar > 0.5; // dense air ablates impactors + erodes craters (Venus/Titan)

	// CRATERS — rocky, exposed surfaces only; density from SURFACE AGE (a young resurfaced world is
	// smooth, an ancient dead one is saturated). Small bodies always carry a heavy record. When no
	// derived surface age is present (a bare tagged body / import / example), fall back to the legacy
	// impact tags so those still crater.
	const tagCratered = has('geology/inactive') || has('science/impact-record');
	const ageDensity = surfaceAgeGyr > 0 ? surfaceAgeGyr / 4.5 : (tagCratered ? 0.7 : 0);
	const craterDensity = solid && !icyShell && !thickAir
		? clamp01(isSmallBody ? Math.max(0.6, ageDensity) : ageDensity)
		: 0;
	// A tidally-locked body keeps one face toward its parent, and the parent's disc OCCULTS a slice of
	// the incoming impactor flux — so the near (sub-parent) hemisphere is shielded and the FAR side takes
	// more hits (the anti-parent hemisphere is the more-cratered one). The asymmetry strength scales with
	// how large the parent looms, proxied by orbital speed (a close, fast moon like Io sees a big parent →
	// strong shielding; a slow distant one barely). v = sqrt(μ/a). Falls back to a fixed moderate bias
	// when a body carries no orbit (gallery examples).
	const orb = (body as any).orbit;
	let vKms = 0;
	if (orb?.hostMu > 0 && orb?.elements?.a_AU > 0) vKms = Math.sqrt(orb.hostMu / (orb.elements.a_AU * 1.495978707e11)) / 1000;
	const farSideBias = (craterDensity > 0.15 && !!(body as any).tidallyLocked)
		? (vKms > 0 ? clamp01(0.25 + vKms / (vKms + 10)) : 0.7) : 0;
	// A few FRESH craters (bright ejecta rays) punched into an otherwise old, airless surface.
	const craters: CraterSpec | null = craterDensity > 0.05
		? { density: craterDensity, rayed: atmPressureBar < 0.02 && craterDensity > 0.4 ? 2 : 0, farSideBias }
		: null;

	// SPACE-WEATHERED REGOLITH — micrometeorite + solar-wind maturation greys an AIRLESS silicate surface
	// toward neutral (the Moon and Mercury are grey, not the tan of fresh rock); maturity tracks the
	// irradiation dose. Gated on true vacuum, so thin-air, OXIDISED Mars keeps its red — its colour is
	// rust, not space weathering.
	const regolith = (solid && !icyShell && atmPressureBar < 0.001)
		? clamp01(Math.min(1, dose) * 0.95) : 0;

	// ICE CRACKS / RIDGES — an icy crust flexed by tidal/freezing stress splits into a lineae network
	// (Europa). Stronger on tidally-worked / cryovolcanic crusts.
	const crackSeverity = solid && frozenIcySurface
		? clamp01(0.45 + (regime === 'cryovolcanic' ? 0.35 : 0) + (has('tidal/hotspots') || has('tidal/volcanism') ? 0.2 : 0))
		: 0;
	const iceCracks: IceCrackSpec | null = crackSeverity > 0
		? { severity: crackSeverity, colorHex: '#dfeaf5' }
		: null;

	// CRUSTAL RIFTS — a former subsurface ocean that has since FROZEN expands (~8%) and splits the crust
	// into extensional canyons (Charon's Serenity Chasma, Tethys' Ithaca Chasma). The signal is a
	// FROZEN icy body: an icy shell that is now geologically dead, NO current subsurface ocean (that
	// one still holds liquid — Europa — so its crust isn't stretched), and mid-sized (big enough to
	// have differentiated an ocean, small enough to have frozen through). A retained-water ice by itself
	// is NOT enough — every icy world has that; without this gate a rift striped every frost world.
	const rKm = body.radiusKm ?? 0;
	const frozenOcean = has('structure/icy-shell') && regime === 'inactive' && !hasSurfaceLiquid
		&& !has('structure/subsurface-ocean') && rKm >= 300 && rKm <= 1600;
	const rifts: RiftSpec | null = solid && frozenOcean ? { extent: 0.5 } : null;

	// THOLINS — irradiated organic ices redden/darken over time. Needs a CH4/N2 PRECURSOR: either
	// retained on the surface (Pluto's dark-red patches) or a thick CH4/N2 atmosphere whose haze rains
	// organics (Titan's orange). Strength from the accumulated IRRADIATION DOSE; colour runs dark-red
	// at low pressure to pale yellow-brown when a thick haze scatters it.
	const atmComp = (body.atmosphere?.composition ?? {}) as Record<string, number>;
	const atmOrganics = ((atmComp.CH4 ?? 0) + (atmComp.N2 ?? 0)) > 0.3 && atmPressureBar > 0.1;
	const surfOrganics = retained.includes('methane') || retained.includes('nitrogen');
	const tholinStrength = solid && (surfOrganics || atmOrganics)
		? clamp01(dose * 2 + (atmOrganics ? 0.3 : 0)) : 0;
	const tholin: TholinSpec | null = tholinStrength > 0.05
		? { strength: tholinStrength, colorHex: atmOrganics ? '#c99a5a' : '#7a3320', atmospheric: atmOrganics }
		: null;

	// FROST — bright volatile ice cover from retained species (N2/CO2/water read white-blue; SO2 sulphur
	// yellow). Space weathering (dose) dulls it, so an ancient irradiated frost is less brilliant.
	const brightIces = retained.filter((s) => s === 'nitrogen' || s === 'carbon-dioxide' || s === 'water');
	const so2 = retained.includes('sulfur-dioxide');
	const frostCoverage = solid
		? clamp01((brightIces.length * 0.25 + (so2 ? 0.35 : 0)) * (1 - 0.5 * clamp01(dose)))
		: 0;
	const frost: FrostSpec | null = frostCoverage > 0.05
		? { coverage: frostCoverage, colorHex: so2 && brightIces.length === 0 ? '#f0e28a' : '#eaf2fb' }
		: null;

	// THERMAL EMISSION + EYEBALL. temperatureRangeK captures the hottest (substellar) and coldest
	// (antistellar) points, so a tidally-locked world's day/night extreme falls straight out. A surface
	// above ~1000 K INCANDESCES (blackbody glow, dull-red→molten yellow-white). A LOCKED world with a big
	// day/night contrast is an EYEBALL: a hot (baked or molten-glowing) substellar hemisphere fading to a
	// frozen antistellar one — or, when the day side merely reaches liquid-water warmth, a COLD eyeball
	// (a temperate eye on an otherwise frozen world).
	const hotK = (body as any).temperatureRangeK?.max ?? body.temperatureK ?? 0;
	const coldK = (body as any).temperatureRangeK?.min ?? hotK;
	const GLOW_ONSET = 1000, GLOW_FULL = 2200, ROCK_MELT = 1200;
	// An EYEBALL needs a permanent substellar face — i.e. locked to the STAR (tag surfaced by the
	// processor, which alone can see the parent chain). A moon locked to its PLANET keeps turning
	// relative to the sun, so its whole surface weathers uniformly — no eyeball.
	// Star-locked = a permanent substellar face → eyeball. Robustly: a body locked AND orbiting a star
	// rather than a planet. roleHint 'moon' orbits a PLANET (locked to it, whole surface still sun-cycles
	// → no eyeball); a planet/dwarf orbits the star. (Prefers the explicit flag/tag when present.)
	const starLocked = (body as any).starTidallyLocked ?? (has('orbit/locked-star')
		|| (!!(body as any).tidallyLocked && (body as any).roleHint !== 'moon'));
	const eyeball: EyeballSpec | null = (solid && starLocked && hotK - coldK > 120)
		? {
			substellarK: hotK, antistellarK: coldK, molten: hotK > ROCK_MELT,
			kind: hotK > 350 ? 'hot' : 'cold',
			dayHex: hotK > GLOW_ONSET ? bdGlowColour(hotK) // molten/incandescent
				: hotK > 350 ? shade(baseColorHex, -0.35)   // baked, dark-dry
				: hotK > 255 ? '#3a6ea5'                    // temperate eye — liquid water
				: shade(baseColorHex, 0.12),
			nightHex: coldK < 180 ? '#c3d0e0' : shade(baseColorHex, -0.45)
		}
		: null;
	// Uniform incandescent glow only when it ISN'T an eyeball (the eyeball confines the glow to the day
	// hemisphere itself).
	const thermalGlow: ThermalGlowSpec | null = (solid && hotK > GLOW_ONSET && !eyeball)
		? { tempK: hotK, colorHex: bdGlowColour(hotK), strength: clamp01((hotK - GLOW_ONSET) / (GLOW_FULL - GLOW_ONSET)) }
		: null;

	// POLAR VORTEX — a gas giant's geometric polar jet stream (Saturn's hexagon). Hard to predict, so
	// it's spawned as a tag at generation; the SIDE COUNT rides as the value (Saturn 6; Jupiter's poles
	// run 5–9). The renderer draws a many-sided polygon ringing the pole.
	const vortexTag = (body.tags ?? []).find((t) => t.key === 'feature/polar-vortex');
	const polarVortex: PolarVortexSpec | null = (!isStar && !isBelt && rendersAsGiant(body) && vortexTag)
		? { sides: Math.max(4, Math.min(9, parseInt(vortexTag.value ?? '6', 10) || 6)) }
		: null;

	// Magma / lava: a full lava world, or discrete tidal volcanism / hotspots.
	const isLava = has('tidal/lava-flows');
	const volc = isLava || has('tidal/volcanism') || has('tidal/hotspots');
	const magma: MagmaSpec | null = (isStar || isBelt || !volc)
		? null
		: { vents: isLava ? 7 : has('tidal/volcanism') ? 5 : 3, lava: isLava };

	// Cryovolcanic plumes (Enceladus/Triton/Europa): icy jets vented through a frozen crust. Gate on the
	// AUTHORITATIVE geoActivity regime — the `activity/cryovolcanism` TAG mis-fires on non-cryo bodies
	// (gas giants, dry moons) because its classifier condition is loose, whereas `regime==='cryovolcanic'`
	// correctly identifies the real icy-plume worlds. Giants can never crust-vent, so exclude them.
	// Plume REACH is driven by (low) surface gravity — a small moon like Enceladus throws its plumes far;
	// a heavier body's stay short. (Forcefulness folds in later per Alex's banked backlog.)
	const cryoRegime = (body as any).geoActivity?.regime === 'cryovolcanic';
	const isCryo = !isStar && !isBelt && !rendersAsGiant(body) && cryoRegime;
	const cryoPlumes: CryoPlumeSpec | null = isCryo
		? { jets: 3, reachRadii: Math.max(0.8, Math.min(6, 0.9 / Math.max(0.05, surfaceGravity(body)))) }
		: null;

	// Auroras (aurora/* tag; strength = its value; colour from the atmosphere's auroral emitter).
	const auroraTag = (body.tags ?? []).find((t) => t.key.startsWith('aurora/'));
	const auroraStr = auroraTag ? Math.max(0, Math.min(1.3, parseFloat(auroraTag.value ?? '0') || 0)) : 0;
	const aurora: AuroraSpec | null = (!isStar && !isBelt && auroraStr > 0)
		? (() => {
				const e = auroraEmitter(body);
				const emitters = auroraEmitters(body).map((m) => ({ colorHex: m.hex, weight: m.weight, altitude: m.altitude }));
				return { strength: auroraStr, coreHex: e.hex, tipHex: e.tip, brilliant: auroraStr >= 0.55, emitters };
			})()
		: null;

	// Atmosphere limb-glow (strength log-scaled from pressure). Colour is the atmosphere/cloud tint, and
	// falls back to the body's OWN apparent colour (for a cloud-veiled world that IS the haze colour —
	// Venus reads yellow) rather than a generic blue.
	const atmColorHex = palette.find((p) => p.role === 'atmosphere')?.hex
		?? palette.find((p) => p.role === 'cloud')?.hex ?? baseColorHex;
	const atmGlow: AtmGlowSpec | null = (!isStar && !isBelt && atmPressureBar > 0.02)
		? {
				strength: Math.max(0, Math.min(1, (Math.log10(Math.max(1e-3, atmPressureBar)) + 2) / 3)),
				colorHex: atmColorHex
			}
		: null;

	// CLOUD DECK — a condensed layer that floats above the surface, rendered as its OWN drifting shell(s)
	// in 3D so it has parallax. A rocky world needs real pressure to hold clouds (none on Mars). A GAS
	// GIANT is all atmosphere: it gets a moderate, gas-coloured swirling deck over its banding to add life
	// (kept partial so the bands still show through). Venus-type thick decks veil the ground.
	const isGiantCloud = rendersAsGiant(body);
	const hasCloudTag = (body.tags ?? []).some((t) => t.key === 'structure/cloud-deck');
	const cloudCoverage = isGiantCloud ? 0.6 : clamp01(0.18 + (Math.log10(Math.max(0.1, atmPressureBar)) + 0.5) * 0.3);
	// Cloud CONDENSATE colour: only WATER condenses white. A hydrocarbon/sulphur haze (Titan's tholin,
	// Venus's sulphuric) or a gas giant takes the atmosphere's OWN colour — so Titan reads orange, Venus
	// yellow, not everything white. An explicit cloud-deck palette colour still wins.
	const atmC = (body.atmosphere?.composition ?? {}) as Record<string, number>;
	const waterClouds = body.hydrosphere?.composition === 'water' || body.hydrosphere?.composition === 'salty-water' || (atmC.H2O ?? 0) > 0.02;
	const cloudColorHex = palette.find((p) => p.role === 'cloud')?.hex
		?? (waterClouds && !isGiantCloud ? '#f4f8fc' : atmColorHex);
	// A second tint for the HIGH layer, nudged toward the most abundant atmospheric gas's colour — so
	// each world's two-layer deck reads a little differently (a hint of the air's composition + variety
	// between planets), rather than every deck being one flat tone.
	const GAS_TINT: Record<string, string> = { CH4: '#d99a5a', CO2: '#e6dca6', SO2: '#e8d24a', N2: '#b6c4e6', NH3: '#d8c48c', H2: '#efe3cc', He: '#efe3cc', O2: '#dfeeff', H2O: '#f4f8fc' };
	let accentHex = '', accW = 0;
	for (const k in GAS_TINT) { const w = atmC[k] ?? 0; if (w > accW) { accW = w; accentHex = GAS_TINT[k]; } }
	const cloudColorHex2 = accentHex ? mixHex(cloudColorHex, accentHex, 0.4) : shade(cloudColorHex, 0.18);
	const clouds: CloudSpec | null = (!isStar && !isBelt && !isSmallBody && (isGiantCloud || hasCloudTag || atmPressureBar > 0.3))
		? { coverage: cloudCoverage, colorHex: cloudColorHex, colorHex2: cloudColorHex2 }
		: null;

	// Self-luminous brown dwarf (thermal/self-luminous, value = effective temperature).
	const selfLumTag = (body.tags ?? []).find((t) => t.key === 'thermal/self-luminous');
	const selfLumGlow: SelfLumSpec | null = (selfLumTag && !isStar && !isBelt)
		? (() => { const teff = Number(selfLumTag.value) || 0; return { teff, colorHex: bdGlowColour(teff) }; })()
		: null;

	return {
		isStar,
		isBelt,
		isToroid,
		isSmallBody,
		baseColorHex,
		oblatePolarFactor: oblatePolarFactor(body.oblateness),
		axialTiltDeg: body.axial_tilt_deg ?? 0,
		palette,
		bandingRaw,
		isEarth: (body.name || '').trim().toLowerCase() === 'earth' && body.roleHint !== 'star',
		atmPressureBar,
		tidallyLocked: !!(body as any).tidallyLocked,
		polarIce,
		regolith,
		craters,
		iceCracks,
		rifts,
		tholin,
		frost,
		thermalGlow,
		eyeball,
		polarVortex,
		magma,
		cryoPlumes,
		aurora,
		atmGlow,
		clouds,
		selfLumGlow
	};
}
