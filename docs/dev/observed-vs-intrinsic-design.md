# Observed vs intrinsic — a star that is not what it looks like

STATUS: DESIGN ONLY, 2026-08-28 ([[G54]]). Nothing is built.

Owner's ask: *"I think it would be cool to have stars on the star map (GM & Player) have an optional
symbol and a change in designation due to local dimming (swarm) and IR emission (dyson sphere) - so
the GM has a choice to show the symbol (effectively show why a G type star look M or has an
anomalous spectra). If the symbol is there the user gets 'both sides of the story - its a G-type star
with a dyson sphere' or if disabled they see an M-type star with anomalous spectra. How plausible.
We want this as a general system for reuse... This will be reused I guess for gas/dust nebulae later
something we should roll in at some point - as visually interesting when charged by a star."*

**Short answer: very plausible, most of the machinery is already in the tree, and there is one
physics correction that makes the fiction better rather than weaker.** The correction is §2.

---

## 1. The idea is TWO independent systems, and separating them is most of the design

They are worth building separately because each is useful without the other, and they have completely
different costs.

| | what it is | reused by | size |
|---|---|---|---|
| **(a) The spectral layer** | something between a star and an eye changes what the eye measures | Dyson structures, nebulae, dust, atmospheres | medium |
| **(b) The disclosure ladder** | the GM chooses how much of the CAUSE a player is told | *everything* — any derived fact with a cause worth withholding | **small** |

**(b) is the genuinely novel part, it is small, and it is the reusable core the ask is really
about.** (a) is a new consumer of a spectral engine this codebase already has.

---

## 2. How plausible — and the correction that improves it

**A Dyson swarm does not make a G star look like an M star, and what it actually does is better.**

Grey attenuation — absorption that is flat across wavelength — reduces a star's *flux* without
changing its *colour*. A swarm of collectors in front of a G2V star leaves the absorption lines
exactly where they were: a spectrum still says G2V. What changes is the brightness, and where the
absorbed energy goes.

So the observable signature of a swarm is not a relabel. It is **three measurements that disagree**:

- **Spectroscopy** says G2V. The lines are untouched.
- **Photometry** says it is far too faint for a G2V at that distance.
- **Infrared** says there is a large excess that no G2V should produce.

**That contradiction is the drama, and it is more interesting than "it looks like an M star."** It is
also the real technosignature astronomers look for. A crew that notices a G-type spectrum attached to
a star four magnitudes too faint, pouring out far-infrared, has *found something* — where a crew told
"it is an M star" has merely been told a fact.

**A NEBULA IS THE OTHER CASE, AND THERE THE OWNER'S ORIGINAL STORY IS EXACTLY RIGHT.** Interstellar
extinction is wavelength-dependent — roughly τ ∝ 1/λ — so dust scatters blue away preferentially and
a star behind it is **reddened as well as dimmed**. A G star behind enough dust genuinely can be
mistaken photometrically for a cooler star, right up until someone takes a spectrum and the lines say
G. *"A G-type star that looks M"* is a nebula story, not a swarm story.

**The two giving DIFFERENT anomalies is a feature.** A GM who learns to read them has two distinct
puzzles rather than one effect with two skins:

| cause | brightness | colour | IR | spectral lines |
|---|---|---|---|---|
| partial swarm | much fainter | **unchanged** | strong excess | unchanged (still G) |
| complete shell | absent in visible | — | the object IS the IR source | none visible |
| dust / nebula | fainter | **reddened** | modest excess | unchanged (still G) |
| genuinely an M star | fainter | red | normal for type | **M lines** |

The last row is the punchline: **the lines are the tell, and they never lie.** That is a real and
teachable piece of astronomy, which is what this product is for.

**The ladder is single-parameter and it is a number the mega-construct design already carries.**
`starOcclusion` (0..1, `mega-constructs-design.md` §4.1) drives the whole of it: 0 is a normal star,
partial is the Tabby's-Star signature, near-total is an optically faint far-IR source, and 1 is a
star that has vanished from the visible sky. **This is not a new subsystem; it is the observable end
of the occlusion hook already identified as that design's highest-value one.**

### 2b. Direction matters for BANDS — owner refinement, 2026-08-28

Owner, arriving at it from the starmap: *"from most directions the star will not be dimmed. But
for those that DO... then yes apply the anomalous badge at star map level."* He is right, and the
split falls out of the geometry the shapes already carry:

- **A full shell or whole-sphere swarm dims every direction equally** — the badge and the apparent
  profile are viewer-independent, as §2 assumed.
