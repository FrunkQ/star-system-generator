// THE GRID'S GEOMETRY, as ONE builder for every map that draws a grid.
//
// This is the third quantity to be pulled out of the two scenes and the one that actually mattered.
// `gridFade` already shared the fade WINDOW (C14) and the depth curtain's SHAPE, and the two grids
// still did not look alike, because the window was never the thing that differed: the two scenes
// EMITTED the geometry differently, and one of them emitted it wrongly.
//
// THE FAULT THIS EXISTS TO END. Three.js multiplies the material's colour by the vertex colour
// (`diffuseColor *= vColor` in `color_fragment`). The starmap's material therefore carries NO colour
// — it defaults to white and the vertex attribute carries everything. The system map set BOTH: a
// material colour of `base * 0.4` and a vertex colour of the same value, so the colour came out
// SQUARED, 0.4 becoming 0.16, and the grid dropped to a sixth of its intensity. It appeared the
// instant the falloff dial left zero because that is what gated the attribute, which is why it read
// as "turn falloff up at all and every line goes super dim" — a fade fault that was not in the fade.
//
// THE OTHER HALF. The system map drew its polar rings as `LineLoop`s while the starmap drew the same
// rings as EDGES. A loop has no pair structure, so it can carry no depth curtain, so "Grid depth"
// moved a dial that could only reach the spokes — visible as a glow where the spokes converge and
// nothing anywhere else. Rings as edges is the starmap's answer and it is the one that works.
//
// So: one emitter, and the convention it fixes is that THE VERTEX ATTRIBUTE OWNS COLOUR AND FADE,
// and the material owns white plus whatever a per-frame updater needs (the system map's two-level
// crossfade lives on `opacity`, which the starmap has no use for). Each contribution to the final
// pixel gets exactly one channel — see RENDER-S25.

import { skirtDepth, SKIRT_TOP_ALPHA, type GridFadeWindow } from './gridFade';

/** An edge on the ground plane: x1, z1, x2, z2. Y is supplied once, per lattice. */
export type GridEdge = [number, number, number, number];

/** Just the three channels — deliberately not `THREE.Color`, so this module stays renderer-free. */
export interface GridRGB {
	r: number;
	g: number;
	b: number;
}

export interface LatticeOptions {
	/** Line alpha at full strength, before the fade. */
	alpha?: number;
	/** Cell size the curtain is scaled from. A coarse line drops a deeper curtain than a fine one. */
	cell?: number;
	/** Depth dial, 0..1. At 0 no curtain is emitted at all. */
	skirt?: number;
	/** World-space thickness INSTEAD of a curtain — three's `linewidth` is ignored on most platforms. */
	ribbon?: number;
	/** Height of the plane the lattice sits on. */
	y0?: number;
	/** The radial fade window, from `gridFadeWindow`. Omit for no fade. */
	fade?: GridFadeWindow;
}

/** Flat arrays ready for `BufferAttribute`s: positions (3) and colours (4), lines and curtain. */
export interface LatticeArrays {
	linePos: number[];
	lineCol: number[];
	skirtPos: number[];
	skirtCol: number[];
}

/**
 * Emit a lattice's lines and its depth curtain.
 *
 * Alpha rides a vec4 colour attribute so one draw call carries the whole gradient, and an edge whose
 * BOTH ends have faded out is dropped rather than drawn invisible — 70 transparent lines still cost
 * 70 draw calls.
 */
export function buildLattice(edges: GridEdge[], col: GridRGB, o: LatticeOptions = {}): LatticeArrays {
	const A = o.alpha ?? 0.42;
	const y0 = o.y0 ?? 0.01;
	const drop = skirtDepth(o.cell ?? 1, o.skirt ?? 0);
	const w = o.fade;
	const fade = (x: number, z: number) => {
		if (!w) return 1;
		const d = Math.hypot(x, z);
		if (d <= w.from) return 1;
		return Math.max(0, 1 - (d - w.from) / Math.max(1e-6, w.to - w.from));
	};
	const linePos: number[] = [], lineCol: number[] = [];
	const skirtPos: number[] = [], skirtCol: number[] = [];
	const pushC = (arr: number[], a: number) => arr.push(col.r, col.g, col.b, a);
	for (const [x1, z1, x2, z2] of edges) {
		const a1 = A * fade(x1, z1), a2 = A * fade(x2, z2);
		if (a1 <= 0.002 && a2 <= 0.002) continue;
		linePos.push(x1, y0, z1, x2, y0, z2);
		pushC(lineCol, a1); pushC(lineCol, a2);
		if (o.ribbon && o.ribbon > 0) {
			const dx = x2 - x1, dz = z2 - z1, len = Math.hypot(dx, dz) || 1;
			const nx = (-dz / len) * (o.ribbon / 2), nz = (dx / len) * (o.ribbon / 2);
			skirtPos.push(x1 - nx, y0, z1 - nz, x2 - nx, y0, z2 - nz, x2 + nx, y0, z2 + nz);
			pushC(skirtCol, a1); pushC(skirtCol, a2); pushC(skirtCol, a2);
			skirtPos.push(x1 - nx, y0, z1 - nz, x2 + nx, y0, z2 + nz, x1 + nx, y0, z1 + nz);
			pushC(skirtCol, a1); pushC(skirtCol, a2); pushC(skirtCol, a1);
		} else if ((o.skirt ?? 0) > 0.001) {
			// Two triangles, full alpha along the top edge fading to zero at the bottom.
			skirtPos.push(x1, y0, z1, x2, y0, z2, x2, y0 - drop, z2);
			pushC(skirtCol, a1 * SKIRT_TOP_ALPHA); pushC(skirtCol, a2 * SKIRT_TOP_ALPHA); pushC(skirtCol, 0);
			skirtPos.push(x1, y0, z1, x2, y0 - drop, z2, x1, y0 - drop, z1);
			pushC(skirtCol, a1 * SKIRT_TOP_ALPHA); pushC(skirtCol, 0); pushC(skirtCol, 0);
		}
	}
	return { linePos, lineCol, skirtPos, skirtCol };
}

/**
 * One ring as EDGES rather than a loop.
 *
 * A `LineLoop` cannot carry a curtain and cannot be fed to the shared emitter, and that difference is
 * the whole of why "Grid depth" did nothing on the system map's rings.
 */
export function ringEdges(radius: number, segments = 64): GridEdge[] {
	const out: GridEdge[] = [];
	if (!(radius > 0) || segments < 3) return out;
	for (let i = 0; i < segments; i++) {
		const a0 = (i / segments) * Math.PI * 2, a1 = ((i + 1) / segments) * Math.PI * 2;
		out.push([Math.cos(a0) * radius, Math.sin(a0) * radius, Math.cos(a1) * radius, Math.sin(a1) * radius]);
	}
	return out;
}

/**
 * Radial spokes, SEGMENTED.
 *
 * A per-vertex fade evaluated at the ends of a full-length spoke judges the whole spoke by its far
 * end and drops all of it (inbox A37), so the pieces are what make the fade a fade.
 */
export function spokeEdges(count: number, radius: number, steps = 24): GridEdge[] {
	const out: GridEdge[] = [];
	if (count < 1 || !(radius > 0)) return out;
	const step = radius / Math.max(1, steps);
	for (let i = 0; i < count; i++) {
		const a = (i / count) * Math.PI * 2, cx = Math.cos(a), cz = Math.sin(a);
		for (let r = 0; r < radius - 1e-9; r += step) {
			const r2 = Math.min(radius, r + step);
			out.push([cx * r, cz * r, cx * r2, cz * r2]);
		}
	}
	return out;
}
