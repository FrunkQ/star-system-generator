// Pure camera/zoom helpers + bounds, extracted from SystemVisualizer (Phase 01.8)
// so the touch-input layer (Phase 2) has a viewport API that isn't buried in a
// Svelte component. State-dependent framing helpers (calculateFrameForNode,
// shouldSuppressAutoZoomNearPeriapsis) follow as arg-bag functions.

import type { System } from '../types';
import type { PanState } from './stores';
import { AU_KM } from '../constants';
import { scaleBoxCox } from '../physics/scaling';

type WorldPositions = Map<string, { x: number; y: number }>;

export const MIN_CAMERA_ZOOM = 0.05;
// In AU render space, very close binaries/constructs (e.g. ~100 km separation)
// require very high zoom to be visually distinguishable.
export const MAX_CAMERA_ZOOM = 500000000;
export const AUTO_ZOOM_MAX_STEP_RATIO = 1.2;

export function clampZoom(value: number): number {
	if (!Number.isFinite(value)) return MIN_CAMERA_ZOOM;
	return Math.max(MIN_CAMERA_ZOOM, Math.min(MAX_CAMERA_ZOOM, value));
}

export function dampedZoomStep(current: number, target: number): number {
	const safeCurrent = Math.max(current, MIN_CAMERA_ZOOM);
	const safeTarget = clampZoom(target);
	const ratio = safeTarget / safeCurrent;
	const clampedRatio = Math.max(1 / AUTO_ZOOM_MAX_STEP_RATIO, Math.min(AUTO_ZOOM_MAX_STEP_RATIO, ratio));
	return clampZoom(safeCurrent * clampedRatio);
}

// --- Multi-level click framing -------------------------------------------------------------
// A consistent zoom ladder applied to ANY focusable object (star/planet/moon/construct/barycentre).
// Selecting frames level 1; each further click on the focused object steps DOWN to the next level
// that exists; missing levels are skipped. Levels:
//   1 "context"    — object centred, its PARENT sits `parentBorderFrac` in from the screen edge
//                    (a large parent may bleed off-screen — you'll see ~the inner 1-2·border of it).
//   2 "satellites" — object centred, its FURTHEST satellite `satelliteBorderFrac` from the edge.
//   3 "close"      — object centred, filling ~`fillFrac` of the smaller screen dimension.
// All percentages are tunable here.
export const FRAME_LEVELS = {
	parentBorderFrac: 0.10,    // level 1: parent this far in from the edge
	satelliteBorderFrac: 0.10, // level 2: furthest satellite this far from the edge
	fillFrac: 0.50             // level 3: object diameter ≈ this fraction of min(screen) dimension
};
export type FrameLevelConfig = typeof FRAME_LEVELS;

// ── THE click-ladder ruleset (one definition, every renderer) ─────────────────────────────────────
// Selecting an object frames its first EXISTING level; each re-click steps one level deeper:
//   1 object + its parent · 2 object + its satellites · 3 object fills the view
// Levels that don't apply are skipped (no parent → no 1; no satellites → no 2), and the deepest level
// clamps (no wrap). The maths below is UNIT-AGNOSTIC: a caller measures distances in whatever space it
// renders — AU for the 2D orrery, scene units for the holo — and gets a half-extent back in that space.
// Pair it with getVisibleNodeIds (system/visibleNodes), which is the one rule for BOTH what gets a name
// and what can be clicked.

/** Which levels exist, in zoom-in order, from the two predicates that decide it. */
export function frameLevelsFrom(has: { hasParent: boolean; hasSatellites: boolean }): number[] {
	const levels: number[] = [];
	if (has.hasParent) levels.push(1);
	if (has.hasSatellites) levels.push(2);
	levels.push(3);
	return levels;
}
/** A NEW selection starts at the object's first existing level. */
export function firstFrameLevel(levels: number[]): number {
	return levels[0] ?? 3;
}
/** A re-click on the focused object steps to the next existing level; clamps at the deepest. */
export function nextFrameLevel(levels: number[], current: number): number {
	const idx = levels.indexOf(current);
	return idx >= 0 && idx < levels.length - 1 ? levels[idx + 1] : levels[levels.length - 1] ?? current;
}
/**
 * Level → the half-extent that should fit in HALF the viewport's min dimension, in the caller's own
 * units. `radius` is the object's rendered radius; `parentDist` / `maxSatelliteDist` are measured by the
 * caller in the same space. Returns 0 for a radius-less object at level 3 (constructs) — the caller
 * substitutes its own small patch, since such glyphs draw at a fixed screen size anyway.
 */
