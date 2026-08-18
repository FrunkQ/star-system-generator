// src/lib/catalogue/galleryExamples.ts
// The shared array of synthetic EXAMPLE bodies used by BOTH reference galleries — the 2D PlanetDisc
// gallery (/discgallery) and the 3D holo gallery (/discgallery3d) — so they show the same worlds and
// stay in step. Grouped into labelled rows. New 3D-only rows (plumes, black holes) render as best the
// 2D disc can (a plain disc) but come alive in 3D.
import type { CelestialBody, RulePack } from '$lib/types';
import { deriveCloudDecks, applyCloudDeckTags, deriveWeather } from '$lib/physics/cloudDecks';
import { deriveApparentColorParts, starColorFromTempK } from '$lib/rendering/apparentColor';
import { STELLAR_ACTIVITY_TAG, stellarActivityBucket } from '$lib/physics/stellarActivity';
import { deriveSurfaceSpectrum } from '$lib/physics/surfaceSpectrum';
import { deriveVegetation } from '$lib/physics/vegetation';

export interface GalleryRow {
	title: string;
	blurb?: string;
	bodies: CelestialBody[];
	/** Light this row for its NIGHT SIDE: a raking key and no fill, so the terminator is real and
	 *  anything that GLOWS can be seen glowing. The rest of the gallery is deliberately front-lit so
	 *  surface detail reads, which is the opposite of what a row about city lights needs. */
	nightSide?: boolean;
}

const mk = (over: Partial<CelestialBody> & { name: string }) => {
	const hex = (over as any).apparentColorHex ?? '#3a6ea5';
	// Give every example a minimal apparentColor (a surface-role palette) so the 3D holo actually
	// TEXTURES it (and thus shows ice caps, craters, weathering…) — without one the sphere falls back
	// to a flat untextured colour. A richer apparentColor passed in `over` (giants) overrides this.
	return {
		id: over.name, roleHint: 'planet', apparentColorHex: hex,
		temperatureK: 288, temperatureRangeK: { min: 240, max: 305 }, tags: [],
		apparentColor: { hex, banding: 0, palette: [{ hex, role: 'surface', weight: 1 }] },
		...over
	} as unknown as CelestialBody;
};

const ammonia = (b: string, c1: string, c2: string) => ([
	{ hex: b, role: 'cloud', weight: 1 }, { hex: c1, role: 'cloud', weight: 0.6 }, { hex: c2, role: 'cloud', weight: 0.4 },
]);
const iceGiant = (b: string) => ([{ hex: b, role: 'cloud', weight: 1 }]);

const surface = [
	mk({ name: 'Temperate + polar ice', apparentColorHex: '#2f6ea5', tags: [{ key: 'climate/polar-ice', value: 'water' }] }),
	mk({ name: 'Polar ice, oblate', apparentColorHex: '#4a8ec5', oblateness: 0.32, tags: [{ key: 'climate/polar-ice', value: 'water' }] }),
	mk({ name: 'Polar ice, tidally locked', apparentColorHex: '#6aa0c0', tidallyLocked: true, tags: [{ key: 'climate/polar-ice', value: 'water' }] } as any),
	mk({ name: 'Dry world (no ice)', apparentColorHex: '#b08050', tags: [] }),
	mk({ name: 'Airless & cratered', apparentColorHex: '#9a9088', radiusKm: 2400, atmosphere: { pressure_bar: 0 } as any, tags: [{ key: 'geology/inactive' }, { key: 'science/impact-record' }] }),
	mk({ name: 'Lava world', apparentColorHex: '#7a2e1e', tags: [{ key: 'tidal/lava-flows' }] }),
];

const atmospheres = [
	mk({ name: 'Wispy (0.05 bar)', apparentColorHex: '#b09070', atmosphere: { pressure_bar: 0.05 } as any }),
	mk({ name: 'Earth-like (1 bar) + ice', apparentColorHex: '#3a7ac0', atmosphere: { pressure_bar: 1 } as any, tags: [{ key: 'climate/polar-ice', value: 'water' }] }),
	mk({ name: 'Thick (Venus, 90 bar)', apparentColorHex: '#c9b070', atmosphere: { pressure_bar: 90 } as any }),
	mk({ name: 'None (airless)', apparentColorHex: '#9a9aa2', atmosphere: { pressure_bar: 0 } as any }),
];

const earthLike = {
	id: 'earth-star', roleHint: 'planet',
	makeup: { rock: 0.68, metal: 0.32 },
	hydrosphere: { coverage: 0.71, composition: 'water', layers: [{ location: 'surface', liquid: 'water' }, { location: 'cloud', liquid: 'water' }] },
	atmosphere: { pressure_bar: 1, composition: { N2: 0.78, O2: 0.21 } },
	equilibriumTempK: 288, temperatureK: 288,
	tags: [{ key: 'climate/polar-ice', value: 'water' }],
};
const starClasses = [
	{ name: 'M dwarf · 3200 K', t: 3200 }, { name: 'K star · 4500 K', t: 4500 },
	{ name: 'G / Sun · 5800 K', t: 5800 }, { name: 'A star · 9000 K', t: 9000 },
];
const earthUnderStars = starClasses.map((s) => {
	const ap = deriveApparentColorParts(earthLike as any, undefined, { starTempK: s.t });
	return { ...JSON.parse(JSON.stringify(earthLike)), name: `Earth · ${s.name}`, apparentColor: ap, apparentColorHex: ap.hex } as unknown as CelestialBody;
});

