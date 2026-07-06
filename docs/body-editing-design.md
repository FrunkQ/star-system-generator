# Body Editing Redesign — mass / radius / density / composition (Phase D)

Design proposal for review. **No code until this is signed off** (per the pre-production plan D0 gate).
The goal is to let a GM shape a body's size and composition intuitively — including turning a terrestrial
into a gas giant, which currently doesn't work.

## What we have today (from the codebase)

- **Size editing is one-pin-or-the-other** (`BodyBasicsTab.svelte`, `sizeDriver: 'mass' | 'radius'`): you pin
  one, the other derives from it + the makeup. Gas giants are force-pinned to mass. You cannot set mass AND
  radius independently.
- **The physics already exists** in `src/lib/physics/makeup.ts` and we REUSE it (no new modelling):
  - Grain densities g/cc: `metal 7.9, rock 3.3, carbon 2.3, ice 0.95, gas 0.12`.
  - `bulkDensityFromMakeup(makeup)` — uncompressed, volume-additive.
  - `compressionFactor(mass, makeup)` — gravity squeeze (=1 for gas-dominated), and
    `compressedDensityFromMakeup(mass, makeup)` — the real (measured) density.
  - `radiusReFromMassMakeup(mass, makeup)` — radius from mass+composition (gas-dominated → the gas-giant
    radius model, so radius balloons).
  - `massMeFromRadiusMakeup(radius, makeup)` — mass from radius+composition (bisection).
  - `inferMakeupFromDensity(density)` — composition from a target density (bracketing blend).
- **Composition presets exist** (`MakeupEditor.svelte`): Iron-rich, Rocky, Carbon, Icy, Ocean, Ice giant, Gas
  giant — each already carries a makeup. But they are **mass-gated** (`minMe/maxMe`), so the giant presets are
  hidden until you're already massive — the edit flow is backwards.
- **Density is derived, not stored** (ρ = M / (4/3·π·R³)); shown read-only in a couple of places.
- **Classification re-runs on every edit** but only overwrites `body.classes` when `autoClassify === true`.

## The core constraint (why the "chain" is the right model)

Mass, radius and density are bound by one equation:

```
ρ = M / (4/3 · π · R³)
```

That's **three quantities with only two degrees of freedom** — fix any two and the third is determined. So
three fully-independent sliders is physically impossible; something must give when you move one. The
composition (makeup) is a fourth descriptor that IMPLIES a density (grain densities + gravity compression),
so it must stay consistent with the geometry.

**Model:** the GM directly manipulates any two of {mass, radius, density}; the third is derived; and the
**Interior makeup is slaved to the density** (auto-inferred to match, within the chosen preset's material
palette). The GM can also edit makeup directly — which sets an implied density, and mass then follows.

## The preservation chain (default behaviour)

Priority **Mass › Radius › Density** — when you drag a control, the highest-priority *other* quantity is
held and the lowest is derived. Each behaviour maps to an existing `makeup.ts` function:

| You drag… | Held | Derived | Composition | Reuses |
|---|---|---|---|---|
| **Mass** | makeup (composition) | **Radius** | unchanged | `radiusReFromMassMakeup(mass, makeup)` |
| **Radius** | Mass | **Density** | re-inferred to match new ρ | ρ = M/V, then `inferMakeupFromDensity` |
| **Density** | Radius | **Mass** | re-inferred to match new ρ | `inferMakeupFromDensity` → `massMeFromRadiusMakeup` |
| **Makeup / preset** | Radius | **Mass** | you set it | `massMeFromRadiusMakeup(radius, makeup)` |

This is exactly the behaviour requested: *drag mass → resize without recomposing*; *drag radius → mass held,
density & composition shift*; *edit density or makeup → mass follows*. No three-way clashes because every
edit holds one and derives one.

## The lock (hybrid — the Universe-Sandbox escape hatch)

A small **🔒 lock** on each of Mass, Radius, Density. Locking one **pins** it, so edits derive the other
non-touched quantity instead of following the default chain. This unlocks the cases the chain alone doesn't:

