# PATCH SPEC: read the luminosity class, so a supergiant stops importing as a dwarf (D19)

Status: READY TO IMPLEMENT. Written 2026-08-13 by the astronomy-data-2 session immediately before
retirement, from context rather than from re-derivation. Everything needed is here; you should not
have to re-measure anything to do this.

**Scope: pack data plus one parse.** No architecture, no new physics. This is part ONE of the
owner's split — part two (adopt the full MK string everywhere) belongs in
`docs/dev/type-vocabulary-prev4.md` and is explicitly not this.

**The symptom, for orientation:** Antares (`M1.5Iab+B2Vn`) imports with 0.265 solar masses,
1.24e-2 L☉ and a 278,280 km radius. Real Antares is ~12–15 M☉, ~75,000 L☉, ~700 R☉. Mass out by
~50x, luminosity by ~6 million, radius by ~1,800. Every bright star does this, because bright stars
are overwhelmingly not main sequence.

---

## 1. Band keys to add

### 1.1 Naming

**Key shape: `star/<LETTER>-<CLASS>`** — `star/M-I`, `star/K-III`, `star/B-I`.

Rationale, and this is the part that has to survive the pre-V4 work rather than fight it:

- `docs/dev/type-vocabulary-prev4.md` proposes ONE record per type carrying match bands, generation
  bands and presentation. A type in that vocabulary is `(letter, luminosity class)` — those two
  together are what determine mass, radius and luminosity, which is precisely what D19 proves by
  counter-example. So the key should name exactly that pair and nothing else.
- The subclass (`1.5`) is deliberately NOT in the key. It refines temperature within a letter; it
  does not move a star between bands. Putting it in the key would create ~700 keys to express a
  second-order effect, and pre-V4 will handle it as an interpolation within a band rather than as
  more bands.
- A hyphen separates the two axes so they stay visibly separate and parseable. `star/MIab` would
  read as one token and would have to be re-split by anything that wants the axes back.
- Existing keys stay flat (`star/M`), so `star/M` continues to mean "M, main sequence" — see §2.

**Do NOT use the raw MK string as a key** (`star/M1.5Iab+B2Vn`). That is the thing that already
cannot match, and it is unbounded: subclasses, peculiarity suffixes and companions make the space
effectively infinite.

### 1.2 The keys

Fourteen new keys: seven letters × two luminosity groups.

```
star/O-I  star/B-I  star/A-I  star/F-I  star/G-I  star/K-I  star/M-I     (supergiants)
star/O-III star/B-III star/A-III star/F-III star/G-III star/K-III star/M-III  (giants)
```

**No new keys for L, T, Y.** Brown dwarfs have no luminosity class; a catalogue never quotes one.

**Two classes are folded rather than given their own bands, and both foldings are approximations
that should be stated in the code comment:**

| MK class | folded to | why |
|---|---|---|
| `II` (bright giant) | `-I` | Bright giants sit between III and Ib and are much nearer Ib. Canopus (F0II) at 8 M☉ / 71 R☉ is comfortably inside an F supergiant band and nowhere near an F dwarf. Folding up is the smaller error. |
| `IV` (subgiant) | the existing `star/<letter>` (V) | A subgiant is typically ~2x the radius of its dwarf and within ~30% on mass. Procyon A (F5IV-V) is 1.5 M☉ / 2.05 R☉ against an F dwarf band of 1.04–1.4 M☉ / 1.15–1.4 R☉ — wrong, but by a factor, not by orders of magnitude. |

Giving `II` and `IV` their own bands later is a clean incremental change; do not do it now.

### 1.3 What to do with `star/red-giant`

**KEEP IT, UNCHANGED, AND DO NOT RENAME IT.** It is load-bearing in two places outside this patch:

- `BodyStarTab.svelte`'s `SPECTRAL_DATA` has a `'star/red-giant'` entry with the label "Red Giant" —
  the star editor's picker offers it by that name.
- `src/lib/generation/star.ts` tests it by name in a letter list
  (`['A','F','G','K','red-giant'].includes(spectralType)`).

Renaming it is a picker-and-generator change with no benefit to this patch, and it would put a
breaking edit inside a change whose whole value is being small and obviously safe.

