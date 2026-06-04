// src/lib/input/gestures.ts
// Unified PointerEvent gesture layer (Phase 02). A Svelte action that turns any element
// (canvas or SVG) into a pan / pinch / tap / long-press / wheel-zoom surface, so touch and
// mouse share one code path. Desktop behaviour is preserved: wheel = zoom, primary click =
// tap, right-click (contextmenu) or touch long-press = onLongPress. Contract is the one
// specified in CLAUDE-CODE-HANDOFF.md 02.1.

export interface GestureHandlers {
  onPanStart?: (p: { x: number; y: number }) => void;
  onPan?: (e: { dx: number; dy: number; x: number; y: number }) => void;
  onPanEnd?: (e: { vx: number; vy: number }) => void; // velocity (px/s) for inertia
  onZoom?: (e: { factor: number; x: number; y: number }) => void;
  onTap?: (e: { x: number; y: number }) => void;
  onLongPress?: (e: { x: number; y: number }) => void;
}

const PAN_THRESHOLD_PX = 8; // movement under this from the down point is a tap, not a pan
const LONG_PRESS_MS = 480;
const VELOCITY_WINDOW_MS = 80; // sample window used to compute release velocity for inertia
const WHEEL_ZOOM_STEP = 1.12;

interface Point {
  x: number;
  y: number;
}
interface VelocitySample {
  t: number;
  x: number;
  y: number;
}

