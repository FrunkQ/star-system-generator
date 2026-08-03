<script lang="ts">
  // /physics — the honesty appendix. Documents the constants, the derivations, the
  // deliberate fudges, and how classification + tags are produced. Stable section IDs
  // (#temperature, #radiation-split, #classification, …) so tooltips can deep-link.
  import { G, UNIVERSAL_GAS_CONSTANT, AU_KM, SOLAR_MASS_KG, SOLAR_RADIUS_KM, EARTH_MASS_KG, EARTH_RADIUS_KM, EARTH_GRAVITY, EARTH_DENSITY, RADIATION_UNSHIELDED_DOSE_MSV_YR } from '$lib/constants';

  const toc = [
    ['layering', 'How the model layers'],
    ['constants', 'Constants'],
    ['gravity', 'Gravity, size & density'],
    ['makeup', 'Interior makeup'],
    ['temperature', 'Equilibrium temperature'],
    ['eccentric-flux', 'Eccentric flux distance'],
    ['greenhouse', 'Greenhouse & surface temp'],
    ['temp-range', 'Temperature range & tidal heat'],
    ['radiation', 'Surface radiation'],
    ['radiation-split', 'Spectral photon/particle split'],
    ['belts', 'Trapped belts & the giants'],
    ['fluids', 'Fluid layers'],
    ['clouds', 'Clouds & weather'],
    ['magnetism', 'Magnetism'],
    ['aurora', 'Auroras'],
    ['geology', 'Geological activity'],
    ['resonance', 'Resonances & stability'],
    ['ejection', 'Who gets ejected'],
    ['colour', 'Apparent colour & visualisation'],
    ['habitability', 'Habitability score'],
    ['classification', 'Classification (fingerprints)'],
    ['tags', 'Tags'],
    ['reasons', 'Reasons to visit'],
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
    ['Dose₀', RADIATION_UNSHIELDED_DOSE_MSV_YR, 'mSv·yr⁻¹', 'Unshielded GCR+SPE dose at 1 AU from a Sun-like star.']
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
        <li><strong>Orbit &amp; stars</strong> → equilibrium temperature → greenhouse, tidal, radiogenic &amp; internal heat → <strong>mean surface temperature</strong> and its <strong>range</strong> (cold night side ↔ tidal-volcanic hotspots).</li>
        <li><strong>Fluid layers</strong> — surface ocean, subsurface (under-ice) ocean, cloud decks, deep conductive interior — derived from makeup + temperature + atmosphere.</li>
        <li><strong>Magnetism</strong> — the dynamo implied by the conductive interior layers + rotation (intrinsic vs induced; dipolar vs tilted/off-centre).</li>
        <li><strong>Geological activity</strong> — tectonic regime + volcanism by <em>mechanism</em>, using makeup, mass/radius, system <em>age</em>, surface water and tidal heat.</li>
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
      <h2>Interior makeup <span class="phase">§2a</span></h2>
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
    </section>

    <section id="eccentric-flux">
      <h2>Eccentric flux distance <span class="phase">04.1</span></h2>
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

      <p>The result is <strong>one</strong> mean surface temperature, and everything downstream reads that same
        number: the <a href="#habitability">habitability</a> temperature score, the classifier, and the display.
        <strong>Radiogenic heat</strong> is a GM override (0 by default — negligible against sunlight for most
        worlds); when set it both warms the surface <em>and</em> drives the world's
        <a href="#geology">geological vigour</a>, so a young or exotic world can run hot and tectonically alive
        independently of its star.</p>
      <p><strong>Clouds are coupled to temperature in BOTH directions</strong>, but not by a single term that
        would double-count: their <em>cooling</em> (reflectivity) is the derived <a href="#temperature">albedo</a>
        above, while their <em>warming</em> is the greenhouse of the gas they condensed from (Venus's clouds are
        its CO₂; Earth's water vapour is in its air at 0.4%). The one gap we fill explicitly: a liquid-water ocean
        whose atmosphere <em>omits</em> water vapour gets an Earth-realistic implied vapour greenhouse — gated off
        when H₂O is already listed, so calibrated worlds are untouched.</p>
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
        winter + night ↔ equator + summer + day, or a tidal hotspot). So Io reads a cold −210 °C night surface
        <em>and</em> ~970 °C lava vents in the same readout. Calibrated loosely to Earth / Mars / the Moon /
        Mercury — heuristic, and axial tilt defaults to 25° when a body doesn't specify one.</p>

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

    <section id="radiation-split">
      <h2>Spectral photon/particle split <span class="phase">04.4</span></h2>
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
        </tbody>
      </table>
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
      <h2>Fluid layers <span class="phase">§2c</span></h2>
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
      <h2>Magnetism <span class="phase">§2d</span></h2>
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
      <p>The practical reading for a GM: a "fated" tag on a large planet is a claim about its <em>neighbourhood</em>
        only if that planet is the lighter of the pair. Check what it is paired with before rewriting a campaign
        around it.</p>
    </section>

    <section id="colour">
      <h2>Apparent colour &amp; visualisation <span class="phase">§2e</span></h2>
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

    <section id="habitability">
      <h2>Habitability score</h2>
      <p>A 0–100 weighted score, rebalanced toward current astrobiology thinking — a liquid <strong>solvent</strong>
        is the master variable: solvent (20, +5 for water = 25), temperature vs that solvent's liquid range (25),
        atmospheric pressure (18), radiation (17), and surface gravity (15, a weak constraint with a wide 0.5–1.5 g
        tolerance) — the instantaneous <em>surface</em> conditions. The solvent must be genuinely <em>liquid</em>
        (a frozen ice cap scores 0 — its life potential is the subsurface ocean below).</p>
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
        <li><code>stability/*</code> — n-body instability risk (marginal / unstable / very-unstable)</li>
        <li><code>resonance/*</code> — mean-motion resonances (2-1, 3-2, …, laplace)</li>
        <li><code>fate/*</code> — predicted end-state of an unstable orbit (infall, eject, collision)</li>
        <li><code>barycenter/auto</code> — auto-generated barycentre marker</li>
      </ul>
      <p>Generation writes provenance; the processor derives the rest from physics on every run. The UI renders each
        tag with a friendly label + a plain-language description of the physics behind it (see
        <code>tagPresentation.ts</code>). Tags that merely duplicated a class were removed (Ocean World →
        planet/ocean, etc.). The full layering is documented in <code>docs/classification-and-tags.md</code>.</p>
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

    <section id="generation">
      <h2>Auto-generation</h2>
      <p>When you generate a system, the stars come from the HR diagram (aged to the chosen age), and the
        planets are placed <strong>physics-first</strong>: every orbit slot is offered only the types that are
        actually <em>viable</em> there (the fingerprint's T_eq band fits the orbit), and the chosen type is then
        <em>built to match</em> (makeup, atmosphere, hydrosphere, iron core…) so the classifier confirms it.
        Nothing the generator produces is physically impossible for its orbit and star.</p>

      <h3>Star hierarchy</h3>
      <p>Two or more stars are nested into a hierarchy of barycentres — paired bottom-up with each level's
        separation widening ~7× for stability — giving the classic forms automatically: a binary
        <code>(A·B)</code>, an Alpha-Cen-like <code>((A·B)·C)</code>, an Epsilon-Lyrae double-double
        <code>((A·B)·(C·D))</code>. Planets are then placed <strong>per node</strong>: an S-type system around each
        star (bounded by ~0.37× its tightest pairing) and P-type circumbinary planets around tight pairs (beyond
        ~2.3× the separation). Tight pairs push their planets circumbinary; well-separated stars each keep their
        own little system.</p>

      <h3>The four knobs</h3>
      <p>Three of the four sliders shape <strong>standard</strong> worlds (the makeup/orbits the engine then derives
        from); only <strong>Rarity</strong> reaches for the strange. They apply to planets/moons before the
        processor re-derives everything.</p>
      <table class="mini">
        <thead><tr><th>Slider</th><th>Controls</th><th>How it acts</th></tr></thead>
        <tbody>
          <tr><td><strong>Rarity</strong></td><td>which type (eccentricity)</td><td>A gate on each type's rarity (0 mundane … 1 exotic): at 0 only basic rock survives; sliding up unlocks standard habitable, then uncommon, then the legendary exotica. These are the loot-box tiers (grey→gold) shown in the add-type picker. A mild boost favours the rare at the top. Star type nudges it (eyeballs around M dwarfs, life worlds around G/K).</td></tr>
          <tr><td><strong>Disk mass</strong></td><td>how many worlds</td><td>Scales the per-star count drawn from the star-type tables by <code>0.4 + diskMass×1.6</code> — sparse (0.4×) to crowded (2×).</td></tr>
          <tr><td><strong>Metallicity</strong></td><td>what they're made of</td><td>Biases interior makeup by ±0.3: high scales metal+rock up &amp; ice+gas down (low does the reverse). Because composition drives the classifier, a metal-rich slot tends to read iron/silicate/terrestrial, a metal-poor one ice/ocean/sub-neptune — always within the standard family.</td></tr>
          <tr><td><strong>Dynamical history</strong></td><td>orbit shapes</td><td>Draws eccentricity up to <code>0.02 + dyn²×0.45</code> (calm near-circular → violent ~0.46), and past 0.7 starts flipping some worlds to retrograde — a quiet clockwork system vs an eccentric, migrated brawl.</td></tr>
        </tbody>
      </table>

      <h3>Star type &amp; age</h3>
      <p>Planet richness <strong>honours the star</strong>: massive O/B/A stars blow their disks away (few worlds),
        F/G/K/M keep rich disks, remnants rarely retain anything. <strong>Age</strong> threads through the whole
        model — it evolves the stars (a newborn is briefly large, cool and over-luminous on the <em>pre-main-sequence</em>,
        contracting onto the main sequence over a time that's longer for lower mass, so a young M dwarf's habitable zone
        starts far out and migrates inward; then the slow main-sequence brightening; eventually red giant → white dwarf),
        decays radiogenic heat (cooling → the tectonic regime), grinds belts down (young = wide, old = narrow), sets
        flare activity, and drives atmospheric escape.</p>
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
        dependence means every regular moon, Mercury and close-in (hot-Jupiter-style) worlds lock, while
        the AU-distance planets and the gas giants spin free. It's surfaced as <code>orbit/tidally-locked</code>
        and re-derived every run; the body editor's checkbox pins it by hand and skips the assessment.</p>

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
  .phase { font-size: 0.7rem; color: var(--on-accent, #fff); background: var(--accent, #ff5a1f); border-radius: 999px; padding: 2px 8px; vertical-align: middle; margin-left: 8px; }
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
