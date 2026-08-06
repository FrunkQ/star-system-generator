# Camera, framing and scale - redesign

STATUS: DESIGN FINAL, BUILD NOT STARTED. Written 2026-08-05 at v2.1.450-beta, after a day spent
fixing the 3D scene's framing one mechanism at a time; all four open questions answered by the
owner 2026-08-06 (section 9). Next step is Phase P1 (section 7). The owner's direction: "we have
evolved complexity out of simplicity... time to step back, rethink and redesign now we have a
clear set of requirements and a better insight into needs and layers."

Companion records: RENDER-S6/S8/S9/S10 in `docs/dev/engine-map.md` (the hard-won rules this design
must keep), `docs/dev/g3-ship-models-handoff.md` section 1 (the sizing fault), and the G3 row of
`docs/dev/observations-inbox.md`.

---

## 1. Why a redesign, not a seventh patch

The framing GEOMETRY was never wrong. `frameDistance` returned 1.06e-9 scene units for a 46 m hull
- the right answer - on the first day and every day since. Every fault of the last two days was in
machinery wrapped AROUND that answer, added one era at a time as the scene took on jobs it was not
born with (true scale, ship-sized subjects, fast movers, live snapshots):

| # | Mechanism at fault | Measured failure |
|---|---|---|
| 1 | Model normalisation overwritten by the caller (RENDER-S9) | hull drawn 25.6x oversize; ISS a fifth of an AU long |
| 2 | Linear distance ease across a 10-orders-of-magnitude scene (RENDER-S10) | ease expired mid-flight; shot stranded ~1e6x too far out |
| 3 | Ease flying through absolute space while the subject moves | closed to 1.3e-4, subject 6.5e-4 away next frame, forever; viewable only with the clock paused |
| 4 | Ease measured against `controls.target`, itself sliding at 18%/frame | the two fought; convergence crawled |
| 5 | Follow policy distance floor hard-coded 1e-7 | camera hauled back out 1000x the moment the ease landed |
| 6 | `setSystem` clearing focus on EVERY snapshot | a ship in transit rewrites the snapshot ~2x/s; focus and ease wiped ~2x/s; "framed too far out, inconsistently" |

Six mechanisms, each individually reasonable, each invisible from outside, all producing the same
symptom by eye. The instrument lied too (RENDER-S8): the debug hook printed the INTENDED size while
the screen showed something else, so measurement itself confirmed a wrong conclusion once.

The owner's spec, verbatim distilled: "you have a camera, a subject which should be sized to ~80%
of screen and a facing - not to be occluded by the host and otherwise frame it to its host. Simple
maths - why hard?" That is the design. The job is to make the code shaped like the spec.

## 2. Requirements

