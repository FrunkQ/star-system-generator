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
2. **Renderers read tags and look-data only.** A renderer (2D disc, 3D holo, apparent colour,
   guide document, starmap glyphs, reports) may read: the body's tags, its stored physical
   properties (radius, temperature, colours), and the rule pack's *appearance* data (a liquid's
   colour, a gas's tint). A renderer must NEVER re-derive a physics judgement from raw inputs
   (atmosphere composition, hydrosphere state, orbital elements).
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