**Its relationship to the new keys, recorded so nobody has to work it out twice:** `star/red-giant`
(mass 0.8–5, radius 20–100, temp 3000–4500) describes what `star/K-III` and `star/M-III` also
describe. That overlap is real and is left in place deliberately. The new keys are the ones reachable
from a catalogue string; `star/red-giant` is the one reachable from the picker.

**Reconciling them is a pre-V4 job, not this one** — it is exactly the "one vocabulary, three
consumers" problem `type-vocabulary-prev4.md` exists for, and it should be added to that document's
step list rather than solved here. Set the new `-III` figures CONSISTENT with `star/red-giant` (they
are, below) so that reconciliation is later a deletion rather than an argument.

---

## 2. The lookup chain

### 2.1 What it does today

`starParamsFromType(type, statTemplates)` in `src/lib/import/realsky/stars.mjs`:

```js
const { classes } = starClasses(type ?? '');
const band = classes.map((c) => statTemplates[c]).find(Boolean)
  ?? statTemplates[`star/${(classes[0] ?? 'star/M').split('/')[1][0]}`]
  ?? statTemplates['star/default'];
```

**CORRECTION TO D19, AND YOU MUST HAVE THIS RIGHT OR THE PATCH WILL SILENTLY NOT FIRE.** D19
describes the chain as "the most specific class the pack defines, then the bare letter". That is the
*intent*. The *order* is the other way round, because `starClasses` returns its classes
**letter first**:

```js
return { classes: [`star/${letter}`, ...(full && full !== letter ? [`star/${full}`] : [])], ... };
```

So `classes.map(...).find(Boolean)` matches `star/M` on element 0 and never reaches the full string.
The full-string key is doubly unreachable: it is second in the list *and* it could not match anyway.

**Consequence for the implementer: inserting a luminosity-class lookup anywhere after that
`.find(Boolean)` will do nothing.** It has to be tried BEFORE the letter.

### 2.2 What it must do

In order, first hit wins:

1. **White dwarf** — unchanged, already first inside `starClasses` (`/white dwarf|^D/i` → `star/WD`).
2. **`star/<LETTER>-<CLASS>`**, when a luminosity class was parsed AND it is not `V`. *(new)*
3. **`star/<letter>`** — the existing main-sequence band. **This is the fallback when no luminosity
   class is present, and it must stay so.** Most catalogue entries have no luminosity class at all,
   and main sequence is the right guess for a star picked at random: the galaxy is mostly dwarfs.
   A star with no class must behave exactly as it does today — this patch must be a no-op for it.
4. **`star/default`** — unchanged.

Step 2 is the only insertion. Steps 1, 3 and 4 keep their current behaviour byte for byte.

**When a parsed class has no band** (e.g. a `-III` key you chose not to add): fall through to step 3
rather than to `star/default`. The letter is always a better answer than the global default.

---

## 3. The parse

### 3.1 Order of operations

Run against the **same string `starClasses` already normalises**, not the raw input:

1. **Strip a trailing parenthetical.** `starClasses` already does `type.replace(/\s*\(.*\)$/, '')`,
   and the curated roster relies on it: `systems-real.mjs` carries types like `'Y4 (brown dwarf)'`
   and `'L7.5 (brown dwarf)'`. Parse the stripped form.
2. **Take the FIRST component before any `+`.** `M1.5Iab+B2Vn` → `M1.5Iab`. This is what discards
   the companion (§6.1) and it must happen before the class scan, or `B2Vn`'s `V` can win and turn a
   supergiant into a dwarf — the exact bug, re-introduced.
   *Caution, seen in the real data:* `+` is not always a companion. SIMBAD returns `M2+V` for
   Lalande 21185, where it means "M2 or later, V". Taking the first component gives `M2`, no class,
   → main sequence — which is the correct outcome anyway. Do not try to be cleverer than this.
3. **A leading `d` means dwarf.** SIMBAD returns `dM6` (Wolf 359), `dM4` (Ross 128), `dM3` (AD Leo)
   in this very dataset. Treat a leading `d` (not `D`, which is a white dwarf, and not `sd`) as an
   explicit luminosity class `V`.
4. **A leading `sd` is a subdwarf.** `starClasses` already strips it via `/^(sd)?([OBAFGKMLTY])/i`.
   Treat as `V` for band purposes — the pack has no subdwarf band and inventing one is out of scope.
5. **Scan for the luminosity class** after the letter and its numeric subclass.

