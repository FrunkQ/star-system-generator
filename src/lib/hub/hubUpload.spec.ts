// R-04: the two rules the hub said would get a campaign leaked or a creator misled if broken.
//
//   "Do not pre-tick it. The whole point is that a person actually read it and took responsibility."
//   "`publishGmTree` - absent means publish the PLAYER tree. Never default it on."
//
// Both are enforced in `publishBody` rather than left to whichever component happens to call it, so
// they are testable without a network and cannot be undone by editing a Svelte file.
//
// The upload feature itself is PARKED (`HUB.uploadEnabled === false`) until the hub supplies the
// pairing endpoint and the attestation wording. These gates hold regardless, which is the point of
// writing them now: the rules must already be true on the day the flag flips.
import { describe, it, expect } from 'vitest';
import { publishBody, publishBlocked, publishToHub } from './hubUpload';
import { HUB } from './hubConfig';

const bytes = new Uint8Array([1, 2, 3]);
const base = { bytes, filename: 'Campaign-Starmap.json' };

describe('R-04: the attestation is never assumed', () => {
	it('refuses to build a body when it was not ticked', () => {
		expect(() => publishBody({ ...base, attest: false })).toThrow(/attestation/i);
		expect(() => publishBody({ ...base, attest: undefined as any })).toThrow(/attestation/i);
		// Not merely falsy - a truthy non-true value is still not somebody ticking a box.
		expect(() => publishBody({ ...base, attest: 1 as any })).toThrow(/attestation/i);
		expect(() => publishBody({ ...base, attest: 'on' as any })).toThrow(/attestation/i);
	});

	it('sends it only when it was', () => {
		const form = publishBody({ ...base, attest: true });
		expect(form.get('attest')).toBe('on');
	});
});

describe('R-04: absent means the PLAYER tree, and absent means absent', () => {
	it('omits publishGmTree entirely unless it was explicitly chosen', () => {
		// ABSOLUTE: the field must not be PRESENT at all. Sending `publishGmTree=off` is a different
		// statement from sending nothing, and a hub reading "present, therefore chosen" is exactly
		// the ambiguity that leaks a campaign.
		expect(publishBody({ ...base, attest: true }).has('publishGmTree')).toBe(false);
		expect(publishBody({ ...base, attest: true, publishGmTree: false }).has('publishGmTree')).toBe(false);
		expect(publishBody({ ...base, attest: true, publishGmTree: undefined }).has('publishGmTree')).toBe(false);
	});

	it('sends it only for an explicit true', () => {
		expect(publishBody({ ...base, attest: true, publishGmTree: true }).get('publishGmTree')).toBe('on');
		// A truthy non-true value is not a choice either.
		expect(publishBody({ ...base, attest: true, publishGmTree: 'yes' as any }).has('publishGmTree')).toBe(false);
	});

	it('carries the file and an update target when there is one', () => {
		const form = publishBody({ ...base, attest: true, replaces: 'my-map' });
		expect(form.get('replaces')).toBe('my-map');
		expect(form.get('file')).toBeInstanceOf(Blob);
		expect(publishBody({ ...base, attest: true }).has('replaces')).toBe(false);
	});
});

describe('R-04: nothing is offered that cannot work', () => {
	it('is blocked while the build has publishing switched off', () => {
		// The feature is parked today, and this pins WHY rather than just that.
		expect(HUB.uploadEnabled).toBe(false);
		const blocked = publishBlocked({ paired: true, userEnabled: true });
		expect(blocked.blocked).toBe(true);
		expect((blocked as any).reason).toMatch(/not switched on in this build/i);
	});

	it('never attempts a network call while it is parked', async () => {
		let called = false;
		const impl = (async () => { called = true; return {} as Response; }) as unknown as typeof fetch;
		const result = await publishToHub({ ...base, attest: true, token: 'anything' }, impl);
		expect(result.ok).toBe(false);
		expect(called, 'a parked feature must not talk to the network').toBe(false);
	});

	it('gives each reason in the order a person would need to hear it', () => {
		// Ordered outward: the feature not existing outranks a preference, which outranks pairing.
		expect((publishBlocked({ paired: false, userEnabled: false }) as any).reason).toMatch(/build/i);
	});
});
