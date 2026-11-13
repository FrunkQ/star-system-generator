# Stream Z handover - every object carries its own age (G94, G96, B150; G97 is the boundary)

Worktree `wt-z`, branch `feat/wp-z`, 15 commits on top of v3.1.78 (`7d045a3`), all as FrunkQ, nothing pushed.
`npm run build` green (one run, 44 s). No browser was available: every visual claim is in the eyeball list.

## What was built, job by job

| job | commit | what |
|---|---|---|
| 1 | `3a70f5b` | `CelestialBody.formationTimeGyr` (Gyr after the big bang, optional) and `physics/bodyAge.ts`: `ageOf(body, system)`, `setBodyAge`, `clearBodyAge`, `cosmicNowGyr`. Absent means inherit. "Now" is the system's reference epoch `epochT0` on the master clock, never the scrub position. |
| 2a | `d36582c` | Substellar cooling track reads `ageOf(body)`. This is B150's fix. |
| 2b | `6b82771` | A giant's internal heat reads it; the Temperature tab's preview reads the same figure. |
| 2c | `662c794` | Atmospheric escape (opted-in worlds) erodes over the body's own age. |
| 2d | `e5dc973` | A star's flare activity reads the star's own age. Plus a whole-system idempotence gate over aged bodies. |
| 3 | `cac8cb7` | `components/AgeControl.svelte` on the Temperature tab of every planet and moon, labelled Age, with a line underneath saying what age drives on that body (`physics/ageDrives.ts`). |
| 4 | `5cfdaa9` | `brownDwarfAgeForTeff` (the cooling track inverted) and "Aim for a temperature" in the Age control: type a temperature, be offered the age. |
| 5 | `6bc5672` | Star tab: for a substellar body the Effective Temperature block is not rendered and the Age control stands in its place. The c0f65f3 stopgap sentence and its three tests are removed. |
| G96 override | `ffca9cb` | `overrides.effectiveTempK` (`appliesTo: ['star']`, new `OverrideDef.offered`), applied by `physics/stellarTempPin.ts`. Star tab block shows "pinned" and is read-only while a pin is set. |
| system age | `73e1cdb` | A System age control at the top of a star's System Info tab. |
| tags | `e062690` | The `age/` family (young, old, ancient, primordial) as deep-time-design.md section 5 defines it; numbers as pack data. |
| docs | `2f844ef` | GettingStarted.md ("How old a thing is", Overrides list), `/physics` page, classification-and-tags.md, deep-time-design.md kept true. |
| type | `06ad116` | `radiationOutput` declared on the body type (it never was). No runtime change. |
| save | `a894c48` | `age/` added to the export strip's engine-owned tag prefixes; the pin's two stash fields declared in `NOT_STRIPPED`; undo says "Age of X". |
| this file | (last) | handover. |

Engine map: PHY-43, PHY-44, PHY-45, UI-C20, UI-C21, OVR-9, each in the commit that needed it. The tag family's
rules sit inside PHY-43's BLAST because no TAG id was reserved; it wants one.

## What was deliberately NOT built, and why

- **A fusing star's Age slider, and removal of its Effective Temperature block** (G96 b). What a star's age
  drives is G97 and needs the owner's word. The override exists, so nothing is lost when the block goes.
- **Any call to `ageStar` from the editor or processor** (G97).
- **The slider's four coloured zones, the composition floor and its detent** (brief jobs 6-7, design section 4).
  Outside the scope I was given. The control has the axis and one mark, the system's formation.
- **The other per-body readers of age**: tidal locking, the surface-age read in the thermal solve, geology, the
  classifier's `age_Gyr` feature, the habitability bonus. Not in the brief's list ("Not all 21"). Listed in PHY-44.
- **The Newton trace** does not name a body's own age. It quotes "System age" in two layers (star spin, geology),
  both of which still read the system's, so it is true; it simply says nothing about age where a switched
  consumer is shown.
- **Pack version** (`0.1.5`) not bumped for the new `deepTime` block; `npm run manifest` not run (not mine).

## Gates, and the red-first run of each

Every gate was run with its change removed and seen red for the stated reason.

