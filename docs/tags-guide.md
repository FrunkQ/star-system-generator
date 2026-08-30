# Tags

Tags are how this engine says what a thing is *like*. A world has a mass and a temperature; it also
has plate tectonics, a breathable atmosphere, a lethal radiation dose, an ice deposit somebody could
mine, and a syndicate that considers it theirs. The numbers are the physics. The tags are everything
the physics *means*.

They are deliberately the main currency of the app rather than a labelling feature bolted onto it.
A tag is a short piece of plain language — `geology/plate-tectonics`, `frontier/refuelling`,
`faction/red-syndicate` — carrying a value when it needs one. That makes them readable by you at the
table, filterable in the finder, testable by the automated rules, and legible to the renderers: the
craters, volcanic vents, auroras and cloud decks you see on a planet are drawn from its tags, not
from the equations directly.

That indirection is the point. The physics decides what is true; it writes tags; everything else
reads tags. Nothing that draws a picture needs to know how a dynamo works, and nothing in the
physics needs to know what a picture looks like. It also means that when you add a tag by hand you
are speaking the same language the engine does — which is why a hand-added tag can drive a visual
feature or satisfy a rule exactly as a derived one would.

This is an ambition the app has not entirely arrived at; some things are still wired more directly
than they ought to be. But it is the direction of travel, and it is why tags get more attention here
than a labelling system would normally deserve.

## Where a tag comes from

Every tag has a provenance, and the Tags tab groups them by it, because "who said this?" decides what
you can do about it.

**Physics.** Derived from the body's properties every time the system is processed —
`magnetic/dynamo`, `orbit/tidally-locked`, `hazard/radiation`, `stability/marginal`. Edit the world
and they change with it. Open the Newton panel (the apple) on any body to see which layer produced
each one, and from what.

**Automated rules.** Seeded by rules you can read and change, which test a body's physics and roll
against a chance — mineable resources, scientific draws, frontier logistics, plot hooks. The roll is
seeded from the body and the starmap, so a given world always tags the same way, and switching one
category on or off never reshuffles the others.

**Generated.** Written once, when a body was created or imported, recording something the physics
cannot work out for itself: that an obliquity was *inferred* rather than measured
(`spin/axis-inferred`), that a moon was captured rather than formed where it sits
(`origin/captured`), or that a world was invented to fill out a real star system
(`origin/generated`). Nothing re-derives these. Delete one and it stays deleted — and if you type in
a real value for something that was inferred, the tag claiming it was a guess retires itself, because
it has stopped being true.

**Yours.** Anything you add by hand, for any purpose. It survives every re-process and every save.

**Placement steers (`mega/…`).** Stamped when a mega-construct is placed somewhere the physics finds
demanding — a ringworld outside the goldilocks zone, a space elevator whose counterweight rides near
the edge of its world's gravity well. Each carries its explanation, numbers included, in the tag
itself. They are advice, never vetoes: the placement went ahead, and the tag records why it is
interesting. Written once at placement (nothing re-derives them yet), so like generated tags they
stay deleted if you delete them.

### One physics tag that is deliberately not deterministic

`biodiversity/pigment` names the pigment most of a world's photosynthetic life uses, and it is
**drawn** rather than calculated. The engine works out what light actually reaches that world's
ground — its star, filtered by its sky — scores every pigment in the rule pack against it, and
usually finds several that would work. Which one each morphology settles on is then a weighted draw
among them, seeded on the world itself — and you can pick a different one from that world's own
viable list on its Bio tab, which is a free choice rather than a correction.

That is not the engine giving up. Without an evolutionary history to consult, a real biosphere's
outcome genuinely is contingent: nature tries many things and the second best can dominate. So two
similar worlds around similar stars can legitimately grow different-coloured plants, and the same
world always gives you the same answer no matter how many times you re-process it.

### A tag that pins a body to another's orbit

`orbit/lagrange` (value `l1`..`l5`) records that a body or construct rides one of another body's
Lagrange points — a trojan moon at a giant's L4, a station holding at L1. The relationship is the
authored fact; the ORBIT is derived from the secondary on every pass, so editing the planet moves
its trojans. The physics judges the configuration rather than refusing it: a trojan too heavy for
the pair (Gascheau's bound — for a small trojan, the secondary must stay below about 1/25 of the
total mass) wears `stability/very-unstable` and `fate/eject` with the margin quoted in the reason,
and a body authored at the collinear points L1/L2 is told honestly that only station-keeping holds
anything there. The full working appears on the body's physics trace, and the physics page's
"Lagrange points & trojans" section explains the criteria.

