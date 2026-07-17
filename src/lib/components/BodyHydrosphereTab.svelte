<script lang="ts">
  import { createEventDispatcher } from 'svelte';
  import type { CelestialBody, RulePack } from '$lib/types';
  import { LIQUIDS as FALLBACK_LIQUIDS } from '$lib/constants';
  import { liquidsLiquidInRange, phaseAtP, phaseReason } from '$lib/physics/liquids';
  import { fmt } from '$lib/stores';

  export let body: CelestialBody;
  export let rulePack: RulePack | null = null;

  const dispatch = createEventDispatcher();

  $: liquids = rulePack?.liquids && rulePack.liquids.length > 0 ? rulePack.liquids : FALLBACK_LIQUIDS;

  $: currentTemp = body.temperatureK || 0;
  // Surface pressure gates the phase: a thick atmosphere raises boiling; a near-vacuum forces
  // sublimation (no liquid at all). Undefined pressure → the solvent's 1-atm behaviour.
  $: surfPbar = body.atmosphere?.pressure_bar;

  // The surface INSOLATION range (poles↔equator, night↔day, winter↔summer) — excludes localized
  // tidal-volcanic hotspots, which are vents, not where a standing liquid body sits.
  $: profile = body.temperatureProfile;
  $: surfaceMinK = profile ? profile.totalMinK : currentTemp;
  $: surfaceMaxK = profile
      ? Math.max(profile.meanK, ...profile.components.filter(c => c.source !== 'tidal-hotspot').map(c => c.highK))
      : currentTemp;

  // Offer every liquid that is LIQUID somewhere across that range (e.g. liquid at the equator even
  // if the mean is below freezing) — the temperature model now informs which solvents are viable.
  $: validLiquids = liquidsLiquidInRange(surfaceMinK, surfaceMaxK, rulePack);
  // Live phase of every liquid at THIS temperature & pressure — drives the per-option phase hints.
  $: phaseOf = (name: string) => phaseAtP(name, currentTemp, surfPbar, rulePack);

  // Check if the current selection is actually liquid here (pressure-aware, not a ±20 K fudge).
  $: currentLiquidDef = body.hydrosphere ? liquids.find(l => l.name === body.hydrosphere!.composition) : null;
  $: currentPhase = body.hydrosphere ? phaseOf(body.hydrosphere.composition) : 'liquid';
  $: isCurrentValid = !body.hydrosphere || !currentLiquidDef || currentPhase === 'liquid';

  $: warningMsg = !isCurrentValid && body.hydrosphere
      ? `${currentLiquidDef?.label || body.hydrosphere.composition} is not liquid here: ${phaseReason(body.hydrosphere.composition, currentTemp, surfPbar, rulePack)}. The recorded coverage is displayed by its actual phase.`
      : '';
  const PHASE_LABEL: Record<string, string> = { solid: 'frozen', gas: 'vapour', supercritical: 'supercritical', liquid: 'liquid' };

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
        <div class="label-row">
            <label>Primary Liquid Composition</label>
            {#if body.hydrosphere}
                <span class="phase-chip {currentPhase}" title="Phase of the recorded solvent at {$fmt.tempK(currentTemp)}{surfPbar !== undefined ? ` / ${surfPbar} bar` : ''}">{PHASE_LABEL[currentPhase] ?? currentPhase}</span>
            {/if}
        </div>
        <select value={body.hydrosphere ? body.hydrosphere.composition : 'none'} on:change={handleCompositionChange} class:warning={!isCurrentValid}>
            <option value="none">None</option>

            {#if validLiquids.length > 0}
                <optgroup label="Liquid somewhere on this world">
                    {#each validLiquids as comp}
                        {@const ph = phaseOf(comp.name)}
                        <option value={comp.name}>{comp.label}{ph === 'liquid' ? '' : ` — ${PHASE_LABEL[ph] ?? ph} at the mean`}</option>
                    {/each}
                </optgroup>
            {/if}

            {#if body.hydrosphere && !validLiquids.some(l => l.name === body.hydrosphere.composition)}
                <optgroup label="Current selection">
                    <option value={body.hydrosphere.composition}>
                        {currentLiquidDef ? currentLiquidDef.label : body.hydrosphere.composition}{currentPhase === 'liquid' ? '' : ` (${PHASE_LABEL[currentPhase] ?? currentPhase})`}
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

    {#if body.hydrosphere?.layers && body.hydrosphere.layers.length}
        <div class="form-group">
            <label>Derived Fluid Layers <span class="derived-pill" title="Computed from the composition, temperature range and atmosphere: surface vs subsurface oceans, cloud decks, and the deep conductive layer that drives the magnetic dynamo.">derived</span></label>
            <div class="layers">
                {#each body.hydrosphere.layers as l}
                    <div class="layer">
                        <span class="l-dot" style="background-color: {l.colorHex || '#888'}"></span>
                        <span class="l-loc">{l.location}</span>
                        <span class="l-liq">{l.liquid.replace(/-/g, ' ')}</span>
                        {#if l.conductive}<span class="l-flag" title="Electrically conductive — can drive a magnetic dynamo">conductive</span>{/if}
                    </div>
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
  
  label { color: var(--text-muted); font-size: 0.9em; }
  input, select { padding: 8px; border-radius: 4px; border: 1px solid var(--border); background-color: var(--bg-control); color: var(--text); }
  
  select.warning { border-color: #f59e0b; color: #f59e0b; }
  .warning-text { color: #f59e0b; font-size: 0.8em; margin-top: 2px; }
  .phase-chip { font-size: 0.72em; text-transform: uppercase; letter-spacing: 0.04em; border-radius: 3px; padding: 0 6px; border: 1px solid var(--border); }
  .phase-chip.liquid { color: #3b82f6; border-color: #3b82f6; }
  .phase-chip.solid { color: #9fd0ff; }
  .phase-chip.gas { color: #e8a857; border-color: #e8a857; }
  .phase-chip.supercritical { color: #c98fe0; border-color: #c98fe0; }
  .derived-pill { font-size: 0.68em; text-transform: uppercase; letter-spacing: 0.04em; color: var(--text-faint); border: 1px solid var(--border); border-radius: 3px; padding: 0 4px; margin-left: 4px; cursor: help; }
  .layers { display: flex; flex-direction: column; gap: 4px; }
  .layer { display: flex; align-items: center; gap: 8px; font-size: 0.85em; }
  .l-dot { width: 11px; height: 11px; border-radius: 3px; border: 1px solid rgba(255,255,255,0.25); flex: 0 0 auto; }
  .l-loc { color: var(--text-muted); text-transform: capitalize; width: 78px; flex: 0 0 auto; }
  .l-liq { color: var(--text); text-transform: capitalize; }
  .l-flag { font-size: 0.72em; color: #6aa0d8; border: 1px solid var(--border); border-radius: 3px; padding: 0 4px; margin-left: auto; }

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
      color: var(--text-faint);
  }
</style>
