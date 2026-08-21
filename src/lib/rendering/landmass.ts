// WHERE THE LAND IS — one elevation field per world, on the SPHERE, shared by everything that draws it.
//
// It replaces a scatter of overlapping circles. That scatter had three faults and only the first was
// cosmetic: every world's continents read as blobs; the ocean and the vegetation each rolled their
// OWN scatter, so plant life landed in the sea as often as on the ground; and the 2D disc and the 3D
// globe rolled theirs separately too, so one world had two different geographies depending on which
// way you looked at it. Three answers to "where is the land", which is this codebase's most recurring
// fault wearing its usual costume.
//
// SO THE FIELD IS DEFINED ON THE SPHERE AND EVERY CONSUMER THRESHOLDS IT. Sea level is a threshold.
// The coastline is that threshold. Vegetation is a BAND just inside it. Shallow water is a band just
// outside it. The 2D disc and the 3D globe sample the same field through their own projections, so
// they cannot disagree about where the shore is — there is only one shore.
//
// WHY VEGETATION IS A BAND AND NOT A FILL: life reaches the land at the water's edge and spreads
// inland from there, so the interior is the last place it gets to and the first place it gives up —
// which is also why Earth's deserts are continental and its rainforests are not. Raising the coverage
// raises the band's inland edge. It is one number, and it produces coast-first growth for free.
//
// THE FIELD IS ELEVATION-LIKE, NOT A MAP. Domain-warped fractal noise, thresholded by AREA rather
// than by height so a world's derived land fraction comes out right whatever the noise happened to
// do. It models no tectonics and claims none; real plate motion is a V4 conversation.

export interface LandField {
	w: number;               // equirect grid width (longitude samples)
	h: number;               // equirect grid height (latitude samples)
	value: Float32Array;     // 0..1 "elevation", row-major, row 0 = north pole
	seaLevel: number;        // value > seaLevel is land
	landFraction: number;    // fraction of the SPHERE that is land, as asked for
}

/** String → 32-bit seed. Same recipe as the other seeded look features, so a world is stable. */
export function seedFrom(s: string): number {
	let h = 2166136261;
	for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
	return h >>> 0;
}

