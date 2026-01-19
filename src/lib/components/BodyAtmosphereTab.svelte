<script lang="ts">
  import type { CelestialBody, RulePack, System, Tag } from '$lib/types';
  import { createEventDispatcher, onMount } from 'svelte';
  import { recalculateSystemPhysics } from '$lib/system/postprocessing';
  import { systemStore } from '$lib/stores';
  import { checkGasRetention } from '$lib/physics/atmosphere';
  import { evaluateTagTriggers as evalTrigger } from '$lib/utils';

  const dispatch = createEventDispatcher();

  export let body: CelestialBody;
  export let rulePack: RulePack;
  export let system: System;

  let availableAtmospheres: any[] = [];
  let availableGases: string[] = [];
  let selectedAtmosphereName: string = '';
  let showAdvanced = false;

  // Reactive Gas Physics Data
  $: gasPhysics = rulePack.gasPhysics || {};

  // Ensure magnetic field object exists for binding
  $: if (body && !body.magneticField) {
      body.magneticField = { strengthGauss: 0 };
  }

  // Only sync the dropdown when we switch to a different body
  let currentBodyId = '';
  $: if (body.id !== currentBodyId) {
      currentBodyId = body.id;
      if (body.atmosphere) {
          const match = availableAtmospheres.find(a => a.name === body.atmosphere!.name);
          selectedAtmosphereName = match ? body.atmosphere.name : 'Custom Mix';
      } else {
          selectedAtmosphereName = 'None';
      }
  }

  $: {
    if (rulePack.distributions && rulePack.distributions.atmosphere_composition) {
      availableAtmospheres = rulePack.distributions.atmosphere_composition.entries.map((e: any) => e.value);
    }
    
    if (rulePack.gasPhysics) {
        availableGases = Object.keys(rulePack.gasPhysics).sort();
    }
  }

  function handleAtmosphereChange() {
    if (selectedAtmosphereName === 'None') {
      body.atmosphere = undefined;
      body.greenhouseTempK = 0;
      applyChanges();
      return;
    }

    if (selectedAtmosphereName === 'Custom Mix') return;

    const template = availableAtmospheres.find(a => a.name === selectedAtmosphereName);
    if (template) {
        const newComposition: Record<string, number> = {};
        for(const [gas, val] of Object.entries(template.composition)) {
            if (Array.isArray(val)) {
                newComposition[gas] = (val[0] + val[1]) / 2;
            } else {
                newComposition[gas] = val as number;
            }
        }
        
        normalizeComposition(newComposition);

        let newPressure = 1.0;
        if (template.pressure_range_bar) {
            newPressure = (template.pressure_range_bar[0] + template.pressure_range_bar[1]) / 2;
        }

        body.atmosphere = {
            name: template.name,
            composition: newComposition,
            pressure_bar: newPressure,
            main: Object.keys(newComposition).reduce((a, b) => newComposition[a] > newComposition[b] ? a : b)
        };
        
        applyChanges();
    }
  }

  function normalizeComposition(comp: Record<string, number>) {
      const total = Object.values(comp).reduce((a, b) => a + b, 0);
      if (total > 0) {
          for (const key in comp) {
              comp[key] = comp[key] / total;
          }
      }
  }

  function calculateShieldingScore(atm: any, pack: RulePack): number {
      if (!atm.composition) return 0.5;
      let totalShielding = 0;
      let totalGas = 0;
      for (const [gas, amount] of Object.entries(atm.composition)) {
          const coeff = pack.gasPhysics?.[gas]?.shielding ?? pack.gasShielding?.[gas] ?? 0.5;
          totalShielding += (coeff as number) * (amount as number);
          totalGas += (amount as number);
      }
      return totalGas > 0 ? totalShielding / totalGas : 0.5;
  }

  function updateGasFraction(gas: string, newPercentage: number) {
      if (!body.atmosphere) return;
      
      const newFraction = newPercentage / 100;
      const oldFraction = body.atmosphere.composition[gas] || 0;
      const diff = newFraction - oldFraction;
      
      body.atmosphere.composition[gas] = newFraction;

      const otherGases = Object.keys(body.atmosphere.composition).filter(g => g !== gas);
      const totalOthers = otherGases.reduce((sum, g) => sum + (body.atmosphere!.composition[g] || 0), 0);

      if (totalOthers > 0) {
          for (const other of otherGases) {
              const share = body.atmosphere.composition[other] / totalOthers;
              let newOtherVal = body.atmosphere.composition[other] - (diff * share);
              body.atmosphere.composition[other] = Math.max(0, newOtherVal);
          }
      } else if (newFraction < 1.0 && otherGases.length === 0) {
          body.atmosphere.composition[gas] = 1.0;
      }
      
      normalizeComposition(body.atmosphere.composition);
      
      if (!body.atmosphere.name.includes("Custom")) {
          body.atmosphere.name = "Custom Mix";
          selectedAtmosphereName = "Custom Mix";
      }

      applyChanges();
  }

  function addGas(gas: string) {
      if (!body.atmosphere) return;
      if (body.atmosphere.composition[gas]) return;

      body.atmosphere.composition[gas] = 0.05; // Start with 5%
      normalizeComposition(body.atmosphere.composition);
      
      if (!body.atmosphere.name.includes("Custom")) {
          body.atmosphere.name = "Custom Mix";
          selectedAtmosphereName = "Custom Mix";
      }
      
      applyChanges();
  }

  function removeGas(gas: string) {
      if (!body.atmosphere) return;
      delete body.atmosphere.composition[gas];
      
      if (Object.keys(body.atmosphere.composition).length > 0) {
          normalizeComposition(body.atmosphere.composition);
      } else {
          body.atmosphere.composition = { "N2": 1.0 }; // Fallback to avoid empty
      }
      
      if (!body.atmosphere.name.includes("Custom")) {
          body.atmosphere.name = "Custom Mix";
          selectedAtmosphereName = "Custom Mix";
      }

      applyChanges();
  }

  function applyChanges() {
      // 1. Recalculate Logic
      recalculateSystemPhysics(system, rulePack);
      
      // 2. Sync to global store
      systemStore.update(s => {
          if (!s) return s;
          const index = s.nodes.findIndex(n => n.id === body.id);
          if (index !== -1) {
              s.nodes[index] = { ...body };
          }
          return { ...s, isManuallyEdited: true };
      });

      // 3. Trigger local UI refresh
      body = body;
      dispatch('update', body);
  }

  function getActiveTags(gas: string, fraction: number): string[] {
      const physics = gasPhysics[gas];
      if (!physics || !physics.tags || !body.atmosphere) return [];
      
      const pressure = body.atmosphere.pressure_bar || 0;
      const context: Record<string, number | boolean> = {
          pressure_bar: pressure,
          gravity: (body.calculatedGravity_ms2 || 0) / 9.81,
          temp: body.temperatureK || 0,
          pp: pressure * fraction,
          percent: fraction
      };
      for (const g in body.atmosphere.composition) {
          context[`${g}_gas_present`] = true;
      }

      return physics.tags
          .filter(t => evalTrigger(t.trigger, context))
          .map(t => t.name);
  }

  // --- SVG Slider Logic ---
  let svgPressureSlider: SVGSVGElement;
  let isPressureDragging = false;
  let svgMagSlider: SVGSVGElement;
  let isMagDragging = false;

  const minP = 0.0001;
  const maxP = 1000;
  const minMag = 0.01;
  const maxMag = 100;

  const pressureMarks = [
    { val: 0.0001, label: '0' },
    { val: 0.01, label: '0.01' },
    { val: 1, label: '1' },
    { val: 100, label: '100' },
    { val: 1000, label: '1000' },
  ];

  const magMarks = [
      { val: 0.01, label: '0' },
      { val: 0.1, label: '0.1' },
      { val: 1, label: '1' },
      { val: 10, label: '10' },
      { val: 100, label: '100' }
  ];

  function getPressurePercent(val: number) {
      if (val <= minP) return 0; 
      const minLog = Math.log(minP);
      const maxLog = Math.log(maxP);
      return ((Math.log(val) - minLog) / (maxLog - minLog)) * 100;
  }

  function getMagPercent(val: number) {
      if (val <= minMag) return 0;
      const minLog = Math.log(minMag);
      const maxLog = Math.log(maxMag);
      return ((Math.log(val) - minLog) / (maxLog - minLog)) * 100;
  }

  function handlePressureMouseDown(e: MouseEvent) {
      isPressureDragging = true;
      updatePressureValue(e);
  }
  function handleMagMouseDown(e: MouseEvent) {
      isMagDragging = true;
      updateMagValue(e);
  }

  function updatePressureValue(e: MouseEvent) {
      if (!svgPressureSlider || !body.atmosphere) return;
      const rect = svgPressureSlider.getBoundingClientRect();
      const pct = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
      const minLog = Math.log(minP);
      const maxLog = Math.log(maxP);
      body.atmosphere.pressure_bar = Math.exp(minLog + (maxLog - minLog) * pct);
      applyChanges();
  }

  function updateMagValue(e: MouseEvent) {
      if (!svgMagSlider) return;
      const rect = svgMagSlider.getBoundingClientRect();
      const pct = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
      const minLog = Math.log(minMag);
      const maxLog = Math.log(maxMag);
      
      // Initialize if missing
      if (!body.magneticField) {
          body.magneticField = { strengthGauss: 0 };
      }
      
      body.magneticField.strengthGauss = Math.exp(minLog + (maxLog - minLog) * pct);
      applyChanges();
  }
