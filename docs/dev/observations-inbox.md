# Observations inbox

Raw observations land here as they are noticed, get triaged, and are handed to a worker session as a
grounded prompt. This file is the source of truth between sessions — an item that is only in a chat
transcript is an item that will be lost.

**How to use it.** Add anything to CAPTURED, however rough, without stopping to diagnose. Triage moves an
item into a bucket with a verdict. When a bucket is worth a session, a prompt is written from it and the
items are marked with the version that fixed them.

**Status vocabulary:** `captured` (raw) · `triaged` (understood, not started) · `assigned` (a session has
it) · `fixed vX.Y.Z` · `wont-fix` (with the reason).

Last triage: 2026-07-30, at v2.1.281-beta.

---

## A — UI bugs (self-contained, no physics)

| # | Observation | Status |
|---|---|---|
| A1 | Headers/footers break when the window is resized in the player catalogue view. Screenshot exists. Suspected same class as the earlier HUD re-measure bug: a canvas sized against a stale viewport. | triaged |
| A2 | Player-view construct panel is anaemic — Blip-A shows Type / Orbit distance / Atmosphere, i.e. BODY fields, while the data holds crew, engines, fuel tanks, cargo and delta-v. Constructs need their own block in the document / DocPanel builder. | triaged |

## B — Physics engine (needs someone holding that context)

| # | Observation | Status |
|---|---|---|
| B1 | `albedo.ts` derives its OWN clouds (`CONDENSE_BOIL`, `teqK < boil * 1.6`) while `cloudDecks.ts` is documented as "THE single evaluation". They disagree on Adrian: albedo declares a CO2 deck, the column physics reports none. The crude model is UPSTREAM of everything. **Circular** — albedo → Teq → profile → decks → albedo. | fixed v2.1.282-beta |
| B2 | Greenhouse looks strong: Adrian +337 K from 8 bar CO2, vs Venus +505 K from 92 bar. Checked while fixing B1: **not downstream of it.** Adrian's greenhouse is +336.8 K before AND after — B1 moved the Teq underneath it (246 → 304 K), not the greenhouse term. The ratio is the model's own shape: forcing goes as `log(1 + sqrt(100·pp))`, then the response is `log` again, so partial pressure enters twice-logarithmically and saturates hard (Adrian pp 7.3 → 3.33, Venus pp 88.8 → 4.56, a ratio of 0.73 on 8.7% of the pressure). `broadening = min(1, sqrt(P))` is also pinned at 1 for anything over 1 bar, so it distinguishes nothing above that. Venus is right by calibration; what is untested is the CURVE between 1 and 90 bar. Needs someone to pick anchors other than Venus. | triaged, diagnosed |
| B5 | Mars's surface albedo is 0.154 from rock + metal makeup alone; the measured Bond albedo is 0.25, because Mars is bright with ferric dust and polar caps. Exposed by B1: the bogus CO2 deck had been carrying Mars to 0.236, right for the wrong reason. Costs Mars its real 210 ppm water-ice wisp (it survives to Teq ≈ 214.5 K; Mars now sits at 216.7). Same class: Io 0.153 vs measured 0.63 (SO2 frost), Luna 0.15 vs 0.11, Mercury 0.169 vs 0.088. `deriveOxidation()` already grades the rust but reads `geoActivity.surfaceAgeGyr`, derived AFTER the thermal solve — so this needs the geology derivation moved too, or it reintroduces the one-pass lag v2.1.282 removed. | triaged |
| B3 | Classification keys on EQUILIBRIUM temperature, not surface — a 309 °C runaway greenhouse can be labelled "cold eyeball". | captured |
| B4 | The ice-shell rule (ices float → visible crust) has no temperature gate; it will paint an ice crust on a 582 K world. | captured |

## C — Rendering / appearance

| # | Observation | Status |
|---|---|---|
| C1 | `condensateTint` (cloudDecks.ts ~165) pulls every deck to within 60/255 of white. Right for scattering droplets, wrong for a pigmented suspension — the ceiling is pastel for ANY deck, whatever the data says. Making that constant per-liquid data was built and reverted (v2.1.277 → 279); belongs to whoever holds cloud context. | triaged |
| C2 | `planetAppearance.ts` resolves deck liquids via `liquidDef(species)` with NO rulepack argument, so a campaign's own custom liquids never reach the 3D deck renderer. Worked around by putting `taumoeba-bloom` / `iron-oxide-dust` in the global list. If custom liquids are a real authoring surface, this needs fixing. | triaged |

## D — Content / data

| # | Observation | Status |
|---|---|---|
| D1 | Adrian's green: the physics currently says nothing in its air condenses. Needs the Taumoeba fraction and the bloom's boil point tuned until a deck forms — DATA, not code. Blocked visually by C1 even once it does. | triaged |

## E — Known-not-ours

| # | Observation | Status |
|---|---|---|
| E1 | `src/routes/page.spec.ts` — 4 failures (jsdom cannot fetch a relative URL). Verified failing at 255768a via a detached worktree, so NOT from the v2.1.277 work despite being attributed there. Likely origin `371f649`. | triaged |

---

## Captured, not yet triaged

_(new observations go here — rough is fine)_

---

## Standing rules any worker session must follow

- **Physics and data drive tags; tags drive the image.** Do not add rendering code to make something look a
  particular way. If a look needs a new lever, the lever is rule-pack DATA.
- `tests/fixtures/solar-system-input.json` and `tests/output/solar-system-derived.json` are GENERATED by
  `physics-baseline.test.ts` on every `vitest run`. Never hand-edit; expect churn; last runner wins.
- Commit as **FrunkQ <frunk@frunk.net>**, never ac@epsis.com.
- `npm run build` must be green before any push — svelte-check alone is not enough (runes-mode issues pass
  dev and fail the vite build).
- Bump the patch version every push. `beta` auto-pushes on a green build; production needs explicit approval.
- Stage explicit files, never `git add -A` — parallel sessions share this tree.
- UK English in UI, docs and new code. No emoji in docs. No personal names in shipped files.
