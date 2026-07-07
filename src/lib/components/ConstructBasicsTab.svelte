<script lang="ts">
  import { createEventDispatcher } from 'svelte';
  import type { CelestialBody } from '$lib/types';
  import { THERMAL_LIMITS, DEFAULT_AEROBRAKE_LIMIT_KM_S } from '$lib/constants';
  import { fmt } from '$lib/stores';
  import { fileToDownscaledDataUrl } from '$lib/util/imageUpload';

  export let construct: CelestialBody;

  const dispatch = createEventDispatcher();

  // F2 — optional custom image for a construct (default is the icon glyph).
  let imgInput: HTMLInputElement;
  async function onImageUpload(e: Event) {
    const input = e.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;
    try {
      const url = await fileToDownscaledDataUrl(file, 512);
      construct.image = { url, custom: true };
      construct = construct;
      dispatch('update');
    } catch { alert('Could not read that image file.'); }
    finally { input.value = ''; }
  }
  function removeCustomImage() {
    construct.image = undefined;
    construct = construct;
    dispatch('update');
  }

  // Initialize nested physical_parameters if it doesn't exist
  if (!construct.physical_parameters) {
    construct.physical_parameters = {};
  }
  if (construct.physical_parameters.massKg === undefined) {
    construct.physical_parameters.massKg = 0;
  }
  if (!Array.isArray(construct.physical_parameters.dimensionsM)) {
    construct.physical_parameters.dimensionsM = [0, 0, 0];
  }
  
  // Initialize icon color if missing
  if (!construct.icon_color) {
    construct.icon_color = '#f0f0f0';
  }

  // Aerobraking UI states
  let _canAerobrake: boolean = construct.physical_parameters.can_aerobrake ?? false;
  let _thermalProtectionType: string = construct.physical_parameters.thermal_protection_type || 'none';
  let _aerobrakeLimitKms: number = construct.physical_parameters.aerobrake_limit_kms ?? (THERMAL_LIMITS[_thermalProtectionType] || DEFAULT_AEROBRAKE_LIMIT_KM_S);

  // UI variable for mass in tonnes
  let massTonnes: number = (construct.physical_parameters.massKg || 0) / 1000;
  let oldKg = construct.physical_parameters.massKg || 0;

  // Sync UI (tonnes) from data (kg) ONLY when data changes externally
  $: if (construct.physical_parameters) {
    const kg = construct.physical_parameters.massKg || 0;
    // Only update UI if the underlying data actually changed from what we last saw
    // This prevents the UI variable update (from typing) triggering a revert
    if (kg !== oldKg) {
        massTonnes = kg / 1000;
        oldKg = kg;
    }
  }

  // Update data (kg) when UI (tonnes) changes
  function updateMass(e: Event) {
    const input = e.target as HTMLInputElement;
    const val = parseFloat(input.value);
    if (!isNaN(val) && construct.physical_parameters) {
        massTonnes = val; // Update local state
        const newKg = val * 1000;
        construct.physical_parameters.massKg = newKg;
        oldKg = newKg; // Update tracker so we don't sync back
        handleUpdate();
    }
  }

  // Reactive statements for aerobraking
  // We use a guard to prevent infinite loops: only write if actually changed
  $: if (construct.physical_parameters) {
      let changed = false;
      
      // LOGIC: If user unchecks "Can Aerobrake", force type to 'none'.
      // If user checks "Can Aerobrake" and it was 'none', default to 'ceramic'.
      if (_canAerobrake && _thermalProtectionType === 'none') {
          _thermalProtectionType = 'ceramic';
          _aerobrakeLimitKms = THERMAL_LIMITS['ceramic'];
      } else if (!_canAerobrake && _thermalProtectionType !== 'none') {
          _thermalProtectionType = 'none';
          _aerobrakeLimitKms = THERMAL_LIMITS['none'];
      }

      if (construct.physical_parameters.can_aerobrake !== _canAerobrake) {
          construct.physical_parameters.can_aerobrake = _canAerobrake;
          changed = true;
      }
      
      if (construct.physical_parameters.thermal_protection_type !== _thermalProtectionType) {
          construct.physical_parameters.thermal_protection_type = _thermalProtectionType;
          changed = true;
      }

      if (construct.physical_parameters.aerobrake_limit_kms !== _aerobrakeLimitKms) {
          construct.physical_parameters.aerobrake_limit_kms = _aerobrakeLimitKms;
          changed = true;
      }
      
      if (changed) handleUpdate();
  }

  // Helper to apply preset values when dropdown changes
  function applyThermalPreset() {
      if (_thermalProtectionType && THERMAL_LIMITS[_thermalProtectionType]) {
          _aerobrakeLimitKms = THERMAL_LIMITS[_thermalProtectionType];
          handleUpdate();
      }
  }

  function handleUpdate() {
    dispatch('update');
  }
</script>

