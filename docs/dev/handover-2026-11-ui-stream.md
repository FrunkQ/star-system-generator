# UI stream handover, 2026-11-13 (branch `feat/wp-u`, off beta at v3.1.78)

Six items, four commits, all gated. Nothing was seen in a browser: every visual claim below is on
the eyeball list. No processor change; the Sol baseline did not move. Engine-map ids used:
UI-C22, UI-C23, UI-C24, PHY-48 (and corrections to UI-C19, PHY-5, DATA-R39, TAG-5's BLAST line).

## What was built

| # | Item | Commit |
|---|---|---|
| 1 | **A105** - Day Length (lock notch, break-up note), Retrograde spin, Lobes and Axial Tilt left the Composition tab for the Orbit tab, as `BodySpinEditor.svelte` (script, markup and base styles together), under a "Spin and shape" heading. `BodySidePanel` gives it to exactly the bodies that have a Composition tab (`showSpin`). The one-way tilt slider and "not set" state came across intact; the gate moved to `BodyOrbitTab.tilt.spec.ts`. The star's tilt block was not touched. The two retrogrades read "Retrograde orbit (circles its host backwards)" and "Retrograde spin (turns backwards)". The three "Day Length" idiom comments in `BodyOverridesTab` and two in `importFixup` point at the new home; the gallery blurb that said lobes are set "in the Basics tab" now says the Orbit tab. | `052fb71` |
| 2 | **A106** - Inclination and Longitude of Ascending Node are always shown; the "Show Advanced Orbital Elements" checkbox is gone. Re-home keeps a disclosure of its own at the foot of the tab (a "Re-home..." button), per the coordinator's recorded recommendation. | `052fb71` |
| 3 | **Mean anomaly's hidden epoch (PHY-48)** - the recommended fix held up. The box shows `rephasedM0(orbit, system.epochT0)` and is labelled "Mean Anomaly at epoch", with the epoch's date on the campaign calendar in a hint. Typing writes `t0 = epochT0` and `M0_rad` together (`orbits.setPhaseAtEpoch`). No stored data is migrated; opening the tab writes nothing. | `9445992` |
| 4 | **Reference plane hint** - one line under the node field says which plane applies to THIS body: the parent's equator (with its tilt) for a moon, the system plane for a star / barycentre / root host or an orbit declaring `frame: 'ecliptic'`. The decision was given a name, `satelliteFrame.orbitReferencePlane`, and `satelliteTiltRad` now calls it - one spelling, same behaviour. Convention unchanged. | `9445992` |
| 5 | **Starmap highlight note (UI-C23)** - the existing key in the top-right corner becomes the note while a highlight is fading systems: "Highlighting: <selection>", "N systems faded." (or "Nothing on this map carries it, so all N systems are faded."), a **Clear**, and an X that hides the note but not the highlight. GM starmap only - verified that the players' starmap (`Starmap2DView`, `starmapScene`) badges but does not fade. | `6160a04` |
| 6 | **Step by an exact amount (UI-C24)** - a new "⇥" button on the time transport opens a panel: back / how many / unit / forward, plus the displayed date. Units are the ACTIVE CALENDAR's own: seconds, minutes, hours, days (fixed lengths), months and years (dates: same day and time of day, clamped to a short month's last day), or a ratio calendar's own unit. New module `temporal/step.ts`. | `29c6cb8` |

## Findings that changed the work

- **The highlight fade could be total and silent.** The old key rendered only when something
  MATCHED, and the selection is persisted in `localStorage`. A selection nothing on the map
  carries dimmed every system and drew nothing. That is very likely the user's report.
- **Two components labelled a highlight entry differently** (`TagFinder.hlChip`,
  `PlayerViewModal.hlStyle`); the note would have been a third. They now share
  `mapHighlights.describeHighlightRef`, which resolves a tag exactly as its marker does. Visible
  effect: some chips in those two panels may change colour or wording (engine tags were grey and
  named from the raw key in Player Views; GM-recoloured tags kept the category colour in Find by tag).
- **The temporal module exposed no month or year arithmetic**, only the resolver. Rather than
  report and stop, months and years are stepped by WALKING calendar days and asking the resolver
  what date each is - no second copy of the leap or month rules. Gregorian results are checked
  against JavaScript's own `Date.UTC`.
