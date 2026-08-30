<script lang="ts">
  // /physics — the honesty appendix. Documents the constants, the derivations, the
  // deliberate fudges, and how classification + tags are produced. Stable section IDs
  // (#temperature, #radiation-split, #classification, …) so tooltips can deep-link.
  import { G, UNIVERSAL_GAS_CONSTANT, AU_KM, SOLAR_MASS_KG, SOLAR_RADIUS_KM, EARTH_MASS_KG, EARTH_RADIUS_KM, EARTH_GRAVITY, EARTH_DENSITY, RADIATION_UNSHIELDED_DOSE_MSV_YR, PLANCK_H, BOLTZMANN_K, SOLAR_CONSTANT_WM2 } from '$lib/constants';
  import { GRID_MIN_NM, GRID_MAX_NM, GRID_STEP_NM } from '$lib/physics/spectrum';
  import SurfaceLightExplorer from '$lib/charts/SurfaceLightExplorer.svelte';
  import MorphologyStackExplorer from '$lib/charts/MorphologyStackExplorer.svelte';
  import UnderThisLight from '$lib/charts/UnderThisLight.svelte';
  import { fetchAndLoadRulePack } from '$lib/rulepack-loader';
  import { onMount } from 'svelte';
  import type { RulePack } from '$lib/types';

  // The live diagrams below run the ENGINE's own functions, which need the rule pack's gas optics
  // and pigment data. Fetched here rather than reimplemented: a page that carried its own copy of
  // the numbers would be a second authority on them the day the pack changed.
  let pack = $state<RulePack | null>(null);
  onMount(async () => {
    try { pack = await fetchAndLoadRulePack('/rulepacks/starter-sf/main.json'); } catch { /* defaults */ }
  });

  const toc = [
    ['layering', 'How the model layers'],
    ['constants', 'Constants'],
    ['gravity', 'Gravity, size & density'],
    ['makeup', 'Interior makeup'],
    ['albedo', 'Albedo — bare ground & its deposits'],
    ['temperature', 'Equilibrium temperature'],
    ['eccentric-flux', 'Eccentric flux distance'],
    ['greenhouse', 'Greenhouse & surface temp'],
    ['temp-range', 'Temperature range & tidal heat'],
    ['radiation', 'Surface radiation'],
    ['radiation-split', 'Spectral photon/particle split'],
    ['ionising-output', 'Ionising output & the corona'],
    ['stellar-outflows', 'Jets and shed winds'],
    ['star-designations', 'Reading a star designation'],
    ['belts', 'Trapped belts & the giants'],
    ['fluids', 'Fluid layers'],
    ['clouds', 'Clouds & weather'],
    ['magnetism', 'Magnetism'],
    ['aurora', 'Auroras'],
    ['spin', 'Spin axis, seasons & satellite planes'],
    ['geology', 'Geological activity'],
    ['surface', 'Resurfacing & surface features'],
    ['resonance', 'Resonances & stability'],
    ['eclipses', 'Eclipses'],
    ['ejection', 'Who gets ejected'],
    ['surface-light', 'Surface light & the spectrum'],
    ['standing-on-it', 'Standing on it: brightness & visibility'],
    ['biosphere', 'Biospheres: pigment & cover'],
    ['colour', 'Apparent colour & visualisation'],
    ['views', 'Spatial views: grids & routes'],
    ['habitability', 'Habitability score'],
    ['classification', 'Classification (fingerprints)'],
    ['tags', 'Tags'],
    ['overrides', 'GM overrides'],
    ['reasons', 'Reasons to visit'],
    ['zones', 'Stellar zones'],
    ['generation', 'Auto-generation'],
    ['baseline', 'Test fixtures (Sol & Testion)'],
    ['fudges', 'Known fudges']
  ];

  const constants = [
    ['G', G, 'm³·kg⁻¹·s⁻²', 'Newtonian gravitational constant (CODATA).'],
    ['R (gas)', UNIVERSAL_GAS_CONSTANT, 'J·mol⁻¹·K⁻¹', 'Universal gas constant — scale height, molar mass.'],
    ['AU', AU_KM, 'km', 'Astronomical unit.'],
    ['M☉', SOLAR_MASS_KG, 'kg', 'Solar mass.'],
    ['R☉', SOLAR_RADIUS_KM, 'km', 'Solar radius.'],
    ['M⊕', EARTH_MASS_KG, 'kg', 'Earth mass — the mass_Me feature unit.'],
    ['R⊕', EARTH_RADIUS_KM, 'km', 'Earth radius — the radius_Re feature unit.'],
    ['g⊕', EARTH_GRAVITY, 'm·s⁻²', 'Standard surface gravity.'],
    ['ρ⊕', EARTH_DENSITY, 'kg·m⁻³', 'Earth bulk density (≈5.51 g/cc).'],
    ['Dose₀', RADIATION_UNSHIELDED_DOSE_MSV_YR, 'mSv·yr⁻¹', 'Unshielded GCR+SPE dose at 1 AU from a Sun-like star.'],
    ['h', PLANCK_H, 'J·s', 'Planck constant — the spectrum model (Planck\'s law, photon energy).'],
    ['k', BOLTZMANN_K, 'J·K⁻¹', 'Boltzmann constant — Planck\'s law.'],
    ['S☉', SOLAR_CONSTANT_WM2, 'W·m⁻²', 'Solar constant at 1 AU — the scale anchor for every surface spectrum.']
  ];
</script>

<svelte:head><title>Physics & Classification — Star System Explorer</title></svelte:head>

