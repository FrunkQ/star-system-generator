import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

/**
 * C21: THE SIZE COMPARISON BLOCKS THE MAIN THREAD WHILE IT BUILDS - measured, then spread.
 *
 * The owner, 2026-09-08, with a screenshot of Chrome's "This page isn't responding" dialog over the
 * size comparison on beta, four times on ONE PC, while a 40-star starmap loaded instantly beside it:
 * *"Do we need to make memory demands. Any metering I can put in place to check"*.
 *
 * THE DIALOG IS THE DIAGNOSIS, AND IT SAYS THIS IS NOT [[C20]]. "This page isn't responding" is the
 * browser reporting a BLOCKED MAIN THREAD - one JavaScript task that ran for seconds without
 * yielding. Memory pressure and a slow GPU do not produce it: they make frames late, and a late
 * frame still yields between frames. So no amount of asking the browser for memory or for the fast
 * GPU can fix it, and C20's three requests do not touch it. Same surface, different fault.
 *
 * WHAT IS ACTUALLY SYNCHRONOUS: every body entering the window is built inside one `reconcile()`
 * call, and `buildBodyLook` generates 1024x512 textures on the CPU. Ten bodies arriving together is
 * ten lots of that between one frame and the next. The starmap is fast because a star there is a
 * glyph sharing one glow texture, not a textured globe.
 *
 * THE FIX IS THE OWNER'S OWN: *"if its textures you can have a default spinning wireframe globe and
 * add textures as they are generated"*, *"keep the UI usable meanwhile"*. And on the view once it is
 * up: *"once LOADED it works a lot better now - that will be the demand for 3d capability"* - the
 * cost is at BUILD time, not in steady-state drawing, which is where this aims.
 *
 * The scene cannot be built under vitest (no WebGL), so these read the DECISIONS as source - the
 * shape `glRendererSites.spec.ts` uses.
 */

const SRC = 'src/lib/holo/comparisonScene.ts';
const src = readFileSync(SRC, 'utf8');
/** The measured region: from the timer starting to the event being recorded. */
const region = src.slice(src.indexOf('function reconcile'), src.indexOf("perfEvent('comparison.build'") + 300);
/** The build loop alone, before the reporting. */
const loop = src.slice(src.indexOf('function reconcile'), src.indexOf("perfEvent('comparison.build'"));

