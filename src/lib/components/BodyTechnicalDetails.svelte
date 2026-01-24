<script lang="ts">
  import type { CelestialBody, Barycenter, RulePack } from "$lib/types";
  import { calculateOrbitalBoundaries, type OrbitalBoundaries, type PlanetData } from "$lib/physics/orbits";
  import { calculateFullConstructSpecs, type ConstructSpecs } from '$lib/construct-logic';
  import { calculateDeltaVBudgets, calculateSurfaceTemperature, calculateGreenhouseEffect, calculateHabitabilityScore } from '$lib/system/postprocessing';
  import { systemStore } from '$lib/stores';
  import { get } from 'svelte/store';
  import { calculateSurfaceRadiation } from '$lib/physics/radiation';
  import { G, AU_KM, EARTH_MASS_KG, EARTH_RADIUS_KM, SOLAR_MASS_KG, SOLAR_RADIUS_KM, EARTH_GRAVITY, EARTH_DENSITY, RADIATION_UNSHIELDED_DOSE_MSV_YR } from '$lib/constants';

  export let body: CelestialBody | Barycenter | null;
  export let rulePack: RulePack;
  export let parentBody: CelestialBody | null = null;
  export let rootStar: CelestialBody | null = null;

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
  let displayedSurfaceRadiation: number | null = null;
  let stellarRadiationTooltip: string | null = null;
  let calculatedPeriodDays: number | null = null;
  let luminosity: number | null = null;
  
  $: isGasGiant = body.classes?.some(c => c.includes('gas-giant')) ?? false;
  $: isBeltOrRing = body && body.kind === 'body' && (body.roleHint === 'belt' || body.roleHint === 'ring');
  $: isStar = body && body.kind === 'body' && body.roleHint === 'star';
  
  // Perform all other display calculations when the body changes
  $: {
    surfaceGravityG = null;    
    densityRelative = null;
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
    displayedSurfaceRadiation = null;
    calculatedPeriodDays = null;
    luminosity = null;

    if (body && body.kind === 'body') {
        // --- Live Recalculation for Editing ---
        if (body.massKg && body.radiusKm) {
             body.calculatedGravity_ms2 = (G * body.massKg) / Math.pow(body.radiusKm * 1000, 2);
        }
        if (body.rotation_period_hours) {
             body.calculatedRotationPeriod_s = body.rotation_period_hours * 3600;
        }
        if (parentBody && body.calculatedGravity_ms2 && !isStar) {
             const hostMass = (parentBody.massKg || (parentBody as any).effectiveMassKg || 0);
             const planetData: PlanetData = {
                 gravity: body.calculatedGravity_ms2,
                 surfaceTempKelvin: body.temperatureK || 0,
                 massKg: body.massKg || 0,
                 rotationPeriodSeconds: body.calculatedRotationPeriod_s || 0,
                 molarMassKg: body.atmosphere?.molarMassKg ?? 0.028,
                 surfacePressurePa: (body.atmosphere?.pressure_bar ?? 0) * 100000,
                 distanceToHost_km: (body.orbit?.elements.a_AU || 0) * AU_KM,
                 hostMass_kg: hostMass,
             };
             body.orbitalBoundaries = calculateOrbitalBoundaries(planetData, rulePack);
             calculateDeltaVBudgets(body);
             calculateGreenhouseEffect(body, rulePack);
             
             // Dynamic Surface Temperature Recalculation
             const sys = get(systemStore);
             if (sys) {
                 calculateSurfaceTemperature(body, sys.nodes);
             }

             // Recalculate Habitability Score
             calculateHabitabilityScore(body);
        }

        let currentSurfaceRadiation = body.surfaceRadiation;
        if (currentSurfaceRadiation === undefined) {
             const sys = get(systemStore);
             if (sys) {
                 currentSurfaceRadiation = calculateSurfaceRadiation(body, sys.nodes, rulePack);
             }
        }

        if (currentSurfaceRadiation !== undefined) {
            displayedSurfaceRadiation = currentSurfaceRadiation;
            const desc = getSurfaceRadiationDescription(currentSurfaceRadiation);
            surfaceRadiationText = desc.text;
            
            // Build detailed tooltip
            let shieldingInfo = '';
            if (body.photonRadiation !== undefined && body.particleRadiation !== undefined) {
                const totalFlux = (body.photonRadiation || 0) + (body.particleRadiation || 0);
                const photonPct = totalFlux > 0 ? (body.photonRadiation! / totalFlux * 100).toFixed(0) : 0;
                const particlePct = totalFlux > 0 ? (body.particleRadiation! / totalFlux * 100).toFixed(0) : 0;
                
                shieldingInfo = `\n\n🛡️ Shielding Breakdown:\n`;
                shieldingInfo += `• Incoming Star Flux: ${body.stellarRadiation?.toFixed(2)} Sol-Flux\n`;
                shieldingInfo += `• Unshielded Potential: ${(body.stellarRadiation! * RADIATION_UNSHIELDED_DOSE_MSV_YR).toFixed(0)} mSv/y\n`;
                if (body.atmosphere) shieldingInfo += `• Atmosphere: ${((body.radiationShieldingAtmo || 0) * 100).toFixed(1)}% Photon Block\n`;
                if (body.magneticField) shieldingInfo += `• Magnetosphere: ${((body.radiationShieldingMag || 0) * 100).toFixed(1)}% Particle Block\n`;
                
                shieldingInfo += `• Transmitted Dose: ${totalFlux.toFixed(2)} mSv/y\n`;
                
                shieldingInfo += `\nFinal Mix: ${photonPct}% Photons / ${particlePct}% Particles`;
            }
            
            surfaceRadiationTooltip = `${desc.tooltip}${shieldingInfo}`;
        }

        if (body.orbit) {
            if (body.roleHint === 'moon') {
                orbitalDistanceDisplay = `${Math.round(body.orbit.elements.a_AU * AU_KM).toLocaleString()} km`;
            } else {
                orbitalDistanceDisplay = `${body.orbit.elements.a_AU.toFixed(3)} AU`;
            }

            // Calculate Orbital Period
            if (parentBody) {
                const parentMass = (parentBody.massKg || (parentBody as Barycenter).effectiveMassKg || 0);
                if (parentMass > 0) {
                    const a_m = body.orbit.elements.a_AU * AU_KM * 1000;
                    const periodSeconds = 2 * Math.PI * Math.sqrt(Math.pow(a_m, 3) / (G * parentMass));
                    calculatedPeriodDays = periodSeconds / 86400;
                }
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
            
            if (body.radiusKm && body.temperatureK) {
                const r_sol = body.radiusKm / SOLAR_RADIUS_KM;
                const t_ratio = body.temperatureK / 5778;
                luminosity = Math.pow(r_sol, 2) * Math.pow(t_ratio, 4);
            }

        } else if (body.massKg) {
            const massInEarths = body.massKg / EARTH_MASS_KG;
            // Use toLocaleString for larger values, toExponential for very small for precision
            if (massInEarths === 0) {
                massDisplay = `0 Earth Masses`;
            } else if (Math.abs(massInEarths) < 0.000001) { // Threshold for scientific notation
                massDisplay = `${massInEarths.toExponential(3)} Earth Masses`;
            } else {
                massDisplay = `${massInEarths.toLocaleString(undefined, {maximumFractionDigits: 6})} Earth Masses`;
            }
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
        parentBody
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

  function getBeltDensityDescription(massKg: number): { text: string, color: string } {
      const massEarths = massKg / EARTH_MASS_KG;
      const minLog = Math.log(0.00001);
      const maxLog = Math.log(1.0);
      let val = 0;
      if (massEarths > 0) {
          val = (Math.log(massEarths) - minLog) / (maxLog - minLog);
      }
      val = Math.max(0, Math.min(1, val));

      if (val < 0.2) return { text: "Sparse (Navigation Trivial)", color: "#00ff00" }; // Green
      if (val < 0.4) return { text: "Light (Standard)", color: "#88ff00" }; // Light Green
      if (val < 0.6) return { text: "Moderate (Minor Hazards)", color: "#ffff00" }; // Yellow
      if (val < 0.8) return { text: "Dense (Navigation Hazard)", color: "#ff8800" }; // Orange
      return { text: "Ultra-Dense (Deadly)", color: "#ff0000" }; // Red
  }

  // --- Constants ---
  // (Constants are now imported from $lib/constants)

  const STAR_TYPE_DESC: Record<string, string> = {
      'star/O': 'Extremely hot, luminous, and blue. Very rare and short-lived. High radiation.',
      'star/B': 'Hot, luminous, blue-white stars. High radiation.',
      'star/A': 'White or bluish-white stars, like Sirius. Moderate radiation.',
      'star/F': 'Yellow-white stars, stronger than the Sun. Moderate radiation.',
      'star/G': 'Yellow, sun-like stars. Good candidates for habitable planets.',
      'star/K': 'Orange dwarfs, cooler and longer-lived than the Sun. Low radiation.',
      'star/M': 'Red dwarfs. The most common, very long-lived, but dim and cool. While generally dim, they can have very high radiation due to frequent, powerful flares.',
      'star/L': 'L-type Brown Dwarf. A dark red or magenta sub-stellar object. Hotter than other brown dwarfs, with clouds of dust grains in its atmosphere.',
      'star/T': 'T-type Brown Dwarf. A cool, magenta or brown sub-stellar object. Dominated by strong Methane absorption bands, similar to Jupiter.',
      'star/Y': 'Y-type Brown Dwarf. The coolest known star-like objects. Barely warm enough to emit infrared light, appearing black to the human eye. Often has water clouds.',
      'star/brown-dwarf': 'Brown Dwarf. A sub-stellar object massive enough to fuse deuterium but not hydrogen. They glow dimly in the infrared and bridge the gap between gas giants and stars.',
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

    {#if body.kind === 'body' && body.traveller}
        <div class="detail-item traveller-data">
            <span class="label">Traveller UWP ({body.traveller.allegianceName || body.traveller.allegiance})</span>
            <span class="value" style="font-family: monospace; color: #ffa500;">{body.traveller.uwp} (TL-{body.traveller.techLevel})</span>
            <div class="traveller-sub">
                <span class="label">Class:</span> {body.traveller.starport}
                <span class="label">Pop:</span> {body.traveller.pbg[0]}
                <span class="label">Zone:</span> {body.traveller.travelZone}
            </div>
            <div class="traveller-sub" style="margin-top: 4px; font-size: 0.85em; opacity: 0.9;">
                <span><strong>Gov:</strong> {body.traveller.govDesc || body.traveller.government}</span>
                <span><strong>Law:</strong> {body.traveller.lawDesc || body.traveller.law}</span>
            </div>
            {#if body.traveller.tradeCodes.length > 0}
                <div class="traveller-codes">
                    {#each body.traveller.tradeCodes as code}
                        <span class="tag">{code}</span>
                    {/each}
                </div>
            {/if}
            {#if body.traveller.ix || body.traveller.ex}
                 <div class="traveller-sub" style="margin-top: 4px; font-size: 0.8em;">
                    {#if body.traveller.ix}<span>IX: {body.traveller.ix}</span>{/if}
                    {#if body.traveller.ex}<span>EX: {body.traveller.ex}</span>{/if}
                 </div>
            {/if}
            <div class="traveller-raw" title="Raw T5 Data">
                {body.traveller.raw}
            </div>
        </div>
    {/if}
    
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

      {#if constructSpecs?.orbit_string}
        <div class="detail-item">
            <span class="label">Orbital Profile</span>
            <span class="value">{constructSpecs.orbit_string}</span>
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
        {#if !isBeltOrRing}
            {#if STAR_TYPE_DESC[body.classes[0]] || STAR_TYPE_DESC[body.classes[0]?.split('/')[1]?.[0]]}
                <div class="detail-item description">
                    <span class="value">{STAR_TYPE_DESC[body.classes[0]] || STAR_TYPE_DESC[body.classes[0].split('/')[1][0]]}</span>
                </div>
            {/if}
        {/if}
    {/if}

    {#if isBeltOrRing}
        {#if body.radiusInnerKm && body.radiusOuterKm}
            <div class="detail-item">
                <span class="label">Dimensions (AU)</span>
                <div style="display: flex; flex-direction: column; gap: 2px;">
                    <span><strong>Inner:</strong> {(body.radiusInnerKm / AU_KM).toFixed(2)} AU</span>
                    <span><strong>Outer:</strong> {(body.radiusOuterKm / AU_KM).toFixed(2)} AU</span>
                    <span><strong>Width:</strong> {((body.radiusOuterKm - body.radiusInnerKm) / AU_KM).toFixed(3)} AU</span>
                </div>
            </div>
        {/if}
        {#if body.massKg}
            {@const densityInfo = getBeltDensityDescription(body.massKg)}
            <div class="detail-item">
                <span class="label">Density / Hazard</span>
                <span class="value" style="color: {densityInfo.color}; font-weight: bold;">{densityInfo.text}</span>
            </div>
        {/if}
    {/if}

    {#if !isBeltOrRing}
        {#if massDisplay}
                        <div class="detail-item">
                            <span class="label">Mass</span>
                            <span class="value">{massDisplay}</span>
                        </div>
                    {/if}
                    
                    {#if luminosity !== null}
                        <div class="detail-item">
                            <span class="label">Luminosity</span>
                            <span class="value">{luminosity.toExponential(2)} L☉</span>
                        </div>
                    {/if}
              
                    {#if body.kind === 'body' && body.radiusKm}              <div class="detail-item">
                  <span class="label">Radius</span>
                  <span class="value">{body.radiusKm.toLocaleString(undefined, {maximumFractionDigits: 0})} km</span>
              </div>
          {/if}

                {#if circumferenceKm && !isStar}
                    <div class="detail-item">
                        <span class="label">Circumference</span>
                        <span class="value">{circumferenceKm.toLocaleString(undefined, {maximumFractionDigits: 0})} km</span>
                    </div>
                {/if}
                {#if surfaceGravityG !== null && !isStar}
                    <div class="detail-item">
                        <span class="label">Surface Gravity</span>
                        <span class="value">{surfaceGravityG.toFixed(2)} G</span>
                    </div>
                {/if}
                {#if densityRelative !== null && !isStar}
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
    {/if}

      {#if orbitalDistanceDisplay}
          <div class="detail-item">
              <span class="label">Orbit (from {parentBody?.kind === 'barycenter' ? 'Barycenter' : (parentBody?.roleHint || 'Unknown')})</span>
              <span class="value">{orbitalDistanceDisplay}</span>
          </div>
      {/if}

      {#if body.kind === 'body' && (calculatedPeriodDays || body.orbital_period_days) && !isBeltOrRing}
          <div class="detail-item">
              <span class="label">Orbital Period</span>
              <span class="value">{(calculatedPeriodDays || body.orbital_period_days).toFixed(1)} days</span>
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

      {#if surfaceRadiationText && body.roleHint !== 'star'}
          <div class="detail-item" title={surfaceRadiationTooltip}>
              <span class="label">Surface Radiation</span>
              <span class="value">{surfaceRadiationText} ({displayedSurfaceRadiation?.toFixed(2)})</span>
          </div>
      {/if}

      {#if body.kind === 'body' && body.atmosphere && !isStar}
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

      {#if body.kind === 'body' && body.orbitalBoundaries && !isStar}
          <div class="detail-item orbital-zones">
              <span class="label">Orbital Zones</span>
              <div class="zone-details">
                  <span><strong>Low Orbit:</strong> {Math.round(body.orbitalBoundaries.minLeoKm).toLocaleString()} - {Math.round(body.orbitalBoundaries.leoMoeBoundaryKm).toLocaleString()} km</span>
                  
                  {#if body.orbitalBoundaries.leoMoeBoundaryKm < body.orbitalBoundaries.meoHeoBoundaryKm}
                    <span><strong>Mid Orbit:</strong> {Math.round(body.orbitalBoundaries.leoMoeBoundaryKm).toLocaleString()} - {Math.round(body.orbitalBoundaries.meoHeoBoundaryKm).toLocaleString()} km {#if body.orbitalBoundaries.isGeoFallback}(Galactic Standard){/if}</span>
                  {/if}
                  
                  {#if body.orbitalBoundaries.geoStationaryKm && !body.orbitalBoundaries.isGeoFallback}
                      <span><strong>Geostationary:</strong> {Math.round(body.orbitalBoundaries.geoStationaryKm).toLocaleString()} km</span>
                  {:else if !body.orbitalBoundaries.isGeoFallback && body.orbitalBoundaries.heoUpperBoundaryKm >= 1000}
                       <!-- Only show "Unstable" if it's not a micro-system (SOI >= 1000km) -->
                      <span><strong>Geostationary:</strong> Unstable</span>
                  {/if}
                  
                  {#if body.orbitalBoundaries.meoHeoBoundaryKm < body.orbitalBoundaries.heoUpperBoundaryKm}
                    <span><strong>High Orbit:</strong> {Math.round(body.orbitalBoundaries.meoHeoBoundaryKm).toLocaleString()} - {Math.round(body.orbitalBoundaries.heoUpperBoundaryKm).toLocaleString()} km</span>
                  {/if}
              </div>
          </div>
      {/if}

      {#if body.kind === 'body' && (body.loDeltaVBudget_ms !== undefined || body.propulsiveLandBudget_ms !== undefined || body.aerobrakeLandBudget_ms !== undefined) && !isStar}
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
  .detail-item.traveller-data {
      grid-column: 1 / -1;
      border-left-color: #ffa500;
  }
  .traveller-sub {
      display: flex;
      gap: 1em;
      font-size: 0.9em;
      margin-top: 0.2em;
      color: #ccc;
  }
  .traveller-codes {
      display: flex;
      flex-wrap: wrap;
      gap: 0.5em;
      margin-top: 0.5em;
  }
  .traveller-raw {
      margin-top: 0.5em;
      font-family: monospace;
      font-size: 0.75em;
      color: #666;
      white-space: pre-wrap;
      word-break: break-all;
      border-top: 1px solid #444;
      padding-top: 4px;
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