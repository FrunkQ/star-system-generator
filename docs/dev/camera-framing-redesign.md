# Camera, framing and scale - redesign

STATUS: P1, P2, P3, P3b and P3c ALL SHIPPED AND CONFIRMED BY THE OWNER (v2.1.451-486-beta).
**S2b IS ALSO DONE AND SHIPPED - VERIFIED IN THE CODE 2026-08-27, because this line used to say it
was not and sent a reader off to re-fix it.** `NUMERICAL_FLOOR` is 1e-10 and is applied by
`bodyRadiusScene`, the star branch AND `shipLengthScene` alike (`rendering/scaleLaw.ts` lines 54,
104, 119, 161); it landed in commit `fd03ef1a`; and its acceptance block
(`describe('S2b: one numerical floor across kinds')`, `scaleLaw.spec.ts`) is live and passing.
**S2 AND S2c ARE NOW BUILT AND HELD (2026-08-27, branch `wt/p4-scalelaw`) - NOT MERGED.** The R9
acceptance block in `scaleLaw.spec.ts` is un-skipped and GREEN with not one assertion edited, and
/scale-reference reads "No ordering violations" for the first time. **P4 IS THEREFORE COMPLETE IN
CODE AND WAITING ONLY ON THE OWNER'S EYE**, which is what this gate always was. P4 is gated on
the owner's eye: it moves saved presets' mid-dial looks, so /scale-reference is signed off BEFORE
it ships.
Companion reading before touching any of this: RENDER-S17 through S21 in engine-map.md, which are
the traps this phase found the hard way - and section 7's P3c entry, which lists the field reports
and their real causes (three of the four had a cause nobody had proposed).
Written 2026-08-05 at v2.1.450-beta, after a day spent fixing the 3D scene's framing one mechanism
at a time; all four open questions answered by the owner 2026-08-06 (section 9). The owner's direction: "we have
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

THE LIGHT BOX - what a construct with NO 3D MODEL looks like close up (owner, 2026-08-06).
"For an object that is just an icon the zoom in view does not make a great deal of sense (it needs a
3d model). For that you can perhaps draw a light box conforming to the construct dimensions and pop
the current icon on its side."

Today a model-less construct is a SCREEN-FIXED glyph: it is the same size at every distance, so the
close-up rung reveals nothing - you fly to it and the icon has not changed. Worse, it has no
rendered extent at all, which is why the solver needs a `sizelessHalfExtent` patch (0.35 scene
units, a number with no physical meaning) and why `focusBody` has to floor its min-zoom differently
for constructs without models. Both of those are workarounds for an object that refuses to have a
size.