const oceanLiquids = [
	{ liquid: 'water', name: 'Water', teq: 288, rock: 0.68, metal: 0.32 },
	{ liquid: 'salty-water', name: 'Brine', teq: 270, rock: 0.6, ice: 0.4 },
	{ liquid: 'methane', name: 'Methane (Titan)', teq: 94, rock: 0.5, ice: 0.5 },
	{ liquid: 'ammonia', name: 'Ammonia', teq: 220, rock: 0.6, ice: 0.4 },
	{ liquid: 'nitrogen', name: 'Nitrogen (Triton)', teq: 70, ice: 0.7, rock: 0.3 },
	{ liquid: 'sulfur', name: 'Sulfur (Io)', teq: 450, rock: 0.6, metal: 0.4 },
];
const oceanWorlds = oceanLiquids.map((o) => {
	const base = {
		id: `ocean-${o.liquid}`, roleHint: 'planet',
		makeup: { rock: o.rock ?? 0, metal: o.metal ?? 0, ice: o.ice ?? 0 },
		hydrosphere: { coverage: 0.71, composition: o.liquid, layers: [{ location: 'surface', liquid: o.liquid }] },
		atmosphere: { pressure_bar: 2, composition: {} }, equilibriumTempK: o.teq, temperatureK: o.teq, tags: [],
	};
	const ap = deriveApparentColorParts(base as any, undefined, { starTempK: 5800 });
	return { ...JSON.parse(JSON.stringify(base)), name: o.name, apparentColor: ap, apparentColorHex: ap.hex } as unknown as CelestialBody;
});

const shapes = [
	mk({ name: 'Oblate (fast spin)', apparentColorHex: '#c89868', oblateness: 0.4 }),
	mk({ name: 'Ellipsoid', apparentColorHex: '#b8916f', oblateness: 0.62 }),
	mk({ name: 'Near break-up', apparentColorHex: '#a89060', oblateness: 0.78 }),
	mk({ name: 'Toroid (flew apart)', apparentColorHex: '#c2a888', oblateness: 0.92 }),
];

const giants = [
	mk({ name: 'Jupiter-like · 3° tilt', apparentColorHex: '#d8b888', axial_tilt_deg: 3, radiusKm: 69911, makeup: { gas: 0.9, ice: 0.1 } as any,
		apparentColor: { hex: '#d8b888', banding: 8, palette: ammonia('#e8d3ab', '#c89868', '#9c6b3e') } as any }),
	mk({ name: 'Saturn-like · 27° tilt', apparentColorHex: '#d8c89a', axial_tilt_deg: 27, radiusKm: 58232, ringed: true, makeup: { gas: 0.9, ice: 0.1 } as any,
		apparentColor: { hex: '#d8c89a', banding: 5, palette: ammonia('#e6dcb8', '#c8b888', '#a89860') } as any }),
	mk({ name: 'Ice giant · smooth', apparentColorHex: '#8fc4d6', axial_tilt_deg: 28, radiusKm: 25362, makeup: { gas: 0.6, ice: 0.4 } as any,
		apparentColor: { hex: '#8fc4d6', banding: 3, palette: iceGiant('#a6d4e2') } as any }),
	mk({ name: 'Uranus · 98° (on its side)', apparentColorHex: '#a6d8dc', axial_tilt_deg: 98, radiusKm: 25362, makeup: { gas: 0.6, ice: 0.4 } as any,
		apparentColor: { hex: '#a6d8dc', banding: 4, palette: iceGiant('#b8e0e4') } as any }),
];

// Polar vortices — a gas giant's geometric polar jet. Saturn's is a hexagon (6); Jupiter's poles run
// polygonal cyclone rings 5–9. Side count rides on the feature/polar-vortex tag value.
const polarVortices = [
	mk({ name: 'Pentagon jet (5)', apparentColorHex: '#d8c89a', radiusKm: 58000, makeup: { gas: 0.9, ice: 0.1 } as any,
		apparentColor: { hex: '#d8c89a', banding: 6, palette: ammonia('#e6dcb8', '#c8b888', '#a89860') } as any,
		tags: [{ key: 'feature/polar-vortex', value: '5' }] }),
	mk({ name: 'Hexagon jet (6) · Saturn', apparentColorHex: '#d8c89a', radiusKm: 58000, makeup: { gas: 0.9, ice: 0.1 } as any,
		apparentColor: { hex: '#d8c89a', banding: 6, palette: ammonia('#e6dcb8', '#c8b888', '#a89860') } as any,
		tags: [{ key: 'feature/polar-vortex', value: '6' }] }),
	mk({ name: 'Octagon jet (8) · Jupiter N', apparentColorHex: '#d8b888', radiusKm: 69000, makeup: { gas: 0.9, ice: 0.1 } as any,
		apparentColor: { hex: '#d8b888', banding: 9, palette: ammonia('#e8d3ab', '#c89868', '#9c6b3e') } as any,
		tags: [{ key: 'feature/polar-vortex', value: '8' }] }),
];

