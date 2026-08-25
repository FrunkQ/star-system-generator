# Biosphere, surface light and the substellar chain — retirement notes

Session F68 (biosphere toolkit), retired 2026-08-18 at v2.1.877-beta. Territory: the biosphere
toolset (G19/B45), the spectral light chain end to end (surfaceSpectrum, pigments, imageUnderLight,
the Surface view and the balloon view), visibility, space weathering, the brown-dwarf dual-role
chain (B73/B74 and the substellar ramp), the apparentColor retirement state, and the cloud-layering
finding B83.

These are the things that are NOT visible from the code: what cost real time, what had to be
discovered, what a successor should not re-derive. Rules that belong in the engine map are there
(PHY-24 to PHY-27 and PHY-18, RENDER-B3/B4, TAG-22, DATA-R21/R22) and are pointed at, not repeated. Design
lives in `docs/dev/biosphere-and-surface-light.md`; the physics page (`/physics#surface-light`,
`#standing-on-it`, `#biosphere`, `#colour`) is the user-facing working.

## 1. The one invariant that every fault this session reduced to

**A hardcoded stand-in sitting beside a derivation will disagree with it, and the disagreement will
present as "looks slightly wrong", never as an error.** Eight instances in three days, every one
found by a human eyeballing a picture:

- the palette carried appearance (`hex`) but not material (`rawHex`), so the Surface view lit
  everything twice (RENDER-B4);
- space weathering lived in the texture renderer, so Luna's chip was brown while its globe was grey;
- the sky had a colour but no brightness, so Mercury had Earth's blue overhead;
- home's sky was two hand-picked blues next to a derived one, so EARTH had a seam;
- the viewer rebuilt spectra at `luminositySolar: 1`, so an M dwarf read 10000% of an Earth noon;
- Stefan-Boltzmann was written twice, in two unit conventions, and agreed only by luck;
- potassium's cloud colour was its FLAME, so the balloon showed violet over a gold globe;
- the deck scan asked "saturated at the surface?" against the deepest pressure, not the anchor.

When the next one appears it will look like a tuning problem. It is not. Find the second copy.

## 2. The spectral chain is ONE derivation with many consumers — and consumers must not re-derive

`deriveSurfaceSpectrum` is the authority. It returns `{ summary, curves }`; only the summary rides
on the body (three 113-sample arrays per body was 10k lines on the Sol fixture). Consumers that need
the curve rebuild it from the summary — and **must rescale to `summary.totalTopWm2`**, because the
rebuild is linear in flux and the summary already encodes L/d². Around Sol a hardcoded L=1 is exactly
right, which is why that fault survived a week.

Consumers in order: pigments → vegetation → apparentColor (ground lit by `surfaceLight`, cloud tops
by `topLight`; the distinction is what un-pinked Venus) → visibility (same `rayleighTau550`, turned
sideways, PHY-18) → the Surface view → the balloon probe. None of them may compute a column density,
a Rayleigh law or a Stefan-Boltzmann of its own. `physics/luminosity.ts` exists because two did.

## 3. Scattered light is not absorbed light — and it was, for a week

