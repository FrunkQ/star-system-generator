// THE STARMAP GLYPH LAW — how big a star draws on a STARMAP and how a multiple's members sit, as pure
// functions in SCREEN terms. (Inbox G26(a) + C17; the starmap's sibling of rendering/scaleLaw.ts.)
//
// WHY SCREEN TERMS AND NEVER WORLD CONSTANTS (C17, and C15 before it on the holo). The 3D starmap
// drew every star as a sprite `R = 0.22` scene units across and laid a multiple's members out at
// `dx * R` in the same units, so zooming in made each star light-years wide and spread Alpha
// Centauri's three stars as far apart as Sol is from them. The GM 2D map had the same fault with
// `r = 5` circles inside the `scale(zoom)` transform. A glyph is a MARK, not an object: its size and
// the spread of its members are pixel quantities, the same at every zoom, and this file states them
// once for both renderers so they cannot disagree.
//
// THE BANDS ARE PRESENTATION, THE BAND COMES FROM THE CLASSIFIER. Four size bands — remnant/sub-
// dwarf, V, III/II, I — read off the luminosity class the engine already derives (B60's full MK
// designation: `star/G2V`, `star/K-III`, `star/M1.5Iab`; remnants by their own key). A GM SCALER
// 0..1 spreads them: 0 = every star the same size (the map before this law), 1 = fully separated.
// Black holes keep their schematic glyph at every setting — a hole must still read as a hole.
import { starClassParts } from '$lib/physics/starDesignation';

export type SizeBand = 'compact' | 'dwarf' | 'giant' | 'supergiant';
export const SIZE_BANDS: readonly SizeBand[] = ['compact', 'dwarf', 'giant', 'supergiant'];

/**
 * Relative glyph size per band at FULL spread (scaler = 1). The dwarf is the reference: at 0 spread
 * every band is 1, which is today's equal-size map; at 1 a supergiant draws twice a dwarf and a
 * remnant a little over half. "Slightly different sizes", per the owner — legibility first, so the
 * ratios are nothing like the physical ones (a supergiant is a thousand dwarf radii).
 */
export const BAND_FULL_SPREAD: Record<SizeBand, number> = { compact: 0.6, dwarf: 1, giant: 1.45, supergiant: 2 };

/** The scaler's range. 1 = the bands fully separated as first shipped; 2 = that separation doubled
 *  (owner, 2026-08-19: "let it go to 200%"). Default 0 = all the same size. */
export const SPREAD_MAX = 2;

/**
 * The band's size factor at a scaler position 0..SPREAD_MAX — GEOMETRIC: full^s, so at 1 it is exactly
 * the full-spread value, at 2 its square (a supergiant 4x, a remnant 0.36x) and at 0.5 its root. Log-
 * linear in the dial, and it cannot cross zero the way a linear extrapolation past 1 would (0.6 at 1
 * would have been 0.2 at 2 on the compact band, and negative soon after).
 */
export function bandScale(band: SizeBand, spread: number): number {
	const s = Math.max(0, Math.min(SPREAD_MAX, Number.isFinite(spread) ? spread : 0));
	return Math.pow(BAND_FULL_SPREAD[band], s);
}

/**
 * WITHIN THE DWARF BAND, THE SPECTRAL LETTER TILTS THE SIZE a little at full spread — an O dwarf is
 * ten solar radii and an M dwarf a fifth of one, and 98% of a generated map is class V (the pack
 * draws a giant once in two hundred stars), so a scaler that moved only the four class bands did
 * nothing visible on an ordinary map (owner, 2026-08-19: "all appear the same size always"). The
 * letter is the same designation the classifier derives, so "Star size by class" still means class;
 * the tilt is gentle and sits inside the band ordering: compact 0.6 < M 0.86 ... O 1.3 < giant 1.45.
 */