const auroras = [
	mk({ name: 'O₂ + N₂ · green/purple (Earth)', apparentColorHex: '#2f6ea5', magnetism: { strengthG: 0.5 } as any, atmosphere: { pressure_bar: 1, composition: { N2: 0.78, O2: 0.21 } } as any, tags: [{ key: 'aurora/strong', value: '0.45' }, { key: 'climate/polar-ice', value: 'water' }] }),
	mk({ name: 'Nitrogen · purple · 40° tilt', apparentColorHex: '#37589a', axial_tilt_deg: 40, magnetism: { strengthG: 0.6 } as any, atmosphere: { pressure_bar: 1.5, composition: { N2: 0.98 } } as any, tags: [{ key: 'aurora/strong', value: '0.48' }] }),
	mk({ name: 'CO₂ · violet', apparentColorHex: '#9a6a5a', magnetism: { strengthG: 0.5 } as any, atmosphere: { pressure_bar: 2, composition: { CO2: 0.95, N2: 0.05 } } as any, tags: [{ key: 'aurora/strong', value: '0.4' }] }),
	mk({ name: 'O₂ + CO₂ · green/violet', apparentColorHex: '#5a8a6a', magnetism: { strengthG: 0.5 } as any, atmosphere: { pressure_bar: 1.5, composition: { CO2: 0.55, O2: 0.3, N2: 0.15 } } as any, tags: [{ key: 'aurora/strong', value: '0.45' }] }),
	mk({ name: 'N₂ + CH₄ · purple/blue', apparentColorHex: '#7a8a6a', magnetism: { strengthG: 0.6 } as any, atmosphere: { pressure_bar: 1.5, composition: { N2: 0.9, CH4: 0.1 } } as any, tags: [{ key: 'aurora/strong', value: '0.45' }] }),
	mk({ name: 'H/He giant · red-pink', apparentColorHex: '#c9a878', axial_tilt_deg: 3, radiusKm: 69911, magnetism: { strengthG: 4 } as any,
		atmosphere: { pressure_bar: 1000, composition: { H2: 0.9, He: 0.1 } } as any,
		apparentColor: { hex: '#c9a878', banding: 8, palette: ammonia('#e8d3ab', '#c89868', '#9c6b3e') } as any,
		tags: [{ key: 'aurora/brilliant', value: '0.75' }] }),
];

const brownDwarfs = [
	mk({ name: 'Y/T dwarf · 500 K', apparentColorHex: '#2e1410', radiusKm: 70000, temperatureK: 500, tags: [{ key: 'thermal/self-luminous', value: '500' }] }),
	mk({ name: 'T dwarf · 900 K', apparentColorHex: '#4a1e12', radiusKm: 72000, temperatureK: 900, tags: [{ key: 'thermal/self-luminous', value: '900' }] }),
	mk({ name: 'L dwarf · 1500 K', apparentColorHex: '#6e2c14', radiusKm: 78000, temperatureK: 1500, tags: [{ key: 'thermal/self-luminous', value: '1500' }] }),
	mk({ name: 'Hot young L · 2300 K', apparentColorHex: '#8a4018', radiusKm: 85000, temperatureK: 2300, tags: [{ key: 'thermal/self-luminous', value: '2300' }] }),
];

// --- NEW rows (mainly 3D-only features) -----------------------------------------------------------

// Volcanism tiers: a full lava world vs a few discrete vents / hotspots (glow in 3D).
export const GALLERY_VOLCANISM: CelestialBody[] = [
	mk({ name: 'Lava world (7 vents)', apparentColorHex: '#7a2e1e', radiusKm: 1800, tags: [{ key: 'tidal/lava-flows' }] }),
	mk({ name: 'Volcanism (5 vents)', apparentColorHex: '#8a4a30', radiusKm: 2100, tags: [{ key: 'tidal/volcanism' }] }),
	mk({ name: 'Hotspots (3 vents)', apparentColorHex: '#7c5a44', radiusKm: 2400, tags: [{ key: 'tidal/hotspots' }] }),
];

// Cryovolcanic plumes (3D): geoActivity regime forced so the plume feature fires; reach scales with
// (low) gravity — a small moon throws its jets far, a heavier one keeps them short.
const cryo = (name: string, radiusKm: number, massKg: number, hex: string) =>
	mk({ name, apparentColorHex: hex, radiusKm, massKg, temperatureK: 90,
		makeup: { ice: 0.6, rock: 0.4 } as any, atmosphere: { pressure_bar: 0 } as any,
		geoActivity: { regime: 'cryovolcanic' } as any, tags: [{ key: 'activity/cryovolcanism' }] });
export const GALLERY_CRYO_PLUMES: CelestialBody[] = [
	cryo('Enceladus-like · 252 km', 252, 1.08e20, '#dfeaf2'),   // tiny, low-g → long jets
	cryo('Triton-like · 1350 km', 1350, 2.14e22, '#d8e2e8'),
	cryo('Europa-like · 1560 km', 1560, 4.8e22, '#cfd8de'),     // heavier → short jets
];

// --- Foundation-driven surface weathering (geo-foundations.md consumers) ---------------------------
// These carry the DERIVED fields the appearance model reads (geoActivity/volatiles/irradiationDose),
// since gallery bodies bypass the processor.
const geo = (regime: string, surfaceAgeGyr: number) => ({ regime, surfaceAgeGyr } as any);
const vol = (...retained: string[]) => ({ retained } as any);
// The 3D holo texture needs an apparentColor (palette) to render; give these a minimal surface one
// from their base hex so the sphere textures (and the new weathering features) show in /discgallery3d.
const withAp = (b: CelestialBody): CelestialBody => {
	const any = b as any;
	if (any.apparentColor) return b;
	any.apparentColor = { hex: any.apparentColorHex, banding: 0, palette: [{ hex: any.apparentColorHex, role: 'surface', weight: 1 }] };
	return b;
};

