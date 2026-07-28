# Unified Tagging — high-level design

Status: DECISIONS LOCKED (2026-07-20) bar three small clarifications (§10). Next revision
becomes the detailed implementation spec for a coding agent, including the full
deployment/migration plan. Target: separate worktree, V2.2.x scope.

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
  `source` in ad-hoc combinations.
- **Three different strip passes** (`reasonsToVisit` clear step, `importFixup`,
  `starmapSanitizer`) each decide "which tags survive" with slightly different rules. This
  is a named problem: they get unified into ONE lifecycle module (§4).
- The `resource/` namespace is deliberately shared between body deposits (PoI-emitted) and
  construct cargo (CoI hand-set), distinguished only by flags — which is exactly what the
  autopilot routes on.

Upcoming work (Traveller/WBH generator emitting tags, priority badges, more visual-driving
tags) would multiply every one of these seams. Unify first.

## 2. Goals

1. **One mental model**: a tag is a tag. It has one key, optional value, one provenance.
   Three provenances only: **system**, **physics**, **user**. The PoI and CoI concepts are
   removed from the UI and docs entirely — "just tags".
2. **One category schema** covering everything PoI categories and CoI categories do today,
   plus new capability (applies-to roles, priority promotion, player visibility).
3. **One settings surface** ("Tagging" replaces PoI + CoIs), one store, one pack format,
   one starmap-embedding path, and **one tag-lifecycle rule** (§4).
4. **Priority Tags**: promote a category so its tags render as map markers across GM and
   player surfaces, consistently, with selectable marker styles.
5. **GM-override physics tags**: manually add tags from physics namespaces even where the
   physics wouldn't produce them; clearly marked, explained in /physics and the Newton
   panel. Add-only (no suppression) — physics tags are wiped and re-derived every process
   anyway, so suppression has no stable meaning.
6. **Secret tags**: per-tag "secret" and per-category "hidden from players" — redacted from
   every player surface.
7. **Zero behavioural change to the engine couplings** (autopilot, readiness, tardiness,
   drive inheritance, refuelling) — slugs are preserved 1:1.

Non-goals (this pass): icon/art badges (shape + colour + text only), new rule-engine
condition capability, redesigning Find-by-tag beyond what unification forces.

## 3. The unified model

### 3.1 Tag provenance (instance level)

`Tag` on a body/construct gets a single discriminator replacing the flag soup:

- **physics** — emitted by the physics layers; cleared + re-derived every process; never
  saved.
- **rule** — emitted by an automated tagging rule (`source: 'rule:<id>'` kept); cleared +
  re-rolled per category on every process; deterministic seeded roll unchanged.
- **manual** — hand-added by the GM; never stripped by anything. Sub-case: **manual
  override** — a manual tag whose key sits in a physics namespace. Kept, flagged
  `override: true`, displayed under "GM override — may not respect the physics"; the
  Newton panel and /physics explain the mechanism. Overrides feed every consumer (visuals,
  rules, find-by-tag) exactly like the real physics tag would.
- **inherited/derived** — construct tags computed from hardware (drive/refuel) or runtime
  state (status/in-transit-*, adrift). Unchanged mechanics, uniformly marked.

Plus one orthogonal flag: `secret?: true` — redacted from all player surfaces (§7).

Body `tags[]` keys do not change. No starmap data migration needed at the node level.

### 3.2 TagCategory (one schema for everything)

```ts
interface TagCategory {
  id: string;                       // namespace slug, e.g. 'faction' → keys 'faction/*'
  shortName: string;
  longName: string;
  description?: string;
  color: string; textColor: string; // base chip colours
  appliesTo: TagRole[];             // star | planet | moon | belt | ring | construct
  system?: boolean;                 // SYSTEM category: cannot delete, cannot disable
  enabled: boolean;
  playerHidden?: boolean;           // whole category redacted from player surfaces
  tags: TagDef[];
  rules: TagRule[];                 // automated tagging rules (current PoI engine + schema)
  priority?: PriorityConfig;        // present = promoted to Priority Tags (§6)
}

interface TagDef {
  slug: string; label: string; description?: string;
  badge?: { label: string; color: string };   // priority marker override
  // engine data, only meaningful on specific SYSTEM categories (fixed fields, not a
  // general attribute mechanism — decided Q11):
  tardiness?: number; readiness?: number; rate?: number; locked?: boolean;
}
```

One writable store `tagCategories`, one localStorage key, one pack envelope
(`sse-tag-category`, per-category save/load), one starmap-embed block. The presentation
registry (`tagPresentation.ts`) is fed from this single source.

### 3.3 The three tag families as the user sees them

- **SYSTEM tags** (rename of CORE): categories SSE itself depends on — status, owner,
  purpose, resource, class, drive, **frontier** (decided Q2/Q3; frontier is SYSTEM because
  fuel `refuel_tags` reference `frontier/*`). Cannot be deleted or disabled; everything
  else about them — tag lists AND rules — remains fully user-editable. SYSTEM protects
  *existence*, not content: these tags are still largely **generated by user-tweakable
  rules** (see §10 clarification C1 on exact wording in the UI copy).
