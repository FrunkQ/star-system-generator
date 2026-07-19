// src/lib/catalogue/galleryExamples.ts
// The shared array of synthetic EXAMPLE bodies used by BOTH reference galleries — the 2D PlanetDisc
// gallery (/discgallery) and the 3D holo gallery (/discgallery3d) — so they show the same worlds and
// stay in step. Grouped into labelled rows. New 3D-only rows (plumes, black holes) render as best the
// 2D disc can (a plain disc) but come alive in 3D.
import type { CelestialBody } from '$lib/types';
import { deriveApparentColorParts, starColorFromTempK } from '$lib/rendering/apparentColor';

export interface GalleryRow {
	title: string;
	blurb?: string;
	bodies: CelestialBody[];
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

const auroras = [
	mk({ name: 'Oxygen · green', apparentColorHex: '#2f6ea5', magnetism: { strengthG: 0.5 } as any, atmosphere: { pressure_bar: 1, composition: { N2: 0.78, O2: 0.21 } } as any, tags: [{ key: 'aurora/strong', value: '0.42' }, { key: 'climate/polar-ice', value: 'water' }] }),
	mk({ name: 'Nitrogen · blue · 40° tilt', apparentColorHex: '#37589a', axial_tilt_deg: 40, magnetism: { strengthG: 0.6 } as any, atmosphere: { pressure_bar: 1.5, composition: { N2: 0.98 } } as any, tags: [{ key: 'aurora/strong', value: '0.48' }] }),
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
const star = (name: string, t: number, radiusKm: number, flare = 0.2) =>
	({ id: name, name, roleHint: 'star', temperatureK: t, radiusKm, flareActivity: flare,
		apparentColorHex: rgbHex(starColorFromTempK(t)), tags: [] }) as unknown as CelestialBody;
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

export const GALLERY_ROWS: GalleryRow[] = [
	{ title: 'Surface features', bodies: surface },
	{ title: 'Atmosphere limb-glow — by pressure', bodies: atmospheres },
	{ title: 'Same Earth under different stars', bodies: earthUnderStars },
	{ title: 'Oceans of different liquids', bodies: oceanWorlds },
	{ title: 'Rotational shape — flattening to break-up', bodies: shapes },
	{ title: 'Gas & ice giants (+ ring, tilt)', bodies: giants },
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
