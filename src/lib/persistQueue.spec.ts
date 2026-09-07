// B131: the autosave keeps ONE pending snapshot, never a chain of them.
import { describe, it, expect, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createPersistQueue } from './persistQueue';

function gated() {
	let release!: () => void;
	const gate = new Promise<void>((r) => (release = r));
	return { gate, release };
}

describe('the persist queue (B131)', () => {
	it('a thousand emissions while the disk is slow become TWO writes, and the LAST state is what lands', async () => {
		const { gate, release } = gated();
		const landed: number[] = [];
		let calls = 0;
		const q = createPersistQueue<{ n: number }>(async (s) => {
			calls++;
			if (calls === 1) await gate;
			landed.push(s.n);
		});
		for (let i = 1; i <= 1000; i++) q.enqueue({ n: i });
		// Absolute counts, not ratios (PHY-34): one write in flight, one value waiting, 998 dropped as superseded.
		expect(q.stats()).toEqual({ writes: 1, coalesced: 998, pending: 1 });
		release();
		await q.flush();
		expect(calls).toBe(2);
		expect(landed).toEqual([1, 1000]);
		expect(q.stats()).toEqual({ writes: 2, coalesced: 998, pending: 0 });
	});

	it('takes the snapshot when the write happens, so a value edited in place after enqueue lands as it is by then', async () => {
		const { gate, release } = gated();
		const landed: number[] = [];
		let calls = 0;
		const q = createPersistQueue<{ n: number }>(async (s) => {
			calls++;
			if (calls === 1) await gate;
			landed.push(s.n);
		});
		q.enqueue({ n: 1 });
		const live = { n: 2 };
		q.enqueue(live);
		live.n = 3; // the app edits the campaign in place
		release();
		await q.flush();
		expect(landed).toEqual([1, 3]);
	});

	it('a snapshot is a copy: the value written is not the object the caller still holds', async () => {
		let seen: { n: number } | null = null;
		const q = createPersistQueue<{ n: number }>(async (s) => { seen = s; });
		const live = { n: 7 };
		q.enqueue(live);
		await q.flush();
		expect(seen).toEqual({ n: 7 });
		expect(seen).not.toBe(live);
	});

	it('a failing write is reported and does not stop the next one', async () => {
		const errors: unknown[] = [];
		let calls = 0;
		const q = createPersistQueue<{ n: number }>(
			async () => { calls++; if (calls === 1) throw new Error('disk said no'); },
			{ onError: (e) => errors.push(e) }
		);
		q.enqueue({ n: 1 });
		await q.flush();
		q.enqueue({ n: 2 });
		await q.flush();
		expect(errors).toHaveLength(1);
		expect(calls).toBe(2);
	});

	it('enqueue is cheap: no clone until the write', () => {
		const snapshot = vi.fn((v: { n: number }) => ({ ...v }));
		const { gate } = gated();
		const q = createPersistQueue<{ n: number }>(async () => { await gate; }, { snapshot });
		q.enqueue({ n: 1 }); // the first write starts at once and takes its snapshot
		for (let i = 2; i <= 500; i++) q.enqueue({ n: i });
		expect(snapshot).toHaveBeenCalledTimes(1);
	});

	it('the page autosaves through it and no longer chains a promise and a clone per emission', () => {
		const src = readFileSync(resolve(process.cwd(), 'src/routes/+page.svelte'), 'utf-8');
		expect(src).toMatch(/createPersistQueue</);
		expect(src).not.toMatch(/persistQueue = persistQueue/);
		expect(src).not.toMatch(/const snapshot = JSON\.parse\(JSON\.stringify\(starmap\)\)/);
	});
});
