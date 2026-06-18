# Autopilot — design spec & plan

Status: **BANKED / not scheduled.** This is the consolidated design for a future "construct autopilot"
feature. Nothing here is built. It records the agreed concept, the knobs, the event mechanics, the data
model, the proposed UI, and a build sequence — so it can be picked up cleanly when green-lit.

Related: the interstellar-travel arc (log-driven journeys) is the foundation this rides on; autopilot is
mostly a *planner that emits itinerary records* plus one new *event-resolution pass*.

---

## 1. Core idea

A GM assigns a construct a **role** and the ship flies itself over game time — patrolling, hauling cargo,
running a trade circuit — inserting its own refuelling, crew/shore-leave and maintenance stops, occasionally
breaking down and being rescued. The GM watches it unfold on the starmap and reads the **ship's log** to see
exactly what happened and why.

## 2. Architectural spine (why it's cheap)

The interstellar work already establishes: **the journey log is the single source of truth**, and a ship's
position at any time is *derived* from log + clock (`constructDisplayPlacement`), with persistent state
committed only at "actual" (master) time. Autopilot reuses this:

- A **planner** appends (possibly repeating) journey/segment records to that same ledger.
- Display/scrubbing already work for free — they just read the ledger.
- **Determinism is mandatory.** Every "random" element (tardiness slack, breakdown rolls) must be derived
  from a **seed + ship id + time**, never a live RNG, so scrubbing back reproduces the same timeline.
- Only **inter-ship interaction** (breakdown → SOS → rescue) needs more than lazy per-ship derivation: a
  forward **event-resolution pass**. Everything else is independent per ship.

## 3. Roles

**Don't model a fixed list of roles — model the AXES every role decomposes into, then ship the named roles
as presets.** That way a new mission type is a new preset, not new code.

### 3a. The anchoring axes
- **Trigger / cadence** — what makes the next trip happen:
  - *Timetabled* (fixed departure times) · *Frequency* (revisit each waypoint within an interval) ·
    *Continuous* (loop as fast as able) · *Demand-driven* (stochastic rate scaled by population /
    enterprise size) · *One-shot* (single itinerary) · *Standing* (loiter / wait for an event).
- **Route topology** — the shape of the work:
  - *Circuit, visit-all* · *Out-and-back source↔sink* · *Point-to-point* · *Loiter / station-keep* ·
    *One-way relocation*.
- **Order policy** — how free the planner is to reorder:
  - *Fixed* (the timetable IS the order) · *Reorderable, full-coverage* (patrol — visit all, rotate for
    alignment + staleness) · *Precedence* (cargo/mining — pickup before its dropoff).
- **Load / fuel profile** — drives the per-leg speed/efficiency pick:
  - *Symmetric* · *Asymmetric* (out light + fuelled ⇒ fast legs possible; back heavy ⇒ efficiency legs) ·
    *Passenger* (board/alight, comfort/time-sensitive).
- **Purpose tag** — deliver · extract · presence · transport-people · explore · support-other-ships.

### 3b. Named roles = presets over those axes
| Role | Trigger | Topology | Order | Load |
|---|---|---|---|---|
| **Scheduled service** (cargo/passenger) | Timetabled | Circuit visit-all | Fixed | passenger symmetric / cargo asymmetric |
| **Patrol** | Frequency | Circuit visit-all | Reorderable, full-coverage | symmetric |
| **Ad-hoc cargo** | Demand-driven (pop/enterprise) | source↔sink / point-to-point | Precedence | asymmetric |
| **Mining run** | Continuous | Out-and-back (belt points → refinery) | Precedence | asymmetric (out fuelled-fast, back ore-efficient) |
| **Courier / express** | One-shot or on-demand | Point-to-point | Fixed | light, speed-prioritised |
| **Tender / support** | Standing (responds to SOS / low fuel) | Point-to-point to the casualty | dynamic | carries fuel/parts — formalises the rescue ship |
| **Picket / station-keeping** | Standing | Loiter at a point (optional short sweeps) | n/a | symmetric |
| **Survey / exploration** | Frequency or one-shot | Circuit visit-all (prefers unvisited) | Reorderable | light |
| **Relocation / migration** | One-shot | One-way | Fixed | heavy, one-way |
| **Bespoke (GM-scripted)** | One-shot | any | Fixed (hand-ordered) | any | ← the catch-all for anything not a preset |