- **My first step gate hung for ten minutes**: a year of a quadrillion one-second days pushed the
  day counter past 2^53, where `k++` no longer moves. Fixed with a second guard (`MAX_ASKS`); the
  hostile-calendar test now finishes in about two seconds.
- **My first epoch gate was a one-AU tolerance**: the propagator answers in AU and I had written
  "less than 1" thinking metres. Caught by the red run (it measured 3.14 and I read the units).

## Deliberately NOT built, and why

- **Typing a target date** ("time selector" in the strict sense). It needs the inverse of the
  resolver for every calendar a GM can author - the planned calendar work. The step is the half
  that fits today's chrome.
- **Re-stamping the epoch on EVERY element edit.** Only the Mean Anomaly box writes the epoch.
  Editing the distance on a body whose `t0` is not the epoch therefore moves the Mean Anomaly box
  (a new period makes the same stored phase a different anomaly at the epoch). The alternative
  keeps the six boxes independent but makes a freshly placed world swing round its orbit while its
  distance slider is dragged, where today it holds still. Owner's call (question 2).
- **`ConstructGeneralTab`'s mean anomaly** shows and writes a construct's `M0_rad` bare, against
  its own `t0`: the same fault on ships. Another agent owns that file.
- **The Retrograde orbit checkbox** flips the mean motion's sign without re-expressing the phase,
  so a body whose `t0` is not "now" jumps when it is ticked. Pre-existing; left alone.
- **`SettingsModal.applyBucketYearOverride`** shifts the clock by a mean year (plain year plus
  drift), a length rather than a date. Read, not measured, not touched.
- **Two pre-existing things moved unchanged with the spin block**: the track's zone stops are the
  literals 0.8 / 0.5 / 0.25 beside `rotation.ts`'s named constants (two spellings), and a typed day
  length is HARD-CLAMPED at the break-up period, which predates "steer, do not stop".
- **A barycentre's Orbit tab** no longer shows the disabled "Nothing can host this body" re-home
  select; the Re-home button is offered to bodies only.

## Gates (each run with its change removed and seen red)

