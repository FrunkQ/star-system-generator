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

/** The band's size factor at a scaler position 0..1 — linear between 1 and the full-spread value. */
export function bandScale(band: SizeBand, spread: number): number {
	const s = Math.max(0, Math.min(1, Number.isFinite(spread) ? spread : 0));
	return 1 + s * (BAND_FULL_SPREAD[band] - 1);
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

/** The band for a body, from its first `star/...` class. */
export function sizeBandOf(body: { classes?: string[] } | null | undefined): SizeBand {
	const key = (body?.classes ?? []).find((c) => typeof c === 'string' && c.startsWith('star/'));
	return sizeBandOfClass(key);
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

/**
 * Where each member of a system sits and how big it draws, in units of the renderer's base glyph
 * radius (the 2D map's 5 viewBox units at zoom 1; the 3D map's pixel unit). The cluster offsets are
 * scaled by the LARGEST member's factor so a giant beside a dwarf does not swallow it as the scaler
 * rises; at spread 0 every factor is 1 and this is exactly the old layout.
 *
 * `fixed[i]` marks a member whose size NEVER moves with the scaler — a black hole. Its schematic
 * glyph (horizon, photon ring, the blaze) needs its pixels to read as a hole at all, so it keeps full
 * size while the white dwarf beside it shrinks into the compact band: at scaler 1 a supergiant, a
 * dwarf, Sirius B and a hole are four different sizes, and the hole is still obviously a hole.
 */
export function clusterLayout(bands: readonly SizeBand[], spread: number, fixed?: readonly boolean[]): GlyphSlot[] {
	const offs = starClusterOffsets(bands.length);
	const scales = bands.map((b, i) => (fixed?.[i] ? 1 : bandScale(b, spread)));
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