// Cratering climbs with SURFACE AGE; the last one is tidally locked (leading-hemisphere bias).
export const GALLERY_CRATERING: CelestialBody[] = [
	mk({ name: 'Young · resurfaced', apparentColorHex: '#8a7a5e', radiusKm: 3000, atmosphere: { pressure_bar: 0 } as any,
		makeup: { rock: 0.7, metal: 0.3 } as any, irradiationDose: 0.05, geoActivity: geo('plate-tectonics', 0.05) } as any),
	mk({ name: 'Moderate · 1 Gyr', apparentColorHex: '#8a7a5e', radiusKm: 3000, atmosphere: { pressure_bar: 0 } as any,
		makeup: { rock: 0.7, metal: 0.3 } as any, irradiationDose: 0.4, geoActivity: geo('stagnant-lid', 1.0) } as any),
	mk({ name: 'Ancient · 4.6 Gyr', apparentColorHex: '#8a7a5e', radiusKm: 3000, atmosphere: { pressure_bar: 0 } as any,
		makeup: { rock: 0.7, metal: 0.3 } as any, irradiationDose: 2.5, geoActivity: geo('inactive', 4.6) } as any),
	mk({ name: 'Ancient · tidally locked', apparentColorHex: '#8a7a5e', radiusKm: 3000, atmosphere: { pressure_bar: 0 } as any,
		makeup: { rock: 0.7, metal: 0.3 } as any, irradiationDose: 2.5, tidallyLocked: true, geoActivity: geo('inactive', 4.6) } as any)
].map(withAp);

// Ice FRACTURES where rock craters; a frozen former ocean RIFTS the crust.
export const GALLERY_ICE_VS_ROCK: CelestialBody[] = [
	mk({ name: 'Rocky · cratered', apparentColorHex: '#9a9088', radiusKm: 2600, atmosphere: { pressure_bar: 0 } as any,
		makeup: { rock: 0.7, metal: 0.3 } as any, geoActivity: geo('inactive', 4.6) }),
	mk({ name: 'Europa · ice cracks', apparentColorHex: '#cdd8e0', radiusKm: 1560, atmosphere: { pressure_bar: 0 } as any,
		makeup: { ice: 0.5, rock: 0.5 } as any, geoActivity: geo('cryovolcanic', 0.05), volatiles: vol('carbon-dioxide', 'water'),
		tags: [{ key: 'tidal/hotspots' }] }),
	mk({ name: 'Charon · crustal rift', apparentColorHex: '#b8b0a6', radiusKm: 606, atmosphere: { pressure_bar: 0 } as any,
		makeup: { ice: 0.5, rock: 0.5 } as any, geoActivity: geo('inactive', 4.0), volatiles: vol('water'),
		tags: [{ key: 'structure/icy-shell' }] })
].map(withAp);

// Tholins (irradiated organics) + frosts (retained bright ices). Pluto reddens; young Triton stays
// fresh despite the same ices; Titan's haze is atmospheric; Io wears SO2 frost.
export const GALLERY_THOLIN_FROST: CelestialBody[] = [
	mk({ name: 'Pluto · tholin + N₂ frost', apparentColorHex: '#c8a488', radiusKm: 1188,
		makeup: { ice: 0.6, rock: 0.4 } as any, irradiationDose: 0.2, geoActivity: geo('inactive', 4.6),
		volatiles: vol('carbon-dioxide', 'nitrogen', 'water', 'methane') } as any),
	mk({ name: 'Triton · young, fresh', apparentColorHex: '#d8e2e8', radiusKm: 1353,
		makeup: { ice: 0.5, rock: 0.5 } as any, irradiationDose: 0.002, geoActivity: geo('cryovolcanic', 0.05),
		volatiles: vol('carbon-dioxide', 'nitrogen', 'water', 'methane') } as any),
	mk({ name: 'Titan · haze tholin', apparentColorHex: '#c9a24a', radiusKm: 2575,
		makeup: { ice: 0.5, rock: 0.5 } as any, irradiationDose: 0.16, geoActivity: geo('inactive', 4.6),
		atmosphere: { pressure_bar: 1.5, composition: { N2: 0.95, CH4: 0.05 } } as any, volatiles: vol('water') } as any),
	mk({ name: 'Io · SO₂ frost + lava', apparentColorHex: '#b8a24a', radiusKm: 1821, atmosphere: { pressure_bar: 0 } as any,
		makeup: { rock: 0.7, metal: 0.3 } as any, geoActivity: geo('tidal-volcanic', 0.002), volatiles: vol('sulfur-dioxide'),
		tags: [{ key: 'tidal/lava-flows' }] } as any)
].map(withAp);

// Thermal emission + eyeballs — a super-hot surface INCANDESCES; a tidally-locked world splits into a
// hot (baked/molten) day hemisphere and a frozen night one. temperatureRangeK carries the day/night
// extreme.
export const GALLERY_HOT_EYEBALL: CelestialBody[] = [
	mk({ name: 'Lava world · 2000 K', apparentColorHex: '#6a2a18', radiusKm: 3200, atmosphere: { pressure_bar: 0 } as any,
		makeup: { rock: 0.7, metal: 0.3 } as any, temperatureK: 1900, temperatureRangeK: { min: 1850, max: 2000 } } as any),
	mk({ name: 'Hot eyeball · molten day', apparentColorHex: '#7a4a34', radiusKm: 3200, atmosphere: { pressure_bar: 0 } as any,
		makeup: { rock: 0.7, metal: 0.3 } as any, tidallyLocked: true, temperatureK: 720, temperatureRangeK: { min: 110, max: 1550 } } as any),
	mk({ name: 'Hot eyeball · baked day', apparentColorHex: '#9a7e54', radiusKm: 3200, atmosphere: { pressure_bar: 0 } as any,
		makeup: { rock: 0.7, metal: 0.3 } as any, tidallyLocked: true, temperatureK: 430, temperatureRangeK: { min: 40, max: 760 } } as any),
	mk({ name: 'Cold eyeball · temperate eye', apparentColorHex: '#7a8896', radiusKm: 3200, atmosphere: { pressure_bar: 0 } as any,
		makeup: { rock: 0.6, ice: 0.4 } as any, tidallyLocked: true, temperatureK: 175, temperatureRangeK: { min: 70, max: 292 },
		volatiles: vol('water', 'carbon-dioxide') } as any)
].map(withAp);

