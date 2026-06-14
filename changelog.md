# Changelog

All notable changes are listed here:

## v2.0.44-beta - 14th Jun 2026

* Fixed a bug where your own custom tags could be wiped on recalculation. The body Tags editor now shows which tags are auto-derived (locked 🔒 — from physics or a rule) versus the ones you added (removable), so it's clear what's yours to edit.

## v2.0.43-beta - 14th Jun 2026

* The CRT white-noise now looks like real TV static (animated grain that regenerates each frame) instead of a fixed pixelly image jerking around — still in the terminal colour. The /physics page gained a "Reasons to visit" section and was brought up to date.

## v2.0.42-beta - 13th Jun 2026

* Editing a star's **temperature or radius now recomputes its luminosity** via Stefan-Boltzmann (L ∝ R²T⁴) instead of leaving it locked — a long-standing V1 complaint. (Auto-generated stars were already self-consistent; this fixes the manual editor.) Remnants keep their own radiation setting.

## v2.0.41-beta - 13th Jun 2026

* Monochrome Terminal CRT fixes: **Invert** is now a proper palette swap — the terminal colour becomes the background and the text goes black (green-on-black ↔ black-on-green greenscreen), instead of washing to white. **White noise** is now foreground-colour speckles — green specks on the black screen, black specks on the inverted greenscreen — rather than white static.

## v2.0.40-beta - 13th Jun 2026

* More "reasons to visit": **wilderness refuelling** — gas giants are now flagged as gas-giant refuelling stops (Traveller-style), and water/ice worlds as water/ice refuelling. Oxygen atmospheres add **life-support resupply** and **oxidizer** hooks. The experimental Generation Engine option is tucked to the bottom of the Generation settings and faded — it's not the point right now.

## v2.0.39-beta - 13th Jun 2026

* **"Reasons to visit"** — worlds are now tagged with RPG hooks for why a crew would go there: mineable **resources** (helium-3, deuterium, heavy/rare metals, water ice, hydrocarbons, diamonds, fissiles, asteroid ore…), **scientific** draws (biosignatures, pristine young worlds, tidal labs, rare world types, stellar-remnant proximity…), **frontier** logistics (fuel depots, gas skimming, aerobraking, gravity assists) and **mysteries** (anomalous signals, derelict rumours, legends). Inferred from the physics plus a seeded roll, so each system tags consistently but not everything-everywhere. A new **Generation** settings tab turns the whole thing on/off and toggles each category (default on), and now also holds the Generation Engine choice.

## v2.0.38-beta - 13th Jun 2026

* **CRT controls are now the GM's** — set in the Companion launcher (when the Monochrome skin is chosen), remembered, and pushed to every player's terminal (the GM can crank the noise to make them squint); players no longer have their own CRT panel. Invert is now a clean visual invert to light that keeps the terminal colour (no more green→magenta). White noise and the noise bar take the selected terminal colour. The guide's main content now fills ~the full width to match the headers. Sol_Expanse got the same ring-density + Dione/Tethys fixes as the canonical Sol.

## v2.0.37-beta - 13th Jun 2026

* Legacy duplicate tags (e.g. "Active Volcanism", "Tidally Locked") are now stripped on load — the physics re-derives the correct tags every time. The Local Neighbourhood example's Sol was refreshed: realistic ring densities (Saturn prominent, the other giants faint) and the missing moons Dione and Tethys added (so Enceladus's resonance heating works there). The canonical Sol definition is static/examples/Sol_2030-System.json.

## v2.0.36-beta - 13th Jun 2026

* On The Guide's planet discs, a ring's drawn size now reflects its density — a sparse ring is a thin faint hoop, a dense one (Saturn) a broad bright band.

## v2.0.35-beta - 13th Jun 2026

* **Tunable CRT on the Monochrome Terminal**: a "CRT" button opens a popup of sliders — brightness, contrast, invert, scanlines (intensity + width), vignette, rounded corners, picture skew, a rolling noise bar, white noise and flicker — all live and remembered. Built in the GM's chosen terminal colour.

## v2.0.34-beta - 13th Jun 2026

* **The Guide's planet discs now match the orrery**: a day/night terminator (pronounced on tidally locked worlds) and glowing equatorial volcanoes on tidally active worlds like Io.

## v2.0.33-beta - 13th Jun 2026