export const LETTER_TILT_FULL: Record<string, number> = { O: 1.3, B: 1.22, A: 1.14, F: 1.06, G: 1, K: 0.94, M: 0.86 };
export function letterTilt(letter: string | undefined, spread: number): number {
	const s = Math.max(0, Math.min(SPREAD_MAX, Number.isFinite(spread) ? spread : 0));
	const full = letter ? LETTER_TILT_FULL[letter.toUpperCase()] : undefined;
	return full ? Math.pow(full, s) : 1;   // geometric, like bandScale
}

// ── Depth attenuation (3D only) ──────────────────────────────────────────────────────────────────

/**
 * A GENTLE size falloff with camera depth on the 3D starmap — owner, 2026-08-19: "the ones further
 * away could be a bit smaller, makes zooming more intuitive... just to the scale on screen, does not
 * need to be a big effect". The glyph stays a SCREEN quantity (RENDER-S27): this is a small factor on
 * the pixel size, referenced to the camera's TARGET depth, so the star you are looking at is always
 * full size, the ones beyond it a little smaller, the ones nearer a little larger — and zooming in
 * towards a cluster shrinks everything behind it. Never on the flat 2D map, which is a plan view.
 *
 * (ref/depth)^DEPTH_EXPONENT, clamped: a star three times the target's depth draws at 0.72, one at a
 * third of it at 1.2 — never below DEPTH_MIN or above DEPTH_MAX, so a far edge stays legible and a
 * near star never balloons.
 */
export const DEPTH_EXPONENT = 0.3;
export const DEPTH_MIN = 0.65;
export const DEPTH_MAX = 1.25;
export function depthAttenuation(depth: number, refDepth: number): number {
	if (!(depth > 0) || !(refDepth > 0)) return 1;
	return Math.max(DEPTH_MIN, Math.min(DEPTH_MAX, Math.pow(refDepth / depth, DEPTH_EXPONENT)));
}

/** A member's drawn size as a multiple of the base radius: its band at the scaler, tilted by its
 *  letter when it is a dwarf. 1 for everything at spread 0. */
export function glyphScale(m: { band: SizeBand; letter?: string; fixed?: boolean }, spread: number): number {
	if (m.fixed) return 1;
	return bandScale(m.band, spread) * (m.band === 'dwarf' ? letterTilt(m.letter, spread) : 1);
}

/**
 * Which band a star's CLASS KEY puts it in. `classes[0]` is the designation (B60): a remnant key is
 * `compact`; L/T/Y dwarfs are compact too (a tenth of a solar radius, and below the fusion floor);
 * luminosity class 0/Ia/Iab/Ib/I is `supergiant`; II/III `giant`; IV/V/VI and a bare letter `dwarf`.
 * An unparseable or missing key is a dwarf — the middle of the map, never a blank.
 */
export function sizeBandOfClass(classKey: string | undefined): SizeBand {
	if (!classKey) return 'dwarf';
	const p = starClassParts(classKey);
	if (p.bare) return /^(WD|NS|BH|BH_active|magnetar)$/.test(p.bare) ? 'compact' : 'dwarf';
	if (!p.letter) return 'dwarf';
	if (/^[LTY]$/.test(p.letter)) return 'compact';
	const band = p.band ?? '';
	if (/^(0|Ia|Iab|Ib|I)$/.test(band)) return 'supergiant';
	if (/^(II|III)$/.test(band)) return 'giant';
	return 'dwarf';
}

/** The luminosity class AS WRITTEN (B60's `stellarType.luminosity`: 'Ia', 'III', 'V'...) to a band. */
function bandOfLuminosity(lum: string | undefined): SizeBand | undefined {
	if (!lum) return undefined;
	if (/^(0|Ia|Iab|Ib|I)$/.test(lum)) return 'supergiant';
	if (/^(II|III)$/.test(lum)) return 'giant';
	if (/^(IV|V|VI)$/.test(lum)) return 'dwarf';
	return undefined;
}