// Star types by temperature (roleHint 'star').
// Example stars carry the stellar/activity TAG the processor would give them, so the gallery shows
// the same surfaces the live view does — spot groups, faculae and flares all read from that tag.
const star = (name: string, t: number, radiusKm: number, flare = 0.2) =>
	({ id: name, name, roleHint: 'star', temperatureK: t, radiusKm, flareActivity: flare,
		apparentColorHex: rgbHex(starColorFromTempK(t)),
		tags: [{ key: STELLAR_ACTIVITY_TAG, value: stellarActivityBucket(flare) }] }) as unknown as CelestialBody;
function rgbHex(rgb: [number, number, number]): string {
	const c = (v: number) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0');
	return `#${c(rgb[0])}${c(rgb[1])}${c(rgb[2])}`;
}
export const GALLERY_STAR_TYPES: CelestialBody[] = [
	star('M dwarf · 3200 K (flare star)', 3200, 350000, 0.95), // M dwarfs are the great flare stars
	star('K star · 4500 K', 4500, 550000, 0.4),
	star('G / Sun · 5800 K', 5800, 696000, 0.2),
	star('F star · 6800 K', 6800, 900000, 0.12),
	star('A star · 9000 K', 9000, 1200000, 0.08),
	star('B star · 18000 K', 18000, 3000000, 0.5),
];

// Black holes across accretion (Eddington) levels — quiescent horizon → blazing. Each carries a ring
// node (the accretion disc) so the 3D gallery renders the temperature-graded disc.
const disc = (id: string) => ({ id: id + '-disc', name: 'disc', roleHint: 'ring', parentId: id,
	massKg: 1e24, radiusInnerKm: 30, radiusOuterKm: 120 });
const bh = (name: string, edd: number, active: boolean) => {
	const id = name;
	const node: any = { id, name, roleHint: 'star', kind: 'body',
		classes: [active ? 'star/BH_active' : 'star/BH'], accretionEddington: edd,
		radiusKm: 30, massKg: 2e31, apparentColorHex: '#000000', tags: [] };
	return { node, disc: disc(id) };
};
const blackHoles = [
	bh('Quiescent BH', 0, false),
	bh('Feeding · 20%', 0.2, true),
	bh('Feeding · 50%', 0.5, true),
	bh('Feeding · 100%', 1.0, true),
];


// ── Life on the land ────────────────────────────────────────────────────────────────────────────
// These run the ENGINE — deriveSurfaceSpectrum then deriveVegetation, the same two calls the
// processor makes — rather than being hand-tinted. If the pigment model or the coverage arithmetic
// changes, this row changes with it, which is the only kind of reference gallery worth having.
const bioBase = {
	id: 'bio-base', roleHint: 'planet', kind: 'body',
	makeup: { rock: 0.68, metal: 0.32 }, calculatedGravity_ms2: 9.81,
	hydrosphere: { coverage: 0.65, composition: 'water', layers: [{ location: 'surface', liquid: 'water', coverage: 0.65 }] },
	atmosphere: { pressure_bar: 1, molarMassKg: 0.02896, composition: { N2: 0.78, O2: 0.21, H2O: 0.004 } },
	equilibriumTempK: 288, temperatureK: 288,
	temperatureProfile: { meanK: 288, totalMinK: 220, totalMaxK: 315,
		components: [
			{ source: 'latitude', label: 'Latitude', lowK: 248, highK: 302 },
			{ source: 'seasonal', label: 'Seasonal', lowK: 279, highK: 297 }] },
	tags: [{ key: 'climate/polar-ice', value: 'water' }],
};

function bioWorld(id: string, name: string, morphs: { morphology: string; coverage: number }[], pigment?: string): CelestialBody {
	const body: any = JSON.parse(JSON.stringify(bioBase));
	body.id = id; body.name = name;
	body.biosphere = { complexity: 'complex', coverage: 1, biochemistry: 'water-carbon',
		energy_source: 'photosynthesis', morphologies: morphs };
	const roll = (purpose: string) => {
		let h = 2166136261;
		const str = `${id}|veg|${purpose}`;
		for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); }
		return ((h >>> 0) % 100000) / 100000;
	};
	const spec = deriveSurfaceSpectrum(body, { starTempK: 5800, luminositySolar: 1, distanceAU: 1 });
	body.surfaceSpectrum = spec?.summary;
	body.vegetation = deriveVegetation(body, spec?.curves, { roll, pinnedPigment: pigment });
	const ap = deriveApparentColorParts(body, undefined, { starTempK: 5800 });
	body.apparentColor = ap; body.apparentColorHex = ap.hex;
	return body as CelestialBody;
}

export const GALLERY_COVERAGE = [
	bioWorld('bio-bare', 'Bare rock — no life', []),
	bioWorld('bio-25', 'Flora · 25% of the land', [{ morphology: 'flora', coverage: 0.25 }], 'chlorophyll'),
	bioWorld('bio-60', 'Flora · 60%', [{ morphology: 'flora', coverage: 0.6 }], 'chlorophyll'),
	bioWorld('bio-100', 'Flora · 100% — all the land', [{ morphology: 'flora', coverage: 1 }], 'chlorophyll'),
	bioWorld('bio-shallows', 'Flora · past the shore, into the shelf', [{ morphology: 'flora', coverage: 1.2 }], 'chlorophyll'),
];

