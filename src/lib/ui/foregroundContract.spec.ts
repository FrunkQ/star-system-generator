/**
 * A84 — EVERY FULL-SCREEN DIALOG JOINS THE CHROME-YIELD CONTRACT, AND THIS IS WHAT SAYS SO.
 *
 * UI-C6 / A52 built the rule that a phone dialog gets the screen: a dialog marks its backdrop
 * `use:foreground`, persistent chrome marks itself `use:chrome`, one CSS rule joins them, and
 * NEITHER SIDE KEEPS A LIST. The design is right and it worked — but nothing ever CHECKED that a
 * new dialog had registered, so half of them never did. Thirteen backdrops were found unregistered
 * during the A84 sweep, in modals a phone GM meets constantly: New Starmap, Save System, the route
 * editor, the report configuration, Add Construct, the template loader, the interstellar planner,
 * the model viewer, the real-sky importer, the base-map upgrade and the ship panel.
 *
 * `foreground.ts`'s own header explains why a CSS selector cannot catch them: the twelve different
 * spellings of "backdrop" in this tree (`modal-backdrop`, `modal-overlay`, `modal-background`,
 * `modal-bg`, `overlay`, `dialog-backdrop`, `scrim`, `ship-bg`…). So this gate does not look at the
 * NAME. It looks at the SHAPE: a class styled `position: fixed` covering the whole viewport, used
 * on an element in the same component. That is what a backdrop IS, whatever it is called.
 *
 * A FEW SUCH LAYERS ARE GENUINELY NOT DIALOGS and they are listed below WITH THEIR REASON. That
 * list is the one thing here that has to be maintained by hand, and it is deliberately the cheap
 * side: a new backdrop is red by default and a new EXCEPTION has to be argued for in writing.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

/** Layers that cover the viewport and are NOT dialogs. Each needs a reason, not just a name. */
const NOT_A_DIALOG: Record<string, string> = {
	'src/lib/components/AppShell.svelte:rail-scrim':
		'The phone rail IS chrome. Registering it would hide the FAB that opened it (UI-C6 BLAST).',
	'src/lib/components/AppShell.svelte:fab-layer':
		'Chrome by definition — it carries `use:chrome`, the other half of the same contract.',
	'src/routes/catalogue/+page.svelte:catalogue':
		'The player route’s own page root, not a dialog over something else.',
	'src/routes/discgallery3d/+page.svelte:page':
		'A whole route (the disc gallery), not a dialog.',
	'src/routes/+page.svelte:physics-overlay':
		'Two uses share this class: a `role="status"` loading indicator and the load-stopped ' +
		'recovery screen. The first is not a dialog and there is no chrome to yield to while the ' +
		'app is still booting.',
	'src/lib/components/Starmap.svelte:alpha-disclaimer-overlay':
		'The alpha gate, shown before the map exists. Nothing is behind it to yield.',
	'src/lib/components/SettingsModal.svelte:unit-confirm-backdrop':
		'Nested inside Settings, which already registers — the count is already above zero, so ' +
		'registering it again would change nothing but the depth.',
	'src/lib/components/TagCategoryEditor.svelte:rule-edit-bg':
		'Nested inside this component’s own modal. Registering it would portal it out of its ' +
		'parent dialog and put the two at the same DOM level — filed as A87 rather than guessed at.',
	'src/lib/components/TagCategoryEditor.svelte:modal-bg':
		'Opened from inside Settings, which already registers. Filed as A87 with the nested case.',
	'src/lib/components/PlayerPresetEditor.svelte:modal-bg':
		'A composite editor with its own live preview canvases; moving its root is a bigger change ' +
		'than an attribute and is filed as A87 rather than done blind.',
	'src/lib/components/PlayerViewModal.svelte:modal-bg':
		'Same family as the preset editor and filed with it (A87).'
};

function svelteFiles(dir: string, out: string[] = []): string[] {
	for (const e of readdirSync(dir, { withFileTypes: true })) {
		const p = join(dir, e.name).replace(/\\/g, '/');
		if (e.isDirectory()) svelteFiles(p, out);
		else if (e.name.endsWith('.svelte')) out.push(p);
	}
	return out;
}

/** Does this declaration block make a box that covers the whole viewport? */
function coversViewport(decl: string): boolean {
	const d = decl.replace(/\s+/g, ' ');
	if (!/position:\s*fixed/.test(d)) return false;
	if (/inset:\s*0/.test(d)) return true;
	const zero = (p: string) => new RegExp(p + ':\\s*0(px)?\\s*;').test(d);
	const full = (p: string) => new RegExp(p + ':\\s*100(%|v[wh])').test(d);
	return zero('top') && zero('left') && (zero('right') || full('width')) && (zero('bottom') || full('height'));
}