export function gestures(node: HTMLElement | SVGElement, opts: GestureHandlers = {}) {
  let handlers: GestureHandlers = opts;
  const pointers = new Map<number, Point>();

  let gestureActive = false; // a single-pointer gesture is in progress (pre- or post-threshold)
  let panning = false; // movement has crossed PAN_THRESHOLD_PX
  let pinching = false; // two pointers down
  let cancelled = false; // long-press fired -> swallow the rest of this gesture
  let startX = 0;
  let startY = 0; // initial down point (threshold + tap origin)
  let lastX = 0;
  let lastY = 0; // last pan point
  let lastDist = 0; // last pinch distance
  let longPressTimer: ReturnType<typeof setTimeout> | null = null;
  let velocity: VelocitySample[] = [];

  function localPoint(e: { clientX: number; clientY: number }): Point {
    const rect = node.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  }

  function clearLongPress() {
    if (longPressTimer !== null) {
      clearTimeout(longPressTimer);
      longPressTimer = null;
    }
  }

  function distance(a: Point, b: Point) {
    return Math.hypot(a.x - b.x, a.y - b.y);
  }
  function midpoint(a: Point, b: Point): Point {
    return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
  }

  function onPointerDown(e: PointerEvent) {
    // Only the primary mouse button starts a pan/tap; right-click arrives via contextmenu.
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    try {
      node.setPointerCapture?.(e.pointerId);
    } catch {
      /* setPointerCapture can throw if the pointer is already gone; ignore */
    }
    const p = localPoint(e);
    pointers.set(e.pointerId, p);

    if (pointers.size === 1) {
      gestureActive = true;
      panning = false;
      pinching = false;
      cancelled = false;
      startX = lastX = p.x;
      startY = lastY = p.y;
      velocity = [{ t: e.timeStamp, x: p.x, y: p.y }];
      clearLongPress();
      longPressTimer = setTimeout(() => {
        longPressTimer = null;
        if (!panning && !pinching) {
          cancelled = true;
          handlers.onLongPress?.({ x: startX, y: startY });
        }
      }, LONG_PRESS_MS);
    } else if (pointers.size === 2) {
      // Second finger down -> pinch; abandon any pending pan/long-press.
      clearLongPress();
      panning = false;
      pinching = true;
      const [a, b] = [...pointers.values()];
      lastDist = distance(a, b);
    }
  }

  function onPointerMove(e: PointerEvent) {
    if (!pointers.has(e.pointerId)) return;
    const p = localPoint(e);
    pointers.set(e.pointerId, p);

    if (pinching && pointers.size >= 2) {
      const [a, b] = [...pointers.values()];
      const newDist = distance(a, b);
      if (lastDist > 0 && newDist > 0) {
        const mid = midpoint(a, b);
        handlers.onZoom?.({ factor: newDist / lastDist, x: mid.x, y: mid.y });
      }
      lastDist = newDist;
      return;
    }

    if (!gestureActive || cancelled) return;

    if (!panning) {
      if (Math.hypot(p.x - startX, p.y - startY) < PAN_THRESHOLD_PX) return;
      panning = true;
      clearLongPress();
      lastX = startX;
      lastY = startY;
      handlers.onPanStart?.({ x: startX, y: startY });
    }

    const dx = p.x - lastX;
    const dy = p.y - lastY;
    lastX = p.x;
    lastY = p.y;
    handlers.onPan?.({ dx, dy, x: p.x, y: p.y });

    velocity.push({ t: e.timeStamp, x: p.x, y: p.y });
    const cutoff = e.timeStamp - VELOCITY_WINDOW_MS;
    while (velocity.length > 2 && velocity[0].t < cutoff) velocity.shift();
  }

  function endPointer(e: PointerEvent) {
    if (!pointers.has(e.pointerId)) return;
    try {
      node.releasePointerCapture?.(e.pointerId);
    } catch {
      /* ignore */
    }
    const wasPanning = panning;
    const releasePoint = pointers.get(e.pointerId)!;
    pointers.delete(e.pointerId);

    if (pinching) {
      if (pointers.size < 2) {
        pinching = false;
        // One finger still down -> resume a fresh pan from it (no jump).
        if (pointers.size === 1) {
          const remaining = [...pointers.values()][0];
          gestureActive = true;
          panning = false;
          startX = lastX = remaining.x;
          startY = lastY = remaining.y;
          velocity = [{ t: e.timeStamp, x: remaining.x, y: remaining.y }];
        }
      }
      return;
    }

    if (pointers.size > 0) return; // other pointers still down

    clearLongPress();
    const movedDist = Math.hypot(releasePoint.x - startX, releasePoint.y - startY);

    if (cancelled) {
      // long-press already handled this gesture
    } else if (!wasPanning && movedDist < PAN_THRESHOLD_PX) {
      handlers.onTap?.({ x: releasePoint.x, y: releasePoint.y });
    } else if (wasPanning) {
      let vx = 0;
      let vy = 0;
      if (velocity.length >= 2) {
        const first = velocity[0];
        const last = velocity[velocity.length - 1];
        const dt = (last.t - first.t) / 1000;
        if (dt > 0) {
          vx = (last.x - first.x) / dt;
          vy = (last.y - first.y) / dt;
        }
      }
      handlers.onPanEnd?.({ vx, vy });
    }

    gestureActive = false;
    panning = false;
    cancelled = false;
  }

  function onWheel(e: WheelEvent) {
    e.preventDefault();
    const p = localPoint(e);
    const factor = e.deltaY < 0 ? WHEEL_ZOOM_STEP : 1 / WHEEL_ZOOM_STEP;
    handlers.onZoom?.({ factor, x: p.x, y: p.y });
  }

  function onContextMenu(e: MouseEvent) {
    e.preventDefault();
    const p = localPoint(e);
    handlers.onLongPress?.({ x: p.x, y: p.y });
  }

  node.addEventListener('pointerdown', onPointerDown as EventListener);
  node.addEventListener('pointermove', onPointerMove as EventListener);
  node.addEventListener('pointerup', endPointer as EventListener);
  node.addEventListener('pointercancel', endPointer as EventListener);
  node.addEventListener('wheel', onWheel as EventListener, { passive: false });
  node.addEventListener('contextmenu', onContextMenu as EventListener);

  return {
    update(next: GestureHandlers = {}) {
      handlers = next;
    },
    destroy() {
      clearLongPress();
      node.removeEventListener('pointerdown', onPointerDown as EventListener);
      node.removeEventListener('pointermove', onPointerMove as EventListener);
      node.removeEventListener('pointerup', endPointer as EventListener);
      node.removeEventListener('pointercancel', endPointer as EventListener);
      node.removeEventListener('wheel', onWheel as EventListener);
      node.removeEventListener('contextmenu', onContextMenu as EventListener);
    }
  };
}