/**
 * The band for a body. `stellarType.luminosity` first (the structured classification, where it is
 * stated), then EVERY `star/...` class it carries — the first that states more than a bare letter
 * wins, because a save may hold `['star/K', 'star/K-III']` as readily as the other way round and a
 * giant must not read as a dwarf for the order its classes happen to be in. Remnants and L/T/Y are
 * compact whatever else is there.
 */
export function sizeBandOf(body: { classes?: string[]; stellarType?: { spectral?: string; luminosity?: string } } | null | undefined): SizeBand {
	const st = body?.stellarType;
	if (st?.spectral && /^(WD|NS|BH|BH_active|magnetar|L|T|Y)$/.test(st.spectral)) return 'compact';
	const fromType = bandOfLuminosity(st?.luminosity);
	if (fromType) return fromType;
	const keys = (body?.classes ?? []).filter((c): c is string => typeof c === 'string' && c.startsWith('star/'));
	let bare: SizeBand | undefined;
	for (const k of keys) {
		const p = starClassParts(k);
		const b = sizeBandOfClass(k);
		if (b !== 'dwarf' || (p.band && /^(IV|V|VI)$/.test(p.band))) return b;   // states a band, or is a remnant/brown dwarf
		bare = bare ?? b;
	}
	return bare ?? 'dwarf';
}

/** The spectral letter a body's designation states (O B A F G K M), for the dwarf-band tilt. */
export function spectralLetterOfBody(body: { classes?: string[]; stellarType?: { spectral?: string } } | null | undefined): string | undefined {
	const sp = body?.stellarType?.spectral;
	if (sp && /^[OBAFGKM]$/.test(sp)) return sp;
	for (const k of body?.classes ?? []) {
		if (typeof k !== 'string' || !k.startsWith('star/')) continue;
		const p = starClassParts(k);
		if (p.letter && /^[OBAFGKM]$/.test(p.letter)) return p.letter;
	}
	return undefined;
}

// ── Cluster layout ───────────────────────────────────────────────────────────────────────────────

/**
 * Offsets (in glyph-radius units) for laying out 1..4+ stars around a system point — the arrangement
 * the GM map has always used, shared so 2D and 3D read identically. Primary first (the callers sort
 * by mass), so the primary takes the top of the triangle / diamond.
 */
export function starClusterOffsets(n: number): { dx: number; dy: number }[] {
	if (n <= 1) return [{ dx: 0, dy: 0 }];
	if (n === 2) return [{ dx: -1, dy: 0 }, { dx: 1, dy: 0 }];
	if (n === 3) return [{ dx: 0, dy: -1.2 }, { dx: -1.2, dy: 1 }, { dx: 1.2, dy: 1 }];
	// 4+: diamond (first four); any extra stack on the centre.
	const base = [{ dx: 0, dy: -1.2 }, { dx: 0, dy: 1.2 }, { dx: -1.4, dy: 0 }, { dx: 1.4, dy: 0 }];
	const out = base.slice();
	for (let i = 4; i < n; i++) out.push({ dx: 0, dy: 0 });
	return out;
}

export interface GlyphSlot {
	/** Centre offset from the system point, in units of the renderer's BASE glyph radius. */
	dx: number; dy: number;
	/** This member's glyph size as a multiple of the base radius (its band at the scaler). */
	scale: number;
}

/** What the layout needs to know about one member: its band, its letter (dwarf tilt), and whether
 *  its size is FIXED against the scaler (a black hole). */
export interface GlyphMember { band: SizeBand; letter?: string; fixed?: boolean }

/**
 * Where each member of a system sits and how big it draws, in units of the renderer's base glyph
 * radius (the 2D map's 5 viewBox units at zoom 1; the 3D map's pixel unit). The cluster offsets are
 * scaled by the LARGEST member's factor so a giant beside a dwarf does not swallow it as the scaler
 * rises; at spread 0 every factor is 1 and this is exactly the old layout.
 *
 * `fixed` marks a member whose size NEVER moves with the scaler — a black hole. Its schematic glyph
 * (horizon, photon ring, the blaze) needs its pixels to read as a hole at all, so it keeps full size
 * while the white dwarf beside it shrinks into the compact band: at scaler 1 a supergiant, a dwarf,
 * Sirius B and a hole are four different sizes, and the hole is still obviously a hole.
 */
