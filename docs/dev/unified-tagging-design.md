# Unified Tagging — detailed system design & deployment plan

Status: IMPLEMENTATION SPEC — reviewed 2026-08-03, ready to execute (decision log in the
appendix; the 2026-08-03 entry lists 6 pre-execution corrections).
Scope: V2.2.x line, built in a separate worktree branched from `beta` (beta is currently
~v2.1.199-beta; this work continues that numbering — "2.2.0" is a marketing cut, not a
branch point). Hand this document to the coding agent phase by phase (§12).

---

## 1. Why

V2 grew three parallel tagging systems plus a free-form layer:

| System | Lives in | Configured in | Persisted as |
|---|---|---|---|
| Physics-derived tags | `physics/*` + `core/SystemProcessor.ts` emitters, re-derived every process | not configurable | never saved |
| PoI rule tags | `physics/reasonsToVisit.ts` rule engine | Settings → PoI + PoIPackEditor | `poi-packs` + `reasons-to-visit-config` localStorage + starmap-embedded |
| CoI categories | `constructs/coi.ts` | Settings → CoIs + CoIEditor | `coi-categories` localStorage + starmap-embedded |
| Free-form manual tags | `tags/customTags.ts` vocabulary | Body/Construct Tags tab | inside node `tags[]` |

Problems this rewrite removes:

- Two "CORE" definitions (CoI `required:true` six vs PoI `CORE_REASON_CATEGORIES=['resource']`).
- Two pack formats, two export/import/merge paths, two settings sections, two editors.
- Provenance flag soup on `Tag` (`manual`/`coi`/`inherited`/`derived`/`source` in ad-hoc combos).
- **Tag stripping scattered over ~22 call sites with inconsistent rules** (§5 inventory).
  Most physics-namespace clears do NOT spare `manual` tags — which makes the GM-override
  feature (§8) impossible until unified. `importFixup` doesn't spare `manual` either.
- PoI/CoI as *concepts* confuse users. After this rewrite they are gone: "just tags".

## 2. The model in one paragraph

