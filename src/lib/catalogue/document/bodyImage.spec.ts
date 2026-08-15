// G20 asked one thing outright: does a STAR's custom picture reach the reader-facing surfaces, or is
// the loader written for planets and constructs only? It is written for NODES. These tests pin that —
// the gate is the same-origin rule and nothing else, so a star is admitted on the same terms as a
// planet, and the class portrait a star already carries (`/images/star_types/...`) passes it too.
import { describe, it, expect, vi } from 'vitest';
import { loadBodyImage } from './bodyImage';

const system: any = {
	id: 's',
	nodes: [
		{ id: 'star', name: 'Sol', kind: 'body', roleHint: 'star', image: { url: '/images/star_types/G.webp' } },
		{ id: 'custom-star', name: 'Rasalas', kind: 'body', roleHint: 'star', image: { url: 'data:image/jpeg;base64,QUJD', custom: true } },
		{ id: 'earth', name: 'Earth', kind: 'body', roleHint: 'planet', image: { url: 'data:image/jpeg;base64,REVG', custom: true } },
		{ id: 'remote', name: 'Remote', kind: 'body', roleHint: 'star', image: { url: 'https://example.invalid/star.jpg' } },
		{ id: 'bare', name: 'Bare', kind: 'body', roleHint: 'star' }
	]
};

// The loader only reports failure synchronously (the success path waits on an <img> decode, which
// jsdom never performs). That asymmetry is exactly what these tests need: a synchronous null IS the
// rejection, so "not rejected" is the claim being made.
function rejectedSynchronously(id: string) {
	const cb = vi.fn();
	loadBodyImage(system, id, cb);
	return cb.mock.calls.length > 0 && cb.mock.calls[0][0] === null;
}

describe('loadBodyImage — the gate is same-origin, not roleHint', () => {
	it('admits a STAR carrying a GM upload, exactly as it admits a planet', () => {
		expect(rejectedSynchronously('custom-star')).toBe(false);
		expect(rejectedSynchronously('earth')).toBe(false);
	});

	it('admits the app-relative class portrait a star already carries', () => {
		// Which is why stars were already appearing in photo mode before they could be given a custom
		// picture — the surface existed, only the upload control was missing.
		expect(rejectedSynchronously('star')).toBe(false);
	});

	it('still turns away a cross-origin url and a node with no picture', () => {
		// A cross-origin image would taint the WebGL surface the filter reads back from.
		expect(rejectedSynchronously('remote')).toBe(true);
		expect(rejectedSynchronously('bare')).toBe(true);
		expect(rejectedSynchronously('no-such-node')).toBe(true);
	});
});
