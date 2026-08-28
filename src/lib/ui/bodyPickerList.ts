// WHAT THE PICKER SHOWS: one list-building rule, for every place that asks "which body?"
//
// Owner, 2026-08-26: the destination pickers "need a refresh to make them more intuitive - something
// you could type into and see a proper Earth / Moon / construct hierarchy and be able to toggle types
// on and off... Reuse and refine, and ONE interface for the user to learn."
//
// There were three answers to that question. The system view and the transit planner both mounted
// `BodyPicker`, which offered a flat list of categories you drilled INTO one at a time - so finding a
// station meant knowing it was a Construct rather than knowing it was at Earth. The interstellar modal
// had no picker at all: three bare `<select>` dropdowns, no search, no types, no hierarchy.
//
// This is the shared rule, kept as plain functions rather than inside the component so it can be
// tested without a DOM - which is how the rest of this engine is tested.
//
// THE ONE THING WORTH KNOWING: when a filter hides a parent whose CHILD still matches, the parent is
// still shown, as unselectable CONTEXT. Toggle "Constructs" on and you see Sol > Earth > ISS, not a
// bare ISS with nothing to say where it is. That is the whole point of showing a hierarchy at all, and
// it is the part a flat filter gets wrong.

export interface PickerRow {
	node: any;
	/** Nesting level, 0 for a root. Drives the indent only. */
	depth: number;
	/** Shown to place its children, but not itself a legal answer — a parent the filters excluded,
	 *  or the origin the caller told us to leave out. */
	context: boolean;
}

export interface PickerListOptions {
	nodes: any[];
	/** Which nodes may be OFFERED at all (bodies and constructs, usually). */
	filterItems?: (n: any) => boolean;
	/** Every category a node belongs to; membership overlaps by design. */
	categorize?: (n: any) => string[];
	/** Categories the user has switched on. Empty means "no filter", not "nothing". */
	activeCategories?: string[];
	/** Nodes that must not be offered — the ship's own current home, which is not a destination. */
	excludeIds?: string[];
	/** Free text. When present the result is a FLAT list of matches: a search is a search, and
	 *  indenting its results under parents the user did not ask about only buries them. */
	query?: string;
	/** Ordering among siblings. */
	sort?: (a: any, b: any) => number;
	/** Cap on search results. */
	searchLimit?: number;
}

const byName = (a: any, b: any) => String(a?.name ?? '').localeCompare(String(b?.name ?? ''));

/**
 * The rows to draw, in order, with their indent.
 *
 * Searching gives a flat list. Browsing gives the hierarchy, with any node that survives the filters
 * shown under its real parents.
 */
export function buildPickerRows(opts: PickerListOptions): PickerRow[] {
	const {
		nodes = [],
		filterItems = (n: any) => n?.kind === 'body' || n?.kind === 'construct',
		categorize = () => [],
		activeCategories = [],
		excludeIds = [],
		query = '',
		sort = byName,
		searchLimit = 200
	} = opts;

	const excluded = new Set(excludeIds.filter(Boolean));
	const active = new Set(activeCategories);

	/** May this node be picked? */
	const selectable = (n: any): boolean => {
		if (!n || excluded.has(n.id)) return false;
		if (!filterItems(n)) return false;
		if (active.size === 0) return true;
		return categorize(n).some((c) => active.has(c));
	};

	const q = query.trim().toLowerCase();
	if (q) {
		// A search is FLAT and ignores the hierarchy, but it still honours the type toggles and the
		// exclusion — otherwise typing would quietly hand back the thing the caller ruled out.
		return (nodes as any[])
			.filter((n) => selectable(n) && String(n.name ?? '').toLowerCase().includes(q))
			.sort(sort)
			.slice(0, searchLimit)
			.map((node) => ({ node, depth: 0, context: false }));
	}

	const byId = new Map<string, any>();
	for (const n of nodes as any[]) if (n?.id) byId.set(n.id, n);

	// Which nodes have to appear? Everything selectable, plus every ancestor of one — the context
	// that says WHERE it is.
	const show = new Set<string>();
	for (const n of nodes as any[]) {
		if (!selectable(n)) continue;
		show.add(n.id);
		let p = n.parentId ? byId.get(n.parentId) : null;
		let guard = 0;
		while (p && guard++ < 32) {
			if (show.has(p.id)) break;
			show.add(p.id);
			p = p.parentId ? byId.get(p.parentId) : null;
		}
	}

	const children = new Map<string, any[]>();
	const roots: any[] = [];
	for (const n of nodes as any[]) {
		if (!show.has(n.id)) continue;
		const parent = n.parentId ? byId.get(n.parentId) : null;
		if (parent && show.has(parent.id)) {
			if (!children.has(parent.id)) children.set(parent.id, []);
			children.get(parent.id)!.push(n);
		} else {
			roots.push(n);
		}
	}
	for (const arr of children.values()) arr.sort(sort);
	roots.sort(sort);

	const out: PickerRow[] = [];
	const emitted = new Set<string>();
	const walk = (n: any, depth: number, guard: number) => {
		if (guard > 32 || emitted.has(n.id)) return;
		emitted.add(n.id);
		out.push({ node: n, depth, context: !selectable(n) });
		for (const c of children.get(n.id) ?? []) walk(c, depth + 1, guard + 1);
	};
	for (const r of roots) walk(r, 0, 0);
	// AUTHORED DATA CAN SAY ANYTHING, including that A orbits B while B orbits A. Such a pair has no
	// root, so the walk above never reaches it and the picker would show an EMPTY list — which reads as
	// 'nowhere to go' rather than as 'this map has a loop in it'. Anything still unemitted is shown at
	// the top level, so a broken hierarchy costs its indent and nothing else.
	for (const n of nodes as any[]) {
		if (show.has(n.id) && !emitted.has(n.id)) walk(n, 0, 0);
	}
	return out;
}

/** The type toggles, with a live count of what each would show. Counting AFTER exclusion but BEFORE
 *  the other toggles is deliberate: a chip should say how many it would add, not how many survive the
 *  chips already pressed, or the numbers move about as you press them. */
export function buildCategoryChips(opts: {
	nodes: any[];
	filterItems?: (n: any) => boolean;
	categorize?: (n: any) => string[];
	excludeIds?: string[];
	order?: string[];
}): { key: string; count: number }[] {
	const {
		nodes = [],
		filterItems = (n: any) => n?.kind === 'body' || n?.kind === 'construct',
		categorize = () => [],
		excludeIds = [],
		order = []
	} = opts;
	const excluded = new Set(excludeIds.filter(Boolean));
	const counts = new Map<string, number>();
	for (const n of nodes as any[]) {
		if (!n || excluded.has(n.id) || !filterItems(n)) continue;
		for (const c of categorize(n)) counts.set(c, (counts.get(c) ?? 0) + 1);
	}
	const extra = Array.from(counts.keys()).filter((c) => !order.includes(c)).sort();
	return [...order, ...extra].filter((c) => counts.has(c)).map((c) => ({ key: c, count: counts.get(c)! }));
}