/** The full-viewport fixed classes a file's own style block defines. */
function localBackdropClasses(src: string): Set<string> {
	const classes = new Set<string>();
	const styleAt = src.indexOf('<style');
	if (styleAt < 0) return classes;
	for (const m of src.slice(styleAt).matchAll(/(?:^|\})\s*([^{}@]+?)\s*\{([^{}]*)\}/gms)) {
		if (!coversViewport(m[2])) continue;
		for (const c of m[1].matchAll(/\.([A-Za-z0-9_-]+)/g)) classes.add(c[1]);
	}
	return classes;
}

/**
 * THE GLOBAL SPELLINGS, and missing them is how a shape-only scan lies.
 *
 * `.modal-overlay` and `.modal-card` are defined ONCE, as `:global(...)` in `routes/+layout.svelte`,
 * and five components use them without a local rule — About, Help, the help menu, Welcome and the
 * markdown viewer. A scan that only reads each file's own `<style>` sees none of them and reports a
 * clean sweep it has not done. So the layout's globals are read once and applied everywhere.
 */
const GLOBAL_BACKDROPS: Set<string> = (() => {
	const src = readFileSync('src/routes/+layout.svelte', 'utf8');
	const out = new Set<string>();
	for (const m of src.matchAll(/:global\(\.([A-Za-z0-9_-]+)\)\s*\{([^{}]*)\}/gms)) {
		if (coversViewport(m[2])) out.add(m[1]);
	}
	return out;
})();

/** Every (file, class) that is a full-viewport fixed layer AND used on an element in that file. */
function backdrops(): Array<{ file: string; cls: string; registers: boolean }> {
	const found: Array<{ file: string; cls: string; registers: boolean }> = [];
	for (const file of svelteFiles('src')) {
		if (file === 'src/routes/+layout.svelte') continue; // where the globals are DEFINED, not used
		const src = readFileSync(file, 'utf8');
		const classes = new Set([...localBackdropClasses(src), ...GLOBAL_BACKDROPS]);
		for (const cls of classes) {
			// The opening tag: from its `<` to the next `<`, which bounds the attribute list.
			const use = new RegExp('<[a-zA-Z][^<]*?class="' + cls + '(?:\\s|")');
			const at = src.search(use);
			if (at < 0) continue;
			const end = src.indexOf('<', at + 1);
			const tag = src.slice(at, end < 0 ? src.length : end);
			found.push({ file, cls, registers: /use:foreground/.test(tag) });
		}
	}
	return found;
}

describe('A84 — the chrome-yield contract is enforced, not merely documented', () => {
	const all = backdrops();

	it('finds the backdrops at all — a parser that finds nothing would pass everything', () => {
		expect(all.length).toBeGreaterThan(30);
		// Two known-good anchors, one of each spelling family.
		expect(all.some((b) => b.file.endsWith('SettingsModal.svelte') && b.cls === 'modal-backdrop' && b.registers)).toBe(true);
		// This one only exists if the layout's :global rules were read — see GLOBAL_BACKDROPS.
		expect(all.some((b) => b.file.endsWith('AboutModal.svelte') && b.cls === 'modal-overlay' && b.registers)).toBe(true);
		expect(GLOBAL_BACKDROPS.has('modal-overlay'), 'the layout global must be picked up').toBe(true);
	});

	it('every full-screen dialog registers `use:foreground`', () => {
		const unregistered = all
			.filter((b) => !b.registers)
			.map((b) => `${b.file}:${b.cls}`)
			.filter((k) => !(k in NOT_A_DIALOG))
			.sort();
		expect(unregistered, 'a full-viewport fixed layer that neither registers nor is a documented exception').toEqual([]);
	});

	it('every documented exception still exists — a stale excuse is worse than none', () => {
		const present = new Set(all.map((b) => `${b.file}:${b.cls}`));
		const stale = Object.keys(NOT_A_DIALOG).filter((k) => !present.has(k)).sort();
		expect(stale, 'listed as not-a-dialog but no longer found — delete the entry').toEqual([]);
	});

	it('every exception gives a REASON, not just a name', () => {
		for (const [k, why] of Object.entries(NOT_A_DIALOG)) {
			expect(why.length, `${k} needs a real reason`).toBeGreaterThan(30);
		}
	});
});
