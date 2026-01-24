<script lang="ts">
  import { createEventDispatcher } from 'svelte';

  export let showModal: boolean;
  
  const dispatch = createEventDispatcher();

  // Field Data
  let name = '';
  let uwp = '';
  let stars = '';
  let bases = '';
  let remarks = '';
  let zone = '';
  let pbg = '';
  let allegiance = '';
  let ix = '';
  let ex = '';
  let cx = '';
  let nobility = '';
  let w = '';
  let ru = '';

  let error = '';

  // Validation & Defaults
  $: isValid = name.trim().length > 0 && /^[A-HXYZ][0-9A-Z]{6}-[0-9A-Z]$/i.test(uwp.trim());

  function handleSubmit() {
      if (!isValid) {
          error = 'Please provide a valid Name and UWP (e.g. A788956-A).';
          return;
      }

      // Construct Data Object (Mimics TravellerImporter input)
      const data = {
          name: name.trim(),
          uwp: uwp.trim().toUpperCase(),
          stars: stars.trim() || "G2 V", // Default to Sol-like
          bases: bases.trim().toUpperCase(),
          tradeCodes: remarks.split(' ').map(s => s.trim()).filter(s => s.length > 0),
          travelZone: zone.trim().toUpperCase() || 'G', // Green
          pbg: pbg.trim() || '000',
          allegiance: allegiance.trim() || 'Na',
          ix: ix.trim(),
          ex: ex.trim(),
          cx: cx.trim(),
          nobility: nobility.trim(),
          w: String(w).trim() || '0',
          ru: ru.trim(),
          raw: `Manual UWP: ${uwp} ${name}`
      };

      dispatch('generate', data);
      close();
  }

  function close() {
      dispatch('close');
  }
</script>

