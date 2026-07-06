# Tags, Points & Constructs of Interest

Tags are how Star System Explorer records *what a place or a ship is like* — beyond its raw physics. They power the **Find by tag** search, they give players concrete reasons to visit somewhere, and the autopilot reads them to decide where ships can refuel, mine and dock. This guide explains where tags come from and how to make them your own.

## Two kinds of tag

**Physics tags** are derived automatically from a body's properties, every time the system is processed. You can't remove them — they *are* the physics — and they update if you edit the world. Things like `magnetic/dynamo`, `geology/plate-tectonics`, `orbit/tidally-locked` or `stability/marginal`. Open the **Newton panel** (the apple icon) on any body to see every tag and the exact rule or physics that produced it.

**Hand-added tags** are yours: add them to any body or construct for any purpose, and remove them freely. They survive re-processing, so the engine's auto-retagging never wipes your work.

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

## Constructs of Interest (CoI)

A **Construct of Interest** is the same idea applied to *ships and stations*: a tag describing a capability or role. Three core categories are always on — Status, Owner and Purpose — plus optional ones you can enable: Hull class, FTL drive, Disposition, Tech & origin, and Resources.

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
