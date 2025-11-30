<script lang="ts">
  import { createEventDispatcher } from 'svelte';
  import { get } from 'svelte/store';
  import { systemStore } from '$lib/stores';
  import { calculateSurfaceRadiation, checkAtmosphereRetention } from '$lib/physics/radiation';
  import type { CelestialBody, RulePack, System } from '$lib/types';

  export let body: CelestialBody;
  export let rulePack: RulePack | null = null;

  const dispatch = createEventDispatcher();

  let gases: { name: string, percent: number }[] = [];
  let availableGases: string[] = [];
  let presets: any[] = [];
  let selectedPreset: any = null;
  let suggestedTags: string[] = [];

  // Custom SVG Pressure Slider State
  let svgPressureSlider: SVGSVGElement;
  let isPressureDragging = false;

  // Custom SVG Magnetosphere Slider State
  let svgMagSlider: SVGSVGElement;
  let isMagDragging = false;

  const minP = 0.0001;
  const maxP = 1000;
  
  const minMag = 0.01; // Log scale floor
  const maxMag = 100;

  const pressureMarks = [
    { val: 0.0001, label: '0' },
    { val: 0.001, label: null }, 
    { val: 0.01, label: '0.01' },
    { val: 0.1, label: null },
    { val: 1, label: '1' },
    { val: 10, label: null },
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

  function getLogMidpoint(min: number, max: number): number {
    return Math.exp((Math.log(min) + Math.log(max)) / 2);
  }

  function getPressurePercent(val: number) {
      if (val <= minP) return 0; 
      const safeVal = Math.max(minP, Math.min(maxP, val));
      const minLog = Math.log(minP);
      const maxLog = Math.log(maxP);
      const scale = maxLog - minLog;
      return ((Math.log(safeVal) - minLog) / scale) * 100;
  }

  function getMagPercent(val: number) {
      if (val <= minMag) return 0;
      const safeVal = Math.max(minMag, Math.min(maxMag, val));
      const minLog = Math.log(minMag);
      const maxLog = Math.log(maxMag);
      const scale = maxLog - minLog;
      return ((Math.log(safeVal) - minLog) / scale) * 100;
  }

  function init() {
      if (rulePack) {
          // Load Gases
          if (rulePack.gasMolarMassesKg) {
              availableGases = Object.keys(rulePack.gasMolarMassesKg);
          }
          // Load Presets
          if (rulePack.distributions && rulePack.distributions.atmosphere_composition) {
              presets = rulePack.distributions.atmosphere_composition.entries.map(e => e.value);
          }
      }
      
      // Fallback gases if none found
      if (availableGases.length === 0) {
          availableGases = ['N2', 'O2', 'CO2', 'Ar', 'He', 'H2', 'CH4', 'H2O', 'NH3', 'SO2'];
      }

      if (body.atmosphere) {
          gases = Object.entries(body.atmosphere.composition).map(([name, val]) => ({ name, percent: parseFloat((val * 100).toFixed(2)) }));
          
          // Try to match current atmosphere name to a preset for the dropdown
          if (presets.length > 0) {
              const match = presets.find(p => p.name === body.atmosphere?.name);
              if (match) selectedPreset = match;
          }
      } else {
          gases = [];
      }

      // Init Mag Field if missing
      if (!body.magneticField) {
          body.magneticField = { strengthGauss: 0 };
      }
  }

  $: if (body && rulePack) init();
  
  // Update suggested tags whenever preset or pressure changes
  $: updateDynamicTags(selectedPreset, body.atmosphere?.pressure_bar, $systemStore);

  function updateDynamicTags(preset: any, pressure: number | undefined, system: System | null) {
      const tags = new Set<string>();
      
      // Preset tags (Suggest only)
      if (preset && preset.tags) {
          preset.tags.forEach((t: string) => tags.add(t));
      }
      
      // Pressure tags (Auto-apply)
      const PRESSURE_TAGS = ['no-atmosphere-vacuum', 'thin-atmosphere', 'thick-atmosphere', 'crushing-atmosphere', 'standard-atmosphere'];
      let targetTag: string | null = null;
      
      const p = pressure ?? 0; // Treat undefined as 0 (vacuum)

      if (p < 0.001) targetTag = 'no-atmosphere-vacuum';
      else if (p < 0.1) targetTag = 'thin-atmosphere';
      else if (p > 100) targetTag = 'crushing-atmosphere';
      else if (p > 5) targetTag = 'thick-atmosphere';
      else if (p >= 0.5 && p <= 2.0) targetTag = 'standard-atmosphere';

      if (targetTag && !body.tags?.some(t => t.key === targetTag)) {
          addTag(targetTag);
      }
      
      PRESSURE_TAGS.forEach(tag => {
          if (tag !== targetTag && body.tags?.some(t => t.key === tag)) {
              removeTag(tag);
          }
      });

      // Stripping Risk - Auto-apply
      if (system && rulePack && body.atmosphere) {
          const retained = checkAtmosphereRetention(body, system.nodes, rulePack);
          const stripTag = 'atmospheric-stripping';
          const hasTag = body.tags?.some(t => t.key === stripTag);

          if (!retained && !hasTag) {
              addTag(stripTag);
          } else if (retained && hasTag) {
              removeTag(stripTag);
          }
      }

      suggestedTags = Array.from(tags);
  }

  function addTag(tagKey: string) {
      if (!body.tags) body.tags = [];
      if (!body.tags.some(t => t.key === tagKey)) {
          body.tags = [...body.tags, { key: tagKey }];
          dispatch('update');
      }
  }

  function removeTag(tagKey: string) {
      if (!body.tags) return;
      body.tags = body.tags.filter(t => t.key !== tagKey);
      dispatch('update');
  }

  function handlePressureMouseDown(e: MouseEvent) {
      isPressureDragging = true;
      updatePressureValue(e);
  }

  function handlePressureMouseMove(e: MouseEvent) {
      if (!isPressureDragging) return;
      updatePressureValue(e);
  }

  function handlePressureMouseUp() {
      isPressureDragging = false;
  }

  function updatePressureValue(e: MouseEvent) {
      const rect = svgPressureSlider.getBoundingClientRect();
      let x = e.clientX - rect.left;
      let pct = Math.max(0, Math.min(1, x / rect.width));
      
      const minLog = Math.log(minP);
      const maxLog = Math.log(maxP);
      const scale = maxLog - minLog;
      const newVal = Math.exp(minLog + scale * pct);
      
      if (!body.atmosphere) { 
           body.atmosphere = { name: 'Custom Atmosphere', pressure_bar: 1.0, composition: {} };
      }
      body.atmosphere.pressure_bar = parseFloat(newVal.toFixed(5));
      updateCalculatedStats();
      dispatch('update');
  }

  function handleMagMouseDown(e: MouseEvent) {
      isMagDragging = true;
      updateMagValue(e);
  }

  function handleMagMouseMove(e: MouseEvent) {
      if (!isMagDragging) return;
      updateMagValue(e);
  }

  function handleMagMouseUp() {
      isMagDragging = false;
  }

  function updateMagValue(e: MouseEvent) {
      const rect = svgMagSlider.getBoundingClientRect();
      let x = e.clientX - rect.left;
      let pct = Math.max(0, Math.min(1, x / rect.width));
      
      const minLog = Math.log(minMag);
      const maxLog = Math.log(maxMag);
      const scale = maxLog - minLog;
      const newVal = Math.exp(minLog + scale * pct);
      
      if (!body.magneticField) body.magneticField = { strengthGauss: 0 };
      body.magneticField.strengthGauss = parseFloat(newVal.toFixed(4));
      updateCalculatedStats();
      dispatch('update');
  }

  function updateCalculatedStats() {
      const sys = get(systemStore);
      if (sys && rulePack) {
          const newRad = calculateSurfaceRadiation(body, sys.nodes, rulePack);
          body.surfaceRadiation = newRad;
      }
  }

  function updateAtmosphere() {
      if (!body.atmosphere) {
           body.atmosphere = { name: 'Custom Atmosphere', pressure_bar: 1.0, composition: {} };
      }
      
      const composition: Record<string, number> = {};
      let total = 0;
      for (const gas of gases) {
          if (gas.name) {
              composition[gas.name] = gas.percent / 100;
              total += gas.percent;
          }
      }
      
      body.atmosphere.composition = composition;
      updateCalculatedStats();
      dispatch('update');
  }
  
  function applyPreset() {
      if (!selectedPreset) {
          removeAtmosphere();
          return;
      }
      
      // Calculate a random pressure within range (or mean)
      const pRange = selectedPreset.pressure_range_bar;
      const meanPressure = (pRange[0] + pRange[1]) / 2;
      
      // Calculate composition
      const newGases: { name: string, percent: number }[] = [];
      const newComposition: Record<string, number> = {};
      
      for (const [gas, range] of Object.entries(selectedPreset.composition)) {
          let val = 0;
          if (Array.isArray(range)) {
              val = (range[0] + range[1]) / 2;
          } else {
              val = range as number;
          }
          if (val > 0) {
              newGases.push({ name: gas, percent: val * 100 });
              newComposition[gas] = val;
          }
      }

      body.atmosphere = {
          name: selectedPreset.name,
          pressure_bar: meanPressure,
          composition: newComposition,
          greenhouseTempK: selectedPreset.greenhouse_effect_K
      };
      
      // Update local state
      gases = newGases;
      
      if (selectedPreset.greenhouse_effect_K !== undefined) {
          body.greenhouseTempK = selectedPreset.greenhouse_effect_K;
      }

      // NOTE: We do NOT auto-apply tags anymore. The user must use the tag manager.
      // But we trigger the suggestedTags update via reactivity.

      updateCalculatedStats();
      dispatch('update');
  }

  function createAtmosphere() {
      body.atmosphere = { name: 'Thin Atmosphere', pressure_bar: 0.1, composition: { 'CO2': 0.9, 'N2': 0.1 } };
      init();
      updateCalculatedStats();
      dispatch('update');
  }

  function removeAtmosphere() {
      delete body.atmosphere;
      delete body.greenhouseTempK;
      init();
      updateCalculatedStats();
      dispatch('update');
  }
</script>

<svelte:window 
    on:mouseup={() => { handlePressureMouseUp(); handleMagMouseUp(); }} 
    on:mousemove={(e) => { handlePressureMouseMove(e); handleMagMouseMove(e); }} 
/>

<div class="tab-panel">
    <div class="form-group">
        <label>Atmosphere Type</label>
        <div class="input-row">
            <select bind:value={selectedPreset} on:change={applyPreset}>
                <option value={null}>No Atmosphere</option>
                {#each presets as preset}
                    <option value={preset}>{preset.name}</option>
                {/each}
            </select>
        </div>
    </div>

    <hr />

    <div class="form-group">
        <div class="label-row">
             <label>Magnetosphere (Gauss)</label>
             <input type="number" step="0.01" bind:value={body.magneticField.strengthGauss} on:input={() => { updateCalculatedStats(); dispatch('update'); }} />
        </div>
        <div class="orbital-slider-container" style="height: 100px;">
            <svg 
                bind:this={svgMagSlider}
                class="orbital-slider" 
                on:mousedown={handleMagMouseDown}
                preserveAspectRatio="none"
            >
                <!-- Background Track -->
                <rect x="0" y="20" width="100%" height="10" fill="#333" rx="5" />

                <!-- Zone Indicators -->
                <!-- Terrestrial (Orange) 0-2 -->
                <rect x="0" y="35" width="{getMagPercent(2)}%" height="4" fill="orange" rx="1" />
                <text x="0%" y="50" fill="orange" font-size="10" text-anchor="start">Terrestrial</text>
                
                <!-- Ice Giants (Light Blue) 0.1-1 -->
                <rect x="{getMagPercent(0.1)}%" y="35" width="{getMagPercent(1) - getMagPercent(0.1)}%" height="4" fill="#add8e6" rx="1" />
                <text x="{getMagPercent(0.1)}%" y="50" fill="#add8e6" font-size="10" text-anchor="start">Ice</text>

                <!-- Gas Giants (Red) 4-100 -->
                <rect x="{getMagPercent(4)}%" y="32" width="{getMagPercent(100) - getMagPercent(4)}%" height="4" fill="#cc0000" rx="1" />
                <text x="{getMagPercent(4)}%" y="50" fill="#cc0000" font-size="10" text-anchor="start">Gas</text>

                <!-- Ticks -->
                {#each magMarks as mark}
                    {@const pct = getMagPercent(mark.val)}
                    <line x1="{pct}%" y1="15" x2="{pct}%" y2="35" stroke="#888" stroke-width="1" />
                    {#if mark.label}
                        <text 
                            x="{pct}%" 
                            y="{pct > 50 ? 12 : 65}" 
                            fill="#888" 
                            font-size="9" 
                            text-anchor="middle"
                        >{mark.label}</text>
                    {/if}
                {/each}

                <!-- Thumb -->
                <circle cx="{getMagPercent(body.magneticField.strengthGauss || 0)}%" cy="25" r="6" fill="#fff" stroke="#000" stroke-width="2" style="cursor: pointer;" />
            </svg>
        </div>
    </div>

    {#if body.atmosphere}
        <hr />

        <div class="form-group">
            <div class="label-row">
                <label>Surface Pressure (bar)</label>
                <input type="number" step="0.0001" bind:value={body.atmosphere.pressure_bar} on:input={() => { updateCalculatedStats(); dispatch('update'); }} />
            </div>
            <div class="orbital-slider-container">
                <svg 
                    bind:this={svgPressureSlider}
                    class="orbital-slider" 
                    on:mousedown={handlePressureMouseDown}
                    preserveAspectRatio="none"
                >
                    <!-- Background Track -->
                    <rect x="0" y="20" width="100%" height="10" fill="#333" rx="5" />

                    <!-- Ticks -->
                    {#each pressureMarks as mark}
                        {@const pct = getPressurePercent(mark.val)}
                        <line x1="{pct}%" y1="15" x2="{pct}%" y2="35" stroke="#888" stroke-width="1" />
                        {#if mark.label}
                            <text 
                                x="{pct}%" 
                                y="{pct > 50 ? 12 : 45}" 
                                fill="#888" 
                                font-size="9" 
                                text-anchor="middle"
                            >{mark.label}</text>
                        {/if}
                    {/each}

                    <!-- Thumb -->
                    <circle cx="{getPressurePercent(body.atmosphere.pressure_bar || minP)}%" cy="25" r="6" fill="#fff" stroke="#000" stroke-width="2" style="cursor: pointer;" />
                </svg>
            </div>
        </div>
        
        <div class="form-group">
            <label>Name Override</label>
            <input type="text" bind:value={body.atmosphere.name} on:input={() => dispatch('update')} />
        </div>

                <hr />

                <h4>Composition (Read Only)</h4>
        
        <div class="composition-display">
            {#each gases as gas}
                <div class="gas-item">
                    <span class="gas-name">{gas.name}</span>
                    <span class="gas-percent">{gas.percent.toFixed(1)}%</span>
                </div>
            {/each}
        </div>

    {/if}

    <hr />
    <h4>Atmosphere Tags</h4>
    
    <div class="tags-section">
        <div class="tag-group">
            <span class="group-label">Current:</span>
            <div class="tags-list">
                {#if body.tags}
                    {#each body.tags as tag}
                        <button class="tag-chip active" on:click={() => removeTag(tag.key)} title="Click to remove">
                            {tag.key} <span class="x">×</span>
                        </button>
                    {/each}
                {/if}
            </div>
        </div>
        
        <div class="tag-group">
            <span class="group-label">Suggested:</span>
            <div class="tags-list">
                {#each suggestedTags as sTag}
                    {#if !body.tags?.some(t => t.key === sTag)}
                        <button class="tag-chip suggested" on:click={() => addTag(sTag)} title="Click to add">
                            {sTag} <span class="plus">+</span>
                        </button>
                    {/if}
                {/each}
            </div>
        </div>
    </div>

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
  
  input[type="number"] { width: 80px; text-align: right; }
  .orbital-slider-container {
      width: 100%;
      height: 50px;
      user-select: none;
      margin-top: 5px;
  }
  .orbital-slider {
      width: 100%;
      height: 100%;
      overflow: visible;
  }
  text {
      pointer-events: none;
      font-family: sans-serif;
  }

  .composition-display {
      display: flex;
      flex-wrap: wrap;
      gap: 5px;
      background-color: #333;
      padding: 10px;
      border-radius: 4px;
  }
  .gas-item {
      background-color: #444;
      padding: 4px 8px;
      border-radius: 3px;
      font-size: 0.9em;
      display: flex;
      gap: 5px;
  }
  .gas-name { font-weight: bold; color: #fff; }
  .gas-percent { color: #aaa; }

  .actions { display: flex; justify-content: flex-end; margin-top: 10px; }
  .danger { background: #cc0000; color: white; border: none; padding: 8px; border-radius: 4px; cursor: pointer; }
  
  hr { border: 0; border-top: 1px solid #444; margin: 5px 0; width: 100%; }
  h4 { margin: 0; color: #88ccff; font-size: 0.9em; text-transform: uppercase; }

  .tags-section { display: flex; flex-direction: column; gap: 10px; margin-bottom: 10px; }
  .tag-group { display: flex; align-items: flex-start; gap: 10px; }
  .group-label { font-size: 0.8em; color: #888; width: 70px; margin-top: 5px; }
  .tags-list { display: flex; flex-wrap: wrap; gap: 5px; flex: 1; }
  .tag-chip { border: none; border-radius: 4px; padding: 2px 6px; font-size: 0.8em; cursor: pointer; display: flex; align-items: center; gap: 5px; transition: background-color 0.2s; }
  .tag-chip.active { background-color: #3b82f6; color: white; }
  .tag-chip.active:hover { background-color: #2563eb; }
  .tag-chip.suggested { background-color: #333; color: #88ccff; border: 1px dashed #444; }
  .tag-chip.suggested:hover { background-color: #444; }
  .x, .plus { font-weight: bold; }
</style>