export function clusterLayout(members: readonly (GlyphMember | SizeBand)[], spread: number): GlyphSlot[] {
	const ms = members.map((m) => (typeof m === 'string' ? { band: m } : m));
	const offs = starClusterOffsets(ms.length);
	const scales = ms.map((m) => glyphScale(m, spread));
	const unit = scales.length ? Math.max(...scales) : 1;
	return offs.map((o, i) => ({ dx: o.dx * unit, dy: o.dy * unit, scale: scales[i] ?? 1 }));
}

/**
 * The half-extent of the whole cluster (widest / tallest reach of any member's disc) in base-radius
 * units — what a label or a marker ring clears. For one dwarf it is {1, 1}; the old 2D map's
 * hand-written table (5/10/11/12 wide, 5/5/11/11 tall, in world units of 5) falls out of it exactly.
 */
export function clusterHalfExtent(slots: readonly GlyphSlot[]): { w: number; h: number } {
	if (!slots.length) return { w: 0.6, h: 0.6 };   // the empty-system fallback dot (r 3 of 5)
	let w = 0, h = 0;
	for (const s of slots) { w = Math.max(w, Math.abs(s.dx) + s.scale); h = Math.max(h, Math.abs(s.dy) + s.scale); }
	return { w, h };
}

// ── THE OCCLUSION RING (G54) ─────────────────────────────────────────────────────────────────────
//
// A STAR WITH SOMETHING AROUND IT IS DRAWN WITH THE THING AROUND IT, and the ring is not decoration:
// its GAPS ARE THE LIGHT STILL GETTING OUT. A 30% swarm draws a ring 30% closed; a complete Dyson
// sphere draws a closed one. So the mark is the occlusion, read directly, rather than a symbol a
// reader has to learn.
//
// WHY IT EXISTS AT ALL, and it was a real report from the owner: a fully enclosed star reaches the
// map at transmission ZERO, which is honest photometry and a black disc on a black background. It
// read as A BLACK HOLE. Two things fix that and both are here - the ring says something surrounds
// it, and `GLYPH_DIM_FLOOR` keeps the star itself visible inside its own shell.
//
// SHARED, because a marker added in one renderer and not the others is this file's whole reason for
// existing (TAG-20 records it costing four places). The 2D maps draw these arcs as SVG paths; the
// 3D map bakes the same list into a canvas texture. One definition, three surfaces.

/**
 * THE LEGIBILITY FLOOR ON A DIMMED GLYPH, as a fraction of the star's own linear brightness.
 *
 * A GLYPH IS A MARK, NOT A PHOTOMETRIC READING - the same argument `megaPreview`'s honesty floors
 * make about stroke widths. At transmission 0 the honest colour is black, and a black mark on a
 * black map is not a reading a GM can see; it is an absence, and it reads as the wrong object.
 * So the mark keeps an ember and the TRUE figure stays where figures belong: in the reading, in the
 * `stellar/dimmed` tag, and in the star panel's three sentences.
 *
 * 0.18 of the linear brightness is about 46% of the sRGB value - obviously dimmed, never invisible.
 */
export const GLYPH_DIM_FLOOR = 0.18;

/**
 * A dimmed glyph's colour gain, lifted to the floor WITHOUT MOVING ITS HUE.
 *
 * The whole triple is scaled by one factor so the brightest channel reaches the floor, which keeps
 * the ratio between the channels exactly. Flooring each channel on its own would be the obvious
 * thing and it is wrong: a reddened star's blue channel would hit the floor first and the star would
 * lose the reddening that is the entire point of drawing it dimmed - the colour would go grey at
 * precisely the depths where the reddening is strongest.
 */
