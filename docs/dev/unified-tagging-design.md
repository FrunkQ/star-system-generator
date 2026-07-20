# Unified Tagging — high-level design

Status: HIGH-LEVEL DRAFT — open questions at the end must be answered before the detailed
system design is written. This doc will then grow into the implementation spec handed to a
coding agent, including the full deployment/migration plan.

## 1. Why

V2 grew three parallel tagging systems plus a free-form layer, and they overlap:

| System | Lives in | Configured in | Persisted as |
|---|---|---|---|
| Physics-derived tags | `physics/*` emitters, stripped/re-derived every process | not configurable | never saved (re-derived) |
| PoI rule tags | `physics/reasonsToVisit.ts` rule engine | Settings → PoI + PoIPackEditor | `poi-packs` + `reasons-to-visit-config` localStorage + starmap-embedded |
| CoI categories | `constructs/coi.ts` | Settings → CoIs + CoIEditor | `coi-categories` localStorage + starmap-embedded |
| Free-form manual tags | `tags/customTags.ts` vocabulary | Body/Construct Tags tab | inside node `tags[]` |

The duplication is real and already bites:

- **Two "CORE" definitions**: CoI `required:true` categories (status, owner, purpose,
  resource, class, drive) vs PoI `CORE_REASON_CATEGORIES = ['resource']`. Different
  enforcement code, same intent.
- **Two pack formats** (`sse-poi-pack`, `sse-coi-pack`), two export/import/merge paths, two
  settings sections, two category editors.
- **Provenance by flag soup**: `Tag` carries `manual` / `coi` / `inherited` / `derived` /
  `source` in ad-hoc combinations; three different strip passes (`reasonsToVisit` clear step,
  `importFixup`, `starmapSanitizer`) each decide "which tags survive" with slightly different
  rules.
- The `resource/` namespace is deliberately shared between body deposits (PoI-emitted) and
  construct cargo (CoI hand-set), distinguished only by flags — which is exactly what the
  autopilot routes on.

Upcoming work (Traveller/WBH generator emitting tags, priority badges, more visual-driving
tags) would multiply every one of these seams. Unify first.

## 2. Goals

1. **One mental model**: a tag is a tag. It has one key, optional value, one provenance.
   Three provenances only: **system**, **physics**, **user**.
2. **One category schema** covering everything PoI categories and CoI categories do today,
   plus new capability (applies-to roles, priority promotion).
3. **One settings surface** ("Tagging" replaces PoI + CoIs), one store, one pack format,
   one starmap-embedding path, one survive-a-rederive rule.
4. **Priority Tags**: promote a category so its tags render as badges/rings on maps and all
   player surfaces, consistently.
5. **GM-override physics tags**: manually add tags from physics namespaces even where the
   physics wouldn't produce them; clearly marked, explained in /physics and the Newton panel.
6. **Zero behavioural change to the engine couplings** (autopilot, readiness, tardiness,
   drive inheritance, refuelling) — slugs are preserved 1:1.

Non-goals (this pass): icon badges (colour + label only for now), new rule-engine
capability (the PoI condition engine is kept as-is), redesigning the Find-by-tag UI beyond
what the unification forces, per-player tag visibility (unless answered otherwise in Q6).

## 3. The unified model

### 3.1 Tag provenance (instance level)

`Tag` on a body/construct gets a single discriminator replacing the flag soup:

- **physics** — emitted by the physics layers; cleared + re-derived every process; never
  saved. (Unchanged behaviour, new explicit marker.)
- **rule** — emitted by an automated tagging rule (`source: 'rule:<id>'` kept); cleared +
  re-rolled per category on every process, deterministic seeded roll unchanged.
- **manual** — hand-added by the GM; never stripped by anything. Sub-case: **manual
  override** — a manual tag whose key sits in a physics namespace. Kept, flagged
  `override: true`, displayed under a "GM override — may not respect the physics" heading;
  the Newton panel and /physics explain the mechanism.
- **inherited/derived** — construct tags computed from hardware (drive/refuel) or runtime
  state (status/in-transit-*, adrift). Unchanged mechanics, now uniformly marked.

Body `tags[]` keys do not change. No starmap data migration needed at the node level.

### 3.2 TagCategory (one schema for everything)

```ts
interface TagCategory {
  id: string;                       // namespace slug, e.g. 'faction' → keys 'faction/*'
  shortName: string;                // chip label context
  longName: string;                 // settings list / editor title
  description?: string;
  color: string; textColor: string; // base chip colours (as PoI today)
  appliesTo: TagRole[];             // star | planet | moon | belt | ring | construct
  system?: boolean;                 // SYSTEM category: cannot delete, cannot disable
  enabled: boolean;
  tags: TagDef[];                   // defined tags (label, slug, optional engine data)
  rules: TagRule[];                 // automated tagging rules (current PoI engine + schema)
  priority?: PriorityConfig;        // present = promoted to Priority Tags (see §6)
}

interface TagDef {
  slug: string; label: string; description?: string;
  badge?: { label: string; color: string };   // priority badge override (see §6)
  // engine data, only meaningful on specific SYSTEM categories:
  tardiness?: number; readiness?: number; rate?: number; locked?: boolean;
}
```