* **Day/night terminator and volcanoes are back.** They were silently vanishing when zoomed into a body (a canvas-gradient quirk at extreme zoom); now drawn in screen space — a tidally locked world shows a clear lit/dark divide, and Io shows glowing equatorial volcanoes.
* **Click prefers the parent.** A general click on a planet now selects the planet, not one of its moons or constructs that happens to sit under the cursor; a clearly-separated moon still selects directly.
* **The Guide:** a "back to parent" button when a moon is selected; constructs no longer show a picture; the Survey Datapad photo now fills the full image width letterboxed to the central detail (no longer over-zoomed); and the Starship Console jump list now lists belts and Pluto (the Pluto-Charon barycentre) that were previously missing.

## v2.0.32-beta - 13th Jun 2026

* **The Guide looks the part.** Planet discs now use the same renderer as the orrery, so Earth shows its oceans, land and clouds (not a flat blue ball). Belts render as a grey field of rocks that thickens with density instead of a fake planet. A barycentre is shown as its main body — "Pluto-Charon Barycenter" now reads as "Pluto (Pluto-Charon Barycenter)" with Charon listed as its companion. The Starship Console photo fills the panel width; the Survey Datapad photo is a letterboxed close-up of the central detail. And, naturally, any world called Earth earns a red "Mostly Harmless" stamp.

## v2.0.31-beta - 13th Jun 2026

* **Consistent click-to-zoom.** Clicking an object (or picking it from the browser) now frames it through a defined ladder, the same for stars, planets, moons and constructs: first click centres it with its parent near the edge; each further click steps in — to the object plus all its satellites, then to the object filling about half the screen. Levels that don't apply are skipped, and a barycentre is treated as one object until you click a member. (Back still steps up to the parent for now.)
* **Volcanic worlds** (Io and kin) now show their magma clearly — incandescent hotspots clustered around the equator, visible even on a bright sulfur surface.

## v2.0.30-beta - 13th Jun 2026

* Fixed tidally locked worlds rendering too dark: the night side was nearly black, so a world seen from its night hemisphere looked dark all over. The day side now stays fully lit with a sharp terminator, and the night side is clearly shaded but still readable.

## v2.0.29-beta - 13th Jun 2026

* **Orrery detail.** Tidally volcanic worlds (Io and kin) now show glowing magma patches in true-colour; tidally locked worlds get a pronounced fixed day/night terminator. Ring and belt opacity now follows their density — Saturn's rings read solid while Jupiter/Uranus/Neptune's are faint (as in reality), and denser belts look less transparent. New ringed/belted worlds get a randomised density.

## v2.0.28-beta - 13th Jun 2026

* **Tidal locking is now computed.** Whether a world keeps one face toward its host is derived from the despinning timescale vs the system age (the steep a⁶ law), not hand-set — every regular moon, Mercury and Pluto/Charon lock while the AU-distance planets and gas giants spin free. It shows as a dynamic "tidally locked" tag and re-derives every run; the body editor's checkbox still lets you pin it by hand (with a "Reset to auto" link).

## v2.0.27-beta - 13th Jun 2026

* **Resonance now heats moons.** A mean-motion resonance maintains a moon's eccentricity against tidal damping, so it now feeds the numeric tidal-heat model — Enceladus (pumped by the Dione 2:1) and the Galilean Laplace chain get real tidal heat (Io > Europa > Enceladus), while a coincidentally-eccentric moon (Ganymede, Luna) stays cold. Fixed the Sol dataset: all 19 major moons are now correctly flagged tidally locked.
* **Bad orbit data no longer freezes the orrery.** A negative/NaN semi-major axis (seen in a Kerbol import) used to throw and kill the render loop — a black frozen canvas. Invalid orbit ellipses are now skipped, a draw exception can't stop the loop, the orbit editor clamps the semi-major axis positive, and bad files self-heal on load.
* **Companion app:** The Guide is now the default skin and shows a procedural true-colour planet disc (with rings) matching the orrery's look; the Survey Datapad and Starship Console show artist's-impression photos; the Monochrome Terminal stays text-only.

## v2.0.25-beta - 12th Jun 2026

