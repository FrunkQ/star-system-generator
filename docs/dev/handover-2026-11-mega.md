# Handover - mega-constructs stream, November 2026 (branch `feat/wp-m`, from v3.1.78)

Brief: Stream P of `session-briefs-2026-08-28.md`, as scoped by the coordinator. Nothing under
"settled by DECISION" was reopened. Not pushed, version not bumped, changelog and board untouched,
`npm run manifest` not run. `npm run build` green (once, 2 GB heap); `svelte-check` read for every
touched file - no free-variable or missing-export error in any of them (RENDER-S46).

## What was built

**Job 1 - inclined megastructures, both halves (`4d33f67`).** The Orbit tab gains Inclination and
Ascending Node for a megastructure whose placement is an orbit: rings, shells, swarms, and the
battle station in an orbit band. Not the elevator, not anything at a Lagrange point (that orbit is
derived), not ordinary constructs. One predicate: `megaPlacement.megaOrbitPlaneAuthorable`. The 3D
structure takes its axis from the orbit normal through two pure helpers in `megaGeometry.ts`
(`hostCentredAxisScene`, `hostCentredQuaternion`), wired into `scene.ts` at attach and at the one
orientation line. For an uninclined ring the new pose equals what `lookAt` gave. Re-picking a
zone about a star used to write i 0 / node 0; it now keeps the plane. The 2D orrery is unchanged.
Engine map RENDER-S61; RENDER-S44's blast line corrected.

**Job 2 - phase 6, the catalogue widens (`2932be2`).** Eleven types now.
- *Soletta* - shipped whole. `flux.amplifies: 'target'` plus its consumer in one commit:
  `starlightOcclusion.starlightBoost` (who lights whom) and a second, typed argument on
  `receivedLuminosityWatts` (the transmission clamp stands; the gain can only brighten). The lit
  world's equilibrium and surface temperature, weather tags and habitability score follow through
  the existing chain; it carries `mega/lit-by` (physics origin) and `body.starlightBoost`; the trace,
  the physics page and both tag docs say so. Offered in orbit bands and at L1/L2 only.
- *Birch planet* - shell round a black hole, seeded where the hole pulls at one gravity; apparent g
  `surface` (the pull of what it encloses); isotropic occlusion. One vocabulary addition, the hard
  clause `hostIsBlackHole`, so it is offered only round a hole.
- *Shkadov thruster* and *Caplan thruster* (the second added by the owner mid-run) - shipped as
  structures with PUBLISHED figures. Shkadov: a polar cap of the sphere-section generator, aimed
  by job 1's inclination/node; publishes `(1 - cos psi) / 2` of the star's light pressure. Caplan:
  a collector swarm (it really dims the star) with jet mass flow and jet speed; publishes thrust
  in newtons and the star's mass loss. The summary line states the acceleration, a million years
  of drift and how long the star lasts. Neither moves or shrinks its star.
- Four pack templates beside their neighbours in `construct_templates.json`. Engine map PHY-46,
  PHY-47; PHY-36 addendum; `authoring-exotics.md` seam table and `mega-constructs-design.md` status.
- **`core/SystemProcessor.ts` was touched: 4 lines, isolated** - one new import line (after the
  `observedStar` import) and one call, `commitStarlightBoost(body, allNodes)`, at the foot of
  `commitThermal` beside the shadow commit. Everything else lives in `starlightOcclusion.ts`.

**Job 3 - loose ends (`337f5a5`).**
- (a) One spelling per orbit band, from `constructs/placements.ts`. 'Medium Orbit' survives (it is
  what the bundled maps, the Orbit tab and the transit planner already wrote); `canonicalPlacement`
  reads an old save's 'Mid Orbit' and does not rewrite the file by opening it.
- (b) `ConstructBasicsTab` guarded its shape once, at creation; the side panel swaps the construct
  under a mounted tab, so the NEXT one selected crashed. It now prepares every construct it is handed.
- (c) The dead reads were six, not three, in three files (`hasSurface`, `surface`,
  `geosynchronousOrbit`, `lowOrbit`, `mediumOrbit`, `highOrbit`). REMOVED, with the live half made
  one function (`orbitBandAtAltitude`). Real behaviour change: a construct with a generic
  placement read "Far Orbit" on every real host and now reads Low / Medium / High by altitude.
  Geostationary was not revived: both dead branches invented their own 1,000 km tolerance and a
  word no Zone select offers. Engine map RENDER-S62; UI-B2 corrected.

