<script lang="ts">
  import type { CelestialBody, Barycenter, RulePack } from "$lib/types";
  import { calculateOrbitalBoundaries, type OrbitalBoundaries, type PlanetData } from "$lib/physics/orbits";
  import { calculateFullConstructSpecs, type ConstructSpecs } from '$lib/construct-logic';

  export let body: CelestialBody | Barycenter | null;
  export let rulePack: RulePack;

  // Derived Reactive Properties for Constructs
  let constructSpecs: ConstructSpecs | null = null;

  // Derived Reactive Properties
  let surfaceTempC: number | null = null;
  let hotSideTempC: number | null = null;
  let coldSideTempC: number | null = null;
  let massDisplay: string | null = null;
  let radiationLevel: string | null = null;
  let surfaceGravityG: number | null = null;
  let densityRelative: number | null = null;
  let orbitalDistanceDisplay: string | null = null;
  let circumferenceKm: number | null = null;
  let tempTooltip: string = '';
  let surfaceRadiationText: string | null = null;
  let surfaceRadiationTooltip: string | null = null;
        let stellarRadiationTooltip: string | null = null;
  
        $: isGasGiant = body.classes?.some(c => c.includes('gas-giant')) ?? false;
  
        // Perform all other display calculations when the body changes
        $: {
          surfaceGravityG = null;    densityRelative = null;
    surfaceTempC = null;
    hotSideTempC = null;
    coldSideTempC = null;
    massDisplay = null;
    radiationLevel = null;
    orbitalDistanceDisplay = null;
    circumferenceKm = null;
    tempTooltip = '';
    surfaceRadiationText = null;
    surfaceRadiationTooltip = null;

    if (body && body.kind === 'body') {
        if (body.surfaceRadiation !== undefined) {
            const desc = getSurfaceRadiationDescription(body.surfaceRadiation);
            surfaceRadiationText = desc.text;
            surfaceRadiationTooltip = desc.tooltip;
        }

        if (body.orbit) {
            if (body.roleHint === 'moon') {
                orbitalDistanceDisplay = `${(body.orbit.elements.a_AU * AU_KM).toLocaleString(undefined, {maximumFractionDigits: 0})} km`;
            } else {
                orbitalDistanceDisplay = `${body.orbit.elements.a_AU.toFixed(3)} AU`;
            }
        }

        if (body.radiusKm && body.radiusKm > 0) {
            circumferenceKm = 2 * Math.PI * body.radiusKm;
        }

        if (body.massKg && body.radiusKm && body.radiusKm > 0) {
            const mass = body.massKg;
            const radiusM = body.radiusKm * 1000;
            surfaceGravityG = (G * mass / (radiusM * radiusM)) / EARTH_GRAVITY;
            
            const volume = (4/3) * Math.PI * Math.pow(radiusM, 3);
            const density = mass / volume;
            densityRelative = density / EARTH_DENSITY;
        }

        if (body.roleHint === 'star') {
            const massInSuns = body.massKg / SOLAR_MASS_KG;
            massDisplay = massInSuns < 1000000 
                ? `${massInSuns.toLocaleString(undefined, {maximumFractionDigits: 3})} Solar Masses` 
                : `${massInSuns.toExponential(2)} Solar Masses`;

            const desc = getStellarRadiationDescription(body.radiationOutput || 0);
            radiationLevel = `${desc.text} (${body.radiationOutput?.toFixed(2)})`;
            stellarRadiationTooltip = desc.tooltip;

        } else if (body.massKg) {            const massInEarths = body.massKg / EARTH_MASS_KG;
            massDisplay = massInEarths < 1000000 
                ? `${massInEarths.toLocaleString(undefined, {maximumFractionDigits: 2})} Earth Masses` 
                : `${massInEarths.toExponential(2)} Earth Masses`;
        }

        if (body.temperatureK) {
            if (body.tidallyLocked) {
                hotSideTempC = body.temperatureK * 1.41 - 273.15; // Simplified model for hot side
                coldSideTempC = body.temperatureK * 0.5 - 273.15; // Simplified model for cold side
            } else {
                surfaceTempC = body.temperatureK - 273.15;
            }
            tempTooltip = `Equilibrium: ${Math.round((body.equilibriumTempK || 0) - 273.15)}°C | Greenhouse: +${Math.round(body.greenhouseTempK || 0)}°C | Tidal: +${Math.round(body.tidalHeatK || 0)}°C | Radiogenic: +${Math.round(body.radiogenicHeatK || 0)}°C`;
        }
    }

    // Calculate construct specs if the body is a construct
    if (body && body.kind === 'construct' && rulePack.engineDefinitions && rulePack.fuelDefinitions) {
      constructSpecs = calculateFullConstructSpecs(
        body,
        rulePack.engineDefinitions.entries,
        rulePack.fuelDefinitions.entries,
        0, // current_cargo_tonnes (will be wired up later)
        0, // current_fuel_tonnes (will be wired up later)
        0  // current_crew_count (will be wired up later)
      );
    } else {
      constructSpecs = null;
    }
  }

  // --- Helper Functions ---
  function getSurfaceRadiationDescription(radiation: number): { text: string, tooltip: string } {
      if (radiation < 1) return { text: 'Negligible (<1 mSv/year)', tooltip: 'No special shielding required for long-term survival. Less than typical Earth background radiation.' };
      if (radiation < 10) return { text: 'Low (1-50 mSv/year)', tooltip: 'Standard habitat shielding is sufficient for long-term survival. Comparable to airline crew or high-altitude cities.' };
      if (radiation < 50) return { text: 'Moderate (50-500 mSv/year)', tooltip: 'Requires moderate habitat shielding (e.g., several cm of lead or equivalent) for long-term survival. Comparable to astronauts on ISS.' };
      if (radiation < 100) return { text: 'High (500-1,000 mSv/year)', tooltip: 'Requires heavy habitat shielding (e.g., dense alloys, significant depth underground) for long-term survival. Serious health risks over long periods.' };
      if (radiation < 500) return { text: 'Very High (1,000-5,000 mSv/year)', tooltip: 'Long-term survival is difficult. Requires extreme shielding, such as deep subterranean or underwater habitats. Mission-critical operations only.' };
      return { text: 'Fatal (>5,000 mSv/year)', tooltip: 'Surface survival is impossible without exotic technology. Lethal dose received in a short time.' };
  }

  function getStellarRadiationDescription(radiation: number): { text: string, tooltip: string } {
      if (radiation < 0.1) return { text: 'Negligible', tooltip: 'Very low stellar radiation output.' };
      if (radiation < 2) return { text: 'Low', tooltip: 'Low stellar radiation output. Comparable to a dim red dwarf.' };
      if (radiation < 10) return { text: 'Moderate', tooltip: 'Moderate stellar radiation output. Comparable to our Sun.' };
      if (radiation < 100) return { text: 'High', tooltip: 'High stellar radiation output. Comparable to a bright F-type star.' };
      if (radiation < 1000) return { text: 'Very High', tooltip: 'Very high stellar radiation output. Comparable to a hot B-type star.' };
      return { text: 'Extreme', tooltip: 'Extreme stellar radiation output. Comparable to a massive O-type star or active stellar remnant.' };
  }

  // --- Constants ---
  const G = 6.67430e-11;
  const EARTH_GRAVITY = 9.80665; // m/s^2
  const EARTH_DENSITY = 5514; // kg/m^3
  const SOLAR_MASS_KG = 1.989e30;
  const EARTH_MASS_KG = 5.972e24;
  const AU_KM = 149597870.7;

  const STAR_TYPE_DESC: Record<string, string> = {
      'star/O': 'Extremely hot, luminous, and blue. Very rare and short-lived. High radiation.',
      'star/B': 'Hot, luminous, blue-white stars. High radiation.',
      'star/A': 'White or bluish-white stars, like Sirius. Moderate radiation.',
      'star/F': 'Yellow-white stars, stronger than the Sun. Moderate radiation.',
      'star/G': 'Yellow, sun-like stars. Good candidates for habitable planets.',
      'star/K': 'Orange dwarfs, cooler and longer-lived than the Sun. Low radiation.',
      'star/M': 'Red dwarfs. The most common, very long-lived, but dim and cool. Low radiation.',
      'star/WD': 'White Dwarf. The dense, hot remnant of a dead star. High radiation.',
      'star/NS': 'Neutron Star. An extremely dense, rapidly spinning stellar remnant. Extreme radiation.',
      'star/BH': 'Quiescent Black Hole. A region of spacetime where gravity is so strong nothing can escape. Low radiation unless matter is actively falling in.',
      'star/BH_active': 'Active Black Hole. A black hole actively feeding on surrounding matter, which forms a super-heated accretion disk, emitting extreme levels of radiation.'
  }