</script>

<svelte:window 
    on:mouseup={() => { isPressureDragging = false; isMagDragging = false; }} 
    on:mousemove={(e) => { 
        if (isPressureDragging) updatePressureValue(e);
        if (isMagDragging) updateMagValue(e);
    }} 
/>

<div class="atmosphere-tab">
  <!-- MAGNETOSPHERE -->
  <div class="form-group">
      <div class="label-row">
           <label>Magnetosphere (Gauss)</label>
           <input type="number" step="0.01" bind:value={body.magneticField.strengthGauss} on:input={applyChanges} />
      </div>
      <div class="orbital-slider-container" style="height: 80px;">
          <svg 
              bind:this={svgMagSlider}
              class="orbital-slider" 
              on:mousedown={handleMagMouseDown}
              preserveAspectRatio="none"
          >
              <rect x="0" y="20" width="100%" height="10" fill="#333" rx="5" />
              <!-- Zone Indicators -->
              <rect x="0" y="35" width="{getMagPercent(2)}%" height="4" fill="orange" rx="1" />
              <text x="0%" y="50" fill="orange" font-size="10">Terrestrial</text>
              
              <rect x="{getMagPercent(0.1)}%" y="35" width="{getMagPercent(1) - getMagPercent(0.1)}%" height="4" fill="#add8e6" rx="1" />
              <text x="{getMagPercent(0.1)}%" y="50" fill="#add8e6" font-size="10">Ice</text>

              <rect x="{getMagPercent(4)}%" y="32" width="{getMagPercent(100) - getMagPercent(4)}%" height="4" fill="#cc0000" rx="1" />
              <text x="{getMagPercent(4)}%" y="50" fill="#cc0000" font-size="10">Gas</text>

              {#each magMarks as mark}
                  {@const pct = getMagPercent(mark.val)}
                  <line x1="{pct}%" y1="15" x2="{pct}%" y2="35" stroke="#888" stroke-width="1" />
                  <text x="{pct}%" y="65" fill="#888" font-size="9" text-anchor="middle">{mark.label}</text>
              {/each}
              <circle cx="{getMagPercent(body.magneticField?.strengthGauss || minMag)}%" cy="25" r="6" fill="#fff" stroke="#000" stroke-width="2" />
          </svg>
      </div>
  </div>

  <div class="form-group">
    <label for="atmosphere-preset">Atmosphere Preset</label>
    <select id="atmosphere-preset" bind:value={selectedAtmosphereName} on:change={handleAtmosphereChange}>
      <option value="None">None</option>
      {#each availableAtmospheres as atm}
        <option value={atm.name}>{atm.name}</option>
      {/each}
      <option value="Custom Mix">Custom Mix</option>
    </select>
  </div>

  {#if body.atmosphere}
    <div class="form-group">
      <label for="atm-name">Name Override</label>
      <input type="text" id="atm-name" bind:value={body.atmosphere.name} on:change={applyChanges} />
    </div>

    <!-- PRESSURE -->
    <div class="form-group">
      <div class="label-row">
          <label for="pressure">Surface Pressure (bar)</label>
          <input type="number" bind:value={body.atmosphere.pressure_bar} step="0.01" on:input={applyChanges} />
      </div>
      <div class="orbital-slider-container" style="height: 60px;">
          <svg 
              bind:this={svgPressureSlider}
              class="orbital-slider" 
              on:mousedown={handlePressureMouseDown}
              preserveAspectRatio="none"
          >
              <rect x="0" y="20" width="100%" height="10" fill="#333" rx="5" />
              {#each pressureMarks as mark}
                  {@const pct = getPressurePercent(mark.val)}
                  <line x1="{pct}%" y1="15" x2="{pct}%" y2="35" stroke="#888" stroke-width="1" />
                  <text x="{pct}%" y="45" fill="#888" font-size="9" text-anchor="middle">{mark.label}</text>
              {/each}
              <circle cx="{getPressurePercent(body.atmosphere.pressure_bar || minP)}%" cy="25" r="6" fill="#fff" stroke="#000" stroke-width="2" />
          </svg>
      </div>
    </div>

    <div class="stats-panel">
        <div class="stat">
            <span class="label">Greenhouse:</span>
            <span class="value" class:hot={body.greenhouseTempK > 50}>+{Math.round(body.greenhouseTempK || 0)} K</span>
        </div>
        <div class="stat">
            <span class="label">Scale Height:</span>
            <span class="value">{body.atmosphere.scaleHeightKm ? body.atmosphere.scaleHeightKm.toFixed(1) : '-'} km</span>
        </div>
        <div class="stat">
            <span class="label">Radiation Block:</span>
            <span class="value">
                {#if body.atmosphere && body.atmosphere.pressure_bar > 0}
                    {@const transmission = Math.exp(-calculateShieldingScore(body.atmosphere, rulePack) * body.atmosphere.pressure_bar)}
                    {((1 - transmission) * 100).toFixed(1)}%
                {:else}
                    0%
                {/if}
            </span>
        </div>
    </div>

    <div class="advanced-toggle" on:click={() => showAdvanced = !showAdvanced}>
        {showAdvanced ? '▼' : '▶'} Advanced Composition Editor
    </div>

    {#if showAdvanced}
        <div class="composition-editor">
            {#each Object.entries(body.atmosphere.composition) as [gas, fraction]}
                {@const physics = gasPhysics[gas]}
                {@const currentTemp = body.temperatureK || 288}
                {@const isGas = currentTemp >= (physics?.boilK || 0)}
                {@const isLiquid = !isGas && currentTemp >= (physics?.meltK || 0)}
                {@const phaseLabel = isGas ? 'Gas' : (isLiquid ? 'Liquid' : 'Solid')}
                {@const activeTags = getActiveTags(gas, fraction)}
                {@const retention = physics ? checkGasRetention(physics.molarMass, body) : 'stable'}
                
                <div class="gas-editor-row">
                    <div class="gas-row" class:condensed={!isGas} class:escaping={retention !== 'stable'}>
                        <span class="gas-name" title={!isGas ? `${phaseLabel} at ${Math.round(currentTemp)}K (Melt: ${physics.meltK}K, Boil: ${physics.boilK}K)` : (retention !== 'stable' ? `Unstable: Gas is too light and will escape into space.` : '')}>
                            {gas}
                            {#if !isGas}<span class="phase-warning">!</span>{/if}
                            {#if retention !== 'stable'}<span class="phase-warning escape">{retention === 'unstable' ? '△' : '🔥'}</span>{/if}
                        </span>
                        <input 
                            type="range" 
                            min="0" max="100" step="0.1" 
                            value={fraction * 100} 
                            on:input={(e) => updateGasFraction(gas, parseFloat(e.currentTarget.value))}
                        />
                        <span class="gas-val">{(fraction * 100).toFixed(1)}%</span>
                        <button class="remove-btn" on:click={() => removeGas(gas)} title="Remove Gas">×</button>
                    </div>
                    {#if activeTags.length > 0}
                        <div class="gas-tags">
                            {#each activeTags as tag}
                                <span class="mini-tag">{tag}</span>
                            {/each}
                        </div>
                    {/if}
                </div>
            {/each}

            <div class="add-gas-row">
                <select id="add-gas-select" on:change={(e) => { addGas(e.currentTarget.value); e.currentTarget.value = ''; }}>
                    <option value="" disabled selected>+ Add Gas Component</option>
                    {#each availableGases as g}
                        {#if !body.atmosphere.composition[g]}
                            {@const physics = gasPhysics[g]}
                            {@const currentTemp = body.temperatureK || 288}
                            {@const isGas = currentTemp >= (physics?.boilK || 0)}
                            {@const isLiquid = !isGas && currentTemp >= (physics?.meltK || 0)}
                            {@const phaseLabel = isGas ? '' : (isLiquid ? '(Liquid)' : '(Solid)')}
                            {@const retention = physics ? checkGasRetention(physics.molarMass, body) : 'stable'}
                            <option value={g}>
                                {g} {phaseLabel} {retention !== 'stable' ? '(Escaping)' : ''}
                            </option>
                        {/if}
                    {/each}
                </select>
            </div>
        </div>
    {:else}
        <div class="composition-summary">
            {#each Object.entries(body.atmosphere.composition) as [gas, fraction]}
                {#if fraction > 0.005}
                    {@const physics = gasPhysics[gas]}
                    {@const isGas = (body.temperatureK || 288) >= (physics?.boilK || 0)}
                    {@const activeTags = getActiveTags(gas, fraction)}
                    <div class="summary-chip" style="background: {gasPhysics[gas]?.colorHex || '#444'}44" class:condensed={!isGas}>
                        <span class="gas">{gas}</span>
                        <span class="pct">{(fraction * 100).toFixed(1)}%</span>
                        {#if !isGas}<span class="phase-indicator">❄</span>{/if}
                        {#if activeTags.length > 0}
                            <div class="chip-tags">
                                <span class="tag-info-icon" title={activeTags.join(', ')}>i</span>
                            </div>
                        {/if}
                    </div>
                {/if}
            {/each}
        </div>
    {/if}

  {/if}
</div>

<style>
  .atmosphere-tab {
    display: flex;
    flex-direction: column;
    gap: 1.2rem;
    padding: 10px;
  }
  .form-group {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }
  .label-row {
      display: flex;
      justify-content: space-between;
      align-items: center;
  }
  .slider-row input[type="number"], .label-row input[type="number"] {
      width: 85px;
      padding: 4px;
      background: #222;
      border: 1px solid #444;
      color: #fff;
      text-align: right;
  }
  .orbital-slider-container {
      width: 100%;
      user-select: none;
      margin-top: 5px;
  }
  .orbital-slider {
      width: 100%;
      height: 100%;
      overflow: visible;
  }
  text { pointer-events: none; font-family: sans-serif; }
  
  .advanced-toggle {
      cursor: pointer;
      font-weight: bold;
      color: #88ccff;
      user-select: none;
      padding: 8px 0;
      border-top: 1px solid #333;
      font-size: 0.9em;
  }
  .advanced-toggle:hover {
      color: #fff;
  }
  
  .composition-editor {
      background: rgba(0,0,0,0.15);
      padding: 10px;
      border-radius: 6px;
      display: flex;
      flex-direction: column;
      gap: 12px;
  }
  .gas-editor-row {
      display: flex;
      flex-direction: column;
      gap: 4px;
  }
  .gas-row {
      display: flex;
      align-items: center;
      gap: 10px;
  }
  .gas-row.condensed .gas-name {
      color: #88ccff;
  }
  .gas-row.escaping .gas-name {
      color: #ffaa88;
  }
  .phase-warning {
      color: #ffcc00;
      font-weight: bold;
      margin-left: 4px;
      font-size: 0.8em;
  }
  .phase-warning.escape {
      color: #ff4400;
  }
  .gas-name {
      width: 55px;
      font-weight: bold;
      font-size: 0.9em;
  }
  .gas-row input[type="range"] { flex: 1; }
  .gas-val {
      width: 55px;
      text-align: right;
      font-family: monospace;
      font-size: 0.85em;
  }
  .remove-btn {
      background: none;
      border: none;
      color: #f55;
      cursor: pointer;
      font-size: 1.4em;
      line-height: 1;
      padding: 0 5px;
  }
  .remove-btn:hover { color: #f00; }

  .gas-tags {
      display: flex;
      flex-wrap: wrap;
      gap: 4px;
      padding-left: 65px;
  }
  .mini-tag {
      font-size: 0.7em;
      background: #444;
      color: #aaa;
      padding: 1px 6px;
      border-radius: 4px;
      border: 1px solid #555;
  }

  .add-gas-row select {
      width: 100%;
      margin-top: 5px;
      padding: 6px;
      background: #333;
      border: 1px dashed #555;
      color: #aaa;
  }

  .composition-summary {
      display: flex;
      flex-wrap: wrap;
      gap: 6px;
  }
  .summary-chip {
      background: #333;
      padding: 3px 8px;
      border-radius: 12px;
      font-size: 0.8em;
      border: 1px solid #444;
      display: flex;
      align-items: center;
      position: relative;
  }
  .summary-chip.condensed {
      border-color: #5588aa;
      color: #88ccff;
  }
  .summary-chip .gas { font-weight: bold; margin-right: 4px; }
  .summary-chip .pct { color: #aaa; }
  .phase-indicator {
      margin-left: 5px;
      font-size: 0.9em;
  }
  .chip-tags {
      display: flex;
      gap: 2px;
      margin-left: 6px;
  }
  .tag-info-icon {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      width: 12px;
      height: 12px;
      background: #ffaa00;
      color: #000;
      font-size: 9px;
      font-weight: bold;
      border-radius: 50%;
      cursor: help;
      line-height: 1;
  }

  .stats-panel {
      display: grid;
      grid-template-columns: 1fr 1fr 1fr;
      gap: 8px;
      background: #1a1a1a;
      padding: 12px;
      border-radius: 8px;
      border: 1px solid #333;
  }
  .stat {
      display: flex;
      flex-direction: column;
      align-items: center;
      text-align: center;
  }
  .stat .label {
      color: #666;
      font-size: 0.7em;
      text-transform: uppercase;
      letter-spacing: 0.05em;
      margin-bottom: 2px;
  }
  .stat .value {
      font-weight: bold;
      font-size: 0.95em;
      color: #eee;
  }
  .stat .value.hot { color: #ffaa88; }
</style>