<div class="tab-panel">
    <div class="row">
      <div class="form-group" style="flex: 1;">
        <label for="icon-type">Icon Type:</label>
        <select id="icon-type" bind:value={construct.icon_type} on:change={handleUpdate}>
          <option value="square">Square</option>
          <option value="triangle">Triangle</option>
          <option value="circle">Circle</option>
          <option value="cross">Cross</option>
          <option value="diamond">Diamond</option>
        </select>
      </div>
      <div class="form-group" style="flex: 1;">
        <label for="icon-color">Colour:</label>
        <input type="color" id="icon-color" bind:value={construct.icon_color} on:input={handleUpdate} />
      </div>
    </div>

    <div class="form-group">
      <label>Image <span class="descriptor">(optional — defaults to the icon)</span></label>
      <div class="custom-image">
        {#if construct.image?.custom}
          <img class="custom-thumb" src={construct.image.url} alt="Custom construct artwork" />
        {/if}
        <button type="button" class="img-btn" on:click={() => imgInput?.click()}>
          {construct.image?.custom ? 'Replace image…' : 'Add image…'}
        </button>
        {#if construct.image?.custom}
          <button type="button" class="img-btn remove" on:click={removeCustomImage}>Remove</button>
        {/if}
        <input type="file" accept="image/*" bind:this={imgInput} on:change={onImageUpload} hidden />
      </div>
    </div>

    <div class="row">
      <div class="form-group">
        <label for="dry-mass">Dry Mass (tonnes):</label>
        <input type="number" id="dry-mass" value={massTonnes} on:change={updateMass} />
      </div>
    </div>

    <div class="form-group dimensions-group">
        <label>Dimensions (L x W x H) m:</label>
        <div class="dimensions-inputs">
          <input type="number" placeholder="L" bind:value={construct.physical_parameters.dimensionsM[0]} on:input={handleUpdate} />
          <input type="number" placeholder="W" bind:value={construct.physical_parameters.dimensionsM[1]} on:input={handleUpdate} />
          <input type="number" placeholder="H" bind:value={construct.physical_parameters.dimensionsM[2]} on:input={handleUpdate} />
        </div>
    </div>

    <hr class="separator" />

    <div class="checkbox-group">
        <label>
          <input type="checkbox" bind:checked={_canAerobrake} on:change={handleUpdate} />
          Can Aerobrake <span class="descriptor">(has heat shielding & control surfaces)</span>
        </label>
        
        <div class="row">
            <div class="form-group" style="flex: 1;">
                <label for="thermal-type" class:disabled={!_canAerobrake}>Thermal Protection:</label>
                <select id="thermal-type" bind:value={_thermalProtectionType} disabled={!_canAerobrake} on:change={applyThermalPreset}>
                    {#each Object.keys(THERMAL_LIMITS) as type}
                        <option value={type}>{type.charAt(0).toUpperCase() + type.slice(1)}</option>
                    {/each}
                </select>
            </div>
            <div class="form-group" style="flex: 1;">
                <label for="aerobrake-limit" class:disabled={!_canAerobrake}>Max Entry Speed ({$fmt.speedUnit}):</label>
                <input type="number" id="aerobrake-limit" value={$fmt.toKmS(_aerobrakeLimitKms)} disabled={!_canAerobrake} on:input={(e) => { _aerobrakeLimitKms = $fmt.fromKmS(parseFloat(e.currentTarget.value) || 0); handleUpdate(); }} />
            </div>
        </div>

        <label>
          <input type="checkbox" bind:checked={construct.physical_parameters.has_landing_gear} on:change={handleUpdate} />
          Has Landing Gear
        </label>
    </div>
</div>

<style>
  .tab-panel { 
    padding: 10px; 
    display: flex; 
    flex-direction: column; 
    gap: 15px; 
    width: 100%; 
    box-sizing: border-box; 
    overflow-x: hidden; 
  }
  .row { display: flex; gap: 15px; }
  .form-group { display: flex; flex-direction: column; flex: 1; }
  label { margin-bottom: 5px; color: var(--text-muted); font-size: 0.9em; }
  label.disabled { color: var(--text-faint); }
  input, select { padding: 8px; border-radius: 4px; border: 1px solid var(--border); background-color: var(--bg-control); color: var(--text); font-size: 1em; width: 100%; box-sizing: border-box; }
  input:disabled, select:disabled { background-color: var(--bg-panel); color: var(--text-faint); border-color: var(--border); }
  input[type="color"] { height: 38px; padding: 2px; }
  .separator { height: 1px; background-color: var(--border); width: 100%; margin: 0.5em 0; border: none; }
  
  .dimensions-group .dimensions-inputs {
    display: flex;
    gap: 5px;
  }
  .dimensions-group .dimensions-inputs input {
    text-align: center;
  }

  .custom-image { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
  .custom-thumb {
    width: 48px; height: 48px; object-fit: cover; border-radius: 4px;
    border: 1px solid var(--border); background: var(--bg-control);
  }
  .img-btn {
    width: auto; padding: 6px 10px; font-size: 0.9em; cursor: pointer;
    background: var(--bg-control); color: var(--text);
    border: 1px solid var(--border); border-radius: 4px;
  }
  .img-btn:hover { border-color: var(--accent, var(--text-muted)); }
  .img-btn.remove { color: var(--danger, #e06c6c); }

  .checkbox-group { display: flex; flex-direction: column; gap: 10px; }
  .checkbox-group label { display: flex; align-items: center; gap: 10px; color: var(--text); }
  .descriptor { font-size: 0.9em; color: var(--text-muted); }
  
  input[type="checkbox"] {
      width: auto;
  }
</style>
