# Surface light and the biosphere toolset

The V3 slice of the biosphere feature: one surface spectrum, a ranked pigment set, a weighted draw,
coverage per morphology, and the tint that reaches the renderers. Inbox items [[G19]], [[B45]],
[[B53]], [[B54]] and [[G23]]; shipped v2.1.652-beta.

Nothing here is a summary of the code. It records the decisions, the orderings and the things that
would be expensive to work out again.

## The chain, and the order it has to run in

```
star temperature + luminosity + distance
        -> top-of-atmosphere spectrum          physics/surfaceSpectrum.ts
        -> Rayleigh + per-gas bands + cloud decks
        -> SURFACE SPECTRUM (body.surfaceSpectrum)
              |                                    \
              |  photon counts                      \  colour matching (LAST step)
              v                                      v
        pigment scoring        ->  ranked set    surface light colour, and every swatch
        physics/pigments.ts        + a draw
              |
              v
        morphology layers      ->  body.vegetation
        physics/vegetation.ts
              |
              v
        apparent colour, the SVG disc, the 3D scene, the Bio tab, the Newton panel
```

It runs in `SystemProcessor.processClassification`, after the cloud decks (they are the filter) and
**before** `deriveApparentColorParts` (it consumes the tint). Nothing below it writes anything it
reads, which is what [[PHY-1]] and `idempotence.test.ts` are enforcing.

## Four rules that were paid for before this shipped

1. **Use the surface spectrum, not the star's.** Plants see the light that reaches the ground.
   Keying on the star is what every reference chart does and it is the fault [[B45]] exists to
   correct. Under a thick or hazy sky the two differ materially.

2. **Never weight available light by human vision.** The original sketch measured "available light"
   with Rec. 709 luma, which weights green at 0.7152 because *our* retinas are green-sensitive. Every
   score in `pigments.ts` reads photon counts. The human colour-matching step lives at the bottom of
   `spectrum.ts` under a hard divider and is only ever called on the presentation branch.

3. **No argmax over available energy.** Earth falsifies it: the Sun peaks in the green and
   chlorophyll reflects green. Three explanations compete (path dependence, photoprotection,
   steady-flow optimisation) and the model scores three pressures at once rather than picking one.

4. **A ranked set, never a winner.** Several pigments are viable around most stars. The dominant is
   a weighted draw over the scored set, seeded on the body id per [[DATA-G1]]. That contingency is
   the model. V4 replaces the draw with a history and the scored set is unchanged.

## What makes the pigment model work, and what breaks it

**Capture saturates.** `sufficiency = 1 - exp(-absorbed / saturationFlux)`. This is the load-bearing
line. An unsaturated capture term IS the naive maximiser, and it puts melanin on top everywhere. With
saturation, the regime decides: under a dim sky nothing reaches saturation, capture still
discriminates, and the broadband absorber wins — black vegetation, arrived at rather than asserted.
Under a generous sky everything worth considering saturates and the other two pressures decide. That
reproduces the owner's own four-rung pigment ladder as a consequence of one term instead of four
thresholds.

**The pressures multiply, they do not add.** A weighted sum keeps every term discriminating where it
has stopped meaning anything, and the three sit on incomparable scales so whichever varies most wins
by accident. A product lets protection go to 1 when there is no overload and steadiness go to 1 when
absorption follows what is available. The weights are exponents: how sharply each bites.

**Capture reads the PIGMENT's absorption; colour reads the pigment PLUS the tissue.** The tissue
floor (water, cell walls) absorbs but does not feed the photosystem. Folding it into the scoring
drowns every pigment-specific difference in a term they all share and the ranking collapses to
"whichever absorbs least". Keeping them apart is what makes the damage term able to tell a blue
absorber from a red one.

**The damage term is spectral.** Thermalisation above the reaction centre's red limit, plus a harder
term above the bond-breaking threshold. A flat penalty on absorbing a lot is just anti-capture.

**Steadiness is normalised on the PHOTON-WEIGHTED MEAN slope**, not the maximum. The maximum sits in
the far tail where there is no light, so max-normalisation made every pigment score near zero and the
term did nothing at all.