export function frameHalfExtent(args: {
	level: number;
	radius: number;
	parentDist?: number;
	maxSatelliteDist?: number;
	config?: FrameLevelConfig;
}): number {
	const cfg = args.config ?? FRAME_LEVELS;
	const { level, radius } = args;
	if (level <= 1 && (args.parentDist ?? 0) > 0) {
		return Math.max(args.parentDist!, radius * 2, 1e-9) / Math.max(0.05, 1 - cfg.parentBorderFrac);
	}
	if (level <= 2 && (args.maxSatelliteDist ?? 0) > 0) {
		return Math.max(args.maxSatelliteDist!, radius * 2, 1e-9) / Math.max(0.05, 1 - cfg.satelliteBorderFrac);
	}
	return radius > 0 ? radius / Math.max(0.05, cfg.fillFrac) : 0;
}

function bodyRadiusAUof(node: any, toytownFactor: number, x0_distance: number): number {
	if (!node || node.kind !== 'body' || !node.radiusKm) return 0;
	let r = node.radiusKm / AU_KM;
	if (toytownFactor > 0) r = scaleBoxCox(r, toytownFactor, x0_distance);
	return r;
}

// The framing host = the construct's UI host (ui_parentId) if any, else the real parent.
function framingParentId(node: any): string | null {
	return (node?.ui_parentId as string) || (node?.parentId as string) || null;
}

// Which of the 3 levels actually exist for this node, in zoom-in order.
export function availableFrameLevels(args: {
	nodeId: string;
	system: System | null;
	toytownFactor: number;
	scaledWorldPositions: WorldPositions;
	worldPositions: WorldPositions;
}): number[] {
	const { nodeId, system, toytownFactor, scaledWorldPositions, worldPositions } = args;
	if (!system) return [3];
	const node = system.nodes.find((n) => n.id === nodeId);
	if (!node) return [3];
	const positions = toytownFactor > 0 ? scaledWorldPositions : worldPositions;
	const parentId = framingParentId(node);
	return frameLevelsFrom({
		hasParent: !!(parentId && positions.get(parentId)),
		hasSatellites: system.nodes.some((n) => n.parentId === nodeId && positions.get(n.id))
	});
}

// --- State-dependent framing helpers (arg-bag; the consumer supplies its
// current world positions / canvas / camera so these stay pure). ---

export function suppressAutoZoomNearPeriapsis(args: {
	nodeId: string;
	system: System | null;
	toytownFactor: number;
	scaledWorldPositions: WorldPositions;
	worldPositions: WorldPositions;
}): boolean {
	const { nodeId, system, toytownFactor, scaledWorldPositions, worldPositions } = args;
	if (!system) return false;
	const node = system.nodes.find((n) => n.id === nodeId);
	if (!node || !node.orbit || !node.parentId) return false;

	const e = node.orbit.elements.e || 0;
	if (e < 0.8) return false;

	const targetPositions = toytownFactor > 0 ? scaledWorldPositions : worldPositions;
	const nodePos = targetPositions.get(node.id);
	const parentPos = targetPositions.get(node.parentId);
	if (!nodePos || !parentPos) return false;

	const dx = nodePos.x - parentPos.x;
	const dy = nodePos.y - parentPos.y;
	const distance = Math.sqrt(dx * dx + dy * dy);
	const periapsis = node.orbit.elements.a_AU * (1 - e);
	if (periapsis <= 0) return false;

	return distance < periapsis * 3;
}