`stability/inside-circumbinary-limit` marks a world that orbits BOTH stars of a pair but sits too
close in. A pair does not pull steadily from one place — the field turns twice per binary orbit — and
inside the critical radius that forcing pumps the orbit until it crosses the stars themselves, and
the encounter throws the world out. The limit is Holman & Wiegert's 1999 fit, typically two to four
times the gap between the stars and widening sharply with the pair's eccentricity and how evenly
matched the two stars are; the tag comes with `stability/very-unstable` and `fate/eject`, and the
reason quotes the limit, the mass ratio and the eccentricity it was computed from. A world that
clears the limit by less than 1.2x reads `stability/marginal` with no fate instead — the fit gives
the lowest surviving orbit rather than a hard wall, so "just outside" is a warning, not a sentence.
Every barycentre publishes the ring's two edges, so the panel, the verdict and the map all quote the
same numbers. The physics page's "Circumbinary worlds" section has the formula and the real cases.

When two bodies at a Lagrange point are made into a PAIR, the marker moves to their barycentre: the
pair rides the point and the members orbit each other. They are then judged on two things rather than
one - Gascheau's bound against their COMBINED mass, and whether their own separation fits inside the
Hill sphere the pair has at that point. A pair too wide for it reads `stability/very-unstable` with
`fate/eject` on BOTH members, because when a point stops holding a pair there is no lighter member
being thrown by a heavier one - they both leave. A real binary trojan is comfortably tight: (617)
Patroclus and Menoetius are about 680 km apart where their Hill radius at Jupiter's L4 is some
55,000 km.

A **construct** parked at one also gets `flight/fuel-use`, which says what staying there costs it:
*coasting* at a sound L4/L5 (a free-fall orbit holds it for nothing), *station-keeping* at L1/L2/L3
(periodic trim burns, which is what real missions at those points budget for), or *holding* when the
trojan regime is breached and there is no equilibrium left — the ship is thrusting continuously to
stay somewhere the physics does not hold it.

## Categories

A category is a group of related tags sharing a namespace and a colour: `faction/*`, `resource/*`,
`purpose/*`. It is the unit you configure, under **Settings → Tagging**.

Each category has a name, a colour, and the list of things it applies to — star, planet, moon, belt,
ring, construct. A category that applies only to constructs will not clutter a moon's Tags tab, and a
rule belonging to it cannot target one.

Some categories are marked **system**. The engine matches those tags by name — ships refuel on
`frontier/*`, mine `resource/*`, inherit FTL from `drive/*`, and have their readiness gated by
`status/*` — so removing one would break something quietly. You can still switch a system category
off, rename its tags, recolour it and rewrite its rules; you simply cannot delete it.

Everything else is yours to create and remove. Deleting a category does not delete tags already
applied to your worlds and ships: it stops describing them, and its rules stop running.

### Anomaly — the category that explains a broken world

There is one category that does not work like the others, and it is worth knowing why.

**Anomaly** holds *reasons*: Unknown Origin, Alien Technology, Alien Biosphere, Subsurface
Structure, Unobtanium, Magic, Precursor Engineering, Exotic Matter, Divine Will, Nanite Ecology,
Reality Fault, Experimental Terraforming — plus anything you add, which you can do on the row
itself without going near the settings.

You do not put an anomaly on a *world*. You put it on an **override** — a value you pinned by hand
on the body editor's Overrides tab — as that override's stated reason. Several overrides can share
one reason. Reset the override and the reason goes with it; the tag itself stays in the category,
ready for the next world.

**The tag names what it is accounting for**, which is the point of it. A player does not read
"Alien Technology" and learn nothing; they read *Alien Technology: Anomalous magnetosphere,
surface temperature*, and know exactly which readings on that world do not add up. A pin with **no** reason
assigned shows players nothing at all — if you would rather present a strange world as though it
were ordinary, that is your business and the program does not interfere.

It is a **system** category, so it cannot be deleted, and it obeys every normal control: hide a
single reason, or hide the whole category from players, and neither the tag nor the fact that
anything was pinned reaches them.

### Colour

A tag takes its category's colour unless you give it one of its own. That is the whole mechanism
behind a single Faction category in which every faction flies a different colour — one category, one
place to manage it, each tag distinct on the map.

## Making them your own

