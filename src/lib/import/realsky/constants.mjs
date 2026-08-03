// Real-sky import — shared physical constants and map conventions.
//
// Plain ESM with no imports, because two very different consumers share it:
// the Vite-bundled app (src/lib/import/realsky/*) and the plain-node build kit
// (scripts/starmap-build/*, spawned by buildKit.spec.mjs as `node ...`).
// Anything TypeScript-only or $lib-aliased here would break the kit.
//
// These values are the single source: the build kit re-exports what it needs
// from here. If a number must change, it changes here and the bundled maps are
// regenerated in the same commit (see scripts/starmap-build/README.md — the
// kit and the shipped maps are pinned to each other by buildKit.spec.mjs).

export const G = 6.6743e-11;
export const SOLAR_MASS_KG = 1.989e30;
export const SOLAR_RADIUS_KM = 695700;
export const EARTH_MASS_KG = 5.972e24;
export const EARTH_RADIUS_KM = 6371;
export const JUPITER_MASS_KG = 1.898e27;
export const AU_KM = 149597870.7;
export const LY_PER_PC = 3.2615637769;
export const AU_PER_LY = 63241.077;
export const SECONDS_PER_YEAR = 31557600; // Julian year

// Map conventions shared by every real-sky product (bundled maps + importer):
// right-handed equatorial Cartesian frame (+z toward the north celestial pole,
// +x toward RA 0h Dec 0, +y toward RA 6h Dec 0), at this scale, with the
// region's CENTRE at this pixel origin.
export const PIXELS_PER_LY = 43.30127018922193;
export const DEFAULT_MAP_CENTRE_PX = { x: 400, y: 300 };

// The bundled maps' shared epoch (t0 for every orbit; System.epochT0).
export const EPOCH = 1762339146908;