export function floorGlyphGain(gain: readonly [number, number, number]): [number, number, number] {
	const m = Math.max(gain[0], gain[1], gain[2]);
	if (!(m > 0)) return [GLYPH_DIM_FLOOR, GLYPH_DIM_FLOOR, GLYPH_DIM_FLOOR];
	if (m >= GLYPH_DIM_FLOOR) return [gain[0], gain[1], gain[2]];
	const k = GLYPH_DIM_FLOOR / m;
	return [gain[0] * k, gain[1] * k, gain[2] * k];
}

/** Ring geometry, in units of the member's own glyph radius. Both renderers scale by their own r. */
export const OCCLUSION_RING = {
	/** Sits outside the disc and inside the shed-wind shell's 2.0, so the two never sit on top of
	 *  each other on a star that has both. */
	radiusMul: 1.55,
	/** Stroke width. Thin enough not to swallow a compact glyph at the smallest scaler position. */
	widthMul: 0.30,
	/** How many arcs a PARTIAL ring is broken into. Six reads as "a ring with gaps" at glyph size;
	 *  more becomes a dotted blur, fewer reads as three unrelated ticks. */
	segments: 6
} as const;

/** One arc of the ring, in radians, measured the way both `arc()` and an SVG sweep want it. */
export interface RingArc { startRad: number; sweepRad: number; }

/**
 * The arcs that draw an occlusion of `blockedFrac`, or null when there is nothing to draw.
 *
 * THE CLOSED CASE IS ONE ARC, NOT SIX TOUCHING ONES: a complete shell must draw an unbroken circle,
 * and six arcs meeting end to end leave hairline seams at exactly the moment the picture is meant to
 * say "sealed". Anything short of complete is `segments` equal arcs sharing the closed fraction, so
 * the gaps between them are, literally, the light that still escapes.
 */
export function occlusionRingArcs(blockedFrac: number): RingArc[] | null {
	const f = Number.isFinite(blockedFrac) ? Math.min(1, Math.max(0, blockedFrac)) : 0;
	if (!(f > 0)) return null;
	if (f >= 1) return [{ startRad: 0, sweepRad: 2 * Math.PI }];
	const n = OCCLUSION_RING.segments;
	const step = (2 * Math.PI) / n;
	const sweep = step * f;
	// A HALF-GAP LEAD so the pattern is symmetric about the top of the glyph rather than starting
	// hard at 3 o'clock - at six segments an asymmetric start is visible as a lean.
	const lead = (step - sweep) / 2;
	return Array.from({ length: n }, (_, i) => ({ startRad: i * step + lead, sweepRad: sweep }));
}

/**
 * One ring arc as an SVG path `d`, for the two 2D maps. Kept here beside the arc list so the two
 * SVG surfaces cannot write the sweep flags differently - the large-arc flag is the classic place
 * for that to go wrong, and it only shows up past a half turn, which is exactly the heavily-occluded
 * case this exists to draw.
 */
export function ringArcPath(cx: number, cy: number, r: number, arc: RingArc): string {
	// A full turn cannot be expressed as one SVG arc (start and end coincide, so it draws nothing) -
	// two half turns, which is what a closed ring needs.
	if (arc.sweepRad >= 2 * Math.PI - 1e-9) {
		return `M ${cx - r} ${cy} A ${r} ${r} 0 1 1 ${cx + r} ${cy} A ${r} ${r} 0 1 1 ${cx - r} ${cy}`;
	}
	const x0 = cx + r * Math.cos(arc.startRad), y0 = cy + r * Math.sin(arc.startRad);
	const e = arc.startRad + arc.sweepRad;
	const x1 = cx + r * Math.cos(e), y1 = cy + r * Math.sin(e);
	const large = arc.sweepRad > Math.PI ? 1 : 0;
	return `M ${x0} ${y0} A ${r} ${r} 0 ${large} 1 ${x1} ${y1}`;
}
