<script lang="ts">
  import { createEventDispatcher } from 'svelte';
  import type { CelestialBody, RulePack } from '$lib/types';
  import { G } from '../constants'; 

  export let body: CelestialBody;
  export let rulePack: RulePack;

  const dispatch = createEventDispatcher();

  const complexities = ['none', 'simple', 'complex', 'sapient'];
  const biochemistries = ['water-carbon', 'ammonia-silicon', 'methane-carbon'];
  const energySources = ['photosynthesis', 'chemosynthesis', 'thermosynthesis'];
  const morphologies = ['microbial', 'fungal', 'flora', 'fauna'];

  let currentMorphologies: string[] = body.biosphere?.morphologies || [];
  
  let habitabilityTier = 'None';
  let tierColor = '#ef4444';

  // Habitability Score Breakdown (Reactive)
  let factors = {
      temp: { score: 0, max: 30, label: 'Temperature', val: '', ideal: '' },
      pressure: { score: 0, max: 20, label: 'Pressure', val: '', ideal: '' },
      solvent: { score: 0, max: 20, label: 'Liquid Solvent', val: '', ideal: '' },
      radiation: { score: 0, max: 15, label: 'Radiation', val: '', ideal: '' },
      gravity: { score: 0, max: 15, label: 'Gravity', val: '', ideal: '' }
  };

  $: if (body) {
      calculateHabitabilityFactors(body);
  }

  function calculateHabitabilityFactors(planet: CelestialBody) {
      if (planet.roleHint !== 'planet' && planet.roleHint !== 'moon') return;

      const scoreFromRange = (value: number, optimal: number, range: number) => {
          const diff = Math.abs(value - optimal);
          return Math.max(0, 1 - (diff / range));
      };

      // Reset
      factors.temp.score = 0; factors.temp.val = 'N/A';
      factors.pressure.score = 0; factors.pressure.val = 'N/A';
      factors.solvent.score = 0; factors.solvent.val = 'None';
      factors.radiation.score = 0; factors.radiation.val = 'N/A';
      factors.gravity.score = 0; factors.gravity.val = 'N/A';

      // Temperature Score (Max 30 points)
      if (planet.temperatureK) {
          const tC = Math.round(planet.temperatureK - 273.15);
          factors.temp.val = `${Math.round(planet.temperatureK)}K (${tC}°C)`;
          
          let optimal = 288;
          let range = 50;
          if (planet.hydrosphere?.composition === 'methane') { optimal = 111; range = 30; }
          else if (planet.hydrosphere?.composition === 'ammonia') { optimal = 218; range = 30; }
          
          factors.temp.ideal = `${optimal}K ±${range}`;
          factors.temp.score = scoreFromRange(planet.temperatureK, optimal, range) * 30;
      }

      // Pressure Score (Max 20 points)
      if (planet.atmosphere?.pressure_bar) {
          factors.pressure.val = `${planet.atmosphere.pressure_bar.toFixed(2)} bar`;
          factors.pressure.ideal = '1 ± 2 bar';
          factors.pressure.score = scoreFromRange(planet.atmosphere.pressure_bar, 1, 2) * 20;
      } else {
          factors.pressure.val = '0 bar';
      }

      // Solvent Score (Max 20 points)
      if (planet.hydrosphere) {
          factors.solvent.val = `${(planet.hydrosphere.coverage * 100).toFixed(0)}% ${planet.hydrosphere.composition}`;
          factors.solvent.ideal = '>10%';
          if (planet.hydrosphere.coverage > 0.1) {
              factors.solvent.score = 15;
              if (planet.hydrosphere.composition === 'water') {
                  factors.solvent.score += 5;
              }
          }
      }

      // Radiation Score (Max 15 points)
      const rad = planet.surfaceRadiation || 0;
      factors.radiation.val = `${rad.toFixed(2)} mSv`;
      factors.radiation.ideal = '0 ± 10';
      factors.radiation.score = scoreFromRange(rad, 0, 10) * 15;

      // Gravity Score (Max 15 points)
      const surfaceGravityG = (planet.massKg && planet.radiusKm) ? (G * planet.massKg / ((planet.radiusKm*1000) * (planet.radiusKm*1000))) / 9.81 : 0;
      if (surfaceGravityG > 0) {
          factors.gravity.val = `${surfaceGravityG.toFixed(2)} G`;
          factors.gravity.ideal = '1 ± 1.5 G';
          factors.gravity.score = scoreFromRange(surfaceGravityG, 1, 1.5) * 15;
      }

      const totalScore = factors.temp.score + factors.pressure.score + factors.solvent.score + factors.radiation.score + factors.gravity.score;
      
      // We rely on postprocessing.ts (tags) for the official tier classification to ensure consistency across the UI
      // The score is a guide, but specific requirements (like O2) determine the tier.
  }

  function getTierColor(tier: string) {
      switch (tier) {
          case 'earth-like': return '#10b981'; // Green
          case 'human': return '#f59e0b'; // Orange
          case 'alien': return '#8b5cf6'; // Purple
          default: return '#ef4444'; // Red
      }
  }

  $: tierTag = body.tags?.find(t => t.key.startsWith('habitability/'))?.key.split('/')[1] || 'none';
  $: habitabilityTier = tierTag.split('-').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' '); // Title Case
  $: tierColor = getTierColor(tierTag);

  function toggleBiosphere() {
      if (!body.biosphere || body.biosphere.complexity === 'none') {
          body.biosphere = { 
              complexity: 'simple',
              coverage: 0.1,
              biochemistry: 'water-carbon',
              energy_source: 'photosynthesis',
              morphologies: ['microbial']
          };
      } else {
          body.biosphere = undefined;
      }
      dispatch('update');
  }

  function toggleMorphology(morph: string) {
      if (!body.biosphere) return;
      if (body.biosphere.morphologies.includes(morph)) {
          body.biosphere.morphologies = body.biosphere.morphologies.filter(m => m !== morph);
      } else {
          body.biosphere.morphologies = [...body.biosphere.morphologies, morph];
      }
      currentMorphologies = body.biosphere.morphologies;
      dispatch('update');
  }

  function handleUpdate() {
      dispatch('update');
  }
