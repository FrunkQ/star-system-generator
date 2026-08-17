# DEBUG TOOLS — what you can switch on, and which question each one answers

**AUDIENCE: an agent (or the owner) about to diagnose something in this app.** This is the index of
instruments that already exist. **Read it before building a new one** — the standing rule in the
observations inbox is to EXTEND these rather than invent parallel ones, and every rendering fault in
this codebase over the last month was settled by one of these and none by inference.

**THE METHOD THIS FILE SERVES.** Measure, then change. Reasoned-not-measured fixes have a poor record
here (RENDER-S8 records four consecutive misdiagnoses from screenshots; RENDER-S15 and RENDER-S16 were
both settled in one run by a printed number after days of theory). If you are about to change
behaviour without a number in front of you, switch something on instead.

**HOW THESE ARE DESIGNED, and how to build the next one.** One line per second (or per window), one
field per possible cause, with COMPUTED PREDICTIONS printed next to MEASUREMENTS — so a single pasted
line settles a question rather than starting a conversation. They are silent and free when off.

---

## 1. `[sse-perf]` — frame rate, memory and named counters

**WHERE:** `src/lib/perfTrace.ts`. **SWITCH:** `?perf=1` on any route ·
`localStorage['sse-perf']='1'` · `window.__ssePerf.enable()` (persists) / `.disable()`.

**ANSWERS:** is the app slow right now, what was busy while it was slow, and is memory growing?

Off, it logs ONE `console.warn` line per 5-second window that averages below 45fps. On (verbose), it
logs EVERY window at `info`, which is what makes a FLAT heap timeline usable as evidence — an absence
of growth is a finding, and you cannot see it in an instrument that only speaks up when unhappy.

```
[sse-perf] 58.2fps over 5s heap 47MB gl {"geometries":812,"textures":44,"programs":19} {"holo.setSystem.same":4,...}
```

**API:**
- `perfCount(name, n = 1)` — increment a counter. Free; add them liberally. Accumulating a
  MILLISECOND total in a counter (`foo.ms`) is an established idiom here: divide by the call count
  for an average.
