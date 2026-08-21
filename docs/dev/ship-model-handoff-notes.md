# Constructs, the camera and orbit lines - the traps

**AUDIENCE: an agent about to change `src/lib/holo/scene.ts`, `src/lib/viewport/**`,
`src/lib/constructs/**` or `src/lib/rendering/scaleLaw.ts`.** Not a tutorial. Every heading is
something that cost real time or has already been got wrong. Grep it before touching these files;
`engine-map.md` (RENDER-*) holds the same class of rule and this is its long-form companion for the
work the "Ship model handoff 2" session carried.

Written on retirement, v2.1.798-beta. Companions: `starmap-3d-surfaces-notes.md` (the scene/grids
session's equivalent) and `camera-framing-redesign.md` (the design this session executed).

---

## 1. THE ONE RULE: nothing here is settled by reasoning

This session shipped roughly thirty fixes across the camera, the transit visuals and the orbit
lines. **Every fix that was reasoned to was wrong, and every fix that was measured was right.** Not
a slogan - a tally:

- The FACING fault took THREE wrong theories (lookAt semantics, then the nose axis, then the nozzle
  derivation) before a trace showed the ship had never MOVED: the GM's clock was paused, so the
  position stamps stopped and a motion-derived heading never fired at all.
- The "orbit lines vibrate" report survived TWO fixes aimed at the wrong ring family before
  `__ringDebug` printed `f32JitterPx 4.75` and named single precision.
- The dark PLUME was hunted along the redaction path for weeks; `__routeDebug` showed the data was
  present and correct and the CLOCK was two months out.
- C14's grid falloff had a plausible floating-origin explanation written into its row; six lines of
  arithmetic over the real ring radii showed the coordinates were fine and the window was
  calibrated for the wrong extent.

**So: build the instrument, ask the owner to run it, read the numbers.** Every `window.__*Debug`
hook exists because inference failed on that exact question. They are indexed in
`docs/dev/debug-tools.md`; extend them rather than starting a new vocabulary.

**The corollary is the expensive half:** a green build and a green suite say nothing about any of
this. The 3D scene is exercised only by a player view, and no bundled example carries a construct
with a journey, so the transit paths cannot render in any test or local preview (RENDER-S19). Plan
the owner's eyes into the work rather than treating them as a formality.

## 2. A ROW'S DIAGNOSIS IS A LEAD, and its line numbers are probably stale

Three of the last four assignments arrived with a located root cause. **Two were wrong in a way
that mattered**, and both would have produced a "fix" that broke something already working:

- **A51(a)** said selecting a belt or ring frames the parent's body radius. True of RINGS
  (`roleHint === 'ring'`, redirected by `ringParentOf`); **false of BELTS**, which are
  `roleHint === 'belt'`, take their own `beltFocus` branch and already frame on their own orbit.
  Fixing "both" would have broken belts.
- **G5** cited `scene.ts:1929/1943/1953` as the orbit lines. Those are the GRID - the scaled AU
  rings, the plain polar rings and the spokes - which have their own dial. The orbit lines are
  `buildOrbitRing` (0.45) and `buildLocalOrbitRing` (0.4). Dimming the grid from an "orbit lines"
  control would have set two controls fighting over the same pixels.
- **C14**'s lead (abs[] not star-relative under the floating origin) was refuted in ten minutes:
  the rings are built about the origin and never rebased, exactly as the comment claims.

Line numbers drift by hundreds within days - this file moves that fast. **Grep for the symbol,
never `sed -n` the cited line.**

## 3. The camera is a BASE plus an OFFSET, and it will fight you if you forget

RENDER-S12 is the whole model, and `cameraRig.spec.ts`'s FRAME-LOOP tests are the only ones that
catch faults here - unit tests on the individual pure functions stayed green through three rounds
of real breakage, because compose/derive/blend are each correct alone and only fight ACROSS frames.

Two traps this session added to that record:

- **`ownsDistance` (RENDER-S23).** The rig reads distance back off the camera only when a ZOOM
  gesture put it there. That rule was written inline as `kind !== 'wheel'` - right for a mouse, and
  it silently excluded every touch device, because a pinch fires no wheel event. Every pinch-zoom
  was reverted the next frame on every phone. **Name the SET, export it, pin it.**
- **The entry shot was never computed at all.** `setSystem` cleared focus but never placed the
  camera, and with nothing focused `computeBase` returns null BY DESIGN (the view is the user's),
  so nothing corrected it: the camera sat at a hardcoded constant owing nothing to the lens. If a
  view is "framed wrong", first ask whether anything is framing it.

## 4. Scale: the law is ONE module and the scene BINDS it

`rendering/scaleLaw.ts` is pure and tested; `scene.ts` supplies the live dial and calls it
(RENDER-S11). The file says "do NOT reintroduce arithmetic here" and it means it - **the same fault
has now appeared three times** (F2, F3, then C15's vertex dots), each time as a `Math.max` with a
world-unit floor at a call site.

**Why a world-unit floor is always wrong here:** a body shrinks by about five orders of magnitude
between the readable dial and true scale, and no constant tracks that. C15's dot floor bottomed out
at 4e-4 while Mars at true scale renders at 9.1e-6 - the decoration was forty-four times the
planet. The fix that generalises is not a smaller floor but a **relationship**: a dot is a fraction
of the body it decorates and is clamped to it, so the absurdity cannot recur at any dial position.

## 5. Two clocks, and which one a ship is drawn at

`shipClock(node)` is the instant a construct is DRAWN at: the display clock when route playback
places it, otherwise the GM's stamp time. **Everything time-judged about a ship must read it** -
plume, brake flip, route-line visibility, the in-transit ladder rung - or the ship and its torch sit
on different clocks, which is exactly what "no burn showing" turned out to be.

More generally (RENDER-S18): **a published time WINDOW is meaningless against a clock in another
epoch.** Positions survive a wrong epoch because they are stamped rather than calculated, so the
view looks entirely healthy and only time-judged things fail - silently and totally. Check the
epoch before the pipe.

## 6. Player surfaces are a DIFFERENT AUDIENCE, not a different skin

- `slimNode` strips `scheduled_journeys` from every player snapshot. Anything reading them directly
  works on the GM and does nothing on a player - that gated the `vector_position_au` fallback and
  drew every transiting ship parked at the host it had left.
- The GM's value and the player's are **two values** wherever both exist. G5 has a browser-local
  `systemUiStore` for the GM and a preset field for the player. Joining them is the A10/A3 fault,
  now recorded three times.
- There are **three renderers**, not two. The holo scene draws BOTH player tiers (the 2D map is a
  locked-overhead 3D view, so one setter reaches both by construction - but SHOW it, through
  `systemStageStyle`, rather than assuming). The GM's own system map is the canvas orrery in
  `SystemVisualizer.svelte`, with its own hard-coded colours. A control the GM asks for usually has
  to reach that third renderer too, and no row has ever said so.

## 7. The tree is shared and it moves under you

Six or more sessions work this repo at once, with a worktree each. Hard-won:

- **Work in your own worktree.** Twice the shared tree held another session's uncommitted work
  (once eight source files plus a version bump); staging `package.json` or `changelog.md` there
  commits their unfinished work under your message.
- **`beta` moves during a verification run.** Expect two or three rebases. The documented recovery:
  take THEIR version, bump the patch again from it, keep BOTH changelog entries.
- **Do not script the changelog resolve carelessly.** A regex resolve of mine stranded three
  bullets under another session's heading and dropped a third session's heading entirely; repaired
  in a follow-up commit. Check the headings after every automated resolve.
- **`node_modules` can be broken for TESTS while the BUILD stays green** (jsdom's transitive deps).
  The two gates fail independently and only one is loud. If dev servers are live, do not reinstall
  under them - junction to a healthy sibling worktree's `node_modules` instead.

## 8. What is open

- **P4, the scale law** - the last phase of `camera-framing-redesign.md`, gated on the owner
  eyeballing `/scale-reference` because it moves saved presets' mid-dial looks. `scaleLaw.spec.ts`
  already carries the acceptance test, skipped on purpose.
- **Adrift ships do not move between snapshots** - no route to interpolate; linear extrapolation
  from the stamped vector diverges from the GM's conic coast over long scrubs. Ship linear and
  declare it, or port `coastConicAt`, only if it is ever seen to be wrong.
- **Unverified on screen:** A51's entry shot and ring framing, C14/C15/C16, and all of G5. Each row
  names the specific thing to look at.
