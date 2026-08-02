# Tags, Points & Constructs of Interest

Tags are how Star System Explorer records *what a place or a ship is like* — beyond its raw physics. They power the **Find by tag** search, they give players concrete reasons to visit somewhere, and the autopilot reads them to decide where ships can refuel, mine and dock. This guide explains where tags come from and how to make them your own.

## Two kinds of tag

**Physics tags** are derived automatically from a body's properties, every time the system is processed. You can't remove them — they *are* the physics — and they update if you edit the world. Things like `magnetic/dynamo`, `geology/plate-tectonics`, `orbit/tidally-locked` or `stability/marginal`. Open the **Newton panel** (the apple icon) on any body to see every tag and the exact rule or physics that produced it.

**Hand-added tags** are yours: add them to any body or construct for any purpose, and remove them freely. They survive re-processing, so the engine's auto-retagging never wipes your work.

### Tags a crew would actually act on

Most physics tags describe a world; a handful decide what you *do* about it, and those are the ones worth knowing by name.

| Tag | Reads | What it settles |
|---|---|---|
| **Radiation hazard** | `hours` · `days` · `weeks` · `months` · `years` · `chronic` · `background` | **How long a character standing there survives.** Not sieverts — the time to a lethal dose. Io is *hours*, Europa *days*, Mars *years*, Earth *background*. Past fifty years the acute model stops meaning anything, so it says *chronic* (a real long-term cancer risk) rather than quoting a number nobody lives to test. |
| **Orbital radiation** | the same words | The reading for the space a **ship parks in**, shown only when it is genuinely different news. In the whole Solar System that is Earth and Venus — Earth's ground is *background* while the orbital space around it, inside the Van Allen belts, is a lethal dose in *days*. |
| **Ascent cost** | `trivial` · `moderate` · `hard` · `extreme` | **Whether the party can leave.** Luna is trivial, Mars moderate, Earth hard, Venus extreme. |
| **Magnetosphere** | `dynamo` · `induced` · `tenuous` · `unshielded` | Why the radiation figure is what it is. |
| **Space weathering** | `low` · `moderate` · `high` | **Not a dose.** How much radiation the *visible surface has accumulated over its lifetime* — it drives tholin reddening and regolith greying. A constantly resurfaced world like Io reads *low* here while its radiation hazard reads *hours*. Both are correct; they answer different questions. |

That last pairing catches people out, and it is worth reading twice: a world can be the most violently irradiated surface in a system and still be lightly weathered, because volcanism repaints it faster than anything can build up.

Tags live in tidy namespaces — `resource/*`, `science/*`, `atmosphere/*`, `geology/*`, `orbit/*` and so on — so related tags group together in the finder and in reports.

## Points of Interest (PoI)

A **Point of Interest** is a tag that gives a *world* narrative or practical value — a reason a crew would actually go there. Some are seeded automatically from the physics; you decide which categories are switched on under **Settings → Generation**.

Each candidate PoI has a physics **condition** (what must be true of the body) *and* a **probability**, rolled from a seed tied to the body and system. So a given starmap always tags the same way, but not every world has everything — and toggling one category never reshuffles the others.

| Category | What it flags | Examples |
|---|---|---|
| `resource/*` | Extractable materials | heavy & rare metals, fissiles, helium-3, deuterium, water ice, volatiles, hydrocarbons, diamonds, organics, asteroid ore |
| `science/*` | Research draws | biosignatures, pristine protoplanetary disks, tidal labs, impact records, remnant proximity, exotic chemistry |
| `frontier/*` | Logistics | gas-giant & ice **refuelling**, life-support resupply, aerobraking, gravity assists, waystation sites |
| `intrigue/*` | Pure bait (low odds) | anomalous signals, derelict rumours, uncharted features, legends |

These are scientifically plausible (helium-3 on old airless regolith, diamonds on carbon-rich high-pressure worlds, refuelling at hydrogen giants) but deliberately a **hook generator**, not a first-principles resource model — grist for your plots.

**Surface hooks need a surface.** Anything that means "land, dig it up and lift it" — the metals, fissiles, water ice, diamonds, organics, fuel depots and life-support resupply — is gated on the body having solid ground (`makeup.gas` under 0.5, the same test the world classifier and the habitability score use). A gas giant contains plenty of water and metal by mass, but it is spread through a planet-sized envelope with nothing to stand on, so it no longer offers to resupply you. What a giant *does* keep is everything you can do from orbit or the upper atmosphere: **helium-3, gas skimming, deuterium, aerobraking and gravity assists**.

## Constructs of Interest (CoI)

A **Construct of Interest** is the same idea applied to *ships and stations*: a tag describing a capability or role. Six categories are always on — Status, Owner, Purpose, Resources, Hull class and FTL drive. Universe and Tech & origin are on by default but can be switched off; Disposition is off by default. All are editable under Settings → CoIs.

CoI tags aren't just labels — the engine reads them. A construct's FTL drive and range are inherited from its fitted engine (a warp drive confers FTL; a sublight drive doesn't), and its refuel sources come from its fuel tanks. The **autopilot** uses all of this to route a ship: what it can mine, where it can refuel, whether it can jump.

## Find by tag

The **Find by tag…** panel (from the rail) searches every body or construct that carries the tags you pick:

- Switch between **Bodies** and **Constructs** at the top — they use different tag sets.
- Set the **scope** to one system or all systems.
- **Search** for a tag by name, or browse the **category bubbles** and expand one to see its tags.
- Click tags to stack them into the filter — results carry **all** the active tags (AND logic).
- Inside a system on a scaled map, results show the distance to each hit and sort nearest-first.

Handy for "where's the closest gas giant I can refuel at?" or "show me every world with a breathable atmosphere."

## Manual tagging & your own rules

You can tag anything by hand, and you can invent tags that don't exist yet — a `faction/red-syndicate` or a `plot/the-lost-fleet`, whatever your campaign needs. Hand-added tags are then usable as **conditions in PoI rules**, so your own tags can drive automatic flavour on other worlds.

## Author your own packs

PoI and CoI rules are bundled into **packs** you can stack and load, so you can flavour a whole starmap to your universe. A pack is a set of rules, each with a **condition builder** (all-of / any-of groups, numeric range sliders, NOT toggles) and a raw-JSON fallback for power users.

Want prison colonies only on ore-rich moons? A slim chance of alien ruins on any terrestrial? A refuelling depot at every ice giant? That's a pack. Build them in Settings, save them with your starmap, and share them with other GMs.
