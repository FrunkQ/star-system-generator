<script lang="ts">
  import { createEventDispatcher } from 'svelte';
  import type { System, CelestialBody, ID } from '$lib/types';
  import type { TransitPlan, TransitMode, Vector2, StateVector } from '$lib/transit/types';
  import { calculateTransitPlan } from '$lib/transit/calculator';
  import { calculateFullConstructSpecs, type ConstructSpecs } from '$lib/construct-logic';
  import { getOrbitOptions } from '$lib/physics/orbits';
  import { AU_KM } from '$lib/constants';
  import type { RulePack } from '$lib/types';
  import { get } from 'svelte/store';
  import { getNodeColor } from '$lib/rendering/colors';
  import { getAbsoluteOrbitalDistanceAU } from '$lib/system/utils';
  import { calculateFlightTelemetry, type TelemetryPoint } from '$lib/transit/telemetry';

  import DualRangeSlider from './DualRangeSlider.svelte';
  import TransitStressGraph from './TransitStressGraph.svelte';

  export let system: System;
  export let rulePack: RulePack;
  export let currentTime: number;
  export let originId: ID = '';
  export let constructId: ID = ''; 
  export let departureDelayDays: number = 0;
  export let journeyProgress: number = 0; // 0..100
  export let completedPlans: TransitPlan[] = [];
  export let initialState: StateVector | undefined = undefined;

  const dispatch = createEventDispatcher(); 

  let targetId: ID = '';
  let selectedOrbitId: string = 'lo'; // Default to Low Orbit
  let orbitOptions: { id: string, name: string, radiusKm: number }[] = [];
  
  let accelPercent: number = 10; 
  let brakeStartPercent: number = 90;
  let brakeAtArrival: boolean = true;
  let useAerobrake: boolean = true;
  let maxG: number = 1.0;
  let sliderMaxG: number = 10.0;
  let interceptSpeed: number = 0;
  
  let availablePlans: TransitPlan[] = [];
  let selectedPlanIndex: number = 0;
  let plan: TransitPlan | null = null;
  let error: string | null = null;
  let lastCalcParams: any = null;
  let hiddenPlanCount = 0;
  
  let currentConstructSpecs: ConstructSpecs | null = null;
  let debounceTimeout: any;
  let telemetryData: TelemetryPoint[] = [];

  let previousOriginId: ID = '';

  $: if (system && (plan || completedPlans.length > 0)) {
      const plansToAnalyze = [...completedPlans];
      if (plan) plansToAnalyze.push(plan);
      if (plansToAnalyze.length > 0) {
          telemetryData = calculateFlightTelemetry(system, plansToAnalyze, rulePack);
      } else {
          telemetryData = [];
      }
  } else {
      telemetryData = [];
  }

  $: targetHasAtmosphere = false;
  $: canAerobrakeConstruct = currentConstructSpecs?.canAerobrake || false;
  $: canAerobrakeEffective = targetHasAtmosphere && canAerobrakeConstruct;

  $: if (targetId) {
      const body = system.nodes.find(n => n.id === targetId);
      if (body && body.kind === 'body' && body.atmosphere && body.atmosphere.pressure_bar > 0.001) {
          targetHasAtmosphere = true;
      } else {
          targetHasAtmosphere = false;
      }
  }

  $: if (originId !== previousOriginId) {
      targetId = '';
      selectedOrbitId = 'lo';
      orbitOptions = [];
      availablePlans = [];
      hiddenPlanCount = 0;
      selectedPlanIndex = 0;
      plan = null;
      error = null;
      previousOriginId = originId;
  }

  $: originString = (() => {
      const originNode = system.nodes.find(n => n.id === originId);
      if (!originNode) return 'Unknown Location';
      
      // If we are planning for a specific construct and it IS the origin (Leg 1), use its detailed orbit string
      if (constructId && originId === constructId && currentConstructSpecs) {
          return currentConstructSpecs.orbit_string;
      }
      
      // Otherwise (Leg 2+), we are orbiting the previous target
      return `Orbiting ${originNode.name}`;
  })();

  function getOptionColor(node: any): string {
      return getNodeColor(node);
  }

  // Filter constructs/bodies for dropdowns
  // Rule: Only show "Major" targets (Stars, Planets, Barycenters, Independent Constructs)
  // Hide Moons and things orbiting planets (users should target the planet first)
  $: bodies = system.nodes.filter(n => {
      // Always show stars
      if (n.roleHint === 'star') return true;
      // Always show barycenters
      if (n.kind === 'barycenter') return true;
      
      // For bodies/constructs, check parent
      if (n.parentId) {
          const parent = system.nodes.find(p => p.id === n.parentId);
          // Show if parent is a Star or Barycenter
          if (parent && (parent.roleHint === 'star' || parent.kind === 'barycenter')) return true;
          return false; // Hide if parent is a Planet/Moon
      }
      
      // Show if no parent (Root)
      return true;
  }).sort((a, b) => {
      // Sort by Distance from Parent (approx a_AU) then Name
      const distA = a.orbit?.elements.a_AU || 0;
      const distB = b.orbit?.elements.a_AU || 0;
      if (Math.abs(distA - distB) > 0.001) return distA - distB;
      return a.name.localeCompare(b.name);
  });

  $: totalUsedFuel = completedPlans.reduce((acc, p) => acc + p.totalFuel_kg, 0);
  
  $: canAfford = !plan || (currentConstructSpecs && (currentConstructSpecs.fuelMass_tonnes * 1000 - totalUsedFuel - plan.totalFuel_kg) >= -100); // 100kg tolerance
  
  $: if (originId) {
      // Reset target when origin changes (chaining)
      if (targetId === originId) {
          targetId = ''; 
          selectedOrbitId = 'lo';
          orbitOptions = [];
          availablePlans = [];
          selectedPlanIndex = 0;
          plan = null;
          error = null;
      }
  }

  $: {
      const shipId = constructId || originId;
      
      if (shipId) {
          const shipNode = system.nodes.find(n => n.id === shipId);
          if (shipNode && shipNode.kind === 'construct') {
             const engineDefs = rulePack.engineDefinitions?.entries || [];
             const fuelDefs = rulePack.fuelDefinitions?.entries || [];
             const host = shipNode.parentId ? system.nodes.find(n => n.id === shipNode.parentId) : null;
             
             // @ts-ignore
             currentConstructSpecs = calculateFullConstructSpecs(shipNode, engineDefs, fuelDefs, host);
             
             // Calculate Dynamic Max G based on fuel used so far
             const currentMassKg = (currentConstructSpecs.totalMass_tonnes * 1000) - totalUsedFuel;
             const thrustN = (currentConstructSpecs.maxVacuumG * 9.81) * (currentConstructSpecs.totalMass_tonnes * 1000);
             
             if (currentMassKg > 0 && thrustN > 0) {
                 const newMaxG = (thrustN / currentMassKg) / 9.81;
                 sliderMaxG = newMaxG;
                 if (maxG > sliderMaxG) maxG = sliderMaxG;
             } else {
                 sliderMaxG = 0.1;
             }
          } else if (!constructId) {
             currentConstructSpecs = null;
             sliderMaxG = 10.0;
          }
      }
  }

  function debouncedCalculate() {
      if (debounceTimeout) clearTimeout(debounceTimeout);
      debounceTimeout = setTimeout(() => {
          handleCalculate();
      }, 150);
  }

  function handleTargetChange() {
      if (targetId) {
          const body = system.nodes.find(n => n.id === targetId);
          if (body && body.kind === 'body') {
              orbitOptions = getOrbitOptions(body, rulePack, system);
              if (orbitOptions.length > 0) {
                  selectedOrbitId = orbitOptions[0].id;
              } else {
                  selectedOrbitId = 'lo';
              }
          } else {
              orbitOptions = [];
              selectedOrbitId = 'lo';
          }
      } else {
          orbitOptions = [];
          selectedOrbitId = 'lo';
      }
      
      selectedPlanIndex = 0; // Reset selection
      handleCalculate();
      if (originId && targetId) {
          dispatch('targetSelected', { origin: originId, target: targetId });
      }
  }
  
  function selectPlan(index: number) {
      if (index >= 0 && index < availablePlans.length) {
          selectedPlanIndex = index;
          plan = availablePlans[index];
          
          // Sync sliders to this plan's parameters
          if (plan.accelRatio !== undefined && plan.brakeRatio !== undefined) {
              accelPercent = plan.accelRatio * 100;
              brakeStartPercent = 100 - (plan.brakeRatio * 100);
          }
          
          dispatch('planUpdate', plan);
          
          // Update alternatives for ghost rendering
          const alternatives = availablePlans.filter(p => p !== plan);
          dispatch('alternativesUpdate', alternatives);
      }
  }

  function handleCalculate() {
      if (!originId || !targetId) {
          if (!targetId) return;
          error = "Please select origin and target.";
          return;
      }
      if (originId === targetId) {
          error = "Origin and Target must be different.";
          return;
      }

      // Resolve Orbit Option
      let targetOrbitRadiusKm = 0;
      let targetOffsetAnomaly = 0;
      
      const selectedOpt = orbitOptions.find(o => o.id === selectedOrbitId);
      if (selectedOpt) {
          targetOrbitRadiusKm = selectedOpt.radiusKm;
          if (selectedOrbitId === 'l4') targetOffsetAnomaly = Math.PI / 3; // +60 deg
          if (selectedOrbitId === 'l5') targetOffsetAnomaly = -Math.PI / 3; // -60 deg
      }

      // Validate Initial State
      let safeInitialState = initialState;
      if (safeInitialState) {
          if (isNaN(safeInitialState.r.x) || isNaN(safeInitialState.r.y) || isNaN(safeInitialState.v.x) || isNaN(safeInitialState.v.y)) {
              console.warn("Invalid initial state detected, resetting.");
              safeInitialState = undefined;
          }
      }

      let mode: TransitMode = 'Economy'; // Always Economy/Variable now
      
      const params = {
          maxG,
          accelRatio: accelPercent / 100,
          brakeRatio: (100 - brakeStartPercent) / 100,
          interceptSpeed_ms: interceptSpeed,
          shipMass_kg: currentConstructSpecs ? (currentConstructSpecs.totalMass_tonnes * 1000 - totalUsedFuel) : undefined,
          shipIsp: undefined as number | undefined,
          brakeAtArrival: brakeAtArrival,
          initialState: safeInitialState,
          parkingOrbitRadius_au: targetOrbitRadiusKm > 0 ? targetOrbitRadiusKm / AU_KM : undefined,
          targetOffsetAnomaly: targetOffsetAnomaly,
          arrivalPlacement: selectedOrbitId,
          aerobrake: {
              allowed: useAerobrake && canAerobrakeEffective,
              limit_kms: currentConstructSpecs?.aerobrakeLimit_kms || 0
          }
      };

      if (currentConstructSpecs) {
         if (currentConstructSpecs.avgVacIsp > 0) {
             params.shipIsp = currentConstructSpecs.avgVacIsp;
         }
      }
      
      lastCalcParams = params;

      // Capture currently selected plan type to restore selection after sort
      const currentSelectedType = availablePlans[selectedPlanIndex]?.planType;

      const effectiveStartTime = currentTime + (departureDelayDays * 86400 * 1000);
      const allPlans = calculateTransitPlan(system, originId, targetId, effectiveStartTime, mode, params);
      
      const visiblePlans = allPlans.filter(p => !p.hiddenReason);
      hiddenPlanCount = allPlans.length - visiblePlans.length;
      
      if (!visiblePlans || visiblePlans.length === 0) {
          // ... error handling ...
          if (hiddenPlanCount > 0) {
              error = "All efficient plans are impractical due to high initial velocity (Delta-V > 100 km/s). Use Direct Burn if possible.";
          } else {
              error = "Could not calculate a valid transfer for this window.";
          }
          availablePlans = [];
          plan = null;
      } else {
          error = null;
          availablePlans = visiblePlans;
          
          // Restore selection based on Plan Type
          let newIndex = 0;
          if (currentSelectedType) {
              const foundIndex = availablePlans.findIndex(p => p.planType === currentSelectedType);
              if (foundIndex !== -1) {
                  newIndex = foundIndex;
              }
          }
          selectedPlanIndex = newIndex;
          
          plan = availablePlans[selectedPlanIndex];
          
          // Sync Sliders to Plan (Visual Feedback)
          // Always sync to show the actual burn profile calculated by the solver
          if (plan.accelRatio !== undefined && plan.brakeRatio !== undefined) {
               accelPercent = plan.accelRatio * 100;
               brakeStartPercent = 100 - (plan.brakeRatio * 100);
          }
          
          dispatch('planUpdate', plan);
          
          // Dispatch alternatives for ghost rendering
          const alternatives = availablePlans.filter(p => p !== plan);
          dispatch('alternativesUpdate', alternatives);
      }
      
      journeyProgress = 0;
      updatePreview();
  }

  function calculateFuelSaved(p: TransitPlan): string {
      if (!p || !p.aerobrakingDeltaV_ms || !currentConstructSpecs || !lastCalcParams?.shipIsp) return '';
      
      const isp = lastCalcParams.shipIsp;
      const g0 = 9.81;
      const Ve = isp * g0;
      
      // M_final is mass after all burns.
      // Current plan.totalFuel_kg accounts for the burns we ARE doing.
      // So M_final = M_wet - Fuel_used.
      const m_final = (currentConstructSpecs.totalMass_tonnes * 1000) - p.totalFuel_kg;
      
      // Fuel required WITHOUT aerobraking:
      // dV_total_virtual = p.totalDeltaV_ms + p.aerobrakingDeltaV_ms
      const dv_virtual = p.totalDeltaV_ms + p.aerobrakingDeltaV_ms;
      
      const m_start_virtual = m_final * Math.exp(dv_virtual / Ve);
      const fuel_virtual = m_start_virtual - m_final;
      
      const fuel_saved_kg = fuel_virtual - p.totalFuel_kg;
      
      if (fuel_saved_kg < 100) return '';
      return ` (Saved ${(fuel_saved_kg/1000).toFixed(1)}t fuel)`;
  }

  function formatDuration(days: number) {
      if (days < 1) return `${(days * 24).toFixed(1)} hours`;
      return `${days.toFixed(1)} days`;
  }
  
  let previewStatusString = "";
  let currentHazards: { level: string; message: string }[] = [];
  
  let legTicks: number[] = [];
  let legLabels: {pct: number, text: string}[] = [];

  $: {
      // Calculate Ticks and Labels reactively
      const ticks: number[] = [];
      const labels: {pct: number, text: string}[] = [];
      
      const hasPlan = !!plan;
      const hasCompleted = completedPlans.length > 0;
      
      if (hasCompleted || hasPlan) {
          const missionStart = hasCompleted ? completedPlans[0].startTime : currentTime;
          let missionEnd = missionStart;
          if (plan) {
              missionEnd = plan.startTime + (plan.totalTime_days * 86400 * 1000);
          } else if (hasCompleted) {
              const last = completedPlans[completedPlans.length - 1];
              missionEnd = last.startTime + (last.totalTime_days * 86400 * 1000);
          }
          
          const totalDuration = missionEnd - missionStart;
          
          if (totalDuration > 0) {
              const allPlans = [...completedPlans];
              if (plan) allPlans.push(plan);
              
              for(let i=0; i<allPlans.length; i++) {
                  const p = allPlans[i];
                  const end = p.startTime + p.totalTime_days * 86400 * 1000;
                  const pct = ((end - missionStart) / totalDuration) * 100;
                  ticks.push(pct);
                  
                  const startPct = ((p.startTime - missionStart) / totalDuration) * 100;
                  const centerPct = (startPct + pct) / 2;
                  
                  // Only show label if segment is wide enough (>10%)
                  if (pct - startPct > 10) {
                      labels.push({ pct: centerPct, text: `Leg ${i+1}` });
                  }
              }
          }
      }
      legTicks = ticks;
      legLabels = labels;
  }

  function updatePreview() {
      // Calculate Total Mission Duration
      if (!plan && completedPlans.length === 0) {
          dispatch('previewUpdate', { offset: 0, position: null });
          previewStatusString = "";
          currentHazards = [];
          return;
      }

      const missionStart = completedPlans.length > 0 ? completedPlans[0].startTime : currentTime;
      
      let missionEnd = missionStart;
      if (plan) {
          missionEnd = plan.startTime + (plan.totalTime_days * 86400 * 1000);
      } else if (completedPlans.length > 0) {
          const last = completedPlans[completedPlans.length - 1];
          missionEnd = last.startTime + (last.totalTime_days * 86400 * 1000);
      }
      
      const totalDuration = missionEnd - missionStart;
      if (totalDuration <= 0) {
           dispatch('previewUpdate', { offset: 0, position: null });
           previewStatusString = "";
           return;
      }

      const currentOffsetMs = totalDuration * (journeyProgress / 100);
      const absTime = missionStart + currentOffsetMs;
      const tPlusDays = (absTime - missionStart) / (86400 * 1000);
      
      // Update Hazards from Telemetry
      if (telemetryData && telemetryData.length > 0) {
          const tIndex = Math.min(Math.floor((journeyProgress / 100) * (telemetryData.length - 1)), telemetryData.length - 1);
          const point = telemetryData[tIndex];
          currentHazards = point ? point.hazards : [];
      } else {
          currentHazards = [];
      }

      // Find active segment/leg
      let activeLegObj: TransitPlan | undefined = completedPlans.find(p => {
          const end = p.startTime + p.totalTime_days * 86400 * 1000;
          return absTime >= p.startTime && absTime <= end;
      });
      
      let activeLegIndex = -1;
      if (activeLegObj) {
          activeLegIndex = completedPlans.indexOf(activeLegObj);
      } else if (plan && absTime >= plan.startTime) {
          activeLegObj = plan;
          activeLegIndex = completedPlans.length;
      }
      
      if (activeLegObj) {
          const timeInLeg = absTime - activeLegObj.startTime;
          let activeSegmentType = "Unknown";
          
          let pos: Vector2 | null = null;
          let currentSegStart = 0;
          
          for (const segment of activeLegObj.segments) {
              const segDuration = segment.endTime - segment.startTime;
              const segEnd = currentSegStart + segDuration;
              
              if (timeInLeg >= currentSegStart && timeInLeg <= segEnd) {
                  const segProgress = (timeInLeg - currentSegStart) / segDuration;
                  const idx = Math.min(Math.floor(segProgress * (segment.pathPoints.length - 1)), segment.pathPoints.length - 1);
                  pos = segment.pathPoints[idx];
                  activeSegmentType = segment.type; 
                  break;
              }
              currentSegStart += segDuration;
          }
          if (!pos && activeLegObj.segments.length > 0) {
             const lastSeg = activeLegObj.segments[activeLegObj.segments.length-1];
             pos = lastSeg.pathPoints[lastSeg.pathPoints.length-1];
             activeSegmentType = "Arrival";
          }
          
          const targetNode = system.nodes.find(n => n.id === activeLegObj!.targetId);
          const targetName = targetNode ? targetNode.name : "Unknown";
          
          previewStatusString = `T+ ${tPlusDays.toFixed(1)}d | Leg ${activeLegIndex + 1}: ${activeSegmentType} to ${targetName}`;
          
          dispatch('previewUpdate', { offset: absTime - currentTime, position: pos });
      } else {
          dispatch('previewUpdate', { offset: 0, position: null });
          previewStatusString = `T+ ${tPlusDays.toFixed(1)}d | Waiting...`;
      }
  }