</script>

<div class="tab-panel">
    <div class="habitability-section">
        <div class="total-score-header">
            <h4>Habitability Score</h4>
            <span class="tier-badge" style="background-color: {tierColor}">{habitabilityTier} ({body.habitabilityScore?.toFixed(0) || 0}%)</span>
        </div>
        
        <div class="total-progress-bar-bg">
            <div class="threshold" style="left: 40%" title="Alien Habitable (40%)"></div>
            <div class="threshold" style="left: 60%" title="Human Habitable (60%)"></div>
            <div class="threshold" style="left: 90%" title="Earth-like (90%)"></div>
            <div class="progress-bar-fill" style="width: {body.habitabilityScore || 0}%; background-color: {tierColor}"></div>
        </div>

        <div class="score-breakdown">
            {#each Object.values(factors) as factor}
                <div class="score-row">
                    <div class="score-header">
                        <span class="label">{factor.label}</span>
                        <span class="score-val">{factor.score.toFixed(0)}/{factor.max}</span>
                    </div>
                    <div class="score-details">
                        <span class="current">{factor.val}</span>
                        {#if factor.ideal}
                            <span class="ideal">(Target: {factor.ideal})</span>
                        {/if}
                    </div>
                    <div class="progress-bar-bg">
                        <div class="progress-bar-fill" style="width: {(factor.score / factor.max) * 100}%"></div>
                    </div>
                </div>
            {/each}
        </div>
    </div>

    <hr />

    <div class="form-group checkbox-row">
        <input type="checkbox" id="hasBio" checked={body.biosphere && body.biosphere.complexity !== 'none'} on:change={toggleBiosphere} />
        <label for="hasBio">Has Evolved Biosphere</label>
    </div>

    {#if body.biosphere && body.biosphere.complexity !== 'none'}
        <hr />
        <h4>Biosphere Details</h4>

        <div class="form-group">
            <label>Complexity</label>
            <select bind:value={body.biosphere.complexity} on:change={handleUpdate}>
                {#each complexities as comp}
                    <option value={comp}>{comp}</option>
                {/each}
            </select>
        </div>

        <div class="form-group">
            <label>Biochemistry</label>
            <select bind:value={body.biosphere.biochemistry} on:change={handleUpdate}>
                {#each biochemistries as bio}
                    <option value={bio}>{bio}</option>
                {/each}
            </select>
        </div>

        <div class="form-group">
            <label>Energy Source</label>
            <select bind:value={body.biosphere.energy_source} on:change={handleUpdate}>
                {#each energySources as energy}
                    <option value={energy}>{energy}</option>
                {/each}
            </select>
        </div>

        <div class="form-group">
            <div class="label-row">
                <label>Coverage ({Math.round(body.biosphere.coverage * 100)}%)</label>
                <input type="number" min="0" max="100" step="1" value={Math.round(body.biosphere.coverage * 100)} on:input={(e) => { body.biosphere.coverage = e.currentTarget.value / 100; handleUpdate(); }} style="width: 60px;" />
            </div>
            <input 
                type="range" 
                min="0" 
                max="1" 
                step="0.01" 
                bind:value={body.biosphere.coverage} 
                on:input={handleUpdate} 
                class="full-width-slider" 
            />
        </div>

        <div class="form-group">
            <label>Morphologies</label>
            <div class="morphology-checkboxes">
                {#each morphologies as morph}
                    <label class="checkbox-label">
                        <input type="checkbox" checked={currentMorphologies.includes(morph)} on:change={() => toggleMorphology(morph)} />
                        {morph.charAt(0).toUpperCase() + morph.slice(1)}
                    </label>
                {/each}
            </div>
        </div>
    {/if}
</div>

<style>
  .tab-panel { padding: 10px; display: flex; flex-direction: column; gap: 15px; }
  .form-group { display: flex; flex-direction: column; gap: 5px; }
  
  .label-row {
      display: flex;
      justify-content: space-between;
      align-items: center;
  }
  
  label { color: #ccc; font-size: 0.9em; }
  input, select { padding: 8px; border-radius: 4px; border: 1px solid #555; background-color: #444; color: #eee; }
  
  .full-width-slider { width: 100%; margin: 0; }

  .checkbox-row {
      flex-direction: row;
      align-items: center;
      gap: 10px;
  }
  .checkbox-row label { margin: 0; }
  
  hr { border: 0; border-top: 1px solid #444; margin: 5px 0; width: 100%; }
  h4 { margin: 0; color: #88ccff; font-size: 0.9em; text-transform: uppercase; }

  .habitability-section {
      background-color: #222;
      border-radius: 4px;
  }
  
  .score-breakdown {
      display: flex;
      flex-direction: column;
      gap: 8px;
      margin-top: 10px;
  }
  
  .total-score-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 5px; }
  .tier-badge { font-size: 0.9em; font-weight: bold; color: white; padding: 2px 8px; border-radius: 10px; }
  
  .total-progress-bar-bg {
      height: 10px;
      background-color: #333;
      border-radius: 5px;
      position: relative;
      margin-bottom: 15px;
      overflow: hidden;
  }
  .threshold {
      position: absolute;
      top: 0;
      bottom: 0;
      width: 2px;
      background-color: rgba(255,255,255,0.3);
      z-index: 1;
  }

  .score-row {
      display: flex;
      flex-direction: column;
      gap: 2px;
  }
  
  .score-header {
      display: flex;
      justify-content: space-between;
      font-size: 0.9em;
      font-weight: bold;
      color: #ddd;
  }
  
  .score-details {
      display: flex;
      justify-content: space-between;
      font-size: 0.8em;
      color: #999;
  }
  
  .progress-bar-bg {
      height: 4px;
      background-color: #444;
      border-radius: 2px;
      overflow: hidden;
  }
  
  .progress-bar-fill {
      height: 100%;
      background-color: #10b981; /* Green */
  }

  .morphology-checkboxes {
      display: flex;
      flex-wrap: wrap;
      gap: 10px;
  }
  .checkbox-label {
      display: flex;
      align-items: center;
      gap: 5px;
      color: #eee;
      font-size: 0.9em;
      cursor: pointer;
  }
  .checkbox-label input[type="checkbox"] { width: auto; margin: 0; }
</style>