Cargo/mining roles carry **cargo state** (what's aboard, where bound), so a dropoff can't be reordered
before its pickup. Patrol/survey carry the coverage + staleness rule (§5). **Tender/support** is the natural
home for the breakdown-rescue behaviour (§6) — a ship can be dedicated to it, or any spare ship can pick it
up. **Bespoke** guarantees the system can always express a one-off the presets don't cover.

## 4. Inputs / knobs (per ship)

- **Role** + its waypoint list (picked from tagged waypoint PoIs — see §8).
- **Tardiness (0..1):** natural slack/variance added to legs. 0 = disciplined military, on-time, best
  efficiency; 1 = "Bob's trading", days disappear. Deterministic per leg (seed+time), not live random.
- **Speed ↔ Efficiency (0..1):** continuous trade of transit time vs fuel/efficiency, within fuel limits.
- **Lookahead "Detailed ↔ Seat-of-the-pants" (0..5 trips):** how many trips ahead the planner optimises.
  - `0` → decide the next destination only **on arrival** (greedy / as-assigned).
  - `1–5` → search orderings of the next N targets and pick the best **overall** (fastest or most
    efficient) using *projected* orbital positions at the estimated arrival times. Patrol may swap order
    "when the planets align"; cargo reorders only within pickup-before-dropoff constraints.
  - **Coverage rule (patrol):** patrol means *visit them all*. Optimisation reorders a **complete circuit**
    of the waypoints (a closed tour) — it must NOT minimise per-hop distance, or with A & B closest it
    would just shuttle A↔B and starve C, D, E. So the objective is "cheapest full loop that visits every
    waypoint", plus a **staleness/fairness** term: the longer a waypoint has gone unvisited, the more its
    visit is prioritised, so efficiency reordering can never indefinitely defer a far waypoint. Lookahead
    chooses *which leg of the full circuit to fly next* (and whether to rotate the loop's order when
    alignment favours it), never *which waypoints to skip*.
- **Maintenance cadence:** planned shore-leave/maintenance interval; following it lowers breakdown chance.

## 5. The planner

Runs at each **decision point** (on arrival, or at a scheduled re-plan), deterministically from the clock:

1. Gather the candidate next N targets (N = lookahead).
2. For patrol: enumerate orderings of the **full circuit** (visit-all closed tour, ≤5 waypoints ⇒ brute
   force is trivial) — never a subset. For cargo: enumerate orderings that respect cargo precedence.
3. For each ordering, project each leg using forward orbital positions, the speed/efficiency setting, and
   per-**fuel-type** consumption; cost = total time or total fuel (per the slider) **minus a staleness
   credit** for waypoints overdue a visit, so a far-but-neglected waypoint isn't perpetually deferred.
4. Pick the best ordering; emit its first leg(s) as journey records, **pre-acquiring fuel** for future legs
   (insert refuelling segments by fuel type / availability).
5. Insert non-travel segments as needed: refuel, crew change (company) or shore leave (private),
   maintenance, loading/mining dwell.

Because it's deterministic given the clock, re-running at the next decision point is safe and scrubbable.

## 6. Events: breakdown → SOS → rescue (the hard part) — BANKED (future, dropped from the current build; see §12.9)

- Each ship has a **% chance / year** of breaking down, rolled **deterministically** (seed + ship + time).
- On breakdown the ship **stops in space** (new "stranded/adrift" state already exists from the interstellar
  work) and broadcasts an **SOS**.
- The responder is the ship with the **soonest ETA to the casualty** (DECIDED — not nearest by raw
  distance). ETA = time to divert from its current derived position to the casualty at *its* capable speed,
  so a fast/dedicated **tender** beats a closer but slow returning hauler (which may still get lucky on
  position). This reads right both logically and as a game: it makes a purpose-built rescue ship worth
  having. On arrival the casualty is "fixed" and resumes (and is flagged as **needing maintenance**,
  raising its near-term breakdown chance until serviced).
- This is the one piece that breaks pure per-ship derivation (ships react to each other), so it needs a
  **forward event-resolution pass**: advance the timeline → detect breakdowns → assign the soonest-ETA
  responder → splice a diverted rescue leg into *that* ship's itinerary → continue. Still deterministic,
  still committed only at actual time.
- **Maintenance schedule** feeds the breakdown probability: regular shore-leave/maintenance ⇒ lower chance.

## 7. Ship's log — the real tool

Every meaningful happening is a **timestamped log record**, enough to recreate any position in time:

- `depart` / `arrive` (leg) — from, to, fuel type, fuel used, planned vs actual duration.
- `delay` — tardiness slack applied (with the amount + that it was tardiness, not an event).
- `refuel` — where, fuel type, amount, why (top-up for legs X, Y).
- `load` / `unload` — cargo type, amount; loading/mining **rate per day** and dwell time.
- `crew-change` / `shore-leave` / `maintenance` — where, duration.
- `breakdown` / `sos` / `rescued-by {ship}` / `repaired` — the event chain.
- `replan` — the planner chose an ordering (and *why*: "reordered patrol — Vesta now nearer").

The "why" is first-class: each record carries a short human reason, so the log reads as a narrative, not
just coordinates.

### Totals / Averages tab
Derived purely by aggregating the log — no extra state:
- cargo transferred (by type), efficiency (**tonnes / annum**), fuel burned by type,
- waypoints visited / loops completed, time under way vs docked, breakdowns & rescues,
- on-time % (planned vs actual), distance travelled.

## 8. Waypoint support — a PoI pack

Autopilot needs tagged destinations. Ship a dedicated **PoI pack** (reusing the existing pack system) that
recognises/creates waypoints: **refuel** (by fuel type), **crew change**, **ship dock**,
**maintenance / shore leave**, **market / refinery**, **mining source**. The planner queries these when
inserting service segments and when choosing/optimising routes.

## 9. UI proposal — keep it simple

### 9a. Assigning autopilot (construct panel → new "Autopilot" tab)
A single compact panel, progressive disclosure:

```
┌ Autopilot ───────────────────────────────┐
│ ⦿ Off   ○ Patrol   ○ Mining   ○ Trade     │   ← role radio
│                                           │
│ Route: [ + add waypoint ]                 │   ← picks from waypoint PoIs (hierarchical picker)
│   1. Vesta Station        ⋮               │     drag to reorder (manual), ✕ remove
│   2. Ceres Refinery       ⋮               │
│   3. Pallas Depot         ⋮               │
│                                           │
│ Discipline  Military ●──────── Bob's      │   ← Tardiness slider, named ends
│ Drive       Thrifty  ────●──── Fast       │   ← Speed/Efficiency slider
│ Planning    Reactive ──●────── Detailed   │   ← Lookahead 0..5 (tick marks)
│ Maintenance every [ 2 ] years             │
│                                           │
│ [ Engage ]                  est: 1.3 t/yr │   ← live efficiency preview
└───────────────────────────────────────────┘
```

- Named slider ends carry the meaning (no numbers needed) — matches the existing slider style.
- "Engage" emits the first itinerary; the ship starts flying on the starmap (existing rendering).
- Editing any knob = a timestamped re-plan (reversible, like every other journey edit).

### 9b. Reading the log — a timeline viewer
From the ship panel → **"Log"** (and a starmap-level entry for the whole fleet):

```
Ascension Heavy Lifter — Log            [ Timeline | Totals ]
────────────────────────────────────────────────────────────
▾ 2387  (filter: ☑ travel ☑ cargo ☑ service ☑ events)
  04 Mar  ⛽ Refuelled at Ceres (H₂, 40 t) — top-up for Pallas leg
  06 Mar  🚀 Departed Ceres → Pallas    planned 9d
  08 Mar  ⏳ +2d slack (relaxed schedule)
  17 Mar  📦 Loaded 120 t ore at Pallas (15 t/day, 8 days)
  25 Mar  ⚠️  BREAKDOWN — adrift, SOS sent
  28 Mar  🛟 Rescued by Kestrel — under way again
  29 Mar  🔧 Flagged for maintenance
  …
```

- **Filter chips** (travel / cargo / service / events) so the GM can focus.
- Each row is the record's **human "why"** — the log reads as a story.
- Click a row → the starmap/orrery scrubs to that moment (position is derived, so this is free).
- **Totals tab** = the §7 aggregations as stat cards.

This makes the log a genuine play tool: not just "where is it" but "what happened and why", and a slider to
relive it.

## 10. Build sequence (when green-lit)

1. **Log records + cargo accounting + Totals tab** — highest value, pure log/aggregation, no new engine.
2. **Waypoint PoI pack** — destinations the planner can query.
3. **Planner: lookahead** — patrol reorder first, then precedence-constrained cargo; per-fuel-type planning.
4. **UI** — the Autopilot tab and the Log/Totals viewer, layered on as the data behind them lands.
5. **~~Maintenance~~ + ~~Breakdown → SOS → rescue~~** — **BANKED (future, §12.9)**; dropped from the current
   build. The inter-ship event pass is deferred — autopilot works fully without it.

## 11. Open questions / risks

- **Determinism of events:** breakdown/tardiness rolls must be seed+time derived; confirm the seed scheme
  early or scrubbing breaks.
- **Event pass cost:** the rescue interaction means a forward simulation over the active fleet between the
  last actual time and the display time — bound its horizon (don't simulate centuries).
- **Rescue selection:** ~~nearest-now vs nearest-ETA~~ **DECIDED: nearest-ETA** (Alex 2026-06-15) — accounts
  for the responder's speed so a dedicated tender beats a closer slow hauler; better logic and game value.
  Costs a per-candidate ETA estimate during the event pass, which is acceptable.
- **Manual vs auto reorder:** GM hand-orders a route AND sets Detailed lookahead — does the planner override
  the manual order? Proposal: manual order is the *seed*; lookahead only reorders patrol, and shows a
  "reordered because…" note in the log so it's never silent.
- **Cargo economy depth:** harvest/load rates and market amounts — how much economy to model vs hand-wave.

---

## 12. Refinement pass (Alex, 2026-06-17) — the "sentence" tab, status, route modes, cargo, the 3-way

This supersedes the rougher §9a mock and resolves the open speed/efficiency/route question. It also leans on
the CoI work just shipped (Owner → tardiness, Purpose → role vocabulary, the construct tag system).

### 12.1 The Autopilot tab — a WIZARD builder (Alex 2026-06-17: not a literal sentence)
The tab is a compact guided builder in three sections. Mockups shown + approved-in-principle.

**(A) Route**
- **Traversal** — a segmented control: **All · in order** (fixed circuit) | **All · best order** (visit all,
  reorder for alignment — §12.3) | **Any · as needed** (don't visit all; go to whichever one is best/needed —
  the miner-picks-nearest-ore / tanker-tops-up-nearest-depot case).
- **Locations** — a list; each row is built from dropdowns: **WHERE** (toggle **Place** = a specific
  body/station, OR **Resource** = the nearest source of `resource/X` — uses the resource tags) → **action**
  (Mine / Scan / Load / Unload / Dock / Patrol — **suggested from the ship's capability tags**, GM-overridable)
  → for Mine/Load a **deliver-to** drop-off (Place or Resource). For Mine/Skim/Load the row also shows the
  **rate** ("Mine at `15` t/day", defaulted from the hull's capability, editable — see 12.6).

**(B) Behaviour** (the "character" sliders, named ends, no bare numbers):
- **Discipline** (= Tardiness) — Military·on-time ↔ Bob's·days-slip. **Defaults from the Owner CoI**, overridable.
- **Planning** (= Lookahead 0–5) — Reactive·decide-on-arrival ↔ Detailed·5-ahead. THIS is the trade-off
  analysis: at higher levels it reorders the run and **waits for an alignment when it pays off** ("hold 50 d to
  save 100 d overall"). Only this slider unlocks that reasoning.
- **Drive** (= Speed↔Efficiency) — Thrifty·save-fuel ↔ Fast·burn-hard. Per-leg burn + the reorder cost function.

**(C) Logistics** — checkboxes, automated by default: **Auto-refuel** (keep fuel for `[N]` journeys ahead) and
**Auto-restock** life support. Uncheck either to manage it by hand (simplicity escape hatch).

"Engage" saves the plan (first build = capture-only; the planner that flies it is the next step). A stuck ship
flags a **`!`** for GM attention; the **Routes** panel gets an **"Under autopilot"** section listing each
autopiloted ship + its current action + any `!`. (The slider/3-way detail is unchanged below.)

### 12.2 Status — knowing it's on autopilot, and stopping gracefully
- **Derived status.** A construct under autopilot carries a derived `status/autopilot` tag (mirrors the
  existing derived `status/adrift` / `status/in-transit-*`), so Find-by-tag lists "all autopilot ships" for
  free and the chip shows on the ship.
- **Live action read-out.** Its CURRENT verb is derived from the itinerary at the display clock — the ship
  panel + starmap label show e.g. `⚙ Autopilot · Patrolling → Ceres`, `⚙ Autopilot · Loading at Pallas (3 d
  left)`, `⚙ Autopilot · Refuelling`, `⚙ Autopilot · ADRIFT — SOS`. The faint planned circuit can draw on the
  orrery/starmap with the current leg highlighted, so "is it following?" is obvious at a glance.
- **Disengage = stop at the NEXT planned stage.** Turning autopilot off does NOT cut the current leg. The
  planner simply stops emitting anything beyond the next waypoint; the ship completes the in-flight leg,
  arrives, parks/holds, and reverts to manual. Log: "Autopilot disengaged — completing leg to Ceres, then
  standing by." (A separate deliberate "Halt now" strands it adrift — the existing cancel-drift path.) This
  is natural in the derive-from-clock model: the next-stage leg is already in the ledger; we just truncate
  future emission.

### 12.3 Patrol routes — fixed vs free (the user's two patrol kinds)
The route-mode token is the whole answer to "sometimes vary by position, other times always the same route":
- **Fixed order** — always Vesta → Ceres → Pallas → repeat, and accept whatever distances fall out. Honour
  the promise; predictable.
- **Free / reorder** — the planner may rotate the **full-coverage closed tour** for orbital alignment
  (§4 lookahead, §5 planner), with the staleness/fairness term so no waypoint is ever starved. It NEVER drops
  a waypoint — patrol means visit them all.

### 12.4 The 3-way (Speed vs Efficiency vs Route) — resolved without a ternary slider
The three pull against each other, but they are NOT one continuous 3-axis quantity, so don't force a (non-
existent) triangle slider. They decompose cleanly:

- **Route adherence is a MODE, not a slider.** You either keep the promised order or you let the planner
  reorder — a switch (12.3), not a smooth dial.
- **Once Free, the SAME Speed↔Efficiency preference drives the reorder objective** (minimise total time vs
  total fuel). So route-freedom doesn't add a third weight to balance — it just *unlocks more ways to satisfy
  the one speed/fuel preference you already set*. The third dimension collapses into a **permission**.
- **The DEGREE of freedom is Lookahead** (Reactive ↔ Detailed, 0..5), and it only matters in Free mode.

So the apparent 3-way = **one toggle (Fixed/Free) + two sliders (Speed↔Efficiency, Lookahead)**, Lookahead
live only when Free. Compact alternative if a single "feel" knob is wanted: a 3-stop **segmented** control
"Keep the route · Tweak for alignment · Chase the best run" that bundles {mode + lookahead depth} — a
*discrete* 3-way (segmented buttons exist; continuous ternary sliders don't).

### 12.5 How each control affects routing, and how it can evolve
| Control | v1 routing effect | Evolution path |
|---|---|---|
| **Drive bias** (Speed↔Efficiency) | Per-leg thrust fraction → transit time vs Δv/fuel; in Free mode it IS the reorder cost function (min time ↔ min fuel) | Load-aware asymmetry (auto fast-when-light-and-fuelled, efficient-when-heavy from cargo state); a "Δv budget" the planner spends optimally; per-leg override |
| **Route mode** (Fixed↔Free) | Whether the planner may reorder the full-coverage loop at all | Per-waypoint pins (some stops fixed, others floatable); alignment-window waiting ("hold for a cheaper launch"); an improvement threshold ("only reorder if >X % better") |
| **Lookahead** (Reactive↔Detailed) | How many upcoming legs the reorder search optimises over | Adaptive depth (deeper when alignments are volatile, shallow when stable); cost-bounded search |
| **Discipline** (Tardiness) | Deterministic slack on legs/dwells — reliability, NOT optimisation; defaults from Owner CoI | Event-driven delays (port congestion); morale; catch-up behaviour after a slip |
| **Maintenance cadence** | Inserts service dwell; lowers breakdown probability (§6) | Condition-based servicing (when wear is high, not a fixed interval); yard cost/availability |

### 12.6 Cargo — rates, state, and the log
- **Rate-driven dwell.** A cargo action at a waypoint has a **rate (t/day)**: load, unload, or mine. Dwell =
  amount ÷ effective rate. Effective rate = `min(ship handling rate, facility throughput)` for load/unload;
  for mining = `ship extraction rate × source richness`.
- **Where the rates live.** Ship handling/extraction rate = a construct property (default scaled from hull
  size / presence of the `purpose/mining` CoI); facility throughput / source richness = a waypoint-PoI
  property. v1 may hand-set a single t/day per stop and refine later.
- **Cargo as state.** What's aboard (type, amount, bound-for), capped by the existing
  `physical_parameters.cargoCapacity_tonnes`. Load adds, unload removes; precedence holds (no dropoff before
  its pickup). The GM can also **add/adjust cargo by hand** — and that edit is logged too.
- **Everything hits the flight log.** `load` / `unload` / `mine` are timestamped records carrying type,
  amount, rate, dwell ("Loaded 120 t ore at 15 t/day — 8 days"). The Totals tab aggregates tonnes/annum,
  fuel by type, loops completed, on-time %, etc. (§7).

### 12.7 Data model (additive)
A single `autopilot` object on the construct, edited by the tab, consumed by the planner:
```
autopilot?: {
  enabled: boolean;
  role: string;                 // a purpose key
  waypoints: { poiId: string; action?: { kind: 'load'|'unload'|'mine'; cargo?: string; amount?: number|'all' } }[];
  routeMode: 'fixed' | 'free';
  speedEfficiency: number;      // 0 = efficiency … 1 = speed
  lookahead: number;            // 0..5 (only used when routeMode==='free')
  tardiness?: number;           // 0..1; undefined ⇒ inherit from Owner CoI
  maintenanceYears?: number;
  cargo?: { type: string; amount: number; boundFor?: string }[];   // current manifest
}
```
The planner reads this + the waypoint PoIs and emits journey/service/cargo records into the SAME log the
resolver already reads. Disengage flips `enabled` and truncates emission at the next stage (12.2).

### 12.8 Build order for the tab specifically (within §10)
1. The `autopilot` data object + the sentence tab (no planner yet — just captures intent + shows the sentence).
2. Status derivation + badge + disengage-at-next-stage (reads the itinerary; cheap).
3. Wire the planner (§5) so Engage actually emits a patrol circuit (Fixed first, then Free/lookahead).
4. Cargo rates + manifest + log records (§12.6) for mining/haul roles.

That's the autopilot scope for now — sentence tab → status → planner → cargo. It's all per-ship,
deterministic, and rides the existing log model.

### 12.9 BANKED for later — Maintenance + Breakdown → SOS → rescue (Alex, 2026-06-17)
Explicitly **dropped from the current build** and banked as a future feature. This is §6 + the maintenance
cadence: the % -chance-per-year breakdown, the SOS, the soonest-ETA responder, and the **forward
event-resolution pass** that splices a rescue leg into another ship's itinerary. It's the ONE piece that
breaks pure per-ship derivation (ships react to each other), so it's the natural thing to defer — autopilot
works fully without it. Pick it up only when the rest is solid and there's appetite for the inter-ship
simulation. (§6 above is the design, kept for when it's green-lit.)

### 12.10 Flyby / Race = loiter 0 (NOT a separate action) (Alex, 2026-06-18)
Flyby is **not its own verb** — it's the **loiterDays === 0** case of the LOITER family (patrol / explore). A
patrol/explore leg with loiter 0 doesn't stop: it keeps its velocity / delta-v and passes through. This makes
patrol/explore multipurpose (a *fast patrol* when not loitering) and keeps the action list to four. The
wizard surfaces it as a hint under the loiter field ("0 = flyby — races past without stopping"); the Routes
summary prints `flyby …` when loiter is 0.

**Planner side is BANKED** — this is the hard part. Every other leg assumes **arrive-at-rest**, so legs plan
independently. A flyby (loiter 0) chains momentum leg-to-leg:
- Next destination roughly **ahead** → coast/burn through (big time + fuel win).
- Next destination **the other way** → still must scrub speed (decel burn) or **gravity-slingshot** to redirect.

So the planner must carry the velocity vector across legs and choose coast / scrub / slingshot per junction —
a different model from the come-to-rest planner (§5), deferred until that's solid. **Caveat (Alex):** with
Planning = 1 (look only one ahead) a flyby is a *terrible* idea — the ship zips past, THEN plans the next
hop, having thrown away the approach. Possible, but it wants high Planning to be sensible.

### 12.11 Tardiness = random slack on STOPPED time only (Alex, 2026-06-18)
Discipline/Tardiness adds a **random** (seed+time-derived, so still reproducible/scrubbable) slack scaled by
the slider to **time the ship spends stopped** — loading, unloading, mining dwell, loitering, docking,
refuelling. It does **not** perturb transit time, and it has **no effect on a flyby (loiter 0)** because the
ship never stops. (Supersedes the earlier "deterministic slack on legs/dwells" framing in §12.5: it's random
slack on *stops*, not legs.)

### 12.12 Run-once vs Repeat + the attention-marker taxonomy (Alex, 2026-06-18)
A **Repeat ↔ Run once** toggle (`autopilot.repeat`, default repeat). Repeat loops the route forever (today's
behaviour); **Run once** completes the route a single time, then **auto-disengages** autopilot and flags the
ship for the GM. This completes the cadence axis (courier one-shots, one-way relocation/migration,
decommission runs) without a new action.

The **Routes "Under autopilot" `!` marker** is now a 3-state, colour-coded signal (`AutopilotAttention`):
- **Red — stuck.** Can't proceed (no fuel/route, blocked). Needs attention. (Planner-set; banked.)
- **Orange — intervention.** Something needs a GM decision. Currently also covers "no stops set" (setup).
- **Green — done.** Finished a Run-once route and auto-disengaged. (Planner-set; banked.)

Capture build wires the colours + labels and derives the orange "no stops" case now; red/green are set by the
planner when it flies the plan (auto-disengage-on-complete is planner work).

### 12.13 Escort / shadow — a DYNAMIC (moving) target (Alex, 2026-06-18)
A fifth action, **Escort**: shadow another **construct** at a **standoff distance** (`escortKm`) — 0 = tight
formation, large = trail outside the target's sensor range (a covert tail or a stand-off support vessel). This
introduces the one genuinely new targeting concept: the leg's target is a **moving construct**, not a fixed
place or a resource source. Capture build = pick a ship (constructs-only list) + a km standoff.

**Planner side BANKED:** matching a moving target's trajectory while holding a distance is a station-keeping /
pursuit problem, distinct from the go-to-a-point legs — it shares the "target isn't a fixed point" machinery
with the flyby momentum work, so bank the two together. Open Qs for later: what if the target jumps
interstellar / is destroyed / itself goes adrift (does the escort hold, follow, or rescue?).

### 12.14 BANKED/DROPPED — Timetabled departures (Alex, 2026-06-18)
Scheduled/fixed-cadence departures (a liner that leaves every N days regardless of readiness) are **dropped as
largely redundant**: firm timetables only make sense when distances are fixed, and in this sim everything
orbits/moves, so "depart on a clock" rarely matches reality. The derive-from-clock "go when ready + Planning
look-ahead" model already covers the sensible cases. Revisit only if a fixed-infrastructure (gates/stations)
scheduled-service use case appears.

### 12.15 Max-acceleration cap (Alex, 2026-06-18)
A `maxAccelG` cap (g) in Behaviour, **below the drive's true ceiling** (undefined ⇒ full thrust). Two uses:
- **Comfort / economy** — don't redline the engines (passenger comfort, wear, fuel).
- **Escort cohesion** — cap the **lead** ship's accel so slower escorts/support craft don't get left behind.

It bounds the transit the planner may select: where **Drive** picks a point within the available
speed/efficiency range, **Max accel** lowers the top of that range. Capture build = a g number input (blank =
full); the planner clamps the chosen brachistochrone/burn to `min(maxAccelG, ship maxVacuumG)`. The ship's
real ceiling is the derived `maxVacuumG` (construct-logic.ts) — surface it as a hint when the planner lands.

**Surfaced (v2.0.179):** the control shows the drive's accel **range** — fully fuelled → empty — derived by
scaling `maxVacuumG` (computed at *current* fuel) by mass: empty = thrust/massDryOfFuel, full =
thrust/(massDryOfFuel + fuelCapacity). Needs rulePack engine+fuel defs threaded into the tab (now passed from
ConstructSidePanel). Kills the "my 15 g torch only does 1 g" confusion — full tanks are heavy.
