// EVERY WebGL SURFACE IN THE APP IS BORN HERE, so the things we ask the browser for are asked ONCE.
//
// C20, the owner writing up a fault for his users, 2026-09-08: *"If I use SSE on an old browser with
// loads of old tabs open and open 'Size Comparison' or a Holoview I get a total lockup. SSE can't be
// given the memory it needs. (It will eventually work... Kill it!) MS Edge seems particularly prone
// to this... Just open SSE in a fresh browser and it purrs along nicely."* And his question: is this
// a formal request for resources that we are NOT making? It was, and this file is where we make it.
//
// SIX SITES EACH WROTE THEIR OWN `new THREE.WebGLRenderer` (the holo, the size comparison, the
// gallery, the filtered document canvas, the starmap and the model viewer). That is six copies of
// one decision, which is this codebase's most recurring recorded fault, and the copies had already
// drifted in exactly the way the standing rule predicts - the test being not "is this duplicated
// code" but "could these two answer the same question differently":
//
//   * NOT ONE passed `powerPreference`, so on a laptop with switchable graphics we never once asked
//     for the discrete GPU and silently took whichever chip the browser felt like giving us.
//   * The PIXEL RATIO CAP - the single biggest lever in the app (G83: a ratio of 2 is FOUR times the
//     fragments of 1, and fill rate is what an alpha-heavy scene is short of) - was written six
//     times in four different orderings. Two sites called `pixelRatioFor`; four open-coded
//     `Math.min(2, dpr)`; and only ONE of those four guarded `typeof window`, so the same question
//     genuinely had two answers - four of them threw under SSR and one did not.
//
// So the factory takes the things that genuinely differ between surfaces as ARGUMENTS, and owns
// everything that does not. A caller may not reach past it: `glRendererSites.spec.ts` fails the
// suite on a bare `new THREE.WebGLRenderer` anywhere outside this file.

import * as THREE from 'three';
import { pixelRatioFor } from './lowPowerRender';
import { renderPath, renderPathNotice, renderPathMessage } from './glSoftwareProbe';
import { proposeLowPower } from '$lib/lowPowerStore';

/** What a surface is allowed to differ about. Everything absent from here is the factory's call. */
export interface GlRendererOptions {
	canvas: HTMLCanvasElement;
	/**
	 * A short name for this surface, used in diagnostics and warnings ('holo', 'comparison', ...).
	 * It is what turns "a WebGL context was lost" into a sentence naming which view went dark.
	 */
	surface: string;
	/**
	 * Does the page show through the canvas? The holo, gallery, starmap, filtered canvas and model
	 * viewer all composite over chrome behind them; the size comparison paints its own black
	 * backdrop edge to edge and gains nothing from an alpha channel it never reads.
	 */
	alpha?: boolean;
	/**
	 * Kept per-site and NOT defaulted here on purpose: every surface currently wants it, but MSAA is
	 * bought with memory and fill rate, so a future low-power decision has to be able to say no on a
	 * per-surface basis. Passing it explicitly keeps that a decision rather than an omission.
	 */
	antialias?: boolean;
	/**
	 * Keep the last presented frame readable so something else can copy this canvas.
	 *
	 * THIS IS NOT A FREE FLAG AND MUST NOT BE SET "JUST IN CASE": it forces the browser to keep the
	 * drawing buffer alive after presenting instead of discarding it, which costs memory on every
	 * surface that carries it - and memory is precisely what C20 is about. It is here because A38
	 * needs it: a body graphic gets INSIDE the document's filter pass by being copied out of its own
	 * canvas, and without this it copies out BLANK. Only a surface that is genuinely captured should
	 * ask for it.
	 */
	preserveDrawingBuffer?: boolean;
	/**
	 * This machine is short of fill rate. Only the initial pixel ratio: a surface that can be told
	 * later calls `renderer.setPixelRatio(pixelRatioFor(on))` itself, followed by a `setSize`.
	 */
	lowPower?: boolean;
}

/**
 * THE FORMAL REQUEST THE OWNER ASKED ABOUT, and the answer to "are we not asking for something?".
 *
 * On a machine with two graphics chips - which is most laptops - the browser picks one when it
 * creates the context, and with no hint at all it is entitled to hand back the integrated chip to
 * save battery. `'high-performance'` is the WebGL specification's way of saying this surface would
 * rather have the fast one. It is a HINT and not a guarantee: a browser may refuse it on battery, or
 * because the machine only has one GPU, and it cannot be changed after the context exists.
 *
 * IT IS DELIBERATELY NOT TIED TO THE LOW-POWER SWITCH, and that reads backwards until you see why.
 * Low power means "this machine is struggling", and the answer to a machine that is struggling is
 * the BEST chip it has, not the frugal one - `'low-power'` here would hand a slow machine the slower
 * of its two GPUs, which is the opposite of what the switch is for. Low power buys its savings by
 * doing less work (fewer fragments, fewer frames, fewer shells), not by asking for a worse chip.
 */
const POWER_PREFERENCE: WebGLPowerPreference = 'high-performance';

/**
 * ASK ONCE, THE FIRST TIME ANYTHING 3D IS BUILT, and act on a no.
 *
 * Here rather than at start-up because it is only a question worth asking of a session that actually
 * draws something: a GM who never opens a 3D view should not pay for a context creation, and should
 * certainly not be told his graphics are slow.
 *
 * ON A REFUSAL WE DO NOT REFUSE. The context is built anyway, exactly as before - a software-drawn
 * holo is slow, but it is a holo, and taking it away would be answering a performance problem with
 * an outage. What changes is that low power comes on for the session and the GM is handed a sentence
 * saying what happened and what to do, which is the difference between a slow view and a hang
 * nobody can explain.
 */
let asked = false;
function askOnce(): void {
	if (asked) return;
	asked = true;
	const path = renderPath();
	if (path === 'gpu') return;
	// Low power cannot rescue a machine with no WebGL at all, so it is only proposed for the software
	// path. `proposeLowPower` is the SAME switch the GM controls and it stands down if they have
	// already answered - there is deliberately no way from here to overrule a person.
	if (path === 'software') proposeLowPower(true, 'this browser is rendering 3D in software');
	renderPathMessage.set(renderPathNotice(path));
}

/**
 * Build the one kind of renderer this app makes.
 *
 * `failIfMajorPerformanceCaveat` is NOT passed here, and that is a decision rather than an omission:
 * it must be probed on a throwaway context first, because a refusal has to leave us running rather
 * than throwing (steer, don't stop). See `glSoftwareProbe.ts`.
 */
export function createGlRenderer(opts: GlRendererOptions): THREE.WebGLRenderer {
	askOnce();
	const renderer = new THREE.WebGLRenderer({
		canvas: opts.canvas,
		antialias: opts.antialias ?? false,
		alpha: opts.alpha ?? false,
		preserveDrawingBuffer: opts.preserveDrawingBuffer ?? false,
		powerPreference: POWER_PREFERENCE
	});
	// One cap, one guard, one place. `setPixelRatio` does nothing on its own - the drawing buffer
	// keeps its old dimensions until a `setSize` follows, which every caller does on its first
	// resize.
	renderer.setPixelRatio(pixelRatioFor(!!opts.lowPower));
	return renderer;
}