| Gate | Red confirmation |
|---|---|
| `components/BodyOrbitTab.tilt.spec.ts` (13; UI-C19's four moved, five new for A105) | Old tabs restored: 7 red (no spin block on the Orbit tab, still on Composition, one retrograde). The four non-UI cases and two guards stay green by design. |
| `components/BodyOrbitTab.elements.spec.ts` (5, A106) | Old tab: 5 red. |
| `components/BodyOrbitTab.epoch.spec.ts` (9, PHY-48) | Epoch read/write switched off, ids kept: 5 red - twins 3.14 AU apart, box reads 0 where 270 and 180 are right, pair partner keeps its old epoch. Three are guards that pass either way (no-system fallback, blank box, calendar label) and one tests the helper. |
| `components/BodyOrbitTab.plane.spec.ts` (7) | Decision forced to "system": 4 red. Every case also requires the hint to agree with `satelliteTiltRad`. |
| `components/Starmap.highlightNote.spec.ts` (7) | Old starmap: 5 red. Counts are absolute and cross-checked against the number of `.hl-dim` systems. |
| `tags/mapHighlights.spec.ts` (+4, `describeHighlightRef`) | Function given `TagFinder`'s old logic: 2 red (chip and marker disagree on a recoloured faction). |
| `temporal/step.spec.ts` (19) | Month as 30 days and year as the plain year: 10 red. The hang above was the guard test's red. |
| `components/TimeControls.step.spec.ts` (8) | Old pill: 8 red. |

Also run green after the last change: `system/idempotence.test.ts`, `system/eclipses.spec.ts`,
`physics/worldPositions.spec.ts`, `physics/pairPhase.spec.ts`, `system/reparent.spec.ts`,
`physics/lagrange.spec.ts`, all of `src/lib/tags/` and `src/lib/temporal/`, `Starmap.spec.ts`,
`TimeControls.spec.ts`, `BodyBasicsTab.units.spec.ts`, `BodyOrbitTab.reach.spec.ts` - 40 files,
491 tests. `npm run build`: green, once. `svelte-check` reports 1,503 errors project-wide, as it
did before; the one in `BodySpinEditor` is the moved `orbital_period_days` line, and the rest in
files this stream edited are on lines it did not write. The new `.ts` files and specs are clean.

## Eyeball list for the owner (about five minutes)

1. Open a planet. **Composition** tab: mass, radius, density, composition, Type / Image and
   nothing about spin. **Orbit** tab: elements, then Inclination and Long. of Asc. Node with no
   checkbox to tick, then "Spin and shape" with Day Length (coloured track, padlock notch),
   Retrograde spin, Axial Tilt. Check the number boxes are the size they were on Composition.
2. Open a small asteroid or comet: Lobes appears under Spin and shape. Open a star with a
   companion and a barycentre: Orbit tab, no spin block.
3. A new world from the type picker: Axial Tilt should read its inferred number, never a 90
   nobody chose; clear the number box and it should read "not set".
4. Foot of the Orbit tab: "Re-home..." opens the host picker; re-home a moon and it stays put.
5. Open Luna, then an inner Saturn moon: the hint under the node field should name the system
   plane for Luna and Saturn's equator, with Saturn's tilt, for the inner moon.
6. Place two planets at the same star at different clock times; type the same six elements into
   both: they should sit on top of each other. The Mean Anomaly hint should show a date.
7. Starmap: highlight a tag from Find by tag. Top-right note reads "Highlighting: ...", a count,
   Clear and X. Highlight something nothing carries: the whole map fades and the note says so.
   Check the note does not block dragging the map, and that Clear and X take a click.
8. Time transport: press ⇥. Step 1 month from the 31st of a month; step back. Check the pill
   still fits on a phone-width window with the extra button, and the panel is not clipped.
9. Find by tag tray and Player Views > highlights: chip colours and names should match the
   badges on the map.

## Changelog lines (GM-facing)

- A world's spin controls - day length, retrograde spin, lobes and axial tilt - have moved from
  the Composition tab to the Orbit tab, where there is room for them.
- Inclination and the longitude of the ascending node are always shown now; the "Show Advanced
  Orbital Elements" tick box is gone. Re-homing a body is behind a "Re-home..." button at the foot.
- The Orbit tab says which plane an inclination is measured from: the parent's equator for a
  moon, the system plane for everything else.
- Fixed: two worlds given identical orbital elements at different times ended up in different
  places. The mean anomaly is now shown and typed at the system's reference epoch, and says so.
- The starmap now says when a tag highlight is fading systems - what is highlighted, how many
  systems have faded - with a Clear. It used to fade the whole map without a word when the
  highlighted tag was on no system at all.
- The time transport can step by an exact amount: so many of the calendar's own seconds, minutes,
  hours, days, months or years, forwards or back. One month from the 31st lands on the month's
  last day.
- A highlighted tag is named and coloured the same way in Find by tag, Player Views and on the map.

## For the coordinator

- Board: A105 and A106 are built. Items 3 to 6 have no row; they need ids from you.
- `GettingStarted.md` was updated in commit `29c6cb8` (the step, the Orbit tab, the highlight
  note), so no documentation-debt line is owed for those three. `/physics` and the tag docs are
  not affected: no physics term, tag or threshold changed.
- Files shared with other streams: none of the four Stream Z files or the construct files were
  edited. `orbits.ts` gained one function and `satelliteFrame.ts` one; `holo/scene.ts` imports
  `satelliteTiltRad`, whose behaviour is unchanged.
- Commit trailers carry a `Claude-Session` line after the co-author line (the harness asks for it).

## Open questions for the owner

1. **Re-home.** A106 brought the elements out; re-home kept a "Re-home..." button of its own at
   the foot of the Orbit tab, still not first level. Keep it, or flatten it too?
2. **Mean anomaly.** (a) Is the system's reference epoch the right instant to quote it at, rather
   than "now"? (b) Should every element edit re-stamp the orbit to that epoch (six independent
   boxes, but a just-placed world swings while its distance is dragged), or only the Mean Anomaly
   box as built?
3. **The step.** It seeks without pausing, like the jog. Should a step pause a running clock?
   And is stepping enough of a "time selector", or do you want typing a date as part of the
   calendar work?
4. **Clear on the starmap note** clears the highlight on the players' maps as well, because the
   selection is one shared thing. Right, or should it only mute the GM's view?
5. **Reference plane.** Named, not changed: a moon's inclination is measured from its parent's
   equator. If you want moons quoted to the system plane by default, that is a product change.
