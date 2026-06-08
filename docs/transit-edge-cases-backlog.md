# Banked — transit & belt/ring edge cases

Recorded for when the transit work (incl. 04.5 n-body perturbers) is tackled — best handled
together so destination types + the perturber model are designed coherently. Findings are from
the current code; locations are approximate.

## 1. Belts/rings are distributed mass — must NOT be point-mass perturbers
> Note: a belt's `massKg` is abstracted to **debris density** (a navigation hazard surfaced via
> `transit/telemetry.ts` Debris events + `getBeltDensityDescription`), NOT gravitational mass.
>
> **FIXED (the main manifestation):** the stability annotator (`stability.ts`) was treating belts/
> rings as gravitational *siblings*, so a belt's debris-proxy mass fed the mutual-Hill-spacing check
> and spuriously flagged neighbouring planets unstable. Belts/rings are now excluded from the
> stability `orbitalNodes` (regression test in `stability.spec.ts`). **STILL BANKED:** the transit
> n-body perturber below.

**Finding.** Belts/rings are `kind:'body'`, `roleHint:'belt'|'ring'`. In the examples they have
**no `massKg`** (→ `getNodeMass` returns 0), so today they don't perturb. **But** the n-body
perturber list does *not* exclude them: `calculator.ts:~883`
`massNodes = sys.nodes.filter(n => … && (n.kind==='body' || n.kind==='barycenter'))` sweeps in
belts/rings, and `~888` treats each as a **point mass at its node position**. So the instant a
belt/ring is given mass, it injects a bogus point-gravity pull toward an arbitrary ring location.
Gravity-assist already does the right thing (`assist.ts:57` skips `ring`/`belt`); `orbits.ts:433`
already flags `isDistributed` for them (no Lagrange points).

**Fix (with 04.5).** Exclude `roleHint` belt/ring from the perturber `massNodes` (mirror
`assist.ts`). If a belt's mass should ever matter, model it as a **central-potential contribution**
(a thin ring's external field ≈ a point mass at the *central body*; internal field ≈ 0) — i.e. a
"point gravity source" at the host, never at the ring's node. Simplest correct first step: exclude.

## 2. Transit destination = belt / ring
**Finding.** The target is resolved by node id (`calculator.ts:~197`) and the transfer aims at the
target body's orbit/state. A belt/ring target would try to *rendezvous with the ring node*, which is
wrong (there's nothing to rendezvous with).

**Desired (Alex).** A belt/ring destination = drop into a **central-body (stellar) orbit at that
radius** — just a small orbital kick to a circular orbit *within* the belt/ring, the closest point
is fine. Effectively a parking orbit at radius R around the host.

**Fix.** When `target.roleHint` is belt/ring, treat it like the existing Lagrange/parking-orbit
path (`calculator.ts:~419-420`, `parkingOrbitRadius_au`): set `r2` = the belt's mid-radius around
the central host and solve a transfer to a circular orbit there, not a rendezvous with a mass.

## 3. Transit to a point in space (zero-mass jump point) — currently fails
**Finding.** Targets must be nodes (`find(n => n.id === targetId)`). A free-space coordinate (e.g. a
jump point) is not a node → no target → the plan fails.

**Desired (Alex).** Support a destination that's a fixed **coordinate** (massless), arriving with a
**brake burn** to match the point (position, ~zero relative velocity).

**Fix.** Allow a synthetic target: a position vector (optionally a velocity), `mass 0`. The Lambert/
transfer solves to that position; arrival uses the existing `brakeAtArrival` machinery
(`calculator.ts:~79-85`) to null the relative velocity. Extend target resolution to accept a
coordinate alongside a node id, and the planner UI to let the user drop a point.

---
*All three are best done in the same pass as 04.5 (n-body transit) and the transit-planner
destination UX.*
