<script lang="ts">
  import type { CelestialBody, Barycenter } from "$lib/types";

  export let body: CelestialBody | Barycenter | null;

  const G = 6.67430e-11;
  const EARTH_GRAVITY = 9.80665; // m/s^2
  const EARTH_DENSITY = 5514; // kg/m^3
  const SOLAR_MASS_KG = 1.989e30;
  const EARTH_MASS_KG = 5.972e24;
  const AU_KM = 149597870.7;

  const STAR_TYPE_DESC: Record<string, string> = {
      'O': 'Extremely hot, luminous, and blue. Very rare and short-lived. High radiation.',
      'B': 'Hot, luminous, blue-white stars. High radiation.',
      'A': 'White or bluish-white stars, like Sirius. Moderate radiation.',
      'F': 'Yellow-white stars, stronger than the Sun. Moderate radiation.',
      'G': 'Yellow, sun-like stars. Good candidates for habitable planets.',
      'K': 'Orange dwarfs, cooler and longer-lived than the Sun. Low radiation.',
      'M': 'Red dwarfs. The most common, very long-lived, but dim and cool. Low radiation.',
      'WD': 'White Dwarf. The dense, hot remnant of a dead star. High radiation.',
      'NS': 'Neutron Star. An extremely dense, rapidly spinning stellar remnant. Extreme radiation.',
      'BH': 'Black Hole. A region of spacetime where gravity is so strong nothing can escape. Extreme radiation.'
  }

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

    if (body && body.kind === 'body') {
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

            const starClass = body.classes[0]?.split('/')[1]?.[0];
            if (starClass && (starClass === 'O' || starClass === 'B' || starClass === 'N')) radiationLevel = 'Extreme';
            else if (starClass && (starClass === 'A' || starClass === 'W')) radiationLevel = 'High';
            else if (starClass && (starClass === 'F' || starClass === 'G')) radiationLevel = 'Moderate';
            else radiationLevel = 'Low';
        } else if (body.massKg) {
            const massInEarths = body.massKg / EARTH_MASS_KG;
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
  }

</script>

<div class="details-panel">
  {#if body}
    <h2>{body.name}</h2>
    <div class="content-wrapper">
        {#if body.kind === 'body' && body.image}
            <div class="planet-image-container">
                <img src={body.image.url} alt="Artist's impression of {body.name}" class="planet-image" />
            </div>
        {/if}

        <div class="details-grid">
            <div class="detail-item">
                <span class="label">Kind</span>
                <span class="value">{body.kind}{#if body.kind === 'body'} ({body.roleHint}){/if}</span>
            </div>
            
            {#if body.kind === 'body'}
                <div class="detail-item">
                    <span class="label">Classification</span>
                    <span class="value">{body.classes.join(', ')}</span>
                </div>
                {#if STAR_TYPE_DESC[body.classes[0]?.split('/')[1]?.[0]]}
                    <div class="detail-item description">
                        <span class="value">{STAR_TYPE_DESC[body.classes[0].split('/')[1][0]]}</span>
                    </div>
                {/if}
            {/if}

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

            {#if radiationLevel}
                <div class="detail-item">
                    <span class="label">Radiation Level</span>
                    <span class="value">{radiationLevel}</span>
                </div>
            {/if}

            {#if body.kind === 'body' && body.atmosphere}
                <div class="detail-item">
                    <span class="label">Atmosphere</span>
                    <span class="value">{body.atmosphere.pressure_bar?.toFixed(2)} bar ({body.atmosphere.main})</span>
                </div>
            {/if}

            {#if body.kind === 'body' && body.hydrosphere && body.hydrosphere.coverage > 0}
                <div class="detail-item">
                    <span class="label">Hydrosphere</span>
                    <span class="value">{Math.round(body.hydrosphere.coverage * 100)}% {body.hydrosphere.composition}</span>
                </div>
            {/if}
        </div>
    </div>

  {:else}
    <p>Select a body to see its details.</p>
  {/if}
</div>

<style>
  .details-panel {
    border: 1px solid #333;
    background-color: #1a1a1a;
    padding: 1em;
    margin-top: 1em;
    border-radius: 5px;
    color: #eee;
  }
  h2 {
    margin-top: 0;
    color: #ff3e00;
  }
  .content-wrapper {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 1em;
  }
  .planet-image-container {
      grid-column: 1;
  }
  .details-grid {
      grid-column: 2;
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
  .planet-image {
    max-width: 100%;
    border-radius: 5px;
  }</style>