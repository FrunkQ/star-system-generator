# Lagrange points become full citizens (G43) — design note

Status: PHASE 0 — awaiting owner answers to Q1-Q7 at the end of this note. No code ships before
those answers. Worktree `sse2-g43-lpoints`, branch `wt/g43-lpoints`.

The owner's brief (inbox G43, 2026-08-25): place trojan BODIES at L4/L5, show the points as AREAS
when enabled, placement filtered to appropriate mass; stability calcs updated to say when the
trojan regime is breached, with tags on the body; constructs placeable at ALL FIVE points (was
L4/L5 only) and flyable there, with the transit system doing velocity cancelling properly;
constructs get fuel-use tags (negligible at L4/L5, station-keeping at the others — better words
invited).

## 1. The territory as measured

Five independent pieces of code answer "where is an L-point", and no two of them agree.

| Surface | Where | Convention |
|---|---|---|
| Orrery overlay | `physics/lagrange.ts` (only consumer: `SystemVisualizer` `showLPoints`) | L1/L2 at the Hill cube-root distance along the sun-line; L3/L4/L5 as points ON the secondary's ellipse at true anomaly +180/+60/-60 |
| Construct authoring | `ConstructGeneralTab.svelte:274` / `AddConstructModal` | parentId = the STAR, `ui_parentId` = the secondary, orbit = a one-off deep COPY of the secondary's orbit with `M0_rad` shifted by +-60 deg; `placement` string 'L4'/'L5' |
| Transit solve | `transit/calculator.ts:322` | phantom target = the secondary's orbit with `M0_rad` + offset (l3/l4/l5), or `a_AU` REPLACED by the panel's parking radius (l1/l2) |
| Post-arrival parking | `transit/scheduler.ts:573` | synthetic node = the secondary's orbit with `omega_deg` rotated (+180/+60/-60), or `a_AU` scaled 0.99/1.01 for l1/l2 |
| Planner dropdown radii | `physics/orbits.ts:571` | l1 = radius + minLeo + 0.8 x SOI, l2 = 1.2 x SOI — planet-centric distances, a third L1/L2 convention |

For an eccentric secondary these disagree by a lot: shifting MEAN anomaly by 60 deg is not the
same place as rigidly rotating the ellipse by 60 deg (the gap is order `2 e a`, which for Jupiter
is ~0.44 AU).

**The correct convention** (and the one to unify on): the L4 point forms an equilateral triangle
with the two primaries at every instant, including on an eccentric orbit. A body on the
secondary's ellipse **rigidly rotated by +-60 deg in argument of periapsis, with the SAME mean
anomaly**, holds that triangle exactly, and it is itself a genuine Kepler orbit — same a, e,
period; radius r(f) matching the secondary's at all times; L3 likewise at +180 deg. So l3/l4/l5
have an exact Keplerian representation, which is why they cost no station-keeping. The scheduler's
rotation is the right shape already (modulo its 0.99/1.01 l1/l2 hack); the calculator's M0-shift,
the authoring tab's M0-shift, and the overlay's ellipse-point-at-f+-60 are all approximations that
disagree with it. L1/L2 have NO Keplerian representation (they co-rotate at the secondary's
angular rate at a different radius — that is the whole point of them) and must be positioned
parametrically: along the instantaneous sun-secondary line at the Hill cube-root distance
`r x (m2/3M1)^(1/3)` (display-grade; the exact quintic solution is not worth the code).

### Phase 0 probe — what an L-point arrival actually gets today

Measured 2026-08-25 with a scratch spec (`src/lib/transit/g43-probe.spec.ts`, worktree-only, not
shipped): the Sol Expanse fixture, a construct at 3 AU flown to L-points, plan terminal segment
`endState` compared with the scheduler's post-arrival synthetic point at the same instant.