* **Out of alpha.** Hand-authored, imported and hand-picked worlds are now **end-state**: the engine no longer re-ages them (atmospheric escape was wiping deliberate trace exospheres — Io's SO2, Mercury's Na, Pluto's N2 — and compounding the loss on every load/edit) nor overwrites their authored types (Venus read "desert"). Aging and auto-classification are per-body opt-in switches in the body editor; generator-created worlds opt in and erode idempotently from a stored primordial baseline. The classifier now scores by mean band-fit so catch-all types can't win on barely-true sliver bands (Testion coverage 56/58, audit green). Belt/ring transit destinations park in a circular orbit at the ring's radius on the origin's side — no more Mars-to-belt plans swinging past the sun. Testion demo bodies start scattered around their orbits instead of lined up in a row. /physics documents the new scoring and the end-state model.

## v2.0.24-alpha - 12th Jun 2026

* Resonances and predicted fates surfaced in the UI: labelled tag chips (j:k resonance, Laplace, fates, stability severities), a Resonance row in the body data panel, and a new /physics section + Known-fudges entries documenting the model.

## v2.0.23-alpha - 12th Jun 2026

* **Enceladus and Triton come alive**: Dione + Tethys added to the Sol dataset (the missing 2:1 resonance partners). A resonance that keeps pumping a moon's eccentricity now drives **ice** cryovolcanism at its own ~273 K bar (the ~1000 K silicate threshold no longer gates icy moons) — Enceladus derives cryovolcanic; barely-pumped Ganymede/Dione stay quiet, and heliocentric resonances (Pluto–Neptune 3:2) shape orbits without heating. Very cold ice worlds (<60 K) get Triton-style **solar-seasonal geysers**. Higher-order resonance tagging tightened to kill coincidental near-ratios.

## v2.0.22-alpha - 10th Jun 2026

* **Interstellar transit**: speeds never read "100% c" any more — near light speed the figure floors and shows just enough decimals to reveal the gap (e.g. 99.997% c), since c is only ever approached. The relativistic energy bill is now a human-readable mass-energy equivalent (e.g. "42.9 kilotonnes" rather than "4.29e+4 tonnes"), laddered through familiar units up to Earth/Jupiter masses.

## v2.0.21-alpha - 10th Jun 2026

* **Interstellar transit planner reworked**: the ship is fixed (it's opened from that ship — no picker); the destination is two-fold (pick a star system, then a body within it). **Massless fuel** is now an honest constant-g flip-and-burn — accelerate to a midpoint peak, flip, brake to rest, no cruise. **Realistic & Massless** get a burn-acceleration slider that turns amber past ~2 g and red past ~10 g, warning that crew-survival tech is needed (it never blocks the plan). **Relativistic** gets a finer speed slider that reaches 99.999 % c, plus the kinetic-energy bill to get there expressed as a mass-energy equivalent (kg / tonnes / Earth / Jupiter). New **Start Journey** button (and **Cancel**): the ship then appears on the starmap, travelling along a line between the stars over game time — solid trail behind, dashed ahead — and selecting it lets you cancel and snap back to the start. The three physical models are greyed out on diagrammatic (unscaled) maps; the Jump drive always works.
* **Field Guide**: the view is now **GM-enforced** (set in the launcher, broadcast live; no player picker). Green/Amber merged into one **Monochrome Terminal** with a GM colour choice (Green/Amber/White/Blue/Red). The diagram shows stars + planets only — belts are wide blobs picked from the body list under the diagram; moons and constructs ("On planet" / "Orbiting") appear in the data panel. **The Guide** turned hopelessly colourful — friendly fonts, rainbow lines, a DON'T PANIC cover, and random Guide-note banners. **Starship Console** gains a star/planet jump list (planets unfold their moons/constructs) and adaptive time (the fastest visible orbit runs at ~1 orbit per 2 s). "Open Field Guide" → "Open Local Field Guide Window".
* **New Starmap modal simplified**: rulepack picker dropped; one **Distance/Scaling units** choice — Light Years (ly), Parsecs (pc) or Diagrammatic (not scaled, with a free abstract unit like J8). Settings mirrors the same control.
* **Settings**: "Starmap View" → **Starmap**; new top-level **Time** section (Date & Time + Time & Calendars). Sub-editors return to Settings on close instead of exiting. Spurious horizontal scrollbars on the Starmap & Time tabs removed.
* **Orrery**: a flaring / very active star now glows more intensely, and a feeding black hole gets a hot-orange halo.
* **Time controls**: the transport pill is ~15 % smaller and shorter; minimising now collapses it to a clock icon (no date read-out).
* Planet images get a **More information** pill linking the matching planet-type entry in Pablo Carlos Budassi's classification.
* Scaled starmaps: the distance scale bar moved to the bottom-right (matching the system map); the Description/GM-notes panel sits above it.
* Traveller import no longer forces the numbered hex map — the hex obeys the snap-grid switch, while Traveller scaling/snapping/import keep working underneath.
* Rail: **File** moved down between Measure and Settings; the Settings icon matches the others; the corner brand reads **SSE2**. The add-planet type picker scrolls properly on mobile.

## v2.0.20-alpha - 10th Jun 2026

* **Resonances + smarter stability**: the orbital model now catches mean-motion resonances (2:1, 3:2, …), Laplace chains (Io:Europa:Ganymede 1:2:4), and barycentre pairs (so Pluto–Charon's 3:2 with Neptune is found). Protective resonances spare crossing orbits (Pluto isn't flagged doomed); resonant eccentricity-pumping is flagged as the driver behind moons like Europa/Io. Unstable objects now get a predicted fate — spirals in, flung out, collision, or hierarchy inversion.

## v2.0.19-alpha - 10th Jun 2026

* **Gas giants stop looking identical**: cloud colour is now composition-driven, so the gas-mix sliders actually change the look. Methane (CH₄) absorbs red in proportion to abundance and cold — cyan (Uranus) through deep blue (Neptune); ammonia giants stay warm tan/gold with chromophore stripes (Jupiter browner and spottier than paler Saturn). Ice giants render near-featureless (low contrast, no storm); the Great-Red-Spot oval now only appears on banded ammonia giants.

## v2.0.18-alpha - 10th Jun 2026

* **True colour goes procedural**: bodies render as layered discs — land with ocean patches at the real coverage %, cloud streaks and haze on top, gas-giant latitudinal banding (with chromophore bands and the odd storm oval), incandescent glow on hot worlds. Driven by the physics palette, so editor changes (gas mix, coverage, temperature) visibly change the disc.
* Ring shadows are now parallel-sided (planet-diameter wide, soft penumbra) instead of fanning out from the centre.
* Time pill: minimise is a slim strip on the far right; the minimised state shows a clock icon.

## v2.0.17-alpha - 10th Jun 2026

* **New Starmap modal simplified**: rulepack picker dropped (only one pack exists); one **Distance/Scaling units** choice — Light Years (ly), Parsecs (pc), or Diagrammatic (not scaled) with a free abstract unit + order (e.g. J8 for Jump-8). Settings mirrors the same control. The button now creates Vast Nothingness, as is proper.
* **Settings**: "Starmap View" → **Starmap**; new top-level **Time** section (Date & Time + Time & Calendars). Sub-editors (Time & Calendars, Fuel & Drives, Sensors, Atmospheres, LLM) return to Settings on close instead of exiting.
* **Field Guide**: the view is now **GM-enforced** (set in the launcher, broadcast live; the player picker is gone). Green/Amber merged into one **Monochrome Terminal** with a GM colour choice (Green/Amber/White/Blue/Red). Diagram shows stars + planets only — belts are wide blobs picked from the new body list under the diagram; moons and constructs ("On planet" / "Orbiting") appear in the data panel. **The Guide** got hopelessly colourful: friendly fonts, rainbow lines, a once-per-session DON'T PANIC cover, and random Guide notes as banners. **Starship Console** gains a star/planet jump list (planets unfold moons/constructs) and adaptive time — the fastest visible orbit runs at ~1 orbit per 2 s with a "1 s ≈ X" read-out. "Open Field Guide" → "Open Local Field Guide Window".
* Planet images get a **More information** pill linking the matching planet-type entry in Pablo Carlos Budassi's classification (new tab), for types catalogued there.
* Starmap scale bar (scaled maps) moved to the bottom-right, styled like the system map's; the Description/GM Notes panel defaults above it.
* Mobile: the add-planet type picker scrolls properly and fills the screen; orrery View options use a sliders icon (the eye belongs to player visibility); the rail brand reads **SSE2**.

## v2.0.16-alpha - 10th Jun 2026

* Black-hole editor: radius is now **Event Horizon Radius**, locked to mass (Schwarzschild); mass range to 300 solar masses. Quiescent holes have **zero magnetic field** (no-hair) with the slider disabled; toggling **Feeding** presets a hot disc, near-Eddington output and a ~10⁶ G disc field, with the likely range shown above the slider.

## v2.0.15-alpha - 10th Jun 2026

* **Time controls**: the transport pill is now draggable (grip handle) and minimizable to just a clock — tap to expand; position and state persist. Scale bar moved to the bottom-right (it sat under the time pill).
* **True colour**: liquid shades now come from the host star's light filtered by each liquid's absorption plus a refractive-index specular share — water under a red dwarf reads murky amber, not postcard blue. The disc mixes land/liquid proportionally by coverage for ANY surface liquid, with clouds/haze on top.
* Ring shadows now match the planet's drawn disc size instead of a point-source sliver.

## v2.0.14-alpha - 9th Jun 2026

* Black holes get a **Feeding** toggle (active accretion — changes the image, orrery accretion ring, and output). Pushing a neutron star's **magnetic field past ~10¹³ G** turns it into a (purple) **magnetar**, and dropping it back reverts.

## v2.0.13-alpha - 9th Jun 2026

* Interstellar planning moved off the rail to a link in a ship's transit planner (below the destination picker); "Measure" moved to the bottom of the rail.
* Orrery: stars now glow; planets/moons are shaded on their night side. The View control is a semitransparent eye that floats on the orrery (no longer hidden behind the body picker on phone).
* Transit planner: one-button "Refuel" (fills all tanks).
* Mobile/UI: slimmer time controls on phone; the per-field info "i" links removed from the body panel (the Newton apple covers it); New Starmap modal fits/scrolls on phones; About close is a larger red cross; picking Measure closes the mobile menu.

## v2.0.12-alpha - 9th Jun 2026

* **Interstellar transit planner** (new "Interstellar…" rail tool): pick a ship and a destination system, then compare four travel models — Realistic (rocket equation; a fuel slider must escape the star AND brake at the far end, red/yellow/green), Massless fuel (free propellant), Relativistic (instant accel to a fraction of c with time dilation), and Jump drive (just set the days). Each shows crew-frame and outside-observer travel time.

## v2.0.11-alpha - 9th Jun 2026

* Hiding a whole system from the guide now keys on the system's **root** (the top barycenter in a multi-star system) — hiding an underlying star only hides that star. Hidden-system eye marker is smaller and sits closer to the star.
* Projector: the standalone "Toggle projector CRT" is gone; the projector-open button now toggles it as **"Greenscreen CRT"** (the green-CRT look, which is what was wanted).

## v2.0.10-alpha - 9th Jun 2026

* **Field Guide — diagrams + remote fix**:
  * Clickable **star map** (systems at their real positions, with route lines) → preview a system, then explore. Clickable **per-system orbital diagram** (planets by distance, moon pips) → tap a body for its full data. Map stays on top, details below.
  * **Remote (cross-device) now delivers the whole map**: large peer messages are chunked (WebRTC drops >16KB frames), and the broadcast snapshot is slimmed (no transit logs / debug). Players on their own devices now get the full starmap, not just the branding.

## v2.0.9-alpha - 9th Jun 2026

* Printed report: added a **Geology** (tectonic regime) row to every body/moon, matching the field guide's depth.

## v2.0.8-alpha - 9th Jun 2026

* **Field Guide — full detail + branding**:
  * Every tier (lo-fi browser, hi-tech console, datapad, Guide) now shows full report-depth body data — temperature range, density, radiation, magnetosphere, geology, axial tilt, tidal lock, air mix, surface liquids, ascent Δv, biosphere and feature tags.
  * GM **company / faction branding**: set a name and upload a logo in the launcher; it appears as the guide's letterhead. (Supply your own art — nothing trademarked ships by default.)

## v2.0.7-alpha - 9th Jun 2026

* **Field Guide is now campaign-wide**: it opens at the starmap level with every visible system, then drills into one (a wider cut than the old per-system report). Available from both the starmap and a system view. A system whose main star is hidden from players is dropped from the guide — and now shows a small crossed-eye on the GM's starmap as a reminder.

## v2.0.6-alpha - 8th Jun 2026

* **Companion App — now a proper app + works on players' own devices**:
  * The lo-fi / datapad / Guide skins are now diagrammatic: a clickable star/planet layout up top, tap a body to read its player-safe file in a panel below (moons drill in) — instead of one long document.
  * **Cross-device**: players can open the guide on their own phones/tablets over the internet (peer-to-peer), not just same-machine. Keep the app open while they're connected.
  * GM **"include constructs"** switch in the launcher — show or hide stations/ships in the guide, over and above the standard player redaction.
* Measuring tape moved from the orrery View menu to a dedicated left-rail **Measure** button.

## v2.0.5-alpha - 8th Jun 2026

* **Measuring tape**: a "Measure (ruler)" toggle in the orrery View popover — tap two bodies for the straight-line distance between them in AU (km when short). Ported from the wireframe; works in Toytown scale.

## v2.0.4-alpha - 8th Jun 2026

* **LLM**: connect a local OpenAI-compatible server (LM Studio / Ollama, no key) or OpenRouter — base-URL presets, optional key, and a Test &amp; list-models button. Descriptions now feed the model curated, evocative body/star summaries (constraint-grade physics + interesting tags) instead of a raw 40-field physics dump, for more imaginative results.

## v2.0.3-alpha - 8th Jun 2026

* **Companion App**: added "The Guide" skin (friendly illustrated travel companion).
* Fixes: Newton's-apple physics button is green; confirm before File > New Starmap clears the map; Display/Actual time labels no longer clipped under their values; the time transport "..." is now a red warning that confirms the destructive set-now; Traveller mode is its own toggle (not a snap-grid value); the orrery can no longer overflow its cell and occlude the detail drag-bar / push the time pill off-screen; construct location in the report no longer shows 5 decimals.

## v2.0.2-alpha - 8th Jun 2026

* **Companion App (Players' Field Guide)**: new `/catalogue?sid=` live, redacted, in-universe companion to the system you're running. Open it from the system-view rail ("Field Guide..."). Same-machine for now (a mirrored tablet, a second window, your phone on the same browser). Skins: Green Screen / Amber Terminal (lo-fi CRT report), Survey Datapad (clean), Starship Console (live orbital map, tap a world for its file). Launcher has a link + QR. Report rendering extracted into a shared `ReportDocument` so the printed report and the live guide share one document.

## v2.0.0-alpha - 12th Apr 2026

* **Evolutionary System Wizard (New Generation Engine)**:

  * Introduced a multi-phase interactive wizard for physics-driven star system generation, selectable in New Starmap and Settings.
* **Stellar Birth (Phase 1)**:

  * Interactive property selection using a calibrated Hertzsprung-Russell diagram (based on ESO data)..
  * Stellar Classifier: Identifies all stellar types (Main Sequence, Hypergiants, White Dwarfs, etc.) and remnants (Black Holes, Neutron Stars)
* **Stellar Nursery (Phase 2)**:

  * 2D nursery for spatial star placement:  Drag-and-drop
  * Green Velocity Handles: Drag vectoring with real-time speed labels (km/s).
* **Stellar Dance (Phase 3)**:

  * **4th-order Runge-Kutta (RK4)** N-body physics engine with **Swept-Sphere collision detection** to prevent high-speed tunnelling.
  * **Event-Driven Slow-Mo**: Simulation automatically slows down to a crawl during mergers and ejections.
* **Unified Evolution Timeline (Phase 4)**:

  * 100 iteration accretion disc calculation \& animation capturing snapshots on every iteration.
  * **Dust/Gas Band Visualization**: Renders the protoplanetary disk with visible "carving" as planets sweep up material. \[LIKLEY BUGGED!]
  * **The BIG Time Slider**: Slider length and tick marks now reflect the actual calculated lifespan of the star.
  * **Basic lifespan**: star brightness changes over time, stellar remnants and engulfed planets taken into consideration
  * ***This is the section I am tinkering with mostly - LOTS to add and refine to get from here into the main part of SSE***
* **Physics \& Moon Generation**:

  * Implemented **Satellite Mass Budget Model**: Moon masses are now realistic percentages of parent mass (0.01-0.025% for giants).
  * **Power-Law Distribution**: Satellite systems now favor a single large moon (Titan/Ganymede style) over identical clones.
  * **Double Planet Event**: 2% rare chance for worlds to form high-mass binary partners (Earth/Luna style).
* **Content \& Community**:

  * Added  new example systems built by the community
  * Added special credits to footer and About box for community contributors (@Athena, @Mafro, @malize) and Mitch Anderson (Accrete.js).

## v1.10.0 - 1st Apr 2026

* Data Unification \& Editor Features:

  * Unified Star and Planet data structures into a single cohesive `CelestialBody` type, simplifying physics processing and resolving TS errors.
  * High mass planets (Brown Dwarfs) can now be "Ignited" into stars directly within the UI.
  * Low mass stars can be "Doused" back into planets directly within the UI.
  * Added "Rebuild Hierarchy" button to System View. When mass edits fundamentally shift the system's center of mass (e.g. creating a massive star), this button flattens and fully rebuilds the orbital parent-child chains relative to the new heaviest body. It can be destructive so not automated.
* Transit \& Flight Dynamics Improvements:

  * Overhauled post-transit kinematic states to accurately simulate orbital aftermaths during time-scrubbing.
  * Ships arriving in generic orbits (`lo`, `mo`, `ho`) or landed on the surface now correctly lock to their target's global state, eliminating the "glued to the sky" static offset bug.
  * Ships intercepting a construct (rendezvous) now automatically enter `Deep Space` formation flying, matching the station's trajectory instead of continuing inertial drift.
  * Ships arriving at Lagrange points (L1-L5) now mathematically track the parent planet's orbital rotation rather than remaining at a static offset.
* Improved Stability Assessment:

  * Added full system hierarchy scan to catch "Massive Inversions" (orbiting body is heavier than its host) and "Stolen Children" (orbit exceeds host's stable Hill sphere).
  * Added "Consumed/Collided" checks if an orbit drops below the physical radius of its host.
  * Added "Roche Limit Violation" checks for bodies orbiting too close to their host.
  * Rebuild Hierarchy` UI warnings added to the Technical Details panel when mass inversions occur.
* Terminology \& Unit Standardization:

  * Standardized acceleration units to lowercase **"g"** (9.81 m/s²) across tech details, and hazard messages.
* Time Control System Enhancements:

  * Added **"Manual Speed"** mode (speed dial) allowing for persistent integration rates and reversible playback. Works like OLD system.
  * Added **Speed Indicator** (e.g., +1s/s to +10y/s) providing real-time feedback during scrubbing.
  * Increased scrubber precision with a 50% wider slider and unified logic across System and Starmap views.
* Printed Report Improvements (Binary Systems):

  * Implemented hierarchical **stacked rendering** for binary planets in the System Overview diagram.
  * Enclosed binary pairs within a detailed **Barycenter Info Block** in the Celestial Survey for better organization.
  * Added dynamic unit scaling: small orbital distances now automatically switch from **AU** to **km** for readability.
* Precision Orbital Editing:

  * Added "Mean Anomaly" slider and manual numeric entry to all bodies and constructs for fine-tuned positioning.
  * Set all orbital parameters (SMA, Eccentricity, etc.) to use high-precision "any" step for manual entry.
  * Construct editor now supports direct manual entry for Altitude (km) and Orbital Distance (AU).
* Binary Star Orbit Control:

  * Enabled Orbit editing tab for stars within binary systems.
  * Implemented reciprocal coupling: editing one star's position now automatically updates its partner to maintain its stable barycenter.
* Stellar Physics \& Evolution:

  * Implemented **Dual Frost Lines**: distinction between **Formation Frost Line** (170K, historical boundary for gas giant growth) and **Current Frost Line** (125K, modern vacuum ice stability).
  * Added **Spectral-Class Dependent Brightening**: stars now evolve in luminosity based on their type (O/B massive stars brighten rapidly, M-dwarfs remain stable), correctly back-calculating historical formation zones.
  * Fixed **Radiogenic Heating** persistence: manual thermal overrides are now preserved during system processing and correctly account for surface temperature even on rogue/starless bodies.
* Orbital Mechanics \& Generation:

  * Fixed **"0 AU Moon" Bug**: correctly resolved host gravitational parameters for planets orbiting barycenters, ensuring stable moon placements in binary systems.
  * UI refinement for root stellar barycenters: hidden the redundant "Edit" button to prioritize direct name/visibility editing.
* Bug Fixes \& UI Polish:

  * Fixed **Time Epoch Desynchronization** (13.8 billion year jump): ensured all initialization paths correctly offset Big Bang display time into Unix-relative physics time, preventing orbital scrambling on reload.
  * Improved flyby math to correctly calculate zero Delta-V intercepts for unpowered flypasts.
  * Unified "About" dialogs into a single, maintainable component.
  * Easter Egg :)



## v1.9.2 - 24th Mar 2026

* N-Body Gravitational Summation:

  * Transit solvers now sum gravitational forces from all massive bodies (Stars, Planets, Barycenters) for realistic ballistic drift.
  * Replaces single-body Keplerian assumptions with full integrated pathing for all mission types.
* Trajectory Correction Manoeuvres (TCM):

  * Automatic drift tracking injects discrete TCM burn points if n-body perturbations exceed 100km.
  * Compact, color-coded timeline labels and trajectory markers signal manoeuvre intensity (Blue/Orange/Red) based on Max-G.
  * TCMs now correctly consume fuel and contribute to total mission delta-V.
* Planner UI \& Stability:

  * "Transit Tags" summary box added to mission stats for better awareness of aerobraking, TCMs, and high-G status.
  * Direct Burn profile state (Accel/Coast/Brake) is now persistent and decoupled from ballistic plan states.
  * Fixed various "ReferenceError" and "Shadowing" bugs in the transit calculation engine.

## v1.9.1 - 15th Mar 2026

* Torch-Ship Kinematic Simplification:

  * Bypassed Lambert solver artifacts for high-thrust "Direct Burn" plans.
  * Eliminates "2000c" speed-of-light errors in favour of robust kinematic straight-line profiling.
* Lowest Common Ancestor (LCA) frame selection for transits:

  * ensures transfers in multi-star systems use the correct gravitational host,
  * fixes "40 AU loop" bug where binary star transits default to system barycenter.
* Smart Target Redirection:

  * Interplanetary moon transfers now automatically target the parent planet's gravity well while maintaining moon-radius capture.
  * Fixes "dive into the star" bug for local stellar constructs.
* Expanded Lagrange point support (L1-L5):

  * added L1, L2 (radial offsets) and L3 (hidden co-orbital),
  * co-orbital framing ensures L-points are tracked in the host's parent frame.
* Transit intercept accuracy and stability:

  * Fixed "missed intercept" bug: solvers now target actual $(x, y)$ node coordinates at arrival rather than just orbital radius.
  * Stability filter overhaul: removed hard 100km/s cap, increased to 10,000 km/s insanity check to support high-G ship jumps.
  * Forced direct-path (short-way only) for Speed/Direct Burn plans to prevent unrealistic looping arcs.
  * Improved station/construct state resolution: orbiting constructs correctly resolve positions even without explicit orbit objects.
* UI/UX refinements:

  * New "Major Target -> Sub-Target" dropdown workflow in Transit Planner.
  * Improved hidden-plan reason messages in the UI.
  * Added internal transit debug logging to developer console.

## v1.9.0 - 24th Feb 2026

* New time system foundations are in place:

  * Display Time and Actual Time are now separate and can be aligned/reset.
  * Time scrub/play controls now drive system visuals and orbit updates.
  * Calendar/time settings are saved with each starmap.
* Calendar system is now data-driven and extensible:

  * calendars are loaded from data,
  * new calendars can be added/edited,
  * legacy saves are migrated safely.
* Transit planner reliability pass:

  * short/local transfers (planet/moon) now use correct local reference frames,
  * Direct Burn now solves for a feasible duration instead of producing impossible spike values,
  * orbit targeting now respects selected arrival orbit level (LO/MO/HO),
  * Brake-at-arrival now targets orbital tangential velocity instead of assuming stationary capture,
  * flypast velocity now carries correctly into the next leg for all route types,
  * local launch-window search no longer suggests absurd long waits for moon transfers,
  * route label updated: `Efficient Alt` -> `Efficient Now`.
* Transit visuals improved:

  * during preview/execution, the focused construct moves along the route,
  * optional vector overlay added (single `Show Vectors` toggle) for velocity/acceleration.
* Habitable Zone model refreshed and old Goldilocks logic replaced with conservative modern HZ edges.
* Zone rendering performance improved (screen-space draw path, culling, and cheaper dash behavior).
* StarMap settings and LLM settings reorganized:

  * StarMap settings consolidated,
  * LLM/API settings moved to separate local-only config (not exported).
* Time-driven transit scheduling shipped:

  * `Schedule Journey` now writes planned routes into each construct's own ship log data,
  * planned routes persist with constructs in saved systems/starmaps,
  * multiple constructs can move concurrently from scheduled plans.
* Ship's Log shipped in System View:

  * shows journey windows and per-leg departure/destination entries,
  * includes controls to clear future plans and cancel active (+future) plans.
* Transit intercept and stability improvements:

  * moving construct targets are available in planner target lists,
  * intercept solving now uses live kinematic target state (position + velocity),
  * direct-burn sanity filters reduce unstable/crazy solutions for moving targets - these WILL happen

## v1.8.4 - 20th Feb 2026

* Temperature model refresh (cryo greenhouse behavior, improved range presentation, tidal hotspot handling).
* Printable report overhaul with compact system diagram and multi-star hierarchy fixes.
* QoL updates including invert display mode, finer atmosphere composition editing, and Traveller import edge-case fixes.

## v1.8.1 - 14th Feb 2026

* Scaled starmap mode with persistent map mode/scale controls.
* Route-based map rescaling workflow.
* Draggable systems with live route distance updates in scaled mode.
* Scale bar integration and placement consistency updates.

## v1.8.0 - 14th Feb 2026

* Orbital stability post-processing (overlap + Hill-spacing proxy) with calibrated severity tiers.
* Dedicated orbital stability technical-details UI block and tags integration.

## v1.7.2 - 14th Feb 2026

* Transit planner GM override flow (`Force Journey`) for blocked plans.
* Name filtering in system summary context menus.
* PWA install/offline support and update prompt behavior.

## v1.7.1 - 14th Feb 2026

* IndexedDB starmap persistence migration from localStorage.
* High-e orbit/camera stability improvements and Kepler propagation hardening.
* Orbit editing guardrails and Lagrange placement correction.

## v1.7.0 - 24th Jan 2026

* Traveller integration (subsector import, UWP entry, extended decoding, PBG population logic).
* Global atmosphere editor and related physics/placement integrity updates.
* Broad UI/UX polish across starmap/system flows.

## v1.6.0 - 21st Jan 2026

* Sensor suite data model/editor/overlay implementation.
* Save redaction workflow for player-safe exports.
* Habitability and Earth-temperature calibration refinements.

## v1.3.4 (14th Jan 2026)

* Brown dwarf support expansion and procedural realism upgrades.
* Binary dynamics and orbital mechanics improvements (including retrograde support).
* Multiple UI/UX stability fixes.

## v1.3.3 (13th Jan 2026)

* Documentation/tutorial improvements and sync/performance fixes.
* Critical starmap/system relink bug fix.

