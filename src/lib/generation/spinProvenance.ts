import type { Tag } from '../types';

// Which of a body's SPIN values were invented rather than measured, as tags.
//
// D2a's constraint: an inferred number must be distinguishable from a measured one, or a generated
// world sitting in the same starmap as Earth asserts its obliquity just as firmly. That rule has to
// hold on EVERY body-creation route, and this repo has three of them
// (docs/dev/generation-duplication-map.md) — the shared _generatePlanetaryBody, and SystemView's
// inline literal which touches neither BodyFactory nor the generator. A rule enforced on one route
// is how B9a happened, so the decision lives here and both callers use it.
//
// WHAT DOES AND DOES NOT BELONG HERE, and it is not a judgement call — the test is whether the
// PROCESSOR re-derives the value, because a value it replaces was never a claim the generator made:
//
//   axial_tilt_deg         Nothing re-derives it. The rolled number is what the reader sees.  TAGGED
//   rotation_period_hours  Re-derived ONLY for a tidally locked body (SystemProcessor's lockedSpin
//                          sets the period from the orbit). An unlocked body keeps the roll.  TAGGED
//                          unless locked.
//   magneticField          ALWAYS replaced — `if (!body.magneticField?.manual)` overwrites it from
//                          the derived magnetism model, and every `magnetic/*` tag is stripped and
//                          re-derived alongside it. So a provenance tag would be both untrue and
//                          deleted on the next pass. NOT TAGGED. The roll is not dead code, though:
//                          pass 2 reads the field for atmospheric escape and radiation shielding
//                          before pass 3 overwrites it, which is inbox B13 and the reason the
//                          duplication map lists removing these rolls as unsafe for now.
// Typed STRUCTURALLY rather than as Pick<CelestialBody, …>, and not by choice: `axial_tilt_deg` is
// not declared on CelestialBody at all, so the Pick does not compile. Every site that reads or writes
// it does so through an untyped access — the same drift that left Orbit.frame untyped until C3(c)
// needed it. Adding it to the interface is the right fix and is deliberately not done here: it would
// newly type-check dozens of existing accesses in one go, which is its own change with its own
// fallout, not a rider on this one.
export function spinProvenanceTags(body: {
	axial_tilt_deg?: number | null;
	rotation_period_hours?: number | null;
	tidallyLocked?: boolean;
}): Tag[] {
	const tags: Tag[] = [];
	if (body.axial_tilt_deg != null) tags.push({ key: 'spin/axis-inferred' });
	if (body.rotation_period_hours && !body.tidallyLocked) tags.push({ key: 'spin/period-inferred' });
	return tags;
}