- **Physics tags**: not categories in Settings — the Tagging section *explains* them and
  links to /physics and the Newton panel. GM overrides per §3.1.
- **User tags**: everything else — former optional CoI categories (universe, tech,
  disposition → now plain deletable categories), former PoI categories (science,
  intrigue), and anything the GM creates. Fully editable, deletable, disableable.

**Resources is ONE category** (decided Q1), applying to bodies and constructs; meaning
stays contextual — on a body = available/extractable, on a construct = carried. That is
how the autopilot already reads it, so nothing to infer and zero migration risk.

Rules are available on every category including SYSTEM (decided Q8) — the rules editor is
simply present everywhere; appliesTo ghosts what a rule can target.

## 4. Tag lifecycle — ONE strip rule (new, first-class)

Today three code paths decide which tags survive, with subtly different logic:

1. `reasonsToVisit.annotate` clear step — strips rule tags by category prefix, spares `manual`
2. `importFixup.isInterferingTag` — strips derived namespaces + legacy shapes, does NOT
   check `manual` (a manual tag in a derived namespace would be wrongly stripped — this
   becomes load-bearing once GM overrides exist)
3. `starmapSanitizer.sanitizeTags` — strips V1 legacy tags, spares `manual`

These collapse into one module, `lib/tags/tagLifecycle.ts`, the single authority on
provenance semantics:

- `survivesRederive(tag)` — manual (incl. overrides) and secret flags always survive;
  physics + rule tags never do.
- `stripForReprocess(tags, scope)` — used by SystemProcessor + the rules pass.
- `stripForExport(tags)` — used by save/export (drops everything re-derivable).
- `sanitizeOnLoad(tags)` — legacy-shape cleanup + flag-soup → new provenance normalisation.

Every current caller (SystemProcessor, reasonsToVisit, importFixup, starmapSanitizer,
export paths) delegates to these four functions. The detailed spec will name each use case
and its exact call, so it is always obvious which one applies. Unit-tested as a matrix:
every provenance × every operation → survive/strip.

## 5. Settings → Tagging

PoI and CoIs sections are replaced by one **Tagging** section:

- Intro copy: tags come from physics (see /physics), from automated rules, and from you.
- List of all categories: SYSTEM first (lock glyph, enable toggle locked on), then user
  categories with enable/disable, rule counts, applies-to chips, priority + hidden marks.
- Buttons: add category, edit, delete (ghosted on SYSTEM), save/load category to file.
- Category editor (one modal, evolved from PoIPackEditor + CoIEditor):
  1. short/long name, description
  2. base colours (chip bg + text)
  3. applies-to role checkboxes
  4. player visibility (hide whole category)
  5. Priority Tags promotion block (§6)
  6. defined-tags list (add/remove; engine-data fields shown only where they apply;
     per-tag badge label/colour when promoted; per-tag secret default)
  7. "Edit automated tagging rules" — existing rule list/condition builder, with
     "Applies to" entries ghosted to the category's `appliesTo`
- Old PoI/CoI pack files are NOT importable (decided Q9 — if one of the 1–2 users who made
  packs needs theirs, we convert it for them by hand).

## 6. Priority Tags

A category can be **promoted to Priority Tags**; its tags then render as markers on maps.

### Marker styles (decided Q5 — multiple styles, be creative)

- **Pin** — Google-Maps-style teardrop pin in the badge colour, optional 1–2 letter
  monogram; a thin leader line to the body when fanned out.
- **Flag** — simple line + small coloured flag/label off the body edge (compact, reads at
  distance).
- **Pill** — the existing tag-chip pill (label text in badge colours), anchored under the
  body name.
- **Ring** — thin coloured circle around the body disc/marker; multiple rings nest as
  concentric strokes.
- Styles must remain legible when colour is unreliable (player-view CRT filters, colour
  overlays, colour-blind users): pin monograms, flag labels and pill text carry the
  information without colour.

Where the style choice lives is clarification C2 (§10) — proposed: the category sets a
default; a viewer-level preference (GM map settings + player view settings) can force a
style globally.

### Rendering rules

- **System map / orrery / holo**: each priority tag renders its marker; multiple markers
  fan around the object edge in stable order; clutter cap (~4) with "+N" overflow.
- **Starmap — ROLLED UP** (decided Q4): a system's star shows the union of priority tags
  carried by ANY body/construct in that system (deduped per tag). Multiple factions on one
  system is expected on contested/cooperating areas. Aggregation rule: dedupe by tag key,
  order by category then slug, same clutter cap.
- **Player surfaces** (/catalogue, player views, holo, ReportDocument): priority tags are
  listed *separately* from ordinary tags, directly under the body/construct name, same
  visual language as the map markers. Secret/hidden tags redacted first (§7).
- **Filters / Find-by-tag**: priority tags behave as normal tags in filters; map filter
  presets can toggle the marker layer.

Docs will say "use sparingly". Icon/art badges banked for a later pass.

## 7. Secret tags & player redaction (decided Q6)

- Per-tag `secret: true` (settable when adding/editing a tag on a body/construct, and as a
  per-TagDef default) — the tag is stripped by `computePlayerSnapshot` and never reaches
  /catalogue, player views, holo, broadcast snapshots or reports.
