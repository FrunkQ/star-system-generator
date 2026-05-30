// Pure camera/zoom helpers + bounds, extracted from SystemVisualizer (Phase 01.8)
// so the touch-input layer (Phase 2) has a viewport API that isn't buried in a
// Svelte component. State-dependent framing helpers (calculateFrameForNode,
// shouldSuppressAutoZoomNearPeriapsis) follow as arg-bag functions.

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
