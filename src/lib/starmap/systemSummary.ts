// WHAT IS IN A SYSTEM, IN ONE SENTENCE EACH — the GM starmap's hover summary (A82).
//
// Owner, 2026-08-31: hovering a star on the GM starmap showed nothing, and he wants *"full star
// type, planet count, body count, construct count, a compact life line if there is one, and any
// special stuff like ringworld stuff"*.
//
// ONE BUILDER, AND IT IS PURE. Everything here is derived from the system's own nodes; nothing is
// authored, nothing is cached, and no view may count these things for itself. The starmap already
// carried a SECOND count of the same question in `StarmapListView.summary` — a different rule
// (`dwarf-planet`, a roleHint the type union does not contain, so a dead branch) reaching a
// different answer — and that is the duplication fault this codebase keeps paying for. It reads
// this module now, so there is one answer to "how many planets".
//
// THE DESIGNATION IS NOT SPELLED HERE. `system/starClassExplain.ts` is the ONE builder for what a
// star is called and what that means in words; this module asks it and passes the answer through.
// A second spelling of "G2V (Main-sequence dwarf, yellow to human eyes, about the size of the Sun)"
// is exactly the fault that file's own header was written to prevent.
//
// IT IS GM-SIDE. The player surfaces redact — hidden bodies, hidden descriptions, the disclosure
// ladder — and this counts everything a GM owns, so nothing on the player path may mount a view
// built on it without deciding redaction first. `systemSummary.spec.ts` pins that the player
// starmap does not.
import type { System, CelestialBody, RulePack } from '$lib/types';
import { showsAsConstruct } from '$lib/constructs/chrome';
import { megaTypeDef } from '$lib/constructs/megaTypes';
import { systemVisualStars } from './systemStars';
import { explainStarClass } from '$lib/system/starClassExplain';
import { STELLAR_ACTIVITY_TAG } from '$lib/physics/stellarActivity';

/** One system's contents, counted once. */
export interface SystemSummary {
	/** The system's own name, as the map labels it. */
	name: string;
	/**
	 * The PRIMARY star's designation in plain English, from `starClassExplain`. Undefined for a
	 * system with no star, or one whose class this build cannot explain — an unknown designation is
	 * better left unsaid than guessed at, which is that module's own rule.
	 */
	designation?: string;
	/** How many stars the map draws for this system — the same reader the glyphs use. */
	stars: number;
	/** `roleHint: 'planet'`. */
	planets: number;
	/** `roleHint: 'moon'`. */
	moons: number;
	/** Belts and rings: real bodies, counted apart because "12 bodies" would hide them. */
	minorBodies: number;
	/** Everything presented as a PLACE — ordinary constructs and any body wearing construct chrome. */
	constructs: number;
	/**
	 * The compact life line, present only when something in the system carries a biosphere. Names
	 * how many worlds and whether any of them got past microbes — the two facts a GM glancing at a
	 * map actually wants.
	 */
	life?: string;
	/**
	 * THE SPECIAL LINE — the owner's "any special stuff like ringworld stuff". Mega-constructs by
	 * their REGISTRY LABEL, so a pack that renames a type renames it here for free, and an unknown
	 * `megaType` this build has no record for is skipped rather than printed raw.
	 */
	specials: string[];
}

/** A node the summary counts: a body or a construct, never a barycentre. */
type Countable = CelestialBody;

const isBody = (n: unknown): n is Countable =>
	!!n && ((n as Countable).kind === 'body' || (n as Countable).kind === 'construct');

/**
 * Count a system. PURE — takes the system and the pack, touches neither.
 *
 * The pack is optional and only feeds the designation's size clause; without one the summary is
 * still complete apart from that phrase, which is the honest degradation for a map opened before a
 * pack has loaded.
 */
