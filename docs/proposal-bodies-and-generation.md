# Proposal — atmospheres, planetary makeup & liquids, and generation knobs

Three connected improvements that came out of the classifier/Testion work. This is a proposal
to react to, not a built thing. Current state is summarised so the gaps are concrete.

---

## 1. Atmosphere composition presets

**Today:** 45 composition presets over 30 gases (`atmospheres.json` → `distributions.
atmosphere_composition`); each body's `atmosphere.main` is the *dominant* gas, derived at
generation. The set is rich (Earth-like, Venusian, Titan, hycean, magma-outgassing, hot-jupiter,
SO₂, the Traveller ladder, …).

**Gap:** a few classifier types key on an `atm.main` that **never dominates** any preset:
- `Cl₂`, `F₂`, `PH₃` appear only as *minor tainting* gases (e.g. Traveller-C is N₂-dominant with
  trace Cl₂/F₂), so **chlorine / fluorine / phosphorus** worlds can't be auto-detected.
- `CO`/`CH₄`-dominant (the "carbon" reducing case) is thin — one "CO Dominated (Lava World)" entry.

**Proposal:** add ~6 *dominant-exotic* presets so every defensible type has a representative
atmosphere, and so generation can actually roll them:

| New preset | main | sketch composition | unlocks |
|---|---|---|---|
| Chlorine Haze | Cl₂ | Cl₂ 0.7, N₂ 0.2, HCl 0.1 | planet/chlorine |
| Fluorine (Corrosive) | F₂ | F₂ 0.6, N₂ 0.3, HF 0.1 | planet/fluorine |
| Phosphine Reducing | PH₃ | PH₃ 0.5, H₂ 0.4, CH₄ 0.1 | planet/phosphorus |
| Carbon-rich Reducing | CO | CO 0.6, CH₄ 0.3, H₂ 0.1 | planet/carbon |
| Helium-dominated Envelope | He | He 0.9, H₂ 0.1 | planet/helium (distinct from H₂/He) |
| Ammonia World (dense) | NH₃ | NH₃ 0.6, N₂ 0.3, CH₄ 0.1 | planet/ammonia-planet |

(All gases already exist in `gasPhysics`, so no physics work — just composition entries.)
**Also tag each preset with an `exotic` weight** (or a `rarity` field) so the generator can bias
toward/away from them per the weirdness dial in §3.

---

## 2. Planetary makeup & liquids (the bigger one)

**Today** a body has three "envelopes": `atmosphere` (gas), a *single-layer* `hydrosphere`
`{ coverage, depth_m, composition }` (surface liquid only), and `biosphere`. There is **no
interior/makeup model** — bulk type (iron / silicate / carbon / ice) is only *inferred from
density*. And we compute tidal & radiogenic heat but have nowhere to put a **subsurface ocean**,
so icy moons (Europa/Titan) can't be classified as subsurface-ocean/methane.

### 2a. Interior makeup
Add an explicit `makeup` to the body so composition is a first-class input, not a density guess:

```ts
interface Makeup {            // bulk interior, fractions sum ≈ 1
  metal?: number;             // iron/nickel core
  rock?: number;              // silicates
  ice?: number;               // water/volatile ice
  carbon?: number;            // graphite/diamond
  gas?: number;               // H/He envelope
  // derived: expectedDensity, coreFraction
}
```
- Generation seeds it from the host's metallicity + frost-line (rock-rich inside, ice-rich
  outside; carbon-rich in carbon-enhanced systems — see §3).
- Classification reads it directly (`iron`, `silicate`, `coreless`, `carbon`, `ice` become
  *makeup-driven* instead of density-proxy, which removes the silicate/coreless density-band
  fiddliness we hit building Testion). Density stays a derived sanity-check.

### 2b. Layered liquids (surface + subsurface)
Generalise the hydrosphere from one surface layer to a small **layer stack**, driven by
temperature, pressure and internal heat against each liquid's melt/boil (already in
`liquids.json`):

