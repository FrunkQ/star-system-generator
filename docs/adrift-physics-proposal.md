# Adrift & aborted-journey drift physics — feasibility + proposal

Status: **PROPOSAL — not built.** Decide before we go ahead (Alex, 2026-06-16). Extends the interstellar
log-driven model (see [[project_sse_v2_aging_classifier]] interstellar block) and the autopilot spec.

## The ask

When a journey is aborted, what the ship does next depends on its drive:

- **Jump drive** — interrupted ⇒ it's just *stationary* in interstellar space (the current "adrift" model:
  a fixed point). Nothing more needed.
- **Relativistic / "ran out of fuel to stop"** — it keeps coasting **in a straight line** at its current
  velocity and heading; the dashed "ahead" line follows that heading, and it eventually drifts **off the
  edge** of the interstellar map.
- **Stretch goal** — that drift path is **perturbed by gravity**: the starmap's stars (interstellar) make
  the path *wobble*; in-system, an aborted transit keeps its velocity but is pulled by the system's bodies,
  so a genuinely *stationary* object slowly *falls toward the star*.

Hard constraint (same as the whole interstellar model): it must stay **time-slideable / reversible** —
the current position is *derived* from the log + clock, never stored as mutable live state.

## Why this is tractable: a TEST PARTICLE in a KNOWN field

The adrift ship has negligible mass, so it does **not** perturb the stars or planets — and those bodies'
positions are **already closed-form functions of the clock** (star positions are fixed on the starmap;
in-system bodies follow their Keplerian orbits, which we already evaluate at any T). So the drifting ship
is a **test particle moving through a known, deterministic, time-varying gravity field**. That's the
*restricted* N-body problem — vastly easier and fully deterministic, unlike true mutual N-body. We never
integrate the whole system; we integrate one massless point through a field we can already sample at any T.

## The model: the log stores ANCHORS; position is DERIVED by integration

This is the exact same shape as today, generalised:

- *Today:* transit = interpolate between two fixed system points by `frac(clock)`; adrift = a fixed point.
- *Proposed:* an adrift/ballistic record stores an **anchor** `{ t0, pos0:(x,y), vel0:(vx,vy) }` (the state
  at the abort instant). Position at display-time T = integrate the test particle from the anchor to T.
  - **Ballistic (gravity off):** closed-form `pos(T) = pos0 + vel0·(T − t0)`. Exact, trivial, reversible.
  - **With gravity:** numerically integrate (RK4) from the anchor through the known field to T.
    Deterministic for a fixed timestep ⇒ the same T always yields the same point ⇒ scrub-safe.

Scrub *before* t0 and the ship is still mid-journey (pre-abort) — handled by the existing journey resolver.

## Reversibility / time-sliding — the one real cost, and the fix

Deterministic integration from a fixed anchor with a fixed `dt` makes `pos(T)` a pure function of
`(anchor, T)`, so scrubbing re-derives the same point. The only cost is that integrating anchor→T is
`O((T − t0)/dt)` steps — for a long-adrift ship scrubbed far ahead, that's many steps *per frame*.

**Fix — checkpoints in the log (this is exactly Alex's "store enough to recreate T" instinct).** Append a
`{ t, pos, vel }` sample to the journey log periodically (e.g. every game-week, or every K integration
steps). Display-T then integrates from the **nearest checkpoint ≤ T**, bounding the per-frame cost to one
inter-checkpoint span. Checkpoints are themselves derived (each computed from the previous), so they don't
break determinism — they're a cache that *lives in the log*. The log already being the single source of
truth means this fits with no new mutable state.

## Difficulty

| Piece | Effort | Notes |
|---|---|---|
| **Ballistic straight-line drift** (interstellar + in-system, no gravity) | **Easy** (~½–1 day) | Add `vel` + `t0` to the adrift record; closed-form derive; ahead-line follows heading; cull/stop drawing past map bounds. Covers the relativistic / out-of-fuel abort visually. |
| **Restricted-N-body wobble** | **Moderate** (~2–4 days) | Deterministic RK4 test-particle integrator over the known field; checkpoint sampling in the log; per-scale `dt` tuning (interstellar: large dt, weak distant gravity; in-system: finer dt). The integrator is small; the care is determinism + checkpoint bookkeeping. |
| **In-system "stationary falls toward the star"** | falls out for free | Same integrator: anchor at rest ⇒ the in-system field accelerates it. No extra machinery beyond sampling in-system body positions (already closed-form). |

## Fly-by swings around the target star (Stage 3 consequence)

A "Realistic, cannot-stop" plan (shipped in Stage 1) reaches the destination and coasts on past it. Today
that's a straight line. Once the gravity integrator lands, the coasting ship is just a test particle in the
**destination star's** field as it passes — so it naturally bends into a **hyperbolic gravity swing
(slingshot)** around that star, deflecting its onward heading, rather than flying dead straight. No special
case needed: it's the same restricted-N-body integration, anchored at the arrival point with the cruise
velocity, evaluated against the in-system bodies of the system it's tearing through. (A nice emergent
detail: the swing direction/strength depends on how close the fly-by passes the star.)