## Where the anchor stops

Around a G star this model ranks carotenes, then pheophytin, then chlorophyll, all within about 20%
of each other, with melanin last. **Chlorophyll is not forced to first place and must not be.** Sol
is a calibration anchor, not a target; the anchor's job is to catch a wildly wrong answer, and "black
vegetation under a Sun-like star" is the wrong answer it rules out. Tuning constants until one world
comes out exactly right, at the cost of the general law, is the move the standing rules forbid.

`pigments.spec.ts` asserts what the physics has to earn — melanin is not top, chlorophyll is in the
leading group and reads green — and deliberately does not assert a rank.

## The morphology record, and why it has no branches

One uniform record per morphology in `src/lib/data/morphologies.json`, overridable per pack. Every
difference lives in the fields:

| morphology | tints | pigmentDriven | light | what that means |
|---|---|---|---|---|
| flora | *empty* | 1 | *empty* | entirely the colour of its pigment; no lights |
| fauna | *empty* | 0 | *empty* | contributes nothing visible from orbit |
| microbial | 4 | 0.5 | *empty* | half pigment, half the ground it grows on |
| fungal | 5 | 0.15 | *empty* | mostly its own colour (lichen runs black to orange) |
| techno | 2 dark | 0 | 0.35–1 | dark by day, lit by night — and it needed no code |

**There is no `if (morphology === ...)` anywhere and there must never be.** A morphology that
contributes no colour has an empty tint list and zero pigment drive; one with no lights has an empty
light range. If a difference cannot be said in these fields, the SCHEMA is short a field — extend it.
`techno` ships in the data as the proof: adding it was a row.

A useful consequence nobody designed: a **chemosynthetic** world gets no pigment, so flora (fully
pigment-driven) paints nothing while a microbial mat (its own tints) still shows. That is the right
answer for life at a vent and it arrives without a branch on `energy_source`.

## Coverage arithmetic, stated because two people will implement it differently

Each layer's coverage is **of the LAND**, not a share of it. The layers stack painter-style in list
order, so 80% microbial + 50% fungal + 60% flora are independent statements and may total well past
100%. What is reported as `visibleCover` is the **union**: `1 - prod(1 - coverage x opacity)`.

## Placement is derived, not decreed

There is no rule saying "skip the poles". `habitableLatitudeBand` walks the latitude profile — the
same decomposition the temperature panel shows — and keeps the band where the temperature holds the
biosphere's **own solvent** liquid. On Earth-like worlds the poles fall out; on hot ones the equator
does; on a methane world it lands somewhere else and nothing in the code knew that was coming.

ONE convention: the band covers `|latitude|` in `[centre - width, centre + width]`, so the whole
globe is centre 45 / width 45 — never centre 0 / width 90.

## The storage decision, and the one that was NOT taken

`Biosphere.morphologies` was `('microbial'|'fungal'|'flora'|'fauna')[]`. It is now
`(string | BiosphereLayer)[]` — the same field, widened, with **one reader** (`biosphereLayers`)
normalising both forms. A legacy bare string means "present, at this morphology's default coverage
scaled by the old global `coverage`", so an existing campaign keeps the extent it was authored with.

A separate `layers` array beside `morphologies` was rejected: two stores of one fact is this
codebase's most recurring fault by its own test.

**[[G19]] recommended making TAGS the authority and dropping `Biosphere.morphologies` entirely. That
was not done, and the reason is [[B52]]'s own test:** *if it can be re-derived on every pass it is a
TAG; if it is an INPUT it is DATA.* A GM setting flora to 60% cannot be re-derived from anything, so
it is data. The `biodiversity/*` tags are derived-only and are never written back, so there is no
bidirectional sync to get wrong — which was the actual trap G19 named. **This is the owner's call to
overturn if he disagrees; the tags would then need a coverage value and a stable order, which is a
tagging-workstream change rather than a physics one.**

## The C2 thread, threaded deliberately

`deriveAppearance(body)` still takes no rulepack, and this feature did not need it to. `body.vegetation`
carries **resolved colours**, written in physics where the pack is in hand — exactly the move
`auroraEmitters` already makes in the same file, for the same reason. A renderer never asks the pack
what a morphology looks like.

