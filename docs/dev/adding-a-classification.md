# Adding a classification

Written 2026-09-08 at the owner's request, after adding a contact binary turned into an afternoon of research:
*"just adding a couple of new classifications needs a fair chunk of entry work. To make sure it is integrated
all ways - we maybe need to document this so it is less research, less chance to miss something."*

This is the checklist. It is **not** a tutorial on the classifier; it is the list of places a new class has to
reach, in dependency order, with the traps that have already been paid for at least once. Line numbers move —
grep the symbol, not the line.

---

## 0. What a classification is here, and what it is not

A **class** is a namespaced string on `body.classes` — `planet/hycean`, `asteroid/rubble-pile`. It is
**re-derived from scratch on every processing pass** by the classifier, from a map of derived features.

A **tag** is different and is not this document: tags are emitted by physics modules, carry values, and have
their own registry and guides. If what you want is "this body has property X", you probably want a tag. A class
answers "what KIND of object is this", and a body has exactly one base class plus any number of modifiers.

**Two kinds, and choosing wrongly is the most common way to waste a day:**

| `kind` | behaviour | example |
|---|---|---|
| `base` | competes — the best-scoring base wins and becomes the body's identity | `asteroid/c-type`, `planet/hycean` |
| `modifier` | stacks — every modifier scoring **≥ 0.6** is added alongside the base | `asteroid/rubble-pile` |

Both kinds are offered in the author's picker, but a modifier has to clear three extra hurdles to get there —
see section 3e, and settle them before you choose `kind`.

A base that overlaps an existing base steals bodies from it. A modifier that matches loosely appears on
everything. `classification.audit.spec.ts` audits base overlap and will tell you about the first case; nothing
tells you about the second, so check the second yourself against a generated system.

---

## 1. The first question: does this class MEAN anything, or is it a flourish?

The owner, on the contact binary: *"A contact binary is unlikely to be a reverse of anything — it is more a
visual flourish for asteroids than a meaningful difference."* That is a real distinction and it decides the
work:

- **A meaningful class** changes what the object IS: it should drive generation, may gate viability, and
  usually has physics behind it. Expect to touch everything below.
- **A presentational class** changes how an object READS or DRAWS. It still has to survive a reprocess, so it
  still needs section 3 — but it does not need generation weights tuned, and it should not gate anything.

Write which one it is in the fingerprint's `note`. The next person will ask.

---

## 2. THE RULE THAT CATCHES PEOPLE, so read this one twice

**The classifier re-derives every class on every pass, from a feature map — so a class you cannot express as a
band over a derived feature CANNOT BE ASSIGNED, and a class assigned any other way is LOST on the next
reprocess.**

The features are built in `src/lib/core/SystemProcessor.ts` (grep `features['porosity']`): `mass_Me`,
`makeup.metal/rock/carbon/ice/gas`, `porosity`, `has_ring_child` and friends. A fingerprint's `match` is a set
of bands over exactly those names.

So if your class is about **shape, history or intent** — "it is two lobes stuck together", "it was captured",
"the GM says it is a shipyard" — there is nothing to match on, and you must first publish a **body fact** into
that feature map. That fact is authored by a GM or set by the generator, and it is an INPUT, not a derivation.

The seam is pinned by `classifierSeam.spec.ts` (what replaced the legacy rules) and, for an authored fact
specifically, by `src/lib/system/lobeSeam.spec.ts` — which is the pattern to copy: it bands a THROWAWAY class on
the new feature rather than the shipped fingerprint, so it goes on testing the seam after the pack's own bands
are retuned. The no-reading-a-later-pass rule is `src/lib/system/idempotence.test.ts`. If your feature is
computed from something a later pass writes, the second of those goes red and it is right.

---

## 3. The checklist, in dependency order

Each step names the file to grep for. Do them in order: later steps read earlier ones.