export function systemSummary(
	name: string,
	system: System | null | undefined,
	rulePack?: RulePack | any
): SystemSummary {
	const out: SystemSummary = {
		name,
		stars: 0,
		planets: 0,
		moons: 0,
		minorBodies: 0,
		constructs: 0,
		specials: []
	};

	const nodes = (system?.nodes ?? []).filter(isBody);

	// The stars are the map's own reader, so the count under the cursor can never disagree with the
	// number of discs drawn above it — including the lone-body fallback for a rogue world.
	const visual = systemVisualStars(system);
	out.stars = visual.length;

	// THE PRIMARY IS THE ONE THE GLYPH READER PUT FIRST (most massive), for the same reason.
	const primaryId = visual[0]?.id;
	const primary = primaryId ? nodes.find((n) => n.id === primaryId) : undefined;
	if (primary) {
		const key = (primary.classes ?? []).find((c) => c.startsWith('star/')) ?? primary.classes?.[0];
		if (key) {
			const activity = primary.tags?.find((t) => t.key === STELLAR_ACTIVITY_TAG)?.value;
			out.designation = explainStarClass(rulePack, key, activity as string | undefined)?.text;
		}
	}

	// A HYBRID IS COUNTED ONCE, AS THE THING IT PRESENTS AS. A ringworld is `kind: 'body'` with
	// construct chrome in the design's later phases, so the chrome predicate has to be asked FIRST
	// or it would be tallied as a planet as well (G53 §3.3 — never test the raw flags).
	const specialCounts = new Map<string, number>();
	let livingWorlds = 0;
	let complexWorlds = 0;

	for (const n of nodes) {
		if (n.megaType) {
			const def = megaTypeDef(n.megaType);
			// A pack may name a type this build does not know: skip rather than print the raw key.
			if (def) specialCounts.set(def.label, (specialCounts.get(def.label) ?? 0) + 1);
		}
		if (showsAsConstruct(n)) {
			out.constructs++;
			continue;
		}
		if (n.roleHint === 'star') continue; // already counted, by the glyph reader
		if (n.roleHint === 'planet') out.planets++;
		else if (n.roleHint === 'moon') out.moons++;
		else if (n.roleHint === 'belt' || n.roleHint === 'ring') out.minorBodies++;

		if (n.biosphere) {
			livingWorlds++;
			if (n.biosphere.complexity === 'complex') complexWorlds++;
		}
	}

	if (livingWorlds > 0) {
		const worlds = `${livingWorlds} world${livingWorlds === 1 ? '' : 's'}`;
		out.life = complexWorlds > 0
			? `Life on ${worlds}, ${complexWorlds} complex`
			: `Life on ${worlds}, microbial`;
	}

	out.specials = [...specialCounts.entries()].map(([label, count]) =>
		count === 1 ? label : `${count} × ${label}`
	);

	return out;
}

/**
 * The counts as ONE compact line: "3 planets · 7 moons · 2 belts · 4 constructs".
 *
 * Categories are NAMED rather than rolled into a single "12 bodies", because a reader cannot tell
 * whether that figure includes the planets and the standing rule is explicit that a quantity has to
 * say what it measures. A zero category is left out rather than printed as "0 moons".
 */
export function contentsLine(s: SystemSummary): string {
	const parts: string[] = [];
	const add = (n: number, one: string, many: string) => {
		if (n > 0) parts.push(`${n} ${n === 1 ? one : many}`);
	};
	add(s.planets, 'planet', 'planets');
	add(s.moons, 'moon', 'moons');
	add(s.minorBodies, 'belt or ring', 'belts and rings');
	add(s.constructs, 'construct', 'constructs');
	return parts.join(' · ');
}

/**
 * The line a text list wants: the stars first, then the contents. Kept beside `contentsLine` so the
 * two phrasings of one set of counts sit together — the list view had its own copy of this.
 */
export function listLine(s: SystemSummary): string {
	const parts: string[] = [];
	if (s.stars) parts.push(s.stars === 1 ? '1 star' : `${s.stars} stars`);
	const contents = contentsLine(s);
	if (contents) parts.push(contents);
	return parts.join(' · ') || 'uncharted';
}