R1. SELECT FRAMES THE SUBJECT. Selecting any object (star, planet, moon, belt, construct, whether
    parked or under way) produces a shot with the subject centred at a stated screen-fill fraction
    (0.8 of the frame's minor axis for a close-up - confirmed 2026-08-06). Same click, same shot, every time -
    never a race against an async load (models, snapshots) and never dependent on the clock state.
R2. THE SHOT IS HOST-AWARE. The camera is placed so the subject's host (parent body) does not sit
    between camera and subject; where a host exists the preferred heading shows subject WITH host
    context behind or beside it, not hidden by it.
R3. SCALE-BLIND. Everything works identically at readable scale (~0.1-20 scene units) and true
    scale (~1e-10). All interpolation, arrival testing and thresholding is ratio-based (log
    space). No absolute epsilon, floor or step anywhere in the camera path (RENDER-S6/S10).
R4. MOVING SUBJECTS ARE FIRST-CLASS. A ship under thrust or a station in fast orbit frames and
    holds exactly like a parked one. No pausing the clock to look at something.
R5. THE USER OWNS THE CAMERA. After the framing motion lands (or is interrupted), drag/wheel/pinch
    have full authority. NOTHING may move the camera against the user's input: no re-arming ease,
    no auto-frame pullback, no appearance-setting side effects (the setFraming keystroke trap),
    no snapshot rebuild. Explicit re-select or ladder click is the only way the system retakes it.
R6. LIVE REBUILDS ARE INVISIBLE. A snapshot refresh of the SAME system preserves focus, camera and
    any in-flight motion (v2.1.450 behaviour, now a requirement). Changing system resets.
R7. ONE CODE PATH. Locked-heading (2D/projector), free-orbit 3D, whole-system, belt focus and
    follow-GM are POLICIES feeding one solver - not parallel branches with their own easing,
    floors and arrival rules. (Today: two branches in driveFocus, each with its own bugs.)
R8. LADDER PRESERVED, AND CONSTRUCT-AWARE. The click-ladder levels (0 pair-context, 1 context,
    2 satellites, 3 close-up) survive as shot presets; `frameHalfExtent` already encodes them
    purely. The BODY ladder is right as it stands ("we have planets click hierarchy perfect now")
    and must not move. Constructs get their own rungs because they are usually far too small for
    the body ladder to read - see section 4a.
R11. ONE RULE EVERYWHERE. The ladder, the framing and the scale law behave IDENTICALLY on the GM
    view, every player view and the system view (owner, 2026-08-06: "same rule across gm and
    player views... and system - the point of this unification"). A surface may restrict
    INTERACTION (a projector table is not clickable) but never redefine the rule. Any "just for
    the player view" branch in framing or scale is a defect.
R12. SCALE-AWARE THROUGHOUT. Every rule above must read the CURRENT view scaling - the body-size
    dial, compression, the whole/close framing - rather than assuming readable scale (owner:
    "it has to be very aware of the current view scaling"). This is why the scale law is a pure
    module with an explicit context (P1) instead of closures reading ambient state: the ladder and
    the solver take the same context, so they cannot disagree about how big anything currently is.
R9. SIZE ORDERING IS HONEST (the scale law, section 5). At every dial position: a physically
    larger object never renders smaller than a physically smaller one. Log-type scaling - larger
    things shrink slower - with ordering preserved. Banding is by PHYSICAL size, kind-blind
    (decision 2026-08-06): an ordinary ship never rivals a body because it IS small, but a
    moon-sized construct legitimately reads moon-sized - "you could construct a death star, so
    no strict limits".
R10. MEASURABLE. The solver is pure and unit-tested; the live scene exposes the solver's intent
    beside the measured result (`__camDebug`, `__shipDebug` with `measured`/`ratio`), and a
    reference screen exists so a human can eyeball every object class at every dial stop
    (section 6). Test names tie back to engine-map IDs.

## 3. Inventory of what exists (keep / absorb / delete)

M1. `frameHalfExtent` + `FRAME_LEVELS` (viewport/camera.ts) - pure, correct, tested. KEEP as-is;
    it becomes the context-radius input to the solver.
M2. `frameDistance` (scene.ts) - correct maths wrapped in scene state. ABSORB into the solver
    (pure version takes subject/host/peers as arguments).
M3. `driveFocus` - two branches (lockRotate / free), each easing, each with private arrival
    rules; plus belt and whole-system cases inline. REPLACE with solver + one motion layer.
M4. `focusDrive` counter (48 frames) - the root of "armed forever" and "expired mid-flight".
    DELETE. Motion completes by arrival (ratio test), not by counting.
M5. `autoFrameStep`/`dampedZoomStep` (viewport/camera.ts) - shared with the GM orrery, which is
    its real home. KEEP for the orrery; the holo stops calling it (its rate-limits and deadband
    are what held the settled shot 18x wide of ideal; its floor caused fault #5).
M6. `userZoomOverride` + wheel/pointer listeners - the right idea (user authority) expressed as a
    flag that several writers forget to honour. ABSORB: user authority becomes structural (D3) -
    the system writes a BASE shot, user input writes an OFFSET, and only explicit re-frame clears
    the offset. A flag nobody needs to remember cannot be forgotten.
M7. `_prevDesired` motion-carry (v2.1.448) - patch over the ease flying through absolute space.
    DELETE; subsumed by D3 (the base shot is recomputed from the subject's live position every
    frame, so motion is carried by construction).
M8. `setFraming` / `applyStyle` guard - keep the "appearance never moves the camera" rule; the
    angle/whole/fill inputs become solver policy fields.
M9. Ladder state (`focusLevel`, `levelsForBody`, re-click stepping, browser-back) - KEEP; UI
    concern, feeds the solver's level input.
M10. Follow-GM (`followFocus`, `followFocusLevel`, `setViewportAU`) - KEEP surfaces; internally
    they become "set solver inputs" (focus id + level) or "set explicit shot" (GM manual
    viewport), losing their private camera writes.
M11. Turntable (`controls.autoRotate`) - KEEP; it is an offset-writer like the user's drag, so it
    composes naturally in D3.
M12. Floating origin + `maybeRebase` - KEEP untouched (project_sse_v2_floating_origin rules). The
    solver works in absolute AU-side positions and converts at the edge, so a rebase cannot
    invalidate solver state (today it invalidates the motion-carry, M7).
M13. Adaptive near plane + A23 ring refinement - KEEP; consumers of the working distance, not
    camera writers. (The fixed far plane is a separate defect - section 8.)
M14. `shipLenScene`/`bodyRadiusScene`/`starRadiusScene`/`dialBlend` - closures inside
    createHoloScene, untestable, and the seat of the scale law. EXTRACT to a pure module
    (section 5) regardless of what the law becomes.

## 4. Design

D1. PURE SHOT SOLVER, one function, new module `src/lib/viewport/shotSolver.ts`:

    solveShot({
      subject: { pos, radius },            // radius from AUTHORED data (R1): body radiusKm or
                                           // construct dimensionsM through the scale module
      host?: { pos, radius },              // framing parent, if any
      context: { level, parentDist, maxSatelliteDist, pairContextDist },  // M1 inputs
      lens: { fovY, aspect },
      policy: {
        fillFrac,                          // R1's "80%" as an actual input
        tiltRad,                           // angle from vertical
        heading: 'host-relative' | { fixedAzimuth },   // R7: lockRotate = fixedAzimuth policy
        whole?: boolean, beltOuter?: number,
      }
    }) -> { target, camPos, dist }         // deterministic, no scene state, no clock

    Host-aware heading (R2): the default azimuth looks along (host -> subject) projected to the
    orbital plane, so the subject sits in front of its host, never behind it; a fixedAzimuth
    policy (2D/projector) overrides azimuth and accepts that occlusion can happen (it is a plan
    view). Occlusion guarantee, not heuristic: with the camera on the subject's side of the host
    at dist << subject-host separation, the host cannot intrude; the solver asserts
    dist + subjectRadius < separation when a host exists at level 3.

D2. PLACE, DON'T EASE. On any explicit (re)frame - select, ladder click, level follow, GM focus -
    the solver output is the camera's BASE STATE from that frame on. The transition to a new base
    is cosmetic only: render-side interpolation in log-distance + slerp-heading with a fixed
    small time constant (~0.3 s), running on wall-clock, that CANNOT change the destination.
    If it is interrupted, killed by a rebuild, or the tab hitches, the next frame still renders
    at (or converging on) the correct base. This one decision deletes faults 2, 3, 4 and 6's
    camera half. Arrival is `|log(cur/target)| < 0.05` (ratio, RENDER-S10) and exists only to
    stop the cosmetic blend, never to gate correctness.

D3. BASE + OFFSET. Camera state is exactly two pieces:
      base   = solveShot(inputs-of-now)        recomputed EVERY frame from live positions (R4, R6)
      offset = user's rotation-about-subject, zoom RATIO, pan     (R5; starts at identity)
    Rendered camera = base composed with offset. Drag/wheel/turntable write offset; the system
    writes only base; explicit re-frame resets offset (through the same cosmetic blend). The
    subject moving, the snapshot rebuilding, or the origin rebasing changes base and leaves the
    offset alone - so a followed ship keeps the user's chosen viewpoint by construction, which is
    today's follow behaviour generalised to every state including mid-approach. `userZoomOverride`
    and `followEngaged`-as-camera-gate disappear; "the user has the view" simply means
    offset != identity.
    Zoom composes as a RATIO on distance (R3), clamped to [minDistance/base.dist, maxZoomOut].

D4. POLICIES, NOT BRANCHES (R7). lockRotate, flatOverhead, framingWhole, belt focus and follow-GM
    each reduce to a policy value or an input override on the ONE solver + ONE motion layer:
      - lockRotate       -> heading: fixedAzimuth(lockedHeading); offset rotation disabled
      - flatOverhead     -> tiltRad = 0 (plan view), pan replaces rotate in offset space
      - framingWhole     -> subject := system sphere (GRID_RADIUS * 1.06), no host. Whole is the
                            HOME shot, not a lock (decision 2026-08-06, changes today's
                            select-only rule): in an interactive view, clicking an object selects
                            it AND frames it like any other mode; stepping back out of the ladder
                            returns to the whole shot. Non-interactive views cannot click, so
                            GM-driven projector presets keep their fixed table view untouched.
      - belt focus       -> subject := annulus (existing outerScene * 1.9 as radius input)
      - follow-GM manual -> an explicit base override (setViewportAU), cleared by local re-select
    driveFocus's if/else tree, with its per-branch easing and floors, goes away.

## 4a. The construct ladder and the transit route line (owner, 2026-08-06)

Bodies keep today's ladder untouched (R8). Constructs get their own, because a construct is
usually far too small for the body rungs to say anything useful:

  CLICK 1 - CLOSE-UP. Zoom IN so the construct is centred and fills the frame at R1's 0.8. The
    purpose is confirmation as much as inspection: it makes unmistakably clear WHAT you clicked,
    and it starts you in close rather than hunting for a speck.
  CLICK 2 - CONTEXT, and it depends on what the ship is doing:
    - PARKED / IN ORBIT: frame it with its HOST, exactly as a moon's context rung does. (This is
      today's level 1, so the shot already exists - only the ordering is new.)
    - IN TRANSIT: frame it between ORIGIN and DESTINATION, so the whole journey is in shot with
      the ship somewhere along it. This is a NEW shot: its extent comes from the route, not from
      a parent body, and `frameHalfExtent` has no rung for it. It becomes a solver input
      (`routeExtent`) alongside parentDist/maxSatelliteDist.
  Further clicks wrap as they do today.

ROUTE LINE. A construct in transit draws its route the way a body draws its orbit: the same kind
of line, obeying the SAME show/hide toggle as orbit lines, and marked with its ACCELERATION and
BRAKE points. It is the transit-mode sibling of the orbit ring, so it should reuse the ring's
machinery - including the A23 focus-adaptive resampling, or a close-up will show the same faceting
that A23 exists to fix (RENDER-S10's neighbourhood).
  - Turns off with orbit lines, and turns off when the ship is not in transit.
  - The accel/brake points are exactly what `driveBurns` already carries (when, how hard, which
    way) - see the redaction note below.

DATA BOUNDARY - NEEDS A DECISION (Q5). This is the one part that is not free. `slimNode` strips
`scheduled_journeys` from every player snapshot ON PURPOSE: they carry the ship's FORWARD PLAN and
huge path arrays, and the design note in `shipBurn.ts` is explicit that `driveBurns` publishes the
observable burn ("when, how hard, which way, and nothing else - no destination, no route, no
path") precisely so a plume can light without the plan crossing. A route line drawn on a player
view publishes the destination and the arrival time, which is a real change to what players know.
R11 says the rule is the same everywhere, so the honest options are:
  (a) PUBLISH THE ROUTE. Players see where a ship is going. Simplest, matches R11 literally, and
      is a legitimate setting for a game where traffic is public - but it is a deliberate
      widening of the redaction boundary, not an implementation detail.
  (b) PUBLISH THE FLOWN PATH ONLY. The line behind the ship plus burns already made; nothing
      ahead. Same rule everywhere, no forward plan crosses. The GM still sees the full route
      because the GM has the journeys - a difference in DATA, not in rule, which satisfies R11.
  (c) GM-ONLY LINE. Simple, but it IS a per-surface rule and so contradicts R11.
Recommendation: (b). It keeps R11 intact, needs no new redaction surface, and reads correctly -
players watching a ship see where it has been and that it is burning, and learn its destination
when it arrives. Owner decides before this ships.

D5. SCALE RULES, stated once (R3): every distance blend/compare in the camera path is in log
    space; the only lower bound is controls.minDistance, which itself derives from the subject's
    authored size (1.15 * radius, floored 1e-10 for constructs / 1e-6 otherwise, as today after
    v2.1.448); no other floor may exist. A unit test greps the motion layer for `* 0.14`-style
    linear steps and absolute epsilons the way modelViewer.spec pins its contract.

D6. DIAGNOSTICS ARE PART OF THE DESIGN (R10). `__camDebug` prints base vs rendered vs offset and
    the solver inputs; `__shipDebug` keeps `measured`/`ratio` (RENDER-S8's caveat: report the
    OBJECT, not the intent). Both live in the motion layer, not scattered.

## 5. The scale law (R9) - extract first, change second

Current state: `dialBlend` (geometric, correct per RENDER-S6) with per-class readable sizes -
stars 0.5, bodies via `bodyRadius` capped 0.1 off-system-level, ships log-mapped 0.14-0.7. The
functions are closures in scene.ts (M14): untestable, and the readable bands can INVERT ordering
(a 46 m ship's readable 0.16 vs a 500 km moon's capped 0.1) - the owner's report: ships must look
larger when readable, but never rival bodies, and never invert.

S1. EXTRACT `src/lib/rendering/scaleLaw.ts`: pure `renderedSize(class, trueSceneSize, dial)` with
    the current behaviour reproduced bit-for-bit first (equivalence-tested against the closures,
    then the closures delegate). No visual change in this step.
S2. THE LAW (decision 2026-08-06): readable size = a single KIND-BLIND monotone map of
    log(physical size), piecewise over PHYSICAL-size bands (ship-scale < asteroid-scale <
    moon-scale < planet-scale < star-scale), bands non-overlapping in output. What an object IS
    never enters the law - only how big it is. Because the map is monotone in log(true) end to
    end, ordering is preserved at the readable end; the true end is ordered by physics; and the
    geometric dial blend of two monotone endpoints stays monotone at every dial stop - R9 holds
    by construction, not by tuning. An ordinary ship therefore never rivals a body (it is
    physically small), while a deliberately absurd construct - a Death Star, a 940 km station -
    honestly renders at the scale its size puts it. No caps, no per-kind exceptions.
S3. KNOWN COST (RENDER-S6 BLAST): mid-dial looks in saved presets shift. Bundled presets get
    re-eyeballed; the owner signs off the new bands on the reference screen (section 6) before
    this ships. Endpoints (dial 0 and 1) barely move for bodies; ships change most - that is the
    point.

## 6. Test plan and the reference screen

T1. Solver unit tests: fill fraction honoured at fov/aspect extremes; host never occludes at
    level 3 (assert the D1 inequality); heading policies; ladder levels reproduce
    frameHalfExtent's shots; all-scales sweep (radius 1e-10..1, distance ratios identical).
T2. Motion-layer tests: base recomputed under a moving subject (simulated orbit - the fault-3
    regression); offset survives base changes and rebuilds; explicit re-frame resets offset;
    cosmetic blend converges within N wall-clock steps at ANY scale (fault-2 regression);
    a `setSystem` with the same id preserves focus (fault-6 regression, exists since v2.1.450);
    whole mode: a click in an interactive view frames the object, stepping back out returns to
    the whole shot, and a non-interactive view never moves (D4's whole-as-home decision).
T3. Scale-law tests: monotonicity across every class boundary at dial = 0, 0.25, 0.5, 0.75, 1
    (property test over random true sizes); band non-overlap; equivalence snapshot for S1.
T4. REFERENCE SCREEN `/scale-reference` (owner request, 2026-08-05): a diagnostic route rendering
    the canonical set - Sol-like star, gas giant, terrestrial, large moon, 500 km asteroid, 2 km
    station, 46 m ship - through the REAL scale law and REAL solver at each dial stop, with the
    numbers (true size, rendered size, frame distance, expected px) printed beside each. Every
    row names the test that pins it (T3 ids) and the engine-map rule it exercises, so "the visual
    expectations or measured results" are one screen, referenceable from the engine doc, usable
    for the owner's eyes-on pass and for any future session's before/after.

## 7. Phases (each a commit, beta-pushed, owner can eyeball between any two)

P1. Extract, no behaviour change: scaleLaw.ts (S1) + shotSolver.ts (solver reproducing today's
    settled shots, equivalence-tested); scene.ts delegates. Reference screen reading the pure
    modules ships here too - it makes P2/P3 reviewable.
P2. Motion layer: base+offset replaces driveFocus's branches; focusDrive/autoFrameStep-in-holo/
    userZoomOverride/_prevDesired deleted (M4-M7). The riskiest phase; T2 lands with it.
P3. Host-aware heading (D1's occlusion rule) - a visible behaviour change, small diff.
P3b. Construct ladder (section 4a): close-up first, then host-or-route context. Bodies untouched.
    Needs the solver's `routeExtent` input; no new rendering.
P3c. Transit route line (section 4a): reuse the orbit-ring path including A23 resampling, accel/
    brake markers, same visibility toggle. GATED ON Q5 (what crosses to players).
P4. The new scale law (S2) - LAST, because it moves preset looks (S3) and needs the owner's
    sign-off on the reference screen first. Turns on the skipped R9 tests in scaleLaw.spec.ts.

## 8. Adjacent defects, deliberately OUT of scope

- FAR PLANE / DEPTH RESOLUTION: near adapts to ~4e-10 while far is fixed at 2000; at ship
  close-ups the depth ratio (~5e12) exceeds the depth buffer and Earth visibly drops out. Fix is
  `logarithmicDepthBuffer` (or reverse-Z), which every hand-written ShaderMaterial in the scene
  must opt into - a rendering workstream, not a camera one.
- DRIVE PLUME NOT LIT ON PLAYER VIEWS: redaction path proven sound (shipBurnPlayer.spec end-to-end
  test, v2.1.449); remaining suspects are the thrust threshold and the player-side shipCapability
  map. One `__shipDebug` line on a burning ship (`thrust01`, `hasBurnData`) localises it.
- WIREFRAME / BLUEPRINT RATIONALISATION: the map render style currently stamps over hull finishes
  (F6 parity); owner wants them dovetailed on one render path. Separate design.
- SHIP FACING/ORIENTATION: parked by the owner ("ignore facing for now - get it right 1:1 first").

## 9. Decisions (owner, 2026-08-06) - all four questions closed, design is FINAL, build may start

Q1. Close-up fill: 0.8 of the frame's minor axis. (R1 updated.)
Q2. Host-aware heading: YES as the free-orbit default; locked-heading 2D/projector views exempt
    by policy. The default approach direction for moons and orbiting ships changes visibly.
    (D1 stands as designed.)
Q3. Scale bands are PHYSICAL-SIZE bands, kind-blind, no construct cap: "you could construct a
    death star - so no strict limits are needed". An ordinary ship stays small because it is
    small; a moon-sized station honestly reads moon-sized. (R9 and S2 updated.)
Q4. Whole-system framing is the HOME shot, not a lock: in an interactive view a click selects
    AND frames the object like any other mode; backing out of the ladder returns to the whole
    shot. Non-interactive views cannot click, so fixed projector tables are unaffected. This
    CHANGES today's select-only behaviour. (D4 and T2 updated.)

Added 2026-08-06 after P1a: the construct ladder and the transit route line (section 4a), plus
R11 "one rule across GM, player and system views" and R12 "always read the current view scaling".

STILL OPEN:
Q5. What does the transit ROUTE LINE publish to players? (a) the whole route incl. destination,
    (b) the flown path + burns already made, nothing ahead [RECOMMENDED], or (c) GM-only, which
    breaks R11. Today's redaction deliberately strips the forward plan; (a) widens that boundary
    as a conscious choice. Blocks P3c only - P3b and everything before it can proceed.