That is a thread, not a workaround: the derivation is where the pack belongs and the renderer is a
consumer. **[[C2]] itself is still open** — cloud decks in `planetAppearance.ts:443` still resolve
`liquidDef(d.species)` with no pack, so a campaign's custom liquid still never reaches the 3D deck
renderer. That fix is a different item and is unchanged by this one.

## Pinning a pigment, and why a real world needs it

`biodiversity/pigment` added BY HAND replaces the draw and nothing else — the set is still scored,
the ranking is still shown, the other pigments are still reported viable. Same mechanism a manual
cloud deck already uses.

It exists because **Earth's pigment is a measurement, not a contingent outcome**. The honest way to
say so is to state it, not to tune the model until it guesses right — which would be fitting to the
anchor, the move the standing rules forbid. Left alone, the bundled Sol fixture currently draws
bacteriorhodopsin for Earth, which is a legitimate outcome of a contingent model and the wrong
picture for a world we have actually visited. **Pinning chlorophyll on the bundled Earth is authoring
and is the owner's call.**

## One thing this had to fix on the way in

The host-star lookup used to read `star.temperatureK` directly, and in the baseline fixture a star
has none — `temperatureK` is stripped as derived and nothing puts it back. `photosphereTempK` now
inverts Stefan-Boltzmann on the star's own luminosity and radius instead. **Two other readers still
quietly substitute the Sun in the same situation** ([[B60]] on the board), which means every
equilibrium temperature in that fixture has been computed as though every star were the Sun. It is
invisible there because the only star is.

## The chart vocabulary ([[G23]])

`src/lib/charts/` is a vocabulary, not a set of plots: `plotScale.ts` (one scale implementation),
`PlotAxes.svelte`, `SpectrumChart.svelte`, `ColourSwatch.svelte`, and two composed explorers.

- **A chart is a consumer and never a derivation.** Both explorers call the engine's own functions.
- **SVG, not canvas.** A canvas surface cannot be verified by a session that cannot see the screen
  ([[TAG-19]]/[[E7]]). Everything here reads back through the DOM and hands its numbers to assistive
  technology.
- **Plot the absorbed POWER, not the 0..1 absorptance.** A fraction drawn against an irradiance axis
  fills the frame and reads as "it absorbs nearly everything" whatever the light is doing — [[PHY-2]]'s
  fault in picture form. Plotting what the pigment takes out of the arriving light also makes the
  green gap *visible*: chlorophyll's two humps bracket a valley exactly where the spectrum peaks.
- **The wavelength ribbon reuses `spectrumToHex`** rather than carrying a rainbow table, so there is
  no second authority on what 550 nm looks like.

## Gas optics are AUTHORING, not architecture

`atmospheres.json` gained `rayleigh` (cross-section relative to N2) and `absorptionBands` per gas.
`strength` is **optical depth at band centre per unit of that species' column, in Earth-total-column
units** — so a strong absorber carries a large number precisely because it matters at a tiny mixing
ratio. Calibrated against Earth: water's 940 nm band eats about a quarter of the beam at 0.4%
humidity, its 1380 nm band nearly all of it, O2's 762 A-band about a tenth.

**The per-gas `colorHex` is deliberately NOT read here.** It is a human-RGB value and filtering a
spectrum through one puts the three human primaries back inside the derivation.

## What this model does not do

- Scattering is extinction only; the sky's own glow is not returned to the ground.
- Bands are Gaussians, not line-by-line radiative transfer.
- One column, straight up. No air mass, no zenith angle, no seasons.
- No ozone in the bundled gas set, so Earth's ultraviolet cut is not modelled.
- A single pigment per organism. Real photosystems run antenna complexes funnelling into a reaction
  centre, which is part of why broad absorption is less punished in life than it is here.

## V4 boundary

V4 is: competing populations, which morphology takes *which* pigment, biosphere ageing, and colours
changing over time. Coverage per layer plus an order is already the shape those need — an epoch sets
the coverages and scrubbing time changes a world's colour with no new machinery. `v4-scope.md` has
the full life model. **Do not start it here.**