describe('the size comparison says what its build cost (C21)', () => {
	it('times the build and records how many bodies it built', () => {
		expect(region).toMatch(/performance\.now\(\)/);
		expect(region).toMatch(/builtThisPass\+\+/);
		expect(region).toMatch(/perfEvent\('comparison\.build'/);
		expect(region).toMatch(/bodies: builtThisPass/);
	});

	it('is NOT behind the verbose perf switch - a freeze cannot be predicted', () => {
		// `perfCount` and `perfEvent` are always collected by design. Nobody can switch tracing on
		// BEFORE a freeze they did not expect, so a guard here would leave the only sessions worth
		// measuring unmeasured.
		expect(region).not.toMatch(/perfEnabled\(\)/);
	});

	it('costs nothing when the strip is settled', () => {
		// reconcile() runs EVERY FRAME. An event per frame would be its own performance problem and
		// would bury the real ones in the ring.
		expect(region).toMatch(/if \(!builtThisPass\) return;/);
	});

	it('only reports a build slow enough to be seen as a stall', () => {
		expect(src).toMatch(/SLOW_BUILD_MS = 100/);
		expect(region).toMatch(/ms >= SLOW_BUILD_MS/);
	});

	it('exposes a live gauge as well as the after-the-fact ring', () => {
		expect(src).toMatch(/perfProvider\('comparison'/);
		expect(src).toMatch(/worstBuildMs/);
	});
});

describe('the build yields, and never starves (C21)', () => {
	it('stops building once the frame budget is gone and leaves a wireframe', () => {
		expect(loop).toMatch(/spentMs >= BUILD_BUDGET_MS/);
		expect(loop).toMatch(/ensurePlaceholder\(slot\)/);
	});

	it('ALWAYS builds at least one per pass - the starvation bug inside the fairness rule', () => {
		// Without `builtThisPass > 0` a machine slow enough to blow the budget on its FIRST body would
		// never finish one, and the strip would stay wireframe for ever.
		expect(loop).toMatch(/builtThisPass > 0 && spentMs >= BUILD_BUDGET_MS/);
	});

	it('keeps the budget under half a 60 Hz frame', () => {
		// Bigger than this and the yield stops being one: the browser still cannot paint or answer a
		// click inside the gap, which is the whole complaint.
		const ms = Number(/BUILD_BUDGET_MS = (\d+)/.exec(src)?.[1]);
		expect(ms).toBeGreaterThan(0);
		expect(ms).toBeLessThanOrEqual(8);
	});

	it('replaces the wireframe when the real body lands, and sweeps ones that scrolled away', () => {
		expect(loop).toMatch(/clearPlaceholder\(slot\.id\)/);
		expect(src).toMatch(/placeholders\.keys\(\)\]\) if \(!wanted\.has\(id\)\) clearPlaceholder\(id\)/);
	});

	it('shares ONE geometry and ONE material across every placeholder', () => {
		// A wireframe per body that allocated its own sphere would be a second build cost hiding
		// inside the fix for the first.
		expect(src).toMatch(/const PLACEHOLDER_GEO = new THREE\.SphereGeometry\(1,/);
		expect(src).toMatch(/new THREE\.Mesh\(PLACEHOLDER_GEO, PLACEHOLDER_MAT\)/);
		expect(src).toMatch(/mesh\.scale\.setScalar/);
	});

	it('spins them, and disposes the shared pair exactly once at teardown', () => {
		expect(src).toMatch(/for \(const mesh of placeholders\.values\(\)\) mesh\.rotation\.y \+=/);
		expect(src.match(/PLACEHOLDER_GEO\.dispose\(\)/g) ?? []).toHaveLength(1);
	});

	it('reports how many it put off, which is the evidence the budget is working', () => {
		expect(src).toMatch(/comparison\.bodiesDeferred/);
		expect(src).toMatch(/deferred: deferredThisPass/);
	});
});

/**
 * C21c: A DIFFERENT SIZE IS A SCALE, AND WHAT IS BUILT STAYS BUILT.
 *
 * The owner, still on it after the texture fix, 2026-09-08: *"I am still getting textures
 * disappearing as I switch between moons/planets - we need to keep EVERY texture currently being
 * displayed in the scene. Having it retexture and eventually hang as I move between planets is
 * wrong."*
 *
 * He had the cause. The strip's scale FOLLOWS THE FOCUS (`scaleForFocus`), so choosing a different
 * moon changes `diameterPx` for EVERY object at once - and the reuse test compared that number for
 * equality, so every focus change destroyed and rebuilt the whole visible strip. Nothing about any
 * body had changed; only how big it was being drawn.
 *
 * Scaling is not an approximation of the rebuild, it is the SAME PICTURE: tessellation in `bodyLook`
 * is a fixed 16/10 or 32/24 and is never derived from the radius, so a globe built at one radius and
 * scaled to another is identical to one built at the second.
 */
describe('a different size is a scale, not a rebuild (C21c)', () => {
	const reuse = src.slice(src.indexOf('if (existing && sameShape(existing, slot))'), src.indexOf('if (existing) { destroy(slot.id); }'));

	it('re-uses the existing body and scales it', () => {
		expect(reuse).toMatch(/group\.scale\.setScalar\(radiusNow \/ existing\.builtRadius\)/);
		expect(reuse).not.toMatch(/destroy\(/);
	});

	it('remembers the radius it was built at, or there is nothing to scale against', () => {
		expect(src).toMatch(/builtRadius: radius/);
		expect(src).toMatch(/builtRadius: number/);
	});

	it('tells the lensing pass the new radius - it is fed in pixels and is not a child of the group', () => {
		expect(reuse).toMatch(/existing\.lens\.radiusPx = radiusNow/);
	});

	it('rebuilds ONLY when the ring changes width relative to its planet', () => {
		// The one thing a uniform scale cannot express. Everything else in a look is a multiple of the
		// radius and a child of the group, so one scale keeps every proportion as built.
		expect(src).toMatch(/function sameShape/);
		expect(src).toMatch(/ringRatioOf\(slot\) - existing\.builtRingRatio/);
		expect(src).toMatch(/function ringRatioOf/);
	});

	it('compares that ratio with a tolerance, because both figures are re-derived floats', () => {
		expect(src).toMatch(/< 1e-4/);
	});
});

describe('what is built stays built (C21c)', () => {
	it('a body that scrolls out is HIDDEN, not destroyed', () => {
		expect(src).toMatch(/for \(const \[id, b\] of built\) if \(!wanted\.has\(id\)\) b\.group\.visible = false;/);
	});

	it('and is shown again when it comes back', () => {
		expect(src).toMatch(/existing\.group\.visible = true/);
	});

	it('but the kept set is capped, furthest from the window evicted first', () => {
		expect(src).toMatch(/const KEEP_MAX = \d+/);
		expect(src).toMatch(/built\.size > KEEP_MAX/);
		expect(src).toMatch(/evictable\.slice\(0, built\.size - KEEP_MAX\)/);
	});

	it('a hidden body is neither animated nor fed to the lensing pass', () => {
		// Kept for a fast return is not the same as kept working: it must cost nothing while unseen.
		expect(src).toMatch(/if \(!b\.group\.visible\) continue;/);
		expect(src).toMatch(/if \(!b\.lens \|\| !b\.group\.visible/);
	});
});