### 3.2 What a luminosity class looks like in the wild

Match, case-sensitively on the roman numeral, allowing the lowercase `a`/`b` suffixes:

- Plain: `V`, `IV`, `III`, `II`, `I`, `Ia`, `Iab`, `Ib`
- **Hyphenated ranges are common and must not be missed:** `Ia-ab` (Betelgeuse is `M1-2Ia-ab`),
  `IV-V` (Procyon is `F5IV-V`), `III-IV`
- **Hyphenated SUBCLASS ranges appear too, before the class:** `M1-2Ia-ab` has a range in both
  positions. The subclass range must not be mistaken for the class.
- Trailing peculiarity letters follow the class and must be ignored: `e` (emission, `M5.5Ve`),
  `n` (broad lines, `B2Vn`), `p`, `:` (uncertain), `var`.
- **Rule for a range: take the FIRST (more luminous) of the two.** `IV-V` → `IV`. `Ia-ab` → treat as
  `Iab` (see the table below). This errs toward the more luminous reading, which is the safer error:
  a star bright enough to have been catalogued with a range is more likely the brighter one.

A workable shape — anchor after the letter and subclass, do not scan the whole string:

```
/^[OBAFGKM]\s*\d*(?:\.\d+)?(?:-\d+(?:\.\d+)?)?\s*([IV]+(?:a|ab|b)?(?:-(?:[IV]+(?:a|ab|b)?|ab|a|b))?)/
```

Take capture group 1, then normalise per the table. **Do not use a bare `/[IV]+/` search** — it will
match the `I` in nothing useful and the `V` in a peculiarity suffix, and it will happily find a class
inside a companion you failed to strip.

### 3.3 Parsed class → band key

| parsed | normalised | band key | note |
|---|---|---|---|
| `Ia`, `Ia-ab`, `Ia+`, `I` | `I` | `star/<L>-I` | `Ia+` (hypergiant) folds to `I`; there are very few and no band for them |
| `Iab` | `I` | `star/<L>-I` | |
| `Ib`, `Ib-II` | `I` | `star/<L>-I` | |
| `II`, `II-III` | `I` | `star/<L>-I` | bright giant folded up (§1.2) |
| `III`, `III-IV` | `III` | `star/<L>-III` | |
| `IV`, `IV-V` | `V` | `star/<L>` | subgiant folded to main sequence (§1.2) |
| `V`, `Vn`, `Ve`, leading `d`, leading `sd` | `V` | `star/<L>` | today's behaviour, unchanged |
| absent / unrecognised | — | `star/<L>` | **the required fallback** |

Return the parsed class alongside the parameters (e.g. `luminosityClass: 'I'`) — a caller wanting to
say "typical for an M supergiant" rather than "typical for its class" needs it, and it costs nothing
now versus a signature change later.

---

## 4. The figures

Same shape as `star/red-giant`: `mass_solar`, `radius_solar`, `temp_k`, `mag_gauss`,
`radiation_output` — all `[min, max]`, and `starParamsFromType` takes the **midpoint**, so a band's
centre is what a star actually gets. Choose bands so the midpoint is a *typical* member, not the
arithmetic centre of the extremes.

`radiation_output` is luminosity in L☉. Note the existing bands use small numbers (`star/G` is
`[0.8, 1.2]`); supergiant values are five to six orders of magnitude larger and that is correct.

### 4.1 Supergiants