`exp(-τ)` treats a scattered photon as destroyed. At Earth's τ=0.1 it costs nothing; at Venus's τ=16
it says one part in ten million reaches the ground and the model reported "a night under a full
moon" on a world where you can see your hands. Scattering now has its own accumulator and the
two-stream transmittance `1/(1+3τ/4)`. Venus went 1-in-250 → 13% of an Earth noon (Venera's figure).
**The same mistake is still in the CLOUD term** — a deck's veil is extinction, not scattering — and
it shows as too much total ENERGY reaching Venus's ground, not as wrong visible light. B62/B77's
remit.

## 4. Chromatic adaptation is bounded, per cone — or every dim world goes pink

Plain von Kries divides by the illuminant's cone response, which is unbounded: Venus leaves the S
cones 0.5% of their home share and the maths asked for a 134× gain. Amplifying a starved channel
recovers noise, not colour — white came back `#ffcdc8`. PHY-27. The shot-noise weight that used to
live in `confusability()` is GONE from there; it is in the adaptation now and must not come back, or
the two multiply and every dim world reads as more confusing than it is.

Below ~1e-3 of daylight, colour drains to grey (rods carry none) — `coneFraction` — and that same
curve gates `confusability`, so the figures and the picture cannot disagree.

## 5. Brightness and colour are separate questions, and the UI has a checkbox for each

"once your eyes adjust" is adaptation (what colour). "midday brightness" is level (how dark).
`spectrumToHex` NORMALISES, so unticked it shows the colour of whatever light exists however faint —
under Jupiter's ammonia deck a trillionth of the light is still ochre. Ticked, it is black, because
it is. Both views (ground and balloon) honour this split; if one stops, that is the fault. The
cloudscape's glow term is deliberately NOT dimmed by the brightness switch — emission is not daylight.

## 6. The Surface view is three layers, and which layer a thing belongs to is physics

RENDER-B4. Reflectances (ground, water, plants, blocks, balloons) go through the operator.
Light (sky, star) is painted in final colour. Emission and airlight (lava, windows, glow, haze
veils) are composited after. Home's sky must come from the SAME airlight function as every other
world's — pinned by `homeSky.spec.ts`, because Earth-against-Earth is the control case.

`relightImage` skips alpha-0 pixels, which is what lets the material layer be an offscreen canvas
composited over the sky with no mask. Do not "optimise" that skip away.

## 7. The balloon view — how deep, why it stops, and what it reads past the tag

The dry adiabat continued from the 1 bar ANCHOR matches Galileo's Jupiter descent to a few percent
(319 K at 10 bar vs ~330 measured; ~400 at 22 vs ~425). `GIANT_DEPTH_LIMIT_BAR = 100`; past it the
wet adiabat, density-grown opacity and emission are unmodelled and unchecked. The probe reaches
`deriveCloudDecks(body, pack, deepProfile)` DIRECTLY because the tag drops `baseBar` and
`opticalDepth` (B77) — a pure view may read physics, but this is the third consumer to need those
fields. `atmosphereProfile` now has `pAnchorBar` (where `tSurfK` belongs) distinct from `pSurfBar`
(deepest level); **every saturation-at-the-reading test must use the anchor**. The deck scan did not,
and on a deep profile it drained every deck.

A hot giant's air is a LIGHT SOURCE: 831 K at 1 bar, 1600 K at 10 on a 0.7 AU giant. `glowShare`
on each level, colour from `bdGlowColour` — the same ramp as brown dwarfs because it is the same
physics. Jupiter stays dark to the bottom. "Inside a deck" is `pBar > base × 0.55` — a GUESS,
because a deck has a base and a τ but no top. That is B83's first job.

The bundled Jupiter carries NO H₂O (H₂, He, CH₄, NH₃, H₂S), so its deep scan finds no water deck.
Catalogue fact. `depthView.spec` proves the mechanism by adding Galileo's 0.05% and finding it.

## 8. Space weathering — what "mass" really is, and the guard that made it silently zero

`spaceWeathering()` in cloudDecks.ts is the ONE derivation; apparentColor mutes by it, the texture
saturation passes are gone. It is a FLUENCE (dose × surface age, saturating), not the dose alone
(B65: the rate said a freshly resurfaced world was as weathered as a 4 Gyr one). Desaturate ONLY —
albedo is the renderer's job; darkening here double-counts and gives charcoal.

**`body.makeup` is undefined on every catalogue body** — the fractions are DERIVED from mass and
density via `makeupFractions`. Guarding on the raw field switched the whole effect off and Luna came
back byte-identical, a perfect impersonation of a correct no-op. Belts and rings must be refused
outright (they came back 0.285 from fallback defaults applied to bodies carrying neither tag).

## 9. The substellar chain — role is never the test, mass is

DATA-R22. A brown dwarf is filed as a star as often as not; two separate gates
(`roleHint !== 'star'` in the processor, `!isStar` in planetAppearance) excluded exactly the objects
they existed for. Fixed; pinned by `brownDwarfDualRole.spec.ts` (35 M_jup at 1300 K both ways). The
stellar colour table falls through to `bdGlowColour` below 2400 K, which makes the sequence continuous
through mass — and means a body carrying `0 K` would render invisible, so `starColorFromTempK` treats
non-positive as unknown (Sol stores `temperatureK: null`).

The ignite boundary at 80 M_jup is a temperature floor (1900 K, the real M/L overlap) and ONE
Stefan-Boltzmann; the 8 M_jup boundary steps 0 → 6e-8 L☉ and needs nothing. Starspots require a
fusing photosphere and the gate is on MASS, not temperature — the idempotence test caught a
temperature gate reading a value a later pass overwrites.

B74's false flags were NOT the mass bands first: `isSubstellar` was `/star\/(L|T|Y)$/`, anchored at
the END, and every real brown dwarf is classed `star/L7.5`, `star/T6`. DATA-R21. The sibling
`isRemnant` one line below is unanchored and was never affected.

## 10. Tags this territory owns

`biodiversity/*` (pigment, land-cover, settled, ecumenopolis — one clearing pass, TAG-22),
`visibility/<band>` (emitted ONLY when the air gets in the way, so presence means occlusion; band
keys on atmospheric range never on `seeM`, or Earth/Mars/Titan/Venus all read "murky"). Both are in
`tagDefaults.ENGINE_NAMESPACES` and `tagPresentation.TAG_INFO`; `tagConsistency.spec` fails loudly on
an unregistered emission, which is how it should be found.

## 11. Pack data that was wrong for a reason nobody had checked

Potassium `#ee82ee` and sodium `#ffd700` were FLAME-TEST colours; every other condensate is authored
as the cloud LOOKS. Fixed to pale metallic greys. The others (molten-iron `#e8631f`, molten-glass,
sulfur) have NOT been re-checked against the condensate as seen — B83 acceptance test (v).
`star/L,T,Y` carry wide mass bands deliberately (temperature classifies; the L/T temperature bands
OVERLAP because Luhman 16 A is L7.5 at 1305 K and Eps Indi Ba is T1 at 1312 K). `planet/brown-dwarf`
caps at 6400 M_E (~20 M_jup, the core-accretion ceiling) on the owner's ruling; do not widen it back.

## 12. Process, because it cost more than any single fault

- **Measure before reasoning.** Every diagnosis this session that was made from the code alone was
  wrong once (Venus pink ×3, Luna brown, the dust storm figure). The ones made from a number were
  right first time. `_probe.spec.ts`-style throwaway specs that print a table cost two minutes.
- **The Browser pane does not composite unless DISPLAYED.** `screenshot` times out; `javascript_tool`
  + `getImageData` on the canvas works and is stronger evidence anyway. Drive Svelte inputs by
  calling the prototype setter then dispatching `input`, and await two rAFs before reading.
- **Bash heredocs cannot carry apostrophes in single-quoted bodies, even nested.** Use the Write tool.
- **The parallel session pushes every few minutes.** Every push of mine conflicted on `package.json`
  and `changelog.md`. Take THEIR version, bump past it, keep BOTH changelog entries, never edit
  theirs. A fixture diff of classifier scores that I did not touch is THEIR regeneration — revert it,
  do not commit it.
- **Version ≠ commit count.** 665 → 857 this session; most of that is their traffic.

## Known open, in these files

- `physics/depthView.ts` — "inside a deck" is `pBar > base × 0.55`; no deck has a top. B83 (i)–(iii).
- `physics/surfaceSpectrum.ts` cloud block — decks veil as extinction, not scattering; Venus's energy
  budget is too high even though its visible light is now right. B62/B77.
- `physics/depthView.ts` glow — share is sound; absolute brightness is scaled to the host star, not
  radiometric. Right on/off and colours, approximate at 900 K.
- `physics/visibility.ts` — fog is honestly `false` always (needs `baseBar` on the tag); photochemical
  haze is not modelled at all (Titan reads far clearer than its smog); dust load reads a FREQUENCY as
  a LOAD. All stated on `/physics#standing-on-it`.
- `rendering/apparentColor.ts` — B76's remaining half: atmosphere tint, cloud decks, giant chemistry,
  incandescence still filter `colorHex` per RGB channel; per-gas `colorHex` should become DERIVED from
  `absorptionBands`. Ground, ocean, cloud-top LIGHTING are done. Giant deck mixing is "deepest
  heaviest", tuned for Saturn, not derived — B83 (iv).
- `lib/data/liquids.json` — molten-iron / molten-glass / sulfur `colorHex` unchecked as condensates.
- `components/BodyImage.svelte` — the GM-panel layout (pills vs More-information, 3D spin in that box,
  Horizon legibility) was verified numerically, never by my eye; the owner has seen it and it works.
- `SystemProcessor` ignition floor — `syncRadiationFromSB` still lives in the star EDITOR, so a star
  whose mass changes by generation/import/script does not resync luminosity. Inbox has a row.
- Sol XVII-type hot giants: classification and the physics page both say "planet/gas-giant"; the
  Surface view is right about the furnace, the 3D globe's incandescence and the balloon's glow are two
  code paths (`incandescent()` vs `bdGlowColour`) that agree by eye and not by construction.