export function frameForNode(args: {
	nodeId: string;
	system: System | null;
	canvas: HTMLCanvasElement | null;
	currentPan: PanState;
	currentZoom: number;
	toytownFactor: number;
	scaledWorldPositions: WorldPositions;
	worldPositions: WorldPositions;
	x0_distance: number;
	forceOrbitView: boolean;
}): { pan: PanState; zoom: number } {
	let { nodeId } = args;
	const {
		system, canvas, currentPan, currentZoom, toytownFactor,
		scaledWorldPositions, worldPositions, x0_distance, forceOrbitView
	} = args;
	if (!system || !canvas) return { pan: currentPan, zoom: currentZoom };
	const nodesById = new Map(system.nodes.map((n) => [n.id, n]));
	let targetNode = nodesById.get(nodeId);
	if (targetNode && (targetNode as any).ui_parentId) {
		const parentNode = nodesById.get((targetNode as any).ui_parentId);
		if (parentNode) { targetNode = parentNode; nodeId = parentNode.id; }
	}
	const targetPositions = toytownFactor > 0 ? scaledWorldPositions : worldPositions;
	const targetPosition = targetPositions.get(nodeId);
	if (targetNode && targetNode.roleHint === 'ring') {
		if (targetPosition) {
			let outerRadiusAU = ((targetNode as any).radiusOuterKm || 100000) / AU_KM;
			if (toytownFactor > 0) outerRadiusAU = scaleBoxCox(outerRadiusAU, toytownFactor, x0_distance);
			const paddingFactor = 3.0;
			const targetWorldRadius = outerRadiusAU * paddingFactor;
			let newZoom = currentZoom;
			if (targetWorldRadius > 0) {
				const minDimension = Math.min(canvas.width, canvas.height);
				newZoom = (minDimension / 2) / targetWorldRadius;
			}
			return { pan: targetPosition, zoom: clampZoom(newZoom) };
		}
	}
	if (!targetNode || !targetPosition) return { pan: currentPan, zoom: currentZoom };
	const children = system.nodes.filter((n) => n.parentId === nodeId);
	if (children.length > 0 && !forceOrbitView) {
		let maxDistance = children.reduce((max, node) => {
			const childPos = targetPositions.get(node.id);
			if (childPos) {
				const dx = childPos.x - targetPosition.x;
				const dy = childPos.y - targetPosition.y;
				return Math.max(max, Math.sqrt(dx * dx + dy * dy));
			}
			return max;
		}, 0);
		let minSize = 0.0001;
		if (targetNode.kind === 'body' && (targetNode as any).radiusKm) {
			let radiusInAU = ((targetNode as any).radiusKm || 0) / AU_KM;
			if (toytownFactor > 0) radiusInAU = scaleBoxCox(radiusInAU, toytownFactor, x0_distance);
			minSize = radiusInAU;
		}
		maxDistance = Math.max(maxDistance, minSize * 3);
		const paddingFactor = 1.1;
		const targetWorldRadius = maxDistance * paddingFactor;
		let newZoom = currentZoom;
		if (targetWorldRadius > 0) {
			const minDimension = Math.min(canvas.width, canvas.height);
			newZoom = (minDimension / 2) / targetWorldRadius;
		}
		return { pan: targetPosition, zoom: clampZoom(newZoom) };
	} else {
		if (targetNode.parentId) {
			const parentPos = targetPositions.get(targetNode.parentId);
			if (parentPos) {
				const dx = targetPosition.x - parentPos.x;
				const dy = targetPosition.y - parentPos.y;
				const rawDistance = Math.sqrt(dx * dx + dy * dy);
				let bodyRadiusAU = 0;
				if (targetNode.kind === 'body' && (targetNode as any).radiusKm) {
					bodyRadiusAU = (targetNode as any).radiusKm / AU_KM;
					if (toytownFactor > 0) bodyRadiusAU = scaleBoxCox(bodyRadiusAU, toytownFactor, x0_distance);
				}
				const distance = Math.max(rawDistance, bodyRadiusAU * 2, 1e-8);
				const minDimension = Math.min(canvas.width, canvas.height);
				const marginFactor = 0.9;
				const newZoom = (minDimension / 2 * marginFactor) / distance;
				return { pan: targetPosition, zoom: clampZoom(newZoom) };
			}
		}
		let bodyRadius = 0;
		if (targetNode.kind === 'body' && (targetNode as any).radiusKm) {
			bodyRadius = (targetNode as any).radiusKm / AU_KM;
			if (toytownFactor > 0) bodyRadius = scaleBoxCox(bodyRadius, toytownFactor, x0_distance);
		}
		const paddingFactor = 20;
		const targetWorldSize = (bodyRadius > 0 ? bodyRadius * 2 : 0.01) * paddingFactor;
		let newZoom = currentZoom;
		if (targetWorldSize > 0) {
			const minDimension = Math.min(canvas.width, canvas.height);
			newZoom = minDimension / targetWorldSize;
		}
		return { pan: targetPosition, zoom: clampZoom(newZoom) };
	}
}