- Per-category `playerHidden: true` — the whole category is stripped the same way.
- Redaction happens in ONE place: `computePlayerSnapshot` calls a
  `redactTagsForPlayers(tags, categories)` helper from the lifecycle module, so every
  player surface inherits it (they all already flow through the snapshot).
- GM surfaces show secret tags with a distinguishing mark (e.g. eye-slash glyph).

## 8. Manual tagging on bodies & constructs

The Tags tab keeps its current shape (grouped chips + add form) with these changes:

- Category dropdown lists: Custom, every *enabled* category whose `appliesTo` includes
  this object's role, and the **physics namespaces** (geology, tidal, climate, aurora, …)
  for GM overrides.
- Adding a physics-namespace tag files it as a manual override (§3.1), grouped under
  "GM override · may not respect physics", removable, survives re-process.
- No category *creation* from this tab (Settings only), but adding new tags to an existing
  category is allowed and registers the tag on the category.
- A "secret" toggle on the add form (and on existing manual chips).
- Groups render as: Yours → GM overrides → per-category rule tags (orange lock) → physics
  (red lock).

## 9. Engine couplings that must not move

Preserved slug-for-slug (all in SYSTEM categories or data-driven):

- `resource/*` prefix matching + tag `value` as abundance — autopilotAdapter
- fuel `refuel_tags` (data-driven set, typically `resource/*` + `frontier/*`)
- `purpose/mining|survey-prospecting|science|research|patrol` — leg inference
- `drive/*` ranking + inheritance; `status/*` readiness (incl. derived in-transit/adrift);
  `owner/*` tardiness
- physics namespaces consumed by classification visuals, PlanetDisc, rule conditions

Migration tests assert route-resolution parity on a fixture starmap before/after.

## 10. Remaining clarifications

- **C1 — "system = user-rules-generated" wording**: Q3's answer said to frame SYSTEM tags
  as generated by user-tweakable rules. Reading taken: SYSTEM protects a category's
  *existence and enabled state only*; its rules and tag lists stay fully editable, and the
  UI copy says so ("System categories are needed for SSE to operate — you can still edit
  their tags and the rules that generate them, you just can't remove them"). Confirm, or
  was a different family *name* than "System" intended?
- **C2 — marker style: who chooses?** Proposed: category default (GM, in the promotion
  block) + a viewer-level override preference on GM map settings and player-view settings
  (so a colour-reliant table can force pins/flags with text). Confirm or simplify to one.
- **C3 — worktree base**: V2.2.x scope ⇒ branch from `beta` (the live V2.2 line) in a
  separate worktree. Confirm.

## 11. Migration & deployment (sketch — full plan lands with the detailed spec)

Data migration is load-time, one-way, automatic:

1. `poi-packs` + `reasons-to-visit-config` + `coi-categories` (localStorage AND the
   starmap-embedded copies) → one `tagCategories` set. Category identities, colours,
   enable states, rules and user-authored pack content carry over; the SYSTEM set
   (status, owner, purpose, resource, class, drive, frontier) marked `system: true`.
2. Node `tags[]` untouched (keys stable); flag soup normalised to the new provenance
   discriminator by `sanitizeOnLoad` on first load.
3. The three strip passes replaced by the lifecycle module (§4).
4. Old pack *files* die (hand-convert on request); starmap-embedded old blocks are
   migrated then dropped from saves.
5. Autopilot: no slug changes ⇒ no behaviour change; parity tests as §9.

Deployment is phased in the V2.2.x worktree (each phase shippable, tests + build green):

- **A** — lifecycle module + unified store + migration (UI unchanged, old editors reading
  the new store through shims)
- **B** — Settings Tagging section + unified category editor; PoI/CoI editors deleted
- **C** — Tags-tab changes + GM physics overrides + secret toggles + Newton//physics copy
- **D** — priority markers on GM surfaces (system map, starmap rollup, orrery/holo)
- **E** — priority tags + redaction on player surfaces, reports, filters
- **F** — docs overhaul (tags-guide, autopilot-guide, README, Help, /poi-reference →
  retired or renamed /tags-reference) + dead-code deletion + rename sweep (PoI/CoI gone
  from UI and docs entirely)

## Appendix — decision log (2026-07-20)

Q1 one Resources category (contextual meaning) · Q2 SYSTEM = status/owner/purpose/
resource/class/drive; universe/tech/disposition demoted to deletable user categories ·
Q3 frontier is SYSTEM; SYSTEM framed as user-rules-generated (C1) · Q4 starmap badges
roll up from the whole system · Q5 multiple marker styles (pin/flag/pill/ring), style as
a preference, colour-independent legibility (C2) · Q6 secret per-tag + hidden per-category,
redacted from players · Q7 overrides add-only · Q8 rules allowed on SYSTEM categories ·
Q9 no import shim for old packs (hand-convert on request) · Q10 PoI/CoI concepts removed
entirely — "just tags" · Q11 tardiness/readiness/rate stay fixed engine fields ·
Q12 separate worktree, V2.2.x scope (C3).