## Not built, and why

- **Aerostat habitat.** Not a parameter set on what exists. It floats in an atmosphere; the only
  attached placement is `Surface`, which no gas giant offers and which about ten files compare by
  name. It needs its own placement word, a float level from the cloud-deck T(P) model, and those
  consumers taught the word. Roughly a day; recommend V4.
- **Either stellar engine moving its star, or the Caplan reducing its mass.** Needs the event
  driver of board row G41, which is V4 design and not in the tree. No capability axis was declared
  for it either: an axis nothing consumes is a claim (DATA-R33).
- **A tilted Shkadov cap's shadow.** Untilted it stands over the pole and shades nothing near the
  system plane, which is what is published. Tilted, it would shadow worlds for part of their orbit:
  a third occlusion geometry with four consumers (temperature, zones, observedStar, eclipses).
- **Engine-map ids RENDER-S63 was not needed and is unused.**

## Gates, each seen RED with the change removed

| Gate | Red by | Red reading |
|---|---|---|
| `megaGeometry.spec` "oriented to its orbit normal" (5) | axis helper returning +Y | 3 failed |
| `ConstructGeneralTab.spec` tilt block (5) | control off; plane reset restored | 4 failed |
| `starlightOcclusion.spec` soletta block (6), absolute 266.86 K | gain forced to 1 in `luminosity.ts` | 4 failed, lit world at 254.97 K |
| same, processor test | `commitStarlightBoost` call removed | 1 failed |
| `megaDerive.spec` soletta / Shkadov / Caplan / Birch (10) | one factor broken per type | 2 failed each |
| `megaPreview.spec` summary lines + cap portrait (5) | new lines and the cap branch disabled | 4 failed |
| `megaPlacement.spec` black-hole clause | the `hostIsBlackHole` check disabled | 1 failed |
| `apparentG.spec` shell round a hole | the anchor test removed | 1 failed |
| `exoticsParity.spec` amplify row | the soletta's `flux` declaration deleted | 1 failed |
| `packMegaTemplates.spec` "packs instantiate" | a record's sentence changed | 1 failed |
| `placements.spec`, `megaPlacement.spec`, tab + `construct-logic` old-spelling rows | `canonicalPlacement` as identity | 6 failed |
| `construct-logic.spec` real-shaped host; `AddConstructModal.spec` middle band | both files at `HEAD~1` | 4 + 1 failed |
| `ConstructBasicsTab.spec` construct swap | written before the fix | TypeError on `dimensionsM` |

`idempotence.test.ts` green before and after every processor-adjacent change; the soletta's own
three-pass test compares every body's temperatures, stamp and full tag list. Two rows were NOT
seen red and are stated as such: the Birch summary-line ordering in `megaPreview.spec`, and the
who-lights-whom seam row in `exoticsParity.spec` (it stays green when the declaration is deleted,
correctly, because the consumer reads the declaration).
A finding worth the board: `construct-logic.spec` had been green on a host fixture carrying the
six nonexistent fields. Its fixture is now pinned to `calculateOrbitalBoundaries`' own keys.

## Eyeball list for the owner (nothing visual was seen; no browser here)

1. Holo, Sol: add a Ringworld, Orbit tab, Inclination 30. The band should tilt WITH its orbit
   line and stay on it as the clock runs. Ascending Node 90 should swing the tilt a quarter turn.
2. Same ring, Inclination 0: it should look exactly as it did in 3.1.78.
3. A part-built Dyson sphere (coverage 40%), tilted: the built wedge should still follow its marker.
4. A Planetary Torus round a tilted world (Saturn): it should now lie in the world's equator with
   its moons. Before, it lay in the ground plane. This is a deliberate visible change.
5. Shkadov Thruster on Sol: a cap above the star's pole; tilt it and the cap should lean.
6. Soletta at Mars, Structure tab, widen the mirror: Mars' temperature rises, a "Lit by" tag
   appears, and the Technical panel's temperature trace names the mirror. Delete it: all gone.