{#if showModal}
<div class="modal-backdrop" on:click={close}>
  <div class="modal-content" on:click|stopPropagation>
      <h2>Add Traveller System</h2>
      <p class="subtitle">Manually create a system using Traveller UWP codes.</p>
      
      <div class="grid-form">
          <!-- Row 1: Basics -->
          <div class="form-group required">
              <label>Name</label>
              <input type="text" bind:value={name} placeholder="e.g. Regina" autofocus />
          </div>
          
          <div class="form-group required">
              <label>UWP Code <span class="info" title="Universal World Profile (e.g. A788956-A).&#10;Port, Size, Atmo, Hydro, Pop, Gov, Law - Tech.">?</span></label>
              <input type="text" bind:value={uwp} placeholder="A788956-A" class:invalid={uwp && !/^[A-HXYZ][0-9A-Z]{6}-[0-9A-Z]$/i.test(uwp)} />
          </div>

          <!-- Row 2: Physical -->
          <div class="form-group">
              <label>Stars <span class="info" title="Spectral types (e.g. 'G2 V M0 D'). Default: G2 V">?</span></label>
              <input type="text" bind:value={stars} placeholder="G2 V" />
          </div>

          <div class="form-group">
              <label>PBG <span class="info" title="Pop Multiplier, Belts, Gas Giants (e.g. 523). Default: 000">?</span></label>
              <input type="text" bind:value={pbg} placeholder="000" maxlength="3" />
          </div>

          <div class="form-group">
              <label>W (Worlds) <span class="info" title="Total world count. If 0, generated from PBG + 1.">?</span></label>
              <input type="number" bind:value={w} placeholder="Auto" />
          </div>

          <!-- Row 3: Political -->
          <div class="form-group span-2">
              <label>Remarks / Trade Codes <span class="info" title="Space-separated codes (e.g. 'Ni Wa Ht').">?</span></label>
              <input type="text" bind:value={remarks} placeholder="Ni Wa Ht" />
          </div>

          <div class="form-group">
              <label>Allegiance</label>
              <input type="text" bind:value={allegiance} placeholder="Im" />
          </div>

          <div class="form-group">
              <label>Zone <span class="info" title="A (Amber), R (Red), or empty (Green)">?</span></label>
              <input type="text" bind:value={zone} placeholder="-" maxlength="1" />
          </div>

          <div class="form-group">
              <label>Bases <span class="info" title="e.g. NS = Naval & Scout">?</span></label>
              <input type="text" bind:value={bases} placeholder="NS" />
          </div>

          <!-- Row 4: Extended (T5) -->
          <div class="form-group">
              <label>{'{Ix}'} Importance</label>
              <input type="text" bind:value={ix} placeholder="{ -1 }" />
          </div>

          <div class="form-group">
              <label>(Ex) Economic</label>
              <input type="text" bind:value={ex} placeholder="(A74+1)" />
          </div>

          <div class="form-group">
              <label>[Cx] Cultural</label>
              <input type="text" bind:value={cx} placeholder="[6755]" />
          </div>
          
          <div class="form-group">
              <label>Nobility</label>
              <input type="text" bind:value={nobility} placeholder="B" />
          </div>
      </div>

      {#if error}
          <p class="error">{error}</p>
      {/if}

      <div class="actions">
          <button class="secondary" on:click={close}>Cancel</button>
          <button class="primary" on:click={handleSubmit} disabled={!isValid}>Generate System</button>
      </div>
  </div>
</div>
{/if}

<style>
  .modal-backdrop {
      position: fixed;
      top: 0; left: 0; width: 100%; height: 100%;
      background: rgba(0, 0, 0, 0.8);
      display: flex; justify-content: center; align-items: center;
      z-index: 2000;
  }
  .modal-content {
      background: #1e1e1e;
      padding: 25px;
      border-radius: 8px;
      width: 600px;
      max-width: 95vw;
      color: #eee;
      border: 1px solid #444;
      box-shadow: 0 10px 30px rgba(0,0,0,0.5);
  }
  h2 { margin-top: 0; margin-bottom: 0.2em; color: #fff; }
  .subtitle { margin-top: 0; color: #aaa; font-size: 0.9em; margin-bottom: 1.5em; }

  .grid-form {
      display: grid;
      grid-template-columns: 1fr 1fr 1fr;
      gap: 15px;
  }

  .form-group {
      display: flex;
      flex-direction: column;
  }
  
  .form-group.span-2 { grid-column: span 2; }
  .form-group.span-3 { grid-column: span 3; }

  label {
      font-size: 0.8em;
      color: #bbb;
      margin-bottom: 5px;
      font-weight: bold;
  }
  
  .required label::after { content: " *"; color: #ff4444; }

  input {
      background: #2a2a2a;
      border: 1px solid #444;
      padding: 8px;
      color: #fff;
      border-radius: 4px;
      font-family: monospace;
  }
  input:focus { border-color: #007bff; outline: none; }
  input.invalid { border-color: #ff4444; }

  .info {
      display: inline-block;
      width: 14px; height: 14px;
      background: #444;
      color: #fff;
      border-radius: 50%;
      text-align: center;
      line-height: 14px;
      font-size: 10px;
      cursor: help;
      margin-left: 4px;
  }

  .error { color: #ff4444; font-size: 0.9em; margin-top: 15px; }

  .actions {
      display: flex;
      justify-content: flex-end;
      gap: 10px;
      margin-top: 25px;
      padding-top: 15px;
      border-top: 1px solid #333;
  }

  button {
      padding: 8px 20px;
      border-radius: 4px;
      cursor: pointer;
      font-weight: bold;
      border: none;
  }
  
  button.primary { background: #007bff; color: white; }
  button.primary:disabled { background: #444; color: #888; cursor: not-allowed; }
  button.primary:hover:not(:disabled) { background: #0056b3; }
  
  button.secondary { background: transparent; color: #aaa; border: 1px solid #444; }
  button.secondary:hover { background: #333; color: #fff; }
</style>