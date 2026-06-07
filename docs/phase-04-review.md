# Phase 04 — what to review

A checklist for the "review as a whole" pass. All on `beta`. The two things that unblock your
testing are **Testion** and **/physics** — start there.

## 1. Testion demo/test system  ⭐ (the classification test-bed)
**Load** "Testion" from the examples list (alongside Sol etc.).
- It's built so each of ~55 bodies classifies to a **distinct** planet type once physics runs —
  the classification analogue of the Sol baseline.
- **What to check:** open bodies and confirm the type + image match what the world "is". Coverage
  is **49/57 base types** in one system + ringed/toroidal/ellipsoid modifiers.
- **Known gaps (inherent to one bound, mature system, not bugs):** rogue (unbound), protoplanet
  (needs a young system — conflicts with crater's age), planetesimal/dwarf-planet/mesoplanet
  (size-ambiguous with barren), subsurface-ocean (needs strong tidal heating), hot/ultra-hot-jupiter
  (need close orbits around a *dim* star). Testion is a luminous F star so the cloud-type giants
  separate by temperature.
- **Dev tools:** `node build-testion.cjs` regenerates it; `npx vitest run testion.harness` prints a
  per-body target-vs-actual + coverage report (each body carries a `__target` annotation).

## 2. /physics appendix page  ⭐
**Open** `/physics` (also linked from the About dialog).
- Documents the constants, the temperature/radiation/greenhouse/habitability models, and — per your
  ask — **how classification (fingerprints) and tags are produced**, plus the Sol/Testion fixtures and
  an honest "known fudges" list. Stable anchors (#temperature, #radiation-split, #classification, …).
- **What to check:** is the methodology explained at the right level? Anything missing or wrong?

## 3. Classifier rewrite (per-type fingerprints)
- Each of the ~67 image types is now defined by its **parameter bands** (`classifier.fingerprints` in
  `static/rulepacks/starter-sf/classification.json`), best-fit matched; specific types outrank generic
  catch-alls; modifiers stack. Verified vs Sol: Earth→earth-analogue, Io→sulfur, Jupiter/Saturn→
  ammonia-clouds-gas-giant, Uranus/Neptune→ice-giant, etc.
- **Guardrail:** `classification.audit` fails if a specific type is shadowed by a catch-all.
- **For your eye:** the exotic long-tail bands + the diagnostic-type weights are first-draft tuning.
  **forest/jungle/swamp/ecumenopolis are GM-only** (no biome data) — agree?

## 4. Tags / barycentres / classification layering
- The model is documented in `docs/classification-and-tags.md`. Classification owns the TYPE; tags are
  orthogonal namespaced conditions/history (`origin/ orbit/ atmosphere/ climate/ hazard/ tidal/
  habitability/ stability/`); class-duplicating tags removed.
- Barycentres: classification skips them; `orbitsStar` handles circumbinary planets; a smoke test
  processes the multi-star examples without breaking.

## 5. Phase 04 physics fixes (each its own commit, with tests)
- **04.4** airless-moon radiation (Luna ≈ 500 mSv/yr; the skipped test is retired) + spectral
  photon/particle split by star class.
- **04.1** eccentric-orbit equilibrium temperature (rms-flux distance).
- Sol baseline still green throughout.

## Open questions for you
1. **Moon hydrosphere generation gap** — Europa/Titan only become subsurface-ocean/methane once icy
   moons get hydrospheres in *generation*. How should that be modelled (what fraction of icy moons
   have subsurface oceans; what triggers methane lakes)?
2. **GM-only types** — OK to leave forest/jungle/swamp/ecumenopolis (and arguably carbon) as
   manual-assign rather than auto-classify?
3. **Exotic fingerprint tuning** — any types whose bands look wrong when you browse Testion?

## Still TODO in Phase 04 (not blocking your review)
- Temp/flux exposed as **ranges** in the body panel (the min/max are already computed internally).
- **04.2** mass-luminosity-by-class scaffold · **04.3** Newton-Raphson Lambert · **04.5** n-body
  transit perturbers · **04.7** ⓘ tooltips deep-linking /physics from BodyTechnicalDetails.
