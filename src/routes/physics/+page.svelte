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
    ['fluids', 'Fluid layers'],
    ['magnetism', 'Magnetism'],
    ['geology', 'Geological activity'],
    ['colour', 'Apparent colour'],
    ['habitability', 'Habitability score'],
    ['classification', 'Classification (fingerprints)'],
    ['tags', 'Tags'],
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
        <li><strong>Orbit &amp; stars</strong> → equilibrium temperature → greenhouse, tidal &amp; internal heat → <strong>mean surface temperature</strong> and its <strong>range</strong> (cold night side ↔ tidal-volcanic hotspots).</li>
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
        temperature at distance <code>d</code> is <code>T_eq = [ L·(1−A) / (16·π·σ·d²) ]^¼</code>, summed over
        all stars in the system (binaries add their fluxes).</p>
      <p><code>A</code>, the Bond albedo, is now <strong>derived</strong>, not dialled in: a surface reflectivity
        from the makeup (dark ocean ~0.06, rock ~0.15, bright ice ~0.62) plus the <strong>cloud decks</strong> that
        condense at the world's temperature (water ~0.5, CO₂ ~0.7, sulfuric ~0.75, methane haze ~0.3). A liquid
        ocean makes its own water clouds — that's where Earth's 0.30 comes from. Because clouds depend on
        temperature and temperature depends on albedo, it's solved as a quick fixed point. A manually-pinned
        albedo still wins, but is no longer needed — tweak the makeup/atmosphere and the albedo follows.</p>
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
      <p>Surface temperature composes the equilibrium temperature with additive deltas: greenhouse forcing
        (from atmospheric composition + pressure, capped to avoid runaway blow-ups), tidal heating, radiogenic
        heat, and giant internal heat. The greenhouse model and its cryo/CIA parameters live in the rulepack
        (<code>climateModel.greenhouse</code>) so they're tunable, not hard-coded.</p>
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
    </section>

    <section id="radiation">
      <h2>Surface radiation</h2>
      <p>Incident stellar flux (≈1 at Earth) splits into photons and particles, then is attenuated:
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

    <section id="fluids">
      <h2>Fluid layers <span class="phase">§2c</span></h2>
      <p>Beyond a single "hydrosphere coverage", a body can carry several distinct <strong>fluid layers</strong>,
        each derived from makeup + temperature + atmosphere:</p>
      <ul>
        <li><strong>Surface ocean</strong> — coverage that is actually liquid (a frozen cap doesn't count).</li>
        <li><strong>Subsurface ocean</strong> — a cold, watery body kept liquid <em>under</em> its ice by active
          tidal/radiogenic heat (Europa/Enceladus). Drives the subsurface-ocean type and the sub-ice habitability niche.</li>
        <li><strong>Cloud decks</strong> — condensed cloud-forming gases (water, sulfuric acid, ammonia, alkali
          metals…), which feed apparent colour.</li>
        <li><strong>Deep conductive interior</strong> — metallic hydrogen (gas giants), superionic water (ice
          giants) or molten iron (rocky cores) — the dynamo source for magnetism.</li>
      </ul>
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

    <section id="geology">
      <h2>Geological activity</h2>
      <p>"Volcanic" is not one thing — Earth, Venus and Io are active for mechanically different reasons, with
        opposite consequences for life. The model separates the drivers using makeup (radiogenic budget + iron
        core), mass/radius (cooling rate), <strong>system age</strong> and surface water:</p>
      <ul>
        <li><strong>Plate tectonics</strong> — vigorous interior + surface water → mobile lid → the carbonate–silicate
          cycle regulates climate (Earth).</li>
        <li><strong>Stagnant lid</strong> — vigorous but <em>dry</em> → trapped heat, episodic resurfacing, runaway
          greenhouse (Venus).</li>
        <li><strong>Tidal-volcanic</strong> — tidal flux ≫ radiogenic, silicate lava (Io); <strong>cryovolcanic</strong>
          — icy shell + subsurface ocean (Europa).</li>
        <li><strong>Inactive</strong> — radiogenic heat has decayed below the convection threshold (Mars/Moon).</li>
      </ul>
      <p><strong>Age</strong> is the knob that turns Earth into Mars: radiogenic heat halves roughly every 2.8 Gyr
        and small bodies cool fastest, so <code>geothermalVigor</code> is calibrated to Earth-now ≈ 1 and an
        Earth-clone goes geologically dead by ~9 Gyr. Each body gets a unique <code>geology/*</code> tag.</p>
    </section>

    <section id="colour">
      <h2>Apparent colour <span class="phase">§2e</span></h2>
      <p>Instead of one swatch per class, a body's <strong>true colour</strong> is composed: a surface base from
        makeup fractions, a blue ocean overlay, a tint from the dominant coloured atmospheric gas, condensed cloud
        decks veiling the surface (sulfuric/sulfur/alkali opaque; water patchy, so Earth stays blue), gas-giant
        cloud colours by temperature, methane-blue ice giants, and incandescence when very hot. The result is kept
        both as a single flattened hex <em>and</em> as the un-mixed <strong>palette</strong> of contributions + a
        band count — so a future sphere/shader renderer can draw Earth's ocean/land/cloud mix or Jupiter's bands
        from the same derivation.</p>
    </section>

    <section id="habitability">
      <h2>Habitability score</h2>
      <p>A 0–100 weighted score, rebalanced toward current astrobiology thinking — a liquid <strong>solvent</strong>
        is the master variable: solvent (20, +5 for water = 25), temperature vs that solvent's liquid range (25),
        atmospheric pressure (18), radiation (17), and surface gravity (15, a weak constraint with a wide 0.5–1.5 g
        tolerance) — the instantaneous <em>surface</em> conditions. The solvent must be genuinely <em>liquid</em>
        (a frozen ice cap scores 0 — its life potential is the subsurface ocean below).
        On top of that the model folds in <strong>long-term</strong> factors from the geology and magnetism above:</p>
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
        <li>A type's score is the <strong>sum of its band fits</strong>, so more-specific types (more matched bands) outrank generic ones. Falling fully outside any defining band disqualifies the type.</li>
        <li>The best <strong>base</strong> archetype wins (mutually exclusive); <strong>modifiers</strong> (ringed, eyeball, ultra-short-period, toroidal, ellipsoid, disrupted) stack on top.</li>
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
        <li><code>orbit/*</code> — orbital traits (retrograde, double)</li>
        <li><code>atmosphere/*</code> — atmosphere conditions (reducing, breathable)</li>
        <li><code>climate/*</code> — climate states (runaway-greenhouse)</li>
        <li><code>hazard/*</code> — hazards (flaring)</li>
        <li><code>structure/*</code> — derived layering (icy-shell, subsurface-ocean, cloud-deck)</li>
        <li><code>tidal/*</code> — tidal hotspots, volcanism, lava-flows</li>
        <li><code>geology/*</code> — tectonic regime (plate-tectonics, stagnant-lid, cryovolcanic, …)</li>
        <li><code>magnetic/*</code> — dynamo (intrinsic / induced / unshielded)</li>
        <li><code>habitability/*</code> — habitability tier (incl. subsurface)</li>
        <li><code>stability/*</code> — n-body instability risk</li>
        <li><code>barycenter/auto</code> — auto-generated barycentre marker</li>
      </ul>
      <p>Generation writes provenance; the processor derives the rest from physics on every run. The UI renders each
        tag with a friendly label + a plain-language description of the physics behind it (see
        <code>tagPresentation.ts</code>). Tags that merely duplicated a class were removed (Ocean World →
        planet/ocean, etc.). The full layering is documented in <code>docs/classification-and-tags.md</code>.</p>
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
        model — it evolves the stars (Sun → red giant → white dwarf), decays radiogenic heat (cooling → the tectonic
        regime), grinds belts down (young = wide, old = narrow), sets flare activity, and drives atmospheric escape.</p>
      <p><strong>Atmospheric escape</strong> (over the age, planets assumed to form a few Myr in): two age-integrated
        losses thin or strip an atmosphere <em>before</em> greenhouse &amp; radiation read it. <em>Thermal (Jeans)</em>
        — light gases (H₂/He) leave any non-giant; heavier gases need a high escape parameter
        <code>λ = G·M·m / (R·k·T)</code>. <em>Non-thermal (XUV / stellar wind)</em> — strips small, hot, close-in,
        UNSHIELDED worlds, scaled by flux × age × (1 − magnetosphere), and gated off above ~9 km/s escape velocity
        so Earth/Venus/super-Earths keep their air. It only thins or strips, never invents — so a tiny hot world goes
        bare, a shielded super-Earth holds on, and giants keep everything.</p>
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
        <li>Gas-giant "surface" temperature is reported at a ~1 bar reference level.</li>
        <li>The photon/particle split and per-gas shielding coefficients are calibrated, not first-principles.</li>
        <li>Roche/ring limits assume a representative density.</li>
        <li>Classification soft-edge tolerance (15%) and the diagnostic-type weights are tuned, not derived — the audit guard keeps them honest.</li>
        <li>Tidal hotspot peak, the cryo/silicate ceilings and the night-side cold factor are calibrated shapes, not a thermal solve.</li>
        <li>Magnetism reports a grounded <em>range</em>, not a computed field strength; the dynamo scaling is order-of-magnitude.</li>
        <li>Geological vigor is a relative, Earth-calibrated proxy (radiogenic decay + a cooling-retention term), and the regime thresholds are tuned.</li>
        <li>The habitability geology/magnetism modifiers and the subsurface-niche floor are <strong>heuristic guesswork</strong> — plausible and bounded, but judgement calls open to balancing.</li>
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
  .phase { font-size: 0.7rem; color: var(--on-accent, #fff); background: var(--accent, #ff5a1f); border-radius: 999px; padding: 2px 8px; vertical-align: middle; margin-left: 8px; }
  p, li { line-height: 1.65; color: var(--text, #e2e2e2); }
  ol.layering { line-height: 1.7; padding-left: 1.3em; }
  ol.layering li { margin: 4px 0; }
  .caveat { border-left: 3px solid var(--accent, #ff5a1f); background: var(--bg-panel, #14161c); padding: 10px 14px; border-radius: 0 6px 6px 0; }
  code { background: var(--bg-panel, #14161c); border: 1px solid var(--border, #2a2d36); border-radius: 4px; padding: 1px 5px; font-size: 0.9em; }
  table { border-collapse: collapse; width: 100%; margin: 12px 0; font-size: 0.9rem; }
  table.mini { width: auto; }
  th, td { text-align: left; padding: 6px 12px; border-bottom: 1px solid var(--border, #2a2d36); }
  th { color: var(--text-faint, #8a8f9a); font-weight: 600; }
  td.sym { color: var(--accent, #ff5a1f); font-weight: 600; }
  td.num { font-variant-numeric: tabular-nums; }
  ul.tags code { color: var(--accent, #ff5a1f); }
  a { color: var(--link, #6ca6ff); }
  footer { margin: 40px 0 80px; }
</style>
