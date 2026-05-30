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
