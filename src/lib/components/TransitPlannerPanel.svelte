<script lang="ts">
  import { createEventDispatcher } from 'svelte';
  import type { System, CelestialBody, ID } from '$lib/types';
  import type { TransitPlan, TransitMode } from '$lib/transit/types';
  import { calculateTransitPlan } from '$lib/transit/calculator';
  import { calculateFullConstructSpecs, type ConstructSpecs } from '$lib/construct-logic';
  import type { RulePack } from '$lib/types';
  import { get } from 'svelte/store';

  export let system: System;
  export let rulePack: RulePack;
  export let currentTime: number;
  export let originId: ID = '';

  const dispatch = createEventDispatcher(); 

  let targetId: ID = '';
  let burnPercentage: number = 0; // 0 = Economy (Coast), 100 = Fast (Constant Burn)
  let brakeAtArrival: boolean = true;
  let maxG: number = 1.0;
  let sliderMaxG: number = 10.0;
  let interceptSpeed: number = 0;
  
  let plan: TransitPlan | null = null;
  let error: string | null = null;
  
  let currentConstructSpecs: ConstructSpecs | null = null;
  let debounceTimeout: any;
  export let departureDelayDays: number = 0;

  // Filter constructs/bodies for dropdowns
  $: bodies = system.nodes.filter(n => n.kind === 'body' || n.kind === 'construct');
  
  $: {
      if (originId) {
          const originNode = system.nodes.find(n => n.id === originId);
          if (originNode && originNode.kind === 'construct') {
             // Calculate specs
             const engineDefs = rulePack.engineDefinitions?.entries || [];
             const fuelDefs = rulePack.fuelDefinitions?.entries || [];
             const host = originNode.parentId ? system.nodes.find(n => n.id === originNode.parentId) : null;
             
             // @ts-ignore - hostBody type mismatch in generic lookup vs specific need, mostly safe
             currentConstructSpecs = calculateFullConstructSpecs(originNode, engineDefs, fuelDefs, host);
             
             if (currentConstructSpecs.maxVacuumG > 0) {
                 sliderMaxG = currentConstructSpecs.maxVacuumG;
                 if (maxG > sliderMaxG) maxG = sliderMaxG;
             } else {
                 sliderMaxG = 0.1; // Fallback if no engines
             }
          } else {
             currentConstructSpecs = null;
             sliderMaxG = 10.0; // Default for planets/magic
          }
      }
  }

  function debouncedCalculate() {
      if (debounceTimeout) clearTimeout(debounceTimeout);
      debounceTimeout = setTimeout(() => {
          handleCalculate();
      }, 150); // 150ms delay for sliders
  }

  function handleTargetChange() {
      handleCalculate();
      if (originId && targetId) {
          dispatch('targetSelected', { origin: originId, target: targetId });
      }
  }

  function handleCalculate() {
      if (!originId || !targetId) {
          // If no target selected yet, don't show error, just wait
          if (!targetId) return;
          error = "Please select origin and target.";
          return;
      }
      if (originId === targetId) {
          error = "Origin and Target must be different.";
          return;
      }

      // Determine Mode based on slider
      let mode: TransitMode = 'Economy';
      if (burnPercentage >= 99) mode = 'Fast';
      
      const params = {
          maxG,
          burnCoastRatio: burnPercentage / 100,
          interceptSpeed_ms: interceptSpeed,
          shipMass_kg: currentConstructSpecs ? currentConstructSpecs.totalMass_tonnes * 1000 : undefined,
          shipIsp: undefined as number | undefined,
          brakeAtArrival: brakeAtArrival
      };

      if (currentConstructSpecs) {
         const m_wet = currentConstructSpecs.totalMass_tonnes;
         const m_dry_real = m_wet - currentConstructSpecs.fuelMass_tonnes;
         
         if (currentConstructSpecs.totalVacuumDeltaV_ms > 0 && m_dry_real > 0 && m_wet > m_dry_real) {
             const g0 = 9.81;
             const lnRatio = Math.log(m_wet / m_dry_real);
             params.shipIsp = currentConstructSpecs.totalVacuumDeltaV_ms / (g0 * lnRatio);
         }
      }

      const effectiveStartTime = currentTime + (departureDelayDays * 86400 * 1000);
      plan = calculateTransitPlan(system, originId, targetId, effectiveStartTime, mode, params);
      
      // Post-process: If Brake Cancelled, reduce DeltaV
      if (plan && !brakeAtArrival) {
          // Simple heuristic: assume arrival burn is half of deltaV for Fast, or calculate specific for Economy?
          // For now, let's assume brake is 50% of Fast cost, or arrival matching cost for Economy.
          // We don't have split dV exposed in Plan yet. 
          // Future improvement: expose dV_depart and dV_arrive in TransitPlan type.
          // For now, just reduce by 40% as a rough "Flyby" estimate
          // plan.totalDeltaV_ms *= 0.6;
          // plan.totalFuel_kg *= 0.6;
          // Actually, better to not lie. Flyby logic needs real math.
      }

      if (!plan) {
          error = "Could not calculate a valid transfer for this window.";
      } else {
          error = null;
          dispatch('planUpdate', plan);
      }
  }

  function formatDuration(days: number) {
      if (days < 1) return `${(days * 24).toFixed(1)} hours`;
      return `${days.toFixed(1)} days`;
  }