**Adding a tag.** On any body or construct, open the Tags tab, pick a category (or Custom for free
text), give it a name and optionally a value. Tags are case-insensitive and spaces are fine: type
"Red Syndicate" and it is stored tidily and shown back to you properly capitalised.

**Overriding the physics.** That same list offers the engine's own namespaces — Geology, Tidal,
Aurora, Habitability and the rest. Add one by hand and it *wins*: it survives every re-derive, it
suppresses the tag the engine would otherwise have written, and it drives everything the real one
drives, including the visuals and the rules. If you want a volcanic moon the physics does not think
is volcanic, you can simply say so. The tab groups these as **GM overrides** and says plainly that
they may contradict the physics, because they may.

That is a *tag* override, and it changes the tag rather than the number behind it. There is a second
kind that changes the number — the body editor's **Overrides** tab, where you pin an albedo, a
surface temperature, a density, a pressure or a magnetosphere and the engine derives everything
downstream from your figure. The two are described together on the [physics page](/physics#overrides).
The Anomaly category below is what ties them: it is how a value override says *why*.

**Who sees it: three settings, not two.** Every hand-added tag carries one of three, and the button
beside it cycles through them:

- **shown** — players see the tag in full. This is the default.
- **anon** — players are told that *something* is here and not what it is. The tag becomes a neutral
  grey "Undisclosed" marker: no name, no value, not even the category's colour. It is the setting for
  *there is clearly something going on with this star and you have not worked out what*.
- **hidden** — players see nothing at all, and no sign that anything was hidden.

None of the hidden information ever reaches them by any route: not the shared catalogue, not a player
view, not the holo table, not a printed report. So the syndicate that secretly runs a station can be
tagged, filtered and mapped by you without ever appearing on their screens — and if you would rather
the crew knew a station has an owner they have not identified, that is the middle setting.

Two more things worth knowing about the middle one. Several anonymous tags on one body show as ONE
marker, deliberately: three markers would tell players you are hiding three things, which is a fact
you did not choose to give them. And a whole category hidden from players stays hidden — the category
switch is the stronger statement, and a tag inside it shows nothing even at **anon**.

## Automated tagging rules

Each category can carry rules that apply its tags for you. A rule is a condition over a body's
physics — bulk composition, mass, temperature, pressure, liquid coverage, geology regime, the main
atmospheric gas, whether there is **solid ground** to stand on, other tags — plus a chance, built
with a guided editor or written as raw JSON when the logic gets involved. *Has solid ground* and
*Is a giant* sit next to each other in that list and are **not** each other's opposite — one asks
whether there is a surface at all, the other whether this is a giant — so pick the one you mean.

These are a hook generator, not a first-principles resource model. They are chosen to be plausible
(helium-3 in old airless regolith, diamonds on carbon-rich high-pressure worlds, refuelling at
hydrogen giants) and they are gated on physical sense: a rule offering something you must lift off
the ground also checks there is ground to lift it from, so a gas giant is not advertised as an ice
quarry on the strength of the water in its envelope.

Your own hand-added tags can be conditions in rules, so a tag you invent can drive automatic flavour
across a whole starmap. Prison colonies only on ore-rich moons; a slim chance of alien ruins on any
terrestrial; a depot at every ice giant — that is a rule.

All rules can be switched off at once with **Run automated tagging rules** in Settings → Tagging.
Physics tags and your own hand-added tags are unaffected.

## Showing them on the maps

At the bottom of **Find by tag** is a tray, *Show highlight markers on player views*. Drag a tag chip
or a category bubble onto it, or press the `+` on a tag. That takes a live selection of anything you
want made visible: a whole category, a single tag, or several at once. Whatever you pick is badged on
your maps and on the players' at the same time, in each tag's own colour. **Player Views → Quick
overrides** keeps the mute — one click drops every badge mid-scene without losing the selection.

Find by tag is the picker because it already knows what is actually on the map, with counts: badging
a tag nothing carries would show nothing.

Pick the Faction category and every faction flies its own flag. Pick `frontier/refuelling` alone and
the players see exactly where they can top up, and nothing else. On the starmap a system shows the
union of everything inside it, so a faction holding one moon lights the whole system, and a contested
system honestly shows more than one flag. Once anything is highlighted the starmap fades back the
systems carrying none of it, and a key names the colours.

The same badges appear under a body's name in its info block, so the map and the panel always agree.

### Choosing how they look

Each player view picks its own look, under **Player Views → edit a preset → System → Highlighted
tags**:

- **Tag chips** — exactly as they look in the panels. The map and the panel agree completely.
- **Map pins** — a pin carrying the tag's initials. The fewest pixels, best when a lot is highlighted.
- **Flags** — the chip flown from a short staff. The most readable at a glance, and the tallest.

A **Marker size** dial sits beside the shape — its own dial rather than a share of the label size,
because names are sized for reading and markers for spotting, and on a busy map those pull in
opposite directions. A pin can carry initials, the full name to its right, or nothing but the shape;
a flag's staff can be silver, gold, white, black or the tag's own colour, and it has to contrast
with the **background** rather than with the flag — black disappears against a space backdrop.

The colour is never part of this choice: it always comes from the tag or its category, so a faction
flies its own colour whichever shape you pick. Every shape carries its text, so a highlight still
reads under a CRT or colour-blind filter.

The selection is momentary — it is never saved into a preset — and a hidden tag can never appear, so
leaving a faction highlighted is safe.

### Three tags that draw themselves

A few physics tags on a STAR are not badges but part of the star's own picture, on the GM starmap, the
player starmaps and the system view alike:

- `stellar/activity` — the magnetic-activity bucket. An *active* or *flare-star* star shows flares
  licking off its limb; a *quiet* one does not.
- `stellar/jets` — a pair of collimated beams along the magnetic axis: a fed black hole, a neutron star
  or a magnetar. *moderate* or *strong*.
- `stellar/shedding` — a shed shell of wind around an evolved star: *wind* on a giant, *shell* on a
  supergiant or a heavy-loss hot star.

They are derived, so they cannot be switched on from the renderer; the way to remove a mark is to
remove the tag (the Tags tab), and the way to earn one is to change the numbers that derive it — feed
the hole, or swell the star.

### Writing a cloud deck by hand

`structure/cloud-deck` is the one tag whose value is worth knowing in full, because it is the one GMs
most often write themselves — a world is *supposed* to be shrouded and the physics disagrees. It reads
`<species> <bucket> <coverage>`, one tag per deck:

    structure/cloud-deck = water overcast 0.664

The species is the LIQUID the deck is made of (`water`, `ammonia`, `sulfuric-acid`,
`ammonium-hydrosulfide`, `methane`), the bucket is one of *wisps, scattered, broken, overcast, veil*,
and the coverage is the exact share of sky the physics found. **You only need the first two.**
`water overcast` on its own works exactly as it always has — the engine reads the bucket's typical
coverage and draws it — and that is the form to type when you just want a cloudy world. The number is
there for the engine's own use: it is what lets a deck that is only barely condensing fade in gently
instead of appearing all at once, which it used to do.

Decks stack by temperature, not by the order you write them: whichever species condenses hottest sits
deepest, and the top one is the one you mostly see. A hand-written deck beats a derived one of the
same species, so writing `water veil` on a dry world does not fight the physics — it replaces it.

### Giving a gas giant a polar vortex

`feature/polar-vortex` is the other tag worth writing by hand, and the other one that draws itself.
It puts a polygonal jet at a giant's pole — Saturn's hexagon is the one everybody knows. One tag per
pole:

    feature/polar-vortex = north 6
    feature/polar-vortex = south round

A number is a polygon with that many sides (4 to 9; six is the commonest). The word `round` is a
plain cyclone with an eye and no polygon, which is what Saturn's southern pole actually has. Leave a
pole out entirely and it has nothing. You can also just write a bare number — `feature/polar-vortex
= 6` — which puts the same polygon at both poles, and is what every map saved before this did.

**The engine rolls these for you, and your tag always wins.** Most giants that spin fast enough get
them; how alike the two poles are follows the world's axial tilt, because a strongly tilted planet
runs its hemispheres through opposite seasons. That is a *rule*, not a simulation — see
[known fudges](#) on the physics page for exactly how much of it is a roll of the dice. If you want a
particular world hexagonal, tag it and the roll steps aside.

## Finding things

**Find by tag** searches every body or construct carrying the tags you pick. Switch between bodies
and constructs, set the scope to one system or all of them, search by name or browse the category
bubbles, and stack several tags to narrow the results — a result must carry all of them. Inside a
system it sorts by distance, which is how you answer "where is the nearest gas giant I can refuel
at?".

## Sharing

A category — its tags, colours, applies-to list and rules — saves to a file and loads back, so you
can flavour a starmap to your universe and hand the result to another GM. Categories also travel
inside the starmap itself, so a shared map arrives already speaking its own language.