| gate | red-first |
|---|---|
| `physics/bodyAge.spec.ts` (9) | `ageOf` always inheriting: 2 red. Inheritor reading a frozen default: 3 red. |
| `system/bodyAge.test.ts` never-stamp (2) | the processor stamping the system's age onto bodies: 6 red across the file. |
| `system/bodyAge.test.ts` cooling (6) | consumer back on the system's age: 5 red, one reading 1173.3 K, the report's own number. Absolute: 1376.93 K at 1 Gyr, 989.70 K at 9 Gyr. |
| same file, internal heat (3) | 2 red. Absolute: +52 K at 4.6 Gyr, +37.28 K at 9.2 Gyr, +455.6 K at 50 Myr. |
| same file, escape (3) | 1 red. Absolute: 0.9611 bar at 1 Gyr, 0.6487 at 9 Gyr. |
| same file, flare (3) | 2 red. Absolute: 0.1258 at 4.6 Gyr, 0.85 at 100 Myr. |
| same file, idempotence over aged bodies (1) | red when the `age/` pass does not clear what it owns. |
| same file, "what the Age control says it drives is what moves" (8) | a false claim: 4 red. A dropped clause: 4 red. |
| same file, `age/` lifecycle (6) | no emit: 4 red. No clear: 3 red. |
| same file, what a save carries (3) | `age/` not stripped on export: 1 red. Stash stripped: 1 red. Formation time treated as derived: 2 red. |
| `physics/ageTags.spec.ts` (13) | inheritors banded: 1 red. Primordial made relative: 2 red. |
| `physics/substellar.spec.ts` inversion (6) | wrong exponent: 3 red, including the round trip across the mass window. |
| `components/AgeControl.spec.ts` (16) | range bound two-way: 3 red. Control off the tab: 2 red. Inherit stamping instead of deleting: 1 red. No cooling block: 5 red. Unreachable age offered: 1 red. Typing sets without asking: 2 red. |
| `components/BodyStarTab.spec.ts` (new 6) | block back on a brown dwarf: 3 red. Block removed for every star: 4 red. Pin not shown: 1 red. |
| `system/stellarTempPin.test.ts` (16) | processor not applying: 4 red. Floor outranking the pin: 1 red. Offered to every star: 2 red. Old formatter: 1 red. |
| `components/SystemInfoTab.spec.ts` (8) | control not writing: 4 red. Clamped to the star's band: 2 red. |
| `undo/describeChange.spec.ts` (+1) | red: "Formation time gyr of Earth". |

Old saves: `idempotence.test.ts` green before and after every processor change. The Sol baseline output is
BYTE-IDENTICAL from the v3.1.78 processor and from this branch on this machine (`cmp`); the committed fixture
differs from both only in last-digit float noise, so it was restored each time and is not in any commit.

## Eyeball list for the owner (nothing here was seen)

