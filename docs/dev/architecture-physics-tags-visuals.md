# Architecture: physics → tags → visuals

The rendering pipeline rule for Star System Explorer. This is the house style for ALL derived
appearance work — future changes must follow it, and code reviews should reject changes that don't.

## The rule

```
PHYSICS  ──emits──▶  TAGS (+ the body's stored physical properties)  ──drive──▶  VISUALS
```

1. **Physics decides; tags record the decision.** Every judgement — "this body has a water cloud
   deck", "this surface is ancient", "this world reddens with tholins" — is made ONCE, in the
   processor, and published as a tag. The amount/outcome travels in the tag value.
2. **This is a LOGIC abstraction, not a data abstraction.** Renderers may read whatever data they
   need for LOOKUPS — a liquid's colour, a gas's tint, the body's radius and temperature. What
   they must not do is make a physics JUDGEMENT. The dividing line: *"is there a cloud deck, and
   how thick?"* is physics and must arrive as a tag; *"what colour is sulphuric acid?"* is a
   lookup and the renderer can just read it.
   So: `decksFromTags(body.tags)` then `liquidDef(species).colorHex` is correct. Scanning
   `body.atmosphere.composition` to decide a deck exists is not.
3. **Why this is a hard rule:** two independent evaluations of one question WILL disagree at the
   margins. The v2.1.246 Mars-clouds bug was exactly this — the tag said "no cloud deck" while a
   stale derived layer still tinted the world. Any time a renderer contains an `if` about raw
   physics state, that class of bug is being reintroduced.
4. **Physics constants live in DATA, not code.** Coefficients, thresholds, species tables and
   per-substance behaviour belong in the rule pack (gasPhysics / liquids / distributions), where
   the user can edit them per-starmap. Code holds the *shape* of the model; data holds its
   numbers. Precedents: aurora emission bands (v2.1.209), the liquids phase data (v2.1.204+),
   cloud formation (v2.1.24x). When adding a physics feature, ask: "which parts of this would a
   GM plausibly want to change?" — those parts are data.

## Tag idioms

- **One tag, one value.** `Tag.value` is a single string holding the one datum that identifies /
  quantifies the tag. No structured data field; no delimited mini-formats beyond
  `"<species> <bucket>"`.
- **Continuous physics is BUCKETED into tag values.** Precedents: `surface/age`
  (young/moderate/old/ancient), `surface/irradiation` (low/moderate/high). Buckets read better
  for users than floats, survive hand-editing, and make GM authoring a dropdown. The emitter may
  compute precisely; it publishes the bucket.
- **Multiple tags may share a key** where a body legitimately has several of a thing
  (`structure/cloud-deck` once per deck). Value distinguishes them; dedupe by (key, species).
- **Manual tags survive re-derivation.** The processor strips only its own auto tags
  (`!t.manual`) before re-emitting. A manual tag that duplicates an auto one wins.
- **A tag is also an instruction.** Because visuals read tags, a GM adding a tag by hand gets the
  visual with no physics behind it. That is a feature (GM override), not a loophole.

## Ordering / feedback

Derived visuals must not feed back into the physics that derives them (e.g. cloud decks do not
modify albedo/temperature). A feedback edge makes borderline bodies oscillate between process
passes — the higher-order version of the same Mars bug. If a feedback is ever wanted, it must be
introduced deliberately, damped, and with an idempotence test (two passes ⇒ identical tags).

## Where things live

| concern | home |
|---|---|
| species behaviour (condenses, reacts, aurora bands) | `gasPhysics` entry for the gas |
| substance appearance (colour, opacity, phase points) | `liquids` entry for the liquid |
| the derivation itself | `SystemProcessor` / `src/lib/physics/*` |
| the published outcome | tags on the body |
| how it looks | renderers, reading tags + appearance data |

Related: `docs/dev/cloud-decks-design.md` (first full application of this rule),
`docs/dev/unified-tagging-design.md` (tag lifecycle unification workstream).

## What a body RADIATES — three mechanisms, one source each

Added 2026-08-16 after an audit prompted by the owner: *"are we using one uniform source of radiation
in all calcs from stars - we got mixed up before."* One source field each, and they are not
interchangeable. The full rule and its history are in `engine-map.md` under **PHY-15**.

| Mechanism | Source quantity | Derived from |
|---|---|---|
| Bolometric luminosity | `radiationOutput` (L☉) | radius and temperature, exactly |
| Ionising output | `L_bol x (L_X/L_bol)` | the magnetic dynamo (`flareActivity`), NOT size |
| Trapped-particle belts | host field strength x spin | magnetism and rotation, NOT luminosity |

**The one that catches people:** brightness and ionising output are different numbers. A flare moves a
star's bolometric output by about a hundredth of a percent and its X-ray output by a thousandfold, so
"make this star dangerous" and "make this star brighter" are different actions and have separate
controls. And a **gas giant is a radiation source with no luminosity at all** — a moon inside its belt
is bombarded, not lit.

**Physics still decides, tags still record.** Each mechanism ends in tags a reader can see —
`hazard/flaring` and `stellar/activity` from the dynamo, `hazard/radiation` and the belt tags from the
dose — and nothing reads a tag back to compute a physical value.