</script>

<div class="planner-panel">
    <h3>Transit Planner</h3>
    <div class="origin-display" style="margin-bottom: 1em; color: #aaa; font-size: 0.9em;">
        <strong>Current Position:</strong> <span style="color: #eee;">{originString}</span>
    </div>
    
    {#if completedPlans.length > 0}
        <div class="completed-legs">
            <h4>Journey So Far</h4>
            {#each completedPlans as leg, i}
                <div class="leg-summary">
                    <strong>Leg {i + 1}:</strong>
                    {system.nodes.find(n => n.id === leg.originId)?.name || 'Unknown'}
                    →
                    {system.nodes.find(n => n.id === leg.targetId)?.name || 'Unknown'}
                    <span class="leg-meta">
                        ({formatDuration(leg.totalTime_days)}, {(leg.totalFuel_kg/1000).toFixed(1)}t fuel)
                    </span>
                    {#if i === completedPlans.length - 1}
                        <button class="remove-leg-btn" on:click={() => dispatch('undoLastLeg')} title="Undo this leg">×</button>
                    {/if}
                </div>
            {/each}
            <div class="total-summary">
                <strong>Total:</strong> 
                {formatDuration(completedPlans.reduce((a,b) => a + b.totalTime_days, 0))} / 
                {(totalUsedFuel/1000).toFixed(1)}t fuel
                {#if currentConstructSpecs}
                    {@const remaining = currentConstructSpecs.fuelMass_tonnes - (totalUsedFuel / 1000)}
                    <span style="color: {remaining < 0 ? '#ff3333' : '#88ccff'}">
                        ({remaining.toFixed(1)}t remaining)
                    </span>
                {/if}
            </div>
            <hr/>
        </div>
    {/if}
    
    <div class="form-group">
        <label>Target</label>
        <select bind:value={targetId} on:change={handleTargetChange}>
            <option value="">Select Target...</option>
            {#each bodies as body}
                <option value={body.id} style="color: {getOptionColor(body)}">{body.name}</option>
            {/each}
        </select>
        
        {#if orbitOptions.length > 0}
            <select bind:value={selectedOrbitId} on:change={handleCalculate} style="margin-top: 5px; font-size: 0.9em; padding: 0.3em;">
                {#each orbitOptions as opt}
                    <option value={opt.id} style="color: {opt.color}">
                        {opt.name} 
                        {#if !opt.id.startsWith('l')}
                            ({(opt.radiusKm - (system.nodes.find(n=>n.id===targetId)?.radiusKm || 0)).toFixed(0)}km)
                        {/if}
                    </option>
                {/each}
            </select>
        {/if}
    </div>

    {#if hiddenPlanCount > 0}
        <div class="warning-box">
            <span>⚠️ {hiddenPlanCount} plan{hiddenPlanCount > 1 ? 's' : ''} hidden: Impractical Delta-V (>100 km/s).</span>
        </div>
    {/if}

    {#if availablePlans.length > 0}
        <div class="plan-selector">
            {#each availablePlans as p, i}
                <div 
                    class="plan-card" 
                    class:selected={i === selectedPlanIndex}
                    on:click={() => selectPlan(i)}
                >
                    <div class="plan-type">{p.name}</div>
                    <div class="plan-time">{formatDuration(p.totalTime_days)}</div>
                    <div class="plan-fuel" style="font-size: 0.9em; color: #aaa;">{(p.totalFuel_kg/1000).toFixed(1)}t</div>
                    <div class="plan-g">{(p.maxG || 0).toFixed(2)} G</div>
                </div>
            {/each}
        </div>
    {/if}

    {#if completedPlans.length === 0}
    <div class="form-group">
        <label>Departure Delay: {departureDelayDays} days</label>
        <input type="range" min="0" max="100" step="1" bind:value={departureDelayDays} on:input={handleCalculate} />
        <div class="range-labels">
            <span>Now</span>
            <span>+100d</span>
        </div>
    </div>
    {/if}

    <div class="controls-section">
        <div class="form-group">
            <div style="display: flex; justify-content: space-between; margin-bottom: 5px;">
                <label>Burn Profile</label>
                <span style="color: #88ccff; font-size: 0.9em;">
                    Acc: {plan ? formatDuration(plan.totalTime_days * plan.accelRatio) : '0h'} | 
                    Coast: {plan ? formatDuration(plan.totalTime_days * (1 - plan.accelRatio - plan.brakeRatio)) : '0h'} |
                    Brake: {plan ? formatDuration(plan.totalTime_days * plan.brakeRatio) : '0h'}
                </span>
            </div>
            <DualRangeSlider 
                bind:leftValue={accelPercent} 
                bind:rightValue={brakeStartPercent} 
                rightLocked={brakeAtArrival}
                on:input={debouncedCalculate}
                disabled={plan?.planType !== 'Speed'}
            />
            <div class="range-labels">
                <span>Accel</span>
                <span>Coast</span>
                <span>Brake</span>
            </div>
        </div>
        
        <div class="form-group checkbox-row">
            <label>
                <input type="checkbox" bind:checked={brakeAtArrival} on:change={handleCalculate} />
                Brake at Arrival (Match Velocity)
            </label>
            <label class:disabled={!canAerobrakeEffective} title={!canAerobrakeEffective ? "Requires atmosphere and heatshield" : "Use atmosphere to reduce braking cost"}>
                <input type="checkbox" bind:checked={useAerobrake} disabled={!canAerobrakeEffective} on:change={handleCalculate} />
                Aerobrake 
                {#if canAerobrakeEffective}
                    <span style="font-size: 0.8em; color: #ff9900;">(Max {currentConstructSpecs.aerobrakeLimit_kms} km/s){plan ? calculateFuelSaved(plan) : ''}</span>
                {/if}
            </label>
        </div>

        <div class="form-group">
            <label>Max Acceleration: {maxG.toFixed(2)} G (Max: {sliderMaxG.toFixed(2)})</label>
            <input type="range" min="0.01" max={sliderMaxG} step="0.01" bind:value={maxG} on:input={debouncedCalculate} />
        </div>
    </div>

    {#if error}
        <div class="error">{error}</div>
    {/if}

    {#if plan || completedPlans.length > 0}
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
                    {(plan.totalFuel_kg / 1000).toFixed(1)}t
                    {#if originId}
                        {@const construct = system.nodes.find(n => n.id === originId)}
                        {#if construct && construct.fuel_tanks && construct.fuel_tanks.length > 0}
                            {@const mainTank = construct.fuel_tanks.reduce((prev, current) => (prev.capacity_units > current.capacity_units) ? prev : current)}
                            {@const fuelDef = rulePack.fuelDefinitions?.entries.find(f => f.id === mainTank.fuel_type_id)}
                            {@const density = fuelDef ? fuelDef.density_kg_per_m3 : 1000}
                            {@const capacityKg = mainTank.capacity_units * density}
                            {@const currentKg = mainTank.current_units * density}
                            / 
                            <span style="color: {(currentKg - totalUsedFuel - plan.totalFuel_kg) < 0 ? '#ff3333' : '#88ccff'}">
                                {((currentKg - totalUsedFuel - plan.totalFuel_kg) / 1000).toFixed(1)}t left
                            </span>
                        {/if}
                    {/if}
                </strong>
            </div>
            
            {#if plan.tags && plan.tags.length > 0}
                <div class="tags-row">
                    {#each plan.tags as tag}
                        <span class="tag {tag.toLowerCase()}">{tag}</span>
                    {/each}
                </div>
            {/if}
        </div>
        {/if}
        
        <TransitStressGraph telemetry={telemetryData} progress={journeyProgress} />

        <div class="form-group preview-slider" style="position: relative;">
            <div style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap;">
                <label>Mission Timeline Preview</label>
                <div style="display: flex; gap: 8px; align-items: center;">
                    <span style="font-size: 0.85em; color: #88ccff;">{previewStatusString}</span>
                    {#each currentHazards as h}
                        <span class="hazard-pill {h.level.toLowerCase()}">{h.message}</span>
                    {/each}
                </div>
            </div>
            
            <div style="position: relative; width: 100%; margin-top: 15px; margin-bottom: 5px;">
                <input type="range" min="0" max="100" step="0.1" bind:value={journeyProgress} on:input={updatePreview} style="width: 100%; z-index: 2; position: relative; background: transparent;" />
                
                <!-- Tick Marks -->
                {#each legTicks as tick}
                    <div style="position: absolute; left: {tick}%; top: 50%; transform: translate(-50%, -50%); width: 2px; height: 16px; background: #00ffff; z-index: 3; pointer-events: none; border: 1px solid #000;"></div>
                {/each}
                
                <!-- Leg Labels -->
                {#each legLabels as label}
                    <div style="position: absolute; left: {label.pct}%; top: -18px; transform: translateX(-50%); color: #aaa; font-size: 0.7em; pointer-events: none; white-space: nowrap;">{label.text}</div>
                {/each}
            </div>
        </div>
        
        <div class="actions">
            {#if plan}
            <button class="calculate-btn" on:click={() => dispatch('addNextLeg', plan)}>Add Next Leg</button>
            <button class="calculate-btn execute" on:click={() => dispatch('executePlan', plan)} disabled={!canAfford} title={!canAfford ? "Insufficient Fuel" : "Execute Flight Plan"}>Execute Plan</button>
            {/if}
            <button class="close-btn" on:click={() => dispatch('close')}>Close Planner</button>
        </div>
    {/if}

    <div class="debug-section">
       <details>
           <summary>Debug: Calculation Parameters</summary>
           <div class="debug-content">
               {#if lastCalcParams}
               <strong>Input Params:</strong>
               <pre>{JSON.stringify(lastCalcParams, null, 2)}</pre>
               {/if}
               {#if currentConstructSpecs}
                   <strong>Ship Specs:</strong>
                   <pre>{JSON.stringify({
                       mass: currentConstructSpecs.totalMass_tonnes,
                       fuel: currentConstructSpecs.fuelMass_tonnes,
                       isp: lastCalcParams?.shipIsp,
                       maxVacuumG: currentConstructSpecs.maxVacuumG
                   }, null, 2)}</pre>
               {/if}
               {#if availablePlans.length > 0}
                   <strong>Available Plans ({availablePlans.length}):</strong>
                   {#each availablePlans as p, i}
                       <div style="margin-top: 5px; padding-left: 5px; border-left: 3px solid {i === selectedPlanIndex ? '#007bff' : '#444'}; opacity: {i === selectedPlanIndex ? 1 : 0.7};">
                           <div style="color: {i === selectedPlanIndex ? '#fff' : '#aaa'}">
                               <strong>#{i} {p.name}</strong> ({p.planType}) 
                               {#if i === selectedPlanIndex}<span style="color: #007bff; font-weight: bold;">[SELECTED]</span>{/if}
                           </div>
                           <pre style="margin-top: 2px;">{JSON.stringify({
                               totalTime_days: p.totalTime_days,
                               accelRatio: p.accelRatio,
                               brakeRatio: p.brakeRatio,
                               totalDeltaV_kms: (p.totalDeltaV_ms/1000).toFixed(3),
                               totalFuel_t: (p.totalFuel_kg/1000).toFixed(1),
                               maxG: p.maxG?.toFixed(2)
                           }, null, 2)}</pre>
                       </div>
                   {/each}
               {/if}
           </div>
       </details>
   </div>
</div>

<style>
    .debug-section {
        margin-top: 1em;
        padding-top: 1em;
        border-top: 1px dotted #444;
        font-size: 0.8em;
        color: #888;
    }
    .debug-content {
        background: #111;
        padding: 0.5em;
        margin-top: 0.5em;
        border-radius: 3px;
        overflow-x: auto;
    }
    .debug-content pre {
        margin: 0;
        white-space: pre-wrap;
        color: #aaa;
    }
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
    
    .calculate-btn.execute {
        background-color: #28a745;
    }
    .calculate-btn.execute:hover {
        background-color: #218838;
    }
    .total-summary {
        margin-top: 0.5em;
        font-weight: bold;
        color: #eee;
        border-top: 1px dashed #444;
        padding-top: 0.5em;
    }
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
    .preview-slider {
        border-top: 1px solid #444;
        padding-top: 1em;
        margin-top: 0.5em;
    }
    .completed-legs {
        background: #1a1a1a;
        padding: 0.5em;
        border-radius: 3px;
        margin-bottom: 1em;
        border-left: 3px solid #007bff;
    }
    .tags-row {
        display: flex;
        gap: 0.5em;
        margin-top: 0.5em;
        flex-wrap: wrap;
    }
    .tag {
        padding: 0.2em 0.5em;
        border-radius: 3px;
        font-size: 0.8em;
        font-weight: bold;
        text-transform: uppercase;
    }
    .tag.sundiver {
        background-color: #dc3545;
        color: white;
    }
    .tag.high-g {
        background-color: #ffc107;
        color: black;
    }
    .completed-legs h4 {
        margin: 0 0 0.5em 0;
        font-size: 0.9em;
        color: #aaa;
        text-transform: uppercase;
    }
    .plan-selector {
        display: flex;
        gap: 10px;
        margin-bottom: 10px;
    }
    .plan-card {
        flex: 1;
        background: #333;
        border: 1px solid #555;
        border-radius: 4px;
        padding: 8px;
        cursor: pointer;
        text-align: center;
        transition: all 0.2s;
    }
    .plan-card:hover {
        background: #444;
    }
    .plan-card.selected {
        background: #004085;
        border-color: #007bff;
        box-shadow: 0 0 5px rgba(0, 123, 255, 0.5);
    }
    .plan-type {
        font-weight: bold;
        text-transform: uppercase;
        font-size: 0.8em;
        color: #fff;
        margin-bottom: 2px;
    }
    .plan-time {
        font-size: 1.1em;
        color: #88ccff;
    }
    .plan-g {
        font-size: 0.8em;
        color: #aaa;
    }
    .controls-section {
        transition: opacity 0.3s;
    }
    .controls-section.disabled {
        opacity: 0.5;
        pointer-events: none;
        filter: grayscale(0.5);
    }
    .leg-summary {
        font-size: 0.9em;
        margin-bottom: 0.25em;
    }
    .leg-meta {
        color: #888;
        margin-left: 0.5em;
    }
    hr {
        border: 0;
        border-top: 1px solid #444;
        margin: 0.5em 0;
    }
    .warning-box {
        background-color: #332b00;
        border: 1px solid #665500;
        color: #ffcc00;
        padding: 0.5em;
        border-radius: 4px;
        font-size: 0.9em;
        margin-bottom: 0.5em;
        text-align: center;
    }
    .remove-leg-btn {
        background: transparent;
        border: none;
        color: #ff6666;
        cursor: pointer;
        font-weight: bold;
        font-size: 1.2em;
        margin-left: auto;
        padding: 0 5px;
    }
    .remove-leg-btn:hover {
        color: #ff3333;
    }
    .leg-summary {
        display: flex; /* Flex to push button to right */
        align-items: center;
    }
    .hazard-pill {
        font-size: 0.75em;
        padding: 2px 6px;
        border-radius: 4px;
        color: #fff;
        font-weight: bold;
    }
    .hazard-pill.info { background-color: #2563eb; }
    .hazard-pill.warning { background-color: #d97706; color: black; }
    .hazard-pill.danger { background-color: #ea580c; }
    .hazard-pill.critical { background-color: #dc2626; }
</style>
