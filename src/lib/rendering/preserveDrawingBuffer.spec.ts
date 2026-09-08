import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

/**
 * C20 job 5: WHICH SURFACES GENUINELY NEED `preserveDrawingBuffer`, PINNED TO THE ANSWER.
 *
 * It is not a free flag. It stops the browser discarding the drawing buffer after presenting, which
 * costs a whole extra buffer's worth of memory for as long as the surface is open - on a full-screen
 * retina holo that is tens of megabytes, and memory is the thing C20 is short of.
 *
 * THE WEIGHING, done by tracing every path that can copy a canvas (`drawImage`, `toDataURL`,
 * `createImageBitmap`, `getCanvas()`):
 *
 *   holo         - CAPTURED. `BodyGraphic.getCanvas()` feeds the document's filter pass ([[A38]]);
 *                  the catalogue stage is snapshotted by the D8 view-entry transition. Per USE now,
 *                  so the preset preview - which nothing copies - stops paying for it.
 *   filtered     - CAPTURED. `TransitionEngine` snapshots it for a transition's "before" state.
 *   model        - CONDITIONAL already, on `opts.capture`. Correct before this stream started.
 *   comparison   - not captured, does not have it.
 *   gallery      - not captured, does not have it.
 *   starmap      - not captured, does not have it.
 *
 * So per SITE the allocation was already right, and the finding is one level down: ONE MODULE served
 * a small captured body graphic and a full-screen view, and the full-screen one paid for a capture
 * that never happened.
 *
 * WHY A SOURCE PIN. The flag's effect is invisible to jsdom - it changes what the GPU keeps after a
 * present - so what can be asserted is the DECISION at each site, which is the thing that would be
 * silently wrong.
 */

const read = (p: string) => readFileSync(p, 'utf8');

describe('preserveDrawingBuffer is paid for only where something copies the canvas (C20)', () => {
	it('the three surfaces nobody copies do not ask for it', () => {
		for (const p of [
			'src/lib/holo/comparisonScene.ts',
			'src/lib/holo/galleryScene.ts',
			'src/lib/starmap/starmapScene.ts'
		]) {
			const ctor = read(p).match(/createGlRenderer\(\{[^}]*\}\)/s)?.[0] ?? '';
			expect(ctor, p).not.toMatch(/preserveDrawingBuffer/);
		}
	});

	it('the model viewer asks for it only when it is going to be captured', () => {
		const src = read('src/lib/constructs/modelViewer.ts');
		expect(src).toMatch(/preserveDrawingBuffer:\s*!!opts\.capture/);
	});

	it('the filtered canvas keeps it - the transition engine snapshots it', () => {
		const src = read('src/lib/holo/filteredCanvas.ts');
		expect(src).toMatch(/preserveDrawingBuffer:\s*true/);
	});

	it('the holo asks per USE, and defaults to keeping it', () => {
		const src = read('src/lib/holo/scene.ts');
		// `!== false` rather than `!!`: an absent option must mean YES here. Both failure modes are
		// silent (a blank body graphic, a black transition snapshot), so the default protects them.
		expect(src).toMatch(/preserveDrawingBuffer:\s*opts\.capture\s*!==\s*false/);
	});

	it("A38's body graphic never opts out - a blank capture is the fault A38 exists to record", () => {
		const src = read('src/lib/components/BodyGraphic.svelte');
		const holo = src.match(/<HoloView[^>]*>/s)?.[0] ?? '';
		expect(holo, 'BodyGraphic must not pass capture={false}').not.toMatch(/capture=\{false\}/);
	});

	it('the catalogue stage never opts out - the entry transition snapshots it', () => {
		const src = read('src/routes/catalogue/+page.svelte');
		const holo = src.match(/<HoloView[^>]*>/s)?.[0] ?? '';
		expect(holo, 'the player stage must not pass capture={false}').not.toMatch(/capture=\{false\}/);
	});

	it('the preset preview DOES opt out - nothing copies it', () => {
		const src = read('src/lib/components/PlayerPresetEditor.svelte');
		const holo = src.match(/<HoloView[^>]*>/s)?.[0] ?? '';
		expect(holo).toMatch(/capture=\{false\}/);
	});
});