One writable store `tagCategories`, one localStorage key, one pack envelope
(`sse-tag-category`, per-category save/load), one starmap-embed block. The presentation
registry (`tagPresentation.ts`) is fed from this single source.

### 3.3 The three tag families as the user sees them

- **SYSTEM tags** (rename of CORE): categories SSE itself depends on. Cannot be deleted or
  disabled; their *tag lists* remain fully editable (add/remove tags). Proposed set = the
  current CoI required six (status, owner, purpose, resource, class, drive) + whatever Q1/Q3
  decides about body-side resource/frontier.
- **Physics tags**: not categories in Settings at all — the Tagging section *explains* them
  and links to /physics and the Newton panel. Plus GM overrides per §3.1.
- **User tags**: everything else — current optional CoI categories (universe, tech,
  disposition), current PoI categories (science, intrigue, …), and any category the GM
  creates. Fully editable, deletable, disableable.

## 4. Settings → Tagging

PoI and CoIs sections are replaced by one **Tagging** section:

- Intro copy: tags come from physics (see /physics), from automated rules, and from you.
- List of all categories: SYSTEM first (lock glyph, toggle disabled-on), then user
  categories with enable/disable toggles, rule counts, applies-to chips.
- Buttons: add category, edit, delete (ghosted on SYSTEM), save/load category.
- Category editor (one modal, evolved from PoIPackEditor + CoIEditor):
  1. short/long name, description
  2. base colours (chip bg + text)
  3. applies-to role checkboxes
  4. Priority Tags promotion block (§6)
  5. defined-tags list (add/remove; engine-data fields shown only on the SYSTEM categories
     that use them)
  6. "Edit automated tagging rules" — the existing rule list/condition builder, with
     "Applies to" entries ghosted to the category's `appliesTo`
  7. save/load this category to file

Old PoI/CoI pack files are **not** importable (dead format, no shim) — per Q9 unless
overturned.

## 5. Manual tagging on bodies & constructs

The Tags tab keeps its current shape (grouped chips + add form) with these changes:

- Category dropdown lists: Custom, every *enabled* category whose `appliesTo` includes this
  object's role, and — new — the **physics namespaces** (geology, tidal, climate, aurora, …)
  for GM overrides.
- Adding a physics-namespace tag files it as a manual override (§3.1): grouped separately
  ("GM override · may not respect physics"), removable, survives re-process, and — the
  point — feeds every consumer exactly like the real physics tag would (visual features,
  rules, find-by-tag).
- You cannot *create categories* from this tab (Settings only), but you can add new tags to
  an existing category (they get registered on the category, as PoI manual filing works now).
- Groups render as: Yours → GM overrides → per-category rule tags (orange lock) → physics
  (red lock).

## 6. Priority Tags

A category can be **promoted to Priority Tags**. Config on the category:

```ts
interface PriorityConfig {
  display: 'label' | 'ring' | 'both';
}
// per-tag: TagDef.badge = { label, color } — defaults to tag label + category colour
```

Rendering rules (kept deliberately simple this pass):

- **System map / orrery / holo**: each priority tag on a body/construct renders its badge —
  a small pill in the map's existing label style ('label'), a coloured ring around the
  object ('ring'), or both. Multiple badges fan around the object edge in a stable order;
  multiple rings nest as thin concentric strokes. A clutter cap with "+N" overflow.