- **Lock Density** = "hold composition": now dragging Radius changes **Mass** (not density) — resize a world
  freely without recomposing it. (The chain's default radius-drag would shift composition; the lock says
  don't.)
- **Lock Mass**: dragging Density (or picking a preset) changes **Radius** instead of mass — "I know the mass
  I want, show me what composition does to its size."
- **Lock Radius**: the default already holds radius for density/makeup edits; locking it also makes a mass
  drag shift density/composition rather than radius.

Default = no locks (the chain). Locks are opt-in for GMs who want explicit control. At most one lock at a
time (locking a second clears the first).

## Composition presets, gated by DENSITY

Keep the seven presets, **add a density band to each**, and gate them by the CURRENT density (a preset is
enabled when today's ρ falls in its band), not by mass. Bands overlap on purpose — at a given density several
compositions are plausible, and all of them light up:

| Preset | Density band (g/cc) | Makeup (existing) |
|---|---|---|
| Iron-rich | 5.0 – 8.0 | metal .70 / rock .30 |
| Rocky | 3.0 – 5.5 | rock .85 / metal .15 |
| Carbon | 2.3 – 4.0 | carbon .50 / rock .50 |
| Ocean | 1.0 – 3.0 | rock .50 / ice .50 |
| Icy | 1.2 – 2.5 | ice .60 / rock .40 |
| Ice giant | 1.0 – 3.5 | gas .70 / ice .30 |
| Gas giant | 0.3 – 1.6 | gas .95 / ice .05 |

Picking a preset sets the makeup → its implied density → the chain derives mass (radius held). Picking a
*giant* preset makes the makeup gas-dominated, which switches the radius model to the gas-giant one — the
radius balloons and (with enough mass) the classifier flips. **This is the fix.**

**Interior makeup is a live control, tied to the density lock** (refined after review). The makeup sliders are
the *composition* — and the composition IS what a locked density freezes. So:

- **Density unlocked** → the makeup sliders are editable and drive the density directly (finer than the single
  density slider). Dragging a component recomputes the implied density and flows to whichever size quantity is
  unlocked — e.g. *radius locked + drag Metal up → density rises → mass rises*; *mass locked + drag Metal up →
  density rises → radius shrinks*. The valid-preset set re-gates as you go.
- **Density locked** → makeup is held (shown read-only), because it defines the frozen density. Now mass ↔
  radius trade off freely without recomposing the world.

So density-lock and composition-lock are the same lock, which keeps the whole model consistent — there is
never a case where the makeup and the density disagree.

## Live type + reclassify on release

Two changes fix the "type won't change" problem:

1. **Show the live classification** the physics WOULD assign, updated as you edit (a cheap classify on the
   working values — the full `systemProcessor.process()` is deferred to pointer-release so dragging stays
   smooth). The GM sees "Terrestrial → **Gas giant**" happen as they cross the bands.
2. **Respect but surface `autoClassify`.** If the GM had hand-picked a type (autoClassify off), show both:
   "Kept: *Ocean world*" and "Physics reads: *Ice giant* — **[Adopt]**". Using the density/preset editor to
   materially recompose re-enables autoClassify by default (with the lock available if they truly want to pin
   a label). This is why editing today silently does nothing — the picked class was sticking.

## Panel layout (top → bottom)

```
┌─ Size & Composition ──────────────────────────────┐
│  Type:  Terrestrial              live | was …      │   ← live classification, updates as you drag
│                                                    │
│  Mass                       [  3.400 ] M⊕          │   ← every value takes a typed number too
│  🔒 [══════════●═══════════════]                   │      (larger, more prominent sliders)
│  Radius                     [  1.500 ] R⊕          │
│  🔒 [════════════●═════════════]                   │
│  Density                    [   5.10 ] g/cc        │   ← lock density = hold composition
│  🔒 [══════●═══════════════════]                   │
│                                                    │
│  Composition preset:                               │
│   [Iron-rich] [Rocky] [Carbon] [Ocean]             │   ← density-gated: valid enabled,
│   [Icy·dim]  [Ice giant·dim]  [Gas giant·dim]      │      out-of-band greyed
│                                                    │
│  Interior makeup      Density 5.10 g/cc · recompose │
│   Metal  [══●═════]  [ 32 ]%                        │   ← editable when density unlocked; each
│   Rock   [══════●═]  [ 68 ]%                        │      row a slider + a typed %. Back-drives
│   Carbon [●═══════]  [  0 ]%                        │      density → mass/radius, re-gates presets.
│   Ice    [●═══════]  [  0 ]%                        │
│   Gas    [●═══════]  [  0 ]%                        │
└────────────────────────────────────────────────────┘
```

Every value (mass, radius, density, and each makeup %) has a **manual number field** beside its slider — type
or drag. The mass/radius/density sliders are enlarged since they're the primary controls. When density is
locked the makeup rows render read-only.

Gas giants no longer get a special locked mode — the same panel, with the density in the gas band and a
gas-dominated makeup, is a gas giant. Stars / belts / rings keep their existing simpler editors (they don't
use the makeup model).

## How it fixes terrestrial → gas giant (walkthrough)

1. Start: a 1 M⊕ rocky world, ρ ≈ 5.5, type *Terrestrial*.
2. Drag **Density** down toward ~1 g/cc → makeup re-infers toward ice/gas; the **Gas giant** and **Ice giant**
   presets light up as ρ enters their bands; live type starts reading *ice giant*.
3. Click **Gas giant** → makeup goes gas-dominated → the gas-giant radius model kicks in, radius balloons; the
   chain derives the mass needed for that radius at this density.
4. Nudge **Mass** up into the giant range if you want a Jupiter rather than a puffy sub-Neptune → live type
   settles on *Gas giant*. Release → full reprocess commits it.

Today step 2–3 is impossible from the size editor (giant presets hidden, radius can't grow, class sticks).

## Build plan (once signed off)

1. Add `densityBand` to the preset table; a `classifyPreview(working)` light classifier for the live readout.
2. Rework `BodyBasicsTab` size section into the three-slider + lock model, all edits routed through the
   existing `makeup.ts` derivations (F-RECLASS: defer the heavy `process()` to pointer-release).
3. Merge the density slider + makeup + presets into one "Size & Composition" panel (absorb `MakeupEditor`).
4. Wire the live-type readout + the autoClassify "Adopt" affordance.
5. Tests: each chain edit holds/derives the right quantity; a density-driven terrestrial→gas-giant transition
   reclassifies; round-trips don't drift.

## Open decisions (for Alex)

- **Chain vs lock default:** confirm the hybrid (default chain + optional single lock). Recommended.
- **Adopt vs auto:** when recomposing materially, auto-re-enable `autoClassify`, or always require the
  explicit "Adopt" click? Recommended: auto-enable, with the lock to pin a label.
- **Density bands:** the table above is a first cut from the classifier ranges — tweak any band.
- **Absorb MakeupEditor** into BodyBasicsTab (one panel), or keep makeup on its own tab and just add the
  density slider + presets there? Recommended: one panel, since density/mass/radius/makeup are one decision.
