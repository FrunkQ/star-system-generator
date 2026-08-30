# SESSION BRIEF — G53 phase 4 (starlight occlusion), and the visual pass

Written 2026-08-28 by the outgoing stream-B session at v3.0.212, to the discipline in
`docs/process-templates/PLAYBOOK.md`: the entry fee is about a fifth of a session's context, and
this document is that fee pre-paid. Every file:line below was re-verified against the tree at
v3.0.212 rather than remembered.

---

## THE PROMPT — copy this to the new session

You are continuing **[[G53]] mega-constructs** on Star System Explorer. Repo
`C:\Development\star-system-explorer-v2\star-system-generator`, branch `beta`. Work in your OWN
worktree (`git worktree add ../sse2-mega2 -b wt/mega2 origin/beta`); the main checkout is shared and
other streams are live in it. Commit as **FrunkQ <frunk@frunk.net>**.

**READ FIRST, in this order.**
1. The **[[G53]] row** in `docs/dev/observations-inbox.md` — it opens with a SESSION HANDOVER
   paragraph naming what is built, what is deliberately unbuilt, and the one open fault.
2. `docs/dev/mega-constructs-design.md` — **§10 Phasing** (phases 1-3 are marked done and phase 2
   records a plan CORRECTION), **§Phase 3b and §Phase 3c** (the owner's own notes, captured
   verbatim and deliberately not acted on), and **§6** for what phase 4 actually is.
3. `docs/dev/engine-map.md`: `DATA-R31` (the one chrome predicate), `UI-B2` (hard greys / steer
   explains), `RENDER-S2` (a construct contributes no radius — G53 was expected to falsify it and
   did not; read the measured reason), `RENDER-S44` (a mega is CENTRED on its host), `RENDER-S45`
   (`bodyById` is empty during the attach loop), `RENDER-S13`, `RENDER-S43`, and `E7` in the
   standing rules at the foot of the inbox.
4. `src/lib/physics/luminosity.ts` — **read its header before writing any occlusion code.** It is
   the single luminosity function ([[B110]], swept from eight sites) and it states the distinction
   phase 4 turns on.

**WHAT IS ALREADY BUILT (phases 1-3, v3.0.180-212, all on beta).**
- `src/lib/constructs/chrome.ts` — `showsAsConstruct` / `isArtificial`, the only place that knows a
  body can wear construct chrome. Never test `kind === 'construct'` in new view code.
- `src/lib/constructs/megaTypes.ts` — the registry, seven records, G37 roster pattern. `derive()`
  and `shape()` are PURE and return DATA; **no luminosity is computed there on purpose**.
- `src/lib/constructs/megaPlacement.ts` — the ONE placement evaluator; hard greys, steer explains
  and cannot refuse.
- `src/lib/constructs/megaGeometry.ts` — the ONE geometry generator (`SphereGeometry`'s phi/theta
  window for shell/ring/torus/swarm; a tether; a spheroid honestly declines). Gated headlessly —
  **THREE runs fine in node; it is the CANVAS that E7 rules out, not the library.**
- `scene.ts:2713 attachMegaVolume` — attaches the above, keeping `attachHullVolume`'s whole
  contract. `SystemVisualizer.svelte` draws a sphere-section mega as its own orbit line.

### YOUR FIRST TASK IS FIVE MINUTES AND IT IS NOT CODE

Megas were reported drawing as the old textured ellipsoid on **v3.0.210, in a freshly opened player
view** — so not a stale build. That was triaged rather than guessed at, and these were ELIMINATED by
measurement: every shipped template resolves through `megaTypeDef`; the builder produces
ring/shell/points geometry **in the live browser bundle**; a freshly created node persists
`megaType: "ringworld"` and `artificial: true` to IndexedDB; and `computePlayerSnapshot` (deep
copy), `slimNode` (a deny-list) and `sanitizeSystem` (a spread) all preserve the field. **The data
and the builder are innocent.** The fault is inside the attach, which no headless test can reach.

So `scene.ts:4427` now warns ONCE per node when the mega builder declines, naming the `megaType` and
whether the registry knew it. **ASK THE OWNER FOR THAT CONSOLE LINE BEFORE INVESTIGATING ANYTHING.**
It converts a screenshot into a diagnosis and it is the difference between a five-minute fix and a
day of forensics. If it never appears, `attachMegaVolume` IS returning true and the fault is
downstream of it (visibility, the pixel LOD, or the per-frame scale) — which is a completely
different search.

### PHASE 4 — STARLIGHT OCCLUSION. The functional next step, and its prerequisite is MET.

