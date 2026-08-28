# Changelog

All notable changes are listed here:

## v3.0.164 - 28th Aug 2026

- Ships and worlds are now sized honestly against one another: one scale runs across every kind of object, so nothing small ever draws larger than something big. Stars are on that scale too, which means a red dwarf and a red supergiant are no longer the same size on screen.
- Zooming all the way out on a lone star now frames the star. How far back the view stands is worked out from how large things are as well as how far apart, so a supergiant with no planets no longer fills the screen.

## v3.0.163 - 28th Aug 2026

- Board only. Two finished branches - the scale law and the supergiant framing fix - were never merged, so the release went out without them. Recorded with what is missing and what still needs building.

## v3.0.162 - 28th Aug 2026

- Board only. The coordinator hands over, recording what shipped to production, what is still open and what this stretch of work learned.

## v3.0.161 - 28th Aug 2026

- Board only. The moon Hill spheres are confirmed by eye, which was the last documentation claim resting on unseen behaviour; and the scale-law work is marked as trusted to real use rather than held for a further review.

## v3.0.160 - 28th Aug 2026

- Getting Started explains who owns the clock on a player view: what taking it does, when players may run their own time, and what a self-scrubbing view can and cannot show.

## v3.0.158 - 28th Aug 2026

## v3.0.159 - 28th Aug 2026

- The small reference codes beside the physics page headings are gone. They were our own internal tracking numbers: some pointed at a planning document no longer kept, and the rest meant nothing outside the workshop. The page is for explaining the physics.

- Players who scrub their own clock now see ships fly. A ship in transit is drawn where it would be at the time that viewer is looking at, rather than held at wherever the GM last left it - the same rule the planets have always followed. Views that follow the GM are unchanged. The one thing a scrubbed view cannot show you is what happens after a ship's current plan ends, because where it parks is the GM's to decide and has not happened yet.

## v3.0.157 - 28th Aug 2026

- Four small reference codes beside physics page headings are removed. They pointed at a planning document that is no longer kept, so there was nowhere for a curious reader to go and look.

## v3.0.156 - 28th Aug 2026

- Board only. The small reference codes beside the physics page headings are recorded as a question: four of them point at a document that no longer exists, and the rest are internal item numbers that mean nothing to a reader.

## v3.0.155 - 28th Aug 2026

- Internal notes only. Two reference numbers in the engine map had each been used twice, and one was quoted from the code with both meanings. Settled by whichever claimed the number first.

## v3.0.154 - 28th Aug 2026

- Docs only. The engine map is sorted for the move to a new engine. Each of its 205 entries now says
  what KIND of truth it is: physics that stays true whatever we build, a property any derivation
  engine has to have, something the browser or the GPU imposes, or something that is only true of
  this code. Nothing was renumbered and nothing was moved - the labels are a new field beside each
  entry, so every reference to an entry from the code still lands where it did. Half the entries
  turned out to be two truths in one, which is worth knowing before the move is planned.
- The half that is only true of this code is now read the useful way round, in a new document: for
  each one, what shape would have made that fault impossible in the first place. Four separate
  drawings of one tag pill, two pickers that look like duplicates and are not, a store still
  answering to names it stopped using - as a set they describe the pressures this codebase put on
  the people working in it, which is the most useful thing to hand a new design.
- Three entries were found to have gone out of date since they were written and are corrected in
  place, with what was checked. One is marked suspect where its explanation is wrong but the fault
  it records was real. Two entry numbers are being used twice, and one of them is quoted from the
  code with both meanings - flagged loudly rather than renumbered, because renumbering is what
  breaks a year of references.

## v3.0.153 - 28th Aug 2026

- Getting Started explains the Lagrange points: the shapes they are drawn as, what may be placed in each, and why the mass ceiling is a guide rather than a gate.

## v3.0.152 - 28th Aug 2026

- Getting Started covers two more of the things that landed since the guide was written: where a world can actually orbit (Hill spheres, and the ring a pair of stars holds), and centring the starmap on a star so the distance rings measure from it.

## v3.0.151 - 28th Aug 2026

- Board only. The remaining gaps in the Getting Started guide are counted and listed, so whoever finishes it starts from the list rather than from a search.

## v3.0.150 - 28th Aug 2026

- Getting Started explains the atmosphere editor: why the gas sliders are logarithmic, when the readout speaks parts per million, and how to force a unit when you type.

## v3.0.149 - 27th Aug 2026

- The physics page explained the compact transit route by a reason that is no longer true. It was described as a saving on traffic; it is in fact how a ship position is defined while it is under way, worked out at both ends from the same curve rather than sent from one to the other.

## v3.0.148 - 27th Aug 2026

- Docs only. The camera and scale redesign said one of its remaining pieces was still to do when it had already shipped months ago. Corrected, so the next person to pick it up does not rebuild something that is already there.

## v3.0.147 - 27th Aug 2026

- Docs only. A criterion for carrying the engine map into a new engine: which of its rules are about physics, which about how a derivation engine must behave, which about the browser, and which only about the code as it stands today.

## v3.0.146 - 27th Aug 2026

- Docs only. The scale-law phase gains a second dial, so ship sizes can be set relative to worlds rather than tied to them, alongside the floor fix it still needs underneath.

## v3.0.145 - 27th Aug 2026

- A player view no longer rebuilds its whole 3D scene when a drifting ship reports a new position. Found while finishing the ship-message work: the update was being applied to the very scene object the check compares against, so the check could never see what had changed.

## v3.0.144 - 27th Aug 2026

- Flying a ship no longer re-sends your whole campaign to every player, several times a second. A ship's course now travels as its own small message and the player view works out where the ship is from it, exactly as it already works out where a planet is - so while a ship flies to plan, nothing is sent at all. Commits, replans, aborts and your own edits still reach the table immediately.
- Player views no longer receive a large per-system update that nothing was reading.

## v3.0.143 - 27th Aug 2026

- Board only. Two outstanding items checked before work was scheduled on them: one appears already fixed by the transit repairs, and the other did not reproduce in three full test runs. Both recorded with the evidence rather than sent off to be hunted.

## v3.0.142 - 27th Aug 2026

- Board only. A correction: the explanation given for two recent findings was wrong, and measuring showed why. The quantity said to drift as a planet travels its orbit is worked out from the orbit itself and does not drift at all.

## v3.0.140 - 27th Aug 2026

## v3.0.141 - 27th Aug 2026

- Board only. A player reported that zooming all the way out on a lone red supergiant shows nothing but orange. The framing works out how far to stand back from how far apart things are, and never from how big they are, so a huge star at the centre counts for nothing.

- Design note only. Player views are meant to work out where a ship is for themselves, the way they already work out where a planet is, so that flying a ship stops re-sending the whole campaign to every viewer. Written up with the questions it needs answered first. It turns out the pieces are largely already there and were never joined up.

## v3.0.139 - 27th Aug 2026

- Docs only. The playbook gains a measured note on what it costs a session to read into this codebase, and what that means for how work should be grouped.

## v3.0.138 - 27th Aug 2026

- Board only. A correction to what the player-view network work can be expected to achieve on its own, so the result is not misread when it lands.

## v3.0.137 - 27th Aug 2026

- Board only. The seasonal-worlds idea is joined to the surface-areas work: a world whose water freezes and thaws does not do it everywhere, so what changes over a year is a region rather than a planet, and the two are better built together.

## v3.0.136 - 27th Aug 2026

- Board only. A world whose oceans freeze and thaw each orbit is neither a frozen world nor a wet one, and saying so is more interesting than either. Recorded as something to build when planet generation is next rederived.

## v3.0.135 - 27th Aug 2026

- Board only. Two faults found this week turn out to be the same one: a value that falls either side of a line, fed by something that drifts back and forth across it. Captured as a single piece of work rather than a fix each time it surfaces.

## v3.0.133 - 27th Aug 2026

## v3.0.134 - 27th Aug 2026

- Board only. The flickering tags turn out to be correct physics rather than a fault: values that move as a planet travels its orbit carry a few tags back and forth across a threshold. Nothing is wrong, but it does re-send the whole campaign each time, so it is folded into the work already planned for that.

- Board only. The three tags that come and go on every snapshot sent to players were confirmed in the running app, and the worry behind them turned out to be unfounded: nothing hidden has ever reached a player. The real cause is that two copies of an open system exist while the clock runs and drift apart, so players are served a slightly stale one. Recorded with the measurements; nothing changed yet.

## v3.0.132 - 27th Aug 2026

- Board only. A routing note recording what was fixed, what is routed next and in what order, and the principle that came out of tracing the player-view fault.

## v3.0.131 - 27th Aug 2026

- Board only. Recorded a fault found while tracing the player-view memory problem: three tags come and go on every snapshot sent to players, and the likely cause would mean hidden tags reaching them some of the time. Being confirmed before anything is changed.

## v3.0.130 - 27th Aug 2026

- Board only. A rule for when a player view may run its own clock: it may whenever everything on screen can be worked out from the time alone, and must follow the GM whenever something is moving in a way only the GM can know.

## v3.0.129 - 27th Aug 2026

- A player view no longer rebuilds the entire system every time a ship moves. Watching a ship fly while the clock ran could fill memory until the tab died, taking the GM window with it, because each update tore down and rebuilt every planet, moon and orbit in order to draw the ship a little further along. A ship that has only moved now just moves. Anything else still rebuilds, exactly as before.

## v3.0.128 - 27th Aug 2026

- Board only. The player-view memory fault is traced to its root and the fix is designed rather than patched: send only what cannot be predicted, and let a player view simulate the rest from a timestamp, the way it already does for planets.

## v3.0.126 - 27th Aug 2026

## v3.0.127 - 27th Aug 2026

- Groundwork for the player-view memory fault. A campaign snapshot is only meant to be sent when it has actually changed, and something in it is changing on every clock tick, so the whole thing is going out repeatedly to every connected player. This adds a diagnostic that names the field responsible rather than leaving it to be guessed at.

- A gas giant's two poles are no longer copies of each other. Saturn was getting its hexagon at both, and the real Saturn has one only at the north - the south is a plain cyclone with an eye. Which way a world falls follows its axial tilt: a barely tilted planet runs both hemispheres under the same steady conditions and tends to do the same thing at each pole, while a strongly tilted one puts them through opposite seasons and they diverge. Jupiter, tilted three degrees, comes out with a polygon at both poles as the Juno probe found; Saturn, tilted twenty-seven, comes out hexagon north and cyclone south as Cassini found.
- Every gas giant that spins quickly now has polar vortices at all. Jupiter and Neptune previously had none, which was a coin flip rather than anything physical. What actually prevents them is a day so long that there is no spin to gather the winds at the pole.
- The physics page is honest about this one: it is a rule of thumb, not fluid dynamics, and the known-fudges section now says exactly which parts are rolled and why matching Jupiter and Saturn is the rule being sensible rather than correct. You can override any of it by tagging a world by hand, and the tag format is written up for that.

## v3.0.124 - 27th Aug 2026

## v3.0.125 - 27th Aug 2026

- The gas sliders now work where the chemistry does. Each one runs on a logarithmic scale across eight decades, so a trace gas has as much of the slider as the bulk gas does, and below one per cent the readout switches to parts per million - 2.82 ppm rather than 0.000282 per cent. Type a value in the unit shown, or add a per cent or ppm suffix to force the other one.

- Saturn's hexagon is a hexagon. It was being drawn as a six-petalled flower, because the boundary was a wave rather than a polygon - and a wave wrapped around a pole gives you petals with sides that curve inwards, not flat edges and sharp corners. It is also the right size and in the right place now, sitting just inside the auroral ring at the latitude Saturn's real hexagon occupies.
- Gas giants have a polar vortex at both poles rather than only the north. Both ends of a spinning world have jets converging on them: Jupiter has a ring of storms at each pole and Saturn's south has a cyclone with a clear eye, even though only its north is hexagonal. Turning the globe no longer shows a bare far pole.

## v3.0.123 - 27th Aug 2026

- Board only. The design for the gas sliders is settled: a log axis, and a readout that switches to parts per million below one per cent so trace gases are legible and typeable.

## v3.0.122 - 27th Aug 2026

- A trace gas is no longer deleted by being looked at. The box beside each gas showed three fixed decimals, so anything under 0.0005 per cent displayed as zero - and simply clicking into the field and out again wrote that zero back, removing the gas and shifting every other gas with it. Trace values now keep their significant figures, and a box handed back unchanged is left alone.

## v3.0.121 - 28th Aug 2026

- A ship that has flown somewhere now has its orbit line drawn where the ship actually is. The GM's map draws orbits flat, in the plane of the system, which is right for everything it places that way - but a ship that has arrived somewhere is placed on the plane it actually arrived on, so its line and the ship itself only ever met at two points. A station that has never flown anywhere was drawn correctly in the same picture, which is what gave it away.
- A ship under way draws no orbit line at all on the GM's map, matching the 3D view: it is not on an orbit while it is flying.

## v3.0.120 - 27th Aug 2026

- Board only. The player-view crash is reproduced and traced: with the clock running, a following player view rebuilds its entire 3D scene on every incoming snapshot even when nothing in the system has changed, fifty-nine times out of sixty-one in the captured run.

## v3.0.119 - 27th Aug 2026

- Auroras now ring the poles instead of reaching a third of the way to the equator. An auroral oval marks where the outermost closed magnetic field line comes down, and that sits close to the pole however bright the aurora is - near sixteen degrees on Jupiter, fifteen on Saturn, twenty on Earth. The old drawing pushed it further out the stronger the field got, which is backwards, and on Jupiter it covered enough of the planet to hide the very banding that makes Jupiter look like Jupiter. A stronger aurora is still a wider one, within the range a real one occupies.
- A gas giant's polar vortex is drawn in the planet's own colours rather than a fixed blue, so Saturn's hexagon is a darker gold instead of a grey patch and Uranus's is a deeper blue.
- A giant only gets a permanent storm if its bands are sharp enough to hold one in place. Any banded giant used to have a good chance of one, which gave Saturn a standing dark oval it has never had; Jupiter keeps its Great Red Spot.

## v3.0.118 - 27th Aug 2026

- A ship that changes orbit around the world it is already at now actually arrives. The repair that keeps a ship's record honest only ever asked whether it was orbiting the right WORLD, and a transfer from a high orbit to a low one ends at the world it started from - so a ship could lower itself to 6,500 km and keep a stored orbit of 768,000 km, a hundred and seventeen times too big, with its panel still reading "High Orbit".
- A parked ship is now stored with the phase of its orbit and not just the size, so the orbit a player reads puts the ship exactly where the GM's map does - at the moment it arrived, an hour later, and a year later.
- A ship that has arrived somewhere stops rewriting its own record. It had been doing so several times a second for the rest of the campaign, and because that record travels to the players, every player's 3D view was rebuilding itself just as often - which is why a ship's model never appeared on the player view, and part of why the camera would not settle.
- A parked ship draws its orbit line again. The line was suppressed for any ship that had a course at all, and a course outlives the journey that made it - so a ship that had finished flying drew no orbit for the rest of the campaign.

## v3.0.117 - 27th Aug 2026

- Board only. Two things found while checking the gas giants against the owner's screenshots, both measured and neither yet changed. Jupiter looks washed out next to Saturn even though its bands are more than twice the contrast underneath - its aurora covers about a third of the disc and flattens them. The strength is right, since Jupiter's magnetic field is twenty times Saturn's; the reach is not, because the real thing is a small ring around each pole. And a gas giant's polar vortex is drawn in a fixed slate blue that takes no account of the planet it sits on, which is why Saturn's hexagon reads as a grey patch on a gold world.

## v3.0.116 - 27th Aug 2026

- Saturn is no longer drawn as a small Jupiter. Its banding was being set almost entirely by the planet's mass, because the quantity that should have separated the two - how much of the sky the upper cloud deck covers - was being rounded up to "all of it" for both. Jupiter's ammonia clouds cover about seven eighths of its sky and Saturn's about half, and that difference is most of why one is stripy and the other is a pale ball. Saturn now reads at a bit over a third of Jupiter's contrast instead of three quarters, and Uranus and Neptune stay smooth.

## v3.0.115 - 27th Aug 2026

- How much of a giant's methane you can see is now decided by the clouds above it rather than guessed from its temperature. The old rule had three fixed rungs, and giving Saturn its ammonia clouds back nudged it a few degrees cooler and straight across one of them, which turned it grey. Methane condenses colder than anything else, so where a world has methane clouds they sit on top and nothing hides them - which is why Uranus and Neptune are unchanged, and why Jupiter and Saturn are gold rather than green. Both now read warmer and closer to life, and Saturn keeps the bands it regained, at a little over half Jupiter's strength.

## v3.0.114 - 27th Aug 2026

- Found and removed the real cause of the gas-giant banding fault. A cloud deck had to have a minimum amount of its gas present before it was allowed to exist at all, and below that line it did not thin out, it vanished. The measurement that settles it: the deck being deleted was not a wisp - it was twenty times thicker than the point where a cloud stops looking thicker. What decides whether you can see a cloud is how much light it blocks, and the engine already worked that out a few lines later, so the extra rule was only ever hiding decks. Editing a trace gas on a giant now changes its bands smoothly or not at all.
- Saturn has its ammonia clouds back, and with them its banding. Its ammonia sat just under the old cut-off once the hydrosulphide reaction had taken its share, so it was drawn as a nearly featureless ball. Saturn's clouds are ammonia. It is the only body in either bundled map that changes.

## v3.0.113 - 27th Aug 2026

- A GM who moves the clock at all now takes the players' time controls, not only a GM who sets it running. Dragging the scrubber counts: everyone snaps to the GM's time and the controls step aside, so nobody is quietly looking at a different moment during something that matters.
- Because nudging a scrubber is over in an instant, the controls do not simply reappear the moment the GM lets go - that would be a flicker. They stay away, with the GM's time shown, until a reader presses "take control". A player therefore always knows whose clock they are on, and getting their own back is one press.
- The offer only appears while the GM's clock is still. There is nothing to take back from a clock that is running, and a button that undid itself a second later would be worse than none.

## v3.0.112 - 26th Aug 2026

- Fixed: making two bodies that share a Lagrange point into a pair sent the companion onto a wider and wider orbit every time anything was edited, with no warning at all. The engine now understands that a PAIR can ride a Lagrange point, not only a single body - which is a real arrangement: (617) Patroclus and Menoetius are two 110 km bodies about 680 km apart circling each other while they ride Jupiter's L4 together. When two bodies at a point become a pair, the point now belongs to the pair, and the two simply orbit each other inside it. Nothing drifts any more.
- A binary at a Lagrange point is now judged on two things a single body is never asked. Whether the point can hold the PAIR, since two bodies weigh more than either one and a place that would hold one can fail to hold both. And whether the pair can hold ITSELF together where it sits - the two orbit each other inside a bubble they only have by virtue of being there, so a pair spread wider than that bubble is pulled apart and the two go their separate ways. Both come with the reason and the numbers.
- Fixed, and older than the above: a correct binary at a Lagrange point was marked very unstable for "overlapping" with the planet whose point it rides. Sharing that orbit is what being a trojan MEANS. Single trojans were already excused this; pairs were not, so any pair anyone built was mis-flagged.

## v3.0.111 - 27th Aug 2026

- A ship that had flown somewhere is now repaired the moment it is looked at, rather than waiting for a checkpoint almost nobody ever reaches. Ships kept the orbit they set off from, which is why one could read "Earth: Far Orbit" beside an orbital period of five years, show as orbiting Earth on its own panel and the Sun in the picker at the same time, and hang motionless in space on every player view. The repair already existed; it was keyed to a clock that only one control in Settings ever moves, so in ordinary play it never ran. It now follows the clock everyone is actually looking at.
- Each repair is counted on the ship itself. Nothing reads it or acts on it - it is there so a saved file can tell us whether ships are still being written wrong somewhere upstream. A healthy ship shows no counter at all.
- An orbit is no longer described using a distance measured from a different world. "Earth: Far Orbit" was Earth's name joined to the radius of the Sun orbit the ship had left months earlier - a number so large it fell past every band. Where the two disagree the panel now says where the ship is and declines to guess how high.
- The transit planner and the ship panel now work out a ship's host the same way, so they can no longer name two different worlds for the same ship at the same moment.

## v3.0.110 - 27th Aug 2026

- Board only. A measurement worth recording against the cloud-threshold item: our own Saturn currently has no ammonia deck. Its authored ammonia sits just under the level the model needs to condense one, so the planet is drawn very nearly featureless, and Saturn's real clouds are ammonia. Jupiter clears the same threshold by less than half again. That points at where the threshold sits rather than at how sharply it is crossed.

## v3.0.109 - 27th Aug 2026

- Board only. The gas-giant banding item is closed out with what was actually built and what was not. Two findings worth carrying: the atmosphere editor works in percentages and spreads any edit across every other gas, so measuring it in raw fractions looks at the wrong axis entirely and shows no fault at all; and a cloud deck does not fade into existence, it arrives about twenty times past the point where a cloud stops looking thicker, so no amount of fading in the renderer can smooth the moment one appears. Also captured: the composition sliders cannot reach the values most worlds actually use, and the box beside them quietly rounds a trace gas to nothing if you click through it.

## v3.0.108 - 27th Aug 2026

- A test now covers opening a map, making an edit and reprocessing - the exact sequence the gas-giant banding fault lived in, and one the suite had never exercised. Everything before it checked that processing the same system repeatedly changes nothing, which it does; nobody had checked what happens when you change something in between. The fixture is a giant deliberately parked one editor step away from a cloud threshold.

## v3.0.107 - 26th Aug 2026

- Board only. A user-reported fault reproduced and diagnosed but deliberately not fixed yet, because the fix is a change to what the engine can describe rather than a patch. Making two asteroids that share a Lagrange point into a pair orbiting each other - a real arrangement, and one this very map contains - sends the companion onto a wider and wider orbit every time anything is edited, with no warning of any kind. The cause is that the engine has no way to say "this PAIR rides the Lagrange point", only "this BODY does", so two separate passes each rebuild the arrangement their own way and undo each other. The number it drifts towards is the width of the Lagrange offset itself, which is what gave the mechanism away.

## v3.0.106 - 27th Aug 2026

- A gas giant's banding now strengthens and fades with the clouds that cause it, instead of switching between two fixed looks. The belts on a giant come from a deeper cloud deck showing through the one above it, and the engine treated having any such deck at all as a yes-or-no question: a world with one was drawn at full Jovian contrast and a world without one was drawn very nearly featureless, with nothing in between. So a giant whose atmosphere sat near a condensation threshold flipped between the two on the smallest edit the composition editor can make. Banding is now proportional to how much of the deeper deck you can actually see, and the storm oval fades in with it. Jupiter, Saturn, Uranus and Neptune are all drawn as they were.

## v3.0.104 - 27th Aug 2026

- Board only. Recorded the decisions that unblock the clock and ship-placement work: the time everyone looks at is the GM's DISPLAY time, the campaign checkpoint is a separate thing and not part of what anyone sees, any touch of the GM's clock takes the players' controls and snaps them to it, and a ship found carrying stale placement is repaired on sight and the repair counted - so a user's file can tell us whether the underlying fault is still happening.

- A cloud deck now records how much sky it actually holds, not just which of five bands it falls into. A band cannot say how nearly a deck exists, and that is the one thing needed to fade a deck in gently instead of having it appear whole - Mars's real water-ice haze covers 2.4% of its sky and was being drawn at 8%, the typical figure for its band. Decks you have written by hand are unaffected: "water overcast" still means what it always did. Everything that depends on how cloudy a world is has become more accurate with it, so Venus is now read as very nearly total overcast rather than 92%, which darkens its modelled surface light.

## v3.0.103 - 27th Aug 2026

- Board only. Captured B97 and traced it end to end: a ship that has arrived somewhere can be described three different ways at once, and two of the readings on screen are blends of two of them. "Earth: Far Orbit" turns out to be Earth's name joined to the radius of the Sun orbit the ship left months ago, and the orbital period beside it is that same old orbit read correctly. The cause is that the record of where a ship lives is only ever brought up to date by one explicit action in Settings, so in ordinary play it never is, and different parts of the app disagree about whether to trust it or work around it. No behaviour changed; the fix rests on a decision about when an arrival becomes real.

## v3.0.102 - 27th Aug 2026

- A player view now either steers the clock or tells you whose clock it is on - never neither, and never both. Time on a player view is a tool: worlds can be wound to any moment and are drawn correctly, because their positions are pure mathematics. So the players keep that freedom, and lose it only for the moments it would mislead.
- Starting the clock on the GM view takes it. That is the GM saying this moment matters: the players' controls step aside, their view snaps to the GM's time and rate, and it says why. Pausing hands the freedom straight back.
- A display that has no time controls now shows the campaign time instead of nothing, and rides the GM's clock rather than free-running at its own rate all evening. If there is no GM connected it keeps its own clock and stays honestly unlabelled, rather than putting the campaign's name on a time that is not the campaign's.
- Note the thing this does NOT yet fix: a ship that has finished its journey still stands still on a player view even when the clocks agree, because nothing yet publishes where it goes after it arrives. That is a separate piece of work and it is on the board.

## v3.0.100 - 27th Aug 2026

- Board only. The gas-giant banding fault is traced to its cause from the reporter own save: a giant stripes are painted only by cloud decks lying beneath the top one, so a stack that gains or loses a deck at a condensation threshold gains or loses every stripe at once.

## v3.0.99 - 27th Aug 2026

- Board only. Captured G49: who owns the clock on a player view. A ship that has arrived somewhere orbits properly on the GM's map and sits motionless on the players', and chasing that turned out to be a symptom of something never decided - whether a player's view runs on the GM's time or its own, and what happens to the things on screen that cannot survive the difference. Worlds can: their positions are closed-form, so any clock draws them correctly. A ship cannot, because what it is doing is known only to the GM. Measured on a real save: the GM's copy of one ship moves 112,000 km an hour and the players' moves none, and a single day of clock drift puts it 2.6 million km from the world it is parked at.

## v3.0.98 - 26th Aug 2026

- Board only. The gas-giant banding item is corrected and narrowed: the makeup a giant is judged by is rewritten during processing, and the same function already caused a fault where a file behaved differently depending on how many times it had been loaded.

## v3.0.97 - 26th Aug 2026

- Rings no longer have an orbit line drawn through them. A ring was getting both its band and a thin ellipse through the middle of it, which on a planet's rings lands as a hard line across a soft disc. Belts have never had one; rings were simply missed. The band is the orbit - it is drawn at the radius it occupies.

## v3.0.96 - 26th Aug 2026

- Board only. Captured B95: a gas giant loses its bands on the first atmosphere edit after opening and regains them on the next. The banding threshold is real physics, but the quantity it reads cannot legitimately be moved by an atmosphere edit at all.

## v3.0.95 - 26th Aug 2026

- Board only. The performance-readout item grows the part that matters: diagnostics are held in memory and die with the tab, so a crash destroys the evidence of what caused it. Writing a compact record when memory first runs high is what makes the crash report itself.

## v3.0.94 - 26th Aug 2026

- Board only. Captured B94, a 3D player view that resets its shot every few seconds and eventually runs out of memory (not reproducible on demand, but the always-on diagnostic already records what would identify it), and A77, an on-screen memory and performance readout for beta pages including player views.

## v3.0.93 - 26th Aug 2026

- Board only. Captured G48: painting a ship&rsquo;s name on its hull, placed and scaled and coloured by hand. The hull-picking the drive placer already uses turns out to be most of what it needs.

## v3.0.92 - 26th Aug 2026

- Set a ship&rsquo;s colour from the 3D model dialog, and watch the hull repaint as you choose it. A model with no materials of its own is painted in the ship&rsquo;s colour, but that colour could only be changed on the Basics tab, with no view of the hull while you did it. It is the same single colour as before &mdash; marker, hull and plume dressing still follow it &mdash; now settable from either place.

## v3.0.91 - 26th Aug 2026

- Board only. Captured A76: an untextured model should let you choose its hull colour, not only its livery accent. The hull currently inherits the ship map-icon colour with no way to say otherwise.

## v3.0.90 - 26th Aug 2026

- Every page load no longer reports two files missing. The app probed each rule pack for an optional liquids and biospheres file; no pack has ever shipped either, so the browser logged a 404 for both on every single load, which reads as a broken app. Campaign customisations were never using that route anyway: your own liquids, atmospheres and biospheres are saved with the campaign and travel with it, which a pack file could not do. Nothing about how they work has changed.

## v3.0.89 - 26th Aug 2026

- Choosing where to go is one control now, and it is the same one everywhere. Picking a destination, picking a body in the system view, and picking a system to jump to were three different things to learn - and the interstellar one was three plain dropdowns with no search at all.
- It shows the system as it really is. Sol, then Earth, then Luna, then the Gateway parked at Luna - indented, so you find a station by knowing where it is rather than by knowing it counts as a construct. Before, you picked a CATEGORY and drilled into it, one at a time.
- Type filters you can switch on and off, several at once, with a count on each. Turn on Constructs and you see just the four of them - still sitting under the worlds they orbit, so you can tell the station at Earth from the one at Luna.
- Type to search anywhere in the map, in any of them.
- Where you already are is not offered as somewhere to go, but it still appears, greyed, so the moons and stations around it are not left dangling under nothing.

## v3.0.88 - 26th Aug 2026

- Fixed: adding a trojan at a Lagrange point threw an error and the type picker never opened. This was broken by yesterday's circumbinary work and it broke an existing feature, not just the new one - reported against Njord in Alpha Centauri. The picker now opens for an ordinary body, for a trojan, and for a circumbinary body, and there is a test that mounts all three so this cannot happen again unnoticed.

## v3.0.87 - 26th Aug 2026

- Changing orbit is a manoeuvre now, and it looks like one. Moving a ship between two orbits of the same world is the most classical thing in spaceflight - burn once to stretch the orbit out to the height you want, coast half way round, burn again to settle there - and the app could neither draw it nor, it turned out, fly it. Asked to raise a ship from a low Jupiter orbit to a high one it offered the torch option and nothing else, at 45 km/s. The two-burn answer costs 19.6.
- The picture is the one everybody already knows: the orbit you are leaving, the orbit you are joining, the transfer between them, and both burns marked. It is drawn around the planet rather than across the sky - a ship lowering its Jupiter orbit over three days is, from the Sun's point of view, a three-million-kilometre streak trailing after Jupiter, which is true and useless.
- The aerobrake dip is drawn, in purple. Since aerobraking became real the engine has known how deep the ship dips, how many passes it takes and how long they last - and drew none of it. A Mars arrival dipping to 40 km, twelve times over 615 days, is now a line you can point at. The passes trace the same loop, so a dozen of them read as one dip while the ship genuinely goes round a dozen times.
- A journey that ends in aerobraking now lasts as long as it always said it did. The passes were costed and written into the ship's log, but the plan's duration stopped at the moment the ship reached the planet - so it was drawn parked for the 615 days it was still skimming the air.
- Routes that fly through the sun are no longer offered. The gravity-assist search checked whether a ship survives the swing past the planet and never asked where the long legs went in between - and one of them passed 550,000 km from the centre of the Sun, inside the corona, offered as an ordinary route. It stayed hidden because the old drawing fell apart near the sun and sketched something tamer. Candidates that dive inside the star's kill zone are now dropped the same way an unsurvivable flyby already was; a safe route is found instead.

## v3.0.86 - 26th Aug 2026

- The circumbinary ring is now the same colour family as the Hill spheres, one step deeper - pale yellow for a Hill sphere, deep gold for the ring. It was pink, which read as an unrelated kind of thing when it is really the same kind: both answer "where can something orbit". The Lagrange zones keep their separate green, because those answer a different question.

## v3.0.85 - 26th Aug 2026

- Ships stop jumping when they arrive. A ship reached its destination and then popped sideways into orbit - 90,884 km of it at Jupiter, invisible from across the system and obvious once you zoomed in. Three things were disagreeing at once: how high a low orbit is, where round the planet the ship should appear, and which plane it should circle in. The step is now zero at every altitude tested.
- How high an orbit is, is now decided once. The planner offered altitudes worked out from the world itself - where its air stops dragging, where a day-long orbit sits, how far its gravity reaches - while the code that parked the ship used a rough multiple of the planet's radius. They disagreed by up to ninety-five times: a high orbit of Jupiter is 26.7 million km, and the ship was being parked at 280,000. Luna was being offered a high orbit it is far too small to have.
- A geostationary arrival aimed at the centre of the planet. It is now offered the same treatment as every other orbit.
- Arriving at a world means entering orbit around it, and the arrival speed says so. It used to report zero for a full rendezvous, which would mean hovering over the planet - something no amount of braking achieves. Meeting a SHIP still means matching its speed exactly.

## v3.0.84 - 26th Aug 2026

- Transits are planned in three dimensions. They never were: the solver asked each body for its position and got back the FLAT one - the shadow it casts on the reference plane - so a world tilted out of that plane was planned to as though it were not. The tilted position has always been available; transit simply asked for the other one.
- Distances are longer now, by real amounts. From a ship at 3 AU in the Sol Expanse map: Earth, which has no tilt, is unchanged to the metre; Mars is 79,000 km farther; Jupiter 122,000; Saturn 633,000; and the Main Belt, which sits ten degrees over, is **2.4 million km** farther than the engine used to think. Fuel and flight times follow.
- Courses now climb and dip. A route to a tilted world used to be drawn flat and the world drawn where it really is, so the line and its destination disagreed - most of half an AU for the Main Belt. In the 3D view the line goes where the ship goes.
- Flat systems are untouched, and not merely to a tolerance: for two bodies in the same plane the new expression for a transfer's geometry is algebraically the same as the old one, so an existing campaign plans exactly the journeys it always did.
- A ship cut loose mid-flight now drifts in three dimensions too, rather than dropping to the plane.

## v3.0.83 - 26th Aug 2026

- A ship now points the way its engine is actually pushing. It used to aim down its course line and simply turn around for a braking burn, which is right for a torch burn and wrong for almost everything else: an efficient transfer's burn is a change of velocity, not a shove along it, so it sits at an angle. Measured on the same journey, the old rule drew the arrival burn 107 degrees off, and a gravity-assist arrival 153 degrees off - very nearly backwards. Orientation only matters while the engines are lit, and nothing drew a ship's heading at all until the 3D models arrived, so this has been wrong quietly for a long time.
- The drive plume now burns at the thrust the ship was actually given. It was being worked out by subtracting one end of a burn from the other, but most routes leave those end values blank, so the sum was the ship's whole orbital speed rather than the burn. A 0.3 g freighter's departure flared at 2.4 times its real thrust - and a 57-hour torch burn, the longest in the game, showed 3% of its own, which is to say the drive looked switched off through the most dramatic thing a ship does.
- The acceleration arrow includes the drive. It showed gravity only, which while a ship is burning is about ten thousand times too small and points at the star instead of where the ship is going.
- The velocity arrow is fixed by the same change as the burn drawing: during a burn it was reading the borrowed path points, so it reported over a thousand kilometres a second for a ship doing twenty.

## v3.0.82 - 26th Aug 2026

- Burns are drawn where they actually happen, and at a speed a ship could actually manage. A burn lasting under an hour inside a three-year transfer used to catch none of the path samples at all — the whole journey was drawn as one line of a point every two days, then chopped into acceleration, coast and braking after the fact — so the burn borrowed two coast points forty-eight hours apart and the ship was drawn crossing three million kilometres in forty-one minutes. That is 1,366 km/s for a freighter that manages about 10 km/s in an hour, and it happened at exactly the moment you were watching, because that is when the engine is lit. Each phase now draws its own path over its own stretch of time: the same burn draws at 19.4 km/s.
- The ship no longer glitches when you speed the clock up. Every point along a course now carries the time it belongs to, instead of the four different parts of the app that place a ship each assuming the points were evenly spaced. They were not, and the ship, the line it flies along, the telemetry readout and the planner's preview marker could all disagree about where it was.
- Local transfers — moon to moon, or a change of orbit around a planet — are drawn as curves rather than as polygons. Points are now placed where the path BENDS rather than at a fixed number of hours apart, because a path swings fastest exactly where it passes closest to something. A Jupiter-local transfer used to turn 57 degrees between one drawn point and the next; it now turns under 4.
- Long, stretched transfers are drawn on the trajectory they were actually solved for. The path was stepped forward at a flat two-day interval regardless of what it was doing, which is fine on a gentle arc and hopeless on a sharp one: a gravity-assist leg that dips inside Earth's orbit was being drawn flung out to 53 AU at 313 km/s. The step now shortens automatically wherever the path turns quickly.
- Also fixed, found by the above: a gravity-assist route was drawn starting from a point that was never on its own trajectory, so the picture and the flight were two different journeys.
- Ordinary interplanetary transfers are unchanged. That was checked rather than assumed, and the numbers are recorded.

## v3.0.81 - 26th Aug 2026

- Board only. G47 banks a full transit review with the subsystem measured up front, so whoever takes it starts from line counts and a blast radius rather than an impression.

## v3.0.80 - 26th Aug 2026

- Board only. The duplicated B88 is resolved: the base-map upgrade item keeps the number it claimed first and has already shipped under, and the ordinary-orbit arrival step becomes B92 in its spec and in the local-transfer design note.

## v3.0.79 - 26th Aug 2026

- Board only. Captured G46: local transfers and how a journey is drawn — the burn phases, the ship's motion along its path, the missing orbit-change picture and the aerobrake dip line. Design note written with the causes measured rather than guessed; no engine changes.

## v3.0.77 - 26th Aug 2026

- Aerobraking is a real manoeuvre now instead of a flat discount. It used to subtract the ship's heatshield rating from the arrival burn wherever the destination had any air at all — which meant a ship arriving at a Lagrange point half an astronomical unit from Jupiter collected the same free braking as one skimming the cloud tops, and Mars scrubbed speed as freely as Venus.
- What changed: the atmosphere's own capability now matters, worked out from the pressure and scale height the engine already derives. Gas giants, Venus, Earth and Titan are thick enough that the heatshield is the limit — free braking, as it should be. Thin air like Mars gives about a tenth of that per pass, which lands close to what Mars Odyssey really managed. Airless worlds give nothing.
- Aerobraking now costs TIME rather than being free: shedding more than one pass can take means going round again, and the ship's log says how many passes, how long, how low it dips, and what climbing back out to the orbit you actually wanted costs in propellant. Arriving in a high orbit is still allowed — it is a dip and a climb — and now it is priced. A ship with fuel to burn can still switch aerobraking off and go fast.
- Also fixed: the heatshield rating is a maximum ENTRY SPEED, not a fuel allowance. A ship closing far faster than its shield can survive must burn down to a survivable speed before the air can help at all.

## v3.0.78 - 26th Aug 2026

- The circumbinary ring is drawn. Where a pair of bodies can hold worlds that orbit both of them, that ring now appears with the Hill spheres, in its own pink shade so it is not mistaken for a Hill sphere (amber) or a Lagrange zone (green). Its inner edge is where the pair stops throwing things out; its outer edge is where the pair loses its own grip. A pair at the centre of its system has nothing outside it to lose that grip to, so the ring is drawn open outward rather than walled at an invented distance.
- Right-click inside the ring to put a body there. It is offered with a mass ceiling rather than a mass rule: the stability physics assumes something light enough not to pull the pair about, so the type list is filtered to that by default - and, as everywhere, the filter is a switch you can turn off and author what you like, leaving the tags to say what breaks.
- Small bodies get their Hill spheres back. The drawn bubble was gated on a mass bar belonging to the flight propagator, so Pluto drew nothing while Charon drew a circle - the heavier body of the pair losing out to the lighter. Which spheres appear is decided by what you have selected, so the bar was doing nothing but hiding things.
- A body that shares a barycentre now shows the region ITS COMPANION leaves it, not a circle worked out from its own wobble about the shared centre. That wobble made Pluto's sphere four times smaller than Charon's despite Pluto being eight times the mass. Pluto now reads about 8,200 km and Charon about 2,400 km, the right way round. Anything that is not half of a pair is unchanged, and the flight propagator is untouched.
- Selecting a body now shows a consistent region of interest: itself, everything it contains, its whole chain of parents, and its siblings - but not the contents of its siblings or of its parents. One rule, shared by the Hill spheres and the new ring, instead of each overlay having its own idea one level deep.

## v3.0.76 - 26th Aug 2026

- Arrival is now one setting instead of two. The Rendezvous/Flyby dropdown has gone; there is a single arrival velocity, and it says everything the dropdown said and more. Leave it at zero — the default — and the ship matches velocity and stays, exactly as before. Give it any speed and it is a flyby at that speed, labelled as one beside the control. The old pairing needed a mode AND a hidden speed that nothing exposed, and the two could disagree with each other.

## v3.0.75 - 26th Aug 2026

- Board only. Two faults recorded from an owner report that selecting Pluto draws a Hill sphere around Charon and none around Pluto. The drawn bubble is gated on a mass bar that belongs to the flight propagator rather than to the display, so a small planet is dropped while a moon of the same pair is kept; and a binary member bubble is worked out from its small wobble about the shared centre, which makes the heavier body bubble the smaller one. Neither is changed yet - the fix for the second needs the circumstellar half of the stability work, which does not exist in the engine.

## v3.0.74 - 26th Aug 2026

- Ships arriving from another star now get a sensible orbit instead of the one they left with. Aim at a named world and you park in a high orbit around it; aim at the star and you arrive at the edge of the system, which is where a starship decelerating in actually finds itself. Previously the old orbit came along for the ride, so a ship that set off from a tight moon orbit arrived the same distance from a star.
- Flyby pass speed is now something you set. The planner always had the parameter and never exposed it, so every flyby ran as "cross at whatever speed you happen to be doing" — often extremely fast. Choose a pass speed and the ship brakes to it, and the size of that burn follows how much speed has to change, so asking to creep past costs a long burn and asking to scream past costs little.  
- A flyby and a rendezvous no longer look identical on the map. Both brake, so the burn colours could never tell them apart; now a rendezvous ends in a ring at the destination and a flyby carries straight on past it and ends in an arrowhead, because the ship does not stop and neither should its line.
- Fixed: a gravity assist's braking burn was drawn with a single point, so the red brake stroke never actually appeared.

## v3.0.73 - 26th Aug 2026

- The bundled-map upgrade now lists the planets and moons you would lose, not just the ships. It only ever itemised constructs, so a system you had populated yourself showed an empty list under a warning that said your work would be dropped - measured on a real campaign, a Procyon holding eighteen bodies the updated map has no counterpart for reported nothing at all. Every body the new edition cannot match by name is now named and counted before you decide.

## v3.0.72 - 26th Aug 2026

- Board only. Writes down the rule the physics has always been meant to follow: it steers you away from arrangements that break physics, and never stops you. A criterion tags and explains; it does not refuse an edit, clamp a value you set, or quietly fix your map. Alien tech, a reality breakdown, unobtanium or a plot device are all reasons the engine cannot see, so the verdict is information and the decision stays yours.

## v3.0.71 - 26th Aug 2026

- Board only. The circumbinary work was checked in the running app rather than only in tests: the two Uggi worlds that sit inside their pair read very unstable with the reason and the numbers, a pair member and a distant companion both still read stable, and a planet orbiting one star of the pair is untouched. Also records a duplicated finding id for the coordinator to settle.

## v3.0.70 - 26th Aug 2026

- An imported star now carries the fact that its mass, radius and temperature are typical for its class rather than measured. SIMBAD gives a spectral type and no radius, so for objects like brown dwarfs every figure comes from the rule pack's band for that class - which is why two brown dwarfs of different types can share a radius to the kilometre. That was always stated in the body's description, but nothing else knew, so the numbers read as observations everywhere they appear. The figures themselves are unchanged: brown dwarf radii really are near-constant whatever the mass.
- An unresolved pair says so. A catalogue row like "L7.5+T0.5" describes two objects seen as one; it still imports as one body, but the description now names the companion that is not on your map and says its mass is not included.
- When an import brings in nothing because the rule pack had not loaded, it now says that, instead of reporting that every object's spectral type was unsupported.

## v3.0.69 - 26th Aug 2026

- Saying "Not now" to the bundled-map upgrade is now remembered, and remembered with your campaign. It used to be stored only in the browser you happened to be using - and the "Not now" button recorded nothing at all - so a user could decline the offer and be asked again on the very next refresh, forever. The answer now travels inside the campaign file, so it survives a save, a reload, a different browser and a different machine. "Not now" silences the offer for the map edition you were asked about; a genuinely newer edition may still ask later, and the "do not ask again" tick still means never. Anyone who already dismissed the offer stays dismissed.

## v3.0.68 - 26th Aug 2026

- Fixed: a ship arriving in a NEW SYSTEM kept the old one's flight state, and was sometimes drawn where it used to be rather than where it had got to. Re-homing it onto the destination was not enough, because a cached position vector and any leftover in-system journey both outrank its new orbit when the map decides where to draw it — and both describe the system it just left. Arrival now clears them, along with a draft plan, an autopilot route and any Lagrange-point marker, all of which named places in the other system. The ship's flight log is kept, since that is history rather than position.
- Checked the arrival seam for the "snap" at a destination: arriving at any of the five Lagrange points now lands exactly where the parking begins, to the metre. An ordinary orbital arrival still steps out to its parking orbit at the last instant (about 90,000 km at Jupiter, which is one parking radius) — that one is older and separate, is now measured and logged, and will be looked at on its own.

## v3.0.67 - 26th Aug 2026

- Board only. The circumbinary work is written up on its row: what shipped, the two findings left deliberately unfixed, the bundled-example heads-up, and exactly what the drawing half must read rather than recompute.

## v3.0.66 - 26th Aug 2026

- Fixed a stability note that said the same thing twice. When a world has more than one thing wrong with it, the panel prints the predicted outcome next to the specific cause that produced it, so the two cannot be read as contradicting each other. That was written when the causes were short phrases; the newer ones are full explanations, so a circumbinary planet that ALSO crossed a neighbour's orbit had its entire paragraph repeated verbatim two lines below itself. The restatement is now a single line naming the driver and the numbers.

## v3.0.65 - 26th Aug 2026

- Board only. Real user files now have a home outside the repository, with a standing rule covering how they are used and why they are never committed.

## v3.0.64 - 26th Aug 2026

- Hierarchical triples now get a circumbinary ring too. Alpha Centauri, Polaris and Algol are each an inner binary with a third star further out, so the outer pairing has a pair as one of its two partners — and the new circumbinary limit was skipping exactly those, publishing nothing at all for the widest and most interesting pairing in the system. A tight inner binary stands in for a single point of mass, which is the same assumption the whole nested arrangement is built on, so those pairings now publish their ring like any other.
- Heads-up on a bundled example: the Uggi Traveller system has two planets, Barry and Philonius, orbiting inside the zone their two suns clear, and they are now marked very unstable. Nothing has been changed in that map. The stars are 23 AU apart, which sweeps a hole out to about 44 AU, and the two planets sit at 24 and 38. Traveller's own world generation has no rule about this, so the import placed them where its rules allow; the engine simply had no opinion until now.

## v3.0.63 - 25th Aug 2026

- Board only. Two user-reported faults captured and measured against the reporter own map: B88, the base-map upgrade offer misfiring on a three-id coincidence, re-asking on every refresh and threatening real work; and B89, brown dwarf imports dropping the radius, collapsing a binary, and only reading correctly after a reload.

## v3.0.62 - 26th Aug 2026

- The explanations caught up with yesterday's circumbinary physics, and one of them had been wrong for longer than that. The Newton panel was showing the wrong orbit for any planet that circles a pair of stars: it substituted the PAIR's orbit around the galaxy-ward star for the planet's own, so a world 0.7 AU from its two suns was labelled as orbiting at 39 AU, "as the pair" — and described as a member of the binary, which it is not. It now tells a member from a world orbiting the pair, and shows each the orbit that actually governs it. The stability card for a circumbinary world now also names the pair, the separation, the mass ratio, the eccentricity, the limit those imply and where the orbit sits against it, and explains in plain words why a turning gravity field clears a hole that a single star does not.
- The physics page has a new "Circumbinary worlds" section under Resonances and stability: the formula, why the hole is 2-4 times the gap between the stars and grows with eccentricity, the two real systems it reproduces, and the honest caveats — that the published limit is the lowest surviving orbit rather than a wall, and that outside the range the measurements covered the engine says on the panel that the number is extrapolated instead of presenting it as fact.

## v3.0.61 - 26th Aug 2026

- Binary systems now know where a planet can actually orbit BOTH stars, and say so. A world circling a pair has to keep clear of them by a surprising margin — the two stars swing round each other, so their combined pull is not a steady tug from one place but a field that turns twice per orbit, and anything too close gets shaken until its orbit crosses the stars themselves and it is thrown out of the system. The clear-out radius is typically two to four times the gap between the stars, and it grows sharply with how eccentric and how evenly matched the pair is. Until now the engine had no idea: a planet parked just outside its two suns got no warning at all, because the binary check only ever looked outward at whether the PAIR was safe from things beyond it. It now looks inward too. A planet inside the limit is marked very unstable and flung out, with the reason naming the mechanism and the numbers; one that clears it by only a little is marked marginal rather than doomed, because the published limit is the lowest surviving orbit rather than a hard wall — there are unstable gaps above it where a planet lines up in step with the stars. The figures come from the standard measured fit (Holman & Wiegert 1999) and reproduce the real cases: Kepler-16b comes out at 1.09 times its own limit, which is exactly where astronomers place it, and Pluto's small moons come out just outside the Pluto-Charon limit, which is where they are.
- Every barycentre now publishes its stable ring — the inner edge above and the outer edge where the pair's own grip gives out — so the same two numbers drive the verdict, the explanations and, shortly, the drawing.
- Generated binary systems stopped seeding planets into that forbidden zone. Two different places in the generator each used a different rough approximation of the same limit, one of them right only for a pair of identical stars and the other only for a pair with no second star at all, so an eccentric or lopsided binary could be built with planets the engine's own physics condemns. Both now ask the real formula.

## v3.0.60 - 26th Aug 2026

- Fixed: anything parked at a Lagrange point could slowly walk off it. Some orbits set their own rotation rate rather than letting the physics work it out, and several bundled worlds do — Pluto and Charon, three of Alpha Centauri's, two of Uggi's moons. A Lagrange point turns with its planet by definition, but the point was falling back to the calculated rate instead of the one the planet actually uses. Where those disagree they disagree badly: a trojan of Oceanus/Khione would have drifted about 33 degrees a year off its point, Persephone's about 58, and Pluto's far worse. Points now inherit their planet's real rate, so a moon or station placed at one holds its position — checked over a decade of campaign time on the bundled maps, for all five points, for bodies and constructs alike.

## v3.0.59 - 26th Aug 2026

- The dashed co-orbital track now watches its own cost. A dashed line is charged for its whole path rather than the part you can see, so a circle at deep zoom can imply millions of tiny segments and cost a frame for the sake of decoration. It stays dashed while that is cheap and quietly becomes a faint solid line when it is not.

## v3.0.58 - 26th Aug 2026

- When Lagrange points are shown there is now a faint dashed circle through them — the co-orbital track, meaning "the distance the planet is at right now". It exists to explain something that looks wrong and is not: on an eccentric orbit the L-points drift off the drawn orbit line, and they are supposed to. The points keep an equilateral triangle with the planet and its star at every moment, so they are always at the planet's CURRENT distance, while the drawn orbit is where the planet will be at OTHER times — and on an ellipse those are different distances, by up to 5.5% for the Moon, swinging from one side to the other over a month. That is why a different point looks off each time you look. On a circular orbit the new circle sits exactly on the orbit line, which is the giveaway that it is eccentricity doing it.

## v3.0.57 - 26th Aug 2026

- The L1, L2 and L3 zones are green now instead of amber. Amber belongs to the Hill spheres, and the two were being confused — especially at L1 and L2, which genuinely sit on the Hill boundary and overlap it. Green means Lagrange across all five; the triangular zones stay a stronger, filled green and the collinear ones a cooler, fainter teal, since nothing is actually held at those.

## v3.0.56 - 26th Aug 2026

- A ship flying a gravity-assist route now lights its drive and turns around. It had always been charged for three burns — departure, the slingshot kick and the arrival brake — but the plan was made only of coasting legs, and the drive plume reads the leg type to decide whether a ship is thrusting and which way it is pointing. So a multi-year assist flight crossed the system with a dead engine and never flipped, on your map and on your players' devices. The ends of the coasts are now real acceleration and braking phases, each lasting as long as that ship's own thrust ceiling needs for the burn, so the torch fires at the right moment and for the right duration. The route, the fuel and the delta-v are unchanged.

## v3.0.55 - 26th Aug 2026

- The Lagrange zones are now the shapes the physics actually makes, not stylised arcs. L4 and L5 draw their true tadpole outline — computed from the zero-velocity contour of the three-body problem, so it has the fat head around the point and the tail that narrows toward the planet, and it widens with the mass ratio exactly as it should. That is why Luna's zones look so much bigger than Earth's and it is correct: the Moon is over a hundredth of Earth's mass where Earth is three millionths of the Sun's, which makes the Earth-Moon co-orbital region about sixty times wider in proportion. Eccentric orbits are handled by scaling the region to the planet's CURRENT distance, so it breathes over the orbit.
- L1, L2 and L3 now have zones too — station-keeping envelopes sized on the Hill radius, drawn in amber and outlined rather than filled, because nothing is held at those points and the shape is where a station can practically hold rather than where physics traps anything.
- Right-clicking inside any of the five zones now offers to put a construct at that point. L4 and L5 additionally offer a trojan body, as before. The clickable region is the drawn outline itself, for all five.

## v3.0.54 - 26th Aug 2026

- Hill spheres now draw for the selected body's neighbourhood rather than for everything at once: the body itself, its parent, its siblings and its moons. Picking a planet looks the same as it always did — its siblings are the other planets — but picking a moon narrows the view to that moon's own surroundings, one level down, so a submoon still shows.

## v3.0.53 - 26th Aug 2026

- Moons draw their Hill spheres now, when the Hill sphere overlay is on — the boundary inside which a moon holds on to anything of its own, which is where a submoon would go. They had been excluded because the display shared its list with the flight propagator, which deliberately does not model a handoff at a moon; those are now two separate lists and the flight side is untouched. The mass bar the propagator uses turned out to be roughly Mercury's, which excluded every major moon in the solar system, so a drawn bubble is judged on whether there is actually room outside the moon to orbit in instead.

## v3.0.52 - 26th Aug 2026

- A gravity-assist plan now arrives the way it says it does. It had always charged for its arrival brake — the Delta-v and the fuel both included it, and it reported an arrival velocity of zero — but the trajectory it published ended at the speed the ship was doing BEFORE that burn, several km/s fast (4.8 km/s on a Jupiter low orbit, up to 21.8 on a Lagrange point). Anything chaining a second leg onto an assist was therefore planning from a velocity the ship would never have. The brake now also appears as an arrival burn you can see, at exactly the cost it was always quoting.
- Lagrange points dim when they are not the selected body's, so the selection's own five read at a glance instead of being lost among every other planet's.
- Engine map: seven ids had been claimed twice by parallel sessions (and one three times). The first claim keeps its number, the later entries moved, and a translation table at the top of the file maps the old numbers to the new so older notes stay readable.

## v3.0.51 - 25th Aug 2026

- Board only. G44 corrected: trojan placement already uses the right-click background menu, so a submoon rides the same path.

## v3.0.50 - 25th Aug 2026

- Board only. Captured G44 (Hill spheres on moons, so a submoon can be placed where one could actually hold) and G45 (the circumbinary annulus — a combined Hill sphere outside, and the inner stability limit that the engine does not yet compute at all).

## v3.0.49 - 26th Aug 2026

- The Lagrange zones are readable now. They were drawn for every planet at once and each lobe swept from near the planet round to the far side of the orbit, so the map filled with green smears. Two fixes, both from the owner's eye on it: only the SELECTED object's zones are shaded (every body still shows its five crosses, and selecting something already parked at a point shades the zones of the body it rides), and each lobe is now centred on its point spanning the amplitude real trojans actually keep — 42 degrees wide instead of 156. Selecting a star shades nothing, since it is the primary of every pair beneath it.

## v3.0.48 - 26th Aug 2026

- G43 phase 4: flying to a Lagrange point now actually arrives there, matching its motion. The solver and the post-arrival parking used to build the point two different ways, so a ship braked to a dead stop against one place and was then teleported to another the instant the journey completed — up to 71 million km and a 13 km/s jolt for an eccentric target like Jupiter's L4. Worse, an L1 or L2 plan sent the planner's planet-centric distance to the solver as a distance from the STAR: a flight to Mars L1 finished inside the solar corona, 1.4 AU from Mars. Both sides now read the same geometry, so every efficiency and direct-burn plan to all five points arrives exactly on the point with its velocity cancelled to zero. Gravity-assist plans still arrive fast and are logged as a separate known issue.

## v3.0.47 - 26th Aug 2026

- G43 phase 3: constructs can be parked at ALL FIVE Lagrange points, not just L4 and L5 — the transit planner could always fly to all five, but the editors only ever offered the trojan pair. Each parked craft now carries what staying there costs it: coasting at a sound L4/L5 (a free-fall orbit holds it for nothing), station-keeping at L1/L2/L3 (the periodic trim burns real missions budget for), and holding when the trojan regime is breached and there is no equilibrium left to keep. The nine scattered "is this L4 or L5" checks that had let L1-L3 fall out of the editors are now one shared test.

## v3.0.46 - 26th Aug 2026

- G43 phase 2: the engine now judges a Lagrange placement instead of quietly exempting it. A trojan at L4/L5 is tested against Gascheau's 1843 bound (for a small trojan, Routh's limit: the secondary must stay under about a twenty-fifth of the total mass); breach it and the body reads Very Unstable with the margin quoted, and the LIGHTER of trojan and secondary wears the "flung out" fate. A body authored at L1 or L2 is told the honest truth — those are saddle points where a deviation e-folds in about a sixteenth of an orbit, so station-keeping holds a craft but nothing holds a moon — while L3 reads Unstable and drifts into a horseshoe rather than being thrown out. The relationship itself is published as an `orbit/lagrange` tag, and the physics trace shows the working: the derived orbit, the Gascheau margin, and why a stable trojan coasts for free. The physics page, the tag registry, tags-guide.md and classification-and-tags.md all move in the same batch.

## v3.0.45 - 25th Aug 2026

- G43 phase 1: Lagrange points become authorable. A body or construct can be pinned to a secondary's L-point with a structured co-orbital record, and the engine derives its orbit from the secondary on every pass (editing the planet moves its trojans; the old copy-once drift is healed on load, including the Traveller example's fifteen L4/L5 stations). One shared convention module now answers "where is an L-point" for the overlay, the authoring tabs and the derivation: L3/L4/L5 as the secondary's ellipse rigidly rotated (exact, eccentric orbits included), L1/L2 as the Hill-scaled co-rotating track. The L-points overlay draws the L4/L5 tadpole regions as areas; right-clicking inside one offers "Add Trojan here", and the type picker shows the pair's Gascheau mass limit as a switchable filter (an over-mass trojan is allowed and will wear honest tags — criteria land in phase 2). A co-orbital body's orbit tab shows the relationship, with a release control.

## v3.0.44 - 25th Aug 2026

- Saving now says which world you are saving. The system save screen states that the file holds that one system only - naming it - and that your other systems, the map and the routes are not in it, with the way to save all of that. Saving the campaign gets the matching screen saying the file holds everything. Both show the filename they will write, and the File menu entries say in their tooltips which of the two they act on.
- Housekeeping: the campaign-save code that used to sit in the starmap component was unreachable (nothing could open it) and had drifted behind the real one - it never stripped derived physics or carried assets. Removed; the working save is untouched.

## v3.0.43 - 25th Aug 2026

- Board only. G43 phase 0: the Lagrange design note is posted (docs/dev/lagrange-full-citizens-design.md) with the owner questions Q1-Q7. The phase-0 probe measured today's L-point arrivals: the solver velocity-cancels against a mean-anomaly-shifted phantom while the parked track is the omega-rotated orbit, so eccentric arrivals teleport (Jupiter L4: 0.31-0.48 AU, 0.6-13 km/s step), and a panel-driven L1/L2 plan flies to the parking DISTANCE as a heliocentric radius (Mars L1 terminates 0.007 AU from the Sun). No engine changes yet.

## v3.0.42 - 25th Aug 2026

- The wrong-loader message becomes an offer. Drop a campaign (starmap) file on Load System and a compact panel names it, states plainly that opening it replaces your whole current campaign, and offers to open it - or cancel, which changes nothing. Drop a single system on Load Starmap and the same panel names it and points at the right door. Bundles (.sse.zip) go through the same panel, so the two old one-line warnings are gone.

## v3.0.41 - 25th Aug 2026

- A file dropped on the wrong loader is now named for what it is. All three loaders (Load Starmap, Load System, and the generation wizard) share one classifier that reads the file's shape - never its name - so a system save dropped on Load Starmap says "this is a saved SYSTEM" and points at the right door, a campaign dropped on Load System says so in mirror, and a file that is neither gets one plain sentence instead of a validator dump. The wizard also accepts .sse.zip bundles now, which are our own saves and used to fail there as "could not load".

## v3.0.40 - 25th Aug 2026

- Board only. Captured G43: Lagrange points become full citizens — authored trojan bodies at L4/L5 with stability tags, constructs at all five points with fuel-use tags, and transit arriving properly with velocity cancelling. Design note and owner questions come before any code.

## v3.0.39 - 25th Aug 2026

- Board only. Captured G42: load and save need to say which world they act on — a system save is not a campaign save, and a file dropped on the wrong loader should be recognised as its sister type and offered the right door with a clear warning, not an esoteric error.

## v3.0.38 - 25th Aug 2026

- Board only. The custom-liquids question closes with the owner's verdict (interiors are the deliberate edge of the simulation, until V4), and the V4 regional-worlds design is captured for the first time: areas, shocks, subsurface life, tectonics, and the event driver they all need.

## v3.0.37 - 25th Aug 2026

- Board only. A user question ("can I add a custom interior liquid?") is answered and captured: custom liquids work fully as surface oceans today, but the subsurface and interior layers are hardcoded - the gap and its fix shape are on the board. Coordinator 5 retires with its handover recorded.

## v3.0.36 - 25th Aug 2026

- Centre the map on a star: right-click any star on the GM map for Centre Map Here (and Clear). The 3D starmap's distance rings then radiate from that star and measure from it, and Reset View centres it on screen, zoomed so every star still fits. Snap grids and hex addresses never move - this is display and navigation only.
- The floating grid sighting (a hex sheet hovering above a star) did not reproduce on a fresh session and every code path checks out; a diagnostic probe now ships in the holo scene so a recurrence is measured in one console call. Bookkeeping: the commit labelled v3.0.34 was a version-number race with a parallel session - its change (the G40 capture) is recorded here.

## v3.0.35 - 24th Aug 2026

- Docs: the VTT notes and design doc now name all three ways a host app can find a session (the opener handshake, a known session id over the broker, a pasted player link) - the notes still said the first pairing had to be a paste.

## v3.0.34 - 24th Aug 2026

* A VTT host that OPENS this app can now pair with it without the GM copying anything. Star System Explorer answers the window that opened it (Mappadux's "Open Star System Explorer" button) with the same discovery announce the /bridge frame gets - session id, starmap name and Player View names, nothing from the campaign - and only ever to an allowlisted address. This is the one channel a browser's site isolation does not block, so it is the zero-paste first pairing; pasting a player link still works and is still the fallback.

## v3.0.33 - 24th Aug 2026

- Tagging rules learn where a world SITS. Sixteen new rule fields in two families - Orbit & zones (distance, period, inclination, retrograde, and membership of the habitable, kill and danger zones, the Roche limit, and the soot, frost, CO2 and CO lines, all judged against the same zones the map paints, with moons answering by their host's orbit) and Structure (part of a barycentre, moon count, rings, moon-of-a-giant). The /poi-reference page now groups its field list by family. Four new automated rules ride along: a true double planet is tagged as one, a world inside its star's Roche limit is on a doomed orbit, life inside the kill zone is remarkable, and an empty garden world is a prospector's claim - existing maps pick these up once, and nothing already rolled changes.

## v3.0.32 - 24th Aug 2026

- A tag added under a category now actually joins it: it appears in Settings > Tagging (colour-editable, deletable, and reachable by tagging rules), and is offered as a one-click chip on every other body - with its proper name. It still lists under Yours on the body that carries it, because that grouping says who put it there, not where it belongs.

## v3.0.31 - 24th Aug 2026

- Board only. The v3.0.30 production push is recorded: starsystemx.com takes the deploy-skew recovery, the radiation band fix, the full tidal-lock settlement, the follow camera, and the side-panel clip fix.

## v3.0.30 - 24th Aug 2026

- The side panel can no longer end up 'slightly chopped off at the side'. The GM-notes box was a few pixels wider than the panel, and typing in it could scroll the whole panel sideways and leave it stuck there with no scrollbar to bring it back - the left edge of every tile quietly clipped until a reload. The box now fits exactly, and the panel refuses to pan sideways at all, whatever a future control does.

## v3.0.29 - 22nd Aug 2026

- Tidal locking settled properly, all the way down. A world the engine despins can no longer keep a formation tilt - the same tides erode its axis toward the orbit normal, so generated and imported locked worlds now derive a tilt of a few degrees instead of the occasional 88 (existing saves heal on load; nothing re-rolls for unlocked worlds, and authored tilts stand). A locked body now keeps ONE fixed surface point toward its star at every tilt - and at an authored 90 degrees that point is the pole, which is a real equilibrium: a pole can be tidally locked, and it now both renders and paints that way, with the eyeball eye and the molten glow drawn at the locked point rather than assuming it sits on the equator.

## v3.0.28 - 22nd Aug 2026

- The follow-camera bounce is actually gone this time, and it was measured before it was fixed: parking the view while following stored your adjustment in a form that could not ride the camera's once-per-orbit swing around the planet, so a parked 30-degree pitch became a sixty-degree see-saw. The adjustment is now stored as bearings relative to the shot itself, so a parked view keeps exactly the elevation you left it at, at every point of the orbit, on any orbit.

## v3.0.27 - 22nd Aug 2026

- The rest of the camera fix: at wide zoom the follow shot switches to its fallback approach, which had not learnt to keep its elevation - so an inclined planet could still carry the camera under the plane, and each switch between the two approaches nudged the view once per orbit. Both approaches now hold their elevation and agree exactly where they meet, so the switch cannot move the camera.

## v3.0.26 - 22nd Aug 2026

- Following a planet on an inclined orbit no longer bounces the camera: the follow shot keeps its elevation while the direction of approach tracks the planet, so a close-in world on a fast clock holds a steady horizon. Surface-construct shots are unchanged on purpose - they aim along the true radial.

## v3.0.25 - 22nd Aug 2026

- The Zone Key now says what the Goldilocks band actually claims: liquid water is possible there on a world with enough atmosphere - the band assumes greenhouse warming, so a thin-aired world inside it is still frozen, exactly as Mars is in the Sun's own band.

## v3.0.24 - 22nd Aug 2026

- A tidally locked world with a near-90-degree axial tilt no longer sits motionless and snaps 180 degrees every half orbit: it now rolls along its orbit, which is what synchronous rotation about a pole lying in the orbit plane really looks like. Locked worlds with ordinary tilts are unchanged.

## v3.0.23 - 22nd Aug 2026

- The surface-radiation band on the body card now matches its own number: the thresholds bucketed on a different scale from the ranges the labels print, so a world at ISS-comparable dose (the Moderate band's own anchor) was published as "Very High (1,000-5,000 mSv/year)" - up to four bands too hot, on every body above 1 mSv/y. The zones were never wrong; the label was.

## v3.0.22 - 22nd Aug 2026

- An open tab no longer breaks when a new version deploys under it: if a lazy-loaded view (the 3D view, the player-view canvases, the transitions) fails to fetch its code because the files changed on the server, the page reloads itself once and carries on - which is exactly the hard refresh you would have done by hand, done for you. A genuine network outage still errors rather than looping. Found on the way: the service worker version tag had not moved since v2.0.148, which had silently killed the "new version available" prompt - bumped, so that prompt works again.

## v3.0.21 - 22nd Aug 2026

- Board only. The production patch push is recorded: starsystemx.com moves v3.0.0 -> v3.0.20 with the three field fixes, the whole break-physics feature and the star-panel radiation correction.

## v3.0.20 - 22nd Aug 2026

- Docs: the Getting Started walkthrough for building a world by hand now points at the Overrides tab, and the section on it explains what the slider colours mean and where the OVERRIDDEN flag shows up.

## v3.0.19 - 22nd Aug 2026

- An anomaly pill now reads "Experimental Terraforming: Anomalous bond albedo" rather than "...: Bond albedo" - the bare quantity read as a heading for it rather than a claim about it. Two pinned figures under one reason read "Anomalous magnetosphere, surface temperature"; the word leads the list rather than repeating.

## v3.0.18 - 22nd Aug 2026

- **The override sliders now look and behave like the rest of the app.** The coloured zones ARE the slider's track, the way Day Length and the composition controls already worked - green where the physics would put it, amber where a figure is implausible, red where it is impossible - with the engine's own answer marked on the track and the range printed at each end. The zones previously sat in a separate bar above the slider, which spanned the whole row while the slider shared it with the number box, so the two were never at the same scale. The number box moves up beside the label, as it is on every other control of this shape.

## v3.0.17 - 22nd Aug 2026

- The version no longer sits beside the SSE3 mark - hovering it still gives the full build, which was the useful half.

## v3.0.16 - 22nd Aug 2026

- **Fixed: clicking a star threw an error and left its panel blank.** Introduced in the previous release by a bad edit to the star's magnetic field card. The panel now has its own render tests - a star, a planet and an unbuilt body - so a fault of that shape cannot reach a release again.

## v3.0.15 - 22nd Aug 2026

- **A star's magnetic field card now says what it is actually doing.** It looked inert, and for two different reasons: a star sitting at its class's typical field strength adds nothing to its magnetic activity (it takes about two decades above the norm to reach the ceiling), and a GM-pinned activity overrules the field entirely. Neither means the field is doing nothing - it still sets the jets and the shed wind. The card says which of those three states it is in, and the tooltip gives the class-typical strength and the field beyond which the dynamo saturates and more buys nothing.

## v3.0.14 - 22nd Aug 2026

- **A star's panel was reporting its brightness as its radiation, and that is fixed.** "Radiation Level" read the star's luminosity - so Sol said "Low (1.00)", it repeated the Luminosity card below it, and it was the one number that could never move when you wound the star's magnetic field up. It now shows MAGNETIC ACTIVITY: the ionising half of the output - flares, X-rays, the particle wind - which is what the field actually drives and what reaches a planet as a dose.
- **A star's panel was bare; it now carries what a GM reaches for.** Ionising output (in multiples of the quiet Sun), the habitable zone, the frost line and the UV kill zone - all read from the same model the orrery draws its rings from, so the number and the ring cannot disagree.
- **Anything you have pinned now says OVERRIDDEN on the card itself**, not just in the summary line at the bottom.
- **The albedo slider reaches -1**, so you can play with a negative one without typing it.
- **Every override slider now shows you three things at a glance**: a green mark where the physics' own answer sits, an amber stretch where a value is implausible for that world, and a red stretch where it is outright impossible. The difference is real and worth drawing - a 70 tesla terrestrial has no known mechanism but breaks no law, while a negative albedo is energy from nowhere. Both are still allowed; only the wording and the colour change.

## v3.0.13 - 22nd Aug 2026

- The slice/whole toggle on the body picture gets its icon back - it had always been an empty square, because its glyph was built inside the svg by a branch that lands in the wrong namespace. It draws now, and swaps between a dashed frame (slice) and a framed inset (whole).

## v3.0.12 - 22nd Aug 2026

- The body picture keeps out of its own way: the slice/whole toggle moves to the top-left corner (it sat on the view pills), and every control on the picture - toggle, view pills, More information, the resize grip - now appears only while the mouse is over it. Touch screens keep them visible, since there is no hover to reveal them.

## v3.0.11 - 22nd Aug 2026

- **Two ways a pinned value could quietly undo itself, found and fixed.** Hollow out a heavy rocky world and the engine used to "correct" its composition to gas on the next pass - reading the low density back into the rock and throwing your composition away for good. It no longer argues: a pinned density means you meant it. And pinning an atmospheric pressure on a world that erodes its air recorded your pinned figure as that world's ORIGINAL atmosphere, so the real one was lost from every save. The baseline is now captured before the pin can touch it.
- **The version is on screen at all times.** The SSE3 mark at the top left carries the version beside it, and hovering it gives the full build - version, commit and when it was built.

## v3.0.10 - 22nd Aug 2026

- The player-connection counter on the rail icon no longer double-counts remote guests (one window was known under two ids), and a remote row in the Settings list now shows the figures the player reports about itself. List and icon agree.

## v3.0.9 - 22nd Aug 2026

- Hovering a GM overrides badge on a body card now also names the reason you gave it, and says plainly when you gave none - which is the same as saying your players see nothing.

## v3.0.8 - 22nd Aug 2026

- **The "show the working" panel now shows the overriding too.** Open the Newton panel on a world you have pinned anything on and the first thing you see is what you pinned, what you pinned it to, and the reason you gave. Each figure is marked again inside every layer it actually feeds, with a line saying that the engine read your number instead of working one out, and repeating the warning if it is outside what the physics allows.
- The physics page's section on overrides has been rewritten. It used to say an override changes the tag and not the physics behind it - true when only tags could be overridden, and no longer true at all. It now covers both kinds and lists what can be pinned.
- The Getting Started guide gains "Breaking the physics on purpose", and the Tags Guide explains the Anomaly category and why it does not work like the others.

## v3.0.7 - 22nd Aug 2026

- **NEW: pin a world's density, and choose what gives way.** Mass, radius and density are one relation with two free numbers, so pinning the density pins the second of them and you say which: hold the radius and the mass follows, so a hollow world looks exactly the same size and weighs a fraction of what it should; or hold the mass and it swells instead. The composition is left alone on purpose - a rocky world that weighs a tenth of what rock weighs stays a contradiction rather than being quietly turned into a gas ball, and that is what the Anomaly tag is there to explain.
- Gravity, escape velocity and every barycentre follow the new mass honestly. Nothing is pinned to make them agree.
- The warning for a density is drawn from that world's OWN composition - how much void a solid of that size could hold, or how far a giant's envelope could puff - rather than a one-size range.

## v3.0.6 - 22nd Aug 2026

- **NEW: pin a world's surface temperature outright.** The magic slider. Put a moon out past the ice line at 1100 K and everything downstream believes it - the ice goes, the clouds change, the classification and the habitability follow, and the day and night sides keep their swing about the figure you typed rather than the world going flat. Pin it low and it is a cold spot instead; the engine does not ask why.
- **NEW: negative albedo.** It was there in the field all along and was quietly ignored; now it works. Below zero the surface returns more energy than its star sends it, which is absurd, allowed and clearly labelled. Above one it reflects everything and reads absolute zero rather than a broken number.
- **NEW: pin the atmospheric pressure.** Erosion no longer eats it, so a small world can hold an air column it could never have kept.
- A magnetosphere pinned beyond what the world's interior could ever generate is now called what it is - anomalous - instead of being reported as an ordinary dynamo. The 70 tesla terrestrial works, and it says so.
- Each of those rows tells you the range the slider covers and lets you type past either end, and says in plain words what is wrong with the figure once you do.

## v3.0.5 - 22nd Aug 2026

- **NEW: say WHY a world breaks the physics.** A new tag category, Anomaly, holds the excuses: Unknown Origin, Alien Technology, Alien Biosphere, Subsurface Structure, Unobtanium, Magic, Precursor Engineering, Exotic Matter, Divine Will, Nanite Ecology, Reality Fault, Experimental Terraforming - and any you invent, added right there on the row. Each override you pin can be given one as its reason, and several overrides can share one.
- The tag your players see says what is actually odd. Not a bare "Alien Technology" but "Alien Technology: Magnetosphere, Surface temperature" - so a reading that looks wrong points at the thing that is wrong with it. A reason can be kept secret on its own, or the whole category hidden from players; an override with no reason given shows players nothing at all.
- Reset an override and its reason goes with it. The tag itself stays in the category for next time.
- Undo now names which override it is about to take back rather than saying "overrides".

## v3.0.4 - 22nd Aug 2026

- **NEW: an Overrides tab on every body and star.** Everything you can pin by hand now sits in one place, after Tags: the albedo, the radiogenic heat, a gas giant's puffiness, a planet's magnetosphere, and - for the first time with a control at all - a star's magnetic activity. Each row shows what you pinned, what the physics would have said, a slider for the ordinary range, a box for figures well outside it, and Reset to calculated. Nothing is refused: a value the physics cannot account for is kept, saved and labelled with a plain sentence saying what is wrong with it. The magnetosphere is now a reading on the Atmo/Mag tab and inflation a reading on Composition; both are pinned on the new tab.
- The body card's GM overrides line no longer misses any. It listed four by hand and two pinnable values were not among them, so a world could be overridden and the card would say it was not. Hovering a badge now says what was pinned, to what, and what the engine's own answer was.

## v3.0.3 - 22nd Aug 2026

- Docs only. The break-physics design is captured: G37 (the Overrides tab, new pins including a direct temperature slider and negative albedo, and the Anomaly tag category for the excuses) with a full handoff brief at docs/dev/g37-gm-overrides-anomaly-handoff.md.

## v3.0.2 - 22nd Aug 2026

- The Hide labels quick override now reaches the starmap level of a player view (3D and 2D), not just the system view. The starmap scene had honoured it since it was built; nothing had ever passed it in. The document starmap is deliberately untouched - there the names are the content.

## v3.0.1 - 22nd Aug 2026

- Board only. The release is recorded and the RC versioning convention is closed: patch bumps are back.

## v3.0.0 - 22nd Aug 2026

- V3 RELEASE. Production moves from v2.1.5 to V3: player views and presets, the 3D holo system view, undo/redo, the units and skins overhaul, starmap stars as stars, the physics and classification passes, VTT integration, and the full documentation rewrite. The welcome screen sheds its beta voice: this project is community driven, some features ship a little raw on purpose, and reports decide what gets attention first. The rc.1-rc.23 entries below are the release candidate record.

## v3.0.0-rc.23 - 21st Aug 2026

- Board only. The owner signed off the entire eyeball list in one pass (C18 plume, A55 boosted sky, C14 falloff, C15 true-scale lo-poly, C16 Terminal Clear, A51(b) binary entry, A62 cover-page resize) - every row marked closed. All V3 release gates are now met; release waits on the owner's word.

## v3.0.0-rc.22 - 21st Aug 2026

- **NEW: you can see who is watching, and what it is costing.** A small counter appears on the Player Views icon the moment somebody joins - green for windows on this machine, orange for ones connecting from elsewhere, and nothing at all when nobody is there. Hovering gives a line per window. Settings > System lists them with the data each has moved, and copies the whole thing as text you can paste to someone. On the player's own screen, clicking the LIVE lamp shows the same figures for their connection and clicking again copies them. It is honest about one thing that matters: a player window on the same machine transfers nothing at all - the data is handed straight over - so it reports messages and says plainly that there are no bytes to blame.

## v3.0.0-rc.21 - 21st Aug 2026

- The holding screen a joining player sees is now the interstitial itself, with the GM's own words on it. While a large map is on its way it reads "Incoming Transmission…" - the wording is rule-pack data, so a GM can put it in character - with a spinner and a plain line underneath saying what is coming ("27 systems, ~5.0 MB"). It only appears when there is genuinely something to wait for: if the map arrives quickly, or from cache, there is no holding screen and no second transition at all, exactly as before. Measured on a local join, the map lands one millisecond after the announcement, which is why nothing showed - there was nothing to wait for.

## v3.0.0-rc.20 - 21st Aug 2026

- Board only. The A63 row is marked fixed for its cheap half (the shipped build is rc.18 — the commit subjects ran one behind the changelog, and the row and debt line said rc.17; both corrected), a dangling spec fragment that split the table cell is removed, and the row stays open for the V3.1 chunked-progress half.

## v3.0.0-rc.19 - 21st Aug 2026

- Tests only, no behaviour change. Two flaky or stale assertions fixed: one of mine from the new-planet placement work that counted a majority over too few samples, and one on the model turntable that still named a structure a later fix had deliberately moved.

## v3.0.0-rc.18 - 21st Aug 2026

- A player joining a game with a big map is no longer left staring at a frozen screen wondering whether to reload. The GM's window now says what is coming a moment before it sends it, so the player sees "Receiving the starmap - 27 systems, ~5.0 MB..." while it crosses. It is a holding message rather than a progress bar, and deliberately so: the map arrives as one piece and unpacking it stops everything for a moment, so a bar would only freeze too. A real progress bar needs the map sent in pieces, which is a later job.

## v3.0.0-rc.17 - 21st Aug 2026

- The README now says how this project is run and points at the process pack - the coordination playbook is shared, not secret.

## v3.0.0-rc.16 - 21st Aug 2026

- Docs only. The A63 cheap-half assignment is marked on its inbox row (the rc.14 line described this routing; the row edit lands here).

## v3.0.0-rc.15 - 21st Aug 2026

- Docs only. The session-discipline playbook is extracted into docs/process-templates/ - the playbook, the board template with the standing rules, and the session-start prompts - portable to every parallel project, so the core grows by interface rather than by accretion.

## v3.0.0-rc.14 - 21st Aug 2026

- Docs only. Coordinator 5 takes the board; the receiving-notice fix (A63 cheap half) is routed to the closeout session.

## v3.0.0-rc.13 - 21st Aug 2026

- Docs only. The receiving-notice fix is approved and fully specified on its row (three wiring points located), with the owner's transition-themed progress design recorded for 3.1; the coordinator hands over at the owner's context call.

## v3.0.0-rc.12 - 21st Aug 2026

- What's new, trimmed on the owner's read: the surface-view line was a duplicate, the importer and starmap-stars lines go, undo is back to one word, and the GM-view line now leads with the new star types. The remote-play freeze on big maps is captured with its two-part fix (a receiving notice now, true chunked progress later).

## v3.0.0-rc.11 - 21st Aug 2026

- Docs only. The observations inbox's Documentation-debt section is swept to ZERO for the first time since it was created, with a record of where every owed line landed and what was struck rather than written. Twenty of those lines had been appended under the wrong heading, which is why the list read shorter than it was. E6 is closed, five findings are captured (including a literal &rsquo; printed on the welcome screen), and the handover carries the four claims this pass put in front of a reader without being able to exercise them.

## v3.0.0-rc.10 - 21st Aug 2026

- The tail of the documentation debt, which was mostly items owed to a surface nobody had picked up. GettingStarted gains: the three things a star DRAWS rather than badges and how to remove one; that picking a spectral type draws from that class's range rather than its middle; a subsection on the rule-pack editors that no user document has ever covered, including what an absorption band is and the one thing the split Gas Physics card exists to say (nothing under Presentation feeds the physics); the player-view preset controls that were owed a line, star boost included, with the honest note that a high boost stops reading as apparent magnitude; the model dialogue and click-to-place drives; and what a save actually contains. The physics page's habitability section now says WHICH temperature it scores - the mean surface one, which differs from the radiating figure by 130 K on Mercury - and admits that the water band is a comfort plateau rather than water's liquid range. Its cloud section gains the frost-not-cloud rule that is why Pluto has no methane deck.

## v3.0.0-rc.9 - 21st Aug 2026

- The physics page gains the section its own map has needed all along: Stellar zones. Every zone is derived from the star's LUMINOSITY asked at a distance from that star, there are TWO frost lines rather than one (formation at ~170 K and current at ~125 K, which is what the two labels on the system map mean), the habitable zone's outer half assumes a thick CO2 greenhouse - Mars is inside the Sun's band and frozen - and the kill zone is the mean of surface ultraviolet and coronal output, which is why an active M dwarf is dangerous and a quiet one of the same size is not. Also: the pipeline list now includes radiation as its own pass, surface light and the biosphere; the ionising-output section gains all four flare mechanisms, where before it taught the convective dynamo alone and a fed black hole out-flares any star; the photon/particle table gains its brown-dwarf row; and the generation dials' realism bands are explained.

## v3.0.0-rc.8 - 21st Aug 2026

- The two tag documents verified against the engine and four gaps filled. docs/tags-guide.md gains the rule condition for solid ground and the marker size, pin-text and flag-staff options. docs/classification-and-tags.md gains: who reads a fingerprint's formation, range and note keys (none of them the classifier); the fact that classifier.rules[] and minScore are dead and the format is fingerprints only; a section on the stellar zones, which no reader-facing surface described - all of them derived from luminosity, TWO frost lines rather than one, and a kill zone that is the mean of surface ultraviolet and coronal output; and a section on what an imported catalogue number is worth, since three quarters of the quoted densities are the mass in disguise.

## v3.0.0-rc.7 - 21st Aug 2026

- README brought to V3: 'What's new in V2' replaced with what V3 is, the tagging section no longer teaches the retired Points of Interest and Constructs of Interest, the Accrete.js credit says where that generator went, and a new Integration section documents the /bridge discovery frame and embed mode for host apps - including the exact-origin allowlist and the third-party-iframe partitioning that will bite anyone building against it. The data note now names all three things that do leave the machine (SIMBAD star-name lookup, the Traveller subsector fetch, and one anonymous visit event per browser per day) rather than claiming nothing is sent anywhere.

## v3.0.0-rc.6 - 21st Aug 2026

- GettingStarted.md rewritten top to bottom against this build, with eleven screenshots taken from the running app. It now walks the app as it is: the start screen, the real-sky import (every star in the region, not only planet hosts - and filling out is a separate choice), your own map behind the stars, the four interface skins, the system view's zones and display options, the five ways to look at a world, clickable units, the generation wizard's realism bands, undo and redo, player views and the relay, and what to do when something goes wrong. Four things it used to say were wrong: Toytown compresses spacing rather than body size, the autopilot section still routed on the retired PoI/CoI tags, saves were described as JSON only, and 'nothing leaves your machine' did not account for the anonymous daily visit count, the SIMBAD star-name lookup or the Traveller import - all three now stated plainly.

## v3.0.0-rc.5 - 21st Aug 2026

- Housekeeping: the changelog's own order is fixed. Six release blocks sat above a higher version number - one of them since early August - which is how a scripted insert once anchored on a version heading, matched nothing, reported success and shipped a release with no note. Nothing else changed; the entries are the same words in the right places.

## v3.0.0-rc.4 - 21st Aug 2026

- FIXED: a placed drive's plume ignored the model's facing fix and fired along the model's original axis - straight up, on a hull authored nose-up - in both the editor preview and on the map. The exhaust now always fires astern of the ORIENTED hull, the nozzle markers sit on the rotated hull, and the nose-detection reads the oriented geometry too, so the facing code no longer fights the alignment on rotated models.

## v3.0.0-rc.3 - 21st Aug 2026

- Docs only. A placed drive's plume ignoring the model's rotation is diagnosed to its root (the stored nozzle points never pass through the orientation transform) and handed over with the fix shape - including the second bug possibly hiding behind it in the nose-detection.

## v3.0.0-rc.2 - 21st Aug 2026

- What's new, tightened: the GM-view line is one sentence, and two features the list had missed are claimed - the unified importers (Traveller, Universe Sandbox, SpaceEngine on one generator with the fill-out dials) and the starmap's stars drawn as stars.

## v3.0.0-rc.1 - 21st Aug 2026

**Release candidate 1 for V3.** The 2.1.x beta line ends here; RC pushes bump the rc number. This build carries everything the welcome list claims, with the GM interface overhaul landing last: skinnable panels (classic or compact), clickable units on every figure remembered per body type and inherited by player windows, a what's-new line saying so, and the settings panels given breathing room against a slimmer scrollbar.

## v2.1.906-beta - 21st Aug 2026

- Appearance moves to the top of Settings > System, where it belongs: the skin picker, the skin editor and the colour palette page now sit together as the first thing in the section, rather than being buried in the Starmap tab. The palette link explains what it adds over a skin - single colours, including the ones that carry meaning.

## v2.1.905-beta - 21st Aug 2026

- Two more skins and a skin editor. Clarity is colour-blind friendly - everything the interface distinguishes by colour moves onto axes that survive the common colour vision deficiencies, with contrast turned up. Nebula is the colourful one: an indigo rail, deep-blue panels and an orchid accent, made possible by the left rail and the right detail panel gaining their own colours. And under Settings > Appearance, 'make your own' opens a skin editor: pick a base, name it, and repaint twelve chrome colours with the app itself as the live preview - your skins live on your device and sit in the same picker.

## v2.1.904-beta - 21st Aug 2026

- The Settings units pickers retire - G34 lands complete. Units live on the fields themselves now, so the two map-wide dropdowns are replaced by a note saying so; old saves and old player links keep working through the same migration. The GM guide explains the new behaviour. Verified across two live windows: a GM click on a planet's temperature reached the open player guide on the next snapshot.

## v2.1.903-beta - 21st Aug 2026

- Interface skins. The app now opens in a new Modern look - compact type, light-blue highlights, panel greys a step lighter so the starmap's black reads as the deepest thing on screen - and the original warm-orange look lives on as Classic, selectable per device under Settings > Appearance (it never saves into the campaign; every viewer picks their own). Colour that means something - body types, zone bands, hazard ramps - does not move with a skin. The technical panel's cards now carry family-coloured edges so related readings gather visually: what it is, where it goes, what it is like, what it breathes, who lives there, what hurts, and how to get about.

## v2.1.902-beta - 21st Aug 2026

- Units are clickable on the edit side too. A star's temperature and mass, belt and ring dimensions, a construct's orbit altitude and aerobrake entry speed are typed in whatever unit the field shows and stored in SI exactly once, on commit - type 100 into a temperature field showing Fahrenheit and 310.9 kelvin is what lands. The composition tab's own mass cycler now drives the same campaign-wide choice as every other panel (and gains a solar-masses stop); its sliders and undo behave exactly as before.

## v2.1.901-beta - 21st Aug 2026

- Units are now clickable across the read side of the app. The unit on a value - a temperature, a mass, a radius, an orbit, a delta-V - is a button: click it and every field of that kind on that body type follows, everywhere, and the choice saves with the campaign. Stars default to kelvin, worlds to Celsius, star masses to solar masses, world masses to Earth masses, and Jupiter reads exactly 1.000 M-Jup at that stop. Player views and the printed report inherit the GM's choices (players cannot change them); an open player window picks up a change on the next snapshot. The corner brand reads SSE3.

## v2.1.900-beta - 21st Aug 2026

- Docs only. The V3 mop-up session closes: ten items shipped, five of which turned out to have the wrong cause recorded, and the board now says which was which. One item (the stretched player window) is shipped but unverified and stays open with the check it needs written down.

## v2.1.899-beta - 21st Aug 2026

- Resizing a player window while the cover page is showing should no longer leave the starmap stretched when it appears. The view underneath is re-measured the moment the cover is tapped away, and a renderer can no longer be handed a zero-sized measurement and stretch a tiny image over the whole screen. Reported as intermittent, so this needs a look in real use before it is called closed.

## v2.1.898-beta - 21st Aug 2026

- The experimental "evolutionary" system generator has left the app. It has a home of its own now, at System Lab (system-lab.starsystemx.com), where it can grow without being an alpha corner of something else - so the engine selector, its warning dialogue and 4.3 MB of vendored code are gone from here. Starmaps saved while it existed still open exactly as before. The thanks to Mitch Anderson for the Accrete.js code it was built on stays where it is, pointing at where that work now lives.

## v2.1.897-beta - 21st Aug 2026

- A planet you add now appears somewhere you would actually put one. It used to land anywhere between the star's surface and the edge of the system - almost always far out - and because a world's atmosphere is chosen for the orbit it is BORN at, dragging it back into the habitable zone left it airless and frozen there. That is why a new planet seemed too cold until well inside the goldilocks band. New worlds now appear in the inner system, outside the tearing-apart and sterilising limits, and mostly with air. Adding a planet to a system that has none also works again - it used to fail outright.

## v2.1.896-beta - 21st Aug 2026

- The kill and danger zones now come from the star itself. They were the last zones still multiplied out of a stored brightness dial that has drifted badly, and the spectral-type correction beside it had never once fired - a star's zone depended on how its class happened to be spelled. They now derive from the star's own light and heat, in two parts: the ultraviolet its surface pours out, which is what makes hot stars lethal, and the flare radiation from its corona, which is what makes cool but active dwarfs lethal. Hot stars gain much wider danger zones, quiet cool dwarfs narrower ones, and the Sun barely moves.

## v2.1.895-beta - 21st Aug 2026

- The system-generation dials now show you which side of the physics you are on. A green, amber and red strip under each slider marks where real systems sit, where few of them do, and where none measured do - and the wording is careful about the difference: red says "no measured system looks like this - still allowed, still physical", because nothing is ever ruled out at any setting. The edges live in the rule pack, so a GM running a deliberately fantastical setting can move the goalposts rather than fight them.

## v2.1.894-beta - 21st Aug 2026

- G34 phase 1, not yet visible on any panel: the unit ladders (temperature K/C/F, mass t/M-Earth/M-Jup/M-Sol, distance km/mi/AU/ly/pc), per-quantity-by-body-type prefs stored on the starmap with a one-time migration from the two legacy unit settings, the UnitValue and UnitInput components whose unit label click-cycles, and specs for every ladder round-trip. The panel sweep that makes it visible is phase 2.

## v2.1.893-beta - 21st Aug 2026

- The sliders that shape a filled-out system now appear wherever filling out happens. They were offered on file imports only; a starmap built from the real-sky catalogue, and a Traveller world typed in by hand, both quietly used the defaults. Both now show the same panel. The catalogue one has no age slider on purpose - a region brings back stars of every age, so each keeps its own - and the Traveller one appears once you ask for more worlds than the Main World, with an age range that follows the star you type.

## v2.1.892-beta - 21st Aug 2026

- A Traveller system with more than one star now has a real hierarchy. The stars used to be laid out by the importer's own code: companions flung out to a thousand AU and beyond, on crossing, half-eccentric orbits tilted almost at right angles to the planets, taking thirty thousand years to go round - which is why they looked like they were just hanging there. They now go through the same planner the generator uses, nested and in the plane, and the whole structure is pushed out far enough that the Main World still has room around its own star.

## v2.1.891-beta - 21st Aug 2026

- Docs only. Units-everywhere plus interface skins is promoted into V3 and its brief is written: click a unit to cycle it, remembered per body type, players inherit; skins ride the same sweep as shared components and tokens.

## v2.1.890-beta - 21st Aug 2026

- One classifier, not two. A second, older classification engine sat behind the live one, reachable only by a rule pack that shipped no fingerprints - and it still held the version of the rules from before two corrections landed, so it would have put eyeball worlds on gas giants and called any small hot world a stripped giant's core. Measured against the live engine on 167 bundled worlds it was worse on every one of them. It is gone; a pack with no fingerprints now gets one honest class from the body's mass, and its author is told why.

## v2.1.889-beta - 21st Aug 2026

- Docs only. Two owner decisions: the interface de-chunk becomes selectable SKINS on shared components (the drift cure and the density question become one job), and accrete leaves the program for its own project - the experimental engine selector and everything under it is to be removed, reversing the old preservation order.

## v2.1.888-beta - 21st Aug 2026

- A belt no longer claims an ascent cost. Every belt and ring in the app was publishing "Ascent Dv: -0.0 km/s" - a not-applicable marker being read as a number - and every gas AND ice giant was publishing a real-looking figure for a world with no surface to leave. All four places that ask now ask the same question, and where the answer is no the row says so and why, instead of showing a figure or quietly disappearing. Tiny moons gain a readable one: Phobos costs 9 m/s to leave, where the row used to round it to "0.0 km/s".

## v2.1.887-beta - 21st Aug 2026

- Docs only. Click-to-cycle units everywhere, remembered per body type, assessed and captured: half the machinery already exists, the edit fields are the risky half, and the de-chunking rides the same sweep.

## 2.1.886-beta - 21st Aug 2026

- FIXED: the engine decided what TYPE a world is from the temperature it RADIATES at rather than the temperature on its ground. On anything with air the two are the same number, but an airless world that bakes by day and freezes by night radiates like a warm one while averaging far colder - the Moon radiates at 270 K and averages 214, Mercury 440 and 310 - so seventeen type tests, every one of them asking a question about the surface, were reading the wrong figure. Nothing in the solar system changes type as a result; what it fixes is a world sitting near the edge of a band, where it could be called an ocean world on a temperature its ground never reaches.

## v2.1.885-beta - 21st Aug 2026

- A wet world no longer freezes because a branch closed. The vapour a sea puts into its own air is now DERIVED from the saturation pressure at its surface temperature and how much of the surface is sea, sharing one curve with the cloud decks, instead of switching on at exactly 273 K - a step that cost a world a hair below freezing its entire vapour greenhouse, which is what kept it below freezing. The reported Traveller "Earth-like" world reads +26.7 C where it read a snowball. Not water-specific: a methane sea warms its world with methane. Sol does not move by a kelvin.
## v2.1.884-beta - 20th Aug 2026

- **New: Atmospheres & clouds can be switched off**, for players on low-end devices. It drops the cloud deck(s), the atmospheric limb glow and high haze from every body on the 3D system view and the 2D one (which is the same renderer locked overhead). What it buys is fill rate rather than memory: each shell is alpha-blended over the body it wraps, so a cloudy world repaints the same pixels several times. Auroras keep their own switch.
- **The System step gains "Performance tweaks (for lower end devices)"**, gathering the new switch with black-hole lensing and belt detail. Those two were filed under Look & Feel and Scaling — by what they look like rather than what they are for — so a GM whose players are on weak hardware had to already know which cosmetic control happened to be expensive.

## v2.1.883-beta - 18th Aug 2026

- The balloon's descent through a cloud deck is now a fade, not a jump cut. A deck's full optical depth used to land the instant the slider crossed its base — the light went from clear to gone in one step, which read as jarring. The share of the deck above you now ramps across its slab, and the grey-room immersion fades in with it. The base itself stays sharp on the way OUT, deliberately: a cloud top is diffuse but a cloud base is sudden, which is why aircraft drop out of one all at once.

## v2.1.881-beta - 21st Aug 2026

- Docs only. The moon rebuild is unblocked (build on the design note's defaults and let play decide); the kill/danger zones will derive from the star's computed output; the too-cold-in-the-goldilocks-zone observation is captured with the measurement that decides whether it is a fault or honest physics; and the player-window stretch is pinned to resizing on the cover page.

## v2.1.880-beta - 21st Aug 2026

- The info panel's picture is now yours to shape: grab the strip under it to drag it taller, shorter or minimised - the choice is remembered on this device - and a hover icon on the picture flips between the centred slice and the whole image letterboxed smaller. Player windows keep their own choice.

## 2.1.879-beta - 21st Aug 2026

- Docs only. The surface-temperature session retires and leaves its notes: the traps in the day/night model, the ice-ageing and tidal-lock work, and how to read the derived-physics fixture as a review tool. It ends with what is still open, each in a form you can check in thirty seconds - including the one decision left for the owner, which is that the classifier is still reading the temperature a world RADIATES at where seventeen of its type tests want the temperature on its ground.

## v2.1.878-beta - 20th Aug 2026

- Imports now stamp the rule pack that processed them, so a freshly saved import carries its pack id instead of a blank one - the load-side tolerance stays as the backstop. The same fix, with the load gates, went to production as v2.1.5.

## v2.1.877-beta - 18th Aug 2026

- The biosphere/surface-light session (F68) retired. Its territory notes — the traps not visible from the code, the apparent-colour retirement's final state, and a Known-open checklist — are in docs/dev/biosphere-and-light-notes.md. The cloud-layering workstream B83 is the successor.

## v2.1.875-beta - 20th Aug 2026

- FIXED: the starmap file picker has refused every file - plain JSON and bundles alike - since the save-bundle rework a fortnight ago, always claiming a JSON format error. The reader was still delivering text to a handler that now expects bytes, so every file arrived empty. It reads bytes now, and the error message reports what actually failed instead of blaming the file.

## v2.1.874-beta - 20th Aug 2026

- **FIXED: the two 3D maps drew names in different colours.** The starmap took the preset's accent; the system map passed null and kept a fixed pale blue, so a themed campaign was themed on one stage and not the other. One rule now, on the style, resolved exactly as the starmap resolves it. The system map's old reasoning — keep labels neutral and let a CRT filter colour them — still holds in isolation and lost on consistency; a filter tints whatever it is given.
- **The document view puts the body graphic BESIDE the facts on a page with room**, and above them on one without, as before. The test takes width AND height: a phone held sideways is wider than plenty of desktop windows and is the clearest case for stacking, so width alone would have split exactly the screen that must not be. Both layouts reserve the same rect id, so the live renderer is overlaid identically and nothing downstream needs to know which it got.

## v2.1.872-beta - 19th Aug 2026

- FIXED: a real-sky import could bring the same wide companion in twice - once from SIMBAD as a star with class-typical figures, once from the exoplanet archive as a planet with a measured mass - leaving two vast crossing orbits round one body (BD+13 2618 / Ross 458 was the report). The two filings are now cross-identified by projected separation and merged into one node that keeps the measured mass and says what the other catalogue called it; and when the archive knows the system has more stars than the star catalogue resolved, the primary says so instead of importing silently thin.

## v2.1.871-beta - 19th Aug 2026

- Fixed: the band-preview chart in Edit Atmospheres & Mixes printed its y-axis units as raw code ("W&#183;m&#8315;...") down the side of the plot instead of W·m⁻²·nm⁻¹.

## v2.1.870-beta - 19th Aug 2026

- FIXED: a construct's panel showed TWO pictures and led with the wrong one - the planet picture block put a bare fallback sphere above the ship, and the ship's real picture (model, else uploaded image, else the icon) sat further down among the specs. The construct's own picture now leads, once.
- 3D model uploads: the 2 MB cap becomes tiers. Under 5 MB is silent; 5-15 MB warns about network delay and a parse stutter; 15-25 MB needs an explicit tick - it can crash lower-end devices and mobile browsers; over 25 MB is rejected. Models are local most of the time and travel at most once, so the binding constraint is browser memory, not the wire.

## v2.1.869-beta - 19th Aug 2026

- Jets, third pass from the owner's eye: on both maps the beam now launches narrow at the star, widens as it goes and fades out along the way — cyan-white core in a cyan sheath — at three-quarters the previous length with a quick fade (the 3D beam is gone by 85% of its sprite; the GM map's cones carry the same fade as a gradient). The GM map's brief diamond version (widest at the star, points at the tips) never shipped.

## v2.1.868-beta - 19th Aug 2026

- **A placed graphic can be inverted.** Logos ship white-on-transparent as often as the reverse, and a player view's backdrop can be either — so half the library was invisible on any given stage. A CSS filter, so it composites with whatever look filter the surface already carries.
- Opacity moves in 1% steps instead of 5%, and every slider's value readout is anchored RIGHT, over the far end of its slider, with fixed-width digits so a number updating through a drag does not shimmer as it counts.
- The Corporate Logos credit points at World Zero's page rather than the pack.

## v2.1.867-beta - 19th Aug 2026

- Five more starter logos — Interspan, Kelido, Nexum, Terra and TSEC — from World Zero's [Corporate Portfolio](https://worldzero.itch.io/corporate-portfolio), used under CC BY 4.0 and credited in the About box alongside every other bundled image. They join the starter asset list, so they can be placed on a player view without uploading anything.

## v2.1.866-beta - 19th Aug 2026

* VTT integration session retired - notes for the next person in `docs/dev/vtt-integration-notes.md` (the transport mirrors every send, BroadcastChannel is partitioned cross-site, the broker holds dropped ids and `initPeerHost` was re-entrant, the id is campaign data, the catalogue is the only viewer, filters: SSE wins, network code is one system across both apps, PWA/firewall facts that masquerade as bugs, the harness traps, how to test Owlbear/Foundry, and what is known open). E12 (flaky contract spec) recorded as fixed at the root; E13 (firewall bypass) now carries the exact rule.

## v2.1.865-beta - 19th Aug 2026

- Removed the "Tap a world to read its file" prompt that showed on the player system view before the first selection. It was an absolutely-positioned overlay at the foot of the stage, so it held no layout open — and it landed on top of the grid's new scale caption, which shares that corner and says something a reader cannot work out unaided.

## v2.1.864-beta - 19th Aug 2026

- The grid legend adds the real distance in brackets once a cell is too small to picture in AU — "1 square = 0.01 AU (1,495,979 km)" — in km or miles per **Measurement units (in-system)**. It switches at `ORBIT_KM_BELOW_AU`, the 0.05 AU that `units.ts`, `bodyFacts` and `curate` had already agreed on, rather than adding a fifth threshold; that comfortably covers the 0.01 AU case. The AU figure stays, because the cell was chosen off a picker labelled in AU and dropping it would break the link to the control that set it.

## v2.1.863-beta - 19th Aug 2026

- **Scrubbing time while it is playing now seeks instead of stopping the clock (A60).** Jogging the shuttle used to pause playback outright - and it wrote that pause into the campaign, so it outlived the drag and even the tab. Now the transport keeps playing, the jog takes the clock wherever you push it, and letting go carries straight on from the new time. A paused transport still stays paused: the jog is not a play button.

## v2.1.862-beta - 19th Aug 2026

- Docs only. The infill dials gap confirmed as two paths (SpaceEngine and Universe Sandbox already route through the modal that has them); a fix sketched for the real-sky importer bringing one wide companion in twice.

## v2.1.861-beta - 19th Aug 2026

- **FIXED: the two stages shared one grid TYPE, so choosing hexes for the starmap changed the system map too, and back again.** `starmapGrid` is now its own field beside `grid`, falling back to it so a preset written before the split opens exactly as it did. Every other twin was already split (gridDepth/starmapGridDepth, gridFalloff/starmapGridFalloff) — the type was the last one sharing.
- **The player system view states its scale**: a caption reading "1 square = 1 AU" whenever a lattice is drawn, live from whatever cell the grid is actually using — the pinned dial, or whichever decade level is currently winning. A hex says "corner to corner", because that is what its cell measures and a hex is only 87% of it across the flats, which is how a Traveller player would read it.
- Engine map: **M4 reopened and closed properly.** It was closed at v2.1.854 by making the two option sets identical, which fixed the lossy half and left the sharing — the entry's own prescription (two fields) had been argued away, and it was right. A shared field and an incompatible vocabulary are two faults that look like one, and fixing the vocabulary made the sharing more visible, not less.

## v2.1.859-beta - 19th Aug 2026

- 3D starmap: stars further from the camera draw a little smaller (a gentle falloff referenced to what the camera is looking at, clamped 0.65..1.25x), so zooming in reads as approaching; never on the flat 2D map. "Star size by class" runs to 200% (geometric past 100%, so a remnant shrinks rather than vanishing) and still defaults to all equal.

## v2.1.858-beta - 19th Aug 2026

- Docs only. Two import findings captured: the infill dials are offered on only one of three import paths (the Traveller code's own comment expects a panel that is not there), and a real-sky import can bring one wide companion in twice, as a star and as a planet, from two catalogues.

## v2.1.857-beta - 19th Aug 2026

- Starmap stars, the owner's first look (G26 follow-up). Jets are drawn as a bright spine in a soft blue sheath, longer, on the 3D starmap and the GM map; a hole authored as feeding always jets, however small its stored Eddington fraction. The black-hole glyph is sized on its horizon and photon ring, so a hole no longer reads smaller than a star. A second dial, "Star size" (GM map: Settings > Starmap; player maps: per preset), scales every glyph from half to double — the centre is the size the map shipped with. "Star size by class" now also tilts within the dwarf band by spectral letter (O biggest, M smallest), so the dial visibly moves on an ordinary all-class-V map; the four luminosity-class bands still set the big steps and holes stay fixed. The 3D starmap camera may go under the map plane, as the system view's can.
- The system view's auto-scaling grid (A55, second pass) is a LOCAL patch about what the camera is looking at, its decade chosen from the local zoom (5-50 cells across the view), and the finer decade fades in only over the last 40% of each zoom decade — it used to be laid out around the star with full-width lines and brought the next decade in almost at once, which collapsed into two dense bands when zoomed in off-centre. The shared lattice generator gained a patch centre; every starmap passes none and is unchanged.

## v2.1.856-beta - 19th Aug 2026

- Docs only. Roster legend (model + context in the session name) recorded; the starmap-stars, broadcast-storm, follow-GM and save-fidelity landings marked; four sessions recommended for retirement with notes.

## v2.1.855-beta - 19th Aug 2026

- The AU cell reaches the other two surfaces that draw a system lattice. The GM's system view gains a **Cell** picker beside its Overlay one, and the 2D renderer honours a pinned cell instead of always sizing by zoom — a GM and their players looking at the same system should not disagree about what one cell is.
- FIXED in passing: the 2D system view's hex branch tested two of the three hex kinds, so subsector-hex would have fallen through to the polar rings. Harmless until this release, because the fold meant no hex ever reached it.
- Engine map: **M4 closed.** One preset field bound by two pickers with different option sets, lossy in the editor rather than the renderer. Fixed by making the sets the same — the narrowing existed because nothing drew hexes at system scale, not because a hex could not be drawn.

## v2.1.854-beta - 19th Aug 2026

- **Hexes work at system scale, and there is now one lattice in the codebase.** The system view used to strip the hex family and fold it to squares, on the grounds that a hex is a jump and a jump is interstellar — true of what a hex MEANS on a starmap, and beside the point for a GM who wants hexagonal cells over an orrery. Square and every hex variant now come from `latticeFor`, the same generator the starmap and the GM's snap grid use. Traveller CCRR numbering stays starmap-only: sector addressing is meaningless inside one system, which is a statement about the labels, not the shape.
- **Grid scale is measured in AU and applies to hexes too** — 0.25, 0.5, 1, 2, 5 or 10 AU cells, or Automatic. The lattice is generated in AU and every vertex is then put through the SAME radial compression the bodies get, so a cell spans its stated AU against the orrery drawn inside it rather than merely near it. Cells therefore compress outward whenever compression is on — that is the map being honest; at compression 0 (linear distances) the lattice is perfectly regular.

## v2.1.853-beta - 18th Aug 2026

* A world's type picture is derived from its type, so saved files no longer carry a copy of it - another 7 KB off the bundled examples. A picture you have UPLOADED yourself is untouched, as it always was: the engine has never overwritten a custom image, and it still does not.

## v2.1.852-beta - 19th Aug 2026

- Starmap stars as stars (G26(a) + C17). On the 3D starmap, the player 2D starmap and the GM 2D map a star glyph is a SCREEN size and a grouped system's members sit at SCREEN offsets, so Alpha Centauri is the same compact cluster at every zoom and no star is light-years of fuzz up close. The glyph is a sharp photosphere disc inside the system view's own corona and flares, built by ONE shared builder (`bodyFeatures.buildStarLook`) the holo scene now uses too. Four luminosity-class size bands (remnant/sub-dwarf, V, III/II, I, from the MK class) behind a "Star size by class" scaler — 0 = all equal as before, 1 = fully separated; on the GM map under Settings (local), on the player starmaps per preset. New physics tags `stellar/jets` (a relativistic well + an ordered field + infall or a magnetosphere: a fed black hole, a neutron star, a magnetar) and `stellar/shedding` (Reimers L*R/M: giants wind, supergiants shell) drawn by both maps as jets and a shed shell; the flare band (`stellar/activity`) drawn as limb flares. Remove the tag and the mark goes. Black holes keep their schematic glyph.

## v2.1.851-beta - 18th Aug 2026

* **Saved files stopped carrying physics that is thrown away the moment you load them.** Sixteen derived fields had crept back in over the last few months, so every save and every bundled example shipped figures nobody re-reads - and anyone opening one of those files to check something read a number from an older build and believed it. Files are a third to a half smaller: the bundled Sol Expanse went 84 KB to 49 KB, Alpha Centauri 68 to 33.
* Nothing you see changes. Every world classifies exactly as before, and the physics is identical to the digit - what changed is what gets WRITTEN down.
* **Undo now names what you did more precisely**, because it works out the step by looking at what actually changed and there is far less noise to look through.

## v2.1.850-beta - 19th Aug 2026

- A playing clock no longer re-broadcasts your whole campaign. Leaving time running rebuilt and
  re-sent the entire redacted campaign several times a second - 989 MB across 517 sends in one
  measured session, 33 seconds of it spent just turning the map into text, and eventually a dead
  tab. The snapshot is no longer built at all while the clock runs (player views advance on their
  own clock between updates, which is what already made them look alive), the clock itself no
  longer rides the campaign message, and any large message now has a five-second floor with the
  latest state always landing - so a busy session goes a little stale instead of falling over.
- Follow-GM now brings players back to the starmap. Dropping out of a system to the map left every
  following player still inside it, watching a system you were no longer looking at - picking a
  different system flipped them correctly, so it was only ever the way back that was missing. The
  map level is now broadcast in its own right, and a system you have merely selected follows too.
  A Player View with its starmap turned off still stays put, as it is meant to.
## v2.1.849-beta - 19th Aug 2026

- Engine map: RENDER-S25 rewritten and RENDER-S26 added. S25 had recorded the grid-dimming report against the opacity fault found first; that fault was real but lived only on the metric lattice, and the owner's grid was polar. It now records both faults, names the colour squaring as the reported one, and states the lesson that cost the first pass: a dial can be the trigger without being the cause, so compute what the control actually does at the reported setting before fixing anything in its code path. S26 records that a ring drawn as a LineLoop can carry nothing per-edge.

## v2.1.848-beta - 19th Aug 2026

- **The system lattice's cell can be pinned to a real distance.** New "Grid scale" on the System step: Automatic (the decade ladder, unchanged and still the default) or a fixed cell off the 1/2/5 ladder from 0.1 to 100 AU. G10 made this grid a scale rather than decoration, but an automatic cell resizes as the view zooms, so "these are 1 AU squares" stopped being true the moment somebody scrolled. A pinned cell draws one level and the per-frame crossfade stands down entirely.
- A cell is a distance, so a non-finite one is now folded to Automatic where the preset becomes a holo style, rather than every later reader having to re-check it.

## v2.1.847-beta - 19th Aug 2026

- **FIXED: the 3D system map's grid was drawing its own colour SQUARED.** Three.js multiplies the material's colour by the vertex colour; the starmap's grid material carries no colour at all and lets the vertex attribute do it, while the system map set both to the same value — so 0.4 rendered as 0.16 and the whole grid dropped to a sixth of its intensity. It appeared the instant Grid falloff left zero because that is what switched the attribute on, which is why it read as a fade fault. It was not: at a 10% dial the fade window starts at 17.6 units on a grid of radius 12, so nothing was fading at all.
- **FIXED: Grid depth reached only the spokes.** The system map drew its polar rings as closed loops, and a loop has no pair structure to hang a curtain from — hence a glow where the spokes meet and nothing on the rings. Rings are edges now, as they have always been on the starmap.
- **The two grids now share the EMITTER, not just the constants** (`map/gridGeometry`): one function turns edges into lines and curtains, and the starmap's polar construction, numbers and materials are what both views use. Sharing the numbers but not the emitter is precisely how one view came to square its colour while the other stayed correct. The system map's graduated outer-ring dimming went with the copy — six rings at one strength, and the falloff dial is what dims them.

## v2.1.846-beta - 19th Aug 2026

- Upload a map background without leaving Settings. The background picker now has its own
  **Upload...** button beside it, into the same graphics library Player Views uses, kept at full
  resolution; choosing "Your own image" with nothing uploaded yet opens the file picker instead of
  being a dead option. The whole group was also tightened - it was inheriting nothing from the
  dialog around it, so every field sat at browser-default size with full paragraph spacing.

## v2.1.845-beta - 19th Aug 2026

- Docs only. From the owner's diagnostic bundle: a playing clock re-broadcasts the whole campaign every tick (989 MB in one sitting, memory to 3.8 GB) - located and routed; a multi-star Traveller import lays its stars out with the importer's own code instead of the generator's hierarchy planner; the time scrub snaps to zero while playing.

## v2.1.844-beta - 19th Aug 2026

- Docs only. The starmap-stars brief for a fresh session (sharper glyphs, size bands on 2D and 3D, compact grouped systems at every zoom, tag-driven jets and flares); the Traveller faults re-checked after the import unification (the frozen Earth-like world is still pack data; the flat giants have probably gone with the importer's own giant code); follow-GM starmap level re-routed to the G16 session.

## v2.1.843-beta - 19th Aug 2026

- What's new: "Your own map behind the stars" is no longer marked as coming - it shipped and the owner has seen it. Every line in the list is now a claim the build makes. Inbox: grouped systems drifting apart on the 3D starmap captured and folded into the star-renderer chunk.

## v2.1.842-beta - 19th Aug 2026

- Engine map: RENDER-S25 — a level's opacity belongs to ONE channel. Three.js multiplies vertex alpha by material opacity, so a builder that bakes a per-frame value into the vertex alpha composes it twice and the geometry renders at its square. Cross-referenced onto RENDER-S24/C14, which now also records that the depth curtain was bound to shared constants pre-emptively, while only one map had it.

## v2.1.841-beta - 19th Aug 2026

- **FIXED: turning up Grid falloff on a 3D system map dimmed every line instead of fading the far ones.** The fade was written into the vertex alpha with the material's opacity already multiplied in, and the material was then set to 1 — right for one frame, because the coarse/fine crossfade reassigns that opacity every frame afterwards. The level landed twice and the grid rendered at its square: a 0.42 level came out at 0.18, and a fine level mid-crossfade went 0.15 to 0.02. It switched on the instant the dial left zero, because that is what gates the branch. The starmap was never affected: it has no two-level crossfade to collide with.
- **The System step gains "Grid depth"**, the curtain dial the Starmap step has always had. Same range, same 3D-only gate, same shipped look — the two now read their depth from shared constants in map/gridFade rather than each carrying its own numbers, so they cannot drift the way the fade window did before it was unified.
- Housekeeping: restored the blank line between the two previous entries.

## v2.1.840-beta - 18th Aug 2026

- Inbox: B83 captured — the cloud-layering workstream. One deck model (base, top, optical depth, colour as seen), one stacking rule, carried onto the tag, read by all four consumers that currently each answer "what does this cloud stack look like" their own way. Six acceptance tests written in, so it is done when they pass and not before.

## v2.1.838-beta - 18th Aug 2026

- **"Navigation lists" is out of the info block, and off the 2D/3D system view entirely.** It never did anything there: a 2D or 3D system view builds its side panel in panel mode, which stops before the parent-nav row and every drill-in list is added, so a list style was styling blocks that are never drawn. It is a Document feature, and it now appears only when the stage actually is a document.
- The System step gains a **Document page** section, matching the one the Starmap step already had. The colouration, the per-slot colours, the navigator buttons and the navigation lists live there - they are the page's appearance. **Info block appearance** keeps what is genuinely the info block: the body picture, tags, live readings, panel width and text size.

## v2.1.837-beta - 18th Aug 2026

- FIXED: the balloon view showed a violet cloud deck on a world the globe painted gold. Both were faithful to the data, and the data was wrong: the potassium condensate was authored `#ee82ee`, a lilac — its FLAME colour, the chemistry-class answer — and sodium `#ffd700`, its flame's gold. Condensed, both are silvery metals, and every other liquid in the set is authored as the condensate looks rather than as it burns. Recoloured as pale metallic greys. The globe and the balloon now agree: the same pale warm grey from both directions.
- Why the two views disagreed so loudly on one bad datum: the globe weights a giant's decks by depth in the stack, so the deeper sodium dominated and the violet was a tint; the balloon looks straight down onto the TOP deck and showed it at full strength. Two renderers, two weightings, one datum — the disagreement was the data being found out.

## v2.1.836-beta - 18th Aug 2026

- FIXED: a hot gas giant's balloon view painted a dark room where reality is a furnace. The dry adiabat takes a close-in giant to incandescence a few bar down — 831 K at its 1 bar level, 1,600 K by 10 bar — and a scene lit by starlight alone had nothing to show once the decks blocked the star. That is the brown-dwarf lesson again: a hot gas is a light source, whatever it is filed as. The air's own glow is now painted at the local temperature, dull red through orange to yellow-white, and it is not dimmed by "midday brightness" because it is not daylight. Jupiter, at 159 K, still glows not at all.
- The depth slider opens at the 1 bar reference level, the number every stored figure belongs to, rather than somewhere in the stratosphere.
- The slider's travel is re-weighted. A uniform log of pressure spent most of its length in the top microbars where nothing changes and crammed the decks, the anchor and the first bars under them into the last centimetre. The middle third now runs 10 mbar to 10 bar, which is where everything worth seeing lives.
- NEW: how far below the cloud tops you are, in metres or kilometres — from the scale height, the same hydrostatic air the temperature came from. Jupiter's 1 bar is 22 km under its ammonia tops; 35 bar is 109 km down; 9 mbar is 93 km above them.
- On the colour looking identical from the top down to a few bar: it was, and correctly — on that world both decks sit above 1 bar, so everything from 1 to 100 bar is "under the sodium deck" and lit the same way. The jump you saw was the slider entering a deck. With the glow in, that band now warms visibly with depth instead of holding one shade.

## v2.1.834-beta - 19th Aug 2026

- Fixed: the "gas-giant gallery" link from a body's Atmosphere tab landed at the top of the page on a first visit and only jumped to the right section if you refreshed. The section it points at is built from two files fetched after the page opens, so the browser resolved the link before the section existed; it now jumps once the gallery is actually there.

## v2.1.833-beta - 19th Aug 2026

- Fixed: in the Gas Physics editor the absorption bands were penned into a narrow column with the preview chart squeezed inside it, and the DERIVATION heading sat beside Molar Mass instead of spanning above it. Both now run the full width of the card, so the star preview has room to be a chart.

## v2.1.832-beta - 19th Aug 2026

- The night-lights range in the Biospheres editor is a proper two-thumb slider now, instead of two boxes asking for four decimal places of a number nobody tunes past 5%. The band is lit between the thumbs, so "somewhere between dim and blazing" reads at a glance.
- The light colour no longer hides behind a tickbox. The swatch always shows the colour in force - city amber unless you change it - because the tickbox read as "does this world glow at all?", which it never was: the Lights band above decides that. A Reset appears once you have changed it.
- Clearer wording on both: what the lights band is FOR (each world rolls once inside it, so a wide band makes some blaze and others barely show), and why a technological world's cover slider goes where it does - it is the only kind that roofs the seas and the ice caps, so it can reach the whole planet.
- Fixed: the absorption-band help wrongly listed oxygen among the gases that only scatter. It has the 762 nm A-band, and always did - 16 of the 33 shipped gases carry bands.
- Fixed: "Preview against a star" did nothing at all on a gas with no bands - 17 of the 33. It now draws the starlight arriving untouched, which is the answer rather than a dead button.

## v2.1.830-beta - 18th Aug 2026

- The balloon's depth slider now goes to 100 bar, and it is the honest limit rather than a round number. The temperature law is the dry adiabat continued down from the 1 bar anchor, and it can be checked against the one descent anyone has made: we say 319 K at 10 bar where Galileo's probe read about 330, and about 400 K at 22 bar where it read about 425 and died. A few percent all the way down. Past 100 bar the things the law leaves out — the wet adiabat, opacity growing with density, the air's own glow — start to matter and none has been checked, so it stops there and says so.
- As you descend the air thickens and your sight closes: hundreds of kilometres near the top, tens of kilometres at the bottom, metres inside a deck — and the same haze veils your lamps. The visibility readout and the balloon veils both use the figure at your depth, not the 1 bar one.
- The water deck appears. It lives a few bar below the reference on any giant that carries water, which is why a renderer looking down from space never sees it and the published cloud tags do not carry it. The bundled Jupiter has no water in its composition at all, so its deep view finds none — a catalogue fact, not a model limit; give it Galileo's half a part per thousand and the deck appears where Galileo met it.
- "Midday brightness" means the same in the balloon as on the ground: unticked, you see the colour of whatever light reaches you, however faint — under the ammonia deck it is still ochre. Ticked, you see how dark it is, which under an opaque deck is black, because it is.
- Found on the way: the cloud-deck scan asked "is the air saturated at the surface" using the deepest pressure in the profile rather than the pressure the stored temperature belongs to. Identical for every published profile, since those end at the anchor — but on a profile continued below it, it drained every deck. The anchor is now a named thing the scan reads, and the published decks are byte-identical.

## v2.1.828-beta - 19th Aug 2026

- Docs only. The V3 plan marks your-own-map shipped and the broadcast-id collision closed; one welcome-list flag left, awaiting the owner's eye.

## v2.1.827-beta - 19th Aug 2026

- Docs only. The follow-GM starmap-level item renumbered to A59 (A58 was already taken).

## v2.1.826-beta - 19th Aug 2026

- Docs only. Follow-GM has no message for the GM returning to the starmap level (it follows body ids only); captured with the one-message fix and routed to the VTT session.

## v2.1.825-beta - 18th Aug 2026

- NEW: a gas giant's Surface view is now the view from a balloon. It used to paint rock, sea and trees on a world with nothing to stand on; it now shows a soft cloud deck below, darker air above, and no hard horizon, because there is no edge to stand at. The distance markers become balloons, which is honest rather than a joke — an aerostat is the one thing a person could genuinely float at depth in such an atmosphere.
- NEW: a depth slider. A balloon floats where you tell it to, so you can go down through the air and watch it warm, darken under each cloud deck, and change colour as the deck you are looking down onto changes. Everything it shows is a read of what the engine already derives: the adiabatic profile for the temperature, each deck's base pressure and optical depth for the light. Descending through Jupiter's ammonia deck the light goes to near nothing, which is correct — you are under a hundred optical depths of cloud — and the view says so rather than drawing a black box.
- The slider stops at the 1 bar reference level and says why: the model describes nothing beneath it — no temperature law, no radiative transfer, and at a few hundred bar the air glows by its own heat, which is V4 work. Every number past that line would be an extrapolation. A balloon would not take a person there in any case.
- The standalone viewer on the physics page gains a Jupiter-like sky, so the balloon view can be reached without loading a map.
- Found on the way: a giant without a stored equilibrium temperature read the same 139 K at every depth, because the profile's skin temperature fell back to the 1 bar reading and the adiabat clamped to it. The demo body now carries both, as the real catalogue bodies already do.

## v2.1.824-beta - 19th Aug 2026

- A copied gas-giant recipe now carries its own name - the gallery's description of what condenses in it, like "sodium overcast - potassium veil" - and the preset it creates is called that instead of being named after whichever planet you dropped it on. What you are saving is a gas mixture, so the dropdown now reads like a list of mixtures.

## v2.1.822-beta - 17th Aug 2026

- FIXED: the Surface view rebuilt a world's light assuming every star is as bright as the Sun. Around Sol that is exactly right, which is why it went unnoticed — but around an M dwarf at a hundredth of a solar luminosity the "% of an Earth noon" figure came out a hundred times too high. The stored summary already records how much light arrived, and the derivation is linear in it, so rescaling to match is exact and needs nothing new stored.
- Checked and NOT a fault, since it looked like one: moving a planet nearer its own star changes how bright the Surface view is and does not change its tint. Distance scales the flux; it does not reshape the light. The spectral chain is re-derived per body and the identical colour is the correct answer, not a skipped step.

## v2.1.820-beta - 19th Aug 2026

- Importing a gas-giant recipe now tells you WHERE those colours are brightest, and it is advice rather than a warning. Put a 700 K recipe on a cold world and it still works - you get the decks that world's temperature allows - so instead of objecting, it says which orbit would light it up: "these colours are brightest near 700 K; this world runs about 112 K where it is - bring it to roughly 0.6 AU and they come alive." Move it in and the sodium and potassium do exactly that.

## v2.1.817-beta - 19th Aug 2026

* A57 follow-up - the prompt still fired on v2.1.816 and came back ~5 s after OK, on a FRESHLY minted id (owner's network log: one WebSocket per new id, 101, then rejected). ROOT CAUSE: `initPeerHost` is async and awaits the lazy PeerJS import BEFORE `this.peer` is assigned, so the same-tick callers on every load (the route's reactive enableRemote, then onMount's and SystemView's initSender) all saw "no peer" and each opened a socket for the SAME id - the broker refused the later ones as unavailable-id. A brand-new id collided with ITSELF on every load, which is why it was consistent rather than a timeout-bound ghost. Fix: one in-flight registration per id (`hostInFlight`); an id change also cancels the old id's retry ladder; a late collision for a superseded id never prompts. Recorded in the ring as `host-skip in-flight` / `stale-id-ignored`. Spec: a faithful fake broker (a pending socket holds the id) and two regression cases (three same-tick callers make ONE registration and never prompt; OK mid-ladder never re-prompts).

## v2.1.816-beta - 19th Aug 2026

- A gas-giant recipe can now be brought back IN. A body's Atmosphere tab gains **Import recipe**, next to a link to the gallery it came from: paste what you copied and it becomes a named preset on your campaign, applied to that world.
- It also tells you the one thing it cannot set. A giant is that colour because it is that cold, and a world's temperature comes from its star and its orbit - so the import applies the chemistry and then says, for example, that the colour wants about 165 K while this world sits at 210 K, and which way to move it. Different cloud decks will condense until you do.

## v2.1.814-beta - 19th Aug 2026

* A57 - the "another session is already hosting this starmap's broadcast id" prompt, user-reported on beta. The PeerJS broker holds a just-dropped id for a timeout, so a quick reload of the same map collided with the tab's OWN previous registration and prompted as if a second GM existed; OK minted a new id silently and Cancel brought the prompt back on every system entry. Now: the registration is released on pagehide; a collision is RETRIED (1.5 s, 3 s, 5 s) before it is believed; a genuinely persistent holder prompts ONCE per id, after which that id is not silently re-hosted until it changes (OK) or sharing is re-enabled explicitly (Player Views); OK shows "New session id minted - existing player links and QR codes have stopped working"; a dev/localhost tab no longer AUTO-hosts on the public broker (explicit sharing still works). Every host attempt and outcome is recorded - `__ssePerf.events(60,'peer')`. The readable id scheme (map slug + two space words + digits) is unchanged. Also fixes E12: `broadcastContract.spec.ts` now awaits deliveries instead of counting ticks and is no longer flaky under the full suite; it gains a fake broker and four collision cases.
## v2.1.813-beta - 19th Aug 2026

- Docs only. Your-own-map-behind-the-stars written up: one engine-map entry (a map-fixed image lives
  inside the world transform and its anchor is campaign content), a new finding on the two
  uploaded-image systems the feature had to straddle, and the guide debt recorded.

## v2.1.812-beta - 19th Aug 2026

- Align the map background by eye. Placing a sector map by typing numbers into a dialog that covers
  the map was guesswork, so Settings now hands over: **Align & scale on the map** closes the dialog
  and puts a slider strip over the live map - width, left/right, up/down, rotation and fade, all
  moving the picture as you drag. Done bolts it in and gives Settings back; Cancel puts it back the
  way it was; Fit to systems recovers a picture you have lost off the edge. The exact numbers are
  still there under "Type exact values" for anyone transcribing a known scale.

## v2.1.811-beta - 19th Aug 2026

- Your own map behind the stars. Put your own image behind the starmap - a sector map, empire
  borders, a hand-drawn chart - either fixed to the screen like the shipped Milky Way, or FIXED TO
  THE MAP so a system stays on the same point of the picture however you pan and zoom. Set the
  width in your own distance units, the centre, the rotation and the fade in Settings > Map
  display. It shows on your map, on the player 2D and 3D maps (as a flat plane in the map plane)
  and as a figure at the foot of the starmap document, and it travels in the save bundle with its
  credit. Upload at full resolution for a map you will zoom into. The About box now credits
  whichever image is actually on screen.

## v2.1.810-beta - 19th Aug 2026

- Docs only. The broadcast-id prompt is now user-reported on beta and goes to the front of the VTT session's queue.

## v2.1.809-beta - 19th Aug 2026

- Docs only. The broadcast-id collision narrowed by elimination to the tab colliding with its own registration; the VTT session is asked to record every host attempt in the event ring before fixing. Two rule-pack 404s on every load noted.

## v2.1.808-beta - 18th Aug 2026

- Docs only. Adrian's green confirmed by eye and closed; the broadcast-id prompt did not recur on refresh, which fits the ghost diagnosis; the performance session's retirement recorded.

## v2.1.807-beta - 18th Aug 2026

- Docs only. The broadcast-id collision most likely collides with the ghost of the owner's own reloaded tab; the fix is to release the id on page hide and retry before prompting.

## v2.1.806-beta - 18th Aug 2026

- Docs only. The performance session writes up what it learned before retiring (`docs/dev/perf-and-chrome-notes.md`): what each meter answers, where the player-view rebuild storm was actually left - instrumented but NOT diagnosed, with the one field to read first - and the three items whose written-down diagnosis turned out to be backwards. Indexed from the debug-tools guide and the session roster.

## v2.1.805-beta - 18th Aug 2026

- The gas-giant gallery will now hand you the recipe. Every giant in the derived rows gets a **Copy recipe** button that puts its composition, pressure and temperatures on the clipboard, ready to paste into a body's atmosphere - so if you see a colour you want, you can have the world that makes it. It copies the INPUTS, never the colour: paste it and the engine derives the same giant, which is the point the gallery has been making all along.
- The four hand-painted giants further down deliberately have no button, and now say so - their palettes were chosen by hand, so there is no recipe behind them to give you.

## v2.1.804-beta - 18th Aug 2026

- Docs only. Your-own-map-behind-the-stars handed to a fresh session.

## v2.1.803-beta - 18th Aug 2026

- Docs only. The broadcast-id collision dialog diagnosed as three faults (a retry loop on every system entry after a collision, no feedback when a new id is minted, and dev previews auto-hosting production ids on the public broker) and routed to the VTT session.

## v2.1.802-beta - 18th Aug 2026

- The surface-light explorer on the physics page now draws the Sun at Earth's distance as a fixed reference line, so the star you have dialled up can be read against the one you have an intuition for. Turn the temperature down to a red dwarf and its curve drops far below Sol rather than merely changing colour - the intensity difference is the half that is easy to lose, and the visible-light strip along the bottom already showed which part of it you could see. Nothing is editable and no physics changed: both curves come from the same engine function.

## v2.1.800-beta - 18th Aug 2026

- Internal: the constructs-and-camera session's retirement notes, written up the way the 3D-surfaces session wrote up its own. What the traps are, which reported diagnoses turned out to be leads rather than causes, and what is left open.

## v2.1.799-beta - 18th Aug 2026

- **After importing a system you can now fill it out, with the same four dials you use to create one from a star.** A new step in the import review adds plausible worlds where the import left gaps: imported worlds are never moved, re-typed or aged — a generated world that would crowd one is dropped, not the import — and the imported star is fed to the generator as it is now, not re-aged. It is always offered, starts on for a sparse import and off for one that already carries a system, and skipping it just loads the import exactly as it is.

- **The age control is bound to the star's own life.** The slider runs from the youngest the star could plausibly be to just before it swells, explodes or collapses, on a log scale so a young age is not crammed into the first pixel; a shaded band at the young end marks where the star still flares hard, because a young flaring system is a real option; and the age is marked as estimated when it is a guess rather than something the file stated. Only worlds generated into the system are born into the chosen era.

- **Traveller systems now come from the same generator as everything else.** The importer had its own two hundred and fifty lines of placement — its own orbit list, an "emergency fill" that forced random orbits when it ran short, and a rule that gas giants prefer beyond 1.5 AU whatever the star. Gone: the Main World and the stars are still built from the profile, and the shared infill takes it from there with W as a hard count of planets (moons never count; a "home world is a moon" system places the moon first, round its giant) and the PBG giants and belts as the mix to aim for. First importer-level tests for Traveller.

- The dials themselves are now one component shared by the wizard and the import step, so their explainers are the same words in both places.
## v2.1.798-beta - 18th Aug 2026

- Docs only. The V3.0 plan in twelve chunks with the owner's evening calls folded in (orbit opacity, the derivable star renderer, the banded generation slider and the recipe-copy button all pulled into V3; colour tags to the tagging workstream); Adrian's bloom decks measured as forming.

## v2.1.798-beta - 18th Aug 2026

- **Orbit lines can now be dimmed, or switched off entirely.** A large imported system -- 45 planets and 25 moons -- buries its own map under seventy orbit lines, and there was no way to turn them down. There are three controls, deliberately separate: a dial on your own system map that is yours alone, a dial on a player preset's System step that travels to whoever is watching, and a momentary "Hide orbit lines" beside "Hide labels" for when you just need to see the map for half a minute. Nothing changes until one of them is moved -- every dial starts at the look the maps have always had.
- The dial scales each line's own strength rather than replacing it, so the relationship between a planet's orbit and a moon's is kept at every setting, and it reaches the flat 2D map and the 3D view alike. The distance-ring grid has its own separate falloff control and is untouched by this one.

## v2.1.797-beta - 18th Aug 2026

- Docs only. Orbit-line opacity (and a momentary hide) is pulled into V3 on the owner's call after an imported 45-planet system made the map unreadable; routed.

## v2.1.796-beta - 18th Aug 2026

- The Gas Physics editor now shows the ABSORPTION BANDS each gas already used. They were in the data and the engine has always read them - oxygen's 762 nm A-band, methane's six, and thirteen other gases - but nothing on screen ever said so. Each gas now lists its bands with a preview against a star of your choosing, so you can watch the notch move as you type. Rayleigh scattering was hidden in the same way and is now a field too.
- The gas card is split into what the physics READS and what it merely DRAWS with, because a GM had no way to tell the difference: a gas colour never touches the light calculation, and an absorption band decides the whole thing.
- A world's night-side lights can now be any colour - bioluminescence, city amber, somebody's purple arc-light - chosen per morphology in the Biospheres editor. Left alone, they stay the sodium amber they have always been.

## v2.1.794-beta - 18th Aug 2026

- FIXED: a system file with a blank rule-pack id would not load - "Invalid system file. Missing system-specific properties" - and the app writes blank ones itself on ubox and SpaceEngine imports, so a system imported, saved and reopened was refused. The pack id was never needed to load: the file is processed with the current pack regardless. It is now stamped on load where blank, the message says what is actually required, and a starmap is no longer refused for an embedded system with a blank or stale pack id.

## v2.1.793-beta - 18th Aug 2026

- **Every importer now classifies stars the same way, and a G giant is no longer a G dwarf.** Universe Sandbox, SpaceEngine and Traveller each had their own spectral-class ladder; all stopped at M, and SpaceEngine kept only the first letter of the full class it was handed — so "K3III" imported as a K dwarf — and defaulted anything it did not recognise to G. One resolver now serves all three: a stated designation is kept as written (its luminosity class included, folded to the pack's bands); a bare letter gets its class inferred from the star's temperature and radius when it has them — a K giant is forty times the radius of a K dwarf at the same temperature — and defaults to main sequence when it does not; with no stated type the letter comes from temperature through the pack, brown dwarfs included; nothing usable is left honestly unclassified rather than guessed. Where a stated class contradicts the physics, the stated one is kept and the disagreement is noted.

- **Every importer now dates a system the same way too.** Universe Sandbox and SpaceEngine used a flat 4.6 billion years when nothing better was to hand; Traveller rolled a random age between 1 and 10 whatever the star. All three now use the shared star-aware guess with its reasonable band, marked as estimated so you know it is one. Where the source states an age it wins if the star can be that old.

- Universe Sandbox: an import with no star now says so plainly and points at the fix, instead of quietly reporting 4.6 billion years.
## v2.1.792-beta - 18th Aug 2026

- Docs only. The band editor's range must follow the engine's grid (280-1400 nm today, near-UV to near-IR) rather than hard-code it, so the editors extend with the physics.

## v2.1.791-beta - 18th Aug 2026

- **Universe Sandbox import: a star with a blank top-level category is no longer thrown away as a particle.** Universe Sandbox stores an object's category twice, and the top-level label can be empty on a real body; the importer read only that label, took blank to mean ring-fragment particle, and dropped the star before working out who orbits what. On the reported file that discarded a 1.68-solar-mass A star, made the largest gas giant the centre of the system, unbound thirty of thirty-four bodies against it, and fell back to a 4.6 billion year age because it could find no star to date the system by. It now reads the second category, the star flag, a stated luminosity and finally the mass before giving up. The same file now imports as built: 34 bodies, the A star at the centre, and the 0.37 billion year age its author set on it. Thank you to the user who reported it and sent the file.

## v2.1.790-beta - 18th Aug 2026

- **Groundwork for the import refresh: one infill and one age model, shared by every importer.** The real-sky catalogue's fill-out routine — which already did the right thing: seed the wizard's own generator from the star, never crowd an imported world, continue the letters, tag everything it adds — is generalised into a single `infillSystem` that takes the same four dials as the wizard, an age, more than one star, and a hard planet count for Traveller (which never counts moons). Real-sky now calls it. Nothing user-facing changes yet; the panel comes next.

- **`guessSystemAge`: a star-aware guess with a reasonable band, replacing three different policies** (star-aware, flat 4.6 Gyr, and — in Traveller — a random roll). Middle-aged for a main-sequence star, near the end for a giant, cooling age for a white dwarf, honestly undated for a brown dwarf; a stated age wins if the star can be that old and is refused with a reason if it cannot. The band is the star's own life, so the age control can be bound to it.

- Two owner rules recorded in code: an imported world is truth (never moved, re-typed or aged by infill), and an imported star is truth (fed to the generator as it is now, not re-aged).
## v2.1.789-beta - 18th Aug 2026

- Docs only. The spectra decision recorded (gas-editor bands now; species vision and reflectance specified now for 3.1; full EM before V4), the gas-editor item routed, and the owner's own generation-and-importer work noted so nothing is routed under it.

## v2.1.788-beta - 18th Aug 2026

- Docs only. The owner's spectra question captured with the tree measured against it: one spectral vocabulary already exists and the light chain runs on it; the gas editor hides the absorption bands it derives from (a small item); species-parametrised vision is a presentation-only swap at the one human step; full EM is a second model, not a constants change.

## v2.1.787-beta - 18th Aug 2026

- Docs only. The import-refresh design note (`docs/dev/import-refresh-design.md`): every importer surveyed against the new stars, compositions and physics, and a plan for one shared infill with the same four dials as the wizard, one star-aware age guess with a reasonable band, and one star ladder in place of the four private copies. Also reads the Universe Sandbox report in the inbox properly: the 4.6 Gyr the user saw is a symptom of the importer not recognising their star, not the cause of the unbinding.

## v2.1.786-beta - 18th Aug 2026

- **The Metallicity dial now does what its label says.** It was wired to nudge interior makeup and reached about one generated body in seventy — inert in practice. It now weights the type draw on the physics: giant occurrence rises steeply with metallicity because core accretion needs solids to build a core before the disc dissipates (Fischer & Valenti 2005), so a metal-poor system is a few small rocky worlds and hardly a giant, and a metal-rich one is dense iron and carbon worlds and many gas giants. There is a floor on giants even at the bottom — the disc can collapse into one directly, no core needed — so it is never "no giants ever". Measured across the dial around a Sun-like star: giants per system 0.7 to 4.2, gassy worlds 9% to 57%, icy 26% to 6%, median density 5.5 to 2.4 g/cc. The default sits a little above the middle, because the Sun is somewhat metal-rich against its neighbours.

- **Every generation dial now carries a one-line explainer that says what it does and why**, and a link to the physics page. The dials are meant as broad inputs a wider generator will one day set automatically (a cluster shares its metallicity); set by hand here they give a system its flavour.

- **The physics page's Auto-generation section is rewritten** to explain what actually happens now: where the orbits go (a ratio that scales with the star, mutual Hill radii as the stability floor beneath it), what could be born at each orbit (one viability model shared with the "Add planet here" picker, its five gates and the one-way formation window), and which of the viable types is drawn (the four dials, each with the physics behind it and the measured effect).

## v2.1.785-beta - 18th Aug 2026

- **Brown dwarfs can now be generated at all.** The letter-from-temperature ladder stopped at M and a stale 1,500 K temperature floor in stellar ageing promoted every T and Y dwarf to L — so an L-dwarf seed came out as an M dwarf, and a Y-dwarf seed as an L. The wizard could not make a brown dwarf from a seed, and every brown-dwarf figure quoted in the last few builds was in fact a red dwarf. Both fixed: the letter now reads the pack's own temperature anchors (L, T and Y included), and the floor is gone.

- **The new star classes no longer fall through the generation lookups.** A G giant (`G-III`) was taking red-dwarf binary odds because the code compared the whole class string; brown dwarfs were taking the stellar-remnant planet-count table (95% empty) because no branch named them. Class-keyed lookups now go through one family helper that reads the letter, and brown dwarfs have their own count table — discs around them are real and form a few close-in rocky worlds, but not ten.
## v2.1.784-beta - 18th Aug 2026

- What's new: undo and redo is no longer marked as coming — it shipped and has been seen working — and the virtual-tabletop line now says plainly that Mappadux works today and that we are looking for Owlbear Rodeo and Foundry testers. Inbox: a sanity check at 783 — what landed, what waits on the owner and where to answer, and what is left for V3 in agent-sized chunks.

## v2.1.783-beta - 18th Aug 2026

- **The emergency save no longer carries the undo history.** If browser storage fails and the app falls back to the smaller, older store, the campaign is what has to fit - so the undo log is left behind rather than competing with your map for the last megabyte.

## v2.1.782-beta - 18th Aug 2026

- **Fix: starmap undo now sees the edits the app actually makes.** Yesterday's campaign history only recorded a move, an add or a delete when the code that made it built a fresh copy of the map - and almost none of it does. Moving, adding and deleting a system all went unrecorded. It now compares what changed rather than which object arrived, so every route to a map edit is covered.

## v2.1.781-beta - 18th Aug 2026

- **Your undo history now survives a reload.** The last twenty steps ride the campaign into browser storage with everything else, so closing the tab and coming back leaves them where you left them - for the system you were in, and for the starmap. It is GM-private and stays that way: it is stripped out of every save you export, every system you send to another GM, and everything the players ever receive. Capped by size as well as by count, so a very large system keeps fewer steps rather than bloating every autosave.

## v2.1.780-beta - 18th Aug 2026

- **Undo now covers the STARMAP as well: moving, renaming, adding and DELETING a system, the routes, and the map's own description and GM notes.** Same pill, in the starmap view - each view winds back what you are looking at. Deleting a system is the one it was built around: the whole system comes back, bodies and all, at the position it was in. An undo of a move or a rename does NOT wind back body edits made since - every surviving system keeps its current contents - and editing a body never puts a step on the map's history at all.

## v2.1.779-beta - 18th Aug 2026

- **The planet mass filter is now a band with a ceiling as well as a floor.** A primary orbit gets a planet — not a pebble, and not a star. Brown dwarfs and ultra-cool dwarfs sit above the 13-Jupiter-mass deuterium line that every giant class stops at, and were being offered for planet slots. They stay available with the mass filter switched off, and as companions; they just do not take a headline orbit by default. Sub-Mercury worlds are now 0.1% of what a Sun-like star generates, down from a fifth two builds ago.

- Protoplanets had started appearing in old systems, because moving the age band off the classifier left them defined by mass alone. Restored: for a protoplanet, youth IS the definition, not a birth window.
## v2.1.778-beta - 18th Aug 2026

- **The undo button now says what it will take back** - "Undo: Mass of Earth", "Undo: Deleted Luna", "Undo: GM notes of Earth" - read off a diff of the two authored states rather than declared by any editor, so every edit route gets it for free. Where one edit moves several bodies (give Earth mass and tidally-locked Luna's rotation period follows) the body you had SELECTED names the step, because that is the one you changed and the rest are consequences.

## v2.1.777-beta - 18th Aug 2026

- **The "Add planet/moon here" picker and the generator now judge "what could be born here" from ONE model, with the physics filters shown at the top of the picker as switches.** Temperature, mass, age, tidal lock and host fit each start on; the GM can turn any of them off to see the wider menu despite the physics — hand authoring is hand authoring, and the tags will say what is implausible. The generator uses the same model with every filter on and then chooses among the survivors with the sliders. The picker and the generator can no longer disagree about what is viable, only about whether the GM chose to override it.

- **A planet slot now gets a planet.** Asteroids, comets, planetesimals and dwarf planets were competing for primary orbits on equal terms with real worlds — and, being common, the rarity ladder favoured them. A fifth of every generated "planet" around a Sun-like star was lighter than Mercury and one in eight lighter than Ceres. A mass floor (pack data, Mercury-ish) keeps them off a headline orbit by default; they stay in the world as moons and belt members, and in the picker when the filter is switched off. Sub-Ceres worlds and asteroids-as-planets: gone. Sub-Mercury: halved, the rest being honest small worlds.

- **Types now carry a formation window — early formers and late formers.** A protoplanet is young; a stripped chthonian core or a helium remnant needs time. That band gates what a slot may be GIVEN and nothing else: it is deliberately one-way, so a hand-placed chthonian in a million-year-old system still classifies as exactly what it is. Two pre-existing age bands that were sitting on the classifier side (protoplanet, crater) have been moved to the formation side, where they belonged.
## v2.1.776-beta - 18th Aug 2026

- Docs only. The surface-areas design gains a third dimension - depth, and height - so the one record describes a polar cap, an iron core, a subsurface ocean, a mantle plume and a beanstalk rather than only the outside of a world. It also moves from "deferred to V4" to groundwork that lands BEFORE it, since the advanced generation is meant to build on it.
- Recorded with it: the magnetic-field model currently sizes a planet's core by the cube root of the whole body's mass, because it has no core radius to read - which is the concrete thing a depth-aware record fixes.

## v2.1.775-beta - 18th Aug 2026

- **Undo now refreshes the STAR editor too.** Verified in the running app: an undo restored the model correctly while the open star panel kept showing the old mass, because that panel deliberately seeds its fields once per body so typing is not snapped back. An undo is now the other event that re-seeds it. Also confirmed live: the pill sits at the top of the system view and appears only once there is something to wind back, Ctrl+Z inside a text field leaves the model alone, switching system clears the history, and an open dialog on a phone hides the pill through the shared chrome rule.

## v2.1.774-beta - 18th Aug 2026

- **Undo/redo (G28).** A floating pill at the top of the system view, plus Ctrl/Cmd+Z and Ctrl+Shift+Z / Ctrl+Y, winds back the GM's edits - body and construct changes from every tab, adding and deleting bodies, tags, GM notes, descriptions. One drag of a slider is ONE step, not two hundred: the recorder coalesces on the release the body editor already had, with a 250 ms idle gap as the fallback. An undo restores only the AUTHORED values and lets the processor re-derive the rest, so temperature, class and tags all follow. Keys stay out of the way inside a text field, so the browser's own text undo still works. The history is GM-private and never enters a save, a shared campaign or a player broadcast.

## v2.1.773-beta - 17th Aug 2026

- Docs only. The undo/redo brief re-checked against the tree at 772 and released to a fresh session: the pill registers through the chrome action A52 built, and the one existing single-shot undo (the pre-upgrade snapshot) is named so it is left alone.

## v2.1.772-beta - 18th Aug 2026

- **Default generation now aims at a Solar-System-shaped result.** With every slider left alone a Sun-like star produces a median of seven planets (commonly four to ten), the innermost near 0.28 AU, three of them inside the habitable zone's inner edge, and an outermost around 11 AU. Four systems in five contain a world in the habitable zone, and about half carry a gas giant beyond the frost line. The mix runs roughly half rocky, a third icy and the rest gassy.

- **Planet spacing is now the RATIO between successive orbits, with mutual Hill radii kept as the stability floor beneath it.** The previous build spaced planets by a constant number of Hill radii, which is right for the tightly packed systems Kepler found but wrong for ours: the Sun's planets sit anywhere from 8 to 63 Hill radii apart because their masses differ so widely. What is steady in the Solar System is the ratio of one orbit to the next, close to 1.7 throughout. Spacing follows that instead, which reproduces both our own system and the compact ones, and it stays scale-free so nothing about the Sun is carried to any other star.

- **Planets are no longer placed where they would not survive.** Where the drawn spacing would put two worlds too close for the pair to last, the gap opens to the stability limit — so the orbits either side of a massive planet stay clear, without that having to be a special case.

- Sun-like stars now form richer systems: the count table peaked at three or four planets and now peaks at seven, which is also what let the outer system be reached at all.
## v2.1.771-beta - 17th Aug 2026

- **Fixed: the system map's grid-falloff dial DELETED the grid instead of fading it toward the edge.** The same dial on the starmap behaved, because the two maps each had their own copy of the numbers behind it -- and the system map's were set for a smaller area than it actually draws, so the fade had finished before it reached the outermost rings. At full strength four of the six distance rings and the whole rim were being drawn at zero. Both maps now share one set of numbers, the starmap's, so the dial reads the same on both and cannot drift apart again.
- **Fixed: on the glowing-wireframe styles, a planet turned into a white blob as the size dial moved toward true scale.** The dots drawn at each corner of the wireframe had a minimum size fixed in world units, and a planet shrinks by about a hundred thousand times across that dial while the minimum did not -- so on Mars at true scale each dot was forty-four times the planet's own radius, and the planet vanished inside its own decoration. A dot can now never be larger than the body it belongs to.
- **Fixed: the "Terminal Clear" transition ran backwards.** The bright flash sat ahead of the clearing edge and faded into the page still to be cleared; it now flashes as the edge reaches each character and fades out behind it, which is the way a terminal actually clears.

## v2.1.770-beta - 18th Aug 2026

- **The Rarity dial is now a ladder rather than a gate, and it starts a quarter of the way along instead of in the middle.** It used to be a step: every type at or below the setting was equally likely and anything above it was cut off — so at the default an ordinary rocky world, a superhabitable one and an eyeball world all had the same chance, because "allowed" and "likely" were the same thing. Each type is now weighted by how exotic it is, on a curve the dial reshapes, so a common world is genuinely common and a legendary one genuinely rare — but nothing is ever ruled out, at any setting.

- **The dial's default sits at the realistic mix, with three quarters of its travel above that for the strange.** Below the default a system only gets more ordinary, which is rarely what anyone wants; above it, the weighting tips steadily until the rarest worlds are the likeliest. Every number behind this is in the rule pack.

- **Generated worlds no longer invent tidal locking to justify their own type.** The eyeball classes require a world locked to its star, and choosing one used to MAKE the planet locked — with nothing asking whether its orbit could actually slow the planet down in the lifetime of the system. Generation now checks first. Adding an eyeball world by hand is unaffected: hand authoring stays hand authoring.
## v2.1.769-beta - 18th Aug 2026

- Docs only. The surface-areas design - describing part of a world rather than all of it - is deferred whole to V4 and now has its own section in the V4 scope, so that work opens with the record already settled. The standing limitation it uncovered stays on the board: a world's surface age is currently its tectonic regime's constant, which is why the icy-moon work could not separate Ganymede from Callisto.

## v2.1.768-beta - 17th Aug 2026

- Docs only. The design for describing PART of a world - a polar cap, the sunward half, a tectonic plate, a city - is written up ahead of V4's plate drift, along with the one measured reason the icy-moon work stopped where it did: a world's surface age is currently its tectonic regime's constant, so there are five distinct surface ages across the whole solar system and nothing keyed on it can say more than that.

## v2.1.767-beta - 17th Aug 2026

- **The shipped six are the tuned six.** The built-in presets are now the ones you built and looked at, adopted from your export - covers, watermarks, transitions, a fully-dialled CRT, lo-poly and wireframe renders, charted stars and pin markers. Between them they exercise most of the tool rather than repeating one look, which is the other job they do.
- Projection is rebuilt on the 3D table rather than the old flat overhead plate, and drifts slowly so it stays alive on a table nobody is touching. Background - Greenscreen still makes it OBS-ready.
- **Belts & rings gains Points** - plain vector dots, alongside Rocks and Grey bands. It always existed but had no name: it was what you got when the RENDER style happened to be wireframe or lo-poly, so the only route to dotted belts was to make every body a wireframe. The two choices are now independent.
- **"Lists" is now "Navigation lists", and the starmap has its own.** It governs the drill-in lists - a star's planets, a planet's moons and ships, the way back up, and the starmap's index of systems - and one setting under the System step was quietly restyling the starmap index too. The starmap now carries its own, falling back to the System step's when unset, so nothing existing changes. The options are also grouped: six change the bullet, Cards changes the shape.
- A map pin stays over the thing it marks when it carries its name. It was centring the pin and its name together, which slid the pin off the body by half the name's width.

## v2.1.766-beta - 17th Aug 2026

- Reworked yesterday's mobile fix so it applies by rule rather than panel by panel. A dialog says it is a dialog, a bar or floating control says it is chrome, and one line decides the rest: on a phone, an open dialog gets the screen and everything else stops being drawn until it closes. Anything added later is covered without being remembered. The bar is hidden rather than torn down now, so it comes back holding whatever you had typed.

## v2.1.764-beta - 17th Aug 2026

- Docs only. Your-own-map-behind-the-stars now includes the 3D map (as a plane in the map plane) and the text map (a graphic at the foot); three render faults from play captured with their code located (grid falloff deleting the system-map grid, lo-poly vertex dots not shrinking toward true scale, the Terminal Clear band running the wrong way); one more inbox id collision untangled.

## v2.1.763-beta - 17th Aug 2026

- **Audited every stellar zone across the whole catalogue, from an O supergiant to a Y dwarf — about ten orders of magnitude of starlight.** The six condensation lines (silicate, soot, formation frost, frost, CO2 ice, CO ice) all come out correct, correctly ordered and scaling exactly with the square root of the star's brightness at every point in that range, so the frost-line fault fixed in the last build was confined to generation's own private copy and never touched the zones themselves.

- **Planet placement was using two hand-rolled zone sums of its own instead of the engine's.** Its "Roche limit" was the star's radius times 2.44 with the density term dropped, which is not a Roche limit: measured against the real one it is about 26,000 times too small for a neutron star and 26 times too small for a white dwarf — so planets could be placed inside the distance that would tear them apart — and around 900 times too large for a red supergiant. Its "soot line" was a different temperature from the one the engine calls by that name. Both now come from the engine.

- Known and recorded, not yet fixed: the kill zone and danger zone are the only zones still built on a stored brightness value rather than a derived one.
## v2.1.762-beta - 17th Aug 2026

- On a phone, the app furniture now gets out of the way of a dialog. Opening the import screen (or any other) hides the bottom "My Starmap" bar and the floating time control for as long as it is open, and puts them straight back when you close it - reported by a user whose import dialog was sandwiched between the two. Nothing becomes unreachable: with no dialog open the bar behaves exactly as before, and it is still the way to the starmap description and GM notes. On a desktop nothing changes, because there is room for both.

## v2.1.760-beta - 17th Aug 2026

- **The frost line — the distance beyond which worlds form icy — was being worked out from the star's MASS rather than its BRIGHTNESS.** Those are not interchangeable: a star's light rises far faster than its mass, so the old sum put the ice line about thirteen times too far out around a small red dwarf, forty times too far around a brown dwarf, and ten times too close around a hot blue star. It came out very nearly right for the Sun, which is why it survived so long.

- **Moons were worse.** A moon's ice line was being calculated from the mass of the planet it circles, then compared against its distance from that planet — so almost every moon counted as "inside" the line, and the moons of cold outer giants were essentially never icy. Both now ask the question of the star, at the world's real distance from it.

- What you will see: icy worlds and icy moons now appear where the star's light says they should, which for dim stars means much closer in, and for bright stars much further out.
## v2.1.759-beta - 17th Aug 2026

* **A moon in the Uggi example is no longer cut off from its own system.** Cerebus Alpha pointed at a parent that was not in the file, so it had no temperature, no distance to its star and no place in the hierarchy at all. It now orbits Hades — the world its own description names — 43,739 km out, which is what makes it the molten, tide-racked place that description promises. Nothing was invented: the file already held every number, one of them written against the wrong object.
* Internal: the question "does this world have solid ground" was answered by nine separate copies of one test that agreed only by luck. There is one now. No world changes; what changes is that a star can no longer be mistaken for somewhere to stand.

## v2.1.758-beta - 17th Aug 2026

- Changing a starmap between light years and parsecs now ASKS what you meant, showing both answers on a system from your own map: "TRAPPIST-1 is currently 40.66 pc from Sol - should it read 40.66 ly, or 133 ly?" Keeping the numbers (the unit was simply wrong) was previously impossible; every change converted, which is how a map loaded in Traveller mode ended up reading Alpha Centauri at 14.33 ly instead of 4.37. Neither answer moves anything on the map - depths included.

## v2.1.757-beta - 17th Aug 2026

- **Fixed: opening a system cut off its outer edge — which you only notice in a binary, where the thing cut off is a STAR.** The opening view was a fixed camera position that took no account of the lens, and it sat close enough to show under three quarters of the system's radius. It is now fitted to what is actually being looked through, so the whole system is in frame on entry, and a narrow phone screen pulls further back rather than cropping the sides.
- Switching to a different system now returns to that opening view. It had been keeping wherever the previous system was left, which on a system with a very different size read as arriving somewhere arbitrary.
- **Fixed: selecting a planet's rings framed the planet alone, so the rings — the thing clicked — sat outside the shot.** A ring's size is its orbit, not a body radius, and its extent was never part of the calculation: rings reach several times the planet's drawn radius while a close-up frames just past the surface. Rings now count as something orbiting the planet, so a ringed world offers the wider "planet and what circles it" step even with no moons, and that step now takes the rings in.

## v2.1.756-beta - 17th Aug 2026

- FIXED: every icy moon was exactly as bright as every other one. Enceladus, which reflects more light than anything else near us, and Callisto, one of the darkest things in the outer solar system, came out at the same number - a five-fold error on one of them. Ice ages: it is brilliant when it is fresh and filthy when it is old, because infall and radiation leave behind a dark residue that nothing removes and only resurfacing buries. So an icy world's brightness is a clock, and the engine already knew how long each surface had gone unrepaved.
- Callisto now reflects 0.13 against a measured 0.11, where it used to say 0.62; Enceladus and Triton land within 0.06 of their real values. Ganymede is the one this does not reach - most of it was resurfaced two billion years ago and the rest never was, so its real answer is a mixture of two ages, and the engine keeps one age per world.
- Their temperatures follow: Ganymede and Callisto were both sitting fifteen to forty degrees too cold because they were modelled as far too bright.

## v2.1.755-beta - 17th Aug 2026

- FIXED: Mercury was classified as an eyeball world - one face permanently sunward - while also carrying the 3:2 spin-orbit resonance that says the opposite. Being slowed by tides has two possible endings and the engine only recognised one of them: a permanent face, or a captured resonance where the whole surface still sees the star. Mercury has the second, and the Newton panel now says so instead of calling it a hot eyeball.
- A world in a resonance no longer gets a sharp day/night terminator drawn on it, nor the crater pattern of a world that keeps one face forward. Both need a face to keep, and it does not have one.

## v2.1.753-beta - 17th Aug 2026

* VTT integration: the GM tab now hosts on the PeerJS broker as soon as a starmap has its persistent session id (this hunk was meant to ship in v2.1.749 and was left in the working copy). Without it a cross-site host app could not discover the session at all - verified against the broker on the deployed beta.

## v2.1.752-beta - 17th Aug 2026

- Docs only. The 3D-starmap grid items recorded shipped with the crash the first one exposed; the grids-and-sky session retired with its notes; two unseen visual checks captured for the owner; a leftover stash inspected and dropped; and the shared-tree rule written into the standing rules.

## v2.1.751-beta - 17th Aug 2026

- Planets are now placed by the star they orbit, not by the Solar System. Spacing was the Titius-Bode law in absolute AU, so every star was handed Sol's own orbits (0.4, 0.7, 1.0, 1.6 AU...) and had the ones it could not reach filtered away — which is why planets never generated closer than about 0.5 AU whatever the star, and why brown-dwarf systems sprawled far outside anything the star could warm. Adjacent planets are now separated by a drawn number of mutual Hill radii, which contains the stellar mass and so scales with the star for free, and they PACK outward from the disc's inner edge instead of sampling nine fixed positions.

- What that changes, measured over 200 seeds per star: a 0.09-solar-mass star now puts its innermost world near 0.01 AU rather than 0.42 AU (the real TRAPPIST-1 sits at 0.011), an L dwarf gets planets around its own habitable zone instead of a hundredfold outside it, and a Y dwarf gets planets at all — it previously produced an empty system every single time, silently. A Sun-like star still produces Sun-like systems, including rocky worlds inside 2 AU with a gas giant beyond the frost line, without reproducing Sol.

- Systems are no longer capped at nine planets, and the "amount of material" dial is no longer clamped by that cap: across its travel it now moves a Sun-like system from 1.25 planets to 5.8, and the outermost orbit from 0.33 AU to 4.6 AU.

- All the spacing numbers live in the rule pack (`generation_parameters.orbital_spacing`), so a GM can retune them; nothing about the Solar System is left in the code.

- Docs: a moon-generation design note for sign-off (`docs/dev/moon-generation-design.md`), which found that the shared moon system already exists and only generated moons bypass it.
## v2.1.750-beta - 17th Aug 2026

- Docs only. The brief for your own map behind the stars (`docs/dev/g16-starmap-background-handoff.md`): a map-fixed attachment mode extending the overlay graphic the player preset already has, the GM map brought onto the same type, credit following what is shown.

## v2.1.749-beta - 17th Aug 2026

* VTT integration: discovery now works ACROSS SITES. Chrome partitions BroadcastChannel inside a third-party iframe, so a host on another domain (beta.mappadux.com framing beta.starsystemx.com) could not find the GM tab through /bridge - it passed testing only because localhost dev is one site. /bridge?sid= now discovers over PeerJS (not partitioned) when the host knows the session id, and the GM tab hosts on the broker as soon as a starmap has its persistent id, so that id can actually be dialled. Same-site hosts keep the instant local path.

## v2.1.749-beta - 17th Aug 2026

- **"Subsector hex" is now offered on the GM's own snap grid.** Borders without the numbering -- the option every player view has had since v2.1.378, which the GM's map could not show because its grid list was written out by hand instead of reading the shared one. It reads the shared list now, so the next option added cannot go missing the same way.
- Your saved grid choice carries over untouched, and the player broadcast is unchanged.

## v2.1.748-beta - 17th Aug 2026

- Docs only. The unit-relabel fault and the mobile chrome pass routed to the session with room, both re-checked against the tree; the custom starmap background is unhomed again and says so.

## v2.1.747-beta - 17th Aug 2026

- Docs only. Inbox roster brought up to the wave: the player-view session is reserved for the owner's own bug fixing; the rebuild-storm meters, the hide-all-constructs override and the starmap controller declaration are recorded shipped, with the runtime crash the last one exposed.

## v2.1.746-beta - 17th Aug 2026

- Player-view rebuild storm (P2): the meters can now say WHY a scene rebuild fired, not just how often. Every rebuild carries a reason and lands in an always-on event ring; broadcast messages are counted on the receiving side too; `window.__ssePerf.events()` dumps the lot mid-fault. Instruments only - no behaviour change.

## v2.1.745-beta - 17th Aug 2026

- Quick overrides gains **Hide all artificial constructs (stations, ships)** - one tick and every ship, station and gate drops out of the players' view. It sits with Hide labels and Suspend filter because that is what it is: the thing you reach for mid-scene, not a property of a preset. Unticked by default, and it never comes back on its own after a reload.
- Housekeeping: the 3D view's old look-preset store is deleted. It kept seven starter looks and its own browser storage from before Player Views existed, and nothing had imported any of it for a long time; the one piece still in use - the migration that folds a GM's old saved looks into their campaign - is untouched.

## v2.1.744-beta - 17th Aug 2026

- **A crash on the 3D starmap that four cosmetic type errors had been hiding.** `TAG_PILL_STEM` was used but never imported, so drawing a pin marker with a second line of text would have thrown. It surfaced the moment the noise around it was cleared -- which is exactly what that noise costs.
- The starmap controller's interface now declares everything it actually returns (the two grid dials and the marker options). Nothing changes on screen; the next real error in that file is no longer buried.

## v2.1.743-beta - 17th Aug 2026

- Docs only. Two inbox items found already solved before they were handed out (a pinch-as-tap fix present in code since v2.1.549; Jupiter's giant test now true because an absent makeup is inferred from mass and density), the 3D-starmap grid items re-anchored to their moved files, and undo/redo held until the current sessions land.

## v2.1.742-beta - 17th Aug 2026

- Docs only. Five inbox items routed to the sessions that know their code (the player-view rebuild storm, the icy-moon albedo constant, Mercury's lock flag, and two player-view tidies), each re-checked against the tree before hand-out.

## v2.1.741-beta - 17th Aug 2026

- Docs only. The generation-rebalance brief for a fresh session (`docs/dev/generation-rebalance-handoff.md`): Hill-radius spacing to replace the Solar System's Titius-Bode constants, the slider measurement, and the moon design note — with the finding that the "amount of material" slider is clamped by the nine-slot list it feeds.

## v2.1.740-beta - 17th Aug 2026

- Docs only. The undo/redo brief is written for a fresh session (`docs/dev/g28-undo-redo-handoff.md`); the inbox gains a session roster with every open item routed to the session that knows the code; the brown-dwarf work is verified closed; and the canvas-cannot-render-headless measurement is folded into the standing rule it corrects.

## v2.1.739-beta - 17th Aug 2026

- Docs only. Eight inbox ids that each named two different observations (A51, A52, B60-B64, G24) are untangled — the moved rows are A53, A54, B75-B79 and G29, each carrying its old id — and one finding that had been captured twice (B71) is merged. Three code comments and one physics-page phase tag are repointed to match. No behaviour change.

## v2.1.738-beta - 17th Aug 2026

- FIXED: every real brown dwarf in the bundled maps was flagged as a physically impossible star. The masses were right and the check was wrong — and wrong in a small, findable way: the test for "is this a substellar class" was anchored at the END of the name, so `star/L7.5`, `star/T6` and `star/Y4` — which is how brown dwarfs are actually classed — all failed it. Each was then told it was "a brown dwarf rather than an L7.5 star". All eleven low-mass stars in the Local Neighbourhood now come back clean, including Luhman 16, WISE 0855 and Epsilon Indi B.
- The L, T and Y bands stop pretending mass decides type. A brown dwarf never reaches equilibrium — it cools forever — so its type is a temperature state depending on mass AND age. The shipped map proves it in one line: Epsilon Indi Ba at 67 Jupiter masses and Luhman 16 B at 29 are BOTH T dwarfs. Mass now spans the whole substellar range for all three, temperature does the classifying, and the temperature bands deliberately OVERLAP, because Luhman 16 A is an L7.5 at 1305 K while Epsilon Indi Ba is a T1 at 1312 K and no single boundary can separate them.
- Y extends below 300 K. WISE 0855 at 276 K is the coldest brown dwarf known and was outside its own band at both ends.
- The hydrogen-burning limit is 0.075 solar masses rather than a round 0.08. It moves with composition, and the rounder figure was calling SCR 1845-6357 A — a real M8.5V sitting exactly on the line — impossible.
- A planet-role brown dwarf now stops at the mass a planet could actually have formed at. Core accretion cannot build past about 20 Jupiter masses, so a heavier companion formed by cloud collapse and belongs to the stellar classes — it is a companion rather than a planet, even though it never fuses hydrogen. Below that it classifies on the merits as `planet/brown-dwarf` or, if cold, `planet/ultra-cool-dwarf`.
- FIXED: the classifier's last resort claimed ROCKY for a body whose mass it did not know. `undefined > 10` is false in JavaScript, so anything with a missing mass fell to the terrestrial branch and came back a confident rocky planet however massive it really was — a hand-entered brown dwarf became Earth's cousin. An unknown mass now says `planet/unclassified`, which is the true answer, and only a known mass earns a guess.
- Both fallback sites now share one function, so the class a body carries and the explanation of why can no longer disagree.

## v2.1.735-beta - 16th Aug 2026

- Stefan-Boltzmann is now written once. How bright an object is for a given size and temperature was being worked out in two places — the brown-dwarf cooling track and the star editor — in different unit conventions, in different files. They agreed, but only by the luck of two correct implementations, and those two hand over to each other at the fusion limit: had either drifted, igniting a body would have changed its brightness for no physical reason and nothing would have caught it.
- The alignment is now structural rather than tested. A test pinning that the two agreed has been replaced by there only being one of them.

## v2.1.732-beta - 16th Aug 2026

- FIXED: igniting could make a body DARKER. The substellar cooling track stops dead at the fusion limit — 79.99 Jupiter masses derives 1947 K, 80.00 derives nothing — so a body nudged across that line kept its old brown-dwarf temperature, and with the new colour ramp taking anything under 2400 K toward black it would light up by going out. A fusing star is now held at or above 1900 K, which is where the coolest M dwarfs and the hottest L dwarfs genuinely overlap: crossing the limit is not a brightness cliff in nature and is no longer one here. It only ever raises a star already below the floor, so nothing with a sane temperature moves — no bundled starmap changes at all.
- The other boundary, at 8 Jupiter masses, is left alone deliberately and now says why in a test: the step there is from nothing to 6 parts in a hundred million of a solar luminosity, which is nothing a moon would ever feel. Only the stellar boundary earned a correction.

## v2.1.730-beta - 17th Aug 2026

- FIXED: the highlight selection in Find by tag now survives a reload. It was treated as a momentary nudge and thrown away on refresh, which is wrong for what it actually is - prep, often built up tag by tag before a session. Saved per machine, not into the campaign, so it never travels inside a shared starmap file. The mute is remembered with it.
- The momentary controls beside it - Follow GM, suspend filter, pause orbit, hide labels - deliberately still start clean each launch. Coming back to a suspended filter with nothing saying why is worse than losing it.
- The highlight tray now says what it does: it badges your OWN maps as well as the players'. It always did, and only mentioned the players.

## v2.1.728-beta - 16th Aug 2026

- Hardened a trap introduced with the substellar colour ramp: a star carrying a temperature of zero would have rendered near-black rather than merely the wrong colour, because the old fallback only caught null and undefined. Sol itself stores no temperature, so that default is load-bearing.
- Verified the planet/star handover: inside the substellar mass window a body now looks the same whether it is filed as a planet or as a star. That was the actual fault — the glow depended on the role rather than on the mass.

## v2.1.727-beta - 16th Aug 2026

- FIXED: brown dwarfs rendered as small suns. A T dwarf filed as a star — which is how most of them are filed — never reached the self-luminosity pass at all, because that pass skipped anything with a star role. So it got no glow, and fell through to a stellar colour table whose coldest band was a bright orange handed identically to a 2399 K red dwarf and a 500 K methane dwarf. Epsilon Indi Bb, about as warm as an oven, was drawn as a little star with sunspots.
- Role is no longer the test; MASS is. A brown dwarf is a star and a substellar self-luminous body at the same time — it is the overlap, not one or the other — so the pass now runs over everything and the mass window decides.
- One colour authority: below the fusion floor the stellar table falls through to the substellar ramp, which had the right answer sitting one branch away. The sequence is now continuous through the whole mass range rather than cliff-edged at a role boundary, and that matters because GIANTS radiate too — Jupiter emits about 1.7 times the sunlight it absorbs. At its 124 K the ramp returns near-black, so a giant correctly shows no visible glow without needing a branch of its own.
- Starspots need a fusing photosphere. Below the fusion floor the atmosphere is largely neutral, the magnetic field decouples from it, and an L or T dwarf's variability is CLOUD rather than spots — which is why the artist's impression for one shows bands. Substellar bodies now get their banding and lose the sunspots.

## v2.1.725-beta - 17th Aug 2026

* Remote players on locked-down networks: bring-your-own STUN/TURN relay. Settings (Advanced) takes a list of servers (turns:host:443|user|credential); they are added ahead of the built-in public relay and ride in every player link and QR (?ice=), so a workplace network that blocks UDP can still connect through a TLS relay on 443. The player view now says SENSOR LINK BLOCKED when no direct or relayed path can be made, instead of waiting forever. Nothing changes for tables that never touch the setting.

## v2.1.724-beta - 17th Aug 2026

* Internal: on a phone, background chrome should disappear entirely while a full-screen panel is open, rather than shrinking out of the way.

## v2.1.723-beta - 17th Aug 2026

* Internal: recorded that on a phone the bottom bar and the time controls both cover the import dialog, and that the newer screens need a small-screen pass.

## v2.1.722-beta - 17th Aug 2026

* VTT integration 1B-1D + bridge: the discovery contract a host app uses to find and connect to a campaign. The GM tab now answers REQUEST_HELLO with ANNOUNCE (session id, starmap id and name, Player View names, app version - identity only, never campaign content), honours REQUEST_REMOTE (starts PeerJS hosting, with a notice on the GM screen), and sends a heartbeat every 5 s. Player views turn back to GM OFFLINE when it stops (the LIVE flag used to latch forever) and remote players re-dial a host that restarts or starts hosting late. New /bridge route: a hidden discovery frame for host apps, origin-allowlisted postMessage in both directions, read-only. New ?embed=1 on the player view hides the device chrome and accepts setPreset/ping commands from an allowlisted parent.

## v2.1.719-beta - 17th Aug 2026

- On the GM starmap, a system's name, its depth cue and its tag badges now share one column to the right of the star, name at the top. They used to be placed independently and both to the right of the same point, so a long name and a badge landed on top of each other.
- FIXED: labels drifted away from their star as you zoomed out. The offset was measured from the system's CENTRE and was a constant number of map units, so it grew on screen as the glyphs shrank. It is now measured from the edge of the star glyph itself - including the spread of a multiple star - and is a constant gap at every zoom.
- Star names are a little smaller (11px from 12): at the old size one long name dominated a crowded sector.

## v2.1.715-beta - 17th Aug 2026

- FIXED: your tag colours and names now reach your players' own devices. The vocabulary - which categories exist, what they are called, what colour they are - lived only in the browser it was set in, so a second window on your machine looked right and a player's phone got the shipped defaults. The GM now publishes it with the campaign.
- FIXED: adding or removing a highlight in Find by tag now reaches an open player view straight away. It changed the GM's map instantly and the players' not at all until the window was reopened, because only the Player Views panel's own controls were telling anyone.
- The preset editor gains an **Update** button beside Cancel and Save & close. It saves and keeps the editor open, and an open player view picks the change up on the next sync - so tuning a preset no longer costs a round trip through the modal each time.

## v2.1.712-beta - 17th Aug 2026

- FIXED: a highlighted tag drew a GREY badge with a raw key for a name - "Life on the land" appeared as a grey "land-cover" pill on every map, GM's and players', while the same tag was green everywhere else in the app. Tag colours live in two places and the map was reading the wrong one: the GM-configurable categories, which hold nothing at all for the tags the physics derives. Engine tags now take the colour and the label the rest of the app already gives them, and a category you have recoloured yourself still wins.
- Markers get their own size dial, separate from the body-name size. Names are sized for reading and markers for spotting, and on a busy map those pull in opposite directions.
- A map pin can now carry initials (as before), its full name set to the right of the pin, or no text at all.
- A flag's staff is selectable - silver, gold, white, black, or the tag's own colour - because it has to contrast with your background and no single colour wins on all of them. Silver by default: black vanished against the space backdrop most views use.
- Marker shape and size are now on the Starmap step as well as the System step, editing the same setting, so you can tune the starmap without hopping between steps.
- Starmap names and badges follow the same rule as the system map: on top of a system from far out, and clear of the star's own glow when you come in close.
- Depth exaggeration flattens as well as stretches. True depth is now the MIDDLE of the dial, with twentyfold either way, so you can press a deep map flat.

## v2.1.710-beta - 17th Aug 2026

- The preset editor now shows a TEST MARKER on the preview. Picking chip / pin / flag used to change nothing on screen, because the preview was never given a highlight selection to draw - so a GM chose a marker style blind. It now draws your live selection if you have one, and otherwise a real tag from your own categories, in its real colour, so the shape, colour and size you are choosing are the ones players get. The panel says which of the two you are looking at.
- Markers no longer sit inside the world they mark. The badge stack floated a fixed distance above a body's CENTRE, which is fine for a distant speck and useless on a framed planet - the marker chosen to be seen was drawn on top of the disc. It now clears the body's own apparent radius and tracks it as you zoom, so a pin's point and a flag's foot land on the top edge.
- A flag's staff is black rather than the tag's colour. The colour is the flag's job; a matching staff read as a fat tail on the badge and lost the flag against a bright body.
- Label size goes up to 48px, from 24. Both scenes were already clamping at 40, so the top of the new travel would have moved nothing - the clamps now match the slider exactly.

## v2.1.709-beta - 17th Aug 2026

- The System step of the player-preset editor is regrouped around what you are setting rather than which renderer owns it: Look & feel, Background, Scaling, Camera, then Labels & markers. "Flat / no lighting" becomes a two-option Lighting dropdown directly above Render, where it reads as the choice it is. The Starmap step now follows exactly the same shape, so learning one teaches the other.
- Body size and Spread now default to 80% instead of 100% and 65%. They are the same trade - the left end of each is physical truth - so they are set together.

## v2.1.707-beta - 16th Aug 2026

- FIXED: on the Surface view the sky changed colour across the seam — visibly so on EARTH, which is the one world where the two halves must be identical. The home side carried two hand-picked blues sitting next to a derived one. Home now runs through the same pipeline as everywhere else, so Earth against Earth has no seam, and if it ever gets one again a test says so.
- A ringed world is portrayed WITH its rings on the 3D view. They are separate nodes and the portrait was filtering to "this body and a star", so Saturn was shown bare — the one thing everybody knows about it.
- The 3D portrait draws rings and belts as a band rather than as thousands of individually tumbling rocks. That was a few thousand animated objects in a thumbnail the size of a stamp, which is what made the window judder; the band reads the same at that size and costs nothing.
- Belts and rings show the artist's impression and nothing else. A swarm or a hoop portrayed on its own is the one picture nobody needs.
- The colour chart says what it is for, and the surface view admits what it does not model: distances are a ceiling, because photochemical haze is not in the model and a smoggy world therefore reads clearer than it is.

## v2.1.705-beta - 16th Aug 2026

* Internal: split star tails into the tidal kind, which we can already work out, and the wind-blown kind, which needs data we do not hold.

## v2.1.704-beta - 16th Aug 2026

- Docs: the observations inbox records A42, A47, A48 and E8 as done, with two of their recorded diagnoses corrected, two new findings and one correction to the known-not-ours list.

## v2.1.703-beta - 16th Aug 2026

- The player-preset editor's long steps now collapse. The Starmap and System steps had grown to fifteen and twenty controls in a single box; they are grouped by what you are actually doing - Grid & routes, Depth & camera, Bodies & belts, Scale & camera, Scene & sky, Labels & markers - and each group opens and shuts. On the System step that turns a screen-and-a-half of scrolling into no scrolling at all.
- Which groups you leave open is remembered, per machine, and survives closing and reopening the editor. First run opens the one group per step that carries the choice everything else hangs off, and leaves the rest shut. It is your layout, not the preset's: it never travels to a player's screen.
- The "Colours" panel inside the two document sections now opens and shuts like every other group instead of being a second, different kind of collapsing thing in the same editor.
- Nothing about any control changed - not what it does, not what it is called, not when it appears. This was a layout pass.

## v2.1.702-beta - 16th Aug 2026

- The old **Field Guide** and **Projector** are gone. Player Views does everything they did and does it from one engine, so every look they offered is now a preset you can open, duplicate and edit - the monochrome terminal, the survey datapad, the starship console, The Guide, the holo table and the overhead projection. Two doors to the same room have become one.
- Branding - your campaign's letterhead name and logo - now lives in the Player Views panel, under the share link. It was only reachable from the Field Guide launcher before, and it applies to every view you deploy rather than to one preset.
- Old `/projector` windows and `/catalogue?theme=...` links no longer open. Open the view you want from Player Views and share the link it gives you.
- The release flag that hid Player Views is gone too. It had one branch left, and the instruction written beside it would have hidden the headline feature at the next production cut and brought the two retired tools back.
- REMOVED, said plainly: the Field Guide's "include artificial constructs" switch has no equivalent in Player Views. It had already stopped working the moment a preset was in play, so nothing changes today - but hiding every ship and station from your players in one move is not currently something a preset can do.

## v2.1.701-beta - 16th Aug 2026

- FIXED: a player-view link whose preset no longer exists used to open the old Field Guide instead, without saying so - a different tool, silently, on a screen your players are looking at. It now falls back to the shipped Guide player preset and states plainly which preset was missing, so a stale link is something you can see and fix rather than something you notice weeks later. The message waits until the campaign has actually arrived before it appears, so a window that is merely still connecting is never accused of being broken.

## v2.1.696-beta - 16th Aug 2026

- A giant reads as "K III" in the star editor rather than "K-III". The hyphen is how the key is spelled in the data; it is not how anyone says it.

## v2.1.695-beta - 16th Aug 2026

- FIXED: habitability was scored against the temperature a world RADIATES at rather than the one on its ground, and for an airless world those are not the same number. The Moon averages -59 C and was being scored as though it sat at -3; Mercury averages 37 C and was scored at 167. Landing budgets read the same wrong figure under a field called surface temperature.

## v2.1.694-beta - 16th Aug 2026

- The star editor says what a star currently IS, under the type dropdown, and that it follows the numbers. A planet has an auto-classify switch and a star deliberately has none - a planet's type is a judgement about the parameters you authored, a star's designation is a readout of where it sits on the HR diagram - and the difference now says so rather than looking like a missing control.

## v2.1.693-beta - 16th Aug 2026

- Stars now say what they ARE, not what range they were drawn from. A star used to be filed as "a G" - the same label the picker uses for the whole G band - and is now a G2V, a M6V, a K1V. Bare letters stay as the ranges a pick draws from, which is what they are good for; nothing in a campaign is labelled with one any more.
- Every star in a saved campaign is upgraded on load. A star you PICKED and left alone keeps the letter you chose and gains the digit its own temperature states - your K stays a K - while a star the engine made is read off its position on the HR diagram, which is what its designation has always been a readout of.
- The bundled starmaps carry each real star's own catalogue designation, which is measured rather than derived: Proxima is M5.5V, Wolf 359 M6.5V, Betelgeuse M1Ia.
- FIXED: a supergiant asked for its numbers or its portrait by full designation got the DWARF band of the same letter - a 10-solar-radius star handed a 1-radius template, and red dwarf art on a red supergiant.

## v2.1.692-beta - 16th Aug 2026

- FIXED: the Sun was labelled G3V. There were two ways of working out the digit in a designation and they disagreed - one divided each spectral letter into ten equal temperature steps, which the real sequence is not, and it was the one the generation wizard displayed. Both are now the anchored version, which gets ten of twelve published stars exactly right. Vega reads A0V rather than A1V, Proxima M5 rather than M4.
- A giant still gets its letter and its class with no digit at all, deliberately: the ladder is main-sequence, and applying it to Arcturus puts it four subclasses out. Better to say "K giant" than a confident wrong number.

## v2.1.690-beta - 16th Aug 2026

- FIXED: the dust-storm figure read the same as the everyday one, which says a storm makes no difference. Both were clamping to the horizon. Two causes: the storm load was a multiplier on the baseline rather than a storm's own measured depth — Opportunity read an optical depth near 10.8 in the 2018 global storm, so a severe one is anchored there — and suspended dust is now spread over half the gas scale height, because aerosols settle rather than filling the column. The line only appears at all when it differs from the clear-air figure. Mars: 3.4 km normally, 2.4 km with a storm up.
- FIXED: the sky came out too dark and heavy, Mars worst of all. Its brightness was being scaled down by the fraction of light it scatters — but that colour is already the material's LIT appearance, and the ground only returns about a fifth of what lands on it while the sky passes on the whole fraction it scatters. A dusty sky is therefore BRIGHTER than the dust it is made of, not a third of it. Mars goes from a dark brown to butterscotch.

## v2.1.687-beta - 16th Aug 2026

- A star built in the editor or rolled by generation now knows its full designation - the 2 in G2V, not just the G. It was already read and written correctly for stars imported from the real sky; what was missing was the one step that says which digit a temperature deserves, so two thirds of the stars in a campaign could not state one. Anchored on the measured main-sequence temperatures rather than by cutting each letter into ten equal slices, because the real sequence is uneven: G0 to G2 is 160 degrees and K5 to K7 is 340.
- Dragging a star's temperature now updates its subclass with it, instead of dropping the digit and keeping only the letter.

## v2.1.686-beta - 16th Aug 2026

- Picking a spectral type in the star editor now draws a star from that class's range instead of handing back the exact middle of it every time, so two G dwarfs in a campaign are two different G dwarfs rather than the same numbers twice. The draw is seeded from the star itself, so re-opening the panel never rerolls it under you, and it is the same draw system generation has always made - a hand-placed G2V and a generated one are now the same kind of object.

## v2.1.685-beta - 16th Aug 2026

- FIXED: the Moon's noon read 209 C and its night -214 C, against a measured 120 and -173. Day and night now come from the energy balance and the mean is what they average to, rather than a symmetric swing hung off a figure that was never a mean. The sunlit side gets the ceiling it never had - no surface can pass the temperature at which the ground alone re-radiates the light falling straight down on it - and the night side is held up by the heat the ground stored during the day instead of falling through its floor. The Moon now reads 111 C noon, -165 C night, and an average of 214 K where Diviner measures about 215.
- An equilibrium temperature balances POWER, and power goes as the fourth power of temperature - so a world that bakes by day and freezes by night gives off as much as a uniformly warm one while AVERAGING far below it. That is why the Moon radiates at 270 K and averages 214, and both figures are now on screen, each named for what it is.
- Rotation moved to where it belongs. It used to scale the size of the swing and clamped, so Ganymede and Callisto came out identical to the kelvin despite one having a day twice as long; they now differ, and both land within 5 K of measurement. Slow rotators freeze harder, cold worlds barely swing at all, and Pluto, Triton and Titan come out very nearly uniform - which is correct, and which the old model could not express.
- The sun rises on Mercury. Its captured 3:2 resonance was being drawn as a permanently lit face and a permanently dark one; it now reads as a day/night cycle 176 days long, with a 421 C noon at perihelion against a measured 427.
- Venus does not move by a single kelvin, and that is the point: 92 bar of atmosphere evens the swing out completely, so the world with no day/night difference still has none.
- FIXED: a world's radiation reading was labelled "Incoming Star Flux" when it had not been only starlight since the trapped-belt model landed. Io reads 26,279 times Earth's flux there and 0.037 times Earth's sunlight, because what dominates Io is Jupiter's magnetosphere. Both figures are now published, named apart, and shown side by side in the Newton panel - and the classifier is given the starlight, which is what every rule about irradiation ever meant.

## v2.1.682-beta - 16th Aug 2026

- FIXED: space weathering modelled a rate where the physics is an accumulation. The irradiation dose says how hard a surface is being hit; maturity is what has built up, which is dose times TIME. Taking the rate alone said a freshly resurfaced world was as weathered as one that had sat there for four billion years — backwards from the reason fresh crater rays are bright. Io and Europa are now unweathered, as young surfaces should be, while Luna and Mercury still saturate.
- FIXED: every belt and ring in the catalogue came back a third space-weathered, from fallback defaults applied to bodies that carry neither of the tags it reads. A world we know nothing about is unmeasured, not half-weathered — and a belt is a population, not a surface, so it is out of scope entirely.
- Belts and rings drop the views that cannot mean anything for them. There is no ground to draw, no daylight to stand in and no horizon to see to, so they keep the artist's impression and a 3D view — and a ring is now drawn WITH its host, since a hoop on its own is the one picture nobody needs.

## v2.1.680-beta - 16th Aug 2026

- FIXED: Mercury and Mars had Earth's blue overhead. The Surface view worked out what COLOUR the scattered light is but never how MUCH of it there is, and the colour step normalises — so an exosphere of a hundred-billionth of a bar returned a fully saturated blue sky. A sky's brightness is the share of the beam it scatters, so Mercury, Luna, Io and Europa are now black with stars at noon, and whether stars come out is that rather than a pressure test.
- Mars gets a butterscotch sky, and from the right cause: suspended dust is the ground, airborne, so it lends the sky the ground's own colour rather than a scattering law's. Six millibars of carbon dioxide on its own would give a very dark blue, and the salmon everyone pictures is the dust. Nothing new is authored for it — it is the surface material.
- FIXED: the Sun went missing on Venus, including on the "at home" side of the wipe, which is the side meant to look familiar. Cloud does not delete a sun, it spreads it: under a thick deck you cannot find a disc but you can always tell which way it is. Thick weather now turns the disc into a glare patch rather than removing it.
- The star is drawn at its real angular size and its real colour. Size needs no new data — flux is R²σT⁴/d², so the angular radius works out as √(F/σ)/T² and the star's own radius cancels. Mercury's sun is two and a half times ours across, Jupiter's a fifth, Neptune's a thirtieth. Its colour is the direct beam as it arrives, so it reddens with the sky it is seen through.
- Suspended-dust load is anchored on the only world anyone can check it against: Mars's background dust opacity sits near 0.3-0.7 in the visible even when nothing is happening.

## v2.1.676-beta - 16th Aug 2026

- FIXED: Luna's colour chip was brown while its 2D and 3D views were correctly grey. Space weathering — the nanophase iron a vacuum-exposed surface accumulates, which mutes its mineral colour — was only ever applied by the texture renderers, downstream of the value everything else reads. It is a property of the SURFACE, not of one picture of it, so it now happens once on the apparent colour and everything agrees. Luna goes from #9f7856 to #867d78, Mercury greys, Mars keeps its red because that is rust and not weathering, and the icy moons are exempt because an icy crust anneals rather than accumulating iron.
- The renderers no longer grey a second time on top of that, which would have counted the same iron twice.
- Both surface processes are now written up on the physics page, next to the colour they produce.
- The Surface view's canvases declare that they are read back every frame, which clears a console warning and stops the browser shuttling the surface to the GPU and back on every drag.

## v2.1.675-beta - 16th Aug 2026

* Player views now lead the what’s-new list, described as what they are — text, 2D or 3D, themed to your setting — and the surface Horizon view gets a line of its own.

## v2.1.674-beta - 16th Aug 2026

- FIXED, and it is the big one: **scattered light is not absorbed light**. The sky model treated every photon turned out of the direct beam as destroyed, which costs almost nothing at Earth's optical depth of 0.1 and is catastrophic at Venus's 16 — it said one part in ten million reached the ground, and reported Venus's midday as "a night under a full moon". A photon that scatters is still in the atmosphere and mostly still arrives. Scattering now gets its own two-stream transmittance, so Venus's midday reads 13% of an Earth noon, which is about what Venera measured standing on it, while Earth, Mars and Luna do not move at all.
- FIXED: the Surface view gave every world with an atmosphere a blue sky, because it only ever computed clear-air scattering and nothing was allowed to overrule it. An overcast sky is the lit underside of a cloud, not the air above it — so Jupiter, at 90% ammonia cover, was being shown the sky of the clear hydrogen over the deck. Sky colour is now mixed between the two by how much of it is cloud.
- FIXED: "midday brightness" dimmed the ground and left the sky in broad daylight. The sky is scattered sunlight and dims with it. It still comes out brighter than the ground, for the right reason — the ground only returns a fraction of what lands on it, while the sky is the source.
- FIXED: the star was drawn as a disc on worlds where you could not possibly see it. Nobody standing on Venus has ever seen the Sun; 92 bar of overcast is a uniformly bright sky with no disc in it. The star now fades out behind its own weather.
- Dust storms now close the sky they should. Mars's gas alone says you can see 41,000 km; with dust it is 38 km, and 3.4 km while a storm is up.
- Clearer wording on the visibility line: it now says which limit you are actually up against — the air, or the horizon.
- Fog is honestly reported as not modelled rather than half-modelled. Telling fog from cloud needs the deck's base pressure, which is computed and then dropped before any consumer sees it.

## v2.1.673-beta - 16th Aug 2026

- Housekeeping: renumbered this session's entries to the versions they actually shipped as, after a parallel session took 666 and 667.
- FIXED: on a world reading "a night under a full moon", two colours could still be reported as "as distinguishable as at home". How much light there is and what the light is made of are separate questions, and only the second was being asked. Colour discrimination now fades with the light, on the same curve the picture itself dims by, so the figures and the image cannot disagree.

## v2.1.672-beta - 16th Aug 2026

- Regenerated the derived fixture so it records each palette stop's authored material colour alongside its appearance.

## v2.1.671-beta - 16th Aug 2026

- Docs: a new physics section, "Standing on it", covering the three things that follow from the surface spectrum — how bright a world's midday is, why a bounded eye is the honest one, and how far you can see. It states what the model does NOT do as plainly as what it does: no aerosols, so every visibility figure is a ceiling.
- Engine map: PHY-17 (adaptation is bounded per cone), PHY-18 (visibility is the surface spectrum's optical depth turned on its side — derive it once), RENDER-B4 (a reflectance is re-lit and light is not).

## v2.1.670-beta - 16th Aug 2026

- The Horizon view is now the **Surface view**, and it is a view of THAT WORLD rather than a stock Earth. Its ground is the world's own rock, its sky is the colour its own air scatters, its sea appears only if it has one, and its life is drawn in the pigments its morphologies actually settled on — every layer of them, since a world's mats and its canopy often choose differently.
- The ground is shaped by the tags the engine already committed to. An ancient surface nothing has resurfaced keeps every crater it took; plate tectonics gives it sharp folded peaks; tidal volcanism gives it cones and lava that glows; ice worlds bank ice against the far ground; a dust-storm world gets dunes. Nothing here is a new judgement about the world — it is the old ones spent rather than repeated.
- Anything that lights up at night now puts a settlement on the skyline with lit windows. The windows make their own light, so they do not change across the wipe while everything around them does — which is exactly what a lamp does.
- Depth markers stand at known distances, each veiled by the air between you and it. Far enough out they are simply gone, at exactly the range the visibility figure quotes: the picture and the number cannot disagree, because they come from the same extinction.
- A spectrum band runs up each edge — home on the left, this world on the right. Venus's goes black below 550 nm, and that black stripe is the whole explanation for why a blue wire down there is a dark grey one.
- An airless world gets what it should: hard black sky, stars at noon, and its genuine surface colour under a bare star.
- The sky and the star are painted directly rather than re-lit, and lava and lit windows with them. Only reflectances go through the re-lighting, which is the difference between "the same surfaces under a different sun" and lighting everything twice. The palette now carries each stop's authored material colour alongside its appearance so the scene can tell them apart.

## v2.1.669-beta - 16th Aug 2026

- NEW: how far you can see, in metres. Occluded sight lines are where the plot is — "the air is thick" is scenery, but "you can see forty metres and your torch reaches twelve" decides whether the thing in the murk gets a surprise round. Every world now works out its visual range, its horizon, and how far a hand torch, headlights and a floodlight actually reach.
- It is the same optical depth the surface spectrum already computes, turned on its side: a sky is dim overhead and a horizon is lost for one reason. Nothing about visibility is derived twice. Earth comes out at its clean-air limit of 343 km — the textbook figure, and the reason distant mountains go blue instead of vanishing — while Venus is 4 km of murk from sheer weight of air, its clouds being ninety bar over your head rather than around your knees.
- A lamp is eaten TWICE, out to the target and back to the eye, which is why lights are so much less use in murk than people expect. Headlights that throw 720 m on Earth manage 580 m on Venus and about 30 m in fog.
- NEW tag: `visibility/hazy|murky|thick|blind`, carrying the range as its value. Only ever present when the air actually gets in the way, so the tag's presence means occlusion — a clear sky and an airless rock are both "nothing between you and it", and tagging every world with that would be clutter. In Sol only Venus earns one.
- The wipe between home and there is now a handle you drag ON the picture, rather than a slider underneath it. That is the gesture everyone already knows, and it gives the row of controls back to the things that cannot be done by dragging.
- The body panel's view switch is icons rather than words — five labels ate most of the top of the box. Titles and labels are unchanged for anyone who needs the words.

## v2.1.668-beta - 16th Aug 2026

- FIXED: standing on Venus, everything looked pink. The eye-adaptation model was unbounded — it assumed your eyes can discount any light however little of it there is. Venus's sky leaves the blue cones half a percent of the light they get at home, and the maths answered that by amplifying them 134 times, which does not recover the colour, it recovers the noise. A white card came back pink and a blue wire came back violet. Adaptation is now limited per channel by how much light that channel actually has, the way a low-pressure sodium street lamp leaves the world orange-grey rather than colour-corrected. Venus now reads as Venera photographed it: a deep orange world where blues go dark rust.
- NEW: a "midday brightness" switch on the colour and horizon views, alongside "once your eyes adjust". The two are different questions — what colour the light is, and how much of it there is — and only the second one tells you the world is dark.
- NEW: every world now states its midday light level against an Earth noon, in words as well as a figure. Venus is 1.6% of an Earth noon, which is heavy overcast, and it is dark for a reason worth knowing: a fifth of the star's energy reaches the ground there, but it arrives peaking at 920 nm, so almost none of the VISIBLE light does.
- Colour drains toward grey below about a thousandth of an Earth noon, because rods carry no colour — a moonlit world is grey however long you look at it. Above that, dim is not the same as grey and it is no longer drawn as though it were.
- The colour and horizon views inside the body panel drop the explanation and link to the physics page instead. That panel is a tool, not a lesson.

## v2.1.665-beta - 16th Aug 2026

- FIXED, properly this time: Venus was still pink on the drawn disc. The previous fix corrected the single flattened swatch a world is summarised by, but the 2D and 3D renderers do not use that — they paint the ground from the palette and veil it with the cloud, and nothing told them the sky was opaque. How visible a world's ground is now travels with the palette, so the renderers know too. Venus is a featureless pale ball, as it is.

## v2.1.664-beta - 16th Aug 2026

- The body panel's Colours view is now the colour chart under that world's own daylight, rather than a list of the swatches the world is made of. The old one answered a question nobody was asking; this one answers the question a GM actually has — what does a familiar colour look like down there.
- Horizon is the landscape, Colours is the chart, and picking between them is the view switch itself, so the viewer no longer carries a dropdown that repeats it. That is the space the pair needed to fit.
- The view switch moved to the top right. At the top left it sat directly on the viewer's own controls and hid them behind its own buttons.

## v2.1.663-beta - 16th Aug 2026

- FIXED: Venus had gone pink. Its ground was being lit by the light that reaches the ground, correctly, while its clouds kept their Earth-daylight colour — and cream cloud over deep-red rock is pink. Cloud tops and haze are lit by the light ABOVE the weather now, because the cloud is most of what did the filtering; lighting it with the surface spectrum was lighting it with light that only exists underneath it.
- And you can no longer see through a sky that nothing gets through. How much of a world's ground is visible from orbit now follows from how much light reaches it — a 92-bar overcast that passes two per cent of the light shows you its clouds and nothing else, which is why nobody has ever photographed Venus's surface from space. Thin skies are unaffected.

## v2.1.662-beta - 16th Aug 2026

- FIXED: the body panel's 2D view showed a plain coloured circle instead of the real render. It was asking for the lightweight by-type disc rather than the full one the render gallery draws — texture, surface features and terminator.
- FIXED: the view switch is an overlay, and the Colours and Horizon panes were drawing underneath it. They now clear it, and the colour swatches lay out as a grid so every label has room instead of running off the edge.
- A world's picture now leads its panel, the way a construct's does. It stopped being decoration when it gained the derived views.
- The picture sits in a fixed 4:3 box, so the panel no longer jumps as you switch between a tall artist's impression, a square render and a wide chart. Pictures overzoom to fill it — a slightly cropped planet reads better than a panel that resizes under the cursor.

## v2.1.661-beta - 16th Aug 2026

- The "from inside" view now has just two controls, because two things decide a colour: the star's colour, and the sky. Luminosity and distance are gone from it — they change how BRIGHT a world is, which matters enormously to a pigment deciding whether it can afford to be choosy and hardly at all to what a wire looks like.
- It also starts somewhere that shows something. Defaulting to a Sun-like star behind Earth's air was defaulting to home, where by construction nothing moves — which is why it looked as though the tool did nothing.
- More skies to pick from, including a sulphurous one. The sky is usually the bigger of the two effects: a star shifts everything together and your eyes largely follow it, but an atmosphere takes specific bands away and nothing gives them back.
- The star slider names the colour it is on — ember red through to blue-white — and the sky says what fraction of the light actually reaches the ground, which is the honest companion to any claim about colour.

## v2.1.660-beta - 16th Aug 2026

- NEW: "what it looks like from inside". A familiar colour chart and a row of wires, with a world's own daylight applied to one half and a slider to wipe between home and there. It is the honest answer to a question that comes up at a table more often than it should — can they tell which wire is the red one?
- Underneath it, how confusable each pair actually becomes, quoted against home so it reads "66% as distinct" rather than as an abstract number. Measured AFTER your eyes adjust, which is the fair test: a cast is something a person gets used to within the hour, but two colours the light cannot separate stay inseparable however long they stand there.
- On /physics it follows the star and sky you set in the explorer above it, so you can drag a G star down to an M dwarf and watch the blues go. On a world's Bio tab it uses that world's own light.
- The GM's picture of a world gains a view switch, top-left: the artist's impression for its type, the 2D disc, a spinnable 3D globe, its colour swatches, and the horizon view under its own daylight. The 2D/3D switching is the same one the player document already uses rather than a second copy of it.
- FIXED on the way: a saturated colour came back washed out even under our own Sun. Turning a colour back into a spectrum needs the basis curves to SUBTRACT from one another, and they were being held non-negative — so a red kept the green its own broad curve was spilling.

## v2.1.658-beta - 16th Aug 2026

- FIXED: the colour ribbon under a spectrum plot showed bright cyan in the ultraviolet and mint green in the infrared — colour where the eye has none. Each wavelength was being scaled to full brightness on its own, which amplified numerical noise in the tails. It now fades to black at both ends, which is the honest edge of your own vision.
- Rule-pack edits are saved as the DIFFERENCE, not as a copy of the list. Retint one morphology and that is what your campaign stores — about 450 bytes rather than 4.5 kB. It matters for more than size: a whole copy would freeze the shipped defaults at the moment of the edit, and every later improvement to them would silently stop reaching that campaign.
- An editor you have already used opens on what you actually have — the pack's list with your changes laid over it — so saving again never wipes what you did not re-type.
- An override that says nothing is now removed rather than stored empty.
- /physics explains how to read the plots, what the ribbon means, and that the ground and the seas are coloured by the same spectrum as the life. The Newton panel says the same beside its own diagrams.
- Both surfaces are honest about what is NOT through the spectral path yet: the atmospheric haze, the cloud decks, a giant's chemistry and the glow of a very hot world.

## v2.1.657-beta - 16th Aug 2026

- A world's LAND and its SEAS are now coloured by the light that actually reaches them. Their authored colours become reflectance curves and the real arriving spectrum is filtered through them, so a world under a red dwarf reddens because of what its star and its sky left rather than because two colour values were multiplied together. The reference gallery's "same Earth under different stars" row finally shows a real progression.
- The Newton panel DRAWS the spectrum now instead of describing it: the star's light and the light at the ground on one plot, with the gap between them being the sky and the notches being the bands its gases ate. Underneath, what its own pigment takes out of that light, and a swatch for every pigment that would have worked.
- Every morphology's colour is shown there too, with the pigment each one settled on.

## v2.1.656-beta - 16th Aug 2026

- FIXED: the Biosphere data block printed `[object Object]` for its morphologies. It was reading the raw field, which now carries a morphology AND its land cover rather than a bare name.
- Each morphology now draws ITS OWN pigment. A world's microbial mats and its plants are separate lineages that made the choice separately, so forcing them to agree threw away the point of scoring a whole viable set. Picking one on the Bio tab pins the layer that picker names and leaves the others their own answer.
- Any layer's colour can now be set by hand, with a picker on the swatch. It matters most for a biosphere that does not photosynthesise: with no pigment there is no star colour to take, the model correctly has nothing to say, and somebody has to. An authored colour wins outright rather than being blended with a guess.
- FIXED: a summer hemisphere lost its ice cap entirely. The latitude profile is an annual MEAN, and adding the summer swing on top of it then asked "is the warmest moment above freezing?" — for Earth's pole the answer is yes, so the model deleted the Arctic. A summer hemisphere now shows its PERMANENT cap and a winter one its seasonal extent, which are two different and both honest quantities.
- Ice caps read better: a firmer edge, and sea ice reaching further from the pole than land ice, because open water freezes at its own surface while a coast waits for snow to lie.
- The 3D gallery lights its night-side row from the side, so a city's glow has a terminator to be seen across.
- `biodiversity/pigment-viable` is gone. Several pigments always work and saying so six times per living world was clutter; the Bio tab's picker lists them.

## v2.1.654-beta - 16th Aug 2026

- Pigments are now managed like liquids and gases: Settings -> Planets -> Biospheres edits their absorption bands, how broadly they absorb, and the weights that decide between them. Add your own and it joins the scoring immediately — there is no list of pigments anywhere in the code.
- The pigment editor previews as you type. Drag the preview star, edit a band centre, and the swatch and the spectrum plot move with it, because they run the same scoring the engine does.
- You can now PICK a world's pigment on the Bio tab, from that world's own viable set. It is an ordinary dropdown with no warning attached, because choosing between outcomes the model already calls viable is choosing a history, not correcting a physics. Leave it alone and the engine's draw stands.
- /physics explains why a world offers the colours it offers, and why picking one is a free choice.
- A technological world now genuinely reads as built where it has built: the day-side surface stops looking like ocean once the ocean has been roofed.

## v2.1.653-beta - 16th Aug 2026

- Continents. Land, sea, ice and life are now thresholds of ONE elevation field per world, so a world has one geography instead of three separate scatters that disagreed with each other.
- Coastlines are domain-warped fractal noise rather than overlapping circles: peninsulas, inlets, island arcs and bays. Surface textures are 2.7x the resolution to show them.
- The 2D disc and the 3D globe now draw the SAME continents, because the field lives on the sphere rather than being rolled per projection.
- Plant life grows from the COAST INWARDS, which is where life reaches land and where it holds on longest. Raising the coverage widens the band toward the interior; past 100% of the dry land it spills into the water, and the slider goes that far with a tick where the land runs out.
- How far past ordinary dry ground a morphology can hold is now a number in its definition, and it governs the ice caps as well as the sea — whatever roofs an ocean is not stopped by a glacier. Plants stop at the sunlit shelf; a city has poles like everywhere else. "Only technology takes the seas and the caps" is therefore data, not a rule about technology anywhere in the code.
- The Bio tab shows both figures side by side — the share of the LAND you are setting, and what that is as a share of the whole globe, which is what you would see from orbit.
- The single global Coverage slider is gone from the Bio tab. With a coverage per morphology it was a second answer to the same question sitting right above the sliders that actually drive the render; moving it did nothing. Saved campaigns still use the stored value to scale their old morphology list on first open.
- Every morphology in the stack is painted now, in order, rather than only the topmost — so the hierarchy is visible and reordering rows does something.
- Ice caps follow the world instead of being flat ellipses: a ragged edge, reaching further down high ground, thick and bright on land but thin and blue over sea — and the two caps are DIFFERENT SIZES, because the hemispheres are not in the same season.
- The cap edge is now the latitude at which that world's own liquid freezes, derived, rather than a fixed fraction of the disc.
- Technological life reads as what it EMITS: a grey-brown urban haze by day and a network of light by night, spreading from the coasts exactly as plant cover does. How BRIGHT it burns is separate from how far it spreads, which is why a world can be a quarter occupied and still look dark — about a quarter of Earth's surface is held or worked by people, and a few per cent of it is lit. Take the same settlement out over the sea and it becomes `biodiversity/ecumenopolis`.
- New tags: `biodiversity/settled` and `biodiversity/ecumenopolis`.
- A world settled past 75% now CLASSIFIES as an ecumenopolis and takes that type's picture. The rule pack already carried the picture and nothing could ever emit the type; it can now, keyed on how settled a world is rather than on any named morphology.
- Four new rows in the reference galleries showing coverage, pigment, the painter's hierarchy and the night side. They run the engine, so they cannot go stale.

## v2.1.652-beta - 16th Aug 2026

- Biospheres. A world's life now has a look, and it is derived rather than dialled in.
- Every world with a star gets a SURFACE SPECTRUM: the star's own light, filtered by Rayleigh scattering, each gas's absorption bands and any cloud deck, so what reaches the ground is not what left the star.
- Photosynthetic life is scored against that light. Several pigments usually work, so the engine keeps the ranked set and DRAWS the dominant, seeded on the body — a similar world next door can legitimately grow a different colour, and the same world always gives the same answer.
- Vegetation colour is what a pigment fails to absorb, projected through the human eye at the very last step. Never the other way round.
- Settings -> Planets -> Biospheres: one editable record per morphology — its default land cover, its own tints, how far its colour follows the pigment, its opacity and its night-side lights. The ORDER is the hierarchy. Adding a sixth kind is a row, not code.
- The Bio tab gains a coverage slider per morphology, reorderable, plus what the engine derived: the dominant pigment, what else was viable, how much of the land shows life and the latitudes it clusters at.
- Where life sits is derived from where that biosphere's OWN solvent stays liquid, so the poles empty out on an Earth-like world and the equator does on a hot one, with no rule about either.
- New tags: `biodiversity/pigment`, `biodiversity/pigment-viable` and `biodiversity/land-cover`.
- /physics gains two sections with live diagrams — build a star and a sky and watch which pigments its light favours, and stack the morphologies to see the painter's order.
- Gas data gains Rayleigh cross-sections and absorption bands, both editable.

## v2.1.646-beta - 16th Aug 2026

* The welcome panel now lists the star overhaul: type read from where a star sits rather than how bright it looks, brightness derived so it cannot drift, magnetism driving the radiation that strips atmospheres, and implausible stars kept and labelled rather than refused.
* Getting Started gains a section on stars — what a designation means, why the type follows what you edit, and why brightness and ionising output are two different figures.
* The classification guide now says plainly that stars are classified differently from planets: by position on the temperature/size diagram rather than by the fingerprint system, which is planets only.

## v2.1.645-beta - 16th Aug 2026

* Star editor: when a star's ionising output stops rising, it now says why. Past a point the magnetic dynamo stops responding and output holds at about a thousandth of the star's own brightness — a real ceiling that real stars do not cross. The magnetic field slider marks where that happens, so the remaining travel is visibly doing nothing rather than appearing broken.

## v2.1.644-beta - 16th Aug 2026

* Star editor: brightness, ionising output and magnetic field now sit together as one group, reading top to bottom as cause and effect. The field is the only one you set; the other two follow from it.
* Star editor: the ionising output keeps its typical/flaring gauge but is no longer a control — drag the magnetic field and watch the marker walk out of the green typical band into the orange flaring one. Two controls for one quantity became one.
* Star editor: raising a star's magnetic field well above what is normal for its type now makes it flare, since flaring is the magnetic dynamo and the field is what that dynamo produces.

## v2.1.643-beta - 16th Aug 2026

* Generation wizard: a star clicked on the HR diagram now reads as a full designation — G3V rather than G-type — with the subclass worked out from its temperature.
* Giants and supergiants deliberately show no subclass. The temperature that means "K1.5" for a dwarf means something else for a giant, so stating a number there would be confidently wrong; "K III" is both honest and how people actually talk about them.

## v2.1.642-beta - 16th Aug 2026

* Star editor: the magnetic field slider now shows what it does — the star's ionising output, in multiples of the Sun's, updating as you drag. Field is what drives that radiation, so it is the one control rather than two saying the same thing differently.

## v2.1.640-beta - 16th Aug 2026

* Internal: removed a dead atmosphere-retention check. It worked out whether a body kept its air and then threw the answer away — nothing had read it since the real escape model landed.

## v2.1.639-beta - 16th Aug 2026

* Physics page: a new section on ionising output and the corona — why a star's brightness and the radiation that strips atmospheres are different numbers, and why a red giant is not the fierce X-ray source its size suggests.
* Star editor: a star past the coronal dividing line now says so, and only such a star does. Editing an ordinary dwarf never shows the note.
* Generation wizard: the a/b/c labels are lowercase and quiet, so they no longer read as the star's type, and the pairing diagram matches. The designation itself is what stands out now.

## v2.1.638-beta - 16th Aug 2026

* Star systems: a star's ionising output now follows its magnetic field, which is what actually drives it — X-ray output tracks total magnetic flux across about twelve orders of magnitude in the real relation.
* Star systems: cool giants no longer come out as fierce X-ray sources. Past a certain point a swollen, cool star stops sustaining a hot corona at all and runs a cool wind instead — Betelgeuse has no detected X-ray corona whatsoever. An active red dwarf now correctly out-irradiates a red giant despite being ten thousand times dimmer.

## v2.1.637-beta - 16th Aug 2026

* Star systems: the classifier no longer calls bright main-sequence stars giants. Vega came back a giant, and every O and B dwarf a supergiant, because the test was how BRIGHT a star is — but a hot dwarf is genuinely brilliant. It now asks how BIG the star is for its temperature, which is what a luminosity class actually measures. All ten reference stars are correct where five were wrong.
* Generation wizard: the star list now shows the full designation — "G V" rather than "G-type" — with the plain-English reading on hover. Clicking a point on the HR diagram and reading its class back now agree.

## v2.1.636-beta - 16th Aug 2026

* Internal: answered where planet spacing and moon generation stand, and proposed replacing the Solar-System-shaped spacing rule with one that scales to any star.

## v2.1.635-beta - 16th Aug 2026

* Star editor: dragging the effective temperature now moves the spectral type dropdown with it. It was re-deriving the class correctly all along — the control just never showed it.
* Star systems: a moon of a self-luminous brown dwarf is now counted as irradiated when working out whether it keeps its atmosphere. Two copies of the same sum disagreed about what counts as a light source.
* Internal: documented the three ways a body irradiates its neighbours — brightness, ionising output and trapped-particle belts — and that they have separate sources and must not be swapped. A gas giant irradiates its moons with no brightness at all.

## v2.1.634-beta - 16th Aug 2026

* Star editor: brightness and ionising output now sit either side of a lock. Locked, ionising output follows brightness — raise the star's size or heat and it rises with them. Unlock it to set a star's ionising output deliberately, without pretending it got brighter.
* Star editor: the ionising slider shows two bands — where a star of this kind normally sits, and where the flaring version of the same star sits — so the relationship is visible rather than described.
* Star editor: ionising output is shown in multiples of the Sun's, and is capped at the observed saturation ceiling, which real stars do not exceed.
* Star generation: generated stars now carry an individual spread in magnetic activity, so a population spans the real range instead of every star of one type and age being identical. Existing and imported stars are untouched.

## v2.1.633-beta - 16th Aug 2026

* Star systems: found why planets never generate close to small, dim stars - the spacing rule uses the Solar System’s own distances for every star.

## v2.1.632-beta - 16th Aug 2026

* Star editor: brightness and magnetic activity are now two separate controls, because they are two different things. A star can flare violently with almost no change in brightness, so making one dangerous no longer means pretending it got brighter. Take a red giant up in activity and it flares.
* Star editor: brightness is now shown as Luminosity and is worked out from radius and temperature — change either to change it. It was labelled "Ionising Radiation Level", which it never was.
* Star editor: the spectral list names famous examples again — the Sun, Sirius A, Arcturus, Betelgeuse, Rigel — and a flaring star is described as one.
* Star editor: picking a spectral type now re-derives the star's brightness for that type instead of keeping the previous one.
* Star systems: the "physically implausible" tags are red, are recognised as engine-derived rather than something you typed, and no longer risk being stripped when a campaign is loaded.

## v2.1.631-beta - 15th Aug 2026

* Star editor: a star whose numbers contradict physics is now KEPT and explained rather than silently wrong. Drag a B-type star's mass down to 0.01 suns and you get it, tagged "Physically implausible: no-fusion" — because at that mass it cannot fuse anything at all. The tag names which law is broken, never just "invalid".
* Six laws are checked: below deuterium burning, below hydrogen burning, far outside the mass range of the class it claims, a brightness that disagrees with its own size and temperature, past the Eddington limit, and a neutron star too heavy to hold itself up.
* The engine still refuses to GENERATE such a star. This is only about what it accepts from you.

## v2.1.630-beta - 15th Aug 2026

* Star editor: the spectral type list now names the luminosity class — "G V — Main-sequence dwarf (yellow)", "K III — Giant star (orange)", "M I — Luminous supergiant (red)" — so it is clear which entry is which. The old labels carried it implicitly and told nobody.
* Internal: removed two generation-time flare tags that were decided by a star's brightness. Flaring is decided by class and age, which is why a young red dwarf flares and an old one does not, and the main processing pass already worked that out and overwrote both.

## v2.1.629-beta - 15th Aug 2026

* Star editor: the spectral picker now explains what a designation means in plain words underneath it — "Main-sequence dwarf, yellow to human eyes, about the size of the Sun" — and every entry in the dropdown carries the same explanation as a tooltip.
* Physics page: a new "Reading a star designation" section, showing how G2V, G2III and G2Ia can share a colour and be three completely different objects.
* Internal: the size wording is worked out from the rule pack's own radius figures, so it cannot drift away from the physics or disagree between the two places it appears.

## v2.1.628-beta - 15th Aug 2026

* Star systems: magnetars are no longer generated as their own kind of object. They are neutron stars with a very strong magnetic field, which is what they are in reality, so a neutron star is generated and its field decides what it is called. About one neutron star in seven comes out a magnetar, which is roughly what the old separate spawn rate produced.
* Star systems: neutron star fields now span the real range, so recycled millisecond pulsars at the faint end actually occur. Previously the range was advertised but under one in a hundred landed there.
* Rule packs: the field strength that makes a neutron star a magnetar is now stated in the pack rather than fixed in code.

## v2.1.627-beta - 15th Aug 2026

* Star systems: a star's brightness is now worked out from its size and temperature instead of being stored as a separate figure that could disagree with them. It did disagree: only the Sun-like band was self-consistent, and red dwarfs were being generated up to sixty thousand times too bright.
* Star systems: because red dwarfs are now correctly faint, their planets sit where a faint star's planets should, and their systems are smaller.
* Star systems: white dwarfs come out around a twentieth of the Sun's brightness, which is what Sirius B actually is, rather than the five to fifty suns the old figure claimed.

## v2.1.626-beta - 15th Aug 2026

* Star generation: figures that span several orders of magnitude — a neutron star's magnetic field, for one — are now drawn evenly across that range instead of piling up at the top. A neutron star's field could span a thousandfold and in practice almost never left the top tenth of it.
* Internal: this is what the magnetar rework needs. Merging magnetars into the neutron-star band would have made nine in ten neutron stars magnetars under the old draw.

## v2.1.625-beta - 15th Aug 2026

* Star systems: neutron stars and magnetars are no longer classified as white dwarfs. The classifier was weighing a remnant's own mass against the mass of the star it came from, two different things, so nothing that actually weighs 1.4 to 2.2 suns could ever come back as a neutron star.
* Internal: added a reference table of ten real stars with published classifications, so claims about the classifier are measurements rather than arguments. It currently gets five of ten luminosity classes right, and every miss calls a main-sequence star something grander.

## v2.1.624-beta - 15th Aug 2026

* Star systems: a star the catalogue gives no type for no longer gets a magnetic field invented for it. It used to borrow a default band and report about one gauss, which reads as a measurement of a weak field rather than as the absence it is.

## v2.1.623-beta - 15th Aug 2026

* Internal: reconciled the star-vocabulary order of work with the four owner decisions and the two pack-data faults found since it was written. It still said to hand-author a table of star types; it now derives them from the HR relation, stores only what cannot be computed, and records that hand-authored impossibilities are accepted and tagged rather than refused.

## v2.1.622-beta - 15th Aug 2026

* Star data: found that every star type except Sun-like ones states a brightness that contradicts its own size and temperature, by up to sixty thousand times.

## v2.1.621-beta - 15th Aug 2026

* Star generation: found that any setting spanning a wide range is picked from the top of that range far too often, which would have made almost every neutron star a magnetar.

## v2.1.620-beta - 15th Aug 2026

* Star editor: recorded that picking a star type and adjusting its sliders are two directions of one map, and that they currently disagree for hot stars.

## v2.1.619-beta - 15th Aug 2026

* Star editor: recorded that editing a neutron star should be able to turn it into a magnetar, and flagged that real magnetars spin slowly rather than quickly.

## v2.1.618-beta - 15th Aug 2026

* Star types: settled that a GM may build any star they like, and the engine points out what is impossible about it rather than refusing.

## v2.1.617-beta - 15th Aug 2026

* Star editor: recorded that moving a star’s sliders should update its type, reusing the pin-or-derive behaviour planets already have.

## v2.1.616-beta - 15th Aug 2026

* Star types: decided that a star should be identified by its full designation worked out from its own physical properties, and that magnetars become a kind of neutron star rather than a separate thing to spawn.

## v2.1.615-beta - 15th Aug 2026

* Internal: reviewed the star-classification design and flagged that its plan of work predates its own measurements.

## v2.1.614-beta - 15th Aug 2026

* Internal: recorded why plant colour cannot simply follow the brightest part of the sunlight - Earth is the counter-example.

## v2.1.613-beta - 15th Aug 2026

* Internal: recorded a background effort to explain the physics pages with generated diagrams rather than prose.

## v2.1.612-beta - 15th Aug 2026

* Internal: recorded how a planet’s colour and its plant life could both be derived from the sunlight that actually reaches the ground.

## v2.1.611-beta - 15th Aug 2026

* Internal: recorded a plant-pigment reference chart and what it does and does not settle about alien vegetation colour.

## v2.1.610-beta - 15th Aug 2026

* Internal: measured the star classifier against the rule pack's own star bands. They disagree on 9 of 29 — every hot-end band, plus neutron stars and magnetars, which the classifier calls white dwarfs because it tests a remnant's mass against the mass of the star it came from.
* Internal: recorded that the calibrated HR diagram already is the classification surface, so a star designation needs a position on it rather than a new table.

## v2.1.609-beta - 15th Aug 2026

* Internal: answered three open questions about the star data from the project history, and recorded that flare-style descriptive data should be tags.

## v2.1.608-beta - 15th Aug 2026

* Internal: noted that the existing HR diagram already answers the luminosity-class question the classification rewrite was about to rebuild.

## v2.1.607-beta - 15th Aug 2026

* Internal: extended the existing type-vocabulary design rather than starting a new one, and corrected it — it recorded two ad-hoc star classifiers where there are three.
* Internal: found that the stellar classifier is wrong for every hot main-sequence star — Vega comes back a giant, and O and B dwarfs come back supergiants. It is recorded with the measurements rather than patched, because the obvious fix was tried and trades five wrong dwarfs for two wrong supergiants.
* Internal: audited every path that creates or reads a star. Four creation paths that disagree, a `starCategory` field written by two of them and read by nothing, no star classification pass at all, and two parallel pack maps for one concept (30 stat bands against 19 pictures) with no mechanism keeping them in step.

## v2.1.606-beta - 15th Aug 2026

* Star systems: an imported star with no known class no longer quietly inherits a red dwarf's magnetic field.

## v2.1.605-beta - 15th Aug 2026

* Internal: scoped the star classification rewrite and listed the related fixes it should absorb.

## v2.1.604-beta - 15th Aug 2026

* Internal: the "which portrait does this star class get?" lookup existed three times and disagreed everywhere except the exact match. One shared resolver now, with all three copies deleted. Nothing a GM sees changes.
* Rule packs: a star class resolves to its exact portrait first, then to its spectral letter. A pack that drops a remnant's own key (star/BH, star/WD) now gets no portrait for it rather than borrowing a main-sequence one.

## v2.1.603-beta - 15th Aug 2026

* Internal: two more working sessions joined the roster; corrected a stale note that said one had been retired.

## v2.1.602-beta - 15th Aug 2026

* Internal: recorded which working sessions are live and what each is best placed to pick up.

## v2.1.601-beta - 15th Aug 2026

* Stars can be given a custom picture, the way planets and constructs already could. It is on the star's Details tab, under the spectral picker; Remove hands the picture back to the spectral-class portrait.
* A custom star picture now survives changing the spectral class — previously the class portrait was re-applied on every pass, so an upload would have been overwritten immediately.
* Internal: the upload control existed twice, once for planets and once for constructs. It is now ONE shared block serving all three, with both copies deleted.

## v2.1.600-beta - 15th Aug 2026

* Internal: settled the missing-liquids question — nothing was lost, the console message was a deliberate optional check working as designed.

## v2.1.599-beta - 15th Aug 2026

* Internal: recorded a request to let a star carry a custom picture, the way a planet and a construct already can.

## v2.1.598-beta - 14th Aug 2026

* Triple star systems can now form the nested arrangement they usually have in reality — a close pair, with a third star circling the pair as a whole from much further out. The engine could build the close pair, but once it had, anything orbiting that pair stopped being considered, so the outer arrangement never formed however heavy the third star was.

## v2.1.597-beta - 14th Aug 2026

* Companion stars are no longer imported on perfect circles. Every other element of their orbit was already varied, but eccentricity was pinned at zero — so a wide binary, which in reality is almost always noticeably elliptical, went round in a circle. Alpha Centauri A and B actually swing between about 11 and 36 astronomical units apart; the bundled hand-built version of the system has always known that, and the importer now does too.
* And a paired orbit no longer loses its shape when the pair is resolved into a barycentre. The two stars have to share one orbit shape between them, and the engine was copying it from whichever star was heavier — which, for an imported system, is the one that never had an orbit of its own. Its blank was overwriting the real one.
* Alpha Centauri imports properly again. Proxima and its planets were being pulled out of place: Proxima Cen b appeared in a tight orbit around the main star instead of around Proxima, ten thousand astronomical units away, and Toliman went missing. The cause was two different things being given the same internal name — companion stars were numbered b, c, d and so were planets, so Proxima Cen *b* and Alpha Cen *B* collided. Nothing reported an error; the app simply picked the wrong one. Fixed, and a check now runs over every imported system to make sure no two objects can share a name again.

## v2.1.596-beta - 14th Aug 2026

* Banked for the new generation engine: age will belong to a whole star cluster rather than to each star separately, which is how it really works — stars in a cluster form together and grow old together. That gives a map patches with a character of their own: a young region of hot blue stars with no time for life yet, an old one full of red giants.

## v2.1.595-beta - 14th Aug 2026

* Correction to a note left at handover: the rarity of supergiants in generated starmaps is right as it stands. A supergiant is not a kind of star you roll for, it is a heavy star grown old — so the way to get one is to age a system, or to build it in the editor, both of which already work. And a neighbourhood of nearby stars genuinely contains none; the famous ones are simply bright enough to be seen from very far away.

## v2.1.594-beta - 14th Aug 2026

* Housekeeping at a handover: the development notes now record which work is in flight and who holds it, so the next person picking this up starts from what is known rather than from the commit history.

## v2.1.593-beta - 14th Aug 2026

* A generated red giant and an imported one are finally the same kind of star. The engine carried two definitions of a red giant whose brightness differed about ninetyfold, and which one you got depended only on where the star came from — so one campaign could hold both. There is now one, and the old one still resolves for any map that already used it.
* Giants and supergiants can now turn up in a generated system at all, and at honest rarities. Previously the generator could only make one sort of red giant and none of the other kinds; now every spectral type has a giant and a supergiant it can reach. They are rare, as they are in reality — if you want a Betelgeuse deliberately, the star editor is the place.
* Black holes flare again, and for the right reason. A quiescent black hole was being given an ordinary star's flare rate, which was wrong; the fix went too far and silenced feeding ones too. A black hole with matter falling into it is among the most violently variable things in the sky, so it now flares according to how hard it is being fed — and magnetars, which flare from their own colossal magnetic fields, flare hardest of all.
* A star whose age nobody has measured no longer gets the Sun's. The importer fills in 4.6 billion years when the catalogue is silent, which was harmless until the new rotation model started calculating spin from age — at which point an unknown star was quietly being given the Sun's history. Its spin is now left unstated, and the physics panel says which of the reasons applies.

## v2.1.592-beta - 14th Aug 2026

* Red giants and orange giants now have their own portraits rather than borrowing a red dwarf's — including the ones the app generates, which had been showing a dwarf all along. With thanks to Pablo Carlos Budassi and NASA's Goddard Space Flight Center, credited in the About box.

## v2.1.591-beta - 14th Aug 2026

* Recorded from the stellar-spin work: an imported star with no known age is currently given the Sun's, and now that a star's spin is worked out from its age, that borrowed number has started to matter. Also noted that a star too small ever to become a giant can still be aged into one, which the engine now handles gracefully rather than correctly.

## v2.1.590-beta - 14th Aug 2026

* Stars spin now, and the fast ones are visibly squashed. Vega turns near the speed at which it would start throwing material off its own equator, and is genuinely about a fifth wider across the equator than pole to pole — it was drawn as a perfect sphere, because stars carried no rotation at all. They do now, and both the map and the 3D view show the flattening.
* Where a star's spin comes from depends on its mass, and the split is a real one. Lighter stars have a churning outer layer that makes a magnetic field, the field grips their own wind, and the wind carries away spin — so they slow down predictably with age, and their rotation is calculated from mass and age rather than invented. Heavier stars have no such layer, never slow at all, and keep the spin they were born with. That is why Vega is fast: not that it is young, but that nothing has ever braked it.
* An ageing star no longer cools to an impossible temperature. Red giants were cooled by a fixed proportion of whatever they started at, which suited a Sun-like star and drove a small red dwarf down to 1,500 K — not a star at all. There is a real floor, and giants now stop at it, which is also why real giants of very different origins all end up much the same colour.
* A star the catalogue gives no type for is now shown as unclassified, instead of quietly becoming a red dwarf. Six percent of the stars in a wide import had no spectral type and were being handed a red dwarf's mass, brightness, picture and flare rate. They now say plainly that the type is unknown and the figures are placeholders.
* Both physics pages explain all of it, including why one star is squashed and another is not.

## v2.1.589-beta - 14th Aug 2026

* The supergiant picture now reaches stars you create as well as stars you import. There are two separate lists of star artwork in the app - one used when importing, one when generating - and only the first had been updated, so a supergiant built by hand still showed a red dwarf.

## v2.1.588-beta - 14th Aug 2026

* Found while checking whether generated stars would use the new classifications: they will not, and worse, a red giant the app invents and a red giant imported from the sky currently disagree about their radiation by a factor of a hundred. Both are being fixed together, and the change is to the data rather than the code — the generator already knows how to use the new classes, it simply is not offered them.

## v2.1.587-beta - 14th Aug 2026

* Two gaps recorded in the new star tables. An older "red giant" entry survived alongside the new one and the two disagree about how much radiation such a star puts out — by a factor of about a hundred — so that needs settling. And stars are still described only by their letter and size class: within the O class alone the hottest is four times the mass of the coolest, so there is more detail to come.

## v2.1.586-beta - 14th Aug 2026

* Red supergiants now look like red supergiants. Antares and Betelgeuse were correctly identified as supergiants in the last build but still showed the picture of a red dwarf, because the label had become specific and the artwork had not. They now carry an artist's reconstruction of WOH G64 — one of the largest stars known — credited to ESO / L. Calçada in the About box.

## v2.1.585-beta - 14th Aug 2026

* A supergiant is now described as a supergiant. The numbers were already right after the last change, but the text underneath still read "Red dwarfs. The most common, very long-lived, but dim and cool." — because a star's type was recorded only as its letter, so everything downstream still saw an ordinary M star. Giants and supergiants now carry their size class as part of their type, and the description, the editor and the rules that read it all follow.
* Neutron stars, pulsars and black holes are no longer imported as red dwarfs. They have no spectral type at all, and an absent one was quietly being read as "M" — so a pulsar arrived weighing a quarter of the Sun and glowing like a dim red star. The catalogue says plainly what these objects are, in a field the importer already fetched and was throwing away; it is now read, and they arrive as neutron stars and black holes with the right pictures.
* White dwarfs were already being imported correctly. Checked rather than assumed, and left alone.
* Red giants and supergiants no longer flare like red dwarfs. Flares come from a fast-spinning, strongly magnetic star, which a hugely swollen one is not — and the flare dose reaching a planet was being calculated as though Betelgeuse behaved like Proxima Centauri. Black holes were flaring too, for a different and sillier reason.

## v2.1.584-beta - 14th Aug 2026

* A clarification to yesterday's principle: describing things in human terms is not the problem, it is the point. "It would look blue to you", "about Earth gravity", "roughly a fortnight" are what make a figure mean anything at a table. The rule is only that our senses must not sneak into the sums — and that where a description depends on human eyes, it says so.

## v2.1.583-beta - 14th Aug 2026

* A working principle written down for everyone building this: never quietly assume Earth, our Sun, or human senses. Three times this week a sensible-looking default turned out to be a fact about people rather than about physics — a brightness formula weighted for human eyes, a temperature range that only suits water, and habitability meaning habitable-by-us. The app is meant to teach real science, so those are exactly the errors a curious reader will find first.

## v2.1.582-beta - 14th Aug 2026

* Planned for this release: work out what light actually reaches the ground, after the air and haze have taken their share — and from that, what colour a plant there would sensibly be. The physics pages will draw the spectrum, the colour of the light at the surface, and the pigment that best suits it. Most of what this needs is already in the engine; the gases each already carry how they block and colour light.

## v2.1.581-beta - 14th Aug 2026

* A note for future work: which kinds of catalogue search are fast and which are unusably slow, measured rather than guessed.

## v2.1.580-beta - 14th Aug 2026

* A star search that misses now tries harder before giving up. Typing "Epsilon Eridani" or "61 Cygni" finds the star, where before only the catalogue's own shorthand did — the app translates and asks again.
* Searching for a pair, like 61 Cygni, offers you its two stars to choose between. The pair itself has no distance of its own, so it could not be used as a map centre and the search simply failed.
* A search too vague to answer now says so and suggests how to narrow it, rather than listing a hundred stars or reporting nothing found. "Epsilon" names a star in all 88 constellations, so it asks you to add one.

## v2.1.579-beta - 14th Aug 2026

* The New Starmap screen said it wanted a .json file, from before saves with pictures or ship models started arriving as .sse.zip bundles. It now says both. The file picker already accepted them; only the wording was behind.

## v2.1.578-beta - 14th Aug 2026

* On the fictional-substance problem: the answer is simply to move it. Invented gases and liquids belong with the map that uses them, in the same way invented engines and fuels do, rather than in the list every campaign starts with — so a real star's world can never be handed something out of a novel.

## v2.1.577-beta - 14th Aug 2026

* The welcome screen catches up: properly classified stars have landed and are no longer marked as in progress, and life-as-a-tag is listed as on its way.
* Two things found and recorded, not yet fixed. Antares now has a supergiant's numbers but is still described as a red dwarf, because the text under a star is still chosen by its letter alone. And a world imported from the real sky was given Astrophage in its air — a substance from a novel, which belongs only in the science-fiction map.

## v2.1.576-beta - 14th Aug 2026

* Housekeeping: the three star-import items are marked done on the board.

## v2.1.575-beta - 14th Aug 2026

* Notes for the next person working on stars: what changed, what was measured, and the several things found along the way that were deliberately left alone.

## v2.1.574-beta - 13th Aug 2026

* Biospheres split across two releases. The part that describes life — the kinds of it, how much of a world it covers, and what colours it should take — becomes ordinary tags now, alongside the wider tagging work, so you can author and search for it straight away. Actually drawing it on the planet comes later, with the new generation engine.

## v2.1.572-beta - 14th Aug 2026

* Imported stars are called what people call them. The catalogue files Antares as "alf Sco", and that is what appeared on your map; now it says Antares. Where a star has no popular name the abbreviation is spelled out instead — "eps Ind" becomes "Epsilon Indi" — and survey designations like "2MASS J09205549+4539058" are left exactly as they are, because they have no friendly name and inventing one would be worse. Systems are named as systems: Alpha Centauri, containing Rigil Kentaurus, Toliman and Proxima Centauri.
* Searching for a star now accepts the name it just showed you. Greek letters are translated before the search is sent, because the catalogue service rejects them outright — so "α Scorpii" works where it previously failed — and the box tells you what it searched for and what it found, rather than expecting you to know the catalogue's shorthand.
* Failed searches say something useful. A search that found nothing, or that the service refused, used to print either a bare "Failed to fetch" or several hundred characters of raw XML. Both are now a sentence.

## v2.1.571-beta - 13th Aug 2026

* Two lines removed from the welcome screen that belonged to later releases rather than this one — visible biospheres and the scale-up to clusters and galaxies. The panel lists what has landed or is in flight now; the longer plans live on the roadmap, where they cannot read as promises.

## v2.1.570-beta - 14th Aug 2026

* Stars now carry their classification properly, as three separate facts rather than a piece of text. A designation like "M1.5Iab" says three things — the type (M), how far through that type (1.5), and the size class (Iab, a supergiant) — and the app now keeps all three, reads them once when a star is imported, and can write the designation back out again. That last part is what makes it possible to check that a star still is what it was made as, which is the thing that was silently failing.
* The size class is the one that was being thrown away, and it is not a detail: it is what separates a red dwarf from a red supergiant at exactly the same colour, and it is the vertical axis of the HR diagram. Having it in the data properly is most of what the later star and generation work needs.
* Building a star in the editor now records the same three facts an import would, so a hand-made supergiant and an imported one are the same kind of thing.

## v2.1.569-beta - 13th Aug 2026

* The Getting Started guide has been brought up to date, and three parts of it were teaching things that no longer exist — Points and Constructs of Interest, which are now simply tags, and the old Field Guide and Projector, which Player Views has replaced. It also now covers importing the real sky, 3D ship models, the new save bundles and their attributions, and a new section on what to do when something goes wrong, including how to send us a diagnostic file when the app will not load.

## v2.1.568-beta - 13th Aug 2026

* The welcome screen now shows what is coming as well as what has arrived. Four headline features have been added — properly classified stars, worlds coloured by the life on them, your own map pinned behind the starmap, and scaling out to clusters and galaxies — and anything not yet finished is dimmed and tagged, so it is clear at a glance what you can use today. The panel is wider too; the list had grown tall enough to run off a desktop window.

## v2.1.567-beta - 14th Aug 2026

* The star editor and the rest of the engine now read one set of figures. The list of what each kind of star weighs and how big it is existed twice — once as editable data, once written into the editor itself — and the two disagreed for eight of sixteen kinds. Picking "white dwarf" in the editor gave you a 52,000 K star while a generated or imported one came out at 24,000 K. The editable copy wins, so the two can no longer drift apart.
* You can now make a giant or a supergiant in the star editor. Previously the list offered only main-sequence stars and one "Red Giant", so a red supergiant like Betelgeuse could not be built at all. Two entries were also mislabelled — the ordinary O and B stars were captioned "Blue Supergiant" and "Blue Giant", which is the same confusion that made imported supergiants arrive as dwarfs.
* Nudging a star's temperature no longer quietly demotes it. A giant or supergiant used to be reclassified from its temperature alone the moment you touched the slider, turning it back into an ordinary star of the same colour.

## v2.1.566-beta - 13th Aug 2026

* Decided: proper star classification comes in this release rather than a later one. Most of it already exists and is simply wired up wrongly, and having it finished first means the bigger generation work to come can build on it instead of having to deliver it as well. Stars will carry their type, subtype and size class as real properties rather than as a piece of text to be re-read every time.

## v2.1.565-beta - 13th Aug 2026

* Added to the stellar-spin work: the star will have to actually look flattened in both the flat and 3D views, and the physics pages will have to explain why it spins at all — that cool stars are slowed over their lives by their own magnetic wind while hot ones never slow, which is the difference between our Sun and Vega.

## v2.1.564-beta - 14th Aug 2026

* Imported giants and supergiants are now giants and supergiants. A star catalogue writes Antares as "M1.5Iab" — an M-type star of luminosity class Iab, a red SUPERGIANT — but only the letter was being read, so it arrived as a red dwarf: a fiftieth of its real mass and a six-millionth of its real brightness. Betelgeuse, Rigel, Deneb, Polaris, Arcturus and Aldebaran all did the same, which is to say every bright star you might think to look up. The luminosity class is now read, and the rule pack has giant and supergiant figures for each spectral type to put it against.
* Nearby red dwarfs were being imported as white dwarfs. The catalogue writes Wolf 359 as "dM6" — a lowercase d for dwarf — and the check for a white dwarf (types starting with a capital D) was ignoring the difference in case. Four stars within sixteen light years were affected, including Wolf 359, Ross 128 and Teegarden's Star.

## v2.1.563-beta - 13th Aug 2026

* Worked out how generated stars should get a spin, so they can be flattened by it as planets are. Cool stars slow down over their lives at a rate that is well measured, so theirs can be calculated from their mass and age rather than invented. Hot stars never slow down at all — which is why Vega is still spinning fast enough to be visibly squashed — so those get drawn from the spread that is actually observed.

## v2.1.562-beta - 13th Aug 2026

* Correction to the note above: some imports do bring a star's real spin with them, so the figure is often already there and only the shape fails to follow. That makes the first half of the fix considerably smaller than it looked — letting stars reach the flattening the engine already applies to planets.

## v2.1.561-beta - 13th Aug 2026

* Noted: planets are squashed by their own spin, but stars never are, so Vega — which spins fast enough to be visibly flattened, and is a fifth wider across its equator than pole to pole — is drawn as a perfect sphere. It turns out stars carry no rotation at all in the engine, which is a known gap finally showing itself somewhere you can see it.

## v2.1.560-beta - 13th Aug 2026

* Two more findings on star search, both to be fixed with the naming work: the catalogue service refuses Greek letters, so "α Scorpii" fails where "alf Sco" succeeds — meaning the app must translate a pretty name back into a plain one before searching, not just show it. And when a search does fail, the raw error from the service is being shown verbatim instead of a sentence.

## v2.1.559-beta - 13th Aug 2026

* Planned with the same work: you will be able to search for a star by the name you actually know. Typing "Antares" currently finds nothing, because the catalogue files it as "alf Sco" — so the app will translate for you, and tell you what it searched for, rather than expecting you to know the catalogue's shorthand first.

## v2.1.558-beta - 13th Aug 2026

* Planned with the importer work: imported stars will be given readable names. "alf Sco" is the catalogue's shorthand, not a name — it should read Antares, or Alpha Scorpii. Most of that needs no lookup at all, just spelling out abbreviations the catalogue compresses; survey-numbered stars with no real name will be left alone.

## v2.1.557-beta - 13th Aug 2026

* Housekeeping: trimmed yesterday's notes back. The release-numbering friction between parallel work is a note on the existing rule rather than a job of its own, and a one-off harmless deviation has been dropped as noise.

## v2.1.556-beta - 13th Aug 2026

* Housekeeping: three things a retiring contributor was carrying only in their head are now written down — that one of the Traveller example's worlds still ships detached from its star and needs a decision rather than a repair, that catalogue star names get unfriendly on wide imports, and that the release-numbering collisions between parallel work are costing real time and want fixing at the source.

## v2.1.555-beta - 13th Aug 2026

* Housekeeping: the list of things noticed in passing has been sorted through. Most had already been dealt with by whoever found them; the dozen that had not are now named and pointed at the release that will already be working in that part of the code, rather than all being attempted at once.

## v2.1.554-beta - 13th Aug 2026

* Planning, no product change: a written specification for the fix to giants and supergiants importing as dwarfs — Antares currently arrives as a red dwarf, wrong on mass by fifty times and on brightness by six million. The specification is detailed enough to be implemented without working any of it out again.

## v2.1.553-beta - 13th Aug 2026

* On the imported-giants problem: the app already knows what a red giant is — that definition is in the rule pack and always has been. The importer simply has no way to ask for it from a catalogue's own wording, so it asks for a dwarf every time. Smaller to put right than it first appeared.

## v2.1.552-beta - 13th Aug 2026

* Found, not yet fixed: stars imported from the sky catalogue arrive as ordinary dwarfs even when they are giants or supergiants, because only the first letter of their classification is being read. Antares — the fifteenth brightest star in the sky, and a red supergiant — comes in as a dim red dwarf. It affects the famous stars most, since bright stars are rarely ordinary ones.

## v2.1.551-beta - 13th Aug 2026

* **Fixed: on phones and tablets, pinch-to-zoom did nothing on the 3D system view.** Rotating and tilting always worked, which is why it read as "I can't zoom in or zoom out any more", and why reloading the page appeared to fix it -- nothing was ever broken. The view kept a rule that only the mouse wheel is allowed to change how close you are, so a pinch moved the camera and the view politely put it back a frame later. Every kind of zoom gesture now counts, and the rule is written down and tested in one place so the next kind of input cannot be left out the same way. Desktop behaviour is unchanged.
* Fixed: lifting your fingers out of a pinch could select whatever was under them, because a two-finger gesture was being judged by the same "did it move far enough to be a drag" test as a single tap.
* Internal: the app now notices if a device's graphics context is dropped -- a real possibility on a phone under memory pressure, and previously invisible: the picture would freeze with nothing in any log to explain it. It is recorded in the performance trace and the diagnostic bundle. Recovering from it automatically is deliberately left until we know it actually happens.

## v2.1.550-beta - 13th Aug 2026

* Planning, no product change: a design outline for a piece of tidying to do before the generators are rewritten. Worlds and stars can be picked by type, and separately the app works out a type from a world's physics — the same question answered forwards and backwards. For planets those two share one description of what each type IS, and agree. For stars they do not: there is no description of a star type in terms of physics at all, only two informal ladders and three separate tables of typical figures that disagree in places.
* Nothing is broken today, and the outline says so plainly — the places the tables disagree are figures nothing sorts on. The reason to do it first is that rewriting the generators is exactly when a fourth table would get invented, and when picking a type and getting a different one back would start happening quietly.

## v2.1.549-beta - 13th Aug 2026

* The real-sky import dialogue now describes what it actually does. Its wording still promised "every confirmed planet host" and "only planets the archive lists as confirmed" — true of the old behaviour, and the exact opposite of the new one, since the whole point of the change is that stars without planets now come too. Spotted by the owner in the running dialogue.

## v2.1.548-beta - 7th Aug 2026

* Decided for the cosmic web: it will be built the way cosmologists actually describe it — as a foam of bubbles, where the empty voids are the bubbles, galaxies gather on the films between them, and clusters sit where several films meet. One simple rule produces voids, sheets, filaments and clusters together, so none of them has to be drawn by hand.

## v2.1.547-beta - 13th Aug 2026

* Importing from the real sky now brings back STARS, not just stars that happen to have planets. It is a starmap importer, and it had been selecting from a catalogue of exoplanets — so a star with none was never in the results at all. That is why an imported "local neighbourhood" had no Sol and no Alpha Centauri A or B, while Proxima turned up on its own. A 16.5 light year import goes from 21 systems to 56, Alpha Centauri arrives with all three of its stars, and Sol is there.
* Sol is filled from the Solar System example that ships with the app, never invented — our own planets are not exoplanets, so no catalogue has them. It is added only when the region actually reaches Sol, so a map centred somewhere far away does not get one.
* Choosing to fill out systems with generated worlds is unchanged and still yours. It is a separate choice from which stars arrive: a star with no known planets can now simply be a star, with nothing around it, and that is a normal result rather than a failure.
* Two things had to be got right to make the join work, and both are the opposite of what you would guess. Catalogues record star positions at different dates, so the nearest stars — the ones that move fastest across the sky — disagree the most: Barnard's Star by 161 seconds of arc. And a star's distance is measured well enough to place it but not well enough to measure the gap to its companion, which for Sirius A and B invents a 6,856 AU separation for a pair genuinely about 20 apart.
* The size and load-time warning shown before importing has been re-checked against the much larger star count, and its estimate corrected: it used to guess the total from the first system in the list, which was fair when every system looked alike and is not now that most are a single star and one of them is the whole Solar System.

## v2.1.546-beta - 13th Aug 2026

* Brown dwarfs are selectable as a star type but the generator had no figures for them, so an L, T or Y dwarf it had to fill in fell back to a Sun-like 0.92 solar masses and 5,600 K. The three classes now have their own mass, size and temperature ranges, matching the ones the star editor already offered.
* Groundwork for the real-sky importer, no change yet to what it brings back: the parts that turn a list of stars into systems. Two things a raw star catalogue gets wrong are handled — it lists multiple-star systems and their member stars as if both were stars, and its distances are precise enough to place a star but not to measure the gap between two of them, which for Sirius A and B invents a 6,856 AU separation for a pair genuinely about 20 apart. Which stars share a system is decided by the rule the app already uses for how long they take to orbit each other, so it stays consistent with everything else and remains adjustable.

## v2.1.545-beta - 7th Aug 2026

* Likely cause found for pinch-zoom failing on phones and tablets: the view recognises a deliberate zoom from a mouse wheel only, and a pinch is not a wheel. So the pinch moves the camera and the view quietly puts it back, which is why turning the map still works while zooming does not, and why a laptop is unaffected. Not yet fixed — the finding is handed to the session that owns that code.

## v2.1.544-beta - 7th Aug 2026

* Correction on the frozen player view: it is not a crash. The recording shows the orbits still turning after it happens, so the picture is alive and only the controls have stopped answering. That rules out the graphics context being lost, which yesterday looked like the best explanation, and points instead at either the camera or the view being starved of frames.

## v2.1.543-beta - 7th Aug 2026

* A lead on the frozen player view reported yesterday: it happens on phones and tablets but not on laptops, which points at the graphics context being dropped under memory pressure — the picture freezes on its last frame while your pinches are still arriving, so it feels like the controls have died when really the image has. The app currently has no way of noticing that happening, which is the first thing to change.

## v2.1.542-beta - 7th Aug 2026

* Under investigation, reported by a user: the player view can stop responding to pan and zoom after it finishes rendering, until the page is reloaded. Recorded with what is needed to catch it — the diagnostic file from Settings, or the browser console captured while it is still stuck rather than afterwards.

## v2.1.541-beta - 7th Aug 2026

* Decided for the larger map scales: galaxies, clusters and the cosmic web will be generated rather than imported, since there is little usable real data at those sizes. They will be fields of coloured points arranged into the shapes those structures actually take, explored by moving the camera rather than by running the clock — and the cosmic web is drawn as bubbles, where the bubbles are the empty voids and the film between them is where everything lives.

## v2.1.540-beta - 7th Aug 2026

* Planned for a following release: the map grows upwards. The same map you use for a star system and for a neighbourhood of stars will scale to a galaxy, then to a cluster of galaxies, then to the filaments of the cosmic web — the same design each time, with only the scale and the backdrop changing.

## v2.1.539-beta - 13th Aug 2026

* Worlds that nobody ever gave an axial tilt now get a plausible one, and say that it was worked out rather than measured. Two groups needed it: real exoplanets, whose tilt is essentially impossible to observe and will never appear in a catalogue, and invented worlds where nobody wrote one down. 56 worlds in the Local Neighbourhood map and 87 in the science-fiction one gain a tilt; the real Solar System is untouched, because a tilt that was actually recorded is never overwritten.
* The model is the one the generator was already using for the worlds it invents, moved somewhere all three routes can reach it — it had only ever run for randomly generated systems. Most worlds come out modestly tilted, a median of 19 degrees with roughly four in five under 30, because a world forms from a flat disc; about one in ten is knocked onto its side or turned over entirely by a large impact, which is how the real Solar System got Uranus and Venus. Both halves are adjustable per starmap.
* Each world's tilt is fixed by its own identity, so reloading or re-importing gives the same worlds back rather than re-rolling them. Previously any world without a tilt was quietly assumed to be tilted 25 degrees — the same figure for every one of them, with nothing to say it had been assumed.

## v2.1.538-beta - 13th Aug 2026

* Removing an automatic centre-of-gravity marker no longer strands whatever was attached to it. When two worlds are close enough to swing about a shared point the app makes one of these markers, and when the arrangement changes it takes it away again — but it only ever reattached the two worlds it was made for. Anything else hanging off it was left pointing at something that no longer existed, which cuts that world off from its star entirely: no temperature, no eclipses, nothing. A moon in the bundled Traveller example is in exactly that state, which is how this was found.
* Three separate routes to the same damage are closed, including a malformed marker being deleted out from under the worlds it had declined to reattach. The example file itself is still broken and is left alone deliberately — repairing it means inventing figures nobody recorded — but it can no longer happen again.

## v2.1.537-beta - 13th Aug 2026

* Housekeeping with a point, no product change: axial tilt is now a declared part of what a world IS. It never had been — which is precisely why a second, redundant name for it grew alongside and quietly took over the seasons calculation for months. The redundant name is gone and the real one is written down, so the next person is steered to it. Declaring it also cleared 41 existing type errors rather than creating any.

## v2.1.536-beta - 13th Aug 2026

* Seasons now follow the orbit that actually moves a world nearer to and further from its star. The calculation had been using whatever the world orbits directly — which is right for a planet, and wrong for anything else. Pluto was being given its six-day dance around Charon instead of its 248-year journey around the Sun, so it lost the very thing it is known for: an atmosphere that freezes onto the ground as it moves away. Its seasonal swing widens accordingly.
* Moons gain the seasons their planet gives them. Jupiter's moons follow Jupiter's year, Saturn's follow Saturn's; previously each was given its own short orbit around its planet instead, which is far too small to make a season, so they had none at all. Our own Moon moves the other way and narrows, because it now follows Earth's orbit rather than its own.
* Nothing new was calculated to do this. The app already worked out how much each world's distance to its star varies, for its temperature range; the seasons now read that same answer instead of a second, different one.

## v2.1.535-beta - 13th Aug 2026

* Worlds now get their seasons from their real axial tilt. Tilt was stored under two different names, and the seasonal calculation read the one the bundled maps never filled in — so every world in them, and every world imported from the real sky, had its seasons worked out from an assumed 25 degrees. Uranus is the world this most obviously wronged: it lies on its side at 98 degrees, which is the entire reason its seasons are what they are, and its temperature range widens accordingly. Mercury, which is barely tilted at all, loses the seasons it never had, and so do the tidally locked moons.
* Worlds already near 25 degrees — Earth, Mars, Saturn, Neptune — barely move, which is the check that this is doing what it should.
* There is one name for axial tilt now instead of two. Anything saved under the old name is carried across when it loads, so nothing already made loses its tilt. One importer had been writing only the old name, so its worlds had seasons but no visible tilt; that is fixed by the same change.

## v2.1.534-beta - 13th Aug 2026

* Pluto's orbit around the Pluto-Charon centre of gravity read "0.000 AU". It now reads 2,103 km. The panel was choosing its units from what KIND of body it was looking at — kilometres for a moon, astronomical units for anything else — so a planet orbiting something 2,000 km away fell into the wrong one and rounded away to nothing. It now chooses by how far the orbit actually is, which is what three other readouts in the app were already doing, each with its own idea of where to switch. They all share one now.
* Reported by the owner from the running app.

## v2.1.533-beta - 12th Aug 2026

* Imported planets heavier than about four Earths are now treated as gas giants rather than as ice-rich super-Earths, and each one gets its own composition rather than all of them sharing a single figure. Nineteen worlds in each bundled map change, and no imported world reads 55% ice any more. The envelope fractions are the ones the app already uses for a giant it has to guess at, so this is the existing rule applied more widely rather than a new one.
* The reason the old figure was meaningless is worth stating: for three quarters of the catalogue's planets the radius is one the archive worked out from the mass, so the density that used to choose the composition was just the mass again in disguise. Mass now decides directly, and the variation between worlds is fixed by each planet's own identity, so re-importing the same region reproduces the same worlds.
* Where a radius really was measured, the measurement still wins: 55 Cancri e and the two inner planets of HD 219134 are genuinely dense and stay rocky. Nothing can make a true giant rocky, however it is measured.

## v2.1.532-beta - 12th Aug 2026

* Correction to yesterday's notes, no product change: the claim that the app fails to recognise Jupiter as a giant was wrong. It recognises it correctly. The measurement behind the claim read a stored field that is usually empty, rather than the function the app actually calls, which works the composition out from mass and size when nothing is stored. Retracted, and the developer note that warns about this class of mistake has been widened to cover it.

## v2.1.531-beta - 7th Aug 2026

* Housekeeping: the analytics change above is logged as needing a mention wherever the app describes what it records, so the About text and the readme can be checked against it.

## v2.1.530-beta - 7th Aug 2026

* Visitor analytics now record one anonymous event per browser per day instead of one for every screen you move between. Moving around the app is exactly what it is for, and counting each move told us nothing extra while rapidly using up the free allowance. Nothing new is collected, and rather less is: a single timestamp is kept on your own device so the app knows it has already counted you today.

## v2.1.529-beta - 7th Aug 2026

* A note on how this project is built, written down for everyone working on it: the aim is general rules that hold anywhere, not a careful reproduction of our own solar system. Our worlds are how we check the rules are sound — never the thing the rules are bent to fit. Complexity should come from simple things layered, not from special cases.

## v2.1.528-beta - 7th Aug 2026

* The biosphere appearance design is complete and ready to be built. Plant colour follows a single rule that explains our own world rather than making an exception of it: a bright sun delivers more light than life can use, so plants can afford to throw a band away — which is why ours are green — while life under a dim red dwarf can waste nothing and comes out near black. As ever, the colours remain yours to edit.

## v2.1.527-beta - 7th Aug 2026

* Clarified for the planned biosphere colours: the work includes reworking how planet surfaces are drawn, since today they are patches of colour with no notion of where land meets water and no way to show lights at all. Recorded so the job is sized honestly rather than mistaken for a settings slider.

## v2.1.526-beta - 7th Aug 2026

* Settled for the biosphere colours: plants take a colour from their own star, and the reasoning holds up — a world under a bright sun can afford to throw a band of light away, which is why ours are green, while life under a dim red dwarf can waste nothing and comes out near black. Recorded alongside it that the planet texture generator is due a rewrite, and that this feature should wait for it rather than be built twice.

## v2.1.525-beta - 7th Aug 2026

* Planned: each kind of life will carry a range it starts within, so a fresh world gets a plausible spread of it rather than the same number everywhere — and you can then tune any single planet by hand without the engine undoing you.

## v2.1.524-beta - 7th Aug 2026

* The biosphere appearance design is settled. Every kind of life carries both a colour and a glow, so a world can have luminous purple fungi on orange ground as readily as green fields and city lights; you decide which layer sits above which. One question is left open on purpose — what colour plants should be under a star that is not the Sun.

## v2.1.523-beta - 7th Aug 2026

* Planned: where life appears on a world is decided rather than scattered. It gathers along the shorelines, where land meets its liquid, and only where that liquid is actually liquid — so the coverage you set fills the most hospitable ground first and spreads outward, skipping the frozen poles and the scorched middle. Worlds whose life runs on ammonia or methane get their own habitable band, not ours.

## v2.1.522-beta - 7th Aug 2026

* Planned: the fixed list of life types goes away and becomes ordinary tags — microbial, fungal, flora, fauna, sentient — so your own rule packs can use them and invent new ones. Each kind carries how much of the world it covers, and how it should be drawn: a tint, or points of light on the coastlines for a world that has built cities.

## v2.1.521-beta - 7th Aug 2026

* Planned in more detail: the biosphere colours become a stack you control. Each kind of life — microbes, fungi, plants, and anything you invent, such as a technological one that reads as dark with lights — gets its own coverage and colours, and you set which sits on top of which, because a more advanced biosphere gradually paints over the one before it. Driven by tags, so the same machinery that says a world has life is the machinery that colours it.

## v2.1.520-beta - 7th Aug 2026

* On the board, not yet built: a Biospheres section in settings, with a vegetation slider that tints the land of worlds whose life reached it — in a colour taken from their own star, so plants under a red dwarf are not green. A simple first version; the full treatment of life comes later.

## v2.1.519-beta - 7th Aug 2026

* Clarified for the planned starmap import: bringing in the nearby stars themselves is unconditional, but filling in imagined worlds around them stays your choice, as it is today. A straight import gives you the real stars with their real planets, and the starless ones simply arrive starless.

## v2.1.518-beta - 7th Aug 2026

* Decided, not yet built: importing the real sky will bring in the nearby stars themselves, not only the ones already known to have planets — and will fill in plausible worlds around the rest. Sol, when it falls inside the region, comes in with its real planets rather than invented ones. It is a starmap importer; the planets are the add-on.

## v2.1.517-beta - 7th Aug 2026

* Noted, not yet fixed: a map imported from the real sky has no Sol and no Alpha Centauri. Both have the same cause — the importer asks the archive for stars that are known to have planets, and Sol is not in an exoplanet catalogue while Alpha Centauri A and B have no confirmed planets of their own. Proxima does, which is why it turns up alone under the Alpha Centauri name.

## v2.1.516-beta - 7th Aug 2026

* **Fixed: dragging to pan the GM starmap no longer highlights the star names you drag across.** A drag on the map is a pan, and the browser was also treating it as selecting text, so a cluster of labels lit up mid-drag. The map's description box is untouched — that is still text you can select and copy.
* Noted for later: the Hayashi limit does not appear to be modelled, so a very cool star aged into a red giant can be given a temperature no real star can have. And generated moons need a proper rethink rather than another patch — counts, masses and types are all decided in ways that let a moon outweigh its own planet.

## v2.1.515-beta - 7th Aug 2026

* Noted, not yet fixed: dragging to pan the GM starmap highlights the star names it passes over, as though you were selecting text. Cosmetic, and a one-line fix — the same guard the map's own grid numbering already uses.

## v2.1.514-beta - 11th Aug 2026

* The twelve example systems a GM can load now have a check on them, which they never have had — and it found two real faults the moment it ran. Pluto and Charon in the Expanse Solar System still had the wrong orbit around each other, the same fault fixed elsewhere earlier today, and that is now corrected there too. The Traveller example has a moon, Cerebus Alpha, attached to something that is not in the file, which cuts it off from its star so the app cannot work out its temperature or anything else about it. Putting that one back together means inventing several figures, so it is reported rather than guessed at.
* The check covers the things a system must have to work at all: no two objects sharing an identity, every object attached to something that exists, one centre per system, and a mass and size on everything that needs one.

## v2.1.513-beta - 11th Aug 2026

* Housekeeping, no product change: a check of the Moon's orbital plane in the standalone example systems found it had already been put right nine days earlier, along with a full sweep of all twelve files. The record said otherwise, so it is now corrected. The sweep was re-run from scratch to confirm, and it agrees — including on Iapetus, which looks like it needs the same correction and does not, because its published figure is already measured against Saturn's equator rather than the flat of the Solar System.

## v2.1.512-beta - 11th Aug 2026

* The starmap builder now says when a world has moons but no axial tilt, because that silently undoes the work that puts moons in the right plane. It currently names six worlds in the science-fiction map — Polyphemus, Gargantua, Reach, Tribute, Andor and Calpamos — between them carrying eleven moons that are drawn in the flat system plane instead. Giving invented worlds a tilt is an authoring choice rather than a repair, so the builder reports it and leaves it; the real Solar System worlds are all fine.
* Found while measuring that, and written up rather than patched: axial tilt is stored under two different names, and the seasonal-temperature calculation reads the one the bundled maps never fill in. Every world in both bundled maps is therefore having its seasons worked out from an assumed 25 degrees — including Uranus, whose 98-degree tilt is the entire reason it has the seasons it does. Nothing looks obviously wrong on screen, which is why it went unnoticed.

## v2.1.511-beta - 11th Aug 2026

* Investigation, no product change: Pluto losing its methane clouds when its nitrogen frost was modelled turns out to be correct, not a regression. Pluto's air is already saturated in methane at ground level, so the methane there is frost rather than cloud — a cloud whose base is the ground is fog — and the app says so separately and correctly. Triton keeps its clouds because its air is dry at the surface and only saturates well above it, which is a real difference rather than the two sitting either side of a threshold. Real Pluto does have a haze, but it is made by sunlight breaking up its air rather than by anything condensing, and that is a kind of weather the app does not model at all. Written up as a feature to consider rather than a fix.

## v2.1.510-beta - 11th Aug 2026

* Pluto and Charon no longer eclipse each other every six days. Both were authored with the orbit of their shared centre of gravity around the Sun rather than their own orbit around each other — the tilt and the eccentricity both — which left the pair permanently lined up with the Sun. With the real figures in, the app now finds what actually happens: mutual eclipses come in seasons a few years long, twice per 248-year orbit, roughly 124 years apart. That is the pattern that produced the famous run of events in the late 1980s.
* One caveat stated plainly: the seasons are in the right rhythm but not yet on the right dates, because the orbit's orientation is still unspecified. The app finds the next season in the 2080s where the real answer is nearer the 2100s. Anchoring that needs one more figure and is written up.
* Pluto's quoted temperature range shifts very slightly, from 6-66 K to 7-65 K, as a knock-on. The reason is a separate issue found while measuring this one and is written up rather than patched.

## v2.1.509-beta - 11th Aug 2026

* Investigation, no product change: the report that some worlds are labelled both rocky and giant at the same time turns out not to be true of the app. The contradictory pairs live in the saved files but are discarded and re-derived the moment a system loads, and the classifier cannot produce two base types even in principle. Iota Horologii b, one of the named cases, loads correctly as a Super Jupiter and nothing else. The one genuine instance was Epsilon Indi A b, fixed in the previous release. Four fictional worlds do carry two labels each — Vulcan, Altair IV, Reach and LV-426 — but each is a specific type plus its family, written that way on purpose.
* Noted while measuring the above: Jupiter, Saturn, Uranus and Neptune carry no composition figures at all in the bundled data, along with about half of everything else in it. Nothing displays wrongly today, but any check asking "how much gas does this world have" gets zero for Jupiter, which is a missing answer being read as a real one. Written up for a decision.

## v2.1.508-beta - 11th Aug 2026

* Imported giant planets are no longer described as rock and metal. A super-Jupiter really is dense — past about one Jupiter mass a giant stops growing and is squeezed by its own gravity — and the import rule read that density as rock before it ever looked at the mass. Epsilon Indi A b now reads 85% gas in both bundled starmaps, agreeing with the Super Jupiter the app was already calling it. Six planets in the catalogue were affected; the other five are ones you would meet by importing real stars yourself.
* Still open, and now measured rather than argued about: every imported super-Earth comes out 55% ice. For three quarters of the catalogue's planets the radius is one the archive calculated from the mass, so the density that picks the composition is not independent of the mass it is meant to be weighed against. What an import should claim instead is a judgement about the data rather than a bug, so it is written up for a decision.

## v2.1.507-beta - 7th Aug 2026

* Planning, no product change: the V4 biosphere would extend the atmosphere's existing reaction system rather than being built beside it. A living thing is described the same way a chemical reaction already is — these ingredients, this much yield, ingredients used up — with an energy source, a solvent, and the one thing that makes it alive: it makes more of itself.

## v2.1.506-beta - 7th Aug 2026

* Planning, no product change: the V4 biosphere becomes an extensible rule set rather than a fixed list, so unfamiliar kinds of life can arise on their own. A world may or may not develop life, but it will always develop the same life, and every biosphere has an end — which is what lets the age slider be dragged in both directions and always agree with itself.

## v2.1.505-beta - 7th Aug 2026

* Planning, no product change: the V4 biosphere thinking is written up. Life would be modelled as something that consumes an energy source, raw molecules and a solvent, and gives back both more life and a changed world — so a biosphere reshapes its planet the way weathering or tectonics does, rather than being a score attached to a finished one.

## v2.1.504-beta - 7th Aug 2026

* Planning, no product change: early design notes written before this version of the app existed have been recovered and folded into the V4 thinking, including a warning that a long timeline needs a different kind of orbital integrator than the one used today.

## v2.1.503-beta - 7th Aug 2026

* Planning, no product change: the development roadmap is re-cut around three horizons — finishing the current line, the work already in flight, and a longer-term V4 built around a new planetary generation system with a timeline. The V4 thinking is written down separately and is deliberately parked.

## v2.1.502-beta - 7th Aug 2026

* The performance and memory work is closed. The load crash that could brick a campaign is fixed, and the instruments, the stop-load brake and the sendable diagnostic file all remain. The 3D view's scene-rebuild rate was something an agent spotted in a trace rather than anything a user has hit, so rather than chase it, the meters that would diagnose it are documented where the next person will find them.

## v2.1.501-beta - 7th Aug 2026

* Diagnosed, not yet fixed: an imported super-Jupiter such as Epsilon Indi A b is described as mostly rock and metal, even while the app correctly calls it a Super Jupiter. The cause is that imported worlds have their composition guessed from density before mass is considered, and a giant that heavy is genuinely dense — it is squeezed by its own gravity, not made of rock. The same four-line rule is also why imported super-Earths all come out as 55% ice, so the two will be fixed together.

## v2.1.500-beta - 7th Aug 2026

* Housekeeping, no product change: the custom starmap background is fully specified and ready to build. An uploaded sector map simply sits behind the existing grids and rings, which stay as they are.

## v2.1.499-beta - 7th Aug 2026

* Housekeeping, no product change: the custom starmap background grows a second, more useful mode. As well as a decorative backdrop that stays put, a picture will be able to be PINNED TO THE MAP, so it pans and zooms with the stars and stays in constant registration with them — which is what makes sector maps and empire borders possible.

## v2.1.498-beta - 7th Aug 2026

* The experimental Evolutionary (Alpha Physics) generator, its wizard and its timeline are confirmed as KEPT. A note inside the code still said the timeline was on its way out, which was no longer true and could have led to it being deleted during a tidy-up; that note now says plainly that all of it stays. No change to how anything behaves.

## v2.1.497-beta - 7th Aug 2026

* Housekeeping, no product change: dynamic system aging is held until the accretion engine's own phase, since the two belong together. The board records that the existing aging machinery is shaped around the accretion engine's own planets rather than hand-built ones, so re-ageing an authored system is genuinely unsolved rather than nearly done.

## v2.1.496-beta - 7th Aug 2026

* Housekeeping, no product change: the custom starmap background is now fully scoped. It will be offered on the GM's 2D starmap and the player's 2D starmap; the 3D map keeps its own starfield, because a flat picture cannot go on it without being warped onto a sphere.

## v2.1.495-beta - 7th Aug 2026

* Housekeeping, no product change: dynamic system aging is on the board as a design investigation — a slider that re-ages an existing system, star and planets together, and can run backwards. Recorded with the finding that most of the machinery already exists, so the work is smaller than it looks.

## v2.1.494-beta - 7th Aug 2026

* Housekeeping, no product change: a new feature request is on the board — a GM will be able to upload their own galaxy image behind the starmap, with scale and fade controls, and the current Milky Way picture becomes the supplied default.

## v2.1.493-beta - 8th Aug 2026

* **New: highlighted tags now show on the players' views, and you choose how they look.** Highlighting a tag badged it on your own maps only. It now reaches the players' system map (2D and 3D alike), their starmap, and the textual guide — where the highlighted tags a world carries are listed as chips directly under its name, so the map and the page always agree.
* **New: three looks for a highlight, per player view.** In **Player Views → edit a preset → System → Highlighted tags**: **Tag chips** (exactly as they appear in the panels), **Map pins** (a pin carrying the tag's initials — the fewest pixels when a lot is highlighted), or **Flags** (the chip flown from a short staff — the most readable at a glance). The colour is never part of the choice: it always comes from the tag or its category, so a faction flies its own colour whichever shape you pick, and every shape carries its text so it still reads under a CRT or colour-blind filter. The preset preview shows your choice live.
* **The physics page now explains GM overrides** — what an override changes and what it deliberately does not (it replaces the tag, never the physics behind it), how to tell a derived tag from your own, and why typing a real axial tilt retires the "inferred" note.
* The tag guide's "Showing them on the maps" was out of date — it still sent you to Quick overrides to pick a highlight, when that moved to the **Find by tag** tray some time ago. Rewritten, and it now covers the starmap fade, the colour key and the new marker looks.

## v2.1.492-beta - 8th Aug 2026

* **Fixed: highlight badges never appeared on the starmap.** Choosing a tag to highlight correctly faded back the systems that do not carry it -- so the map clearly responded -- but the coloured badges naming the tag were never drawn, on any system, ever. The selection was read once when the map was first built and then never looked at again, so the badges were always working from an empty selection. They now appear as soon as you add a tag and update as you change it.
* **Tag markers on the maps are now the same shape as the tag chips in the panels.** A marker on a map and a chip in a body's Tags tab are the same thing, and they now look like it -- the same corner rounding, the same padding, the same typeface -- just drawn smaller on a map. Previously the orrery and the starmap each drew their own approximation of a chip.
* **Fixed: a starmap badge did not fit its own text.** Badge width was estimated from the NUMBER of letters rather than measured, so a wide name overflowed its own coloured rectangle by up to half its width again, and a narrow one sat in a rectangle nearly twice the size it needed. Widths are now measured.

## v2.1.491-beta - 7th Aug 2026

* Housekeeping, no product change: the observations inbox records the owner's sign-off pass. The satellite reference frame (moons and rings sitting in their parent's equator), the orbit-line sweep on a followed ship, the 3D body picture inside the view filter, the distance grids and the charted-star sky are all confirmed on screen rather than only in numbers; the ship-appearance follow-ups are closed. Two new observations captured: the Traveller importer producing over-flattened gas giants, and a fault to be detailed on Epsilon Indi A b in the real-sky importer.

## v2.1.490-beta - 8th Aug 2026

* **Fixed: a starmap with two systems very far apart could not be loaded at all, and eventually crashed the tab.** This is the reported fault, and it was the snap-grid overlay rather than the physics or the amount of data. The grid is drawn by walking across the map one cell at a time, and the map zooms out to fit whatever you have placed -- so on a map spanning 85,103 light years the hex grid was asked for **4.4 billion** hexes. Measured on a fast desktop that is about **1.8 hours** of solid work while building a **670 GB** block of text, so it ran out of memory and took the tab with it every single time; the square grid asked for 108,000 lines and a 5 MB one. It happens *after* the physics has finished, which is why the loading bar sat at 100% while the app was already gone. The grid now simply stops drawing once a cell is smaller than three screen pixels -- at that zoom it was a grey haze rather than a grid, and the 3D starmap has always worked this way. **Nothing changes at any zoom you would actually work at**: on the bundled map the grid draws exactly as before. Verified by reproducing the reported map: it used to be unloadable, and now loads in about a seventh of a second.

## v2.1.489-beta - 8th Aug 2026

* **New: "Save a diagnostic file" — one file that says what went wrong.** In **Settings > System > Reporting a problem**, and also offered whenever a load is stopped or fails to finish. It saves a zip containing a report of what the app was doing (memory against the limit the browser allows, your device, how long each part of loading took, how big the map is and in what units) alongside a copy of your starmap, so a problem can be reproduced rather than guessed at. When a load fails part-way it carries **both** the saved map and the half-updated one, which is what distinguishes a problem with the data from a device that simply cannot keep up. It saves to your device; nothing is sent anywhere, the file itself explains what is in it, and you can delete the map from the zip and still send something useful. Post it to FrunkQ on the Discord -- it also works as a backup of your campaign.

## v2.1.488-beta - 8th Aug 2026

* **A load that gets stuck can no longer cost you your campaign.** If the app is still loading and something has locked up, the loading screen now has a **Stop load** button, and it names the system it is working on -- so if it does stick, that name says where. And if a load never finishes at all, the next visit no longer tries the same thing again: it says where loading stopped and offers three ways out -- try again, start without loading the map, or **download a copy of your saved map as a file**. That last one reads the map straight out of storage without drawing anything, so a map that will not load can still be rescued. Nothing is deleted at any point.
* **Fixed: loading was many times slower in a background tab.** The loading loop pauses briefly after each system so the progress bar can keep up -- but browsers slow those pauses right down in a tab you are not looking at, turning a fraction of a second per system into a full second each. On the bundled map that was 44 seconds instead of 2, with no slow work anywhere; it now only pauses while the tab is actually visible.
* **New: a memory readout in Settings (System), and a warning before you run out.** It shows how much memory this tab is using against the limit the browser will allow, and warns you once at 80% and again at 90% -- in time to save your campaign to a file, which along with reloading the tab is the reliable way to bring it down. (Chrome and Edge report this; other browsers do not, and it says so rather than guessing.)
* Internal: switchable performance tracing for the memory and slowdown hunt -- add `?perf=1` to the address, and the console reports frame rate, memory, 3D resource counts and per-stage load timings every five seconds. Off unless asked for.

## v2.1.487-beta - 8th Aug 2026

* Internal: engine documentation brought up to date at the close of the camera and framing work. A stale entry that recorded a reverted fix (and would have sent the next reader the wrong way) is corrected, the orbit-line story is written up as one report with two distinct causes in two different families of line, and the design document now records what actually shipped along with the field reports that shaped it.

## v2.1.486-beta - 8th Aug 2026

* **Fixed: a followed station's orbit line swept back and forth at real time and buzzed at speed.** The line was drawn as a fixed 1024-sided polygon while the station rides the true curve, so the gap between ship and line breathed once per polygon edge -- about every five seconds of game time for the ISS, blurring into vibration at faster clock rates. Satellite orbit lines now re-draw the stretch nearest the camera from the orbit itself, packed dense exactly where you are looking -- the same treatment that made the Pluto-Charon lines smooth -- and slide it with you every frame. Distant orbit lines are untouched and cost nothing extra.

## v2.1.485-beta - 8th Aug 2026

* Internal: the residual orbit-line sweep while following a station (smooth at real time, buzzing at speed) is diagnosed and banked in the observations inbox -- the ship rides the true curve while the drawn ring is a 1024-sided polygon, so at station zoom the line's corner-cutting sweeps past the ship once per polygon edge. A different mechanism from the vibration fixed in v2.1.484, recorded with its numbers and fix direction.

## v2.1.484-beta - 8th Aug 2026

* **Fixed (third time, measured this time): the vibrating orbit line while following a station.** The diagnostic run confirmed both halves: the shaking line is a satellite's ring around its planet -- a different construction from the sun-circling rings the two earlier fixes repaired -- and the shake is single-precision rounding, measured at 4.7 pixels per step at that zoom. Such a ring's points are now combined with its planet's position at double precision, rounded once, exactly as the sun-circling rings already were; the switch happens automatically whenever the rounding would exceed a quarter of a pixel, so distant rings keep the cheap path.
* **Fixed (also measured): a ship in transit facing the wrong way.** The diagnostic showed the ship had not moved at all -- with the GM's clock paused, position reports stop, and the old rule ("point the nose along the motion") never ran, leaving the hull in whatever pose it loaded in. Every earlier facing report was this. A ship with a course now takes its heading from the course itself, which knows the direction at any moment whether or not anything is moving; braking ships still turn engines-first, and the nose end is still derived from where the GM mounted the drives.

## v2.1.483-beta - 8th Aug 2026

* Internal: two diagnostics ahead of two persistent reports. `window.__ringDebug` prints, once a second, which FAMILY of orbit line the focused body even has (a station's ring around a planet is built differently from a planet's ring around the sun -- the two earlier vibration fixes only ever touched the second kind) plus a live prediction, in pixels, of the wobble that single-precision rounding would cause at the current zoom -- so one clock-run says whether the remaining vibration is that mechanism or something else. And `window.__routeDebug` now carries the ship-facing diagnostic for every ship in transit regardless of what is selected -- the first facing trace came back describing whatever happened to be selected, which was a parked station.

## v2.1.482-beta - 8th Aug 2026

* **Fixed (properly this time): orbit lines vibrating while the view rides a moving body.** The previous fix steadied the line's detail level but not its centre -- the high-detail stretch of the line snapped from point to point as the camera moved, redistributing the whole line in visible steps. The centre now moves continuously and the high-detail stretch re-draws every frame, so it slides with the motion instead of stepping. (The earlier fix also only applied to sun-circling orbits; this covers the case actually reported, a station orbiting a planet with the camera following.)
* **Fixed: a ship shown mid-burn by the GM had no plume on the player view -- the ship and its torch were on two different clocks.** A player's free-running clock races hours past the GM's within minutes (the default rate is 1 s = 1 h), and while the ship itself is drawn where the GM's last report put it, its engine state was being judged at the local clock -- long past the burn. Everything time-judged about a ship (plume, burn colour flip, route-line visibility, journey framing) is now evaluated at the same instant its drawn position describes: the display clock when following the GM, else the time of the GM's report.

## v2.1.482-beta - 3rd Aug 2026

* **Charted stars no longer shine through the planet in front of them.** A star behind a world -- and the cross flare that marks it -- was being drawn over the top of it. It is now occluded properly, cut off cleanly at the limb, and it behaves the same way with a CRT or night-vision filter running.

## v2.1.481-beta - 8th Aug 2026

* While following the GM's clock, the player map now shows the campaign date -- bottom-left, where the local time controls would otherwise be, formatted through the campaign's own calendar so it always reads the same as the GM's clock bar. A free-running local clock stays deliberately unlabelled.
* Internal: the facing diagnostic now reports the whole chain -- where the drives sit in model space, the nose direction derived from them, and whether the ship's actual frame-to-frame motion points at its destination. The 480 facing report exhausted what reasoning can settle: every consistent reading of the model predicts a correct facing, so one assumed fact is wrong and only measurement says which.

## v2.1.480-beta - 8th Aug 2026

* **Ships in transit now MOVE on a player view that follows the GM's clock** -- run the clock, scrub it, pause it, and every ship under way slides along its drawn course to match, sitting exactly on its line with burns and plume agreeing at the displayed moment. A player scrubbing their OWN clock still sees orbits move while transit traffic holds its last GM-reported position, exactly as the player-setup disclaimer says: scrubbing is for looking around; live traffic runs on the GM's clock.
* **Fixed (again, properly): which way a moving ship faces.** Yesterday's fix inverted the wrong thing -- the 3D library does point a model's nose at what it is told to face; the real fault is that some models are AUTHORED nose-backwards, and nothing can tell which end of a hull is the front by looking at the shape. The GM's placed engine nozzles can: they mark the stern, so the ship now works out its own nose from where its drives are mounted. Yesterday's report and today's picture were the same backwards model seen through two different corrections.
* A small reset button fades in beside the player's time controls once their clock has wandered from the campaign's, and returns to it in one click -- to the GM's live clock when connected, else the newest time the GM left on any placed ship.

## v2.1.479-beta - 8th Aug 2026

* **Fixed: a ship under way flew backwards -- nose pointed at the planet it had just left.** The 3D library's "face this point" call actually points an object's tail at the point, and the model convention puts the nose on the other axis, so every moving ship was drawn 180 degrees off. Nobody had ever seen it because until this week no moving construct had ever been rendered in 3D: the GM's system view is the flat orrery, and player views drew transiting ships parked. Braking ships still turn engines-first, as they should.
* **Fixed: zooming out from a ship close-up appeared to stop working.** It never stopped -- at the mouse wheel's fixed 5% per notch, getting from a true-scale ship back out to the system takes about 400 notches, most of them through empty black with nothing in frame to show progress. The wheel now covers more ground per notch the further below system scale you are (about 8x at ship scale, unchanged at planet scale), which brings the climb down to roughly a dozen flicks.
* **Fixed: the route line's burn colours blended smoothly into each other instead of switching at the burn points.** Colours sit on the line's corner points and the renderer fades between them, so on a straight stretch with few corners the green faded into yellow across half the journey. Each stretch of the line now takes one colour and the change happens as a hard edge exactly where the burn starts or ends.

## v2.1.478-beta - 8th Aug 2026

* Internal: P3c signed off -- the transit route line and the drive plume confirmed working on a live player view. Design doc updated with the verified status and the researched follow-on (moving ships along their route with the display clock).

## v2.1.477-beta - 7th Aug 2026

* **Fixed: player views were showing the system at the wrong DATE.** The view opened its clock at today's real-world date, while everything the GM publishes is stamped in the campaign's own calendar -- measured in the field two months apart. Ships still appeared in the right place, because their position is sent rather than calculated, which is exactly why nothing looked wrong; but the planets were drawn where they had been two months earlier, the drive plume never lit, and a ship's transit route was built correctly and then hidden because the clock had not reached its start yet. The view now takes the campaign's date from the GM's clock where it has it, and otherwise from the timestamp the GM leaves on any ship it places -- so a system with traffic carries the right date whether or not the session is following the GM's clock.

## v2.1.476-beta - 7th Aug 2026

* **Fixed: orbit lines shimmered while the view followed something round its orbit.** The line refines itself around whatever you are watching, and it re-derives when the thing you are watching moves -- but it was choosing its detail from a camera distance that differed by a hair each time, so every re-derivation redistributed the whole line slightly differently. That distance is now snapped to steps, so a re-derivation that has not meaningfully changed produces exactly the same line. Fixed by making the answer stable rather than by asking for it less often, since a rarer wrong answer is still a visible jump.
* Internal: `window.__routeDebug = true` reports, once a second, why a transit route line is or is not on screen -- whether the route reached this view at all, whether the clock falls inside it, whether it built, and whether it is selected and named. There are five independent ways to get no line and none of them can be told apart by looking.

## v2.1.475-beta - 7th Aug 2026

* The physics page's known-fudges list now owns up to the transit route line: what a view draws is a re-estimate of the flown path, about a dozen corner points rebuilt into a curve, accurate to roughly a fifth of a percent of the journey's length. The reason is data rather than physics -- a ship under way rewrites what players receive about twice a second -- and the line is pinned to the ship so it passes through the vessel regardless.

## v2.1.474-beta - 7th Aug 2026

* Internal: fitting a ship's course to publish it was costing 3.4 ms per ship on a long haul, on two paths that both run about twice a second -- the broadcast to players and the 3D scene rebuild. Down to 1.3 ms by walking the two point lists together instead of comparing every point against every other, which is possible because both already run in order along the route.

## v2.1.473-beta - 7th Aug 2026

* **A ship under way now draws its course.** Select it and you see the route it is flying, curving the way the flight actually curves, coloured the way the GM's flat map colours it -- green where it is accelerating, yellow where it coasts, red where it brakes -- so you can see at a glance where the burns are. The line is drawn through the vessel itself, and it sharpens as you zoom in rather than turning into straight facets. Clicking a moving ship a second time now frames the whole journey, origin to destination, instead of the place it left.
* **Fixed: a ship in transit appeared parked back at the planet it departed from, on every player view.** The GM saw it out in space; players saw it sitting at home. The position was being sent correctly all along -- it was the flight plan travelling with it that players are not given, and the view would only look at the position when the plan was there to see.
* **Fixed: the drive plume never lit on a player view.** Not a secrecy problem, which is where everyone had been looking -- the engine data was crossing correctly, and had a test proving it. Player views were reading the clock from today's date while the GM's runs on the system's own calendar, so every burn was being checked against the wrong year and none of them ever matched. Positions were unaffected, which is why the view looked perfectly healthy.
* **Fixed: a drive plume lit nothing at true scale.** The plume throws light eight ship-lengths, but that was measured against the ship's real length while the view draws distant ships larger so they stay visible -- so the light was reaching a thousandth of the way across the hull it was meant to illuminate.
* Fixed: the course sent to players was built from a part of the flight plan that one of the two route planners leaves blank, so a fast route was published as a line running through the middle of the system. It now comes from the flown path itself, which is also what the ship's own position comes from, so the line and the ship cannot disagree.

## v2.1.472-beta - 7th Aug 2026

* Groundwork for showing a ship's course: a construct's current flight plan now travels to players alongside its engine burns. It crosses as the corner points of the plan - a handful of positions and times - rather than the full flight path, because a ship under way rewrites what players receive about twice a second and the full path would be thousands of points. A journey abandoned mid-flight is cut off where the ship actually stopped, rather than showing a course it never flew, and plans the GM has not committed to still stay private. Nothing is drawn yet; that follows.

## v2.1.471-beta - 7th Aug 2026

* Fixes the 3D view drifting or running away from whatever you were looking at. Both were one fault: the direction the camera approaches from was very slightly the wrong LENGTH whenever the thing you selected sits off the plane of the system, and the view multiplied its distance by that length every single frame. Below the plane it crept inwards a fraction of a percent a frame until it hit the closest it could go; above it, it ran outward and hit the far end of the scene in under a second. Same fault, opposite directions, which is why it looked like two separate problems and why it seemed to depend on the clock - the geometry moves as things orbit.

## v2.1.470-beta - 7th Aug 2026

* Internal: the 3D camera diagnostic now reports how far the thing you are watching moved since the last frame, and how much the camera's distance to it drifted over the same interval, both as fractions of the shot. If the two track each other, the drift is the clock moving the subject.

## v2.1.469-beta - 7th Aug 2026

* Dragging a 3D view around no longer zooms it, and the wheel no longer feels like it is being fought. The view worked out how far you wanted to be by looking at how far the camera actually was - but something was creeping the camera inwards by a fraction of a percent every frame, so simply turning the view slowly pulled you in, and zooming out was undone before you finished. Distance is now taken only from the wheel; dragging turns the view and nothing else, so a creep from any source can no longer be mistaken for something you asked for.

## v2.1.468-beta - 7th Aug 2026

* Internal: the 3D camera diagnostic now records WHICH input caused each change - wheel and which way it was turned, or a drag - and the distance at the moment it arrived, printed beside the distance now. Cause and effect in one line.

## v2.1.467-beta - 7th Aug 2026

* Internal: the 3D view's camera diagnostic now also reports whether the point the view rotates around has drifted from the point it measures against, which is the thing that would make dragging sideways read as a zoom.

## v2.1.466-beta - 7th Aug 2026

* Actually allows a 3D view below the plane of the system. The previous attempt only took effect once you changed a framing setting, because the limit is also set when the view is first created and that copy still said "not below the plane". Both now say the same thing.
* Fixes the zoom wheel behaving erratically - sometimes moving the same way whichever direction you turned it. A wheel or a drag is applied smoothly over many frames, but the view was only paying attention to the frame the event landed on and discarding everything after it, so what survived was whatever that single frame happened to hold. It now follows the whole gesture through.

## v2.1.465-beta - 6th Aug 2026

* A 3D view can now be flown BELOW the plane of the system. It was pinned above it, so half of every system was unreachable - and worse, selecting something on the underside of its world asked the camera for a position it was not allowed to hold, so the view never settled and the framing appeared to break. A ship on the far side of a planet from you is now something you can simply go and look at. Flat maps stay pinned overhead, which is the point of a map.

## v2.1.464-beta - 6th Aug 2026

* The stand-in shape for a construct with no 3D model now wears its symbol as repeated hull markings in a contrasting shade, rather than a single symbol pinned to one side. It reads from any angle and at any distance, and a craft with its own livery looks like a craft where one wearing a floating symbol looks like a label.

## v2.1.463-beta - 6th Aug 2026

* You can no longer zoom through the object you selected. The view now stops a metre off its surface, whether that is a true-scale world, a chunky readable one or a ship's hull. This also fixes distant bodies dropping out of the picture at extreme close-ups: flying inside a planet drove the near clipping plane so small that the depth buffer could no longer tell surfaces apart.
* Bodies and craft now share one lower size limit. They had limits a thousandfold apart, so at true scale a 10 km moonlet drew three times larger than a physically bigger 22 km station. The developer scale reference reports one fewer ordering violation as a result; the remaining four are the readable-size overlap, still to come.

## v2.1.462-beta - 6th Aug 2026

* The 3D view now approaches a selected object from its parent's side, so a moon or a station in low orbit can no longer end up hidden behind the very world it orbits. Previously the camera came in from the direction of the system centre and knew nothing about the parent. Where no such angle exists - a station skimming its primary, where the shot has to sit further out than the gap between them - it falls back to the old approach rather than pretending.

## v2.1.461-beta - 6th Aug 2026

* The stand-in shape for a construct with no 3D model now carries its map symbol, so a close-up still tells you what the thing is rather than just how big it is. Same triangle/circle/diamond/cross/square vocabulary the map marker uses, in the same colour.

## v2.1.460-beta - 6th Aug 2026

* The stand-in shape for a construct with no 3D model now glows in the construct's own icon colour, with a brighter edge, instead of drawing black on black. The scene's only real light is its star, so anything relying on being lit disappears in shadow or far from the sun - the marker it replaces never did, because a marker is self-lit.
* Selecting a construct that sits ON a world now frames the WORLD, viewed from directly above the construct so it sits dead centre on the disc. Framing a surface construct to its own size flew the camera inside the planet, and its hull is not drawn at all in that case, so there was nothing to look at either way.

## v2.1.459-beta - 6th Aug 2026

* A construct with no 3D model is now drawn as a simple ellipsoid at its authored dimensions, instead of an icon that stays the same size however close you get. Zooming to one finally shows you something, and it is an honest something: the shape says how big the craft is without inventing detail the data does not have. It also fixes their framing, because the camera and the shape now read the same dimensions - previously a model-less construct had no size at all as far as the camera was concerned, and selecting one gave an arbitrary shot. Drive plumes work on them too.

## v2.1.458-beta - 6th Aug 2026

* Fixes the 3D view still creeping away from a selected object. The camera worked out what you wanted by looking at where the camera was - which is only sound if nothing else ever moves it, and in a scene this size that keeps turning out to be untrue. Anything that nudged it was read as you zooming out, applied, and then read again, so the error compounded. It now looks at the camera only on a frame where you actually dragged, scrolled or the view was turning on its own. Nothing else can be mistaken for you.

## v2.1.457-beta - 6th Aug 2026

* Fixes the 3D view drifting away from whatever you selected until the whole system was a speck. The view periodically re-centres its internal coordinates on you - a housekeeping step you are not meant to notice - and the camera was mistaking that shift for you having dragged it. It then moved further out, which made the next shift larger, so the error doubled every frame until it hit the far end of the scene. Selecting a body now frames it and stays there.

## v2.1.456-beta - 6th Aug 2026

* Fixes selecting a body in a 3D player view moving the camera the wrong way. While the view was gliding to a new shot it kept reading its own movement back as if you had done it, so the glide cancelled itself after a single frame and the camera stopped near where it started - which looked like the zoom running backwards. It now flies the whole way in, and touching the mouse still takes the view off it at any point.

## v2.1.455-beta - 6th Aug 2026

* The 3D view's camera is rebuilt on the new model. The shot the system wants is worked out fresh every frame from where things actually are, and whatever you have done by dragging or zooming rides on top of it. In practice: a ship under way can no longer outrun the shot, a snapshot arriving from the GM no longer restarts it, nothing pulls the camera back once it settles, and the only thing that takes the view off you is selecting something. The old machinery this replaces - a frame counter that either gave up mid-flight or never let go, a separate auto-framing policy with a floor a thousand times too far out for a true-scale ship, and a flag every piece of code had to remember to respect - is gone rather than patched.
* Locked-heading views (the 2D map and the projector) keep their frozen heading, but now by declaring it rather than by overwriting the camera every frame, which is what used to read as the view fighting you.

## v2.1.454-beta - 6th Aug 2026

* Internal, not yet wired in: the camera's new motion model. The view becomes two things - the shot the system wants, recomputed every frame from where things actually are, and whatever you have done to it by dragging or zooming. They recombine each frame, so a ship can fly as fast as it likes without escaping the shot, the scene can rebuild underneath you without disturbing the view, and nothing can take the camera back except an explicit re-frame. Carries a regression test for each of the six framing faults found on 5th August.

## v2.1.453-beta - 6th Aug 2026

* Internal, no visible change: the maths deciding where the camera goes for a given shot is now one pure, tested module rather than arithmetic spread through the 3D scene. Pinned by a test that runs the old code beside the new across every framing level, subject size and lens shape. Completes the extraction step of the camera redesign.

## v2.1.452-beta - 6th Aug 2026

* New developer screen at /scale-reference: every class of object - star, gas giant, terrestrial, moon, asteroid, station, ship - with the size it actually renders at, across the whole body-size dial and four system widths. It runs the real sizing rule rather than a copy, so it cannot disagree with the 3D view, and it flags every place where a physically larger object draws smaller than a smaller one. It reports five such places today, including one at TRUE scale where a 10 km moonlet out-draws a 22 km station because bodies and ships have floors a thousand times apart.

## v2.1.451-beta - 6th Aug 2026

* Internal, no visible change: the rule deciding how big anything draws in the 3D view is now one tested module instead of four copies hidden inside the scene. Pinned by a test that runs the old arithmetic beside the new one at every dial setting, so an accidental change in look fails a test rather than reaching a screen. First step of the camera and scale redesign.

## v2.1.451-beta - 4th Aug 2026

* **Fixed: importing the real sky into a NEW starmap produced an empty map.** "Local Neighbourhood" imported zero systems, and widening the radius to 18 light years imported exactly one — because every host inside it is curated on the BUNDLED map, and the importer was treating that as a reason to withhold the star. It now skips a star only when the map you are importing INTO already holds it, so a new map gets all 21 systems and appending onto the bundled map still skips the ones already there. The map description also says which star it is centred on rather than repeating the preset's name.
* Fixed: the bundled starmaps had been re-saved by a script that writes numbers differently from the generator ({2e-05} where the generator writes {0.00002}), so the build kit could no longer reproduce them. Regenerated from the kit -- no values changed, and the pin test that guards the two against drifting apart is green again.

## v2.1.450-beta - 5th Aug 2026

* Framing a ship that is UNDER WAY now works. Every incoming snapshot rebuilt the scene and threw the camera's focus away with it - and a construct in transit rewrites the snapshot about twice a second, so on a player's screen the shot was abandoned and restarted continuously and never got near the ship. A ship in a stable orbit does not move the snapshot, which is why that case looked fine and this one did not. A refresh of the system already on screen now keeps the focus; only moving to a different system clears it.

## v2.1.449-beta - 5th Aug 2026

* Internal: proved the drive-burn path a player actually receives. The existing tests covered the burn maths in isolation and stayed green while a ship showed no plume, because nothing checked that the snapshot a player is SENT carries the burns. It does - burns cross, journeys and drafts stay behind. The ship diagnostic now also reports the live thrust and whether the node holds any burn data at all, so "the plume is not lit" can be told apart from "the ship is coasting".

## v2.1.448-beta - 5th Aug 2026

* Selecting a ship in a 3D view now actually arrives at it. The camera's approach eased LINEARLY across a scene that spans ten orders of magnitude, so it never reached a true-scale hull - it stopped wherever its counter ran out, leaving the ship a speck in a shot most of the system wide. It also flew through absolute space, so a small fast mover (a station in low orbit, a ship under way) simply outran it: the camera closed to within a fraction of the distance and found the target further away again on the next frame, which is why the only way to look at one was to pause the clock. The approach now closes a constant proportion per frame and travels with the body. Measured on a true-scale station with the clock running: the settled shot went from 1.5e-3 scene units to 1.9e-8, and the hull from 0.0002 pixels to about 19.
* The same fault was what "wrestled the camera away" while panning: the approach stayed armed forever because it never arrived, re-placing the camera every frame, and only a nudge of the zoom wheel escaped it. It now finishes and hands the view back.
* A ship's framing no longer depends on whether its 3D model has finished loading. The shot and the zoom floor both read the hull length from the authored dimensions, which are known immediately, so the same click gives the same shot every time instead of racing the download.
* The auto-framing floor no longer holds the camera a thousand times further out than a true-scale hull's own framing distance, which used to haul the view back out the moment the approach finished.
* New diagnostic to match window.__shipDebug: window.__camDebug logs what shot the camera is aiming for, which ladder level it chose, where it actually is and whether the approach is still running.

## v2.1.447-beta - 5th Aug 2026

* Ship models are drawn at the right size. A hull was scaled by its model file's own native size on top of the size the scene asked for, so the bundled space station drew 25 times too large - a 109 m station spanning a fifth of an AU across the inner system. The error was the model FILE's size, so every model was wrong by a different amount and in either direction, and a model carrying an orientation fix was correct, which is why it looked erratic rather than simply broken. The drive plume also sat at the middle of the hull instead of its stern.
* The ship-scale diagnostic now reports what the hull ACTUALLY measures on screen, not just the size the scene intended. It previously reported a serene 7 pixels while the ship was really 204 pixels across, so measuring it confirmed the wrong answer.

## v2.1.446-beta - 5th Aug 2026

* The ship picture in an info block is bigger. A hull is long and thin, so the space a planet's globe fills left a ship looking like a distant speck: the panel now gives a ship a taller band, and the camera frames the hull with only a whisker of margin instead of the generous fit a sphere implies.

## v2.1.445-beta - 5th Aug 2026

* Internal only: developer notes. Three findings banked for their owners, including a build-kit test that has started failing because a bundled starmap was edited by hand rather than through its generator. No change to the app.

## v2.1.444-beta - 5th Aug 2026

* A diagnostic for ship scale: setting window.__shipDebug = true in any window logs, once a second, what a ship's model is actually being drawn at - its true length, the camera distance, the viewport, the dial setting and the resulting size in SCREEN PIXELS. Ship scale has been misdiagnosed from screenshots several times, because the drawn size depends on all of those together and none of them can be read off a picture; measured at 1:1 the hull comes out at exactly the intended 7 pixels.

## v2.1.443-beta - 5th Aug 2026

* Internal only: developer notes. The engine map gains the position and eclipse rules — where a moon gets rotated into its planet's equator, and why a panel showing a predicted date reads the clock once a second rather than every frame. No change to the app.

## v2.1.440-beta - 5th Aug 2026

* Bundled spacecraft models are now REFERENCED rather than copied. Picking one of the NASA starter hulls used to duplicate its bytes into your browser's storage, into every save file, and over the wire to every player - for a file all of them already had, because it ships with the app. A construct now simply points at it. That costs no storage, adds nothing to a save, and needs no transfer: a player's browser resolves the same path locally. Your own uploads are unchanged and still travel with the campaign.
* Because a reference costs nothing, the bundled maps ship pre-modelled: the International Space Station carries the real NASA model of itself in both Local Neighbourhood maps and the Sol 2030 system, with NASA's public-domain credit attached. Only genuine matches are wired this way - a model of a real craft belongs to that craft and nothing else.

## v2.1.439-beta - 5th Aug 2026

* Drive plumes reach the player views now. A ship under power lit its torch on the GM's map and coasted silently on everyone else's, because a player's snapshot has its journeys stripped - they carry huge path arrays and the ship's forward plan, neither of which should cross - and the journeys are what say a ship is burning. The snapshot now carries the burns in a compact form instead: when, how hard, which way, and nothing else. No route, no destination, no path. The player evaluates them against their own clock, so the plume stays live between broadcasts rather than freezing at whatever it was when one arrived, and GM and player read the same thrust at the same instant.

## v2.1.438-beta - 5th Aug 2026

* FIX: at 1:1 scale ships were drawn astronomically large - hulls spanning much of the inner system - and grew further when you zoomed in by hand. The floor that keeps a ship legible works out how big it must be drawn to occupy a minimum number of PIXELS; it did so by dividing by the ship's current on-screen size, and at true scale that divisor lands on the guard value put there to avoid dividing by zero. Once the guard took over, the size stopped tracking the camera: hence both the enormous hulls and the growing-as-you-zoom. It now computes the world size the floor needs directly, with no division, so a ship holds the same size on screen at every distance and shrinks in step as you close on it.

## v2.1.437-beta - 5th Aug 2026

* THE ACTUAL CAUSE of ships showing an icon instead of their 3D model, found by watching a live player view rather than reasoning about it: when drive plumes became a list (one per placed nozzle), the function that colours the exhaust was left reading the old single-plume shape. It threw on EVERY construct with a model - inside a catch that said nothing - so the hull silently never attached and the glyph stood in, in every view, at every zoom. Ships render again. The three previous attempts at this, which changed visibility rules, level-of-detail thresholds and camera framing, were all chasing innocent code.
* Those catches now warn instead of swallowing. A model that cannot be built still falls back to the icon, as it should, but it says why - the silence is what made this take four attempts to find.

## v2.1.436-beta - 4th Aug 2026

* THE REAL FIX for 3D ships vanishing on the player's map: a ship IN TRANSIT never got its model, while a parked one always did. A moving ship changes the broadcast snapshot continuously, so a player's view rebuilds its scene about twice a second - and the model loader, which is asynchronous, re-checked whether its build was still current after every step and gave up when it was not. It therefore never finished for anything that was moving. Hulls are now cached by content hash the moment they are parsed, so a rebuild re-attaches them instantly with no asynchronous step to lose, and the cache is filled even when the build that requested it has already gone. Reproduced as a test first: the old path attaches nothing under a rebuild storm, the new one attaches immediately.
* Drive plumes follow the render style now: in a wireframe scene the exhaust is drawn as vector geometry like the hull it comes from, instead of a solid glowing cone hanging off a wireframe ship.

## v2.1.435-beta - 4th Aug 2026

* TWO REGRESSIONS FIXED, both mine, both re-breaking something that already worked. (1) A burning ship shrank to a speck in its own portrait: the camera framed a live bounding box that included the drive plume, which runs to about three hull-lengths, so the hull was pushed away the moment it lit. The earlier fix - measure the hull ONCE when the model loads, before any plume exists - was undone by the free-orbit rewrite and is now restored, and pinned by a test that fails if anything measures live again. (2) A ship showed only its icon on the map however far you zoomed in: yesterday's change required it to be in the focus set, which a ship in deep space never is. A loaded hull now always replaces the glyph, as it did before, with a screen-size floor for legibility rather than a reason to hide it.

## v2.1.434-beta - 4th Aug 2026

* FIX: a player view showed a ship's icon where the GM view showed its 3D model. The model was hidden whenever it would draw smaller than about ten pixels, on the grounds that it would be mush - but a preset that frames the whole system (and so never zooms to a body) leaves every ship below that line permanently, so the hull never appeared however long you looked at it. The model is now ENLARGED to a readable size instead of being hidden, which is exactly how the true-scale body floor already works: keep the honest render, guarantee its legibility in screen space. A ship that is not the focus still draws its small dim glyph, because a four-pixel model is a smudge where a four-pixel glyph is still a marker.

## v2.1.433-beta - 4th Aug 2026

* Uploaded BODY pictures can record their provenance too - credit, licence and source sit under the custom-image controls in the planet editor, matching the ship editor, and CC-BY without a named author is flagged. Body photos were the last uploaded asset that always landed in a save's ATTRIBUTIONS.md as anonymous. Replacing a picture keeps the credit already entered.

## v2.1.432-beta - 4th Aug 2026

* FIX: "Edit model" opened on an empty preview. The dialog only ever showed a NEWLY chosen file, so a ship that already had a hull had nothing to edit - and its orientation and attribution came up blank as if it had never been set. It now loads what the construct actually has: the stored binary, its alignment, its drives, its credit and licence, with the title reading "Edit 3D Model". If the binary is not on this machine (someone else's campaign opened without its bundle) it says so instead of showing an empty frame.
* FIX: placed drives only lit up in the editor. Every other surface still drew one plume at the stern, because neither the info-block portrait nor the map read the placement. Both do now - place four drives and you see four, in the GM's data panel, the player's document and the 3D map alike, with the size dial honoured and the width shared between them so a four-drive ship reads as one ship under power rather than four torches.

## v2.1.431-beta - 4th Aug 2026

* The 3D model dialog is much bigger and you can fly around the ship in it. The preview now fills its column (up to 62% of the window height) on a dialog half again as wide, and the camera FREE-ORBITS: drag to swing over, under and behind the hull, wheel or pinch to close right in on a nacelle, "Reset view" to get back. It used to be a yaw-only turntable, which could not reach the stern or the belly - exactly where you need to look when placing drives. Near and far planes follow the working distance, so a close-up does not clip through the hull.
* Placing drives survives all that: a drag that ends over the ship is treated as navigation, not as a click that drops a drive. The wheel is only captured in the editor, never in the info-block portrait, so scrolling a panel with a ship in it still scrolls the panel.

## v2.1.430-beta - 5th Aug 2026

* **Choosing what to highlight now happens in Find by tag**, which already knows what is on the map, with colours and counts. Drag a tag chip or a category bubble into the tray at the bottom — "Show highlight markers on player views" — or press the + on a tag. Player Views → Quick overrides is now just the mute for it, so you can drop the badges mid-scene without losing the selection you built.
* Two tag pickers, deliberately: **Find by tag** offers only what something actually carries (right for highlighting — badging a tag nothing has shows nothing), while the full-vocabulary picker offers everything the app knows including the engine's own namespaces (right for adding a tag by hand, where the first one has to come from somewhere).
* On the starmap a highlight now behaves as a filter by default: systems carrying none of it fade back, and a key names what the colours mean. Marker size follows the label scale rather than adding another control.

## v2.1.430-beta - 4th Aug 2026

* Every save bundle now carries an ATTRIBUTIONS.md: each uploaded model and picture listed once with what uses it (a hull shared by three ships is credited once, naming all three), its title, credit, licence and source. It names the gaps too - an asset with nothing recorded says so, and anything licensed CC-BY with no author credited is called out as a breach rather than a gap, because sharing the save is where that obligation lands. Provenance now travels with the art, in a file a person can read without the app.
* Construct pictures can record their provenance at last: credit, licence and source URL sit beside the picture in the Appearance block. The fields have existed on the data since V1 and nothing ever filled them, so every uploaded image was anonymous. Replacing a picture keeps the credit you already entered.

## v2.1.429-beta - 4th Aug 2026

* SAVES ARE BUNDLES NOW, for a campaign AND for a single system. A save that carries assets is written as a zip (`.sse.zip`) holding a small, readable `starmap.json` / `system.json` beside `assets/models/*.glb` and `assets/images/*` as ordinary files - so you can open a save in any zip tool, read and hand-edit the JSON without scrolling past walls of base64, and swap a hull or a photo by replacing a file. It is also smaller: base64 cost 33% on top of the biggest bytes in the file. A save with no assets is still written as plain `.json`, exactly as before.
* NOTHING STOPS LOADING. Both formats open, and the loader decides by the zip magic number rather than the file name, so a renamed save still works. A README inside each bundle explains the layout. Body photos, which used to sit on nodes as inline data URLs, now travel as real image files too - so they no longer bloat the JSON either.

## v2.1.428-beta - 4th Aug 2026

* FOUND THE WAY A 3D MODEL GOES MISSING, and it is not storage: loading a construct TEMPLATE (or importing a construct file) replaced the ship's whole spec, and its picture and 3D model rode along with it - the template's blank fields won, so a ship you had already dressed came back plain with nothing looking broken. Appearance is now its own category, neither situation nor spec: the ship KEEPS its image, model, marker shape and colour unless the incoming template brings its own, in which case the template wins. Pinned by test.
* A construct .json file now carries its model's BINARY, not just the hash - opening one on another machine used to land a reference pointing at nothing and fall back to the icon glyph. Same embedding the campaign export uses, verified against its own hash on the way in.
* Model storage now asks the browser for the persistent bucket on first save. IndexedDB is evictable by default under storage pressure, which is exactly what a campaign full of model binaries invites.

## v2.1.427-beta - 4th Aug 2026

* FIX: Pitch/Yaw/Roll stopped working in the 3D model dialog ("setOrient is not a function"). The engine-placement refactor replaced the block of viewer methods between setBurn and setSize, and setOrient sat inside it - so the method vanished from the object while its INTERFACE declaration remained, which is why the compiler stayed silent and only the click failed. Restored, along with the livery accent that the same edit dropped from the preview path. A new structural test now asserts every method the viewer's contract declares is actually present, and it was mutation-checked: delete setOrient again and the test fails.

## v2.1.426-beta - 4th Aug 2026

* Map highlights reach the players' PRINTED/CRT system view. The GM's selection rides the same broadcast as the other live overrides. **Not yet the 3D holo or the 2D overhead player views, nor the player starmap** — those render through different components (HoloView, Starmap3DView) which have not been wired. The GM's own system map and starmap badge correctly.
* A secret tag can never become a player badge, and that is now a test rather than an argument: highlighting names a category or a key, never a body, and a player view is handed the already-redacted snapshot, so the secret faction was gone before any marker existed. It still badges on the GM's own map, which is the point of keeping the two apart.

## v2.1.425-beta - 4th Aug 2026

* The tag guide is rewritten around what tags are actually for: the app's main currency and its natural-language layer, where the physics decides what is true and writes tags, and everything else — renderers, rules, the finder, you — reads tags. It covers the parts that were undocumented (provenance, categories, per-tag colour, overriding the physics, secret tags, map highlights) and says honestly that the separation is not complete yet.
* "Points of Interest" and "Constructs of Interest" are gone from the interface. They were two names for one idea. Rule-seeded tags now say so, the tooltip points at Settings → Tagging rather than a menu that no longer exists, and the rule reference page is the tagging rule reference.

## v2.1.424-beta - 4th Aug 2026

* **Map highlights.** Pick a whole tag category or a single tag from Player Views → Quick overrides, and it gets badged on the maps — yours and the players', from the one selection, so what you pick is what they see. A category flies each of its tags in its own colour (one Faction category, a different colour per faction); a single tag shows only where it is, which is the "just show them where the refuelling is" case without configuring anything first.
* On the **starmap** a system badges the union of what everything inside it carries, not just its star — the interesting cases are never on the star. Several factions in one system all show, because contested space is a real answer rather than a rendering problem. Four badges then "+N".
* Secret tags and player-hidden categories can never become a player-facing badge, so leaving a faction highlighted is safe.

## v2.1.423-beta - 4th Aug 2026

* A tag's provenance is now declared by its CATEGORY rather than by a hardcoded list of key prefixes buried in the tagging module. The tag itself carries only the simple part — was this put here by hand — and the category answers what a tag in that namespace is otherwise: derived every pass, or written once at generation and never re-derived. Adding a namespace to the engine no longer means remembering to update a list somewhere else, which is the kind of thing that goes wrong silently.

## v2.1.422-beta - 4th Aug 2026

* ENGINE PLACEMENT, and it is a clicker rather than a plane: the model dialog is now two steps - Facing, then Engines. In the Engines step, click the ship wherever a drive sits and a plume lights there; click a chip to remove one; a Size dial sets how wide they all are. Length and brightness still come from real thrust on the map, and the plumes preview in the ship's own authored exhaust colour while you place them. Placing nothing means one plume at the stern, which suits most hulls. Points are stored in the model's own space, so re-orienting the ship later carries its drives with it instead of stranding them.
* The construct's appearance controls are ONE compact block instead of three stacked groups: colour at the top (marker, hull tint and plume dressing all follow it), then marker shape, picture, 3D model, shading, and a drive summary - each a labelled row in a two-column grid, about half the height it used to take. Shading also moved into the model dialog, next to a new Livery accent control (Auto derives the contrast hue from the ship's colour; untick to pin your own), so the whole look can be set in one place while watching the preview.

## v2.1.421-beta - 4th Aug 2026

* **A44 — a generated tag no longer claims the physics made it.** Tags like `spin/axis-inferred` (this obliquity was inferred, not measured) or `origin/generated` (this world was invented to fill out a real star) were shown under a red padlock reading "derived from the physics — fixed, recomputed every run". Every word was wrong: nothing re-derives them, they are the generator's own record, and you can legitimately delete one. They now sit under **Generated**, removable, saying so. The Newton panel — the one that claims to show its working — was making the same misattribution and now names them too.
* **You can override the physics.** Pick a physics namespace on any body's Tags tab (Geology, Tidal, Aurora, Habitability…) and add a tag by hand. It survives every re-derive, suppresses the tag the engine would have written, and drives everything the real one drives — visuals, rules, find-by-tag. It is grouped as a **GM override** and labelled as possibly contradicting the physics, because it might.
* **Secret tags.** Mark any hand-added tag secret and it never reaches a player — not the catalogue, not a player view, not the holo table, not a printed report. A whole category can be hidden the same way. Redaction happens at the single point every player surface reads.
* B38: the habitability pass cleared its own tag namespace in two separate branches, which is how the two came to disagree about hand-added tags. It clears once now, where the pass begins.

## v2.1.420-beta - 4th Aug 2026

* The GM's data block now shows the ship burning: the 3D portrait lights the same plume the map draws, in the drive's authored exhaust colour, whenever the ship is under thrust at the display clock - so scrubbing a transit shows the burn, the coast, and the braking burn in turn. The portrait is larger, drag-to-spin, and the ship stays centred while the plume is free to run off the edge.
* Fixed while wiring it: the ship-capability lookup called calculateFullConstructSpecs with the rule pack where it takes engine and fuel arrays, so it threw into its own catch and EVERY ship silently fell back to the default thrust ceiling - plumes scaled against 1 g instead of the ship's real drive. Both hosts corrected.

## v2.1.419-beta - 4th Aug 2026

* THE DRIVE PLUME NEVER LIT, AND COULD NOT HAVE. Burn detection differenced the path sampler's velocity, which is piecewise constant inside a segment - so it measured zero acceleration through a full-power burn and the plume and the brake flip never fired. It now reads the planner's OWN segment labels (Accel / Brake / Coast / Correction) and their delta-v, which is the published decision rather than a re-derivation. Seven tests pin it, including the piecewise-constant case that fooled the old code; nothing caught this before because no bundled construct carries a journey.
* Exhaust colour is authored on the DRIVE DESIGN now, authentically: xenon ion the famous NSTAR blue, Hall thrusters bluer-violet, argon plasma violet, hydrazine RCS near-colourless, methalox blue, hot-hydrogen NTR faintest blue, gas-core brighter, Orion pulse white-gold, fusion torch brilliant blue-white, antimatter violet-white, astrophage red on the Petrova line - and the Alcubierre ring authored as "none", because a reactionless drive has no exhaust and drawing one would be a lie. All 13 engines in the starter pack carry it.
* Plumes GLOW: a wide soft halo blooms with the square of thrust over the core, so a hard burn reads as a bright smear from any angle - including straight down, which is what the "2D" map is.

## v2.1.418-beta - 4th Aug 2026

* Livery contrast accent, DERIVED not dialled (owner decision: no second colour slider): the Panelled and Weathered finishes now carry a seeded complementary accent computed from the ship's own colour - accent panels and a livery stripe on the plating, oxidation blooming toward the accent hue in the weathering (verdigris on a copper hull, rust on a blue one). Saturation and lightness are floored so a grey or near-black hull still earns a coloured accent. One colour to touch, per ship variation for free; if control is ever wanted the lever is pack data, not a slider.

## v2.1.417-beta - 4th Aug 2026

* Welcome copy sharpened: the physics rewrite now says what it bought -- weather and lightning, aurorae, stellar flares and the dose they deliver, with the gases and liquids behind them editable; player views mention the filters and transitions that dress them for your setting; the 3D view notes that worlds are lit by their own star; and the night-sky line is shorter and no longer says the same thing twice.

## v2.1.416-beta - 4th Aug 2026

* The V3 welcome gains the campaign's own night sky -- the systems on your starmap standing in as real stars behind the 3D view, visible on player views too -- and names Foundry alongside Mappadux and Owlbear Rodeo as the virtual tabletops in testing.

## v2.1.416-beta - 4th Aug 2026

* Coordinator round (fixes only). G13: the export/import of ship-model binaries (live since v2.1.396) is now PINNED by a round-trip spec - byte-identical through collect/embed/import, ref-only when a binary was never local, tampered blobs refused. A46: the info block's portrait-system builder is ONE exported function consumed by both document surfaces (was two identical copies). G15(4): a ship's drive-plume colour is rule-pack DATA now - optional exhaust_color_hex on the engine definition, derived per ship from its dominant engine by the host; the scene never reads the pack.

## v2.1.415-beta - 4th Aug 2026

* The V3 welcome now lists what V3 actually is: the rewritten physics engine, player views, the 3D system view, starmaps with real depth (and 2D still working exactly as before), 3D ships, one tagging system throughout, real-sky importers, eclipse times, VTT integration in testing, retuned generation, the rebuilt default starmaps, and the long tail of fixes. Blurbs are a first pass and will be sharpened as each feature is bottomed out.

## v2.1.414-beta - 4th Aug 2026

* Real-sky import tells you what a big import will COST before you commit to one: alongside the system and planet counts, the dialogue now shows the estimated size, how long the map will take to load, and a plain reading (comfortable / large / very large). Past the comfortable band it offers a real alternative rather than advice -- a one-tap chip naming the exact radius that brings it back in range and how many systems that leaves ("Radius 13 ly -> 120 systems"), found by searching the rows already in hand. A very large import is allowed but gated behind a confirmation restating the cost, and past a hard ceiling it is refused with a reason. Nothing is ever silently trimmed: a truncated map that claims to be a survey is worse than no map.
* The welcome screen is now a V3 placeholder rather than the V2 release notes, and returning users will see it once.
* Internal: the importer's list of "hosts the bundled maps already curate" is no longer a hand-kept copy of the starmap roster -- the build kit generates it, and the test suite fails by name if the two ever disagree.

## v2.1.413-beta - 4th Aug 2026

* **The GM body panel now shows the next eclipse**, with the orbital rows where it belongs — the same line the player views already carried, from the same builder and the same clock, so the two can never word it differently. Mars reads "in 50 d - 37% annular (Phobos)"; a moon gets the view from its own surface, so Luna reads "76% partial (Earth)". A world with nothing to hide its star simply has no row.

## v2.1.412-beta - 4th Aug 2026

* Internal only: the developer notes record the satellite-frame fix, the green suite, and a per-session working-tree recipe that stops parallel work sweeping each other. No change to the app.

## v2.1.411-beta - 4th Aug 2026

* **The test suite is green again**, for the first time in about a hundred and twenty versions. Four tests covering the app's own start-up have been failing since v2.1.274 for two unrelated reasons — a storage mock that never grew a function the page had started calling, and two assertions still looking for a heading the reorganised New Starmap screen no longer has. The cost was never those four tests: it was that "the tests pass" meant nothing, so any real breakage had somewhere to hide.

## v2.1.410-beta - 4th Aug 2026

* **A moon's position is now correct everywhere, not just on screen.** A satellite's orbit is quoted in its planet's equator, and that rotation was applied only by the 3D view — so anything else that asked the engine where a moon was got an answer up to the planet's whole axial tilt out of true (25 degrees at Mars, 98 at Uranus). The rotation has moved into the position engine itself, and the 3D view stopped doing it. The picture is unchanged, to the last decimal; eclipse predictions, distances and alignments are now built on the same positions you are looking at.

## v2.1.409-beta - 4th Aug 2026

* **Settings → Tagging replaces the PoI and CoIs sections, and one editor replaces both.** Tags were explained in two places that each told half the story; now there is one screen that says where tags come from — the physics, the automated rules, or you — and one editor where a category owns its colour, its tags, its rules and what it can be applied to.
* **Any single tag can carry its own colour**, overriding its category's. That is the whole mechanism behind one Faction category flying a different colour per faction — no promotion step, no second system.
* A category can be **hidden from players**, and says which kinds of object it applies to (star, planet, moon, belt, ring, construct). A rule's "applies to" is ghosted to what its category allows, so a rule can't target something the category doesn't cover.
* Categories save and load as single files (`.tagcategory.json`), replacing the separate PoI-pack and CoI-pack formats. Deleting a category now tells you plainly that tags already applied to bodies and ships stay put — it stops describing them, it doesn't delete them.

## v2.1.408-beta - 4th Aug 2026

* Tag categories now live in ONE store. PoI categories and CoI categories were always the same thing — a named group of tags with a colour, a list and a namespace — kept in two stores with two file formats, two editors, and two disagreeing definitions of "core" (six protected categories on one side, one on the other). They are one set now, and `resource/*`, which the two used to own half each, is a single category that means "extractable here" on a world and "carried" on a ship, exactly as the autopilot already read it. No visible change yet; the settings screens still look the same.
* A system category can no longer be DELETED — the engine matches those slugs by hand, and a dangling one breaks refuelling or mining with no error — but it can still be switched OFF, which is what "core" should have meant all along. Categories that ship disabled stay disabled.

## v2.1.407-beta - 4th Aug 2026

* Tags are case-insensitive. `Smugglers`, `smugglers` and `SMUGGLERS` are one tag, stored in one spelling and title-cased back for display, so what you see is unchanged. Typing a tag with spaces now works too — "Red Syndicate" becomes `red-syndicate` instead of a malformed key that the next save threw away. Two private copies of "make a label safe" were unified into the tagging module, and the free-text field, which used neither, now uses the shared one.
* The real-sky importer's `origin/generated` tag — the marker that says a world was invented to fill out a system rather than detected — had no description and rendered with a generic namespace blurb. It now explains itself, which for an honesty marker is the whole point.

## v2.1.406-beta - 3rd Aug 2026

* **"Depth tethers" can be turned off on the 3D starmap.** The vertical stems running down from each system to the reference plane, and the little rings marking where they land, are now a tick-box in the starmap's display settings. They are what makes an exaggerated depth readable -- without them you cannot tell which side of the plane a star is on -- but on a map with real depth and a crowded field they are also the loudest thing on it, so it is your call.

## v2.1.405-beta - 4th Aug 2026

* G3: solid wireframe, seeded liveries, and the NASA starter hulls. (1) The -occ wireframe styles now OCCLUDE on ship models - a depth-only copy of the hull (polygon-offset back a hair) hides far-side wires and anything behind, the bodies' nested-occluder trick generalised to arbitrary geometry. (2) Three new procedural finishes, all seeded by the construct's id so two ships sharing a hull wear different liveries: Panelled hull (seam-and-vent plating painted in the ship's colour, box-projected onto UV-less meshes), Weathered (oxidation splotches and streaking), and Iridescent (three.js physical iridescence). (3) Six real public-domain NASA craft ship as starter hulls (ISS, Hubble, Cassini, Juno, Voyager, MRO - under 1 MB total, fetched on demand), picked from a dropdown in the model dialog with attribution prefilled. Credits added to About and the README, including three.js / meshoptimizer / Draco.

## v2.1.404-beta - 3rd Aug 2026

* Real-sky import now uses LIVE archive data in the browser. Measured from the deployed site (and confirmed in the owner's console): the NASA Exoplanet Archive sends no CORS header, so direct browser queries are always blocked -- it was never intermittent. A small same-origin proxy (/api/realsky-tap, SELECT-on-pscomppars only) now forwards the query server-side, so imports are as fresh as the archive; the bundled snapshot remains the offline fallback and says which source answered. The About dialogue gains the archive's and SIMBAD's requested acknowledgements alongside the image credits.

## v2.1.403-beta - 3rd Aug 2026

* Import from the Real Sky: build a starmap straight from the astronomy catalogues. The New Starmap screen (now reorganised into example / bring-in / start-empty groups) gains an import dialogue with worked presets -- the Local Neighbourhood, an extended 30-light-year shell, a region around TRAPPIST-1, and Sagittarius A* imported as a single system with the ten best-measured S-stars swinging round the black hole on their real published orbits (S2: 16 years, e 0.884). Any SIMBAD name works as a custom centre. Only confirmed planets import, positions are true 3D positions, systems the bundled maps already curate are skipped and say so, and hosts missing catalogue data are skipped by name rather than invented. Live queries fall back to a bundled snapshot when offline, with the coverage limit stated.
* Optionally fill imported systems out with plausible generated worlds: the generator runs around each real star tuned to its measured mass and light, confirmed planets stay exactly where the catalogue puts them (with a dynamical exclusion zone around each), and every generated body is tagged origin/generated. Deterministic by star -- one person's import is everyone's, so a strange world reproduces on every machine.
* Right-click empty starmap space: "Import Real Stars Here…" drops a real-sky region centred on the clicked point, alongside whatever the map already holds. The dialogue docks to the side while a dashed ring on the map shows the true footprint as the radius slides, existing systems inside the footprint are listed, and anything already on the map is skipped as a duplicate.
* Imported stars are completed with the rule pack's magnetic-field band and a spin-axis tilt (the catalogues carry neither), using the same functions and per-star seeding as the generator's own stars.

## v2.1.402-beta - 3rd Aug 2026

* G3 style round. (1) Hull models follow the map's render style: a wireframe scene renders a wireframe ship, exactly as it does the planets (F6 parity). (2) The design's procedural finish menu is live under the Filled style - Flat + panel lines / Cel shaded / Brushed metal (generated matcap) / Blueprint (bright edges over a ghost hull) - picked per construct from a Shading dropdown beside the model buttons; a chosen finish dresses even an authored GLB. (3) Focusing a ship no longer fights the mouse: the wheel releases the focus ease immediately, and the hull close-up frames at about a quarter of the view instead of half with room for the plume.

## v2.1.401-beta - 3rd Aug 2026

* **Two dials for the charted stars in the system view's sky.** "Star boost" sets how far they stand out: it fades the generic starfield back and lifts the real systems together, from true brightness at one end to deliberately oversaturated at the other. "Name size" sizes the labels -- and its left end is Off, so you can look at the diffraction spikes on their own.
* **Long star names were being cut off.** In-scene labels were drawn into a fixed-width canvas sized for "5 AU", so anything longer lost its tail -- "Teegarden's Star" needs nearly twice the room. The canvas is measured from the text now.

## v2.1.400-beta - 3rd Aug 2026

* G3 true-scale polish from live testing. (1) Orbit-line VIBRATION at ship scale fixed - the A23 refinement's floors (sag tolerance 1e-12, concentration 0.002) clamped the dense arc ~3x coarser than the budget at a 100 m working distance, so every re-centre jumped the line; floors lowered to 1e-13 / 1e-5. (2) The ship now faces its orbit line at true scale - the heading guard was an absolute epsilon that swallowed metre-per-frame motion; it is now 0.1% of the hull length. (3) THE BODY-SIZE DIAL IS LOG-SPACED NOW, for bodies, stars and ships alike: sizes interpolate geometrically (true^(1-v) x readable^v), so every step multiplies size by a constant ratio - the 20-90% dead zone is gone and the 0-5% cliff is spread across the travel. THIS CHANGES MID-DIAL LOOKS IN EXISTING PRESETS (readable and true endpoints unchanged). Ships shed size faster than planets automatically (bigger readable-to-true ratio), replacing the squared-weight hack. (4) The import modal now shows BOTH alignment arrows, labelled: orange = rear of ship (main drive), green = direction of travel.

## v2.1.399-beta - 3rd Aug 2026

* G3 scale corrections from live testing: constructs now shrink FASTER than planets down the body-size dial (squared blend weight - at 5% a station reads near its real size instead of half an Earth, handing to its icon when too small), and the true-scale blackout is fixed - the camera near-plane floor (1e-8) sat ABOVE the framing distance of a 100 m ship, clipping the whole scene; it now follows the framing all the way down (1e-11). The drive plume's light reach also scales with the hull, so a burning shuttle no longer lights planets.

## v2.1.398-beta - 3rd Aug 2026

* G3 ship scale: a construct model's size now follows the SAME body-size dial blend as planets - at the readable end a log-mapped marker length derived from the authored dimensions (a 1 km cruiser visibly dwarfs a 110 m frigate), at the true end genuinely 1:1 (metres through the same conversion body radii use, renderable because the floating origin puts the focused ship at the origin). Below ~10 px the ICON stands in and above it the hull draws, at every dial position; focusing a modelled ship frames the hull itself, and the min-zoom floor comes down so a true-scale ship can fill the screen.

## v2.1.397-beta - 3rd Aug 2026

* G3 scene half (owner-directed): focusing a construct in the 3D view swaps its glyph for the actual hull - standard framing, nose-first along its motion, FLIPPED during a deceleration burn (a torch ship brakes engines-first; decided from the transit sampler's own velocities, never from screen deltas), with a drive plume at the stern whose length and light scale with the fraction of the ship's OWN drive in use (100% = super bright and long; capability computed by the host from the rule pack). The model contributes no radius to clearance or framing, 2D views keep the glyph, and one shared display builder means the modal preview, the info block and the scene render the same approved form.

## v2.1.396-beta - 3rd Aug 2026

* G3 feedback round: the GM construct pane shows the ship (model > image > glyph chain, new ConstructPortrait); the player document now puts the MODEL first too (model > photo > glyph, was photo-first); the import modal aligns by the MAIN DRIVE against an orange marker (convention: nose +Z, drive -Z, stored on the ref); a saved .json embeds model binaries and restores them on load; remote players fetch missing models by hash over the broadcast (REQUEST_MODEL / SYNC_MODEL) and the glyph gives way when the ship arrives.

## v2.1.394-beta - 3rd Aug 2026

* (entry restored - lost to a shared-tree autostash) G3 stage 4: a construct with a 3D model shows it in the info block on BOTH document consumers - live turntable in the reserved gap, icon_color flat-shaded finish with panel-line edges for material-less meshes, attribution line beneath, glyph fallback when the binary is not local.

## v2.1.393-beta - 3rd Aug 2026

* Unified tagging phase A, the persistence half: a hand-added tag now survives being SAVED, not just re-processed. The export/import fix-up filtered on the key alone, so an override inside a derived namespace was written out of the file and a free-text tag with a capital in it ("Smugglers", the Tags tab's own example) was read back as a legacy display-name tag and dropped — a tag that looked permanent until the next time the campaign was opened. Seven round-trip tests, including that the save still sheds the derived tags and classes it is meant to.

## v2.1.392-beta - 3rd Aug 2026

* Unified tagging, phase A: one authority decides which tags a re-derive pass may delete (`src/lib/tags/tagLifecycle.ts`). Thirty-four strip sites had each decided for themselves and twenty-five of them silently deleted hand-added tags — so a GM tag inside a physics namespace could not survive, and `importFixup` deleted one on save as well. Physics and rule tags are still cleared and re-derived; anything the engine cannot re-create (hand-added, generation provenance, construct hardware and runtime state) now survives, and an override suppresses its derived twin rather than duplicating it. Generation provenance — the `spin/*` inferred-value promise among it — is named as a class rather than surviving by nobody having listed it. 44 new tests; `solar-system-derived.json` byte-identical.

## v2.1.391-beta - 3rd Aug 2026

* G3 stage 3: the model import modal - live preview of the converted bytes, 90-degree orientation fix stored on the ref, attribution fields (CC-BY flagged when credit is missing), caps feedback. Wired into the construct editor beside the image.

## v2.1.390-beta - 3rd Aug 2026

* Real-sky import, the library half: the starmap build kit's core (position mathematics, spectral classification, mass-radius estimation) now lives in `src/lib/import/realsky/` and is shared with a new importer library — TAP query builders for the NASA Exoplanet Archive, SIMBAD and Gaia DR3 with count-before-fetch region queries; a mass-aware cluster gate (dynamical time, not density, decides — S2's 16-year orbit around Sgr A* offers a system, a bound red-dwarf knot stays a starmap); and a confirmed-only converter that turns archive rows into starmap systems at true 3D positions, refuses to overwrite the curated bundled systems, and names every host it skips rather than inventing data. 32 tests; the bundled maps are byte-identical throughout. No UI yet — the New Starmap wiring is scoped separately (see the observations inbox).

## v2.1.389-beta - 3rd Aug 2026

* VTT integration 1A: starmaps now carry a persistent, human-readable broadcast session id (name slug + two SF words + three digits, crypto RNG) minted on load and saved with the map, so player links and QR codes survive GM reloads and PC moves. Hosting collisions prompt the owner instead of silently regenerating.

## v2.1.388-beta - 3rd Aug 2026

* G3 stage 2: model conversion and caps - STL/OBJ convert to GLB, meshopt simplification for high-poly printing meshes (30k+ triangles down to ~20k), texture resampling on re-encode, warn 500 KB / hard 2 MB. A compliant GLB stores byte-identical, keeping its compression. New dependency: meshoptimizer (MIT).

## v2.1.387-beta - 3rd Aug 2026

* G3 phase 1, stage 1: construct 3D-model groundwork - ModelRef on the node, hash-addressed model store (own IndexedDB), GLB/STL/OBJ parsing with Draco + meshopt decoding wired (decoder vendored to static/draco/, Apache-2.0 from three's own distribution). No UI yet.

## v2.1.386-beta - 3rd Aug 2026

* **The 3D system view's grid is a distance now, not a decoration.** It used to be a fraction of the view, so it meant nothing and changed size as you moved. It is a real number of AU, and it steps by decade as you zoom -- brightening and subdividing into ten on the way in, coarsening on the way out -- with the two levels crossfading so it reads as one grid rather than jumping.
* **A correction worth stating plainly: the 3D starmap's "Polar + scale" rings have been reporting distances about 43 times too large.** They were labelling the map's own internal coordinates rather than light years, so on the bundled Local Neighbourhood the outer ring read "1091 ly" across a neighbourhood that is 25 ly to its edge. They now read 4, 8, 12, 16, 20 and 24 ly.
* **Every scale ring and grid label across all four map views lands on a round number** -- 1, 2 or 5 and its tens -- from one shared piece of arithmetic. "5 AU" is a scale you can use; "3.7 AU" is noise wearing a number.

## v2.1.385-beta - 3rd Aug 2026

* **The "show me the working" panel actually shows the working for a world's brightness.** It used to give you the finished number and a phrase; it now walks the whole chain — the bare ground its makeup implies, the dust or frost lying on top of it, the cloud deck above that, and what the world reflects in the end. Mars reads 0.105 bare, 0.252 with its rust, 0.256 through its wisps.
* **A new card for a world's spin**: its tilt, whether that gives it real seasons, and — for a moon — which plane its orbit is quoted in and why. It says plainly when a figure was inferred by the engine rather than measured by somebody.
* **Eclipses are documented for the first time**, on the physics page: where the observer is standing, what can pass in front of your star, why standing on the surface rather than at the centre is what makes totality possible at all, and what the prediction deliberately is not.
* The physics page gains sections on albedo, spin axes and the spatial views (grids and routes), and its contents list is no longer missing an entry.
* The radiation reading for the space above a world is described correctly everywhere now — it is the dose inside the belts, not the dose where a ship would park.

## v2.1.384-beta - 3rd Aug 2026

* **The 3D system view can show your campaign's own stars in its sky.** Every charted system, at its true direction, its real brightness and its own colour, drawn in front of the generic starfield rather than instead of it. Sol seen from Alpha Centauri comes out at magnitude 0.5, exactly as it should -- and from Sol, Sirius, Alpha Centauri, Vega, Procyon and Altair all land within a third of a magnitude of the real night sky, which is a pleasing thing to be able to check.
* **Three settings, not a switch.** "True sky" draws only what an eye could actually see there and is otherwise indistinguishable from the backdrop. "Marked" gives the same stars diffraction spikes and names -- spikes are a telescope artifact rather than something you see, so they read as an annotation instead of a claim, and they get longer on the brighter stars.
* Worth knowing before you turn it on: a 42-system map is a very sparse sky. Expect to recognise a star you know rather than to trace constellations; that comes with a bigger map.

## v2.1.383-beta - 3rd Aug 2026

* **Every world now says when its next eclipse is, and how dark it gets.** A new row in the body block, so it turns up in the GM's inspector, in printed player reports and in the info panels on the player views alike -- "in 107 d - 37% annular (Phobos)". Anything that would hide less than a quarter of the star is left out, because that is a transit rather than an eclipse and nobody would look up.
* **A moon that is eclipsed on every orbit says so instead of quoting a date.** Io is in Jupiter's shadow every 1.8 days; that is a day and a night, not an event, and a date for it would be meaningless. Callisto, which really does escape the shadow for part of the cycle, still gets a date -- the rule is the geometry, not "is it a moon of a giant".
* The three famous cases behave: Luna only just covers the Sun, Phobos is far too small ever to manage it, and Deimos is a speck. It says "when these orbits next line up" rather than pretending to be an ephemeris -- real eclipse seasons drift, and this one's do not.

## v2.1.382-beta - 3rd Aug 2026

* **Asteroid belts and planetary rings now carry a radiation warning.** Jupiter's rings sit in the fiercest place in the Solar System — worse than Io — and had nothing on them at all, because the warning was being worked out in a step that skips anything which is not a planet or a moon. Jupiter's rings read lethal in *hours*, Saturn's in weeks, the main belt a long-term risk, the Kuiper belt background.
* Everything else that step does stays off for them on purpose: a cloud of debris has no magnetic field, no geology and no single surface, so those are left blank rather than invented.
* **Uranus and Neptune stop claiming to have a surface.** Their radiation was labelled "at the surface" — they are ice giants and have not got one. Now reported at the 1-bar level, like Jupiter and Saturn.
* **"Radiation in orbit" now says which orbit it means.** Earth's figure is the dose inside the Van Allen belts, and reading it as "the dose where a station sits" is wrong by four thousand times — the ISS flies below the belts. The row now reads "in the belts, from ~1,262 km", with the altitude worked out per world, and the tag is renamed to *Radiation belts*. The numbers themselves have not changed.

## v2.1.381-beta - 3rd Aug 2026

* **Routes on the 3D starmap go to the stars now, not to the floor beneath them.** They were lines on the plane, which was right until systems were given a depth -- since then a route has ended at a system's shadow rather than at the system. The glow band follows the line up with it, and a route's name rides the line instead of hovering under it. The 2D starmap is the plan view and stays flat, which is the point of it.

## v2.1.380-beta - 2nd Aug 2026

* **The radiation rows fit again.** They read "weeks - 213 Sv/y - lethal dose in ~8.6 days", which was long enough to be cut off and looked like it disagreed with itself -- the word at the front and the figure at the end are two ways of saying the same thing at different resolutions. The row now carries the measurement and a skull marking the time: "213 Sv/y - 8.6 d". The word is still on the radiation tag, where a bucket is useful because you can filter on it.

## v2.1.378-beta - 2nd Aug 2026

* **Hex numbering covers the subsectors that have something in them, and covers them WHOLE.** It used to stop dead after four hundred hexes, filling the left of the map and leaving the right bare. Now a subsector with a star in it gets its full grid addressed and an empty one gets none -- the numbers are there to give you a reference frame around what is on the map, and blank space does not need one.
* **A new "Subsector hex" overlay: the boundaries without the numbers**, for maps that want to read as sectored without the addressing.
* **Grid depth is a slider, not a switch** -- how far the curtain hangs below each grid line is the whole of the effect, so it is worth being able to dial. Still 3D only; the 2D starmap sees a curtain edge-on.

## v2.1.377-beta - 2nd Aug 2026

* **Every grid in the app is now drawn by one piece of geometry.** The system view had its own private copy, and its hexes were the wrong way up -- pointy-topped where the GM map and both starmaps are flat-topped. It never showed, because system-scale hexes are folded to squares before they can be drawn, but it was one decision away from showing. Deleted rather than kept.
* The system grid still sits in its disc, and there are now tests that fail if either the disc or the flat-topped hex is ever lost.

## v2.1.376-beta - 2nd Aug 2026

* **Grid falloff is on the system view too, not just the starmap.** Its own setting, and off by default -- the system grid has always been evenly lit and should not change unless you ask it to.

## v2.1.375-beta - 2nd Aug 2026

* **"Grid falloff" -- one dial from an even grid to bright near cells that fade out toward the edge of the field.** It works on every overlay: squares, hexes, Traveller hexes and the polar rings.
* Polar rings and spokes are drawn the same way as every other grid now, which is what lets them take the falloff and the depth option at all. They used to have a fixed brightness ladder baked in; with falloff turned right down the outer rings are brighter than they used to be.
* Checked the player's hexes against the GM's own grid: same origin, same cell size, same geometry, so a system snapped to a hex on your map sits dead-centre in the hex a player sees.

## v2.1.373-beta - 2nd Aug 2026

* **A Traveller hex map looks like one again.** It was drawing the same picture as a plain hex grid: the numbers only appeared on hexes bigger than a twenty-fourth of the whole map, so in practice never, and the subsector boundaries did not exist in the starmap renderer at all. Both are there now -- the heavy 8x10 boundary lines, with the proper zig-zag down the column edge, and numbers that show at readable sizes.
* **Grids are flat.** Every grid line used to hang a short curtain beneath it whether you wanted it or not, which is a depth cue the overhead 2D map can never show.
* **"Grid depth" is now a checkbox on the 3D starmap** -- the line at full brightness with the curtain fading away below it, for anyone who liked the old look.

## v2.1.372-beta - 3rd Aug 2026

* **Worlds are the brightness they actually measure.** Bare rock was one flat value for everything, which made airless rock too bright and dusty or frosted worlds far too dark. Now the ground is dark — Mercury reflects 0.088 and Luna 0.11, matching the real figures — and what makes a world bright is what has settled on top of it.
* **Mars is orange and bright because of its rust**, which the engine already worked out and had never used for anything you could see. It now reflects 0.256 against a measured 0.25.
* **Io is brilliant because its sulphur dioxide is frozen onto the ground.** Any world whose main atmospheric gas is below its own freezing point gets the same treatment, so Pluto and Triton brighten too, and Earth's nitrogen never comes close.
* **Mars has its thin water-ice clouds back.** They were lost when a bogus carbon-dioxide deck was removed a while ago — that deck had been keeping Mars cold for the wrong reason. A correctly darker, colder Mars now condenses the real wisps on its own, with nothing in the cloud model changed.
* Pluto is much brighter and correspondingly colder, and has lost its methane wisps as a result. Its overall reflectivity is far closer to reality than it was; the thin haze is a separate question and is written down.

## v2.1.371-beta - 2nd Aug 2026

* **Square grids draw on the starmap.** They always had a full implementation; every line was being thrown away before it reached the screen, because the grid fades out with distance and a square line runs the whole width of the map -- so both of its ends were in the faded zone and the whole line went. Hexes never hit it, being one hex across, which is why hexes looked fine and squares looked missing.
* The square, hex and Traveller-hex lattices now come from one piece of geometry rather than three. Hex and Traveller hex look exactly as they did.
* And the 2D starmap already shows the same grid, because it turns out to BE the 3D one locked overhead -- so there was nothing to bring into line.

## v2.1.369-beta - 2nd Aug 2026

* **Info text size goes to 250%.** It stopped at 160%, which was not big enough for a table across the room.
* The document engine was capping it at 180% regardless, so the top of the slider would have moved the panel's own text and nothing written inside it. Both ends now agree, and a test fails the build if they ever stop agreeing.

## v2.1.368-beta - 2nd Aug 2026

* **A gas giant is no longer described as an eyeball world.** An eyeball is a world with a permanently-lit face — molten on one side, iced over on the other — which is a statement about ground. Fifteen gas giants were being called one. They now read as the ice giants, sub-Neptunes and cloud-type giants they are, including three in the Testion example that now match the names they were given.
* **A giant no longer offers to resupply you.** It was advertising life-support resupply, water/ice refuelling and water ice, because a planet-sized atmosphere does contain a lot of water by weight — as supercritical vapour, with nothing underneath to land on. Giants keep what you can actually take from orbit: helium-3, gas skimming, deuterium, aerobraking and gravity assists.
* **A stability verdict no longer argues with itself.** Worlds could read "a locked resonance keeps their conjunctions away from the crossing point, so it stays stable" and then "Predicted outcome: flung out". Both halves were true of different things; the verdict now names which one produced it, and the resonance note says what it actually established.
* **A world is classified as what it fully matches, not what it nearly matches.** A type the world sits inside every band of now beats one it falls outside of, however specific that type is. Wolf 1061 d stops being an ice giant at 7.7 Earth masses when the band starts at 8, and TRAPPIST-1 d stops being "icy except the substellar point" at 15 °C.
* The "why this type" panel lists the types a world genuinely fits before the ones that merely scored well.

## v2.1.367-beta - 2nd Aug 2026

* **The body picture in a player document is now part of the picture.** On a green CRT page the 3D globe sat on top of the phosphor as a plain white ball, because it was drawn over the filtered page rather than into it. It now goes through the same shader as everything else -- scanlines, warp and all -- and still spins, and you can still grab it.
* Checking that turned up more than was reported: the simple disc and the flat shape were not being filtered either. They looked right only because they already borrow the page's colours. A photo always was filtered.
* **The collapsed play button pauses.** It has been showing a pause icon and only opening the speed panel, which is worse than showing no icon at all.
* **A construct with no chosen icon is the same shape everywhere.** It drew as a diamond on the starmap and a triangle everywhere else -- the five glyph shapes lived in four places, and one had already drifted. They now come from one.

## v2.1.366-beta - 2nd Aug 2026

* **Generated moons now sit in the right plane.** A close-in moon rides its planet's tilted equator, the way Jupiter's big four do; one far enough out follows the system plane instead, the way our own Moon does. Where the changeover happens is worked out per planet from its spin, mass and distance from its star, so a fast-spinning giant holds its moons in line much further out than a small slow world does.
* Moons of a tilted planet visibly lean with it now — that only started working once every generated world got an axial tilt in the last release, because before that there was no tilt to inherit.
* **Adding a body by hand gets the same treatment.** A world added through the Add Body button now marks its invented tilt and spin the same way a generated one does, and its moons get the same choice of plane. Those were only ever applied on the generated path.
* The Moon sits in the right plane in the Expanse Sol example too, which had been missed when the other examples were fixed.

## v2.1.365-beta - 2nd Aug 2026

* **Three more of the physics pages caught up with the engine.** Which temperature decides a world's type is now explained -- fourteen types are judged on the surface you would stand on, twelve on the radiation environment, and the tell is that Earth's equilibrium temperature falls just outside the band of its own type while its surface sits comfortably inside it.
* Why a giant's leftover formation heat depends on its mass rather than on what its type is called -- and why the obvious shortcut of reading the type name was quietly handing mini-Neptunes Jupiter's heat.
* A new section on who gets ejected when two orbits cross, because it is not symmetric: the lighter body goes. That page also records the two things everyone assumed when a 16 km asteroid put "fated: flung out" on Mars, both of which turned out to be innocent.

## v2.1.364-beta - 2nd Aug 2026

* **Audited every tag the engine can produce, asking one question of each: does it report the thing its name claims?** The table is written down, clean entries included, so nobody has to work it out again.
* Tags no longer show you bare numbers. "Brilliant aurora: 0.78" was a figure on a scale nothing stated -- the strength is what the renderer needs, and the word "brilliant" is already in the name, so the number has gone. A self-luminous world says 1,500 K rather than 1500, and a polar vortex says 6-sided.
* A world that keeps four different ices now carries four tags rather than one reading "carbon-dioxide+nitrogen+water+methane".
* Three tags were reaching you with no explanation at all, because nothing had ever described them -- and two of them were the same observation shown twice under different names. Named and explained.
* Behind all of that: a set of checks that fail the build if a tag ever again shows a number with no unit, packs a list into one value, contradicts the figure it describes, or ships without a description. A corrected label drifts the moment the physics moves; a check does not.

## v2.1.363-beta - 2nd Aug 2026

* **Generated worlds have seasons.** Not one planet or moon the generator made had an axial tilt, so every generated world reported a flat year — a world's summer and winter were identical everywhere. Now they all lean, and three times as many worlds show a real seasonal temperature swing.
* Most worlds lean modestly, the way a planet does when it forms from its star's disc and is nudged from there. A few got hit hard enough to be knocked right over — the Solar System has two of those, Uranus on its side and Venus turning backwards — and those are called out as "Tipped over".
* **A tilt the engine guessed says so.** A generated world's tilt is marked "Spin axis inferred", so it cannot be mistaken for a measured figure like Earth's 23.4 degrees when the two sit side by side on the same starmap.
* The "violent past" setting in the generation wizard still tips stars further than a calm one — it now overrides the new baseline rather than being silently switched off by it.

## v2.1.362-beta - 2nd Aug 2026

* **The physics pages have a chapter on radiation belts and the giants**, which is the part of the model most likely to be assumed wrong. A belt is not a light source and does not thin out with the square of distance -- Io and Callisto sit four times apart and forty thousand times apart in dose. It stops above the atmosphere, and without that cut-off Earth would read as lethal at ground level. A giant sits inside its own belt, which is why it honestly needs two figures rather than one.
* And the bit a GM will otherwise get backwards: Jupiter's moons are savaged not because Jupiter shines on them but because it spins a magnetic field. A brown dwarf, from about thirteen Jupiter masses, genuinely does shine on its moons. Jupiter's own excess heat is infrared -- warm, not dangerous.
* Radiation now explains its two figures and its survival-time vocabulary on the page, not only in the tags.
* The tag guide has a short table of the tags a crew would actually act on, including why a world can be the most irradiated surface in a system and still read lightly weathered.
* The architecture notes described a processing order that stopped being true six versions ago. Corrected, with the rule that caused the change.

## v2.1.361-beta - 2nd Aug 2026

* **The Newton explainer shows the radiation working, which it never has.** It had fourteen layers explaining a world and not one of them mentioned the dose -- so for Io, where a trapped belt is the entire story, the panel that promises to show the working showed everything except the answer. It now walks the whole chain: incident flux, whether you are inside your host's belt and how far in, where your own belt starts, what your magnetosphere deflects and your air absorbs, and what reaches the ground -- with the time to a lethal dose beside it.
* It says out loud the three things about a giant that catch people out: a belt is not a light source and falls off exponentially rather than by inverse square, it stops above the atmosphere or Earth would read lethal at ground level, and a world with no surface honestly needs two figures rather than one.

## v2.1.360-beta - 2nd Aug 2026

* **The Moon sits in the right plane in the standalone Sol example**, as it already did in the two bundled starmaps. Its 5.1 degree tilt is quoted to the ecliptic, not to Earth's equator, and only the starmaps had been told.
* Two planets — one in Struve 2398, one in Groombridge 34 — start at a different point in their orbits. Housekeeping from the duplicate-id fix a few releases back; nothing about either world changes.
* Under the bonnet: the build kit that generates the two bundled starmaps reproduces them exactly again, and a test now rebuilds and compares on every run so the two cannot drift apart unnoticed. The science-fiction map also ships 75 KB smaller for no visible difference.

## v2.1.359-beta - 2nd Aug 2026

* **Radiation now tells you how long you last, not how many sieverts you take.** The hazard reads hours, days, weeks, months or years -- the time to a lethal dose, worked out from the dose rate rather than looked up in a table. Io is hours. Europa is days. Mars is years, which is the honest framing for a place you plan a mission to.
* Past fifty years the arithmetic stops meaning anything -- radiation sickness is not what a background dose does to you -- so it stops quoting a number and says "chronic" (a real long-term risk) or "background" (Earth). No world is told it dies in two thousand years.
* The data block spells it out once beside the figure: "lethal dose in ~3.4 h". It says nothing at all where saying something would be nonsense.
* How lethal a lethal dose is now lives in the rule pack, so a campaign with tougher characters can change it.
* **Two things the engine already worked out but never told you.** A world now carries what it costs to LEAVE it -- trivial, moderate, hard or extreme -- which is often the first thing a party needs to know. Luna is trivial, Mars moderate, Earth hard, Venus extreme.
* And where a ship parks gets its own hazard, but only when it is genuinely different news. In the whole solar system that is Earth and Venus: Earth's ground is background while the space just above it, inside the Van Allen belts, is a lethal dose in days.

## v2.1.358-beta - 2nd Aug 2026

* **A ring no longer reports a "surface" dose.** It has no surface -- but unlike a gas giant, which has nowhere to stand at all, a ring is countless small bodies that each do have one, so the number is real and useful: it is what a fragment takes and what a ship crossing the ring takes. It now says so -- "Radiation (in the ring plane)". Jupiter's rings read 360 sieverts a day, above Io, which is right: the main ring sits inside Io and close to the belt peak.
* The GM panel names the same place the player's does. It had been calling everything "Surface Radiation", including gas giants and rings.

## v2.1.357-beta - 2nd Aug 2026

* **A world now carries a radiation hazard you can see and filter on.** Io's tags said "Space weathering: low" -- true, because volcanism repaints its surface faster than anything can build up on it -- and nothing anywhere in the tag list mentioned that standing there costs you 36 sieverts a day. There is now a separate "Radiation hazard" tag reading background, elevated, high, severe or lethal, next to the weathering one, and the two say plainly that they are different readings. Io and Europa read lethal.
* The radiation row in the info block uses the same five words, so a world and its tag cannot disagree. It used to call Mars and Io both "high" -- sixty thousand times apart.
* A giant gets no surface hazard tag, having no surface to stand on. Its radiation row already says which level it describes.

## v2.1.356-beta - 2nd Aug 2026

* Measured how far the physics moves when a system is processed more than once, and wrote the curve into the inbox (B13). It settles after the second pass rather than compounding, but the first pass can be wildly out: an imported world reads its own radiation belt at ground level, which is what put Earth at 230 mSv/yr instead of 2.3.
* **A world now reads the same on the day you import it as it does after your first edit.** Processing a system used to give different answers depending on how many times it had been through -- radiation was worked out before the magnetic field that shields it and before the atmosphere that absorbs it, so a freshly imported Earth reported a hundred times its real surface dose, and Jupiter a million times its own. Radiation is now the last thing worked out, after every world has its field, its spin and its air.
* Io's radiation lands exactly on the 36 sieverts a day it was calibrated against, having quietly read 34.9; Ganymede's now matches the figure its own model predicts. Earth, Mars, Venus, Luna, Titan and Triton do not move at all.
* A binary pair's orbit no longer flips its periapsis by 180 degrees on every load, and a nested barycentre no longer starts life with the wrong total mass -- which had Alpha Centauri's two primaries declaring themselves unstable on the second load and not the first.
* Lightning is judged after the geology that drives it rather than before, so a tectonically active world's storms do not change on a reload.
* A mini-Neptune is no longer given Jupiter's leftover formation heat. Whether a giant is a gas or an ice giant is now decided by its mass, as the interior model already decided it, rather than by whether its type name happened to contain the words. Twelve worlds in the example systems get cooler, by 4 to 28 K; nothing in the bundled starmaps or in Sol changes.

## v2.1.355-beta - 2nd Aug 2026

* Greyscale is offered once, not twice. It was in the colouration list AND as a checkbox beside it; the list keeps it, since picking it already turns the page monochrome on its own. The 2D/3D map keeps its checkbox, having no palette list of its own.
* Less prose under the starmap controls.

## v2.1.354-beta - 2nd Aug 2026

* The starmap document has its OWN colours. They used to be inherited from the system info block on another step, which is the wrong place twice over: the two are different documents you will want to look different, and the greyscale a green-screen or CRT filter needs belongs to the stage being filtered. Same controls, same order, on the Starmap step.
* Eight more colourations, with GREYSCALE at the top of the list: Amber terminal, Blueprint, Holotable, Industrial hazard, Red alert, Clean room and Neon noir. Picking Greyscale takes the whole page to grey by itself -- one lever, not a palette plus a checkbox to match it.
* One word for one thing: what the 3D views called "monochrome/white" is now "Greyscale (for tinting filters)" everywhere, and the starmap's greyscale bleaches the map AND its document together.
* The diagram arrangements list each system's star, planet and moon counts again -- a diagram shows you the shape of a system but not how much is in it.

## v2.1.353-beta - 2nd Aug 2026

* Long lists alternate their row shading when there is no rainbow to tell the rows apart. A page of forty-two identically-coloured rows is hard to track across; the wash is faint enough to read as a change of shade rather than a box, and it never appears where the rainbow already does the job.
* Monochrome is now a property of the whole page rather than of each thing on it. It used to bleach only the text, so pictures and body discs each had to grey themselves out and anything new was liable to be the one coloured thing on a grey page. Everything -- type, procedural world textures, uploaded photos -- now goes to grey together, which is what the CRT and night-vision shaders need to colour it cleanly.

## v2.1.352-beta - 2nd Aug 2026

* Two more starmap arrangements, both the SAME orbital line-diagram the system page draws. "Compact" gives each system an unlabelled strip -- the shape of the system, read at a glance and compared down the column. "Full" is the same diagram at system-page size with its names.
* The diagram can now be drawn without its labels, and at a fixed height rather than a fraction of the screen -- forty-two systems at the system page size would have been seventeen screens of diagram.

## v2.1.351-beta - 1st Aug 2026

* A third starmap arrangement, "Catalogue": each system as its name beside a row of its actual worlds, drawn as small discs -- the primary largest, companions smaller, the planets a run of dots in orbital order. They are the same procedural 2D images the orrery draws, so every colour is the one the physics derived for that body.
* A text-size slider for the starmap document. It sizes the layout as well as the type: bigger text gives fewer, wider columns and larger glyphs, smaller fits more of the map on a screen.

## v2.1.350-beta - 1st Aug 2026

* A new list style, "Pickable cards": each entry a bordered box, as many across the page as the width allows, highlighting when picked. On the starmap that turns a forty-two row index into one screen you can take in at a glance. It is a LIST style, so it applies to every navigator list, not only the starmap.
* Lists now have their own control on the System step. They were previously fixed by whichever colouration you picked.

## v2.1.349-beta - 1st Aug 2026

* A navigator button keeps the colour the page gave it whichever navigator style is set. Only the side-by-side chips honoured it, so switching the navigation to one-button-per-row or plain text silently threw away the per-entry colours -- The Guide's rainbow drill-ins included.
* The dossier's "System data" button stays a compact chip whatever the navigator style is. It is a single action, and a full-width bar under each of forty-two entries is the wrong shape for one button.

## v2.1.348-beta - 1st Aug 2026

* The starmap dossier reads as a proper form. Its fields flow in as many COLUMNS as the page is wide -- one on a phone, three or four on a desktop -- with the label right against its value and a faint fill-in line under each, instead of the label at one edge of the page and its value at the other.
* Field icons: a star for the primary, a disc for planets, a ring for moons. On by default, and a checkbox on the Starmap step.
* Every companion star has its own numbered field, with its spectral class. A trinary used to have its third star quietly cut off the end of a joined list.
* Each entry now says how to open it -- a "System data" button in the entry's own colour -- and the whole entry is clickable, not just its title line. A page of fields gives no clue that it is a door.

## v2.1.347-beta - 1st Aug 2026

* The starmap document has ARRANGEMENTS. "Dossier" gives each system a heading over a form -- primary, companions, planets, moons, depth, and its distance from wherever you are -- instead of one row in an index. It is a new option on the Starmap step, and the colouration, fonts and list glyphs you already picked still apply on top of it.

## v2.1.346-beta - 1st Aug 2026

* The construct block is gated by one rule now: a row is a live reading if it changes minute to minute, and a specification if it does not. Status is a live reading. A berth -- an orbit, a dock, a landing -- is not, so it stays; a ship under way has no berth and no longer quotes its speed under a capacity heading.
* A cargo manifest is shown again, with live readings on, beside the tonnage it describes.
* A ship under autopilot lists the route it is flying, with live readings on.

## v2.1.345-beta - 1st Aug 2026

* A ship now quotes the performance it is RATED for. With live readings off there was no acceleration or delta-v row at all, because both existing figures describe how loaded and how fuelled the ship happens to be right now. A catalogue entry shows delta-v at full tanks and the acceleration band from full to empty, worked out with an empty hold so it is a property of the ship rather than of today's cargo.
* The GM construct panel reads that same band instead of working out its own, and gains a rated delta-v row beside the current one. Its band now means the ship's rated envelope rather than one carrying the current cargo.
* Very low accelerations read properly. An ion-drive station showed its whole acceleration band as "0.00-0.00 g".

## v2.1.344-beta - 1st Aug 2026

* Radiation now says what it is. A body could show its surface dose in millisieverts a year and its orbital dose in sieverts a year on the next line down, a thousandfold apart, with only a suffix to tell them apart -- and the surface row printed a range with no actual figure in it. Each row now carries one unit, chosen to suit the number, with the mean and its range in that same unit.
* The "Irradiation" tag is now called "Space weathering". It is a cumulative total relative to a young unshielded Earth, not a dose per year, and sitting beside two dose figures under that name made it read as a third one that disagreed with them. Io is the case in point: constantly resurfaced, so it weathers very little, while its radiation environment is among the fiercest in the solar system.
* Habitability is now shown as a score out of 100 rather than a percentage, so it is not read as a fraction of the surface next to the biosphere coverage that is one.

## v2.1.343-beta - 1st Aug 2026

* A construct has a picture again. Since the sphere a planet gets was removed from it -- a 110 m ship illustrated as a rocky world -- a ship or station has shown a blank where every world shows something. It now draws its own icon, in its own colour, at info-block size, so the entry agrees with the marker on the map.

## v2.1.342-beta - 1st Aug 2026

* The player info panel's width now follows the setting. It was converted to pixels once, when a preset was applied, so a width edited while the player window was shut arrived scaled to whatever screen last opened it -- and the top third of the slider did nothing, because the live view capped the panel at 640 px while the slider offered half the screen. The width is now worked out from the stored proportion and the CURRENT window, every time the window changes size.
* The info panel's drag handle works again. It was hidden at every width by a stylesheet rule that overrode the one meant to show it.

## v2.1.341-beta - 1st Aug 2026

* A planet now sits inside its own radiation belt. Jupiter read 11.5 mSv/yr -- less than Mars -- from the centre of the most intense radiation environment in the solar system, because the belt was only ever worked out against a body's HOST, and a planet's host is its star.
* Radiation is now reported as two named figures, because one number cannot answer both "what does the ground take" and "what does a ship take". Every body gets both: the surface (or, for a world with no surface, the one-bar reference level) and the environment above the atmosphere. Jupiter reads 11.5 mSv/yr at one bar and about 750 sieverts a DAY at its cloud tops -- roughly twenty times Io. That is the figure that matters for anything flying there.
* Belts do not reach the ground, and now the model knows it: an atmosphere absorbs trapped particles, so the belt begins a set number of scale heights up. That boundary is what keeps Earth's surface at its correct 2.3 mSv/yr while its orbital space correctly reads as the Van Allen belts. A world with no atmosphere has nothing to absorb them, so its belt does reach the surface.
* Saturn, Uranus and Neptune gain cloud-top figures far below Jupiter's rather than merely proportionally below. Nothing else moved: Earth, Mars and all four Galilean moons are unchanged to the last decimal.

## v2.1.340-beta - 1st Aug 2026

* Moons of giant planets now take radiation from their host's magnetic field, not just from the sun. Io reads about 35 sieverts a DAY instead of 21 millisieverts a year -- it sits deep inside Jupiter's particle belt and is one of the most violently irradiated surfaces in the solar system. The old figures gave Io and Europa the same dose to four significant figures, because how far they sit from the sun was the only thing either calculation knew about.
* The belt is derived from the host's magnetic field and spin, both of which the engine already worked out, so it applies to any world anywhere without anything being written by hand. It falls away sharply with distance: Io 35 sieverts a day, Europa 3.9, Ganymede 0.11, Callisto 0.00015. Saturn's field is far weaker and its moons come out far quieter -- Enceladus around ten thousand times below Io, and Titan sees essentially nothing.
* Worlds with no magnetised host are untouched, which is nearly all of them. The Moon, Earth and Triton are unchanged.

## v2.1.339-beta - 1st Aug 2026

* Gas giants no longer score for habitability. Uranus, Neptune and Saturn each read 50%, above Mars at 8% and Enceladus at 35%, which was never a weighting problem: habitability here is a SURFACE measure, and a giant has no surface. It scored zero on the two things that matter -- temperature and a liquid solvent, half the total between them -- and then collected full marks on atmospheric pressure, surface radiation and surface gravity, all three of which are measured at the notional one-bar cloud-top level a giant is defined by. A body with no solid surface now scores zero and says why.
* The subsurface-ocean niche is untouched, so Europa and Enceladus keep their scores; nothing with a real surface liquid was affected.

## v2.1.338-beta - 1st Aug 2026

* Mars is no longer predicted to be flung out of the Solar System. It shares a crossing orbit with 433 Eros, a sixteen-kilometre asteroid carried as a planet in the bundled map, and the engine was applying the pair's verdict to both bodies -- so a rock a hundred million times lighter than Mars was throwing it out of the system. An ejection is one-sided: the light body is scattered and the heavy one is what scatters it. The verdict now names which body is thrown. A collision between comparable masses is genuinely mutual and still applies to both.
* Seven bodies across the bundled maps lose an ejection they should never have had, and in every case it was the heavier half of the pair keeping it.

## v2.1.337-beta - 1st Aug 2026

* The Testion example system demonstrates four of its world types again. Its ammonia world carried a bar and a half of pure ammonia, which is a powerful greenhouse gas, and sat at 73 degrees C -- a temperature at which ammonia is a gas and cannot form the seas the type is named for. Its Earth-like and superhabitable worlds each carried twenty-five times Earth's carbon dioxide and ran at 73 and 98 degrees C. Its swamp world was, to two decimal places, Earth. In every case the authored data was wrong and the type's temperature band was right, so the data was corrected rather than the band widened.

## v2.1.336-beta - 1st Aug 2026

* Earth classifies as an Earth analogue again, rather than as a swamp world. The type was the only distinctive world type in the whole set carrying no importance weighting at all -- it sat level with plain "terrestrial" while forest, jungle and swamp all carried a boost -- so the most demanding description in the taxonomy lost to a less demanding one. Its five tightly-drawn bands were never the problem. A world now only earns the Earth-twin label when it matches all five; miss any of them and its biome describes it better.

## v2.1.335-beta - 1st Aug 2026

* Fourteen world types are now judged on the temperature of the ground rather than the temperature the world would have with no atmosphere. Desert, ice, lava, ocean, methane, ammonia, hycean, subsurface ocean, the three Earth-like types and the three life-covered ones all describe a SURFACE, so they now read the surface. A world with a strong greenhouse could previously be called an ammonia world at 73 degrees C, where ammonia cannot exist as a liquid at all, or "habitable Earth-like" at the same temperature.
* The types that describe the radiation a world sits in, or the chemistry of a giant's cloud tops, are unchanged and still read equilibrium temperature: the hot and ultra-hot Jupiters and Neptunes, chthonian worlds, ice giants, ultra-cool dwarfs and all five gas-giant cloud classes.
* Fixed at the same time: when a type moved to the surface temperature it dropped out of the "what could exist at this orbit" menu the generator uses to place a new body, because that menu only knew about the other temperature. It had quietly been offering eyeball worlds at any temperature since that family moved in an earlier release. The menu now reads whichever temperature a type declares.

## v2.1.334-beta - 1st Aug 2026

* A world's surface-radiation figure no longer sits outside the range printed beside it. The average dose included the extra dose from a star's flares; the minimum and maximum were worked out by a second sum that had no flare term in it at all, so around an active star the average could land a fifth above its own stated maximum. 105 of the 420 bodies in the bundled maps were affected, worst case Wolf 359's Graveyard at 19.8% -- now none are. The average itself never moved; it was the endpoints that were short.

## v2.1.333-beta - 1st Aug 2026

* A tidally locked world no longer shows a day length that contradicts the lock. Pandora was labelled "tidally locked" and given a 41.8 hour day on a three-day orbit; a locked body's day IS its orbital period, and it is now set from it. 19 bodies across the bundled maps had a day that disagreed with their own orbit, and every one of them now agrees. The 117 locked bodies that had no day length at all have one for the first time.
* Mercury is the exception, and it keeps its own day. It turns three times for every two orbits -- a real spin-orbit resonance its eccentric orbit holds it in -- so forcing it to a permanent sunward face would have replaced a measured number with a wrong one. Bodies like it now say which resonance they are in instead of claiming to be locked.
* A knock-on worth knowing about: 53 worlds lost their magnetosphere. They were tidally locked planets with no recorded spin, and the dynamo model had been treating "we don't know how fast it turns" as "about a day and a half". Given their real rotation -- nine to fifty days -- the same model says what it has always said about a slow rotator, which is that it cannot organise an ordered field. Proxima b, Ross 128 b, Luyten b and the outer TRAPPIST-1 worlds are among them.

## v2.1.332-beta - 1st Aug 2026

* A star created by the generation wizard now carries a magnetic field. It never did: the wizard's star path set no field at all, so every star it built kept a placeholder zero and reported no magnetosphere -- while the older random generator read the strength straight from the rule pack. Both paths now read the same pack data, so a white dwarf draws the white-dwarf band and a magnetar the magnetar band, and an aged star draws from the class it has evolved INTO.
* A newly created body no longer claims a rotation period, an axial tilt or a magnetic field of zero. Those were placeholders standing in for "we have not worked this out yet", and a zero in any of them is a statement -- this world does not spin, stands upright, has no magnetosphere. They are simply absent now, and a star's editor says "not set" rather than showing a confident 0.

## v2.1.331-beta - 1st Aug 2026

* In the Guide's rainbow mode each navigation button takes its own colour -- and it is the same colour as that body's marker on the chart above it, not an unrelated spectrum. Mercury's button is Mercury's yellow, Jupiter's is Jupiter's purple, so the eye can go straight from a dot on the diagram to the button that opens it. The "up one level" link is coloured the same way. Moons and stations are not drawn on the chart and so have no dot to match; they take varied colours of their own rather than pretending to. Monochrome skins are exempt, as they are for the rainbow headings -- they bleach the page on purpose.

## v2.1.330-beta - 1st Aug 2026

* Navigation links in the system document sit side by side across the page and wrap, instead of one per line. A star's planet list runs to thirteen entries in Sol alone, so a page of facts was ending in a long column of links; it is now a single wrapping row of buttons. Every drill-in list gets it -- planets, moons, rings, companions, constructs and the "up one level" link. This is the new default; the old arrangements are still there as "Buttons -- one per row" and "Plain text" under Navigation.

## v2.1.329-beta - 1st Aug 2026

* Player views get a "Live readings" setting: fuel, cargo and crew as they are now, rather than just capacity. A star catalogue would record what a ship can carry; only an instrument knows what is in the tanks this minute, and the construct block was always showing the latter. Off, it reads crew capacity, cargo capacity and fuel capacity; on, it reads current-of-capacity and adds supplies remaining, total mass, acceleration and delta-v. The label says which figure it is either way, so a reader is never left guessing.
* Total mass, acceleration and delta-v follow the setting too, because all three are computed from the fuel and cargo actually aboard -- delta-v is literally a measure of how much fuel is left. Showing them while claiming to withhold the readings would have made the setting a lie.
* Defaults chosen by what each preset IS: on for the Datapad and the Console, which are instruments, and off for The Guide, the CRT Terminal, the Holo Table and the Projection, which are reference views. This is a presentation setting rather than a privacy boundary, and deliberately so -- the figures still travel to the player either way.

## v2.1.328-beta - 1st Aug 2026

* A ship is no longer illustrated with a planet. The body-graphics setting drew whatever was selected, so Blip-A -- a 110-metre hull -- got the same featureless sphere a rocky world gets, above a stat block describing its crew and engines. A construct now gets no body graphic at all, which is the honest minimum; a GM-uploaded photograph of the ship still shows, as before.
* A construct's cargo manifest stays with the GM. The written description of what is in a hold was crossing to players in the broadcast -- nothing displayed it, but it was there, and unlike a body's description it had no way to be withheld. A star catalogue would know what a hold can take, not what is in it, so the prose is now stripped alongside GM notes. The tonnage, which anyone could see from outside, still shows.

## v2.1.327-beta - 1st Aug 2026

* A companion star is no longer filed under a heading that says "Moons". The Alpha Centauri AB Barycentre page listed Toliman -- a main-sequence K star -- as a moon, glyph and all, because a barycentre's members and a body's satellites shared one list. They are two different relationships and now have two headings. The split is by what each node actually is rather than by which list it arrived in, which also settles the case that made a single honest heading impossible: a planet orbiting a whole binary pair counts as a member too, and now lands under Planets where it belongs. Pluto and Charon still read "Moons", because there the companion really is one.
* A ringed planet lists its rings. Rings are not moons, so nothing on Jupiter's page ever mentioned Jupiter's Rings -- and since all four sets in the Solar System hang off their planet rather than off the Sun, they were reachable from nowhere in the document at all. Each ringed planet now has a Rings row alongside its moons. A planet with no rings is unchanged.

## v2.1.326-beta - 1st Aug 2026

* Two stars in the bundled maps could not be selected at all. In Struve 2398 and Groombridge 34 the companion star and one of the primary's planets had been given the same id -- "Struve 2398 A b" and "Struve 2398 B" were both `struve2398-b`, because the slug for the planet dropped the component letter. Anything looking a node up by id takes the first match, so asking for the star returned the planet, and the barycentre listed the planet as one of its own members. The planet takes an id carrying the component letter, the way its name already does; the star keeps the id everything else refers to. Both maps are now clean, and the generator refuses to write a map containing a duplicate id rather than shipping one quietly.

## v2.1.325-beta - 31st Jul 2026

* Constructs get their own information block instead of borrowing a planet's. Selecting Blip-A gave you Type, Orbit distance and Atmosphere -- three rows, one of which said "None" -- while the ship itself carried a crew, a reactor, engines, fuel tanks and a hold. It now reads its class, where it is, crew aboard and berths, supplies remaining, dimensions, dry mass, cargo against capacity, total mass, power surplus, fuel remaining by name, maximum acceleration and total delta-v. Twelve rows where there were three, and every figure comes from the same derivation the GM's own construct panel uses, so the two cannot disagree about one ship.
* Where a figure cannot honestly be given, it is left out rather than guessed. Engine and fuel definitions are what turn a tank into a mass and an engine into a thrust; without them a total mass would silently omit the fuel and a power surplus would not have subtracted what the engines draw. Both are suppressed in that case rather than printed wrong, and a construct still shows everything it carries on its own.

## v2.1.324-beta - 31st Jul 2026

* A star's page in the guide document lists its planets, the way every other body lists its moons. The star is the node you land on -- the primary is selected on entry -- so the first page a player saw was the one page in the system with no way down into it, and the only route in was the picker at the top. It is the same block the moons already use, drawing on the same helper the picker and the old Field Guide use, so belts are listed too rather than being pickable only on the chart. Sol now reads Mercury through the Kuiper Belt in orbit order, and you can go star to planet to moon without touching the picker. The heading says what is actually in the list -- planets, belts, or both.
* Checked across every star in the campaign rather than on the one that was reported: 33 stars list 92 bodies between them, each list exactly matching what the data says orbits that star, and the 27 stars with nothing in orbit correctly show no list at all.

## v2.1.323-beta - 31st Jul 2026

* The stat block's temperature range is the SURFACE range, so it agrees with the surface temperature printed above it. The two rows came from different stages of the pipeline: the mean was the composed surface temperature and the range was the EQUILIBRIUM one, which omits the greenhouse and every other heat term. Venus read 480 °C against a range of -44 to -42 °C. Across the Solar System eleven of thirty-four bodies had a mean outside their own quoted range -- Earth, Venus, all four giants, Io, Europa, Titan, Mimas, Luna's neighbours -- and every one of the thirty-four sits inside the surface range instead. It is the same figure the GM's body panel decomposes by cause, so the two views now print the same numbers.
* A frozen surface is no longer described as liquid. The recorded coverage is an inventory; whether it is liquid at this temperature and pressure is a separate question the physics already answers and publishes. The block asserted "Surface liquid" regardless, so Europa read "Surface liquid 100% water" directly above its own "Frozen surface" tag -- and its liquid is famously under the ice. Five of the Solar System's seven bodies with a hydrosphere are frozen. The label now follows the physics: surface liquid, surface ice, or a surface volatile marked boiled off or supercritical.

## v2.1.322-beta - 31st Jul 2026

* The orbit-line smoothing from the last build was switched off by its own guard. It asked whether an orbit passed near enough to the thing you are looking at to be worth recalculating, and measured that as the distance to the nearest CORNER of the thousand-sided polygon -- which, for an orbit running exactly through what you are watching, is still half a corner-spacing away, forty-six times over the threshold. So it always answered no. It now measures the distance to the nearest EDGE, which is what the question meant, and the line is smooth where you are looking.
* The smoothing also follows the camera now. It used to be laid down around the point the scene is drawn from, which only moves in large steps, so a body carrying the camera along its orbit walked out of its own smoothed stretch before anything was recalculated. It now re-lays around wherever you are looking as you move, which costs a fifth of a millisecond on one orbit and nothing on the rest.

## v2.1.321-beta - 31st Jul 2026

* Constructs draw their orbits on the player view. Stations and ships were the one kind of thing excluded from orbit lines. Each now gets one, in its own icon colour lightened toward white so the line reads as belonging to the station rather than to a world -- and neutral grey under the white body-colour setting, where the whole scene is deliberately one palette for a screen filter to tint. A ship with journeys booked is flown by the transit planner rather than by its orbit, so it draws no line it is not on; nor does anything sitting on a surface, which is checked live so a lift-off restores it.
* Orbit lines stay smooth however far you zoom in. An orbit is drawn as a 1024-sided polygon, and at Pluto's distance a single side turns a third of a degree and departs from the true ellipse by more than the whole Pluto-Charon separation -- so a line that should be smooth showed a visible kink, and ran past the pair rather than through their barycentre. Adding sides cannot fix it: the kink alone would need sixteen thousand of them at that zoom, and more again the closer you go. Instead the same thousand samples now bunch up around whatever you are looking at and thin out on the far side, which at that zoom is off screen anyway. The line is held within a two-thousandth of the viewing distance -- under a pixel -- at any zoom, and only the one orbit you are actually near is ever recalculated.

## v2.1.320-beta - 31st Jul 2026

* Pluto and Charon orbit their barycentre, visibly. Neither had an orbit ring anywhere near it: a member of a barycentre counts as system-level, so it was drawn the way a planet is -- an orbit around the origin -- and since a member's orbit is measured from its barycentre rather than from the star, that put both rings AT THE SUN, a few hundred-thousandths of a unit across and buried inside the star itself. Each now gets its ring around the barycentre it actually goes round, and the pair sit on their own orbits.
* That also explains the line that ran past the pair instead of between them. The only line near a framed Pluto was the barycentre's own orbit around the Sun, which the two straddle by design -- and an orbit is drawn as a 1024-sided polygon, so at that distance a single flat edge departs from the true ellipse by more than the whole Pluto-Charon separation. Zoomed in that far you are inside one edge of it. The pair's own orbits are three hundred thousand times smaller, so the same 1024 sides are smooth there.
* Clicking out from one half of a binary keeps going. The zoom ladder gave a barycentre member its PARTNER as its context, so the widest shot it could reach was the pair itself and a further click wrapped back in. There is now one more rung past the pair -- the orbit the two share -- which is the shot every other object's context step already gives it. The orrery and the 3D view take the same shot from the same click, as before.

## v2.1.319-beta - 31st Jul 2026

* The 3D player view has a floating origin. At 1:1 scale AND 1:1 distances a small world far out used to jitter -- its orbit line vibrated and its moon would not sit on it -- because the scene was drawn in absolute coordinates. At true scale Pluto lands at scene coordinate 12, where a 32-bit float can only count in steps of 9.5e-7, and the whole Pluto-Charon separation is 41.7 of those steps. The orbit line was quantised to about forty positions per axis, and every camera nudge re-rounded it: over a slow pan it held 148 distinct positions across 600 frames, standing still and then jumping a whole step. The scene is now drawn RELATIVE to whatever the camera is looking at, which gives the same pair 10.9 million steps instead of 42, and the line moves once per frame by exactly the camera's own step.
* Readable scale is untouched, deliberately. The origin only moves once the camera is closer to its subject than a 32-bit float can describe the space around it, which at readable sizes it never is -- the zoom floor there is twenty times further out than the threshold. Nothing about that end of either dial changes.
* The moon was never in the wrong place. Body positions are computed in full 64-bit precision and were always right; it was the line drawn under them that moved. Same for the reference grid, whose outermost ring sits at the outermost body's distance and so runs right past the world you are looking at.

## v2.1.318-beta - 31st Jul 2026

* The body name in the player info panel takes the preset's font colour, rainbow included. It was the one line the colour never reached: the panel mounts the document with its heading suppressed and draws the name itself as chrome, so "Tags", "Moons" and every other heading below it swept through the spectrum while the name above them stayed plain. It now paints the same seven stops the document uses, and is exempt under monochrome skins for the same reason the document exempts them -- they bleach the page on purpose so a tinting filter has one palette.

## v2.1.317-beta - 31st Jul 2026

* Route names on the player starmap are drawn in the route's own blue instead of the star colour. A route name sits at the midpoint of the line, between the two stars it joins, so in the same colour as the stars it just read as a third star name. Matching the line ties the label to the link. Monochrome skins are unaffected -- there the route colour IS the mono grey, so the tint filters still see a single palette.

## v2.1.316-beta - 31st Jul 2026

* Moons orbit in their planet's equator, where their inclinations were always quoted. The rings already knew this -- both ring builders lay the ring plane on the planet's equator -- but moon orbits were left in the system plane, so Saturn's inner moons sat 26.73 degrees away from the rings they are supposed to be embedded in. They now sit at their own quoted inclinations instead: Enceladus 0.01, Dione 0.02, Rhea 0.34, Titan 0.35, Tethys 1.12, Mimas 1.57 degrees from the ring plane, with Iapetus the one visibly tilted moon at 15.47. Uranus is the dramatic case -- its moons were 97.77 degrees out of place and now sit in its heavily tilted equator, where they belong. Triton reads its true retrograde 157.3 to Neptune's equator.
* Luna is deliberately exempt, and can say so. Beyond roughly fifty planetary radii a moon's orbit stops following its planet's equator and follows the system plane instead, which is why Luna's 5.145 degrees is quoted to the ecliptic while Saturn's inner moons are quoted to Saturn's equator. An orbit can now declare `frame: "ecliptic"` and keep its own plane; Luna and Phoebe are marked accordingly.

## v2.1.315-beta - 31st Jul 2026

* A construct that says it is on the surface is put on the surface. The 3D scene never read the declaration -- it worked surface-lock out from geometry instead, comparing the construct's offset from its parent against the parent's radius, and that test needed a non-zero offset. But the honest way to author a ground station is with no orbit at all, which is exactly what every one in the bundled maps does, so the offset was zero, no branch claimed them, and they were left sitting at the centre of the body, motionless. The scene now uses the same test as the document builder, so the two cannot disagree about which constructs are on the ground.
* Where a surface construct carries no offset to say WHERE on the surface it sits, it gets a landing site derived from its own id -- the same spot every time you open the map, and far enough apart that two stations on one small moon do not land on top of each other (the two on LV-426 sit 33.8 degrees apart).

## v2.1.314-beta - 31st Jul 2026

* The measure tool counts depth. It never has: Vega to Zeta Reticuli read 34.17 ly for a pair 51 ly apart in depth alone, while the routes and journey durations for the same pair used the honest figure. It now reads 60.99 ly, and still 34.17 ly for a campaign that has turned depth off. The flag was always wired correctly -- the depth was dropped at the pick, so both ends arrived on the reference plane and the 3D maths could only ever return the planar answer.
* A ship's measured position carries depth too. Resting in a system it takes that system's depth; in transit between two systems it takes the same interpolation as its x and y, because the hop is a straight line. A ship stranded at a bare point still has no recorded depth -- nothing stores one -- so it reads as being on the plane.

## v2.1.313-beta - 31st Jul 2026

* A selected body stays framed while time runs. In the 3D player view the camera used to re-aim at the focused body but never move with it, so a world orbiting away from a stationary camera got further away every frame and the shot quietly retreated until the planet was a dot. The camera now travels with the body, keeping the heading and distance you chose. Dragging still orbits it, the wheel still zooms, the turntable still spins, and re-selecting still steps through the framing ladder -- all of them work by changing the same offset the follow preserves.

## v2.1.312-beta - 31st Jul 2026

* The picker opens RIGHTWARDS from its puck, the way the time transport does. It was centred, so the bar grew symmetrically and the puck you had just tapped slid out from under the pointer into the middle of the bar. Its left edge is now the anchor: the strip opens from exactly where the puck stood.
* Any floating control that would open past an edge pushes itself back on screen. Opening changes the control's width, so it can stick off an edge it fitted inside a moment before -- it now re-clamps on open, on lock, and on releasing a drag. On a 375 px phone the picker's 351 px strip opens from a puck near the right edge and lands wholly on screen; so does the time transport.
* Two things that clamp had been quietly missing: it ran on `requestAnimationFrame`, which is suspended while a window is minimised or in a background tab, so a control opened off-screen while hidden stayed off-screen; and the in-drag clamp works off a rect one frame behind, so a flick that ENDED at the edge could stop just past it.

## v2.1.311-beta - 31st Jul 2026

* The time transport and the body picker are now the same floating control, not two lookalikes. One shared behaviour drives both: a slim move handle on the left, a lock on the right, and a puck they collapse to. Each puts itself away the moment you touch something else -- unless you lock it open, which is the opt-out from that. The lock replaces the old minimise button and keeps both meanings: locking keeps the control, unlocking puts it away.
* The time transport defaults to locked open, so it looks and behaves exactly as it did; the picker defaults to a puck. Positions are remembered per control and clamped back on screen when the window changes, so one dragged to the corner of a desktop still opens somewhere reachable on a phone. The move handle stands down while a control is locked -- there is nothing to drag, and on a narrow phone that is 15 px of pill back.

## v2.1.310-beta - 31st Jul 2026

* The rest of the GM starmap's text holds its size under zoom. Route distances, route names and the measure read-out now divide their font and their offset by the zoom, the same one-line cancellation the system names got. Measured across a 4.9x zoom range: the labels are pixel-identical while the lines they annotate grow with the map. The multi-star "+" is deliberately left alone -- the star discs it sits under are a fixed world-space glyph that scales with everything else, so a constant-size "+" would drift off its own marker.

## v2.1.309-beta - 31st Jul 2026

* A campaign that ignores depth no longer sees depth on the GM starmap. With "Ignore depth when measuring distances" on, the signed above/below-the-plane cue is dropped from both the system markers and the placement ghost -- annotating a number that no longer affects any distance is noise. The cue reads the same `zCounts` predicate the routes, the measure tool and journey duration read, so the map cannot disagree with the maths. The depth EDITORS stay: "Set Depth…" and the placement dialogue's elevation control still work, because the value still exists and the setting can be turned back on -- hiding them would make depth uneditable rather than merely uncounted.

## v2.1.308-beta - 31st Jul 2026

* The body picker floats. Over a map it is now a puck that opens into the full strip on demand and puts itself away on an outside click, a pick or Escape -- the same shape as the player time control. It applies to the GM starmap, the GM system view and the player catalogue; the three mounts that sit inside a panel or a modal (transit planner, find-a-body, find-a-construct) are unchanged, because there the strip is the content, not an overlay. The behaviour lives in the picker behind one opt-in prop, so a new surface cannot reintroduce the permanent strip by accident.

## v2.1.307-beta - 31st Jul 2026

* The starmap info panel really resizes. It is anchored by its top edge and sits at the bottom-right by default, so the old per-textarea grabber grew the panel downward into the canvas's `overflow: hidden` and the extra text was simply cut off. One grip on the panel's own corner now sets a width and a height, the Description and GM Notes fields grow to fill it, and the panel slides up or left rather than growing off the map. The size persists like the position, and both are clamped to the screen it opens on.

## v2.1.306-beta - 31st Jul 2026

* Header and footer banner text is centred in its band -- the stamp and note as one centred first line, wrapped continuation lines centred individually, like any centred paragraph. It was drawing from the left edge.

## v2.1.305-beta - 31st Jul 2026

* Header and footer banners behave like text on resize: constant font size, centred, re-wrapped -- because the redraw finally reaches the screen. They were ALWAYS being rebuilt correctly at the new size; the rebuild was then swapped into a live WebGL texture, and WebGL2 texture storage is immutable once allocated, so an upload of a different-sized canvas fails silently and the old bitmap stays -- stretched over the new frame by the full-screen quad. The texture is now recreated whenever the banner canvas changes size, in both the system holo and the starmap. Same-size updates keep the cheap path.
* The in-scene body labels carried the identical trap -- a label whose pixel size changed (font change, longer name) resized its canvas under a live texture -- and are fixed the same way.

## v2.1.304-beta - 31st Jul 2026

* Hardened the document view against resizes it never hears about. ResizeObserver notifications arrive before paint, so a resize landing while the page is not painting -- a minimised window, a background player tab, another virtual desktop -- can leave the canvas rendered against the old viewport, with the flush header and footer bands drawn at the stale width. The view now also re-measures on window resize and on becoming visible; both are idempotent when the observer already did its job.

## v2.1.303-beta - 31st Jul 2026

* The Spread and Body size dials say where reality is. Both share a convention nothing on screen stated: the left end is physical truth and the right end is the readable exaggeration. A green pip now marks the actual end of each slider, and the read-out names it -- "actual distances" / "actual size", in green -- when the dial is on it.

## v2.1.302-beta - 31st Jul 2026

* A true-scale planet sits ON its orbit line. The line is a sampled polygon and the body rides the real ellipse, so the drawn line cut inside the truth by a chord error that at 96 samples came to about fourteen true Saturn radii -- under readable body sizes nobody can see it, at true scale Saturn visibly floated off its own orbit and appeared to drift on and off it as it moved, since the gap oscillates from vertex to mid-chord and back. 1024 samples brings the error under a tenth of a radius, so the line passes through the planet disc at any framing.
* Ring rocks are sized by their planet, not by a constant. The old floor on ring-particle size was still ~26x a true-scale Saturn radius after the dial scaling -- each rock bigger than the planet, the ring one fused white slab. Proportional sizing leaves the readable end looking identical and makes true-scale rocks simply small, which is what rocks are.
* You can wheel-zoom to a moon at true scale without focusing it first. The unfocused zoom floor was 0.05 scene units -- right for readable mode, thousands of radii out at true. It now follows the scale, matching what the GM orrery has always allowed.

## v2.1.301-beta - 31st Jul 2026

* The 3D holo's focus ease no longer expires mid-approach. It ran a fixed 48 frames, which closes about three orders of magnitude of distance -- always enough at readable sizes, half the journey to a true-scale world, so the camera stopped dead in empty space with the planet still a marker. The ease now expires when the shot is actually reached, or the moment the user takes the zoom.

## v2.1.300-beta - 31st Jul 2026

* TRUE body size now means true. The old floor was a fixed 0.006 scene units, which is bigger than the true size of anything in a solar system -- Earth is 0.00001, even the Sun is 0.001 -- so at the bottom of the dial every body clamped to the same size and the Moon drew as Earth's equal. It came out fine at 5% and collapsed at exactly true, because 5% of the readable size still cleared the floor. The holo now works the way the GM orrery always has, which is the gold standard here: bodies carry their TRUE radius, and visibility comes from a per-role PIXEL floor at draw time -- stars rank above planets, planets above moons, exactly the orrery's 4/2/1 marker hierarchy -- so real proportions appear the moment the zoom can resolve them.
* Two camera locks that made that impossible are opened. The near clip plane now follows the working distance, since framing a true-scale world puts the camera far inside the old fixed plane. And the shared auto-frame policy's zoom clamp turned out to be the orrery's zoom-scalar range applied to the holo's camera DISTANCE, where its floor of 0.05 means four and a half thousand Earth radii -- the ease dived in and the follow step hauled the camera straight back out, which is why a framed world got close and then vanished. The bounds are the caller's now.
* Framing Earth at true scale gives the full globe; Earth-plus-Luna shows the Moon genuinely smaller; the whole-system view shows role-ranked markers. Readable mode is untouched.

## v2.1.299-beta - 31st Jul 2026

* Framing a body at true scale works again. v2.1.288 shrank the minimum body radius along with the sprite sizes, and that minimum is not cosmetic -- the CAMERA is sized off it. Framing puts the camera at roughly the body radius divided by the fill fraction, so a fiftyfold smaller radius put that distance inside the near plane, and the world you had just asked to look at was clipped away as the camera closed on it: it got near, then vanished. The minimum radius is back where it was; the sprite sizes, which were the actual complaint, still follow the dial; and visibility at wide zoom is handled in screen space, which is where it belongs.

## v2.1.298-beta - 30th Jul 2026

* "Frame whole system" fits the system at a tilt too. Fitting a flat half-extent is only right looking straight down: tilt the camera and the near edge of the disc is closer than the centre, so it projects larger than a flat estimate expects, and the outer orbits still ran off the bottom of a 64-degree shot. Everything the scene draws sits inside a sphere of known radius about the origin, so it now fits the SPHERE, which holds at any angle.

## v2.1.297-beta - 30th Jul 2026

* True scale draws the planets. At the true end of the dial a real planet is a fraction of a pixel across at whole-system framing -- Earth is about a twentieth of one -- so "true" was coming out as "absent", which is not what the setting means, and v2.1.288 made it worse by taking the old floor down with everything else. The mistake was the floor being written in scene units at all: a fixed size in a world whose zoom is not fixed hides bodies when you are zoomed out and bloats them when you are zoomed in, and either way it renders Jupiter and Mercury as the same dot. The floor is in SCREEN space now. A body draws at its true size the moment that reaches a few pixels and is never allowed below it, so nothing vanishes and true proportions appear as soon as they can be resolved -- frame Jupiter and it is a globe while its moons are still dots. Rings follow their planet, so Saturn keeps them. The readable end of the dial is untouched.

## v2.1.296-beta - 30th Jul 2026

* The live player view feeds the document engine the accent it was given, sentinel and all. The editor preview passed the preset's own value while the player view passed a pre-flattened one, so the Rainbow headings fixed a moment ago would have shown up in the preview and nowhere else -- the exact drift the shared style function exists to prevent. The flattened colour is still what the CSS variables get, because a CSS variable cannot hold a spectrum.

## v2.1.295-beta - 30th Jul 2026

* System names on the GM starmap stay the same size on screen however far you zoom. They sit inside the map's own transform so they follow their system as you pan, which is right, but they inherited its scale too -- so zooming in turned the names into headlines and zooming out made them unreadable. Their size and their offset from the marker now divide out that one factor. The depth annotations and the placement ghost's labels go with them.

## v2.1.294-beta - 30th Jul 2026

* The info-panel width is a percentage of the screen, and the preview follows the slider as you drag it. It was a raw pixel count, which is the wrong thing to author on one machine for someone reading on another -- 28% of the display is a promise that travels and 340px is not. The preview was worse than wrong: it drew the pixel figure capped at 340, so the top half of the slider's travel moved nothing at all. It now shows the same proportion of the stage the players will see.

## v2.1.293-beta - 30th Jul 2026

* The accent colour reaches the info-block headings, Rainbow included. Two faults in the same line. The colouration style seeded every colour slot and the accent was never part of that seeding, so picking a colour moved the chrome and left the headings on the style's default gold. And the resolver replaced the 'rainbow' sentinel with a flat colour before handing the theme on -- which is why the Guide's spectrum headings, built for the document engine back in v2.1.266, have never once appeared: by the time the renderer looked for the sentinel it had already been spent. The accent now outranks the style seed for the accent and heading slots, an explicitly tweaked slot still outranks both, and the sentinel survives to the renderer that needs it.

## v2.1.292-beta - 30th Jul 2026

* Choosing Body graphics: photo shows the photo straight away. The loader was keyed on which body was selected, and the branch that clears the photo for every other imagery mode stamped that same key -- so switching TO photo without also changing body looked, to the loader, like nothing had happened. It only appeared after leaving the tab and coming back, which remounts the panel. Now the key is the subject AND the mode, in both info-block surfaces.

## v2.1.291-beta - 30th Jul 2026

* "Frame whole system" shows the whole system. It parked the camera at a fixed multiple of the scene radius with no reference to the lens, which at the 45-degree field of view fitted about eight of the twelve units the system actually occupies -- so the outer third was always off the edge. It now works the distance out from the field of view and the aspect ratio, the same way framing a single body already did.

## v2.1.290-beta - 30th Jul 2026

* Changing an appearance setting no longer moves the preview camera. Every setter in the 3D scene bails when handed the value it already has -- except the framing one, which re-armed its ease every time it was called, and it is called on every style object the editor produces, which is a fresh one on every keystroke. So picking a different belt type threw the preview back to its framed shot and discarded whatever you had panned or zoomed to. Only a genuine change of angle or framing moves the camera now.

## v2.1.289-beta - 30th Jul 2026

* The body picture in the info block fills the space it is given. Both flat discs carried a 220px intrinsic size that CSS was treating as a ceiling, so a tall panel showed a small disc adrift in the middle of it; and the 3D globe was framed by the shared click-ladder, which fits a close-up into half the viewport. Half is right on a MAP, where a framed world wants its surroundings in shot -- a portrait has no surroundings, so it now asks for nearly the whole frame. The map's own framing is untouched.

## v2.1.288-beta - 30th Jul 2026

* True scale is in proportion again. The scene draws a good deal that is a MARKER rather than a body -- the minimum radius a body is allowed to render at, the glowing vertex dots of the wireframe styles, belt rubble, ring particles -- and every one of those sizes was chosen for the READABLE end of the body-size dial and then used at every setting. Turn the dial to true and a real body shrinks by three or four orders of magnitude while the markers stayed put, so the planets disappeared under a wall of boulders lying across their own orbits, every rock the same size as every other thing on screen. The markers now shrink with the dial, down to a floor of 2% of readable, which is already sub-pixel at whole-system framing -- below that a belt would simply cease to exist rather than read as fine dust. Nothing moves at the readable end.

## v2.1.287-beta - 30th Jul 2026

* The rail offers ONE way to put something in front of the players. Player Views replaces both older launchers -- the Field Guide, whose skins are presets now, and the Projector, whose overhead table view is the shipped Projection preset -- so the flag that reveals Player Views is now the same flag that hides those two. Three doors to the same room, two of them leading to the version being retired, was the harder thing to learn. Nothing is deleted: a production cut flips the one flag and the old pair come back.

## v2.1.286-beta - 30th Jul 2026

* Body graphics are no longer drawn on the system map. Body graphics -- photo, simple disc, flat shape -- is the per-body PICTURE in the info block, and a map, 2D or 3D, always shows the real render. The 2D map had been flattening every world into a camera-facing sprite, which is also why the wireframe and lo-poly render styles appeared to apply to the star but not to the planets: those styles only exist on the sphere path the sprites replaced. The renderer no longer has a way to draw one at all, rather than being told not to at each call site.

## v2.1.285-beta - 30th Jul 2026

* Adrian gets its second organism. Astrophage now exists as a gas and a condensate, not just as fuel and a drive -- which it always should have, because Adrian is where astrophage goes for carbon dioxide, and that is the entire reason taumoeba lives there to eat it. The planet now carries two living cloud decks: a green taumoeba layer as the base, and patches of astrophage above it.
* The layering is physics, not a paint order. Taumoeba saturates at 0.194 bar and astrophage higher up at 0.138, so the green condenses deeper and the red sits over it. The renderer works the stack out again from the tags alone, so the two condensates' boiling points had to be set to agree with the column -- astrophage condenses colder, so it is the upper layer in both accounts. There is a test that fails if they ever disagree.
* Astrophage is nearly black, and that is not decoration: absorbing everything that hits it is the whole point of the organism, and the reason it dims stars. Its cloud albedo of 0.04 pulls Adrian's overall albedo down to 0.147 and warms the world by about a degree -- and that warming thins the green deck beneath it, because a warmer column condenses less. The predator and its prey now compete through the temperature, which is a nicer accident than anything that could have been arranged deliberately.
* The green base thickened to overcast, so there are still real gaps to see the ground through rather than a shroud. Adrian also picks up constant lightning: a thick convecting atmosphere under heavy cloud earns it.
* Blip-A never went to Adrian -- only the Hail Mary did. It was parented to the planet; it now holds a 0.3 AU orbit around Tau Ceti itself, out in the Petrova line where it belongs.
* Nothing else in either bundled starmap moves: no classifications, no other body's temperature or colour.

## v2.1.284-beta - 30th Jul 2026

* Adrian has green clouds, and it got them by being described properly rather than by being told what to look like. Two numbers on the Taumoeba bloom were placeholders copied from water, and neither survives a second's thought about what the substance actually is. Its triple pressure said the bloom sublimes away at low pressure exactly as water ice does, which is the opposite of true for something whose whole existence is staying aloft in a hot sky. And its cloud albedo said a dense green pigmented organism reflects a third of the light that hits it, when the entire function of a pigment is to absorb.
* Corrected -- triple pressure to 3e-6 bar, cloud albedo to 0.18 -- the column now condenses a thin bloom high above the surface, and the physics does the rest. It comes out as scattered cover at about a fifth of the sky, so you see green swirls over the reddish ground rather than a green planet, and the precipitation reads virga because the bloom never reaches the surface: below 0.19 bar it is above its critical temperature and cannot exist as a condensate at all. That is Taumoeba's actual habitat falling out of the model instead of being asserted.
* The albedo correction matters more than it looks. At the old 0.35 the deck was bright enough to cool the planet, which thickened the deck, which cooled it further -- a runaway that snapped Adrian to a total shroud with only a hair's breadth of settings in between. A pigmented bloom that absorbs breaks that loop, so the partial deck is stable: the solve settles in three passes with no residual, and Adrian's surface temperature moves by 0.4 K.
* Nothing else in either bundled starmap changes: no classifications, no temperatures, no other body's colour. Taumoeba exists on exactly one world.

## v2.1.283-beta - 30th Jul 2026

* An icy shell no longer appears on worlds that are far too hot to have one. The rule had two branches and only one of them checked the temperature, so a body that inferred an ice-rich interior got a frozen crust painted on it whatever its surface was doing. Ice-rich interior and icy SHELL are different claims -- a warm volatile-rich world carries its water as steam or a supercritical envelope, and both of those already have their own tags. Three bundled worlds lose a crust they could not have had, at 303 K, 488 K and 523 K.
* Eyeball worlds are judged on their SURFACE temperature instead of their equilibrium temperature. The three of them are descriptions of the ground -- a molten dayside, icy except the substellar point, a temperate oasis -- and matching them against the temperature a world would have with NO atmosphere meant a thick greenhouse could be filed as an icy world while its surface ran at 300 degrees. Nothing in the bundled maps changes, because every star-locked world in them is airless and its two temperatures are the same number; it is worlds you build that this protects.
* How far a cloud deck sits from white is now a property of the substance rather than one number for all of them. A cloud of clear droplets scatters every wavelength alike and goes white however dark the liquid it condensed from -- that is water. A suspension whose particles ABSORB keeps its colour however finely you divide it, which is why Jupiter's belts are genuinely brown and a martian dust storm genuinely ochre. One constant for both put a pastel ceiling on every deck in the game. The default is unchanged, so nothing already in the maps looks different; the five pigmented condensates now carry their own value, and it is editable per liquid like the rest.
* Checked and deliberately left alone: the greenhouse model. It looked too strong at 8 bar, so it was measured against every anchor the Solar System has rather than just Venus -- Mars at 0.006 bar gives +5.8 K against a measured 6, Earth +32.8 against 33, Titan +14.1 against 12, Venus +523.6 against 505. It hits all four across four orders of magnitude of pressure. There is no measurement anywhere near 8 bar, so reshaping the curve to satisfy an intuition would risk the four anchors it does hit for nothing.

## v2.1.282-beta - 30th Jul 2026

* `albedo.ts` was a second, worse cloud model, and it sat upstream of the good one. It carried its own table of boiling points and declared a cloud deck whenever the equilibrium temperature fell under 1.6 times one of them -- no atmospheric column, no saturation test, no profile. `cloudDecks.ts`, which is documented as THE single evaluation of what is in a world's sky, walks the real column and finds where a gas's partial pressure crosses its saturation pressure. So two models described the same sky two different ways, and the body panel showed both at once: Adrian read "CO2 cloud deck, albedo 0.649" from one and "no decks" from the other, and Venus's deck was CO2 in one and sulphuric acid in the other.
* Albedo now asks the cloud model instead of guessing. What is left in it is optics: how bright each layer is and how they stack. The decks are composited bottom-up, so the top one has the largest say -- Jupiter is bright because of the ammonia veil, not the brown hydrosulphide under it.
* How much a deck of a given substance reflects is now rule-pack data (`cloudAlbedo` on each liquid, editable beside the cloud opacity that was already there). Opacity is what a deck hides; albedo is what it sends back; Venus needs both and they are not the same number.
* The reason albedo had grown its own shortcut is that the problem is circular -- albedo sets the temperature, the temperature decides which clouds condense, the clouds set the albedo. That loop is now solved as a proper fixed point rather than broken with a cheaper model. It settles in at most five passes across all 260 bodies in the bundled starmaps and the Solar System, and a world sitting exactly on the edge of condensing something lands between its two self-consistent states and says so in its albedo note.
* Measured against real Bond albedos, everything moved the right way: Venus 0.689 to 0.757 (measured 0.76), Earth 0.293 to 0.308 (0.306), Jupiter 0.34 to 0.490 (0.503), Saturn 0.343 (0.342), Neptune 0.288 (0.290). Adrian loses a cloud deck it never had and warms from 246 K to 304 K equilibrium. No body in either bundled starmap, or in the Solar System, changed classification.
* Processing is now idempotent, which it quietly was not. Loading the same file twice gave two different temperatures: the greenhouse was re-derived against whatever surface temperature the previous run had left behind, and a giant-mass body's makeup was corrected during classification but read during the temperature pass, one step too early. Both are fixed, and the solve builds its own working copy so it can never read history.
* Mars loses its real water-ice wisp, and this is worth stating plainly rather than hiding: the wisp survives up to about 214.5 K and Mars now sits at 216.7. It got warmer because it lost a CO2 deck it never had, and that fake deck had been holding its albedo at 0.236 -- close to the measured 0.25 for entirely the wrong reason. The actual gap is the surface model, which gives Mars 0.154 from rock and metal alone and knows nothing of ferric dust or polar caps. Logged in the observations inbox with its diagnosis.

## v2.1.281-beta - 30th Jul 2026

* Adrian's radius was wrong, and it was the cause of two things that looked like rendering faults. A 3.93 Earth-mass rocky planet should be about 1.45 Earth radii; it was carrying 1.81, which is a real measurement nobody has ever made -- Tau Ceti e does not transit. At that size its density came out at 3.66 g/cc, too low for rock, so the physics correctly inferred a fifth of it was ice and painted the ice on the outside, which is why it rendered white. The same inflated radius shortened its tidal despinning time to 4.7 Gyr, under the system's 5.8, so it locked and classified as a cold eyeball -- a label on a 309 degree world.
* At the correct 9,219 km it comes out at 7.15 g/cc, no inferred ice, 1.88 g at the surface, and a despinning time of 9.2 Gyr -- longer than the system has existed, so it no longer locks. Density, makeup, colour, rotation and classification all follow from the one number, derived rather than asserted.
* The Hail Mary signs off properly now. Amaze, Amaze!

## v2.1.280-beta - 30th Jul 2026

* Fixed: the 3D starmap's "Depth exaggeration" slider did nothing. It was capped so the deepest system could never rise past the map's edge, which was sound when the bundled map was flat -- but the map now carries real astrometric depth, so the cap bound immediately and pinned the slider at 1x. It now does what it says; a map with real depth is dramatic at 1x already, so a little goes a long way.

## v2.1.279-beta - 30th Jul 2026

* Reverted the rendering-engine changes made in v2.1.277 to give Adrian its look. Appearance is derived from physics and data through tags -- adding engine code to produce a particular picture is the wrong end of that pipeline, however well-reasoned the rule. The atmospheric tint returns to the dominant gas, and cloud decks return to a single condensate whitening for every substance.
* Adrian's hand-written cloud-deck tags are gone with them. Tags are something the physics emits from data, not something an example map asserts.
* The DATA all remains: the Taumoeba gas with its cloud block, the taumoeba-bloom and iron-oxide-dust condensates, Astrophage and its spin drive, the Hall Effect thruster, and both starter maps on the opening screen.

## v2.1.278-beta - 29th Jul 2026

* **Gas giants make their own heat, and it depends on how old they are.** A giant is still radiating
  the gravitational energy of its own formation — Jupiter puts out 1.67 times what it receives from
  the Sun, Saturn 1.78, Neptune 2.6 — so the dominant term has nothing to do with the star. It is now
  modelled as a cooling curve in age: a Jupiter reads nearly 1000 K at ten million years old and 52 K
  at four and a half billion. Which means the answer to "how do I make a really hot gas giant?" is
  not to move it closer to its star, it is to make it young.
* **The curve is anchored on today's solar system**, and that anchoring earned its keep immediately —
  it caught a mass term that had quietly cost Saturn 23 K. It is also matched to the brown-dwarf
  cooling tracks at 8 Jupiter masses, so a giant can no longer get colder by gaining mass. Checked
  against the planets we have actually photographed: the HR 8799 family come out at 990–1110 K
  against a real 1000–1200 K.
* **Fixed: giants were getting no internal heat at all.** The old model gated on the atmosphere being
  quoted at 10 bar or deeper — but a giant has no surface, so its pressure is whatever depth its
  author picked, and this app quotes the 1 bar reference level. Every giant in the bundled solar
  system, and every generated one, was silently getting zero. That is why Saturn read 87 K instead of
  134. Composition decides whether something is a giant now; pressure has no say.
* **A new Internal Heat block** on the body data panel, for every world rather than giants alone: how
  much heat it makes itself, broken out by where that heat comes from — formation heat still leaking
  away, radioactive decay, tidal flexing — kept apart from the starlight falling on it. It was
  previously a run-on tooltip.
* **A new gallery row: the same giant, growing old.** One Jupiter, one orbit, one chemistry, and only
  its age changing.
* Rocky worlds deliberately get none of the above. A planet is not contracting, and Earth's internal
  heat reaches the surface as about 0.09 W/m² against 340 W/m² of sunlight — it moves the surface
  temperature by roughly a fiftieth of a degree. It matters for geology, not for climate, and the
  model now says so on the physics page instead of implying otherwise.

## v2.1.277-beta - 30th Jul 2026

* The opening screen now offers BOTH bundled starter maps -- Local Neighbourhood and Local Neighbourhood (Science Fiction). The list is read from the shipped manifest, so bundling another map in future is a data change rather than a code change.
* Fixed: Tiangong Station and the Lunar Gateway were fitted with a Hall Effect thruster that did not exist in the rule pack. It does now -- xenon, 0.6 kN, 1800 s, the workhorse of station keeping.
* New fuel and engine: ASTROPHAGE and the Astrophage Spin Drive, and the Hail Mary and Blip-A now actually run on them instead of standing in with an antimatter beam core. Astrophage converts its own mass to light, so the exhaust velocity is c and the specific impulse is c/g -- about 30.6 million seconds, within a rounding error of the best any reaction drive can ever manage. The numbers check out against the book: at total mass-to-light conversion, two grams of Astrophage carries exactly a ten-second 60 kN test firing.
* Adrian, at Tau Ceti, now looks like Adrian: a green Taumoeba bloom over rust-coloured dust, built from two cloud decks rather than a painted-on colour. Taumoeba joins the gas list as a custom constituent, so the whole thing is editable data.
* Atmospheric tint now comes from the most abundant COLOURED gas rather than simply the most abundant gas, scaled by how much of it there is. Bulk gases are usually colourless, so keying off the main constituent meant a striking trace was invisible -- which is backwards, since Earth's sky is not the colour of nitrogen.
* Cloud decks can now keep their own colour instead of being pulled toward white. Condensed droplets and ice crystals scatter broadly and read near-white whatever the liquid beneath, which is right for water and wrong for a pigmented bloom or a mineral dust; those now say how far from white they sit.

## v2.1.276-beta - 30th Jul 2026

* Fixed: link distances ignored DEPTH. A route measured only its flat shadow on the map, so a system labelled "3.8 ly below the plane" could sit on a 2.1 ly link -- which is not a shape that exists. Links now measure in three dimensions like everything else, and honour the campaign's "ignore depth" setting. Sol to Alpha Centauri now reads its real 4.4 light years instead of 2.1.
* Fixed: changing a campaign's distance unit relabelled every number without converting it, so switching light years to parsecs left "3.8" in place and simply wrote "pc" after it. Changing the unit is a change of ruler, not of layout: the map now keeps its shape and 3.8 ly correctly becomes 1.2 pc. Campaigns using their own invented unit are left alone, because there is no honest conversion for a made-up unit.
* Fixed: the star-generation wizard juddered between two sizes as its scrollbar appeared and vanished on every frame. The HR diagram sized itself to the panel, which made the panel overflow, which added a scrollbar, which narrowed the panel... The scrollbar space is now always reserved, and the diagram ignores changes too small to see.

## v2.1.275-beta - 30th Jul 2026

* "Add System near here…" gained a units choice at the top. Angles can be typed the plain way (bearing and elevation in degrees) or the astronomer's way -- right ascension in hours, minutes and seconds, declination in degrees, arcminutes and arcseconds, with its own sign button so "half a degree below the plane" is sayable. Distance can be typed and read in light years or parsecs whichever the campaign stores.
* Both choices are remembered, and neither changes the map: they are how you type a placement, not what gets saved, so switching units never moves the system you are placing. Campaigns using their own invented distance unit see no distance picker, because there is nothing to convert to.
* The R.A. and Dec. readout is shown alongside the plain-language one ("E, below the plane by 30°"), and it is measured in the map's own frame -- from map-north and the map plane, not the real sky.

## v2.1.274-beta - 30th Jul 2026

* Campaigns built on the older bundled Local Neighbourhood are now offered an upgrade onto the rebuilt one. It tells you exactly what will happen to YOUR campaign before you commit -- which of your own systems move and how far, which links get re-measured, and what disappears from the updated systems -- then builds the upgrade as a separate campaign for you to look over and keep or throw away.
* Your own systems move with the bundled system nearest to each of them, so what sits next to what survives: a colony 0.6 light years off Sirius is still 0.6 light years off Sirius afterwards, even though Sirius itself moves from a decorative 4.4 to its true 8.6 light years from Sol.
* You are asked to save a copy before upgrading, and a copy of the pre-upgrade campaign is kept in the browser besides -- Settings > System offers to go straight back to it, for as long as you have not used it.

## v2.1.273-beta - 30th Jul 2026

* The bundled Local Neighbourhood starmap has been rebuilt from real astronomy. Every system now sits at its TRUE 3D position (x, y and the new z depth) from Gaia/Hipparcos/SIMBAD astrometry, and the planet roster is exactly the NASA Exoplanet Archive's confirmed set -- Barnard's Star gains its four 2024-25 sub-Earths, Lacaille 9352 its four, tau Ceti drops the retracted e, and the fictional content that had crept in is gone. The map grows from 20 to 42 systems: the complete known census to ~13 light years (brown dwarfs included), every confirmed planet host to ~16.5, plus Altair, Vega, Zeta Reticuli and TRAPPIST-1. Same stable system ids throughout, plus new appVersion/baseMapVersion stamps and a manifest for the coming campaign-upgrade feature.
* New second example map: "Local Neighbourhood (Science Fiction)" -- the same real stars at the same true positions, populated with the famous fiction set among them: The Expanse across Sol, Pandora at Alpha Centauri, Reach at Epsilon Eridani, the Wolf 359 graveyard, LV-426 at Zeta Reticuli, Project Hail Mary at Tau Ceti and 40 Eridani (where Vulcan also lives), Rocheworld at Barnard's Star, Mesklin at 61 Cygni, and more. Deliberately fictional and it says so; stars without a famous tenant keep their real planets.
* New reusable build kit at scripts/starmap-build/ (TAP fetchers for the NASA Exoplanet Archive and SIMBAD + a deterministic generator), and a design doc for a full in-app "import the real sky" feature at docs/dev/starmap-data-import-design.md.

## v2.1.272-beta - 30th Jul 2026

* Saved starmap files now record which build wrote them, and which edition of a bundled starter map they descend from. Until now a starmap file carried no version of any kind, which made it impossible to tell reliably what produced it -- this is groundwork for offering campaigns a clean upgrade when the bundled maps change. Nothing changes about how your maps load; older files without a stamp keep working exactly as before.

## v2.1.271-beta - 30th Jul 2026

* New on a system's right-click menu: "Add System near here…". Place a new system by direction and distance from one already on the map -- bearing, elevation above or below the plane, and how far -- with a slider and a numeric box for each. A ghost marker, tethered back to the origin, shows exactly where it will land and slides around as you drag; the panel docks to the far side of the map so it never covers it. North is up the screen, and every direction is spelled out in words as well as degrees.

## v2.1.270-beta - 30th Jul 2026

* New on a system's right-click menu: "Set Depth…" -- type how far above or below the map plane a system sits, in your campaign's own distance unit. Any route touching it re-measures. Systems off the plane now show their signed depth beside the name on the 2D map, so you are not editing blind.
* Fixed: the 2D starmap applied depth as if it were a 3D view, so a system with depth drifted away from its own map position. The 2D map is a plan view: depth belongs to the 3D one.
* Fixed: high depth exaggeration threw deep systems clean out of frame. The stretch now stops at the map's own radius, so the deepest system always stays in view.
* Fixed: dragging a system on the map wiped its depth.

## v2.1.269-beta - 30th Jul 2026

* The 3D starmap now SHOWS depth: systems sit above or below the reference plane, each tethered to it by a fading drop-line with a small tick marking its position on the plane, so you can tell at a glance which way and how far. Viewed straight down it collapses and reads exactly like the 2D map.
* New "Depth exaggeration" slider for the 3D starmap (1x = true depth). Real interstellar depth is tiny next to a map's spread, so this stretches it for clarity. It is purely visual and never changes distances or journey times.

## v2.1.268-beta - 30th Jul 2026

* Star systems can now carry DEPTH: a system position gains an optional third axis, and distance is measured in three dimensions -- routes, the measure tool and journey duration/fuel all agree, because they now share one distance module. Existing campaigns are untouched (no depth = the old flat distances, exactly as before).
* New Starmap setting "Ignore depth when measuring distances" for GMs who want purely visual height with flat distances. Off by default, because counting depth is the honest answer.

## v2.1.267-beta - 30th Jul 2026

* Settings > System gained a "Your data" section: it shows how much space your campaigns use of what is available, and lets you ask the browser to keep them rather than clearing them when space runs low. It reports exactly what the browser granted -- some browsers agree silently based on how often you use the app, and some refuse -- so it never claims your data is safe when it is not. Saving to a file remains the only real backup.

## v2.1.266-beta - 29th Jul 2026

* Grid overlays on the starmap are now the map's OWN grid: a lattice choice renders at the GM's cell size and alignment instead of an invented size several times too big, so the players' hexes match the GM's map. They also fill the view and dissolve with distance rather than stopping at a ragged disc edge.
* 3D grids gained depth: each line drops a short curtain that fades to nothing. Straight down it's edge-on and reads exactly like the 2D map; tilt the view and the lattice gains a subtle sense of depth, dissolving toward the horizon.
* Fixed: on the starmap, every overlay choice rendered as hexes whenever the GM had a hex snap-grid — the GM's grid took precedence over the player's choice. The overlay choice now always wins (mirroring the GM's grid is still available by choosing Square / Hex / Traveller hex).
* If the Guide's Rainbow accent is on, document HEADINGS now paint across the spectrum instead of falling back to a flat colour (never under Monochrome, which deliberately bleaches the page for a tinting filter).
* Dropped the "Back" button on the preset editor's first step, where it did nothing.

## v2.1.265-beta - 29th Jul 2026

* The preset editor no longer throws your work away on a stray click: it takes the whole screen (so there is barely a backdrop left to hit), and every exit — backdrop, Cancel, Escape — asks before discarding unsaved changes.
* Hexes are treated as a STARMAP idea, because that is what they are: one hex is a jump, and Traveller numbering is sector addressing. The system views (2D orrery and 3D holo) now offer only None / Square / Polar / Polar + scale, and a stored hex value folds to the square lattice rather than painting a jump grid over an orrery. The starmap keeps all six.
* Traveller hex NUMBERING now draws on the 3D and flat starmaps — the CCRR hex address (1-based, wrapping at the 32x40 sector, zero-padded) matching the 2D editor exactly, drawn only when the hexes are big enough to read.

## v2.1.264-beta - 29th Jul 2026

* Named routes are now labelled on the 3D and flat starmaps (they only ever showed in the GM's 2D editor), and — because the label rides the same pipeline as system names — route names finally obey the Hide-labels override instead of ignoring it. Completes WS3.

## v2.1.263-beta - 29th Jul 2026

* WS3 (2/2) the 2D system view finally has overlays. The orrery had no grid of any kind; it now offers the same six as everywhere else, from a new "Overlay" picker in View options — square and hex lattices spaced in round AU (the spacing re-snaps as you zoom), or polar rings about the primary with optional AU labels. The overlay pans and zooms with the map and sits under the orbits.

## v2.1.262-beta - 29th Jul 2026

* WS3 (1/2) one overlay vocabulary: every spatial view now shares a single grid/overlay list — None, Square, Hex, Traveller hex, Polar, Polar + scale — instead of the two disjoint sets that existed before (a decorative 3D one with no square, and the 2D snap-grid with no polar). The 3D starmap and 3D system both gained square and hex lattices, and the player-view editor's two grid pickers now render the same shared list, so they can't drift apart.
* The numbered Traveller hex is available to EVERY user as a normal snap-grid choice — it no longer requires Traveller mode (mode keeps its own job: parsec scaling, UWP import, subsector detection). Existing Traveller-mode maps are unaffected.

## v2.1.261-beta - 29th Jul 2026

* WS5 player-view lock-down: a preset with the starmap stage switched off now PINS which system players are dropped into (chosen in the editor), so a shared link always lands in the same place — it used to always pick the first system on the map. The escape routes were already sealed (back button hidden, browser Back refuses to surface the map, the cover only re-arms when the GM changes preset). A follow-the-GM preset still tracks the GM's current system: the pin sets where players land, not a cage.

## v2.1.260-beta - 29th Jul 2026

* Beta resumes the V2.2 line after the **v2.1.4** production cut: Player Views is back on the rail
  alongside the Field Guide. Production ships with it masked.
* Carries the ten new loading messages written for the v2.1.4 cut, so the next one starts from a
  clean slate rather than re-using them.

## v2.1.259-beta - 29th Jul 2026

* **Storms flash inside the clouds in 3D.** A world that derives lightning now fires it: brief
  flashes lighting the deck from within, several strokes down the same channel the way a real one
  goes, and because they add light rather than replace it they barely register on the sunlit side and
  read vividly across the night side — which is where you would actually see them from orbit. How
  often they fire comes from the world's own weather: a thick warm convecting deck, or ash from a
  volcanic surface.
* **Stars have a spin axis.** Their surfaces already turned; now they turn about a real, tiltable
  axis, so a star's spots and faculae track across it properly. Editable on the star's own tab, with
  the tilt described in plain terms as you drag it.
* Generated stars get theirs from the **dynamical-history** dial rather than a die-roll. A star and
  its planets condense out of the same disc, so they start aligned and stay that way unless something
  moves them — our own Sun is only 7 degrees out after four and a half billion years. A calm system
  therefore stays near square and only a violent one tips over, which means a badly-tilted star you
  come across is telling you something true about that system's past.

## v2.1.258-beta - 29th Jul 2026

* **"Delete all data" now actually deletes.** It cleared local storage, asked the browser to drop the
  saved-map database, treated "blocked" as success, and reloaded — straight back into the map it had
  just claimed to remove. The app was still holding the database open, and a database with an open
  connection cannot be dropped. It now closes first, and if something genuinely still holds it (a
  second tab of the app), it empties the contents rather than reporting a deletion that did not
  happen.
* **Gas giants in older saves get the traces that were never written for them.** A giant saved before
  the cloud model carries bulk hydrogen and helium and, at best, methane — so nothing in it can
  condense, and Saturn loads with an empty sky instead of the ammonia compound that makes it gold.
  That is missing data rather than a stale calculation, so it cannot be re-derived; it is now filled
  in when the save loads, using the same trace model new giants are built with. Deliberately narrow:
  it only touches a giant carrying nothing but the old default gases, so any giant you actually
  authored — your own ammonia figure, sulphur, water, anything — is left exactly as you wrote it. The
  fill is repeatable, not a random roll.
* Older giants quoted at 100,000 bar are re-anchored to the level their temperature actually belongs
  to, so their clouds stop forming a hundred times too deep.

## v2.1.257-beta - 29th Jul 2026

* **Tags explain themselves properly now.** A reported example: the "Episodic" geology tag described
  itself as "the body's tectonic and volcanic regime, set by its interior heat" — true of every
  geology tag and useful for none of them. Two of the seven geological regimes had no write-up at
  all, and "Stagnant lid" was carrying the description of a different regime entirely, Venus and its
  catastrophic overturn included. All seven now say what they specifically mean, matching the
  physics reference.
* Surface age and irradiation had no description whatsoever, and weather tags were rendering
  ungrouped and grey because their category had never been registered. Both fixed.
* The gap was structural rather than a typo — a tag with no write-up quietly falls back to a blurb
  for its whole category, which reads like an explanation instead of like something missing. A test
  now walks the source for every tag the code emits and fails if any of them is relying on that.

## v2.1.256-beta - 28th Jul 2026

* **Generated gas giants finally have something in their air.** Every auto-generated giant was pure
  hydrogen and helium, which meant not one of them had anything that could condense — none of the
  new cloud physics could ever reach them, and they all fell back to a flat colour picked by
  temperature. They now carry the trace gases that do all the visible work, in amounts following the
  real trend across our own four: the smaller the giant, the more concentrated its heavier elements.
  Big warm ones come out banded and gold, cold small ones come out blue, and the model decides which
  by itself.
* **A giant's atmosphere is now quoted where you can actually see it.** Generated giants said 100
  bar, and some saved data says 200,000 — but a giant has no surface, so the number is just whichever
  depth its author picked, while the temperature beside it has always been the reading near 1 bar.
  Taking those two at face value put every cloud a hundred times too deep, and gave Jupiter a methane
  deck the real planet has never had. Both the generator and the model now start from the level the
  temperature belongs to. Existing saves are read correctly without being edited.
* **The physics reference has a new "Clouds & weather" chapter**, in plain language: why it gets
  colder as you go up, why that stops, how a cloud forms where a gas runs out of room, and why rain
  that never lands is what keeps Venus completely wrapped. It says where we stop, too — we only model
  the sky as far as you could see into it.
* **Newton shows the cloud working for the body you're looking at**: how cold its sky gets and where,
  which of its gases could condense at all, and where each cloud layer's base sits. When a world has
  no clouds it now tells you which of the two reasons it was.
* Honest about the new shortcuts: the fudge list gains the fixed droplet size, the single calibrated
  figure for how much cloud stays airborne, and the fact that cloud *colours* are a chosen palette
  even though the layers themselves are derived. Two stale claims went — giant colours are no longer
  "by temperature", and belts are no longer "tinted by chromophore and temperature".

## v2.1.255-beta - 28th Jul 2026

* **Clouds now form where the air is actually cold enough.** Until now a world had ONE notional
  "cloud temperature" guessed from its surface, and every remaining cloud misjudgement traced back
  to it. There is now a real temperature profile through the atmosphere — the air cools as it rises
  at a rate set by the gases in it, until convection stops and it settles at the temperature a body
  radiating into space must reach. A substance condenses where its own pressure crosses the point
  it can no longer stay a gas, and that crossing is the cloud base, at a real height.
* **Saturn is gold again.** It carries half again as much methane as Jupiter and is colder, so the
  old model gave it a methane deck and Saturn came out grey. The real planet does not have one: its
  air reaches the coldest it will get before its methane ever reaches saturation. Nothing was told
  to skip it — the deck simply never forms, and the ammonium hydrosulphide beneath it is what makes
  Saturn the colour it is.
* **Rain, snow and virga are now the same question asked at ground level.** Is the air at the
  surface saturated in what is falling? Near enough and it lands; far from it and it evaporates on
  the way down. Mars's ice turns out never to reach the ground, and Venus's acid recycles straight
  back into the deck — which is why Venus is total overcast on a few parts per million of vapour
  while Earth, holding far more water, has gaps in its sky. That used to be a special case written
  for Venus; it is now just what the rule says.
* **Cloud cover is worked out from how much is actually up there** — the condensate column,
  turned into an optical depth — rather than from how much of the gas remains unfrozen. Earth lands
  at two-thirds cover, Venus at total, Mars at a wisp, all from the one calculation.
* **A giant only gets belts if it has the chemistry for belts.** A hardcoded brown keyed off
  temperature was painting Jovian bands and a red spot onto any warm giant, including one made of
  nothing but hydrogen and a trace of methane. Bands are now the deck below showing through the one
  above, so a single-deck world bands smoothly in its own colour.
* **New: the giant lab in both reference galleries.** Six rows of giants defined by nothing but a
  composition, a pressure and a temperature, with every cloud and every colour derived by the same
  code the app runs. Each row sweeps one variable — cool a Jovian and watch its decks appear, raise
  the methane, change the depth, heat a world until sodium, then silicate, then iron are the things
  condensing out of its sky. It is a test rig you can look at: on its first run it disagreed with
  three of the labels it had been given, and the labels were what was wrong.
* Titan no longer grows an overcast cyanide sky from a hundred parts per million of it: a world with
  a surface cannot hold more of a substance in its air than the ground temperature allows.
* Mars keeps its water-ice cloud at its real, very thin abundance — the original report that started
  all of this.

## v2.1.254-beta - 28th Jul 2026

* **Every cloud deck a world has is now drawn, not just its thickest.** Worlds that condense more than one substance — Titan's methane over ethane, a cold giant's stack — show each layer, deepest first, so the upper decks genuinely part over the lower ones. In 3D they are separate drifting shells at their own altitudes, the top one turbulent and counter-drifting, ice decks scattering brighter.

## v2.1.253-beta - 28th Jul 2026

* **Gas giants take their colour from their own cloud chemistry.** Instead of a temperature lookup, a giant is now painted by the decks it actually derives — Jupiter's white ammonia over the brown ammonium hydrosulphide that makes its belts, an ice giant's methane on top — weighted so the deep, dense deck dominates and the thin high haze above it only tints. Jupiter and Neptune now land close to the real planets and Uranus reads properly cyan. Saturn is still too grey: our model gives it a methane deck the real planet does not visibly have, and fixing that honestly needs the deeper atmospheric work rather than a nudge to the paint.
* Cloud decks on genuinely cloudy worlds are brighter in the 3D view again, and a star's corona breathes rather than wobbles.

## v2.1.252-beta - 28th Jul 2026

* **Mars is red again — because its iron rusted.** Surface colour was derived from bulk composition alone, so every rocky world came out the same brown. Rust is surface chemistry, not bulk make-up: it needs iron, an oxidiser to react with (free oxygen, or the carbon dioxide and water that did the job on early Mars) and long exposure. The Moon and Mercury have the iron and the age but no atmosphere, so they stay grey; a freshly resurfaced world like Io has not had the time.
* **Venus is wrapped completely again.** Its acid droplets evaporate before they land and recycle straight back into the deck, so unlike rain the cover never clears — which is how Venus is total overcast on a few parts per million of vapour while Earth, carrying more water than that, is broken cloud.
* Star limbs are brighter — the darkening was overdone and the edges read as dirty rather than curved.
* Fixed a crash on the 3D reference gallery.
* The About window opens wider.

## v2.1.251-beta - 28th Jul 2026

* **Stars have surfaces again.** Every star now derives a magnetic-activity level from its class and age, and that one figure drives everything its surface shows: granulation, spot GROUPS clustered into the active latitude bands either side of the equator rather than scattered anywhere, and the bright faculae that surround them — the froth that actually makes the Sun slightly brighter at solar maximum despite having more spots. A quiet sun shows a few small groups; a flare star is blotched with dark ones.
* **Limb darkening**, in both 2D and 3D: a star is dimmer and redder at its edge, where you look along a slant through its cooler upper layers. It is the single strongest cue that a star is a sphere and not a flat glowing disc.
* **Flares** fire from the limb of magnetically active stars — brief, bright, and only on the stars that earn them, so a quiet sun costs nothing.
* The 2D disc gallery's stars were flat colour gradients and the 3D gallery's were untextured spheres; both now show the same photosphere the live views do.

## v2.1.250-beta - 28th Jul 2026

* **Fixed: surface temperature ranges were wildly too wide.** The extremes were built by ADDING every swing together, so "coldest" meant the pole and midwinter and midnight all at full strength at once — which over-counts badly, and isn't even self-consistent (at a winter pole there is no day/night cycle to add). Mars came out at -205 °C to +93 °C against a real -143 °C to +35 °C. The swings now combine in quadrature, the standard way to add independent spreads, and Mars lands on -144 °C to +32 °C.
* Venus's sulphuric acid is no longer written into its atmosphere by hand — it DERIVES from the sulphur dioxide and water already there, through the shipped reaction. It had been listed at a hundred times its real concentration to make the clouds appear, which quietly added 110 °C of greenhouse warming to the planet.

## v2.1.249-beta - 28th Jul 2026

* **Weather.** Worlds now derive lightning, dust storms and monsoons from their own physics, alongside the precipitation tags. Lightning wants a deep convecting cloud deck — a warm thick atmosphere, volcanic ash, or a giant's own heat leaking out from below, which is why Jupiter crackles despite cloud tops at 125 K. Dust storms want a dry wind-scoured surface with air enough to lift it and no ocean to pin it down. A monsoon wants rain that reaches the ground, an ocean to supply it, and a real axial tilt to give the year seasons. Across our own system that lands as constant lightning on Venus, rain and monsoons on Earth, seasonal dust storms on Mars, and storms on all four giants — none of it authored, all of it derived. A GM's hand-set weather always wins over the physics.

## v2.1.248-beta - 28th Jul 2026

* The cloud and reaction data is now EDITABLE. A new **Reactions** tab in the atmosphere editor defines gases that combine to make another gas — pick the two ingredients, pick what they produce, set how much of the scarcer one converts. All three must already exist as gases, so the tab makes reactions, never gases. There is no chemistry database: only the reactions you care about exist, which means "Krypton + Unobtanium = pink bubblegum" is a perfectly good rule.
* **Cloud formation** is now a per-gas setting on the Gas Physics tab, beside the aurora bands: whether the gas condenses, what liquid it condenses into, and the concentration below which the deck is too thin to see. Switch it on for CO₂ and your Mars grows dry-ice skies. The matching **Cloud Opacity** — how completely a deck of that substance hides the ground — sits on the liquid in the Liquids editor, since that is what the deck is made of.

## v2.1.247-beta - 28th Jul 2026

* Fixed the stutter when zooming back out from a space station, a close moon or anything else you were right up against. Bodies off the edge of the screen were still being drawn: at that zoom a neighbouring planet is millions of pixels across, and the orrery built a clip path that size and set up a scaled image blit into it before any of it got clipped away. They are now skipped outright (allowing for a star's halo), which changes nothing visible — any on-screen world that big is drawn by a different path.

## v2.1.246-beta - 28th Jul 2026

* Atmosphere Mixes editor fixed and tidied. "+ Add Gas" always added the FIRST gas in the list whether or not the mix already contained it — so it silently overwrote that row instead of adding one, and once you deleted a compound you could never get it back. It now adds the first gas not already in the mix, and says which. The rows also overflowed the modal (a range row is wider than the column it sat in), which put the third compound off the edge of the screen entirely; rows are now bounded and wrap properly. Changing a row's gas no longer jumps it to the bottom of the list, and each mix shows a running total so one that doesn't add up to 1.00 is visible while you edit it.
* Fixed derived fluid layers going stale: when a body stopped having any (an ocean boiled off, a cloud deck thinned out), the previous pass's layers were left on it. The tags said "no cloud deck" while the saved layers still claimed one — so a world could be tinted by a deck that was never drawn.

## v2.1.245-beta - 28th Jul 2026

* Beta resumes the V2.2 line after the v2.1.3 production cut: Player Views is back on the rail alongside the Field Guide (`PLAYER_VIEWS_ENABLED` flipped back on). Production ships with it masked.

## v2.1.3-rc.3 - 28th Jul 2026

* **Fixed: Earth-like worlds were washed in a sludgy tan haze that hid the ocean.** A tholin haze — the orange organic smog that makes Titan look like Titan — was being granted to any world with a nitrogen-rich atmosphere. Nitrogen has no carbon in it: tholins need METHANE photolysed in that nitrogen, and an oxygen-rich atmosphere destroys organic haze faster than it can form. Earth, at 78% nitrogen and 21% oxygen, was getting Titan's smog painted over its blue sea. The haze now requires a real methane fraction (Titan has ~5%; Earth has about two parts per million) and an atmosphere that is not oxidising. Titan, Pluto and Triton are unaffected — Pluto and Triton get theirs from surface ices, which is a separate path.
* The reference gallery gains a "Test render" row: the same Earth-like world drawn with individual layers suppressed (cloud deck, atmosphere glow, aurora) beside a known-good control, so a wrong-looking world can be attributed to one layer instead of guessed at.

## v2.1.3-rc.2 - 28th Jul 2026

* Fixed a regression in rc.1: the binary pair-distance control could run away. Its slider maximum was derived from its own current value, so dragging to the right-hand end re-scaled the range around the new value and the next drag multiplied it again — two drags took Alpha Centauri's inner pair from 874 AU to 3e49 AU, and the physics then propagated that through the whole system. The range is now fixed (0.01 AU to 1,000,000 AU) and every distance this panel writes is clamped, so neither a drag nor a typed value can put a body somewhere unphysical.

## v2.1.3-rc.1 - 27th Jul 2026

**A worlds-and-skies update.** Since v2.1.2 the physics that derives a world now also drives how it LOOKS — one appearance model feeding both the orrery and the 3D view — with four new geological foundations sitting behind it, real gravitational lensing on black holes, and editors for the liquid and atmosphere data the whole model runs on. (The unified player-view system is still in testing and is not part of this release; the Field Guide and the Projector remain the players' views.)

Worlds you can recognise:

* **One appearance model drives every view.** Which features a world shows — craters, volcanism, auroras, polar ice, atmosphere glow, self-luminous heat — and how strongly, is derived once and rendered the same way by the 2D disc and the 3D globe, so a world looks like itself wherever you meet it.
* **Volcanic worlds glow and icy ones vent.** A tidally heated world like Io gets flickering emissive vents that turn with the surface (a full lava world glows white-hot all over); an Enceladus or Triton vents icy plumes from its southern polar region, thrown further out on low-gravity moons.
* **Auroras come in more than one colour, stacked by altitude.** A sky with several auroral gases glows in several colours at once — atomic oxygen green, nitrogen purple, CO2 violet, methane blue — layered the way the real thing is, with the purple fringe below the green band and a tenuous deep-red crown high above an Earth-like sky. Each layer fades on its own slow phase, so a mixed sky never merges to white.
* **Clouds got a physics pass.** Weather organises into east-west latitude bands that follow the planet's axial tilt, with a clear equatorial lane and two independently drifting layers for parallax. Only water condenses white: a hydrocarbon or sulphur haze takes the atmosphere's own colour, so Titan reads orange and Venus yellow. Clouds now draw on the 2D icons too, and an Earth-like reads as scattered cloud over open ocean rather than heavy overcast.
* **Atmospheres hug the surface.** The limb-glow is a tight halo in the world's own air colour instead of a generic blue bubble, so a hazy Venus no longer wears a clear blue rim.
* **Craters land where they belong.** On a tidally locked world the parent body OCCULTS incoming impactors, so the shielded near side takes fewer hits and the FAR side is the battered one — it was the wrong way round. Crater density on the sphere is roughly doubled (a globe spreads impacts over far more visible surface than a flat disc), and the smearing at the poles is gone.
* **Polar vortices.** A gas giant's standing polar jet can lock into a geometric polygon — Saturn's hexagon, and Jupiter's five-to-eight-sided poles — spawned at generation with its own side count, rendered in 2D and 3D and documented on the physics reference.
* **Rotation makes sense.** Tidally locked moons keep one face to their parent, planets spin the way they orbit, and a retrograde rotation period actually turns the world backwards instead of being ignored.
* **Molten liquids glow.** Magma, molten iron and molten glass carry a temperature-scaled thermal glow that ramps from dull red through orange to gold — and it fires on internal or tidal heat alone, so a molten ocean lights up even under a dim star.

Black holes:

* **They gravitationally lens.** A screen-space shader bends the background starlight into an Einstein ring and wraps a feeding hole's accretion disc up and over a genuinely black event-horizon shadow, with the disc's near side crossing in front, un-bent, and the far side doming asymmetrically over one side as it does in the reference imagery.
* **The disc is temperature-graded** — white-hot at the inner edge through yellow and orange to deep red at the rim — while a quiescent hole is pure black inside a slim bright ring of refracted starlight.
* **They are visible on the starmap at last.** A black hole's colour is #000000, so its glyph was drawn black-on-black. Holes are now drawn procedurally in the same style as the generated stars, on both the 2D and 3D maps, with a feeding hole clearly distinguished from a quiescent one.

The physics underneath:

* **A graded activity ladder.** The dry radiogenic path adds two regimes derived from the same interior-vigour number: plutonic (enough heat to melt at depth but never erupt) and episodic (a vigorous dry lid that traps heat until it overturns in catastrophic global resurfacing — Venus).
* **Volatile-ice retention.** A body now derives which ices it can actually hold on its surface: the species must be available, cold enough to stay solid at that pressure, and heavy enough that the vapour cannot escape to space. It reproduces the solar system — Io keeps its SO2 frost, the icy Galileans keep CO2 and water, Pluto and Triton keep nitrogen and methane too.
* **Surface age.** Every solid world derives how long its visible surface has been exposed: an active world from its regime's resurfacing pace (Io repaves in ~2 Myr, Venus ~0.7 Gyr), a dead one by inverting the radiogenic decay to recover when it froze (Mars ~3.8 Gyr, the Moon ~4.6 Gyr).
* **Irradiation dose.** Stellar UV plus a cosmic-ray floor, cut by any magnetosphere and multiplied by how long the surface has been exposed. A neat result falls out: ancient Pluto reads a real dose and reddens, while Triton — same ices, but a young cryovolcanically resurfaced crust — reads almost none and stays fresh, exactly as the two look in reality.
* **Fixed: tiny moons and gas giants read as cryovolcanic.** Phobos, Deimos and Saturn were being given subsurface oceans. A body must now be large enough to be round (~200 km) before it can hold one, an icy shell or cryovolcanism — a small tidally stressed lump is shredded, not warmed to erupt.

Data you can edit:

* **A new Liquid editor** (Settings, Planets, Liquids) mirrors the atmosphere editor: every field of every solvent — melting and boiling points, triple and critical points, colour, density, conductivity, biosolvent quality — plus custom liquids and a revert for the built-ins, saved as a per-starmap override that reaches the simulation.
* **The atmosphere editor caught up to its data.** The Gases tab now exposes melting point, specific heat, radiative cooling, gas colour and a full aurora emission-band editor; previously only four of the gas fields could be edited at all.
* **Generation places any viable solvent as an ocean.** Ammonia, nitrogen, ethane, sulphuric acid, sulphur, magma — wherever the orbit's temperature and pressure leave it liquid — instead of defaulting every unpinned hydrosphere to water. Designed water worlds are unchanged.
* Liquid names carry their chemical formula and British spelling, and the built-in defaults now come from the same file the rule pack serves at runtime, so the two can never drift apart.

Reference galleries:

* **A new 3D gallery** at /discgallery3d lays out every example body in one scene, so all the 3D rendering is reviewable at a glance: textured surfaces, atmosphere glows, rings, auroras, self-luminous brown dwarfs, volcanic vents, cryovolcanic plumes, star types across the temperature range, and black holes at several accretion levels. The 2D gallery gains a star-types row, and the two cross-link.

Navigating and editing:

* **Clicking an object opens it up.** The first click frames it with everything orbiting it — or the object itself when it has none — then closes in, then steps out to the wider context. Leading with the parent view spent a click on the shot you least often want. Clicking the central star still frames a close-up first, so it never shrinks to an unclickable speck.
* **You can get from one star of a binary to the other.** A pair's members sit on opposite sides of their barycentre at different distances, and the context view only reached as far as that empty centre point — so from the outer star the partner was off-screen and unclickable, and you could step from Alpha Centauri A to B and then never back. A pair now always frames as a pair, identically from either half, in the orrery and the 3D view alike.
* **A binary pair's orbit is explained in the editor.** Editing either star shows the same two controls — how far the pair sits from its host, and how far apart the two bodies are — with each star's own distance from the centre spelled out beneath, so the editor and the data panel no longer appear to disagree. The pair-distance control is now logarithmic like every other distance slider; the old one could not widen a pair at all. Barycentres are named by what they hold, as "Pluto-Charon Barycentre (Pluto + Charon)".
* **Sizing a world changes its mass.** With nothing pinned the composition is the anchor, so dragging the radius moves the mass along that mix's mass-radius curve, and mass still moves the radius. Previously the mass sat still however far you dragged. Porosity and gas-giant inflation stay directly editable through the density slider, which is what that control now does.
* **Clicks land where you aim them under the CRT filter.** Pointer hit-testing now inverts the ancestor CSS warp, fixing the "click on the left, select something on the right" drift — it was off by up to 300 pixels.
* **A system's name is its own value.** A system defaults to its primary star's name but can be renamed independently, and that name now survives a save and reload instead of being overwritten by the star's.
* **Deleting a system asks first**, naming it — it was wiping the system, its routes and its notes without warning.
* **Fixed: the Reset View button showed garbled text** instead of its arrow. The System View source had been saved through the wrong text encoding, mangling every non-ASCII character in the file — including the dashes in the delete-system warning and the autopilot "could not start" messages.

## v2.1.244-beta - 27th Jul 2026

* Fixed the Reset View button showing garbled text instead of its arrow. The System View source had been saved through the wrong text encoding at some point, mangling every non-ASCII character in the file — the arrow, and also the dashes in messages like the delete-system warning and the autopilot "could not start" reasons.
* Sizing a world now changes its MASS. With nothing pinned the composition is the anchor, so dragging the radius moves the mass along that mix's mass–radius curve (and mass still moves the radius) — previously the mass sat still no matter how far you dragged, because the drag was being spent on porosity instead. Porosity and gas-giant inflation are still directly editable: at a fixed mass that is what the DENSITY slider does, which is where the envelope markers now live.
* Player Views is hidden behind a single release flag while the V2.2 line is still in flight; the Field Guide and the Projector are the players' launchers. Nothing is removed — flipping `PLAYER_VIEWS_ENABLED` in `src/lib/config/releaseFlags.ts` brings the whole feature back.

## v2.1.243-beta - 27th Jul 2026

* A binary pair's orbit is now properly explained in the editor. Editing either star shows the same two controls — how far the pair sits from its host, and how far apart the two bodies are — and a line beneath spells out each star's own distance from the centre, so the editor and the read-only data panel no longer appear to disagree (they were quoting the separation and the member's share of it under near-identical labels). The pair-distance control is now the same logarithmic slider used everywhere else; the old linear one was capped at 1.5x the current value, so a pair could never be widened.
* Barycentres are named by what they hold — "Pluto-Charon Barycentre (Pluto + Charon)" — everywhere they are referenced, with nested pairs flattened to the real bodies. A nested pair previously read "Alpha Centauri System Barycentre (Alpha Centauri Barycentre)", naming nothing you can see, and the Field Guide picked the wrong dominant star for such a system (a nested pair's combined mass scored zero, handing it to the lighter outlying star).
* Newly generated and imported barycentres use UK spelling ("Barycentre"), matching the rest of the interface.

## v2.1.242-beta - 27th Jul 2026

* Fixed getting between the two stars of a binary. A pair's members sit on opposite sides of their barycentre at different distances, and the context view only reached as far as that empty centre point — so from the OUTER star the partner was off-screen and unclickable, and you could step from Alpha Centauri A to B and then never back. A pair now always frames as a pair, identically from either half, in both the orrery and the 3D view (which had been treating every binary star as the system root and giving it no context view at all).
* A barycentre no longer has a "fill the screen" step — it is a point between two bodies, so that step landed on a few thousandths of an AU of empty space.

## v2.1.241-beta - 27th Jul 2026

* Clicking an object now OPENS IT UP first: the first click frames it with everything orbiting it (or goes straight to the object itself when it has none), then closes in, and only then steps out to the wider parent context before cycling. Leading with the parent view spent a click on the shot you least often want. The central star is unchanged (close-up first, whole system next).

## v2.1.240-beta - 24th Jul 2026

* New "Typewriter" transition: the new page is typed on character-cell by character-cell behind a blinking block caret, with an irregular per-keystroke rhythm and a beat on each carriage return. Made for the Terminal style. (Confirmed at parity with Mappadux first: all ten of its transitions were already ported identically.)
* D8: stepping between stages in the live player view (starmap ↔ system, any view — document, 2D map, 3D holo) now plays the preset's transition over the whole stage: the outgoing screen is snapshotted just before the swap and animated away over the incoming view. The document's own per-page transition is unchanged.

## v2.1.239-beta - 24th Jul 2026

* D9: the starmap "Text List" player view is now a DOCUMENT — the systems index rendered through the same block-model engine as the system Guide document (renamed "Document" in the editor). It takes the preset's full appearance (colouration, fonts, nav style, genuine headers/footers, company/footer stamps) and the real GPU filter; tap a system to enter. One engine across starmap + system + info panels, so appearance changes stay aligned everywhere. Unit tests cover the new builder.

## v2.1.238-beta - 22nd Jul 2026

* D6 unify: the 2D map and 3D holo info panels now render through the SAME document engine as the Document view (one builder, one theme resolver, one renderer — DocPanel). The panel shows the preset's full appearance: colouration, tags style, description, and the body graphic (3D sphere / gallery disc / simple disc / photo) with hand-spin. The filtered 3D HUD card renders the same panel blocks. Legacy Field Guide skins keep their original panel.
* "Body graphics" is back for the 3D view — now driving the info block's picture (the orrery itself stays true 3D spheres). Tags style and Photo framing apply to every view.
* Editor: the System tab for 2D/3D is split into a "3D display"/"2D map display" fieldset and an "Info Block Appearance" fieldset — and the info-block preview APPEARS docked over the scene while you tweak info-block controls, then hides when you move to display controls, so each edit shows the thing it changes.

## v2.1.237-beta - 22nd Jul 2026

* Player-view hold screens are now a quote INTERSTITIAL: a random planet/star backdrop with a dimmed stripe carrying a random space quote (italic serif, attribution beneath), a double-line frame, and a QR code so new players can scan straight in. Shown both when a player connects before any broadcast and when the GM stops the view. Quotes live in static/space-quotes.txt (editable without a rebuild); quote + image re-roll each time.

## v2.1.236-beta - 21st Jul 2026

* Header/footer tip banners are now full-width bands flush to the top/bottom edge — no centred pill, no dead space; the note runs the whole page width before wrapping. Applies everywhere a tip banner is drawn (document, 2D/3D HUD, cover, list).
* Hand-spin fix: an interactive 3D globe no longer auto-spins forever — it only turns while you drag it, and stops the instant you release (auto-turntable and momentum damping are off in spin mode).

## v2.1.235-beta - 21st Jul 2026

* Guide document header/footer are now genuine: the top/bottom tip banners (and the company/footer stamps) reserve their own band, and the body is clipped to flow between them instead of running underneath. They still live in the document canvas, so the visual filter wrecks them along with the rest of the page.
* The preset editor's Document preview now shows sample header/footer notes when Guide tips are on, so the reserved bands are visible at design time.

## v2.1.234-beta - 21st Jul 2026

* Document 3D body graphic: the default view now looks straight on to the equator, tilted ~20° down (was too top-down), and the turntable spins twice as fast.
* A tidally-locked world keeps its key light WORLD-fixed so the same hemisphere stays lit as it turns (the permanent day side sweeps correctly to night), instead of the star appearing to follow the camera.
* When "Players can click / focus / scrub" is on, players can drag the 3D body to spin it by hand (rotate only — no zoom out of the frame).

## v2.1.233-beta - 21st Jul 2026

* Fixed: clicking a barycentre planet (e.g. Pluto/Pluto-Charon) on the document's system map in the live player view showed the primary star instead. The selection now resolves a barycentre to its dominant member (so the holo/inspector focus a real body) and feeds the document the barycentre id (so it reads "Pluto (Pluto-Charon…)" and the marker highlights).
* Document system map: planet names now slope up at 45° to the right of their marker so tightly-packed outer worlds no longer overprint each other (star and belt names stay below). The planet name is part of the clickable hit area too.

## v2.1.232-beta - 21st Jul 2026

* Rationalise the System-stage editor ahead of the info-block unify (D6): the "Appearance" section is now "Info Block Appearance", and the per-slot colour swatches are tucked into a collapsible "Colours" disclosure.
* Body-graphics "Simple disc" and "Flat shape" no longer render identically: Simple disc is now a plain coloured circle by body TYPE (the schematic's class colour), while Flat shape reuses the full 2D-gallery render (texture, surface features, terminator, rings). 3D sphere and Photo unchanged.

## v2.1.231-beta - 21st Jul 2026

* The "Body graphics" control (the per-body picture) is hidden for the 3D holo view — it's an info-block choice, not an orrery one, and the 3D orrery always renders bodies as 3D spheres. The 3D scene now forces sphere bodies so a value stored for another view can't flatten it to discs. Document and 2D map keep the control; it returns to 3D pointed at the info block once that formatting is unified (D6). Auroras toggle now shows for the 3D view regardless.

## v2.1.230-beta - 21st Jul 2026

* Unify (D6, step 1): the 3D holo's info card now renders its content through the SAME document engine as the Document system-view, via the existing card-blocks seam — retiring the card's bespoke title/facts/description drawing so there's one info-block code path to maintain. Panel chrome (rounded frame, close glyph) is unchanged.

## v2.1.229-beta - 21st Jul 2026

* Black holes in the 3D body graphic are now framed almost edge-on with a slight tilt, so the accretion disc reads as the iconic lensed band (far side arcing over the top) rather than a flat top-down ring.
* Body photos auto-centre on the subject: a quick pixel scan finds the planet/star disc against the dark background, so every frame (full / letterbox / sliver) crops to the body's edge instead of the picture's, killing dead space. Degrades to the old picture-centred crop when the subject fills the frame or can't be sampled.

## v2.1.228-beta - 21st Jul 2026

* Fixed the document's 3D body graphic: a lone planet was rendering as a glowing self-lit ball (the holo treats a root-level body as the system's star) with a massive aurora bloom. It now wraps the subject in an invisible root barycentre so a planet stays a planet, lit by a new PORTRAIT key light — coloured by the system's star, held at a fixed 3/4 angle relative to the camera — so the body always reads as mostly day with a sliver of night. Auroras are off in the thumbnail (they bloomed when zoomed to fill the frame). Flat colour now visibly takes effect, and a black hole is framed nearly top-down for the best view of its accretion disc.

## v2.1.227-beta - 21st Jul 2026

* Removed the redundant "Manage presets…" link from the Field Guide launcher — it just opened Player Views, which is reachable from the rail already.

## v2.1.226-beta - 21st Jul 2026

* The 3D body graphic is now the REAL 3D-view render, not a simplified stand-in. It reuses the holo engine (HoloView) on a single-body scene, so it gets the actual star photosphere + sunspots, black-hole accretion disc + gravitational lensing, and every render style — with a new Render dropdown (filled / lo-poly / wireframe) when Body graphics is set to 3D sphere. True/Flat/Monochrome colour now drive the body too, the ring shows, and the 3D scene's ground matches the page colour. Removed the bespoke single-body renderer.

## v2.1.225-beta - 21st Jul 2026

* Document colouration fixes: the colour swatches now refresh when you change the Colouration style (they were staying stale). The Monochrome checkbox is now a Colour dropdown — True colour / Flat colour (by type) / Monochrome. And the Terminal colouration is now a neutral white monocolour rather than baked-in green, so a CRT/phosphor filter can tint it green, amber or anything.

## v2.1.224-beta - 21st Jul 2026

* Monochrome now bleaches the body graphics too — the 2D disc, the 3D body and a body photo all go grey under the monochrome scheme, so a tinting filter can colour them along with the rest of the page. The 3D body now inherits the body's ring (a ringed world shows its ring in the spinning 3D view).

## v2.1.223-beta - 21st Jul 2026

* The photo "vertical sliver" frame now lays the info block out in two columns: the body name spans the top, the photo runs down the LEFT as a tall sliver, and the facts + description sit in the RIGHT column beside it (tags and moons stay full-width below). Added a lightweight two-column mode to the document engine to do it.

## v2.1.222-beta - 21st Jul 2026

* Body graphics now REUSE the real renderers instead of a bespoke one: the 2D option is the actual PlanetDisc (the 2D disc gallery), and 3D is the holo body — a real textured, cloud-wrapped sphere that slowly spins, the same one the 3D gallery shows. The stand-in canvas disc has been removed. On the system map, the body markers now use each body's true/type colour (brown/red/blue by type) instead of a flat tint, the diagram takes only the vertical space it needs (no more black band), and planets take click priority over belts so a world inside a belt is still selectable.

## v2.1.221-beta - 21st Jul 2026

* Document body graphics + entry polish. Entering the Document view now preselects the system's primary star, so a body's file shows straight away. The body-graphics options render distinctly: 3D sphere = a glossy shaded ball (specular highlight), Simple disc = a softer disc, Flat shape = a flat fill with an outline. Photo gains framing options — letterbox band (default), full image, or a tall vertical sliver.

## v2.1.220-beta - 21st Jul 2026

* Fixes on the Document body graphics + monochrome: "Photo" now actually shows the body's picture (the loader was rejecting the app's own same-origin image paths, only allowing data URLs). Monochrome now bleaches EVERY object on the page — the tag pills and the rainbow schematic go grey too, not just the text.

## v2.1.219-beta - 21st Jul 2026

* Document look reworked around feedback. The chosen FONT is now respected throughout, with an optional separate heading font. "Document style" becomes "Colouration": each style is a starting point that seeds an editable per-slot colour set (background, heading, body, labels, values, accent, lines) you can then tweak — the layout is the same across styles. The Colour dropdown is gone; a single "Monochrome (bleach)" toggle now bleaches the WHOLE page to grey for a tinting filter. Tags gain a "Grouped list" (type headings, plain text) option, and navigation elements can render as plain text or as boxes/buttons.

## v2.1.218-beta - 21st Jul 2026

* Page transitions are live in the Guide document. A new "Transitions" tab on the preset editor lets you pick a transition (Fade, CRT Collapse, Static Dissolve, Wipe, Terminal Clear, …) and tune its controls. Opening a different world captures the current page, rebuilds the next one underneath, then animates the snapshot away to reveal it — a bit of life between pages. (Filtered surfaces now keep their draw buffer so the snapshot reads cleanly.)

## v2.1.217-beta - 21st Jul 2026

* Groundwork for player-view transitions (reused from Mappadux, the same way filters were): ported the transition engine (snapshot the current frame, rebuild underneath, animate the snapshot away to reveal it) plus the shipped set — fade, CRT collapse, static dissolve, wipe, terminal clear, and more — as an auto-discovered registry. Not wired into any view yet (a Transitions editor tab + view wiring follow).

## v2.1.216-beta - 21st Jul 2026

* Tags in the Guide document now render three ways, chosen per preset: coloured pills (each tinted by its type), grouped by type (a small heading per category), or a plain text list. The tag list is pulled out of the fact rows into its own styled section. New "Tags" picker on the document's System tab.

## v2.1.215-beta - 21st Jul 2026

* Document STYLE range (one renderer, many looks): a new "Document style" picker gives the Guide document four distinct skins — The Guide (dark, illustrated, serif), Company report (white paper, black ink, bold sans, numbered rows — modelled on the paper Report), Travel brochure (warm cream, coral/teal), and Terminal (green phosphor mono, "> " log lines, shines under CRT). Each is a full theme (font + colour set + list style); a preset's own colours override it. The System "View" dropdown is renamed "Document" and the redundant "Text list" option is dropped — the CRT Terminal preset now IS the document in its terminal style.

## v2.1.214-beta - 21st Jul 2026

* Preset editor: stop showing controls that don't apply to the Guide document. The scene "Background" (space/greenscreen/…) is hidden for the document (it sets its own ground from its theme), and "Info panel width" is hidden too (the document's info block is part of the page, not a docked panel — only a text-size applies). Also wired "Hide body info block" so a document preset can show the schematic alone (a clean kiosk/projector display).

## v2.1.213-beta - 21st Jul 2026

* Guide document now shows body PICTURES (was text-only): the info block draws the body's illustrated procedural disc — a shaded, true-coloured sphere with a Saturn-ring for ringed worlds — from its Body-graphics choice. Body graphics gains a "None" option (honoured in the document; intended to carry across every info surface, incl. the 3D holo, so a preset can show 2D images or nothing). Photo mode still shows a GM/stock picture when one is loaded (data-URL only, to keep the WebGL filter untainted).

## v2.1.212-beta - 20th Jul 2026

* Molten liquids now glow. New `incandescent` flag on liquids (magma, molten iron, molten glass) drives a temperature-scaled thermal-glow emissive layer through the 3D render path (the same emissive material stars use) — colour and brightness ramp with heat (dull red → orange → gold, brighter the hotter). Crucially it fires even when the world's stellar temperature is low, so a tidally/internally-heated molten ocean lights up under a dim star. Editable via a new "Incandescent" checkbox in the Liquid editor. Molten iron / molten glass also got proper warm colours (were dull grey).
* Fixed the interior-iron name mismatch: the conductive core layer used `liquid-iron` while the solvent def is `molten-iron`, so `liquidDef()` found nothing. Unified on `molten-iron` (dynamo/magnetism unaffected — it string-matched either way).

## v2.1.211-beta - 20th Jul 2026

* Aurora-bands editor now explains itself: column headings (Colour / Name / Efficiency / Altitude / Min frac.) with hover help, and a note that bands set the palette only — a world glows when it also has a magnetic field and particle flux. "Min frac." tooltip spells out the concentration threshold (only O₂'s crimson uses it, at 0.12).

## v2.1.210-beta - 20th Jul 2026

* New Liquid editor (Settings → Planets → Liquids…), mirroring the atmosphere editor: edit every field of each solvent — melt/boil, triple/critical points, colour, density, refractive index, conductivity, biosolvent quality and family — plus add custom liquids and revert built-ins. Saved as a per-starmap override (`rulePackOverrides.liquids`) merged into the effective rule pack, so edits reach the sim. Family is a free dropdown: promote a derived `internal` fluid (molten glass, SO₂…) to a real ocean solvent, or leave it as a cloud/interior fluid.

## v2.1.209-beta - 20th Jul 2026

* Auroras are now data-driven: each base gas carries its emission bands (`GasPhysics.aurora`) in `atmospheres.json` instead of a hardcoded table. A gas can have multiple bands — atomic oxygen glows green (main) AND crimson (high) — with per-band colour, efficiency, altitude and an optional concentration threshold. Resolved onto the body at process time (`resolveAuroraEmitters`); the built-in default matches the old values exactly, so no visual change until edited.
* The atmosphere editor caught up to the data: the Gases tab now exposes Melting Point, Specific Heat, Radiative Cooling, Gas Colour (with a colourless option) and an Aurora Emission Bands editor (add/remove bands, colour, efficiency, altitude, min fraction) — previously only 4 of the gas fields were editable.

## v2.1.208-beta - 20th Jul 2026

* Fixed the dev server being taken down by v2.1.204's liquids change: `constants.ts` imported the canonical `liquids.json` from `static/` (public dir), which Vite refuses in `npm run dev` (production was unaffected). Moved the canonical file to `src/lib/data/liquids.json` and import that; still a single source of truth. The rulepack loader now treats a pack's `liquids.json` as an optional override (missing = use the built-in default, quietly). Verified in dev, build and tests.

## v2.1.207-beta - 20th Jul 2026

* WS2 Phase 3 follow-up: the preset editor now offers "Guide document" in the System-view dropdown and renders a LIVE preview of it (tap a world on the schematic to drill into its file), so the Guide document is designable/testable in-editor without a live broadcast. Also fixed the Player Views summary showing "System (undefined)" for document presets (added the missing view label).

## v2.1.206-beta - 20th Jul 2026

* Fixed a stale test: PlanetDisc's "asteroid renders an irregular path" still asserted impact craters on a sub-60km body, but small strengthless rubble piles now wear a rough regolith speckle instead of craters (the v2.1.195 change). Updated the assertion to match; full suite green again.

## v2.1.205-beta - 20th Jul 2026

* Liquid labels now carry a chemical formula and use British spelling (e.g. Sulphuric Acid (H₂SO₄), Molten Sulphur (S₈), Hydrogen Sulphide (H₂S), Molten Glass (SiO₂)). Data only — identifiers unchanged. Confirmed every defined liquid is in use: 14 are surface/ocean solvents; the 6 `internal` fluids (SO₂, molten sodium/potassium, molten glass, metallic hydrogen, superionic water) are live cloud-condensate or interior-dynamo fluids, so nothing was removable.

## v2.1.204-beta - 20th Jul 2026

* Liquids are now a single source of truth: `constants.LIQUIDS` imports the starter-sf `liquids.json` (the same file the loader serves at runtime), so the built-in defaults and the pack can never drift again. Removed the stale truncated `LiquidDef` duplicate in `constants.ts`.
* Procedural generation can now place any non-internal solvent as a surface ocean wherever it is liquid at the orbit's temperature (ammonia, nitrogen, ethane, sulfuric acid, sulfur, H₂S, HCN, magma…) instead of defaulting every unpinned hydrosphere to water; designed liquid-water worlds are unchanged. Dropped the now-redundant `autoGenerate` flag.

## v2.1.203-beta - 20th Jul 2026

* Fixed the body Hydrosphere tab showing a duplicated/stale liquid list: it now receives the rule pack so it reads the pack's `liquids.json` instead of the built-in fallback set. Also finished the starter-sf liquids dedup (removed two leftover `hydrogen-sulfide`/`hydrogen-cyanide` copies so the `autoGenerate:false` versions take effect).

## v2.1.202-beta - 20th Jul 2026

* WS2 Phase 3: The Guide's system view is now the interactive canvas GUIDE DOCUMENT — the orbital schematic, the selected body's file (title/facts/description), and its moons/constructs as in-page navigator lists, all drawn by the block-model engine and wrecked by the real filter (new `FilteredDocumentView`). Tapping a world on the chart or a navigator row drills straight in; the info block is PART OF THE PAGE, so there's no separate floating inspector. The built-in "The Guide" preset points at it. (Procedural body discs return to the document in Phase 4; for now bodies show the schematic + text.)

## v2.1.201-beta - 20th Jul 2026

* WS2 Phase 2: ported the old Field Guide's log-scale orbital line-diagram to a canvas (`drawSystemSchematic`) so the "simple system drawing" goes through the GPU filter with the rest of the document — star distance-lines, planets placed by log(a), belt blobs, moon pips, labels, with The Guide's rainbow or a theme-coloured/mono look. Wired it into the engine's `schematic` block (replacing the placeholder), and it returns 2D hit boxes so a tap can pick a planet by position. Topology helpers extracted to a shared module for the Phase 3 navigator. Still not surfaced in any view — that's Phase 3.

## v2.1.200-beta - 20th Jul 2026

* WS2 groundwork: added the Guide-document block-model engine (`renderDocument` over `heading|text|keyValue|list|image|schematic|spacer|rule` blocks with a full theme colour set + list/document style), lifted the shared `wrap`/`ellipsise` text primitives out of infoCard/listCanvas, and extended the preset theme with optional `documentStyle`/`listStyle`/`themeColors`. No visible change yet — the engine is proven by re-rendering the info card through it (unit test); shipped draw paths untouched.

## v2.1.198-beta - 20th Jul 2026

* Fixed the vertical seam that sometimes showed on cloudy worlds in 3D: the cloud-deck texture now wraps its puffs across the u=0/1 boundary so the deck tiles seamlessly around the sphere (the base surface already did this).

## v2.1.196-beta - 20th Jul 2026

* Cryovolcanic plumes read consistently in 2D and 3D now: the 2D disc clusters its jets at the SOUTH POLE (physically where they vent, e.g. Enceladus) fanning out with a chain of brightening puffs, rather than scattered round the whole limb; the 3D jets were nudged a touch more prominent to meet in the middle.

## v2.1.195-beta - 20th Jul 2026

* Gas/ice giant clouds baked to ground level (no floating shells); the 3D surface no longer double-bakes clouds; longitude texture seam removed; small rubble-pile asteroids wear a rough regolith instead of craters; 2D disc gained cryo plumes; gallery shows polar-vortex worlds in 3/4 view.

## v2.1.194-beta - 20th Jul 2026

* Fix: the redrawn 2D black-hole diagram (the fuzzy edge-on blaze) was left out of the v2.1.193 commit, so the reference gallery still showed the old version. Now included.

## v2.1.193-beta - 20th Jul 2026

* Auroras now stack by ALTITUDE like the real thing: the purple nitrogen fringe sits below the bright green oxygen band, and a rich oxygen sky (Earth-like) adds the tenuous deep-red crimson crown high above. Each colour layer fades in and out on its own slow phase, so a mixed sky shows one colour or several - never a merged white.
* Black-hole diagram redrawn again against the 3D reference: the disc is now a fuzzy edge-on particle blaze whose width clearly grows with the feeding level (20% to 100%), with the bright near-side blade crossing in front of the hole - no more "eye". Starmap glyphs now read the actual accretion level, so different feeders look different on the map.

## v2.1.192-beta - 20th Jul 2026

* 2D black-hole diagram redrawn to match the 3D lensed look: a wide, thin accretion disc (hot-white inner fading to orange at the tips) with a black event horizon inside a bright photon ring, and the disc lensed up over the top and passing in front below. Applied to the reference gallery and both starmap glyphs.
* More aurora examples showing gas mixes on the 2D and 3D galleries — added CO2 (violet, previously missing from 3D), an O2+CO2 green/violet mix, and an N2+CH4 purple/blue mix, so the multi-colour auroras are demonstrated.

## v2.1.191-beta - 20th Jul 2026

* Multi-coloured auroras: a sky with more than one auroral gas now glows in more than one colour at once (atomic oxygen green, nitrogen purple, CO2 violet, a H/He giant red-pink, methane blue), layered and weighted by concentration x emission efficiency - so Earth shows green fringed with purple, and the colours hint at the atmosphere's mix. Applies in the 3D holo (was single-colour) and the 2D disc.
* Clouds are no longer always white: only water condenses white; a hydrocarbon or sulphur haze takes the atmosphere's own colour, so Titan reads orange and Venus yellow. The high cloud layer is also tinted toward the dominant gas's colour, giving each world's deck a bit of variety.

## v2.1.190-beta - 20th Jul 2026

* Clouds got a physics pass: weather now organises into east-west latitude BANDS (winds run E-W, not N-S) with a clear equatorial lane, and the bands follow the planet's axial tilt. The 3D deck is now TWO layers drifting independently for parallax, and each cloud puff carries a tonal shift so a single-colour deck swirls in shades rather than reading flat (Venus swirls in yellows).
* Gas giants now get a swirling gas-coloured cloud deck over their banding — an easy visual "perk" — while still requiring real atmospheric pressure elsewhere (no clouds on Mars).
* Clouds now render on the 2D disc icons too (they were 3D-only): banded E-W streaks, white on rocky worlds, gas-coloured on giants.

## v2.1.189-beta - 20th Jul 2026

* Starmap black holes are now drawn procedurally to match the reference gallery instead of pasting the photo images: a black event horizon inside a bright white photon ring, plus a temperature-graded accretion disc when feeding - so they sit alongside the generated stars in the same style, on both the 3D starmap and the 2D map.

## v2.1.188-beta - 20th Jul 2026

* Cloud decks dialled back: smaller, patchier cloud systems and a lower coverage curve so an Earth-like reads as scattered white clouds over open ocean rather than a heavy overcast.

## v2.1.187-beta - 20th Jul 2026

* Cloud decks now read clearly: a thin deck (Earth) draws a few bold white cloud systems with open gaps over the surface instead of a faint same-colour smear, and only a thick veil (Venus) takes the haze colour. Clouds are a touch self-lit so they stay legible on the shadowed side.

## v2.1.186-beta - 20th Jul 2026

* Starmap black holes now distinguish feeding from quiescent: a FEEDING (active) hole shows the accretion-disc image, while a quiescent one shows the plain black-hole image in the 3D starmap and a clean white-edged black circle on the 2D map (so it always reads clearly, never black-on-black).

## v2.1.185-beta - 20th Jul 2026

* Atmosphere overhaul on the 3D holo: the limb-glow now hugs the surface tightly (was a big bubble) and takes the world's own air/haze colour instead of a generic blue - so Venus reads hazy yellow, not a clear blue rim. Added a separate cloud deck that floats above the surface on its own drifting shell: a patchy layer on Earth-likes, an opaque haze veil on Venus-likes (giants excluded - their bands already are the cloud tops).

## v2.1.184-beta - 20th Jul 2026

* Deleting a system now asks for confirmation first (naming the system) - it was wiping the whole system, its routes and notes with no warning.
* System names are now their own value, separate from the primary star: a system defaults to its star's name but can be renamed independently (right-click a system on the starmap), and that custom name now survives a save / load / refresh instead of being overwritten by the star name.
* Tidally-locked moons now correctly keep one face toward their parent in the 3D holo. They were spun by a free clock that started at an arbitrary phase, so each moon locked at a different offset (some facing right, others ~90° out); the facing is now derived from the live orbital geometry, so the battered anti-parent hemisphere consistently points away.

## v2.1.183-beta - 19th Jul 2026

* Black holes were invisible on the starmap - a black hole's colour is #000000, so its glyph read black-on-black on the dark map (and player views). Now draws the black-hole image instead of an unlit colour dot, in both the 3D starmap (used for the flat "2D" view too) and the SVG 2D map.

## v2.1.182-beta - 19th Jul 2026

* Dialled the 3D atmosphere limb-glow back to the subtler level - the last bump made it too prominent.

## v2.1.181-beta - 19th Jul 2026

* Tidally-locked cratering was back-to-front: it clustered impacts on the sub-parent (near) face. The parent body actually OCCULTS incoming impactors, so the shielded near side takes fewer hits and the anti-parent FAR side is the more-cratered one - now biased that way in both 2D (shadowed limb) and 3D (antistellar edges). Renamed the model's `leadBias` to `farSideBias`.
* 3D crater density roughly doubled - the sphere disperses impacts over far more visible surface than the flat 2D disc, so old worlds now read as properly saturated.
* 3D reference gallery: added the atmosphere limb-glow (a pressure-scaled Fresnel halo hugging the silhouette) that only the 2D disc had before, wired into both the gallery and the live holo; and brightened the gallery lighting a chunk so surfaces and glows read clearly.

## v2.1.180-beta - 19th Jul 2026

* Texture pole-pinch fix: craters now pre-stretch horizontally by 1/cos(latitude) so the equirect UV squeeze brings them back round at the poles instead of smearing into swirls.
* Polar vortices: a gas giant's standing polar jet can lock into a geometric polygon (Saturn's hexagon; Jupiter's poles run 5-8 sided) - spawned at generation with the side count carried on a feature/polar-vortex tag (not always six), rendered in 2D + 3D, documented on /physics, with a new gallery row in both reference galleries.

## v2.1.167-beta - 19th Jul 2026

* Geo foundations step 4 - IRRADIATION DOSE: the last foundation. Each world derives how much space-weathering radiation its surface has taken - stellar UV (from its equilibrium temperature) plus a cosmic-ray floor so even distant, dimly-lit worlds redden over time, cut by any magnetosphere, multiplied by how long the surface has been exposed. This drives tholin darkening. A neat result falls out: ancient Pluto (with methane/nitrogen ices) reads a real dose and reddens, while Triton - which has the same ices but a young, cryovolcanically resurfaced crust - reads almost none and stays fresh, exactly as the two look in reality. Shown in the Newton panel and as a low/moderate/high tag. Completes the four physics foundations behind the coming frost/tholin/crater/ice-crack visuals.

## v2.1.166-beta - 19th Jul 2026

* Geo foundations step 3 - SURFACE AGE: every solid world now derives how long its visible surface has been exposed. An active world reads its regime's resurfacing pace (Io repaves in ~2 Myr, Earth ocean-floor ~0.2 Gyr, Venus ~0.7 Gyr); a dead world inverts the radiogenic decay to recover when it froze (Mars ~3.8 Gyr, the Moon and the old outer moons ~4.6 Gyr). This is the quantity cratering, weathering and tholin build-up all key off. Shown in the Newton panel and as a young/moderate/old/ancient tag.

## v2.1.165-beta - 19th Jul 2026

* Geo foundations step 2 - volatile-ice RETENTION: a body now derives which ices it can hold on its surface, from real physics - the species must be available (an ice inventory for water/N2/CH4/CO2; active volcanism for Io-style SO2 frost), cold enough to stay solid (the liquids phase data), and heavy/gravity-bound enough that the sublimated vapour cannot escape to space (Jeans parameter). Reproduces the solar system: Io keeps SO2, the icy Galilean moons keep CO2 + water, Pluto and Triton keep CO2 + nitrogen + water + methane. Surfaced as a volatiles/ices tag and a Newton-panel explanation; the base for coming frost/tholin/bright-ice visuals.

## v2.1.164-beta - 19th Jul 2026

* Geo foundations step 1 - activity LADDER: the dry radiogenic geology path is now graded, adding two regimes derived from the same interior-vigor number - PLUTONIC (0.35-0.6: enough heat to melt at depth but not to erupt or move the lid - intrusive only) and EPISODIC (vigorous dry lid that traps heat until it overturns in catastrophic global resurfacing - Venus, promoted from a note to a real regime). Habitability, Newton notes and reasons-to-visit follow. No change to wet (plate-tectonics), tidal, cryo or inactive worlds beyond the new bands.

## v2.1.163-beta - 18th Jul 2026

* Dev doc: geo-foundations design (docs/dev/geo-foundations.md) — activity ladder (plutonic/episodic), per-species volatile-ice retention, surface age, irradiation dose; the physics-first base for the banked appearance backlog.

## v2.1.162-beta - 18th Jul 2026

* Fixed the holo background turning a brighter blue whenever a black hole was present. The black hole's lensing routes the frame through the post-processing composer, and the near-black navy clear-colour was being written to the composer's working buffer without its colour conversion, then re-encoded on output — lifting 5,7,12 to 38,46,61. The background is now set as a colour-managed scene background, so it stays identical whether or not a hole (or any post effect) is on screen.

## v2.1.161-beta - 18th Jul 2026

* Black-hole lensing polish from review: (1) only the disc's NEAR half passes in front of the shadow — the far half's light is bent into the arcs, killing the "hoop floating in front" look; (2) the lensing is now ASYMMETRIC like the reference — the far side's light domes mostly over ONE side of the hole (which side follows the viewing angle), with a thin sliver on the other; (3) fixed the dark "blank square" around a quiescent hole — the drawn horizon mesh was being magnified by the lens, smearing black over the starfield; it is now much smaller than the shader's shadow mask; (4) slimmer, more graceful disc band.

## v2.1.160-beta - 18th Jul 2026

* Black-hole lensing simplified AND completed: replaced the depth-buffer machinery with an analytic exemption — since the accretion disc is auto-generated, the shader is simply told where its projected band is and passes it through un-lensed. The disc's near side now crosses in front of the shadow in BOTH the gallery and the live player views, with the far side still wrapping over/under. Lighter than before (no offscreen target, no depth texture, no twin geometry — back to a single fullscreen pass) and fully mobile-friendly.

## v2.1.159-beta - 18th Jul 2026

* Black-hole lensing is now DEPTH-AWARE: the accretion disc's near side (in front of the hole) crosses straight in front of the shadow — its light reaches us unbent — while the far side still wraps over the top, so you get the full disc, not just the arcs. Pure-white refracted-starlight halo. (3D gallery; live-holo depth wiring to follow.)

## v2.1.158-beta - 18th Jul 2026

* Black holes reworked toward the "Gargantua" look: killed the bright glow ball (it read as a crystal ball), auto-generate a temperature-graded accretion disc for a feeding hole (real BH systems carry no ring node), render the disc edge-on + over the shadow so the lensing wraps its far side OVER and UNDER a genuinely-black shadow, and give a bare hole a slim bright ring of refracted starlight. Live-holo composer gains an OutputPass so a BH scene keeps proper colour.

## v2.1.157-beta - 18th Jul 2026

* Fixed the 3D gallery looking dull/flat (a regression from routing it through the lensing composer): added a final OutputPass so the composer applies the sRGB conversion that direct rendering does automatically. Colours are vivid again.

## v2.1.156-beta - 18th Jul 2026

* Black holes now gravitationally LENS (the "Interstellar" look) — a lightweight screen-space shader bends the background starlight around each hole into an Einstein ring and wraps a feeding hole's accretion disc up and over the top, around a black event-horizon shadow. Toggle it per 3D preset (Black-hole gravitational lensing, on by default; it does nothing without a black hole in view). Showcased in the 3D gallery's black-hole row (with a star backdrop to bend).

## v2.1.155-beta - 18th Jul 2026

* 3D gallery: auroras now render (driven by the appearance model's aurora tag); and stars FLARE — each corona pulses in size + brightness scaled by the star's activity, so an active M-dwarf flare star visibly throbs while a calm A star barely moves (like the accretion discs animate).

## v2.1.154-beta - 18th Jul 2026

* The 2D disc gallery (/discgallery) now leads with a Star types row too, and both galleries cross-link (2D <-> 3D).

## v2.1.153-beta - 18th Jul 2026

* New 3D reference gallery at /discgallery3d — the holo counterpart of /discgallery. Lays out every example body in ONE scene so all the 3D renderings are reviewable at a glance: textured surfaces, atmosphere glows, gas giants + rings, auroras, self-luminous brown dwarfs, glowing volcanic vents, cryovolcanic plumes, star types across the temperature range, and black holes at different accretion levels (with temperature-graded discs). Each body spins slowly so asymmetric features read as it turns. Refactored the shared emissive builders into one module used by both the live holo and the gallery.

## v2.1.152-beta - 18th Jul 2026

* 3D holo emissive polish: self-luminous bodies (brown dwarfs / hot young sub-stellar worlds) now glow with a dim halo coloured by their own heat (deep red -> amber). Black holes with an accretion disc now render it as a glowing, temperature-graded disc -- white-hot at the inner edge through yellow and orange to deep red at the rim (the "Interstellar" look), with a matching hot white-gold inner glow.

## v2.1.151-beta - 18th Jul 2026

* Physics fix: tiny moons (Phobos, Deimos) and gas giants (Saturn) were wrongly reading as cryovolcanic / subsurface-ocean worlds. A body now needs to be large enough to be round (~200 km, the icy hydrostatic-equilibrium limit — keeps Enceladus) before it can hold a subsurface ocean, a differentiated icy shell, or cryovolcanism. A small tidally-stressed lump is shredded, not warmed to erupt; gas/ice giants have no crust to vent through.

## v2.1.150-beta - 18th Jul 2026

* 3D holo: cryovolcanic worlds (Enceladus / Triton type) now vent icy PLUMES — jets of glistening spray from the southern polar region that throw further out on low-gravity moons and shorter on heavier ones. Driven by the shared appearance model (geoActivity cryovolcanic regime).

## v2.1.149-beta - 18th Jul 2026

* 3D holo: volcanic worlds now GLOW. Tidally heated / lava bodies (like Io) get flickering emissive vents that turn with the surface — a full lava world glows white-hot all over, a few hotspots get orange vents — scaled by how volcanic the world is. Driven by the shared appearance model, so it stays consistent with the 2D disc.

## v2.1.148-beta - 18th Jul 2026

* Internal: extracted the planet-appearance logic (which surface features a world shows — craters, volcanism, auroras, polar ice, atmosphere glow, self-luminous glow — and how strong) out of the 2D disc into one shared model, so the 2D orrery and 3D holo can drive the same features next. No visual change to the disc gallery.

## v2.1.147-beta - 18th Jul 2026

* 3D holo planet spin direction: planets now rotate the same way they orbit their star and the same way their moons, rings and belt disc go round — previously the surface spun the opposite way to its own disc. A retrograde rotation period (negative value, e.g. Venus/Uranus) now correctly spins the world backwards instead of being ignored.

## v2.1.146-beta - 18th Jul 2026

* Click accuracy under the CRT filter: pointer hit-testing now inverts the ancestor CSS warp (skew / roll / scale) so a click lands on the object you actually see, instead of drifting sideways — the "click on the left, select something on the right" bug. Verified against real browser transforms (was off by up to 300px, now exact). Behind a one-flag swap-back to the old mapping.

## v2.1.145-beta - 18th Jul 2026

* Root star click: clicking the central star now frames a close-up first (a big, easy target) and steps out to the whole system on the next click, instead of framing the whole system first and leaving the star a hard-to-hit speck. Opening a system and Reset View still show the whole-system overview.

## v2.1.144-beta - 18th Jul 2026

* Un-masked the Player Views rail entry for continued V2.2 work (it was hidden only for the v2.1.2 production cut). Field Guide + Player Views sit side by side again on beta. (The Holo Table skin in the Field Guide launcher stays masked for now.)

## v2.1.143-beta - 17th Jul 2026

* Docs: reworded a GettingStarted reference to the masked Player Views as "player-facing views".

## v2.1.142-beta - 17th Jul 2026

* Starmap links: left-click no longer opens the edit modal — right-click (or long-press) opens a context menu with Edit Link. Settings: Traveller mode greys out the distance-unit picker and infers parsecs (1 hex = 1 pc).

## v2.1.141-beta - 17th Jul 2026

* Production masking: Holo Table hidden from the Field Guide skin picker (persisted holo selections fall back to The Guide) and the Player Views rail entry commented out — Field Guide is the production players' launcher again. The V2.2 3D line stays beta-only.

## v2.1.140-beta - 17th Jul 2026

* Orrery zoom cap raised 2000x (5e8 -> 1e12) so the new asteroid-scale bodies (~0.3 km up) can be framed full-screen instead of stalling as a few pixels.

## v2.1.139-beta - 17th Jul 2026

* Metal swatch is now steel-grey so it reads apart from rock's brown; dropped the "drives density -> size" hint; asteroid type thumbnails generated (C/S/M-type + comet images now show in the type picker).

## v2.1.138-beta - 17th Jul 2026

* Cutaway rebuilt on concentric circles clipped to quarters (and to the body's own irregular silhouette for small bodies) so every corner and arc aligns with the rendered disc; thermal ramp reworked so blues are always the cold end (no green); caption and scale text removed (tooltips keep the detail).

## v2.1.137-beta - 17th Jul 2026

* Icy worlds now LOOK icy: ices float, so a body with a real ice fraction wears it as its visible crust (bulk rock+ice no longer averages to brown), and a frozen hydrosphere paints a bright ice sheet instead of nothing. Enceladus/Europa render near-white.

## v2.1.136-beta - 17th Jul 2026

* Fixed the giant/makeup seam: a body at giant mass and low density can't be gas-free (no rock/ice world that massive would be so light — self-gravity crushes it far denser), so the physics now re-infers a volatile envelope for it. Building a "gas giant" with 0% gas no longer leaves it a rocky-cored impostor — its makeup, render, porosity and classification all agree that it's a giant. Bodies that were already consistent (real gassy giants, ordinary rocky worlds) are untouched.

## v2.1.135-beta - 17th Jul 2026

* Composition editor: a segmented composition-breakdown bar under the density slider shows the interior mix (metal / rock / carbon / ice / gas) by mass fraction at a glance, each segment coloured and labelled, so you don't have to read the five sliders.

## v2.1.134-beta - 17th Jul 2026

* Simpler interior cutaway: the right half shows the planet's rendered surface, the left half is the cross-section — composition layers in the upper quarter, the internal-heat gradient in the lower — split at the cut plane, with the molten-core glow and temperature key.

## v2.1.133-beta - 17th Jul 2026

* Starmap: right-click (long-press) a star and choose "Rename System…" to name the system independently of its central star — the star name is only the default, so a system can read "Sol Hub Alpha" while its star stays "Sol". The unnecessary "Zoom to System" item is removed from that menu.
* The interior cutaway is a single quarter-cut again (composition layers on the left face, internal-heat gradient on the right, meeting at a bright core edge) with spherical shading, the molten-core glow and the temperature key — rather than two stacked discs.

## v2.1.132-beta - 17th Jul 2026

* The interior cutaway is now two quarters: composition layers on one side, an internal-heat gradient (hot core → cool surface) on the other, with a key below. Because absolute core temperatures are genuinely uncertain — a gas giant's is model-dependent to a factor of two — the key anchors only the (computed) surface temperature as a number and shows the core as a qualitative band (Cool / Warm / Hot / Molten / Very hot), rather than inventing a precise figure.

## v2.1.131-beta - 17th Jul 2026

* The interior cutaway now looks 3D (spherical shading over the layers) and glows with a molten core when the world still has one — driven by the geothermal vigor the physics derives from age, size and composition (Earth-warm to young/large super-Earths run hot; small old worlds like the Moon have cooled to a dead solid core). The glow's colour ramps with heat (deep red to yellow-white) and only lights a metal core; icy cryovolcanic worlds keep their blue subsurface ocean instead. Caption notes "molten core".

## v2.1.130-beta - 17th Jul 2026

* Composition editor: the interior cutaway sits beside the makeup sliders again (wrapping below on a narrow panel), and the "density is gravity-compressed…" explainer is now a hover tooltip on it rather than a caption, keeping the panel compact.

## v2.1.129-beta - 17th Jul 2026

* Shrinking a planet below its own moon's mass correctly makes it a moon of its moon — and growing it large again now flips it back to the primary, in its original orbit. Previously the swap only worked through the narrow comparable-mass barycentre band, so a mass edit that jumped straight past it (e.g. typing a big value back in) left the planet stuck as a satellite. A body that becomes much heavier than its host now takes over directly, in both directions.

## v2.1.128-beta - 17th Jul 2026

* Composition editor: new "Reset to type" picker regenerates a body as a plausible example of any classification viable in its orbit and under the host-mass limit (reusing the add-body generator) — pick "Gas Giant" on a rocky world and it becomes a real one, keeping its identity, name and orbit. The mass and radius sliders each get an expand/collapse toggle next to their lock (◄► to open to the full range, ►◄ to snap back to the type's band). The overview under a zoomed slider is now a funnel that tapers from the full-width slider down to the slice of the whole range it covers, with a tick marking the current value; it slides and reshapes as you change type. The tab's palette is calmer — the size and composition sliders use a muted slate instead of brand orange, which is now reserved for the selected type.

## v2.1.127-beta - 17th Jul 2026

* Composition editor polish: the interior cutaway gets its own roomy centred block (bigger, no longer squashed beside the makeup sliders), the density slider is always full-range (its span is small enough that zooming bought nothing), a "Full range" switch expands every slider to its full span at once, and each zoomed mass/radius slider now shows a full-scale strip beneath it with the current window highlighted — so you always see where the zoom sits in the whole range.

## v2.1.126-beta - 17th Jul 2026

* Oceans of any liquid now render in their own colour — Titan's methane sea reads blue-grey, Io's sulfur amber-gold, Venus's sulfuric acid pale yellow, Triton's nitrogen near-white, Europa's brine steel-blue — tinted by the star's light, with a new "Oceans of different liquids" row on /discgallery to show them off. Also closes a phase leak: a boiled-off or frozen world is no longer painted with a false blue ocean (the renderer now checks the solvent is actually liquid, matching the classifier).

## v2.1.125-beta - 17th Jul 2026

* Liquids overhaul stages 3 & 4 (editor + honest displays): the Liquid tab now shows the recorded solvent's live phase at the current temperature and pressure (a coloured chip), flags each option in the picker that isn't liquid here ("— vapour at the mean"), and when the selection can't be a liquid it explains why ("boils at 271 K here — higher pressure would raise that"). The read-out panel labels stale hydrosphere data by its actual phase — "71% water (frozen / boiled off / supercritical)" — instead of implying a sea that isn't there.

## v2.1.124-beta - 17th Jul 2026

* Liquids overhaul stage 2 (derivation, tags, classification): surface oceans are now derived pressure-aware (no sea on a too-hot or airless world; a deep-pressure ocean survives past 100°C), and worlds gain honest volatile tags — standing liquid, frozen surface, boiled-off, briny sea, steam world, supercritical envelope, sublimating (the comet-coma driver) and cryovolcanism — each explained in the Newton panel. Ocean-family classification (ocean, hycean, earth-like, swamp, forest…) now keys on *liquid* coverage, so a hot world carrying stale water data no longer classifies as an ocean world; dryness and frozen-ice classes still read raw coverage. Verified across the solar system (Earth ocean, Europa/Enceladus subsurface oceans, Enceladus/Mimas cryovolcanism, outer moons sublimating).

## v2.1.123-beta - 17th Jul 2026

* Liquids overhaul stage 1 (pressure-phase physics): every solvent now carries triple point / critical point data, and phase is pressure-aware — ices below their triple pressure sublimate (no ocean on an airless warm world), boiling rises with pressure (a 100-bar world stays liquid far past 100°C), and past the critical point a substance is supercritical (neither sea nor sky). Adds molten sulfur and brine, real definitions for every cloud/interior fluid (fixing a bug where undefined fluids were assumed liquid at any temperature), and honest CO₂ (no liquid at 1 bar). No behaviour change yet where pressure isn't supplied — derivation and displays follow in stage 2.

## v2.1.122-beta - 17th Jul 2026

* The composition diagram is now a proper CUTAWAY: the body's rendered surface (oceans, ice caps, craters, irregular asteroids) with a wedge cut out revealing the interior layers — including subsurface oceans. Liquids-overhaul design doc added (docs/dev/liquids-phase-tags.md).

## v2.1.121-beta - 17th Jul 2026

* Asteroid class images (NASA: 253 Mathilde, 433 Eros, 16 Psyche, Hartley 2) wired for C/S/M-type and comet, with attributions in About.
* The interior cross-section now shows derived fluid layers: a subsurface ocean renders as a liquid band under the ice shell (Titan-style), and a surface ocean as a film over the solid layers.

## v2.1.120-beta - 17th Jul 2026

* Composition redesign stage 4 (renderer): small bodies (under ~300 km, or anything classed asteroid/comet) draw as seeded irregular shapes — repeatable per body, lumpier when smaller or more porous, cratered, coloured by composition. A live interior cross-section (metal core through gas envelope, with void speckles when porous) sits beside the makeup sliders. New "Small bodies" section on /discgallery.

## v2.1.119-beta - 17th Jul 2026

* Composition redesign stage 2c (class-ranged sliders): the mass/radius/density sliders now span the pinned type's range (log-padded, with window end-labels) instead of 17 orders of magnitude — real resolution inside a class, and hitting an end nudges you to pick the neighbouring type (never an automatic flip). Typed values are always accepted verbatim; a value outside the current type deselects to the best-fitting type, or to the new Unknown class (the one remaining full-range case). Ranges are editor-only metadata on ~45 physical classes; specialist derived types (swamp, eyeballs, halogen worlds…) no longer clutter the picker. Porosity now has a live readout on the density row.

## v2.1.118-beta - 16th Jul 2026

* Composition redesign stage 2b (the classifier, rolled in): the preset row is now a Planet type list — every classifier type reachable at the current mass and orbital temperature, ranked by live match score (bright = fits now, dim = needs tuning). Clicking pins the type without moving any slider and draws that type's fingerprint bands on the mass/radius/density sliders; a note explains that pinning does not force the physics. Number boxes now apply on Enter/blur so typed values are never fought mid-entry.

## v2.1.117-beta - 16th Jul 2026

* Composition redesign stage 3 (classifier): asteroid taxonomy — C/S/M-type, comet (from composition + small-body mass) and a rubble-pile modifier keyed on derived macroporosity. Tested against Bennu, Eros, 16 Psyche, 67P; Ceres correctly stays planet-class.

## v2.1.116-beta - 16th Jul 2026

* Composition redesign stage 2 (editor UI): range bars over the radius/density sliders show the composition's allowable envelope — inside it a drag varies porosity/inflation only (type, image and makeup all hold); past the edge a chip announces the recompose and the type updates on slider release, not mid-drag. Editing no longer silently re-arms auto-classification; pinned types stay pinned (with a "physics reads:" advisory when they disagree). Sliders reach asteroid/comet scale; Rubble pile and Comet presets appear for small bodies.

## v2.1.115-beta - 16th Jul 2026

* Composition redesign stage 1 (engine): anchored editing (composition holds; radius/density drags move a porosity/inflation trim inside a physical envelope, flow through outside it), macroporosity model, rubble-pile + comet presets, mass/radius floors down to asteroid scale. Design: docs/dev/composition-editor-redesign.md. No UI change yet.

## v2.1.114-beta - 16th Jul 2026

* Route names now show in the Routes & journeys list (Charted interstellar links).

## v2.1.113-beta - 16th Jul 2026

* **Starmap route editor is back, plus route names.** Clicking (or tapping) a route's distance label — or anywhere on the line itself, including right-click — opens the Edit Route dialog again (change distance, solid/dashed, delete; rescale on scaled maps). It had been unreachable since the V2 touch-gesture layer began capturing the click. Routes can now also be named ("Hyperspace Bypass 342"); the name is drawn in small letters along the line.

## v2.1.112-beta - 16th Jul 2026

* **Construct import no longer wrecks the target's orbit.** Importing a construct file over an existing construct replaces the ship's spec only — the target keeps its orbit, journeys, flight state and log. Previously the file carried the source ship's journey/flight data, which silently outranked the preserved orbit at render time: the ship jumped to coordinates from the source system and later orbit edits appeared to do nothing. Exports no longer carry flight data either, and template loads preserve the same fields.

## v2.1.111-beta - 16th Jul 2026

* **Rail: Field Guide restored beside Player Views, and Projector + Report no longer disappear (beta).** The old Field Guide launcher is back on the rail alongside the new Player Views so both player-view systems can be tested side by side. Projector and Report were previously system-view only (they vanished on the starmap); they now show in both views and act on the last-loaded system when invoked from the starmap. This is beta scaffolding — Field Guide and the Player Views/Projector split get tidied before the production cut.

## v2.1.110-beta - 16th Jul 2026

* **Forming a stellar barycentre now re-homes the rest of the system.** When a companion grows massive enough to promote its host into a binary pair, every other child of that host is re-parented by orbit size: orbits enclosing the pair (outer planets, belts, nested pairs like Pluto-Charon) become circumbinary — they orbit the barycentre, keeping their distance and shape, with the pair's combined mass setting their periods — while orbits inside the pair separation stay on their own star (physically correct circumstellar orbits). Fully reversible: deleting the companion, or shrinking it below the binary threshold, silently puts everything back on the star exactly where it was. Previously the whole system kept "orbiting" the displaced star and every view scrambled.

## v2.1.109-beta - 16th Jul 2026

* **Holo positioning survives a displaced host star.** When a massive body forms a stellar barycentre, the star (and everything still parented to it) moves off the scene origin — belts baked around the origin smeared into a tall torus spinning about the wrong centre, and moons anchored to raw physics positions drifted off their displaced planets. Belts now ride their host's rendered position (and their Keplerian rock motion spins about the host), and satellites anchor to their parent's rendered globe, updated in parent-before-child order. No visual change for ordinary systems. (The deeper question — re-parenting planets to a newly-formed stellar barycentre where physics demands it — is a separate, backlogged piece of work.)

## v2.1.108-beta - 16th Jul 2026

* **The holo reframes gently around the open info panel (desktop/tablet).** With the panel open the framed body used to sit half-hidden under it; the scene now eases a projection offset so the shot centres in the visible strip, and slides back when the panel closes. Picking, labels and the visual filter all track the shift exactly (it lives in the camera projection). Phones skip the reframe — their collapsed panel is just a name bar.
* **Phone info panel: proper minimise.** The collapsed bar's tap target is now the whole title row, and the × minimises back to the name bar instead of deleting the panel — tap the name to reopen the data. (Previously a closed panel could not be reopened until another body was selected.)

## v2.1.107-beta - 16th Jul 2026

* **Follow the GM now inherits the GM's clock.** Following player views run on the GM's absolute time and rate (orbital positions match the GM's map exactly; heartbeats snap any drift), and their own time controls disappear — time is part of GM-view tracking, like viewport and focus. The "Control player time" quick override is gone: it's simply inherited when you run GM-driven views.
* **"Players can click / focus / scrub" off now truly locks the surface.** No picking, no camera, no scrolling, no body picker, no clock — a kiosk display the GM drives.
* **GM zoom over a focused body mirrors immediately.** Wheel-zooming without panning first used to be ignored by followers (only a pan flipped the camera to manual); the zoom override now counts as manual for the viewport broadcast.
* **Selecting a planetary ring frames its planet on player views.** A ring pick (GM menu or follow) now zooms the follower to the parent planet with the ring in shot, matching the GM's behaviour.
* **Charon no longer vanishes inside Pluto in readable views.** Barycentre members now clear their PARTNER's rendered globe (the barycentre itself is an empty point, so the parent-surface rule never applied) — both members push outward along their opposite offsets, so binary pairs always read as two bodies.
* **Saving a Player View edit refreshes open player windows live.** The window re-applies the preset on content change, not only when switching to a different preset.

## v2.1.106-beta - 16th Jul 2026

* **Flood fix round two: a RUNNING clock defeated the fingerprint gate.** The GM clock is embedded in the snapshots (`displayTimeSec`), so with time playing every tick made the payload "different" and the full starmap went out ~5×/second again — exactly the slow window reported after v2.1.105. The change check now ignores the embedded clock fields (players take their time from the dedicated time message), and as a backstop any genuinely changing payload type is rate-limited to one send per half-second with a trailing send so the final state always lands.
* **The SSE2 logo ships as a starter graphic.** Available alongside Weyland-Yutani in the preset editor's graphics library and every image placement dropdown.

## v2.1.105-beta - 16th Jul 2026

* **The random slowdowns are found and fixed: the GM was multicasting megabytes of unchanged state every second.** The reactive broadcasts (whole starmap ~400KB, system snapshot ~200KB, view settings) re-sent on every internal store tick — about five times a second while completely idle, with 32 of every 33 payloads byte-identical. Every open player window received (and rebuilt its scene from) all of it, degrading until the window froze outright. Reactive broadcast sites now go through a fingerprint gate that only sends a payload when it actually changed; join bursts still send unconditionally so new windows get current state.
* **Follow the GM's ladder steps and Reset View now reach late-joining players.** The live overrides (Follow GM et al.) were only broadcast at toggle-time, so a player window opened or reloaded afterwards silently ignored the GM. The join burst now re-states the running view and its overrides. Together with the flood fix above, multi-click zoom in/out and Reset View verifiably mirror on player windows.

## v2.1.104-beta - 12th Jul 2026

* **Follow the GM now mirrors the click-ladder and Reset View.** Re-clicking a body on the GM's map steps the framing deeper (or wraps back out) — those steps now ride to following player views, which take the exact same framing level. The GM's Reset View passes through too. Previously only the first click on a body was mirrored, because deeper clicks don't change which body is focused and nothing else was broadcast.
* **Groundwork for the random-slowdown hunt.** A lightweight tracker now watches the frame rate and counts scene rebuilds and campaign syncs; when a slow spell hits (a 5-second window under 45fps) it logs one compact console line with those counters and the JS heap size. Next time a window opens up janky, open the console and the `[sse-perf]` lines will say what was busy (also inspectable any time via `window.__ssePerf`).

## v2.1.103-beta - 12th Jul 2026

* **The grey band rings now carry the planet's shadow.** The flat orrery-style rings take the same Cassini-shadow treatment as the particle rings: the arc behind the planet darkens (hard umbra, soft penumbra), and the shadow sweeps around the band as the planet orbits its star.

## v2.1.102-beta - 12th Jul 2026

* **Clicking past the close-up now cycles back out.** At an object's closest framing, a further click wraps back out to its widest — so re-clicking a star from its close-up shows the whole system again (a built-in Reset view), and a planet cycles parent → moons → close-up → parent. Works in the GM orrery and the player views alike.
* **Tiny moons are now practically clickable.** Selecting a planet already unlocked its moons, but at whole-system zoom they're only a few pixels wide and nearly impossible to hit. The near-miss snap that construct icons use now applies to every clickable body: a tap within ~14 px picks the nearest small target.

## v2.1.101-beta - 12th Jul 2026

* **"Frame whole system" on the 2D map is now a truly fixed plan view.** With it ticked, the map holds the whole-system overhead shot and nothing moves it: clicks select a body (its file still opens) but never re-frame, and panning and zooming are disabled. Previously a click could still ease the camera about. A whole-framed 3D holo keeps its orbit and zoom — it's a hologram, not a map.

## v2.1.100-beta - 12th Jul 2026

* **Follow the GM now mirrors manual panning too (experimental).** When a player view follows the GM, the GM's hand-panned viewport is broadcast and mirrored as a rough viewport — the 2D map matches it flat, and the 3D holo takes the same shot raised to its configured angle. Body clicks still frame with the player's own click ladder as before; only manual pans ride this new path. The centre calibration is first-cut and may land off target on toytown-compressed views — feedback welcome.

## v2.1.99-beta - 12th Jul 2026

* **"Grey bands" now covers planetary rings too.** Choosing the orrery-style bands for belts and rings previously only changed the asteroid belts — Saturn's rings stayed as particles. Rings now draw as the same translucent shaded annulus the GM orrery uses, tilted with the planet's equator, with the shared density rule driving how solid they look.

## v2.1.98-beta - 12th Jul 2026

* **You can take the view back from the follow.** Framing was too aggressive: once a body was followed, dragging the map got yanked straight back. Like the GM orrery, a pan drag now hands the view to you — it stays where you put it — and clicking a body re-engages the follow (a re-click still steps the framing deeper).
* **Selections no longer rotate the locked map.** Clicking body to body kept turning the grid; the locked view's heading is now frozen outright, so every framing move is pure pan and zoom. Verified click-to-click: the grid and the sun's bearing hold to within a pixel.

## v2.1.97-beta - 12th Jul 2026

* **Clicking bodies in the editor preview now works.** The preview never fed a tap's selection back into the view (the live player view does), so clicks there did nothing — no framing, no click-ladder. The preview now selects and frames exactly like the player view: first click frames the body with its parent, again with its moons, again close up.

## v2.1.96-beta - 12th Jul 2026

* **Belts & rings can be drawn as grey bands, like the GM orrery.** A new "Belts & rings" option on the system view switches between the tumbling rock field (default) and a flat translucent band whose solidity tracks the belt's density — the same look, and the same density rule, as the GM's own map. Handy for a preset meant to mirror what the GM sees.
* **Fixed the starmap preview showing the wrong renderer for a 2D map** — the same drift the system preview had. Both map previews now match the live player view exactly.

## v2.1.95-beta - 12th Jul 2026

* **Fix: the player view's system map stopped responding after the first click.** A crash in the camera code killed the render loop as soon as the opening move finished, so the view framed the body once and then ignored everything — no stepping down through the framing levels, no time movement.
* **Browser Back now steps back out.** Back walks up the view hierarchy one step at a time — out through the framing levels you clicked in through, then off the body, then out to the starmap — and only leaves the page once there's nothing left to step out of. Handy on a tablet, where Back is a system gesture.

## v2.1.94-beta - 12th Jul 2026

* **The rotation-locked 2D player view now behaves exactly like the GM orrery** — because it now runs the orrery's own camera logic rather than an imitation of it. A focused body is held dead-centre and the map slides with it as it orbits, easing the framing toward the current click level, and backing off the moment you drive the zoom yourself. This replaces the approximation that kept letting the view drift and swing.
* **Unlocked rotation** keeps the free-tracking behaviour, turning to hold the best framing as time runs.

## v2.1.93-beta - 12th Jul 2026

* **Left-drag now pans the 2D maps.** The camera controls' default put rotate on left-drag and pan on right-drag only — so on a flat map the obvious gesture either rotated it or did nothing. On the 2D system map and 2D starmap the primary gesture is now pan (one finger on touch); rotate moves to right-drag, and is off entirely when Lock rotation is on. Zoom is unchanged.
* **Locked follow really pans now.** With Lock rotation on, following a focused body was still turning the map: the fix only covered the first moment of the move, after which the camera aimed at the moving body from a fixed spot — which reads as rotation. The camera now slides with the body, keeping it centred by panning with the heading truly fixed.

## v2.1.92-beta - 12th Jul 2026

* **The editor preview was showing the wrong renderer.** For a 2D map it was drawing the old orrery instead of the view players actually get — so Colour and Body graphics appeared to do nothing there while working fine in the live player view. The preview now uses the same engine and the same settings as the player view, so what you tune is what they see.
* **Unticking "Lock rotation" no longer turns a 2D map into a 3D one.** Lock rotation now only fixes the heading; a 2D map always stays flat. With it off you can spin the flat map; with it on the view keeps a focused body centred by panning (the star may drift off-screen at times, which is expected).

## v2.1.91-beta - 12th Jul 2026

* **The 2D map now pans instead of spinning to follow a body.** Keeping a focused planet centred was swinging the camera around the star as the planet orbited, which turned the whole map. A locked 2D map now holds its heading and simply slides to keep the focus centred.
* **2D maps can be panned again.** Dragging to move a flat map was disabled; zoom and pan both work now, and only rotation is locked (unless you're in 3D).
* **Colour now works on the flat body styles.** Choosing True colour / Flat colour / Monochrome had no effect when bodies were drawn as photos or discs — the colour choice was being ignored. It now applies to those styles too, so Monochrome tints properly and Flat colour paints the class swatch.
* **Fixed a console warning** when using the lo-poly render styles.

## v2.1.90-beta - 12th Jul 2026

* **2D maps really do stay still now.** The culprit was "View orbit" — the slow turntable spins the camera on its own, so locking the drag-rotation didn't stop it. View orbit is a 3D-only idea and is now switched off for 2D maps entirely (including on presets where it was already set), and in its place the 2D map and 2D starmap get a **Lock rotation** option, on by default.
* **A tidy-up of which controls appear where.** The 2D and 3D views no longer offer each other's settings: the tilt, lock-overhead, lighting and turntable controls are 3D-only, Lock rotation is 2D-only, and Auroras only appear when bodies are drawn as 3D spheres (the flat disc styles don't draw them).

## v2.1.89-beta - 12th Jul 2026

* **The 2D system map no longer tilts or spins.** Dragging could still rotate it out of its flat top-down view; it's now pinned like a proper 2D map — zoom and the click-to-frame behaviour still work. This also applies to any 3D preset with "Lock overhead" ticked (such as Projection); the normal 3D holo still tilts freely.

## v2.1.88-beta - 12th Jul 2026

* **Player views now click and frame exactly like the GM's orrery.** Tapping a body steps the same familiar ladder: first click frames it with its parent, a second frames it with its moons (skipped if it hasn't any), and a third fills the view with the body itself. The 2D map and the 3D holo use identical framing — only the viewing angle differs (flat overhead vs the preset's tilt).
* **You can only click what's named.** Selection now follows the same rule as labelling, so you always click a planet before its moons (they can't get in the way), and from a moon you can still reach its parent, its peers and other planets — but not another planet's moons. This holds even when labels are hidden.
* **The 2D starmap is a proper flat map.** It no longer tilts or rotates — zoom and pan still work — so it reads like the classic fixed 2D starmap.
* **Under the hood:** the framing ladder is now one shared ruleset used by the GM orrery, the player views, labelling and selection, instead of separate copies drifting apart in each view.

## v2.1.87-beta - 12th Jul 2026

* **Fix: orbit lines cut through planets in the 2D views.** A body sitting on its own orbit is exactly the same distance from the camera as its orbit line, and the line was winning that tie — so the orbit drew a thin line straight across the planet's face (and its moons). Orbit and grid lines no longer punch through bodies, and the flat body discs now draw over them.

## v2.1.86-beta - 12th Jul 2026

* **Player-view hexes now line up with the GM's.** The hex grid was drawn with a different (pointy-top) geometry, so it sat offset from the GM's map; it now uses the GM's exact flat-topped hex layout, so snapped systems sit dead-centre in their hex just like on the GM side.
* **Guide headers/footers no longer stretch across the screen.** The "Traveller Advisory" / "The Guide Says" banners are now a tidy, centred, bounded box that reflows and scales to the screen (they were rendering oversized and edge-to-edge on wide displays, caused by the overlay being built at a stale size and upscaled).

## v2.1.85-beta - 12th Jul 2026

* **The built-in presets now recreate the old skins.** Each built-in was tuned to match the artifact it replaces: The Guide gets illustrated procedural discs + rainbow chrome, Datapad shows body photos, Console uses flat schematic shapes, and CRT Terminal is the monochrome body list under the green-phosphor filter. The old skins are still available for side-by-side comparison.
* **Export / import presets.** The Player Views panel has Export (saves all presets to a JSON file and copies them to the clipboard) and Import buttons, so a fine-tuned set of presets can be saved out of the tool, shared, or brought into another campaign.

## v2.1.84-beta - 12th Jul 2026

* **The player-view starmap now matches the GM's grid.** The GM's live snap-grid (square / hex / Traveller) and its cell size are broadcast to the player, and the 2D/3D player starmap draws the identical grid calibrated to the same cells — so snapped systems sit on the grid exactly like the GM sees them (and it shows in the editor preview). When the GM has no grid, the decorative polar/hex grid is used as before.

## v2.1.83-beta - 12th Jul 2026

* **Fix: rainbow preset name showed as a solid colour bar.** A rainbow-accent preset's name on the Player Views card was rendering as a full gradient block instead of gradient-coloured text; it now clips to the name correctly.

## v2.1.82-beta - 12th Jul 2026

* **Player Views cards read cleaner.** The little colour dot on each preset card is gone; the preset name is now shown in its accent colour instead (rainbow presets get the rainbow name), so the card is tidier and the colour still tells them apart.

## v2.1.81-beta - 12th Jul 2026

* **Follow the GM.** A "Follows the GM" preset (or the live override) now makes the player view track the GM: the first body the GM focuses gets the players past the cover, then every body the GM clicks is framed on the players' view the standard way — switching to the right system if needed. Works for the 2D map and 3D holo (same framing) and highlights the body in the list views.
* **GM live time control.** The Player Views panel gains a "Control player time" quick override — a play/pause and rate slider the GM can drive live, so everyone's clock matches the table.
* **Default time per preset.** The editor's General step now sets a preset's starting time — a rate (default 1 s ≈ 1 h) and whether it starts playing or paused.

## v2.1.80-beta - 12th Jul 2026

* **Option to hide the body info panel.** A preset can now suppress the body info panel entirely on the system page for a clean display — tapping a body still frames it, it just doesn't open a panel.

## v2.1.79-beta - 12th Jul 2026

* **Image overlays now go through the real filter everywhere.** Previously the starmap and list overlays used the CSS approximation, so they didn't warp/roll with the CRT like the system-map overlay did. The starmap (2D/3D) overlay is now composited into the map's real shader pass, and the starmap-list and system-list overlays into their canvases — so every overlay, and the cover graphic, now bends and tints with the filter consistently.

## v2.1.78-beta - 12th Jul 2026

* **Black holes render as black holes.** A black hole now shows a pure-black event horizon instead of a star surface. A quiescent hole has only a faint photon-ring glow and barely lights its surroundings; a feeding one (active / with accretion) gets a bright, hot blue-white accretion glow that flickers over time and lights the system like a real star (its accretion disc still renders as its own ring).

## v2.1.77-beta - 12th Jul 2026

* **Moons and orbiting constructs no longer sink into the planet in readable views.** The true-scale fix had let satellites fall inside a magnified globe; there's now a clearance rule that scales with the rendered globe size, so a satellite always sits just outside the parent's surface (staggered by orbital order) in readable views, while true-scale positions are preserved. Moon orbit rings follow the same rule so a moon still sits on its ring.

## v2.1.76-beta - 12th Jul 2026

* **System text-list now runs through the real filter too.** The "list" system view is drawn to a canvas and passed through the actual GPU shader (like the starmap list), retiring the CSS approximation for it. It stays interactive — a coloured body list you can scroll, and tapping a body opens its file in the shared inspector. (The inspector panel keeps its own approximated filter for now.)

## v2.1.75-beta - 12th Jul 2026

* **Monochrome starmap option.** A new "Monochrome (for tints)" toggle renders the 2D/3D starmap — stars, routes, grid and labels — in white/grey, so a colour filter tints the whole map cleanly.

## v2.1.74-beta - 12th Jul 2026

* **Starmap grid + route options.** The 2D/3D starmap grid now offers a **Hex** lattice (aligned to the map) alongside Polar and Polar+scale, and a **Glowing routes** toggle switches the emissive transit lines on or off (off = plain lines). Both starmap look controls are available for the 2D map too, since it's the same engine.

## v2.1.73-beta - 12th Jul 2026

* **Lo-poly now includes the star.** Under the lo-poly render styles the central star is faceted too (and gets glowing vector edges/points in "filled + lines"), instead of being left as a smooth sphere.
* **2D map gets the 3D look controls.** Since the 2D map is the 3D engine locked overhead, its editor now exposes the same controls that were previously 3D-only where they make sense — render style, grid, spread/scale, body size, belt detail, view orbit, label size, starfield and auroras. (The genuinely 3D-only knobs — tilt, lock-overhead, lighting, frame-whole — stay hidden for 2D.)

## v2.1.72-beta - 12th Jul 2026

* **Body graphics options for the 2D (and 3D) view.** A new "Body graphics" choice lets a preset draw worlds as a 3D sphere (as before) or as a flat camera-facing disc in one of three styles: Photo (the body's stock image), Simple disc (the procedural true-colour disc), or Flat shape (a plain class-colour disc). Belts and rings still show around a flat world. Photos are loaded safely — if one can't be used (cross-origin), it falls back to the procedural disc rather than breaking the view.

## v2.1.71-beta - 12th Jul 2026

* **Aurora toggle.** The System look options gain an "Auroras" checkbox (on by default), so a preset can switch the emissive polar aurora glow on or off across both the 2D and 3D views.

## v2.1.70-beta - 12th Jul 2026

* **Starmap routes now glow.** Links between systems render as an emissive filament (a soft additive halo along the ground plus a bright core line) instead of a flat dim line, in both the 2D (overhead) and 3D starmap views — they read as lit hyperlanes and pick up the CRT/filter bloom.

## v2.1.69-beta - 12th Jul 2026

* **The starmap text-list now runs through the real filter, not a CSS fake.** The "list" starmap module is drawn to a canvas and passed through the same GPU shader as everything else, so the CRT/night-vision/thermal look is genuine and matched to the other stages — and it stays interactive: tap a system to enter it (the tap is warp-corrected so it hits the right row even under barrel distortion or picture-roll), drag or scroll-wheel to scroll, and guide tips ride along inside the filter. (The system "list" view is a richer interactive browser rather than a simple list, so it keeps its own treatment for now.)

## v2.1.68-beta - 11th Jul 2026

* **Surface constructs now ride the planet's surface.** A construct sitting at (or below) its parent's physical radius — a surface installation like the Ascension Heavy Lifter, as opposed to a genuine low orbiter like the ISS — is now glued to a fixed point on the rendered surface and turns with the planet's own spin, so it slides over the surface at the right rate instead of drifting on its own orbit. It also sits exactly on the rendered surface at every zoom, including true scale, fixing the mis-placement when magnified right in.

## v2.1.67-beta - 11th Jul 2026

* **Guide tips are now a preset option on every stage.** A new "Guide tips" control (Theme section) shows the funny in-universe advisories on the top edge, bottom edge, both, or off — and they now render INSIDE the filter (drawn into the holo/cover GLSL layer, so the CRT/night-vision/thermal shader warps and tints them like everything else) rather than as a plain caption on the legacy Guide skin only. A fresh line each time the view changes (moving between systems, focusing a body, or crossing to the cover). Live on the cover, the 3D system view and the 3D starmap; the text-list stages pick it up when they move to the graphics pipeline.

## v2.1.66-beta - 11th Jul 2026

* **Two new low-poly render styles.** "Lo-poly — filled" draws chunky faceted planets (respecting the colour choice — true-colour continents, flat class colour or monochrome); "Lo-poly — filled + lines" adds glowing vector edges and vertex points on top. Sit alongside the wireframe styles in the system look options.

## v2.1.65-beta - 11th Jul 2026

* **Zoom works at true scale.** Focusing a body now frames it by its actual rendered size and relaxes the minimum zoom to match, so a tiny true-scale world can be brought up large on screen just like an expanded one — no need to know the size first.
* **"White" colour is now "Monochrome (for tinting filters)"** in the editor, making its purpose clear (draw the bodies neutral so a filter colours them).

## v2.1.64-beta - 11th Jul 2026

* **Surface and low-orbit constructs now sit where they should.** Ships/stations orbiting a planet are placed just outside the planet's rendered size and ramp outward by true distance — so a surface or low-orbit construct hugs a true-scale planet instead of being flung out near the moons. (Same fix applies to moons.)

## v2.1.63-beta - 11th Jul 2026

* **The cover screen is now filtered for real too.** It's drawn to a canvas and run through the actual GPU shader on its own surface, so it warps, rolls and tints exactly like the rest of the screen — the cover graphic included. The only player-view surfaces still using the lighter CSS approximation are the plain text-list readouts.

## v2.1.62-beta - 11th Jul 2026

* **The 2D map is now a real top-down 3D view, filtered for real.** Both the 2D system map and the 2D starmap are now drawn by the holo renderer locked overhead (flat/unlit), instead of a separate flat diagram under a CSS approximation. So they go through the actual GPU filter (warp, roll, tint) and share the 3D picking — one renderer, not two.
* **Tapping works under warp/roll.** Picking now runs the cursor through the same distortion the shader applies, so a tap lands on the body you see even when the picture is barrel-warped or rolling.

## v2.1.61-beta - 11th Jul 2026

* **Moon orbits stay local to their planet.** A moon system is now sized as a fraction of its planet's own orbit radius, so it never grows into a neighbouring planet's orbit (Luna's ring no longer reaches toward Venus). Moons are still ranked by true distance.
* **You can zoom right in on a body**, even at true scale — the minimum zoom distance was relaxed so a small world can be brought up large on screen.
* **The per-screen overlay bitmap now goes through the real filter too** (3D view): it's composited into the holo render like the info card, so it warps/rolls/tints with the GPU shader.
* **White colour scheme keeps the info panel monochrome** (white/greys), so a visual filter colours it — rather than using the accent.

## v2.1.60-beta - 11th Jul 2026

* **The body info block is now part of the actual filtered picture (3D view).** Instead of a CSS approximation, the info panel is drawn once to a canvas and composited into the holo render itself, so it warps, picture-rolls and tints through the *real* GPU shader exactly like the rest of the screen — no fake. It's a static, once-per-selection draw, so it's cheap. (The panel sits inside a small bezel margin so the CRT edge-warp doesn't wrap it.)
* **Info-panel font-size slider** added to the 3D system settings, so you can scale the readout text.

## v2.1.59-beta - 11th Jul 2026

* **The body info block now clearly takes the visual filter.** Its tint was too weak to reach the text, so only the image looked filtered — the tint now recolours the whole panel, so a selected body's data reads as part of the CRT / night-vision / thermal screen.
* **The preset's font is used across the player view.** The chosen theme font now also applies to the body info block, the status bar and the system-view chrome — not just the cover, starmap and in-scene labels — so the whole view reads in one typeface.

## v2.1.58-beta - 11th Jul 2026

* **Wireframe belts are simplified to plain points.** In the vector-wireframe render styles, asteroid belts and debris now draw as small points instead of the lumpy rock silhouettes, keeping the clean vector look.
* **Wireframe auroras.** In true-colour wireframe modes, an auroral world no longer lights up its whole body — instead it shows a couple of flickering emissive arcs at its magnetic poles in the correct aurora colour (Earth green, a gas giant red-pink), like an aurora drawn on an old vector display.

## v2.1.57-beta - 11th Jul 2026

* **Wireframe worlds show rough continents.** In true-colour wireframe modes, a world with a coastline now fills its land facets with flat low-poly polygons in the land colour — chunky and indicative rather than accurate, like the continents on an 80s vector display — over the wireframe "ocean". Airless/all-ocean worlds and gas giants stay plain.

## v2.1.56-beta - 11th Jul 2026

* **Auroras in the 3D holo.** Worlds with an atmosphere, a magnetic field and enough stellar flux now glow with a flickering aurora at their (tilted) magnetic poles — coloured by the atmosphere (Earth green, a gas giant red-pink, etc.) and scaled by strength, just like the 2D disc.
* **The Sun renders correctly in wireframe modes.** In the vector-wireframe render styles the star is now drawn as a wireframe too — flat draws plain polygons, glow adds the emissive glowing vertices — instead of staying a solid photosphere.
* **No more "DON'T PANIC" flash when opening a player view.** The default Guide cover briefly appeared for a frame before the chosen preset took over; the preset is now recognised on the first paint, so it never shows.

## v2.1.55-beta - 11th Jul 2026

* **Info panel width is now set in the editor.** The body info panel's desktop width is a preset setting (System step), so you size it once per preset; mobile keeps its own layout.
* **New "Flat / no lighting" option for an efficient 2D-map look.** Ticking it (with "Lock overhead") renders the system through the 3D engine as flat, unlit discs — the clean top-down map look, but it gets the *real* GPU visual filter (CRT / night-vision / thermal), not the lighter CSS approximation. Reuses the existing renderer, so text/labels render in-scene too.
* **Fixed the starmap text-list formatting** — each system is now a single tidy row (stars · name · summary) instead of the summary wrapping onto a second line.

## v2.1.54-beta - 11th Jul 2026

* **Body "Type" now shows the classification, not the kind.** The info block's Type line reads the scientific classification (e.g. "G2V", "Ringed · Ammonia clouds gas giant", "Terrestrial") instead of just "star" / "planet".
* **The editor preview now shows true colour, matching the player view.** True-colour needs the derived colour palette that only lives on a processed system; the editor was previewing a raw example (no palette), so it fell back to flat swatches. It now previews one of the campaign's actual processed systems, so worlds render textured just as players see them.

## v2.1.53-beta - 11th Jul 2026

* **Holo labels no longer balloon as you zoom.** The in-scene labels were computed without the camera's field-of-view factor, so they rendered far too big (and drifted in size). They now hold a correct, constant on-screen size at any zoom — which also restores easy tapping, since oversized labels had been sitting over the planets and swallowing clicks.
* **Tapping a star now selects it.** Body picking is more robust: it walks up from whatever mesh the ray hits, so stars (drawn as a photosphere + corona group) and wireframe bodies are selectable, not just simple planet spheres.
* **The body info block now takes the visual filter.** In the player view, a selected body's panel (image + data) picks up the same CRT / night-vision / thermal look as the rest of the screen, instead of sitting outside it.

## v2.1.52-beta - 10th Jul 2026

* **The player view now renders what the preset actually says.** Until now, opening a preset mapped it onto a legacy skin, so a custom preset's cover never appeared and the starmap always showed as the 2D diagram regardless of the module you picked. The catalogue now deploys the preset's real layers:
  * the **cover page** you designed shows as the entry screen (tap to enter);
  * the **starmap** renders in the module you chose — text list, 2D map or 3D — and tapping a system opens it;
  * the **system view** renders in your chosen module (text list, 2D or 3D holo);
  * the preset's **theme** (font + accent), **visual filter** and **per-screen overlays** are applied throughout.
* Starmap list / 2D / 3D views gained tap-to-select so players can navigate from any of them.

## v2.1.51-beta - 10th Jul 2026

* **3D starmap labels now go through the visual filter too.** Same fix as the system holo view: system name labels were HTML over the canvas, so they stayed flat and drifted under a CRT barrel-warp. They are now rendered inside the 3D scene, so the filter tints and warps them in lockstep with the system stars, and they keep the theme accent colour.

## v2.1.50-beta - 10th Jul 2026

* **Holo labels now go through the visual filter.** Body labels used to be HTML drawn over the canvas, so under a CRT filter they stayed flat and drifted out of place as the barrel-warp bent the bodies underneath them. They are now rendered inside the 3D scene, so the filter tints, scanlines and warps them in lockstep with the bodies — they stay glued to each body and pick up the phosphor colour.

## v2.1.49-beta - 10th Jul 2026

Player Views fixes:

* **Opening a player view now shows the preset you picked.** A freshly-opened player window was falling back to a default look because it resolved the preset before the campaign map had loaded and never re-checked. It now applies the chosen preset the moment the map arrives.
* Edit preset / General: removed the Company / faction and Footer text fields (not needed); the General preview now shows a clean cover-format sample of the chosen font and accent colour.
* Occluded wireframe render styles look right: the hidden-surface sphere now matches the wireframe's faceting so it no longer bulges past the front edges — clean solid globes with the far side hidden.

## v2.1.48-beta - 10th Jul 2026

Player Views modal:

* The main action (Open / Change / Close player view) now sits on its own full-width row, with Edit / Duplicate / Delete moved to a separate row below it.
* Mobile pass: the modal goes full-screen and stacks the card grid over the detail pane in a single scrolling column; the share block stacks with a centred QR, and buttons and checkboxes get larger tap targets.

## v2.1.47-beta - 10th Jul 2026

Editor feedback fixes:

* **Rainbow shows in the editor preview.** The General-step theme sample now renders the rainbow accent as the actual spectrum gradient, instead of a flat yellow.
* **White colour greys the orbits.** With the body colour set to White, the orbit rings now draw in neutral grey (matching the bodies) rather than keeping their old per-body colours.
* **Wireframe flat vs glow are now distinct.** Flat draws just the edges; Glow adds the brighter vertex points (the vector-screen highlight). Two new render styles — Wireframe glow (solid) and flat (solid) — hide the far side of each globe so it reads as a solid vector object rather than see-through.

## v2.1.46-beta - 10th Jul 2026

* **The GM drives the players' view from one place.** The player window is now a clean display — the on-screen preset picker, look gear and quick toggles are gone. Everything moves to the "Player Views…" screen: the live view is highlighted, and one button reads **Open** (nothing running), **Change** (a different preset selected) or **Close** player view. Closing shows the players a calm "Please stand by" hold screen. The quick overrides (Follow GM, hide labels, suspend filter, pause view-orbit) live here too and push to the players instantly (rate-limited so a rapid toggle never floods the link).
* **Field Guide retired from the rail.** The old Field Guide launcher is gone — Player Views does it all now.

## v2.1.45-beta - 10th Jul 2026

* **A separate overlay per screen.** Instead of one overlay everywhere, each stage now places its own image independently: upload to the shared library on the General step, then drop any of them onto the Cover, Starmap and System stages — a different image, position, size or opacity on each screen if you like (or none). Same nine-point / size / stretch / opacity controls throughout.

## v2.1.44-beta - 10th Jul 2026

* **Image overlays on every screen.** A preset can carry an overlay image (watermark, frame, logo) shown over the cover, starmap and system views alike — with the standard placement options now shared everywhere: a nine-point anchor, size as a percentage of the screen, opacity, and a "stretch to fill" toggle for any aspect ratio. The cover graphic uses the same controls.
* **Rainbow accent.** A new theme option renders the accent as a rainbow — recreating The Guide's original colourful title look (the cover title fills with a spectrum gradient). Everything else falls back to a representative colour where a single hue is needed.

## v2.1.43-beta - 10th Jul 2026

* **Open a preset for players.** The Player Views screen now carries the Field Guide's sharing tools: a QR code and copy-link for the selected preset, and an "Open player view" button. Players scan or open the link and it launches that preset live — a 3D holo table, a projection, a guide — driven by the preset you picked. Built-in and your own custom presets both work; the campaign's presets travel with the shared map. Quick overrides (Follow GM, suspend filter, pause view-orbit) sit alongside.

## v2.1.42-beta - 10th Jul 2026

* **Starmap gets three player-view modules — including a new 3D map.** The starmap stage can now present as a **text list**, a **2D map**, or a **3D map**. The 3D map lays systems out as glowing stars on a rotatable plane, with routes, name labels, and an optional distance grid (plain, or with light-year rings labelled). The System-view look controls have starmap cousins (grid, view angle, label size).
* **Binaries look like binaries.** Multi-star systems now render as multiple stars in every starmap view (2D, 3D, and the list says "2 stars") — fixing the long-standing "shows a binary as a single star" issue, from one shared source of truth.

## v2.1.41-beta - 10th Jul 2026

The preset editor becomes a proper five-step wizard, and every stage gets a live preview:

* **General → Cover → Starmap → System → Visual filter.** Each step shows only its own controls; the filter is deliberately last so you design clean and costume at the end. Back/Next guides you through.
* **Filter sliders now bite.** Filter parameter values weren't reaching the preview at all — fixed, and slider drags now update the shader in place (no flicker). The filter step has Cover / Starmap / System preview buttons: the 3D view uses the exact shader; text and 2D screens use a lighter matched version so their content stays readable.
* **General step**: fonts (curated stacks), accent colour, company/footer, follow-GM and interactivity — plus a graphics library with a starter logo included; upload your own (PNG transparency kept, saved with the campaign).
* **Cover graphics**: place any library image on the cover with a nine-point position, size and opacity.
* **Starmap and System stages can be switched off** per preset — players simply never see navigation to a disabled stage.
* **Player Views on the rail.** New rail entry opens the preset gallery; the right-hand pane now shows the selected preset's summary with Edit / Duplicate / Delete and the quick live-session overrides (Follow GM, suspend filter, pause view-orbit). Field Guide and Projector stay until the new system reaches full parity.

## v2.1.40-beta - 9th Jul 2026

* **Cover pages.** The preset editor can now design a cover / hold screen — title, subtitle, body, a corner stamp (e.g. CONFIDENTIAL), and a company/footer line, themed by the preset's accent colour and font. A System / Cover tab in the preview shows it live, so you can recreate "DON'T PANIC" (or your own logo screen) and see exactly how it lands.

## v2.1.39-beta - 9th Jul 2026

* **Every filter knob in the editor.** Selecting a filter in the preset editor now exposes its full control set — brightness, contrast, invert, phosphor colour + strength, scanlines, barrel warp, vignette, and the collapsible Distortion / Signal-artifact groups — all driving the live preview. (Yes, you can finally crank the brightness and invert it.)

## v2.1.38-beta - 9th Jul 2026

* **Live preset look editor.** Duplicate a preset and hit "Edit look…" to open the editor: the full set of look controls on the left (filter + phosphor, colour, 3D render style, grid, spread, sizes, framing, belts, view-orbit, labels, background, accent) and a **live 3D preview** on the right that reacts as you drag. The controls a view supports are shown for that view (3D controls appear for the holo view). Save writes it to the campaign. This is the heart of the unified player-view system taking shape.

## v2.1.37-beta - 9th Jul 2026

* **Player View preset manager (early).** A first cut of the unified player-view system: a preset gallery reached from the Field Guide launcher ("Manage presets…"). It lists the shipped presets — The Guide, Datapad, Console, CRT, Holo Table, Projection — plus any you make; GM-driven ones are outlined. Duplicate a preset to get an editable copy, rename/retune its top-level settings, or delete it. Presets are saved with the campaign (and any old saved holo looks migrate in automatically). The full look editor with a live preview comes next; the existing Field Guide is untouched for now.

## v2.1.36-beta - 9th Jul 2026

* **Wireframe / vector "80s" mode.** New Render control: Filled (as before) or Wireframe — a low-poly vector globe drawn as glowing (or flat) edges with brighter vertex points, for that old-vector-display feel. Works in any colour.
* **Colour is its own choice.** The body colour dropdown is now True colour / Flat colour / **White** — and it applies to both filled and wireframe bodies. "White" replaces the old fixed blue holo-tint, so a screen filter can colour the whole scene however you like.

## v2.1.35-beta - 9th Jul 2026

* **Moon orbits appear with their moons.** In the Holo Table an orbit path now shows under exactly the same rule as the body's name — so selecting a planet reveals its moons *and* their orbit rings, on one clean rule. Moon rings are drawn in the planet's own frame with the same spread the moons use, so they sit right under them.
* **Pause the view-orbit on the fly.** When auto view-orbit is on, a quick control on the holo bar suspends it momentarily (not saved) — handy if the slow spin gets distracting.
* **Slimmer data panel by default.** The player-view body panel now opens about two-thirds of its old width, leaving the map more room; drag its edge to taste (remembered).

## v2.1.34-beta - 9th Jul 2026

* **Labels follow the CRT colour.** In-scene body labels are drawn over the 3D canvas, so the screen filter couldn't reach them and they stayed pale. They now match the CRT phosphor colour, so a green/amber terminal reads as one piece.
* **Label size + font.** Label size is a slider in the look controls, and the label font follows the preset theme (wired for the unified player view).
* **Quick GM toggles.** Two momentary controls sit on the holo bar (not saved to the preset): hide/show labels, and suspend the visual filter for a moment if it's hard to read.

## v2.1.33-beta - 9th Jul 2026

* **One CRT filter, any phosphor colour.** The separate green and amber CRT filters are replaced by a single "CRT Terminal" filter with a Phosphor Colour picker — green, amber, red, blue, whatever you like — driven live. Fewer filters, more flexibility, and it lays the groundwork for the unified player-view presets. Existing Green/Amber holo presets migrate automatically.

## v2.1.32-beta - 9th Jul 2026

* **Binary separation is editable again.** Typing a separation for a binary pair (e.g. 23.7 AU) was being transformed on every keystroke — the field bound one member's barycentric distance, so the physics pass re-split what you typed by mass ratio and overwrote the box while you were still typing. The field now genuinely edits the pair separation (both members are written with the correct mass split, which the physics pass reproduces exactly), and the panel no longer refreshes from the model while one of its inputs has focus.

## v2.1.31-beta - 8th Jul 2026

Field Guide look controls + panel polish (the look panel's full home will be the projector control window):

* **View orbit.** New slider that slowly turns the camera around the scene (a turntable) — from static (default) up to about one revolution every 15 seconds. Pauses itself while a focus shot is settling.
* **Grid dropdown.** The ground grid is now its own control: Off, a plain polar grid, or a scaled grid with round-AU distance rings labelled (1 AU, 3 AU, 10 AU…), mapped through the current spread.
* **Flat Colour is the class colour.** "Flat colour" bodies now use the standard per-class swatch (terrestrial / gas giant / ice giant / habitable), never the derived true colour — that's what True Colour is for.
* **Object picker on the left.** The body selector sits at the top-left of the view rather than centred, leaving the middle clear (and matching where the projector will put it).
* **Resizable body panel (desktop).** Drag the left edge of the right-hand data panel to make it slimmer or wider; the width is remembered.

## v2.1.30-beta - 8th Jul 2026

* **Phone body panel opens small.** On a phone, tapping a world now opens its file to just the name and type — the picture, stats and description stay tucked away until you tap the title to expand them. So a tap no longer throws a half-screen sheet over the map, and you can happily click from world to world. On desktop the full panel shows as before.

## v2.1.29-beta - 8th Jul 2026

* **Field Guide body selector is now the app's own picker.** The holo/console body list was a full-height column that ate half a phone screen. It's been replaced with the same compact command-strip picker the main app uses — a chip + search + category drill-in (Stars / Planets / Moons / Belts / Rings / …) — so it's tiny, floats out of the way, and works exactly like the rest of the app. Belts are pickable from it too.

## v2.1.28-beta - 8th Jul 2026

* **Belts are visible again.** Asteroid and Kuiper belts were rendering but so faint (a tenuous surface density plus tiny attenuated rocks) they washed out to nothing at system scale. Belts now read as a clear dust band — larger, brighter rocks with a readable opacity floor — while their real density is still carried by the rock count (so the Kuiper belt is richer than the Main Belt).
* **Holo starts moving.** The Field Guide now opens already playing at 1 second ≈ 1 hour, so a system is alive the moment you open it — inner planets visibly move and the rings shear — rather than sitting frozen until you find the play button.

## v2.1.27-beta - 8th Jul 2026

* **Planets cast a shadow across their rings.** A ringed planet's body now throws a shadow band over the arc of ring that passes behind it (anti-sunward) — the ring is bright on the sunward side and darkens where the planet blocks the star, the classic Cassini look. Runs per-particle in the ring's own tilted frame, so it tracks the star and the planet's obliquity.
* **The star responds to the body-size dial.** Like the planets, the central star now scales between its readable size and its true physical radius as you move the body-size slider, instead of staying a fixed size.

## v2.1.26-beta - 8th Jul 2026

* **Belts can be framed from the selector.** Tapping a belt (Main Belt, Kuiper Belt) in the body list now frames it: the camera keeps the star centred at the preset view angle and pulls back so the whole annulus fits — the inner belt zooms to the inner system, the Kuiper belt pulls right out to the edge. Belts were previously un-framable because they're a ring about the star rather than a single body.

## v2.1.25-beta - 8th Jul 2026

* **Belts and rings now read their density from the data.** A belt or ring's particle count follows its actual mass, and its brightness follows its surface density — so Saturn's massive rings are dense and bright, while a gossamer Jupiter or Uranus ring is sparse and faint (Uranus, spread over its wide annulus, reads correctly thin). The "belt detail" dial is now a density control that scales the whole budget, so a big belt gets proportionally more rocks than a small ring rather than a flat count.

## v2.1.24-beta - 8th Jul 2026

* **Belts orbit now too.** Asteroid and Kuiper belt debris each rock advances at its true heliocentric orbital rate, so a belt slowly revolves (inner rocks faster) rather than sitting frozen. Because belts are so far out, the motion only shows once you wind time up to years-per-second — but it's there, and consistent with the rings and planets. Cheap: just a per-particle position update.

## v2.1.23-beta - 8th Jul 2026

* **Ringed planets have rings.** Saturn, Jupiter, Uranus and Neptune now wear a particle ring disc in their tilted equatorial plane, sized from the ring's real inner and outer radius. The rings spin the way real rings do — differentially, with the inner edge orbiting faster than the outer — so as time runs you can watch them turn and shear. Particle count follows the same "belt detail" performance dial.

## v2.1.22-beta - 8th Jul 2026

* **Time slider tidies itself away.** The expanded time-rate slider now closes on its own as soon as you interact with anything else, instead of needing a close button.

## v2.1.21-beta - 8th Jul 2026

* **Rethought the player time control.** It now sits as a small play/pause icon and expands on click into a rate slider that steps through real time — 1 s per second — all the way up to 10 years per second (1 s · 1 min · 1 h · 12 h · 1 d · 2 d · 4 d · 1 wk · 2 wk · 1 mo · 2 mo · 6 mo · 1 yr · 2 yr · 5 yr · 10 yr). So you can crawl or fast-forward the orbits to taste, and it stays out of the way when you're not using it.

## v2.1.20-beta - 8th Jul 2026

* **Time controls on the player view.** The Field Guide's live view now has a pause/play button and speed (slower/faster) controls, so a player can stop the motion or speed the worlds along to watch them orbit. It's just for seeing movement — the projector will show the real in-universe clock from the GM.

## v2.1.19-beta - 8th Jul 2026

* **Body-size dial.** A new "Body size" control lets you scale planets and moons from their readable chunky size down toward their true physical scale — so on a true-scale layout the worlds become the tiny pinpoints they really are, while their labels and orbits still show where they sit. Fine-tune it to taste instead of accepting the fixed size; it's saved in your preset. (The star stays a readable anchor for now.)

## v2.1.18-beta - 8th Jul 2026

* **Sharper eclipse shadows.** An eclipse now casts a hard-edged shadow by default, as an airless world would — the umbra only softens into a fuzzy penumbra when the shadowed moon or the planet casting the shadow has a real atmosphere (gas and ice giants count).

## v2.1.17-beta - 8th Jul 2026

* **Greenscreen background for streaming.** The holo view can now sit on a flat chroma-key background (green, blue or black) instead of space, so you can key it out in OBS and float the hologram over your stream. It's in the look panel and there's a ready-made "Greenscreen (OBS)" preset (top-down, true scale, green). First piece of the coming projector mode.

## v2.1.16-beta - 8th Jul 2026

* **Moon eclipses.** A moon now falls into shadow when its planet passes between it and the star — computed analytically (a cheap ray-to-star test against the planet, no heavy shadow maps), with a soft edge to the umbra. Most visible in the true-scale and projector views, where bodies sit at their real positions.

## v2.1.15-beta - 8th Jul 2026

* **Body style control.** The look panel now lets you render worlds three ways — True colour (the procedural textured surfaces), Flat colour (solid apparent-colour spheres), or Holo tint (a monochrome blueprint look) — and it's saved with your preset. A new "Blueprint" starter shows off the tinted mode. The "Scale" slider is now labelled "Spread" (true scale ↔ readable spread) to be clearer about what it does.

## v2.1.14-beta - 8th Jul 2026

* **Belts are as dense as the data says — with a performance dial.** A belt's rock count now comes from its actual debris density (mass), and the rubble fills its real inner-to-outer width, so a rich belt looks rich and a thin ring looks thin. A new "Belt detail" control in the holo look panel scales the overall particle budget up or down for performance — turn it down on an older tablet, up on a powerful machine — and it's saved with your preset.

## v2.1.13-beta - 8th Jul 2026

* **Belt debris looks like rubble, not squares.** Asteroid and Kuiper belts now scatter irregular rock silhouettes in a few shapes, sizes and grey/brown tints, so a belt reads as chaotic debris up close instead of a grid of identical squares. Still just point clouds — cheap to draw.

## v2.1.12-beta - 8th Jul 2026

* **Holo look presets.** The whole look of the 3D view — filter, scale, camera framing, starfield — is now a single preset you pick from a dropdown. Five starters ship (Clean Hologram, Green CRT Table, Amber Terminal, Night Ops, and a top-down true-scale Projector look). A gear button opens a live control panel to tweak any of it and save your own named preset, which is then available everywhere the holo view appears.

## v2.1.11-beta - 8th Jul 2026

* **Constructs read as icons on the Holo Table.** Stations and ships now use their map icon shape (triangle, diamond, etc. in their own colour) at a fixed on-screen size instead of rendering as chunky spheres. They show full-size and named when their planet (or they) are selected, and shrink to a faint few-pixel dot otherwise, so distant traffic never blocks a world. Tapping near a tiny icon still selects it. The fan-out that keeps a busy orbit legible now eases off as you approach true scale.

## v2.1.10-beta - 8th Jul 2026

* **Stars are real suns now.** Instead of a flat glow, each star is a textured photosphere sphere — granulation and sunspots (more spots on a more active star) — turning on its own axis, wrapped in a corona halo. An active, flaring star's corona visibly pulses and brightens; a calm star stays steady. The star still lights the system, and in a binary each star casts its own light, so a planet between two suns is lit from both.

## v2.1.9-beta - 8th Jul 2026

* **GPU display filters on the Holo Table.** Real fragment-shader post-processing — a proper CRT (scanlines, barrel curvature, phosphor tint, chromatic aberration, flicker) in green or amber, plus night-vision and thermal looks. Pick one from the corner of the holo view. (Ported from the Mappadux filter engine; the shaders load only with the 3D view, so nothing else is affected. GM-tunable sliders and presets come next.)

## v2.1.8-beta - 8th Jul 2026

* **Worlds are textured and they turn.** Each planet and moon now wears a procedurally generated surface — gas-giant bands, land and ocean, cloud decks, hot glow — the same look as The Guide's discs, wrapped onto the sphere. The sphere rotates on its own axis at the body's real rotation rate (with axial tilt and oblate flattening), so at a sensible time rate you watch worlds spin under the sunlight, day rolling into night across the terminator.

## v2.1.7-beta - 8th Jul 2026

* **Holo Table worlds are lit now.** Each star casts real light, so every world shows a day/night terminator — the spheres read as solid 3D bodies instead of flat discs, even before textures arrive. Binary systems get a light per star.
* **Background starfield.** An optional static starfield sits behind the hologram (on by default; a GM-selectable skybox slot comes later).

## v2.1.6-beta - 8th Jul 2026

* **Holo Table names bodies like the main view.** You see the focused body plus its parents and siblings; a body's children (moons) name themselves only when it's selected — so focusing a planet reveals its moons by name, and the map stays uncluttered otherwise. (The rule now lives in one shared place used by both the 2D and 3D views.)
* **Two framing controls under the hood.** The camera framing is now driven by two values — tilt angle (overhead to 3/4) and whether to fit the whole system or the focused body. Overhead + whole gives a top-down plan view (the basis for the projector), while a lower angle framed to a body gives the Field Guide look. These will surface as GM controls later. Moons render smaller and fan out further so a focused moon system reads cleanly.

## v2.1.5-beta - 8th Jul 2026

* **Holo Table reads properly now.** Distances use a log "toytown" compression so a packed system like Sol spreads across the grid instead of collapsing into a central blob (this will become a GM slider). Asteroid and Kuiper belts render as debris rings rather than a single stray ball; moons fan out around their planet so a moon system is legible; and each planet carries a floating name label (moons stay unlabelled at this zoom to avoid clutter — they'll name themselves when you focus in).

## v2.1.4-beta - 8th Jul 2026

* **Holo Table is now interactive.** Tap a world in the 3D view — or pick it from the body list — and the camera eases in to frame it from just above, looking back toward the star, while its file opens alongside. Selecting a body always opens its details now, in the hologram just as in the flat console.

## v2.1.3-beta - 8th Jul 2026

* **Fix: the Holo Table skin can now actually be selected.** Picking it from the Field Guide launcher silently fell back to the standard Guide, because the config's skin whitelist didn't recognise the new key. It's on the list now, so the 3D view shows as chosen.

## v2.1.2-beta - 8th Jul 2026

* **New Field Guide skin: Holo Table (3D).** A rotatable 3D orbital hologram — a fading holographic grid with the star as a glowing billboard, worlds on their real orbit rings, and inclined orbits that genuinely tilt out of the plane. Drag to rotate, pinch/scroll to zoom. Pick it from the Field Guide launcher (or `?theme=holo`). First pass: bodies are flat-colour spheres for now; textured, lit, spinning worlds land next. The 3D engine loads only when you open this view, so the rest of the app is unaffected.

## v2.1.1-beta - 8th Jul 2026

* **V2.2 groundwork (holo view).** Added an inclination-aware 3D orbit propagator (`propagateState3D`) alongside the flat one, both now sharing a single Kepler solve so the 2D orrery and the coming 3D view can never drift. Per-frame world positions moved into one shared module used by the orrery today and the holo view next. No visible change; internal only.

## v2.1.0 - 7th Jul 2026

**Star System Explorer V2.** A ground-up rebuild. Where V1 let you sketch a system, V2 derives one from real physics and lets you live in it — fly it, share it, and bring worlds in from other tools. The headline additions since the V1 line:

* **Physics-derived worlds.** A world's interior makeup, density and radius, its oceans and ice caps, atmosphere, magnetic dynamo, geology, surface-temperature profile and true apparent colour are all *derived* from the underlying physics rather than dialled in by hand — and its classification follows from that physics. The Newton panel shows the working behind any number.
* **Live orrery and starmap.** A real-time orbital view with true-colour bodies, rings, aurorae and axial tilt, sitting under a multi-system starmap you can scale in light years, parsecs or abstract jumps.
* **Spacecraft and astrodynamics.** Model your own ships and fly them: efficient transfers or "hard burns", with fuel, time and hazard all calculated. In-system **autopilot** runs ships along resource and patrol routes indefinitely, keeping a flight log; **interstellar travel** carries relativistic time dilation.
* **The Field Guide.** A live, redacted, player-facing companion you can serve straight to your players' own devices — they see what you choose to reveal, updated as the system runs.
* **Tags, Points of Interest and Constructs of Interest.** Reasons to visit a place, surfaced across the map and driving the autopilot's route choices.
* **Import from other tools.** Bring a system in from **Universe Sandbox** (.ubox) or **SpaceEngine** (.sc) — including gas and ice giants (rendered correctly from their real composition) and dwarf planets like Pluto and Eris with their moons. The importer audits every value it derives against the source so you can see what came across.
* **Rewritten documentation.** New Getting Started, physics, tags and autopilot guides, all covering the V2 feature set.

## v2.0.337-beta - 7th Jul 2026

* **Construct logs now show incoming visits.** When an autopilot ship delivers, collects, refuels or holds station at another construct (a station, depot or tanker), that visit now appears on the *receiving* construct's log too — "Chariot delivered 120 t water-ice", "Refuelled Chariot" — in a distinct colour with an inbound marker. Derived live from the fleet's own logs, so it stays correct as you scrub time.

## v2.0.336-beta - 7th Jul 2026

* **Refreshed the opening splash for V2.** The start-screen intro was still describing V1. Two new write-ups now alternate each time the dialog opens — one physics-forward, one framed around running a system at your table.

## v2.0.335-beta - 7th Jul 2026

* **SpaceEngine import: lopsided barycentres collapse.** SpaceEngine models a planet and a big moon (Earth + Moon) as both orbiting a shared barycentre. SSG only shows a barycentre for a near-equal pair, so an imported one that's very lopsided (mass ratio < 8%, the same test SSG uses) is now dissolved — the moon simply orbits the planet directly, like everywhere else. Genuine co-orbiting pairs (Pluto-Charon, binary stars) keep their barycentre.
* **Time controls: the first "+" starts time moving.** The very first time you press the speed-up (+) button, playback begins too — so a new user immediately sees what it does, instead of just watching the rate number change while everything sits still. A one-time nudge; after that the speed buttons don't force playback.

## v2.0.334-beta - 7th Jul 2026

* **SpaceEngine import: gas/ice giants now look right.** An imported Neptune was rendering as a big cratered moon — SpaceEngine calls an ice giant's fluid mantle "Ices" (Neptune ≈ 78% ice), and SSG's visual keys off the *gas* fraction, so a low-gas makeup drew a solid icy surface. Gas/ice giants (mass > 8 M⊕, density < 2.5 g/cc) now leave their interior to SSG's own density inference — exactly like SSG's own Neptune — so they classify *and* render correctly as giants. Rocky worlds and moons still import their composition.
* Import mass slider now shows the cutoff in **Earth masses** as well as kg.

## v2.0.333-beta - 7th Jul 2026

* **Import fixes + docs.** The import mass slider had its end labels reversed (the "all bodies" end read "largest only") and its included-count was one too low at the extremes (a floating-point rounding artefact) — both fixed. The first-run V2 welcome popup now lists importing from Universe Sandbox and SpaceEngine among the new features, and the README, Getting Started guide and dev docs were refreshed to cover the importers.

## v2.0.332-beta - 7th Jul 2026

* SpaceEngine import: removed an erroneous `.se` extension — SpaceEngine exports are `.sc` (with `.pak` addons also handled). The New System text names `.sc`.

## v2.0.331-beta - 7th Jul 2026

* SpaceEngine import now also accepts `.se` as well as `.sc` and `.pak` (some exports use it), and the New System text names the SpaceEngine export formats.

## v2.0.330-beta - 7th Jul 2026

* **Import from SpaceEngine (.sc / .pak).** You can now drop a SpaceEngine catalogue straight into SSG, right alongside Universe Sandbox saves — the New System dialogue and the in-system upload accept `.sc` and `.pak` files. SpaceEngine is a close fit (it stores real orbits and an explicit parent for each body), so the import is near-1:1: stars, planets, moons, binary stars and barycentres, orbits, composition, atmospheres and oceans all come across, and SSG derives the rest. The same converter window as the Universe Sandbox import handles it — a mass slider for how many small bodies to include, and a diff afterwards showing anything SSG derived differently, with one-click copy. Tested against the real Solar System catalogue (with the Earth-Moon and Pluto-Charon barycentres), a procedurally generated system, and a life-bearing binary. Under the hood the two importers now share one modal, one archive reader and one review, so both stay consistent.

## v2.0.329-beta - 7th Jul 2026

* Universe Sandbox import diff: the "explained" rows now say *why* in a couple of words (e.g. "SSG runs it cooler", "SSG-derived field"), with the full explanation on hover. The copied-for-review text carries the short reason too.

## v2.0.328-beta - 7th Jul 2026

* Fixed: importing a `.ubox` from the New System dialogue left the New System window sitting on top of the importer, blocking it. The dialogue now hides while the importer is open (and the importer sits above everything).

## v2.0.327-beta - 7th Jul 2026

* **Fixed: real .ubox files failed to import in the browser** ("not a valid archive — Array buffer allocation failed"). Universe Sandbox writes ZIP64 archives, and the zip library's browser build mis-read the ZIP64 size marker as a 4 GB allocation and crashed. The importer now reads the archive itself — pulling out only the JSON it needs (skipping the large terrain and image blobs entirely) and resolving ZIP64 sizes correctly — so full-size saves import quickly (an 18 MB, 8,000-object save loads in about half a second).

## v2.0.326-beta - 7th Jul 2026

* New System dialogue: merged the redundant ".ubox" box into "Load saved system…" — one button now takes an SSE v1/v2 system file (.json) or a Universe Sandbox save (.ubox), with a note saying so.

## v2.0.325-beta - 7th Jul 2026

* **Universe Sandbox import is now in the app (Phase 2).** You can drop a `.ubox` save straight into SSG: the file pickers on the New System dialogue and the in-system upload now accept `.ubox`. Choosing one opens a converter window that shows what's inside, lets you set a **mass slider** — from "largest only" down to "all bodies", with a live count so you decide how many of the (often thousands of) small bodies to bring in — and then imports. Afterwards it shows a **diff against Universe Sandbox**: what was imported, what was skipped and why, the assumptions it made, and every value SSG derived differently from US, flagged as aligned, explained, or "needs a look". A one-click **Copy for review** button drops the whole report onto your clipboard so you can paste it into a document and chase down anything that didn't come across right. Only the essentials are imported (mass, radius, orbit, composition); SSG derives the physics and the review points at whatever looks off for you to tweak.

## v2.0.324-beta - 7th Jul 2026

* **Universe Sandbox (.ubox) import — Phase 1 (converter + CLI).** A new module (`src/lib/import/ubox/`) reads a Universe Sandbox save and converts it into an SSG system: it inflates the archive, resolves the simulation via the manifest (tolerating the bare NaN tokens real saves contain), turns each body's state vectors into Keplerian orbits (with a lossless round-trip check), infers the parent/child hierarchy the save doesn't store (moons→planets, planets→star) via Hill-sphere binding, and derives makeup/atmosphere/hydrosphere/obliquity from the save's mass inventory and orientation. It imports only authored inputs and lets SSG derive the rest, then AUDITS its derived results against the values it didn't import, flagging differences as aligned / explained / unexplained. A galactic-context guard skips far-field objects (e.g. Sagittarius A* in a full-galaxy save), a user mass threshold controls how many small bodies come in, and ring particles are reconstructed into ring nodes. Driveable now via `npx vite-node scripts/ubox2ssg.mjs -- <file.ubox>`; the in-app file-picker + review UI (Phase 2) is not wired yet. 21 tests against fixtures cut from two real Update 36.2.1 saves; the Sol physics baseline is untouched.

## v2.0.323-beta - 7th Jul 2026

* Dev docs only: Universe Sandbox (.ubox) import specification + implementation design (`docs/dev/ubox-import-spec.md`, `docs/dev/ubox-import-design.md`), grounded in teardowns of two real Update 36.2.1 saves. No app changes.

## v2.0.322-beta - 7th Jul 2026

* **One physics pipeline — the duplicate edit-path recompute is gone.** The app had TWO physics pipelines: the full SystemProcessor (run on load/generation) and a lighter parallel recompute (run when editing a body's atmosphere or repairing structure). The fork drifted twice in as many days — the heat-model bugs and the habitability scorer both traced to it — and it also meant an edit scored habitability with an old V1 formula (different weights, no geology/magnetism modifiers) while the breakdown panel went stale. Edits and repairs now re-run the one true pipeline, so an edit can never disagree with a reload: same temperatures, same habitability (formula AND breakdown), same classification, geology, magnetism and resonance/stability annotations. The legacy V1 habitability scorer and the whole parallel recompute module are deleted. Bonus fix found during the sweep: the Technical Details panel's min/max and day/night temperature ranges were composed without the brown-dwarf self-luminous term — they now use the shared composer, so a brown dwarf's displayed extremes include its own heat. Full suite (455 tests) and the Sol baseline are green.

## v2.0.321-beta - 7th Jul 2026

* **Habitability's liquid-solvent score is now presence-weighted, not a step.** Previously any standing surface liquid, however small, scored full marks — so a 2% sea tied a global ocean, which read like a bug. It's now a gentle ramp: presence alone earns ~60% of the solvent marks (a little water is genuinely high-value, and with a sample size of one the *amount* is a weak signal next to whether it stays liquid — which the temperature/pressure factors already carry), rising to full by ~18% coverage. A 2% sea still scores high, but no longer maximal. Non-water solvents take the same ramp at their lower quality ceiling. The Biosphere breakdown now carries a one-line rationale so the number reads as deliberate, and the physics reference explains the reasoning in full. Applied consistently across both habitability code paths; Earth (≈70% ocean) is unchanged, so the Sol baseline holds.

## v2.0.320-beta - 7th Jul 2026

* **Heating-model audit — one surface temperature, wired everywhere.** Following the radiogenic fix, a full pass over how heat reaches the surface and where that surface temperature is then used. Two reported bugs traced to the same root cause: the Temperature tab computed its own "Mean Surface Temperature" preview with a *different* albedo (a coarse heuristic) than the processor commits (derived cloud albedo), so the number shown drifted ~15+ K from the value **habitability** and **geology** actually read — which made radiogenic look "disconnected" from habitability even though it wasn't. The preview now uses the same derived albedo, so the tab, the habitability temperature score, geology and the classifier all agree on one figure. Separately, the editor's recompute paths (used when you edit the atmosphere or system structure) dropped the **brown-dwarf self-luminous** heat term and didn't re-apply the radiogenic override — so re-processing a self-heated world could appear to *cool* it, and a radiogenic override could momentarily vanish. All surface-temperature composition now flows through a single shared helper that reads every heat source (greenhouse, tidal, radiogenic, giant-internal, brown-dwarf self-luminous), so no path can silently drop one. The Sol calibration baseline is unchanged; a new test locks in that habitability reads the composed mean temperature, that more radiogenic never means less surface heat, and that the recompute paths agree with the main pipeline.
* **Newton panel now shows radiogenic heat.** The temperature trace gained an explicit **Radiogenic Δ** line (between tidal and internal heat), and — when an override is set — a note spelling out that it sums into the mean surface temperature *and* drives geological vigour. The physics reference page's surface-temperature section was updated to match (flux-space summation, radiogenic's dual role, one mean temperature feeding habitability + classification).

## v2.0.319-beta - 7th Jul 2026

* **Custom tags are now shared across the whole starmap.** A free-form tag you add on a body in one system (e.g. `faction/red-syndicate`) is now offered as a one-click **"Reuse from this starmap"** option when tagging any body in any other system — no more retyping and no drift between `red-syndicate` and `Red Syndicate`. The list is derived live from every custom tag in use across the map (and updates as you add/remove them). PoI/CoI packs and custom construct tags were already starmap-wide; this closes the gap for manual body tags.

## v2.0.318-beta - 7th Jul 2026

* **Radiogenic heating fixed — now a proper, persistent GM override that drives geology.** Three bugs, all reported and confirmed: (1) the radiogenic slider wrote to a field that was stripped on every load and never re-derived, so it **reset to 0 on reload**; (2) it was disconnected from geology, so raising it **didn't change the geology tag**; (3) there was no real override control. Radiogenic heating is now a GM **override** (like albedo) — set it in the Temperature tab (derived default is ~0, since radiogenic surface heat is negligible vs sunlight), and it now **persists across save/load** *and* **boosts the geological vigor** (~12 K ≈ +1 Earth-vigor), so cranking it can wake a dead world and change its tectonics/volcanism tag. Any radiogenic values still present in an existing save are **migrated** into the override on load (values already stripped to 0 by an earlier reload can't be recovered — you'll need to re-set those).

## v2.0.317-beta - 7th Jul 2026

* **Welcome popup: a heads-up callout.** The first-run V2 welcome now flags that a big release will have the odd bug (with a link to report them on Discord) and warns that systems saved in V2 won't open in the old V1 app — keep a backup before re-saving.

## v2.0.316-beta - 7th Jul 2026

* **Saved files are now much smaller — and carry no stale physics.** Downloads used to bake in every derived value (temperatures, radiation, colours, classification, magnetism, boundaries…); since the app re-derives all of that on load, it was pure bloat. Saves now strip derived data to a clone before writing, keeping only your authored inputs — around **80% smaller** in testing. Nothing is lost on reload: authored data that *looks* derived (a star's temperature & luminosity, a GM-pinned type, a manual tidal lock, albedo overrides, your own tags) is carefully preserved, and everything else is recomputed. A new round-trip test proves save→load reproduces the system exactly.

## v2.0.315-beta - 7th Jul 2026

* **First-run V2 welcome.** A one-time popup introduces returning V1 users (and newcomers) to V2: all V1 functionality is still there and saved starmaps still load, plus a brief bulleted tour of what's new (new interface, interstellar travel, the Field Guide, physics-derived worlds, the Newton panel, tagging/PoI/CoI, autopilot, classification & visuals) with links to Getting Started, the physics reference, and the Help menu.

## v2.0.314-beta - 7th Jul 2026

* **Fixed impossibly-dense small planets from "Add planet".** A validation sweep of all 59 add-planet types found that the smallest bodies (planetesimal, dwarf-planet, mesoplanet) drew their radius independently of their mass, crushing a 0.0015 M⊕ planetesimal into a 66 g/cc "neutron pebble". Small bodies now derive radius from mass at rock density (a planetesimal is ~3.3 g/cc), while the fingerprint radius band still applies where it's physical. (Brown-dwarf densities of tens of g/cc are correct — that's real electron degeneracy.) Added a regression test that generates *every* type and checks all stats are physical and each round-trips its class.
* **Radiation & temperature now clearly sum over all luminous sources.** The Newton panel shows a moon's self-luminous brown-dwarf host as a heat/radiation source alongside the star, with a note that flux and dose sum (Σ Lᵢ/4πdᵢ²); `/physics` spells out the summing for both equilibrium temperature and surface radiation.

## v2.0.313-beta - 7th Jul 2026

* **Brown dwarfs now visibly glow.** A self-luminous brown dwarf gets an emission halo in the disc renderer (orrery + The Guide), coloured by its effective temperature — deep red when cold (a Y/T dwarf) through orange to amber for a hot young L-dwarf. Added a showcase row to the `/discgallery` reference page. (Also a regression test locking the add-planet brown-dwarf sizing to genuine 13–79 Jupiter masses.)

## v2.0.312-beta - 7th Jul 2026

* **Brown dwarfs now self-heat — and warm & irradiate their moons.** A brown-dwarf-mass body (~8–80 Jupiter masses) is no longer treated as a cold passive planet: it radiates its own heat (gravitational contraction + deuterium burning), so its surface sits at its effective temperature (hundreds to ~2000 K), **cooling with age** (L→T→Y, floor ~250 K) rather than freezing at the distant star's equilibrium temperature. Crucially it becomes a genuine **heat and radiation source for its own moons** — a satellite of a young brown dwarf is warmed and heavily irradiated by it, like a moon of a mini-star. Tagged `thermal/self-luminous`; the effective temperature, luminosity and a full explanation show in the Newton panel and on `/physics`. (Ordinary gas giants — Jupiter included — are untouched.)

## v2.0.311-beta - 7th Jul 2026

* **Help menu no longer shows a stray horizontal scrollbar.** The guide cards were a hair too wide (padding on top of a full-width box); fixed with border-box sizing.

## v2.0.310-beta - 7th Jul 2026

* **Right-clicking a star in the orrery no longer shows starmap actions.** The in-system body menu wrongly offered "Zoom to System / Start Link / Delete System" (starmap-only) on a star; it now offers just **Add Construct**, like planets and moons.
* **About trimmed.** Removed the Getting Started, physics-reference and tutorial-video links that the new Help menu now covers; About just points to Help.

## v2.0.309-beta - 7th Jul 2026

* **Orrery labels & constructs now sit above planet discs.** Since the true-colour disc overlays are an HTML layer over the canvas, a zoomed-in planet could hide its own label ("Earth") and any ship/station in front of it. Labels, construct markers, velocity vectors and the ruler now paint on a dedicated foreground canvas layered above the discs, so they're always visible.

## v2.0.308-beta - 7th Jul 2026

* **Biosphere editor guard.** Toggling a morphology on a generated world whose biosphere had no `morphologies` list would throw — the list is now seeded on demand. (Companion to the v2.0.307 detail-panel fix.)

## v2.0.307-beta - 7th Jul 2026

* **Fixed a UI lock-up on life-bearing generated worlds.** A world with a biosphere but no `morphologies` list (the shape the new generator produces) crashed the body detail panel (`morphologies.join` on undefined), which froze the whole view and made it unclickable — and made the planet vanish when you zoomed in. Every biosphere field is now guarded. (Also the likely cause of the "deleting objects locks up" reports.)
* **Help hub.** A new **Help** entry on the rail (above About) opens a hub linking every guide — Getting Started, the physics reference, the in-app Tags and Autopilot guides, the changelog, Discord and the tutorial video. The **Tags guide** is now also reachable from the PoI and CoI editors, and **About** links Getting Started.
* **Docs:** Traveller instructions now describe the **Settings → System → Traveller mode** checkbox; user-facing links point to **https://starsystemx.com/** (with the **beta.starsystemx.com** channel noted). Removed the unused Design Review file.

## v2.0.306-beta - 6th Jul 2026

* **Documentation overhaul for the V2 drop.**
  * **README + Getting Started** rewritten around the V2 feature set — a new "What's new in V2" section (interstellar travel, the Field Guide, derived geology/composition, the tagging/PoI/CoI overhaul, autopilot, true-colour worlds, the Newton panel…) and a fuller walkthrough covering the generation wizard, tags, autopilot and interstellar travel.
  * **New Tags guide** (PoI/CoI, manual tagging, packs, Find-by-tag) opened via a **Guide** button on the Find-by-tag panel — same in-app help pattern as the Autopilot guide.
  * **/physics page** gained an **Auroras** section (colour from the emitting gas, pole-hugging shape) and a **disc visualisation** rundown (terminator, ice caps, bands, limb-glow, craters, rings, oblateness, tilt-as-final-step). Two Newton-panel deep-links fixed: the Aurora layer now lands on `#aurora`, and Orbital stability on `#resonance` (was a dead `#stability` anchor).
  * **Repo tidy** — internal dev docs moved under `docs/dev/`; superseded design proposals for now-shipped features retired.

## v2.0.305-beta - 6th Jul 2026

* **Temperature panel shows the real distance-to-star for binary members.** Like the stability layer, the Temperature & tidal heat entry used the ~0.0001 AU pair orbit as the semi-major axis (reading "0.000 AU"). It now uses the barycentre's heliocentric orbit — e.g. "Semi-major axis (to Sol, as the Pluto–Charon Barycenter): 39.5 AU" — and adds a **co-orbit partner** line ("Charon — 19,268 km apart") plus a note explaining equilibrium temperature is set by the distance to the star, not the small orbit within the pair.

## v2.0.304-beta - 6th Jul 2026

* **Stability note now spells out the resonance rescue.** The resonance driver used to read only "shepherded by mean-motion resonance", which didn't make clear the resonance is what saves an otherwise-doomed crossing. It now reads "…crosses Neptune's — which on its own would be unstable — but a locked mean-motion resonance keeps their conjunctions away from the crossing point, so it stays stable", for both binary members and ordinary sibling pairs.

## v2.0.303-beta - 6th Jul 2026

* **Binary members show the pair's real orbit in the physics panel.** For a body that orbits a barycentre (e.g. Pluto around the Pluto–Charon barycentre), the Orbital-stability entry now shows the barycentre's ~39.5 AU heliocentric orbit — labelled "as the Pluto–Charon Barycenter" — instead of the misleading ~0.0001 AU orbit within the pair, with a note explaining stability is judged on the pair's shared orbit.

## v2.0.302-beta - 6th Jul 2026

* **Mass/Radius unit button polish.** The unit cycler now sits to the right of the number box (lined up with Density's g/cc), and hovering it explains the current unit — e.g. "Earth masses (M⊕)" — with a "Click to change units" line below.

## v2.0.301-beta - 6th Jul 2026

* **Pluto is no longer flagged "Very Unstable".** A binary/barycentre's orbital-stability check (Pluto–Charon orbits a barycentre) ignored two things the ordinary planet check already handled: a protective mean-motion resonance, and that belts are distributed debris rather than a gravitational neighbour. So Pluto read as doomed for crossing Neptune and the Kuiper Belt. It now correctly reads **Marginal** — metastable, "shepherded by mean-motion resonance" — matching the 3:2 resonance the panel already showed.

## v2.0.300-beta - 6th Jul 2026

* **Pick the units when editing a planet's mass and radius.** In the Size & Composition editor there's now a little unit button in the gap next to "Mass" and "Radius" — click it to cycle Mass between Earth masses, Jupiter masses and tonnes, and Radius between Earth radii, Jupiter radii and km/miles (following your starmap's distance setting). Makes small moons and giants far easier to type in than everything-in-Earth-units. The slider is unchanged; only the number field's units switch.

## v2.0.299-beta - 6th Jul 2026

* **Fixed the Invert / background-image toggles fighting each other** in Settings → Starmap. The invert setting was being re-synced from the saved map on every little change while the panel was open, so it (and the background toggle it disables) could spontaneously flip back. It's now read once when the panel opens, so the two behave predictably: turning on invert disables the background image, turning it off restores it. Also relabelled to "Invert Starmap display (print)".

## v2.0.298-beta - 6th Jul 2026

* **Axially-tilted worlds now tip correctly — including their rings.** Previously the oblate squash stayed vertical while the bands tilted, and a planet's rings didn't tilt at all. Now the whole body — the flattening, cloud bands, polar caps, auroras and the ring system — is drawn upright and then rotated to the axial tilt as one final step, so everything stays aligned (a tipped Saturn shows a tilted, squashed disc with a matching ring). The day/night terminator still points at the star.

## v2.0.297-beta - 6th Jul 2026

* **The physics panel now explains auroras and orbital stability.** A new **Aurora** entry shows why it glows the colour it does (the atmosphere gas that's excited — oxygen green, nitrogen blue-violet, etc.) and how its strength comes from atmosphere + field + incident flux. A new **Orbital stability** entry shows the orbit's perihelion→aphelion, the assessment, and *why* — including when a mean-motion resonance (Pluto/Neptune style) shepherds a crossing orbit into stability rather than doom. Great for spotting a surprising verdict.

## v2.0.296-beta - 6th Jul 2026

* **Auroras now follow the axial tilt.** Because the magnetic poles ride with the spin axis, the auroral ovals rotate with a world's axial tilt (like the cloud banding does) instead of staying pinned to the top and bottom — so a tipped-over world shows its auroras off to the side.

## v2.0.295-beta - 6th Jul 2026

* **Self-heal a binary whose barycentre went missing.** A hand-edited (or otherwise corrupted) system where two stars orbit a barycentre that isn't in the file would fail to load — nothing had a valid root. The barycentre reconciler now recognises an orphaned node (one whose parent no longer exists) as a root, re-homes the stragglers, and rebuilds the missing barycentre, so the system loads normally.

## v2.0.294-beta - 6th Jul 2026

* **Cratered surfaces.** Old, airless, geologically dead worlds — no atmosphere to burn up impactors, no resurfacing to erase the scars — now show impact craters (Mercury, the Moon, Callisto…). Driven by the airless + geologically-inactive condition, or an explicit impact-record tag; shown in The Guide and the orrery.

## v2.0.293-beta - 6th Jul 2026

* **Auroras glow over the limb, and the far pole no longer looks "half-painted".** They now extend a touch past the planet's edge (like a real aurora above the atmosphere) instead of stopping dead at the circle, and the far (bottom) pole's oval fades softly behind the planet rather than terminating in a hard flat line. Holds up on oblate worlds too.

## v2.0.292-beta - 6th Jul 2026

* **No more clouds on airless worlds.** A body with only a tenuous exosphere — like Mercury's sputtered sodium/potassium halo at a ten-billionth of a bar — was wrongly getting a "cloud deck" (and cloud-tinted colouring), because the model looked at what the thin gas was *made of* but not how little of it there is. Clouds now require a real atmosphere (≥ ~1 µbar), so exosphere worlds render and read as the bare rock they are, while thin-but-real atmospheres (Mars, Triton, Pluto) keep their clouds.

## v2.0.291-beta - 6th Jul 2026

* **Tags keep their context in reports and the field guide.** They were being shortened to the bare last word — "Dynamo", "Oblate", "Brilliant" — losing what they meant. They now read with their category, matching the GM window: "Magnetism · Intrinsic dynamo", "Shape · Oblate", "Brilliant aurora: 0.62", "Climate · Polar ice". (The category is only added where it clarifies — no "Atmosphere · Inert atmosphere".)

## v2.0.290-beta - 6th Jul 2026

* Fixed a stray "Mostly Harmless" mark showing under Earth in the **orrery**. The Guide's Earth easter-egg stamp was riding along when the orrery started reusing The Guide's renderer; it's now Guide-only again.

## v2.0.289-beta - 6th Jul 2026

* **Aurora depth + placement.** The far (bottom) auroral oval now has its upper half hidden behind the planet, so it reads as a proper slightly-top-down view instead of floating in front. Auroras also sit closer to the poles when faint and only reach down toward the equator as they grow stronger.

## v2.0.288-beta - 6th Jul 2026

* **Gallery: the same Earth under different stars.** The rendered-world gallery now shows one Earth-like world lit by an M dwarf, a K star, the Sun and a hot A star, so you can see how starlight tints its ocean, clouds and surface — murky amber under a red dwarf, cool and bright under a blue star.

## v2.0.287-beta - 6th Jul 2026

* **A feeding black hole now looks like it's feeding.** Its accretion glow and disc scale with the material-infall (Eddington) rate — more infall makes a bigger, brighter halo and a thicker disc that heats from orange toward yellow-white. Quiescent (non-feeding) holes stay dark, as before.

## v2.0.286-beta - 6th Jul 2026

* **Auroras look like auroras now — and their colour comes from the air.** Redrawn as spiky, swirled glowing **ovals ringing each magnetic pole** (Hubble-Jupiter style) that hug the planet instead of the old floating zig-zag. Their **colour is set by the atmosphere's gas**, like real skies: atomic oxygen glows green (Earth), nitrogen blue-violet, CO₂ violet, and a hydrogen/helium giant red-pink. Strength still scales the size and brightness. Shows in both The Guide and the orrery.

## v2.0.285-beta - 6th Jul 2026

* **The orrery and The Guide now share one renderer.** The tag-driven viz (polar ice, auroras, atmosphere glow, banding + spin-axis tilt, rotational shape) was only appearing in The Guide; it now appears in the orrery too, because a body big enough on screen is drawn with the very same PlanetDisc renderer — so the two views can't drift apart. The orrery keeps its physically-correct day/night terminator (a new light-direction is passed to the disc). Performance-guarded: only on-screen bodies large enough to show detail are promoted (capped in number), each rendered once and GPU-scaled, so panning and zooming stay smooth.

## v2.0.284-beta - 6th Jul 2026

* **Red giants are now coloured like the standard stars they are.** A red giant is just a cool, swollen K/M-temperature star, so it's now tinted by its temperature (warm orange) like every other star instead of a special blood-red swatch — in the orrery and the editor swatch. (Audit confirmed they already behave as standard stars everywhere else — generation, planet counts, classification.)

## v2.0.283-beta - 6th Jul 2026

* **Phase G viz — bodies spun past break-up now render as a ring.** A world driven past ~0.8 of its break-up spin (the toroidal regime) has flown apart into a ring, so The Guide draws a true torus — a tilted annulus with a hole — instead of an ever-thinner lens. Rounds out the rotational-shape series (sphere → oblate → ellipsoid → ring), now all viewable in the rendered-world gallery.

## v2.0.282-beta - 6th Jul 2026

* **Phase G viz — auroras.** New physics driver: a world with an **atmosphere + a magnetic field + an incident ionising particle flux** now gets an aurora, graded faint → moderate → strong → brilliant (a new `aurora/*` tag, explained in the physics panel). Calibrated on the solar system — Jupiter brilliant, Earth and Saturn strong, the ice giants moderate, and no-field or airless worlds none. The Guide draws it as zig-zag polar curtains that grow from a subtle shimmer to huge blazing ovals with the strength, green with magenta tips at the top end.

## v2.0.281-beta - 6th Jul 2026

* **Phase G viz — atmosphere limb-glow.** Worlds with an atmosphere now get a soft halo hugging the limb in The Guide's disc, its strength scaled by surface pressure (wispy → faint, Earth → moderate, Venus → strong) and its colour from the atmosphere's haze. Airless worlds keep a clean edge.

## v2.0.280-beta - 6th Jul 2026

* **Phase G viz — gas-giant bands now tilt with the spin axis.** Cloud banding (its count already set by rotation) is drawn tilted by the world's axial tilt, so a planet tipped on its side like Uranus shows near-vertical bands instead of the usual horizontal stripes. Shows in the orrery and The Guide.
* **Rendered-world gallery.** The dev disc gallery is now a proper reference page (`/discgallery`), linked from **Settings → System → Appearance** — a quick look at how worlds are drawn from their physics and tags (polar ice, banding + tilt, rotational shape…).

## v2.0.279-beta - 6th Jul 2026

* **Phase G viz — polar ice caps.** Worlds that are liquid at their mean temperature but freeze at the poles (the `climate/polar-ice` tag — Earth, Mars…) now show frozen caps in The Guide's rendered disc. The caps sit on the surface, so the day/night terminator dims them, and they follow a fast rotator's oblate squash.

## v2.0.278-beta - 6th Jul 2026

* **Fixed: deleting the primary star of an imported/legacy system left it on the starmap.** Those systems store the map node under a different id from the system inside it, and the delete matched the wrong one — so it worked for freshly-created systems but silently no-op'd for loaded ones. The delete now resolves either id to the right node before removing it.

## v2.0.277-beta - 6th Jul 2026

* **Deleting the primary star now deletes the whole system — on purpose, with a warning.** Previously it silently left a broken, empty husk on the starmap. The star's delete button now reads **"Delete system"** and asks you to confirm ("this removes the whole system and everything orbiting it") before dropping the entire system and returning you to the starmap.
* **GM overrides moved to the bottom** of the read-only data panel, below the tags, where it reads as a footnote rather than a header.
* **Every tag now explains itself in the physics (!) panel.** Filled in the write-ups that were missing (origin, orbit, barycentre, hazard, runaway-greenhouse, the namespaced atmosphere tags…), gave each tag a proper source-layer instead of "Other", and added a namespace-level fallback so any future tag (auroras, bands…) is always explained rather than blank.

## v2.0.276-beta - 6th Jul 2026

* **One slider for spin.** The Day Length editor is now a single log-scaled slider running from the break-up limit (fast) to slow, its track **colour-zoned** by the shape the spin produces — spherical (green), oblate (amber), ellipsoid (orange), near break-up (red) — so you can see a world flatten as you drag. **Tidal lock is a snap-notch** on the track (drag onto it, or click the padlock) instead of a separate checkbox; drag away and it releases. **Retrograde** is its own toggle (the day-length box always shows the magnitude). A numeric box stays for precise entry, and the break-up floor is still a hard stop. **Axial Tilt** becomes a 0–180° slider with a synced value box too.

## v2.0.275-beta - 6th Jul 2026

* **Construct photos now show in the player views.** A construct's uploaded picture appears anywhere a body's picture would — the **Survey Datapad** panel and the **Starship Console** inspector. (Constructs were coded to never show a picture back when they couldn't have one.) The Guide keeps to its own procedural artwork and the CRT stays text-only, as before.

## v2.0.274-beta - 6th Jul 2026

* **F2 — custom images.** Give any body or construct its own picture. For a body it lives under **Type / Image** in the editor; for a construct it's **Add / replace image** on the **Basic** tab (constructs stay as their icon glyph until you add one). Uploads are downscaled to a compact thumbnail so they save with the system and stream to players without bloat. The custom picture shows in the detail pane and survives reloads; **Remove** reverts a body to its derived artwork and a construct to its icon.

## v2.0.273-beta - 6th Jul 2026

* **Credit your systems.** Select the main star and open the new **System Info** tab to add your name, contact, a date and a version. When anyone selects that star they see "This system was created by …" under its image, so your work travels with the system when you share it.

## v2.0.272-beta - 6th Jul 2026

* **F1** — the New System screen now has a **"Load saved system"** button beside the example loader, so you can drop a system you previously saved (or one from a shared starmap) straight onto the map at the clicked spot — no need to open it as a whole starmap first.

## v2.0.271-beta - 6th Jul 2026

* **Saturn-class gas giants now have realistically weak fields.** A cool gas-giant interior lets helium rain out and throttle the dynamo (why Saturn's field is ~20x weaker than Jupiter's). The model now captures this: a hot interior — from mass or strong insolation — keeps the field strong, so Jupiter (~4 G) and hot Jupiters stay powerful while a cool Saturn-mass giant drops to ~0.2 G. Calibrates Jupiter/Saturn/Uranus/Neptune all close to reality.

## v2.0.270-beta - 6th Jul 2026

* Fixed **Venus (and other retrograde rotators) reading a magnetosphere they should not have**. A retrograde body stores a negative rotation period, which the dynamo model mistook for "rotation unknown" and treated as a normal spin — so Venus, which really spins far too slowly for a dynamo, came out with an Earth-ish field. It now uses the rotation magnitude, so Venus correctly reads *No magnetosphere*.

## v2.0.269-beta - 6th Jul 2026

* **Planets and moons are now drawn as their actual shape** — a fast rotator shows visibly flattened (oblate), not a perfect circle — in the orrery, the projector, the printed report and The Guide's discs. The flattening comes straight from the rotational-deformation model (E4), so a world near its break-up spin draws as a thin lens. Rings keep their own plane.

## v2.0.268-beta - 6th Jul 2026

* **Magnetospheres now respond to rotation and composition.** A body's field strength is derived from its dynamo (rotation, interior makeup and core size) rather than a fixed number — spin a world up or make it metal-rich and the field grows; the GM override still wins. Calibrates to the real planets (Earth ~0.5 G, Jupiter ~4.3 G). **Mercury** now reads a **Tenuous magnetosphere** (~0.003 G) instead of "No magnetosphere" — a metal-rich body keeps a weak field even when small and slow-spinning. New *Tenuous magnetosphere* tag for real-but-negligible fields, and the field readout shows enough decimals to see them (0.003 G, not 0.00 G).

## v2.0.267-beta - 6th Jul 2026

* **Rotational deformation.** How fast a world can spin is now limited by its composition: the bulk density sets a hard **break-up spin**, and as a body approaches it it visibly flattens — spherical → oblate → ellipsoid → near-break-up → *would fly apart into a ring*. The shape is derived live from density + day length (so editing either updates it), surfaced as tags, and drives the ellipsoid/toroidal planet types (which now use the real spin limit instead of fixed hour thresholds). The Day Length editor shows the live shape and the break-up period, and won't let you spin a body past the point where it would disintegrate. Jupiter and Saturn correctly read as oblate.

## v2.0.266-beta - 6th Jul 2026

* Fixed **generated gas giants having impossible densities**. A giant's radius was drawn independently of its mass, so a heavy one could come out denser than iron (a "helium" giant read as ~21 g/cc and even mis-labelled non-gas). A giant's radius is now derived from its mass (degeneracy keeps it near one Jupiter radius across a wide mass range) plus thermal inflation, and it's explicitly gas-dominated — so densities are physical. Giant masses are also drawn log-uniformly, so most come out around a Jupiter instead of piling up at brown-dwarf mass (median dropped from ~6 to ~1.9 Jupiter masses).

## v2.0.265-beta - 6th Jul 2026

* **E1 — moons are now gated by their host's mass**, in both the "Add moon" picker and procedural generation. A terrestrial can only hold small airless / icy moons (barren, crater, ice, desert, planetesimal…) — airless rock the default — while a gas giant offers far more (Titan-like methane, Europa-like ocean/ice, bigger bodies). The "Add moon — pick a type" header now says so and the count reflects it (a terrestrial host drops from ~28 types to ~7). Also: a manually-added moon defaults to a small (not gravitationally significant) size instead of Earth-mass, and moons can no longer be gas-giant-family types (helium/puffy/ice-giant) — an old filter gap.

## v2.0.264-beta - 6th Jul 2026

* Generated gas giants now migrate into the true **hot-Jupiter zone** (down to ~0.025 AU, log-biased), so genuine hot Jupiters actually appear — puffed up by the thermal inflation and classified as hot / ultra-hot Jupiters — rather than only warm giants at the fringe. Migration is also slightly more likely.

## v2.0.263-beta - 6th Jul 2026

* Freshly-generated gas giants now **inflate at generation** too: once a giant's final (post-migration) orbit and temperature are known, a close-in one is born puffy — the same thermal-inflation model the editor uses — so a generated hot Jupiter comes out low-density and classifies as one. Cold giants are unchanged.

## v2.0.262-beta - 6th Jul 2026

* The body **data panel now surfaces GM overrides and gas-giant puffiness**. A "GM overrides" line lists which values you've pinned by hand (albedo, magnetic field, thermal inflation, a locked type) so it's clear at a glance what the physics owns vs what you've set. Gas giants also get a **Thermal inflation** readout (×factor, flagged *puffy* when inflated, *override* when hand-set).

## v2.0.261-beta - 6th Jul 2026

* **Gas giants now inflate with heat.** A gas giant's radius (and so its density) tracks its equilibrium temperature — a close-in hot Jupiter puffs up and thins out, a cold one sits near 1 Jupiter radius. This is derived by default; the Size & Composition editor shows a gas-giant-only **Thermal inflation** row (derived from Teq) that you can *override* to model a young, hot or contracted giant independent of orbit, with a *Reset to calculated* control. Terrestrials are unaffected (rock and metal don't thermally expand). Overriding at ×1.5 took Jupiter from ρ≈1.3 to ρ≈0.37 g/cc.

## v2.0.260-beta - 6th Jul 2026

* **Albedo is a GM override again** (Temperature tab). It's still derived from the surface and cloud decks by default, but you can click *override* to pin a reflectivity — it's saved and fed into the equilibrium temperature and the classification, with a *Reset to calculated* control that hands it back to the physics. Darkening a world warms it; brightening cools it. (First use of the new saved-override mechanism; temperature itself stays derived — tweak albedo or radiogenic heat to move it.)

## v2.0.259-beta - 6th Jul 2026

* New **Anomalous field** magnetosphere tag. If you give a body a magnetic field that its interior can't explain (no dynamo, not an induced ocean field), it no longer pretends to be a natural dynamo — it's tagged as an anomalous field of unknown or artificial origin (a megastructure, exotic matter, a young system…). Natural dynamos and induced fields are unchanged.

## v2.0.258-beta - 6th Jul 2026

* **Reloading an existing map now re-derives classifications** (not just tags). On load the app already re-runs the physics, but it wasn't stripping the stored classes first — so a body that already carried a (now-outdated) type kept it, and engine fixes like the moon-eyeball correction didn't show until you re-imported the file. Refresh now strips baked-in derived data and re-derives from the authored inputs, exactly like importing a file does; hand-pinned types (auto-classify off) and authored inputs are preserved. No staleness flag needed — derived data is never trusted from storage.

## v2.0.257-beta - 6th Jul 2026

* Fixed a **hand-picked body type not surviving save → reload**. When you pick a type and switch off *Auto-classify*, that choice is authored data — but on load the import fix-up wiped the class and the engine re-derived it, silently reverting your pick. Pinned types (auto-classify off) now persist across load, exactly like a star's spectral class; bodies left on auto-classify still re-derive as before.

## v2.0.256-beta - 6th Jul 2026

* The **magnetosphere tag now follows the field you set**. Editing a body's magnetic field (Atmosphere → Magnetosphere) is treated as a manual override: set it to 0 and the world reads as *No magnetosphere* (even if its interior would drive a dynamo); raise it above 0 and it gains one. An "overridden" marker and a **Reset to calculated** control appear while a manual value is in force — reset re-seeds the field from the interior model and hands the tag back to the physics. Untouched bodies keep deriving their field from the interior as before.

## v2.0.255-beta - 6th Jul 2026

* Fixed **moons being mis-classified as "eyeball" worlds**. An eyeball world needs a permanent substellar point — it has to be tidally locked to its *star*. A moon is locked to its *planet*, so its far side still turns through the star's day and night; it can never be an eyeball. The eyeball types now require star-lock, so tidally-locked moons classify by what they actually are (dwarf planet, mesoplanet, planetesimal…). Corrects several outer moons in the bundled Solar System.

## v2.0.254-beta - 6th Jul 2026

* **Size & Composition editor** (a planet/moon's Composition tab, rebuilt). Mass, radius and density are bound by one equation (ρ = M/(4/3·π·R³)), so you get three large sliders — Mass, Radius, Density — each with a typed number field and a padlock. Drag one and the physics holds the sensible quantity and derives another: drag mass → the radius follows; drag radius → the density (and interior makeup) shift; set a density → the mass follows. A padlock pins any of the three: **locking Density holds the composition**, so you can resize a world freely without recomposing it.
* **Composition presets are now gated by density**, not mass — Iron-rich, Rocky, Carbon, Ocean, Icy, Ice giant, Gas giant light up when today's density falls in their band (bands overlap, since several mixes are plausible at one density). The interior-makeup sliders are live: while density is unlocked, nudging metal or ice back-drives the density, which re-gates the presets and (with radius held) shifts the mass.
* **You can finally turn a terrestrial into a gas giant.** Drop the density toward ~1 g/cc, pick the Gas giant preset — the makeup goes gas-dominated, the gas-giant radius model kicks in and the world balloons to Jupiter scale — then dial the mass up. It reclassifies for real (a gas/ice-dominated world no longer clings to a leftover biosphere/ocean when the physics decides its type). Dial it back down and it returns to a terrestrial — nothing authored is destroyed.

* Fixed imported stars showing **0 K** — a star's effective temperature is an authored input (it sets the spectral class), but import was stripping it like a planet's derived surface temp. Loaded stars keep their real temperature now (e.g. Procyon 7,070 K).
* **System edge** setting (Settings → Starmap → System edge): choose where a coasting ship counts as having left the system — the star's Hill limit (~2 ly, default) or a tighter custom distance in AU for quicker interstellar departures.
* Tidied the Stellar Zones Key close button (was a heavy red box in the corner; now a clean × that highlights on hover).

## v2.0.252-beta - 5th Jul 2026

* A ship that coasts out past the star's Hill limit now genuinely **leaves the system** — it's removed from the system map and appears on the starmap as an adrift interstellar ship, drifting slowly onward at its real speed along the heading it left on. (The Hill limit is ~2 ly, so a flung ship takes a long time to actually get there — scrub forward to watch it cross over.)

## v2.0.251-beta - 5th Jul 2026

* Hill-sphere overlay now shows STARS too: each star's Hill boundary draws as an unshaded line with a "[Star] Hill Limit" label (like the frost line) — including the root star's own galactic Hill limit (~2 ly for a Sun, the edge of the system). Planets keep their shaded bubbles.
* The Stellar Zones Key panel now has a close (×) button; re-selecting Zones from View options brings it back.

## v2.0.250-beta - 5th Jul 2026

* Stars always show their temperature in Kelvin, whatever the temperature switch is set to (a ~5,778 K star reads oddly as °C/°F) — the °C/°F/K choice governs planet & moon temps. Fixes the report and the Companion guide showing star temps in °C/°F.

## v2.0.249-beta - 5th Jul 2026

* Temperature is now its own switch (Settings → Starmap → Temperature: **°C / °F / Kelvin**), independent of the distance units — so you can pair km with Kelvin, miles with °C, etc. The old "X K (Y °C)" dual readouts collapse to a single value in your chosen unit. Report + Companion guide carry the choice too.

## v2.0.248-beta - 5th Jul 2026

* Temperatures now follow the measurement-units choice too: metric shows °C, imperial shows °F (Kelvin stays internal, and scientific "X K" readouts stay Kelvin). Covers body surface/equilibrium temps, day/night and component ranges, the report, and the player catalogue/guide. Temperature *deltas* (greenhouse/tidal/internal offsets) read in K since a temperature difference isn't a °F value.

## v2.0.247-beta - 5th Jul 2026

* Editable distance/speed inputs now follow the measurement-units choice too: their labels show the current unit (Altitude (km)/(mi), ring radii, Max Entry Speed (km/s)/(mi/s)) and you edit in that unit — converted back to SI on save, with no round-trip drift. Caught a few more raw km/s readouts that the first pass missed (construct Δv in the technical panel, relativistic cruise speed, ring parent Hill-sphere). Belt/orbit distances stay in AU; the body Radius editor is left for the upcoming mass/radius/density rework.

## v2.0.246-beta - 5th Jul 2026

* The measurement-units choice now also drives the **printed report** and the **player Companion catalogue/guide** — radii, local-orbit distances, ascent/landing Δv all honour km/miles. The report carries the GM's current setting; the Companion guide gets it from its launch link.

## v2.0.245-beta - 5th Jul 2026

* Measurement units toggle (Settings → Starmap → "Measurement units"): switch in-system distances and speeds between **Metric (km, km/s)** and **Imperial (miles, mi/s)**. Purely a display choice — everything is still stored and computed in SI. Covers body radii/circumferences, moon & local-orbit distances, orbital-zone bands, sensor ranges, Δv and arrival/cruise speeds, and the ruler readout. Planet/star orbits stay in AU (an astronomical unit, not a km/miles thing) and the interstellar map keeps ly/pc.

## v2.0.244-beta - 5th Jul 2026

* Fixed legacy (V1) binary systems loading wrong. Two distinct bugs in the barycentre load path: (1) importing a system could crash the orrery with "Cannot read properties of undefined" when the scaled-position pass raced a just-loaded system; (2) a nested binary pair (a planet with an oversized moon that V1 had promoted to a barycentre) collapsed to the system centre / inside the star, because the import step deleted its barycentre and orphaned the pair. Both fixed — legacy binaries now load and sit where they should.

## v2.0.243-beta - 5th Jul 2026

* The Autopilot tab now has a **Guide** button (top-right) that opens the full user guide in-app — how routes are chosen for each action, the sliders, fuel/cargo, escorts and the map colours. It reads the same doc that ships in the repo, so help and docs never drift.

## v2.0.242-beta - 5th Jul 2026

* Escort formation is now capability-checked: a charge that burns harder than its escort's thrust ceiling leaves it behind — the escort coasts on from the break moment (deterministic) and commits a fresh chase at its next top-up. Cap the lead ship's Max acceleration to keep a mixed flotilla together.

## v2.0.241-beta - 5th Jul 2026

* Escorts now catch their charge ANYWHERE — in port or open space. The escort targets the construct itself (real rendezvous, velocity-matched) and then flies genuine formation, mirroring the charge through everything it does, trailing by the km standoff (replaces the host-parking approximation). Caveat: intercept aiming projects a mid-burn charge linearly; coasting/parked charges are exact.

## v2.0.240-beta - 5th Jul 2026

* Max time per leg now counts the WHOLE leg — a delayed launch window included. An over-cap waiting plan loses to a faster family instead of stranding the ship; the stuck reason reports the elapsed days when nothing fits.
* Ignore life support shown ticked + locked (supplies aren't modelled yet) so the UI reflects real capability.

## v2.0.239-beta - 5th Jul 2026

* Autopilot guide expanded: per-action "what's considered / how it's chosen / when it's reconsidered" decision procedure (incl. exactly how escorts track their charge) + how a leg becomes a flight plan (the four solver families and what Drive picks).
* Coast perf: an unbound ship already heading outward no longer encounter-checks planet bands it can never come back down to.

## v2.0.238-beta - 5th Jul 2026

* Fixed thrifty autopilot ships mis-scheduling after a delayed-launch (wait-for-alignment) leg: the wait window wasn't counted toward arrival, so following legs stacked on top of it.
* Escort standoff distance is now honoured: the escort parks at its charge's orbital radius + the km standoff (0 = formation).
* New user guide: docs/autopilot-guide.md — how routes, searching (mine/explore choose their own sources), traversals, sliders, fuel/cargo and the map colours all work.

## v2.0.237-beta - 5th Jul 2026

* Fixed the orrery dying (blank canvas + garbage tiles, `createRadialGradient non-finite` spam) after abandoning a ship mid-torch and letting it drift for years: the universal-Kepler solve overflowed on fast hyperbolic escapes over long spans → NaN positions poisoned the draw loop. Proper hyperbolic starter + overflow cap + a never-NaN fallback; energy still conserved.

## v2.0.236-beta - 5th Jul 2026

* Transfer-logic audit fixes: one shared rocket equation everywhere (de-duped copy removed), autopilot burn profile surfaced, hyperbolic-element guard on the orbit propagator, forecast-line dead code pruned.
* **Adrift ships get flung by planets again** — patched-conic coast: exact star conic between encounters, exact planet conic through each Hill sphere (deterministic, scrub-safe), capture when abandoned deep inside one. The red forecast line shows the bend too.
* Autopilot burn profile now follows the Drive slider (20/60/20 thrifty coast → 50/50 continuous burn), stepping down to a longer coast when fuel is short rather than stranding.
* Committed route lines drawn in burn colours (green accel / yellow coast / red brake), active leg bright, next leg faded; uncontrolled (adrift) coast is now orange.
* New **Hill spheres** View option — light-yellow bubbles showing each planet's gravitational grab radius (GM view + projector), exactly the boundary the coast physics uses.
* Autopilot Avoid list and explore "don't revisit" are now enforced by the planner (were capture-only).

## v2.0.235-beta - 25th Jun 2026

* Each journey in the Ship's Log now says what *kind* of trip it is next to the autopilot badge — mine / load / unload / patrol / explore / escort — instead of just "autopilot", so you can read a route at a glance.

## v2.0.234-beta - 25th Jun 2026

* Ship's Log re-ordered to read like an itinerary, per your spec. DEFAULT now shows the current/active journey at the TOP, then each upcoming planned trip downward in the order it happens (events tucked under their journey) — then a short "Recent history" section of just the **last 2 completed** journeys, then a **Show full history** button. Full history shows every trip, most-recent at the top (reverse-chronological). (Was: everything newest-first with no history limit or section.)

## v2.0.233-beta - 25th Jun 2026

* Fixed a parked ship jittering against its host at deep zoom (e.g. The Cant in low orbit around Ganymede at 1 h/s). Its position was stored as an absolute vector the reconcile only refreshes every ~150 ms, computed relative to the host's position at that tick — but the host is redrawn every frame, so the ship lagged the host by its orbital motion over those 150 ms (invisible at system scale, large at moon-surface zoom: the ship and planet effectively on different clocks). The orrery now resolves a construct's position per-frame at the render clock (transit, coast, AND post-arrival parking orbit — the last computed relative to the host body at the same instant), so ship and host stay locked in the same frame. (Regression from the autopilot reconcile storing parked positions; V1 orbit-propagated parked ships per-frame.)

## v2.0.232-beta - 25th Jun 2026

* The Ship's Log is now one **reverse-chronological timeline** instead of a journeys list with a separate flight-log section at the bottom. Journeys and the work events that happened on them (load/mine/unload/refuel) are interleaved by time, newest first, so scrubbing reads naturally and a journey's events sit right with it. Fuel % and Cargo show in a bar at the top. By default it shows the recent window (the retained journeys + their events); a **Show full history** button reveals every logged event back to the start (the flight log is kept forever even after old journey paths are trimmed).

## v2.0.231-beta - 25th Jun 2026

* Abandoned/adrift ships now coast on a deterministic Keplerian conic instead of a step-integrated drift. The old integration was sampling-dependent (scrubbing changed the step count, so the same ship reached 400 vs 1500 km/s) and injected energy through perihelion (the unphysical slingshot out of the system). The new universal-variable two-body propagator is exact and energy-conserving for ellipse / parabola / hyperbola alike, so a cut-loose ship follows one stable, repeatable path — and the forecast ("future direction") line is now a single steady curve that no longer jitters as the clock advances. Coast motion is also derived per-frame now, so it's as smooth as orbital motion.

## v2.0.230-beta - 25th Jun 2026

* Fixed jerky playback at speed. A construct in transit was drawn from a stored position the reconcile only refreshes every ~150 ms, so at e.g. 7 d/s a ship stepped ~a day per refresh (and a just-arrived ship flickered to its old spot before snapping back) — far more visible now that ships are constantly under autopilot transit. The orrery now derives a transiting ship's position from its (precomputed, deterministic) journey path at the render clock every frame, so transit motion is as smooth as orbital motion. (Coasting/adrift ships still use the stored coast vector for now.)

## v2.0.229-beta - 25th Jun 2026

* Haul amount now defaults to **"fill the hold"** (blank), not a baked free-space number — so a ship that delivers its existing cargo first then fills to *full* capacity, instead of reserving room for cargo it no longer carries. Type a number for a deliberate partial load. (Clear the fill field on existing routes to get the new behaviour.)
* The orrery no longer draws a ship's whole committed route — just its **current and next** leg, so the map stays readable when ships have many legs queued.

## v2.0.228-beta - 25th Jun 2026

* Flight-log entries are now **live, not baked**. A mine/load/unload/refuel that takes time renders against the display clock: a *planned* one reads "Mining 999 kt water ice at Ganymede (planned)"; one *underway* shows progress "Mining 0.4 / 1.0 kt … — 45%" (highlighted, and its timestamp flips to the completion time — your ETA); and a *finished* one reads "Mined 999 kt …". Scrub through a long mining run and watch it fill. Instant events read the same throughout.

## v2.0.227-beta - 24th Jun 2026

* **Escort** now flies (first cut). An escort leg rendezvous with the target construct at its current location and holds there; because the sim is deterministic from the clock, the target's position is always known, and the clock top-up re-resolves it so the escort follows its charge host-to-host as it moves. Matching velocity = formation. Escort legs are kept out of best-order/any reordering (a moving target is never a fixed waypoint). (km-precise standoff is a later refinement; this holds at the target's host.)

## v2.0.226-beta - 24th Jun 2026

* A hauler that starts a route already carrying cargo now **delivers it first**. If the route opens on a mine/load but has a drop-off, an unload of the existing cargo is prepended at that drop-off — so a ship that comes on shift full clears its hold before gathering more, rather than carting the old load around the circuit.

## v2.0.225-beta - 24th Jun 2026

* Autopilot now respects a ship's **readiness** (its worst Status blocker). A wreck, impounded, dormant or otherwise non-operational ship (readiness 0) can't be engaged — it says so plainly ("not operational — its status prevents movement") instead of silently failing. A damaged or under-construction ship (readiness 0.5) limps along at **reduced thrust** (max accel scaled by readiness), so its transfers are slower and thirstier — exactly what a half-crippled hull should manage.

## v2.0.224-beta - 24th Jun 2026

* **Totals & averages** in the Ship's Log — a collapsible panel that aggregates the flight log up to where you're looking: cargo delivered (overall + per resource), the headline **tonnes/annum** efficiency, total gathered, refuels, stops worked, and the span it's measured over. Purely derived (no stored state), so it climbs as you play and reads correctly at any scrubbed moment.

## v2.0.223-beta - 24th Jun 2026

* **Fuel over time** — the Ship's Log now shows a live "Fuel: X%" (red when ≤15%) that drains as the ship burns and climbs as it refuels, derived for free like cargo. It uses the real per-segment burn fuel, so a torch ship's tanks fall smoothly while a burn-coast-burn spends ~half on the injection burn, coasts flat, then ~half on capture — no hard-coded split needed. Refuels restore toward full (instant at a port, ramped across a frontier harvest). Especially handy for abandoned ships: the fuel they're stranded with is just the curve read at the moment they were cut loose.

## v2.0.222-beta - 24th Jun 2026

* Refuelling now distinguishes a port from the frontier. A port/depot tops the tanks up **instantly**, but harvesting fuel out in the black (gas-skimming, mining fuel-grade ice) fills at a **rate over the harvest dwell** — the refuel breadcrumb reads "Refuelled (ice) at Enceladus over 18 days" vs an instant "Refuelled at Ceres Station". This is the same continuous-over-time treatment cargo got, and the groundwork for the fuel-level curve.

## v2.0.221-beta - 24th Jun 2026

* Autopilot cargo is now a real, continuous quantity over time:
  * **Ramps instead of stepping** — cargo fills gradually across the mining/loading dwell and empties across the unload, so the "Cargo aboard" read-out climbs and falls smoothly as you scrub/play (it's derived, so it costs nothing between events).
  * **Capacity-aware** — a load or mine never overfills the hold, and an unload never delivers more than is aboard. The logged tonnage is the *actual* amount moved.
  * **A full ship mines nothing** — start the route already loaded and the mine moves 0 t, with **no idle time wasted at the source** (the dwell is sized to what's actually loaded ÷ rate × richness) — it just carries on to deliver. Starting cargo comes from the ship's current cargo.

## v2.0.220-beta - 24th Jun 2026

* Fixed two time-datum bugs (see docs/time-architecture.md):
  * **Routes & journeys panel showed dates ~13.8 billion years off** (e.g. "-13787286102 AD · 5035701601582d ago"). The in-system journey rows fed unix-seconds into the date formatter, which expects master/since-Big-Bang seconds (the interstellar unit). Now converted with `unixMsToMasterSeconds`, like the Ship's Log already does.
  * **Clear Future Plans / Cancel Active always showed (0)** so you could never delete a ship's planned journeys. `getActualTimeMs()` returned master-milliseconds instead of unix-ms (it skipped the Big-Bang→unix offset), so actual time read as ~13.8 billion years in the future and every journey counted as "already past". Fixed to unix-ms — which also corrects the autopilot past-trim cutoff and the arrival reconcile, both of which use it.

## v2.0.219-beta - 24th Jun 2026

* Autopilot can no longer silently sit there "flying its route" while going nowhere. On Engage, if the planner produces no journeys for *any* reason — including the cases that previously slipped through silently (generation returned null because of missing engine/fuel data or ship specs, or the planner threw) — the Engage banner now always turns red with a reason. Engaging now either flies, or tells you why it can't.

## v2.0.218-beta - 24th Jun 2026

* Autopilot replanning now fires once per leg-completion, not every frame. The top-up only re-solves when a ship's committed lookahead has *freshly* dropped below Planning (a leg was just consumed) — and a ship that can't be topped up (e.g. stuck on fuel) records that level and stops re-solving the same shortfall every frame. Between leg-completions nothing changes, so there's zero solving. A manual edit (refuel / route change) clears the mark so the ship gets a fresh attempt. (This was the real cause of the solver churn during playback.)

## v2.0.217-beta - 24th Jun 2026

* Killed the transit-solver console spam. The planner logged a `[TransitPlanner] Debug:` line on every single solve — and the autopilot lookahead fires hundreds of (cheap) solves per route generation, so playing time flooded the console with thousands of lines and dragged playback (console logging is slow). All per-solve traces are now behind a `DEBUG_TRANSIT` flag, off by default. No behaviour change; the genuine "corrupted orbit" warning is kept.

## v2.0.216-beta - 24th Jun 2026

* When autopilot can't plot a course, the Autopilot tab now says **why** instead of just silently sitting there. The Engage banner turns red ("Autopilot stuck") and shows the reason — "not enough fuel to reach Enceladus", "no resolvable stops — check the resource or place exists and is reachable", "no host to depart from", etc. Cleared automatically once it plots successfully. (No more needing the browser console to find out why a ship won't move.)

## v2.0.215-beta - 23rd Jun 2026

* The flight-log **history is now kept forever** (it's tiny) — only the heavy journey/path data is bounded. A repeat ship retains just its last 2 flown legs of committed journeys (plus active + future), so the orrery and journey list stay clean, while the Ship's Log flight-log keeps the full breadcrumb history.
* **Planning now means what it says.** The slider commits exactly N legs ahead of the display clock (was: at least one full circuit, then padded to ~120 days). The top-up keeps N legs committed ahead as the clock advances — so "look 4 ahead" plans 4 legs, not 7. Run-once routes still commit their whole length.

## v2.0.214-beta - 23rd Jun 2026

* Autopilot routes no longer accumulate forever. A repeat ship tops up its committed route as the clock advances, but never trimmed the flown past — so after a long run the ship's log grew to dozens of legs and the orrery filled with a spider-web of stale paths (especially obvious after scrubbing back to the start). Now the flown past of a repeat route is trimmed: completed autopilot legs that ended more than ~30 days behind actual time are dropped, along with their flight-log events. The active and future legs are untouched (the advance-planning never needs recalculating), manual journeys and adrift ships are never auto-trimmed, and it's keyed to actual time so scrubbing the display never deletes anything. The dropped past is deterministically regenerable.

## v2.0.213-beta - 23rd Jun 2026

* Routes & journeys: autopilot-flown journeys no longer clutter the "In-system journeys" list — that's now just manual/player routes. Each ship's autopilot legs live under the "Under autopilot" heading instead, tucked into a collapsible "N planned legs" section per ship (a long committed route stays out of the way until you expand it). Each leg is still clickable to jump to the ship.

## v2.0.212-beta - 23rd Jun 2026

* The **"Any · as needed"** route mode now flies. Instead of visiting every stop in some order, the ship greedily heads to whichever single stop is best right now (nearest/cheapest per the Drive setting), works it, then re-picks from its new position — with a freshness bias so a just-serviced stop is unlikely to win twice running and the others still get covered over time. It costs candidates with the same quote-backed solver the legs are committed with, and respects the max-time-per-leg cap. (Place-targeted routes for now, like best-order.)

## v2.0.211-beta - 23rd Jun 2026

* Mining dwell now reflects how rich the deposit is: time at a source = tonnes ÷ (the ship's fill rate × the source's abundance), so a fat 0.9-richness ice moon fills far faster than a lean 0.3 one. The chosen source's richness rides on the stop, and the dwell is finalised once the haul amount is known.
* **Tardiness** finally does something. The Discipline slider (or the inherited Owner-CoI value — military punctual … owner-operator sloppy) adds slack to the time a ship sits *stopped* (loading, mining, loitering) — never to transit, and never to a flyby (it doesn't stop, so it can't be late). The slack is deterministic (seeded from the ship's id + the stop time), so a given timeline replays identically every scrub. "Bob's trading run" now genuinely runs late.

## v2.0.210-beta - 23rd Jun 2026

* Autopilot ships now keep a **flight log**. As the planner commits a route it records the work that happens at the stops — loaded/unloaded/mined tonnages, refuelling, station-keeping — as timestamped breadcrumbs (e.g. "Loaded 120 t water-ice at Enceladus"), shown in the Ship's Log beneath the journeys with a click-to-jump clock on each. Cargo aboard is now shown live and is *derived* from that log (running sum of loads/mines minus unloads at the display time), so it scrubs with the clock and a route regen can't desync it. The log is pruned in step when future plans are cleared or a journey is cancelled. (Foundation for the Totals tab + cargo-precedence reordering.)

## v2.0.209-beta - 23rd Jun 2026

* Autopilot lookahead now has a `quote` tier in the transfer solver — the lightest cost estimate, for the reorder/planning search that runs many times per decision. It produces only the two families the search ranks fast-vs-thrifty on (Hohmann-family "Efficient Now" and torch "Direct Burn") and skips the expensive Most-Efficient delayed-launch-window sweep (~100 Lambert solves), the gravity-assist candidate search, and the display path. Result: ~140x faster per leg (~0.14 ms vs ~19.5 ms). Both quoted families are the *same* real solver outputs the full call commits with — a test pins the quoted torch leg's time/Δv to the full Direct Burn and checks the quoted efficiency leg is never cheaper than the real window-search optimum — so a quoted ordering can never disagree with the leg it actually flies. (Hohmann transfers were and remain a first-class option; this just makes costing them in bulk affordable.)

## v2.0.208-beta - 23rd Jun 2026

* Autopilot reorder is now cheap to run. The transfer solver gained a `costOnly` mode that computes a leg's time and Δv (the only things the reorder search needs) while skipping the dense display trajectory — direct/torch legs drop from hundreds of path points to ~24, gravity-assist legs from ~1900 to ~80. The committed legs still fly the full trajectory; a test pins the costOnly time/Δv to the full-plan values so the search can never disagree with what it commits.

## v2.0.207-beta - 19th Jun 2026

* Autopilot "All · best order" now actually reorders the route. The planner looks a few stops ahead (how many is set by the Planning slider) and picks the visiting order with the lowest total cost — time when Drive is fast, fuel when it's thrifty — honouring the max-time-per-leg cap. Crucially, it costs candidate orders with the *same* transfer solver that flies the legs (cached), so the order it chooses and the journeys it commits can never disagree. "Closest now vs later" falls out naturally as bodies move. (Place-targeted routes for now; resource/escort legs stay in listed order.)

## v2.0.206-beta - 19th Jun 2026

* Build fix: the black-hole accretion code (v2.0.204) used legacy `$:`/`let` reactivity inside a runes-mode component, which the dev server tolerated but the production build rejected — so v2.0.204 onward weren't deploying. Converted to `$derived`/`$state`. No behaviour change; the slider works as before.

## v2.0.205-beta - 19th Jun 2026

* Autopilot ships now keep flying as you scrub or play. A looping route extends itself ahead of the display clock (the view you're actually watching), so it never runs out of plan mid-circuit — and it only ever adds future legs, so rewinding is safe. A "run once" route shows "route complete · standing by" (green) once the display clock reaches its end, and the ship actually disengages for good once master/actual time catches up — using actual time purely as the backstop, the way you described it.

## v2.0.204-beta - 19th Jun 2026

* Black holes get a "material infall" accretion slider instead of a feeding on/off switch — and everything else is now derived from it by physics. Slide from a bare quiescent horizon (dark, ~0 K, no field) up to the Eddington limit, and the disc's luminosity, inner-edge temperature (Stefan–Boltzmann from the accretion rate), magnetic field, and radiation all follow, with the output hard-capped at Eddington. This fixes two bugs: a quiescent black hole no longer shows a bogus 1,000,000 K surface temperature (it's correctly dark/cold), and a feeding black hole now shines realistically (~10²–10⁵ L☉ for a stellar-mass accretor) instead of near-zero.

## v2.0.203-beta - 19th Jun 2026

* Autopilot Mine and Explore legs now fly. Instead of a fixed place, the ship finds the best body for the job — scoring sources by richness, closeness, and whether it can also refuel there (so a moon that yields ore and fuel wins over one that's just ore). Only natural bodies are ever mined (never another ship), and mining heads on to its deliver-to drop-off. So a "mine water-ice → deliver to Ceres" plan now actually picks a Saturn moon and hauls.

## v2.0.202-beta - 18th Jun 2026

* Autopilot status is now real, not just "needs setup". A ship under autopilot shows a live read-out on its panel — transiting, holding between legs, coasting, or stuck — and a ship that's engaged but couldn't plan a route (can't reach or fuel its next stop) now correctly flags red and sorts to the top of Routes, lighting the rail's notification dot. So the fleet view reflects what's actually happening.

## v2.0.201-beta - 18th Jun 2026

* Unified the autopilot symbol — the gently pulsing ship icon now comes from one shared component, so it's identical everywhere it appears: the Engage button, the locked "Under autopilot" button, the ship's-log badge, and the Routes "Under autopilot" heading.

## v2.0.200-beta - 18th Jun 2026

* The "Under autopilot" button on a ship is now clickable and opens the disengage dialog — so you can hand control back from the ship's panel, not just the Autopilot tab.
* Engage is disabled until the route has at least one stop; tapping it empty highlights the "+ add stop" button and says so, rather than engaging an empty plan. Dropped the now-redundant "build the route below" caption.
* Autopilot is represented everywhere by a gently pulsing ship icon (the little "Asteroids" ship) instead of a cog — on the Engage button, the locked button, and the ship's-log badge.

## v2.0.199-beta - 18th Jun 2026

* Turning autopilot off now asks how to stop, instead of just cutting it. A dialog offers, on the usual risk scale: End after this leg (green — finish the current hop and dock), Abandon · drift (orange — cut now, coast on momentum), Abandon · stop (red — cut now, kill velocity), and Cancel (keep flying). Drift/stop only appear when the ship's actually under way. Colours are accents on a dark dialog — clear, not alarming.

## v2.0.198-beta - 18th Jun 2026

* Autopilot visibility pass: the locked "Under autopilot" button on a ship now shows as a black-and-yellow hazard stripe (white text) so it's obvious at a glance the ship is flying itself. In Routes, ships that need attention sort to the top of "Under autopilot" (red = stuck, orange = needs setup, green = finished), so you can scan the whole fleet fast. And the Routes button on the side rail gains a coloured notification dot showing the worst current state across the fleet.

## v2.0.197-beta - 18th Jun 2026

* Autopilot-planned journeys are now badged "⚙ autopilot" in the ship's log, so you can tell self-flown legs from hand-planned ones at a glance. (Existing autopilot journeys gain the badge once regenerated — toggle Engage off/on.)

## v2.0.196-beta - 18th Jun 2026

* The autopilot Engage control is now a proper toggle instead of a tiny corner tickbox — a full-width button with a navigation icon, a clear "Engage autopilot" / "Autopilot engaged" label, and an ON/OFF pill, lighting up in the accent colour (with a gentle pulse) when engaged. Much harder to miss, and obvious whether a ship is flying itself.

## v2.0.195-beta - 18th Jun 2026

* Fixed: engaging autopilot did nothing — the construct editor's updates run through a different handler than the one that generated the journey chain, so the trigger never fired. Engaging an in-order patrol/transport ship now actually plans and flies its route. (If a ship was already engaged before this fix, toggle Engage off and on to kick it.)

## v2.0.194-beta - 18th Jun 2026

* Autopilot ships now actually fly (first cut). Engage a construct whose plan visits places in order — Patrol (loiter) and Transport (load → deliver) — and it generates the journey chain from where it is now and follows it, looping or running once. It honours Drive (fast vs thrifty), the Max-accel cap and Max-time-per-leg, and uses the harvest/depot fuel rules (a ship that can refuel where it loads will). Still to come: resource-seeking legs (Mine/Explore), live status read-out + auto-disengage, and rolling the route forward as the clock advances — right now it commits a full circuit when you engage.

## v2.0.193-beta - 18th Jun 2026

* A ship's info panel now shows "Refuels from" under Fuel Mass — the resources and refuelling contexts its fuels can be sourced from (e.g. Water ice · Gas-giant refuelling). It makes the connection obvious: a body carrying any of these is a valid top-up, and it's exactly what the autopilot's harvest-refuel will key on, so you can tell at a glance where a ship can self-fuel.

## v2.0.192-beta - 18th Jun 2026

* Groundwork (no visible change yet): the autopilot planner can now score which source to send a ship to — richer + closer wins, with a nudge toward a body that *also* refuels the ship for free (so when mining and refuelling could be the same stop, the ship prefers it and skips a detour). The nudge is small normally and much stronger when the ship is actually low on fuel. Pure + unit-tested.

## v2.0.191-beta - 18th Jun 2026

* Groundwork (no visible change yet): the autopilot planner's deterministic core — it walks a captured plan's legs in order, chains the journeys with dwell, loops or runs once, commits as far ahead as the Planning slider says, and flags a ship "stuck" if it can't reach or fuel the next hop (refuelling for free where it harvests a compatible resource). Pure + unit-tested; the wiring to actually fly ships comes next.

## v2.0.190-beta - 18th Jun 2026

* The Newton panel's classification now lets you click any candidate type to see *its* reasoning, not just the winner's. Each band shows the body's value against the type's range with a colour-coded fit bar (green = solid, amber = marginal, red = barely inside), so you can see exactly how the winning score was earned — and why a runner-up fell short. Clicking a candidate inspects it; an explicit "Pin … as the type" button commits your choice.

## v2.0.189-beta - 18th Jun 2026

* Interior makeup presets are now labelled "Composition presets" and filtered to the body's mass, so you're only offered mixes that make sense — no "Gas giant" on a moonlet or "Iron-rich" at Jupiter mass. Each preset also has a hover hint, and "Iron" is clearer as "Iron-rich".

## v2.0.188-beta - 18th Jun 2026

* Classification is now transparent and overridable. The Newton ("apple") panel gains a Classification section showing the ranked candidate types with their scores, which one won, and the bands that decided it. When two types score within 10% of each other the call is flagged borderline — the apple icon turns orange with a "!" so you spot it without opening — and you can click any candidate to pin it (e.g. force Earth to "earth-like" instead of "swamp"). A pinned type sticks (the engine won't override it) and the panel still shows what the physics would have called it, with a one-click way to hand it back to auto.

## v2.0.187-beta - 18th Jun 2026

* You can now edit a planet or moon by radius, not just mass. A "Size from: Mass | Radius" toggle on the body's Basics tab picks which you pin — the other is derived through the interior makeup (with gravitational compression). So you can set a mass and watch the radius follow, or set the radius you want and let the mass follow, fine-tuning either with the composition sliders. Gas giants stay mass-driven (their radius is fixed by mass and degeneracy, so radius can't sensibly drive mass); stars and belts/rings are unaffected.

## v2.0.186-beta - 18th Jun 2026

* New System wizard: after clicking the HR diagram you can now hand-type each star's Temperature, Luminosity and Mass to dial in a specific star. Figures that don't make physical sense turn red, and a Fix button recomputes the rest (and the star type) to be consistent — trusting the temperature/luminosity you set, or solving a main-sequence star for the mass if that's all you changed. A genuinely impossible star is just labelled "Exotic" rather than blocked — if you want it, you can have it.

## v2.0.185-beta - 18th Jun 2026

* The AI description writer now understands ships properly. Constructs were silently sending the LLM none of their details (a placeholder key mismatch) — now they pass real hull specs (dimensions, mass, crew, cargo, engines) plus all their tags (owner, purpose, hull class, drive, resources…), and no longer feed the retired free-text "class". Bodies already passed their tags; hull-class tags now flow through too. So generated ship descriptions can actually draw on what the ship is and does.

## v2.0.184-beta - 18th Jun 2026

* Scrubbed the retired construct "Class" from the printed report and the players' Field Guide, and made both show a ship's tags instead. The report's ship entries now list their tags (owner, purpose, hull class, resources…) the way body entries already do, and the Field Guide no longer prints the old "Expanse/Ship/Transport" line. Bodies keep their scientific classification (planet/ocean, spectral type) — that's not the retired field.

## v2.0.183-beta - 18th Jun 2026

* Removed the leftover read-only "Class" line (e.g. "Expanse/Ship/Transport") from the ship spec block — the editor box for it went a couple of versions ago, and a ship's class is described by its tags now.

## v2.0.182-beta - 18th Jun 2026

* Fixed the construct/body detail panel always showing a stray horizontal scrollbar and feeling a touch too narrow. The panel scrolled vertically, which quietly enabled horizontal scrolling too, so anything a few pixels wide (the scrollbar itself, a full-width input) tripped it. Horizontal overflow is now clipped, the same fix the left rail already had.

## v2.0.181-beta - 18th Jun 2026

* Fixed "+ add stop" doing nothing (and throwing) on autopilot plans created before the recent rework — the tab now repairs an older/partial autopilot object on open instead of choking on its missing route list.
* Max accel is now a slider up to the ship's best (empty-tank) acceleration, with the readout turning amber above 2 g and red above 10 g — the standard comfort/hazard limits for a human crew. Slide it to the top for full thrust.

## v2.0.180-beta - 18th Jun 2026

* The ship stat block now shows the acceleration range — e.g. "2.10 g (2.1–15.0 g full→empty)" — right next to Max Vacuum Accel, so the fuelled-vs-empty difference is always visible, not just in the autopilot tab.
* Retired the old free-text "Class" box from the construct editor. A ship's class is described by its Hull-class tag (and the other capability tags) now, picked from the tag/pill selector — the legacy box is redundant.

## v2.0.179-beta - 18th Jun 2026

* The autopilot Max accel control now shows the ship's real acceleration range — e.g. "2.1 g fully fuelled to 15.0 g empty" — so it's obvious why a high-thrust hull crawls with full tanks (all that fuel mass). Makes setting a sensible cap, or matching a slow escort, much clearer.

## v2.0.178-beta - 18th Jun 2026

* Autopilot Behaviour gains a Max accel cap (in g, blank = full thrust). Hold the ship below its engines' limit for a comfortable, economical ride — or cap a lead ship's acceleration so slower escorts don't get left behind. The Drive slider still chooses speed-vs-fuel within whatever ceiling you set.

## v2.0.177-beta - 18th Jun 2026

* Autopilot gains a Repeat-forever / Run-once choice. Run-once flies the route a single time, then finishes — it'll flag the ship green and switch autopilot off (a courier drop, a one-way relocation, a final decommission run). The "Under autopilot" marker in Routes is now colour-coded: red = stuck, orange = needs your input, green = finished.
* New Escort action — shadow another ship at a standoff distance you set in km (sit in close formation, or trail outside its sensor range as a covert tail or stand-off support vessel). It's the first action that follows a moving target rather than a fixed place. Captured for now; the trajectory-matching flight is still being built.

## v2.0.176-beta - 18th Jun 2026

* Autopilot Flyby is no longer a separate action — it's simply a Patrol or Explore leg with the loiter time set to 0. The ship doesn't stop, keeps its speed, and races past, so a patrol can be a fast sweep when you don't want it sitting around. The wizard hints this under the loiter field and the Routes summary shows it as a flyby. (The clever momentum-carrying, slingshot-when-going-the-other-way flight is still being built.)
* Clarified what Discipline does: it adds random slack to time the ship spends stopped (loading, loitering, docking), scaled by the slider — it doesn't touch transit time, and has no effect on a non-stop flyby.

## v2.0.175-beta - 18th Jun 2026

* Autopilot Explore now shows a "don't revisit logged places" switch (on by default), so you can let an explorer sweep the same rich sources again instead of always pushing into new territory.

## v2.0.174-beta - 18th Jun 2026

* Autopilot gains a fifth action, Flyby — race past a location without stopping, keeping speed for the fastest, most efficient run. For now it's captured in the wizard (pick a place to fly past) and shown in the Routes summary; the clever part — flying that keeps momentum leg-to-leg and slingshots when the next stop is the other way, rather than coming to a stop each time — is noted as still being built and banked for later.

## v2.0.173-beta - 18th Jun 2026

* Autopilot Explore gains a survey/loiter time and an optional resource target — it heads to new sources (skipping places already in its log) and dwells to scan/survey, the mirror of Patrol. The four actions now line up as two behaviour pairs: Mine/Transport gather and deliver (resource- vs place-driven), Patrol/Explore go-and-dwell (place- vs resource-driven). Under the hood that's modelled as one "don't revisit" flag (on for Explore for now, not yet shown) so the same machinery can later surface as a switch on any leg.

## v2.0.172-beta - 18th Jun 2026

* Autopilot wizard, big simplify + clarity pass. Actions cut to four distinct verbs: **Mine** (a resource only — go to the nearest source), **Transport** (a place AND cargo/people — pick up what from where, deliver onward), **Patrol** (loiter and sweep an area for a set number of days — absorbs the old Scan), and **Explore** (keep pushing outward, refuelling as able). Dock and Unload are gone — they're inferred from the deliver-to. Each stop is now a strongly-bordered "Leg" card with a Leg number and a drag handle so you can reorder the route, and there's a new **Avoid** section to list locations the ship won't visit or replenish at (e.g. politically unaligned). "Max journey time" is relabelled **Max time per leg** and now clearly means the whole leg — travel out, do the work, and return. The "+ add location" button is now "+ add stop".

## v2.0.171-beta - 18th Jun 2026

* Autopilot wizard tweaks: a resource location now takes several resources at once (go to the nearest source of any of them), the mine/load "fill" defaults to the ship's free cargo space, and Logistics is simplified — the auto-refuel/restock toggles (Planning already schedules those) are now "Ignore fuel" / "Ignore life support" switches for ships you don't want to model fuel or supplies on.

## v2.0.170-beta - 18th Jun 2026

* A ship under autopilot can't be flown by hand. While autopilot is engaged, the manual Plan Transit / Cancel controls are replaced by a greyed-out "Under autopilot" button — turn autopilot off (Autopilot tab) to take manual control back.

## v2.0.169-beta - 18th Jun 2026

* Autopilot — first cut (the wizard). A construct now has an Autopilot tab (after Tags) that builds a plan in three parts: Route (visit all in order / all best order / any as needed, with locations that are a specific place OR "the nearest source of resource X", a per-location action suggested from the ship's own capabilities — Mine/Scan/Load/Unload/Dock/Patrol — and a deliver-to for mined/loaded cargo, with the fill rate shown); Behaviour (Discipline, Planning, Drive and Max-journey-time sliders — Planning is the look-ahead that also schedules refuelling and waits for alignments when it pays off, Max-journey-time stops absurd zero-fuel crawls); and Logistics (auto-refuel with a fuel margin, auto-restock — uncheck to manage by hand). It's capture-only for now — it saves the plan and lists the ship under a new "Under autopilot" group in Routes (with a "!" when it needs attention); the planner that actually flies it is the next step.

## v2.0.169-beta - 17th Jun 2026

* Fixed: a rescued ship lingered under Routes → "Stranded ships" even after a new journey had taken it home and parked it (e.g. the Rocinante safely in Uranus low orbit still showed "adrift, coasting · was bound Uranus"). The stranded list flagged any ship carrying a cancelled-drift journey without checking whether a later journey had since superseded it — the same supersession blind spot fixed earlier in the orrery position and drift-line. It now only lists a ship as stranded if no later journey has started since the drift began.

## v2.0.168-beta - 17th Jun 2026

* A body's resource tag now tells you where it came from. Hovering it names the exact rule that seeded it and whether it was deterministic (always) or a chance roll — e.g. "Seeded by rule 'resource/oxidizer' — always seeded (deterministic). Edit it in Settings → Reasons to Visit." Makes the reasoning obvious and points you straight at the lever to change it.

## v2.0.167-beta - 17th Jun 2026

* Body resources are now **all PoI rules** — visible and tweakable in Edit Rule, nothing hidden in code. Reverted the separate atmosphere pass from v2.0.166: atmosphere resources (oxidizer from O₂, noble gases, helium-3 from gas giants, hydrocarbons from methane, volatiles from CO₂) are **deterministic rules** (chance 100% — the gas is measurably there, so the resource is). Added a "noble gas in air" rule condition. Ground/subsurface resources stay semi-random prospects, and every seeded tag records which rule produced it.
* Fixed water-ice: it was wrongly capped to frozen worlds (<250 K), so Earth's liquid oceans didn't count. Now **any liquid water or ice deterministically yields water-ice** — water always reads as a water-ice resource.
* Clarified that "auto-seeding optional" is simply a rule's existing **Chance slider + Enable checkbox** (100 % = deterministic, under 100 % = a random roll, disabled = manual-only) — not a new feature. Removed the now-superseded per-gas "Provides resources" editor.

## v2.0.166-beta - 17th Jun 2026

* Body resources reconciled into one model — no more double-adding. Atmosphere-derived resources (noble gases, oxidizer, helium-3, hydrocarbons, water from vapour, volatiles) are now seeded **deterministically** from the gas composition: if the gas is measurably there, the resource is certainly there, and the gas's % rides along as abundance (extraction time). Ground/subsurface resources (metals, fissiles, diamonds, organics…) stay **semi-random prospects** — you have to dig to find out. The old chance-rules that duplicated the atmosphere ones (O₂→oxidizer, giant→helium-3, CH₄-atmosphere→hydrocarbons) were removed, since the deterministic atmosphere pass now owns those. Every derived resource tag also records where it came from (which gas, or which rule), ready for a provenance mouseover.

## v2.0.165-beta - 17th Jun 2026

* The tag-inheritance data is now visible and editable in its editors (Settings → Technology), so it's not hidden in the JSON. Edit Fuel & Drives: each fuel has a "Can be refuelled where" tag editor (pick resource/* and frontier/* sources) plus an Availability setting (common / manufactured / exotic); each engine has a "Provides FTL drive" tag editor. Edit Atmospheres: each gas has a "Provides resources" tag editor (with a note that a body inherits these by composition, the gas % as abundance). Every option list is sourced from the data — the CoI Resources / FTL-drive categories and the PoI frontier rules — nothing hard-coded. New reusable `TagListEditor` (chips + add-dropdown).

## v2.0.164-beta - 17th Jun 2026

* Tag inheritance, body side (groundwork): atmosphere gases now declare which resource(s) they confer — O₂ → oxidizer, Argon/Krypton/Neon → noble gases, Helium → He-3, methane/ethane → hydrocarbons, water vapour → water ice, CO₂/ammonia/nitrogen → volatiles, iron vapour → heavy metals. A pure resolver reads a body's atmosphere and yields its resource tags, carrying each gas's fraction as the tag's abundance (so extraction time scales: trace gas slow, abundant gas fast). Not yet applied to bodies in the live pipeline — that's the next, baseline-checked step.

## v2.0.163-beta - 17th Jun 2026

* Tag inheritance, construct side: a ship's FTL drive is now read from its actual engines, not hand-set. A warp ship shows Warp because it carries an Alcubierre ring; torch/ion/NTR ships show no FTL (sublight). In the Create New Construct picker the inherited drive appears as a dashed "derived" chip, and the FTL Explorer's redundant hand-set Warp tag has been dropped (it comes from the engine now). New resolver functions (`constructDriveTag` / `constructRefuelTags` / `inheritedConstructTags`) also gather a construct's refuel sources from its fuel tanks — the groundwork the autopilot will use to find where each fuel can be replenished.

## v2.0.162-beta - 17th Jun 2026

* Resources, Hull class and FTL drive are now CORE construct categories — always on, can't be switched off, like Status / Owner / Purpose. (And the Resources reason-to-visit category is forced on for bodies too.)
* FTL drive cleaned up to genuine FTL methods only. Sublight is now the default (no selection means sublight), so the `sublight` tag is gone; torch and solar-sail are sublight engines (hard calc data), not FTL, so they're gone too; generation ship is a Hull class, not a drive. Jump Drive is the default FTL.
* Hull class gained Yacht, Racer and Generation ship.
* Added Noble gases + Antimatter resources so every fuel type has a source (antimatter is manual-only — never auto-generated, hand-added to a high-end port).
* Groundwork for tags-from-hardware: fuel definitions now declare where each fuel can be refuelled (a mix of `resource/` and `frontier/` tags) and an availability class (common / manufactured / exotic); engine definitions declare the FTL drive tag they confer (only the warp ring — everything else is sublight). Constructs will inherit drive + fuel-source tags from their actual engines/tanks next.

## v2.0.161-beta - 17th Jun 2026

* Killed the "Active" construct status — it was on everything by default and told you nothing. A construct is now assumed fully operational unless a status says otherwise. Each Status carries a readiness (0–1 drive capability): Derelict / Adrift / Distress / Mothballed / Impounded / Quarantined / Lost / Decommissioned / Refit / Dormant = 0 (can't move), Damaged and Under construction = 0.5 (half drive), and anything unimpaired = 1. A construct's overall readiness is its most-limiting status (lowest wins), exposed via `constructReadiness()` for the upcoming autopilot/drive work.

## v2.0.160-beta - 17th Jun 2026

* Create New Construct now filters exactly like Find by tag. Every enabled CoI category (Owner, Purpose, Resources, Hull class, FTL drive, Tech, Universe, Status) is a clickable bubble — open it to see its tags (with live counts) and click to add them to the filter; multiple tags match as "all of these". Search still spans names and tags together, so "Rocinante" finds the ship and "shipyard" finds the ports, and it composes with the tag filters.

## v2.0.159-beta - 17th Jun 2026

* Create New Construct is now a tag-filter picker instead of a folder tree. Search by name or capability (type "shipyard" and you get the four ports that build ships; "refuel" the refuelling stops), narrow by Universe (Expanse / Traveller / Aliens / …) and role (Ship / Station / …), and every construct shows its CoI tags inline — so a Class A starport reads as its bundle of capabilities at a glance. The old `Universe/Type/Subtype` class-path string (which only drove the folder tree, and was redundant once Universe, Hull class and capabilities became tags) has been dropped from every template.

## v2.0.158-beta - 17th Jun 2026

* Much richer construct vocabulary (CoIs). New Purpose tags fill gaps the first pass exposed — resupply (air/food, vs refuel), forward-base, shipyard, refining, agriculture, power-generation, customs, intelligence, beacon, government — plus a Traveller-style port-capability set (refined/unrefined fuel, shipyard jump-capable vs small-craft, drydock, brokerage, lodging, bonded warehouse, extraterritorial) so a "Class A starport" is now a bundle of capabilities rather than an opaque label. Added Owner: Government + Independent; Hull classes: dropship, pinnace, scout, battleship, colony-ship, platform; Resources: provisions, technology, alien-technology, exotic-matter, luxuries, pharmaceuticals (the finished/exotic tier is construct-only — a planet can't manufacture them); Status: distress, refit, dormant, captured.
* New Universe CoI category (Contemporary / Hard sci-fi / High sci-fi / Expanse / Aliens / Traveller / Mothership / Natural) — every starter template now carries its setting, so "show me every Expanse ship" is a tag filter.
* All starter templates re-tagged with the refined vocabulary: the Donnager is a battleship, the Nauvoo a colony-ship, Ganymede an agriculture/provisions source, Tycho a jump-capable shipyard, the Traveller starports proper capability bundles, and so on.

## v2.0.157-beta - 17th Jun 2026

* Constructs of Interest now cover resources. Added a "Resources" CoI category that deliberately shares the same `resource/` vocabulary as the physics-derived body resources (water ice, heavy metals, helium-3, …), so a body's natural deposit and a ship's cargo of the same thing read as one ledger — provenance stays clear because a construct's resource tag is hand-set, a body's is derived. Hull class, FTL drive and Tech & origin CoI categories are now on by default too.
* The starter construct templates ship pre-tagged with CoIs. Every template (asteroids → motherships → corvettes → starports) now carries a sensible Owner / Purpose / Hull class / FTL drive / Tech / Resources set, so a freshly placed Rocinante already reads as an owner-operated torch-drive corvette and an M-type asteroid already advertises its heavy metals.

## v2.0.156-beta - 17th Jun 2026

* Fixed the star editor snapping mass (and radius/temperature/radiation) back to its stored value as you typed — you couldn't enter or paste a precise figure like 0.9489222894122541 M☉. The sync that seeds those fields from the body was re-running on every render (the body re-resolves as the clock ticks) and overwriting your half-typed value. It now only pulls from the body when you actually switch to a different body; everything you edit in place sticks.

## v2.0.155-beta - 17th Jun 2026

* Fixed: the red coast/drift forecast line lingered after a stranded ship was given a new journey and established orbit — it stayed pinned to the now-parked ship, pointing at its destination. The "is it coasting?" check had the same blind spot the position resolver did: a cancelled drift counted forever once past its cancel time. It now only counts as coasting until the next journey begins, so the line clears the moment the ship is picked up.
* Ship's Log status is now live against the display clock. A journey badge reads PLANNED before it departs, IN TRANSIT mid-flight, then COMPLETED — and for an aborted trip, IN TRANSIT up to the cancel then ADRIFT · COASTING. Scrub the clock with the log open (e.g. rewind to before a transit) and the badge, the "coasting since" line, and the "originally planned route" note all update with it, instead of being frozen on the stored end-state.
* Ship's Log: a journey that set off from a drift now reads "Adrift around Sol (for N days) → Uranus" instead of just "Sol → Uranus", joining the abandoned drift and the rescue journey together at a glance.

## v2.0.154-beta - 17th Jun 2026

* Ship's Log time navigation: every logged time (Created, Window start/end, Depart, Arrive, "coasting since") now has a small clock icon beside it. Hover tells you it'll set the display time to that moment; click jumps the orrery's display clock straight there. The clock only appears on times at or after actual/master time — you can preview the present and future, but it won't offer to rewind display before the committed present (the cutoff you asked for).

## v2.0.153-beta - 17th Jun 2026

* Fixed: a stranded ship that's since been given a NEW journey stayed stuck on "Adrift — coasting" in the orrery even though its log showed the new trip. The kinematics resolver returned the moment it hit the old cancelled-drift journey (journeys are scanned oldest-first), so the later journey never got to take over — the ship's log read right but its drawn position/status didn't. The drift now only governs *until the next journey begins*; once a later journey has started it takes over, as it should. Existing saves heal themselves — just nudge the clock after updating and the ship snaps to its real state.

## v2.0.152-beta - 17th Jun 2026

* Left rail no longer shows a permanent horizontal scrollbar along its bottom. Setting `overflow-y: auto` on the rail quietly promoted `overflow-x` to auto as well, so a nav label a hair wider than the 200px cap left a scrollbar parked there at all times. The rail now clips horizontally and long labels ellipsis within it.

## v2.0.151-beta - 17th Jun 2026

* A drifting ship keeps its name and stays clickable. Free-floating constructs (in transit, deep space, or adrift/coasting) are positioned absolutely rather than by the orbital hierarchy, so the "what's visible at this focus level" set — which gates both the on-canvas label and click hit-testing — was skipping them, even though their glyph was always drawn. We never had unparented objects before drifting was a thing. They're now always nameable and selectable, matching how they're drawn.

## v2.0.150-beta - 17th Jun 2026

* Adrift forecast line now upgrades when you stop. While the clock is moving (playing or scrubbing) it stays the cheap moon-free integration; ~0.3s after the clock goes still it recomputes once as a moon-inclusive plot, so a close moon flyby in the forecast is honest when you're parked but never costs you while dragging. Fast estimate in motion, accurate path at rest. (`coastPathUnderGravity` gained an `includeMoons` flag; the live position stays moon-free for frame-to-frame consistency.)

## v2.0.149-beta - 17th Jun 2026

* The real performance fix for adrift ships. The slow part was never the throttle — it was the **maths per recompute**. Two things were grinding millions of operations on every redraw: (1) the gravity field included **every body in the system, moons and all** (~50 in Sol), and (2) the forecast line re-integrated each segment with ~40 sub-steps. Moons are negligible for a heliocentric coast (the star and the planet you're passing are what matter), so they're dropped from the field, and the faint forecast line now uses one integration step per point. Together that's ~50-100x less work per frame — adrift trajectories now refresh in well under half a second instead of ~6 seconds.
* Ship's Log, adrift entries: the planned-route block is now headed "Originally planned route (aborted)" so it's clear that section is the trip that was cancelled mid-flight, not where the ship is now. The "Ends:" line also names the destination — e.g. "In Low orbit of Uranus" / "Docked at Uranus" / "Fly-past of Uranus" — instead of just "In Low orbit".

## v2.0.148-beta - 17th Jun 2026

* Scrubbing/jogging the clock is much smoother. The orrery was re-deriving every coasting ship's position on every single jog frame; it now throttles that re-derive to ~150ms while you're moving the clock and does one exact pass the moment you settle — fast estimates while dragging, right when you let go.
* Routes panel: added a "Stranded ships" group at the bottom — constructs that are adrift/coasting (not under power, not orbiting), in-system or in interstellar space, with where they are and where they were bound. Click to jump to the ship.

## v2.0.147-beta - 17th Jun 2026

* Big performance fix for drifting ships. The orrery was re-integrating a coasting ship's whole trajectory from its cancel point every single frame — so the longer it had been adrift, the heavier each redraw (the jumpy clock and "orrery barely moves"). It now steps forward incrementally from the previous frame's state, so each frame is cheap and constant regardless of how long the ship's been coasting; the path also stops jittering (each frame extends the last instead of recomputing).
* The drift forecast line reaches a bit further ahead.
* The ship's log now reads "Adrift · coasting" for a cancelled-and-drifting journey, with when and where it was cut loose, rather than a bare "Cancelled".

## v2.0.146-beta - 17th Jun 2026

* Fixed a hard freeze (and a ship "teleporting") when a construct's journey/abort is timestamped far from the current clock — e.g. flights dated years before the active calendar's epoch. The orrery was re-integrating that ship's gravity coast over the whole gap every frame; it now bounds the integration (fixed step count, capped span) and ignores non-finite/out-of-epoch time gaps, so it resolves instantly instead of locking up.

## v2.0.145-beta - 17th Jun 2026

* Transit courses curve again. The planner solves a clean 2-body (Sun-only) transfer but was *drawing* the path re-integrated through the full n-body field; because the target was 2-body, the path drifted off it and a linear correction flattened the conic into a near-straight line. The displayed path now matches the model it solves (2-body), so transfers show their proper conic arcs. (Trade-off: the n-body-derived trajectory-correction tags are quiet until the proper n-body-aware solver lands.)

## v2.0.144-beta - 16th Jun 2026

* Transit fuel sanity: a ship with no usable main engine (zero Isp) no longer shows fabricated fuel figures (the old "Δv × 0.01" / "× 0.05" placeholders that produced things like 0.4 t and 6.5-billion-tonne flybys). Such plans are now correctly infeasible — fuel reads "—" and the planner says the engine can't make the move. No engine, no move.

## v2.0.143-beta - 16th Jun 2026

* Performance: the drifting-ship forecast path is now a solid faint line (a dashed line over a path spanning billions of metres made the canvas grind through countless dash segments), and its trajectory integration is cached per ship+clock so it no longer re-computes every frame while panning or idle.

## v2.0.142-beta - 16th Jun 2026

* A drifting/stopped in-system ship now draws a faint red dashed forecast of its path — the conic it's about to follow under gravity (a slow fall to the star, an ellipse, or a hyperbola escaping), ~40 steps ahead. Handy for sanity-checking its velocity vector.

## v2.0.141-beta - 16th Jun 2026

* Plan Transit from an adrift/stopped in-system ship now replots from where the ship actually is, carrying its current position and velocity — so the redirect-Δv cost of turning its momentum applies, matching the interstellar "Chart a new course". (Previously it replanned from the body, ignoring the drift.)

## v2.0.140-beta - 16th Jun 2026

* A ship stopped/adrift mid in-system flight no longer offers an invalid "Land on <origin>" (it isn't there). Instead it shows Plan Transit (green, plot a fresh course) and Resume journey (orange, re-fly the aborted plan). Landing/takeoff now only show when the ship is actually at a body. Plan Transit is green throughout.

## v2.0.139-beta - 16th Jun 2026

* In-system body/ship header now matches the interstellar ship panel: Edit is a toggle (click the pencil again to close — the "Done" button is gone), it highlights while active, and the sensors icon uses the same waves glyph.

## v2.0.138-beta - 16th Jun 2026

* Fixed: the in-system Cancel · drift/stop buttons now actually abort the journey at the point you're viewing (they were keyed to actual time, so on a previewed flight they did nothing). The ship strands where you see it.
* Ship's Log button restyled to yellow-on-black (captain's-log look) and added to the interstellar ship panel too, for consistency.

## v2.0.137-beta - 16th Jun 2026

* The ship sensors toggle now does something: turning it on draws that construct's sensor-range rings (and labels) around it in the orrery, from its defined sensors. Off by default; the global View → Sensors option still shows the focused ship's ranges too.

## v2.0.136-beta - 16th Jun 2026

* Ship's log: dropped the now-redundant "Leg" framing (each journey is a single hop) — entries lead with the route and add the arrival (differential) speed alongside the end state. Fixed the wildly-wrong arrival/departure year (journey times are unix-epoch; they're now converted to the calendar's master-time correctly).

## v2.0.135-beta - 16th Jun 2026

* The starmap ship panel now shows the full ship data block again (same read-only stat block as in-system), with only the transit controls swapped for the interstellar set. The visibility eye moved to the left and is joined by a sensors on/off toggle (run dark en-route); edit stays behind the pencil.
* Every ship now draws a faint line for its current/upcoming trip in the orrery, not just the one being planned.

## v2.0.134-beta - 16th Jun 2026

* Fixed: an arrived in-system ship no longer shows the Cancel · drift/stop controls (which did nothing) — they now appear only while the ship is actually under way; an arrived/orbiting/adrift ship shows Plan Transit again.
* Scheduling an in-system transit now rewinds Display Time back to the journey's start after the simulation, so no apparent time passes — the ship sits at departure with its faint transit line ahead (Actual time was never touched).

## v2.0.133-beta - 16th Jun 2026

* The construct stat block now reports its actual current state instead of always showing "Orbit / Orbital Period": In transit → destination, Adrift → coasting, Landed → surface of host, Docked → host, and only an orbiting ship shows the orbit profile + period (now labelled with the host). Driven by the ship's live kinematic state at the current clock.

## v2.0.132-beta - 16th Jun 2026

* The starmap ship panel no longer opens straight into the editor — it leads with status and controls; the editor is now behind a pencil icon. Added a player-visibility toggle (eye icon) so a GM can re-reveal a hidden interstellar ship, a fuel gauge at the top (current vs capacity, red when low) and a Refuel button.

## v2.0.131-beta - 16th Jun 2026

* The in-system ship's "Plan Transit" button is now contextual: when the ship is on a journey it's replaced by the Cancel · drift / Cancel · stop controls; when idle it shows Plan Transit. Ship's Log is always available.
* Fixed: a ship adrift in interstellar space no longer shows under its source system in the rail "Find construct…" / "Find body…" directories — it's listed under "Interstellar space" and selecting it opens its ship panel.

## v2.0.130-beta - 16th Jun 2026

* You can now abort an in-system journey straight from the selected ship — no need to dig into the ship's log. Two buttons appear when a ship has a live journey: Cancel · drift (green — coast on under gravity, the physical choice) and Cancel · stop (orange — halt, then fall toward the star). Both clear any future plans too.

## v2.0.129-beta - 16th Jun 2026

* (Transit refactor, stage 4) Retired in-system journey legs. The planner is now single-hop: plan a journey, Schedule it, and to add a stop just plan the next one — the planner re-opens from where the ship's last journey ends (its position + velocity), chaining hops on the timeline rather than bundling them as legs in one journey. Removed the "Add Next Leg"/"Cancel Previous Leg" builder and the draft-plan save.

## v2.0.128-beta - 16th Jun 2026

* (Transit refactor, stage 5) The ship's log now shows how each hop ends — Docked, In <orbit>, or Fly-past (carrying its leftover Δv) — the handoff state the next journey or autopilot picks up.

## v2.0.127-beta - 16th Jun 2026

* (Transit refactor, stage 2) Each in-system hop is now its own single journey on the timeline rather than a leg inside one multi-leg journey object. A multi-stop plan commits as several chained journeys; the ship flies the identical path (the scheduler already chains journeys in time and reconciles to the final arrival), but every hop is now independently log-able and autopilot-sequenceable. Groundwork for retiring the journey-legs machinery.

## v2.0.126-beta - 16th Jun 2026

* Starmap picker now shows Systems and Constructs as consecutive labelled sections (rather than click-to-drill), and the interstellar-ship group is renamed "Constructs".

## v2.0.125-beta - 16th Jun 2026

* Body picker now treats interstellar ships consistently with the orrery: a ship in transit or stranded no longer appears in its origin system's picker (it's left the system), and instead shows up in the starmap-level picker under its own "Interstellar" group — searchable by name, and selecting it opens its ship panel.

## v2.0.124-beta - 16th Jun 2026

* The in-system adrift coast is now full N-body: every massive body pulls on a cut-loose ship (the same perturber set the transit planner already uses), so it can be slung past a planet, not just fall round the sun. Belts and rings are excluded (distributed debris, not point masses), as are barycentres (their mass already lives on the child bodies).

## v2.0.123-beta - 16th Jun 2026

* In-system adrift ships now coast under the star's real gravity instead of drifting in a straight line: cut a ship loose mid-transit and it traces a slow conic section round the sun (a bound ellipse, or a hyperbola if it's above escape) — the same drift engine the interstellar slingshot uses, now in the orrery. (Groundwork toward unifying in-system travel onto the clock-derived model.)

## v2.0.122-beta - 16th Jun 2026

* In-transit / stranded ships (opened from the starmap) now show their tags as chips at the bottom of the panel, matching the in-system construct view and bodies.

## v2.0.121-beta - 16th Jun 2026

* The New Transit redirect now burns real propellant: the Δv to swing a coasting ship onto a new heading is charged as fuel mass (rocket equation) and drained from the tanks on departure, so the lighter ship carries into the next course's Δv. The planner shows how much propellant the turn-around costs. No affordability gate — refuelling stays the GM's manual call.

## v2.0.120-beta - 16th Jun 2026

* New Transit: replot a fresh interstellar course from where a ship currently is (e.g. once it's been refuelled), not from its origin system. The planner now takes the ship's live position and — crucially — its current velocity, charging an honest vector Δv to redirect that momentum: a destination along the current drift is nearly free, a reversal costs the whole speed. The cost (and how far off your drift the new heading is) is shown, and the journey is blocked if the ship hasn't the Δv to redirect.
* Ship-panel actions recoloured by physical honesty: green = the valid choice (Strand · drift; Chart a new course), orange = allowed-but-unphysical (Strand · stop), red = destructive / universe-breaking (Delete trip; resume from a dead stop), neutral = dismiss. Dropped the "jump to destination" option (it skewed the clock).

## v2.0.119-beta - 16th Jun 2026

* The construct tag-adder category dropdown now lists only enabled categories (disabled ones are hidden, not greyed).
* A construct's read-only detail view now shows its tags as chips at the bottom, matching how a body's detail pane does.

## v2.0.118-beta - 16th Jun 2026

* In the construct tag adder, the category dropdown now colours "Custom" and bolds the three core always-on categories (Status, Owner, Purpose) so they stand out from the optional ones.

## v2.0.117-beta - 16th Jun 2026

* The starmap measure tool now tracks a moving ship. Measure to a construct and its endpoint follows the ship as you advance time (re-derived from the clock, like the system view), so the distance stays live instead of freezing at the spot you clicked. Measuring between two stars is unchanged.

## v2.0.116-beta - 16th Jun 2026

* (Stage 3) Interstellar slingshot. A fly-by that can't stop now whips around the destination star instead of tearing straight off the map — an honest closed-form 2-body deflection from the incoming speed, the targeted body's distance from the star (the periapsis), and the star's mass. The drift track kinks at the star, shown from departure so you can see the slingshot coming. It's deliberately honest: a normal star barely bends a fast interstellar ship (so most fly-bys still look near-straight), but a slow craft — or a black hole — bends hard.

## v2.0.115-beta - 16th Jun 2026

* Unified the body (PoI) and construct (CoI) tag adders. Picking a category now shows that category's existing, not-yet-applied tags as click-to-add chips — so you can finally add a defined PoI tag to a body by hand, not only via the auto-rules. Type a custom one below as before. The construct Tags tab now lists only the tags actually on the ship (click to remove); you add from the category-first picker. Hand-added tags are always removable and never stripped by the auto-tagging pass.

## v2.0.114-beta - 16th Jun 2026

* The powered journey line is now deep yellow (the planner's yellow) instead of orange, so it reads clearly distinct from the red drift line — yellow = on course, red = drifting.

## v2.0.113-beta - 16th Jun 2026

* (Groundwork, Stage 3) Real-units in-system gravity for a drifting ship — feeds the drift integrator true G in AU, so a stationary ship falls toward its star and a fly-by slings around it (verified: a 1-AU circular orbit comes out at a ~1-year period). The orrery wiring that shows it follows.

## v2.0.112-beta - 16th Jun 2026

* (Groundwork, Stage 3) Added the deterministic drift integrator that will bend a coasting ship's path under gravity — the engine behind the upcoming fly-by slingshot and the in-system "stationary object falls toward the star". No visible change yet; the wiring follows.

## v2.0.111-beta - 16th Jun 2026

* A "Realistic" interstellar journey now actually burns its fuel: starting one drains the propellant the trip uses from the ship's tanks (the whole tank if it can't brake). So a tank-emptying overreach really does leave the ship coasting on empty.

## v2.0.110-beta - 16th Jun 2026

* The journey line now shows where a ship will end up adrift: the powered leg is orange, and the drift it can't avoid is red, projected on across the map — visible from the moment it sets off, so an under-fuelled trip reads as "orange to here, then red off into the dark".
* A construct's Tags tab gained an "Add a tag" form matching the body/PoI one (pick a category or Custom → name → live preview). Adding under a category persists it there, so it shows in the CoI editor and everywhere else.

## v2.0.109-beta - 16th Jun 2026

* You can now send a ship to the rescue: when planning an interstellar journey, the destination can be "An interstellar ship" — pick a stranded (or in-flight) vessel and the planner plots a course to it, reading the distance and feasibility just like a system trip. Arriving rendezvouses at the ship's location. (For a still-moving target you're aimed at where it is now; matching a moving ship is a later refinement.)

## v2.0.108-beta - 16th Jun 2026

* (Groundwork) Interstellar journeys can now target a point in space, not just a star system — the foundation for plotting a course to a stranded ship. Arriving at a point rendezvouses there. The destination picker for this follows next.

## v2.0.107-beta - 16th Jun 2026

* Moved the starmap measure tool onto the side rail (the same "Measure" slot as the in-system one), instead of a separate on-canvas button.

## v2.0.106-beta - 16th Jun 2026

* Measure tool on the scaled starmap: a 📏 toggle (top-right) lets you tap any two targets — stars or interstellar ships — to read the straight-line distance between them in the map's units. Tap a third to start a new measurement.

## v2.0.105-beta - 16th Jun 2026

* The three core Construct-of-Interest categories (Status, Owner, Purpose) are now properly locked: their name and their "one only" setting can't be changed (Owner stays single-choice, Status/Purpose stay multi), since autopilot relies on them. You can still add your own categories and add tags within these.
* Every construct now carries an "Active" status by default (legacy ships included), and "In transit" is split into "In transit (interstellar)" and "In transit (in-system)", both set automatically from what the ship is actually doing.
* CoI editor tags are more compact (uniform small pills).

## v2.0.104-beta - 16th Jun 2026

* Fixed: sending a ship home / cancelling an interstellar journey now actually removes it — it no longer lingers in Routes still ticking along. If the vessel has later journeys that depended on it, you're warned (with the list) and they're removed too, since the chain can't skip a leg.
* Fixed: an interstellar ship now correctly disappears from its origin system's orrery while in transit. (The hide was being evaluated in the wrong time epoch, so it never triggered.) It's display-time driven, so scrubbing back before departure brings it back.

## v2.0.103-beta - 16th Jun 2026

* A coasting fly-by (a ship that couldn't brake) now projects its dashed heading line right across the map, so you can see it tearing off and out of the edge rather than just a short stub.

## v2.0.102-beta - 16th Jun 2026

* A "Realistic" interstellar plan that reaches the destination but can't brake now plays out properly: starting it ("Start (fly-by — won't stop)") sends the ship to the destination and then coasts it on *past*, adrift with its velocity — instead of magically stopping. Forcing "At destination" on its ship panel still lets you park it there if you want.

## v2.0.101-beta - 16th Jun 2026

* Fixed: deleting one half of a binary now properly dissolves the pair — the surviving planet returns to its original orbit around the star (it used to keep orbiting the leftover, now one-body, barycentre). Same for a binary star: delete one and the survivor becomes the system centre, any circumbinary planets re-home onto it, and the changed central mass re-balances their orbital periods on the next recalculation.
* Aborting an interstellar journey now lets you choose: "Strand · drift" (keeps momentum and coasts on) or "Strand · stop" (stops dead in space).
* The Status tags the app needs — Active, plus the auto "In transit" / "Adrift" — can no longer be deleted in the CoI editor; you can still add as many of your own as you like.

## v2.0.100-beta - 16th Jun 2026

* Constructs of Interest now has three core categories — Status (now at the top), Owner and Purpose — that are always on and can't be removed (autopilot relies on them). You can still freely edit the tags inside them; only Status's "Active" is fixed.
* Status is now multi-select (a ship can be Damaged and still Active) and its "Adrift" / "In transit" tags are set automatically from the ship's actual journey state — so Find by tag (Constructs) can surface, say, every adrift ship for a rescue, without anyone tagging them by hand.

## v2.0.99-beta - 16th Jun 2026

* Aborting a journey now respects the drive. A jump/field drive interrupted just stops dead (stranded, as before). A momentum drive (relativistic, torch, sublight…) keeps coasting in a straight line at its current speed and heading — the dashed line now follows that heading, and it drifts on across the map (off the edge eventually). Fully reversible: scrub the clock and it slides back along its line. (Stage 1 of the adrift-physics plan; gravity-wobble to follow.)

## v2.0.98-beta - 16th Jun 2026

* A ship hidden from players now shows the same crossed-eye reminder on the starmap when it's interstellar (in transit, stranded or just arrived), so you can tell at a glance that the players can't see it.
* Find by tag: the system dropdown and the tag search now sit side by side, taking less vertical space.

## v2.0.97-beta - 16th Jun 2026

* Find by tag now has Bodies and Constructs tabs — search worlds by their physics/PoI tags, or ships & stations by their Constructs-of-Interest tags (Owner, Purpose, Status…). The system filter still works on both.
* Interstellar ships (in transit or stranded) show up in the Constructs tab grouped under "Interstellar" at the bottom of the system dropdown — "All systems" includes them too. Selecting one opens its starmap ship panel (where you can redirect it). So you can, say, search the "ship-repair" Purpose tag to find the nearest repair ship even if it's out crossing the void.

## v2.0.96-beta - 16th Jun 2026

* Fixed: a ship that's interstellar — in transit or stranded — no longer appears inside a system's orrery. It belongs to no system map while it's out there; it shows only at starmap level. The hide follows the clock, so a ship vanishes from its origin as it departs and reappears in its destination on arrival (scrub back and it's en route again).

## v2.0.95-beta - 16th Jun 2026

* New (Settings → System → Danger zone): "Clear all data…" wipes everything this app has stored in the browser — saved starmap, PoI/CoI packs, settings, palette, session — and reloads as a brand-new user, for testing the first-run experience. Double-confirmed.

## v2.0.94-beta - 16th Jun 2026

* Constructs of Interest now have an on/off page (Settings → CoIs), like Points of Interest: tick which categories are available on constructs. Owner, Purpose and Status are on by default; Hull class, FTL drive, Disposition and Tech & origin are off until you want them.
* Save/Load CoI packs — export your category set to a file and load it back (or share it), so you can swap genres. They still travel inside the starmap regardless.
* Turning off or deleting a category no longer loses tags already applied to ships: they stay on the construct shown greyed under "Inactive", with an ✕ to clear them if you want.
* Dropped two default categories: Profile (inferred from the ship's fitted equipment) and Cargo type (set on the construct's Cargo tab).

## v2.0.93-beta - 15th Jun 2026

* Expanded the default Constructs of Interest with more science-fiction range: more Purposes (salvage, rescue-tender, medical, diplomatic, tanker, factory/farm ship, comms relay, defence platform) plus new categories — Hull class (shuttle → dreadnought, station, habitat), FTL drive (sublight, jump, warp, hyperdrive, gate, generation, torch, sail), Status (active, damaged, derelict, mothballed…), Disposition (allied → hostile), Profile (armed, stealth, cloaked, Q-ship, AI/uncrewed, luxury…) and Cargo type (passengers, ore, hazmat, contraband…). All editable under Settings → CoIs; existing maps keep their lists (use Reset to defaults to pick up the new set).

## v2.0.92-beta - 15th Jun 2026

* New: Constructs of Interest (CoIs) — hand-applied tags for ships & stations, on a new "Tags" tab in the construct panel. Two starter sets ship: Owner (Military / Corporation / Consortium / Pirate / Owner-operator — pick one; it carries the ship's tardiness) and Purpose (Patrol, Mining, Courier, Refuel, Cargo-transport, Survey, Colony, HQ and more — pick any). Unlike Points of Interest these are never auto-derived — you choose them. The category and tag lists are editable under Settings → CoIs (add/rename/recolour, set owner tardiness, reset to defaults), and they travel inside the starmap file. This is the groundwork for autopilot.

## v2.0.91-beta - 15th Jun 2026

* The technical-details "Orbit (from …)" line now names the host, not just its type — "Orbit (from Star Sol)", "Orbit (from Planet Jupiter)", or for a barycentre "Orbit (from Pluto-Charon Barycenter — Pluto)".

## v2.0.90-beta - 15th Jun 2026

* When a body orbits a barycentre, the orbit label now names the barycentre AND its primary body, e.g. "Orbits Pluto-Charon Barycenter (Pluto)" — a barycentre is a valid orbital point even though only its primary is selectable.

## v2.0.89-beta - 15th Jun 2026

* Orbit editing now names the actual bodies instead of "partner"/"parent", so you don't lose yourself in a multi-star system. A binary body reads "Separation from {the other star/body}", and a normal orbit shows "Orbits {host}" alongside its range.

## v2.0.88-beta - 15th Jun 2026

* Re-nested the triple-star examples (Alpha Centauri, Algol, Polaris). The third star was a flat extra child of the close pair's barycentre; it now hangs off a proper outer "system barycentre", so the inner pair orbits the system centre and the distant companion orbits it too — and the inner pair now has its own editable "distance from the system centre".
* Made the binary stability checks hierarchy-aware so a nested inner pair isn't wrongly flagged. A tight pair is only flagged as it nears ~a third of its Hill radius (Alpha Cen A/B sit at ~0.15 and are rock-solid), and a distant companion no longer trips the close-neighbour spacing test across a large orbital gap.
* Fixed a binary detection edge case: a non-member companion sharing a pair's barycentre no longer shows the pair's "separation" control.

## v2.0.87-beta - 15th Jun 2026

* Unified binary editing. Barycentres are no longer selectable on their own — clicking one (or a saved/most-massive default) now selects its primary star/body. A body that's half of a binary now edits the whole pair from one panel: a "Distance from {host}" slider that moves the pair through the system, plus a "Separation from partner" slider for how far apart the two sit. For the central (root) pair the distance slider is greyed, since the pair is the system centre. Works the same for stellar and planetary binaries. (Previously you had to select the barycentre to set distance and the body to set separation — two places, inconsistent.)

## v2.0.86-beta - 15th Jun 2026

* Sirius is now a proper binary in the default starmap. It was stored as Sirius B orbiting Sirius A rather than the two sharing a barycentre, so it didn't read as a binary and its eccentricity was being flattened on load. It now has an explicit Sirius A/B barycentre and processes to a stable, correctly-phased pair on a ~51-year eccentric orbit.

## v2.0.85-beta - 15th Jun 2026

* Fixed binary stars drifting onto the same side of their barycentre. The two stars are meant to sit exactly opposite each other at all times, but the pairing offset their phase by half an orbit instead of flipping the orbit's orientation — which only lines up a circular pair. An eccentric pair (like Alpha Centauri) then swung onto the same side away from closest/farthest approach. They now stay diametrically opposite through the whole orbit; opening an affected system re-establishes the correct alignment automatically.

## v2.0.84-beta - 15th Jun 2026

* Fixed binary stars being wrongly flagged unstable. When a wide companion shared the binary's barycentre as a flat third member (e.g. Proxima at 13000 AU around the Alpha Centauri A/B pair), the stability check Hill-compared that distant companion against an individual binary star and flagged the tight 80-year pair as "flung out". The check now treats a barycentre's member stars as the inner binary and skips that meaningless cross-hierarchy comparison.
* Fixed binary stars showing two different orbital periods. Both members of a binary share one period (the pair's mutual orbit), but each was being computed from its own barycentric distance and the combined mass — so Rigil Kentaurus and Toliman read 25 and 60 years. They now correctly share the one period.

## v2.0.83-beta - 15th Jun 2026

* Fixed all stars rendering white after uploading a saved starmap. The import fix-up wipes baked-in derived data so the engine re-derives it cleanly, but the processor never re-classifies a star — its spectral class (star/G, star/M…) is authored input. Clearing it left every star colourless (→ white). Stars now keep their spectral class through import (and recover it from a class-tag in old v1 saves), so they colour correctly on reload.

## v2.0.82-beta - 15th Jun 2026

* Fixed: the "GM (Full Backup)" save (Save System Data dialog) now embeds your custom PoI packs and reasons config, like the rail's Download already does. Previously this "complete data" backup left them out, so restoring it on a fresh browser would have lost your custom packs. Player (redacted) saves still omit them by design.

## v2.0.81-beta - 14th Jun 2026

* Manual zoom is no longer overridden while an object is selected. Previously, playing time with a body selected forced the camera to keep zooming in to frame it; now a wheel/pinch zoom sticks, so you can pull back to a wider view and watch the body orbit at your chosen zoom. Selecting another body, re-clicking to step in, or Reset view re-engages auto-framing.

## v2.0.80-beta - 14th Jun 2026

* Binary pairs can now actually be moved. Editing one half of a binary only ever set the gap between the two bodies, never the pair's place in the system, so a pair could look stuck. The orbit panel for a binary body now has a "Pair distance from star" control that moves the whole pair, with the existing control relabelled "Separation from partner".
* Further hardening against binary pairs stuck at the centre: a barycentre that kept a valid parent but lost its own orbit (so it sat exactly on the star) is now repaired on recalculation, and any body whose parent no longer exists is re-homed to the system's centre body at its real distance instead of collapsing to (0,0).
* Fixed barycentres being left out of the compressed (Toytown) scale layout, so a binary on an eccentric orbit now scales consistently with everything else.

## v2.0.79-beta - 14th Jun 2026

* Fixed binary planets (and other bodies) being dragged to the middle of the system: a "ghost" barycentre left behind by an earlier demote/merge had a dangling parent, which collapses to the centre. These now get cleaned up on recalculation, so the real bodies sit at their proper orbits.
* Fixed binary planets not being selectable or labelled when viewing the system: a barycentre is now a transparent container, so its member bodies are shown/clickable whenever the barycentre is (including nested multi-star hierarchies).

## v2.0.78-beta - 14th Jun 2026

* Find by tag gained a system-scope dropdown at the top: defaults to "All systems" on the starmap (or the system you're in when inside one), and you can switch scope at any time. Tags, counts and results all follow the selected scope.

## v2.0.77-beta - 14th Jun 2026

* Routes panel journeys now show the *when*, not just the route: a date-time plus how far ahead/behind "now" it is — "Departs {date} · in 4d", "Arrived {date} · 2d ago", or, for a flight under way, "40% · departed 3d ago · arrives {date} (in 5d)". Both in-system and interstellar journeys.

## v2.0.76-beta - 14th Jun 2026

* Fixed: clicking an interstellar ship on the starmap now reliably opens its panel (the map's pan gesture was swallowing the click).
* Routes panel: clearer section names — "In-system journeys", "Interstellar journeys", and "Charted interstellar links" (the drawn system-to-system route lines, as opposed to ships actually in flight). Removed an unnecessary horizontal scrollbar.
* Selecting an in-flight ship from the Routes panel now drops you to the starmap first if you were inside a system, so the ship panel opens in the right context.

## v2.0.75-beta - 14th Jun 2026

* The "Routes…" panel's interstellar journeys are now interactive: the **ship**, its **origin** and its **destination** are each a clickable pill — tap the ship to open its panel, or a system to jump there.

## v2.0.74-beta - 14th Jun 2026

* Clicking an interstellar ship (in transit, stranded, or arrived) now opens a full **ship panel** right on the starmap — the construct's complete editor plus its in-flight controls (End at source / destination / Strand here, or Resume / Re-fly), with live status and progress. Replaces the small cancel popup, so you can inspect and edit a ship without diving into a system.

## v2.0.73-beta - 14th Jun 2026

* The interstellar ship marker now uses the construct's own assigned icon (shape + colour) instead of a generic diamond, with a state-coloured outline: black while under way, red when stranded, green when arrived.

## v2.0.72-beta - 14th Jun 2026

* Interstellar ships are now drawn from the journey log: a moving marker in transit, a grey diamond when stranded, a green diamond parked at the destination on arrival. Clicking an in-transit ship now offers End at source / End at destination / **Strand here** (left adrift in interstellar space), and stranded/arrived ships can be re-flown — all reversible, since position is derived from the log + clock (scrub back and the ship is en route again). (Persisting the construct into its new system, the in-system Transit panel, and relaunch-to-a-new-destination follow.)

## v2.0.71-beta - 14th Jun 2026

* (Internal) Groundwork for real interstellar travel: a derive-from-clock placement resolver + journey resolution model (arrive / return / strand) that mirrors the in-system transit pattern (position derived from the clock, persistent state committed only at actual time). No user-facing change yet — the journey UI rides on this next.

## v2.0.70-beta - 14th Jun 2026

* Add-a-tag form: the "Players see" preview now shows the actual friendly label players will see (e.g. "My Depot"), not the raw tag key (e.g. `frontier/my-depot`) — the key is shown as a small hint only when it differs. The name field is relabelled to make clear you're typing what players see.

## v2.0.69-beta - 14th Jun 2026

* Clicking an in-transit interstellar ship on the starmap now opens a ship popup (name, destination, % progress) with an **Open ship…** button that jumps to its construct in its origin system (where the construct still lives mid-flight), plus the existing Cancel-journey option.

## v2.0.68-beta - 14th Jun 2026

* Temporarily hid the yellow build-stamp banner on beta while real users test (still shown in local dev). Easy to re-enable.
* In the orrery, clustered body labels now draw child → parent, so a parent's name sits on top of its satellites' labels — the parent (most likely to be clicked) stays readable in a crowded group.

## v2.0.67-beta - 14th Jun 2026

* The Routes panel now lists interstellar journeys in flight. Previously it only showed in-system journeys and the static interstellar route lines, so a ship actually crossing between systems (animating on the map) didn't appear. New "Interstellar journeys" section shows each flight with its ship, from → to, live status (scheduled / active / completed) and % progress; click to jump to its destination.

## v2.0.66-beta - 14th Jun 2026

* Fixed Find-by-tag results not putting the system you're in first on diagrammatic maps (they fell back to plain A–Z, so e.g. Rigel sorted ahead of the Sol system you had open). Now the current system always leads, then nearest/alphabetical.
* Bumped the service-worker cache version so devices pick up the latest CSS/JS instead of serving a stale cached build (the cause of mobile layouts looking out of date — if a phone still looks old, reload once to let the new worker take over).

## v2.0.65-beta - 14th Jun 2026

* Find-by-tag on phones: the category pills are now much slimmer (tighter line height + padding) and the dialog uses nearly the full screen height, so the categories take a few compact rows and the results list gets the space.

## v2.0.64-beta - 14th Jun 2026

* Toggling a PoI category in Settings → PoI now re-tags the whole map when you leave Settings (close or save), so deselected categories' tags vanish and re-enabled ones reappear — no manual refresh needed.
* New users now start with **Mysteries & hooks** off and the other three categories (Resources, Scientific interest, Frontier logistics) on. Existing users keep their saved choices.

## v2.0.63-beta - 14th Jun 2026

* Mobile polish for the new tag tools. Find-by-tag's category bubbles are now compact pills in a bounded, scrollable browse area so they don't swamp a phone screen, and the results stay visible. The PoI rule-pack editor stacks its pack list above the detail (instead of side-by-side) on narrow screens, with the rule editor and condition rows going full-width and wrapping. The PoI reference page tightens up on mobile too.

## v2.0.62-beta - 14th Jun 2026

* Cleaned ~380 legacy tags out of the bundled example systems/starmap at source, so fresh loads start clean. The runtime legacy-tag check is now a tiny principled rule (anything with capitals/spaces, or a planet/star/belt class-prefix) instead of a hand-maintained list — modern tags are always lowercase-namespaced, and retired atmosphere tags are already handled by the atmosphere model.
* Added a **PoI rule reference** page (linked from the rule editor) documenting every condition operator and every data field — programmatic name, type, range and meaning — generated directly from the engine's field list so it can't drift out of date.

## v2.0.61-beta - 14th Jun 2026

* Starmaps now re-run the full physics + tagging pipeline on load, so a stored or example map picks up the current model (new tags, sharpened PoI rules, ring derivation, legacy-tag cleanup) instead of whatever was baked in when it was saved — no need to edit a body to trigger it. A "Running the physics…" progress bar (one step per star system, with a rotating joke) covers the recalc.

## v2.0.60-beta - 14th Jun 2026

* Legacy "Other" tags cleaned up. V1-era tags that the new engine already replaces — classification stored as tags (planet/ice-giant, Super Earth, White Dwarf…), display-name physics duplicates (Tidally Locked → orbit/tidally-locked, planet/ringed → ring/system, Runaway Greenhouse Effect), and retired atmosphere flavour (voice-changer, noble-gas, haze-former…) — are now stripped on load and on every recalculation. Your own hand-added tags are never touched. In practice this empties the catch-all "Other" group: every tag now sits under a proper category.

## v2.0.59-beta - 14th Jun 2026

* PoI rule builder: every condition row now has a NOT toggle, so you can negate any condition without dropping to raw JSON. (Only deeply nested all-within-any and tag-prefix matches still need raw.)
* Replaced the typed "Custom tag value…" field with a proper "Has tag…" group in the condition dropdown, listing the real tags present across your systems — pick one for a presence check (with NOT it becomes "is absent").

## v2.0.58-beta - 14th Jun 2026

* Find-by-tag rebuilt into a proper filter tool that fits the screen: categories are bubbles you expand to see their tags, clicking a tag adds it to an active filter list (or quick-add via search), and clicking an active filter removes it. Results below show every body carrying all the selected tags, with its system and location. Opened from inside a system on a scaled map, results show inter-system distance and sort nearest-first; otherwise they're alphabetical.

## v2.0.57-beta - 14th Jun 2026

* PoI rules now target body kinds: each rule has an "Applies to" set (star / planet / moon / belt / ring / construct), so a rule only fires on the kinds you choose. The default rules are sharpened accordingly — rocky resources on planets & moons, ore/rare-metals/ice/shattered-core on belts, gas-skimming & helium-3 on giants, and so on.
* The default rules were tightened to use this: belt and giant hooks no longer rely on redundant role checks inside their conditions, and a few were re-scoped (e.g. cold moons can now flag volatiles).
* Settings → System gained an **Advanced** area, and the generation-engine selector lives there again.

## v2.0.56-beta - 14th Jun 2026

* PoI rule builder now handles "any of" conditions, not just "all of" — so rules like Space Opera's spice-world open in the builder instead of falling back to raw JSON. A match-mode toggle (all of / any of) sits above the conditions, and "use builder" now either switches cleanly or explains when a condition is too complex (nested / NOT / hasTag) to show.
* PoI rules can now carry a player-facing name (label) and hover description, editable in the rule editor — so your own tags get the same friendly name + tooltip as the built-in ones (e.g. "Derelict rumour"). The example packs ship with these filled in.

## v2.0.55-beta - 14th Jun 2026

* Settings: the "Generation" section is now "PoI" and the experimental generation-engine selector is gone. It's now a clean checklist of the loaded PoI categories — each with a colour swatch, its rule count, and a tickbox to show/hide it in the current view.
* PoI editor polish: the rules list no longer overlaps its scrollbar and can grow taller; the rule editor is wider with a slimmer operator box (more room for the sliders), and the stray horizontal scrollbar while editing a rule is gone.

## v2.0.54-beta - 14th Jun 2026

* New "Find by tag…" in the rail: every tag across the whole starmap, grouped by category as coloured chips with counts. Click one to list the bodies that carry it (the current system first), then jump straight there — the fast way to find the nearest gas-giant refuelling, heavy-metal world, icy belt, biosignature, and so on.

## v2.0.53-beta - 14th Jun 2026

* The body Tags editor's "Add a tag" is now category-first: pick a category (or Custom for a free-form key), type the tag name, and see the full tag players will see as a live coloured preview. Hand-added tags are marked as yours — they survive the reasons re-tag pass even when filed under an existing category, and always read as removable.
* Belts now get their own reasons-to-visit hooks: icy/Kuiper belts flag "belt ice refuelling", warm rocky-metallic belts flag "asteroid rare metals", and dynamically excited (eccentric) belts flag a "shattered core" — the debris of a disrupted differentiated body.

## v2.0.52-beta - 14th Jun 2026

* Retired the "haze-former" tag — haze is now carried by the atmosphere/apparent-colour model, so the standalone tag was redundant. The rulepack no longer emits it and old saved data is stripped of it on load.

## v2.0.51-beta - 14th Jun 2026

* "Ringed" is now a derived physics tag, not a hand-added one. The old manual "Ringed"/"Rings" tags are stripped on load and re-derived from the geometry — a body that hosts ring children gets `ring/system` ("Ringed"), more than one gets `ring/multiple` ("Multiple rings"), and each ring's debris mass sorts it into a light/medium/heavy tier (distinct tiers surfaced, so a heavy ring beside a faint one reads as both). In Sol that gives Saturn a heavy ring and Jupiter/Uranus/Neptune light ones. Ring tags get their own "Rings" group + colour.

## v2.0.50-beta - 14th Jun 2026

* PoI rule "between" conditions now use a single dual-thumb slider (one track, two handles) with editable low/high numbers at each end — far more intuitive than the old min,max text box.

## v2.0.49-beta - 14th Jun 2026

* PoI category ids may contain spaces — everything keys/splits on the first "/", so a space is purely cosmetic and nothing breaks. Dropped the misleading "No spaces" hint; no forced sanitisation.

## v2.0.48-beta - 14th Jun 2026

* Removed the "Common:" quick-add list from the body Tags editor. Every entry was a physics-derived tag the engine owns and recomputes, so hand-adding one only produced a locked tag you couldn't remove — the custom-tag form remains for your own tags.

## v2.0.47-beta - 14th Jun 2026

* **PoI packs, round 2.** The built-in "Reasons to Visit" pack is now fully editable (with a Reset to restore it). Rules are now built category-first: pick the category (which sets the tag's prefix and colour), then type just the tag name — a live preview shows the real compound tag (e.g. `survey/geochem-sample`). Each category has its own colour pickers (chip + text) that flow through to the tags everywhere. Numeric conditions with known bounds get a slider alongside the hand-editable number, and fraction ranges read as 0.0–1.0. Categories explain id (the prefix in the tag) vs label (the heading players see).
* PoI rules can now trigger on your own custom tag **values** — e.g. a hand-added `danger`=`7` (use ≥/≤) or `faction/control`=`Empire` (use "is").
* PoI pack/rule/category edits now re-tag every system immediately when you close the editor (no more waiting for the next body edit).
* PoI packs now travel inside the `.json` starmap file — download embeds them, upload merges them back in.
* Flat atmosphere tags (corrosive, oxidizer, greenhouse…) are now grouped under Atmosphere in the body Tags list, signalling that the atmosphere data is the lever.

## v2.0.46-beta - 14th Jun 2026

* Removed the redundant lock-icon legend from the Tags editor (the meaning is in each icon's tooltip).

## v2.0.45-beta - 14th Jun 2026

* **Point-of-Interest rule packs.** The "reasons to visit" system is now fully editable: Settings → Generation → **Edit PoI rule packs** lets you manage stacked packs (enable, import, export, new, delete), add/remove categories, and create rules with a guided field → operator → value builder (with a raw-JSON mode for advanced logic). Two example packs ship — **Space Opera** and **Hard Science** — to learn from and build on. Share packs as .json files. Hard-science campaigns can drop the Intrigue category entirely; a Star Wars game can add its own.

## v2.0.44-beta - 14th Jun 2026

* Fixed a bug where your own custom tags could be wiped on recalculation. The body Tags editor now shows which tags are auto-derived (locked 🔒 — from physics or a rule) versus the ones you added (removable), so it's clear what's yours to edit.

## v2.0.43-beta - 14th Jun 2026

* The CRT white-noise now looks like real TV static (animated grain that regenerates each frame) instead of a fixed pixelly image jerking around — still in the terminal colour. The /physics page gained a "Reasons to visit" section and was brought up to date.

## v2.0.42-beta - 13th Jun 2026

* Editing a star's **temperature or radius now recomputes its luminosity** via Stefan-Boltzmann (L ∝ R²T⁴) instead of leaving it locked — a long-standing V1 complaint. (Auto-generated stars were already self-consistent; this fixes the manual editor.) Remnants keep their own radiation setting.

## v2.0.41-beta - 13th Jun 2026

* Monochrome Terminal CRT fixes: **Invert** is now a proper palette swap — the terminal colour becomes the background and the text goes black (green-on-black ↔ black-on-green greenscreen), instead of washing to white. **White noise** is now foreground-colour speckles — green specks on the black screen, black specks on the inverted greenscreen — rather than white static.

## v2.0.40-beta - 13th Jun 2026

* More "reasons to visit": **wilderness refuelling** — gas giants are now flagged as gas-giant refuelling stops (Traveller-style), and water/ice worlds as water/ice refuelling. Oxygen atmospheres add **life-support resupply** and **oxidizer** hooks. The experimental Generation Engine option is tucked to the bottom of the Generation settings and faded — it's not the point right now.

## v2.0.39-beta - 13th Jun 2026

* **"Reasons to visit"** — worlds are now tagged with RPG hooks for why a crew would go there: mineable **resources** (helium-3, deuterium, heavy/rare metals, water ice, hydrocarbons, diamonds, fissiles, asteroid ore…), **scientific** draws (biosignatures, pristine young worlds, tidal labs, rare world types, stellar-remnant proximity…), **frontier** logistics (fuel depots, gas skimming, aerobraking, gravity assists) and **mysteries** (anomalous signals, derelict rumours, legends). Inferred from the physics plus a seeded roll, so each system tags consistently but not everything-everywhere. A new **Generation** settings tab turns the whole thing on/off and toggles each category (default on), and now also holds the Generation Engine choice.

## v2.0.38-beta - 13th Jun 2026

* **CRT controls are now the GM's** — set in the Companion launcher (when the Monochrome skin is chosen), remembered, and pushed to every player's terminal (the GM can crank the noise to make them squint); players no longer have their own CRT panel. Invert is now a clean visual invert to light that keeps the terminal colour (no more green→magenta). White noise and the noise bar take the selected terminal colour. The guide's main content now fills ~the full width to match the headers. Sol_Expanse got the same ring-density + Dione/Tethys fixes as the canonical Sol.

## v2.0.37-beta - 13th Jun 2026

* Legacy duplicate tags (e.g. "Active Volcanism", "Tidally Locked") are now stripped on load — the physics re-derives the correct tags every time. The Local Neighbourhood example's Sol was refreshed: realistic ring densities (Saturn prominent, the other giants faint) and the missing moons Dione and Tethys added (so Enceladus's resonance heating works there). The canonical Sol definition is static/examples/Sol_2030-System.json.

## v2.0.36-beta - 13th Jun 2026

* On The Guide's planet discs, a ring's drawn size now reflects its density — a sparse ring is a thin faint hoop, a dense one (Saturn) a broad bright band.

## v2.0.35-beta - 13th Jun 2026

* **Tunable CRT on the Monochrome Terminal**: a "CRT" button opens a popup of sliders — brightness, contrast, invert, scanlines (intensity + width), vignette, rounded corners, picture skew, a rolling noise bar, white noise and flicker — all live and remembered. Built in the GM's chosen terminal colour.

## v2.0.34-beta - 13th Jun 2026

* **The Guide's planet discs now match the orrery**: a day/night terminator (pronounced on tidally locked worlds) and glowing equatorial volcanoes on tidally active worlds like Io.

## v2.0.33-beta - 13th Jun 2026

* **Day/night terminator and volcanoes are back.** They were silently vanishing when zoomed into a body (a canvas-gradient quirk at extreme zoom); now drawn in screen space — a tidally locked world shows a clear lit/dark divide, and Io shows glowing equatorial volcanoes.
* **Click prefers the parent.** A general click on a planet now selects the planet, not one of its moons or constructs that happens to sit under the cursor; a clearly-separated moon still selects directly.
* **The Guide:** a "back to parent" button when a moon is selected; constructs no longer show a picture; the Survey Datapad photo now fills the full image width letterboxed to the central detail (no longer over-zoomed); and the Starship Console jump list now lists belts and Pluto (the Pluto-Charon barycentre) that were previously missing.

## v2.0.32-beta - 13th Jun 2026

* **The Guide looks the part.** Planet discs now use the same renderer as the orrery, so Earth shows its oceans, land and clouds (not a flat blue ball). Belts render as a grey field of rocks that thickens with density instead of a fake planet. A barycentre is shown as its main body — "Pluto-Charon Barycenter" now reads as "Pluto (Pluto-Charon Barycenter)" with Charon listed as its companion. The Starship Console photo fills the panel width; the Survey Datapad photo is a letterboxed close-up of the central detail. And, naturally, any world called Earth earns a red "Mostly Harmless" stamp.

## v2.0.31-beta - 13th Jun 2026

* **Consistent click-to-zoom.** Clicking an object (or picking it from the browser) now frames it through a defined ladder, the same for stars, planets, moons and constructs: first click centres it with its parent near the edge; each further click steps in — to the object plus all its satellites, then to the object filling about half the screen. Levels that don't apply are skipped, and a barycentre is treated as one object until you click a member. (Back still steps up to the parent for now.)
* **Volcanic worlds** (Io and kin) now show their magma clearly — incandescent hotspots clustered around the equator, visible even on a bright sulfur surface.

## v2.0.30-beta - 13th Jun 2026

* Fixed tidally locked worlds rendering too dark: the night side was nearly black, so a world seen from its night hemisphere looked dark all over. The day side now stays fully lit with a sharp terminator, and the night side is clearly shaded but still readable.

## v2.0.29-beta - 13th Jun 2026

* **Orrery detail.** Tidally volcanic worlds (Io and kin) now show glowing magma patches in true-colour; tidally locked worlds get a pronounced fixed day/night terminator. Ring and belt opacity now follows their density — Saturn's rings read solid while Jupiter/Uranus/Neptune's are faint (as in reality), and denser belts look less transparent. New ringed/belted worlds get a randomised density.

## v2.0.28-beta - 13th Jun 2026

* **Tidal locking is now computed.** Whether a world keeps one face toward its host is derived from the despinning timescale vs the system age (the steep a⁶ law), not hand-set — every regular moon, Mercury and Pluto/Charon lock while the AU-distance planets and gas giants spin free. It shows as a dynamic "tidally locked" tag and re-derives every run; the body editor's checkbox still lets you pin it by hand (with a "Reset to auto" link).

## v2.0.27-beta - 13th Jun 2026

* **Resonance now heats moons.** A mean-motion resonance maintains a moon's eccentricity against tidal damping, so it now feeds the numeric tidal-heat model — Enceladus (pumped by the Dione 2:1) and the Galilean Laplace chain get real tidal heat (Io > Europa > Enceladus), while a coincidentally-eccentric moon (Ganymede, Luna) stays cold. Fixed the Sol dataset: all 19 major moons are now correctly flagged tidally locked.
* **Bad orbit data no longer freezes the orrery.** A negative/NaN semi-major axis (seen in a Kerbol import) used to throw and kill the render loop — a black frozen canvas. Invalid orbit ellipses are now skipped, a draw exception can't stop the loop, the orbit editor clamps the semi-major axis positive, and bad files self-heal on load.
* **Companion app:** The Guide is now the default skin and shows a procedural true-colour planet disc (with rings) matching the orrery's look; the Survey Datapad and Starship Console show artist's-impression photos; the Monochrome Terminal stays text-only.

## v2.0.25-beta - 12th Jun 2026

* **Out of alpha.** Hand-authored, imported and hand-picked worlds are now **end-state**: the engine no longer re-ages them (atmospheric escape was wiping deliberate trace exospheres — Io's SO2, Mercury's Na, Pluto's N2 — and compounding the loss on every load/edit) nor overwrites their authored types (Venus read "desert"). Aging and auto-classification are per-body opt-in switches in the body editor; generator-created worlds opt in and erode idempotently from a stored primordial baseline. The classifier now scores by mean band-fit so catch-all types can't win on barely-true sliver bands (Testion coverage 56/58, audit green). Belt/ring transit destinations park in a circular orbit at the ring's radius on the origin's side — no more Mars-to-belt plans swinging past the sun. Testion demo bodies start scattered around their orbits instead of lined up in a row. /physics documents the new scoring and the end-state model.

## v2.0.24-alpha - 12th Jun 2026

* Resonances and predicted fates surfaced in the UI: labelled tag chips (j:k resonance, Laplace, fates, stability severities), a Resonance row in the body data panel, and a new /physics section + Known-fudges entries documenting the model.

## v2.0.23-alpha - 12th Jun 2026

* **Enceladus and Triton come alive**: Dione + Tethys added to the Sol dataset (the missing 2:1 resonance partners). A resonance that keeps pumping a moon's eccentricity now drives **ice** cryovolcanism at its own ~273 K bar (the ~1000 K silicate threshold no longer gates icy moons) — Enceladus derives cryovolcanic; barely-pumped Ganymede/Dione stay quiet, and heliocentric resonances (Pluto–Neptune 3:2) shape orbits without heating. Very cold ice worlds (<60 K) get Triton-style **solar-seasonal geysers**. Higher-order resonance tagging tightened to kill coincidental near-ratios.

## v2.0.22-alpha - 10th Jun 2026

* **Interstellar transit**: speeds never read "100% c" any more — near light speed the figure floors and shows just enough decimals to reveal the gap (e.g. 99.997% c), since c is only ever approached. The relativistic energy bill is now a human-readable mass-energy equivalent (e.g. "42.9 kilotonnes" rather than "4.29e+4 tonnes"), laddered through familiar units up to Earth/Jupiter masses.

## v2.0.21-alpha - 10th Jun 2026

* **Interstellar transit planner reworked**: the ship is fixed (it's opened from that ship — no picker); the destination is two-fold (pick a star system, then a body within it). **Massless fuel** is now an honest constant-g flip-and-burn — accelerate to a midpoint peak, flip, brake to rest, no cruise. **Realistic & Massless** get a burn-acceleration slider that turns amber past ~2 g and red past ~10 g, warning that crew-survival tech is needed (it never blocks the plan). **Relativistic** gets a finer speed slider that reaches 99.999 % c, plus the kinetic-energy bill to get there expressed as a mass-energy equivalent (kg / tonnes / Earth / Jupiter). New **Start Journey** button (and **Cancel**): the ship then appears on the starmap, travelling along a line between the stars over game time — solid trail behind, dashed ahead — and selecting it lets you cancel and snap back to the start. The three physical models are greyed out on diagrammatic (unscaled) maps; the Jump drive always works.
* **Field Guide**: the view is now **GM-enforced** (set in the launcher, broadcast live; no player picker). Green/Amber merged into one **Monochrome Terminal** with a GM colour choice (Green/Amber/White/Blue/Red). The diagram shows stars + planets only — belts are wide blobs picked from the body list under the diagram; moons and constructs ("On planet" / "Orbiting") appear in the data panel. **The Guide** turned hopelessly colourful — friendly fonts, rainbow lines, a DON'T PANIC cover, and random Guide-note banners. **Starship Console** gains a star/planet jump list (planets unfold their moons/constructs) and adaptive time (the fastest visible orbit runs at ~1 orbit per 2 s). "Open Field Guide" → "Open Local Field Guide Window".
* **New Starmap modal simplified**: rulepack picker dropped; one **Distance/Scaling units** choice — Light Years (ly), Parsecs (pc) or Diagrammatic (not scaled, with a free abstract unit like J8). Settings mirrors the same control.
* **Settings**: "Starmap View" → **Starmap**; new top-level **Time** section (Date & Time + Time & Calendars). Sub-editors return to Settings on close instead of exiting. Spurious horizontal scrollbars on the Starmap & Time tabs removed.
* **Orrery**: a flaring / very active star now glows more intensely, and a feeding black hole gets a hot-orange halo.
* **Time controls**: the transport pill is ~15 % smaller and shorter; minimising now collapses it to a clock icon (no date read-out).
* Planet images get a **More information** pill linking the matching planet-type entry in Pablo Carlos Budassi's classification.
* Scaled starmaps: the distance scale bar moved to the bottom-right (matching the system map); the Description/GM-notes panel sits above it.
* Traveller import no longer forces the numbered hex map — the hex obeys the snap-grid switch, while Traveller scaling/snapping/import keep working underneath.
* Rail: **File** moved down between Measure and Settings; the Settings icon matches the others; the corner brand reads **SSE2**. The add-planet type picker scrolls properly on mobile.

## v2.0.20-alpha - 10th Jun 2026

* **Resonances + smarter stability**: the orbital model now catches mean-motion resonances (2:1, 3:2, …), Laplace chains (Io:Europa:Ganymede 1:2:4), and barycentre pairs (so Pluto–Charon's 3:2 with Neptune is found). Protective resonances spare crossing orbits (Pluto isn't flagged doomed); resonant eccentricity-pumping is flagged as the driver behind moons like Europa/Io. Unstable objects now get a predicted fate — spirals in, flung out, collision, or hierarchy inversion.

## v2.0.19-alpha - 10th Jun 2026

* **Gas giants stop looking identical**: cloud colour is now composition-driven, so the gas-mix sliders actually change the look. Methane (CH₄) absorbs red in proportion to abundance and cold — cyan (Uranus) through deep blue (Neptune); ammonia giants stay warm tan/gold with chromophore stripes (Jupiter browner and spottier than paler Saturn). Ice giants render near-featureless (low contrast, no storm); the Great-Red-Spot oval now only appears on banded ammonia giants.

## v2.0.18-alpha - 10th Jun 2026

* **True colour goes procedural**: bodies render as layered discs — land with ocean patches at the real coverage %, cloud streaks and haze on top, gas-giant latitudinal banding (with chromophore bands and the odd storm oval), incandescent glow on hot worlds. Driven by the physics palette, so editor changes (gas mix, coverage, temperature) visibly change the disc.
* Ring shadows are now parallel-sided (planet-diameter wide, soft penumbra) instead of fanning out from the centre.
* Time pill: minimise is a slim strip on the far right; the minimised state shows a clock icon.

## v2.0.17-alpha - 10th Jun 2026

* **New Starmap modal simplified**: rulepack picker dropped (only one pack exists); one **Distance/Scaling units** choice — Light Years (ly), Parsecs (pc), or Diagrammatic (not scaled) with a free abstract unit + order (e.g. J8 for Jump-8). Settings mirrors the same control. The button now creates Vast Nothingness, as is proper.
* **Settings**: "Starmap View" → **Starmap**; new top-level **Time** section (Date & Time + Time & Calendars). Sub-editors (Time & Calendars, Fuel & Drives, Sensors, Atmospheres, LLM) return to Settings on close instead of exiting.
* **Field Guide**: the view is now **GM-enforced** (set in the launcher, broadcast live; the player picker is gone). Green/Amber merged into one **Monochrome Terminal** with a GM colour choice (Green/Amber/White/Blue/Red). Diagram shows stars + planets only — belts are wide blobs picked from the new body list under the diagram; moons and constructs ("On planet" / "Orbiting") appear in the data panel. **The Guide** got hopelessly colourful: friendly fonts, rainbow lines, a once-per-session DON'T PANIC cover, and random Guide notes as banners. **Starship Console** gains a star/planet jump list (planets unfold moons/constructs) and adaptive time — the fastest visible orbit runs at ~1 orbit per 2 s with a "1 s ≈ X" read-out. "Open Field Guide" → "Open Local Field Guide Window".
* Planet images get a **More information** pill linking the matching planet-type entry in Pablo Carlos Budassi's classification (new tab), for types catalogued there.
* Starmap scale bar (scaled maps) moved to the bottom-right, styled like the system map's; the Description/GM Notes panel defaults above it.
* Mobile: the add-planet type picker scrolls properly and fills the screen; orrery View options use a sliders icon (the eye belongs to player visibility); the rail brand reads **SSE2**.

## v2.0.16-alpha - 10th Jun 2026

* Black-hole editor: radius is now **Event Horizon Radius**, locked to mass (Schwarzschild); mass range to 300 solar masses. Quiescent holes have **zero magnetic field** (no-hair) with the slider disabled; toggling **Feeding** presets a hot disc, near-Eddington output and a ~10⁶ G disc field, with the likely range shown above the slider.

## v2.0.15-alpha - 10th Jun 2026

* **Time controls**: the transport pill is now draggable (grip handle) and minimizable to just a clock — tap to expand; position and state persist. Scale bar moved to the bottom-right (it sat under the time pill).
* **True colour**: liquid shades now come from the host star's light filtered by each liquid's absorption plus a refractive-index specular share — water under a red dwarf reads murky amber, not postcard blue. The disc mixes land/liquid proportionally by coverage for ANY surface liquid, with clouds/haze on top.
* Ring shadows now match the planet's drawn disc size instead of a point-source sliver.

## v2.0.14-alpha - 9th Jun 2026

* Black holes get a **Feeding** toggle (active accretion — changes the image, orrery accretion ring, and output). Pushing a neutron star's **magnetic field past ~10¹³ G** turns it into a (purple) **magnetar**, and dropping it back reverts.

## v2.0.13-alpha - 9th Jun 2026

* Interstellar planning moved off the rail to a link in a ship's transit planner (below the destination picker); "Measure" moved to the bottom of the rail.
* Orrery: stars now glow; planets/moons are shaded on their night side. The View control is a semitransparent eye that floats on the orrery (no longer hidden behind the body picker on phone).
* Transit planner: one-button "Refuel" (fills all tanks).
* Mobile/UI: slimmer time controls on phone; the per-field info "i" links removed from the body panel (the Newton apple covers it); New Starmap modal fits/scrolls on phones; About close is a larger red cross; picking Measure closes the mobile menu.

## v2.0.12-alpha - 9th Jun 2026

* **Interstellar transit planner** (new "Interstellar…" rail tool): pick a ship and a destination system, then compare four travel models — Realistic (rocket equation; a fuel slider must escape the star AND brake at the far end, red/yellow/green), Massless fuel (free propellant), Relativistic (instant accel to a fraction of c with time dilation), and Jump drive (just set the days). Each shows crew-frame and outside-observer travel time.

## v2.0.11-alpha - 9th Jun 2026

* Hiding a whole system from the guide now keys on the system's **root** (the top barycenter in a multi-star system) — hiding an underlying star only hides that star. Hidden-system eye marker is smaller and sits closer to the star.
* Projector: the standalone "Toggle projector CRT" is gone; the projector-open button now toggles it as **"Greenscreen CRT"** (the green-CRT look, which is what was wanted).

## v2.0.10-alpha - 9th Jun 2026

* **Field Guide — diagrams + remote fix**:
  * Clickable **star map** (systems at their real positions, with route lines) → preview a system, then explore. Clickable **per-system orbital diagram** (planets by distance, moon pips) → tap a body for its full data. Map stays on top, details below.
  * **Remote (cross-device) now delivers the whole map**: large peer messages are chunked (WebRTC drops >16KB frames), and the broadcast snapshot is slimmed (no transit logs / debug). Players on their own devices now get the full starmap, not just the branding.

## v2.0.9-alpha - 9th Jun 2026

* Printed report: added a **Geology** (tectonic regime) row to every body/moon, matching the field guide's depth.

## v2.0.8-alpha - 9th Jun 2026

* **Field Guide — full detail + branding**:
  * Every tier (lo-fi browser, hi-tech console, datapad, Guide) now shows full report-depth body data — temperature range, density, radiation, magnetosphere, geology, axial tilt, tidal lock, air mix, surface liquids, ascent Δv, biosphere and feature tags.
  * GM **company / faction branding**: set a name and upload a logo in the launcher; it appears as the guide's letterhead. (Supply your own art — nothing trademarked ships by default.)

## v2.0.7-alpha - 9th Jun 2026

* **Field Guide is now campaign-wide**: it opens at the starmap level with every visible system, then drills into one (a wider cut than the old per-system report). Available from both the starmap and a system view. A system whose main star is hidden from players is dropped from the guide — and now shows a small crossed-eye on the GM's starmap as a reminder.

## v2.0.6-alpha - 8th Jun 2026

* **Companion App — now a proper app + works on players' own devices**:
  * The lo-fi / datapad / Guide skins are now diagrammatic: a clickable star/planet layout up top, tap a body to read its player-safe file in a panel below (moons drill in) — instead of one long document.
  * **Cross-device**: players can open the guide on their own phones/tablets over the internet (peer-to-peer), not just same-machine. Keep the app open while they're connected.
  * GM **"include constructs"** switch in the launcher — show or hide stations/ships in the guide, over and above the standard player redaction.
* Measuring tape moved from the orrery View menu to a dedicated left-rail **Measure** button.

## v2.0.5-alpha - 8th Jun 2026

* **Measuring tape**: a "Measure (ruler)" toggle in the orrery View popover — tap two bodies for the straight-line distance between them in AU (km when short). Ported from the wireframe; works in Toytown scale.

## v2.0.4-alpha - 8th Jun 2026

* **LLM**: connect a local OpenAI-compatible server (LM Studio / Ollama, no key) or OpenRouter — base-URL presets, optional key, and a Test &amp; list-models button. Descriptions now feed the model curated, evocative body/star summaries (constraint-grade physics + interesting tags) instead of a raw 40-field physics dump, for more imaginative results.

## v2.0.3-alpha - 8th Jun 2026

* **Companion App**: added "The Guide" skin (friendly illustrated travel companion).
* Fixes: Newton's-apple physics button is green; confirm before File > New Starmap clears the map; Display/Actual time labels no longer clipped under their values; the time transport "..." is now a red warning that confirms the destructive set-now; Traveller mode is its own toggle (not a snap-grid value); the orrery can no longer overflow its cell and occlude the detail drag-bar / push the time pill off-screen; construct location in the report no longer shows 5 decimals.

## v2.0.2-alpha - 8th Jun 2026

* **Companion App (Players' Field Guide)**: new `/catalogue?sid=` live, redacted, in-universe companion to the system you're running. Open it from the system-view rail ("Field Guide..."). Same-machine for now (a mirrored tablet, a second window, your phone on the same browser). Skins: Green Screen / Amber Terminal (lo-fi CRT report), Survey Datapad (clean), Starship Console (live orbital map, tap a world for its file). Launcher has a link + QR. Report rendering extracted into a shared `ReportDocument` so the printed report and the live guide share one document.

## v2.0.0-alpha - 12th Apr 2026

* **Evolutionary System Wizard (New Generation Engine)**:

  * Introduced a multi-phase interactive wizard for physics-driven star system generation, selectable in New Starmap and Settings.
* **Stellar Birth (Phase 1)**:

  * Interactive property selection using a calibrated Hertzsprung-Russell diagram (based on ESO data)..
  * Stellar Classifier: Identifies all stellar types (Main Sequence, Hypergiants, White Dwarfs, etc.) and remnants (Black Holes, Neutron Stars)
* **Stellar Nursery (Phase 2)**:

  * 2D nursery for spatial star placement:  Drag-and-drop
  * Green Velocity Handles: Drag vectoring with real-time speed labels (km/s).
* **Stellar Dance (Phase 3)**:

  * **4th-order Runge-Kutta (RK4)** N-body physics engine with **Swept-Sphere collision detection** to prevent high-speed tunnelling.
  * **Event-Driven Slow-Mo**: Simulation automatically slows down to a crawl during mergers and ejections.
* **Unified Evolution Timeline (Phase 4)**:

  * 100 iteration accretion disc calculation \& animation capturing snapshots on every iteration.
  * **Dust/Gas Band Visualization**: Renders the protoplanetary disk with visible "carving" as planets sweep up material. \[LIKLEY BUGGED!]
  * **The BIG Time Slider**: Slider length and tick marks now reflect the actual calculated lifespan of the star.
  * **Basic lifespan**: star brightness changes over time, stellar remnants and engulfed planets taken into consideration
  * ***This is the section I am tinkering with mostly - LOTS to add and refine to get from here into the main part of SSE***
* **Physics \& Moon Generation**:

  * Implemented **Satellite Mass Budget Model**: Moon masses are now realistic percentages of parent mass (0.01-0.025% for giants).
  * **Power-Law Distribution**: Satellite systems now favor a single large moon (Titan/Ganymede style) over identical clones.
  * **Double Planet Event**: 2% rare chance for worlds to form high-mass binary partners (Earth/Luna style).
* **Content \& Community**:

  * Added  new example systems built by the community
  * Added special credits to footer and About box for community contributors (@Athena, @Mafro, @malize) and Mitch Anderson (Accrete.js).

## v1.10.0 - 1st Apr 2026

* Data Unification \& Editor Features:

  * Unified Star and Planet data structures into a single cohesive `CelestialBody` type, simplifying physics processing and resolving TS errors.
  * High mass planets (Brown Dwarfs) can now be "Ignited" into stars directly within the UI.
  * Low mass stars can be "Doused" back into planets directly within the UI.
  * Added "Rebuild Hierarchy" button to System View. When mass edits fundamentally shift the system's center of mass (e.g. creating a massive star), this button flattens and fully rebuilds the orbital parent-child chains relative to the new heaviest body. It can be destructive so not automated.
* Transit \& Flight Dynamics Improvements:

  * Overhauled post-transit kinematic states to accurately simulate orbital aftermaths during time-scrubbing.
  * Ships arriving in generic orbits (`lo`, `mo`, `ho`) or landed on the surface now correctly lock to their target's global state, eliminating the "glued to the sky" static offset bug.
  * Ships intercepting a construct (rendezvous) now automatically enter `Deep Space` formation flying, matching the station's trajectory instead of continuing inertial drift.
  * Ships arriving at Lagrange points (L1-L5) now mathematically track the parent planet's orbital rotation rather than remaining at a static offset.
* Improved Stability Assessment:

  * Added full system hierarchy scan to catch "Massive Inversions" (orbiting body is heavier than its host) and "Stolen Children" (orbit exceeds host's stable Hill sphere).
  * Added "Consumed/Collided" checks if an orbit drops below the physical radius of its host.
  * Added "Roche Limit Violation" checks for bodies orbiting too close to their host.
  * Rebuild Hierarchy` UI warnings added to the Technical Details panel when mass inversions occur.
* Terminology \& Unit Standardization:

  * Standardized acceleration units to lowercase **"g"** (9.81 m/s²) across tech details, and hazard messages.
* Time Control System Enhancements:

  * Added **"Manual Speed"** mode (speed dial) allowing for persistent integration rates and reversible playback. Works like OLD system.
  * Added **Speed Indicator** (e.g., +1s/s to +10y/s) providing real-time feedback during scrubbing.
  * Increased scrubber precision with a 50% wider slider and unified logic across System and Starmap views.
* Printed Report Improvements (Binary Systems):

  * Implemented hierarchical **stacked rendering** for binary planets in the System Overview diagram.
  * Enclosed binary pairs within a detailed **Barycenter Info Block** in the Celestial Survey for better organization.
  * Added dynamic unit scaling: small orbital distances now automatically switch from **AU** to **km** for readability.
* Precision Orbital Editing:

  * Added "Mean Anomaly" slider and manual numeric entry to all bodies and constructs for fine-tuned positioning.
  * Set all orbital parameters (SMA, Eccentricity, etc.) to use high-precision "any" step for manual entry.
  * Construct editor now supports direct manual entry for Altitude (km) and Orbital Distance (AU).
* Binary Star Orbit Control:

  * Enabled Orbit editing tab for stars within binary systems.
  * Implemented reciprocal coupling: editing one star's position now automatically updates its partner to maintain its stable barycenter.
* Stellar Physics \& Evolution:

  * Implemented **Dual Frost Lines**: distinction between **Formation Frost Line** (170K, historical boundary for gas giant growth) and **Current Frost Line** (125K, modern vacuum ice stability).
  * Added **Spectral-Class Dependent Brightening**: stars now evolve in luminosity based on their type (O/B massive stars brighten rapidly, M-dwarfs remain stable), correctly back-calculating historical formation zones.
  * Fixed **Radiogenic Heating** persistence: manual thermal overrides are now preserved during system processing and correctly account for surface temperature even on rogue/starless bodies.
* Orbital Mechanics \& Generation:

  * Fixed **"0 AU Moon" Bug**: correctly resolved host gravitational parameters for planets orbiting barycenters, ensuring stable moon placements in binary systems.
  * UI refinement for root stellar barycenters: hidden the redundant "Edit" button to prioritize direct name/visibility editing.
* Bug Fixes \& UI Polish:

  * Fixed **Time Epoch Desynchronization** (13.8 billion year jump): ensured all initialization paths correctly offset Big Bang display time into Unix-relative physics time, preventing orbital scrambling on reload.
  * Improved flyby math to correctly calculate zero Delta-V intercepts for unpowered flypasts.
  * Unified "About" dialogs into a single, maintainable component.
  * Easter Egg :)

## v1.9.2 - 24th Mar 2026

* N-Body Gravitational Summation:

  * Transit solvers now sum gravitational forces from all massive bodies (Stars, Planets, Barycenters) for realistic ballistic drift.
  * Replaces single-body Keplerian assumptions with full integrated pathing for all mission types.
* Trajectory Correction Manoeuvres (TCM):

  * Automatic drift tracking injects discrete TCM burn points if n-body perturbations exceed 100km.
  * Compact, color-coded timeline labels and trajectory markers signal manoeuvre intensity (Blue/Orange/Red) based on Max-G.
  * TCMs now correctly consume fuel and contribute to total mission delta-V.
* Planner UI \& Stability:

  * "Transit Tags" summary box added to mission stats for better awareness of aerobraking, TCMs, and high-G status.
  * Direct Burn profile state (Accel/Coast/Brake) is now persistent and decoupled from ballistic plan states.
  * Fixed various "ReferenceError" and "Shadowing" bugs in the transit calculation engine.

## v1.9.1 - 15th Mar 2026

* Torch-Ship Kinematic Simplification:

  * Bypassed Lambert solver artifacts for high-thrust "Direct Burn" plans.
  * Eliminates "2000c" speed-of-light errors in favour of robust kinematic straight-line profiling.
* Lowest Common Ancestor (LCA) frame selection for transits:

  * ensures transfers in multi-star systems use the correct gravitational host,
  * fixes "40 AU loop" bug where binary star transits default to system barycenter.
* Smart Target Redirection:

  * Interplanetary moon transfers now automatically target the parent planet's gravity well while maintaining moon-radius capture.
  * Fixes "dive into the star" bug for local stellar constructs.
* Expanded Lagrange point support (L1-L5):

  * added L1, L2 (radial offsets) and L3 (hidden co-orbital),
  * co-orbital framing ensures L-points are tracked in the host's parent frame.
* Transit intercept accuracy and stability:

  * Fixed "missed intercept" bug: solvers now target actual $(x, y)$ node coordinates at arrival rather than just orbital radius.
  * Stability filter overhaul: removed hard 100km/s cap, increased to 10,000 km/s insanity check to support high-G ship jumps.
  * Forced direct-path (short-way only) for Speed/Direct Burn plans to prevent unrealistic looping arcs.
  * Improved station/construct state resolution: orbiting constructs correctly resolve positions even without explicit orbit objects.
* UI/UX refinements:

  * New "Major Target -> Sub-Target" dropdown workflow in Transit Planner.
  * Improved hidden-plan reason messages in the UI.
  * Added internal transit debug logging to developer console.

## v1.9.0 - 24th Feb 2026

* New time system foundations are in place:

  * Display Time and Actual Time are now separate and can be aligned/reset.
  * Time scrub/play controls now drive system visuals and orbit updates.
  * Calendar/time settings are saved with each starmap.
* Calendar system is now data-driven and extensible:

  * calendars are loaded from data,
  * new calendars can be added/edited,
  * legacy saves are migrated safely.
* Transit planner reliability pass:

  * short/local transfers (planet/moon) now use correct local reference frames,
  * Direct Burn now solves for a feasible duration instead of producing impossible spike values,
  * orbit targeting now respects selected arrival orbit level (LO/MO/HO),
  * Brake-at-arrival now targets orbital tangential velocity instead of assuming stationary capture,
  * flypast velocity now carries correctly into the next leg for all route types,
  * local launch-window search no longer suggests absurd long waits for moon transfers,
  * route label updated: `Efficient Alt` -> `Efficient Now`.
* Transit visuals improved:

  * during preview/execution, the focused construct moves along the route,
  * optional vector overlay added (single `Show Vectors` toggle) for velocity/acceleration.
* Habitable Zone model refreshed and old Goldilocks logic replaced with conservative modern HZ edges.
* Zone rendering performance improved (screen-space draw path, culling, and cheaper dash behavior).
* StarMap settings and LLM settings reorganized:

  * StarMap settings consolidated,
  * LLM/API settings moved to separate local-only config (not exported).
* Time-driven transit scheduling shipped:

  * `Schedule Journey` now writes planned routes into each construct's own ship log data,
  * planned routes persist with constructs in saved systems/starmaps,
  * multiple constructs can move concurrently from scheduled plans.
* Ship's Log shipped in System View:

  * shows journey windows and per-leg departure/destination entries,
  * includes controls to clear future plans and cancel active (+future) plans.
* Transit intercept and stability improvements:

  * moving construct targets are available in planner target lists,
  * intercept solving now uses live kinematic target state (position + velocity),
  * direct-burn sanity filters reduce unstable/crazy solutions for moving targets - these WILL happen

## v1.8.4 - 20th Feb 2026

* Temperature model refresh (cryo greenhouse behavior, improved range presentation, tidal hotspot handling).
* Printable report overhaul with compact system diagram and multi-star hierarchy fixes.
* QoL updates including invert display mode, finer atmosphere composition editing, and Traveller import edge-case fixes.

## v1.8.1 - 14th Feb 2026

* Scaled starmap mode with persistent map mode/scale controls.
* Route-based map rescaling workflow.
* Draggable systems with live route distance updates in scaled mode.
* Scale bar integration and placement consistency updates.

## v1.8.0 - 14th Feb 2026

* Orbital stability post-processing (overlap + Hill-spacing proxy) with calibrated severity tiers.
* Dedicated orbital stability technical-details UI block and tags integration.

## v1.7.2 - 14th Feb 2026

* Transit planner GM override flow (`Force Journey`) for blocked plans.
* Name filtering in system summary context menus.
* PWA install/offline support and update prompt behavior.

## v1.7.1 - 14th Feb 2026

* IndexedDB starmap persistence migration from localStorage.
* High-e orbit/camera stability improvements and Kepler propagation hardening.
* Orbit editing guardrails and Lagrange placement correction.

## v1.7.0 - 24th Jan 2026

* Traveller integration (subsector import, UWP entry, extended decoding, PBG population logic).
* Global atmosphere editor and related physics/placement integrity updates.
* Broad UI/UX polish across starmap/system flows.

## v1.6.0 - 21st Jan 2026

* Sensor suite data model/editor/overlay implementation.
* Save redaction workflow for player-safe exports.
* Habitability and Earth-temperature calibration refinements.

## v1.3.4 (14th Jan 2026)

* Brown dwarf support expansion and procedural realism upgrades.
* Binary dynamics and orbital mechanics improvements (including retrograde support).
* Multiple UI/UX stability fixes.

## v1.3.3 (13th Jan 2026)

* Documentation/tutorial improvements and sync/performance fixes.
* Critical starmap/system relink bug fix.