| key | mass_solar | radius_solar | temp_k | radiation_output | anchors / confidence |
|---|---|---|---|---|---|
| `star/O-I` | `[20, 60]` | `[15, 40]` | `[30000, 45000]` | `[200000, 1500000]` | **Estimated**, loosely on Alnitak (O9.7Ib) and ζ Puppis. Rare; treat as indicative. |
| `star/B-I` | `[10, 30]` | `[30, 120]` | `[10000, 25000]` | `[30000, 400000]` | **Anchored: Rigel** (B8Ia) ~21 M☉, ~79 R☉, ~12,100 K, ~120,000 L☉. Midpoints land close. |
| `star/A-I` | `[10, 25]` | `[80, 250]` | `[7500, 10000]` | `[30000, 250000]` | **Anchored: Deneb** (A2Ia) ~19 M☉, ~200 R☉, ~8,500 K, ~200,000 L☉. |
| `star/F-I` | `[4, 12]` | `[30, 120]` | `[6000, 7500]` | `[1000, 30000]` | **Anchored: Polaris** (F7Ib) ~5.4 M☉, ~46 R☉, ~6,000 K, ~1,260 L☉ — Polaris sits low in this band, which is right for an Ib. |
| `star/G-I` | `[5, 15]` | `[40, 150]` | `[4800, 6000]` | `[1000, 50000]` | **Partly anchored**: β Aquarii (G0Ib) ~6 M☉, ~50 R☉, ~5,600 K, ~2,300 L☉. Upper end estimated. |
| `star/K-I` | `[6, 20]` | `[100, 400]` | `[3900, 4800]` | `[5000, 100000]` | **Partly anchored**: ε Pegasi / ζ Cephei (K1.5–K2 Ib), ~10 M☉, ~180–200 R☉, ~4,300 K. Upper end estimated. |
| `star/M-I` | `[8, 25]` | `[300, 1200]` | `[3000, 4000]` | `[30000, 300000]` | **Anchored: Antares** (M1.5Iab) ~12–15 M☉, ~680 R☉, ~3,600 K, ~75,000 L☉ and **Betelgeuse** (M1-2Ia-ab) ~16–19 M☉, ~640–760 R☉, ~3,600 K, ~100,000+ L☉. |

### 4.2 Giants

| key | mass_solar | radius_solar | temp_k | radiation_output | anchors / confidence |
|---|---|---|---|---|---|
| `star/O-III` | `[16, 50]` | `[8, 20]` | `[30000, 45000]` | `[50000, 500000]` | **Estimated.** O giants are rare and short-lived; figures indicative only. |
| `star/B-III` | `[4, 15]` | `[4, 15]` | `[10000, 25000]` | `[500, 20000]` | **Estimated**, loosely on the B giants of the Pleiades/Orion field. |
| `star/A-III` | `[2, 5]` | `[3, 10]` | `[7500, 10000]` | `[50, 500]` | **Estimated.** |
| `star/F-III` | `[1.5, 4]` | `[4, 12]` | `[6000, 7500]` | `[20, 300]` | **Estimated.** |
| `star/G-III` | `[1.5, 3.5]` | `[8, 20]` | `[4800, 5800]` | `[40, 200]` | **Anchored: Capella Aa** (G8III) ~2.6 M☉, ~12 R☉, ~4,970 K, ~79 L☉. |
| `star/K-III` | `[1, 3]` | `[10, 60]` | `[3900, 4800]` | `[50, 600]` | **Anchored: Arcturus** (K1.5III) 1.08 M☉, 25.4 R☉, 4,286 K, 170 L☉; **Aldebaran** (K5III) ~1.16 M☉, ~45 R☉, ~3,900 K, ~440 L☉; **Pollux** (K0III) ~1.9 M☉, ~8.8 R☉. |
| `star/M-III` | `[1, 4]` | `[40, 120]` | `[3000, 3900]` | `[500, 5000]` | **Partly anchored**: γ Crucis (M3.5III) ~1.5 M☉, ~84 R☉, ~3,600 K, ~1,500 L☉. |

**Consistency with `star/red-giant`** (`mass 0.8–5, radius 20–100, temp 3000–4500`): `star/K-III` and
`star/M-III` sit inside it on every axis. Deliberate — see §1.3.

**`mag_gauss` for all fourteen: `[0.1, 10]`.** Evolved stars have weak, disorganised surface fields;
this matches the pack's existing A/B/F/G values. Do not carry the M-dwarf value (`[100, 1000]`) over
to `star/M-I` — a red supergiant is not a scaled-up red dwarf, and that field would drive spurious
shielding and aurora tags.

**All figures above are TYPICAL FOR CLASS, not measurements**, and inherit the module's existing
`typicalForClass: true` honesty contract (DATA-R4). A real catalogue value must still win.

---

## 5. The invariant check

`docs/dev/type-vocabulary-prev4.md` states the acceptance criterion, which is the owner's own
sentence made testable:

> For every type T in the vocabulary, a body created AS T must classify back AS T.

**D19 is a live violation of it, and is the worked example that document was missing.** Antares is
created as `M1.5Iab` — an M supergiant — and comes back an M dwarf. Cite it there.