- **A band (ringworld, torus, narrow swarm band) dims only observers near its PLANE.** The
  condition is the same one the in-system rule uses (`mega-constructs-design.md` §6): the
  observer's direction from the star must lie within the band's latitude extent
  (`shape()`'s `thetaStartRad`/`thetaLengthRad`). From most of the sky a thin ring occludes
  essentially nothing of its star.

So the APPARENT profile is a function of (star, viewer direction) for bands, and of the star alone
for isotropic occluders. **The starmap has true 3D positions, so the bearing test is one dot
product per star pair** — the badge shows where the viewing system actually sits in the shadowed
zone, which is better play than a global flag: two crews in different systems can honestly
disagree about what that star looks like, and both are right. Where no viewpoint exists (a map
with no chosen home system), fall back to the isotropic answer and say so. Nothing here changes
the data shape in §6 — `starOcclusion` stays one number; the band's extent already travels with
the construct's own record.

---

## 3. What is already in the tree — and the one thing that is not

**`src/lib/physics/spectrum.ts` (484 lines) is a real spectral engine and it is well built.** A
shared wavelength grid, Planck's law, integration, photon counting, and a colour-matching step kept
strictly on the presentation branch. It already exports everything this needs:

- `blackbodySpectrum(tempK, totalWm2)` — the star's intrinsic spectrum
- `spectrumToHex(spec)` — the observed colour, for the starmap
- `radiantPower`, `photonFlux`, `peakNm`, `wienPeakNm`

**Attenuation is therefore a per-element multiply on the shared grid.** `observed[i] = intrinsic[i] ×
transmission[i]`. That is the entire mechanism, and it is the same call for a swarm (flat
transmission), for dust (τ ∝ 1/λ) and for an atmosphere.

Read the file's header before touching it. Two rules govern it and both have already cost this
project something (inbox B45, B54): **the human colour-matching step is the LAST step and belongs
only on the presentation branch**, and photon count rather than radiant power is what a biological
reader wants. An observed-designation feature is squarely on the presentation branch, so
`spectrumToHex` is legitimate here — but the *classification* must be derived from the spectrum, not
from the hex.

**THE ONE THING THAT DOES NOT FIT, and it must not be solved by widening the grid.** The grid is
280–1400 nm, chosen deliberately as the photochemistry window rather than the visible band. A Dyson
shell at 1 AU around a Sun-like star re-radiates at roughly 150 K, whose Wien peak is near
**19,000 nm** — an order of magnitude outside the grid. Extending to 1 mm at 10 nm bins would be
~100,000 samples per spectrum, on every body, on every `process()` pass. That is not affordable and
it would be a bad trade for one feature.

> **THE SPLIT: in-band attenuation on the existing grid; out-of-band re-emission as a SCALAR plus a
> TEMPERATURE.** "N watts at T kelvin, peaking at λ" is everything a designation, an info card or a
> sensor reading needs, and `wienPeakNm` already computes the peak. Nothing needs a spectrum sampled
> where nothing else in the engine looks.

`starClassExplain.ts` is the ONE designation builder, used by the editor tooltip and the physics
page, and its header says why it is one. **The observed designation belongs there, beside the
intrinsic one — not in a second builder.**

---

## 4. The disclosure ladder — the reusable core, and it is nearly free

**The tag system already does two thirds of this.** `tagCategories.ts` carries `secretDefault` (new
instances start redacted) and `playerHidden` (a whole category redacted); `tagLifecycle.ts:242`
`redactTagsForPlayers` is the SINGLE redaction site, deliberately so — `mapHighlights.ts:57` notes
that a secret tag never reaches a player marker precisely because the snapshot already removed it,
and that a second redaction site is how a leak happens.

**What is missing is the middle rung.** Redaction today is binary: a player either sees the tag or
has no idea it exists. The owner's ask needs a third state — *something is here and I am not telling
you what.*

> **THE LADDER, and it is the general system:**
> 1. **`hidden`** — stripped entirely (today's `secret`). The player sees the anomaly and no cause.
>    *"An M-type star with an anomalous spectrum."*
> 2. **`anonymous`** — NEW. The tag's PRESENCE survives redaction; its IDENTITY does not. It renders
>    as a neutral marker. *"Something is obscuring this star."*
> 3. **`open`** — the full tag. *"G2V star, enclosed by a Dyson swarm."*

That is one new rung, one change to `redactTagsForPlayers`, and one neutral marker style. **It is not
a symbol system and nothing new should be built for it** — the "symbol" the owner describes is a tag
with a marker style, and marker styles (`label` / `pin` / `flag`, with per-highlight overrides) are
already the shipped vocabulary (TAG-17/18/20/21).

**And rung 2 is reusable far beyond stars.** Any derived fact whose CAUSE a GM might want to withhold
gets it for free: a world that is habitable for a reason players have not discovered, a construct
whose owner is unknown, a body whose orbit is being maintained by something. **That is the general
system the ask is really asking for**, and it is the cheapest half of this item.

**Redaction must stay a single site.** Whatever `anonymous` becomes, it is computed inside
`redactTagsForPlayers` and nowhere else. Producing an anonymised twin at a second site is exactly the
leak the existing comment warns about.

---

## 5. Nebulae — what is free and what is NOT

The owner expects nebulae to reuse this. **The presentation half reuses completely; the geometry half
does not, and saying so now avoids a promise the design cannot keep.**

**Free:** the transmission-curve mechanism (dust is τ ∝ 1/λ, which is the same multiply), the
observed-vs-intrinsic designation, the disclosure ladder, the map colour.

**Not free, and it is a genuinely harder problem:** a circumstellar structure affects **every**
observer equally — a Dyson swarm is at the star, so there is nothing direction-dependent about it. A
nebula sits **between** an observer and a star, so it dims that star **for observers on one side
only**. That is per-observer, direction-dependent line-of-sight geometry: a volume, a ray, and a
column density. Nothing in the engine does that today.

> **RECOMMENDATION: build the CIRCUMSTELLAR case now and design the data shape so the INTERSTELLAR
> case can be added, but do not scope them together.** Circumstellar is a property of the star. A
> ray-through-a-volume is a starmap-wide computation and its own item.

**The emission half of a nebula is separate again and is the visually interesting one** — *"charged
by a star"* is ionisation: a hot star's ultraviolet output ionises nearby hydrogen, which recombines
and emits at discrete lines (H-alpha at 656 nm is why they are red). That is an EMISSION spectrum on
the same grid, driven by the ionising star's output — and the engine already models a star's ionising
half separately from its brightness (`flareActivity` on the overrides roster exists precisely because
magnetic/ionising output decouples from bolometric luminosity). So the physics input is present. It
is still its own item.

---

## 6. Data shape

Deliberately minimal, and deliberately not owned by mega-constructs — a nebula must be able to
produce one without knowing anything about Dyson swarms.

```ts
/** What one intervening thing does to the light passing it. Composed multiplicatively in order. */
interface LineOfSightEffect {
  sourceId: ID;                 // what causes it — the tag/marker hangs off this
  /** In-band, on GRID_NM: 1 = transparent, 0 = opaque. Flat for a swarm, ∝1/λ for dust. */
  transmission?: Spectrum;
  /** Out-of-band re-emission, NOT a spectrum (§3): total power and the temperature it comes out at. */
  reradiatedW?: number;
  reradiatedTempK?: number;
  /** In-band emission — nebular lines. Absent for anything that only absorbs. */
  emission?: Spectrum;
}
```

On the star, both answers are published side by side, and **which one a surface shows is the
disclosure level, never a separate calculation**:

```ts
intrinsic: { designation: 'G2V', teffK: 5778, colourHex: '#fff4e8' }
observed:  { designation: 'G2V (4.1 mag faint, IR excess)', colourHex: '#ffe9c9',
             cause?: 'Dyson swarm' }   // `cause` present only at disclosure level 3
```

**Both are always computed. Only `cause` is redacted.** That is what makes "both sides of the story"
one object rather than two code paths, and it is what stops a player surface ever having to
re-derive anything — which is where a leak would come from.

---

## 7. Compliance, and why this item fits the house rules unusually well

- **SAY WHOSE.** This is the honesty rule aimed at eyes, one level up: *"is a G star"* versus *"reads
  as an M star from here"*. The whole feature is the distinction between what a thing IS and what an
  observer MEASURES, which is the standing rule made into a mechanism.
- **Physics and data drive tags; tags drive the image.** Occlusion is physics; the observed
  designation and the marker are tags; the map colour reads them. No renderer computes a spectrum.
- **Steer, do not stop.** A GM may author a star as anything and put anything in front of it. The
  engine publishes both readings and never rewrites the authored class.
- **Never assume a human baseline.** `spectrumToHex` is a human retina and belongs only on the
  presentation branch — the file already says so. An "anomalous spectrum" for a species that sees in
  the infrared is a *different* anomaly, and the grid is already wide enough to be honest about that.
- **A physics change is not finished until the explanations follow it** — the physics page and
  `physicsTrace.ts` claim to show the working, and a star whose designation has two answers is
  precisely where a reader will look.

---

## 8. Phasing

1. **The disclosure ladder alone.** The `anonymous` rung in `redactTagsForPlayers`, plus a neutral
   marker. **Useful immediately, on every existing tag, with no spectral work at all.** Do this first
   regardless of what happens to the rest.
2. **Circumstellar attenuation.** `LineOfSightEffect` composed onto the star's spectrum; observed
   colour on both starmaps; `starOcclusion` from the mega-construct work as its first producer.
3. **The observed designation.** Into `starClassExplain.ts` beside the intrinsic one, with the
   three-way disagreement (spectroscopy / photometry / infrared) as the reader-facing text. This is
   the part that earns the feature.
4. **Nebula emission.** Ionisation-driven, on the same grid.
5. **Interstellar geometry.** Ray-through-volume extinction on the starmap. Its own item, and it
   should be scoped on its own.

---

## 9. Relationship to [[G31]]

G31 is the banked "one spectral system" investigation — spectra rather than colours, per-species
visible bands, full EM, absorption feeding radiation and greenhouse. **This item is a concrete,
shippable slice of it**, and it is a good first slice because it needs no new spectral machinery: it
is one multiply on a grid that already exists, and it produces something a GM can see. If G31 is ever
taken up properly, this is the piece to build first and the piece that will tell you whether the
grid's cost model holds.
