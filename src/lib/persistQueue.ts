// src/lib/persistQueue.ts
//
// ONE PENDING SNAPSHOT, NEVER A CHAIN (B131). The autosave used to be `persistQueue = persistQueue.then(...)`
// with a deep clone of the whole campaign taken at enqueue time - one clone and one IndexedDB write per
// store emission, in order, no matter how fast emissions came. A ship in transit with the clock running
// emits once per animation frame, and a disk is slower than a frame, so the chain held one full campaign
// per pending frame: a thousand frames behind was 2.2 GB of heap that drained only when the transit ended.
//
// This queue keeps the LATEST value and nothing else. A write is in flight or it is not; when it finishes,
// the newest value since it started is written once, and everything that arrived in between is dropped
// as already superseded. The snapshot is taken when the write HAPPENS, not when the value was enqueued, so
// what lands is never older than the enqueue and never torn by an edit mid-write. Nothing here knows
// about starmaps; it is the shape every "persist the latest state" path in the app should take.

export interface PersistQueue<T> {
	/** Note a new value to persist. Cheap: no clone, no promise, no work if a write is already in flight. */
	enqueue(value: T): void;
	/** Resolves once every enqueued value up to now has been written (or has failed and been reported). */
	flush(): Promise<void>;
	/** For gates and diagnostics: writes performed, values dropped as superseded, values still pending (0 or 1). */
	stats(): { writes: number; coalesced: number; pending: number };
}

export function createPersistQueue<T>(
	save: (snapshot: T) => Promise<void>,
	opts: { snapshot?: (value: T) => T; onError?: (error: unknown) => void } = {}
): PersistQueue<T> {
	const snapshot = opts.snapshot ?? ((value: T) => JSON.parse(JSON.stringify(value)) as T);
	const onError = opts.onError ?? ((error: unknown) => console.error('Failed to persist:', error));
	let latest: { value: T } | null = null;
	let running: Promise<void> | null = null;
	let writes = 0;
	let coalesced = 0;

	async function drain(): Promise<void> {
		while (latest) {
			const { value } = latest;
			latest = null;
			writes++;
			try {
				await save(snapshot(value));
			} catch (error) {
				onError(error);
			}
		}
		running = null;
	}

	return {
		enqueue(value: T): void {
			if (latest) coalesced++;
			latest = { value };
			if (!running) running = drain();
		},
		flush(): Promise<void> {
			return running ?? Promise.resolve();
		},
		stats() {
			return { writes, coalesced, pending: latest ? 1 : 0 };
		}
	};
}