Give it one. Every construct already authors `physical_parameters.dimensionsM`.
  - Draw a WIREFRAME HULL VOLUME at those dimensions, through the same scale law as everything else
    (`shipLengthScene` for the long axis, the other two axes in the same proportion), oriented on
    the ModelRef convention (longest axis = nose, +Z). At true scale it is honestly the size of the
    ship; at the readable end it is a legible marker.
  - SHAPE, in ascending order of ambition (owner, 2026-08-06). A plain rectangular prism reads as a
    crate and, worse, as a PLACEHOLDER for a model that failed to load. So:
      (i)  LOZENGE - tapered fore and aft, widest amidships. Reads as a vessel at a glance and
           states its heading without a label. An 8-sided tapered extrusion or a scaled
           octahedron: a handful of vertices, which matters when a busy system draws dozens.
      (ii) PROCGEN FROM A FEW POLY SOLIDS - "a cool & simple procgen using a few poly solids".
           Compose 3-6 primitives (hull spindle, nacelles, fin, ring, drum) by ROLE: a ship reads
           elongated with drives aft, a station blocky or radial, a habitat as a drum or torus.
           SEEDED BY THE CONSTRUCT'S STABLE ID, exactly as the procedural liveries already are
           (`buildDisplayModel({ seed: v.id })`), so a given ship always looks like itself.
    Either way the authored dimensions stay the BOUNDING volume, so the thing remains an honest
    size claim rather than a stylised one. Build (i) first - it is the floor that guarantees every
    construct has an extent - and treat (ii) as the look on top, since both feed the same slot.

  WHY (ii) IS A SIMPLIFICATION AND NOT A FEATURE, which is the argument for doing it at all:
    - A generated hull is just GEOMETRY, so it enters `buildDisplayModel` like an imported one and
      inherits everything already built - the seven finishes, the wireframe/render-style parity,
      the drive plumes, the nozzle placement, the info-block portrait. Nothing new to maintain.
    - It therefore collapses the "modelled construct vs glyph construct" branch that runs right
      through the scene (`showModel`, the shipLen/framing special cases, the pixel-LOD fallback,
      the min-zoom floor). Every construct has a hull; some hulls happen to be generated. ONE path,
      which is R11 and the whole point of this redesign.
    - It costs NOTHING on the wire. The seed is the construct's id and the shape comes from
      `dimensionsM` - both already on every snapshot - so GM and player generate the identical hull
      independently, with no model binary, no hash, no fetch, no `SYNC_MODEL`. That is strictly
      better than the imported-model path, which needs all four.
    - It also answers A30 (a construct has a blank where every body has a graphic) for the many
      constructs a GM will never model by hand.
  - The construct's ICON goes on a face of the box, so the close-up still says WHAT it is. This is
    the marker glyph the map already draws, relocated - NOT a body graphic, so it does not
    contradict the standing "body graphics are info-block only, never on the map" rule. Worth
    stating because that rule has come back twice.
  - Same pixel LOD as a hull: below a few pixels the screen-fixed glyph stands in, above it the box
    draws. Same render-style parity as a hull (a wireframe scene draws a wireframe box; the box IS
    wireframe, so this mostly falls out).
  - Tint from `icon_color`, as the glyph does.

WHAT IT SIMPLIFIES, which is the real reason to do it: every construct then has a rendered extent
derived from authored data, so
  - `shipLen` is meaningful for ALL constructs, not only modelled ones (today it is set from
    `shipLenScene` at read time only when a model ref exists);
  - the solver's `sizelessHalfExtent` fallback becomes unreachable for constructs, and the
    construct branch of `focusBody`'s min-zoom floor collapses into the ordinary one;
  - the close-up rung means the same thing for every object in the scene, which is R11.
So it removes two special cases rather than adding a feature. Belongs with P3b (the construct
ladder), because "click 1 zooms in so it is centred" is meaningless until there is something to
zoom to.