§6 calls this the highest-value hook in the feature: a swarm at `starOcclusion: 0.4` means every
body it shadows receives 60% of its insolation, and the engine already runs
luminosity → insolation → temperature → habitability → colour on every pass.

**The seam is `src/lib/physics/luminosity.ts`, and its own header tells you the shape of the work:**
it returns the star's INTRINSIC output, what the photosphere emits; what a particular body RECEIVES
is *"a second quantity that belongs beside this one and must be derived FROM it — never a second
R²T⁴ with a factor bolted on."* Build the received-flux function there, beside it.

**THE GEOMETRY OF WHO IS SHADOWED IS ALREADY DECIDED (design §6, owner refinement) — do not
re-derive it.** An occluder NEVER dims itself (its sunward face takes the raw star; that
interception IS the harvest). A body radially INSIDE the occluder is undimmed. A body outside it is
dimmed by the fraction if the occluder is isotropic (full shell, whole-sphere swarm) — but **a BAND
dims only what aligns with its plane**, and the test is the band's own latitude extent from
`shape()` (`thetaStartRad`/`thetaLengthRad`) against a direction the engine already resolves.

**Rules that will bite here specifically.**
- `src/lib/system/idempotence.test.ts` is the one that will catch the mistake: occlusion is a
  system-level quantity feeding per-body insolation, so **iterate the star's occlusion before any
  body that reads it**, and never accumulate — derive from the clock/stored scalar.
- **A physics change is not finished until the explanations follow it.** Occlusion changing a
  world's temperature MUST show up in `physicsTrace.ts` (the panel that claims to show the working)
  and on `src/routes/physics/+page.svelte`, in the same batch. Grepped at handover: neither
  mentions megastructures at all yet, so both need a first mention rather than an edit.
- Phase 4 is data-only in the registry today: `derive()` publishes `starOcclusion` and
  `powerHarvestedLstarFrac` (a FRACTION of L*, deliberately, because the watts multiply was waiting
  for exactly this work).

### THE VISUAL PASS — the owner deferred it, and it is a SEPARATE batch from phase 4

His instruction, 2026-08-28: *"no point in trying to fix all visual bugs before visuals finished...
best to finish and we loop back with fixes."* Design §Phase 3c holds the list with causes:

1. **The space elevator must be EQUATORIAL.** Its anchor comes from `scene.ts:4881
   surfacePointFromId` — a stable pseudo-random point on the sphere, correct for a station and
   wrong for a beanstalk, which only works in the plane it is spun about. Fix is a placement rule:
   latitude 0 for the `tether` family, longitude may stay seeded.
2. **A tether should stay construct-visible until close in** (reported as showing only its label).
3. **The GM view still shows the old cross** for the elevator.
4. **A ring band is 0.0053 of its own diameter** (torus 0.0039), measured — so it is SUB-PIXEL at
   most zooms. Whether it needs a minimum DRAWN thickness is the same honest device as
   `RENDER-S43`'s screen-space floor, **and it must be decided by eye, not blind.**
5. §Phase 3b also holds, unbuilt: the named-circle CLICK TARGET (explicitly easier to hit than a
   belt) and the framing rule — a `megaCentred` construct should frame its HOST at the ring's drawn
   radius, and both numbers are already computed every frame.

### ACCEPTANCE, and the rules that are not optional

Green `npm run build` (not svelte-check), version bump and changelog PROSE on every push, explicit
staging (**never `git add -A`** — parallel sessions share this tree), `git show --stat` before
pushing, `idempotence.test.ts` green, an engine-map entry in the same commit for any non-obvious
rule and a CORRECTION to any entry you falsify, dead ends recorded, every new gate **run with the
fix removed and seen red**. Version collisions are constant: on rejection, `pull --rebase`, take
THEIR number, bump from it, keep BOTH changelog entries. Generated files churn under the runner
(`tests/fixtures/solar-system-input.json`, `tests/output/solar-system-derived.json`,
`src/lib/generated/exampleSystems.ts`) — discard them, never commit them.

**Two traps that cost this session real time, both now engine-map entries — read them rather than
re-paying:** `RENDER-S45` (`bodyById` is rebuilt AFTER the loop that fills it, so asking it for a
peer during the attach silently returns undefined — that is why every tether had a zero host
radius) and `RENDER-S44` (a mega is centred on its host and sized by its own drawn orbit; a tether
is the opposite case and must NOT be centred).

**And one process note worth more than any of it:** phase 2 was supposed to give megas a real
extent. Measured first, it turned out that would have HALVED every object in a system holding one,
because a ring is centred on its host so its orbit already IS its reach. The plan was wrong and the
engine was right. **Probe before you triage, and measure before you build** — the design's own
estimates have now been wrong three times out of four when checked.