1. A brown dwarf filed as a star (the report's T dwarf, or any L/T/Y in the Local Neighbourhood map), Details tab:
   there is NO Effective Temperature box or slider; an Age control is there. Slide left (older): the temperature
   under it falls and the card follows, and it does not snap back. Type 988 into "Aim for a temperature": it
   offers an age; press the button.
2. Same control: does the mark for "system formed" sit under the thumb when the body inherits? It is positioned
   by percentage and a native range thumb is inset by half its width, so it may be a few pixels off.
3. Any planet, Temp tab: the Age control sits between the heat rows and Mean Surface Temperature. Check it in
   both skins and at phone width.
4. Jupiter in Sol: type an age of 0.05. Internal Heat should read about +456 K. "Use the system's age": +52 K.
5. Any star, System Info tab: System age is first, credits below. Change it in a system with a brown dwarf and
   watch the dwarf cool. Then press undo: I do not know whether a system-level edit is recorded as an undo step.
6. A fusing star, Overrides tab: "Effective temperature" is the first row. Pin it; the worlds' temperatures move;
   the star's own tab shows "pinned" and a disabled box. Reset to calculated returns the old temperature.
7. A body given an age older than its system: the Tags tab shows one grey chip, "Old" / "Ancient" / "Primordial",
   with the age as its value. Check it on a player view too; it follows the default tag disclosure.

## Changelog lines

- Every planet, moon and brown dwarf can be given an age of its own. On a planet or moon it is the new Age
  control on the Temp tab; leave it alone and the body is as old as its system.
- A brown dwarf's temperature no longer snaps back, because it no longer has a temperature box: it has an Age
  control in its place. Type a temperature there and you are offered the age that gives it.
- A system's age can be changed after it is made, on any star's System Info tab.
- A star's temperature can be pinned on the Overrides tab, like any other figure.
- Bodies given their own age are tagged Young, Old, Ancient or Primordial.
- A giant's internal heat, a world's lost air and a star's flaring now follow that body's own age.

## Seam note (Explorers hub; no hub document was edited)

New OPTIONAL per-body fields in saves and bundles: `formationTimeGyr` (authored), and `temperature0K` /
`radiationOutput0` (present only while `overrides.effectiveTempK` is). New optional override key
`overrides.effectiveTempK`. New optional rule-pack block `deepTime`. `age/*` tags are derived and are stripped
on export. `BUNDLE_FORMAT` stays 1: `io/bundle.ts` says a new optional field is not a breaking change. A reader
that drops unknown body fields would silently return a body to its system's age.

## For the coordinator

- Likely merge contact: `core/SystemProcessor.ts`, `types.ts`, `physics/overrides.ts`, `BodyStarTab.svelte`,
  `tags/tagDefaults.ts`, `tags/tagPresentation.ts`, `GettingStarted.md`, and the END of `engine-map.md`.
- `overrides.spec.ts` changed an existing expectation: a star is now offered three overrides, not two.
- `formatOverrideValue` printed whole-number figures without trailing zeros ("500 K" as "5 K"); fixed in `ffca9cb`.
- Board rows: B150 can close for substellar bodies. G94 jobs 1-5 and the tag half of 6 are done; the slider
  zones and floor are not. G96 is done except the star block's removal. G97 is untouched.
- svelte-check reports 1482 errors on this branch (the repo is not clean and the build does not type-check).
  None are in `AgeControl.svelte`; those in the other files I touched are on lines that were already there. A
  `tsc` pass over the TypeScript I touched fell from 201 errors to 177 after `06ad116`, with none new.

## Open questions for the owner

1. **G97, seed versus current state. Recommendation: store a SEED.** `ageStar(seed, ageYears)` is not a step, it
   is a function of a zero-age seed and an ABSOLUTE age, so "seed + age, derived every pass" is the only shape
   it fits and is what creation already does. Give a generated star its seed at creation (the seeds are in hand
   in `generateFromConfig`). For a star with no seed, infer one only where `ageStar` can be run backwards
   exactly, which is the main sequence (luminosity and temperature are linear in age there), and mark it
   inferred. A giant or a remnant cannot be inverted (the giant branch is clamped by the Hayashi floor, a white
   dwarf's temperature depends only on its cooling time), so a star with no seed is simply NOT aged and keeps
   its numbers: absent means unchanged, which keeps every old save as it is. The temperature pin already sits
   cleanly on top. Two things that then need his eye: a star crossing into a remnant changes class live, and a
   very low-mass star never leaves the main sequence inside the slider's range.
2. **The four `deepTime` first values** (accretion 0.1 Gyr, generation 0.5 Gyr, ancient at 2 generations,
   primordial before 1 Gyr). I chose them; the reasoning is in deep-time-design.md section 5. One file to change.
3. **Switch the remaining per-body readers of age** (tidal locking, geology and surface age, the classifier
   feature)? Recommended, one commit and one gate each. Until then a 9 Gyr captured world has a 9 Gyr interior
   heat and its system's geology.
4. **Should a moon with no age of its own follow its PLANET's age** when the planet has one? Today everything
   inherits the system's, as G94 says. A captured brown dwarf's moons are therefore dated with the system.
5. **The System Info tab exists on stars only**, so a system with no star cannot reach its age control.
6. **A pinned star temperature outranks the 1,900 K ignition raise.** I read "the physics just uses the actual
   values" as deciding this; an unpinned star is still raised.
7. **A star-filed brown dwarf is told its age drives "how hard it flares"**, because `flareActivity` gives L, T
   and Y classes an age-dependent figure. Should a brown dwarf flare at all?
