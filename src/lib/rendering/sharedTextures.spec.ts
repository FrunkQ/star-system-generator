import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

/**
 * C21b: A CACHED CANVAS IS NOT A CACHED TEXTURE, AND THE UPLOAD WAS THE BILL.
 *
 * The owner on a tired browser, 2026-09-08: *"the wireframe keeps appearing as I scroll - it never
 * appears replaced or everything is being retextured on the fly. Rather than cached"*. He was right,
 * and the caching was only half done.
 *
 * `planetTexture.ts` caches the expensive PIXELS - a 1024x512 canvas drawn once per look. But
 * `bodyLook` then wrapped that canvas in a NEW `THREE.CanvasTexture` on every build, and the
 * teardown disposed it. The size comparison builds a body when it enters the build window and
 * destroys it when it leaves, so SCROLLING ALONE re-uploaded every surface, again and again.
 *
 * ON THE MACHINE THAT REPORTED IT THAT IS RUINOUS, and it is the same story as [[C20]]: that browser
 * has fallen back to software rendering, so a texture upload is the CPU converting and copying half
 * a megapixel on the main thread - not a transfer to a graphics card. The pixels were cached; the
 * upload was not.
 *
 * Neither half is observable under vitest - there is no GL context to upload to and jsdom has no 2D
 * canvas to draw the pixels with - so what is pinned is the DECISION, the shape
 * `glRendererSites.spec.ts` uses. The gates that matter are the second and third: sharing a texture
 * is only safe while NOTHING disposes it behind the sharer's back, and every 3D surface in this app
 * has a teardown that walks materials disposing maps.
 */

const LOOK = 'src/lib/holo/bodyLook.ts';

describe('a body surface is uploaded once and shared (C21b)', () => {
	const look = readFileSync(LOOK, 'utf8');

	it('wraps a cached canvas in ONE texture, keyed on that canvas', () => {
		expect(look).toMatch(/const sharedTextures = new WeakMap<HTMLCanvasElement, THREE\.CanvasTexture>/);
		// A WeakMap, so a canvas the pixel cache evicts takes its GPU texture with it.
		expect(look).toMatch(/sharedTextures\.get\(canvas\)/);
		expect(look).toMatch(/sharedTextures\.set\(canvas, t\)/);
	});

	it('marks them, so a teardown can tell what is not its to free', () => {
		expect(look).toMatch(/sharedTexture = true/);
	});

	it('does NOT put the surface or emissive texture in the disposables', () => {
		// This is the whole fault: `disposables.push(t)` on a shared texture means the next body to
		// scroll out frees the texture every other body is still using.
		const region = look.slice(look.indexOf('getPlanetTextureEquirect(node)'), look.indexOf('if (!useUnlit && opts.onLitMaterial)'));
		expect(region).toMatch(/mat\.map = sharedTexture\(/);
		expect(region).toMatch(/emissiveMap = sharedTexture\(/);
		expect(region).not.toMatch(/disposables\.push\(t\)/);
		expect(region).not.toMatch(/disposables\.push\(et\)/);
		expect(region).not.toMatch(/new THREE\.CanvasTexture/);
	});

	it('takes the HIGHEST anisotropy asked for, not the last', () => {
		// A shared texture must not get worse because a cheaper surface was built after a richer one.
		expect(look).toMatch(/anisotropy > t\.anisotropy/);
	});
});

/**
 * THE PIN THAT WILL ACTUALLY CATCH THE REGRESSION. Sharing is only safe while nothing frees a shared
 * texture behind the sharer's back, and every 3D surface here has a teardown that walks materials
 * calling `map.dispose()`. A new surface written in the old shape would silently reintroduce the
 * fault - silently, because everything still LOOKS right; it is merely slow again.
 */
function* sourceFiles(dir: string): Generator<string> {
	for (const name of readdirSync(dir)) {
		const p = join(dir, name);
		if (statSync(p).isDirectory()) yield* sourceFiles(p);
		else if (name.endsWith('.ts') || name.endsWith('.svelte')) yield p;
	}
}

describe('nothing frees a shared texture behind the sharer (C21b)', () => {
	it('every map disposal is guarded by the shared marker', () => {
		const unguarded: string[] = [];
		for (const file of sourceFiles('src')) {
			const rel = relative(process.cwd(), file).replace(/\\/g, '/');
			if (rel === LOOK) continue; // the sharer itself
			if (rel.endsWith('sharedTextures.spec.ts')) continue; // this file's own prose
			const text = readFileSync(file, 'utf8');
			if (!text.includes('.dispose')) continue; // cheap reject before any per-line work
			text.split(/\r?\n/).forEach((line, i) => {
				const code = line.replace(/\/\/.*$/, '');
				// a `.map` / `.emissiveMap` being disposed at all
				if (!/\b(map|emissiveMap)\s*\??\.\s*dispose\s*\??\.?\s*\(/.test(code)) return;
				// ...must mention the marker on the same line to be considered guarded
				// GUARDED: it checks the marker. Or DECLARED: the site owns that texture outright - a
				// label sprite draws its own canvas and must still free it, and a blanket guard there
				// would leak. Either way a person has had to decide, which is the point of the pin.
				if (line.includes('sharedTexture') || line.includes('owns its texture')) return;
				unguarded.push(`${rel}:${i + 1}: ${line.trim().slice(0, 110)}`);
			});
		}
		expect(
			unguarded,
			`these dispose a texture that may be shared with every other body drawn from the same canvas,\nwhich is what made scrolling re-upload every surface:\n${unguarded.join('\n')}`
		).toEqual([]);
	}, 60_000);
});