- `perfProvider(name, fn)` — register a live gauge read only when a line prints. The holo scene
  registers `gl` (three's `renderer.info.memory`). **This is the leak detector**: if geometries or
  textures climb across `setSystem` cycles while the scene shows the same thing, something is
  surviving `clearContent`.
- `perfStage(stage)` — stamp a load stage (see §2).
- `perfEvent(name, data)` — **record WHY something happened, not just how often.** One cheap row into
  a bounded ring (300), timestamped. **ALWAYS RECORDING, enabled or not** — that is the whole design:
  the faults this exists for are intermittent, and the refresh you would use to go and look destroys
  the evidence. Keep rows cheap (numbers and short strings, never payload inspection); anything
  expensive belongs behind an explicit opt-in in the caller.
- `window.__ssePerf.events(n = 60, name?)` — **THE one action to run while a fault is happening.**
  Dumps the last `n` rows as a table, newest last, with a `dt` column — even spacing reads as a
  driver, bursts as a retrigger. Filter to one kind: `__ssePerf.events(60, 'holo.setSystem')`.
- `window.__ssePerf.report()` — dump counters, heap, providers, the stage table and the event ring on
  demand, enabled or not.
- `window.__ssePerf.rxBytes = true` — opt in to sizing inbound broadcast payloads. Off by default and
  **not implied by `?perf=1`**, because stringifying on the receive path is the cost class the
  rebuild-storm hunt is chasing.

**COUNTERS THAT EXIST AND WHAT THEY MEAN:**

| counter | means |
|---|---|
| `holo.setSystem.same` | full scene rebuilds of the system ALREADY on screen. **This is the population a patch-instead-of-rebuild path could absorb** — the go/no-go number for that fix. A ship in transit rewrites the snapshot ~2x/s. |
| `holo.setSystem.new` | rebuilds because the system genuinely changed. A rebuild is the right answer here. |
| `holo.setSystem.ms` | accumulated rebuild wall time. Average = `.ms / (.same + .new)`. |
| `holo.ringRefineFrame` | frames on which a refined heliocentric ring re-propagated 1024 samples. Should be quiet when nothing is being refined. |
| `holo.setSystem.by.<reason>` | which CALLER asked for each rebuild: `prop` / `mount` (HoloView — the player path) or `style:<dial>` (a dial rebuilding its own content). Paired with the event ring below, this is the WHY. |
| `sync.starmap` | starmap snapshots pushed to players. |
| `bc.<TYPE>.strMs` | time spent stringifying that message type. **Note this runs on EVERY reactive tick to fingerprint the payload, sent or not** — a cost that was invisible before it was counted. **SENDER SIDE ONLY.** |
| `bc.<TYPE>.bytes` | bytes actually sent. Average payload = `.bytes / .sent`. Relevant to the 16 KB DataChannel frame rule. |
| `bc.<TYPE>.sent` / `.unchanged` | how often the change-gate let a payload through versus suppressed it. |
| `rx.<TYPE>` | **inbound** messages, counted on a RECEIVER. The missing half of `bc.*`: without it, "the GM is SENDING more" and "this window REBUILDS more per message" look identical and have opposite fixes. `rx.<TYPE>.bytes` needs `__ssePerf.rxBytes = true`. |

**THE EVENT RING — `holo.setSystem` rows.** `__ssePerf.events(60, 'holo.setSystem')` gives one row per
rebuild: `reason`, `ms`, `nodes`, `dt`, and the two fields that decide the fix —

| field | means, and what it rules out |
|---|---|
| `sameRef` | the incoming system is the **same object reference** already held. Nothing upstream re-cloned; this is a RE-FIRE (remount, or a Svelte statement invalidated by something other than `system`). **An upstream content gate cannot help this case.** |
| `sameId` without `sameRef` | same system, **new object** — something upstream re-cloned it. A content gate IS the candidate fix. |

`window.__rebuildDebug = true` adds `hash` / `sameHash` / `hashMs`: the only way to prove a re-cloned
snapshot was byte-identical. **Opt-in on purpose** — hashing a several-hundred-KB system at 12 Hz is
the cost class this hunt is about, and `hashMs` reports what the instrument itself spent.

## 2. `[sse-load]` — where a load got to, stage by stage

**WHERE:** `perfStage()` in `perfTrace.ts`; call sites in `routes/+page.svelte`.
**SWITCH:** always COLLECTED; printed live when verbose; `window.__ssePerf.report()` prints the table.

**ANSWERS:** a load is slow or stuck — which stage, and how long did each one take?

Each stamp records `{ stage, atMs, sinceLastMs }`, so `sinceLastMs` on a `physics:<name>` row is that
system's processing cost. Stages run `load.storageRead.start/done` → `physics.start` →
`physics:<system name>` (one per system) → `physics.done` → `load.complete(painted|alive)`.

**READ THE STAGE, NEVER THE PROGRESS BAR** (engine map UI-L1): the overlay is torn down only after the
store is set and the first frame renders, so a hang downstream leaves a bar reading 100%. That is
exactly how the reported phone lockup was misread as a physics problem.

**REFERENCE NUMBERS**, bundled 44-system map, desktop Chrome: storage read 3 ms, 31–47 ms per system,
heap 19–22 MB. A hidden tab is a different regime entirely — see UI-L3.

## 3. Holo scene per-second diagnostics

All are `window.__xDebug = true` in the console of the window that is rendering, throttled to one JSON
line per second. **A PLAYER VIEW ONLY** — the GM system view is the 2D orrery and never runs
`holo/scene.ts`, so setting these on the GM window prints nothing (RENDER-S19).

| hook | answers |
|---|---|
| `__camDebug` | where the camera is versus where the solver wants it: the shot, the chosen ladder level, actual distance, whether the drive is armed, and `targetDrift`. Settled RENDER-S15 (distance decaying 0.72% per frame) and disproved the obvious rotation-centre theory in the same run. |
| `__shipDebug` | how big a hull actually draws, and why. **Read `measured`/`measuredPx` and check `ratio` ≈ 1, not `drawn`/`onScreenPx`** — those are only what the code INTENDS, and once reported a serene 7 px while the hull was really 204 px (RENDER-S8). Also carries the facing chain. |
| `__routeDebug` | why a transit route line is not visible, in one line — covering every construct in transit rather than only the selected one, and the ship-facing chain with it. |
| `__ringDebug` | which FAMILY of orbit line the focused body has (a satellite's ring around a planet is built differently from a planet's ring around a star), plus a live PREDICTION in pixels of the wobble single-precision rounding would cause at the current zoom. |

## 4. Memory gauge and warnings

**WHERE:** `src/lib/memoryWatch.ts`. **SWITCH:** always on for the user-facing parts.

- **Settings → System → Memory** — used versus the browser's allocation limit, with a bar. Refreshed
  every 5 s while something subscribes, so an idle app pays nothing.
- **Warning banner** — once at 80% of the limit, again at 90%, re-arming only below 65% so a session
  sitting at the line is warned once rather than nagged. It sits above the load overlay deliberately.
- `readMemory()` returns `{ supported, usedMB, limitMB, frac }`.

**`performance.memory` IS CHROMIUM-ONLY.** Firefox and Safari expose nothing, and the UI says so
rather than reporting a fabricated zero. `jsHeapSizeLimit` is the ceiling the tab is actually killed
against, which is why the warnings are judged against it rather than against a fixed number of MB.
**Testing tip, used to verify the ladder:** `Object.defineProperty(performance, 'memory', {get: () =>
({usedJSHeapSize: X, jsHeapSizeLimit: Y})})` in the console drives both the gauge and the banner.

## 5. The diagnostic bundle — evidence from someone else's device

**WHERE:** `src/lib/io/diagnosticBundle.ts` (+ `diagnosticBundle.spec.ts`).
**THREE WAYS TO GET ONE:** after **Stop load** · from the safe-mode screen when a previous load never
finished · **on demand from Settings → System → Reporting a problem**, while the app is working
normally. The last is the one to ask a user for with any bug report, not just a load failure.

**ANSWERS:** something went wrong on a device you do not have. It is the only instrument here
designed for someone who is not a developer — a phone has no console, and a frozen app cannot be
asked anything.

A `.zip` containing:
- `README.txt` — what it is, what is in it, which file to load, and to post it to FrunkQ on the
  Discord. It adapts to how the bundle was produced.
- `report.json` — the reason; the guard stage; which systems were re-derived and which one it stalled
  on; every load stage with timings; memory against the limit; device (user agent, `deviceMemory`,
  `hardwareConcurrency`, screen, DPR); storage usage against quota; what was on screen; the map's
  **EXTENT** (the 85,103 ly measurement that started this); a shape summary of every system; and
  every perf counter.
- `starmap.json` — **always the file to LOAD**, whichever failure produced the bundle. Normally the
  map exactly as STORED: the input that reproduces the fault, test-loadable on your own machine, and
  a backup the user can restore.
- `starmap-in-memory.json` — present only when the live map differs from the stored one.

**THE TWO COPIES ARE THE POINT OF IT, and `report.json.map.source` / `.hasInMemoryCopy` tell you
which you have.** During a load, `recalcAllSystems` rewrites `node.system` IN PLACE, so the live map
is a half re-derived mixture that never existed on disk. **Stored copy = "does this data break the
loader at all?"** — load it here; if it loads fine on a desktop, the fault is the device or the
scale, not the data. **Live copy = "how far did it get, and what had it produced?"** — read it beside
`load.processed` and `load.stalledOn`. On demand the two differ only by unsaved edits. If storage
could not be read at all, the live copy takes the `starmap.json` name and `map.source` says
`in-memory` — do not read that as a faithful input.

**IT IS THE USER'S CAMPAIGN, INCLUDING GM NOTES** (engine map UI-L5). It is only built when they ask,
it downloads to their own device, nothing is uploaded, the README states what is inside, and it tells
them they may delete the map files and still send a useful report. Keep all four properties if you
extend it. The per-system summary carries shapes and counts only — the campaign travels in the named
files a user can remove, never smeared through the report.

**ASKING FOR ONE:** "Open Settings → System, scroll to *Reporting a problem*, and post the .zip it
saves." That is the whole instruction, and it works whether or not the user can reach a console.

## 6. Load safety (not an instrument, but it is what makes a hang reportable)

**WHERE:** `routes/+page.svelte`. See engine map **UI-L1 … UI-L4**.

- **Stop load** on the physics overlay, which also NAMES the system being processed — heard between
  systems, since one system's `process()` is synchronous. If it hangs, that name is the diagnosis and
  it is styled to survive a phone screenshot.
- **The load guard** — a `localStorage['sse-load-guard']` stage stamp armed before the auto-load and
  cleared on completion. Still set at startup means the last load never finished, so the map is NOT
  auto-loaded and the user is offered a way out instead of the same hang. **It clears on a painted
  frame OR a 15-second timer** — a hidden tab paints nothing, and without the timer a background-tab
  load trips it falsely (UI-L2).
- **The rescue export** reads storage and writes plain JSON, touching no renderer, processor or store,
  so a map that cannot load can still be recovered (UI-L4).

---

## 7. Reproducing a user's map locally — the technique that found the 85,103 ly crash

You do not have to wait for someone's file. The app auto-loads from IndexedDB on startup, so you can
write any map into storage and get the user's exact path, including the load overlay:

```js
// in the app's console: back up first, then write a repro map
const put = (k, v) => new Promise((res) => { const r = indexedDB.open('stargen_storage');
  r.onsuccess = () => { const tx = r.result.transaction('kv', 'readwrite');
    tx.objectStore('kv').put(v, k); tx.oncomplete = () => res(true); }; });
await put('saved_starmap', myMap);   // then reload
```

Coordinates are `system.position = {x, y, z}` in PIXELS (`scale.pixelsPerUnit`, 43.30127 px/ly on the
bundled maps). Grid overlay state is `localStorage['starmap-ui-store']`.

**AND VARY THE SETTINGS, not just the data.** The 85,103 ly map loaded perfectly until the snap-grid
overlay was switched on — the grid was the whole fault, and a repro that only copied the map would
have cleared the app of a bug it definitely had. When a reproduction does not reproduce, the missing
variable is usually a setting the reporter never thought to mention.

**Time a suspect loop directly rather than running it**, when running it would hang the tab:
replicate its body in the console, run it time-boxed for one second, and extrapolate. That is how
"4.36 billion iterations" became "1.8 hours and 670 GB, so it OOMs on any device" — a statement
strong enough to act on, obtained without ever hanging anything.

---

## What is NOT instrumented yet

Honest gaps, so nobody assumes coverage that does not exist:

- **Cold-load bundle cost on a low-end device** — `npm run build` prints chunk sizes, but nothing
  measures parse/execute time on the device, planet texture generation (equirect canvases are CPU
  drawn at load) or belt particle budgets against the `beltDetail` knob.
- **Other loops sized in map units.** `Grid.svelte` was the crash (UI-L7) and is now gated, but the
  scale bar, rulers and any future snap overlay share the shape and are unaudited. `Starmap.svelte`
  also passes Grid a hardcoded `viewWidth={800} viewHeight={600}` rather than the real viewport.
- **A same-system PATCH path** does not exist; `holo.setSystem.same` measures the opportunity, not a
  fix. Still deliberate: the 2026-08-07 ruling that the rebuild rate is not a problem yet has been
  overtaken by inbox **P2** (it was SEEN — 146 wasted rebuilds of 148 in 20 s), but the instruction
  not to build a patch path speculatively stands. **Read the event ring's `sameRef` first**: if the
  storm is re-fires on one unchanged object, a patch path is not the fix and neither is a gate.
- ~~WHY a rebuild fired is not recorded~~ — **CLOSED 2026-08-17 (P2).** `setSystem` takes a `reason`,
  counts `holo.setSystem.by.<reason>`, and lands a row in the always-on event ring; dump it with
  `__ssePerf.events(60, 'holo.setSystem')`. See §1.
- **A PLAYER VIEW CANNOT PRODUCE A DIAGNOSTIC BUNDLE.** `buildDiagnosticBundle` is offered only from
  the GM route (`routes/+page.svelte`); the catalogue has no equivalent. So the counters and the event
  ring are reachable on a player view **only through a console** — which a phone does not have. A
  player hitting the P2 rebuild storm on a tablet still has no way to report it, and that is the next
  gap worth closing in this area.
- **Baselines** — no captured before-column yet for the GM view, a player view idle, a player view
  with a ship in transit, or any phone. **Parked with the item above**, not abandoned: they belong to a
  dedicated performance-tuning pass rather than to a bug hunt (inbox **P1**).
