// G72: the one-version "keep a copy" notice before a rehosting, and the service-worker cache names that
// must move with every release for the shell to refresh.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { KEEP_A_COPY_FROM, shouldAskToKeepACopy, recordKeptCopy, keepACopyMessage } from './keepACopy';

const older = (v: string) => { const p = v.split('.').map(Number); p[2] -= 1; return p.join('.'); };
const newer = (v: string) => { const p = v.split('.').map(Number); p[2] += 1; return p.join('.'); };
const campaign = (extra: Record<string, unknown> = {}) => ({ systems: [{ id: 's1' }], ...extra });

describe('keep a copy (G72)', () => {
	it('asks once the app reaches the armed version, for a campaign with systems and no stamp', () => {
		expect(shouldAskToKeepACopy(campaign(), KEEP_A_COPY_FROM)).toBe(true);
		expect(shouldAskToKeepACopy(campaign(), newer(KEEP_A_COPY_FROM))).toBe(true);
	});

	it('stays silent on an older app, an empty campaign, or no campaign at all', () => {
		expect(shouldAskToKeepACopy(campaign(), older(KEEP_A_COPY_FROM))).toBe(false);
		expect(shouldAskToKeepACopy({ systems: [] }, KEEP_A_COPY_FROM)).toBe(false);
		expect(shouldAskToKeepACopy(null, KEEP_A_COPY_FROM)).toBe(false);
	});

	it('the answer is stamped on the campaign and silences the notice, but an older stamp does not', () => {
		const kept = recordKeptCopy(campaign());
		expect(kept.keptCopyForVersion).toBe(KEEP_A_COPY_FROM);
		expect(shouldAskToKeepACopy(kept, KEEP_A_COPY_FROM)).toBe(false);
		expect(shouldAskToKeepACopy(campaign({ keptCopyForVersion: older(KEEP_A_COPY_FROM) }), KEEP_A_COPY_FROM)).toBe(true);
	});

	it('the words say what is happening, and name the new address only when there is one', () => {
		const m = keepACopyMessage();
		expect(m.title).toMatch(/Keep a copy/);
		expect(m.body).toMatch(/one copy a move cannot touch/);
		if (m.address) expect(m.body).toMatch(/new address/);
		else expect(m.body).toMatch(/change hosting/);
	});

	it('the page mounts the notice behind the base-map offer and the welcome screen, and BOTH answers record the stamp', () => {
		const src = readFileSync(resolve(process.cwd(), 'src/routes/+page.svelte'), 'utf-8');
		expect(src).toMatch(/shouldAskToKeepACopy\(\$starmapStore, APP_VERSION\)/);
		expect(src).toMatch(/keepACopyDue && \$starmapStore && !baseMapOffer && !showWelcome/);
		expect(src.match(/recordKeptCopy\(/g)?.length ?? 0).toBeGreaterThanOrEqual(2);
	});

	it('the service worker cache names carry THIS version, so the shell refreshes on every release', () => {
		const version = JSON.parse(readFileSync(resolve(process.cwd(), 'package.json'), 'utf-8')).version as string;
		const sw = readFileSync(resolve(process.cwd(), 'static/sw.js'), 'utf-8');
		expect(sw, 'run `npm run manifest` after the version bump - it stamps sw.js as well as the manifest').toContain(`'sse-static-v${version}'`);
		expect(sw).toContain(`'sse-runtime-v${version}'`);
	});
});
