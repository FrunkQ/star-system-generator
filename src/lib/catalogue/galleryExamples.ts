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

const mk = (over: Partial<CelestialBody> & { name: string }) => ({
	id: over.name, roleHint: 'planet', apparentColorHex: '#3a6ea5',
	temperatureK: 288, temperatureRangeK: { min: 240, max: 305 }, tags: [], ...over
}) as unknown as CelestialBody;

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
const volcanism = [
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
const cryoPlumes = [
	cryo('Enceladus-like · 252 km', 252, 1.08e20, '#dfeaf2'),   // tiny, low-g → long jets
	cryo('Triton-like · 1350 km', 1350, 2.14e22, '#d8e2e8'),
	cryo('Europa-like · 1560 km', 1560, 4.8e22, '#cfd8de'),     // heavier → short jets
];

// Star types by temperature (roleHint 'star').
const star = (name: string, t: number, radiusKm: number, flare = 0.2) =>
	({ id: name, name, roleHint: 'star', temperatureK: t, radiusKm, flareActivity: flare,
		apparentColorHex: rgbHex(starColorFromTempK(t)), tags: [] }) as unknown as CelestialBody;
function rgbHex(rgb: [number, number, number]): string {
	const c = (v: number) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0');
	return `#${c(rgb[0])}${c(rgb[1])}${c(rgb[2])}`;
}
export const GALLERY_STAR_TYPES: CelestialBody[] = [
	star('M dwarf · 3200 K', 3200, 350000, 0.6),
	star('K star · 4500 K', 4500, 550000),
	star('G / Sun · 5800 K', 5800, 696000),
	star('F star · 6800 K', 6800, 900000),
	star('A star · 9000 K', 9000, 1200000),
	star('B star · 18000 K', 18000, 3000000, 0.4),
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
	{ title: 'Volcanism — glowing vents (3D)', bodies: volcanism },
	{ title: 'Cryovolcanic plumes (3D)', bodies: cryoPlumes },
	{ title: 'Star types — by temperature', bodies: GALLERY_STAR_TYPES },
];

// Black holes are handled specially (event horizon + accretion disc), kept separate from the sphere rows.
export const GALLERY_BLACK_HOLES = blackHoles;
