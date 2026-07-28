// ─── Transition Parameter Types ───────────────────────────────────────────────

export interface TransitionSliderParam {
  type: 'slider';
  id: string;
  label: string;
  min: number;
  max: number;
  step: number;
  default: number;
  unit?: string;
}

export interface TransitionSelectParam {
  type: 'select';
  id: string;
  label: string;
  options: { value: string; label: string }[];
  default: string;
}

export interface TransitionColorParam {
  type: 'color';
  id: string;
  label: string;
  /** '#rrggbb' hex string. */
  default: string;
}

export type TransitionParam = TransitionSliderParam | TransitionSelectParam | TransitionColorParam;

// ─── Runtime Context ──────────────────────────────────────────────────────────

/**
 * Passed to each transition's play() function.
 *
 * overlay  — full-screen canvas sitting above the Three.js renderer.
 *            Draw on this to animate the old frame away.
 * snapshot — captured frame of the old map (before the map change).
 *            The engine has already applied the new map to the Three.js
 *            canvas underneath before play() is called, so animating the
 *            snapshot away will reveal the fully-loaded new content.
 * params   — resolved param values for this transition instance.
 */
export interface TransitionContext {
  overlay: HTMLCanvasElement;
  snapshot: ImageBitmap;
  params: Record<string, number | string>;
  /** Aborted when the engine receives a cancel() request — typically
   *  because the GM clicked Cancel Animation on a handout reveal.
   *  Transition implementations should pass this through to animate()
   *  so the rAF loop exits early on cancellation. */
  signal?: AbortSignal;
}

// ─── Transition Definition ────────────────────────────────────────────────────

export interface TransitionDefinition {
  id: string;
  label: string;
  params: TransitionParam[];
  /**
   * Suitability flag for handout (text-map) reveal animations. A
   * handout reveal runs the transition from "background + noAnimate
   * elements" (snapshot) to "background + all elements" (the layer
   * underneath). Effects where the snapshot DISSOLVES / FADES / WIPES
   * away cleanly suit this — anything that slides or zooms the whole
   * frame doesn't, because static elements would move too.
   * Default: false. */
  forHandout?: boolean;
  /**
   * Runs the full transition animation on the overlay canvas.
   * Must return a Promise that resolves when the transition is complete.
   * The engine will clear the overlay canvas after resolution.
   */
  play(ctx: TransitionContext): Promise<void>;
}
