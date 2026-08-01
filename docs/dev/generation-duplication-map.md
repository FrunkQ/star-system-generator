# Generation: the duplication map (read before touching generation)

**Status: reference, not a plan. The tidy-up itself is scoped for V2.3+ and is deliberately NOT
started.** This document exists so that the next person — human or agent — does not spend a session
rediscovering the same wall. It records what is duplicated, which copy wins, and what is safe to
change before the tidy-up happens.

Written 2026-08-01 during the bucket-B physics session, which hit this wall twice (inbox B9a, B12).

## The short version

There is no single "create a body" path and no single "generate a system" path. There are **two
system generators**, **three body-creation routes**, and **five places that invent a magnetic
field**. Most of them are LIVE — this is not dead code waiting to be deleted, it is parallel code
that has drifted. Any change to generation has to be made in every copy, and the usual failure is
that it gets made in one.

## 1. Two system generators, both live

| entry | file | reached from |
|---|---|---|
| `generateSystem` | `generation/system.ts` | `SystemView.svelte:1161` (the in-system Generate button), `routes/+page.svelte:849` |
| `generateSystemFromConfig` | `generation/generateFromConfig.ts` | `GenerationWizard.svelte:170` |

They are not versions of each other. The wizard path accepts explicit star seeds (HR diagram /
preset), an age that evolves the stars, knobs, and a naming strategy; the legacy path rolls
everything from a seed. They share `_generatePlanetaryBody` and the processor, and almost nothing
else. Neither can be deleted without moving features across.

**The B9a bug was exactly this**: the legacy path read `mag_gauss` from the rule pack; the wizard
path set no field at all, so every star the wizard built kept a placeholder zero. One line existed
in one copy. Fixed by extracting `starFieldFromPack` (`generation/star.ts`) and calling it from
both — the *only* piece of this that has been unified so far.

## 2. Three body-creation routes

| route | where | notes |
|---|---|---|
| `bodyFactory.createBody` | `generation/star.ts:67`, `planet.ts:64/87/285`, `setupStars.ts:61`, `generateFromConfig.ts:108`, `traveller/importer.ts:836` | the intended one |
| inline object literal | `SystemView.svelte:~440` (manual "add a body") | **bypasses the factory entirely** |
| `generateBodyOfType` | `generation/generateBodyOfType.ts` | returns a `Partial<CelestialBody>` merged onto a factory body |

Plus the importers (`import/ubox/convert.ts`, `import/spaceengine/convert.ts`) and
`physics/accrete-adapter.ts`, which build their own field sets.

**Consequence, and it is not hypothetical:** the B9a change to `BodyFactory` — removing the
placeholder zeros — does not reach bodies added through `SystemView`, because that route never
touches the factory. Anyone verifying that fix through the "add a body" button would conclude it
had not worked.

## 3. The magnetic field: five sites, and the processor discards most of them

| site | what it does |
|---|---|
| `generation/star.ts` | draws from the pack's `mag_gauss` band for the class |
| `generation/generateFromConfig.ts:123` | same, via `starFieldFromPack` (added 2026-08-01) |
| `generation/planet.ts:171-176` | `terrestrial_magnetic_field_chance` die-roll, or a pack band |
| `generation/generateBodyOfType.ts:280` | bare die-roll: `isGiant ? 4 + rng()*20 : rng()*1.5` |
| `SystemView.svelte:483/491/499` | three more inline die-rolls |

**For planets and moons, every one of those is thrown away.** `SystemProcessor.ts:793` overwrites
`magneticField` from `deriveMagnetism` unless the field carries `manual: true`, and no generator
sets `manual`. The rolls survive only on stars, which the classification pass skips.

**They are not harmless, though, and this is the trap.** `processEnvironment` (pass 2) READS
`body.magneticField` for atmospheric escape (`:446`) and for radiation shielding
(`physics/radiation.ts:115`); the overwrite happens in pass 3. So a die-rolled number materially
shapes a generated world's atmosphere and radiation dose on its first pass and is then replaced.
That is inbox **B13** (`process()` is not idempotent — surface radiation drifts up to 18% on a
second pass, measured on 37 of 156 bodies). Deleting the rolls is not safe on its own: it would
change first-pass behaviour. B13 has to be fixed first, or with it.

## 4. The same shape elsewhere

- **Rotation period** is invented in `planet.ts:205-210`, `generateBodyOfType.ts:270`,
  `SystemView.svelte:477-506` and `accrete-adapter.ts:145`, with different distributions.
- **Axial tilt** is set by `generateFromConfig`'s `applyKnobBias` (stars only, and only when knobs
  are supplied) and by `SystemView`'s manual route (planets, by die-roll). The legacy generator
  sets none at all — inbox **B10**.
- **Radiation** has two independent models: the per-body dose
  (`physics/radiation.ts`, flux + spectral split + flares + shielding) and the Kill/Danger zone
  rings on the GM map (`physics/zones.ts:calculateKillZone`, `0.1 * sqrt(uvFactor * luminosity)`,
  a function of the star alone). Nothing reconciles them.

## 5. What is safe to change before the tidy-up

**Safe:**
- Extracting a shared helper and calling it from every copy, leaving behaviour identical
  (`starFieldFromPack` is the worked example). Keep the RNG draw order intact, or every existing
  seed re-rolls — `starSeedToBody` takes its own stream keyed on the star id for that reason.
- Adding to the rule pack. Constants belong there per
  `docs/dev/architecture-physics-tags-visuals.md`.

**Not safe without the V2.3 workstream:**
- Deleting any generator "because the other one does it" — check which entry point reaches it first.
- Removing the discarded field/rotation rolls: see §3, they are load-bearing on the first pass until
  B13 is fixed.
- Changing `BodyFactory` and assuming it reaches manually-added bodies: it does not (§2).

## 6. Rules for a future session

1. **Search for the OTHER copy before you fix anything here.** Grep the field name across
   `src/lib/generation/`, `src/lib/components/SystemView.svelte` and `src/lib/import/`. If you find
   one site, you have probably not finished looking.
2. **Ask which entry point reaches the code you are changing** — the Generate button, the wizard, the
   manual add, or an importer. They diverge.
3. **A value a generator writes may never be read.** Check whether the processor re-derives it before
   spending effort on the roll.
4. **Diff `tests/output/solar-system-derived.json`.** It will not cover generated systems, so also
   generate a couple of seeds and compare before and after.

## Scope of the V2.3+ tidy-up, when it happens

Roughly, in the order the dependencies allow:

1. Fix **B13** first — the pass-2/pass-3 ordering — so the discarded rolls stop mattering.
2. One body-creation route: fold `SystemView`'s inline literal into `BodyFactory`.
3. One place per derived property that a generator may seed, with the processor's re-derivation as
   the single authority; delete the rolls the processor overwrites.
4. Then, and only then, look at whether the two system generators can converge — probably by making
   the legacy random path construct a config and call the wizard path, rather than merging them.

Related inbox items: **B9** (the bug that exposed §1), **B10**, **B11**, **B13** (the blocker for
§3), and the magnetism structure question in **B12**.