export const GALLERY_PIGMENTS = ['chlorophyll', 'bacteriorhodopsin', 'carotenes', 'phycocyanin', 'melanin'].map((k, i) =>
	bioWorld(`bio-pig-${k}`, k.charAt(0).toUpperCase() + k.slice(1), [{ morphology: 'flora', coverage: 0.7 }], k));

export const GALLERY_STACK = [
	bioWorld('bio-mic', 'Microbial only', [{ morphology: 'microbial', coverage: 0.9 }], 'chlorophyll'),
	bioWorld('bio-mf', '+ fungal over it', [
		{ morphology: 'microbial', coverage: 0.9 }, { morphology: 'fungal', coverage: 0.5 }], 'chlorophyll'),
	bioWorld('bio-mff', '+ flora over that', [
		{ morphology: 'microbial', coverage: 0.9 }, { morphology: 'fungal', coverage: 0.5 },
		{ morphology: 'flora', coverage: 0.55 }], 'chlorophyll'),
	bioWorld('bio-fauna', '+ fauna (paints nothing)', [
		{ morphology: 'microbial', coverage: 0.9 }, { morphology: 'fungal', coverage: 0.5 },
		{ morphology: 'flora', coverage: 0.55 }, { morphology: 'fauna', coverage: 1 }], 'chlorophyll'),
];

export const GALLERY_TECHNO = [
	// 25% OF THE GLOBE is roughly what humans occupy or work today, and with 35% land here that is
	// about 70% of the land — widely present, barely lit. That gap is the whole point: a world is not
	// dark because nobody is there, it is dark because only a few per cent of what people hold is
	// built and burning.
	// The id is chosen, not fudged: how BRIGHTLY a settlement burns is a seeded roll from the pack's
	// own light range, and this world rolled a dim one — which is what makes it the Earth-like case.
	bioWorld('bio-tech-us-6', 'About us — 25% of the globe, barely lit', [
		{ morphology: 'flora', coverage: 0.65 }, { morphology: 'techno', coverage: 0.7 }], 'chlorophyll'),
	bioWorld('bio-tech-all-land', 'Every continent built over', [
		{ morphology: 'flora', coverage: 0.2 }, { morphology: 'techno', coverage: 1 }], 'chlorophyll'),
	bioWorld('bio-tech-sea', 'And out over the sea', [{ morphology: 'techno', coverage: 1.8 }], 'chlorophyll'),
	bioWorld('bio-tech-100', 'Ecumenopolis — the whole world', [{ morphology: 'techno', coverage: 3.2 }], 'chlorophyll'),
];

export const GALLERY_ROWS: GalleryRow[] = [
	{ title: 'Surface features', bodies: surface },
	{ title: 'Atmosphere limb-glow — by pressure', bodies: atmospheres },
	{ title: 'Same Earth under different stars', bodies: earthUnderStars },
	{ title: 'Life on the land — coverage grows from the coast inwards', bodies: GALLERY_COVERAGE,
	  blurb: 'One world, one geography, one slider. Life reaches the land at the water\u2019s edge and spreads inland, so raising the coverage widens the band toward the interior — and past 100% it goes the other way, into the shallows.' },
	{ title: 'The pigment decides the colour', bodies: GALLERY_PIGMENTS,
	  blurb: 'The same world under the same star, with each of the viable pigments pinned in turn. Nothing is hand-tinted: each colour is what that pigment fails to absorb out of the light reaching this ground.' },
	{ title: 'The hierarchy is a painter\u2019s algorithm', bodies: GALLERY_STACK,
	  blurb: 'Plant life covers fungal, fungal colours microbial — layers painted in order. Fauna is present on the last one and paints nothing, because animals do not tint a world seen from orbit.' },
	{ title: 'Technological life — lights, not paint (see the night side)', bodies: GALLERY_TECHNO, nightSide: true,
	  blurb: 'A settlement spreads exactly as plant cover does, from the coasts inland. It reads as what it EMITS: a grey-brown urban haze by day and a network of light by night. At full coverage the world is one city.' },
	{ title: 'Oceans of different liquids', bodies: oceanWorlds },
	{ title: 'Rotational shape — flattening to break-up', bodies: shapes },
	{ title: 'Gas & ice giants (+ ring, tilt)', bodies: giants },
	{ title: 'Polar vortices — geometric polar jets', bodies: polarVortices },
	{ title: 'Auroras — gas-coloured', bodies: auroras },
	{ title: 'Self-luminous brown dwarfs', bodies: brownDwarfs },
	{ title: 'Volcanism — glowing vents (3D)', bodies: GALLERY_VOLCANISM },
	{ title: 'Cryovolcanic plumes (3D)', bodies: GALLERY_CRYO_PLUMES },
	{ title: 'Surface weathering — cratering by age', bodies: GALLERY_CRATERING },
	{ title: 'Ice fractures vs rock craters (+ rift)', bodies: GALLERY_ICE_VS_ROCK },
	{ title: 'Tholins & volatile frosts', bodies: GALLERY_THOLIN_FROST },
	{ title: 'Thermal emission & eyeball worlds', bodies: GALLERY_HOT_EYEBALL },
	{ title: 'Star types — by temperature', bodies: GALLERY_STAR_TYPES },
];