<div class="physics">
  <nav class="toc">
    <a class="home" href="/">‹ Back to app</a>
    <h2>Physics & Classification</h2>
    <ul>{#each toc as [id, label]}<li><a href={`#${id}`}>{label}</a></li>{/each}</ul>
  </nav>

  <main class="body">
    <header>
      <h1>The honesty appendix</h1>
      <p class="lede">Every number this tool shows comes from one of three places: a physical constant, a
        derivation from those constants, or a deliberate, documented simplification. This page lists all
        three — plus how a world's <em>type</em> and <em>tags</em> are decided — so the rest of the app is
        defensible. Values are read live from the code.</p>
    </header>

    <section id="layering">
      <h2>How the model layers</h2>
      <p>Physics runs as a <strong>pipeline</strong>: each stage consumes the stages above it and writes
        properties the stages below read. The order matters — a body's colour, magnetism, geology and
        habitability are all <em>downstream</em> of its interior makeup and temperature.</p>
      <ol class="layering">
        <li><strong>Interior makeup</strong> (metal / rock / carbon / ice / gas fractions) → <strong>density</strong> and, with mass, <strong>radius</strong>.</li>
        <li><strong>Orbit &amp; stars</strong> → equilibrium temperature → greenhouse, tidal, radiogenic &amp; internal heat → the <strong>radiating temperature</strong> → its <strong>day and night sides</strong>, whose average is the <strong>mean surface temperature</strong> and whose spread opens into the full <strong>range</strong> (cold night side ↔ tidal-volcanic hotspots).</li>
        <li><strong>Fluid layers</strong> — surface ocean, subsurface (under-ice) ocean, cloud decks, deep conductive interior — derived from makeup + temperature + atmosphere.</li>
        <li><strong>Magnetism</strong> — the dynamo implied by the conductive interior layers + rotation (intrinsic vs induced; dipolar vs tilted/off-centre), iterated <strong>parent before child</strong> because a moon's induced field asks whether it sits inside its host's magnetosphere.</li>
        <li><strong>Radiation</strong> — its own pass, and it runs <em>after</em> magnetism rather than beside the rest of the environment, because the dose depends on the field, the spin and the scale height that the pass above derives. This split is not tidiness: while radiation ran first, a freshly imported Earth reported a hundred times its real surface dose, and how wrong the figure was depended on how many times the system had been processed.</li>
        <li><strong>Geological activity</strong> — tectonic regime + volcanism by <em>mechanism</em>, using makeup, mass/radius, system <em>age</em>, surface water and tidal heat.</li>
        <li><strong>Surface light</strong> — the star's spectrum filtered by the air and the cloud decks above the ground, which is what a plant would have to live on and what the sky looks like from below.</li>
        <li><strong>Biosphere</strong> — which pigments that light makes viable, which one this world's life settled on, and how much of the land shows it.</li>
        <li><strong>Apparent colour</strong> — composed from makeup, ocean, cloud decks and temperature.</li>
        <li><strong>Classification</strong> reads the raw physics features (never the tags) to pick a type.</li>
        <li><strong>Tags</strong> &amp; <strong>habitability</strong> summarise the above; habitability folds geology + magnetism into the score (see below).</li>
      </ol>
      <p>Because classification reads <em>features</em> and the tags/habitability read the <em>derived
        subsystems</em>, there's no circular dependency — every arrow points one way.</p>
    </section>

    <section id="constants">
      <h2>Constants</h2>
      <table>
        <thead><tr><th>Symbol</th><th>Value</th><th>Units</th><th>Meaning</th></tr></thead>
        <tbody>{#each constants as [sym, val, unit, note]}
          <tr><td class="sym">{sym}</td><td class="num">{val}</td><td>{unit}</td><td>{note}</td></tr>
        {/each}</tbody>
      </table>
    </section>

    <section id="gravity">
      <h2>Gravity, size &amp; density</h2>
      <p>Surface gravity <code>g = G·M / r²</code>; escape velocity <code>v = √(2GM/r)</code>; bulk density
        <code>ρ = M / (4⁄3·π·r³)</code> (reported in g/cc — Earth ≈ 5.51, water = 1.0, Jupiter ≈ 1.33).
        Density, escape velocity and mass/radius (in Earth units) are core classification inputs.</p>
    </section>

    <section id="makeup">
      <h2>Interior makeup</h2>
      <p>A body's bulk composition is the first-class control: mass fractions of <strong>metal</strong> (ρ≈7.9),
        <strong>rock</strong> (3.3), <strong>carbon</strong> (2.3), <strong>ice</strong> (0.95) and <strong>gas</strong>
        (0.12 g/cc). Bulk density is volume-additive, <code>1⁄ρ = Σ fᵢ⁄ρᵢ</code>, and radius follows from mass +
        density — so <em>density and radius are derived, not dialled in</em>. A body with no explicit makeup gets one
        inferred from its density (mass-aware, so a low-density heavyweight reads as a gas giant, not "icy").</p>
      <p>The composition classes (iron, silicate, coreless, carbon) key on these fractions, and makeup feeds the
        fluid layers, magnetism and geology below.</p>
    </section>

    <section id="temperature">
      <h2>Equilibrium temperature</h2>
      <p>For each star, luminosity <code>L = 4π·R★²·σ·T★⁴</code> (Stefan–Boltzmann). The blackbody equilibrium
        temperature is built by <strong>summing the flux from every luminous source</strong> at the body's
        distance <code>dᵢ</code> from each — <code>T_eq = [ Σᵢ Lᵢ·(1−A) / (16·π·σ·dᵢ²) ]^¼</code>. A "luminous
        source" is any star <em>and</em> any <a href="#temp-range">self-luminous brown dwarf</a>. So binaries add
        their fluxes, and — importantly — a <strong>moon of a brown dwarf is heated by BOTH its distant system
        star and its nearby brown-dwarf host</strong>, the near source usually dominating. The distance to each
        source is the hierarchical path (a moon's distance to a star = its orbit around its planet + the planet's
        orbit around the star).</p>
      <p><code>A</code>, the Bond albedo, is <strong>derived</strong>, not dialled in: a surface reflectivity from
        the makeup (dark ocean ~0.06, bare rock ~0.11, metal darker still at ~0.075, bright frost ~0.62) seen through the world's
        <a href="#clouds">cloud decks</a>, each reflecting what its own condensate reflects — water 0.42,
        sulphuric acid 0.76, ammonia 0.51, methane haze 0.28, all rule-pack data you can edit. The decks are
        composited bottom-up, so the top one has the largest say: Jupiter's bright ammonia veil, not the brown
        hydrosulphide beneath it, is what makes Jupiter bright. A liquid ocean makes its own water clouds, which
        is where Earth's 0.31 comes from.</p>
      <p>Crucially, <strong>albedo does not decide for itself what clouds a world has</strong> — it asks the one
        cloud model, the same one that publishes the deck tags. That used to be two models: albedo carried its
        own boiling-point table and could declare a CO₂ deck on a world where the column physics found nothing
        condensing at all, and being upstream it set the temperature everything else was judged by.</p>
      <p>It is a <strong>circular</strong> problem — albedo sets the temperature, the temperature sets which
        clouds condense, and the clouds set the albedo — so the whole loop is solved as one fixed point rather
        than broken with a shortcut. It settles in two to five passes; a world sitting exactly on the edge of
        condensing something has two self-consistent answers, and lands between them with its albedo note saying
        the cover is marginal. Against measured Bond albedos: Venus 0.76 (model 0.757), Earth 0.306 (0.308),
        Saturn 0.342 (0.343), Neptune 0.290 (0.288), Jupiter 0.503 (0.490). A manually-pinned albedo still wins,
        but is no longer needed — tweak the makeup/atmosphere and the albedo follows.</p>

      <h3>A megastructure shades the worlds behind it</h3>
      <p>The luminosity above is what the star <strong>emits</strong>; what a world <strong>receives</strong> can
        be less, because something was built in the way. A Dyson swarm or shell orbiting the star intercepts its
        published share of the light (the same number driving its harvested power), and every body outside it
        receives the rest — build a swarm at 30% density and every world beyond it cools by <code>0.7^¼</code>,
        about 9%. Three rules keep it honest: a structure <strong>never shades itself</strong> (interception is
        the harvest, its sunward face takes the raw star); a body <strong>inside its radius is untouched</strong>
        (the light gets there first); and a <strong>band shades only what aligns with its plane</strong> — a
        ringworld blacks out a world sharing its plane beyond it, while an inclined orbit only crosses the shadow
        briefly, so it is dimmed by the share of its year it spends behind the band (from its inclination, not
        the clock — the same time-free convention as every distance here). The temperature range takes the
        envelope: coldest is aphelion in full shadow, warmest is perihelion in clear sky. The body's trace names
        who took what.</p>
    </section>

    <section id="albedo">
      <h2>Albedo — bare ground and its deposits</h2>
      <p><strong>Bare rock is DARK, and what makes a world bright is what has settled on it.</strong> The three
        measurements that pin this point in different directions: Mercury reflects 0.088 and Luna 0.11 — darker
        than a single flat "rock" value used to allow — while Mars reflects 0.25 and Io 0.63, far brighter than
        their rock could ever be. So the ground is dark (metal darker than rock: a space-weathered iron regolith
        is about the darkest natural surface there is, which is why Mercury, at 62% metal, is the darkest rocky
        body in the Solar System), and brightness is added by two <em>deposits</em> the engine already works out
        for other reasons:</p>
      <ul>
        <li><strong>Oxide dust</strong> — the ferric fines that make Mars orange. Graded from the iron fraction,
          how oxidising the air is, and how long the surface has sat there without being repaved; the same
          <code>surface/oxidised</code> the world already carries. It is why Mars is bright without any frost:
          at about 210&nbsp;K its CO₂ is still well above its own 195&nbsp;K freezing point.</li>
        <li><strong>Volatile frost</strong> — if the atmosphere's dominant gas is below <em>its own</em> freezing
          point at the surface, it is not really an atmosphere any more, it is lying on the ground. Io's sulphur
          dioxide freezes at 198&nbsp;K and Io's surface is at about 100, which is the whole of its 0.63; Pluto's
          and Triton's nitrogen is the same story. Earth's nitrogen never comes close.</li>
      </ul>
      <p>Model against measurement, from one set of constants with no per-world special cases: Mercury
        <strong>0.088</strong> (measured 0.088), Luna <strong>0.110</strong> (0.11), Mars <strong>0.256</strong>
        (0.25), Io <strong>0.569</strong> (0.63). And because Mars is now correctly darker in equilibrium
        — 209.8&nbsp;K rather than 216.7 — <strong>its thin water-ice wisps condense again</strong>, which is a
        cloud deck returning from an albedo change with no cloud code touched at all.</p>
      <p>The rust term is worked out <em>inside</em> the fixed point, not before it, because it has to be: a
        surface is repaved quickly where there is liquid water and slowly where there is not, so how rusty a
        world is depends on its temperature, which depends on how rusty it is. That closes a genuine feedback —
        colder, water freezes, the lid stops moving, the surface ages, more rust, brighter, colder again, which
        is the same loop that gives Earth its snowball states — so the solve reports any world where it fails to
        settle rather than presenting a marginal answer as a firm one.</p>
    
      <h3>Ice ages, and that is most of what makes an icy moon bright or dark</h3>
      <p>A frozen surface is not one thing. <strong>Fresh ice is brilliant and old ice is filthy</strong> — what
        darkens it is a lag of material that cannot evaporate away: micrometeoritic infall, and the carbon-rich
        residue radiation leaves behind as it processes the ice. Nothing removes that lag; only resurfacing
        buries it. So the brightness of an icy world is a clock, and the two ends of it are in our own system:
        <strong>Enceladus reflects 0.81</strong>, the brightest surface anywhere near us, because its plumes are
        laying down new ice faster than the lag can build — while <strong>Callisto reflects 0.11</strong>, one of
        the darkest, having sat untouched for four and a half billion years. They are the same process at
        opposite ends, and a single "ice is bright" constant made them the same number.</p>
      <p>The engine already works out how long a surface has gone unrepaved — the same figure the oxide-dust
        grade above is read from — so the ice model asks it the same question the rock model does: not
        <em>what is this made of</em> but <em>what has settled on it, and how long has it had</em>. Clean ice and
        the dark lag are both rule-pack numbers, and the curve between them saturates, because the lag buries
        the brightest ice first and then has less and less left to cover.</p>
      <p class="aside"><strong>Where it does not reach:</strong> Ganymede. About sixty per cent of it was
        resurfaced roughly two billion years ago and the rest is ancient, so its true answer is a mixture of two
        ages — and the engine carries one age per world, which puts it alongside Callisto. It comes out darker
        than it should. Fitting the curve to split them would need a terrain-mix figure that does not exist,
        and would drag every other icy world off to do it.</p>
</section>

    <section id="eccentric-flux">
      <h2>Eccentric flux distance</h2>
      <p>An eccentric orbit receives a higher <em>time-averaged</em> flux than its mean distance implies, so the
        flux-equivalent distance is <code>a·(1−e²)^¼</code> (&lt; a), not the mean <code>a</code>. The dominant
        eccentricity is read from the perihelion/aphelion spread (exact for a planet orbiting its star directly).
        Earth (e≈0.017) shifts ~+0.01 K, Mars (e≈0.093) ~+0.23 K — small, and correctly <em>warmer</em>.</p>
    </section>

    <section id="greenhouse">
      <h2>Greenhouse &amp; surface temperature</h2>
      <p>Surface temperature composes the equilibrium temperature with additive heat: greenhouse forcing
        (from atmospheric composition + pressure, capped to avoid runaway blow-ups), tidal heating, radiogenic
        heat, giant internal heat, and — for a <a href="#temp-range">self-luminous brown dwarf</a> — its own
        photosphere. These are summed in <strong>flux space</strong> (each as σT⁴, then back to a temperature),
        not stacked as naive +K, so a body already warm doesn't gain a full extra degree per degree of forcing.
        The greenhouse model and its cryo/CIA parameters live in the rulepack (<code>climateModel.greenhouse</code>)
        so they're tunable, not hard-coded.</p>
      <h3>A giant makes its own heat</h3>
      <p>A gas giant is still radiating the gravitational energy of its own formation, and cooling as it does.
        This is not a small correction: Jupiter puts out about 1.67 times the energy it receives from the Sun,
        Saturn 1.78, Neptune 2.6. So the dominant term for a giant has <em>nothing to do with its star</em> —
        and the lever is <strong>age</strong>. A young giant is genuinely hot. The planets we have photographed
        directly, like the HR 8799 family, sit at roughly 1000&ndash;1200 K at 30 million years old, glowing in
        the infrared entirely on their own account.</p>
      <p>We model that as a cooling curve in age, scaled up (never down) for giants heavier than Jupiter, and
        anchored on today's solar system: whatever the curve does when young, it must still reproduce Jupiter's
        real excess at 4.6 billion years. That anchoring is the guard rather than a decoration — it caught a
        mass term that had quietly cost Saturn 23 K. Above 8 Jupiter masses the
        <a href="#temp-range">brown-dwarf model</a> takes over with its own cooling tracks, and the two are
        matched at the boundary so a giant never gets colder by gaining mass.</p>
      <p><strong>Gas giant or ice giant is a COMPOSITION question, and it is asked of the mass — never of the
        type name.</strong> The two get different reference figures (about 52&nbsp;K of excess for a gas giant
        against 24&nbsp;K for an ice giant at 4.6&nbsp;Gyr), and the split is the same one the interior model
        already uses to decide whether hydrogen is compressed into its metallic phase: above roughly 50 Earth
        masses it is, below it the conductive layer is superionic water instead. That matters because the
        obvious alternative is a trap — asking whether the body's <em>class</em> contains the words "ice giant"
        reads a name the classifier assigns a whole pass LATER, from a temperature this very figure produces.
        A freshly imported Neptune came out at +52&nbsp;K on its first pass and +24&nbsp;K on its second because
        of exactly that. It also mislabelled a whole family: a mini-Neptune or a hycean world was being handed
        Jupiter's formation heat purely because its type name did not happen to contain the characters
        "ice-giant".</p>
      <p><strong>Rocky worlds work differently and deliberately get none of this.</strong> A planet is not
        contracting, so its internal heat is radioactive decay plus whatever tides are kneading it — and on
        Earth that reaches the surface as about 0.09 W/m² against roughly 340 W/m² of sunlight, moving the
        surface temperature by around a fiftieth of a degree. It matters enormously for geology and not at all
        for climate, and the model says so rather than inventing a term.</p>

      <p>The result is <strong>one</strong> radiating temperature, and everything downstream reads that same
        number: the <a href="#habitability">habitability</a> temperature score and the classifier. It balances
        <em>power</em>, so it is what the world gives off — and because radiated power goes as T⁴, a world that
        bakes by day and freezes by night radiates as much as a uniformly warm one while <em>averaging</em> far
        below it. The <a href="#temp-range">mean surface temperature</a> a GM reads is therefore derived one step
        later, from the day and night sides; the two agree on any world with enough air to even the swing out,
        and part company on an airless one (the Moon radiates at 270&nbsp;K and averages about 214).
        <strong>Radiogenic heat</strong> is a GM override (0 by default — negligible against sunlight for most
        worlds); when set it both warms the surface <em>and</em> drives the world's
        <a href="#geology">geological vigour</a>, so a young or exotic world can run hot and tectonically alive
        independently of its star.</p>
      <p><strong>Clouds are coupled to temperature in BOTH directions</strong>, but not by a single term that
        would double-count: their <em>cooling</em> (reflectivity) is the derived <a href="#temperature">albedo</a>
        above, while their <em>warming</em> is the greenhouse of the gas they condensed from (Venus's clouds are
        its CO₂; Earth's water vapour is in its air at 0.4%).</p>
      <p><strong>A sea puts its own vapour into its own air, and we derive that rather than take it on trust.</strong>
        How much is not a free choice: it is the <em>saturation pressure</em> of that solvent at that surface
        temperature — the same curve the cloud decks use — scaled by how much of the surface is sea and by the
        fraction of saturation a whole air column carries (the troposphere dries with altitude, so the column
        mean is well under the value at the ground). Calibrated on Earth and nothing else: 288&nbsp;K, 1&nbsp;bar
        and 71% ocean give the 0.4% water vapour Earth actually has. The solvent is whatever the world's
        hydrosphere is made of, so a methane sea warms its world with methane. If a composition already
        <em>lists</em> the gas, that figure is a floor — an author can add vapour we would not have derived, but
        cannot hold it below what the sea must be evaporating.</p>
      <p>The point of deriving it is that saturation goes to nothing <em>smoothly</em>, including by sublimation
        from a frozen sea. Before, this term switched on at exactly 273&nbsp;K, which put a ten-kelvin step in a
        loop that feeds itself: a world a hair below freezing lost its whole vapour greenhouse, and that loss was
        what kept it below freezing. Worlds fell into snowballs because a branch closed, not because the physics
        said so.</p>
    </section>

    <section id="temp-range">
      <h2>Temperature range, decomposed</h2>
      <p>A single mean — or even one min/max — hides what a GM needs. We keep the global <em>mean</em> and split
        the variation into independent, named sources, each reported as the swing it ALONE would add:</p>
      <ul>
        <li><strong>Latitude</strong> — equator (hot) ↔ pole (cold), from the geometry of insolation.</li>
        <li><strong>Seasonal</strong> — axial tilt + orbital eccentricity (the annual swing).</li>
        <li><strong>Day ↔ night</strong> — rotation; huge when airless / slow (Mercury), tiny under a thick blanket.</li>
        <li><strong>Locked faces</strong> — a tidally-locked world has permanent hot/cold faces instead of a cycle.</li>
        <li><strong>Tidal hotspots</strong> — localized volcanic vents; the mean stays capped (concentrated flux
          barely moves the planet-wide average) but the peak climbs with forcing toward a composition ceiling —
          silicate melt (~1500 K, Io's lava) for rock, cryovolcanic (~320 K) for ice. Tags <code>tidal/volcanism</code>
          / <code>tidal/lava-flows</code>.</li>
      </ul>
      <p>An <strong>atmosphere</strong> (and oceans) redistribute heat — the single biggest control — so a thick-air
        world is far more uniform than an airless one. The <em>total</em> range is the combined extreme (pole +
        winter + night ↔ equator + summer + day, or a tidal hotspot). So Io reads a cold −194 °C night surface
        <em>and</em> ~960 °C lava vents in the same readout. Calibrated loosely to Earth / Mars / the Moon /
        Mercury — heuristic, and axial tilt defaults to 25° when a body doesn't specify one.</p>

      <h3>Day and night are an energy balance, and the mean falls out of them</h3>
      <p>The equilibrium temperature is a <strong>power</strong> balance — the one temperature at which a sphere
        radiates away exactly what it absorbs — and it is <em>not</em> a mean surface temperature. Treating it as
        one and hanging a symmetric swing off it gets three things wrong at once, and no value of the swing
        constant fixes any of them, because the fault is the shape: the sunlit side has no ceiling, the night side
        falls straight through its floor, and the mean sits too high. So the two sides are derived first and the
        mean is what they average to. Writing <em>f</em> for the fraction of the absorbed energy that reaches the
        night side (0 = none reaches it, 1 = the world is isothermal):</p>
      <ul>
        <li><strong>Day side</strong> radiates (2−<em>f</em>)·σT<sub>eq</sub>⁴, so it sits at T<sub>eq</sub>·(2−<em>f</em>)<sup>¼</sup>.</li>
        <li><strong>Night side</strong> radiates <em>f</em>·σT<sub>eq</sub>⁴, at T<sub>eq</sub>·<em>f</em><sup>¼</sup>
          — the two average back to σT<sub>eq</sub>⁴, so nothing is created or lost.</li>
        <li><strong>The hottest point</strong> is where the star is straight overhead, and it cannot exceed the
          temperature at which the ground alone re-radiates that light: √2·T<sub>eq</sub> when nothing is carried
          away. That is 110&nbsp;°C for the Moon, against a measured noon of about 120&nbsp;°C — the bound reads
          slightly low on purpose, because it uses the <em>bond</em> albedo where the real sub-solar point
          reflects less. Before this, the Moon's noon read 209&nbsp;°C, because nothing bounded it at all.</li>
        <li><strong>The mean</strong> is the average of the two sides. It equals the radiating temperature for a
          well-mixed world and drops below it as the swing grows — the Moon radiates at 270&nbsp;K and averages
          214, which is what Diviner measures at its equator.</li>
      </ul>
      <p><em>f</em> has two channels and they compose, because whatever the air does not carry the ground still
        can. <strong>Bulk transport</strong> by atmosphere and ocean is the one that makes Venus a 460&nbsp;°C
        world with no day/night difference at all. <strong>Heat stored in the ground</strong> is the standard
        <em>thermal parameter</em> — the surface's rate of storing heat against its rate of radiating it away —
        which is where rotation belongs: a slow rotator radiates its store away before dawn and freezes hard, and
        a cold world barely cools at all, because radiating goes as T⁴ and at 70&nbsp;K that is feeble. Hence
        Mercury's −176&nbsp;°C night out of a 421&nbsp;°C noon, and Pluto and Triton coming out very nearly
        uniform. The one surface property this needs is thermal inertia, taken as bare regolith's measured value
        and raised where an atmosphere puts gas in the pore spaces to conduct through — a whisper of air buys
        almost all of that, which is why Mars holds its night far better than the airless Moon does.</p>

      <h3>Self-luminous brown dwarfs</h3>
      <p>A <strong>brown-dwarf-mass</strong> body (~8–80 M♃, i.e. the sub-brown-dwarf, brown-dwarf and
        ultra-cool-dwarf types) is not a passive planet: it radiates its <em>own</em> heat from gravitational
        contraction and early deuterium (and, above ~65 M♃, lithium) fusion — a "failed star" that never sustains
        hydrogen fusion (that needs ~80 M♃ / 0.075 M☉). So its surface sits at its own <strong>effective
        temperature</strong>, added as an absolute σ·T⁴ term (not a delta) on top of the negligible starlight —
        typically hundreds to a couple of thousand K, far above the equilibrium temperature a distant star would
        give. It <strong>cools with age</strong> (L-dwarf → T → Y, floored near ~250 K — no brown dwarf is colder),
        and — crucially — it becomes a genuine <strong>heat and radiation source for its own moons</strong>: a satellite
        of a young brown dwarf is warmed and (lacking a magnetosphere) heavily irradiated by it, just as a moon of a
        star would be. Tagged <code>thermal/self-luminous</code> (value = its Teff); the effective temperature and
        luminosity show in the Newton panel.</p>
    </section>

    <section id="radiation">
      <h2>Surface radiation</h2>
      <p>Incident flux (≈1 at Earth) is <strong>summed over every luminous source</strong> — each star and each
        <a href="#temp-range">self-luminous brown dwarf</a> contributes <code>Lᵢ / dᵢ²</code> — exactly as the
        equilibrium temperature is (so a moon of a brown dwarf takes a dose from both its star and its host, the
        host normally dominating). The total then splits into photons and particles and is attenuated:
        <strong>magnetosphere</strong> deflects particles (<code>log₁₀</code>-scaled by field strength);
        <strong>atmosphere</strong> blocks both (<code>exp(−shielding·pressure)</code>, per-gas shielding from the
        rulepack). The unshielded reference dose is <strong>{RADIATION_UNSHIELDED_DOSE_MSV_YR} mSv/yr</strong> at 1 AU.
        Rocky bodies add a ~2 mSv/yr terrestrial background. <em>An airless world has no shielding → the full
        dose</em> (Luna ≈ 500 mSv/yr) — it is the most-irradiated case, not zero.</p>
      <p><strong>Flares</strong> add an episodic <em>particle</em> dose on top of the steady wind, scaled by each
        star's flare activity — strongest for <strong>young</strong> stars and <strong>M/K dwarfs</strong> (deep
        convection + fast rotation), declining as the star spins down with age. It rides the particle channel, so a
        magnetosphere + atmosphere shield against it; an unshielded close-in world around a flare star bears the
        brunt. (The old "flaring" tag keyed on luminosity is retired — it now tracks real activity.)</p>
      <p><strong>Every body reports TWO figures, and the difference is the point.</strong> One number cannot answer
        both "what does the ground take" and "what does a ship take". The first is quoted at the surface — or, for a
        world that has no surface, at its <strong>1&nbsp;bar reference level</strong>; for a <strong>ring</strong>,
        in the <strong>ring plane</strong>, which is simultaneously what a fragment takes and what a ship crossing
        takes. The second is the environment <strong>above the atmosphere</strong>, where there is no air to absorb
        anything and a body's own field does not shield it from its own trapped belt — you are inside both. Jupiter
        is the extreme case: about <strong>11&nbsp;mSv/yr</strong> at 1&nbsp;bar and roughly
        <strong>764&nbsp;Sv/day</strong> just above the cloud tops.</p>
      <p><strong>That second figure is quoted at the INNER EDGE OF THE BELTS, and it now says so.</strong> It used
        to be labelled simply "in orbit", which reads as "the dose where a ship parks" — and for Earth that would
        have been wrong by four thousand times. Earth's figure is about <strong>653&nbsp;Sv/yr</strong>, which is
        honest for the inner proton belt and useless as a station-planning number: the ISS at 400&nbsp;km takes
        roughly <strong>150&nbsp;mSv/yr</strong>, because low orbit sits <em>beneath</em> the belts except over the
        South Atlantic Anomaly. So the row names its own altitude, derived per body from where that world's
        atmosphere stops absorbing: Earth reads <em>in the belts, from ~1,262&nbsp;km</em>. Read it as "there is a
        hazardous shell around this world", not as "orbit is lethal here".</p>
      <p>The wording follows the body. An <strong>airless</strong> world has no absorbing layer, so its belt edge
        IS its surface and the two figures are the same number — the second row is simply not shown (Io, Luna,
        Mercury). A <strong>giant</strong> keeps "above the cloud tops", which is the figure that was asked for. A
        <strong>ring</strong> reports the ring plane and, again, only once. Nothing here re-derives a dose: the
        numbers are unchanged and only the place they name is new.</p>
      <p><strong>Belts and rings carry the hazard word too, and one of them is the loudest reading in the Solar
        System.</strong> They used to get no radiation tag at all — not because anyone decided a debris field was
        safe, but because the tag was emitted inside the classification pass, which skips anything that is not a
        planet or a moon. So Jupiter's Rings sat at <strong>360&nbsp;Sv/day</strong>, above Io, with nothing to
        filter or warn on. They are tagged now, on the same test that names the row: somewhere you could actually
        be gets a hazard word, and a giant's notional 1-bar level does not. The Main Belt reads a chronic risk, the
        Kuiper Belt background, Saturn's rings weeks and Jupiter's <em>hours</em>.</p>
      <p>The rest of the classification pass stays switched off for them, and deliberately: a diffuse debris field
        has no dynamo, no tectonic regime, no cratering-sense surface age and no single surface for a habitability
        score, so deriving those would be inventing answers rather than withholding them.</p>
      <p><strong>The hazard is reported as TIME TO HARM, not as a number of sieverts.</strong> A median lethal acute
        dose is about 5&nbsp;Sv (rule-pack data — <code>radiation_ld50_sv</code>), so the survival time is simply
        <code>LD50 ÷ dose rate</code>: <em>hours</em> (Io ≈ 3), <em>days</em> (Europa ≈ 1.3), <em>weeks</em>,
        <em>months</em> (Ganymede ≈ 40 days), <em>years</em> (Mars ≈ 23). Past <strong>50 years</strong> the acute
        model stops meaning anything — chronic low-level exposure kills by cancer risk, not by radiation sickness —
        so the vocabulary changes rather than quoting a figure nobody lives to test: <em>chronic</em> above the
        20&nbsp;mSv/yr occupational limit, <em>background</em> at or below it (Earth sits here, at 2.3&nbsp;mSv/yr
        against a real background of about 2.4).</p>
    </section>

    <!-- Owner, 2026-08-15: explain a designation in simple terms. The SIZE clauses here are the same
         ones the editor shows, from `starClassExplain`, which derives them from the pack's own radius
         band - so this page cannot drift from the physics or from the panel. -->
    <section id="star-designations">
      <h2>Reading a star designation</h2>
      <p>A star's designation is two facts joined together, and it is worth reading them separately.
        The <strong>letter and number</strong> say how hot it is, running O B A F G K M from hottest to
        coolest with the number subdividing each letter. The <strong>roman numeral</strong> says how big
        it has grown, which is a statement about where the star is in its life rather than how hot it
        burns. Two stars can share a letter and have almost nothing else in common:</p>
      <table class="mini">
        <thead><tr><th>Designation</th><th>What it means</th></tr></thead>
        <tbody>
          <tr><td><code>G2V</code></td><td>Main-sequence dwarf, yellow to human eyes, about the size of the Sun &mdash; our own star</td></tr>
          <tr><td><code>G2III</code></td><td>Giant star, yellow to human eyes, roughly ten times wider than the Sun</td></tr>
          <tr><td><code>G2Ia</code></td><td>Luminous supergiant, yellow to human eyes, hundreds of times wider than the Sun</td></tr>
          <tr><td><code>M5V</code></td><td>Main-sequence dwarf, red to human eyes, several times narrower than the Sun</td></tr>
          <tr><td><code>M2Ia</code></td><td>Luminous supergiant, red to human eyes, hundreds of times wider &mdash; Betelgeuse</td></tr>
        </tbody>
      </table>
      <p><strong>The same letter, three different objects.</strong> A <code>G2V</code> and a
        <code>G2Ia</code> have the same surface temperature and therefore the same colour, but the
        supergiant is hundreds of times wider and tens of thousands of times brighter. That is why the
        engine treats the letter alone as saying almost nothing: it fixes the colour and very little
        else.</p>
      <p>Some objects sit outside the sequence entirely, because they are not burning hydrogen in a
        core at all. A <strong>white dwarf</strong> is a dead core about the size of the Earth; a
        <strong>neutron star</strong> is a ball the size of a city; a <strong>magnetar</strong> is a
        neutron star with an extraordinarily strong magnetic field, above 10<sup>14</sup> gauss against
        an ordinary pulsar's 10<sup>12</sup>. The engine does not generate magnetars as a separate kind
        of thing &mdash; it generates neutron stars, draws a field, and reads the label back off it,
        which is what they are in reality.</p>
      <p class="note">Brightness is never stored: it is computed from radius and temperature by
        <code>L = 4&pi;R&sup2;&sigma;T&#8308;</code>, which is exact. A figure that is derived cannot
        drift away from the numbers it came from.</p>
    </section>

    <!-- Placed HERE, beside the other radiation sections, rather than in the star-designation
         section: this is about what a star DOES to its planets, which is what a reader is thinking
         about at this point in the page. -->
    <section id="ionising-output">
      <h2>Ionising output &amp; the corona</h2>
      <p><strong>Brightness and ionising output are two different numbers.</strong> A star's visible
        brightness is fixed by its size and temperature. Its X-ray and extreme-ultraviolet output &mdash;
        the part that strips atmospheres and matters to anything living there &mdash; comes from its
        <em>magnetic field</em> instead. The two usually rise together, because a bigger star has more
        of everything, but they come apart exactly where it counts: a flare changes a star's total
        brightness by about a hundredth of a percent and its X-ray output by a factor of a thousand.</p>
      <p>The engine follows the real relation, in which X-ray output tracks a star's <em>total
        magnetic flux</em> &mdash; field strength across its whole surface, so field times area. That
        relation holds over roughly twelve orders of magnitude, from a single sunspot group to the most
        violently active stars. It is capped at a ceiling that real stars do not cross: past a certain
        point the dynamo stops responding and X-ray output stops climbing, however fast the star spins.</p>
      <p><strong>The exception is the one worth knowing, because it is counter-intuitive: a red giant
        is not a fierce X-ray source.</strong> Past what astronomers call the <em>coronal dividing
        line</em>, a star that is both cool and enormously swollen stops holding a hot corona at all.
        The closed magnetic loops that make X-rays give way to a slow, massive wind. Betelgeuse has no
        detected X-ray corona whatsoever &mdash; so an active red dwarf, ten thousand times dimmer,
        genuinely irradiates its planets far harder than a red giant does. The engine tests this by a
        star's own surface gravity and temperature rather than by its type, so it applies wherever it
        is true and nowhere else.</p>
      <h3>A flare has four possible sources, and only one of them is a star</h3>
      <p>Flare activity is a single 0&ndash;1 figure, and what drives it depends on what the body is.
        Treating them all alike got a quiescent black hole a B star's flare rate, and treating remnants
        as uniformly silent was the over-correction that followed.</p>
      <table class="mini">
        <thead><tr><th>Body</th><th>Mechanism</th><th>Driver</th></tr></thead>
        <tbody>
          <tr><td>Main-sequence star</td><td>Rotation-driven convective dynamo</td><td>Spectral class times an age
            factor. M&nbsp;0.85, K&nbsp;0.55, G&nbsp;0.35, F&nbsp;0.22, A&nbsp;0.16, B/O&nbsp;0.12, because deep
            convection is what flares and low-mass dwarfs are convective throughout. Age spins the star down: a
            young M dwarf runs to 0.85 and an old one to 0.07, which is the whole of the
            quiescent-versus-active distinction for a star.</td></tr>
          <tr><td>Giant or supergiant</td><td>None worth the name &mdash; <strong>0.05</strong></td><td>An evolved star
            is the opposite of a flare star on all three counts: its angular momentum is spread over a radius
            hundreds of times larger, so it turns slowly, and its surface field is weak and disorganised. The rule
            pack says so already &mdash; 100&ndash;1000&nbsp;G for an M dwarf against 0.1&ndash;10&nbsp;G for every giant
            band &mdash; and this reads it rather than inventing a second number.</td></tr>
          <tr><td>Feeding compact object</td><td>Magnetic reconnection in the <em>accretion disc</em></td><td>The
            Eddington fraction, not the surface: a hole fed harder flares harder. At full Eddington it exceeds the
            most active M dwarf, which is the right ordering &mdash; an X-ray binary is among the most violently
            variable things in the sky, and a flare star, however furious, is still a star. Sgr&nbsp;A* does it
            several times a day.</td></tr>
          <tr><td>Magnetar</td><td>Decay of an extreme field &mdash; starquakes</td><td>High and flat at
            <strong>0.9</strong>. Neither age nor accretion enters it; the field is the whole story and is enormous
            by definition. SGR&nbsp;1806&minus;20's giant flares are among the most energetic events recorded in the
            galaxy.</td></tr>
          <tr><td>Quiescent hole, isolated neutron star, isolated white dwarf</td><td>None</td><td>Genuinely
            <strong>zero</strong>: no photosphere, no dynamo, nothing falling in. Set one feeding and it moves to the
            accretion row, whatever its class string says. (An accreting white dwarf is a nova, which is a far
            larger event than a flare and is not modelled here at all.)</td></tr>
        </tbody>
      </table>
      <p class="note">A gas giant is a radiation source too, by a fifth mechanism again: trapped
        particles in its magnetic field, with no light involved. See <a href="#belts">trapped belts</a>.</p>
    </section>

    <section id="stellar-outflows">
      <h2>Jets and shed winds</h2>
      <p><strong>Two things a star throws off are drawn on the maps, and both are derived rather than
        decided.</strong> A <em>jet</em> needs three things at once: a relativistic well to launch from,
        measured as the body's Schwarzschild radius over its own radius (one at a horizon, about a
        third for a neutron star, a ten-thousandth for a white dwarf, a millionth for the Sun); an
        ordered magnetic field to collimate along, from a megagauss up to a pulsar's teragauss; and
        energy to tap &mdash; matter falling in, as the Eddington fraction of a fed black hole, or the
        magnetosphere of a neutron star or magnetar. The well gates everything: a magnetic white dwarf
        has the field and no well, a quiescent black hole has the well and neither power source, and
        neither jets. A star's <strong>stellar/jets</strong> tag carries the result as <em>moderate</em> or
        <em>strong</em>; a known spin multiplies it up and an unknown one is left out rather than guessed.</p>
      <p>The <em>shed wind</em> is Reimers' relation: mass loss proportional to luminosity times radius
        over mass, from the star's own three numbers. The Sun comes out at a few times 10<sup>-13</sup>
        solar masses a year and shows nothing; an Arcturus-like K giant reaches a billionth and earns
        <em>wind</em>; a red supergiant reaches a millionth and earns <em>shell</em>. An O star's
        line-driven wind falls out of the same law because it is bright and large for its mass. The
        <strong>stellar/shedding</strong> tag carries the bucket, and the maps draw the shell from it.</p>
      <p class="note">Nothing in either derivation asks what class a star is. Remove the tag and the
        mark is gone; change the numbers and it comes back on its own.</p>
    </section>

    <section id="radiation-split">
      <h2>Spectral photon/particle split</h2>
      <p>The photon/particle ratio depends on the star's spectral class — cool dwarfs are wind- and flare-dominated,
        so their particle fraction is far higher. Because magnetospheres shield particles but not photons, this
        makes unshielded M-dwarf worlds harsher than Sun-like ones at the same flux.</p>
      <table class="mini">
        <thead><tr><th>Class</th><th>Photon</th><th>Particle</th></tr></thead>
        <tbody>
          <tr><td>O / B</td><td>95%</td><td>5%</td></tr>
          <tr><td>A / F</td><td>93%</td><td>7%</td></tr>
          <tr><td>G (Sun)</td><td>90%</td><td>10%</td></tr>
          <tr><td>K</td><td>86%</td><td>14%</td></tr>
          <tr><td>M</td><td>78%</td><td>22%</td></tr>
          <tr><td>Self-luminous brown dwarf</td><td>75%</td><td>25%</td></tr>
        </tbody>
      </table>
      <p class="note">A brown dwarf is treated as a late-M source rather than by its letter: cool,
        wind-dominated and flare-dominated while it is young, so a moon of one needs a magnetosphere
        to be shielded from it. A star the engine cannot classify falls back to the G row.</p>
    </section>

    <section id="belts">
      <h2>Trapped belts &amp; the giants</h2>
      <p><strong>Every step of a giant's radiation story is counter-intuitive, so read this before assuming any of it
        works like the stellar model above.</strong> A close-in moon of a strong-field giant is not <em>lit</em> by
        its host — it is <strong>bombarded</strong> by charged particles the host's magnetic field has trapped and
        its rotation has accelerated. For Io that is not a correction to the sunlight figure, it is the entire
        answer: the stellar model alone gave Io 21&nbsp;mSv/<em>year</em> where the real surface takes about
        36&nbsp;Sv/<strong>day</strong>. The giveaway was Io and Europa agreeing to four significant figures,
        because distance from the Sun was the only term either of them had.</p>

      <h3>A belt is not a light source, and it does not obey inverse square</h3>
      <p>This is the part most likely to be got wrong. An emitter at a distance falls off as <code>1/r²</code>. The
        Galilean moons flatly refuse that: Io to Europa is <strong>1.6× the distance for 6.7× less dose</strong>
        (<code>r⁻⁴</code>), and Io to Callisto is <strong>4.4× the distance for 360,000× less</strong>
        (<code>r⁻⁸·⁶</code>). No single power law fits both. A belt is not a point source — it is a
        <em>population confined by a field</em> — so it falls off <strong>exponentially in HOST RADII</strong>, and
        that one change fits the whole family:</p>
      <p class="formula"><code>dose(r) = D₀ · (B/B_ref)² · (Ω/Ω_ref) · exp(−r / λ)</code>, &nbsp;
        <code>λ = λ_ref · (B/B_ref)<sup>1/3</sup></code>, &nbsp; r in <strong>host radii</strong></p>
      <p>The exponents are <strong>reasoned, not fitted</strong> — there is only one calibrated system, so fitting
        them would be overfitting. <code>B²</code> is the magnetic energy density available to trap; <code>Ω</code>
        is the corotation drive that energises the particles; and a dipole's magnetopause standoff goes as
        <code>B<sup>1/3</sup></code>, so a weaker host holds a <em>tighter</em> belt as well as a fainter one. That
        compounding is why <strong>Saturn is not merely 18× below Jupiter</strong>: Enceladus takes about
        0.0034&nbsp;Sv/day against Io's 36, roughly ten thousand times less. Only <strong>Io and Callisto</strong>
        were used to calibrate it — the two Galileans with no field of their own, so no self-shielding is baked into
        the law. Europa and Ganymede were held out as <strong>predictions</strong>: Europa lands at 0.71× its
        measured dose, and Ganymede comes out <strong>1.54× HIGH</strong>, which is the right direction, because
        Ganymede is the only moon in the Solar System with its own dynamo and the law does not model that shield.</p>

      <h3>The belt has an INNER EDGE, and without it Earth reads lethal</h3>
      <p>A bare <code>exp(−r/λ)</code> has no lower boundary, so asked about a body's <em>own</em> belt it reports
        the belt peak at the centre of the planet. Run on Earth that gives 2.31&nbsp;Sv/day at the ground — about
        three hundred times the real background, on the best-calibrated body in the model. Real belts stop well
        above the surface because the <strong>atmosphere absorbs trapped particles into the loss cone</strong>: a
        particle whose mirror point lies in dense air is gone within one bounce, not merely attenuated. So the
        boundary is a property of the <em>air</em>, and it sits a fixed number of <strong>scale heights</strong>
        above the reference level — which makes it scale with the atmosphere rather than with the planet. A puffy
        hot atmosphere pushes its belt further out; a thin one lets it come closer; and an <strong>airless body has
        no absorber at all</strong>, so its belt reaches the ground (which is why Ganymede's poles are scoured by
        precipitating particles). Calibrated on the one inner edge that is well measured — Earth's inner belt
        begins near 1.2&nbsp;R⊕ — and the scale-height count is rule-pack data.</p>
      <p><strong>A giant is inside its own belt.</strong> That is new, and it is why a giant needs the two figures
        described above: at Jupiter's 1&nbsp;bar level the belt is absorbed and the dose is a few mSv/yr, while just
        above the cloud tops — past the inner edge — it is hundreds of Sv/day. Both are honest answers to different
        questions, and quoting either alone is misleading.</p>

      <h3>The brown-dwarf boundary — and why Jupiter is correctly excluded</h3>
      <p>Three things are easily conflated here and only one of them is a belt. <strong>Self-luminous bodies really
        do irradiate their moons</strong>, and they always have: from about <strong>13&nbsp;M<sub>jup</sub></strong>
        — the deuterium-burning limit — a substellar object joins the same <code>L/d²</code> sum as the stars, so a
        moon of a brown dwarf takes a genuine dose from its host. Measured on a synthetic system: at
        1&nbsp;M<sub>jup</sub> a moon sees 2&nbsp;mSv/yr; at 13 it sees <strong>104</strong>, and at 40 it sees
        2,626.</p>
      <p><strong>Jupiter is an order of magnitude under that floor and does not qualify, and this is not an
        oversight.</strong> Jupiter's real excess output — about 1.67× the sunlight it absorbs, from
        Kelvin–Helmholtz contraction — is <strong>infrared and non-ionising</strong>. It is a heat source, not a
        dose source. So a GM should expect the opposite of the intuitive answer: Jupiter's moons are savaged not
        because Jupiter <em>shines</em> on them but because it <em>spins a magnetic field</em>, while a brown
        dwarf's moons are irradiated because it genuinely shines. The belt is a separate term from the luminous sum
        and sits beside it; a host with no meaningful field contributes nothing, which is almost every host.</p>
      <p>The belt is a <strong>pure particle-channel</strong> source with no photon component, so it lands in the
        machinery the receiver's magnetosphere and atmosphere already attenuate. It returns zero when the host's
        <strong>spin is unknown</strong> as well as when its field is — an absent rotation is not a claim of a
        stationary host, and inventing a hazard out of a missing input is worse than omitting one.</p>
    </section>

    <section id="fluids">
      <h2>Fluid layers</h2>
      <p>Beyond a single "hydrosphere coverage", a body can carry several distinct <strong>fluid layers</strong>,
        each derived from makeup + temperature + atmosphere:</p>
      <ul>
        <li><strong>Surface ocean</strong> — coverage that is actually liquid (a frozen cap doesn't count).</li>
        <li><strong>Subsurface ocean</strong> — a cold, watery body kept liquid <em>under</em> its ice by active
          tidal/radiogenic heat (Europa/Enceladus). Drives the subsurface-ocean type and the sub-ice habitability niche.</li>
        <li><strong>Cloud decks</strong> — condensed cloud-forming gases (water, sulfuric acid, ammonia, alkali
          metals…), which feed apparent colour. Worked out in full <a href="#clouds">below</a>.</li>
        <li><strong>Deep conductive interior</strong> — metallic hydrogen (gas giants), superionic water (ice
          giants) or molten iron (rocky cores) — the dynamo source for magnetism.</li>
      </ul>
    </section>

    <section id="clouds">
      <h2>Clouds &amp; weather</h2>
      <p>Clouds are not painted on. A world's cloud layers are worked out the way real ones form, and everything
        you see — which substance a cloud is made of, how high it sits, how much sky it covers, whether anything
        falls out of it — comes from that one calculation.</p>

      <h3>It gets colder as you go up</h3>
      <p>Air that rises expands and cools. <em>How fast</em> it cools depends on what the air is made of, and that
        comes from the same per-gas data the greenhouse model uses. Earth's air loses about 10°C per kilometre;
        a giant's hydrogen behaves differently again.</p>
      <p>But it doesn't cool forever. Climb high enough and the air stops churning; up there it just sits and
        radiates heat to space, settling at a temperature set by how much starlight the world receives. This gives
        every world a <strong>coldest possible sky</strong>, and it's the single most important number in the whole
        model. Our estimate lands on about −59°C for Earth (the real tropopause is around −63°C) and −169°C for
        Jupiter (really about −163°C).</p>

      <h3>A cloud forms where a gas runs out of room</h3>
      <p>Any gas can only stay a gas up to a point — cool it enough and it condenses out. As you climb, there's
        less air pressing down, so there's less of any given gas around; but the <em>temperature</em> drops faster
        than the gas thins out. Somewhere those two lines cross, and that height is the bottom of a cloud.</p>
      <p>That single crossing decides everything, including some things by <em>not</em> happening:</p>
      <ul>
        <li><strong>Earth</strong> — water clouds beginning just under a kilometre up. That's about right.</li>
        <li><strong>Saturn has no methane clouds</strong>, even though it carries half again as much methane as
          Jupiter and is colder. Its sky never gets cold enough to condense it. Nothing tells the model to skip
          it — the cloud simply never forms, and what you're seeing instead is the ammonia compound below, which
          is what makes Saturn gold. Getting this right was the whole reason for building the model.</li>
        <li><strong>Uranus does</strong> get methane clouds, being colder still — which is why it's blue and
          Saturn isn't. Same substance, same rule, different answer.</li>
        <li><strong>Mars</strong> — a thin water-ice haze high above a frozen desert, from about two parts in ten
          thousand of water vapour.</li>
      </ul>

      <h3>Rain, snow and rain that never lands</h3>
      <p>Whether anything reaches the ground is the same question asked at the bottom instead of the top: is the
        air down there still able to hold this stuff? If it's close, what falls lands — as rain, or as snow if
        it's below freezing. If the air near the ground is nowhere near saturated, the drops evaporate on the way
        down and never arrive. That last one has a name — <strong>virga</strong> — and it's what Venus's sulfuric
        acid does, and Mars's ice.</p>
      <p>It also explains something that looks backwards. Venus is <em>completely</em> wrapped in cloud on a few
        parts per million of vapour, while Earth carries vastly more water and still has gaps in its sky. The
        difference is that Earth's rain lands: it drains the cloud and leaves clear patches behind. Venus's never
        does, so nothing ever clears. We don't special-case Venus for this; both come out of the same rule.</p>

      <h3>Where we stop</h3>
      <p>Deliberately, we only model the atmosphere <strong>from the reference level upwards</strong> — as far as
        you could see into it. A gas giant has no surface and goes down for thousands of kilometres, getting hotter
        and stranger the whole way; none of that is simulated, because none of it is visible. A giant's quoted
        temperature and pressure are its readings at the 1 bar level, and that's where our sky starts.</p>
      <p><strong>A gas saturated at the ground makes frost, not cloud, and that is why Pluto has no methane
        deck.</strong> A deck needs a level where the air becomes saturated as it rises and cools. If the air is
        already saturated at the surface, the condensate is lying on the ground rather than floating above it, and
        the model reports the frost. Pluto's real haze is photochemical, which is the next thing this model does not
        do.</p>
      <p>Some real things are therefore missing. <strong>Photochemical hazes</strong> — the pale veil over Uranus,
        the orange smog above Titan's methane — are made <em>up there</em> by sunlight breaking gases apart, rather
        than rising from below, so this model can't produce them. Titan's haze is drawn, but from a separate rule.
        And the amount of cloud stuff held aloft uses a fixed droplet size and one calibrated figure for how much
        stays up rather than falling; both are listed under <a href="#fudges">known fudges</a>.</p>

      <h3>Chemistry, and your own chemistry</h3>
      <p>Gases don't only condense — some react. Ammonia and hydrogen sulfide combine into the compound that
        colours Jupiter's belts; sulfur dioxide and water make the acid Venus is wrapped in. These aren't built in:
        they're entries in the rule pack, and you can edit them or write your own under
        <em>Atmospheres → Reactions</em>. Nothing here is a chemistry database — only the handful of reactions
        worth caring about are defined, and if you want krypton and unobtanium to make pink bubblegum clouds,
        the model will take you at your word and work out where they'd form.</p>
      <p>There's a gallery of all this at <code>/discgallery</code>: rows of giants built from nothing but a
        composition, a pressure and a temperature, each row changing one thing so you can see what the model
        actually does with it.</p>
    </section>

    <section id="magnetism">
      <h2>Magnetism</h2>
      <p>A dynamo needs a convecting <em>conductive</em> layer plus <em>rotation</em>. From the interior fluid
        layers + spin we report the implied field — <strong>descriptively, without overriding</strong> the editable
        field-strength value:</p>
      <ul>
        <li><strong>Iron core</strong> + fast spin → Earth-like dipole; slow spin (Venus) or a carbon-rich
          (polymeric C–N–H) layer suppresses it.</li>
        <li><strong>Metallic hydrogen</strong> (gas giant) → strong dipole; <strong>superionic water</strong> (ice
          giant) → tilted, off-centre, multipolar (Uranus/Neptune).</li>
        <li><strong>Induced</strong> — a salty subsurface ocean inside a giant host's magnetosphere carries induced
          currents (Europa); the same moon alone has no field.</li>
      </ul>
      <p>Intrinsic vs induced and the field geometry are explicit; the estimated range is a grounded plausibility
        band, tagged <code>magnetic/dynamo</code>, <code>magnetic/induced</code> or <code>magnetic/unshielded</code>.</p>
    </section>

    <section id="aurora">
      <h2>Auroras</h2>
      <p>An aurora is charged stellar-wind particles funnelled down a planet's magnetic field lines and exciting gas
        in the upper atmosphere. So it needs all three: a <strong>magnetosphere</strong> to channel the particles, an
        <strong>atmosphere</strong> for them to hit, and a <strong>particle flux</strong> to arrive. The tag strength
        (<code>aurora/faint</code> … <code>aurora/brilliant</code>) scales with field strength × atmospheric pressure ×
        incident flux — strongest on a magnetised world close to an active star.</p>
      <p><strong>Colour is the emitting gas</strong>, exactly as on Earth — each species fluoresces at its own
        wavelength when excited:</p>
      <ul>
        <li><strong>Oxygen</strong> → the familiar green (and high-altitude red).</li>
        <li><strong>Nitrogen</strong> (N₂) → blue-violet.</li>
        <li><strong>Carbon dioxide</strong> → violet.</li>
        <li><strong>Hydrogen / helium</strong> → red-pink (the giant-planet palette).</li>
      </ul>
      <p>The renderer reads the dominant auroral gas and paints the oval in that colour. <strong>Shape</strong> is a
        pole-hugging ring (an auroral oval), exaggerated for legibility à la Hubble's Jupiter — stronger auroras reach
        further toward the equator, glow slightly past the limb, and follow the body's <strong>axial tilt</strong>
        along with everything else in its frame (see the visualisation notes below). The Newton panel's
        <em>Aurora</em> layer names the gas and the colour for any world that has one.</p>
    </section>

    <section id="spin">
      <h2>Spin axis, seasons and satellite planes</h2>
      <p><strong>Stars turn too, and some of them are visibly squashed by it.</strong> Until recently no star in the
        engine had a rotation at all, so every star was drawn as a perfect sphere however fast it should have been
        spinning. <strong>Vega</strong> is the case that gives the lie away: it turns at about 236 km/s, close to the
        speed at which it would start throwing material off its own equator, and it is genuinely about a fifth wider
        across the equator than pole to pole. It is now drawn that way, in both the map view and the 3D view.</p>
      <p><strong>Where a star's spin comes from depends on one dividing line — the Kraft break, at roughly 1.3 solar
        masses, or spectral type F5.</strong> It is a real physical boundary rather than a modelling convenience, and
        which side a star falls on decides whether its rotation is <em>calculated</em> or <em>drawn</em>.</p>
      <ul>
        <li><strong>Cooler and lighter than the break</strong> — the star has a churning, convective outer layer. That
          generates a magnetic field, the field grips the star's own outflowing wind, and the wind carries away
          angular momentum as it leaves. So the star <strong>slows down as it ages</strong>, and predictably enough
          that its period can be calculated from its mass and the system's age: period rises with the square root of
          age, and at any given age a redder star turns more slowly. The Sun takes 25 days at 4.6 billion years;
          Barnard's Star, far lighter and much older, takes about 130.</li>
        <li><strong>Hotter and heavier than the break</strong> — no convective layer, so no field, so nothing for the
          wind to grip. These stars <strong>never slow down at all</strong> and keep roughly the spin they were born
          with for their whole lives. That is why Vega is fast: not because it is young, but because nothing has ever
          braked it. Birth spin cannot be recovered after the fact, so this half is drawn from the observed spread —
          as a <em>fraction of the break-up speed</em> rather than a speed in km/s, because break-up depends on mass
          and radius, and a fixed velocity would mean something quite different for one star than another.</li>
      </ul>
      <p>The flattening itself needs no extra assumption: it is the same relation that squashes Jupiter and Saturn,
        applied to a star's own density and spin. A remnant &mdash; a white dwarf, neutron star or black hole &mdash;
        is left out of this entirely, because its spin comes from the collapse that made it rather than from any
        main-sequence history. <strong>A star with no rotation recorded is treated as not spinning, not as unknown</strong>,
        so it stays round rather than being handed an invented spin.</p>
      <p>A world's <strong>axial tilt</strong> is what gives it seasons: the engine's temperature range carries a
        seasonal component driven by it, and below about 12° there is nothing worth calling a season. Until
        recently no generated world had a tilt at all — not zero, but absent — so every generated world reported a
        flat year. They all lean now, and so do their moons.</p>
      <p><strong>Two things set an obliquity, and they do not blend.</strong> A planet condenses from the same
        disc as its star, so it starts near the disc's normal and is nudged from there — most worlds sit modestly
        tilted for the same reason Earth, Mars, Saturn and Neptune all sit between 23° and 29°. A late
        <strong>giant impact</strong> does not nudge an axis, it re-points it, and the result is a direction with
        no memory of the disc at all. That second population is drawn isotropically rather than from a wider
        spread, which is why it lands where Uranus (on its side, 97.8°) and Venus (turning backwards, 177.4°)
        actually are instead of smearing every tipped world toward 90°. A world in that group is tagged
        <code>spin/tipped</code>.</p>
      <p><strong>An inferred figure says so, and that is a promise rather than a disclaimer.</strong> A generated
        world's tilt and rotation period are plausible values from the formation model, not measurements, so they
        carry <code>spin/axis-inferred</code> and <code>spin/period-inferred</code>. The point of the mark is what
        its <em>absence</em> means: Earth's 23.4° and Uranus's 97.8° are observed, and a generated neighbour
        sitting beside them in the same starmap must not read as though somebody had been there. A body whose
        rotation is set by a tidal lock is not marked either — that period is derived from the orbit, not guessed.</p>
      <p><strong>Which plane does a moon orbit in?</strong> Close in, a host's equatorial bulge governs and the
        moon rides its host's tilt — which is why Saturn's inner moons sit in the ring plane, the rings being in
        that same equator. Far out, the star's tide wins and the orbit follows the system plane instead. The
        changeover is the <strong>Laplace radius</strong>, and it is computed per host rather than assumed:
        <code>r_L⁵ = 2·J₂·R²·a_p³·(M_p/M_star)</code>. Our own Moon is the case that shows why it matters — at 60
        Earth radii it is well outside, so its 5.1° is quoted to the ecliptic, and to Earth's equator it wanders
        between 18.3° and 28.6° with no single number to give. Generated moons past their host's Laplace radius
        are declared in the system plane; the ones inside it keep their host's equator.</p>
      <p>J₂ is not something an invented planet has, so it is estimated from the rotation the generator already
        rolled. That is coarser than it sounds and still good enough: the handover radius goes as the fifth root
        of J₂, so being wrong about it by a factor of three moves the boundary by a quarter.</p>
    </section>

    <section id="geology">
      <h2>Geological activity</h2>
      <p>"Volcanic" is not one thing — Earth, Venus and Io are active for mechanically different reasons, with
        opposite consequences for life. The model separates the drivers using makeup (radiogenic budget + iron
        core), mass/radius (cooling rate), <strong>system age</strong> and surface water:</p>
      <ul>
        <li><strong>Plate tectonics</strong> — vigorous interior + surface water → mobile lid → the carbonate–silicate
          cycle regulates climate (Earth).</li>
        <li><strong>Plutonic</strong> — modest interior heat (vigor 0.35–0.6) melts rock at depth but can't reach the
          surface or mobilise the lid: intrusive magmatism (plutons, dykes) under an intact crust — a waning or
          mid-size world.</li>
        <li><strong>Stagnant lid</strong> — vigorous but <em>dry</em> → a single unbroken plate sheds heat quietly.</li>
        <li><strong>Episodic</strong> — a vigorous <em>dry</em> lid traps heat until it overturns in catastrophic global
          resurfacing (Venus, ~700 Myr cycle); no CO₂ drawdown → runaway greenhouse.</li>
        <li><strong>Tidal-volcanic</strong> — tidal flux ≫ radiogenic, silicate lava (Io); <strong>cryovolcanic</strong>
          — icy shell + subsurface ocean (Europa).</li>
        <li><strong>Resonance-pumped cryovolcanic</strong> — a mean-motion resonance keeps pumping the orbital
          eccentricity, and ICE melts at ~273&nbsp;K rather than the ~1000&nbsp;K silicate bar, so modest sustained
          flexing suffices (Enceladus, via Dione's 2:1). Needs an explicit water signal and a pumped e ≥ 0.004.</li>
        <li><strong>Solar-seasonal geysers</strong> — on a very cold (&lt;60&nbsp;K) ice-covered world, sunlight through
          translucent nitrogen ice builds a solid-state greenhouse that erupts gas pockets as geysers (Triton).
          Driven by the distant sun, not interior heat.</li>
        <li><strong>Inactive</strong> — radiogenic heat has decayed below the convection threshold (Mars/Moon).</li>
      </ul>
      <p><strong>Age</strong> is the knob that turns Earth into Mars: radiogenic heat halves roughly every 2.8 Gyr
        and small bodies cool fastest, so <code>geothermalVigor</code> is calibrated to Earth-now ≈ 1 and an
        Earth-clone goes geologically dead by ~9 Gyr. Each body gets a unique <code>geology/*</code> tag.</p>
    </section>

    <section id="surface">
      <h2>Resurfacing &amp; surface features</h2>
      <p>What a world <em>wears</em> is not painted on — it follows from four derived quantities, so a generated
        planet grows a Moon or a Pluto because the physics says so, not because a generator sprinkled it.</p>
      <ul>
        <li><strong>Surface age</strong> — how long the visible crust has been exposed. An active world is repaved on
          its regime's timescale (Io ~2&nbsp;Myr, Earth's ocean floor ~0.2&nbsp;Gyr, Venus ~0.7&nbsp;Gyr, cryovolcanic
          moons ~0.05&nbsp;Gyr); a dead world's surface froze when its vigor last crossed the active threshold — we
          invert the age-decay to recover <em>when</em>, so Mars reads ~3.8&nbsp;Gyr and the Moon ~4.6.</li>
        <li><strong>Volatile-ice retention</strong> — which ices survive on the surface: a species must be present, cold
          enough to stay solid (its phase curve) <em>and</em> gravity-bound (Jeans λ holds the sublimated vapour). So
          Pluto and Triton keep N₂/CH₄/CO₂, the icy Galilean moons keep CO₂+water, Io keeps SO₂ frost, and the Moon
          keeps nothing.</li>
        <li><strong>Irradiation dose</strong> — cumulative space-weathering: stellar UV (from equilibrium temperature)
          plus a cosmic-ray floor so distant dim worlds still weather, cut by any magnetosphere, over the surface age.</li>
      </ul>
      <p>Each renderer (the 2D disc, the 3D holo sphere) draws the SAME features from those quantities:</p>
      <ul>
        <li><strong>Cratering</strong> — density tracks surface age; a young resurfaced world is smooth, an ancient dead
          one saturates. A <strong>tidally-locked</strong> body sweeps up more impactors on its leading (apex)
          hemisphere, so its crater record is lop-sided (strength scales with orbital speed). Fresh craters wear bright
          ejecta rays.</li>
        <li><strong>Ice fractures</strong> — an icy crust under stress <em>cracks</em> rather than holding craters,
          forming a cellular, tortoise-shell lineae network (Europa). A frozen former subsurface ocean expands ~8% and
          splits the crust into a deep <strong>rift</strong> canyon (Charon).</li>
        <li><strong>Regolith greying</strong> — micrometeorite + solar-wind maturation greys an <em>airless</em> silicate
          surface toward neutral; that's why the Moon and Mercury are grey, not the tan of fresh rock. Strength tracks
          the irradiation dose, so fresh surfaces keep colour and ancient ones grey out. Thin-air, oxidised Mars stays
          red — its colour is rust, not space weathering.</li>
        <li><strong>Tholins</strong> — irradiated organic ices redden and darken over time. They need a CH₄/N₂
          precursor (retained surface ice, or a thick CH₄/N₂ atmosphere whose haze rains organics) times the dose —
          which is why ancient Pluto reddens while young, freshly-resurfaced Triton, with the same ices, stays pale.</li>
        <li><strong>Frost</strong> — retained bright ices (N₂/CO₂/water read white-blue, SO₂ sulphur-yellow) frost the
          surface, dulled where the weathering dose is high.</li>
      </ul>
    </section>

    <section id="resonance">
      <h2>Orbital resonances &amp; stability</h2>
      <p><strong>Mean-motion resonances</strong> are detected from period ratios (periods go as a<sup>1.5</sup>):
        two bodies round the same host whose ratio sits within ±1.5% of a small whole-number ratio (2:1, 3:2, …;
        higher-order ratios like 5:3 must be within ±0.5% — wide tolerances tag coincidences). Barycentres
        participate as point masses, which is how Pluto–Charon's pair lands the 3:2 with Neptune. Three
        consecutive ~2:1s are flagged as a <strong>Laplace chain</strong> (Io–Europa–Ganymede's 1:2:4).
        Each resonance is classed by consequence:</p>
      <ul>
        <li><strong>Protective</strong> — a tiny body shepherded by a giant: conjunctions are held away from the
          crossing point, so even orbit-crossing pairs are metastable (Pluto crosses Neptune's orbit and never
          meets it).</li>
        <li><strong>Pumping</strong> — the lock continually re-excites eccentricity against tidal circularisation;
          around a <em>planet</em> host this sustains tidal heating (Enceladus, the Galileans). Heliocentric
          resonances shape orbits but heat nothing.</li>
        <li><strong>Chaotic</strong> — comparable masses packed tightly enough that resonances overlap → ejection
          risk.</li>
      </ul>
      <p><strong>Stability</strong> is an N-body proxy, not an integration: adjacent-pair <em>mutual-Hill spacing</em>
        (Δ &lt; 3.5 critical, &lt; 5.5 tight, &lt; 8.5 marginal), orbit-crossing checks attenuated by inclination
        and mass ratio, Roche-limit and host-radius intersection, Hill-sphere violations for moons and binary
        pairs. Severity maps to a timescale (Very Unstable &lt;1 kyr · Unstable 1–100 Myr · Marginal &gt;100 Myr),
        and the dominant driver yields a predicted <strong>fate</strong>: <em>spirals in</em> (Roche/host
        intersection), <em>flung out</em> (Hill-sphere theft or packed spacing), <em>collision</em>
        (comparable-mass crossing) or <em>hierarchy inversion</em>. Protective resonances cap a crossing pair at
        Marginal. Results surface as <code>stability/*</code>, <code>fate/*</code> and <code>resonance/*</code>
        tags plus the Orbital Stability and Resonance rows in the body panel.</p>
      <h3>Circumbinary worlds &mdash; the annulus, not the outside</h3>
      <p>A planet that orbits <em>both</em> stars of a pair (a <strong>P-type</strong> or circumbinary world)
        does not simply live &ldquo;outside the binary&rdquo;. It lives in a <strong>ring</strong> with two
        edges, and each edge is real physics. Every barycentre publishes both, and everything &mdash; the
        verdict, the explanation, the drawing &mdash; reads the same two numbers.</p>
      <p>The <strong>inner edge</strong> is the <strong>critical semi-major axis</strong>. The pull of a pair
        is not a steady tug from one place: the field <em>turns</em>, twice per binary orbit, and close in
        that forcing pumps a planet's orbit faster than it can settle, until the orbit crosses the stars
        themselves and the first close encounter throws the planet clear. The engine uses the standard
        measured fit &mdash; <strong>Holman &amp; Wiegert (1999)</strong>, who integrated test particles for
        10<sup>4</sup> binary periods and fitted the lowest orbit that survived:</p>
      <p style="margin-left:1.5em"><code>a<sub>c</sub>/a<sub>b</sub> = 1.60 + 5.10e<sub>b</sub> &minus;
        2.2e<sub>b</sub>&sup2; + 4.12&mu; &minus; 4.27e<sub>b</sub>&mu; &minus; 5.09&mu;&sup2; +
        4.61e<sub>b</sub>&sup2;&mu;&sup2;</code></p>
      <p>where <code>a<sub>b</sub></code> is the stars' separation, <code>e<sub>b</sub></code> the pair's
        eccentricity and <code>&mu;</code> the lighter star's share of the total mass. The hole is typically
        <strong>2&ndash;4&times; the separation</strong>, and it widens sharply with eccentricity: an
        equal-mass circular pair clears 2.39&times;, the same pair at e&nbsp;=&nbsp;0.4 clears 3.41&times;.
        Two checks against reality: <strong>Kepler-16b</strong> comes out at 1.09&times; its own limit, which
        is exactly where it is observed to be &mdash; the known circumbinary planet closest to falling in
        &mdash; and Pluto's small moons come out just <em>outside</em> the Pluto&ndash;Charon limit of about
        38,900&nbsp;km, which is where Styx, Nix, Kerberos and Hydra actually orbit.</p>
      <p><strong>The edge is a floor, not a wall</strong>, and the paper says so: unstable islands sit
        <em>above</em> a<sub>c</sub> wherever a planet falls into step with the pair, so clearing the limit
        by a little is not the same as being safe. A world inside the limit reads Very Unstable with the
        <em>flung out</em> fate and wears <code>stability/inside-circumbinary-limit</code>; one clearing it
        by less than 1.2&times; reads Marginal and is given no predicted fate, because &ldquo;near the
        edge&rdquo; is not a prediction. An eccentric orbit whose <em>periapsis</em> dips inside also reads
        Marginal &mdash; the fit was measured on circular orbits, so that case is outside what it tested.
        The fit itself is only valid for &mu; between 0.1 and 0.5 and e<sub>b</sub> up to about 0.7; outside
        that the engine still evaluates it but <strong>says on the panel that the number is extrapolated</strong>,
        rather than quietly presenting an untested figure as a measurement.</p>
      <p>The <strong>outer edge</strong> is where the pair loses its own grip: half the combined-mass
        <em>Hill radius</em> the pair holds within whatever it orbits &mdash; the same half that counts a
        moon as &ldquo;stolen by external tide&rdquo; elsewhere on this page. A pair that <em>is</em> the
        root of its system has no outer edge at all, and the engine publishes none rather than inventing
        a large number to stand for infinity.</p>

      <h3>Lagrange points &amp; trojans</h3>
      <p>A body or construct can be pinned to another body's <strong>Lagrange point</strong>
        (<code>orbit/lagrange</code> tag). The triangular points L4/L5 are genuine free-fall orbits: the
        companion rides the secondary's own ellipse rigidly rotated by ±60° with the same mean anomaly, an
        exact Kepler orbit that keeps the Sun–secondary–trojan triangle equilateral at every instant,
        eccentric orbits included — which is why a trojan coasts there for free. They only <em>hold</em>
        while the masses allow it: <strong>Gascheau's bound</strong> (1843) requires
        (M+m₂+m₃)² ≥ 27·(Mm₂ + Mm₃ + m₂m₃), which for a small trojan is Routh's 27μ(1−μ) &lt; 1 — the
        secondary must stay below about 1/25 of the total mass (Sun–Jupiter passes at μ ≈ 0.001;
        Pluto–Charon would fail at μ ≈ 0.11). A breach reads Very Unstable with the margin quoted, and the
        lighter member wears the <em>flung out</em> fate. The drawn L4/L5 <strong>areas</strong> are the
        tadpole libration regions: radial half-width (8μ/3)<sup>1/2</sup>·a, reaching from ~24° off the
        secondary round to L3 at the widest (Murray &amp; Dermott 1999).</p>
      <p>The collinear points are different animals: <strong>L1/L2</strong> co-rotate on the sun-line at the
        Hill distance — saddle equilibria with no free orbit, where a deviation e-folds in about a sixteenth
        of the orbital period (the 23-day figure every Sun–Earth halo mission plans around). Station-keeping
        holds a craft there; nothing holds a moon, so a body authored at L1/L2 reads Very Unstable and says
        why. <strong>L3</strong> is the antipode — weakly unstable, drifting into a horseshoe passage over
        years to centuries rather than being thrown out.</p>
      <p><strong>A pair can ride a point, not just a body.</strong> (617)&nbsp;Patroclus&ndash;Menoetius is a
        real binary Jupiter trojan &mdash; two ~110&nbsp;km bodies about 680&nbsp;km apart, librating about L4
        together &mdash; so when two bodies at a point become a pair, it is the pair's <em>barycentre</em> that
        sits at the point and the members simply orbit each other. That asks one extra question the single-body
        case never does: <strong>can the pair hold itself together where it sits?</strong> The members orbit
        inside a Hill sphere the pair only has by virtue of being there, so a pair wider than that sphere is
        pulled apart by the primary and the two go their separate ways. Gascheau is also re-asked with the
        pair's <em>combined</em> mass, since a pair is heavier than either half and a trio one body would
        survive can fail once it is doubled. And sharing the secondary's orbit is not a crossing &mdash; that is
        what a trojan <em>is</em>.</p>
      <p>A <strong>construct</strong> may be parked at any of the five, and carries what that costs it as
        <code>flight/fuel-use</code>: <em>coasting</em> at a sound L4/L5, where a free-fall orbit holds it
        for nothing; <em>station-keeping</em> at L1/L2/L3, the periodic trim burns real halo-orbit missions
        budget for; and <em>holding</em> when the trojan regime is breached, because then there is no
        equilibrium left to keep and the ship is simply thrusting to stay put.</p>
    </section>

    <section id="ejection">
      <h2>Who gets ejected — the asymmetry</h2>
      <p>When two orbits genuinely cross, or sit too close in mutual Hill radii to be stable, the outcome is
        <strong>not symmetric</strong>: a packed system sheds its <em>lighter</em> member, and a lightweight
        crosser is scattered out by the heavier body rather than the other way round. The model always meant
        that — the code's own comments said so — but for a long time it recorded the verdict against
        <strong>both</strong> members of the pair, so a 16&nbsp;km asteroid on a Mars-crossing orbit put
        "fated: flung out" on <strong>Mars</strong>.</p>
      <p>Two things are worth taking from that, because both were assumed and both were wrong. The
        <strong>threshold was innocent</strong>: the mutual-Hill test fires below 5.5, and the pair in question
        sat at 9.28, so it never ran. And <strong>debris was already excluded</strong> — belts and rings are
        filtered out before any pairing, because their mass is a density proxy rather than a point mass. The
        fault was one branch below where anyone was looking: the crossing test fired correctly, and the fate was
        then copied onto the wrong body. The assessment now names <em>which</em> body it means.</p>
      <p><strong>A verdict also says which of its reasons produced it</strong>, because several tests look at each
        body and the most severe one owns the outcome. That could read as a contradiction: a world could be told
        "a locked mean-motion resonance keeps their conjunctions away from the crossing point" and then
        "predicted outcome: flung out", with nothing to say those came from different mechanisms. Both halves were
        true — the crossing test really had spared the pair, and a <em>different</em> test had found the body
        outside its host's Hill sphere. So the resonance note now scopes its claim to the crossing it is about,
        and the outcome is printed beside its own cause ("driven by: orbit exceeds host's stable Hill sphere").
        Only when there is more than one driver; with a single reason the cause is already unambiguous.</p>
      <p>The practical reading for a GM: a "fated" tag on a large planet is a claim about its <em>neighbourhood</em>
        only if that planet is the lighter of the pair. Check what it is paired with before rewriting a campaign
        around it.</p>
    </section>

    <section id="eclipses">
      <h2>Eclipses</h2>
      <p><strong>When does something next cover this world's star, and how dark does it get?</strong> An eclipse
        happens <em>somewhere</em>, and the answer is meaningless without saying where — so the observer is
        standing <strong>on the body whose data is open, at the point directly under the occulter</strong>. From
        there exactly three things can pass in front of your star: one of your own satellites, the world you orbit
        if you are a moon, or the partner you share a barycentre with. That third case is not an afterthought:
        Pluto and Charon eclipsed each other every few days through the late eighties, and that is how Charon's
        radius was measured.</p>
      <p>Standing on the <em>surface</em> rather than at the centre is not a detail. It shortens the distance to a
        close occulter by a whole body radius, and for our Moon that 1.7% is the difference between an eclipse
        that just covers the Sun and one that just fails to — which is the entire reason totality exists at all.</p>
      <p><strong>The kind comes from the geometry, not from a threshold.</strong> Comparing the two discs'
        angular radii against their separation gives <strong>total</strong> (the star vanishes behind the
        occulter), <strong>annular</strong> (the occulter sits entirely inside the star's disc and leaves a ring),
        or <strong>partial</strong>. The depth quoted alongside is the fraction of the star's disc <em>area</em>
        covered, from the circle-circle overlap.</p>
      <p>Below a quarter of the disc the sky does not noticeably darken and nobody at the table would look up, so
        those are filtered out rather than reported — that line is also the natural one between an eclipse and a
        mere <strong>transit</strong>, a dot crossing a disc. Deimos from Mars manages about 1% and never appears;
        Phobos manages about 38% and does. And when a shadow simply cannot miss, there is no date to give: the
        answer becomes a recurrence ("every 18 hours"), because that is a day/night cycle rather than an event.</p>
      <p><strong>What is predicted, and what is not.</strong> Real eclipse seasons drift because an orbit's nodes
        precess. The engine holds orbital elements fixed, so the honest description is "when these elements next
        line up", not an ephemeris — every prediction is flagged approximate for that reason. It is exactly right
        for a game and it should say so rather than implying observatory precision.</p>
      <p>None of this runs during a derivation pass. A forward search over the propagator is not free, so it is
        computed on demand for a reader and cached against the clock — the whole reason being that a per-pass cost
        which also broke repeatability has bitten this engine before. The cheap half is the pre-filter: how dark
        an occulter could <em>ever</em> manage is pure arithmetic on orbital radii, so one that could never reach
        the floor is dismissed without a single propagation.</p>
    </section>

    <section id="surface-light">
      <h2>Surface light — the spectrum that reaches the ground</h2>
      <p>Every reference chart of alien plant colour keys on one number: the star's temperature. That is the
        wrong input, and it is wrong in a way that matters. <strong>Plants see the light that reaches the
        ground</strong>, and between the star and the ground sits a sky. So this engine derives a
        <strong>surface spectrum</strong> — the star's own output, filtered — and everything downstream reads
        that instead. The sentence the model can now justify is <em>"its sun is red <strong>and</strong> its sky
        eats what is left"</em>, which is a statement about the SHAPE of a curve rather than about a peak.</p>
      <p>The chain is four steps and each is a real quantity:</p>
      <ul>
        <li><strong>The star.</strong> A Planck curve at the star's photosphere temperature, scaled by the same
          luminosity the radiation model reads, over the same inverse square. There is no second sum.</li>
        <li><strong>Rayleigh scattering.</strong> The λ<sup>−4</sup> that makes a sky blue takes the blue end
          away from the ground. Its depth comes from the atmosphere's own <em>column density</em> —
          pressure over gravity and molar mass, all quantities already present — times a per-gas
          cross-section carried in the rule pack. CO₂ scatters about two and a half times as hard as
          nitrogen; hydrogen about a fifth as hard.</li>
        <li><strong>Absorption bands.</strong> Each gas eats specific bands, authored per species in the pack.
          Water's near-infrared bands, methane's ladder through the red, sulphur dioxide's ultraviolet wall.
          A gas with no authored band simply takes its Rayleigh share, which is the honest answer for
          nitrogen and argon.</li>
        <li><strong>Cloud decks.</strong> A deck is <em>grey</em>: droplets far larger than the wavelength
          scatter every colour alike, which is why an overcast day is dim rather than tinted. It scatters
          rather than absorbs, so there is a floor — an overcast world is not pitch dark underneath.</li>
      </ul>
      <p><strong>A gas giant gets a spectrum too, at the 1-bar level, and the level is named.</strong> Having a
        level is not the same as having a surface, and nothing here re-enables a surface claim on a world
        that has none.</p>
      <h3>Two consumers, one spectrum — and the human eye comes LAST</h3>
      <p>The same curve answers two different questions and they must not be answered the same way. For
        <em>how much light is available to an organism</em>, the measure is the <strong>photon count</strong>:
        photosynthesis is quantum-driven, one photon driving one charge separation whatever its energy, so
        counting joules would over-rank the blue end for a reason biology does not care about. For
        <em>what does it look like</em>, the curve is projected through the human eye's colour-matching
        functions — and that step happens <strong>once, at the very end, on the presentation branch only</strong>.
        The pigment model never reads a colour. Deriving red-green-blue first and choosing a pigment from it
        would smuggle a fact about our retinas (they are green-sensitive) into a claim about alien biology.</p>
      <p>The grid runs {GRID_MIN_NM}–{GRID_MAX_NM} nm in {GRID_STEP_NM} nm steps, and that is deliberately
        <em>not</em> "the visible band" — visible is <strong>our</strong> band. Below about 280 nm a photon
        carries enough energy to break the bonds it would otherwise power; above about 1400 nm it carries too
        little to drive a biological charge separation at all. Both ends are set by molecular physics.</p>
      <p><strong>Reading the plots.</strong> The coloured ribbon under a spectrum's axis is what each wavelength
        looks like to a human eye, and it <em>fades to black at both ends</em> — that is not decoration, it is
        the honest edge of your own vision. Most of the axis carries light you cannot see: a world can be
        drenched in near-infrared and look dim. Where a pigment's absorption is drawn over a spectrum, it is
        plotted as the POWER it takes out of the arriving light, on the same axis and in the same units, rather
        than as a 0&ndash;1 fraction — a fraction drawn against an irradiance axis fills the frame and reads as
        "it absorbs nearly everything" no matter what the light is doing.</p>
      <p><strong>"Peak" is ambiguous and we mean one of them.</strong> A blackbody's peak per unit
        <em>wavelength</em> and per unit <em>frequency</em> sit at different wavelengths, about 1.76× apart.
        Everything here is the per-wavelength peak — 2.898 × 10<sup>6</sup> nm·K / T, so about 500 nm for the
        Sun, which is the figure the charts quote.</p>

      <h3>Try it</h3>
      <p>Everything below is computed live by the same two functions the engine calls on every body in every
        system. Move a slider and you are re-running the physics, not a mock-up of it.</p>
      <SurfaceLightExplorer {pack} />

      <h3>What it looks like from inside</h3>
      <p>All of the above is a curve. This is the same thing at eye level: a familiar reference with a
        world's daylight on one half of it, and a slider to wipe between home and there. It is the answer
        to a question that comes up at a table more often than it should — <em>can they tell which wire is
        the red one?</em></p>
      <p>Two controls, because two things decide a colour. The star's own colour is one. The <strong>sky is
        the other, and it is usually the bigger of the two</strong>: a star shifts everything together and
        your eyes largely follow it, whereas an atmosphere takes specific bands away and nothing gives them
        back. A thick carbon-dioxide sky drags red toward orange; a Venus-like one, passing two per cent of
        what arrives, leaves so little to work with that reds come back pink. How BRIGHT a world is barely
        matters here — it matters enormously to a pigment deciding whether it can afford to be choosy,
        which is what the explorer above is for.</p>
      <UnderThisLight standalone {pack} height={230} />

      <h3>Where this model stops</h3>
      <ul>
        <li>Scattering is treated as extinction, so the sky's own glow is not added back to the ground. Real
          diffuse skylight returns some of that scattered blue.</li>
        <li>Bands are Gaussians at authored centres, not line-by-line radiative transfer.</li>
        <li>One column, straight up. No air mass, no zenith angle, no seasons.</li>
        <li>There is no ozone in the bundled gas set, so Earth's ultraviolet cut is not modelled.</li>
      </ul>
    </section>

    <section id="standing-on-it">
      <h2>Standing on it — brightness, colour and how far you can see</h2>
      <p>The surface spectrum answers what light arrives. Three things follow from it that a GM can actually
        use at a table, and all three are the same derivation read differently.</p>

      <h3>How bright, which is not the same question as what colour</h3>
      <p>A star's cast is something eyes adjust to within the hour. How much light there is, they do not.
        The <strong>midday brightness</strong> figure is the illuminant's own <em>Y</em> — its photopic
        luminance — against Earth's own ground-level noon, so Earth reads exactly 1.</p>
      <p>Venus is the case that makes the distinction earn its keep. About a <strong>fifth of the star's
        energy</strong> reaches its ground, which sounds bright; but the surviving light peaks at
        <strong>920 nm</strong>, out in the infrared, so only about <strong>1.6% of the visible light</strong>
        gets down. Quoting the energy would say "dim". Quoting the luminance says "you would want the lights
        on", which is the true answer. Below about a thousandth of an Earth noon colour drains toward grey,
        because rods carry none — a moonlit world is grey however long you look at it.</p>

      <h3>Why a bounded eye is the honest one</h3>
      <p>Adaptation is modelled per cone, and it is <strong>never complete</strong>. The textbook von Kries
        correction divides by the illuminant's own cone response, which quietly assumes your eyes can discount
        any light however little of it there is. Venus's sky leaves the blue cones half a percent of the light
        they get at home, and that maths answered by amplifying them <strong>134-fold</strong> — which does not
        recover the colour, it recovers the noise. A white card came back pink and a blue wire came back
        violet.</p>
      <p>So the degree of adaptation in each channel is scaled by how much light that channel actually has,
        shot-noise limited, so the trustworthy fraction goes as the square root. The everyday proof of the
        bound is a low-pressure sodium street lamp: under one the world looks orange-grey, not colour-corrected.
        Venus now reads as Venera photographed it — a deep orange world where blues go dark rust.</p>

      <h3>How far you can see, and how far a lamp reaches</h3>
      <p>A sky is dim overhead and a horizon is lost for one reason: light scattered out of the path. So
        visibility is the <a href="#surface-light">same optical depth</a> turned on its side —
        <code>&tau;<sub>550</sub> / H</code>, the column's depth spread over the scale height it occupies —
        and nothing about it is derived twice. Range is Koschmieder's 2% contrast threshold,
        <code>3.912 / &beta;</code>.</p>
      <p>The check that it has not drifted: <strong>Earth comes out at 343 km</strong>, the textbook clean-air
        Rayleigh limit and the reason distant mountains go blue rather than vanishing. <strong>Venus is 4 km</strong>
        of murk from sheer weight of air — its cloud decks condense at 1.5 bar under a 92 bar surface, which is
        ninety bar over your head, so it is not fog. You still cannot see past the horizon, which for a standing
        person is 4.7 km on Earth and 2.4 km on the Moon.</p>
      <p>Lamp reach is Allard's law, out <em>and back</em>:
        <code>&rho;&middot;I&middot;e<sup>&minus;2&beta;d</sup> / (&pi;d&sup2;)</code> against a detection
        threshold. The 2 in that exponent is the whole point — murk eats a lamp twice, on the way to the
        target and on the way back to your eye, which is why lights are so much less use in it than people
        expect. Headlights that throw 720 m on Earth manage 580 m on Venus and about 30 m in fog.</p>

      <h3>What this does not model</h3>
      <ul>
        <li><strong>Photochemical haze</strong> — Titan's tholins, Venus's upper sulphuric aerosol. Not
          modelled at all, because nothing in the rule pack describes it: a haze is not a condensate deck,
          and no gas carries a haze yield. Titan therefore reads far clearer than its orange smog really is.
          This is a genuine <em>data</em> gap rather than a modelling shortcut.</li>
        <li><strong>Water and smoke aerosol</strong> — so Earth reads as its clean-air limit rather than the
          twenty or thirty kilometres a damp day gives you. Its figure is a <em>ceiling</em>.</li>
        <li><strong>Dust is modelled, but crudely.</strong> The dust-storm tag carries a <em>frequency</em>
          and this reads a suspended <em>load</em> off it, which are not the same quantity; and it is mixed
          evenly over a scale height where real dust sits low down, so a storm reads clearer than it is.</li>
        <li><strong>Fog.</strong> Not possible yet at all: telling fog from cloud needs the deck's base
          pressure, and that is computed and then dropped before any consumer sees it.</li>
        <li>Beam shape — a lamp is its on-axis intensity, so these are reaches down the beam, not radii.</li>
        <li>The sky's own glow, which in daylight is what a dark object is lost <em>against</em>. On a world
          with almost no scattering the contrast holds further out than this says.</li>
      </ul>

      <p>The <strong>Surface view</strong> on a body panel draws all of it: that world's own ground and sky,
        its life in the pigments its morphologies settled on, terrain shaped by the tags it already carries,
        markers standing out to where its air gives up, and a spectrum band up each edge — home on the left,
        that world on the right.</p>

      <h3>A world with no ground</h3>
      <p>A gas giant has nothing to stand on, so its Surface view is <strong>the view from a balloon</strong> —
        a soft cloud deck below, darker air above, no hard horizon, because there is no edge to stand at. The
        distance markers become balloons, which is not a joke: an aerostat is the one thing a person could
        genuinely float at depth in such an atmosphere. And the depth is yours to choose, on a slider.</p>
      <p>Everything the slider shows is a read of what the engine already derives. The
        <a href="#clouds">adiabatic profile</a> gives the temperature at any pressure; each cloud deck has a
        base pressure and an optical depth; the light at your level is the starlight dimmed by every deck
        above you — a grey extinction, since droplets scatter every colour alike. So as you descend through
        Jupiter's ammonia deck at about 550&nbsp;mbar the light goes to near nothing, which is not a fault: you
        are under a hundred optical depths of cloud, and what you see is the deck's own faint glow and your
        own lamps. The balloons are re-lit by the light at <em>that</em> depth, not by the 1&nbsp;bar reference.</p>
      <p><strong>How deep it goes, and why it stops at 100&nbsp;bar.</strong> The temperature law is the dry
        adiabat continued down from the 1&nbsp;bar anchor — the same law the cloud model already applies above
        it — and it can be checked against the one descent anyone has made: Galileo's probe into Jupiter. We
        say 319&nbsp;K at 10&nbsp;bar; the probe read about 330. We say about 400&nbsp;K at 22&nbsp;bar; the probe read
        about 425 and died there. A few percent, all the way down. So the slider runs to 100&nbsp;bar, where
        Jupiter is near 640&nbsp;K — and the air's own thermal glow is still nothing a human eye would see, so a
        balloon down there sees by its lamps and otherwise sees black. Past 100&nbsp;bar the things the law
        leaves out — the wet adiabat, opacity growing with density beyond simple scattering, and eventually
        the air's own emission — start to matter, and none of them has been checked, so it stops.</p>
      <p>Two things happen as you descend that the picture shows. The <strong>air thickens</strong>, so the
        same scattering that sets surface visibility scales with density and your sight closes — hundreds of
        kilometres near the top, tens at the bottom, metres inside a deck — and the same haze veils your lamps.
        And the <strong>water deck</strong> appears, a few bar down, on any giant that carries water: it lives
        below the reference level, which is why a renderer looking down from space never sees it and why the
        published cloud tags do not carry it. The bundled Jupiter carries no water at all in its composition,
        so its deep view finds none; that is a catalogue fact, not a limit of the model.</p>
      <p>The "midday brightness" switch means the same here as on the ground: unticked, you see the
        <em>colour</em> of whatever light reaches you, however faint — under the ammonia deck it is a trillionth
        of the light above and it is still ochre. Ticked, you see how dark it is, which under an opaque deck
        is black, because it is.</p>
    </section>

    <section id="biosphere">
      <h2>Biospheres — which pigment, and how much of the ground</h2>
      <p>A world's life is described by four things it already carried — how complex it is, what its chemistry
        is built on, where it gets its energy, and which <em>morphologies</em> are present — plus, now, how
        much of the land each of those covers.</p>

      <h3>Energy source is the gate</h3>
      <p>Only <strong>photosynthetic</strong> life has any reason to be the colour of its star. A chemosynthetic
        vent biosphere does not care what the sky looks like, and a thermosynthetic one still less. So the
        whole pigment derivation is gated on that one field: no photosynthesis, no pigment, and any morphology
        whose definition says it is entirely pigment-coloured then paints nothing at all. That is the right
        answer for life that lives at a vent, and no code anywhere tests for it.</p>

      <h3>The pigment is chosen under competing pressures, not by maximising energy</h3>
      <p>The obvious model — pick whatever absorbs the most light — is <strong>falsified by the one case every
        reader knows</strong>. The Sun's light peaks in the green. Chlorophyll <em>reflects</em> green and
        absorbs either side of it. That is why leaves are green, and a naive maximiser instead predicts black
        vegetation under a Sun-like star.</p>
      <p><strong>Three explanations for that compete and this engine does not pick between them.</strong>
        <em>Path dependence</em>: earlier retinal-based organisms may have occupied the green band first, so
        chlorophyll took what was left — the "purple Earth" hypothesis. <em>Photoprotection</em>: absorbing
        right at the peak overloads the photosystem, so sitting off-peak is a safety margin.
        <em>Steadiness</em>: photosystems may optimise for a steady supply rather than a maximum one, which
        favours the steep flanks of a spectrum over its summit (Arp and colleagues, <em>Science</em>, 2020).
        All three are live; the model scores all three at once and the weights are rule-pack data.</p>
      <p>The three pressures <strong>multiply</strong> rather than adding, which is what lets each one switch
        itself off where it stops meaning anything. Under a dim sky nothing reaches saturation, capture still
        discriminates, and the pigment that takes everything wins — <strong>black vegetation, arrived at
        rather than asserted</strong>. Under a generous sky everything worth considering has enough, capture
        stops separating them, and the decision falls to overload and steadiness. Selectivity scales with
        available energy, and nothing in the code says so.</p>

      <h3>The answer is a ranked set, and the winner is drawn</h3>
      <p>Around a Sun-like star every common pigment is viable; the strongest honest claim is which is most
        <em>widespread</em>. So the engine keeps the whole scored set and <strong>draws</strong> the dominant
        from it, weighted by score and seeded on the body's own id. <strong>That randomness is the model, not
        a placeholder.</strong> Without an evolutionary history a real biosphere's outcome genuinely is
        contingent — nature tries many things and the second best can dominate — so two similar worlds around
        similar stars can legitimately grow different colours. The same world always gives the same answer.</p>

      <h3>Why a world offers the colours it offers</h3>
      <p>The Bio tab lets you <strong>choose</strong> which pigment a world's life settled on, from a list. That
        list is not a palette — it is this world's <em>scored viable set</em>, everything that comes within the
        viability fraction of the leader under the light reaching its ground. A world whose sky eats the red
        will not offer you a red-absorbing pigment near the top, and a starved world will offer you very little
        that is not black.</p>
      <p>So picking a different one is <strong>not correcting the engine</strong>. The model's own claim is that
        several of these would work and history decided between them; changing the answer is choosing a different
        history, not a different physics. That is why it is an ordinary dropdown with no warning attached — and
        why the choice is remembered, as a hand-added <code>biodiversity/pigment</code> tag that the derivation
        reads on every pass. Leave it alone and the weighted draw stands.</p>
      <p>Every pigment in that list is <strong>rule-pack data</strong>, editable under
        <em>Settings &rarr; Planets &rarr; Biospheres</em>: its absorption bands, how broadly it absorbs, and the
        weights that decide between them. Add one of your own and it joins the scoring immediately — there is no
        list of pigments anywhere in the code.</p>
      <p><strong>What your campaign stores is the difference, not the list.</strong> Retint one morphology and
        that is what gets saved — one field of one entry — while everything you did not touch keeps following
        the shipped pack. It matters for more than file size: a campaign that stored its own copy of all five
        would silently stop receiving every later improvement to the defaults, and nobody would be told.</p>

      <h3>The same light colours the ground and the sea</h3>
      <p>The surface spectrum is not only the pigment model's input. A world's <strong>bare ground</strong> and
        its <strong>oceans</strong> are coloured by it too: each material's authored colour is treated as a
        reflectance <em>spectrum</em>, the arriving light is filtered through it, and the result is converted to
        something you can see once, at the end. That is why the same Earth reddens under a red dwarf — not
        because two colour values were multiplied, but because of what its star emitted and what its sky let
        through.</p>
      <p>Said plainly: turning an authored colour back into a spectrum is an <em>upsample</em>, not a
        measurement. Endless different spectra look identical under daylight, and this picks one plausible
        member of that family, flat past the red end because a colour swatch carries no infrared information.
        Authoring real reflectance curves would beat it, and the pack's shape already allows for that.</p>
      <p class="fudge-note"><strong>Not yet through the same path:</strong> the atmospheric haze tint, the cloud
        decks, the giant cloud chemistry and the incandescent glow of a very hot world are still combined as
        plain colours rather than spectra. They are next.</p>

      <h3>The colour is what is left over — and it says whose</h3>
      <p>Vegetation colour is not looked up. It is the surface spectrum minus what the pigment absorbs, minus
        what the surrounding tissue absorbs, projected through the human eye at the last step. Two versions
        are derived and they answer different questions: one <em>adapted</em> to the local star, which shows
        the pigment's own identity the way your eyes would settle after an hour outdoors; and one with the
        star's cast and brightness <strong>left in</strong>, which is what you would see arriving from orbit
        and is what the renderers use. Neither is "the" colour, and both are labelled.</p>

      <h3>Morphologies stack, and the order is the hierarchy</h3>
      <p>Each morphology present carries <strong>its own coverage of the land</strong>, and they are painted in
        list order — microbial first, then fungal over it, then flora over that. Plant life covers fungal;
        fungal colours microbial. <strong>Coverage is of the LAND, not a share of it</strong>: three layers at
        80%, 50% and 60% are independent statements and may total well past 100% without being wrong.</p>
      <p><strong>There are no special rules.</strong> Every morphology is one uniform record and one code path
        reads all of them. Flora having no lights is an <em>empty light range</em> in flora's definition.
        Fauna contributing nothing you can see from orbit is <em>two empty ranges</em> in fauna's — no tints,
        no pigment drive — not a case in the code. Technological life, dark by day and lit by night, is a dark
        tint range and a strong light range, and it needed no code at all. Adding a sixth kind is another
        entry in the pack.</p>
      <p><strong>Where life sits is derived, not decreed.</strong> There is no rule saying "skip the poles".
        The band is wherever the surface temperature keeps the biosphere's <em>own solvent</em> liquid, read
        off the same latitude decomposition the temperature panel shows. On an Earth-like world that empties
        the poles; on a hotter one it empties the equator instead; on a methane world it lands somewhere else
        entirely and nothing in the code knew that was coming.</p>
      <MorphologyStackExplorer {pack} />
      <p><strong>Each morphology draws its own pigment</strong> from that same viable set, on its own seeded
        stream — a world's microbial mats and its plants are separate lineages that made the choice
        separately, and forcing them to agree would throw away the whole point of scoring a set. What the
        engine records on a world is <code>biodiversity/pigment</code> (the one its most extensive
        pigment-driven layer settled on) and <code>biodiversity/land-cover</code>. The rest of the viable set
        is derived and kept, but not tagged — the Bio tab's picker lists it, and six tags per living world
        saying "this would also have worked" is clutter.</p>
      <p>A biosphere that does <em>not</em> photosynthesise has no pigment at all, so there is no star colour
        to take and the model correctly has nothing to say about what it looks like. There, and anywhere else
        you want it, a colour can simply be set by hand on the Bio tab; an authored colour wins outright
        rather than being blended with a guess.</p>
      <p class="fudge-note"><strong>What is not here yet.</strong> Competing populations, which morphology takes
        <em>which</em> pigment, biospheres ageing, and a world's colour changing as its life evolves. Coverage
        per layer plus an order is already the shape those need, so the time-scrubbing falls out of what is
        built rather than replacing it.</p>
    </section>

    <section id="colour">
      <h2>Apparent colour &amp; visualisation</h2>
      <p><strong>A surface is weathered as well as made of something.</strong> Bulk makeup alone gives every
        rocky world the same brown, and two processes pull it apart. <strong>Oxidation</strong> is why Mars is
        red: iron plus an oxidiser gives hematite, and it arrives as a tag. <strong>Space weathering</strong> is
        why the Moon, with the same iron and the same age but no oxidiser, is grey — micrometeorites and the
        solar wind deposit nanophase metallic iron on every grain, which mutes the mineral absorption bands
        until the surface keeps only a faint warm cast. It needs true vacuum, so a world with even a wisp of
        air gets the other one, and an icy crust is exempt because it anneals rather than accumulating iron.
        Maturity is the irradiation dose; fresh crater rays are bright because they are unweathered.</p>
      <p>Both happen <em>here</em>, on the apparent colour, rather than at paint time — they are properties of
        the surface, not of one picture of it. That was a real bug: the greying used to be applied by the
        texture renderers only, so Luna's 2D and 3D views were correctly grey while the colour chip beside
        them stayed brown. One derivation, read by everything.</p>
      <p>Instead of one swatch per class, a body's <strong>true colour</strong> is composed: a surface base from
        makeup fractions, a blue ocean overlay, a tint from the dominant coloured atmospheric gas, condensed cloud
        decks veiling the surface (sulfuric/sulfur/alkali opaque; water patchy, so Earth stays blue), a giant's colour
        from the <a href="#clouds">cloud layers it actually derives</a> rather than a temperature lookup,
        methane-blue ice giants, and incandescence when very hot. The result is kept
        both as a single flattened hex <em>and</em> as the un-mixed <strong>palette</strong> of contributions + a
        band count — so the disc renderer can draw Earth's ocean/land/cloud mix or Jupiter's bands from the same
        derivation.</p>
      <h3>What the disc shows</h3>
      <p>The same derived physics drives a procedural <strong>disc</strong> — used both in the orbital view and in
        The Guide — so a world <em>looks</em> like its numbers. Every feature below is read from a physics-derived
        tag or value, never dialled in:</p>
      <ul>
        <li><strong>Terminator</strong> — the lit/dark divide from the star's direction; pronounced and permanent on
          a <a href="#generation">tidally-locked</a> world.</li>
        <li><strong>Polar ice caps</strong> — frozen caps on worlds cold enough at the poles, sized by climate and
          following the axial tilt.</li>
        <li><strong>Cloud decks &amp; gas bands</strong> — condensed clouds veil the surface; gas giants get
          latitudinal bands. A giant's coloured belts are a <em>deeper</em> cloud layer showing through gaps in the
          one above it, so a world needs the chemistry for two layers to have them — a giant with a single cloud
          layer bands smoothly in its own colour, and one with nothing condensing has a clear sky.</li>
        <li><strong>Polar vortices</strong> — a gas giant's standing polar jet stream can lock into a geometric
          polygon (Saturn's north pole is a famous <em>hexagon</em>; Jupiter's poles hold polygonal cyclone rings).
          Too emergent to predict from bulk parameters, so it's spawned at generation with a side count of 5–8
          carried on the <code>feature/polar-vortex</code> tag — not always six.</li>
        <li><strong>Atmosphere limb-glow</strong> — a soft halo whose thickness scales with surface pressure and
          whose colour comes from the haze.</li>
        <li><strong>Auroras</strong> — the pole-hugging ovals described <a href="#aurora">above</a>, coloured by the
          emitting gas.</li>
        <li><strong>Volcanic incandescence</strong> — glowing vents on tidal-volcanic worlds (Io), clustered near the
          equator.</li>
        <li><strong>Craters</strong> — impact scarring on old, airless, geologically-dead worlds (an atmosphere or an
          active surface erases them).</li>
        <li><strong>Rings</strong> — density-driven brightness, and they tilt with the body's axis.</li>
        <li><strong>Shape</strong> — high spin visibly <strong>oblates</strong> a world and smears its bands; extreme
          spin reaches ellipsoid and toroidal forms (see <a href="#classification">modifiers</a>).</li>
      </ul>
      <p>Rendering order matters: all fields are drawn in the body's own frame and then the whole disc is
        <strong>squashed for oblateness and rotated to the axial tilt as the final step</strong> — so caps, bands,
        auroras and rings all stay locked to the same tilted body, while the star-lit terminator is compensated to
        keep pointing at the star. A gallery of the renderer across compositions, tilts and stellar light lives at
        <code>/discgallery</code>.</p>
    </section>

    <section id="views">
      <h2>Spatial views: grids and routes</h2>
      <p><strong>One grid vocabulary, and one generator behind it.</strong> The 3D starmap, the flat starmap and
        the system view's ground plate all draw their lattice from the same code, so a system snapped to your hex
        in one view lands dead-centre in it in the others. The hex convention is <strong>flat-topped</strong>
        everywhere — the system view used to carry a pointy-topped copy of its own, which was both unreachable and
        already wrong by the time it was found. Square and hex are the two lattices; the caller supplies the cell
        size, the origin and how far to fill, and applies its own pan, zoom or 3D fit on top. Nothing in the
        generator knows which view is asking.</p>
      <p>Grids <strong>fade with distance</strong> rather than being drawn to the horizon at full strength, which
        is what stops a large map turning into a wall of lines and lets the eye keep the bodies rather than the
        graticule. The style is chosen in the preset editor and travels with a player view, so what you set up is
        what your table sees.</p>
      <p><strong>Routes run to the stars, not to their shadows.</strong> Systems in this engine carry a real
        depth — the bundled maps use true 3D positions from astrometry, not a flattened chart — so a route drawn
        on the ground plane ends at a system's <em>projection</em> rather than at the star. Routes are direct
        lines between the systems themselves, through the air. In the flat plan view every system is on the plane
        by definition, so the same code draws the same flat lines and there is no second implementation for the
        2D case.</p>
    </section>

    <section id="habitability">
      <h2>Habitability score</h2>
      <p>A 0–100 weighted score, rebalanced toward current astrobiology thinking — a liquid <strong>solvent</strong>
        is the master variable: solvent (20, +5 for water = 25), temperature against that solvent's band (25),
        atmospheric pressure (18), radiation (17), and surface gravity (15, a weak constraint with a wide 0.5–1.5 g
        tolerance) — the instantaneous <em>surface</em> conditions. The solvent must be genuinely <em>liquid</em>
        (a frozen ice cap scores 0 — its life potential is the subsurface ocean below).</p>
      <p><strong>Which temperature, and it matters more than it sounds.</strong> The score reads the
        <em>mean surface</em> temperature — the average of the day and night sides worked out under
        <a href="#temp-range">temperature range</a> — and never the radiating temperature. The two diverge by 56 K
        on Luna and 130 K on Mercury, and a score keyed on the wrong one is scoring a world nobody could stand on.
        <strong>Be clear about what the band is, too:</strong> it is not the solvent's full liquid range but a
        narrower plateau inside it — 283–298 K for water, falling to zero 40 K either side, with methane and ammonia
        anchored at single points (111 K and 218 K) with a 30 K falloff. So a 340 K ocean world scores poorly on
        temperature although its water is unambiguously liquid. That plateau is a judgement about <em>comfortable</em>
        rather than about <em>liquid</em>, and it is worth knowing which of the two you are reading.</p>
      <p>The solvent factor is weighted <strong>presence-first</strong>: a standing surface liquid is high-value the
        moment it exists, and — for a world with only <em>one</em> known example to calibrate against — the <em>amount</em>
        is a weak signal next to whether it stays liquid at all (which the temperature and pressure factors already
        carry). So coverage feeds a gentle ramp, not an on/off switch: presence alone earns ~60% of the marks, rising
        to full by ~18% coverage. A 2% sea therefore scores high but not maximal — it no longer ties a global ocean.
        Non-water solvents (hydrocarbon, ammonia) take the same ramp at a lower quality ceiling.</p>
      <p>On top of that the model folds in <strong>long-term</strong> factors from the geology and magnetism above:</p>
      <ul>
        <li><strong>Plate tectonics</strong> +8 (carbonate–silicate climate regulation); <strong>stagnant-lid</strong>
          −25 (runaway-greenhouse risk); <strong>tidal-volcanic</strong> −20 (resurfaced too fast); <strong>inactive</strong>
          −10 (no outgassing / nutrient recycling).</li>
        <li><strong>Intrinsic magnetosphere</strong> +5 (shielded); <strong>none</strong> −8 (atmosphere stripping).</li>
        <li>A <strong>subsurface ocean</strong> (cryovolcanic or under-ice) floors the score at 35 with a
          <code>habitability/subsurface</code> tier — sub-ice life is a separate axis from the surface Goldilocks zone.</li>
      </ul>
      <p>Tiers now require geological <em>stability</em>: Earth-like needs water, O₂, ~1 g, low radiation <em>and</em>
        plate tectonics; human-habitable excludes stagnant-lid/tidal-volcanic; alien-habitable is score &gt; 40.
        <strong>Earth is the 100 anchor</strong> — plate tectonics and a magnetosphere are the expected baseline (no
        bonus, only penalties for lacking them). <strong>Super-habitable</strong> worlds can break 100 (capped 130):
        a larger biosphere on a durable-tectonics super-Earth (1.3–3.5 M⊕), a mature stable system (5–9 Gyr) and a
        warm, wet optimum — the Heller &amp; Armstrong idea that Earth is <em>not</em> the most habitable a world can be.</p>
      <p class="caveat"><strong>Honest about the guesswork:</strong> the habitability weights — and the geology/magnetism
        modifiers especially — are <em>heuristic, not first-principles</em>. They're tuned to be <em>plausible</em>
        (Earth scores ~100 with plate tectonics; Venus collapses on its stagnant lid; Europa earns a sub-ice niche),
        and the surface physics still leads, but the exact numbers are judgement calls open to balancing. It scores
        habitability; it does not model biomes (forest/jungle/swamp/ecumenopolis stay GM-assigned).</p>
    </section>

    <section id="classification">
      <h2>Classification — fingerprints</h2>
      <p>A body's <strong>type</strong> (its planet/* class and image) comes from a per-type <strong>fingerprint</strong>:
        the parameter bands that <em>define</em> that type (mass, radius, density, T_eq, flux, escape velocity,
        atmosphere, hydrosphere, tidal, rotation, orbit, star class, eccentricity).</p>
      <ul>
        <li>A body's fit to a band is <code>1</code> inside, decaying over a <em>relative</em> 15% soft edge, <code>0</code> beyond — so a tiny moon can't half-match a giant.</li>
        <li><strong>A type the world matches completely beats one it only nearly matches</strong>, whatever the scores say. If the world sits inside every band a type defines, no type it falls outside of can win — score decides only between types that all fit. Without that rule a heavily-weighted type could buy its way past a better-fitting rival on a single band that was merely close: Pandora, at 45&nbsp;°C mean surface, was reading as <em>earth-like</em> against a band that stops at 42&nbsp;°C, purely because earth-like matched more bands than the types it genuinely fits.</li>
        <li>Within a tier, a type's score is the <strong>mean of its band fits × a mild specificity bonus</strong> for band count. Among clean matches more matched bands still wins (specific beats generic), but a band-rich catch-all whose extra bands are barely-true edge slivers can't out-score a perfect match on fewer bands (summing fits used to let <em>barren</em>/<em>desert</em> steal Venus-class and dwarf-planet-class worlds). Falling fully outside any defining band disqualifies the type.</li>
        <li>The best <strong>base</strong> archetype wins (mutually exclusive); <strong>modifiers</strong> (ringed, ultra-short-period, toroidal, ellipsoid, disrupted) stack on top. The eyeballs are <em>base</em> types, not modifiers — a world is an eyeball instead of being a desert, not as well as.</li>
        <li><strong>A type can also carry GATES, which are preconditions rather than traits.</strong> A gate must hold or the type is ruled out entirely, but passing one earns no score and adds no specificity. The eyeballs are gated on having a solid surface at all (bulk gas under 50%): a permanently-lit dayside is a statement about ground, so a tidally locked gas giant is not an eyeball however hot it is. Fifteen bundled bodies used to be — including three in the Testion example whose own names are "hot neptune", "puffy" and "alkali metal clouds gas giant". <em>Why a gate and not just another band:</em> a band that is true of every body which survives it drags a poor defining band <em>upward</em> by averaging — lifting a 0.11 fit by 37% while lifting a perfect one by 8% — so it rewards the worst matches most. Expressed as a band, the surface test turned six temperate rocky worlds at 278–303&nbsp;K into "cold eyeballs".</li>
        <li><strong>Which TEMPERATURE a fingerprint keys on is a deliberate split, and it moved.</strong> Fourteen
          types whose definition describes a <em>surface</em> — desert, ice, lava, ocean, methane, ammonia, hycean,
          subsurface-ocean, earth-analogue, earth-like, superhabitable, forest, jungle, swamp — key on the
          <strong>surface temperature</strong>. Twelve that describe a <em>radiation environment</em> or a giant's
          cloud-top chemistry — the hot and ultra-hot Jupiters and Neptunes, chthonian, ice-giant, ultra-cool-dwarf
          and the five gas-giant cloud classes — correctly still key on <strong>equilibrium temperature</strong>.
          The giveaway that the bands were authored as surface temperatures all along: <em>earth-analogue</em> asks
          for 255–300&nbsp;K, and Earth's equilibrium temperature is 254.1&nbsp;— just outside its own band, while
          its surface at 287&nbsp;K sits mid-band. This matters beyond tidiness: the stat block prints Type and
          Surface temp two rows apart, so a type keyed on the wrong temperature puts a visible contradiction on the
          page.</li>
        <li><code>gas-giant</code> is a weighted-down fallback, so the specific giant types (hot-jupiter, the cloud-types, …) win when they apply.</li>
        <li>Classification reads raw physics features, <em>not</em> tags — so there's no circularity.</li>
      </ul>
      <p>The fingerprints live in the rulepack (<code>classifier.fingerprints</code>). An overlap guardrail
        (<code>classification.audit</code>) classifies each type's own prototype and fails if a specific type is
        shadowed by a catch-all. The <a href="/?example=Testion-System.json">Testion</a> demo system exercises ~49 types in one go.</p>
    </section>

    <section id="tags">
      <h2>Tags</h2>
      <p>Tags are <strong>orthogonal</strong> to type — conditions and history the class doesn't capture, in
        consistent namespaces:</p>
      <ul class="tags">
        <li><code>origin/*</code> — provenance (migrated, captured)</li>
        <li><code>orbit/*</code> — orbital traits (retrograde, double, tidally-locked)</li>
        <li><code>atmosphere/*</code> — atmosphere conditions (reducing, breathable)</li>
        <li><code>climate/*</code> — climate states (runaway-greenhouse)</li>
        <li><code>hazard/*</code> — hazards (flaring)</li>
        <li><code>structure/*</code> — derived layering (icy-shell, subsurface-ocean, cloud-deck)</li>
        <li><code>tidal/*</code> — tidal hotspots, volcanism, lava-flows</li>
        <li><code>geology/*</code> — tectonic regime (plate-tectonics, stagnant-lid, cryovolcanic, …)</li>
        <li><code>magnetic/*</code> — dynamo (intrinsic / induced / unshielded)</li>
        <li><code>habitability/*</code> — habitability tier (incl. subsurface)</li>
        <li><code>stability/*</code> — n-body instability risk (marginal / unstable / very-unstable), plus
          <code>stability/inside-circumbinary-limit</code> for a world too close to the pair it orbits</li>
        <li><code>resonance/*</code> — mean-motion resonances (2-1, 3-2, …, laplace)</li>
        <li><code>fate/*</code> — predicted end-state of an unstable orbit (infall, eject, collision)</li>
        <li><code>barycenter/auto</code> — auto-generated barycentre marker</li>
      </ul>
      <p>Generation writes provenance; the processor derives the rest from physics on every run. The UI renders each
        tag with a friendly label + a plain-language description of the physics behind it (see
        <code>tagPresentation.ts</code>). Tags that merely duplicated a class were removed (Ocean World →
        planet/ocean, etc.). The full layering is documented in <code>docs/classification-and-tags.md</code>.</p>
    </section>

    <section id="overrides">
      <h2>When you disagree with the physics — GM overrides</h2>
      <p>Everything above describes what the engine <em>works out</em>. None of it is binding on you. There are
        <strong>two</strong> kinds of override and they reach different distances, so it is worth knowing which
        one you are using.</p>

      <h3>Overriding a value — the Overrides tab</h3>
      <p>A body editor has an <strong>Overrides</strong> tab, after Tags. Everything listed there is a number the
        engine normally derives, and pinning one <strong>changes the physics</strong>: the pinned figure is fed
        <em>into</em> the derivation in place of the computed one, before anything downstream runs. Pin a moon’s
        surface temperature at 1100 K and its ice does not survive, its clouds change, its type and its
        habitability follow, and its picture changes with them. Nothing is pasted over a result.</p>
      <ul class="tags">
        <li><strong>Bond albedo</strong> — including <em>negative</em>, which means the surface returns more
          energy than its star delivers. At or above one it reflects everything and reads absolute zero.</li>
        <li><strong>Surface temperature</strong> — the mean. The day and night sides keep their swing about it.</li>
        <li><strong>Bulk density</strong> — mass, radius and density are one relation with two free numbers, so
          pinning density pins the second and you choose whether the mass or the radius gives way. The
          composition is left alone, which is what keeps the contradiction visible. Gravity and escape velocity
          follow the new mass and stay derived.</li>
        <li><strong>Atmospheric pressure</strong> — erosion stops eating it, so a world can hold air it could
          never have retained.</li>
        <li><strong>Magnetosphere</strong> — a field beyond what the interior could generate is kept, drives the
          shielding as a real one would, and is labelled <code>magnetic/anomalous</code> rather than reported as
          an ordinary dynamo.</li>
        <li><strong>Radiogenic heat</strong>, <strong>thermal inflation</strong>, and a star’s
          <strong>magnetic activity</strong> — the flare and X-ray output, which is set by the dynamo rather
          than by brightness.</li>
      </ul>
      <p><strong>Nothing is refused, and nothing is quietly corrected.</strong> This is the same rule the star
        editor has always followed: a set of numbers that breaks physics is kept and labelled rather than
        rejected. Each row shows the range it expects, lets you type well past either end, and says in plain
        words what is wrong with the figure once you do. The consequences <em>are</em> the feature — pin one
        input, let everything downstream derive honestly, and see what falls out.</p>
      <p><strong>Saying why: the Anomaly tag.</strong> Each pin can be given a reason from the Anomaly category —
        Precursor Engineering, Exotic Matter, Nanite Ecology, Magic and the rest, or one you write yourself. The
        tag that reaches the world names the quantities it is accounting for, so a player reading
        <em>Alien Technology: Anomalous magnetosphere, surface temperature</em> learns what is odd about the place rather
        than only that something is. A reason can be kept secret, and a pin with no reason given shows players
        nothing at all. Reset the override and its reason goes with it.</p>
      <p>The Newton trace (the “show the working” panel on a body) puts every pinned figure at the head of the
        panel and marks it again inside each layer whose number it sets — the trace is a record of how an answer
        was reached, so a hand-set answer has to say so.</p>

      <h3>Overriding a tag</h3>
      <p>The other kind. A tag you add by hand <strong>wins</strong>, and it keeps winning: re-processing the
        system, editing the world, importing it again — the override survives all of them, and the engine’s own
        answer for that tag is suppressed rather than left sitting alongside it.</p>
      <p><strong>What a tag override does and does not change.</strong> It replaces the <em>tag</em>, not the
        number behind it. Tagging a world <code>habitability/marginal</code> does not alter its temperature or
        anything computed from them — the figure a later pass reads is still the derived one. So a tag override
        is a statement about how the world should <em>read</em>. If you want the model itself to move, pin the
        value on the Overrides tab, or change an input (composition, orbit, mass) and let the engine re-derive.</p>

      <p><strong>How to tell them apart.</strong> Every tag records where it came from, and the Tags tab groups them
        by exactly that:</p>
      <ul class="tags">
        <li><strong>Derived from the physics</strong> — recomputed on every run. Locked: change the inputs, not the tag.</li>
        <li><strong>Your override</strong> — a physics-namespace tag you added by hand. Shown outlined, and it
          suppresses the engine’s twin. Delete it and the derived answer comes straight back.</li>
        <li><strong>Recorded at generation</strong> — written once when the world was made and never re-derived
          (<code>origin/*</code>, <code>spin/*</code>). You may delete one permanently; nothing will restore it.</li>
        <li><strong>Your tag</strong> — anything of your own that the engine has no opinion about at all.</li>
      </ul>

      <p><strong>One honesty rule worth calling out.</strong> Some generated tags are a claim that a value was
        <em>inferred</em> rather than measured — <code>spin/axis-inferred</code> is the standard case. Type a real
        obliquity in and that claim is retired automatically, because leaving it would mean the world carried a note
        saying "we guessed this" about a figure you supplied.</p>
    </section>

    <section id="reasons">
      <h2>Reasons to visit (RPG hooks)</h2>
      <p>On top of the physics, every world gets <em>game</em> hooks — why a crew would actually go there — so a
        GM has something to point players at. They're inferred from the derived physics (makeup, age, mass,
        temperature, geology, atmosphere and the other tags) plus a <strong>seeded roll</strong> keyed off the body
        id + system seed, so a given system always tags the same way but not every world has everything. Four
        namespaced categories, each toggleable (or off entirely) under <em>Settings → Generation</em>:</p>
      <ul class="tags">
        <li><code>resource/*</code> — extractables: heavy/rare metals, fissiles, helium-3, deuterium, water ice,
          volatiles, hydrocarbons, diamonds, organics, asteroid ore, oxidizer</li>
        <li><code>science/*</code> — research draws: biosignatures, pristine protoplanetary, tidal lab, impact
          record, remnant proximity, resonance showcase, rare world type, exotic chemistry</li>
        <li><code>frontier/*</code> — logistics: gas-giant &amp; water/ice <strong>refuelling</strong> (Traveller-style),
          life-support resupply, aerobraking, gravity assists, waystation sites</li>
        <li><code>intrigue/*</code> — pure bait (low odds): anomalous signals, derelict rumours, uncharted
          features, legends</li>
      </ul>
      <p>Each candidate tag has a physics condition <em>and</em> a probability; the roll advances regardless of which
        categories are enabled, so toggling one category never reshuffles the others. Scientifically plausible
        (helium-3 on giants and old airless regolith; diamonds on carbon-rich high-pressure worlds; fissiles on
        radiogenic crusts; refuelling on hydrogen giants and ice), but deliberately a hook generator, not a
        first-principles resource model.</p>
      <p><strong>A rule that means "you can get this off the ground" now checks that there IS ground.</strong>
        Mining, refuelling and resupply hooks test bulk composition — and a giant satisfies bulk tests trivially,
        because a planet-sized envelope contains a great deal of water and metal by mass. A 751&nbsp;°C helium
        giant was offering life-support resupply, water/ice refuelling and water ice; the water is supercritical
        vapour spread through an atmosphere with no surface under it. Those rules are gated on the same
        <code>makeup.gas &lt; 0.5</code> test the classifier and the habitability score use, so all three agree
        about what a surface is. <em>What a giant keeps</em> is everything you can do from orbit or the upper
        envelope: helium-3, gas skimming, deuterium, aerobraking and gravity assists. Across the bundled maps this
        removed 34 false claims from 59 surfaceless bodies and left all 159 legitimate water-ice tags alone.</p>
    </section>

    <section id="zones">
      <h2>Stellar zones &mdash; the lines drawn on the map</h2>
      <p>Turn <strong>Zones</strong> on in the system view and a set of rings appears. They are not decoration
        and they are not a table of astronomical-unit constants: <strong>every one of them is derived from the
        star's own luminosity, asked at a distance from THAT STAR.</strong> Two consequences follow, and both
        have been got wrong here before.</p>
      <p><strong>Luminosity, never mass.</strong> A frost line goes as &radic;L. For main-sequence stars
        <code>L &prop; M<sup>3.5</sup></code>, so a &radic;M form is not a rough approximation of it &mdash; it is a
        different curve (<code>M<sup>0.5</sup></code> against <code>M<sup>1.75</sup></code>) and it is wrong in
        <em>opposite directions</em> at the two ends. Measured against the luminosity-derived line, the old mass
        form put the frost line <strong>12.9&times; too far out</strong> for an M8 dwarf, 42.6&times; for an L dwarf,
        2.3&times; for a K5 &mdash; and <strong>10&times; too close</strong> for a hot B star. Sol came out at 2.700
        against a true 2.261, near enough to look right, which is exactly why it survived: the one star anybody
        checks is the one star the bug does not show on. Ice worlds formed far too far out around red dwarfs and
        far too close around hot stars, and moons of cold giants were almost never icy.</p>
      <p><strong>Ask the question of the STAR, not of the parent.</strong> For a moon the immediate host is a
        planet, which has no frost line, so the engine walks the parent chain up to the star and uses the body's
        distance from <em>it</em>.</p>

      <h3>There are TWO frost lines, and they answer different questions</h3>
      <p>The map labels them <em>Frost Line (Form.)</em> and <em>Frost Line (Curr.)</em>, and a GM who reads them
        as one line duplicated will misread every icy world in the system.</p>
      <table class="mini">
        <thead><tr><th>Line</th><th>Where</th><th>What it means</th></tr></thead>
        <tbody>
          <tr><td><strong>Formation frost line</strong></td><td>~170&nbsp;K, at the star's luminosity when the
            system was <em>born</em> &mdash; back-calculated from the star's present luminosity and its age</td>
            <td>What a body could have <em>formed</em> as. Beyond it the disc's solid surface density jumps and
            giants become likely, which is why the placement chain starts inside it and giants are drawn outside
            it.</td></tr>
          <tr><td><strong>Current frost line</strong></td><td>~125&nbsp;K, at the star's luminosity <em>now</em></td>
            <td>Where exposed ice is stable <em>today</em>. A world can sit between the two and have formed icy
            without staying icy.</td></tr>
        </tbody>
      </table>
      <p>The same treatment gives the silicate (rock) line, the soot line, the CO<sub>2</sub> ice line, and the CO
        ice line &mdash; and the system's outer limit, which is simply <strong>twice the CO ice line</strong>, so a K
        dwarf's system ends near 4&nbsp;AU, a G star's near 11 and an F star's near 16.</p>

      <h3>The habitable zone, and the caveat it needs</h3>
      <p>The green band is where liquid water is possible <strong>on a world with enough atmosphere</strong>. Its
        outer half assumes a thick carbon-dioxide greenhouse &mdash; Kopparapu's maximum-greenhouse edge &mdash; so a
        thin-aired world out there is genuinely frozen, and that is physics rather than a fault.
        <strong>Mars sits inside the Sun's habitable zone and is a desert of ice.</strong> Earth without its own
        greenhouse would be &minus;18&nbsp;&deg;C at Earth's distance. The band is a statement about where a
        <em>sufficiently thick</em> atmosphere could hold water, not a promise about any particular world.</p>

      <h3>The kill zone has two sources, and that is why an M dwarf is unpredictable</h3>
      <p>The red band close to the star is not a brightness threshold. It is the mean of <strong>two independent
        hazards, each measured relative to Sol</strong>, so that Sol lands on the anchor by construction:</p>
      <ul>
        <li><strong>Surface ultraviolet</strong> &mdash; the fraction of the star's own blackbody output below the
          damage edge, times its luminosity. A hot star pours out a share of hard photons that a cool one does not
          have at all, whatever their brightnesses.</li>
        <li><strong>Coronal ionising output</strong> &mdash; the X-ray and extreme-ultraviolet emission derived in
          <a href="#ionising-output">Ionising output</a>, which follows the magnetic field rather than the
          brightness.</li>
      </ul>
      <p>A star lethal by <em>either</em> route is lethal, and the zone scales as the square root of the combined
        hazard. That is the whole reason <strong>an active M dwarf is dangerous and a quiet one of the same size is
        not</strong>: the first term barely separates them and the second separates them by orders of magnitude.
        Hot stars accordingly show much wider kill and danger zones than their old brightness-driven ones, and quiet
        cool dwarfs much narrower. The <strong>danger zone</strong> outside it is a rule-pack multiple of the kill
        zone (5&times; by default), and both the edge wavelength and the Sol anchor distance are pack data.</p>
      <p class="note">Every constant named here is in the rule pack, under
        <code>generation_parameters</code>: <code>frost_line_base_au</code>, <code>kill_zone_sol_au</code>,
        <code>uv_damage_edge_nm</code>, <code>danger_zone_multiplier</code>. The single implementation is
        <code>physics/zones.ts</code>; nothing else is allowed to derive a second one.</p>
    </section>

    <section id="generation">
      <h2>Auto-generation</h2>
      <p>When you generate a system, the stars come from the HR diagram (aged to the chosen age), and the
        planets are placed <strong>physics-first</strong> in three steps: <em>where</em> the orbits go is set by
        the star; <em>what could be born</em> at each orbit is answered by the same viability model the
        &ldquo;Add planet here&rdquo; picker uses; and <em>which</em> of those viable types is drawn is where the four
        dials act. The chosen type is then <em>built to match</em> (makeup, atmosphere, hydrosphere, iron core&hellip;)
        so the classifier confirms it. Nothing the generator produces is physically impossible for its orbit and
        star; the dials only change how likely each kind of world is, never whether it could exist where it sits.</p>
      <p><em>A note on what these dials are for.</em> They are broad inputs, set by hand to give a system its
        flavour. A wider generator will one day set them automatically &mdash; a star cluster shares its metallicity,
        an association its age &mdash; and the same four numbers will flow in from there.</p>

      <h3>Where the orbits go &mdash; spacing that scales with the star</h3>
      <p>Planet spacing used to be the Solar System&rsquo;s Titius&ndash;Bode sequence in <em>absolute AU</em>, so
        every star &mdash; a red dwarf, a brown dwarf, a supergiant &mdash; was handed the Sun&rsquo;s own orbits
        (0.4, 0.7, 1.0, 1.6, 2.8&nbsp;AU&hellip;) and had the ones outside its zones filtered off. That is why planets
        never generated closer than about half an AU whatever the star, and why brown-dwarf systems sprawled far
        outside anything the star could warm. TRAPPIST-1&rsquo;s seven real planets all sit between 0.011 and
        0.062&nbsp;AU.</p>
      <p>Spacing is now the <strong>ratio between successive orbits</strong>, drawn once per system and varied
        slightly per gap. That is what is genuinely steady in real systems: the Sun&rsquo;s successive ratios average
        about 1.7 (Venus/Mercury 1.85, Earth/Venus 1.39, Mars/Earth 1.52 &hellip; Neptune/Uranus 1.57), TRAPPIST-1&rsquo;s
        about 1.32. A ratio is scale-free, so nothing about the Sun is carried to another star: the chain starts at a
        zone derived from the star&rsquo;s own luminosity (between the dust-condensation edge and the
        <a href="#zones">formation frost line</a>, drawn log-uniformly because real innermost planets span more than
        a decade of orbits) and 1.7 means the
        same thing around a brown dwarf as around a supergiant. It runs out at twice the star&rsquo;s CO ice line &mdash;
        also derived, never a constant &mdash; so a K dwarf&rsquo;s system ends near 4&nbsp;AU, a G star&rsquo;s near
        11, an F star&rsquo;s near 16, and their tails reach to 80&ndash;110. Every zone the placement chain refers to
        is in <a href="#zones">Stellar zones</a>, including the reason there are two frost lines.</p>
      <p><strong>Mutual Hill radii are the floor under the ratio, not the rule.</strong> Two neighbours closer than a
        few mutual Hill radii, <code>R<sub>H</sub> = ((m&#8321;+m&#8322;)/3M<sub>&#9737;</sub>)<sup>1/3</sup> &middot; (a&#8321;+a&#8322;)/2</code>,
        do not survive a gigayear (Pu &amp; Wu 2015: roughly 10 or more). Where the drawn ratio would put a pair
        closer than that, the gap widens to the floor. Because the planet masses are in the expression, the orbits
        either side of a massive body stay clear without that being a special case &mdash; which is the physical reason
        Jupiter&rsquo;s neighbourhood is empty. Every one of these numbers is in the rule pack
        (<code>generation_parameters.orbital_spacing</code>).</p>

      <h3>What could be born here &mdash; one viability model, shared with the picker</h3>
      <p>&ldquo;Which types could exist at this orbit?&rdquo; is asked twice in the engine &mdash; by the generator
        choosing a type for a slot, and by the &ldquo;Add planet/moon here&hellip;&rdquo; picker &mdash; and two places
        answering one question will drift. So it is one function, judging every type&rsquo;s own declared bands against
        the slot, gate by gate: <strong>temperature</strong> (the orbit&rsquo;s equilibrium temperature against the
        type&rsquo;s band, with cold-edge slack for greenhouse types); <strong>mass</strong> (a primary orbit gets a
        <em>planet</em> &mdash; not a pebble, and not a star: asteroids, comets and planetesimals sit below a
        Mercury-ish floor, and brown dwarfs sit above the 13-Jupiter-mass deuterium line that every giant class
        stops at; both edges are pack data); <strong>age</strong> (early formers and late formers &mdash; a
        protoplanet is young, a stripped chthonian core or a helium remnant needs time; the window lives on the
        type as a <em>formation</em> band); <strong>tidal lock</strong> (a type that requires a star-locked world is
        only offered where the orbit can actually despin a planet in the time available &mdash; the eyeball classes
        used to be drawn wherever the temperature fitted, and drawing one <em>made</em> the world locked); and for
        moons, <strong>host fit</strong>.</p>
      <p>The picker shows those gates at the top as switches, and you can turn any of them off to see the wider
        menu <em>despite</em> the physics &mdash; hand authoring is hand authoring, and the tags will say what is
        implausible about the result. The generator keeps every gate on. So the two can never disagree about what
        is viable, only about whether you chose to override it. <strong>And the formation band is one-way:</strong>
        it decides what a slot may be <em>given</em>, never what a body <em>is</em>. A hand-placed chthonian in a
        million-year-old system still classifies as a chthonian.</p>

      <h3>Star hierarchy</h3>
      <p>Two or more stars are nested into a hierarchy of barycentres — paired bottom-up with each level's
        separation widening ~7× for stability — giving the classic forms automatically: a binary
        <code>(A·B)</code>, an Alpha-Cen-like <code>((A·B)·C)</code>, an Epsilon-Lyrae double-double
        <code>((A·B)·(C·D))</code>. Planets are then placed <strong>per node</strong>: an S-type system around each
        star (bounded by ~0.37× its tightest pairing) and P-type circumbinary planets around tight pairs (beyond
        ~2.3× the separation). Tight pairs push their planets circumbinary; well-separated stars each keep their
        own little system.</p>

      <h3>Which one is drawn &mdash; the four dials</h3>
      <p>Among the types that survive the gates, the draw is a product of independent weights, each answering a
        different question. Position has already decided <em>where</em> a giant is viable (beyond the frost line);
        these decide how <em>likely</em> one is drawn there.</p>
      <table class="mini">
        <thead><tr><th>Dial</th><th>Question it answers</th><th>How it acts</th></tr></thead>
        <tbody>
          <tr><td><strong>Metallicity</strong></td><td>did the disc have the material?</td><td>How much rock and metal
            there was to build with. The physics is Fischer &amp; Valenti (2005): giant occurrence rises roughly as
            <code>10<sup>2[Fe/H]</sup></code>, because core accretion must build a solid core fast enough to grab gas
            before the disc dissipates, and a metal-poor disc starves it. So <em>low</em> metallicity means <em>fewer</em>
            giants, not more &mdash; the gas is in every disc; what is missing is the solids to seed a core &mdash; and a
            metal-poor system is a few small rocky worlds and little else. High metallicity gives dense iron and carbon
            worlds and far more gas giants. There is a floor on giants even so: gravitational instability &mdash; the disc
            collapsing directly, no core needed &mdash; is metallicity-blind, so the bottom of the dial is not
            &ldquo;never a giant&rdquo;. Ice-dominated worlds move the other way, weakly. The Sun is somewhat metal-rich
            against the local median, which is why the default sits above the middle. Measured across the dial around
            a Sun-like star: giants per system 0.7 &rarr; 4.2, gassy worlds 9% &rarr; 57%, icy 26% &rarr; 6%, and the median
            planet density falls from 5.5 to 2.4&nbsp;g/cc as the mix turns gassy.</td></tr>
          <tr><td><strong>Disk mass</strong></td><td>how much was there in total?</td><td>Scales the planet count drawn
            from the star-family table by <code>0.4 + diskMass&times;1.6</code> &mdash; sparse (0.4&times;) to massive
            (2&times;). Because the spacing chain packs outward, more planets means the system <em>reaches further</em>:
            a Sun-like star&rsquo;s outermost world moves from a median 0.7&nbsp;AU at the bottom of the dial to 38 at
            the top. This dial changes the system&rsquo;s size, not what its worlds are made of.</td></tr>
          <tr><td><strong>Dynamical history</strong></td><td>how rough was the past?</td><td>Three effects, all
            quadratic in the dial so the top end bites hard. Eccentricity is drawn up to
            <code>0.02 + dyn&sup2;&times;0.45</code> (calm near-circular, violent up to ~0.47). The star&rsquo;s spin
            axis tilts by up to <code>4 + dyn&sup2;&times;60</code> degrees &mdash; a star and its planets condense from
            one disc and stay aligned unless something moved them, so a tilt is evidence of a violent past, not
            decoration. And with probability <code>dyn&sup2;&times;0.4</code> a world is captured spinning backwards
            and tagged <em>origin/captured</em>. A quiet clockwork system against an eccentric, migrated brawl.</td></tr>
          <tr><td><strong>Rarity</strong></td><td>how strange should this be?</td><td>A ladder over each type&rsquo;s
            rarity (0 mundane &hellip; 1 exotic): <code>w(r) = ratio<sup>r</sup></code>, where <em>ratio</em> is simply
            how likely the rarest type is against the most common one, and <code>ln(ratio)</code> moves linearly with
            the dial so every step is the same multiplicative change. It used to be a step &mdash; everything at or
            below the dial equally likely, everything above cut off &mdash; which made an airless rock and an eyeball
            world equally probable at the default and put one exotic class on a third of every population. <strong>The
            default sits at the realistic mix, a quarter of the way along, not in the middle:</strong> below it a
            system only gets duller and few will go there, so three quarters of the travel is left for the strange,
            and the realistic anchor can be as steep as reality is. Nothing is ever excluded at any setting &mdash;
            a legendary world stays possible at the bottom, just very unlikely. Star type nudges it as a separate,
            physical term (eyeballs really are commoner around M dwarfs).</td></tr>
        </tbody>
      </table>
      <p>All three of the pack blocks behind this &mdash; <code>type_rarity_weighting</code>,
        <code>type_metallicity_sensitivity</code>, <code>planet_mass_band_me</code> &mdash; are yours to retune without
        touching code, and each records where its <em>realistic</em> point sits so a banded slider can colour it.</p>
      <p><strong>That colouring is what the strip under each dial is.</strong> Green is where real systems sit,
        amber is possible but unlikely, red is where nothing measured looks like it &mdash; with a one-line verdict
        beneath. It marks how <em>unusual</em> a setting is and never what is allowed: <strong>nothing is forbidden
        at any position on any dial</strong>, and the band edges are rule-pack data
        (<code>generation_parameters.realism_bands</code>, including the wording), so a table running a
        deliberately fantastical setting moves the goalposts rather than fighting them. Note that the green band is
        not centred: rarity's realistic point sits a quarter of the way along, because below it a system only gets
        duller.</p>

      <h3>Importing, and filling out what you imported</h3>
      <p>Every importer &mdash; Universe Sandbox, SpaceEngine, Traveller, the real-sky catalogue &mdash; now
        comes through the same three doors, so a system you bring in and a system you generate cannot drift apart.
        <strong>The star&rsquo;s class</strong>: a stated designation is kept as written, luminosity class included
        (a K giant stays a giant; it used to import as a K dwarf when only the letter was read); a bare letter has
        its class <em>inferred</em> from temperature and radius when the file carries them, because that is what a
        luminosity class physically is; and defaults to main sequence when it cannot &mdash; never a guessed G, and
        nothing usable is left honestly unclassified. <strong>The system&rsquo;s age</strong>: guessed from the
        primary star&rsquo;s own life &mdash; middle-aged for a dwarf, near the end for a giant, cooling age for a
        white dwarf, honestly undated for a brown dwarf &mdash; unless the file states one the star can have; shown
        with the range that star allows and marked <em>estimated</em>. <strong>Infill</strong>: after any import
        the same four dials as above are offered, with an age control bound to the star&rsquo;s life (a flaring
        marker at the young end, because a young flaring system is a real option). Imported worlds are truth
        &mdash; never moved, re-typed or aged; a generated world that would crowd one is dropped, not the import.
        The imported star is truth too &mdash; it is fed to the generator as it is now, not re-aged. Only the
        worlds generated into the system are born into the chosen era. Traveller&rsquo;s <code>W</code> is a hard
        count of primary planets that never includes moons, and its PBG belts and giants are honoured where the
        star&rsquo;s zones allow.</p>

      <h3>Star type &amp; age</h3>
      <p>Planet richness <strong>honours the star</strong>: massive O/B/A stars blow their disks away (few worlds),
        F/G/K/M keep rich disks, brown dwarfs (L/T/Y) get their own table &mdash; discs around them are observed and
        form a few close-in rocky worlds, but a disc a few percent of a stellar one is not building ten &mdash; and
        remnants rarely retain anything. The lookup reads the star&rsquo;s <em>letter</em>, so a G giant is a G and a
        red supergiant is an M. <strong>Age</strong> threads through the whole
        model — it evolves the stars (a newborn is briefly large, cool and over-luminous on the <em>pre-main-sequence</em>,
        contracting onto the main sequence over a time that's longer for lower mass, so a young M dwarf's habitable zone
        starts far out and migrates inward; then the slow main-sequence brightening; eventually red giant → white dwarf),
        decays radiogenic heat (cooling → the tectonic regime), grinds belts down (young = wide, old = narrow), sets
        flare activity, and drives atmospheric escape.</p>
      <p><strong>A red giant cannot cool without limit &mdash; the Hayashi limit says where it stops.</strong> A star
        held up by its own pressure and stirred all the way through by convection has a <em>coldest possible surface
        temperature</em>, somewhere around 3,000&ndash;4,000&nbsp;K depending weakly on its mass. Below that there is
        no stable arrangement of the star at all. It is why the red giant branch runs almost vertically on a
        Hertzsprung&ndash;Russell diagram: a giant swells to enormous size and brightens by a factor of thousands
        while its surface temperature barely shifts, and why real giants of very different origins all end up looking
        much the same colour.</p>
      <p>The engine used to cool an ageing star by a <em>proportion</em> of the temperature it started with, which is
        a reasonable approximation for a Sun-like star and nonsense for anything else &mdash; a small red dwarf was
        driven down to 1,500&nbsp;K, which is not a star. It now cools toward a floor set by the star's own mass, so
        every giant converges on a believable colour whatever it grew from. <em>One thing this deliberately does not
        model:</em> a pulsating star late in its life can dip a little below its own limit, and the limit shifts with
        chemical composition. Both are finer distinctions than the single smooth swelling used here.</p>
      <p><strong>Atmospheric escape</strong> (over the age, planets assumed to form a few Myr in): two age-integrated
        losses thin or strip an atmosphere <em>before</em> greenhouse &amp; radiation read it. <em>Thermal (Jeans)</em>
        — light gases (H₂/He) leave any non-giant; heavier gases need a high escape parameter
        <code>λ = G·M·m / (R·k·T)</code>. <em>Non-thermal (XUV / stellar wind)</em> — strips small, hot, close-in,
        UNSHIELDED worlds, scaled by flux × age × (1 − magnetosphere), and gated off above ~9 km/s escape velocity
        so Earth/Venus/super-Earths keep their air. It only thins or strips, never invents — so a tiny hot world goes
        bare, a shielded super-Earth holds on, and giants keep everything.</p>

      <h3>Tidal locking</h3>
      <p>Whether a world keeps one face toward its host is <strong>derived</strong>, not authored: the
        tidal despinning timescale <code>t ∝ ω·a⁶·m·Q / (M_host²·k₂·R³)</code> (Gladman/Peale) is compared
        to the system age — if it's shorter, the body has had time to lock. The steep <code>a⁶</code>
        dependence means every regular moon, Mercury and close-in (hot-Jupiter-style) worlds despin, while
        the AU-distance planets and the gas giants spin free. It's re-derived every run; the body editor's
        checkbox pins it by hand and skips the assessment.</p>
      <p><strong>Despinning has TWO end states, and only one of them is a permanent face.</strong> The
        usual one is synchronous rotation — one face toward the primary, tagged
        <code>orbit/tidally-locked</code> with <code>orbit/locked-star</code> (a permanent sunward face,
        so an eyeball world) or <code>orbit/locked-planet</code> (a moon, whose whole surface still
        cycles through stellar day and night) saying which. The other is a <strong>captured spin-orbit
        resonance</strong>, which an eccentric orbit can hold instead: Mercury turns three times for
        every two orbits, so its day is its own number — 176 days — and its whole surface sees the Sun.
        A resonant world is tagged <code>orbit/spin-orbit-resonance</code> and carries neither face tag,
        because it has no face to keep. Getting this wrong made Mercury classify as a hot eyeball.</p>

      <h3>End-state vs evolving worlds</h3>
      <p>Aging is <strong>opt-in per body</strong>. A hand-authored, imported or hand-picked world carries the
        <em>end-state</em> its author chose — its atmosphere and type are never rewritten by the engine (re-aging
        an authored world would strip every deliberate trace exosphere and reclassify it; "double-aging").
        Generator-created worlds opt in: their atmospheres are treated as <em>primordial</em> and erode over the
        system age from a stored baseline, so re-processing a system never compounds the loss, and their types
        stay the engine's to derive. Two switches in the body editor control this — <em>Age over system
        lifetime</em> on the atmosphere, and <em>Auto-classify</em> on the type — and hand-editing either
        property switches its aging off automatically.</p>
    </section>

    <section id="baseline">
      <h2>Test fixtures — Sol &amp; Testion</h2>
      <p>Two systems anchor the engine. <strong>Sol</strong> (<code>physics-baseline.test.ts</code>) feeds the real
        solar system stripped of derived data and asserts the engine reproduces reality: Earth ~288 K and 1.013 bar,
        Venus &gt; 700 K, Luna ≈ 500 mSv/yr, Earth/Mars classification, etc. <strong>Testion</strong> is the
        classification analogue — built so each body classifies to a distinct type (49/57 in one system); the gaps
        (rogue, protoplanet, the tiny size-ambiguous bodies, close hot-jupiters) are inherent to a single mature
        bound system.</p>
    </section>

    <section id="fudges">
      <h2>Known fudges</h2>
      <ul>
        <li>Greenhouse forcing is capped to prevent runaway blow-ups on thick atmospheres (it's a forcing model, not a full radiative-convective solve).</li>
        <li>A giant's cooling curve is a calibrated power law in age, not a structural model — pinned to the
          real solar system at one end and matched to the brown-dwarf tracks at the other, but a fit either
          way. Below Jupiter mass it deliberately does not scale with mass at all, because the per-class
          figure already accounts for a smaller giant.</li>
        <li>Gas-giant "surface" temperature and pressure are both reported at a ~1 bar reference level — and this
          is now load-bearing rather than cosmetic, since it is where the <a href="#clouds">atmosphere model</a>
          starts climbing from. Nothing below that level is simulated.</li>
        <li>The coldest-sky temperature treats the atmosphere as one grey absorbing layer. It is a good
          approximation (within a few degrees for Earth, Jupiter and Venus) but it is not a radiative transfer
          solve, and it will be least reliable on worlds unlike those.</li>
        <li>How much cloud is held up rather than falling out uses <strong>one calibrated figure</strong> (about a
          hundredth of what a rising column condenses, on a world where the rain lands) and a single droplet size
          of 10 µm for every substance. Both are grounded in real cloud measurements, but the shape of the
          curve between them is a judgement call — it is the biggest single fudge in the cloud model, and the
          reason Earth lands at roughly two-thirds cloud cover is that we tuned it to.</li>
        <li><strong>Polar vortices are a seeded rule, not fluid dynamics.</strong> The polygonal jet at a
          giant's pole — Saturn's hexagon is the famous one — is a standing wave in a narrow, fast polar
          jet stream. Deriving one properly means solving the circulation of a rotating fluid shell, which
          this engine does not attempt and is not going to. So it is rolled, from the body's own id, against
          three things that are at least the right ingredients: <em>spin</em> decides whether there are polar
          vortices at all, because it is converging jets that make them and a world whose day is far too long
          has no Coriolis force to organise the flow; <em>axial tilt</em> decides how alike the two poles are,
          since a barely-tilted world runs both hemispheres under the same steady forcing while a strongly
          tilted one drives them through hard seasons in antiphase; and the <em>side count</em> is drawn per
          pole, because how many cells a polar cluster settles into follows the size of the cap against the
          local weather scale, and the two hemispheres are not identical. A pole that does not lock a polygon
          still gets a cyclone, just a round one with an eye.
          <br />It reproduces the two we can check — Jupiter, tilted 3°, gets polygons at both poles as
          Juno found (eight cyclones around a central one at the north, five at the south), and Saturn, tilted
          27°, gets its hexagon at one pole and a plain eyed cyclone at the other, as Cassini found. That
          agreement is the rule being sane, not the rule being right: it is a plausible-looking result from a
          seeded draw, and a real giant's pole is doing something far more interesting. If you want a
          particular world to have one, say so with a tag — a hand-added
          <code>feature/polar-vortex</code> always beats the roll.</li>
        <li>Cloud <em>colours</em> are a lookup, not a derivation. Which layers a world has and where they sit is
          computed; what each substance looks like is a chosen swatch per liquid, and the ice-giant blue is a
          hand-picked pair of colours with a temperature threshold between them. The structure is physics; the
          palette is design.</li>
        <li>Photochemical hazes — made high up by starlight rather than rising from below — are not modelled at
          all. Titan's is drawn from a separate rule; Uranus's pale upper veil is simply absent, which is why it
          reads a little more saturated than the real planet.</li>
        <li>The photon/particle split and per-gas shielding coefficients are calibrated, not first-principles.</li>
        <li>Roche/ring limits assume a representative density.</li>
        <li>Classification soft-edge tolerance (15%) and the diagnostic-type weights are tuned, not derived — the audit guard keeps them honest.</li>
        <li>Tidal hotspot peak, the cryo/silicate ceilings and the night-side cold factor are calibrated shapes, not a thermal solve.</li>
        <li>Magnetism reports a grounded <em>range</em>, not a computed field strength; the dynamo scaling is order-of-magnitude.</li>
        <li>The brown-dwarf cooling law (self-luminous effective temperature vs mass &amp; age) is a calibrated fit to the Burrows/Baraffe cooling-track envelope, not a structural/atmosphere model — plausible (a young ~70 M♃ dwarf ~2000 K, an old ~13 M♃ one ~300 K), with a hard ~250 K floor and ~2800 K ceiling.</li>
        <li>Geological vigor is a relative, Earth-calibrated proxy (radiogenic decay + a cooling-retention term), and the regime thresholds are tuned.</li>
        <li>The habitability geology/magnetism modifiers and the subsurface-niche floor are <strong>heuristic guesswork</strong> — plausible and bounded, but judgement calls open to balancing.</li>
        <li>Flare dose is a time-averaged particle enhancement weighted by a calibrated activity model (spectral class + age), not an episodic-event simulation.</li>
        <li>Atmospheric escape is a calibrated heuristic (Jeans thermal + an XUV/stellar-wind erosion term), gated above ~9 km/s escape velocity so the Solar-System baseline is preserved — it only thins or strips, never invents.</li>
        <li>The pre-main-sequence over-luminosity and its Kelvin-Helmholtz timescale (∝ 1/mass) are a calibrated shape for a believable young-star preview, not a stellar-structure solve.</li>
        <li>Resonance detection is a period-ratio tagger (within tolerance bands), not a libration analysis — it can't distinguish a true librating resonance from a near-coincidental ratio.</li>
        <li>The resonant-pumping thresholds (e ≥ 0.004, planet-mass host) are calibrated cutoffs — tuned so Enceladus fires and Ganymede/Dione don't. A resonance-maintained eccentricity now feeds the numeric tidal-heat model (it dissipates from zero forcing, where a transient eccentricity must clear an onset first), with the global-mean contribution still capped at a calibrated few kelvin.</li>
        <li>The solar-seasonal geyser branch is a trigger condition (cold + surface ice), not a sublimation-energy model.</li>
        <li>Predicted fates (infall/ejection/collision) are heuristic outcomes read off the dominant instability driver, not N-body integrations.</li>
        <li>A drawn transit route is a <strong>re-estimate, not the flown path</strong>. Planning a journey produces
          several hundred to several thousand path points; what travels to a player view is about a dozen corner
          points, chosen so that a smooth curve drawn through them tracks the real path to within roughly a fifth
          of a percent of the journey's own length. The 3D view then rebuilds that curve and subdivides it as you
          zoom in, so it stays smooth rather than turning into straight facets. The reason is data rather than
          physics, though not the one you might expect: it is not a saving on traffic. The compact curve IS how
          a ship's position is defined once it is under way. The corner points carry the times they belong to,
          so the GM's view and a player's evaluate the same curve at the same instant rather than one of them
          being told the answer — a player view works out where a ship is for itself, exactly as it already
          does for a planet from its orbital elements. The several-thousand-point path stays where it was
          computed.
          The same estimate is used on the GM's own 3D view, so both see the identical line; the GM's flat map
          still draws the full path point for point. The line is also pinned to the ship itself, so it passes
          <strong>following the GM's clock</strong>, ships in transit are also <em>positioned</em> along this
          same curve, so a moving ship sits exactly on its drawn line. And a player scrubbing their
          <strong>own</strong> clock now sees traffic move too — the ship where it would be at
          <em>their</em> time, not where the GM last left it. That is the same rule the planets have
          always followed: if the view can work a thing out from the time alone, the time is the
          viewer's to choose. A view that is following the GM is unchanged, its clock already being
          his. The one thing a scrubbing view cannot show you is what happens <em>after</em> a ship's
          current plan ends, because where it parks and what it ends up orbiting is the GM's to
          decide and has not happened yet.</li>
        <li>Coasting/adrift transit trajectories drop moons <em>while the clock is moving</em>: the gravity field used to integrate a drifting ship live (and its forecast line) includes only stars and planets, because re-integrating the full satellite census on every clock-slider frame is impractical in a browser. A moon's pull on a heliocentric coast is negligible anyway, and the star and any planet the ship passes still bend the path. Once the clock settles, the forecast upgrades to a one-shot, moon-inclusive plot — fast estimates while you scrub, the accurate path when you stop.</li>
      </ul>
    </section>

    <footer><a href="/">‹ Back to the app</a></footer>
  </main>
</div>

<style>
  .physics {
    display: grid;
    grid-template-columns: 240px minmax(0, 1fr);
    gap: 0;
    min-height: 100vh;
    background: var(--bg-app, #0b0d12);
    color: var(--text, #e8e8e8);
    font-family: var(--font-ui, system-ui, sans-serif);
  }
  .toc {
    position: sticky;
    top: 0;
    align-self: start;
    height: 100vh;
    overflow-y: auto;
    padding: 18px 14px;
    border-right: 1px solid var(--border, #2a2d36);
    box-sizing: border-box;
  }
  .toc .home { font-size: 0.85rem; color: var(--text-muted, #cfcfcf); text-decoration: none; }
  .toc h2 { font-size: 1rem; color: var(--accent, #ff5a1f); margin: 12px 0; }
  .toc ul { list-style: none; padding: 0; margin: 0; display: flex; flex-direction: column; gap: 2px; }
  .toc a { color: var(--text-muted, #cfcfcf); text-decoration: none; font-size: 0.85rem; padding: 4px 6px; border-radius: 6px; display: block; }
  .toc a:hover { background: var(--bg-control-hover, #232733); color: var(--text, #e8e8e8); }
  .body { padding: 32px clamp(20px, 5vw, 64px); max-width: 900px; }
  h1 { color: var(--accent, #ff5a1f); margin: 0 0 8px; }
  .lede { color: var(--text-muted, #cfcfcf); font-size: 1.05rem; line-height: 1.6; max-width: 70ch; }
  section { margin: 30px 0; scroll-margin-top: 16px; }
  section h2 { color: var(--text, #fff); border-bottom: 1px solid var(--border, #2a2d36); padding-bottom: 6px; }
  section h3 { color: var(--accent, #ff5a1f); font-size: 1rem; margin: 20px 0 6px; }
  p, li { line-height: 1.65; color: var(--text, #e2e2e2); }
  ol.layering { line-height: 1.7; padding-left: 1.3em; }
  ol.layering li { margin: 4px 0; }
  .caveat { border-left: 3px solid var(--accent, #ff5a1f); background: var(--bg-panel, #14161c); padding: 10px 14px; border-radius: 0 6px 6px 0; }
  code { background: var(--bg-panel, #14161c); border: 1px solid var(--border, #2a2d36); border-radius: 4px; padding: 1px 5px; font-size: 0.9em; }
  table { border-collapse: collapse; width: 100%; margin: 12px 0; font-size: 0.9rem; }
  table.mini { width: auto; }
  /* A displayed formula: set apart from the prose so the law is readable as a law. */
  p.formula { text-align: center; margin: 1.1rem 0; padding: 0.6rem 0.4rem;
    background: rgba(255,255,255,0.04); border-radius: 6px; line-height: 1.9; }
  th, td { text-align: left; padding: 6px 12px; border-bottom: 1px solid var(--border, #2a2d36); }
  th { color: var(--text-faint, #8a8f9a); font-weight: 600; }
  td.sym { color: var(--accent, #ff5a1f); font-weight: 600; }
  td.num { font-variant-numeric: tabular-nums; }
  ul.tags code { color: var(--accent, #ff5a1f); }
  a { color: var(--link, #6ca6ff); }
  footer { margin: 40px 0 80px; }
</style>
