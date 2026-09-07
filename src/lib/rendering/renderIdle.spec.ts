import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { shouldRender, IDLE_HEARTBEAT_MS, type IdleInputs } from './renderIdle';

// Owner, 2026-09-07: "do the render loop throttle - pause when nothing moves". The biggest saving
// available on a laptop, and the most dangerous change in the renderer: the cost of being wrong is a
// map that has silently stopped updating.

const still: IdleInputs = {
	dirty: false, cameraMoving: false, animated: false, clockAdvancing: false, sinceLastFrameMs: 0
};

describe('a frame is skipped only when every reason to draw is absent', () => {
	it('draws for ANY single reason, one at a time', () => {
		// The shape of the law is the safety property: every clause says YES, and there is no clause
		// that says no. A reason to skip is only ever the absence of every reason to draw.
		expect(shouldRender({ ...still, dirty: true })).toBe(true);
		expect(shouldRender({ ...still, cameraMoving: true })).toBe(true);
		expect(shouldRender({ ...still, animated: true })).toBe(true);
		expect(shouldRender({ ...still, clockAdvancing: true })).toBe(true);
		expect(shouldRender({ ...still, sinceLastFrameMs: IDLE_HEARTBEAT_MS })).toBe(true);
	});

	it('idles only when NOTHING is happening', () => {
		expect(shouldRender(still)).toBe(false);
		expect(shouldRender({ ...still, sinceLastFrameMs: IDLE_HEARTBEAT_MS - 1 })).toBe(false);
	});

	it('keeps drawing at least once a second whatever the bookkeeping says', () => {
		// THE SAFETY NET, and it is the reason this feature can ship at all. However careful the
		// dirty-marking, one day something will change the scene without saying so; a frame taken at
		// least once a second makes the worst case a picture up to a second late rather than a picture
		// wrong until somebody touches it.
		expect(shouldRender({ ...still, sinceLastFrameMs: IDLE_HEARTBEAT_MS })).toBe(true);
		expect(shouldRender({ ...still, sinceLastFrameMs: 60_000 })).toBe(true);
		expect(IDLE_HEARTBEAT_MS).toBeLessThanOrEqual(1000);   // a second is the most anyone should wait
		expect(IDLE_HEARTBEAT_MS).toBeGreaterThan(100);        // ...and a heartbeat is not a frame rate
	});

	it('fails TOWARD drawing on a broken clock', () => {
		// A NaN elapsed time must not read as "recent" and freeze the view solid. The comparison is
		// written the way round that makes this true.
		expect(shouldRender({ ...still, sinceLastFrameMs: NaN })).toBe(true);
		expect(shouldRender({ ...still, sinceLastFrameMs: -1 })).toBe(false);   // a clock that ran backwards is still recent
	});
});

// The loop cannot be run in a unit test - it needs WebGL - so its wiring is read out of the SOURCE,
// this project's idiom for a seam a test cannot reach. Every line below is a way the picture could
// silently stop updating, which is why they are pinned rather than trusted.
describe('the holo wires it to signals that cannot be forgotten', () => {
	const scene = readFileSync('src/lib/holo/scene.ts', 'utf8');

	it('marks itself dirty on EVERY public call, rather than on a list that would rot', () => {
		// Forty-odd setters, and the next person to add one has no way of knowing about a list. The
		// wrapper costs a closure per method and a wasted frame per call; in exchange nothing can be
		// forgotten.
		expect(scene).toContain('const api: HoloController =');
		expect(scene).toContain('for (const key of Object.keys(api) as (keyof HoloController)[])');
		expect(scene).toContain('markDirty();');
		expect(scene).toContain('return api;');
	});

	it('hears every camera move, including damping after the hand has gone', () => {
		expect(scene).toContain("controls.addEventListener('change', markDirty)");
		// ...and the three motions OrbitControls does not announce, because the scene causes them.
		expect(scene).toContain('cameraMoving: controls.autoRotate || reframing || viewInsetCur !== viewInsetTarget');
	});

	it('treats a repeated clock value as STILL, which is the case it exists for', () => {
		// A host may call setTime every frame with the same number while the clock is paused. The
		// comparison, not the call, is what counts as motion.
		expect(scene).toContain('if (ms !== timeMs) markDirty();');
		expect(scene).toContain('clockAdvancing: timeMs !== lastDrawnTimeMs');
	});

	it('asks BEFORE the update passes, since the work is most of the cost of a frame', () => {
		const at = scene.indexOf('const idleDraw = shouldRender({');
		expect(at).toBeGreaterThan(-1);
		// Twenty passes over every body run after this point; none of them should run for a frame
		// that is not going to be drawn.
		expect(scene.indexOf('updateStarFx(nowSec)')).toBeGreaterThan(at);
		expect(scene.indexOf('updateAuroras(nowSec)')).toBeGreaterThan(at);
		expect(scene.indexOf('renderer.render(scene, camera)')).toBeGreaterThan(at);
	});

	it('recomputes what is animating rather than caching it', () => {
		// A cached answer that went stale would freeze the picture - the one failure this feature must
		// not have - and the recomputation is a handful of array lengths.
		expect(scene).toContain('recomputeSelfAnimating();');
		const at = scene.indexOf('function recomputeSelfAnimating()');
		const body = scene.slice(at, at + 1400);
		for (const arr of ['auroraVisuals', 'magmaVisuals', 'lightningVisuals', 'plumeVisuals', 'cloudVisuals']) {
			expect(body, arr).toContain(`${arr}.length > 0`);
		}
		// A QUIET star does not hold the loop awake; an active, jetting or flaring one does.
		expect(body).toContain('s.activity > 0.01');
		expect(body).toContain('!!s.jet');
		expect(body).toContain('s.flares.length > 0');
	});

	it('lets a quiet system reach idle by freezing the corona pulse on low power', () => {
		// Freezing a pulse leaves no artefact (unlike a bolt), and without it an active star would
		// hold the loop awake for ever on its own - so this is what makes the feature reachable.
		expect(scene).toContain('if (!lowPowerOn) updateStarFx(nowSec);');
		expect(scene).toContain('(!lowPowerOn && starVisuals.some(');
	});
});