// Black holes are handled specially (event horizon + accretion disc), kept separate from the sphere rows.
export const GALLERY_BLACK_HOLES = blackHoles;

// ── The giant lab ────────────────────────────────────────────────────────────────────────────────
// Every row above hands the renderer a palette somebody chose. These do the opposite: each body is
// nothing but a composition, a pressure and a temperature, and EVERYTHING you see — which species
// condense, how high their decks sit, how much sky they cover, what colour the planet ends up — is
// derived by running the real physics over it, exactly as the processor would.
//
// So it is a test rig as much as a gallery. Sweep one variable along a row and the row shows you the
// model's own answer: cool an ammonia giant and watch its decks appear, deepen and finally freeze
// out; raise the methane and watch a pale ice giant turn Neptune-blue; heat a world past every
// condensation point and watch the sky go clear. If a row looks wrong, the physics IS wrong.
//
// Needs the rule pack (the gas and liquid data drives all of it), so it is a function rather than a
// constant — both galleries build it once their pack has loaded.

const HYDROGEN = (over: Record<string, number>) => {
	const trace = Object.values(over).reduce((s, v) => s + v, 0);
	return { H2: (1 - trace) * 0.86, He: (1 - trace) * 0.14, ...over };
};

/** One derived giant: composition in, a fully-rendered body out. */
function giantBody(
	name: string,
	temperatureK: number,
	equilibriumTempK: number,
	pressureBar: number,
	composition: Record<string, number>,
	pack: RulePack | null,
	over: Partial<CelestialBody> = {}
): CelestialBody {
	const body = {
		id: `lab-${name}`, roleHint: 'planet', name,
		makeup: { gas: 0.95, ice: 0.04, rock: 0.01 },
		radiusKm: 60000, massKg: 1.5e27,
		temperatureK, equilibriumTempK,
		rotationPeriodHours: 10,
		atmosphere: { pressure_bar: pressureBar, composition },
		tags: [] as any[],
		...over
	} as unknown as CelestialBody;
	const decks = deriveCloudDecks(body, pack);
	body.tags = applyCloudDeckTags(body.tags ?? [], decks, deriveWeather(body, decks, pack));
	const ap = deriveApparentColorParts(body, pack ?? undefined);
	(body as any).apparentColor = ap;
	(body as any).apparentColorHex = ap.hex;
	return body;
}

/**
 * THE RECIPE BEHIND A LAB GIANT: the INPUTS that produced its colour, as a block a GM can paste
 * straight into a body's atmosphere (G7).
 *
 * INPUTS ONLY, and that is the whole design. `apparentColorHex`, the deck tags and the palette are
 * DERIVED - handing them back would paste a frozen answer next to the question, and the moment the
 * pack's condensation constants moved, the pasted world would keep a colour the engine no longer
 * computes. The gallery's own claim is that colour comes from data; a recipe that carried the colour
 * would quietly disprove it. So the deck list is shown BESIDE the button (it already is, in the
 * caption) and never inside the copied text.
 *
 * Only the derived `buildGiantLab` row has one of these. The hand-authored `giants` row is literal
 * hex triples with no recipe behind them, and a copy control there would dress a colour up as a
 * derivation - see the G7 row.
 */
export interface GiantRecipe {
	temperatureK: number;
	equilibriumTempK: number;
	atmosphere: { pressure_bar: number; composition: Record<string, number> };
}

export function giantRecipe(body: CelestialBody): GiantRecipe | null {
	const atm = (body as any).atmosphere;
	const t = (body as any).temperatureK;
	const eq = (body as any).equilibriumTempK;
	if (!atm?.composition || !(t > 0)) return null;
	return {
		temperatureK: t,
		equilibriumTempK: eq,
		atmosphere: { pressure_bar: atm.pressure_bar, composition: { ...atm.composition } }
	};
}

/** The recipe as pasteable JSON. Fractions are rounded only where it cannot change the chemistry. */
export function giantRecipeJson(body: CelestialBody): string | null {
	const r = giantRecipe(body);
	if (!r) return null;
	const comp: Record<string, number> = {};
	// 6 significant figures: H2/He are computed as (1 - trace) shares and would otherwise paste as
	// 0.8569999999999999. Trace species run to 8e-5, so this must not be a fixed decimal count.
	for (const [k, v] of Object.entries(r.atmosphere.composition)) comp[k] = Number(v.toPrecision(6));
	return JSON.stringify({ ...r, atmosphere: { ...r.atmosphere, composition: comp } }, null, 2);
}

