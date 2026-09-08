import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

/**
 * C20: NOBODY BUILDS A WebGL RENDERER EXCEPT THE FACTORY.
 *
 * Six sites each wrote their own `new THREE.WebGLRenderer`, and not one of the six asked the browser
 * for the high-performance GPU - the formal request the owner asked about when his tired browser
 * locked up. A seventh site added next month would silently not ask either, because there is nothing
 * about writing that constructor that reminds you what the other six decided.
 *
 * So this is a SOURCE-LEVEL PIN in the shape `skinLiterals.spec.ts` already uses: it reads the code
 * as text and fails on the constructor appearing anywhere but its one legitimate home. It cannot be
 * a runtime test - a real GPU cannot be asserted under vitest, and the whole point is the argument
 * we pass at construction, which nothing observable in jsdom depends on.
 *
 * If you are here because this test failed: call `createGlRenderer` from `$lib/rendering/glRenderer`
 * and pass your surface's genuine differences as options. If your surface genuinely cannot use it,
 * that is a conversation to have on the board, not a line to add to `ALLOWED`.
 */
const CONSTRUCTOR = /new\s+(?:THREE\s*\.\s*)?WebGLRenderer\s*\(/;
const ROOT = 'src';
/** The factory itself, and nothing else. A second name here means the fault has come back. */
const ALLOWED = ['src/lib/rendering/glRenderer.ts'];

function* sourceFiles(dir: string): Generator<string> {
	for (const name of readdirSync(dir)) {
		const p = join(dir, name);
		if (statSync(p).isDirectory()) yield* sourceFiles(p);
		else if (name.endsWith('.ts') || name.endsWith('.svelte')) yield p;
	}
}

describe('one renderer factory (C20)', () => {
	it('no source file outside the factory constructs a WebGLRenderer', () => {
		const hits: string[] = [];
		for (const file of sourceFiles(ROOT)) {
			const rel = relative(process.cwd(), file).replace(/\\/g, '/');
			if (ALLOWED.includes(rel)) continue;
			readFileSync(file, 'utf8')
				.split(/\r?\n/)
				.forEach((line, i) => {
					// A mention inside a comment is documentation, not a second decision.
					const code = line.replace(/\/\/.*$/, '').replace(/^\s*\*.*$/, '');
					if (CONSTRUCTOR.test(code)) hits.push(`${rel}:${i + 1}: ${line.trim().slice(0, 100)}`);
				});
		}
		expect(
			hits,
			`these build a renderer without going through createGlRenderer, so they ask the browser for nothing:\n${hits.join('\n')}`
		).toEqual([]);
	});
});
