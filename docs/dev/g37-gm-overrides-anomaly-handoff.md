# G37 — Break-physics overrides, the Overrides tab, and the Anomaly tag category

Coordinator design brief, 2026-08-22. Owner-requested, prompted by a real user request (a moon past
the habitable zone internally heated to 1100 K — not tidal, beyond any greenhouse — plus "negative
albedo" curiosity and 70 T terrestrial magnetospheres). Read this whole file before touching code.

## The mantra (the design's one rule)

**Users can author what they like — the program does not STOP them — it warns them it is NOT
right.** This is already the house style for stars ("a star whose numbers break physics is kept and
labelled rather than refused", the welcome list says so) and this workstream extends it to derived
planetary physics. The consequences ARE the product: pin one input, let everything downstream
derive honestly, and let the GM see what falls out.

## What exists (all located — verify lines, they drift)

- **The F-OVR pattern is the spine and is already right.** `src/lib/types.ts:515-529`:
  `body.overrides?` with keys `albedo`, `gasThermalInflation`, `radiogenicHeatK`, `flareActivity`.
  A key PRESENT means the GM pinned it; it is saved, fed into the derivation INSTEAD of the
  computed default (`albedo.ts:180-184` is the model consumer, note "F-OVR"), and reset DELETES the
  key. The trace already says "Manually set (GM override)" for albedo — keep that honesty everywhere.
- **Albedo**: works, listed under GM overrides on the info panel, reset-to-calculated present
  (`BodyTemperatureTab.svelte:33-42` is the editor pattern to copy).
- **Radiogenic** (`overrides.radiogenicHeatK`): works but is NOT listed correctly under the info
  panel's GM overrides — a listing bug, fix in passing.
- **Magnetosphere**: uses its OWN `manual` flag on `magneticField` rather than an `overrides` key
  (`types.ts:156` area). That is two conventions for one concept — the duplication rule applies:
  unify toward `overrides` or document why not, in the same commit.
- **`isManuallyEdited`** was found DEAD by the G28 undo session (`docs/dev/undo-notes.md`). Decide:
  retire it, or it becomes this feature's spine. Do not leave it half-alive.
- "Reset to calculated" already appears in `BodyAtmosphereTab`, `BodyBasicsTab`,
  `BodyTemperatureTab` — the tab move consolidates these, it does not invent them.

## Architecture rules — NON-NEGOTIABLE

1. **An override is authored INPUT, pinned BEFORE the solve — never a post-hoc poke into derived
   output.** `src/lib/system/idempotence.test.ts` enforces process(process(x)) == process(x); an
   override implemented as an output edit breaks it and the test must not be relaxed.
2. **The thermal fixed point is bistable** (bright-condensate trap — see
   `docs/dev/biosphere-and-light-notes.md` and the albedo/cloud unification notes). A direct
   temperature pin must SHORT-CIRCUIT the solve for that body (pin the value, skip the iteration),
   not fight it from inside.
3. **Chase the tags.** Every overridden quantity's tag buckets must read the pinned value — AND any
   OLDER PROXY of it (the case that actually bites; see the standing rule and B28). Say in the row
   which tags were checked.
4. **The explainers must not lie.** `physicsTrace.ts` claims to show the working: every pinned
   input must be named as a GM override at the point of use (albedo already does this). The physics
   page needs a short section on overrides; bank the debt line.
5. **physics → tags → visuals** stands throughout: the override is physics input; the Anomaly tag
   is an AUTHORED tag bound to the override's lifecycle; visuals follow as usual.

## The Overrides tab

A new body-editor tab, **after Tags**. Every override moves there and new ones land there. Each row:
the quantity, its CURRENT value (derived or pinned, visually distinct), the pin control, **Reset to
calculated**, and the Anomaly-tag picker for that override. The Anomaly tag-creation UI is pinned
on this tab (so custom excuses are added in place). Editor chrome per the house conventions;
compact; UK English.

**The info panel's GM Overrides block RETIRES** (owner's lean — confirm, Q3): overrides surface as
Anomaly tags on the body, and the full list is always on the tab.

## The override roster

| override | state | notes |
|---|---|---|
| albedo | exists | EXTEND RANGE: negative albedo = energy amplification (Q2 sets the floor). Below 0 is absurd on purpose — warn, allow |
| radiogenicHeatK | exists | fix the info-panel listing; range already absurd-friendly (1100 K moon must be reachable) |
| gasThermalInflation | exists | moves to the tab unchanged |
| flareActivity | exists (star) | moves to the tab unchanged; stars get the tab too |
| magnetosphere | exists, own flag | unify convention; ADD: a value outside the class-plausible range gets GM-override STATUS (taggable, warned) while staying allowed — 70 T terrestrials are a feature |
| surface temperature | NEW | the "magic slider": pin the surface mean directly (Q5), reset to calculated; bypasses the thermal solve per rule 2; downstream (phases, clouds, tags, classifier, biosphere) derive from the pin |
| density | NEW, Q1 first | the mass/radius/composition circle — see Q1; recommended: pin density, KEEP radius (a hollow planet looks the same size), derive mass; g, escape velocity and barycentres follow honestly |
| atmospheric pressure | NEW | pin pressure a body's gravity could not hold; escape/retention logic respects the pin; tag it |
| surface gravity g | NOT direct (Q8) | recommend: leave g derived — the density pin gives hollow-planet g honestly; a direct g pin would fight mass/radius |

## The Anomaly tag category

A new SYSTEM category **Anomaly**. Seeds (owner trims, Q4): **Unknown Origin, Alien Technology,
Alien Biosphere, Subsurface Structure, Unobtanium, Magic**, plus proposed: **Precursor Engineering,
Exotic Matter, Divine Will, Nanite Ecology, Reality Fault, Experimental Terraforming**. Users add
their own within the interface, as with any category.

- Assignment is **per override** ("click the override to assign a tag as the REASON"); several
  overrides may share one reason. Data shape: the override record carries an optional anomaly tag
  ref — when the override is reset, its tag assignment goes with it (lifecycle-bound; the tag
  definition itself survives in the category).
- Player visibility follows the NORMAL category controls — an anomaly can be a visible mystery
  hook or a GM secret. The existing secret-tag stripping in the player snapshot must cover it
  (verify, do not assume).
- Follow the unified tagging rules (TAG-17, TAG-18 one-pill, TAG-20/21) — read the tagging memory
  notes before building the picker.

## Integration

- **Undo (G28)**: every pin/reset/tag-assign is a labelled step ("Override: Albedo of Callisto").
  Mind the two stores' OPPOSITE write conventions (`undo-notes.md`).
- **Save/share**: overrides + anomaly assignments are authored data — they persist in saves and
  ride bundles. Derived consequences are recomputed as always.
- **Warnings**: out-of-physical-range values get the warn-not-stop affordance in the editor (the
  star editor's "kept and labelled" pattern), never a clamp, never a refusal.

## Owner queries (answered before or during the session — do not guess them)

- **Q1 density circle**: pin density → keep radius, derive mass (recommended)? Or pin any two of
  mass/radius/density and derive the third? Or allow full contradiction, tagged?
- **Q2 ranges**: bounded-absurd sliders with numeric entry beyond the ends (recommended)? Floor
  for negative albedo?
- **Q3**: retire the info-panel GM Overrides block outright (recommended), or keep a one-line
  read-only strip linking to the tab?
- **Q4**: Anomaly seed list — trim/add from the proposal above.
- **Q5**: the direct-temperature pin sets the SURFACE MEAN (recommended). NB this touches the open
  decision in `docs/dev/surface-temperature-notes.md` section 2 (classifier reads the RADIATING
  temperature where 17 fingerprints want the mean) — this feature makes that decision urgent;
  settle both together.
- **Q6**: an override with NO anomaly tag assigned — invisible to players (recommended), or a
  default "Unknown Origin" marker?
- **Q7**: release vehicle — the V3.1 line, or rolling 3.0.x pushes as phases land?
- **Q8**: confirm g stays derived (see roster).

## Build order (one commit per phase, version bump per push, changelog + debt lines per the rules)

1. The Overrides tab: move the four existing overrides + the three scattered reset-to-calculated
   controls; fix the radiogenic listing; unify (or explicitly document) the magnetosphere flag;
   settle `isManuallyEdited`.
2. The Anomaly category + per-override tag binding + player-snapshot verification.
3. New pins: surface temperature (with the solve short-circuit), negative-albedo extension,
   magnetosphere out-of-class status, pressure.
4. Density, once Q1 is answered.
5. Explainers: physicsTrace naming, physics-page section, GettingStarted paragraph, tags-guide
   entry for Anomaly.

Acceptance (thirty-second checks): pin radiogenic heat on a cold moon to reach ~1100 K surface —
classifier, tags, clouds and biosphere all react and the Newton panel names the override; assign
Anomaly/Magic to it, see the tag on the body, reset the override, tag assignment gone; suite green
including idempotence; a saved map round-trips the pins.

## Out of scope

Terraforming-as-process, time-varying anomalies, per-region overrides, and anything that edits
DERIVED fields in place. The importers do not learn about overrides in this pass (imported saves
that carry them round-trip untouched via the normal unknown-key path — verify).
