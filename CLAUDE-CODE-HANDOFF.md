# Star System Explorer — `beta` branch implementation plan

**Audience:** Claude Code (or any coding agent) working on `FrunkQ/star-system-generator` against the `beta` branch.
**Companion docs:** see `Design Review.html` (architecture + physics + UX rationale) and `v2 Prototype.html` (clickable touch shell).
**Target:** `beta.starsystemx.com` (auto-deployed from the `beta` branch).

The plan is four phases, \~6 weeks total, ordered by dependency. Each phase ends with a single PR. Do not skip ahead — each phase unblocks the next.

The single golden rule: **the Vitest baseline at `src/lib/system/physics-baseline.test.ts` must stay green after every PR.** It is your regression net for the physics. If a change breaks it, either the change is wrong or the test should be updated *deliberately and explicitly* with new tolerances and a comment explaining why.

\---

## Repo orientation (quick reference)

```
src/
├── lib/
│   ├── core/                  # SystemProcessor pipeline (DO NOT REWRITE — extend only)
│   ├── physics/               # pure functions; orbits, temperature, atmosphere, zones,
│   │                          # stability, radiation, stellar-evolution, lagrange, scaling
│   ├── generation/            # procedural builders (system, planet, star, placement)
│   ├── transit/               # Lambert + RK4 ballistics, scheduler, telemetry
│   ├── temporal/              # BigInt time, calendars
│   ├── system/                # postprocessing, modifiers, sanitizer
│   ├── traveller/             # UWP integration
│   ├── components/            # 68 Svelte components — see "god components" below
│   ├── stores.ts / starmapStore.ts / timeStore.ts / cameraStore.ts
│   └── constants.ts
├── routes/
│   ├── +page.svelte           # 800 LOC root; starmap ↔ system orchestration
│   ├── projector/+page.svelte # player-view broadcast target
│   └── report/+page.svelte    # 2900 LOC printable report
static/rulepacks/              # JSON config: gas physics, classifications, templates
```

**God components to be aware of:**

* `lib/components/SystemView.svelte` — 2,716 lines, 8+ concerns
* `lib/components/Starmap.svelte` — 1,907 lines
* `lib/components/TransitPlannerPanel.svelte` — 1,618 lines
* `lib/components/SystemVisualizer.svelte` — 1,465 lines, **mouse-only**
* `routes/report/+page.svelte` — \~2,900 lines

\---

# Phase 01 — Refactor \& de-dupe (no behaviour change)

**Goal:** delete \~1,200 lines of duplication and split the worst god components, with zero user-visible behaviour change. This is the prerequisite for every later phase.

**Branch:** `beta-01-refactor`. Merge to `beta` when green.

**Safety net:** before starting, run `npm test` and capture the baseline. Re-run after every commit. If any assertion drifts, stop and investigate.

## 01.1 Extract `<TimeControls>`

The whole time-scrubber subsystem is copy-pasted between `SystemView.svelte` and `Starmap.svelte`.

**Duplicated symbols** (verify with `grep`):

* `formatTimeRate`
* `scrubRateFromControl`
* `tickScrub` / `ensureScrubLoopRunning` / `stopScrubLoop`
* `handleScrubInput` / `handleScrubRelease`
* `tickPlayback` / `setPlaying`
* `currentRate`, `formattedScrubRate` reactive statements
* The entire `.time-panel` / `.clock-line` markup
* The CSS for `.scrub-control`, `.play-toggle`, `.scrub-scale`, `.clock-actions`

**Create:** `src/lib/components/TimeControls.svelte`

* Props: `temporal: TemporalState`, plus event dispatchers for `updatetemporal`, `togglecrt` (Starmap-only; pass `null` to hide).
* Internal: all scrubber/playback logic.
* Style: lifted verbatim, with a couple of `:host` / wrapper-class adjustments so it fits both contexts.

**Replace in:**

* `SystemView.svelte` — delete L689–935 and L1700–1760 (markup + functions). Import `<TimeControls bind:temporal={...} />`.
* `Starmap.svelte` — delete L122–290 and L1020–1060. Import the same.

**Acceptance:**

* Both views still scrub, play, and align identically.
* Lines deleted: \~280 from each; the new component is \~250.
* Net reduction: \~310 LOC.

## 01.2 Consolidate gravitational-host helpers

Two functions do nearly the same job with different algorithms:

* `lib/physics/gravity.ts → findStrongestGravitationalHost` (raw `GM/r²`)
* `lib/physics/orbits.ts → findDominantGravitationalBody` (smallest containing SOI)

The SOI variant is physically correct for placement (it answers "whose Hill sphere am I in?"). The `GM/r²` version is what most callers actually want for force-direction queries (not selection).

**Action:**

1. Rename the SOI variant to `findContainingHost(x, y, nodes, worldPositions)` in `lib/physics/orbits.ts`. Update its one caller in `SystemVisualizer.svelte`.
2. Keep `findStrongestGravitationalHost` in `gravity.ts` but rename to `findGravitationalDominant` for clarity (it answers "which body's gravity dominates here?"). Audit its callers and either keep or migrate to `findContainingHost` based on intent.
3. Add a brief JSDoc comment to each explaining when to use which.

**Acceptance:** every callsite of either function builds and produces the same UX as today.

## 01.3 Extract `pickNodeAt()` from `SystemVisualizer`

`handleClick` (L625) and `handleContextMenu` (L660) duplicate \~30 lines of hit-testing logic.

**Action:** Extract to a helper inside `SystemVisualizer.svelte`:

```ts
function pickNodeAt(screenX: number, screenY: number): {
  node: CelestialBody | Construct;
  world: { x: number; y: number };
} | null
```

Both handlers call it. Remove the dispatch divergence — the dispatch is the only thing the wrappers should do.

## 01.4 Extract `drawConstructGlyph()`

The construct icon (triangle/circle/diamond/cross/square) is drawn twice per frame: once in world-space (L808) and once in screen-space (L895). They've already diverged (look at the alpha values and the diamond's exact vertices).

**Action:** Pull out a single helper in `SystemVisualizer.svelte`:

```ts
function drawConstructGlyph(
  ctx: CanvasRenderingContext2D,
  node: ConstructNode,
  x: number, y: number,
  sizePx: number
): void
```

Call from both passes. Pick the screen-space sizing logic as canonical (8 px default).

## 01.5 Extract `drainFuel()` from `SystemView`

`handleTakeoff` (L1564) and `handleLand` (L1632) contain the same nested-loop fuel-tank drain. The author flagged it: *"should extract helper really."*

**Action:** Add to `lib/construct-logic.ts`:

```ts
export function drainFuelMassKg(
  construct: ConstructNode,
  rulePack: RulePack,
  amountKg: number
): ConstructNode  // returns new immutable node
```

Both handlers call it.

## 01.6 Remove deprecated `propagateState` re-export

`lib/transit/math.ts` has a `@deprecated` re-export of `propagateState` that still re-routes to `lib/physics/orbits.ts`.

**Action:** find the four callers (grep `from './math'` for `propagateState`), update imports to `from '../physics/orbits'`, delete the re-export.

## 01.7 Split `SystemView.svelte` into shell + concern slots

The 2,716-line component carries: focus state, time controls, edit-mode, planning-mode, ship-log-mode, takeoff/land handlers, hierarchical back-nav, modals orchestration, JSON debug, and rendering glue. Pull each concern into its own component, leaving `SystemView` as a \~400-line layout shell + glue.

**Suggested split** (each new file lives in `lib/components/`):

* `FocusHeader.svelte` — focus title, parent breadcrumb, edit/plan/log mode buttons, rename, visibility toggles
* `BodyDetailsPane.svelte` — wraps `BodyTechnicalDetails` + edit tabs (move the `isEditing` state in here)
* `ConstructDetailsPane.svelte` — wraps `ConstructDerivedSpecs` / `ConstructSidePanel` and the takeoff/land orchestration
* `PlannerPane.svelte` — wraps `TransitPlannerPanel` and the `isPlanning` state machine
* `ShipLogPane.svelte` — the `isShipLogOpen` block (L2090–2150 area)
* `DebugFooter.svelte` — JSON dump + rebuild-hierarchy + sanitize buttons (L2226–2245)

All of these get their data via props/binds from `SystemView`. State that's authoritative (the systemStore, focusedBody, currentTime) stays in `SystemView`.

**Acceptance:** `SystemView.svelte` is ≤ 600 lines, with one clear responsibility (layout + state coordination). Behaviour identical.

## 01.8 Promote `lib/viewport/`

Camera state currently lives split:

* `lib/cameraStore.ts` (the writable stores)
* `SystemVisualizer.svelte` (the auto-zoom, the FOLLOW vs MANUAL mode, the `calculateFrameForNode` logic, the `dampedZoomStep` heuristics)

The new touch-input layer (Phase 2) needs an API surface that's not buried in a Svelte component.

**Action:**

* Move `panStore`, `zoomStore` to `lib/viewport/stores.ts`.
* Move `calculateFrameForNode`, `clampZoom`, `dampedZoomStep`, `shouldSuppressAutoZoomNearPeriapsis` to `lib/viewport/camera.ts` as pure-ish functions that take a `{ canvas, system, focus, worldPositions }` argument bag.
* Keep `SystemVisualizer` as the *consumer* — it asks viewport for frames, applies them to its render.

## 01.9 PR checklist

