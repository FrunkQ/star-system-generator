# Liquids overhaul — pressure-phase physics, richer tags, honest data

Status: AGREED design (2026-07-17), building in stages L1-L4.
Trigger: user report of liquid water on a too-hot world (water's critical point:
647 K / 218 bar — beyond it no pressure keeps it liquid).

## 1. Audit findings

The phase core is half right: `src/lib/physics/liquids.ts` is the single phase-truth,
water is not special-cased, and `deriveFluidLayers` correctly refuses a surface-liquid
layer when the solvent is frozen or boiled at the surface temperature. The LAYERS are
honest. The leaks are around them:

1. **Stale hydrosphere data is displayed and classified raw.** `body.hydrosphere.
   coverage/composition` (GM-set or generated) is never re-interpreted when temperature
   changes. BodyTechnicalDetails prints "70% water" with no phase check; the
   classification feature vector feeds `hydrosphere.coverage` unconditioned and **21
   fingerprint bands** key on it (ocean, hycean, swamp, earth-like, earth-analogue...) —
   so a 450 K world still classifies and displays as an ocean world.
2. **No pressure physics.** `LiquidDef` has fixed 1-atm meltK/boilK only. Missing:
   - triple point: below it (water ~0.006 bar) no liquid at ANY temperature —
     currently an airless 300 K world with hydrosphere data derives a legitimate-looking
     ocean (the permissive error);
   - pressure-raised boiling: a 100-bar ocean world is honestly liquid to ~580 K —
     we wrongly boil it at 373 K (the conservative error);
   - critical point: above criticalK the substance is SUPERCRITICAL — neither sea nor
     sky — currently unrepresentable. The `carbon-dioxide` def is a knowing 1-bar lie
     (liquid CO2 needs > 5.1 bar).
3. **Undefined-liquid fallback bug**: `phaseAt` returns 'liquid' at ANY temperature for
   unknown names — and the layer/cloud models USE undefined names: `salty-water`
   (subsurface), `sulfur-dioxide`, `sodium`, `potassium`, `molten-glass` (clouds),
   `liquid-iron`, `metallic-hydrogen`, `superionic-water` (interiors). Naming drift:
   `liquid-iron` vs the defined `molten-iron`.
4. **Demo data**: example-map Europa derives NO subsurface ocean (tidal heat sits under
   the `activeHeating` > 1 K gate) while Titan does. Europa is the poster child.

## 2. Direction (agreed)

Data must LOOK right; grow a richer tag array (visual / RPG / science value) with every
tag explained in the Newton apple; classification tweaked as tags land (fingerprints can
zero in easier); sweep in subsurface oceans, steam worlds, vapour states covering EVERY
liquid; rework the (very simplistic) hydrosphere editor.

## 3. L1 — physics + definitions

`LiquidDef` gains optional pressure data (defaults in constants, rulepack-overridable):

```ts
tripleBar?: number;    // below this pressure: no liquid phase (sublimation regime)
criticalK?: number;    // above this temperature: supercritical whatever the pressure
criticalBar?: number;  // pressure at the critical point (upper end of the boil curve)
```

Phase logic becomes pressure-aware — `phaseAt(name, tempK, pressureBar?)`:

- `pressureBar` omitted → legacy 1-atm behaviour (all existing call sites keep working);
- `P < tripleBar` → 'solid' below meltK, else 'gas' (sublimation — no liquid band);
- boil point at P: log-linear interpolation between (tripleBar → meltK) and
  (criticalBar → criticalK), anchored through (1 bar → boilK). Two-segment
  Clausius-Clapeyron-shaped fit: game-grade, monotonic, hits the three known points;
- `T > criticalK && P > criticalBar` → new phase `'supercritical'`;
  `T > criticalK && P <= criticalBar` → 'gas'.
- `Phase` union gains `'supercritical'`; `isLiquidAt` stays liquid-only.

New/updated defs (values: CRC-ish, rounded):
- water: triple 0.006, critical 647 K / 218 bar. CO2: triple 5.1 bar (the def stops
  lying), critical 304 K / 73 bar. Methane 0.117 bar / 191 K / 46 bar; ethane /
  nitrogen / ammonia analogous.