export function buildGiantLab(pack: RulePack | null): GalleryRow[] {
	// A Jupiter's trace chemistry, held FIXED and simply cooled. Ammonium hydrosulphide condenses
	// warmest and so appears first and deepest; ammonia follows it down as the planet cools; and by
	// the bottom of the range the methane that was inert all the way along finally joins in.
	const jovianTrace = { CH4: 0.003, NH3: 0.00026, H2S: 0.00008 };
	// Labelled by INPUT, not by the deck I expected: the row is only a test if the model is allowed to
	// disagree with me, and on the first run it did — the 220 K world condenses ammonia high up where
	// its air reaches the skin temperature, which is not what the label used to claim.
	const cooling = [
		['220 K · 1 bar', 220, 150],
		['190 K · 1 bar', 190, 130],
		['165 K · Jupiter-like', 165, 110],
		['134 K · Saturn-like', 134, 95],
		['110 K · 1 bar', 110, 78],
		['80 K · 1 bar', 80, 60]
	] as const;

	// The SAME methane fraction at falling temperature. This is the row that pins the Saturn fix:
	// Saturn holds half again as much methane as Jupiter and is colder, yet has no methane deck,
	// because its profile bottoms out before the methane ever reaches saturation. Somewhere along
	// this row it does.
	const methaneThreshold = [140, 110, 90, 76, 60].map((t) =>
		giantBody(`${t} K · 2.3% CH₄`, t, Math.round(t * 0.78), 1, HYDROGEN({ CH4: 0.023 }), pack));

	// Ice giants differing ONLY in how much methane they carry — Uranus and Neptune as a data point
	// rather than two hand-picked blues.
	const methaneAbundance = [0.005, 0.015, 0.023, 0.04, 0.08].map((f) =>
		giantBody(`${(f * 100).toFixed(1)}% CH₄ · 76 K`, 76, 59, 1, HYDROGEN({ CH4: f }), pack));

	// Chemistry the solar system does not show you. Sulphur gives a giant a genuinely yellow sky;
	// water condenses on a warm sub-Neptune the way it does on Earth; and past every condensation
	// point there is simply nothing left to form a cloud out of, so the atmosphere goes clear.
	const exotic = [
		giantBody('Sulphurous · 240 K', 240, 190, 1, HYDROGEN({ SO2: 0.004, H2S: 0.002 }), pack),
		giantBody('Steam giant · 320 K', 320, 260, 1, HYDROGEN({ H2O: 0.02, CH4: 0.001 }), pack),
		giantBody('Ammonia-rich · 150 K', 150, 105, 1, HYDROGEN({ NH3: 0.004, H2S: 0.0008 }), pack),
		giantBody('Acid giant · 290 K', 290, 230, 1, HYDROGEN({ SO2: 0.003, H2O: 0.004 }), pack),
		giantBody('Nitrogen & methane · 100 K', 100, 75, 1, HYDROGEN({ N2: 0.1, CH4: 0.02 }), pack)
	];

	// Hot Jupiters, where the condensates are things you would normally call rock. Alkali metals go
	// first, then silicates, then iron — the same saturation test, run on a molten vocabulary.
	const hotJupiters = [
		giantBody('700 K · Na + K', 700, 700, 1, HYDROGEN({ Na: 0.002, K: 0.0015 }), pack),
		giantBody('1100 K · Na + K + SiO', 1100, 1100, 1, HYDROGEN({ Na: 0.002, K: 0.0015, SiO: 0.001 }), pack),
		giantBody('1400 K · SiO + Fe', 1400, 1400, 1, HYDROGEN({ SiO: 0.0015, Fe: 0.001 }), pack),
		giantBody('1800 K · SiO + Fe', 1800, 1800, 1, HYDROGEN({ Fe: 0.0015, SiO: 0.001 }), pack),
		giantBody('2400 K · SiO + Fe', 2400, 2400, 1, HYDROGEN({ Fe: 0.0015, SiO: 0.001 }), pack)
	];

	// Pressure alone. The same air, anchored deeper, saturates sooner and holds more overhead.
	const pressures = [0.1, 0.5, 1, 5, 20].map((p) =>
		giantBody(`${p} bar anchor · 150 K`, 150, 105, p, HYDROGEN(jovianTrace), pack));

	// AGE. A giant is still radiating the gravitational energy of its own formation, and cooling as it
	// does — so the same planet, at the same distance from the same star, is a different object at 10
	// million years and at four and a half billion. This row is the one that answers "how do I make a
	// really hot gas giant?": you do not move it closer to its star, you make it young. Temperatures
	// here are what estimateInternalHeatK derives for a Jupiter-mass world at each age, on top of the
	// same faint 110 K equilibrium throughout.
	const ageSweep: [string, number][] = [
		['10 Myr', 987], ['50 Myr', 456], ['100 Myr', 327], ['500 Myr', 151], ['1 Gyr', 108], ['4.6 Gyr', 165]
	];
	const ages = ageSweep.map(([label, tK]) =>
		giantBody(`${label} old`, tK, 110, 1, HYDROGEN(jovianTrace), pack));

	return [
		{ title: 'Giant lab — one Jovian chemistry, cooled', blurb: 'The same trace gases throughout — only the temperature changes. Every deck below is the model’s answer, not a label.',
			bodies: cooling.map(([label, t, eq]) => giantBody(label, t, eq, 1, HYDROGEN(jovianTrace), pack)) },
		{ title: 'Giant lab — where methane switches on', blurb: '2.3% methane throughout. Saturn sits above this threshold and has no methane deck; Uranus sits below it and does.',
			bodies: methaneThreshold },
		{ title: 'Giant lab — ice giants by methane abundance', blurb: 'Identical worlds at 76 K, differing only in methane. Uranus and Neptune fall out of the same rule.',
			bodies: methaneAbundance },
		{ title: 'Giant lab — other chemistries', blurb: 'Sulphur, steam, ammonia and acid skies — all derived, none authored.', bodies: exotic },
		{ title: 'Giant lab — hot Jupiters (rock as a condensate)', blurb: 'Sodium, potassium, silicate and iron vapour. Which of them is a cloud at each temperature is derived, not assigned.', bodies: hotJupiters },
		{ title: 'Giant lab — the same air at different depths', blurb: 'One composition, anchored from 0.1 to 20 bar.', bodies: pressures },
		{ title: 'Giant lab — the same giant, growing old', blurb: 'One Jupiter, one orbit, one chemistry — only its AGE changes. A giant makes its own heat from the gravitational energy of forming, and spends the rest of its life losing it. This is why a young giant glows and distance from the star has nothing to do with it.', bodies: ages }
	];
}
