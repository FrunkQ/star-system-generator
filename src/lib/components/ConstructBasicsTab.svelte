<script lang="ts">
  import { createEventDispatcher } from 'svelte';
  import type { CelestialBody } from '$lib/types';
  import { THERMAL_LIMITS, DEFAULT_AEROBRAKE_LIMIT_KM_S } from '$lib/constants';
  import UnitInput from './UnitInput.svelte';
  import CustomImageBlock from './CustomImageBlock.svelte';

  export let construct: CelestialBody;
  // Optional: lets the model dialog preview the ship's real exhaust colour while placing drives.
  export let rulePack: any = null;

  const dispatch = createEventDispatcher();

  // G3 — optional 3D model, sibling of the image. The binary lives in the hash-addressed model
  // store; the node carries only the ModelRef, so the broadcast snapshot stays light.
  import ConstructModelModal from './ConstructModelModal.svelte';
  let modelModalOpen = false;
  // A76: the model dialog now also carries the ship's colour, because a material-less hull is
  // painted with it and the dialog is where you can actually SEE the result. Same field as the
  // Colour control below — one colour, two places to set it, no second source of truth.
  function onModelSave(e: CustomEvent) {
    construct.model = e.detail.ref;
    if (e.detail.iconHex) construct.icon_color = e.detail.iconHex;
    construct = construct;
    modelModalOpen = false;
    dispatch('update');
  }
  function removeModel() {
    // The store entry stays - it is content-addressed and another construct may share the hull.
    construct.model = undefined;
    construct = construct;
    dispatch('update');
  }

  // F2 — optional custom image for a construct (default is the icon glyph). The control is
  // CustomImageBlock (G20), shared with the planet and star tabs; this handler is only the
  // reassignment that tells legacy reactivity the node changed.
  function handleImageChange() {
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
    <!-- ONE appearance block: how this ship looks on the map (2D marker), in 3D, and what
         colours dress it. These used to be three separate stacked groups that each repeated the
         same idea; the ship's COLOUR now sits at the top because everything below inherits it. -->
    <fieldset class="appearance">
      <legend>Appearance</legend>

      <div class="app-grid">
        <span class="app-label">Colour</span>
        <div class="app-ctl">
          <input type="color" id="icon-color" bind:value={construct.icon_color} on:input={handleUpdate} />
          <span class="descriptor">marker, hull tint and plume dressing all follow this &mdash; also settable in the 3D model dialog, where you can see the hull</span>
        </div>

        <span class="app-label">Marker</span>
        <div class="app-ctl">
          <select id="icon-type" bind:value={construct.icon_type} on:change={handleUpdate}>
            <option value="square">Square</option>
            <option value="triangle">Triangle</option>
            <option value="circle">Circle</option>
            <option value="cross">Cross</option>
            <option value="diamond">Diamond</option>
          </select>
          <span class="descriptor">2D map, and the fallback everywhere</span>
        </div>

        <!-- The picture cell is three rows tall once a photo is set, so its label rides to the top
             rather than centring beside the provenance inputs. -->
        <span class="app-label top">Picture</span>
        <div class="app-ctl">
          <CustomImageBlock
            target={construct}
            onUpdate={handleImageChange}
            addLabel="Add…"
            replaceLabel="Replace…"
            removeLabel="Remove"
            alt="Custom construct artwork" />
        </div>

        <span class="app-label">3D model</span>
        <div class="app-ctl">
          <button type="button" class="img-btn" on:click={() => (modelModalOpen = true)}>
            {construct.model ? 'Edit model…' : 'Add 3D model…'}
          </button>
          {#if construct.model}
            <button type="button" class="img-btn remove" on:click={removeModel}>Remove</button>
          {/if}
          {#if construct.model}
            <span class="descriptor">
              {construct.model.name || 'Model'} &middot;
              {(construct.model.triangles ?? 0).toLocaleString()} tris &middot;
              {Math.round((construct.model.bytes ?? 0) / 1024)} KB
            </span>
          {:else}
            <span class="descriptor">GLB, STL or OBJ &mdash; or a real NASA craft</span>
          {/if}
        </div>

        {#if construct.model}
          <span class="app-label">Shading</span>
          <div class="app-ctl">
            <select class="model-finish" bind:value={construct.model.finish} on:change={handleUpdate}
                    title="How the hull is shaded when the map render style is Filled">
              <option value={undefined}>Flat + panel lines</option>
              <option value="plated">Panelled hull</option>
              <option value="patina">Weathered</option>
              <option value="cel">Cel shaded</option>
              <option value="matcap">Brushed metal</option>
              <option value="iridescent">Iridescent</option>
              <option value="blueprint">Blueprint</option>
            </select>
            <span class="descriptor">wireframe map styles override this</span>
          </div>

          <span class="app-label">Drives</span>
          <div class="app-ctl">
            <span class="descriptor">
              {#if construct.model.nozzles?.length}
                {construct.model.nozzles.length} placed
                {#if (construct.model.nozzleScale ?? 1) !== 1}&middot; {(construct.model.nozzleScale ?? 1).toFixed(2)}&times; size{/if}
              {:else}
                one at the stern (default)
              {/if}
              &mdash; set them in <em>Edit model &rsaquo; Engines</em>
            </span>
          </div>

          {#if construct.model.credit || construct.model.license}
            <span class="app-label">Credit</span>
            <div class="app-ctl">
              <span class="descriptor">
                {[construct.model.credit, construct.model.license].filter(Boolean).join(' · ')}
                {#if construct.model.license === 'CC-BY' && !construct.model.credit}
                  &mdash; CC-BY needs a credit
                {/if}
              </span>
            </div>
          {/if}
        {/if}
      </div>
    </fieldset>

    {#if modelModalOpen}
      <ConstructModelModal {construct} {rulePack} on:save={onModelSave} on:close={() => (modelModalOpen = false)} />
    {/if}

    <div class="row">
      <div class="form-group">
        <label for="dry-mass">Dry Mass (tonnes):</label>
        <input type="number" id="dry-mass" value={massTonnes} on:change={updateMass} />
      </div>
    </div>

    <div class="form-group dimensions-group">
        <span class="dim-label">Dimensions (L x W x H) m:</span>
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
                <label for="aerobrake-limit" class:disabled={!_canAerobrake}>Max Entry Speed:</label>
                <UnitInput quantity="speed" bodyType="construct" id="aerobrake-limit" disabled={!_canAerobrake}
                    value={_aerobrakeLimitKms}
                    on:commit={(e) => { _aerobrakeLimitKms = e.detail; handleUpdate(); }} />
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

  .img-btn {
    width: auto; padding: 6px 10px; font-size: 0.9em; cursor: pointer;
    background: var(--bg-control); color: var(--text);
    border: 1px solid var(--border); border-radius: 4px;
  }
  .img-btn:hover { border-color: var(--accent, var(--text-muted)); }
  .img-btn.remove { color: var(--danger, #e06c6c); }
  .appearance { border: 1px solid var(--border-color, #333a46); border-radius: 6px; padding: 6px 10px 10px; margin: 0 0 10px; }
  .appearance legend { font-size: 0.85em; color: var(--text-muted, #9aa4b4); padding: 0 4px; }
  /* Label column + control column: every row reads the same way, and the whole block is about
     half the height the three separate groups took. */
  .app-grid { display: grid; grid-template-columns: auto 1fr; gap: 6px 10px; align-items: center; }
  .dim-label { display: block; font-size: 0.9em; margin-bottom: 3px; }
  .app-label { font-size: 0.85em; color: var(--text-muted, #9aa4b4); white-space: nowrap; }
  .app-label.top { align-self: start; padding-top: 8px; }
  .app-ctl { display: flex; align-items: center; gap: 6px; flex-wrap: wrap; min-width: 0; }
  .app-ctl .descriptor { font-size: 0.8em; }
  .model-finish { font-size: 0.85em; padding: 3px 6px; }

  .checkbox-group { display: flex; flex-direction: column; gap: 10px; }
  .checkbox-group label { display: flex; align-items: center; gap: 10px; color: var(--text); }
  .descriptor { font-size: 0.9em; color: var(--text-muted); }
  
  input[type="checkbox"] {
      width: auto;
  }
</style>
