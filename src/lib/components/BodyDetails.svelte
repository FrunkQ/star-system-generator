<script lang="ts">
  import type { CelestialBody, Barycenter } from "$lib/types";

  export let body: CelestialBody | Barycenter | null;

  const G = 6.67430e-11;
  const EARTH_GRAVITY = 9.80665; // m/s^2
  const EARTH_DENSITY = 5514; // kg/m^3

  const STAR_TYPE_DESC: Record<string, string> = {
      'O': 'Extremely hot, luminous, and blue. Very rare and short-lived.',
      'B': 'Hot, luminous, blue-white stars.',
      'A': 'White or bluish-white stars, like Sirius.',
      'F': 'Yellow-white stars, stronger than the Sun.',
      'G': 'Yellow, sun-like stars. Good candidates for habitable planets.',
      'K': 'Orange dwarfs, cooler and longer-lived than the Sun.',
      'M': 'Red dwarfs. The most common, very long-lived, but dim and cool.',
      'WD': 'White Dwarf. The dense, hot remnant of a dead star.',
      'NS': 'Neutron Star. An extremely dense, rapidly spinning stellar remnant.',
      'BH': 'Black Hole. A region of spacetime where gravity is so strong nothing can escape.'
  }

  let surfaceGravityG: number | null = null;
  let densityRelative: number | null = null;
  let surfaceTempC: number | null = null;

  $: {
    if (body && body.kind === 'body' && body.massKg && body.radiusKm) {
        const mass = body.massKg;
        const radiusM = body.radiusKm * 1000;
        surfaceGravityG = (G * mass / (radiusM * radiusM)) / EARTH_GRAVITY;
        
        const volume = (4/3) * Math.PI * Math.pow(radiusM, 3);
        const density = mass / volume;
        densityRelative = density / EARTH_DENSITY;
    } else {
        surfaceGravityG = null;
        densityRelative = null;
    }

    if (body && body.kind === 'body' && body.temperatureK) {
        surfaceTempC = body.temperatureK - 273.15;
    } else {
        surfaceTempC = null;
    }
  }

</script>

<div class="details-panel">
  {#if body}
    <h2>{body.name}</h2>
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

        {#if surfaceTempC !== null}
            <div class="detail-item">
                <span class="label">Surface Temp.</span>
                <span class="value">{Math.round(surfaceTempC)} °C</span>
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
</style>