</script>

{#if body}
<div class="details-grid">
    <div class="detail-item">
        <span class="label">Kind</span>
        <span class="value">{body.kind}{#if body.kind === 'body'} ({body.roleHint}){/if}</span>
    </div>
    
    {#if body.kind === 'construct'}
      <div class="detail-item">
          <span class="label">Class</span>
          <span class="value">{body.class}</span>
      </div>
      {#if body.physical_parameters?.massKg}
        <div class="detail-item">
            <span class="label">Mass</span>
            <span class="value">{(body.physical_parameters.massKg / 1000).toLocaleString(undefined, {maximumFractionDigits: 0})} tonnes</span>
        </div>
      {/if}
      {#if body.physical_parameters?.dimensionsM}
        <div class="detail-item">
            <span class="label">Dimensions</span>
            <span class="value">{body.physical_parameters.dimensionsM.join(' x ')} m</span>
        </div>
      {/if}

      {#if constructSpecs}
        <div class="detail-item">
          <span class="label">Total Mass</span>
          <span class="value">{constructSpecs.totalMass_tonnes.toLocaleString(undefined, {maximumFractionDigits: 0})} tonnes</span>
        </div>
        <div class="detail-item">
          <span class="label">Max Vacuum Accel.</span>
          <span class="value">{constructSpecs.maxVacuumG.toFixed(2)} G</span>
        </div>
        <div class="detail-item">
          <span class="label">Total Vacuum Δv</span>
          <span class="value">{(constructSpecs.totalVacuumDeltaV_ms / 1000).toLocaleString(undefined, {maximumFractionDigits: 1})} km/s</span>
        </div>
        <div class="detail-item">
          <span class="label">Power Surplus</span>
          <span class="value">{constructSpecs.powerSurplus_MW.toLocaleString(undefined, {maximumFractionDigits: 1})} MW</span>
        </div>
      {/if}
    {/if}

    {#if body.kind === 'body'}
        <div class="detail-item">
            <span class="label">Classification</span>
            <span class="value">{body.classes.join(', ')}</span>
        </div>
                        {#if STAR_TYPE_DESC[body.classes[0]] || STAR_TYPE_DESC[body.classes[0]?.split('/')[1]?.[0]]}
                            <div class="detail-item description">
                                <span class="value">{STAR_TYPE_DESC[body.classes[0]] || STAR_TYPE_DESC[body.classes[0].split('/')[1][0]]}</span>
                            </div>
                        {/if}            {/if}

    {#if massDisplay}
          <div class="detail-item">
              <span class="label">Mass</span>
              <span class="value">{massDisplay}</span>
          </div>
      {/if}

      {#if body.kind === 'body' && body.radiusKm}
          <div class="detail-item">
              <span class="label">Radius</span>
              <span class="value">{body.radiusKm.toLocaleString(undefined, {maximumFractionDigits: 0})} km</span>
          </div>
      {/if}

      {#if circumferenceKm}
          <div class="detail-item">
              <span class="label">Circumference</span>
              <span class="value">{circumferenceKm.toLocaleString(undefined, {maximumFractionDigits: 0})} km</span>
          </div>
      {/if}

      {#if surfaceGravityG !== null}
          <div class="detail-item">
              <span class="label">Surface Gravity</span>
              <span class="value">{surfaceGravityG.toFixed(2)} G</span>
          </div>
      {/if}

      {#if densityRelative !== null}
          <div class="detail-item">
              <span class="label">Density (rel. to Earth)</span>
              <span class="value">{densityRelative.toFixed(2)}</span>
          </div>
      {/if}

      {#if body.kind === 'body' && body.axial_tilt_deg}
          <div class="detail-item">
              <span class="label">Axial Tilt</span>
              <span class="value">{body.axial_tilt_deg.toFixed(1)}°</span>
          </div>
      {/if}

      {#if body.kind === 'body' && body.rotation_period_hours}
          <div class="detail-item">
              <span class="label">Day Length</span>
              <span class="value">{body.rotation_period_hours.toFixed(1)} hours</span>
          </div>
      {/if}

      {#if orbitalDistanceDisplay}
          <div class="detail-item">
              <span class="label">{body.roleHint === 'moon' ? 'Orbit (from Planet)' : 'Orbit (from Star)'}</span>
              <span class="value">{orbitalDistanceDisplay}</span>
          </div>
      {/if}

      {#if body.kind === 'body' && body.orbital_period_days}
          <div class="detail-item">
              <span class="label">Orbital Period</span>
              <span class="value">{body.orbital_period_days.toFixed(1)} days</span>
          </div>
      {/if}

      {#if body.kind === 'body' && body.orbit?.elements.e}
          <div class="detail-item">
              <span class="label">Orbital Eccentricity</span>
              <span class="value">{body.orbit.elements.e.toFixed(3)}</span>
          </div>
      {/if}

      {#if hotSideTempC !== null && coldSideTempC !== null}
          <div class="detail-item" title={tempTooltip}>
              <span class="label">Day-side Temp.</span>
              <span class="value">{Math.round(hotSideTempC)} °C</span>
          </div>
          <div class="detail-item" title={tempTooltip}>
              <span class="label">Night-side Temp.</span>
              <span class="value">{Math.round(coldSideTempC)} °C</span>
          </div>
      {:else if surfaceTempC !== null}
          <div class="detail-item" title={tempTooltip}>
              <span class="label">Avg. Surface Temp.</span>
              <span class="value">{Math.round(surfaceTempC)} °C</span>
          </div>
      {/if}

      {#if body.roleHint === 'star' && radiationLevel}
          <div class="detail-item" title={stellarRadiationTooltip}>
              <span class="label">Radiation Level</span>
              <span class="value">{radiationLevel}</span>
          </div>
      {/if}

      {#if body.magneticField}
          <div class="detail-item" title="Magnetic field strength in Gauss. A value > 1 is strong enough to offer significant protection from stellar radiation.">
              <span class="label">Magnetic Field</span>
              <span class="value">{body.magneticField.strengthGauss.toFixed(2)} G</span>
          </div>
      {/if}

      {#if surfaceRadiationText}
          <div class="detail-item" title={surfaceRadiationTooltip}>
              <span class="label">Surface Radiation</span>
              <span class="value">{surfaceRadiationText} ({body.surfaceRadiation?.toFixed(2)})</span>
          </div>
      {/if}

      {#if body.kind === 'body' && body.atmosphere}
          {@const pressure = body.atmosphere.pressure_bar || 0}
          <div class="detail-item atmosphere">
              <span class="label">Atmosphere ({pressure < 1e-3 ? pressure.toExponential(2) : pressure.toFixed(3)} bar)</span>
              <span class="value">{body.atmosphere.name}</span>
              {#if pressure < 1e-5}
                  <div class="composition-trace">
                      <p>Trace amounts of constituent gases (exosphere).</p>
                  </div>
              {:else}
                  <div class="composition">
                      {#each Object.entries(body.atmosphere.composition) as [gas, percent]}
                          {#if percent > 0.001}
                              <div class="gas">
                                  <span class="gas-name">{gas}</span>
                                  <span class="gas-percent">{(percent * 100).toFixed(1)}%</span>
                              </div>
                          {/if}
                      {/each}
                  </div>
              {/if}
          </div>
      {/if}

      {#if body.kind === 'body' && body.hydrosphere && body.hydrosphere.coverage > 0}
          <div class="detail-item">
              <span class="label">Hydrosphere</span>
              <span class="value">{Math.round(body.hydrosphere.coverage * 100)}% {body.hydrosphere.composition}</span>
          </div>
      {/if}

      {#if body.kind === 'body' && body.habitabilityScore}
          <div class="detail-item habitability">
              <span class="label">Habitability Score</span>
              <span class="value">{body.habitabilityScore.toFixed(1)}%</span>
              {#if body.tags.find(t => t.key.startsWith('habitability/'))}
                  <span class="habitability-tier">{body.tags.find(t => t.key.startsWith('habitability/')).key.split('/')[1]}</span>
              {/if}
          </div>
      {/if}

      {#if body.kind === 'body' && body.biosphere}
          <div class="detail-item biosphere">
              <span class="label">Biosphere</span>
              <div class="biosphere-details">
                  <span><strong>Complexity:</strong> {body.biosphere.complexity}</span>
                  <span><strong>Biochemistry:</strong> {body.biosphere.biochemistry}</span>
                  <span><strong>Energy Source:</strong> {body.biosphere.energy_source}</span>
                  <span><strong>Morphologies:</strong> {body.biosphere.morphologies.join(', ')}</span>
                  <span><strong>Coverage:</strong> {(body.biosphere.coverage * 100).toFixed(0)}%</span>
              </div>
          </div>
      {/if}

      {#if body.kind === 'body' && body.orbitalBoundaries}
          <div class="detail-item orbital-zones">
              <span class="label">Orbital Zones</span>
              <div class="zone-details">
                  <span><strong>Low Orbit:</strong> {body.orbitalBoundaries.minLeoKm.toLocaleString(undefined, {maximumFractionDigits: 0})} - {body.orbitalBoundaries.leoMoeBoundaryKm.toLocaleString(undefined, {maximumFractionDigits: 0})} km</span>
                  <span><strong>Mid Orbit:</strong> {body.orbitalBoundaries.leoMoeBoundaryKm.toLocaleString(undefined, {maximumFractionDigits: 0})} - {body.orbitalBoundaries.meoHeoBoundaryKm.toLocaleString(undefined, {maximumFractionDigits: 0})} km {#if body.orbitalBoundaries.isGeoFallback}(Galactic Standard){/if}</span>
                  {#if body.orbitalBoundaries.geoStationaryKm}
                      <span><strong>Geostationary:</strong> {body.orbitalBoundaries.geoStationaryKm.toLocaleString(undefined, {maximumFractionDigits: 0})} km</span>
                  {:else}
                      <span><strong>Geostationary:</strong> Unstable</span>
                  {/if}
                  <span><strong>High Orbit:</strong> {body.orbitalBoundaries.meoHeoBoundaryKm.toLocaleString(undefined, {maximumFractionDigits: 0})} - {body.orbitalBoundaries.heoUpperBoundaryKm.toLocaleString(undefined, {maximumFractionDigits: 0})} km</span>
              </div>
          </div>
      {/if}

      {#if body.kind === 'body' && (body.loDeltaVBudget_ms !== undefined || body.propulsiveLandBudget_ms !== undefined || body.aerobrakeLandBudget_ms !== undefined)}
          <div class="detail-item orbital-zones">
              <span class="label">Delta-V Budgets</span>
              <div class="budget-details">
                  {#if body.loDeltaVBudget_ms !== undefined}
                      {#if isGasGiant}
                          <div><span><strong>Surface to LO:</strong> N/A - No surface</span></div>
                      {:else}
                          <div><span><strong>Surface to LO:</strong> {body.loDeltaVBudget_ms.toLocaleString(undefined, {maximumFractionDigits: 0})} m/s</span></div>
                      {/if}
                  {/if}
                  {#if body.propulsiveLandBudget_ms !== undefined}
                       {#if isGasGiant}
                          <div><span><strong>LO to Surface (Propulsive):</strong> N/A - No surface</span></div>
                      {:else}
                          <div><span><strong>LO to Surface (Propulsive):</strong> {body.propulsiveLandBudget_ms.toLocaleString(undefined, {maximumFractionDigits: 0})} m/s</span></div>
                      {/if}
                  {/if}
                  {#if body.aerobrakeLandBudget_ms !== undefined}
                      {#if body.aerobrakeLandBudget_ms !== -1}
                          <div><span><strong>{isGasGiant ? 'Aerobrake / Fuel Scoop' : 'LO to Surface (Aerobrake)'}:</strong> {body.aerobrakeLandBudget_ms.toLocaleString(undefined, {maximumFractionDigits: 0})} m/s</span></div>
                      {:else}
                          <div><span><strong>{isGasGiant ? 'Aerobrake / Fuel Scoop' : 'LO to Surface (Aerobrake)'}:</strong> N/A (No Atmosphere)</span></div>
                      {/if}
                  {/if}
              </div>
          </div>
      {/if}

      {#if body.tags && body.tags.length > 0}
          <div class="detail-item tags-list">
              <span class="label">Tags</span>
              <div class="tags-container">
                  {#each body.tags as tag}
                      <span class="tag">{tag.key}{#if tag.value}: {tag.value}{/if}</span>
                  {/each}
              </div>
                  </div>
              {/if}
          </div>
          {/if}
<style>
  .details-grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
      gap: 0.75em;
  }
  .detail-item {
      display: flex;
      flex-direction: column;
      background-color: #252525;
      padding: 0.6em;
      border-radius: 4px;
      border-left: 3px solid #ff3e00;
      cursor: default; /* So title attribute tooltips show up consistently */
  }
  .detail-item.description {
      grid-column: 1 / -1;
      border-left-color: #444;
  }
  .label {
      font-size: 0.8em;
      color: #999;
      text-transform: uppercase;
      margin-bottom: 0.2em;
  }
  .value {
      font-size: 1.1em;
      color: #eee;
  }
  .detail-item.atmosphere {
    grid-column: 1 / -1;
    border-left-color: #3b82f6;
  }
  .composition {
    margin-top: 0.5em;
    display: flex;
    flex-wrap: wrap;
    gap: 0.5em;
  }
  .gas {
    background-color: #333;
    padding: 0.2em 0.5em;
    border-radius: 3px;
    font-size: 0.9em;
  }
  .gas-name {
    font-weight: bold;
  }
  .gas-percent {
    margin-left: 0.5em;
    color: #ccc;
  }
  .composition-trace p {
    font-style: italic;
    color: #999;
    margin: 0.5em 0 0 0;
  }

  .detail-item.habitability, .detail-item.biosphere {
    grid-column: 1 / -1;
    border-left-color: #10b981;
  }
  .habitability-tier {
    font-size: 0.9em;
    font-weight: bold;
    color: #10b981;
    text-transform: capitalize;
  }
  .biosphere-details {
    display: flex;
    flex-direction: column;
    gap: 0.25em;
    margin-top: 0.5em;
  }

  .detail-item.orbital-zones {
    grid-column: 1 / -1;
    border-left-color: #a855f7;
  }
  .zone-details {
    display: flex;
    flex-direction: column;
    gap: 0.25em;
    margin-top: 0.5em;
  }

  .tags-list {
    grid-column: 1 / -1;
    border-left-color: #888;
  }

  .tags-container {
    display: flex;
    flex-wrap: wrap;
    gap: 0.5em;
    margin-top: 0.5em;
  }

  .tag {
    background-color: #444;
    padding: 0.2em 0.5em;
    border-radius: 3px;
    font-size: 0.8em;
    color: #eee;
  }
</style>