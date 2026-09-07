// src/lib/constructs/constructFile.ts
//
// THE CONSTRUCT FILE CONTRACT: what "Export" writes and what "Import" accepts, in ONE place
// (engine map DATA-R40). The two halves used to live as separate literals inside
// ConstructSidePanel, and drifted: the importer demanded a `class` field that NOTHING in the app
// writes - no pack template carries one (0 of 59 in starter-sf) and no editor field sets one - so
// every construct a GM built, exported and tried to import back was refused as "Invalid construct
// file" (B117). A contract with its halves in two places is one nobody can test; this module is
// the one that can be, and `constructFile.spec.ts` round-trips EVERY template the pack ships.

/**
 * Fields that describe a construct's SITUATION in one particular system - its identity, orbit
 * and flight dynamics - rather than its spec. They survive a spec replacement (template load,
 * file import) on the target, and never travel in an exported file: an imported journey or state
 * vector references the SOURCE system and outranks `orbit.elements` at render time
 * (worldPositions.ts), which left imported ships mispositioned with their orbit edits ignored.
 */
export const SITUATION_FIELDS = [
	'id', 'parentId', 'ui_parentId', 'orbit', 'placement', 'coOrbital',
	'scheduled_journeys', 'flight_state', 'vector_position_au',
	'vector_velocity_ms', 'vector_epoch_ms', 'autopilot', 'flight_log'
] as const;

/** A deep copy of the construct with its situation removed - the body of an exported file. */
export function stripSituation(construct: object): Record<string, any> {
	const out = JSON.parse(JSON.stringify(construct));
	for (const f of SITUATION_FIELDS) delete out[f];
	return out;
}

/**
 * Why a parsed file cannot be imported as a construct, in words a GM can act on - or null when it
 * can. The contract is deliberately small: a construct is `kind: 'construct'` with a name.
 * Everything else is spec the editor can show, fix or default; refusing a file over an optional
 * field is exactly how B117 happened.
 */
export function constructFileProblem(parsed: unknown): string | null {
	if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return 'This file does not hold a construct.';
	const o = parsed as Record<string, unknown>;
	if (o.kind !== 'construct') {
		if (o.kind === 'body' || o.kind === 'barycenter') return 'This is a body file, not a construct file.';
		if (Array.isArray(o.nodes)) return 'This is a whole system save, not a single construct.';
		return 'This file is not a construct export: it has no "kind": "construct".';
	}
	if (typeof o.name !== 'string' || !o.name.trim()) return 'This construct file has no name.';
	return null;
}