ROUTE LINE. A construct in transit draws its route the way a body draws its orbit: the same kind
of line, obeying the SAME show/hide toggle as orbit lines, and marked with its ACCELERATION and
BRAKE points. It is the transit-mode sibling of the orbit ring, so it should reuse the ring's
machinery - including the A23 focus-adaptive resampling, or a close-up will show the same faceting
that A23 exists to fix (RENDER-S10's neighbourhood).
  - Turns off with orbit lines, and turns off when the ship is not in transit.
  - The accel/brake points are exactly what `driveBurns` already carries (when, how hard, which
    way) - see the redaction note below.

THE PLUME AS A LIGHT SOURCE (owner, 2026-08-07: "would be great if the drive plume was a light
source at its start"). IT ALREADY IS, and the code is right: `attachDrivePlume` puts a PointLight on
each nozzle HOLDER - so at the plume's start, exactly as asked - coloured with the exhaust, with
`intensity = 7 * thrust^2 * share` so a station-keeping puff whispers and a full torch is the
brightest thing on the ship. What is wrong is its REACH:

    rig.light.distance = Math.max(1e-9, sceneLen * 8)   // 8 hull lengths

That was written to stop a 100 m exhaust lighting planets, and at the readable end of the dial it is
right. At TRUE scale it is self-defeating: `sceneLen` for a 46 m hull is ~2e-10 scene units, so the
light's range is ~1.6e-9 - and with `decay: 2` it falls to nothing across a distance far smaller
than the hull it is meant to illuminate. The light is on, correct, and lighting a volume you cannot
see. So at 1:1 - the case the owner cares about most - the plume never appears to light anything.

Fix belongs with P3c because it is the same journey/burn data: the reach should be expressed in
HULL LENGTHS of the thing being lit rather than in scene units of the emitter, i.e. scale with the
hull actually being illuminated, and the intensity should be checked against the scene's other
lights at true scale (a star at 1:1 is itself tiny, so "bright" is relative to a very dim scene).
Worth checking at the same time whether the ellipsoid stand-in hulls should be lit by it at all -
they are emissive (RENDER-S13), so a plume will not visibly light one without extra work.

DATA BOUNDARY - DECIDED 2026-08-06: PUBLISH THE FLIGHT PLAN (option (a)). The owner: "I honestly
thought we transmitted the current flight plan for a construct - but if not we can change code to
do that." So a player sees where a ship is going. This is a deliberate widening of the redaction
boundary and it must be done in the RIGHT SHAPE, because the reason the journeys are stripped today
is only half secrecy - the other half is SIZE, and that half does not go away:

  - `scheduled_journeys` carries huge `pathPoint` arrays and the whole forward plan. `slimNode`
    strips them so the snapshot stays small enough to cross a WebRTC data channel, and the
    broadcast layer RE-STRINGIFIES the whole snapshot on every change (see the G3 handoff trap 4
    and DATA-M rules). A ship in transit already rewrites that snapshot about twice a second.
    Publishing the raw journeys would multiply the payload on the hottest path in the app.
  - So publish a COMPACT ROUTE, exactly as `driveBurns` publishes a compact burn: origin, current
    destination, arrival time, and the accel/brake points already in `driveBurns`. Sampled path
    points only if the line cannot be drawn from the elements - and if they are needed, decimated,
    not raw. New field alongside `driveBurns`, attached in `slimNode` before the strip, tested end
    to end the way `shipBurnPlayer.spec.ts` now tests the burn path.
  - What still must NOT cross: the GM's DRAFT plans (`draft_transit_plan`), cancelled/alternative
    routes, and anything about journeys the GM has not committed. "Current flight plan" means the
    committed one the ship is flying.

Recorded for the implementer - the original options, kept because the reasoning matters: This is the one part that is not free. `slimNode` strips
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
CHOSEN: (a), in the compact shape above. R11 is satisfied literally - same rule, same data, every
surface.

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
S2b. ONE FLOOR POLICY, not two - found by /scale-reference on its first render (2026-08-06) and
    it bites at TRUE scale, which is the owner's current focus. `bodyRadiusScene` floors at 1e-7
    scene units and `shipLengthScene` at 1e-10: a thousandfold apart. So at dial 0 a 10 km moonlet
    renders 2.0e-7 while a physically LARGER 22 km station renders 5.9e-8 - the moonlet draws 3.4x
    too big purely because of which floor it landed on. Each floor is defensible alone (the body
    one predates true scale; the ship one was lowered for G3 hulls) and together they are an
    ordering violation the dial cannot fix. P4 must apply ONE numerical floor across all kinds -
    and, because the point of true scale is honesty, that floor should be the smallest the scene
    can carry (the construct value), with legibility left to the SCREEN-space pixel floor where it
    belongs. That is the same argument `bodyRadiusScene` already makes in its own comment against
    scene-unit floors, applied consistently.
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
P3. SHIPPED @v2.1.462-beta. Host-aware heading selected in computeBase, with a documented fallback
    to radial where no heading can both frame the subject and clear the host (hostWouldOcclude).
    It really was the one-line caller change the design predicted - the policy was written and
    tested in P1.
P3b. PARTLY SHIPPED @v2.1.459-461-beta. DONE: the stand-in hull for a model-less construct - an
    ELLIPSOID at the authored dimensionsM (the owner chose an ellipsoid over the lozenge; it makes
    no claim about heading, which the data cannot back anyway), self-lit in the construct's
    icon_color with a brighter edge (a lit material drew black-on-black - the scene's only real
    light is its star), carrying the map's own glyph as a billboard sprite. It set `shipLen` for
    EVERY construct, so the framing self-fixed: `frameDistance` has a real radius and
    `sizelessHalfExtent` is unreachable for constructs. ALSO DONE: a SURFACE construct frames its
    HOST along the line host->construct, so it sits centred on the disc (its hull is not drawn at
    all under surfaceLock, and framing to its own extent flew the camera inside the planet).
    ALSO FOUND: the click LADDER for a parked construct was ALREADY correct and needed no work -
    a construct has no satellites and no body radius, so `frameLevelsFrom` already yields [3, 1],
    i.e. click 1 the close-up and click 2 the host context, exactly as asked. Now pinned by tests
    in shotSolver.spec.ts along with the body ladder being untouched.
    STILL TO DO: only the IN-TRANSIT rung - frame origin-to-destination instead of the host - which
    needs the route data P3c introduces. P3b's remainder and P3c are therefore ONE piece of work,
    not two; do them together.
P3c. SHIPPED @v2.1.473-477-beta and CONFIRMED BY THE OWNER on a live player view (2026-08-08:
    route line drawn, drive plume lit). The route line, the in-transit rung, and both plume
    faults - one piece of work as predicted. It took to 477 because the first clock fix (473's
    epochT0 seed) was wrong twice over - see the clock-anchor entry below and RENDER-S18.
    WHAT CHANGED FROM THE PLAN, and why each is a correction rather than a compromise:
    - GEOMETRY COMES FROM `pathPoints`, NOT the segment states (RENDER-S17). `calculateFastPlan`
      leaves accel-end, coast-start, coast-end and brake-start as `{r:{x:0,y:0}}`, so the route this
      phase's first commit published ran straight through the star. `pathPoints` is also what the
      SHIP is placed from, so the line and the vessel now agree by construction.
    - KNOTS READ AS A CURVE, not joined by chords. The flown path is an RK4 conic with a drift
      ramp; chords between a handful of points cut its corner by a large fraction of its radius,
      and subdividing a chord recovers nothing. A centripetal Catmull-Rom carries the bend from the
      knot spacing at no cost on the wire, and fitting knots so the CURVE tracks the path converges
      as the fourth power of spacing rather than the square - a whole transfer in a dozen knots.
    - A23 CANNOT TRANSFER, and the design was wrong to assume it could: A23 re-samples a
      PROPAGATOR, and a player has none. The curve replaces it - being analytic, the scene
      tessellates it per span from the working distance, which is the same scale-blind rule A23
      uses and gives the same result for the same reason.
    - THE LINE IS ANCHORED TO THE SHIP, tapered over its neighbours (the owner's requirement,
      2026-08-07: "the line would always go through the vessel"). The hull sits where the GM
      stamped it, the line is a curve through a dozen knots, so they differ by the fit tolerance -
      invisible across a route, glaring at the close-up rung this phase also added.
    - SELECTED CONSTRUCT ONLY (owner, 2026-08-07). Simplifies rather than restricts: one line, one
      tessellation, and a system with a dozen ships under way does not web over.
    - `routeExtent` IS A REACH FROM THE SHIP, not the route's half-size. The shot centres on the
      ship, which sits somewhere along its course rather than at the middle of it. `routeHalfExtentAU`
      is gone with that correction; the measurement lives beside the other framing distances in the
      scene, where the live compression is known.
    - TWO PLAYER-SIDE FAULTS FOUND, both root causes rather than symptoms. A ship in transit was
      drawn at its PARKED position on every player view, because the `vector_position_au` fallback
      was gated on `scheduled_journeys` and `slimNode` deletes those. And the plume never lit
      because the catalogue's clock ran on the WRONG CALENDAR (RENDER-S18) - measured in the field
      at two months adrift, with the route line fully built and hidden by `inWindow` alone. The
      first fix (seed from `epochT0`, skip while following the GM) was wrong twice: epochT0 is the
      REFERENCE epoch the GM scrubs away from, and "following" only means a heartbeat snaps the
      clock later. The working anchor (477): the GM's clock if a heartbeat has arrived, else the
      newest `vector_epoch_ms` on any construct - stamped by the GM's own reconcile tick, riding
      every snapshot - else epochT0 as a last resort. Note this was never only about ships: PLANET
      positions are propagated to this clock, so player views had been drawing the whole system
      months stale, and only constructs escaped (their position is stamped, not calculated) - which
      is exactly why nothing ever looked wrong. Neither fault was on the redaction path everyone
      was searching.
    - PLUME REACH now follows the DRAWN hull, not the authored one: `updateConstructs` rescales the
      hull every frame for the pixel LOD, so at true scale the light's cutoff sat a thousandfold
      inside the hull it was lighting.
    VERIFIED 2026-08-08 by the owner on a live player view: route line drawn (green under accel),
    drive plume lit. The path to that verification is itself a lesson: no bundled example carries a
    construct with a journey, so no test in this repo can render a route line, and the two field
    faults above were found by `__routeDebug` / `__shipDebug` traces, not by tests or reasoning.
    THE FOLLOW-ON SHIPPED TOO (v2.1.480): constructs MOVE with display time on a followed player
    view. The compact route's knots carry (t,x,y,z), so the route is already a time-to-position
    function on every snapshot - `routeStateAt` evaluates the SAME curve the line draws, so a
    moving ship sits exactly on its course by construction. The gate is the SAMPLER, not a flag
    (owner's rule, and the player-setup disclaimer): the orrery passes journey kinematics, a
    FOLLOWED view passes the route sampler, a free-scrubbing view passes none - scrubbing is for
    looking around, so traffic holds its GM-stamped truth rather than replaying against a clock the
    GM does not own. STILL OPEN: adrift ships (no route) do not move between stamps; linear
    extrapolation from the stamped vector diverges from the GM's conic coast over long scrubs -
    ship linear + declare it on the physics page, or port `coastConicAt`, only if seen wrong.

    THE TAIL OF FIELD REPORTS (2026-08-08, all closed) is the phase's real lesson, because every
    one was settled by an instrument and none by reasoning - and three of them had a cause nobody
    had proposed:
    - FACING (owner: "facing is perfect" @v2.1.484 after three wrong theories). Not the lookAt
      convention (three swaps its args for meshes - a v2.1.479 "fix" inverted correct code), not
      the nose axis (`noseSign` from the nozzles was already right). `[routedbg]` reported
      `deltaTowardDest: 0` - THE SHIP HAD NOT MOVED. With the GM's clock paused the stamps stop, so
      heading-from-motion never fired and the hull held its build-default pose. The heading now
      comes from the ROUTE'S TANGENT at the ship's own clock, which exists whether or not anything
      moves. See RENDER-S19.
    - TWO CLOCKS (v2.1.482). A ship was drawn at its GM-stamped position while its plume was judged
      at the local clock, hours ahead - "no burn showing" on a ship the GM had mid-accel.
      `shipClock(node)` is now the instant the ship is DRAWN at, and every time-judged thing about
      it (plume, brake flip, route-line visibility, the in-transit rung) reads that one function.
    - THE CLOCK ANCHOR (v2.1.477, RENDER-S18). `[routedbg]` measured the player clock two months
      short of the route window: the line was built, tessellated and correct, and hidden by
      `inWindow` alone. Note this was never only about ships - PLANET positions propagate to the
      same clock, so player views had been drawing whole systems stale, and only constructs escaped
      because their position is stamped rather than calculated.
    - THE ORBIT LINE (v2.1.484 + v2.1.486, RENDER-S21): one symptom, two mechanisms, two ring
      families. Worth reading before touching either ring path.
P5. BANKED (owner, 2026-08-07): the STARMAP 3D view must also allow travel below the ecliptic.
    Same rule as RENDER-S14, different scene - the starmap has its own camera, so widening the
    system view's polar limits did nothing for it. Half of a 3D starmap is under the plane for the
    same reason half a system is, and the rebuilt bundled maps carry real z depth, so it matters
    more there than it used to.
P4. The new scale law - LAST, because it moves preset looks (S3) and needs the owner's sign-off on
    the reference screen first. Turns on the skipped R9 tests in scaleLaw.spec.ts.
    **WHAT IS LEFT IS S2 AND S2c. S2b IS DONE** - this entry used to read "S2 + S2b's single floor
    + S2c's two dials" and the S2b term was already shipped, which is a live trap: the next reader
    re-fixes a floor that is already one floor. Verified in the code 2026-08-27 (see STATUS above
    for the line numbers, the commit and the passing acceptance block). DO NOT RE-FIX IT.
    ORDER WITHIN P4, and it is not arbitrary (see S2c): S2 FIRST, THEN S2c. The construct dial is a
    deliberate, labelled departure from truth, and that only means something once truth exists
    underneath it.


### S2c. TWO DIALS — BODIES AND CONSTRUCTS — owner, 2026-08-27. ADDED TO P4, NOT INSTEAD OF IT.

The owner's proposal: *"two sliders, one for bodies, one for constructs. Bodies moves both, but
constructs only moves itself — so you can set relative position you like (default to current) and be
able to slide constructs apart if needed. We are honest as it is a user visual choice."* So the body
dial stays the master and the construct dial is a RELATIVE offset on top of it, defaulting to today's
look so nothing moves for anyone who does not touch it.

**This is a real need and the honesty argument is sound.** Constructs are microscopic beside planets;
wanting them separately legible is a display choice, and a choice a user MAKES and can see is not the
engine lying — which is the same reasoning S2 already uses to let a 940 km station render at the scale
its size puts it.

**BUT IT DOES NOT REPLACE S2b's SINGLE FLOOR, and the reason is worth stating so nobody drops one for
the other.** S2b's fault is at DIAL 0, true scale, where the user has asked for honesty: a 10 km moonlet
renders 3.4x larger than a 22 km station because the two floors are a thousandfold apart. **A dial is a
MULTIPLIER; the floor is a CLAMP beneath it. No dial position corrects an inverted clamp** — which is
precisely why R9 states it as an ordering property rather than a tuning one, and why the skipped R9
tests are the definition of done.

**THEY COMPOSE, AND THE ORDER MATTERS: FLOOR FIRST, THEN DIAL.** The construct dial is a DELIBERATE,
LABELLED DEPARTURE FROM TRUTH, and that only means something if truth exists underneath it. With the
floors as they are, a GM who slides constructs apart cannot tell whether they are correcting a fault or
expressing a preference — the control has no honest zero. Fix the floor and the dial becomes what the
owner described: *I know what this really looks like, and I am choosing to show it differently.*

Build notes when it is done: the dial is a per-CAMPAIGN display setting like the others (it rides
`starmap`, not a body), it must default to the CURRENT relative look so no saved preset shifts, and
/scale-reference wants a construct on it so the two dials can be eyeballed against each other — the
page found S2b on its first render and is the natural place to catch whatever this introduces.

## 8. Adjacent defects (owner routed these 2026-08-06)

- DRIVE PLUME NOT LIT ON PLAYER VIEWS -> DO IT IN P3c. "That will be related to the P3c, best done
  there as that is where the data lives." Correct: `driveBurns` and the route are the same journey
  data crossing the same redaction boundary, so the plume, the route line and the accel/brake marks
  are one job. The redaction path is already proven sound end to end (shipBurnPlayer.spec), so what
  remains is scene-side: the thrust threshold and the player-side shipCapability map.

- ZOOM FLOOR = SURFACE + 1 m -> replaces the depth-buffer work. "Depth buffer issue probably fine -
  the actual thing we want to do is limit zoom to current selected object surface+1m level." This
  is the better fix and not merely a cheaper one: the reason Earth vanished at a ship close-up is
  that `near` is driven to ~4e-10 while `far` is fixed at 2000, and a ~5e12 depth ratio exceeds what
  the depth buffer can resolve. Stopping the camera at the SUBJECT'S SURFACE keeps `near` sane by
  construction, so the ratio never gets there. It also removes flying through the inside of a
  planet, which was never wanted. A logarithmic depth buffer stays available if a case turns up
  that this does not cover, but it is no longer the plan (it would need every hand-written
  ShaderMaterial to opt in).

- WIREFRAME / BLUEPRINT RATIONALISATION -> AFTER P4. "It treads into the player view designer and
  we don't want to clog context with that just yet." Its own session, with the designer in view.

- FAR PLANE / DEPTH RESOLUTION (superseded by the zoom floor above): near adapts to ~4e-10 while far is fixed at 2000; at ship
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

Q5. ANSWERED 2026-08-06: publish the current flight plan to players - option (a) - in the COMPACT
    form described in section 4a (origin, destination, arrival, accel/brake points), never the raw
    `scheduled_journeys`, because those carry huge path arrays on a snapshot the broadcast layer
    re-stringifies about twice a second for a ship in transit. Uncommitted DRAFT plans still do not
    cross. P3c is unblocked.

NOTHING OPEN. The design is complete; P1 is shipped (v2.1.451-453-beta) and P2 is next.