**What the test must assert.** Stars have no classifier fingerprints (65 of the pack's 70 are
`planet/*`, zero are `star/*`), so the planet-side harness in `classification.audit.spec.ts` cannot
be reused. Until stars gain fingerprints — a pre-V4 job — the round trip is asserted on
**parameters**, which is the only inverse that exists:

1. **Separation.** For each letter, `starParamsFromType('<L>2I')` and `starParamsFromType('<L>2V')`
   must return **different bands**, with the supergiant at least 10x the dwarf in
   `radiation_output`. This is the assertion that actually fails today, for every letter.
2. **The named worked example.** `starParamsFromType('M1.5Iab+B2Vn')` returns mass in `[8, 25]`,
   radius in `[300, 1200]`, `radiation_output` ≥ 30,000. Pin Antares by name in the test title — it
   is the reported case and it should be obvious when it regresses.
3. **The fallback is unchanged.** For a string with no luminosity class (`'M5.5Ve'`, `'dM6'`,
   `'M2'`, `''`), the result is **byte-identical to today's**. This is the assertion that stops the
   patch changing the 34 bare stars a Local Neighbourhood import already returns.
4. **Companion isolation.** `'M1.5Iab+B2Vn'` and `'M1.5Iab'` return the same band. If they differ,
   the `+` split is wrong.
5. **Range handling.** `'F5IV-V'` → the F dwarf band; `'M1-2Ia-ab'` → `star/M-I`.
6. **Every new key resolves.** For each of the fourteen keys, some MK string reaches it. A band
   nothing can reach is the bug this patch exists to fix, re-created.

---

## 6. Explicitly out of scope

### 6.1 The companion (`+B2Vn`)

**Defer.** Antares is a binary imported as one star, and fixing that means *creating a node*, not
looking up a parameter: a second star, an orbit, a mass-ratio split, and a decision about whether the
pair gets a barycentre. `convertRegion` already builds multi-star systems from the census, so the
machinery exists — but it is driven by separate catalogue ROWS, and a companion encoded inside one
row's spectral type is a different input path entirely.

Doing it here would turn a parameter patch into a system-construction change. Note it, leave it.

### 6.2 The subclass (the `1.5`)

**Defer, and it is genuinely low value now.** Letter plus luminosity class already gets nearly the
whole win: it is the difference between 0.265 M☉ and ~14 M☉. The subclass refines temperature within
a letter — for M, roughly 3,900 K at M0 to 3,000 K at M6 — a ~25% effect against errors of 50x,
6,000,000x and 1,800x.

It also wants doing properly rather than as a third lookup: interpolation across a band by subclass
position, which is a `type-vocabulary-prev4.md` design question. Adding a per-subclass key set now
would create hundreds of keys and actively obstruct that.

### 6.3 The full MK string everywhere

**Not here.** That is part two of the owner's split and it already has a home:
`docs/dev/type-vocabulary-prev4.md`. Add to that document; do not start a third.

### 6.4 Also out of scope, but note them where you touch them

- **`stardefaults.completeImportedStars`** (`import/realsky/stardefaults.ts`) fills magnetic field
  and axial tilt from `star.classes?.[0]` — which is the LETTER. A supergiant will still draw a
  main-sequence magnetic band even after this patch. One line to fix later; leave it, flag it.
- **`fillout.ts:77`** reads the class list as `.find((c) => c && c.length > 1)`, taking the FULL MK
  string where `starParamsFromType` takes the letter. D19 asks whether that is deliberate. It very
  likely is — fill-out wants a distinctive seed/label, not a band key — but **confirm rather than
  assume, and do not change it as part of this patch.**
- **The `classes` array itself** is unchanged by this work. A supergiant will still carry
  `['star/M', 'star/M1.5Iab+B2Vn']`. Whether the luminosity class deserves to be a CLASS as well as a
  band key is a pre-V4 question.

---

## 7. Things you would otherwise have to find out the hard way

**7.1 There are exactly TWO callers of `starParamsFromType`, and the second one is not about
display.** Both are in `src/lib/import/realsky/convert.mjs`:

- `starNodeFromCensus(...)` — builds the star node. Obvious.
- Inside `convertRegion`, computing a mass for the census grouping:
  `starParamsFromType(s.sp ?? '', statTemplates)?.massMsun ?? 0.4`.