- **Starmap**: a star carrying a priority tag shows its badge at starmap level (Q4: rollup
  of the whole system's priority tags is an open question).
- **Player surfaces** (/catalogue, player views, holo, ReportDocument): priority tags are
  listed *separately* from ordinary tags, directly under the body/construct name, in the
  same visual style as the map badges.
- **Filters / Find-by-tag**: priority tags behave as normal tags in filters; map filter
  presets can toggle badge visibility as a layer.

Badges are visual clutter by design intent — docs will say "use sparingly". Icons and
richer badge art are explicitly banked for a later pass.

## 7. Engine couplings that must not move

Preserved slug-for-slug (all become SYSTEM categories or stay data-driven):

- `resource/*` prefix matching + tag `value` as abundance — autopilotAdapter
- fuel `refuel_tags` (data-driven set, typically `resource/*` + `frontier/*`)
- `purpose/mining|survey-prospecting|science|research|patrol` — leg inference
- `drive/*` ranking + inheritance; `status/*` readiness (incl. derived in-transit/adrift);
  `owner/*` tardiness
- physics namespaces consumed by classification visuals, PlanetDisc, PoI rule conditions

## 8. Migration & deployment (sketch — detailed plan comes with the full spec)

Data migration is load-time, one-way, automatic:

1. `poi-packs` + `reasons-to-visit-config` + `coi-categories` (localStorage and the
   starmap-embedded copies) → one `tagCategories` set. Category identities, colours,
   enable states, rules, and user-authored packs all carry over; the current CORE sets are
   marked `system: true`.
2. Node `tags[]` untouched (keys stable); flag soup normalised to the new provenance
   discriminator by the sanitizer on first load.
3. The three strip passes collapse into one rule: *physics + rule tags are cleared and
   re-derived; manual (incl. overrides) and inherited/derived always survive*.
4. Old pack *files* die; starmap-embedded old blocks are migrated then dropped from saves.
5. Autopilot: no slug changes, so no behaviour change; migration tests assert route
   resolution parity on a fixture starmap before/after.

Deployment is phased on beta (each phase shippable, tests green):
A. data model + single store + migration (UI unchanged, old editors reading new store) →
B. Settings Tagging section + unified category editor →
C. Tags-tab changes + GM physics overrides + Newton/physics explanations →
D. Priority badges on GM surfaces (system map, starmap, orrery/holo) →
E. Priority tags on player surfaces + reports + filters →
F. docs overhaul (tags-guide, autopilot-guide, README, Help) + old-code deletion.

## 9. Open questions

Answered inline in the next revision; numbered for reply-by-number.

**Q1 — Resources: one category or two?** Today `resource/*` means "extractable here" on a
body and "carried/handled" on a construct, same slugs, and autopilot needs both sides.
Options: (a) one SYSTEM category "Resources" applying to both roles, meaning stays
contextual (matches today, zero migration risk); (b) split into "Resources (available)"
[bodies] and "Cargo" [constructs] with shared slug vocabulary. My recommendation: (a) now —
the availability-vs-need inference lives in *where* the tag sits, which is how the engine
already reads it, so nothing to infer.

**Q2 — Which categories are SYSTEM?** Proposed: status, owner, purpose, resource, class,
drive (the current CoI six, resource per Q1). Universe, tech and disposition become plain
user categories (deletable). Confirm?

**Q3 — frontier/***: fuel `refuel_tags` reference `frontier/*` (gas-giant/ice refuelling),
so deleting the frontier category could silently break refuelling. Make frontier SYSTEM
too, or leave it a user category and have the fuel editor warn when a referenced tag's
category is missing? (science and intrigue stay plain user categories either way.)

**Q4 — Starmap badges**: strictly "badge shows only if the tag is on the STAR itself", or
should the starmap roll up priority tags from anywhere in the system (e.g. a faction tag on
a planet lights up the system on the starmap)? Rollup is more useful for factions but
noisier and needs an aggregation rule.

**Q5 — Ring vs label look**: 'ring' = thin coloured circle around the body disc/marker
(nested when multiple), 'label' = the existing map-label pill style in badge colour. Cap at
~4 badges + "+N" overflow? Any strong feeling on fan direction (below name vs radial)?

**Q6 — Player visibility**: currently ALL tags pass through computePlayerSnapshot
unredacted. Keep that (tags are public), or add a per-category "GM only" flag while we're
in here? Priority badges on player views make this sharper — a hidden-agenda faction tag
badge would be visible to players.

**Q7 — Override reach**: GM physics-override tags feed all consumers (visuals like volcano
vents/auroras, rules, find-by-tag) — assumed yes, that's the point. And is *suppressing* a
physics tag (force-remove one the physics emits) in scope, or add-only for now? Add-only
keeps the model much simpler.

**Q8 — Rules everywhere?** In the unified schema every category (SYSTEM included) carries a
rules list, and rules may target constructs when appliesTo allows. That means e.g. an
automated rule could set `purpose/*` on constructs. Fine, or should SYSTEM categories be
manual/engine-only (rules hidden)?

**Q9 — Old packs**: confirmed no import shim for `sse-poi-pack` / `sse-coi-pack` files —
they die. The starmap-embedded equivalents ARE migrated (that's people's live data).

**Q10 — Naming**: section = "Tagging"; the terms "PoI" and "CoI" disappear from the UI and
docs entirely, or survive as flavour ("points of interest" as prose when describing rule
packs)? Also: keep the /poi-reference route (renamed), and "Reasons to visit" wording?

**Q11 — Tag attributes**: tardiness/readiness/rate stay as fixed engine fields shown only
on their SYSTEM categories (simple), or become a general "attributes" mechanism user
categories can also use (bigger, banked?). Recommendation: fixed fields now.

**Q12 — Release line**: this is a big rewrite. Land it as the next V2.1.x beta line as
usual, or branch/worktree it until phase C is stable given the other in-flight work?