/** Deterministic 0..1 hash of a 3D lattice point plus a seed. */
function latticeHash(ix: number, iy: number, iz: number, seed: number): number {
	let h = seed ^ Math.imul(ix, 374761393) ^ Math.imul(iy, 668265263) ^ Math.imul(iz, 2147483647);
	h = Math.imul(h ^ (h >>> 13), 1274126177);
	return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

const smootherstep = (t: number) => t * t * t * (t * (t * 6 - 15) + 10);

/** Value noise at a 3D point. THREE dimensions because the field lives on a sphere: a 2D field would
 *  have to be projected, and every projection tears or stretches somewhere — usually at a pole,
 *  which is exactly where an ice cap draws attention to it. */
function valueNoise3(x: number, y: number, z: number, freq: number, seed: number): number {
	const fx = x * freq, fy = y * freq, fz = z * freq;
	const ix = Math.floor(fx), iy = Math.floor(fy), iz = Math.floor(fz);
	const tx = smootherstep(fx - ix), ty = smootherstep(fy - iy), tz = smootherstep(fz - iz);
	const H = latticeHash;
	const c000 = H(ix, iy, iz, seed), c100 = H(ix + 1, iy, iz, seed);
	const c010 = H(ix, iy + 1, iz, seed), c110 = H(ix + 1, iy + 1, iz, seed);
	const c001 = H(ix, iy, iz + 1, seed), c101 = H(ix + 1, iy, iz + 1, seed);
	const c011 = H(ix, iy + 1, iz + 1, seed), c111 = H(ix + 1, iy + 1, iz + 1, seed);
	const x00 = c000 + (c100 - c000) * tx, x10 = c010 + (c110 - c010) * tx;
	const x01 = c001 + (c101 - c001) * tx, x11 = c011 + (c111 - c011) * tx;
	const y0 = x00 + (x10 - x00) * ty, y1 = x01 + (x11 - x01) * ty;
	return y0 + (y1 - y0) * tz;
}

/**
 * Fractal noise: octaves of value noise, each half the amplitude and roughly twice the frequency.
 *
 * FIVE OCTAVES, not one. One octave is a blob field with slightly softer edges — the fault this
 * replaces. The later octaves are what put bays, peninsulas and offshore island chains on a
 * coastline, and they are the whole visual difference between "a continent" and "a splodge".
 */
function fbm3(x: number, y: number, z: number, seed: number, octaves = 5): number {
	let sum = 0, amp = 1, freq = 1.9, norm = 0;
	for (let o = 0; o < octaves; o++) {
		sum += amp * valueNoise3(x, y, z, freq, seed + o * 7919);
		norm += amp;
		amp *= 0.5;
		freq *= 2.07;   // not exactly 2 — an exact doubling lines the octaves' lattices up and grids the coast
	}
	return sum / norm;
}

/**
 * DOMAIN WARPING — the step that makes a coastline look like a coastline, and the cheapest large win
 * in procedural terrain.
 *
 * Plain fractal noise thresholds into rounded shapes with crinkly edges: recognisably noise. Warping
 * the coordinates by another noise field first stretches and folds those shapes, which is what
 * produces peninsulas, isthmuses, deep inlets and long trailing island arcs. Two warp terms, because
 * a single one still reads as regular at continent scale.
 */
function warpedElevation(x: number, y: number, z: number, seed: number): number {
	const wx = x + 0.75 * (fbm3(x + 0.13, y + 0.71, z + 4.2, seed + 1013, 3) - 0.5);
	const wy = y + 0.75 * (fbm3(x + 5.21, y + 1.37, z + 8.9, seed + 2027, 3) - 0.5);
	const wz = z + 0.75 * (fbm3(x + 2.77, y + 6.53, z + 1.1, seed + 3041, 3) - 0.5);
	const vx = wx + 0.35 * (fbm3(wx + 1.7, wy + 9.2, wz + 3.3, seed + 4051, 2) - 0.5);
	const vy = wy + 0.35 * (fbm3(wx + 8.3, wy + 2.8, wz + 7.6, seed + 5077, 2) - 0.5);
	return fbm3(vx, vy, wz + 0.35 * (fbm3(vx, vy, wz, seed + 6089, 2) - 0.5), seed);
}


/**
 * A SETTLEMENT NETWORK: ridged noise, which thresholds into thin bright filaments rather than blobs.
 *
 * It is what makes a planet-wide city read as a city from orbit — the eye is looking for the
 * arterial grid between the dark blocks, not an even glow. Ridged noise (1 - |2n - 1|) turns the
 * midpoints of a smooth field into sharp crests, so the bright set is a connected web instead of a
 * scatter of dots, which is exactly the structure of lit roads seen at night.
 *
 * Same lattice as the elevation field, different seed, so a world's cities and its coastlines are
 * independent but equally stable.
 */
export function networkAt(seed: number, lon: number, lat: number, scale = 1): number {
	const cl = Math.cos(lat), sl = Math.sin(lat);
	const x = cl * Math.cos(lon) * scale, y = sl * scale, z = cl * Math.sin(lon) * scale;
	let sum = 0, amp = 1, freq = 7, norm = 0;
	for (let o = 0; o < 4; o++) {
		const n = valueNoise3(x, y, z, freq, seed + 9151 + o * 613);
		sum += amp * (1 - Math.abs(2 * n - 1));
		norm += amp;
		amp *= 0.55;
		freq *= 2.11;
	}
	const r = sum / norm;
	// Sharpen: only the crests light up, so the web is thin and the blocks between it stay dark.
	return Math.max(0, Math.min(1, Math.pow(Math.max(0, r - 0.42) / 0.58, 1.6)));
}

/** A smooth 0..1 wobble for a boundary that should not be a ruled line — an ice-cap edge, a shore
 *  of frost. Cheap, seeded, and deliberately lower frequency than the settlement network. */
export function edgeWobble(seed: number, lon: number, lat: number): number {
	const cl = Math.cos(lat), sl = Math.sin(lat);
	return fbm3(cl * Math.cos(lon), sl, cl * Math.sin(lon), seed + 4423, 3);
}

/** Grid row → latitude in radians (row 0 = north pole). */
const latOfRow = (gy: number, h: number) => Math.PI / 2 - ((gy + 0.5) / h) * Math.PI;

/**
 * The value at which a given FRACTION OF THE SPHERE lies above the threshold.
 *
 * Two things this gets right that a naive version would not. It thresholds by AREA rather than by
 * height, so the world's derived land fraction comes out as asked instead of being whatever the noise
 * happened to make. And it weights each row by cos(latitude), because an equirect grid has far more
 * cells per unit area near the poles — unweighted, a polar continent would count for as much as a
 * tropical one twenty times its size.
 */
export function levelForArea(field: { w: number; h: number; value: Float32Array }, fractionAbove: number): number {
	const f = Math.max(0, Math.min(1, fractionAbove));
	if (f <= 0) return 1.0001;      // nothing above: all sea
	if (f >= 1) return -0.0001;     // everything above: no sea at all
	const cells: { v: number; wt: number }[] = [];
	let total = 0;
	for (let gy = 0; gy < field.h; gy++) {
		const wt = Math.cos(latOfRow(gy, field.h));
		if (wt <= 0) continue;
		for (let gx = 0; gx < field.w; gx++) {
			cells.push({ v: field.value[gy * field.w + gx], wt });
			total += wt;
		}
	}
	if (!total) return 0.5;
	cells.sort((a, b) => b.v - a.v);          // highest first
	let acc = 0;
	const want = f * total;
	for (const c of cells) {
		acc += c.wt;
		if (acc >= want) return c.v;
	}
	return cells[cells.length - 1].v;
}

/**
 * Build a world's elevation field.
 *
 * The grid is the resolution the NOISE is evaluated at, not the resolution it is drawn at — both
 * renderers sample it bilinearly, so a 1024x512 sphere texture reads off a much smaller field
 * without looking blocky. That split is deliberate: the warped multi-octave noise is far too
 * expensive to evaluate per texel on every body in a gallery.
 */
export function buildLandField(seed: string, landFraction: number, w = 384, h = 192): LandField {
	const s = seedFrom(seed);
	const value = new Float32Array(w * h);
	for (let gy = 0; gy < h; gy++) {
		const lat = latOfRow(gy, h);
		const cl = Math.cos(lat), sl = Math.sin(lat);
		for (let gx = 0; gx < w; gx++) {
			const lon = ((gx + 0.5) / w) * 2 * Math.PI;
			value[gy * w + gx] = warpedElevation(cl * Math.cos(lon), sl, cl * Math.sin(lon), s);
		}
	}
	const lf = Math.max(0, Math.min(1, landFraction));
	return { w, h, value, landFraction: lf, seaLevel: levelForArea({ w, h, value }, lf) };
}

// One field per (world, land fraction), shared by every renderer that asks. The warped multi-octave
// noise costs ~80 ms to evaluate; the 2D disc and the 3D sphere both want it, and a gallery wants it
// for twenty bodies at once. Bounded, because each field is a few hundred kilobytes.
const fieldCache = new Map<string, LandField>();

/** The cached field for a world. THE entry point for renderers — never call buildLandField directly
 *  from a draw path, or the same world pays for its own geography twice per frame. */
export function landFieldFor(seed: string, landFraction: number): LandField {
	const key = `${seed}|${landFraction.toFixed(3)}`;
	let f = fieldCache.get(key);
	if (!f) {
		if (fieldCache.size > 48) fieldCache.clear();
		f = buildLandField(seed, landFraction);
		fieldCache.set(key, f);
	}
	return f;
}

/** Bilinear sample at a longitude/latitude in radians. Longitude WRAPS; latitude clamps at the poles. */
export function elevationAt(field: LandField, lonRad: number, latRad: number): number {
	const { w, h, value } = field;
	const u = (((lonRad / (2 * Math.PI)) % 1) + 1) % 1;
	const v = Math.max(0, Math.min(1, 0.5 - latRad / Math.PI));
	const fx = u * w - 0.5, fy = Math.min(h - 1.0001, Math.max(0, v * h - 0.5));
	const x0 = Math.floor(fx), y0 = Math.floor(fy);
	const tx = fx - x0, ty = fy - y0;
	const at = (x: number, y: number) => value[Math.min(h - 1, Math.max(0, y)) * w + ((x % w) + w) % w];
	return (at(x0, y0) * (1 - tx) + at(x0 + 1, y0) * tx) * (1 - ty)
		+ (at(x0, y0 + 1) * (1 - tx) + at(x0 + 1, y0 + 1) * tx) * ty;
}

/**
 * Sample through an ORTHOGRAPHIC projection of the facing hemisphere — what the 2D disc draws.
 * `u`, `v` run 0..1 over the disc's bounding square. Returns null outside the disc.
 *
 * This is the whole reason the field lives on a sphere: the disc and the globe are two projections of
 * ONE geography, so a world looks like itself in the orrery and in the holo.
 */
export function elevationAtDisc(field: LandField, u: number, v: number, spinRad = 0): number | null {
	const px = (u - 0.5) * 2, py = (0.5 - v) * 2;   // -1..1, y up
	const r2 = px * px + py * py;
	if (r2 > 1) return null;
	const pz = Math.sqrt(1 - r2);                    // toward the viewer
	const lat = Math.asin(Math.max(-1, Math.min(1, py)));
	const lon = Math.atan2(px, pz) + spinRad;
	return elevationAt(field, lon, lat);
}

export interface VegetationBand {
	/** Values in (low, high] carry life. `low` sits BELOW sea level only when the coverage asked for
	 *  is more than the dry land can hold — that is the shallow-sea fringe. */
	low: number;
	high: number;
	/** What was actually achieved as a fraction of the LAND. */
	achieved: number;
	/** True when the band has spilled past the shoreline into shallow water. */
	usesShallows: boolean;
}

/**
 * The band of the field that carries life, grown from the coast inwards.
 *
 * `coverageOfLand` is exactly what the Bio tab's slider stores: 1 means all the dry land. Above 1 the
 * band spills into WATER, and `waterReach` — a property of the morphology, not of this function —
 * says how much of the world's water that morphology can hold. Plants get the sunlit shelf and no
 * more; technological life gets all of it, and a fully settled ocean world is one city over a roofed
 * sea. Nothing here knows which morphology it is dealing with.
 */
export function vegetationBand(field: LandField, coverageOfLand: number, waterReach = 0.1): VegetationBand {
	const cov = Math.max(0, coverageOfLand);
	const land = field.landFraction;
	if (!(land > 0) || cov <= 0) {
		return { low: field.seaLevel, high: field.seaLevel, achieved: 0, usesShallows: false };
	}
	// Inland edge: leave (1 - covered) of the land above it, so the vegetated share is what sits
	// between that level and the shore.
	const onLand = Math.min(1, cov);
	const high = levelForArea(field, Math.max(0, land * (1 - onLand)));
	// Seaward edge: only once the dry land is full does it reach past the shore, and only as far as
	// this morphology's own `waterReach` allows — which is how "the oceans are technology's to take
	// and nobody else's" is DATA rather than a rule.
	const water = Math.max(0, 1 - land);
	const spill = Math.max(0, cov - 1) * land;
	const intoWater = Math.min(water * Math.max(0, Math.min(1, waterReach)), spill);
	const low = intoWater > 0 ? levelForArea(field, Math.min(1, land + intoWater)) : field.seaLevel;
	return { low, high, achieved: onLand + intoWater / land, usesShallows: intoWater > 0 };
}

/**
 * The largest coverage-of-land the slider can usefully offer on this world: all the dry land, plus
 * however much water THIS morphology can take, in the SAME units the slider stores. A world with
 * almost no land offers a value well above 1 — and it should, because a 5%-land world's life is
 * mostly in the water. For a morphology that can roof the oceans the ceiling is the whole globe.
 */
export function maxUsefulCoverage(landFraction: number, waterReach = 0.1): number {
	if (!(landFraction > 0)) return 1;
	const water = Math.max(0, 1 - landFraction);
	return 1 + Math.min(9, (water * Math.max(0, Math.min(1, waterReach))) / landFraction);
}
