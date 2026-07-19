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
    ['aurora', 'Auroras'],
    ['geology', 'Geological activity'],
    ['resonance', 'Resonances & stability'],
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
      <p>Surface temperature composes the equilibrium temperature with additive heat: greenhouse forcing
        (from atmospheric composition + pressure, capped to avoid runaway blow-ups), tidal heating, radiogenic
        heat, giant internal heat, and — for a <a href="#temp-range">self-luminous brown dwarf</a> — its own
        photosphere. These are summed in <strong>flux space</strong> (each as σT⁴, then back to a temperature),
        not stacked as naive +K, so a body already warm doesn't gain a full extra degree per degree of forcing.
        The greenhouse model and its cryo/CIA parameters live in the rulepack (<code>climateModel.greenhouse</code>)
        so they're tunable, not hard-coded.</p>
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

    <section id="colour">
      <h2>Apparent colour &amp; visualisation <span class="phase">§2e</span></h2>
      <p>Instead of one swatch per class, a body's <strong>true colour</strong> is composed: a surface base from
        makeup fractions, a blue ocean overlay, a tint from the dominant coloured atmospheric gas, condensed cloud
        decks veiling the surface (sulfuric/sulfur/alkali opaque; water patchy, so Earth stays blue), gas-giant
        cloud colours by temperature, methane-blue ice giants, and incandescence when very hot. The result is kept
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
          latitudinal bands, tinted by chromophore (methane, ammonia) and temperature.</li>
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
        <li>A type's score is the <strong>mean of its band fits × a mild specificity bonus</strong> for band count. Among clean matches more matched bands still wins (specific beats generic), but a band-rich catch-all whose extra bands are barely-true edge slivers can't out-score a perfect match on fewer bands (summing fits used to let <em>barren</em>/<em>desert</em> steal Venus-class and dwarf-planet-class worlds). Falling fully outside any defining band disqualifies the type.</li>
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
        <li>Gas-giant "surface" temperature is reported at a ~1 bar reference level.</li>
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
  th, td { text-align: left; padding: 6px 12px; border-bottom: 1px solid var(--border, #2a2d36); }
  th { color: var(--text-faint, #8a8f9a); font-weight: 600; }
  td.sym { color: var(--accent, #ff5a1f); font-weight: 600; }
  td.num { font-variant-numeric: tabular-nums; }
  ul.tags code { color: var(--accent, #ff5a1f); }
  a { color: var(--link, #6ca6ff); }
  footer { margin: 40px 0 80px; }
</style>
