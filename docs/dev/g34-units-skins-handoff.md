# G34 — Units everywhere + interface skins: handoff

Written 2026-08-21 by the coordinator at v2.1.890-beta. PROMOTED TO V3 BY THE OWNER: "the biggest
visual impact for a new version. A usability boost for existing users without having to learn
anything new. People will FEEL it has evolved." The `| G34 |` row holds the measured assessment;
this is the working brief. Read the standing rules at the foot of `docs/dev/observations-inbox.md`
first; work in your own worktree off `origin/beta`; commit as FrunkQ <frunk@frunk.net>.

## The two halves, and why they are one job

**Units:** every data field, view AND edit, shows a clickable unit label that cycles its ladder —
temps K/C/F; masses t / M-Earth / M-Jup / M-Sol; distances km / miles / AU / ly / pc — and the
choice is REMEMBERED PER QUANTITY x BODY TYPE (star/planet/moon/construct). Owner's defaults:
stars K, every planet/moon C. The System Settings units selector RETIRES (users mix freely — C
with miles is legal). Player views INHERIT the GM's units, non-interactively.

**Skins:** the key interface components get a selectable look — the current chunky one and a
slimmed compact one to start, a selector that can hold about half a dozen eventually, because
which reads best per DEVICE is unknown. The route there IS the units sweep: converging the
non-specialised inputs and panels onto SHARED components cures the accumulated UI drift, and a
skin is then design tokens / a density class those components read. One selector, no per-panel
forks. Chunky-vs-slim becomes data, not a rewrite.

## What exists (measured 2026-08-21, v2.1.887)

- `src/lib/units.ts` — the convert/format vocabulary INCLUDING display-to-store round-trips
  (`displayTempToC`, `displayNumToKm`, ...) and a derived `fmt` store in `stores.ts:37`; 23 files
  consume it; ~17 hand-rolled `273.15` sites remain. `units.spec.ts` is the test to extend.
- NO mass formatter exists (grep `formatMass` — nothing). The mass ladder is new code.
- `measurementUnits` / `temperatureUnit` live ON THE STARMAP (`types.ts:1214-1215`) — so per-type
  `unitPrefs` go on the starmap too: they then ride save, bundle and the player snapshot for free.
  The catalogue currently reads a `?temp=` URL param (`catalogue/+page.svelte` onMount) — swap it
  to the snapshot's prefs, keeping the param as an override for old links if trivial.
- Display surface ~35 svelte files; EDIT surface is 7 components: BodyBasicsTab, BodyStarTab,
  BodyTemperatureTab, BodyAtmosphereTab, EditAtmospheresModal, RealSkyImportModal, SettingsModal.
- The interstellar map unit (ly/pc on the STARMAP scale) is a DIFFERENT thing with its own
  convert-vs-relabel dialogue (A43, `map/distanceUnits.ts`) — leave it alone; your ladders are for
  BODY/system quantities.

## Build order (each phase its own green push)

1. **Core, collides with nothing:** the mass + long-distance ladders in `units.ts`; a
   `unitPrefs` record on the starmap keyed quantity x bodyType, with a load-time migration from
   the two legacy fields and the owner's defaults; `<UnitValue>` (display — the unit is the click
   target, cycles the ladder, updates the pref for that quantity x body type everywhere at once)
   and `<UnitInput>` (edit — shows in the pref unit, converts to SI on commit). Specs for every
   ladder round-trip and the migration.
2. **Display sweep,** panel by panel, replacing hand-rolled formatting with `<UnitValue>` —
   applying the compact-skin classes to each panel as its markup converges. Green build between
   panels; a mis-swept field is a WRONG NUMBER ON SCREEN (A33/PHY-2 class), so eyeball each panel
   against its previous values as you go.
3. **Edit fields,** the risky half: convert-on-commit, never mid-typing; reuse the existing
   round-trip helpers; **BodyBasicsTab LAST and most carefully** — its anchored-composition
   sliders have their own unit logic and brush the slider-release/undo boundaries (G28's row says
   why two "edit finished" boundaries is the trap).
4. **Skins:** tokens/density classes on the shared components (`styles/tokens.css` is where the
   foreground/chrome rule already lives — same file, same pattern); the selector (Settings >
   Appearance) with `chunky` (today, the default) and `compact`; per-viewer, persisted locally
   like `pictureBoxStore` (a skin is chrome, not campaign data — note the asymmetry with units,
   which ARE campaign data because players inherit them).
5. **Retire the Settings units selector** behind the migration; the About/system-settings surface
   says units are now on the fields themselves.

## Acceptance

- Click the unit on any planet's temperature: every planet temp everywhere flips C to F to K;
  stars stay K. Reload: held. Save, load on a clean profile: held (it rides the starmap).
- A player window shows the GM's units with no control of its own; changing a unit as GM reaches
  an open player window on the next snapshot.
- Type 100 into a temp field showing F: the stored kelvin is 310.9; flip the field to K and back:
  no drift (round-trip spec).
- Mass on a star cycles t / M-Earth / M-Jup / M-Sol; Jupiter reads 1.000 M-Jup at that stop.
- Skin selector: compact visibly shrinks fonts and padding across the swept panels; chunky is
  pixel-familiar; nothing unreadable at the mobile preset (UI-C6 still honoured).
- No hand-rolled 273.15 left in components (grep proves it); `units.spec.ts` green; build green.

## Rules that bite

- ONE cycle order per ladder, defined once in units.ts — not per component.
- The sweep must not run in the same files the V3 mop-up session is editing — it is live
  (GenerationDials, SettingsModal, the importers). START WITH PHASE 1 if fired early; begin
  phase 2 only after the mop-up's last push, and pull --rebase before every push regardless.
- Units are presentation only — storage stays SI everywhere (K, kg, km, AU); a unit pref never
  touches a stored value (A43's convert-vs-relabel lesson).
- Engine-map entry for the unitPrefs schema and the skin-token rule, same commit; changelog line
  per push after "All notable changes are listed here:"; version bump; update the G34 row; a
  Documentation-debt line (the GM guide gains "click a unit to change it").
