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

| Role | Pattern | Reorderable? |
|---|---|---|
| **Patrol** | Loop a set of waypoints | **Yes** — no precedence; reorder freely for efficiency |
| **Mining run** | Source(s) → refinery/market → repeat; loads ore/day at source | Partial — **pickup must precede its dropoff** |
| **Cargo / trade circuit** | Buy at A, sell at B, … | Partial — **pickup before dropoff** per consignment |

Cargo roles carry **cargo state** (what's aboard, where it's bound), so the planner can't reorder a dropoff
before its pickup. Patrol carries no such constraint.

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
- **Maintenance cadence:** planned shore-leave/maintenance interval; following it lowers breakdown chance.

## 5. The planner

Runs at each **decision point** (on arrival, or at a scheduled re-plan), deterministically from the clock:

1. Gather the candidate next N targets (N = lookahead).
2. For patrol: enumerate valid orderings (≤5 ⇒ brute force is trivial). For cargo: enumerate orderings
   that respect cargo precedence.
3. For each ordering, project each leg using forward orbital positions, the speed/efficiency setting, and
   per-**fuel-type** consumption; cost = total time or total fuel (per the slider).
4. Pick the best ordering; emit its first leg(s) as journey records, **pre-acquiring fuel** for future legs
   (insert refuelling segments by fuel type / availability).
5. Insert non-travel segments as needed: refuel, crew change (company) or shore leave (private),
   maintenance, loading/mining dwell.

Because it's deterministic given the clock, re-running at the next decision point is safe and scrubbable.

## 6. Events: breakdown → SOS → rescue (the hard part)

- Each ship has a **% chance / year** of breaking down, rolled **deterministically** (seed + ship + time).
- On breakdown the ship **stops in space** (new "stranded/adrift" state already exists from the interstellar
  work) and broadcasts an **SOS**.
- The **nearest other autopilot ship** charts a course to it; on arrival the casualty is "fixed" and resumes
  (and is then flagged as **needing maintenance**, raising its near-term breakdown chance until serviced).
- This is the one piece that breaks pure per-ship derivation (ships react to each other), so it needs a
  **forward event-resolution pass**: advance the timeline → detect breakdowns → assign the nearest rescuer →
  splice a diverted rescue leg into *that* ship's itinerary → continue. Still deterministic, still committed
  only at actual time.
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
4. **Maintenance** — cadence + breakdown-probability input + inserted segments.
5. **Breakdown → SOS → rescue** — last; the only piece needing the forward event-resolution pass.
6. **UI** — the Autopilot tab and the Log/Totals viewer, layered on as the data behind them lands.

## 11. Open questions / risks

- **Determinism of events:** breakdown/tardiness rolls must be seed+time derived; confirm the seed scheme
  early or scrubbing breaks.
- **Event pass cost:** the rescue interaction means a forward simulation over the active fleet between the
  last actual time and the display time — bound its horizon (don't simulate centuries).
- **Rescue selection:** "nearest other auto ship" — nearest by distance now, or by ETA? ETA is righter but
  costs more to evaluate. Probably distance-now for v1.
- **Manual vs auto reorder:** GM hand-orders a route AND sets Detailed lookahead — does the planner override
  the manual order? Proposal: manual order is the *seed*; lookahead only reorders patrol, and shows a
  "reordered because…" note in the log so it's never silent.
- **Cargo economy depth:** harvest/load rates and market amounts — how much economy to model vs hand-wave.