* \[ ] Vitest baseline green (`npm test`)
* \[ ] `npm run check` clean
* \[ ] `npm run lint` clean
* \[ ] Manual smoke: generate a system, focus a planet, edit orbit, scrub time, play, generate transit, view starmap, generate a report
* \[ ] Net LOC change is negative (`git diff --shortstat`)

\---

# Phase 02 — Pointer Events \& touch on the canvas

**Goal:** replace mouse-only input on `SystemVisualizer` and `Starmap` with a unified `PointerEvent`-based gesture layer. Tablet and touchscreen-laptop users gain pan/pinch/tap/long-press. Desktop behaviour preserved exactly.

**Branch:** `beta-02-touch`. Merge to `beta` when green.

**Dependency:** Phase 01 must be in.

## 02.1 New `lib/input/gestures.ts`

A Svelte action (`function gestures(node, opts)`) that wraps a DOM element with `PointerEvent` listeners. The companion HTML prototype at `v2 Prototype.html` ships a working JavaScript implementation in `proto/gestures.js` — use that as the reference (it's the canonical contract).

Public API:

```ts
export interface GestureHandlers {
  onPanStart?:  (p: { x: number; y: number }) => void;
  onPan?:       (e: { dx: number; dy: number; x: number; y: number }) => void;
  onPanEnd?:    (e: { vx: number; vy: number }) => void;     // for inertia
  onZoom?:      (e: { factor: number; x: number; y: number }) => void;
  onTap?:       (e: { x: number; y: number }) => void;
  onLongPress?: (e: { x: number; y: number }) => void;
}

export function gestures(node: HTMLElement, opts: GestureHandlers): {
  update(opts: GestureHandlers): void;
  destroy(): void;
};
```

Implementation notes (these are baked into the prototype, copy them):

* Track active pointers in a `Map<pointerId, {x,y}>`.
* Single pointer → pan after 8 px movement threshold (anything less is a tap).
* Two pointers → pinch, with focal point at midpoint, `factor = newDist / lastDist`.
* Long-press at 480 ms with no movement → fires `onLongPress`, cancels the rest of the gesture.
* Velocity samples for inertia: keep last 80 ms of pan moves, compute `(dx/dt, dy/dt)` at release.
* `wheel` event → `onZoom` with `factor = deltaY < 0 ? 1.12 : 1/1.12`.
* `contextmenu` event → `preventDefault` and call `onLongPress` (so right-click on desktop still works).
* Use `setPointerCapture` on down, release on up/cancel.

## 02.2 Apply to `SystemVisualizer.svelte`

**Remove:** the `handleMouseDown` / `handleMouseUp` / `handleMouseMove` / `handleWheel` handlers and the `isPanning` / `lastPanX` / `lastPanY` state.

**Add:**

```svelte
<canvas
  use:gestures={{
    onPan:        ({dx, dy}) => panBy(dx, dy),
    onZoom:       ({factor, x, y}) => zoomAt(factor, x, y),
    onTap:        ({x, y}) => handleTap(x, y),
    onLongPress:  ({x, y}) => openContextMenu(x, y),
    onPanEnd:     ({vx, vy}) => startInertia(vx, vy),
  }}
></canvas>
```

`handleTap` = the body of `handleClick`. `openContextMenu` = the body of `handleContextMenu`, both unchanged. The new `startInertia(vx, vy)` decays the pan velocity by `0.92` per frame in the render loop, stopping below 2 px/s.

## 02.3 Apply to `Starmap.svelte`

Currently `Starmap` mixes a raw `on:wheel` handler with `@panzoom/panzoom` for pan/pinch. Standardise on the new gesture action and remove `@panzoom/panzoom` from `package.json`.

The Starmap renders SVG, not Canvas. The gestures action works the same on any element — apply it to the SVG root.

## 02.4 Hit-target overrides for coarse pointers

The current header and bottom-bar buttons are 24–30 px tall. iOS HIG asks for 44 px, Material asks for 48 dp.

Create `lib/styles/touch-overrides.css` (loaded in `+layout.svelte`):

```css
@media (pointer: coarse) {
  button, .checkbox-label, .scrub-slider, .play-toggle {
    min-height: 44px;
  }
  .toggle-chip, .nav-button, .ctx-menu-item {
    padding-block: 10px;
  }
  /\* tooltip-only `title` attributes lose their hover affordance on touch; \*/
  /\* keep them as accessibility hint but don't rely on them visually \*/
}
```

## 02.5 Tooltip migration audit

`grep -r 'title="' src/lib/components/` finds \~140 places. Three responses:

1. **Trivial label (≤ 3 words)**: leave as `title=`. Keyboard/mouse users still benefit; touch users don't lose information.
2. **Functional explanation (e.g. "Open this in Projector View")**: convert to a small `<Popover>` that opens on click. Tap to dismiss. New component `lib/components/Popover.svelte`.
3. **Multi-line / rich content**: link to a sidebar info panel or the new `/physics` appendix (Phase 04).

Don't try to do all 140 in one PR. Carve out the ones in the top 5 most-used components: `SystemView`, `Starmap`, `BodyTechnicalDetails`, `TransitPlannerPanel`, `ConstructDerivedSpecs`. The rest get a follow-up issue.

## 02.6 PR checklist

* \[ ] Vitest baseline green
* \[ ] Manual smoke on a desktop browser: pan, pinch (trackpad two-finger), wheel-zoom, click, right-click context menu — all identical to today
* \[ ] Manual smoke on a phone or `pointer:coarse` simulation: pan, pinch, tap, long-press menu all work
* \[ ] `@panzoom/panzoom` removed from `package.json`
* \[ ] No `on:mousedown` / `on:mouseup` / `on:mousemove` left in `SystemVisualizer.svelte` or `Starmap.svelte`

\---

# Phase 03 — Responsive shell \& bottom sheet

**Goal:** the visible v2 launch. New top-level layout shell that branches on viewport + pointer type. Side panel on wide screens, bottom sheet on phone. FAB cluster on phone replaces toggle button rows.

**Branch:** `beta-03-shell`. May be two PRs (shell + sheet, then FAB + polish).

**Dependency:** Phases 01 and 02.

## 03.1 New `AppShell.svelte`

Pull the layout chrome out of `routes/+page.svelte` into `lib/components/AppShell.svelte`. The shell exposes named slots:

```svelte
<AppShell>
  <svelte:fragment slot="rail">    ...    </svelte:fragment>
  <svelte:fragment slot="strip">   ...    </svelte:fragment>
  <svelte:fragment slot="canvas">  ...    </svelte:fragment>
  <svelte:fragment slot="bar">     ...    </svelte:fragment>
  <svelte:fragment slot="detail">  ...    </svelte:fragment>
  <svelte:fragment slot="fab">     ...    </svelte:fragment>
</AppShell>
```

Internally `AppShell` decides:

* `data-mode="desktop"` if `(min-width: 900px) and (pointer: fine)` — grid is 5-area (`rail | strip strip | rail | canvas detail | rail | bar detail`).
* `data-mode="phone"` otherwise — canvas is full-bleed, `detail` slot is rendered into a `<BottomSheet>`, `fab` slot is rendered floating.
* `data-mode` is overridable for testing (the v2 prototype has a working `Auto / Desktop / Phone` toggle — port it as a dev-only utility behind `?mode=phone`).

The CSS in `assets/proto.css` (v2 prototype) is a direct working reference for the grid + mode-switching logic.

## 03.2 New `BottomSheet.svelte`

Snap points: **peek** (86 px showing only the title + drag handle), **half** (50 vh), **full** (92 vh). Snap selected by:

* Drag from grabber, release → snap to nearest
* Tap the header → cycle up (peek → half → full → peek)
* Tap canvas empty space → demote to peek
* Tap the ▾ close button → demote to peek
* Selecting a body when sheet is at peek → promote to half

Implementation pattern is in the v2 prototype's `attachSheetDrag` (proto/app.js). Convert to Svelte action + reactive snap state.

The sheet contains the same content (`BodyTechnicalDetails` etc.) as the desktop side panel — just in a different container. Don't fork the content components.

## 03.3 New `FabCluster.svelte`

Phone-only. Bottom-right cluster: primary FAB (`+`), expands on tap into a column of secondary FABs. Default actions:

* `+ Add planet here` (uses focused body as host)
* `◇ Add construct here`
* `↺ Reset view`
* `S` Switch to starmap

Each secondary FAB has a label balloon. Tap outside collapses.

On desktop, the same actions live in the existing top bar (Add, Reset View, Zoom Out, To Starmap). The shell decides which to render.

## 03.4 Rail collapse on phone

The left rail (`lib/components/RailNav.svelte`, extracted in 01.7's spirit but new here) is permanent on desktop, slides off-screen on phone. A single hamburger in the time strip pulls it back as an overlay.

## 03.5 Hover-only affordance audit

After Phase 02 fixed tap targets, sweep the codebase for `:hover` rules that *provide information* (not just visual feedback). The most common pattern:

```css
.foo:hover .info-text { opacity: 1; }
```

This needs to become a `:focus-visible` or click-toggled state. Or the info needs to surface another way.

The patterns to fix:

* `BodyTechnicalDetails.svelte` — many derived values reveal their formula on hover
* `BodySidePanel.svelte` — tab tooltips
* `TransitPlannerPanel.svelte` — leg details on hover

Convert each to a tap-toggleable Popover.

## 03.6 PR checklist

* \[ ] On a real tablet (or Chrome DevTools "iPad Pro" mode): canvas pans/pinches, bottom sheet drags between snaps, FAB expands, body selection works
* \[ ] On a real phone (or DevTools "Pixel 7" mode): everything above still works, content is readable
* \[ ] On a 1920×1080 desktop with a mouse: layout is identical to v1.10
* \[ ] Touchscreen laptop (Surface, Yoga etc.) gets `pointer: coarse` overrides and works like a tablet
* \[ ] All existing modals still open and dismiss correctly in both modes

\---

# Phase 04 — Physics honesty \& targeted fixes

**Goal:** address the four physics items from the Design Review and publish the `/physics` appendix that documents every coefficient.

**Branch:** `beta-04-physics`. Single PR.

**Dependency:** Phases 01–03 (so the appendix has a tooltip→link mechanism to live in).

## 04.1 Eccentric-orbit equilibrium temperature

`lib/physics/zones.ts` exports `equivalentFluxDistanceAU(a, e) = a · (1 − e²)^¼`. This is the time-averaged rms-flux distance for an eccentric orbit, and it's what `calculateEquilibriumTemperature` should use — not the mean `a`.

**File:** `lib/physics/temperature.ts`

**Change** in `calculateDistanceToStar`:

* Currently returns `range.mean`.
* Should return `equivalentFluxDistanceAU(range.mean, orbital\_eccentricity\_from\_path)` — but the path is multi-hop. Better: change the return type of `distanceRangeBetweenNodes` to also carry the dominant edge eccentricity, and apply the rms correction at the outermost edge only (closest-to-the-star edge). For inner barycenter hops, eccentricity matters far less.

**Acceptance:** Earth (e = 0.017) and Mars (e = 0.093) temperatures move by <1 K and <3 K respectively. Eccentric exoplanets in test fixtures show measurable cooling.

## 04.2 Branch mass-luminosity by luminosity class

**File:** `lib/physics/stellar-evolution.ts`, function `deriveStarFromHR`.

The fallback `progenitorSolar = L^0.28` is correct for main-sequence (V) only.

**Change** to:

```ts
function inferMassFromLumByClass(lumSolar: number, lumClass: string): number {
  switch (lumClass) {
    case 'V':   return Math.pow(lumSolar, 0.286);    // L ∝ M^3.5
    case 'IV':  return Math.pow(lumSolar, 0.30);
    case 'III': // giants — collapse to \~progenitor; arbitrarily 1–8 M☉
      return Math.min(8, Math.max(1, Math.pow(lumSolar, 0.18)));
    case 'II':
    case 'I':   // (super)giants
      return Math.min(40, Math.max(8, Math.pow(lumSolar, 0.20)));
    case 'VI':  return Math.pow(lumSolar, 0.32);
    case 'VII': return 0.6;                          // WD typical
    case 'X':   return 1.4;                          // NS / BH placeholder
    default:    return Math.pow(lumSolar, 0.28);
  }
}
```

Note: `classifyStar` is called *with* a mass to determine `lumClass`, so this needs a two-pass: classify first using `L^0.28` as a rough mass, then re-derive mass from class, then re-classify if needed. One iteration is enough.

**Acceptance:** a red giant constructed with L = 1000 L☉ no longer reports 7 M☉; reports 1–3 M☉.

## 04.3 Newton-Raphson Lambert

**File:** `lib/transit/math.ts`, function `solveLambert`.

Replace the 200-iter bisection on `z` with Newton-Raphson:

```ts
// F(z)  = (x(z)^3 \* S(z) + A \* sqrt(y(z))) / sqrt(mu)  -  dt\_sec
// F'(z) standard derivative (Vallado Algorithm 5.2)
```

20 iterations of Newton converges to single-precision in almost all cases. Keep a bisection fallback for the few divergent ones (near-180° transfers).

**Acceptance:** `lib/transit/calculator.test.ts` passes unchanged. The Lambert micro-benchmark (add a `lib/transit/lambert.bench.ts`) shows ≥ 3× speedup over the bisection version on random inputs.

## 04.4 Spectral-class radiation split

**File:** `lib/physics/radiation.ts`, function `calculateSurfaceRadiation`.

Replace the hard-coded 90 % photons / 10 % particles split with:

```ts
function photonParticleSplit(star: CelestialBody): { ph: number; pa: number } {
  const cls = star.classes?.\[0]?.split('/')\[1]?.\[0] || 'G';
  // Particle fraction grows toward M dwarfs (stellar wind dominated, frequent flares)
  switch (cls) {
    case 'O':
    case 'B': return { ph: 0.95, pa: 0.05 };
    case 'A':
    case 'F': return { ph: 0.93, pa: 0.07 };
    case 'G': return { ph: 0.90, pa: 0.10 };
    case 'K': return { ph: 0.86, pa: 0.14 };
    case 'M': return { ph: 0.78, pa: 0.22 };
    default:  return { ph: 0.90, pa: 0.10 };
  }
}
```

Sum contributions from all stars in a multi-star system weighted by their flux. Acceptance: TRAPPIST-1 planets (M8 V) now report substantially higher unshielded particle radiation than Sun-like equivalents at the same temperature — and the baseline test still passes for Earth/Luna.

## 04.5 Wire n-body summation into transit

**File:** `lib/transit/calculator.ts`.

`integrateBallisticPath` already accepts an optional `nBodyNodes` parameter. The call sites in `calculator.ts` currently pass only the primary host's gravitational parameter as `mu\_au`. Add a perturber list:

```ts
// At each call to integrateBallisticPath:
const perturbers = sys.nodes
  .filter(n => n.kind === 'body' \&\& n.id !== originId \&\& n.id !== hostId)
  .map(n => ({
    mu: G \* getNodeMass(sys, n) / AU\_M / AU\_M / AU\_M, // AU-scaled mu
    pos: getGlobalState(sys, n, midpointTime).r,        // approx; held constant during integration
  }))
  // Keep only perturbers whose acceleration > 1e-6 of primary at midpoint
  .filter(p => p.mu / Math.pow(midpointDistance, 2) > primaryAccel \* 1e-6);

const result = integrateBallisticPath(r0, v0, dt, mu\_au, 100, targetEnd, perturbers);
```

The TCM (Trajectory Correction Manoeuvre) system already added in v1.9.2 absorbs the drift this introduces. **Test that TCM count stays sane** — if Mars-Earth transits routinely need >5 TCMs, the perturber threshold is too generous.

## 04.6 New `routes/physics/+page.svelte` appendix

A static page that documents:

* Every constant in `constants.ts` with units, derivation, source
* Every coefficient in the rulepacks (`gasPhysics.greenhouse`, `gasPhysics.shielding`, climate model cryo/CIA params) with what it means and how it was calibrated
* Every fudge from the physics audit table (gas-giant 1-bar reference, photon/particle split, Roche-limit assumed density, etc.)
* Every entry in `physics-baseline.test.ts` listed with expected value + tolerance + reality

This is dry but high-value: it's what makes the rest of the app defensible.

**Anchor IDs:** use stable IDs per topic (`#greenhouse-forcing`, `#gas-giant-temp`, `#radiation-split` etc.) so tooltips can deep-link.

## 04.7 Tooltip → appendix links

Add a tiny `<InfoLink topic="greenhouse-forcing" />` component that renders a `ⓘ` glyph and opens `/physics#greenhouse-forcing` in a new tab. Place it next to every derived value in `BodyTechnicalDetails.svelte` that has a defensible-but-not-obvious calculation behind it.

The v2 prototype already shows the visual treatment (small `ⓘ` next to `Surface T`, `Greenhouse Δ`, `Δv land`, `Habitability`).

## 04.8 PR checklist

* \[ ] Vitest baseline still green
* \[ ] All `transit/\*.test.ts` still green
* \[ ] `/physics` page loads in both desktop and mobile shell
* \[ ] Tooltips deep-link to the correct anchors
* \[ ] Lambert is measurably faster (or the bench is added showing it)
* \[ ] No physics constant remains hard-coded outside `lib/constants.ts` or the rulepack

\---

# Phase 05 — Interstellar transit

**Goal:** allow constructs to travel between star systems on the starmap, with GM-defined journey durations (no relativistic physics — just a duration the GM enters and the simulation respects).

**Branch:** `beta-05-interstellar`. Self-contained — does not depend on Phase 04, but should land after Phase 03 (touch shell) since it adds new UI surfaces.

## 05.1 Data model extension

A `Construct` today is bound to one system via `parentId` pointing to a node inside that system. Extend to support an "in transit" state.

In `lib/types.ts`, add:

```ts
interface InterstellarJourney {
  id: string;
  sourceSystemId: string;     // starmap node ID
  targetSystemId: string;     // starmap node ID
  departureTimeSec: string;   // BigInt-string, master time
  arrivalTimeSec: string;     // BigInt-string, master time
  // optional GM-facing label, e.g. "Long jump" / "Slow boat" / "FTL"
  label?: string;
}

interface ConstructNode {
  // ... existing fields
  interstellarJourney?: InterstellarJourney;
  flightState?: 'Orbiting' | 'Transit' | 'Landed' | 'Deep Space' | 'Interstellar';
}
```

When `interstellarJourney` is set and master time is between departure and arrival, the construct's `flightState` is `'Interstellar'`. Its `parentId` should still point to the source system until arrival; on arrival the SystemProcessor (or a dedicated `interstellarStep`) reparents it to a body in the target system (default: the target system's primary star, in a default parking orbit).

The starmap doesn't know about constructs today — it only renders systems and routes. New `Starmap.constructs` view can derive from a starmap-wide walk: for each system, find any construct with an `interstellarJourney` whose journey is active at the current display time.

## 05.2 Starmap rendering

Render any in-flight interstellar construct as a small glyph (re-use the canvas construct glyphs) along the line between source and target system. Position interpolates linearly between source and target by `(now - departure) / (arrival - departure)`.

A subtle dashed trail behind the glyph (back toward source) plus a destination ghost (small dim glyph at the target) helps users see who's coming and going. The trail length encodes journey progress — solid behind, empty ahead.

If the construct is selected (current focused body), draw a more prominent selection ring around it on the starmap.

## 05.3 UI: launching an interstellar journey

The construct's detail panel (in SystemView) gets a new tab/section called **Interstellar**, OR a new entry in the `⋯` menu next to the construct's name: **"Launch interstellar journey…"**.

This opens a dedicated dialog:

```
Destination
  \[ Alpha Centauri  ▾ ]      ← lists all systems on the starmap, by distance
  Distance: 4.37 LY · current journey type: GM-defined

Duration
  \[ Days  ▾ ]   \[ 365 ]      ← unit + value; GM types whatever they want
  Departure time
  \[ Now (master)  ▾ ]        ← Now / In X days / Specific datetime
  
Computed arrival
  2026-05-20 + 365d = 2027-05-20 (master)

Preview on starmap
  \[shows the route highlighted, with the journey arc and arrival marker]

\[ Cancel ]                                    \[ Schedule journey ]
```

On schedule:

* Add an `InterstellarJourney` to the construct
* The construct is immediately visible on the starmap as in-transit
* Time-advance (play or scrub) sweeps it along the route
* On arrival, an arrival event surfaces in a small notification ("`Rocinante` arrived at Alpha Centauri"); the construct is reparented and lands in the target system's default parking orbit

Cancellation: while in transit, the GM can cancel the journey from the same dialog. Cancellation drops the construct at the current interpolated position as a `Deep Space` construct with no host — they're stranded between systems. (This is a GM tool, after all.)

## 05.4 Ship's Log integration

Interstellar journeys are written into the construct's `scheduled\_journeys` log alongside intrasystem transits. Already-built UI in `ShipLogPane` shows them in the timeline. A small glyph differentiates interstellar segments from intrasystem ones.

## 05.5 Constraints

* **No fuel cost.** Interstellar drives are out of scope. The GM models that narratively. (If the user later wants a Δv cost, expose it as an editable number on the journey, not derived.)
* **Single-leg only.** Interstellar journeys don't chain. Multi-hop is achieved by scheduling sequential journeys at the destination.

## 05.6 Relativistic journey time (scaled maps only)

The starmap has two `mapMode` values: `'diagrammatic'` (Traveller-style hex grid, distances are abstract) and `'scaled'` (linear LY or parsec). The journey-time UI **branches on this**.

### Diagrammatic mode (abstract, e.g. Jump-9)

* Distances aren't physical, so no relativity.
* One field: **Duration**. Apparent time = proper time = whatever the GM types.
* This is the model for Traveller, Star Wars, most pulp sci-fi.

### Scaled mode (LY / parsecs)

* Distances are physical, so relativistic effects apply.
* **Two fields:** *Apparent (map-frame) time* and *Proper (crew-experienced) time*. The GM enters one; the system computes the other from the route distance.
* Display the implied velocity (as a fraction of c, or km/s for slow journeys) and the time-dilation factor γ.

### The math

Treat the journey as constant-velocity, straight-line — fine abstraction for GM use; no need to model acceleration profiles. Let:

```
d   = route distance (LY)
c   = 1 LY/year
t\_a = apparent (rest-frame) journey time in years
t\_p = proper (ship-frame) journey time in years
v   = d / t\_a            (velocity, LY/yr)
β   = v / c
γ   = 1 / √(1 − β²)
```

The relation is the clean Minkowski-hypotenuse form:

```
t\_a² = t\_p² + (d/c)²

⇔  t\_a = √(t\_p² + d²/c²)         given proper time
⇔  t\_p = √(t\_a² − d²/c²)         given apparent time, when t\_a ≥ d/c
```

This drops out from `t\_p = t\_a / γ`, `β = d/(c·t\_a)`, and is the same identity used in every relativistic-rocket calculator.

### Constraints and UI feedback

|Input|Meaning|Show|
|-|-|-|
|`t\_a < d/c`|GM asked for faster-than-light|**Red warning: "Exceeds light travel time."** Offer "switch to abstract (Jump) mode for this journey" — sets a per-journey `abstractTime: true` flag that suppresses relativity, lets the GM enter any duration.|
|`t\_a = d/c` (within ε)|Light-speed journey|β = 1, γ = ∞, t\_p = 0. Show "Crew experiences journey as instantaneous."|
|`t\_a >> d/c`|Slow journey|γ ≈ 1, t\_p ≈ t\_a. Show velocity in km/s. Suppress γ display when γ < 1.01.|
|`t\_a` in middle range|Relativistic|Show β as decimal of c (e.g. `0.87c`), γ to two decimals (e.g. `γ = 2.03`).|

### Worked examples (for tests)

* Earth → Alpha Centauri (4.37 LY) at 0.5c apparent → t\_a = 8.74 yr, t\_p = 7.57 yr (γ = 1.155)
* Earth → Alpha Centauri at 0.99c → t\_a = 4.41 yr, t\_p = 0.62 yr (γ = 7.09)
* Sol → Wolf 359 (7.86 LY), GM enters t\_p = 2 yr → t\_a = √(4 + 61.8) = 8.11 yr, β = 7.86/8.11 = 0.969c (γ = 4.06)
* Diagrammatic map: GM enters "10 days" → both apparent and proper are 10 days, no math runs

### Per-journey override

Add an `abstractTime?: boolean` field on `InterstellarJourney`. When true (or when `starmap.mapMode === 'diagrammatic'`), skip relativity. This lets a GM mix a relativistically-modelled "slow boat" alongside a narrative-only "FTL jump" on the same starmap, both arriving at sensible times for the table.

### Where the math lives

New module: `lib/physics/relativistic.ts`.

```ts
export interface RelativisticPair { t\_a: number; t\_p: number; beta: number; gamma: number; }

/\*\* Given apparent time and distance, return all four. \*/
export function fromApparentTime(d\_ly: number, t\_a\_yr: number): RelativisticPair | { error: 'super-luminal' };

/\*\* Given proper time and distance, return all four. \*/
export function fromProperTime(d\_ly: number, t\_p\_yr: number): RelativisticPair;

/\*\* Convert journey input (whichever field the GM edited) to BigInt seconds. \*/
export function journeyArrivalSec(departureSec: bigint, d\_ly: number, input: { kind: 'apparent' | 'proper'; years: number }): bigint;
```

Cover both worked examples plus the edge cases (t\_a = d/c, t\_a < d/c, t\_p = 0, large d small t) in `relativistic.test.ts`.

The UI module (the launch dialog from §05.3) imports this and re-renders both fields whenever either is edited.

\---

# Phase 06 — Generation overhaul (HR-driven, n-body stable)

**Goal:** replace the current "pick a star type + binary switch" generator with an HR-diagram star picker, an n-body stability solver for multi-star arrangements, and a refresh of the circumbinary/circumstellar planet generation.

**Branch:** `beta-06-generation`. Independent of Phase 05.

**Note:** Much of the substrate already exists — the Evolutionary Wizard (`EvolutionaryWizard.svelte`, `HRDiagram.svelte`, `StellarNursery.svelte`, `StellarDance.svelte`) has a Phase 1 HR picker, Phase 2 spatial placement, and Phase 3 RK4 N-body integrator. This phase **harvests those components** for the standard generation path rather than building from scratch. The Evolutionary Wizard continues to exist as the "interactive" entry point; the standard "New System" flow uses the same machinery non-interactively (or with a lighter touch).

## 06.1 HR-diagram star picker

When the user picks **New System** from the starmap, replace the current "Star type · Random / Binary" dropdown with the HR picker.

Re-use `HRDiagram.svelte` and add:

* **Off-HR categories** as a separate row of buttons below the diagram:

  * White Dwarf (with optional progenitor mass slider)
  * Neutron Star
  * Black Hole (stellar-mass)
  * Sub-Brown Dwarf / Planemo (planet-mass)
  * "Add another star…" repeats the picker
* **Selected stars** appear as chips below the diagram with their key params (temperature, luminosity, mass), removable with an ×.
* A small label: **"This system will have N stars."** Counts include remnants.

## 06.1.5 Stellar state variants (M-dwarfs \& remnants)

Several stellar types have **two well-separated states** that change radiation, luminosity and habitability dramatically. These need first-class support — not buried in an "advanced" toggle.

### M-dwarfs: quiet vs flaring

|State|What it means|Effect|
|-|-|-|
|**Quiet**|Older (≳ 1 Gyr), spun down, magnetically calm|Standard M-dwarf flux; close-in HZ planets are merely cold-locked. Approachable as a setting.|
|**Flaring**|Young (≲ 1 Gyr) or rapidly rotating; powerful coronal flares|UV/X-ray spikes 100×–1000× quiescent baseline. Close-in planets are atmospherically eroded over Gyr — relevant for habitability scoring.|

### Stellar remnants: quiescent vs feeding

|State|What it means|Effect|
|-|-|-|
|**Quiescent**|Isolated remnant. No accretion.|Cold dark (BH), faint thermal (WD/NS). Almost invisible at distance. Rendered as a tiny dot with subtle horizon stroke.|
|**Feeding (accreting)**|Close binary companion donating matter, or has a captured disk|Hot accretion disk, X-ray luminosity, jets. Renders with the existing `BH\_active` style — orange disk ring. Wrecks habitability for AU around it.|

The v1 codebase already has the `star/BH\_active` class with bespoke rendering (`SystemVisualizer.svelte`, around the body draw loop). Extend the same pattern: `star/M\_flaring`, `star/NS\_active`, `star/WD\_active` for symmetric coverage.

### How to expose this in the picker

**Recommended: derived default + manual override.**

1. **Auto-pick on creation.** When the HR picker hands a star to the generator, the system age + nearest-companion distance decide the initial state:

   * M-dwarf: `flaring` if system age < 1 Gyr (with a randomised threshold so older flarers are possible).
   * BH/NS: `feeding` if there's a non-stellar companion within \~0.1 AU, or a stellar companion within \~5 AU. Otherwise `quiescent`.
2. **Surface the toggle.** Once a star is on the picker's selected-chips strip, show a small state toggle directly on the chip:

```
   ┌─────────────────────────────┐
   │ ◐ M5.5 V Proxima · 3050 K   │
   │ State: \[ Quiet | Flaring ]  │
   └─────────────────────────────┘
   ```

   The toggle pre-selects the auto-derived value but the GM can flip it. Same pattern for remnants:

   ```
   ┌─────────────────────────────┐
   │ ⚫ Black hole · 8 M☉         │
   │ State: \[ Quiescent | Feeding ] │
   └─────────────────────────────┘
   ```

   ### Where the flag lives in the data model

   Add to `CelestialBody`:

   ```ts
interface CelestialBody {
  // ...
  stellarState?: 'quiet' | 'flaring' | 'quiescent' | 'feeding';
}
```

   The state value lives alongside `classes` (which is the rendering class), with `classes` derived from `(spectralType, stellarState)`. Procedural generation sets both; manual edit changes only `stellarState` and `classes` is recomputed.

   ### Physics implications

   Once `stellarState` exists, several existing physics paths consume it:

* **`radiation.ts`** — Flaring M-dwarfs get the time-averaged enhanced UV/X-ray spectrum. Bump particle fraction to \~0.35 for flaring stars (from the §04.4 baseline of 0.22 for quiet M). Accreting remnants emit X-ray luminosity that overwhelms the photospheric component — model as a fixed `L\_x = 0.1 · L\_Eddington` for feeding BH/NS.
* **`habitability.ts`** — Apply a *flare-erosion penalty* to atmosphere retention for planets within \~0.5 AU of a flaring M-dwarf — reduces effective magnetosphere protection by a factor of 3.
* **`zones.ts`** — Habitable zone width shrinks for flaring stars (inner edge pushes outward by \~30 %).
* **`stellar-evolution.ts`** — `ageStar` should toggle M-dwarf `stellarState` from `flaring` → `quiet` around the 1 Gyr mark with a stochastic offset, so the scrub through stellar evolution feels right.

  These changes can land alongside the picker UI in Phase 06.

  \---

  ## 06.2 Stable orbital arrangement solver

  Once stars are picked, compute a **stable hierarchical orbital arrangement** for them. The algorithm:

  ### One star

  Trivial — no arrangement needed.

  ### Two stars

  Choose a separation `a\_bin` from a log-uniform distribution between 1 AU and 1000 AU. Compute the period via Kepler's third. Stability: trivially stable for any positive separation given enough perturbing-body distance — no extra check needed in isolation.

  ### Three or more stars: hierarchical decomposition

  Real triple+ systems are almost always **hierarchical** — a close binary with one or more distant single stars / binaries orbiting their common centre. Pure chaotic 3-body configurations are extremely rare in nature because they self-destruct in Myr.

  The algorithm:

1. Pick the two **most similar-mass** stars as the inner binary (this maximises stability — equal-mass binaries are the most resilient).
2. Place them at a random separation `a\_inner` (log-uniform, 0.1–50 AU).
3. Place the third star at `a\_outer` orbiting the inner binary's barycenter. Stability requires `a\_outer / a\_inner ≥ \~3` (Mardling-Aarseth criterion, with a small e-dependent correction). Pick from log-uniform in `\[3·a\_inner, 10000 AU]`.
4. For 4 stars: either (a) two binaries orbiting a common barycenter, or (b) a hierarchical triple plus a very distant single. Pick (a) if the four can be paired by mass into two \~equal-mass pairs.
5. For 5+ stars: extend the same recursion. Reject if the outermost orbit exceeds \~50 000 AU (beyond which the system is gravitationally unbound on Gyr timescales).

   ### Stability check

   After arranging, run a **brief RK4 stability sim** using the existing `stepNBody` from `lib/physics/stellar-evolution.ts`:

* Simulate 10 000 inner-binary periods (typically 10⁴–10⁶ years).
* Check for: ejections, mergers, energy drift > 1 %, any pair's separation changing by > 50 %.
* If any of those occur: regenerate the arrangement with smaller `a\_outer / a\_inner` ratios, up to 5 attempts.
* If 5 attempts fail: surface the message **"No stable orbital arrangement found for these N stars. Try removing one (suggest removing the lightest / closest in mass to its neighbour)."**

  This is computationally cheap — 5 stars × 10 000 timesteps × RK4 = \~50k operations, well under 100 ms in a browser.

  ### Output

  Result is a `BarycenterNode` tree mirroring the hierarchy. The existing `barycenterReconcile.ts` already handles barycenter creation; this phase just provides the orbital elements (a, e, i, ω, Ω, M₀) consistent with the solver's output.

  ## 06.3 Circumbinary / circumstellar planet generation refresh

  After the star arrangement is set, the existing automated planet-generation logic kicks in. Issues to address:

* **`lib/generation/planet.ts` is 22 KB and dense.** Review for clarity, extract obvious helpers, document the planetesimal-vs-formation-zone logic that's currently implicit.
* **Habitable-zone calculation in multi-star systems** already uses the Kopparapu binary correction (in `zones.ts`). Confirm the planet generator actually consults `calculateGoldilocksZone(star, allNodes)` and not the single-star version when deciding where to place candidate-habitable worlds.
* **Circumbinary planets** (P-type orbits, around the inner binary barycenter): currently supported via `parentId` pointing to the barycenter, but the planet generator may not consider this as a placement option. Verify and add if missing.
* **Circumstellar planets in wide binaries** (S-type orbits, around one star with another star far away): the stability threshold for an S-type orbit is `a\_planet < \~1/3 of nearest-companion-periapsis`. Add this check to placement.
* **Resonant gaps** and the Titius-Bode-like spacing rules in `placement-strategy.ts` already exist — confirm they're used during the new flow.

  This sub-phase is best handled as an audit + refactor PR ahead of the new HR-flow. It can land before the rest of Phase 06.

  ## 06.4 UX flow

  ```
Starmap → Add System Here → \[Random / HR pick / Traveller UWP / Import file]
                                 │
                                 ▼
                          HR-diagram picker
                          (with off-HR row)
                                 │
                          \[+] add stars to selection
                                 │
                                 ▼
                          Stability solver
                          (runs in background, \~50ms)
                                 │
                  ┌──────────────┴──────────────┐
                  │ stable                       │ unstable after 5 attempts
                  ▼                              ▼
            Planet generation              Suggest removing N stars
            (existing pipeline)            "Try removing the K-dwarf"
                                                 │
                                                 ▼
                                           Back to picker
```

  ## 06.5 What to keep vs replace

|Today|After Phase 06|
|-|-|
|Star-type dropdown|HR picker (with off-HR row)|
|Binary switch (boolean)|Multi-star (N up to 5) via repeated HR picks|
|Single-star Kepler placement|Hierarchical barycenter tree + RK4 stability check|
|Existing `planet.ts` generation|Same pipeline, refreshed for multi-star awareness|
|Evolutionary Wizard|Unchanged — keep as the interactive deep-dive path|

The standard "Random" generation path keeps working — it just picks one Sun-like G2V star automatically and skips the HR picker.

\---

# After Phase 06 — what's left in v2 that's optional

These are nice-to-have but not blocking the v2 launch.

* **Wheel-style time scrubber.** Apple Maps / SkySafari pattern. Only worth it if user feedback on the new slider says scrubbing is still cramped.
* **Direct-manipulation orbit handles.** Drag the orbit ellipse on the canvas to change `a` and `e` without opening the panel. Hot but expensive to do well — own PR after the v2 shell ships.
* **Symplectic integrator for long-term evolution.** Replace RK4 with Wisdom-Holman in the Evolutionary Wizard if you want planetary systems to be evolvable past 1 Gyr. Talk to me before starting this — it's a real piece of work.
* **Service worker / PWA polish.** Already partial; finish offline support after the layout settles.

\---

# What this plan deliberately does NOT do

* **Does not rewrite `BodyTechnicalDetails.svelte`** (45 KB). It's dense but coherent, and replacing it during the touch migration is a recipe for losing physics features. Leave it alone until v2 ships.
* **Does not change the data model.** `CelestialBody`, `System`, `Orbit`, `RulePack` are stable contracts. Don't touch them.
* **Does not touch the `routes/report/+page.svelte` (2,900 lines).** Self-contained, prints work fine. Split *after* v2.
* **Does not replace Kepler propagation with n-body in the visualiser.** That would be a regression — see Design Review §3.2.
* **Does not add a phone-shaped Transit Planner.** Phones get a "open this on a tablet or larger" affordance for that one feature.

\---

# Open decisions — answered (2026-05-20)

The following decisions have been agreed with the project owner. They override §8 of the Design Review.

1. **Phone scope:** TransitPlanner, AI Expansion and EvolutionaryWizard are desktop/tablet only. Phone gets a "open this on a larger device" affordance.
2. **Gesture library:** hand-rolled. The reference implementation is `proto/gestures.js` in the v2 prototype (PointerEvent-based, \~200 LOC). Deviate only where SSE's complexity forces it.
3. **Tooltip migration:** **scoped** — keep `title="..."` for desktop fine-pointer users; only convert to Popover where the content is functional or non-trivial. Focus the migration on the top 5 most-used components first (per §02.5).
4. **Tablet default panel state:** collapsed on first load, auto-open on first body selection. **+ Critical addition:** add a "Pick from list…" affordance so users can select bodies/constructs by name when a starmap holds 100+ entities. See §03.7 below.
5. **Beta vs main:** beta is allowed to diverge visually. External reviewers will be invited as Phase 03 lands.
6. **Beta branch is brand new:** so no merge-back-to-main planning needed for the audit's lifetime.

\---

# Additional v2 requirements (from owner feedback)

These came out of reviewing the v2 prototype and are now part of Phase 03.

## Toytown ⇄ Real-scale toggle

The existing continuous `toytownFactor` (0..1 slider with Box-Cox compression) is being replaced as the **primary control** by a binary segmented toggle. Two discrete modes, two clear axes co-varying:

|Mode|Orbit spacing|Body glyph size|
|-|-|-|
|**Toytown** (default)|Compressed (Box-Cox or equivalent) so the whole system fits one screen|Clamped to minimum visible pixel size — always selectable|
|**Real**|True linear AU|Scales with zoom — bodies become dots from far out, grow as you zoom in|

The continuous slider stays available in **Advanced** for power users (mostly cartographer / GM types who want a specific composition for a screenshot). The default UI gives 90% of users the right behaviour with one tap.

Implementation:

* Add `realScale: boolean` to `viewportStore`.
* `SystemVisualizer.svelte`: branch the body draw call on `realScale`. In real mode skip the `minRadiusPx` clamp; bodies render at `(radiusKm / AU\_KM) \* zoom` with a 1 px floor only.
* Orbit positions: branch on `realScale` — when true, use raw `a\_AU`; when false, use the existing `scaleBoxCox(a, toytownFactor, x0)` with `toytownFactor` defaulted to \~0.6.
* When the toggle flips, re-frame on the focused body so the user doesn't lose their place. A 500 ms eased camera tween — same machinery as zoom-to-body.

The v2 prototype (`v2 Prototype.html` + `proto/app.js`) ships this — see `effectiveA`, `bodyRadiusPx`, and the `Scale: Toytown / Real` segmented control in the bottom bar.

## Zoom-to-body on selection (preserve v1.x behaviour)

When a body is selected — whether from canvas tap, list-picker, or context menu — the camera tweens to frame it. Two cases:

* **Has children** (star, planet with moons, barycenter): frame the children with \~15 % padding.
* **No children** (single moon, construct): frame the body itself at a comfortable zoom (the body fills \~3–5 % of the canvas).

`SystemVisualizer.startFocusAnimation` already implements this in v1, including the long-zoom case that splits pan and zoom into two phases. Preserve that exactly when refactoring the viewport module in Phase 01.8.

Camera tweens cancel inertia. User pan/pinch input cancels camera tweens. Both must be true.

## §03.11 — Selection \& back-navigation hierarchy

The system view is hierarchical (system → barycenter → star → planet → moon → construct). Selection and back-navigation respect this.

### Selection framing

When a body is selected, the camera tweens to fit a specific bounding box. The framing depends on whether this is a fresh selection or a re-selection of the already-current body:

|Action|Frame contents|
|-|-|
|Select a different body|The body **+ its direct parent + all direct children**|
|Re-select the same body|The body **+ children only** (closeup)|
|Re-select again|No change (no further zoom level — there's only one "closeup" step)|

The "include parent" rule gives users orbital context — selecting Earth shows you "Earth + Sun + Luna," so the user immediately sees where Earth sits relative to its star. The closeup step ditches the parent and tightens to the body and its moons.

The star is special: selecting the root star frames the entire system (all child bodies).

### Back navigation

Walk one step up the hierarchy. Triggers:

* **Mouse button 4** (Back) — most 5-button mice and trackpads
* **`Backspace`** key (when not focused in an input)
* **`Alt + ←`**
* **Edge-swipe right** on touch (production work — Phase 2 gesture layer extension)
* An explicit `‹` button in the panel header (production — small chevron next to the body name)

Order:

```
construct/moon → its parent body
planet         → its parent star (or barycenter)
moon (host=planet) → planet
star (in single-star system) → starmap
star (in multi-star system)  → system barycenter → starmap
barycenter                   → starmap
```

The starmap is the top. A "back" beyond the system root navigates to the starmap view (browser-back equivalent, but app-level).

### Zoom limits

**No effective upper bound.** Users with constructs km apart need to zoom in arbitrarily deep. Current v1 caps at 5×10⁸ which is more than enough; keep that. The lower bound is just there to prevent NaN — 0.05 is fine.

The auto-zoom damping (in `SystemVisualizer.dampedZoomStep`) should stay; it's about smooth transitions, not enforced limits.

### Name labels on canvas

To avoid label overload, draw names only for:

* The selected body
* Its **chain of parents** (all the way up to the star)
* Its **direct children**

Everything else stays unlabelled until selected. The v1 starmap already does this implicitly (`getVisibleNodeIds` in SystemVisualizer); the system view should match.

The v2 prototype implements all of this:

* `computeFrameForNode(id, { closeup: bool })`
* `selectNode()` detects re-selection and passes `closeup: true`
* `navigateBack()` walks the hierarchy
* Canvas name pass scopes to the labelled set

\---

Two-unit display, choice depends on body kind. Always show the alternate unit on hover.

|Body kind|Primary display|Tooltip / secondary|
|-|-|-|
|Star|Kelvin|°C|
|Planet, moon|°C|Kelvin|
|Construct|°C|Kelvin|
|Δ values (Greenhouse Δ, tidal Δ, internal Δ)|Kelvin only|— (identical magnitude in °C)|

Rationale: stellar temperatures span 1000 K – 50 000 K and astronomers/sci-fi writers reason about them in K; planet temperatures sit either side of 0 °C and GMs/players reason about them as "below freezing" / "hot tub" / "Venus surface." Deltas are scale-invariant so K is fine.

Pure rendering decision — the underlying data stays in Kelvin. Conversion happens in the cell formatter. The v2 prototype implements this in `convertTemperatureForDisplay()` (`proto/app.js`). Reference for the Svelte port.

Implementation note: extend the cell formatter in `BodyTechnicalDetails.svelte` and friends. Don't store dual units; convert at render time.

\---

The owner has starmaps with **100+ constructs**. Selection by tap is impractical at that scale.

New component: `lib/components/BodyPicker.svelte`.

**Form factor:** the picker is **not a modal**. It's a slim always-on command strip at the top of the canvas (`\[● BodyName  role]  |  ⌕ search bodies…  ▾`), with a dropdown panel that anchors below it when expanded. The strip:

* Always visible at the top-centre of the canvas (44 px tall, semi-transparent).
* Left chip: the currently selected body's glyph, name, role. Tapping it opens the dropdown into that body's category for sibling browsing.
* Middle: search input. Typing auto-expands the dropdown and filters across all bodies (flat list, no category context).
* Right `×`: only visible when the search has text — clears it.
* Right `▾`: toggles the dropdown open/closed at the root categories.

**Dropdown panel:**

* Anchored below the strip, same width, semi-transparent backdrop.
* Categories at root: **Stars · Terrestrial planets · Gas giants · Moons · Constructs**.
* **Constructs is flat.** No formal sub-types — a ship on the surface is indistinguishable from a small facility, a gate from a stationary ship. The model doesn't formalize it and any taxonomy I impose will be wrong for some user.
* Each row: glyph (matching the canvas glyph), name, parent context (e.g. "orbits Earth"), chevron.
* Min row height 42 px. The dropdown panel can scroll if needed.
* Header bar (with title + back) only shown when drilled or searching — at root with no query, the dropdown is just a clean list.

**Closing behaviour:** the dropdown collapses on any of:

* Selecting a row (camera tweens to body, dropdown closes, strip updates)
* Tapping a body on the canvas (selection happens, dropdown closes)
* Starting a pan or pinch on the canvas
* Tapping empty canvas space
* Tapping outside the strip + dropdown
* `Escape` (clears search first if text, then collapses)
* `⌘K` / `Ctrl+K` while open

**Important CSS gotcha:** the dropdown uses `display: flex` for its internal layout. The default `\[hidden] { display: none }` rule will be overridden unless you write `.picker-dropdown\[hidden] { display: none }` explicitly. Hit this in the prototype — easy to miss.

**Keyboard:** `↑/↓` to move (focus rings on rows), `Enter` selects, `Esc` clears/closes. Touch: just tap.

For systems with > 200 entities, virtualise the list (skip if first prototype performs well enough — `<ul>` of 200 rows is fine in practice).

### §03.7-A — Future: user-defined construct categories (deferred)

When the owner has time to think about it, the right model is **user-defined tags** for constructs (and possibly other body types):

* A construct can have a `category` field that's an arbitrary string (user input or template-derived).
* Each category can have a user-chosen glyph (icon picker pulling from a small set, or eventual image upload).
* The picker would group Constructs by their user-assigned category, with an "Untagged" group at the end.
* Out of the box, templates (`The Expanse`, `Aliens`, `Hard Sci-Fi`) could ship with categories pre-assigned ("Frigate", "Belter station", "Colony", etc.).

This is **NOT in scope for Phase 03**. Mention it in a follow-up issue. The picker should stay flat for Constructs until the data model supports tags.

The v2 prototype ships a working implementation in `proto/app.js` (see `PICKER\_CATEGORIES`, `expandPicker`, `pickerVisibleItems`, `renderPicker`). Treat it as the reference for the Svelte port.

## §03.8 — Resizable side panel

The detail panel on desktop/tablet should be **user-resizable**. The editor tabs (Atmosphere composition, Hydrosphere, Biosphere) get dense; a fixed 340 px is too narrow for users running multi-monitor setups who want to dedicate one screen to it.

* Add a draggable handle on the left edge of `<SidePanel>` (`.side-resize` in the prototype).
* Width range: **min 300 px, max 60 vw**.
* Default: 340 px.
* Double-click resets to default.
* Persist to `localStorage` under `sse-side-w`.
* Updates `--side-w` CSS variable on `:root`; the grid layout in `AppShell` already binds to that variable, so no other code changes are needed.
* Handle is 8 px wide for forgiving grab area, with a thin visible 2 px line on hover/drag.
* Hidden in phone mode (bottom sheet doesn't resize horizontally).

Implementation pattern is in the prototype's `setupSideResize` — pointer events + computed style, persists on `pointerup`. \~30 LOC.

## §03.9 — Settings popover (and where dev-only controls live)

The `⚙` rail icon opens a small popover (not a full modal) anchored to the rail. It holds:

* User settings that survive sessions (calendar overrides, projector mode preferences, rulepack overrides — but the heavy editors live in their existing dedicated modals).
* **A "dev only" section** for things like device-mode override (`auto / desktop / phone`). Tagged with a small `DEV ONLY` chip; this is what allows reviewers to test layouts without resizing the browser. It does not ship to production.

The popover is not modal — clicking outside dismisses it. The point is "settings glanceable while still working."

\---

# §03.12 — Final UX decisions from prototype review

Everything below was iterated and settled inside the v2 prototype (`v2 Prototype.html`). The prototype is the canonical visual reference; this section is the readable spec for Claude Code.

## 03.12.1 Left rail icon set (top-to-bottom)

|Icon|Meaning|
|-|-|
|`⋯`|Hamburger menu — save/load system, save/load starmap, edit rulepack modals, about|
|`S`|Starmap view|
|`●`|System view (current)|
|`◔`|Bodies (all bodies across the starmap — picker scoped to starmap)|
|`◇`|Constructs (all constructs across the starmap)|
|`⇄`|Routes (scheduled \& interstellar journeys, starmap-wide)|
|`▣`|Projector view (player display)|
|`▤`|Generate written report|
|`✦`|Generate new system (destructive — confirm dialog)|
|`⚙`|Settings popover|
|`?`|About / Discord / tutorial|

Principle: **system-wide / starmap-wide stuff lives on the left rail. Selection-specific stuff lives in the right panel.** Projector and Report are starmap-wide — they're the player's view of the whole game state, not of one body. Don't bury them in the hamburger.

The hamburger menu now holds *only* file-level actions and editor modals — never things that have a rail icon.

## 03.12.2 Panel header (right side)

Layout:

```
┌─ Hero image (140 px) ────────────────┐
│ \[body image / placeholder]    \[tag] │
├─────────────────────────────────────┤
│  Body Name                    \[Eye] │ ← 40px round vis button, 3 states
│  role · class                       │
├─────────────────────────────────────┤
│ Universal tabs (icon-only, label    │
│ expands on active):                  │
│ ⓘ Basics · ↻ · # · ¶ · ★             │
├─────────────────────────────────────┤
│ Kind-specific tabs (swap on selec): │
│ Body:      ≈ ◌ ❋ ☼                  │
│ Construct: ☻ ⚡ ⛽ ↟ ▦ ▢ 〰 ⤳         │
├─────────────────────────────────────┤
│ Panel body (scrolls)                │
└─────────────────────────────────────┘
```

**Two-row tab strip** is non-negotiable. Universal tabs (Basics / Orbit / Tags / Desc / GM) on top, kind-specific on bottom. Active state is global across both rows — only one tab selected at any time.

**Visibility lives in the header** (40 px round button next to name), not as a tab. Three states cycle on click:

* **Visible** — blue tint, open-eye SVG. Players see everything.
* **Partial** — amber tint, open-eye SVG. Players see the object exists but not its details/contents/tags. Replaces v1's separate "Hide just description" toggle.
* **Hidden** — red tint, slashed-eye SVG. Players don't see it at all.

Tooltip describes the *current state* and what the next click does ("Visible to players · click to set partial (object shown, details hidden)").

## 03.12.3 Stateful tab icons

Some tabs *indicate* live state, not just navigation. Each has its own SVG and a colour-coded `is-\*` class:

|Tab|Visual indicator|Class set in JS|
|-|-|-|
|**Fuel**|Tank-fill gauge inside icon; height = % full; colour green ≥50 % / amber 25–50 % / red <25 %|`\[data-level="ok\|low\|empty"]` + CSS variable `--fuel: 0..1`|
|**Sensors**|Radar-waves glyph; green when running, dim white when in standby|`.is-on` / `.is-off`|
|**Transit**|⤳ glyph; grey = no plan, green = planned, orange + pulsing animation = in flight|`.transit-none` / `.transit-planned` / `.transit-active`|

Sensors and Fuel tab clicks **open the panel** (like normal tabs). The on/off control for sensors lives *inside* the panel as a checkbox — the tab icon merely reflects the resulting state.

Tooltips on stateful tabs include live data: `"Fuel · 68% in tanks · Δv 480 km/s · click to view"`, `"Sensors · 4 suites running · click to view"`. Tooltips on stateless tabs describe function only.

## 03.12.4 Picker (strip + dropdown)

A single command strip at the top-centre of the canvas, always visible:

```
\[ ● Mars terrestrial ]  |  ⌕ Search bodies…  \[×]   ← large round browse-all on left
```

* **Large round browse button** (left) — the primary affordance. Tap opens the dropdown at the root categories.
* **Selected-body chip** — shows the current selection. Tap opens the dropdown into the body's category (handy for sibling browsing).
* **Search input** — typing auto-expands the dropdown into a flat filtered list across all bodies.
* **×** — only visible when search has text. Clears the search.

**Dropdown collapses on**: row pick, canvas tap (body or empty), pan/pinch on canvas, tap outside, Escape, Cmd/Ctrl+K.

**Cmd/Ctrl+K** toggles open/closed.

**Categories** (root, when no search): `Stars · Terrestrial planets · Gas giants · Ice giants · Earth-like · Human-habitable · Biospheres · Moons · Belts \& rings · Constructs`. Empty categories hidden. Tag-based categories (Earth-like / Human-habitable / Biospheres) overlap with the type categories on purpose — give users multiple paths.

**Constructs are flat.** No sub-categorisation by ship/station/facility/gate — the model doesn't formalise it and any imposed taxonomy is wrong for some user. Future: user-defined tags (deferred — see §03.7-A).

## 03.12.5 Time strip

```
\[▶ play]  \[Now]  \[Set as Actual]  <━━━scrubber━━━>  +1d/s   2026-05-20 14:32   master · …
```

* **Play** — runs the clock at +1 d/s
* **Now** (safe) — resets *display* time to current actual. No confirmation.
* **Set as Actual** (destructive, red border) — moves *master* clock forward to displayed time. Triggers the destructive-confirm dialog with warning about cascading effects on transits, ship logs, fuel.

v1's "Manual Speed dial" and log-scale scrub are deferred — they can be added back as a chevron-menu popover off the scrubber when fine control becomes a problem. The shipped prototype's linear scrub is enough to get started.

## 03.12.6 Selection \& camera

**Three-level zoom on repeat taps:**

1. **Overview** — body + direct parent (or star, for top-level) + direct children
2. **Mid** — body + direct children (no parent)
3. **Closeup** — body alone, sized to fill \~25 % of the canvas

Bodies with no children skip directly to level 2 on first tap. Stars follow the same path: first tap = whole system; second tap = star alone, closeup.

**Back-navigation** (mouse-button-4, Backspace, Alt+←, edge-swipe right on touch):

* First reverses the in-body zoom level (closeup → mid → overview)
* Then walks up the parent chain (moon → planet → star → starmap)
* Landing on a parent lands at **level 1** (parent + its children), not at overview — smooth zoom-out feel

**Wheel/pinch zoom-out past the natural frame** triggers the hierarchy unwind too — after a brief settle, the camera snaps up one step. Threshold: 60 % of the natural frame zoom.

**No upper zoom limit.** Users with constructs km apart need to zoom in arbitrarily deep. Lower limit just prevents NaN.

## 03.12.7 Body sizing and AU scale**Two modes**, segmented toggle in the bottom bar:

* **Real** (default) — true linear AU spacing. Bodies have an iconic minimum size (`REAL\_BODY\_FLOOR` = 0.5× their toytown size) so they stay visible \& tappable; grow naturally past that when their physical radius exceeds the icon.
* **Toytown** — Box-Cox-compressed orbits so inner planets and Neptune both fit. Bodies clamped to visible iconic size, grow with `sqrt(zoom)`.

The continuous Toytown slider from v1 stays available in **Advanced settings** for cartographers who want a specific composition. The default UI is binary.

**AU scale bar** lives bottom-left:

* Real mode: ruler with nice round AU values, drops to `M km` / `k km` / `km` as zoom deepens.
* Toytown mode: `Toytown · distances compressed` chip with an ⓘ explaining why a linear ruler would lie.

**Ruler tool** sits next to the scale bar (`▥` icon). Two-point measure:

* Tap the icon to enter measure mode (cursor → crosshair, button glows).
* Tap two bodies (or two empty points) — dashed line drawn between, floating readout shows distance in AU + km.
* Body-to-body picks always use the bodies' true world positions, so the reading is honest even in Toytown.
* Empty-point picks in Toytown surface a warning ("canvas distance is compressed — switch to Real or pick bodies").
* Escape or × dismisses. Picking a third point restarts the measurement with that point as A.

The reference implementation is in `proto/app.js` (`rulerHandleTap`, `renderRulerReadout`, `drawRulerLine`).

## 03.12.8 Unit-pair display convention

Every numeric value with a unit shows the **human-scale primary**, with the **scientific equivalent in the tooltip**. Mirrors the temperature convention.

|Domain|Star|Planet / moon / construct|
|-|-|-|
|Temperature|K primary, °C in tooltip|°C primary, K in tooltip|
|Mass|M☉ primary, kg in tooltip|M⊕ primary, kg in tooltip|
|Radius|R☉ primary, km in tooltip|R⊕ primary, km in tooltip|
|Distance (AU)|AU primary, km in tooltip|AU primary, km in tooltip|
|Pressure|bar primary, Pa in tooltip|bar primary, Pa in tooltip|
|Gravity|g primary, m/s² in tooltip|g primary, m/s² in tooltip|
|Δ values (greenhouse, internal heat)|K only (scale-invariant)|K only|

Display logic lives in two helpers in the prototype: `convertTemperatureForDisplay()` and `convertUnitsForDisplay()`. Pure functions — Svelte port should keep the underlying data in scientific units and convert at render time only.

## 03.12.9 Tooltip system

Two-layer pattern:

1. **Native `title=` attributes** on most tabs and chrome elements. Survive on desktop with mouse, harmless on touch. Describe function only (`"Atmosphere · pressure \& composition"`).
2. **Rich data-tip popups** (the `.data-tip` divs in the prototype) on data-row values. Triggered by hovering the ⓘ glyph or focusing the row. These show:

   * The unit-pair equivalent (Earth/Solar/Kelvin)
   * The methodology summary (a sentence or two)
   * A link to the `/physics` appendix anchor for the full derivation

This is the *physics honesty* mechanism: GMs at the table get the quick answer; anyone curious can drill into the full proof in one click.

## 03.12.10 Action / confirmation patterns

The destructive-confirm dialog (`showConfirmDestructive` in the prototype) is the **single re-usable confirmation pattern**:

* Title in display font
* Body paragraphs explaining what happens
* Warning chip with red border explaining irreversibility
* Cancel + destructive button (red)
* No Enter-key default — user must click explicitly

Used by:

* **Set as Actual** (master-clock advance)
* **Generate new system** (replaces current system)
* Future: delete system, delete starmap, clear all journeys

## 03.12.12 Keyboard shortcuts — first-class, not an afterthought

Touch and desktop are **co-equal targets**. Every touch gesture and tap-target has a
keyboard equivalent, and power GMs (who run sessions on a laptop) get accelerators.
Build a single `lib/input/shortcuts.ts` registry so bindings are declared in one place,
discoverable, and overridable — don't scatter `keydown` handlers across components.

**Principle:** anything reachable by tap/gesture is reachable by keyboard. Anything the
gesture layer (`gestures.ts`) does has a key analogue. Shortcuts are suppressed while a
text input / textarea / contenteditable is focused (except `Escape`, which always
backs out).

**Baseline binding map** (the prototype already implements the starred ones):

|Key|Action|
|-|-|
|`⌘K` / `Ctrl+K` ★|Toggle the body picker|
|`↑ / ↓` ★|Move selection in picker / lists|
|`Enter` ★|Confirm picker row / primary action|
|`Esc` ★|Back out: clear picker search → close picker → close modal → reverse zoom level|
|`Backspace`, `Alt+←` ★|Hierarchy back-navigation (zoom level → parent chain)|
|`Space`|Play / pause the clock|
|`+ / -`|Zoom in / out (same path as wheel/pinch, focal = viewport centre)|
|`0`|Reset / frame current selection (overview level)|
|`← → ↑ ↓` (no modifier, canvas focused)|Pan the camera|
|`\[ / ]`|Cycle selection to previous / next sibling body|
|`N`|Toggle names overlay · `Z` zones · `L` L-points · `S` sensors|
|`R`|Toggle ruler tool|
|`T`|Toytown ⇄ Real scale|
|`F`|Fullscreen / projector|
|`?`|Open a shortcuts cheat-sheet overlay|

**Discoverability:** a `?`-triggered cheat-sheet overlay lists the live bindings.
Tooltips on chrome buttons append their shortcut in parentheses (`Ruler (R)`), the way
desktop apps do — this is the desktop-side equivalent of the touch long-press hint.

**Accessibility falls out of this:** every interactive element is a real
`<button>`/`<a>` with `:focus-visible` rings and a tab order, so keyboard nav and
screen-reader traversal work without extra effort. The canvas gets `tabindex="0"` and
an `aria-label` so it's focusable for the pan/zoom keys.

`@media (pointer: coarse)` hides nothing keyboard-related — a touchscreen laptop has
both a finger and a keyboard, and both must work simultaneously.

## 03.12.11 What's still TBD (Claude Code can ask)These are intentionally left to design when implementation gets close. If you hit one and the answer isn't obvious, ask:

* **Transit tab content layout** — the v1 `TransitPlannerPanel.svelte` is the reference. May need to take over the lower half of the panel rather than fit in tab content; cross that bridge when porting. The image attached to the conversation (`AgriCorp Orbital Food Fab`-themed transit panel) is the canonical content reference.
* **Tags editor / Modules editor** — copy v1, just responsive.
* **Construct icon picker** — user picks shape + colour + custom badge per construct. Deferred until user-defined construct categories land.
* **Sensors panel content** — the running checkbox, suite list, range bands. Copy v1.
* **HR-diagram picker rendering** — the substrate is in `EvolutionaryWizard.svelte`; how does the M-dwarf state toggle slot in? Phase 06.
* **Refuel / Dock / Repair / Takeoff / Land** action buttons — where on the construct panel do these verbs live? Top of Basics tab? Inline on the relevant resource tab? Claude Code's call when implementing the construct panels.
* **CRT / greenscreen mode** — dropped from v2. Owner has an external tool they'll link to instead.
* **Camera-tracking** of an orbiting body — v1 has this; preserve in `viewport/camera.ts` extraction.

\---

# Implementation order — clean restatement

The phased plan above is unchanged. To make the start-here readable for Claude Code:

|Phase|Branch|What lands|Days|
|-|-|-|-|
|01|`beta-01-refactor`|De-dupe `TimeControls`, `pickNodeAt`, `drawConstructGlyph`, `drainFuel`, gravity-host. Split SystemView. Promote `lib/viewport/`. **No user-visible change.**|\~5|
|02|`beta-02-touch`|`lib/input/gestures.ts` PointerEvent layer. Apply to SystemVisualizer + Starmap. 44 px hit targets. **Tablet works.**|\~6|
|03|`beta-03-shell`|`AppShell`, `BottomSheet`, `RailNav`, `FabCluster`, picker strip + dropdown, 2-row tab strip, vis-button, scale bar, time strip, hero image, resize handle, settings popover, **everything in §03.12**. The visible v2.|\~10|
|04|`beta-04-physics`|Eccentric flux, M-L by class, Newton-Raphson Lambert, spectral-class radiation split, n-body in transit, `/physics` appendix, `<InfoLink>` component.|\~5|
|05|`beta-05-interstellar`|Cross-system journeys, dual-time relativistic dialog, starmap-rendered in-flight glyphs.|\~5|
|06|`beta-06-generation`|HR picker overhaul, M-dwarf state variants, stability solver, planet-gen refresh.|\~7|

Phase 01 must complete first. Phase 02 enables Phase 03 visually. Phases 04/05/06 are largely independent of each other and can interleave by appetite.

When in doubt about scope or behaviour, open the prototype in a browser, look at the affordance, and ask the owner.



NB There are 2 additional phases not detailed above before we can call V2 feature complete.

07 - Rewrite of the planetary classification engine to recognise more planetary types and hopefully provide more interesting images/data/tags (Scope to be finalised - when you get here lets discuss)

08 - COMPANION-APP-SPEC.md

