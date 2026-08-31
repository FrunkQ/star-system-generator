# Authoring exotics — how to add a non-standard object, and how to extend the system

WHO THIS IS FOR: the next session (human or agent) adding a Soletta, a Shkadov thruster, a
quasi-star, an alien construct — or a new capability the current vocabulary cannot say. It is
deliberately agent-friendly: exact files, exact gates, and the traps by name. Read
`nonstandard-objects-design.md` for WHY the system is shaped this way; this document is HOW.

CURRENT STATE: N1 (declare + parity, v3.0.236). Every type declares five capability axes and a
36-row parity gate pins them to today's behaviour. Consumers still read legacy flags until their
N2 seam flips — the table in §4 says which, and MUST be updated in the same commit as any flip.

## 1. The one rule (engine map DATA-R33)

An exotic is what its record declares. A consumer (renderer, framing, panel, physics chain) reads
the record's capability — never a type key, never `kind`, never a scattered flag. If you find
yourself writing `if (megaType === '...')` or a new boolean on a visual, you are forking the
convention this system exists to end: put the fact on the record and make the consumer generic.

## 2. The map — every file that matters

| File | What lives there |
|---|---|
| `src/lib/constructs/exotics.ts` | THE VOCABULARY: `ExoticCapabilities` (apparentG, flux, render3d, render2d, framing) and the rules for growing it. Read its header first. |
| `src/lib/constructs/megaTypes.ts` | THE REGISTRY (G37 roster): one `MegaTypeDef` per type — params with seeds/bands, pure `derive()` and `shape()`, `requires`/`allowedPlacements`/`explain` (the placement gates), `capabilities`. |
| `src/lib/constructs/exoticsParity.spec.ts` | THE GATE: iterates `MEGA_TYPE_DEFS`, so a new record is gated AUTOMATICALLY the moment it exists. |
| `src/lib/constructs/megaPlacement.ts` | Hard greys / steer notes evaluator (UI-B2). Never add a placement rule anywhere else. |
| `src/lib/constructs/megaGeometry.ts` | The one geometry builder (sphere-section / tether; spheroid honestly declines). |
| `src/lib/constructs/megaPreview.ts` | Picker portraits + the footer summary line (watts multiply happens HERE, presentation-side — B110). |
| `src/lib/physics/starlightOcclusion.ts` | Who shades whom (PHY-36). Reads `derive()`'s published occlusion, keyed on `megaType`. |
| `src/lib/holo/scene.ts` | 3D attach (~2713), per-frame scale/position (~3235), framing `computeBase` (~3411), surface stand-up (~4910). Legacy flags `megaCentred`/`megaTether` live here until N2. |
| `src/lib/components/SystemVisualizer.svelte` | 2D orrery: `isMegaRing` (~797) draws sphere-sections as their own orbit line. Legacy until N2. |
| `src/lib/components/ConstructCrewTab.svelte` | The apparent-g display (station-shaped; its seam flips in N2 with the owner's net-of-host decision). |
| `docs/dev/nonstandard-objects-design.md` | The design: probe, phases N1–N5, the owner's §8/§8b decisions. |

## 3. Recipe: add a new TYPE today

1. **Write the record** in `megaTypes.ts` — copy the nearest sibling. Every field earns its place:
   - `requires`: hard = RELEVANCE (no host feature → greyed, with `explain`'s sentence); steer =
     PLAUSIBILITY (tags and explains, NEVER refuses). `inHabitableZone` must never be hard.
   - `params`: seeds must COHERE at defaults (the Niven ring's default spin gives 1.00 g at its
     default radius); human comfort goes in seeds and output framing, never in derivations.
   - `derive()`/`shape()`: PURE, return data, no THREE/DOM (E7 — this is what makes the maths
     gateable at all). No luminosity computed here, ever (B110): publish FRACTIONS of the host
     star's output and let presentation multiply through the one luminosity function.
   - `capabilities`: declare all five axes. If an axis's honest value doesn't exist yet
     (e.g. `amplifies` before the clamp work), that is a §5 extension, not a stretch of meaning.
2. **Run the gates** — the parity spec covers the new record with zero new code:
   `npx vitest run src/lib/constructs/` — then add type-specific NUMBER anchors to
   `megaDerive.spec.ts` (an external literature figure, checked not fitted — the Earth-tether
   48.5 GPa·cm³/g pattern), seen RED first by breaking the derivation.
3. **Sliders come free**: every param you declared is already an edit row on the Structure tab —
   do NOT build UI for it. **Preview**: if the silhouette is new, add primitives in `megaPreview.ts` (pure data; the spec
   pins proportions).
4. **Pack entry**: a template in the pack's `mega` category naming your `megaType` + params.
   Packs INSTANTIATE ONLY (owner, 2026-08-31) — no capability blocks in pack data, ever.
5. **Full gate cycle**: `npx vitest run` green, `npm run build` green, AND
   `npx svelte-check --threshold error` grepped for every file you touched — the build does NOT
   typecheck and a free variable ships as a runtime throw (RENDER-S46 is the scar).
6. **Write the thirty-second eyeball list** for the owner: the LOOK is his; E7 means no headless
   test ever saw your object drawn.

## 4. The seam table — legacy vs capability (update WITH every flip, same commit)

| Seam | Reads | State | Flags |
|---|---|---|---|
| 3D attach + anchor | `v.exotic.render3d.anchor` (stamped at attach from the record) | **FLIPPED v3.0.237** | `megaCentred`, `megaTether` DELETED |
| Click framing | `v.exotic.framing === 'annulus'`; surface-host still keys on `surfaceLock` for ordinary surface constructs (no record to read) | **FLIPPED v3.0.237** | flag reads gone |
| Labels | clearance reads `render3d.anchor` — a non-'node' exotic clears its MARKER, never its structure span (which hung "Ringworld" a ring-radius into empty sky and "Space Elevator" near its counterweight) | **FLIPPED v3.0.241** — the visibility rule was probed and was never the fault; position was | — |
| 2D structure | `isMegaRing` (family test) | N2 (carries the elevator glyph tweak) | `isMegaRing` |
| Apparent-g panel | station-shaped fields | N2 (carries the owner's net-of-host decision — it CHANGES numbers, his call) | the mirrored `physical_parameters` shims |
| Flux discovery | `derive()` output keyed on `megaType` | N2 tag-outputs flip (emits `mega/shadowed-by`, the owner's ask) | — |
| Menu / panels / LOD / disclosure | single-valued, so NOT declared yet | N5 / phase-5 / N2 / N3 | — |
| Param editor (custom sliders) | `ConstructMegaTab.svelte` renders every declared `MegaParamDef` generically (log sliders, hard-range typed inputs, amber/red band sentences, reset-to-seed); storage is the SPARSE `megaParams` overlay resolved ONLY via `instanceMegaParams`; scene attach and occluder discovery read instance params, so the sliders move temperatures | **SHIPPED v3.0.242** | — |

## 5. Extending the SYSTEM (not just the roster)

- **A new capability VALUE** (e.g. `flux.amplifies: 'target'` doing real work for the Soletta):
  land the declaration, its parity/behaviour rows, and the CONSUMER change in one batch — a value
  nothing consumes is a claim, not a feature (the `secretDefault` lesson, inbox row ~1862). For
  the Soletta specifically: `receivedLuminosityWatts`'s ≤1 clamp must learn the amplify case in
  the same commit, with a red-first gate showing a target receiving MORE than inverse-square.
- **A new AXIS**: only when TWO types disagree on it — otherwise it is a constant wearing a
  capability's name. It must be consumed by `exoticsParity.spec.ts` from the day it exists.
- **A new consumer**: read capabilities from day one; never mint a flag.
- **A new PARAM (custom slider)**: add a `MegaParamDef` to the record — label, unit, hint,
  soft/hard ranges, amber/red bands, a COHERENT seed. Do not build UI: when the param editor
  lands (design §4c) every declared param becomes a slider row for free; until then it already
  drives derive()/shape() at defaults and the picker footer.
- **`spin-section` apparentG** is declared by NO type on purpose — the parity gate THROWS on it,
  so the first station-like record forces whoever adds it to flip the crew-tab seam knowingly.

## 6. The traps roster for this territory (read before, not after)

DATA-R31 (one chrome predicate; never test `kind === 'construct'` in new view code) ·
DATA-R33 (this system's rule) · UI-B2 (hard greys are relevance; steer cannot refuse) ·
RENDER-S2 (a construct contributes no radius — and a CENTRED mega must not double-count) ·
RENDER-S44 (centred on host; drawn radius IS its orbit) · RENDER-S45 (`bodyById` empty during the
build loop — thread parameters) · RENDER-S46 (builds never typecheck; scoped svelte-check on
touched files) · PHY-36 (one who-shades-whom site; time-free band rule) · E7 (the canvas cannot be
verified headlessly — pure data + the owner's eye) · and the standing rules at the foot of
`observations-inbox.md`.