**That second one changes system STRUCTURE, not just numbers, and it is the trap in this patch.**
That mass feeds `groupIntoSystems` in `census.mjs`, which decides whether two stars share a system by
mutual orbital period against `ORBIT_AUTHOR_MAX_PERIOD_YR`. Period goes as `M^-1/2`, so raising a
supergiant from 0.265 to ~14 M☉ shortens the computed period by ~7x — which can pull a pair that
currently sits outside the 1 Myr tier inside it, merging two map systems into one.

**Therefore: re-measure the system count before and after.** A Local Neighbourhood (16.5 ly) import
returned **56 systems** at v2.1.547 and should be re-checked; a change there is expected and fine,
but it must be *observed and explained*, not discovered later. The nearby field is mostly dwarfs so
the effect should be small — but Sirius A (A0/A1), Procyon A (F5IV-V) and Altair are in range.

**7.2 The build kit does NOT use this function, so the bundled maps cannot move.**
`scripts/starmap-build/build-starmaps.mjs` imports `starClasses` from `stars.mjs` but **not**
`starParamsFromType`; its stars take explicit `massMsun` / `radiusRsun` / `teff` from the curated
roster in `data/systems-real.mjs`, falling back to the archive's own stellar columns.
**`buildKit.spec.mjs` should stay byte-green through this patch.** If it goes red, you have changed
something you did not intend to.

**7.3 `starParamsFromType` is barely a day old** (added v2.1.546 for D18, to let planetless stars
become systems at all). It has no test file of its own — `census.spec.js` and `bareStar.spec.ts`
exercise it indirectly. So there is no existing spec to extend; write a new one, and §5 is its
contents.

**7.4 The midpoint is what ships.** `starParamsFromType` takes `(min+max)/2` deliberately — this is a
statement about a class, and a random draw would imply a measurement nobody made. So a band's centre
is what every star of that class gets, and a band chosen to span extremes gives every star an
atypical value. Pick bands whose midpoint is a typical member.

**7.5 The rule-pack file to edit is `static/rulepacks/starter-sf/stars.json`**, key `statTemplates`.
Adding keys there is additive and safe: the generator (`generation/star.ts`) falls back from
`star/<full>` to `star/<letter>` to default, so new keys can only be reached by something that asks
for them. That was verified when `star/L`, `star/T` and `star/Y` were added at v2.1.546 — the bundled
maps did not move.

**7.6 A second per-class table exists and will now disagree further.**
`BodyStarTab.svelte`'s `SPECTRAL_DATA` (CODE) covers the same 16 classes as `statTemplates` (DATA)
and **already disagrees with it on 8 of them** on mass and radius. This patch adds fourteen keys to
the pack that the editor's table will not have. **That is acceptable and expected** — the editor
cannot currently pick a supergiant at all, so nothing regresses — but do not "helpfully" mirror the
new bands into `SPECTRAL_DATA`. Making one table from two is `type-vocabulary-prev4.md`'s step 3, and
duplicating fourteen more entries first makes that job worse.

**7.7 The luminosity class is the HR diagram's vertical axis.** Anything done here is the same data
the banked HR-diagram phase and [[B40]] (the Hayashi limit, where giants are the open question) will
want. Name and shape the bands so they can be read as HR positions, not just as lookup rows.

**7.8 Do not "fix" the SIMBAD data.** Strings like `M2+V`, `dM6`, `F5IV-V` and `M1-2Ia-ab` are all
correct MK; the parser accommodates them, it does not correct them. The one genuinely malformed thing
in this dataset is 40 Eridani b being typed `err`, and `census.normaliseStarRows` already drops it.

**7.9 A worked expectation, to check the patch by eye.** After it, Antares should import at roughly
16.5 M☉ (midpoint of `[8, 25]`), ~750 R☉, ~3,500 K, ~165,000 L☉. Those are band midpoints, not
Antares' real values (~12–15 M☉, ~680 R☉, ~75,000 L☉) — **and that is the correct outcome**: it is
typical for an M supergiant, honestly labelled as such, and within a factor of ~2 instead of a factor
of 6 million.

---

## Nothing in this document is unwritten

All seven required sections are complete. The figures in §4 are marked anchored or estimated
individually; the estimated ones are the rarer classes (O and early-B giants) where a real-world
anchor was not available with confidence, and they are flagged rather than dressed up.