7. Create dialog on a black hole: Birch Planet is offered; on Sol it is greyed with its sentence.
8. Make a station at Medium Orbit from the create dialog, open its Orbit tab: Zone reads Medium Orbit.

## Changelog lines (GM-facing; the coordinator owns the file)

- Megastructures can be tilted. A ringworld, Dyson sphere, swarm, orbital ring or battle station
  now has Inclination and Ascending Node on its Orbit tab, and the 3D view draws it in that plane.
- New megastructure: the Soletta, an orbital mirror that adds starlight to the world it is
  stationed at. The world warms and its weather and habitability follow.
- New megastructures: the Birch Planet (a shell round a black hole), the Shkadov Thruster and the
  Caplan Thruster. The two stellar engines state the push on their star; they do not move it yet.
- A station created at the middle orbit band no longer shows a blank Zone on its Orbit tab.
- Selecting a hand-written construct with no dimensions no longer crashes its Basics tab.
- A construct with no stated zone is now described as Low, Medium or High Orbit from its altitude
  instead of always "Far Orbit".

## Assessment only - the remaining Stream P jobs

**(i) Phase 5c, interiors.** Nothing of it exists in code: no `SurfaceArea` record, no gravity
provider, and G30 phases 1-2 are unbuilt (the owner closed G30 to V4 on 2026-08-18). The spec is
complete (`surface-areas-design.md` §8, §10). It would take G30 phase 1 (types, area maths, zero
behaviour change), then one region-gravity provider pinned bit-for-bit on every existing body,
then the atmosphere model run at spin gravity with retention restated: about three sessions. What
could break is every body's atmosphere, since the provider sits under all of them, though the pin
catches it. A user asked for exactly this, so it has real value, but its foundation is the V4
regional system. **Recommendation: do not build in V3.** If the user's ask must be met sooner, the
honest cheap form is a GM-declared interior (pressure, composition, temperature at the ring's
radius) shown as declared, not derived; that is a product decision and is asked below.

**(ii) G61, belts and rings onto exotics.** The count is now 78 direct `roleHint` belt/ring tests
in 40 non-spec files (63 when measured). It is pure supportability: no user sees a difference, and
belts carry live machinery (the density-proxy mass, the debris renderer, belt LOD). A dedicated
pass is four or five sessions and risks every map with a belt. **Recommendation: do not build in
V3.** Keep the board's standing rule (flip a site when you are in it anyway); a blank-slate V4
should start with belts as records, which costs nothing there.

**(iii) Phase 5, the hybrid flip.** `kind === 'construct'` is tested at 159 sites in 48 files and
only 3 files go through the chrome predicate. The flip buys nothing a GM can see on its own: its
payoff was 5c (see i) and docking, which shipped without it. It is the riskiest change on the
list (hierarchy rebuild, redaction, extent double-count, idempotence) and §11 Q3 is unanswered.
**Recommendation: do not build in V3; retire it as superseded.** V4 should decide the body/construct
question in its data model rather than inherit this migration.

## For the coordinator

- Two fixtures/generated files were restored before each commit; the Sol baseline did not move.
- Documentation debt to bank on the board: the user guide has no megastructure page for the four
  new types or the tilt control (the physics page and both tag docs ARE current).
- Findings to triage (reported, not fixed): (1) a host-centred mega has TWO radii, its `radiusAU`
  knob (area, apparent g) and its orbit (drawing, shadow), and the create dialog's AU field does
  not seed from the knob; (2) `surfaceSpectrum.ts` is handed intrinsic luminosity, so ground light
  and vegetation see neither phase 4's shadow nor the mirror; (3) the commonly quoted Shkadov
  figure (1.28e18 N on the Sun) is L/c; the engine publishes L/2c for a hemisphere and PHY-47 says
  why; (4) `physics/orbits.ts` keeps a literal 'Medium Orbit' as a planner label.

## Questions for the owner

1. Interiors: wait for V4, or is a declared (not derived) ring/shell interior worth having now?
2. Should a tilted torus default to its world's equator (as built), or the system plane?
3. Retire the phase 5 hybrid flip as superseded by V4?
4. The stellar engines publish thrust and do not move the star. Is that enough until V4's event
   driver, or do you want a GM-facing "after N years" readout on the Structure tab meanwhile?
5. The soletta is offered close in only (orbit bands, L1, L2). Is that the right fence?