## Intercept & dock with a MOVING target (validate after this lands)

The rescue's other half: flying TO a target that's itself moving — a coasting fly-by derelict, an adrift
ship drifting, or another ship under way. Two sub-problems, both tractable because the target's trajectory
is already deterministic (Stage 1 drift / a derivable journey):

- **Intercept** — don't aim where the target IS, aim where it WILL BE at arrival. Since the target's
  position is a known function of time, this is a lead-time solve (root-find: pick arrival T so the
  interceptor's reachable position at T equals target(T)). The transit calculator currently targets a
  FIXED system+body, so this needs the point-destination model (Stage 2) generalised to a *time-varying*
  point.
- **Dock** — arriving at the same place isn't enough; you must match the target's **velocity vector** at
  rendezvous, or you blow past it. That's an extra Δv = |v_arrival − v_target| on top of the journey — i.e.
  **more fuel** (exactly the concern). The planner must add this matching burn to the budget/feasibility
  check; with a fast coasting derelict the match cost can dominate, and a fuel-short ship would itself
  become a fly-by (recursively the same cannot-stop case).

**Validation checklist (when we get here):** (1) a journey can target a moving construct, not just a
system/body; (2) the planner leads the target (arrival point = target position at arrival time); (3) the
Δv budget includes the velocity-match term and the plan goes infeasible / fly-by if fuel is short;
(4) on success the interceptor ends co-located AND co-moving with the target (a real dock), reversibly.
This rides on Stage 2 (point/moving destinations) + the Stage 1 velocity model; flag it as its own
verification pass once those exist.

## Recommended sequence

1. **Ballistic drift first** — closed-form, low risk, immediately useful (relativistic/out-of-fuel aborts
   coast off the edge; the dashed line follows the heading). Extends `ConstructPlacement.adrift` and the
   `AdriftConstruct` record with `vel:(vx,vy)` + `t0`.
2. **Restricted-N-body wobble** as an opt-in refinement once the anchor + checkpoint log shape exists.
   Interstellar wobble (gentle, big dt) is the cheaper, more visible win; the in-system version reuses the
   same integrator against the orrery's Keplerian field.

## Decisions to make before building

- **Drive → abort behaviour mapping:** jump = stationary; relativistic/torch = coast with velocity; is
  that the full rule, or per-drive-type configurable? (Ties to the FTL-drive CoI.)
- **Checkpoint cadence:** cheaper scrub vs bigger log. Suggest time-based (e.g. weekly) + on every GM edit.
- **`dt` per scale:** accuracy vs cost. For a GM tool "looks plausibly perturbed" beats numerical precision.
- **Off-edge:** keep deriving (cheap) but stop drawing past bounds; surface a "recover / relaunch from here"
  action — which dovetails with the already-pending **relaunch-from-adrift** work.
- **Velocity source on abort:** take the journey's instantaneous heading × its speed at the abort instant
  (both already implied by the transit record), so no new input is needed from the GM.

## Net

The straight-line case is genuinely easy and worth doing now. The gravity wobble is *moderate, not hard*,
because it's a restricted (test-particle) problem in an already-closed-form field, and it stays fully
reversible as long as the log stores anchors (+ periodic checkpoints) and we always integrate from the
nearest anchor. No departure from the derive-from-clock principle.