```ts
interface FluidLayer {
  liquid: string;             // water | ammonia | methane | water-ammonia | sulfuric-acid | magma | nitrogen
  location: 'surface' | 'subsurface' | 'atmospheric';  // ocean / under-ice / clouds
  coverage?: number;          // surface fraction
  depth_m?: number;
  shellThickness_m?: number;  // overlying ice for subsurface
}
interface Hydrosphere { layers: FluidLayer[]; /* back-compat: keep coverage/composition as the surface layer */ }
```
**Model:** for each candidate liquid, compare its melt/boil to the surface T (and a warmer interior
T from tidal + radiogenic heat):
- liquid stable at the surface → **surface ocean** (today's behaviour).
- frozen at surface **but** interior warm enough (tidal/radiogenic) to melt it below an ice shell
  → **subsurface ocean** (Europa, Enceladus, Titan-water).
- a liquid that condenses in the atmosphere → **atmospheric/cloud** layer (sulfuric-acid on Venus,
  ammonia clouds).

This makes **subsurface-ocean / methane / sulfur-acid** classification *physical* (it's why those
were the hard cases), and gives the body panel a richer, truthful "what's wet here" readout.

### 2c. Liquids list tidy
`liquids.json` mixes liquids and an ice ("water-ice" with melt 0). Split into a clean set with
`{ name, label, meltK, boilK, density, role: solvent|cryo|magma }` and let the layer model pick.

> Scope note: 2a/2b touch the body schema + generation + the body panel UI. Suggest doing makeup
> first (unblocks the composition-based types), then layered liquids (unblocks subsurface), each as
> its own pass with the Testion harness as the check.
>
> **Status: §2a makeup DONE.** §2b/2c/2d below incorporate Alex's review (Option A confirmed).

### 2c. Liquids live in the (expanded) Hydrosphere tab — including clouds & deep fluids
The Hydrosphere tab is underused, so the **layer list lives there** (no new tab unless mixed
*makeup* needs the room → then a small "Composition" tab; only if). Layer `location` grows to four:
- **surface** — oceans/seas (today).
- **subsurface** — under-ice oceans (tidal/radiogenic-melted).
- **cloud** (atmospheric liquid/aerosol) — and these are **not cosmetic**: a cloud layer rolls into
  **albedo** (↑ reflectivity → cooler T_eq), **apparent colour** (rendering), and **greenhouse**
  (e.g. sulfuric-acid haze on Venus, water/ammonia decks on giants). So adding a cloud layer feeds
  the temperature + colour pipeline, not just a label.
- **interior (deep, conductive)** — the dynamo source for §2d.

### 2d. Magnetosphere grounded in conductive fluids (replace the arbitrary slider)
Today the magnetic field is a bare `strengthGauss` slider with no physical basis. Ground it: a field
arises from a **convecting, electrically-conductive fluid layer + rotation**. The model gives a
**plausible range** (for the slider default + the generator to roll within), not a hard value, so
hand-set fields (Earth 0.5) still stand.

`B ≈ f(conductive-layer present & convecting, its conductivity, rotation rate, core/layer size)`,
with **induced** fields for moons moving through a host's magnetosphere. Conductive-fluid catalog
(drawn from makeup + interior T/P; from Alex's notes):

| Fluid | Where | Role in magnetism |
|---|---|---|
| Liquid iron (outer core) | Rocky cores (Earth, Mercury) | Classic deep dynamo → strong, dipolar, centred |
| Metallic hydrogen | Gas-giant interiors (Jupiter/Saturn) | Huge conductive shell → very strong dipolar field |
| **Superionic H₂O** (O lattice + free protons) | Uranus/Neptune mantles | High conductivity via proton transport → **shallow, off-centre/non-dipolar** dynamo |
| Ionic/Metallic NH₃ | Ice-giant mantles | Adds to the conductive convecting layer |
| **Polymeric C-N-H fluid** | Deep ice-giant interiors | Dense, stably-stratified, *non-convecting* → **suppresses** deep dynamo, confines it to the outer mantle (explains the ice giants' weird tilted fields) |
| Salty liquid water | Icy-moon subsurface oceans (Europa, Callisto, Enceladus) | **Induced** field when moving through the host planet's rotating magnetosphere |

So: makeup → which conductive layers exist; liquids/temperature → whether they're fluid &
convecting; rotation → dynamo vigour; result → a grounded field magnitude **and geometry**
(dipolar vs tilted/off-centre, intrinsic vs induced). The induced case ties an icy moon's field to
its host — a nice emergent detail. Output also feeds the existing radiation-shielding maths, so the
Sol baseline (Earth ≈ 0.5 G, ~2.3 mSv/yr) must be preserved when grounding it.

**Build order (revised):** §2c layered liquids + clouds→albedo/colour/greenhouse → §2d magnetism
from conductive fluids (range/suggestion, baseline-safe) → §4a makeup Edit control + the expanded
Hydrosphere tab → §4c add-by-viable-type. Magnetism `magnetism.ts` is pure (makeup+rotation+layers
→ B range), unit-tested, and only *suggests* — so it's safe to land before the UI consumes it.

---

## 3. Random generation spruce-up — physical "starting condition" knobs

**Today:** the only user control is the star-type dropdown; everything else is fixed
`generation_parameters` (frost line, migration chance, magnetic-field chance, …). So every system
feels the same. This is **not** the v2 physically-accurate generator — just better knobs on the
existing procedural draws.

**Proposal: a small "Generation Settings" panel** (a few sliders + presets) that bias the existing
random draws. Each maps to real physics intuition:

| Knob | Low → High effect |
|---|---|
| **Metallicity** | metal-poor: fewer/smaller rocky planets, more gas & ice → metal-rich: more terrestrials, iron worlds, carbon worlds |
| **Disk mass** | sparse: a few small worlds → massive: many large planets, more giants, belts |
| **System age** | young: protoplanets, hot, thick primordial H/He, no craters → old: settled orbits, cratered, thin atmospheres, possible WD/NS host |
| **Dynamical history** | calm: ordered near-circular orbits → violent: migration, hot-jupiters, captures, retrograde, eccentric, disrupted/rogue ejecta |
| **Stellar activity** | quiet → flaring: more radiation, more stripped/airless inner worlds, eyeballs round M-dwarfs |
| **Exotic prevalence ("weirdness")** | mundane: Sol-like menagerie → exotic: boosts rare types (lava, carbon, eyeball, ammonia/chlorine atmospheres, puffy/super-puff) via the preset `exotic` weights from §1 |

**How it works:** the knobs scale the existing distribution weights + `generation_parameters`
(e.g. weirdness multiplies exotic-preset weights; dynamical-history raises `planet_migration_chance`
and eccentricity draws; age gates protoplanet vs crater and atmosphere thickness). Same seed +
same knobs = reproducible.

**Presets** to ship as starting points: *Sol-like (calm, mature)*, *Hot-Jupiter Chaos*, *Ancient
& Dead*, *Young & Fiery*, *Exotic Menagerie*, *Metal-poor Dwarf system*.

**UI:** lives next to the existing generate controls (or a "Generation" section in Settings);
persists with the starmap so re-rolls are consistent. The knobs are themselves a `generation_
parameters` profile, so they're rulepack-overridable.

---

## Suggested sequencing
1. **Atmosphere presets (§1)** — small, immediately makes chlorine/fluorine/phosphorus/carbon
   roll-able + classifiable. Low risk.
2. **Interior makeup (§2a)** — first-class composition; de-fiddles the density-based types.
3. **Layered liquids (§2b/2c)** — unlocks subsurface-ocean & cloud liquids physically.
4. **Generation knobs (§3)** — the headline UX win; builds on §1's exotic weights and §2's makeup.

All four are independent enough to land one at a time, each verifiable against Sol + Testion.

---

## 4. Edit UI — makeup, liquids, and the "add by viable type" easy route

How §2/§3 surface in the editor (Alex wants this clear before building). Status: §1 atmospheres
**done**; this section is design for §2.

### 4a. Makeup replaces the density control
Today the "density slider" (`BodyDetailsTab`) actually drives **mass** with a density-style
read-out — it conflates the two. We drop it and make **makeup** the composition control, with
density purely derived. The crux is the mass–radius–makeup relationship; two options:

- **Option A (recommended): user sets Mass + Makeup → Radius & Density derived.** A per-composition
  mass–radius relation gives the radius (an iron world of mass X is small & dense; an ice world is
  large & light). Makeup becomes *the* meaningful control and density falls out — exactly your
  "density is derived". Existing bodies get a makeup inferred once from their current density.
- **Option B: keep Mass + Radius sliders, density derived (as now), makeup a separate descriptor**
  seeded from density but overridable (lets you say "iron" vs "ice" at the same density). Less
  physical; keeps radius as a direct control.

**Recommend A.** The editor then shows: **Mass** (slider) · **Makeup** (new control) · *Radius*
(derived, shown) · *Density* (derived, shown).

**Makeup control:** a compact two-tier widget —
- *Primary makeup* dropdown for the easy path: **Iron · Silicate · Carbon · Icy · Ocean · Gas/Ice-giant** (sets sensible fractions).
- *Fine fractions* (optional expand): metal / rock / carbon / ice / volatile / H-He sliders that normalise to 100%, with a little stacked bar + the derived density/radius updating live.
- Classification reads makeup directly → iron/silicate/coreless/carbon become **makeup-driven**, killing the density-band fiddliness from Testion.

### 4b. Liquids — a layer list
The single hydrosphere control (`BodyHydrosphereTab`) becomes a small **layer list**; each row:
**Location** (Surface · Subsurface · Cloud) · **Liquid** (water / ammonia / methane / water-ammonia
/ sulfuric-acid / magma / nitrogen) · **Coverage / Depth** (+ ice-shell thickness for subsurface).
- The engine **auto-suggests** a subsurface ocean when a surface liquid is frozen but interior heat
  (tidal + radiogenic) melts it under an ice shell — the user can accept/edit. "Add layer" for the rest.
- This is what makes subsurface-ocean / methane-lake / sulfuric-acid-cloud worlds real instead of
  hand-set, and gives the body panel a truthful "what's wet, and where" read-out.

### 4c. "Add by viable type" — the easy route ⭐
The headline UX. When you **add a body at an orbit** (so its distance — hence T_eq, flux, zone — is
known), instead of a blank body you get a dropdown of **types that could plausibly exist there**:

1. Compute the orbit's environment from the host: **T_eq** (luminosity / distance), **radiation
   level**, **zone** (goldilocks / frost-line / roche).
2. **Filter the type list to the viable ones** by intersecting each fingerprint's orbit-determined
   bands with this orbit: T_eq band must overlap (lava only close-in, ice only far out, earth-analogue
   only in the goldilocks zone and only at low radiation), host context excludes nonsense (no
   brown-dwarf as a moon; gas-giant orbits don't offer rocky-only types; etc.).
3. Pick a viable type → **reverse-generate** a randomised body that classifies as it: read the
   fingerprint's bands and roll mass / radius / **makeup** / atmosphere (from the §1 presets) /
   liquids *within* those bands, holding the orbit-fixed T_eq. This is exactly `build-testion.cjs`'s
   logic generalised into a reusable **`generateBodyOfType(class, orbitContext)`** — the classifier
   fingerprints become the single source of truth for *both* recognising and synthesising a type.

Result: "pick a world that **could** live here, get a plausible randomised one" — and because it's
seeded from the same fingerprints, it always classifies back to what you picked. The same filter +
generator also drives the §3 random-generation prevalence (a system roll = many `generateBodyOfType`
calls weighted by the knobs).

> Decision needed before building 4a: **Option A vs B** for mass–radius–makeup. Everything else
> follows from it.