- **The solver DOES velocity-cancel — against the wrong point.** Every rendezvous plan reports
  `arrivalVelocity_ms = 0` (it brakes to its phantom's velocity). But the phantom (M0-shift) and
  the parked point (omega-rotation) are different places: Jupiter L4 plans terminate 0.31-0.48 AU
  (46-71 million km) from where the ship is then parked, with a velocity step of 0.6-13.3 km/s;
  Mars L4 0.14-0.29 AU and 2.1-33 km/s. The ship teleports that far, instantly, at completion.
- **A panel-driven L1/L2 plan flies to the wrong star distance entirely.** The panel passes the
  dropdown's planet-centric L1 distance (radius + LEO + 0.8 x SOI, ~0.005 AU for Mars) as
  `parkingOrbitRadius_au`; the calculator drops it in as the phantom's HELIOCENTRIC `a_AU`. A
  Mars L1 plan therefore terminates 0.0066-0.0075 AU from the SUN — inside the solar corona,
  1.4 AU from Mars — then the sampler teleports the ship to 0.99 x Mars's orbit. This is a live
  shipped bug, not merely a missing feature; P4 kills it by construction (one shared convention).
- L4/L5 arrivals park on a track that is CLOSE to right (the omega-rotation), so the shipped
  feature looks plausible at Jupiter-like eccentricities on the map — the teleport hides in the
  arrival instant.

### Other found facts that shape the design

- `placement` is a loose string on `NodeBase` (`types.ts:31`) — any node may carry it. Non-UI
  readers: `stability.ts:105` (`coOrbitalExempt` skips the crossing/Hill tests when either body's
  placement is 'L4'/'L5' — so a body CAN already be hand-authored as a trojan by editing JSON, and
  the stability engine already half-knows), `construct-logic.ts:153`, `orbits.ts:584`,
  `bodyFacts.ts:159`, `holo/scene.ts:4065`, `systemTopology.ts:69`.
- The authored-construct orbit is a SNAPSHOT: edit the secondary's orbit afterwards and every
  trojan stays where it was — silently no longer at the point. A derived orbit fixes this class.
- The bundled Uggi (Traveller Example) map ships FIFTEEN constructs with placement 'L4'/'L5'
  (8 + 7). Q7 (migration) is live with real shipped data. The Sol fixture and the other bundled
  maps carry NO L4/L5 placements, so the byte-unmoved gate on `tests/fixtures/solar-system-*` is
  achievable.
- The holo (3D) view renders NO L-points at all, and the player system view is HoloView at both
  tiers — players currently never see an L-point (bears on Q6).
- `stability/` and `fate/` are registered ENGINE_NAMESPACES already; new verdict values ride the
  existing machinery (severity/fate/reasons, B19 fate asymmetry, B24 fate-carries-its-reason) and
  physicsTrace's stability layer picks up `orbitalStability`/`orbitalStabilityDetails` unchanged.
  A construct fuel-use tag fits the existing `flight/` namespace beside `flight/ascent`.
- `worldPositions.ts` resolves positions by memoised recursive parent-walk; a co-orbital resolver
  that reads the SECONDARY's state is a sibling dependency, which the parent-first walk does not
  order by itself — an ordering constraint to write into the engine map with the code.

## 2. Proposed design

### Data model (pending Q1)

One structured, authored relationship on the node — the loose string stops being load-bearing:

```
coOrbital?: { hostId: ID; point: 'l1'|'l2'|'l3'|'l4'|'l5' }
```

- Applies to BODIES and CONSTRUCTS alike (one mechanism, five points — no construct-only rule).
- The node's `parentId` stays the SECONDARY'S OWN HOST (the star, or barycentre) — see Q1 for why
  child-of-secondary loses.
- **The engine derives the orbit from the marker every pass** (physics writes it, like any derived
  quantity): l3/l4/l5 get the exact rotated Kepler orbit above — so every existing consumer
  (orrery, holo, transit, exports, snapshots) sees an ordinary orbit and works unchanged; l1/l2
  get a parametric position from the shared resolver (no honest Kepler orbit exists). Derivation
  is idempotent by construction: derived-from-authored, nothing reads a later pass's output.
  Editing the secondary's orbit moves its trojans on the next pass — the snapshot-drift class of
  bug dies.
- ONE module owns the convention (extend `physics/lagrange.ts`); the overlay, the authoring tabs,
  the transit calculator, the scheduler and the new derivation all call it. Five conventions
  become one, which is what makes P4's velocity cancelling fall out for free: when the solver's
  phantom IS the point the sampler parks at, braking to the phantom's velocity IS the velocity
  cancelling, and the teleport is zero by construction.

### Stability + tags (P2)

Physics decides, tags record, UI reads tags — the hard rule. New criteria join
`annotateGravitationalStability` as another assessor, running for co-orbital-marked bodies
(replacing the blanket `coOrbitalExempt` escape with a real judgement):

- **Routh/Gascheau mass-ratio bound**: the triangular points are linearly stable only while
  `27 mu (1 - mu) < 1`, `mu = m2/(m1+m2)` — i.e. mu below ~0.0385 (Sun-Jupiter 0.00095: stable;
  a near-equal binary: breached). With a MASSIVE trojan the generalised Gascheau condition
  `(m1+m2+m3)^2 / (m1 m2 + m2 m3 + m3 m1) > 27` applies, collapsing to Routh as m3 -> 0.
- **Trojan-vs-secondary regime**: tadpole libration survives while the trojan is much lighter
  than the secondary; comparable masses go horseshoe (Janus/Epimetheus); heavier and the labels
  swap (the "trojan" is really the secondary). The physics emits the regime rather than refusing
  the configuration.
- Both criteria are VERIFIED against references in-session before shipping (the physical-concepts
  rule), with the working shown in physicsTrace; the numbers above are the starting claims, not
  the shipped ones.
- Verdicts ride the existing severity/fate machinery: a breached trojan wears `stability/*` and
  `fate/*` with a reason string naming the breached criterion (B24), directional where the physics
  is (B19). An over-mass trojan at a giant's L4 reads: unstable, driven by the Routh bound, fate
  eject (the lighter member is shed). Eccentricity and inclination limits on the tadpole region
  can join as refinements if the references support a clean bound; otherwise they stay out rather
  than being invented.
- Bodies at l1/l2/l3 (if Q2 says allow): honest doom — severity from the point's instability
  (l1/l2 e-folding times are weeks-months for planetary pairs; l3 drifts on centuries), fate by
  the geometry (infall/eject for l1/l2 by which side; l3 wanders into the horseshoe).
- The four explanation surfaces move in the same batch: the physics page section, physicsTrace's
  stability layer notes, `docs/tags-guide.md`, `docs/classification-and-tags.md`.

### Constructs at all five + fuel tags (P3)

- The placement UIs offer all five points through the same `coOrbital` marker; the old L4/L5
  placement path becomes a writer of the marker.
- Fuel-use is physics, so it arrives as a tag the UI reads (wording pending Q5): the points with
  an exact Kepler representation (l4/l5, and l3's mirrored orbit) cost nothing to hold —
  coasting; l1/l2 are unstable equilibria held by periodic trim burns — station-keeping. A
  breached-regime point (Routh failed) escalates: holding a point that is not an equilibrium any
  more is continuous thrust, and the tag should say so rather than pretending the point exists.

### Render: points and areas (P1)

- The five points draw from the shared module (the old crosses stay when the feature is off —
  the overlay simply stops disagreeing with everything else).
- AREAS at l4/l5 when enabled: the tadpole region drawn as a lobe along the orbit around the
  point (display-grade: longitude extent from the mass ratio — wide for small mu, shrinking to
  nothing as Routh is approached; the reference check in P2 firms the formula). It doubles as the
  placement affordance: click-in-area places the body/construct there with the marker set.
- l1/l2/l3 draw as points (small dwell regions), marked as unstable holds.

## 3. Phases (each its own green push, G43 row updated per phase)

- **P1** data model + shared convention module + derived orbits + areas overlay + placement UI
  with the mass guide + save/load/bundles/snapshots carrying the marker + Uggi migration (Q7).
- **P2** stability criteria (reference-verified) + tags + all four explanation surfaces.
- **P3** constructs at all five + fuel-use tags (may overlap P2).
- **P4** transit velocity cancelling: calculator phantom and scheduler sampler both read the
  shared module; the l1/l2 parking-radius bug dies; extend coast.spec / fast_plan / rocinante /
  hostResolution rather than writing beside them; the Phase 0 probe numbers are the before
  measurement the new specs beat.

Acceptance (thirty seconds each, negatives included) as in the G43 row: small moon at a giant's
L4 renders/saves/reloads/processes-twice unchanged; over-mass trojan wears the instability tags
and physicsTrace says why; Sol fixture byte-unmoved; construct at L1 wears station-keeping, at L5
coasting; arrival velocity matches the co-rotating point (against the probe numbers); areas
toggle cleanly, old dots draw when off.

## 4. The owner's questions

**Q1 — AUTHORING MODEL (load-bearing).** Trojan as child-of-host with a lagrange orbit kind, or
child-of-star with a co-orbital marker?
**Recommendation: child-of-star (the secondary's own host) with the structured `coOrbital`
marker and an engine-derived ordinary Kepler orbit.** A trojan orbits the STAR — it is outside
the secondary's Hill sphere by construction, so making it a CHILD of the secondary turns every
satellite-shaped judgement wrong at once (host-binding stability would read "stolen by external
tide", insolation/host distance, moon classification, the holo's satellite framing), each needing
a point-solution exemption — against the mantra. Child-of-star keeps the save format an ordinary
node with an ordinary orbit (snapshots, bundles, exports, G37 pins and the wizard all untouched),
keeps parent-before-child iteration honest (the one NEW ordering edge — secondary before trojan,
a sibling — is contained in the derivation pass and gets an engine-map entry), and today's
shipped constructs are already this shape, so migration is a marker upgrade rather than a
re-parenting. The cost: `ui_parentId` keeps carrying the UI grouping, and the derivation pass
must run after the secondary's orbit is settled — both cheap.

**Q2 — BODIES at L1/L2/L3.** Allowed-with-doom-tags, or refused by the placement UI?
**Recommendation: allowed, tagged honestly** — author-freely-tag-honestly is the house mantra,
and the doom is real physics worth teaching (a moon at L1 is a story hook wearing a countdown).
The picker labels them as unstable holds so nobody stumbles in; constructs get all five either
way.

**Q3 — MASS FILTER on placement.** Hard block, or guide in the picker + judge in the physics?
**Recommendation: guide + judge (house style, confirming).** The picker shows the derived mass
bound for THIS pair (from the criteria above) and warns beyond it; the physics judges whatever
was authored and the tags say what breaks. A hard block would also have to block JSON edits and
imports to mean anything.

**Q4 — LIBRATION.** v1 fixed-at-point with the AREA drawn as the tadpole region, or libration
motion now?
**Recommendation: fixed-at-point v1, area shows the region.** The exact rotated orbit is real
motion (the point itself moves with the secondary, pulsating with its eccentricity — it does not
look parked); tadpole libration ON TOP of that needs a parametric oscillation with no Kepler
form, new machinery for a subtle wobble. Bank it as a follow-on if wanted.

**Q5 — FUEL-TAG WORDING.** Proposal: key `flight/fuel-use`, values **`coasting`** (l4/l5 — a
stable point holds the ship for free) and **`station-keeping`** (l1/l2/l3 — periodic trim burns
hold an unstable point), escalating to **`holding`** (continuous thrust) when the regime is
breached and the point no longer exists. Alternatives considered: negligible/stationkeeping (the
brief's placeholder — "negligible" reads as a quantity, "coasting" reads as what the ship is
doing); anchored/tending; free/held.

**Q6 — PLAYER VIEWS.** Do the areas and the new tags show on player views, or GM-only?
**Recommendation: tags follow the standard redaction rules (physics tags are player-visible
unless marked secret — a trojan's stability is honest physics); the AREAS overlay stays a
GM-view toggle for now**, because the player system view is HoloView at both tiers and the holo
renders no L-points at all today — giving players the overlay is a new holo feature, not a
visibility flag. If wanted, that becomes its own item.

**Q7 — MIGRATION.** What happens to an existing construct's placement string on load?
**Recommendation: import fix-up converts placement 'L4'/'L5' + `ui_parentId` into the structured
marker (`coOrbital: { hostId: ui_parentId, point }`), then the normal derivation recomputes the
orbit from the secondary — which HEALS the snapshot-drift these constructs already suffer (their
copied orbits are stale wherever the secondary has been edited since). The placement string stays
for display continuity. Marker-guarded and idempotent (the G38 seed pattern); the fifteen Uggi
constructs are the live test. Consequence to sign off: a drifted trojan visibly snaps back to the
true point on first load.