**a. The vocabulary.** Add the class string to the class list at the top of
`static/rulepacks/starter-sf/classification.json`. This is the namespace's dictionary and is separate from the
fingerprints below — nothing breaks if only one of the two exists, which is why it is easy to add one and
forget the other.

**b. The feature, if section 2 says you need one.** One line in `SystemProcessor.ts` beside `features['porosity']`,
plus the body field it reads. Keep it an input; keep it idempotent.

**c. The fingerprint.** In the same JSON, in `classifier.fingerprints`: `class`, `kind`, `note` (a sentence a
human reads), `weight`, and `match` bands over feature names. **Every fingerprint needs a `match`** — the
scorer iterates `Object.entries(fp.match)` and an absent one throws.

**d. Generation.** Two separate things, and a type can be invisible because of either:
- **Rarity** — `src/lib/generation/typeDraw.ts` (`RARITY`, and the pack's `type_draw[cls]` override).
  `rarity` 0 is mundane, 1 is exotic, and it is the GM's **exotic slider filter**, not an on/off switch: rarity
  1 still appears with the dial up. There is no "never generated" value, and if you want one, that is a new
  mechanism and a conversation with the owner, not a rarity of 2.
- **Viability gates** — `judgeTypesAt` / `ALL_GATES` in `src/lib/generation/generateBodyOfType.ts`. A type
  whose gates always reject it at every slot is a type nobody will ever see. Check yours can actually pass
  somewhere.

**e. The author's picker — and a modifier gets in only if it can be BUILT.**
`AddBodyTypeModal.svelte` builds its offer from `rulePack.classifier.fingerprints`, so a BASE fingerprint is
automatically offered and there is no separate list to update.

**A MODIFIER IS OFFERED TOO, but it has three hurdles a base does not** (owner, 2026-09-08: *"We really SHOULD
have rubble piles and binaries in the pick list alongside other asteroids - why not?"* — there was no reason, and
until then `judgeTypesAt` skipped every modifier for both callers):

1. **`judgeTypesAt` must be asked.** Its `includeModifiers` argument is OFF by default and only the picker turns
   it on. The GENERATOR must never see modifiers: it draws an IDENTITY for a slot, and letting a property into
   that draw would also shift every seed anyone has ever generated.
2. **`canBuildTo(fp)` must be true** — every feature the fingerprint bands on has to be one `generateBodyOfType`
   actually writes. This is the hurdle most modifiers fail: `planet/ringed` wants a ring CHILD,
   `planet/toroidal` and `planet/ellipsoid` an oblateness the SPIN derives, `planet/ultra-short-period` an orbit
   the GM has already chosen by clicking. A card for any of those would hand back an ordinary planet.
3. **`basesFor(fp, viable)` must find something** — a modifier is a property, so it needs a base to be. The
   picker draws one whose mass window overlaps, and `generateBodyOfType(fp, { stackOn })` lays the base's bands
   down first.

**A PICKED MODIFIER LEAVES `classes` EMPTY, deliberately**, so the processor names the body from the composition
actually drawn rather than from the card that was clicked — a rubble pile comes back as `asteroid/c-type,
asteroid/rubble-pile` and not as a modifier with no identity. A picked BASE still pins its class, unchanged.

**SO: A DERIVED-FEATURE MODIFIER IS BUILT BY CHOOSING VALUES, NOT BY SETTING A FIELD.** `porosity` is the worked
example: the builder swells the solid radius by `1/cbrt(1 - p)` AND caps the mass at
`maxMassForPorosity(p)`, because `maxPorosity` is a real ceiling that self-gravity imposes and a body over it
would carry a void fraction the engine then refuses. An AUTHORED-fact modifier (`lobes`) is simply written.

`pickModifier.spec.ts` round-trips every modifier the picker offers through the real processor and requires the
class to come back, so hurdle 2's feature list cannot quietly drift out of step with the builder.

**f. The visuals.** Only if the class changes how it draws:
- 2D silhouette for small bodies — `src/lib/catalogue/smallBodyShape.ts`, shared by `PlanetDisc.svelte` and
  `CompositionCrossSection.svelte`. **Both must use the same path** or a cutaway stops meeting the body edge.
- Appearance flags — `src/lib/rendering/planetAppearance.ts`.
- **3D geometry** — `holo/bodyLook.ts` (grep `new THREE.SphereGeometry`), which is the single assembly for the
  holo, the gallery and the size comparison (engine map RENDER-S53), so a change there reaches all three.
  **As of 2026-09-08 every body is still a plain sphere and nothing displaces it** — that gap is [[G91]] and is
  being fixed in Stream Y. Until it lands, a shape-based class is a 2D-only distinction; once it has, a shape
  class must feed BOTH from one seeded source, or the card and the holo will show different rocks.

**g. The image, and its licence.** The map at the foot of `classification.json` (grep
`"asteroid/c-type": "/images/planet_types/`), with the file in `static/images/planet_types/`. **An entry
pointing at a file that is not there 404s on every load**; `asteroid/rubble-pile` ships with no entry at all, so
"no image" is a supported state — prefer it to a broken link. Anything shipped needs a licence that permits it
and a credit: `src/lib/io/attributions.ts` generates credits into **every save and bundle**, so an image
travels with other people's maps. A licence question is the owner's, not a stream's.

**h. The external link.** Optional: `src/lib/util/planetTypeInfo.ts` maps a class to an anchor on an external
planet-types page. Types with no entry simply show no link.

**i. The documents, because a change is not finished until the explanations follow it.**
`docs/tags-guide.md`, `docs/classification-and-tags.md`, and `src/routes/physics/+page.svelte` if the class
says anything about physics. If it genuinely needs no documentation, write that line in the Documentation-debt
section rather than staying silent — silence is indistinguishable from forgetting.

**j. The gates.** Red-first, as always:
- the class is assigned to a body that should have it, and to nothing that should not;
- **it survives a reprocess** (the seam — this is the one that catches a class with no feature behind it);
- `classification.audit.spec.ts` still passes (base overlap);
- a modifier stacks on everything it should and nothing it should not;
- `idempotence.test.ts` stays green.

**k. The baseline fixtures will move — but read the diff with `git diff`, not `git status`.**
`tests/fixtures/solar-system-input.json` and `tests/output/solar-system-derived.json` are regenerated by
`physics-baseline.test.ts` (it lives in `src/lib/system/`, not `src/lib/physics/`). A new class that touches any
bundled body changes them: **commit them with your change and read the diff as the record of what moved.**
**The trap is that they show as modified even when nothing moved:** the test writes LF and the checkout is CRLF,
so `git status` marks them on every run. `git diff --numstat` normalises the endings and prints nothing when the
content is identical — that empty answer is the honest "the physics did not move", and committing on the
strength of `git status` alone puts a pure line-ending churn in the history.

---

## 4. A worked example: the contact binary (G90)

- **Meaningful or flourish?** The owner's own call: a flourish, for asteroids. So: no viability gates, no
  physics, modest generation.
- **Feature?** Yes, needed — "two lobes" is shape and history, and nothing derived carries it. One body fact,
  one line in the feature map, or the class is lost on the next pass.
- **Base or modifier?** Modifier. `rubble-pile` is already one, and stacking gives two real objects from one
  entry: **comet + contact-binary is 67P/Churyumov-Gerasimenko**, and **rubble-pile + contact-binary is
  Arrokoth**. That answers "maybe a couple of types if that reflects reality" without a second type.
- **Visual?** A bilobate branch in `smallBodyOutline`, seeded from the body id, one closed path.
- **Image?** Held: the reworked Arrokoth composite is a derivative whose licence is the owner's to check.

---

## 5. If you find this document wrong

Correct it in the same commit as the work that proved it wrong. A checklist that is trusted and stale is worse
than no checklist — the same rule the engine map lives by, for the same reason.