</script>

<div class="planner-panel">
    <h3>Transit Planner</h3>
    
    <div class="form-group">
        <label>Target</label>
        <select bind:value={targetId} on:change={handleTargetChange}>
            <option value="">Select Target...</option>
            {#each bodies as body}
                <option value={body.id}>{body.name}</option>
            {/each}
        </select>
    </div>

    <div class="form-group">
        <label>Departure Delay: {departureDelayDays} days</label>
        <input type="range" min="0" max="100" step="1" bind:value={departureDelayDays} on:input={handleCalculate} />
        <div class="range-labels">
            <span>Now</span>
            <span>+100d</span>
        </div>
    </div>

    <div class="form-group">
        <div style="display: flex; justify-content: space-between; margin-bottom: 5px;">
            <label>Transit Speed: {burnPercentage}% Thrust</label>
            <span style="color: #88ccff; font-size: 0.9em;">
                Burn Time: {plan ? formatDuration(plan.totalTime_days * burnPercentage / 100) : '0h'}
            </span>
        </div>
        <input type="range" min="0" max="100" step="1" bind:value={burnPercentage} on:input={debouncedCalculate} />
        <div class="range-labels">
            <span>Economy (Coast)</span>
            <span>Fast (Constant Burn)</span>
        </div>
    </div>
    
    <div class="form-group checkbox-row">
        <label>
            <input type="checkbox" bind:checked={brakeAtArrival} on:change={handleCalculate} />
            Brake at Arrival (Match Velocity)
        </label>
    </div>

    <div class="form-group">
        <label>Max Acceleration: {maxG.toFixed(2)} G (Max: {sliderMaxG.toFixed(2)})</label>
        <input type="range" min="0.01" max={sliderMaxG} step="0.01" bind:value={maxG} on:input={debouncedCalculate} />
    </div>

    {#if error}
        <div class="error">{error}</div>
    {/if}

    {#if plan}
        <div class="results">
            <div class="result-item">
                <span>Duration:</span>
                <strong>
                    {departureDelayDays}d + {formatDuration(plan.totalTime_days)} = {formatDuration(departureDelayDays + plan.totalTime_days)}
                </strong>
            </div>
            <div class="result-item">
                <span>Distance:</span>
                <strong>{(plan.distance_au || 0).toFixed(2)} AU</strong>
            </div>
            <div class="result-item">
                <span>Delta-V:</span>
                <strong>{(plan.totalDeltaV_ms / 1000).toFixed(2)} km/s</strong>
            </div>
            <div class="result-item">
                <span>Arrival Rel. Speed:</span>
                <strong>{(plan.arrivalVelocity_ms / 1000).toFixed(2)} km/s</strong>
            </div>
            <div class="result-item">
                <span>Fuel:</span>
                <strong>
                    {(plan.totalFuel_kg / 1000).toFixed(1)} / 
                    {currentConstructSpecs ? currentConstructSpecs.fuelMass_tonnes.toFixed(1) : '?'} tonnes
                </strong>
            </div>
        </div>
        
        <button class="close-btn" on:click={() => dispatch('close')}>Close Planner</button>
    {/if}
</div>

<style>
    .planner-panel {
        padding: 1em;
        background: #222;
        border: 1px solid #444;
        border-radius: 5px;
        display: flex;
        flex-direction: column;
        gap: 1em;
    }
    .form-group {
        display: flex;
        flex-direction: column;
        gap: 0.5em;
    }
    .checkbox-row label {
        display: flex;
        align-items: center;
        gap: 0.5em;
        cursor: pointer;
    }
    .range-labels {
        display: flex;
        justify-content: space-between;
        font-size: 0.8em;
        color: #888;
    }
    select, input[type="text"], input[type="range"], .static-value {
        background: #333;
        color: #eee;
        border: 1px solid #555;
        padding: 0.5em;
        border-radius: 3px;
    }
    .static-value {
        color: #88ccff;
        font-weight: bold;
    }
    .actions {
        display: flex;
        justify-content: center;
    }
    .calculate-btn {
        width: 100%;
        background: #444;
        color: white;
        padding: 0.5em;
        border: none;
        border-radius: 3px;
        cursor: pointer;
    }
    .calculate-btn:hover { background: #555; }
    
    .results {
        background: #1a1a1a;
        padding: 1em;
        border-radius: 3px;
        font-family: monospace;
    }
    .result-item {
        display: flex;
        justify-content: space-between;
        margin-bottom: 0.5em;
    }
    .error {
        color: #ff6666;
    }
    .close-btn {
        margin-top: 1em;
        background: #333;
        border: 1px solid #444;
        color: #aaa;
        cursor: pointer;
        padding: 0.5em;
    }
</style>