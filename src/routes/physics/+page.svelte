<script lang="ts">
  // /physics — the honesty appendix. Documents the constants, the derivations, the
  // deliberate fudges, and how classification + tags are produced. Stable section IDs
  // (#temperature, #radiation-split, #classification, …) so tooltips can deep-link.
  import { G, UNIVERSAL_GAS_CONSTANT, AU_KM, SOLAR_MASS_KG, SOLAR_RADIUS_KM, EARTH_MASS_KG, EARTH_RADIUS_KM, EARTH_GRAVITY, EARTH_DENSITY, RADIATION_UNSHIELDED_DOSE_MSV_YR } from '$lib/constants';

  const toc = [
    ['constants', 'Constants'],
    ['gravity', 'Gravity, size & density'],
    ['temperature', 'Equilibrium temperature'],
    ['eccentric-flux', 'Eccentric flux distance'],
    ['greenhouse', 'Greenhouse & surface temp'],
    ['radiation', 'Surface radiation'],
    ['radiation-split', 'Spectral photon/particle split'],
    ['habitability', 'Habitability score'],
    ['classification', 'Classification (fingerprints)'],
    ['tags', 'Tags'],
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

    <section id="temperature">
      <h2>Equilibrium temperature</h2>
      <p>For each star, luminosity <code>L = 4π·R★²·σ·T★⁴</code> (Stefan–Boltzmann). The blackbody equilibrium
        temperature at distance <code>d</code> is <code>T_eq = [ L·(1−A) / (16·π·σ·d²) ]^¼</code>, summed over
        all stars in the system (binaries add their fluxes). <code>A</code> is the estimated Bond albedo.</p>
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
    </section>

    <section id="radiation">
      <h2>Surface radiation</h2>
      <p>Incident stellar flux (≈1 at Earth) splits into photons and particles, then is attenuated:
        <strong>magnetosphere</strong> deflects particles (<code>log₁₀</code>-scaled by field strength);
        <strong>atmosphere</strong> blocks both (<code>exp(−shielding·pressure)</code>, per-gas shielding from the
        rulepack). The unshielded reference dose is <strong>{RADIATION_UNSHIELDED_DOSE_MSV_YR} mSv/yr</strong> at 1 AU.
        Rocky bodies add a ~2 mSv/yr terrestrial background. <em>An airless world has no shielding → the full
        dose</em> (Luna ≈ 500 mSv/yr) — it is the most-irradiated case, not zero.</p>
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

    <section id="habitability">
      <h2>Habitability score</h2>
      <p>A 0–100 weighted score: temperature vs the solvent's liquid range (30), pressure (20), a liquid solvent
        (15, +5 for water), radiation (15), and surface gravity (15). Tiers (<code>habitability/*</code> tags) are
        set from the factor thresholds — Earth-like requires water, O₂, ~1 g and low radiation; human-habitable is
        a looser envelope; alien-habitable is score &gt; 40. <em>It scores habitability; it does not model biomes</em>
        (which is why forest/jungle/swamp/ecumenopolis are GM-assigned, not auto-classified).</p>
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
        <li><code>tidal/*</code> — tidal hotspots</li>
        <li><code>habitability/*</code> — habitability tier</li>
        <li><code>stability/*</code> — n-body instability risk</li>
        <li><code>barycenter/auto</code> — auto-generated barycentre marker</li>
      </ul>
      <p>Generation writes provenance; the processor derives the rest from physics on every run. Tags that merely
        duplicated a class were removed (Ocean World → planet/ocean, etc.). The full layering is documented in
        <code>docs/classification-and-tags.md</code>.</p>
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