- **sulfur** (NEW — Io): melt 388 K, boil 718 K, amber #c9a227, conductive false,
  biosolvent none, family 'molten'.
- **salty-water / brine** (NEW def for the name layers already use): melt ~252 K
  (freezing-point depression), boil 375 K, conductive TRUE.
- Defs for the interior/cloud fluids so nothing hits the assume-liquid fallback:
  sulfur-dioxide, sodium, potassium, molten-glass, metallic-hydrogen, superionic-water.
  Interior naming unified on `molten-iron` (drop `liquid-iron`).
- Optional exotics (Alex to veto/approve): HCN (260-299 K, alternative biosolvent),
  liquid CO (68-82 K), mercury (234-630 K).

Tests: Earth 1 bar (liquid); Venus 92 bar / 737 K (supercritical-then-gas — never
liquid); Mars 0.006 bar (sublimation, no liquid at 280 K); 100-bar ocean world at
450 K (LIQUID — the new capability); Europa surface (frozen); Titan methane (liquid,
unchanged); Io sulfur (liquid at 400+ K).

## 4. L2 — derivation, tags, classification

- `deriveFluidLayers` takes surface pressure; surface-liquid gate uses
  `phaseAt(solvent, T, P)`.
- New derived tags (all traced in the Newton apple — each gets a physicsTrace entry
  stating the inputs that fired it):
  - `hydrosphere/frozen` — coverage exists but the solvent is solid at (T, P): ice sheet;
  - `hydrosphere/boiled-off` — coverage recorded but solvent is gas: desiccated world,
    the data records what WAS;
  - `climate/steam-world` — boiled solvent + substantial pressure: thick vapour
    envelope (visual: white-out limb glow);
  - `structure/supercritical-envelope` — solvent beyond its critical point under
    crushing pressure;
  - `activity/sublimating` — ices at P < tripleBar warming near meltK: outgassing —
    comet comas/tails key off this (ties to asteroid/comet class);
  - `activity/cryovolcanism` — icy makeup + active interior heat + frozen surface
    (Enceladus): plumes;
  - `hydrosphere/brine` — conductive salty ocean (feeds magnetism induction story).
- Classification: feature vector gains `hydrosphere.liquidCoverage` = coverage when
  surface phase is 'liquid', else 0; the 21 coverage-keyed fingerprints move to it
  (hot/airless worlds stop classifying as oceans). Steam-world base fingerprint added
  (Teq/pressure/steam tag bands + range metadata so it appears in the type picker).
  Sublimating/cryovolcanism feed modifier fingerprints where useful.
- Fix the Europa case: lower the subsurface `activeHeating` tidal gate (or scale by
  body size) so canonical Europa-grade heating qualifies; adjust the example map if
  its tidalHeatK is simply too low.

## 5. L3 — hydrosphere editor rework

BodyHydrosphereTab becomes phase-aware:
- per-solvent live phase chip at current (T, P) with the REASON when not liquid
  ("boils at 373 K here — needs > 4 bar", "below the triple point — sublimates");
- warning banner when the CURRENT composition is no longer liquid (with the phase it
  actually is), instead of silently keeping stale data;
- unified layer view: surface / subsurface / cloud decks listed with their sources
  (which are derived vs GM-set);
- selector offers liquids valid ANYWHERE in the temperature range at current pressure
  (as now, but pressure-aware), with dim "reachable if pressure changes" hints.

## 6. L4 — honest displays

Panels, reports and the Field Guide label stale coverage by its actual phase:
"70% water (frozen)" / "(boiled off)" / "(supercritical)". The raw numbers stay —
the data records the world's inventory — but the phase is never misrepresented.

## 7. Cross-section cutaway (related visual, same sprint)

The interior cross-section becomes a CUTAWAY: the body's rendered surface (PlanetDisc,
so oceans / ice caps / craters / irregular asteroids show) with a wedge cut out
revealing the interior layers (which include the derived subsurface ocean and surface
film). One picture answers both "what does it look like?" and "what is it made of?".

Gate per stage: `cd` into the repo then `npx vitest run` + `npm run build`.
