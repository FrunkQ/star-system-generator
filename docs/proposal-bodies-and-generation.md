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