A tag is `{ key: 'namespace/slug', value? }` with one **origin**: `physics` (engine-derived,
wiped + re-derived every process), `rule` (emitted by a user-editable automated rule, wiped +
re-rolled per category), `manual` (GM-added, never stripped; a manual tag in a physics
namespace is an **override**), or `inherited`/`derived` (construct hardware / runtime state).
Tags are organised by **TagCategory** (one schema for everything, §3). Categories marked
`system` cannot be deleted — SSE depends on their slugs — but everything else about them
(tag list, rules, enabled state) stays user-controlled ("System categories are needed for
SSE to operate — you can still edit their tags, the rules that generate them, and switch
them off; you just can't remove them").
Any category or specific tag can be **highlighted** live to render as map markers (§9), and
tags/categories can be **secret/hidden** (player redaction, §10). One store, one pack
format, one settings section ("Tagging"), one lifecycle module (§5).

## 3. Data model

### 3.1 Tag (instance on a node)

```ts
// lib/types.ts — replaces the current flag soup
export interface Tag {
  key: string;                 // 'namespace/slug' (free-form custom keys allowed)
  value?: string;              // e.g. abundance '0.8', aurora strength
  origin: 'physics' | 'rule' | 'authored' | 'manual' | 'inherited' | 'derived';
  source?: string;             // origin==='rule': 'rule:<id>' (kept as today)
  override?: true;             // origin==='manual' && key in a physics namespace
  secret?: true;               // redacted from all player surfaces
}
```

The six origins, and what each means for the lifecycle (§5):

| origin | written by | survives re-process | survives export |
|---|---|---|---|
| `physics` | physics/SystemProcessor emitters | no (re-derived) | no |
| `rule` | automated tagging rules | no (re-rolled) | no |
| `authored` | **generation + importers** — provenance the physics CANNOT re-derive (`origin/migrated`, `origin/captured`, `orbit/retrograde`, `orbit/double`, Traveller UWP-derived tags) | **yes** | **yes** |
| `manual` | GM hand-adds (incl. `override`) | yes | yes |
| `inherited` | construct hardware (drive/refuel) | yes | no (recomputed) |
| `derived` | runtime state (`status/in-transit-*`, `adrift`) | yes | no (recomputed) |

`authored` matters: today those tags survive only by accident (`origin/*` and `orbit/*`
simply aren't in `DERIVED_TAG_PREFIXES`). Making them explicit stops a future namespace
being added to a strip list and silently wiping generated provenance. They are GM-removable
like manual tags, but display under "Generated" rather than "Yours".

Old flags map on load (`sanitizeOnLoad`, §5): `manual:true → 'manual'`;
`inherited → 'inherited'`; `derived → 'derived'`; `source:'rule:*' → 'rule'`; keys in the
generation-provenance set → `'authored'`; anything else namespaced-derived → `'physics'`.
The `coi` and `ns` fields die. Writers write `origin`; readers use lifecycle predicates
(`isManual(t)`, `isEngineOwned(t)`…) — no direct flag sniffing outside `tagLifecycle.ts`.

`CelestialBody.tags` stays the single carrier for bodies AND constructs. Keys do not
change anywhere — zero node-level data migration.

### 3.2 TagCategory

```ts
// lib/tags/tagCategories.ts (new module; single source of truth)
export type TagRole = 'star' | 'planet' | 'moon' | 'belt' | 'ring' | 'construct';

export interface TagCategory {
  id: string;                  // namespace slug: keys are `${id}/${slug}`
  shortName: string;           // chip/context label
  longName: string;            // settings list + editor title
  description?: string;
  color: string;               // chip background
  textColor: string;
  appliesTo: TagRole[];
  system?: true;               // UNDELETABLE only — content + enabled stay user-controlled
  enabled: boolean;            // user choice, incl. on system categories (§3.3)
  playerHidden?: boolean;      // whole category redacted from players
  single?: boolean;            // one tag per object (kept from CoI status/owner/class/drive)
  tags: TagDef[];
  rules: TagRule[];            // schema = today's PoIRule, unchanged condition engine
}

export interface TagDef {
  slug: string;                // full key = `${category.id}/${slug}`
  label: string;
  description?: string;
  secretDefault?: boolean;     // new instances of this tag start secret
  color?: string;              // per-tag colour OVERRIDE — wins over category.color (§9.1)
  textColor?: string;          // optional per-tag text colour
  // Engine data — fixed fields, rendered only on the SYSTEM categories that use them
  // (owner: tardiness · status: readiness, locked · resource: rate). NOT a general
  // user-facing attribute mechanism (decision Q11).
  tardiness?: number; readiness?: number; rate?: number; locked?: boolean;
}
```

**No "Priority Tags" promotion on categories.** (Design change 2026-07-21.) Map
highlighting is a live *selection* of any category and/or any specific tag — see §9. The
only category/tag-level colour concept is: a category has a colour; every tag defaults to
it; any single tag may carry its own `color` that wins. That is enough to give, e.g., a
`faction` category where each faction tag is its own colour.

`TagRule` = today's `PoIRule` (`{ id, tag, category, chance, when: PoIExpr, enabled?,
label?, description?, appliesTo? }`) with `appliesTo` constrained to ⊆ category.appliesTo
(editor ghosts the rest). `PoIExpr`, `POI_FIELDS`, `buildFeatures`, `evalPoI`, and the
seeded per-body roll (`mulberry32(hashStr(id|seed))`, roll always advances) move to
`lib/tags/tagRules.ts` UNCHANGED — the condition engine is explicitly not redesigned.

### 3.3 The SYSTEM set

`system: true` categories after migration: **status, owner, purpose, resource, class,
drive, frontier**. (frontier is SYSTEM because fuel `refuel_tags` reference `frontier/*` —
deleting it would silently break refuelling.) Resources is ONE category (`appliesTo:
[planet, moon, belt, ring, construct]`): on a body it means "available/extractable here",
on a construct "carried" — exactly how the autopilot already reads it. universe, tech,
disposition, science, intrigue migrate as plain user categories (deletable, disableable).

**SYSTEM = undeletable, but still disableable-by-rules.** A wrinkle found in review:
`frontier` is a *user-toggleable* PoI category today (only `resource` is force-enabled —
`reasonsToVisit.ts:177`). Making SYSTEM mean "cannot be disabled" would force-enable
frontier on migration for anyone who deliberately turned it off, silently seeding new
`frontier/*` tags across their starmap. So SYSTEM protects **existence only**:

- SYSTEM categories cannot be **deleted** (that is what protects `refuel_tags` and the
  autopilot slugs from dangling).
- SYSTEM categories CAN be **disabled**, which stops their *rules* running — a user
  choice, exactly as today. Disabling `frontier` or `resource` shows an inline warning
  ("ships refuel using these tags — disabling stops new ones being generated").
- Migration therefore preserves each category's current enabled state verbatim. No
  behaviour change on upgrade.

This also keeps §2's promise consistent: SYSTEM protects the *container*, the user still
owns the content and whether the rules run.

## 4. Stores & persistence

- One writable store `tagCategories` in `lib/tags/tagCategories.ts`, persisted to
  localStorage key **`tag-categories`** (subscribe-write like today's stores).
- `normalizeTagCategories()` replaces `normalizeCoIs` + the PoI CORE forcing: re-adds
  missing SYSTEM categories from defaults (preserving the user's `enabled` state if the
  category was already present), keeps SYSTEM first, re-registers presentation. It does
  NOT force `enabled` — see §3.3.
- **Starmap embed**: saves write one block `tagging: { categories: TagCategory[] }`
  (user-modified categories only, as today's non-default pack rule). Loads accept BOTH the
  new block and the legacy trio `poiPacks`/`reasonsConfig`/`coiCategories` (migrated via
  §11 then deleted from the in-memory object; saves only ever write the new block).
- **Pack file**: one envelope `{ _kind: 'sse-tag-category', _version: 1, category }`
  (per-category save/load from the editor). The old `sse-poi-pack`/`sse-coi-pack` files are
  NOT importable (decision Q9 — hand-convert on request; expect 1–2 users).
- `tagPresentation.ts` registry is fed only from `tagCategories` + the physics
  `NAMESPACE_META` (unchanged); `registerPoiCategories/registerPoiTags` callers collapse to
  one `registerTagCategories`.
- `customTagVocabulary` (starmap-wide manual-tag reuse) unchanged, now keyed on
  `origin==='manual'`.

## 5. tagLifecycle.ts — the ONE strip/redact authority (FORMAL SCOPE)

New module `lib/tags/tagLifecycle.ts`. **After phase A, no file outside this module may
remove tags by provenance or namespace.** A CI grep-gate (regex on `tags = tags.filter` /
`tags.filter(`) enforces it, with an **explicit allowlist** — removing a tag by exact key
in response to a user action is legitimate and stays put:

```
tagLifecycle.ts (the module itself) · *.spec.ts / *.test.ts
tagCategories.ts   — user add/remove + single-select replacement (ex-coi.ts:279/281/310)
autopilotAdapter.ts, customTags.ts — read-only matching/scanning, no removal
```

Any new site outside the allowlist fails CI. (Without the allowlist the gate would flag
the legitimate user-edit ops listed at the end of §5.2.)

### 5.1 API

```ts
// Predicates (the only place origin/flags are interpreted)
isManual(t); isOverride(t); isEngineOwned(t);          // physics|rule
survivesRederive(t);            // authored | manual (incl. override) | inherited | derived

// The four operations
stripForReprocess(tags, nsPrefixes: string[]): Tag[];   // physics emitters: clear ONLY the
                                                        // given namespaces, ALWAYS sparing
                                                        // survivesRederive(t) — overrides live
stripRuleTags(tags, categoryIds: string[]): Tag[];      // rules pass: clear rule-emitted tags
                                                        // of these categories, spare manual
stripForExport(tags): Tag[];                            // KEEPS 'manual' + 'authored' only.
                                                        // NOTE: deliberately NOT
                                                        // survivesRederive() — inherited/
                                                        // derived survive a re-process but
                                                        // are dropped on export (recomputed
                                                        // from hardware/runtime state)
sanitizeOnLoad(tags): Tag[];                            // legacy-shape cleanup (V1 names,
                                                        // LEGACY_DUPLICATE_TAGS, class-as-tag)
                                                        // + old-flag → origin normalisation

// Player redaction (§10)
redactTagsForPlayers(tags, categories): Tag[];          // drops secret tags + playerHidden
                                                        // categories' tags
```

### 5.2 Call-site inventory — every site routed through the module

Line numbers as of v2.1.19x-beta; treat as anchors, not gospel.

**Family A — physics re-derive clears → `stripForReprocess`** (today: unconditional
namespace wipes; after: spare overrides). All in-place `body.tags = body.tags.filter(...)`:

| Site | Namespaces cleared |
|---|---|
| `SystemProcessor.ts:78` | `hazard/flaring` (star) |
| `SystemProcessor.ts:328` | `thermal/self-luminous` |
| `SystemProcessor.ts:406` | `tidal/hotspots` |
| `SystemProcessor.ts:439` | `orbit/tidally-locked`, `orbit/locked-star`, `orbit/locked-planet` |
| `SystemProcessor.ts:466` | `tidal/volcanism`, `tidal/lava-flows` |
| `SystemProcessor.ts:616` | `structure/*`, `climate/polar-ice` (+ neighbours on that line) |
| `SystemProcessor.ts:669` | `feature/polar-vortex` (already spares manual — the model for the rest) |
| `SystemProcessor.ts:679` | `ring/*` |
| `SystemProcessor.ts:715` | `magnetic/*` |
| `SystemProcessor.ts:728` | `shape/*` |
| `SystemProcessor.ts:734` | `aurora/*` |
| `SystemProcessor.ts:742` | `geology/*` |
| `SystemProcessor.ts:771/777` | `surface/age*`, `surface/irradiation*` |
| `SystemProcessor.ts:796` | `volatiles/*` |
| `SystemProcessor.ts:1100` | `habitability/*` |
| `physics/resonance.ts:68` | `resonance/*` |
| `physics/stability.ts:381` | `stability/*`, `fate/*` |
| `physics/atmosphere.ts:189` | gas-physics flat tags (set-based: `gasPhysicsTags`) — gets a set-based variant `stripForReprocessKeys(tags, keys)` |

**Family B — rules-pass clear → `stripRuleTags`**: `reasonsToVisit.ts:336` (category-prefix
clear, already spares manual — semantics preserved, now also spares `origin:'inherited'|'derived'`).

**Family C — load sanitisation → `sanitizeOnLoad`**:
`SystemProcessor.ts:68` (legacy dupes + `isLegacyTag`, spares manual),
`starmapSanitizer.ts:9` (`sanitizeTags`, spares manual),
`importFixup.ts:124` via `isInterferingTag` (**bug: does not spare manual — fixed by this
unification**; a manual/override tag in a derived namespace must survive import).

**Family D — export strip → `stripForExport`**: `importFixup.ts` `stripBody` (tag line
only; the rest of stripBody's non-tag field stripping is untouched) as called from
`fixUpImportedSystem:131`, `stripSystemForExport:150`, `stripStarmapForExport:160` (used by
save at `+page.svelte:1182`).

**Explicitly NOT lifecycle** (manual edit operations & reads, left alone):
`coi.ts:170/279/281/310` (user add/remove + single-select replacement — becomes
`tagCategories.ts` edit ops), `autopilotAdapter.ts:57` (read-only match),
`customTags.ts` (read-only scan).

### 5.2b Tag WRITE sites — the other half of phase A

Making `Tag.origin` **required** means every site that creates a tag must declare it.
There are **~75 write sites across 22 files** (`tags.push(...)` / `tags = [...tags, ...]`):

`core/SystemProcessor.ts` · `physics/{atmosphere,cloudDecks,resonance,stability,surfaceTemperature,accrete-adapter,reasonsToVisit}.ts` ·
`generation/{planet,star,generateFromConfig,spinProvenance}.ts` · `transit/{assist,calculator}.ts` ·
`traveller/importer.ts` · `constructs/coi.ts` · components
`{BodyBasicsTab,BodyOrbitTab,BodyTagsTab,TagListEditor,SystemView,EvolutionTimeline}.svelte`

This roughly doubles phase A's mechanical surface versus the strip inventory alone — but
it is **compiler-enforced**: make `origin` required and `tsc`/`svelte-check` enumerates
every site. Do NOT give `origin` a default value; the point is that the compiler is the
inventory. Mapping is mechanical: physics/generation emitters → `'physics'`, rules pass →
`'rule'`, UI add-forms → `'manual'`, `inheritance.ts` → `'inherited'`, runtime status →
`'derived'`, generation/import provenance → `'authored'` (§3.1).

### 5.3 Test matrix (unit spec `tagLifecycle.spec.ts`)

Every origin (`physics`, `rule`, `authored`, `manual`, `manual+override`, `inherited`,
`derived`, `+secret` variants) × every operation (reprocess-in-namespace,
reprocess-out-of-namespace, rule-clear-in-category, export, load, redact) → asserted
survive/strip. Plus regression:
process→save→load→process round-trip preserves manual + override tags byte-for-byte and
reproduces identical physics/rule tags (seeded).

## 6. Settings → Tagging

Replaces the PoI and CoIs sections (nav label "Tagging"):

- Intro copy explaining the three families; physics tags explained with links to /physics
  and "the Newton panel (apple icon) on any body".
- **Master toggle: "Run automated tagging rules"** — migrated from today's
  `reasonsConfig.enabled` ("Show Point-of-Interest tags", `SettingsModal.svelte:370`).
  This exists today and had no home in the earlier draft. Off = the rules pass is skipped
  entirely (no `origin:'rule'` tags emitted anywhere); physics and manual tags unaffected.
  Persisted alongside `tag-categories`.
- Category list: SYSTEM first (lock glyph = "can't be deleted"; enable toggle is live),
  then user categories — each row: colours swatch, short/long name, applies-to chips, rule
  count, enable toggle, hidden-from-players mark.
- Row actions: edit, delete (ghosted on SYSTEM), save to file; top actions: add category,
  load category from file.
- **Category editor** (one modal, replaces PoIPackEditor + CoIEditor):
  1. short/long name + description
  2. colours (bg/text)
  3. applies-to checkboxes
  4. player visibility (hide whole category)
  5. tag list (add/remove/edit; a per-tag **colour override** swatch — blank = inherit the
     category colour; engine-data columns only on the SYSTEM categories that use them;
     `secretDefault` toggle)
  6. "Edit automated tagging rules…" → existing rule list + condition builder, appliesTo
     ghosted to the category's roles
  7. save/load this category to file

  (No priority-promotion block — map highlighting is chosen live, §9.)
- Deleting a category: confirm dialog states that already-applied tags of that category
  remain on objects as plain manual tags (they are NOT deleted from nodes) but rules stop
  running and presentation falls back to namespace defaults.

## 7. Manual tagging on bodies & constructs (Tags tab)

`BodyTagsTab` + `ConstructCoITab` merge into ONE `TagsTab` (they already share the chip
UI; constructs keep their extra affordances via the category schema — `single`, engine
fields). Changes:

- Category dropdown: Custom · every *enabled* category whose `appliesTo` includes this
  object's role · a "Physics (GM override)" group listing the physics namespaces
  (geology, tidal, climate, aurora, magnetic, shape, structure, surface, volatiles,
  thermal, resonance, stability, orbit, hazard + gas-physics flat set).
- Adding from a physics namespace files `{ origin:'manual', override:true }`; the group
  header reads "GM override · may not respect the physics", with an info link to /physics.
  Overrides feed ALL consumers (visuals, rules via `tag:` features, find-by-tag) exactly
  like the engine-emitted tag — this now works because of §5 Family A.
- "Secret" toggle on the add form + on existing manual chips (eye-slash glyph on chip).
- No category creation here (Settings only); adding a new tag to an existing category
  registers a TagDef on the category (as PoI manual filing does today).
- Groups render: Yours → GM overrides → Generated (`authored` provenance — removable) →
  per-category rule tags (orange lock, provenance tooltip w/ rule + chance, as today) →
  physics (red lock).
- **Grouping now reads `tag.origin`, not the key.** Today `BodyTagsTab` calls
  `tagSource(t.key)` and `tagPresentation.NAMESPACE_META` hard-codes `poi:true` on
  resource/science/frontier/intrigue — that breaks the moment categories are user-defined.
  Replace with origin-based grouping; `NAMESPACE_META` keeps only physics namespace
  colours, and the `poi` flag is deleted.

Newton panel & /physics: add an "Overrides" note per body listing override tags ("manually
added by the GM; not derived from the physics — the physics trace below ignores them"),
and a short /physics section on the mechanism. `physicsTrace.ts` labels override tags with
layer "GM override" instead of attributing them to a physics layer.

## 8. Engine couplings — invariants (must not move)

Slug-for-slug preserved; parity-tested (§13):

- `resource/*` prefix + `value`-as-abundance matching — `autopilotAdapter.ts:41–68`
- fuel `refuel_tags` / engine `drive_tags` (plain string arrays on defs — unchanged)
- `purpose/mining|survey-prospecting|science|research|patrol` leg inference — `AutopilotTab.svelte:92–100`
- `drive/*` ranking + inheritance — `inheritance.ts` (emits `origin:'inherited'` now)
- `status/*` readiness incl. derived `status/in-transit-*`/`adrift` (emit `origin:'derived'`)
- `owner/*` tardiness — `coi.ts:331` → moves to `tagCategories.ts`
- physics namespaces consumed by PlanetDisc/planetAppearance, classification visuals, rule
  conditions (`hasTag`/`hasTagPrefix`)

## 9. Map Highlights (tag markers) — DESIGN CHANGE 2026-07-21

There is **no per-category "Priority" promotion**. Instead the GM makes a live *selection*
of what to surface on the maps, and every selected thing renders as a coloured marker.
This lets the same mechanism serve a formal need (a whole `faction` category, each faction
its own coloured flag) and an informal one (just `frontier/refuelling`, so players can see
where to refuel) with no category setup.

### 9.1 The highlight selection

```ts
// lib/tags/mapHighlights.ts
export interface HighlightRef {
  ref: string;                 // a category id ('faction') OR a full tag key ('frontier/refuelling')
  style?: MarkerStyle;         // optional per-entry override; else the view default
}
export type MarkerStyle = 'label' | 'ring' | 'both' | 'pin' | 'flag';
export type MapHighlights = HighlightRef[];
```

- **Category ref** (`'faction'`): every tag in that category, on any object, renders a
  marker in that tag's resolved colour (`tag.color ?? category.color`) — so factions fan
  out by their own colours automatically. Label text = the tag's label.
- **Specific-tag ref** (`'frontier/refuelling'`): only objects carrying exactly that tag
  render a marker, in the tag's resolved colour.
- Selection is a flat list; a category ref and specific-tag refs can coexist.
- **Colour comes from the tag/category, not the highlight** — that is the whole point of
  the §3.2 colour model. The highlight only decides *what shows* and *what shape*.

### 9.2 Where it is controlled — "Quick overrides"

The selector lives in the **Quick overrides** section of the Player Views modal
(`liveOverrides.ts` / `PlayerViewModal.svelte`) — momentary, rides the `SYNC_PRESET`
broadcast to the player window(s), never saved (matches the existing followGM /
filterBypass / labelsHidden controls). Add:

```ts
// liveOverrides.ts — LiveOverrides gains:
mapHighlights: MapHighlights;   // [] = show nothing highlighted
```

UI: a compact multi-select — search/browse categories and tags (reuse the TagFinder
browser), click to add a chip; each chip shows the resolved colour and a style dropdown.
"Show players refuelling places" = add `frontier/refuelling`. "Show faction control" =
add the `faction` category.

**One live value, applied everywhere (C4 resolved — simplest).** `mapHighlights` is a
single field on `liveOverrides`; the GM's own maps (SystemVisualizer, Starmap, orrery/holo
GM view) and the player window(s) all read the same value. Changing it updates both live —
no separate "push to players" step, exactly like the existing filterBypass / labelsHidden
overrides. What the GM selects is what players see (after redaction, §9.5).

Not saved into presets in this pass (Quick overrides are momentary by design). Persisting
a favourite highlight set is banked (could later live on the preset or as named sets).

### 9.3 Rendering (GM + player)

- **GM surfaces** stay simple: default style `label` (pill under the body name in the
  resolved colour) or `ring` (thin coloured circle round the disc; multiple nest, 2px
  stroke/2px gap, outermost first) or `both`.
- **Player surfaces** may use richer styles per the view skin: `pin` (teardrop + 1–2
  letter monogram), `flag` (leader line + small label). Style resolves per marker as
  `HighlightRef.style ?? viewDefaultStyle`. Legibility without colour is required — pin
  monograms / flag+pill labels always carry text (CRT/mono filters, colour-blind tables).
- Multiple markers on one object fan around its edge in stable order (category order, then
  slug); clutter cap 4 then a "+N" marker (hover/click → full list).
- A body/construct info block (all surfaces) shows the currently-highlighted tags it
  carries as a chip row directly under its name, in the same colours — so the map and the
  panel agree.

### 9.4 Starmap ROLL-UP

A system's star marker shows the union of highlighted tags carried by ANY body/construct
in that system: dedupe by tag key, order category-then-slug, same cap + "+N". (Contested
systems legitimately show multiple factions.) Derived per-system summary computed where
the starmap already aggregates system info; recomputed on process and when `mapHighlights`
changes.

### 9.5 Redaction interplay

Highlights operate on the redacted snapshot for players (§10): a `secret` tag or a
`playerHidden` category never becomes a player-facing marker even if the GM highlights it
(it still shows on the GM's own map). So "highlight the faction category" is safe to leave
on — secret factions simply don't leak.

## 10. Player redaction

`computePlayerSnapshot` (`lib/system/utils.ts:35`) currently passes tags through
untouched. Add one step: for every surviving node,
`node.tags = redactTagsForPlayers(node.tags, categories)` — drops `secret` tags and all
tags of `playerHidden` categories. Every player surface (catalogue, player views, holo,
broadcast, reports) already flows through this snapshot, so redaction is single-point.
GM surfaces show secret tags with an eye-slash glyph. Broadcast schema unchanged (tags
array just gets shorter).

## 11. Migration (one-way, load-time, automatic)

Runs once per storage surface, idempotent (guarded by presence of the new key/block):

1. **localStorage**: if `tag-categories` absent → build from `coi-categories` +
   `poi-packs` + `reasons-to-visit-config`:
   - Each CoI category → TagCategory (`appliesTo: ['construct']`, engine fields kept,
     `single` kept; required six → `system: true`).
   - Each PoI pack category → TagCategory (`appliesTo` = union of its rules' `appliesTo`
     else the PoI default planet/moon/belt; rules attached; **`enabled` copied verbatim
     from `reasons-to-visit-config` — never force-enabled**, §3.3). `resource` PoI
     category MERGES into the SYSTEM resource category (union of tags + rules, appliesTo
     grows body roles); `frontier` → `system: true` (still user-disableable). Multiple
     packs defining the same category id merge rules (pack identity dies — categories are
     the unit now).
   - `reasonsConfig.enabled` (master switch) → the new master "Run automated tagging
     rules" setting (§6).
   - Old keys left in place (harmless) — a later release deletes them.
2. **Starmap file/embed**: on load, legacy `poiPacks`/`reasonsConfig`/`coiCategories`
   blocks → same transform → merged into `tagCategories` (replace-by-id, never delete
   SYSTEM), blocks dropped from the object; saves write only `tagging: {...}`.
3. **Node tags**: `sanitizeOnLoad` normalises flag soup → `origin` (§3.1 mapping). Keys
   untouched.
4. **Autopilot parity**: fixture starmap (ships + resource routes + refuel) asserted to
   resolve identical routes before/after migration (§13).

No cross-beta migration niceties beyond this (dev convention: state can be blown away
between beta patches; this migration exists for the eventual prod cut + live starmap files).

## 12. Deployment plan (phased; each phase = green build + tests + beta patch)

Worktree: `git worktree add -b feature/unified-tagging ../sse-tagging origin/beta`.
Versioning: continue `2.1.2xx-beta` patches per push (semver patch bump each push, terse
CHANGELOG lines during iteration). Merge back into `beta` when phase F lands.

- **A — lifecycle + model (pure refactor, no UI change)**
  `tagLifecycle.ts` + full §5.2 call-site routing; `Tag.origin` + `sanitizeOnLoad`;
  `tagCategories.ts` store + migration (§11) with `coi.ts`/`reasonsToVisit.ts` becoming
  thin shims re-exporting from it (old editors keep working).
  *Accept*: all existing tests green; lifecycle matrix spec; autopilot parity spec;
  round-trip spec; app behaves identically in browser smoke-test.
- **B — Settings "Tagging"**
  New section + master "Run automated tagging rules" toggle + unified category editor
  (incl. the per-tag colour-override swatch and `resolveTagColor(tag, category)` helper —
  it is part of the editor, so it lands here, not C); PoIPackEditor/CoIEditor deleted;
  pack file save/load (`sse-tag-category`); shims from A deleted where now unused.
  *Accept*: create/edit/delete/enable categories incl. rules editing on SYSTEM; SYSTEM
  cannot be deleted but CAN be disabled (with warning on frontier/resource); per-tag
  colour wins over category colour on chips everywhere; save/load category file
  round-trips; master toggle skips the rules pass.
- **C — Tags tab + overrides + secret**
  Merged TagsTab; physics-namespace override adding; secret toggles; "Generated" group for
  `authored` tags; Newton//physics copy + physicsTrace "GM override" layer.
  *Accept*: override survives process/save/load; drives PlanetDisc visuals (e.g. add
  `tidal/volcanism` → vents render); secret glyph on GM chips.
- **D — Map Highlights, GM surfaces**
  `mapHighlights.ts` + selection state on `liveOverrides`; Quick-overrides selector (tag/
  category multi-select reusing TagFinder) + GM-map "Highlights" mirror layer; markers
  (label/ring/both) + fan-out + cap on SystemVisualizer + orrery/holo; starmap roll-up.
  *Accept*: selecting a category highlights all its tags in resolved colours; selecting
  one tag highlights only its bearers; multi-marker fan stable; rings nest; roll-up
  dedupes; cap + "+N" works.
- **E — Player surfaces + redaction**
  Snapshot redaction step; highlight markers ride the broadcast; skinnable marker styles
  (pin/flag per view) on catalogue/player views/holo; highlighted-tag chip row under the
  name; ReportDocument chips; filter interaction.
  *Accept*: secret/playerHidden never present in snapshot JSON (spec on
  computePlayerSnapshot) and never render as a player marker; markers legible in CRT
  filter (manual check); "show players frontier/refuelling" works end-to-end.
- **F — Rename sweep + docs + deletion**
  PoI/CoI terminology removed from ALL UI strings, docs (tags-guide, autopilot-guide,
  README, GettingStarted, Help, /physics), `/poi-reference` → `/tags-reference`; dead code
  deleted (old stores/keys cleanup incl. deleting legacy localStorage keys); CHANGELOG
  curated entry.
  *Accept*: repo-wide grep for `PoI|CoI` clean outside historical docs/dev + CHANGELOG;
  build + full suite green; pre-push checklist.

Phases land in order; A is the enabling refactor and MUST merge alone first (biggest
regression surface, zero visible change — easiest to bisect).

## 13. Test plan (beyond per-phase acceptance)

- `tagLifecycle.spec.ts` — §5.3 matrix.
- `tagMigration.spec.ts` — legacy localStorage trio + legacy starmap embed → expected
  categories (SYSTEM set, resource merge, frontier system, multi-pack merge); idempotence.
  **Explicit case: a config with `frontier: false` migrates to a SYSTEM frontier category
  that is still disabled** (no silent re-enable), and `reasonsConfig.enabled:false`
  migrates to the master toggle off.
- `authoredTags.spec.ts` — generation/import provenance (`origin/migrated`,
  `orbit/retrograde`, Traveller UWP tags) survives process → export → load → process.
- `autopilotParity.spec.ts` — fixture starmap route resolution identical pre/post (source
  choice, refuel stops, readiness/tardiness effects).
- `snapshotRedaction.spec.ts` — secret/playerHidden stripped; ordinary tags intact; a
  highlighted secret/playerHidden tag produces no player marker.
- `highlightRollup.spec.ts` — category-ref vs specific-tag-ref selection; resolved-colour
  precedence (`tag.color` wins); starmap union/dedupe/order/cap.
- Existing suites (classification, physics-baseline, reasonsToVisit, coi) keep passing —
  reasonsToVisit/coi specs are ported to the new modules, not deleted, to preserve their
  behavioural assertions.
- Browser verification each phase (dev server + walkthrough), per repo convention run
  `npm run build` before any push.

## 14. Docs to update (phase F checklist)

`docs/tags-guide.md` (full rewrite — the "Two kinds of tag" section becomes three
families; PoI/CoI sections replaced), `docs/autopilot-guide.md` (tag references),
`docs/classification-and-tags.md` (tag table gains origin column; note overrides),
`README.md`, `GettingStarted.md`, in-app Help/HelpMenuModal, `/physics` (override
section), `/poi-reference` → `/tags-reference`, Find-by-tag "Guide" button target.

---

## Appendix — decision log

### 2026-08-03 — PHASE A SHIPPED (v2.1.392-beta), and one decision changed under execution

**`origin` is OPTIONAL and INFERRED, not required.** The spec (§5.2b) called for a mandatory field so
the compiler would enumerate every writer. Executing it would have meant editing ~79 write sites and
~31 read sites across `src/lib/constructs/**` and the components — two territories with live sessions
in them on the day. The coordination rules (inbox, "the tagging rewrite is the invasive one") ask this
stream specifically not to do that. So `tagOrigin()` infers provenance from the flags already written,
an explicit `origin` overrides the inference, and nothing outside `src/lib/tags/**`, the strip sites and
`SystemProcessor` had to change. Same semantics; the compiler is no longer the inventory, so
`tagLifecycle.spec.ts` pins the inference table instead. Revisit if the constructs territory frees up.

**What shipped:** `tagLifecycle.ts` (the one authority), all 34 strip sites routed through it, the
`importFixup` manual-deletion bug fixed, 44 tests. `solar-system-derived.json` byte-identical
(md5 `f147e249…` before and after), idempotence green, `tagConsistency` green.

**What did NOT ship from phase A, and why:** the `tagCategories` store and the migration (§4, §11).
Both require replacing `coi.ts`'s store, which is `src/lib/constructs/**` — the Ship appearance
stream's territory, actively being worked. This is the phase gate: everything from B onwards depends
on that store, so B–F are BLOCKED on territory rather than on effort. See the note below.

### 2026-08-03 — phases B–F are blocked on territory, not effort

Recorded at the phase-A boundary so the next session does not rediscover it:

| Phase | Needs | Territory that owns it |
|---|---|---|
| B Settings "Tagging" | `tagCategories` store replacing `coi.ts` + `reasonsToVisit` stores | `src/lib/constructs/**` — Ship appearance |
| C Tags tab merge | `BodyTagsTab` + `ConstructCoITab` merged | components; `ConstructCoITab` is construct surface |
| D Map Highlights (GM) | markers in `SystemVisualizer`, `Starmap`, holo | `src/lib/holo/**`, `src/lib/starmap/**` — Scene and grids |
| E Player surfaces | `PlayerViewModal` Quick overrides + catalogue chrome | Removal ([[A42]]) and VTT streams |
| F Rename sweep | every UI string, all four doc surfaces | everything at once |

None of these is large on its own. All of them are in someone else's hands this week. The sequencing
question for the owner is whether to pause a stream and let tagging through, or to let phase A stand
alone (it is complete and useful by itself — the override mechanism works and is tested) and schedule
B–F when the constructs and scene streams land.

### 2026-08-03 — pre-execution review (6 corrections, no scope change)

1. **New `authored` origin** (§3.1) — generation/importer provenance (`origin/migrated`,
   `orbit/retrograde`, Traveller UWP tags) survives re-process AND export. Today it
   survives only by accident (those namespaces just aren't on a strip list); explicit now.
2. **SYSTEM = undeletable, NOT undisableable** (§3.3) — `frontier` is user-toggleable
   today (only `resource` is force-enabled). The earlier wording would have silently
   re-enabled it on migration and seeded new tags. SYSTEM protects existence only;
   migration copies enabled state verbatim.
3. **Master toggle rescued** (§6) — today's `reasonsConfig.enabled` ("Show
   Point-of-Interest tags") had no home in the design. Becomes "Run automated tagging
   rules".
4. **Tag WRITE sites inventoried** (§5.2b) — ~75 sites in 22 files must declare `origin`.
   Compiler-enforced (required field, no default). Roughly doubles phase A's mechanical
   surface; phase A sizing updated accordingly.
5. **Grep-gate allowlist** (§5) — the gate as first written would have failed on
   legitimate user-edit removals; allowlist named.
6. **Per-tag colour moved B←C** — it belongs to the category editor built in B.
   Origin-based grouping replaces `tagSource(key)` / `NAMESPACE_META.poi` (§7).

### 2026-07-21 — Priority Tags replaced by Map Highlights

- **Killed** the per-category "Priority" promotion and per-tag `badge`. Categories are the
  only colour grouping; **any single tag may carry its own `color`** that wins over the
  category colour (§3.2) — that alone gives per-faction flag colours.
- **Map highlighting is a live selection** of any category id and/or any specific tag key
  (`HighlightRef[]`), rendered as coloured markers (§9). Formal (whole `faction` category)
  and informal (just `frontier/refuelling`) use the same path.
- Selector lives in **Quick overrides** (`liveOverrides` — momentary, rides the broadcast);
  GM map gets a mirror "Highlights" layer. Colour always comes from the tag/category; the
  highlight only decides what shows and what shape.
- **C4 (resolved — keep it simple)**: ONE live `mapHighlights` value on `liveOverrides`,
  read by GM maps and player windows alike. No separate push step — live like the other
  Quick overrides. What the GM picks is what players see (post-redaction).

### 2026-07-20 — Q&A

Q1 ONE Resources category (contextual: body=available, construct=carried) · Q2 SYSTEM =
status/owner/purpose/resource/class/drive (+frontier per Q3); universe/tech/disposition
demoted to deletable user categories · Q3 frontier SYSTEM; SYSTEM = protected existence,
user-editable content ("user-rules-generated") — C1 confirmed keep the name "System" ·
Q4 starmap markers roll up from the whole system · Q5/C2 GM surfaces simple
(label/ring/both); richer styles (pin/flag/pill/ring) are per-player-view look-and-feel
options, colour-independent legibility required · Q6 secret per-tag + playerHidden
per-category, redacted in computePlayerSnapshot · Q7 overrides add-only (physics tags are
wiped/re-derived every process; suppression has no stable meaning) · Q8 rules allowed on
SYSTEM categories · Q9 no import shim for old pack files (hand-convert on request) ·
Q10 PoI/CoI concepts removed entirely — "just tags" · Q11 tardiness/readiness/rate stay
fixed engine fields · Q12/C3 separate worktree off beta, V2.2.x scope, numbering continues
2.1.2xx-beta.
