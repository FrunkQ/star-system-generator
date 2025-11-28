<script lang="ts">
  import { createEventDispatcher } from 'svelte';
  import type { CelestialBody, RulePack } from '$lib/types';
  import { LIQUIDS as FALLBACK_LIQUIDS } from '$lib/constants';

  export let body: CelestialBody;
  export let rulePack: RulePack | null = null;

  const dispatch = createEventDispatcher();

  $: liquids = rulePack?.liquids && rulePack.liquids.length > 0 ? rulePack.liquids : FALLBACK_LIQUIDS;

  $: currentTemp = body.temperatureK || 0;

  // Filter liquids based on current temperature (+/- 20K buffer)
  // We list ALL liquids defined in liquids.json that are stable, ignoring the generation distribution list.
  $: validLiquids = liquids.filter(l => 
      currentTemp >= (l.meltK - 20) && currentTemp <= (l.boilK + 20)
  );
  
  // Check if current selection is valid
  $: currentLiquidDef = body.hydrosphere ? liquids.find(l => l.name === body.hydrosphere!.composition) : null;
  
  $: isCurrentValid = !body.hydrosphere || !currentLiquidDef
      ? true 
      : (currentTemp >= (currentLiquidDef.meltK - 20) && currentTemp <= (currentLiquidDef.boilK + 20));
      
  $: warningMsg = !isCurrentValid && body.hydrosphere 
      ? `Warning: ${Math.round(currentTemp - 273.15)}°C is outside stability range for ${currentLiquidDef?.label || body.hydrosphere.composition}.` 
      : '';

  // Coverage Slider State
  let svgCoverageSlider: SVGSVGElement;
  let isCoverageDragging = false;

  function handleCoverageMouseDown(e: MouseEvent) {
      isCoverageDragging = true;
      updateCoverageValue(e);
  }

  function handleCoverageMouseMove(e: MouseEvent) {
      if (!isCoverageDragging) return;
      updateCoverageValue(e);
  }

  function handleCoverageMouseUp() {
      isCoverageDragging = false;
  }

  function updateCoverageValue(e: MouseEvent) {
      const rect = svgCoverageSlider.getBoundingClientRect();
      let x = e.clientX - rect.left;
      let pct = Math.max(0, Math.min(1, x / rect.width)); 
      
      if (!body.hydrosphere) { 
          body.hydrosphere = { composition: 'water', coverage: pct };
      } else {
          body.hydrosphere.coverage = parseFloat(pct.toFixed(2));
      }
      dispatch('update', body);
  }

  function handleCompositionChange(event: Event) {
      const val = (event.target as HTMLSelectElement).value;
      if (val === 'none') {
          body.hydrosphere = undefined;
      } else {
          if (!body.hydrosphere) {
              body.hydrosphere = { composition: val, coverage: 0.5 };
          } else {
              body.hydrosphere.composition = val;
          }
      }
      dispatch('update', body);
  }

  function handleUpdate() {
      dispatch('update', body);
  }
</script>

<svelte:window on:mouseup={handleCoverageMouseUp} on:mousemove={handleCoverageMouseMove} />

<div class="tab-panel">
    <div class="form-group">
        <label>Primary Liquid Composition</label>
        <select value={body.hydrosphere ? body.hydrosphere.composition : 'none'} on:change={handleCompositionChange} class:warning={!isCurrentValid}>
            <option value="none">None</option>
            
            {#if validLiquids.length > 0}
                <optgroup label="Stable Liquids">
                    {#each validLiquids as comp}
                        <option value={comp.name}>{comp.label}</option>
                    {/each}
                </optgroup>
            {/if}

            {#if body.hydrosphere && !isCurrentValid}
                <optgroup label="Current (Unstable)">
                    <option value={body.hydrosphere.composition}>
                        {currentLiquidDef ? currentLiquidDef.label : body.hydrosphere.composition} 
                        ({currentTemp < (currentLiquidDef?.meltK || 0) ? 'Frozen' : 'Boiling'})
                    </option>
                </optgroup>
            {/if}
        </select>
        {#if warningMsg}
            <div class="warning-text">{warningMsg}</div>
        {/if}
    </div>

    {#if body.hydrosphere}
        <div class="form-group">
            <div class="label-row">
                <label>Surface Coverage ({Math.round(body.hydrosphere.coverage * 100)}%)</label>
                <input type="number" min="0" max="100" step="1" value={Math.round(body.hydrosphere.coverage * 100)} on:input={(e) => { body.hydrosphere.coverage = e.currentTarget.value / 100; handleUpdate(); }} style="width: 60px;" />
            </div>
            <div class="viz-container">
                <div class="viz-bar">
                    <div class="water-bar" style="width: {body.hydrosphere.coverage * 100}%;"></div>
                    <div class="land-bar" style="width: {(1 - body.hydrosphere.coverage) * 100}%;"></div>
                </div>
                <svg 
                    bind:this={svgCoverageSlider}
                    class="coverage-slider-svg" 
                    on:mousedown={handleCoverageMouseDown}
                    preserveAspectRatio="none"
                >
                    <circle cx="{body.hydrosphere.coverage * 100}%" cy="10" r="6" fill="#fff" stroke="#000" stroke-width="2" style="cursor: grab;" />
                </svg>
            </div>
            <div class="viz-labels">
                <span>Liquid</span>
                <span>Land</span>
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
  
  select.warning { border-color: #f59e0b; color: #f59e0b; }
  .warning-text { color: #f59e0b; font-size: 0.8em; margin-top: 2px; }

  .viz-container {
      position: relative;
      height: 20px; 
      margin-top: 2px;
  }

  .viz-bar {
      display: flex;
      height: 100%;
      width: 100%;
      border-radius: 4px;
      overflow: hidden;
      position: absolute;
      top: 0;
      left: 0;
      pointer-events: none; 
  }
  .water-bar { background-color: #3b82f6; height: 100%; }
  .land-bar { background-color: #78350f; height: 100%; }
  
  .coverage-slider-svg {
      position: absolute;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      overflow: visible;
  }

  .viz-labels {
      display: flex;
      justify-content: space-between;
      font-size: 0.7em;
      color: #888;
  }
</style>