// Level-aware framing — the consistent click ladder (see FRAME_LEVELS). Always centres on the
// object; the level chooses the extent. A barycentre is treated as one object (its members are its
// satellites at level 2, the same as a planet's moons). Callers pass a level that's known to exist
// (use availableFrameLevels); if it somehow doesn't, this falls through to the close (level-3) view.
export function frameForLevel(args: {
	nodeId: string;
	level: number;
	system: System | null;
	canvas: HTMLCanvasElement | null;
	currentPan: PanState;
	currentZoom: number;
	toytownFactor: number;
	scaledWorldPositions: WorldPositions;
	worldPositions: WorldPositions;
	x0_distance: number;
	config?: FrameLevelConfig;
}): { pan: PanState; zoom: number } {
	const {
		nodeId, level, system, canvas, currentPan, currentZoom, toytownFactor,
		scaledWorldPositions, worldPositions, x0_distance
	} = args;
	const cfg = args.config ?? FRAME_LEVELS;
	if (!system || !canvas) return { pan: currentPan, zoom: currentZoom };
	const nodesById = new Map(system.nodes.map((n) => [n.id, n]));
	const node: any = nodesById.get(nodeId);
	const positions = toytownFactor > 0 ? scaledWorldPositions : worldPositions;
	const pos = node ? positions.get(nodeId) : undefined;
	if (!node || !pos) return { pan: currentPan, zoom: currentZoom };
	const minDimension = Math.min(canvas.width, canvas.height);
	const radiusAU = bodyRadiusAUof(node, toytownFactor, x0_distance);

	// A ring frames to its own outer edge regardless of level.
	if (node.roleHint === 'ring') {
		let outerRadiusAU = (node.radiusOuterKm || 100000) / AU_KM;
		if (toytownFactor > 0) outerRadiusAU = scaleBoxCox(outerRadiusAU, toytownFactor, x0_distance);
		const half = outerRadiusAU / Math.max(0.05, 1 - cfg.satelliteBorderFrac);
		return { pan: pos, zoom: clampZoom((minDimension / 2) / Math.max(half, 1e-9)) };
	}

	// Measure this renderer's own distances (AU), then let the shared ladder decide the extent.
	const parentId = framingParentId(node);
	const ppos = parentId ? positions.get(parentId) : undefined;
	const parentDist = ppos ? Math.hypot(pos.x - ppos.x, pos.y - ppos.y) : 0;
	let maxSatelliteDist = 0;
	for (const c of system.nodes) {
		if (c.parentId !== nodeId) continue;
		const cp = positions.get(c.id);
		if (cp) maxSatelliteDist = Math.max(maxSatelliteDist, Math.hypot(cp.x - pos.x, cp.y - pos.y));
	}
	// Radius-less nodes (constructs) get a small fixed patch — their glyph is screen-fixed anyway.
	const half = frameHalfExtent({ level, radius: radiusAU, parentDist, maxSatelliteDist, config: cfg }) || 0.005;
	return { pan: pos, zoom: clampZoom((minDimension / 2) / Math.max(half, 1e-9)) };
}
