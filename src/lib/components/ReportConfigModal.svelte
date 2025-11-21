<script lang="ts">
  import { createEventDispatcher } from 'svelte';

  const dispatch = createEventDispatcher();

  let selectedMode: 'GM' | 'Player' = 'GM';
  let selectedTheme: 'retro' | 'corporate' | 'standard' = 'retro';
  let includeConstructs = true;

  function generate() {
    dispatch('generate', {
      mode: selectedMode,
      theme: selectedTheme,
      includeConstructs
    });
    dispatch('close');
  }
</script>

<div class="modal-background" on:click={() => dispatch('close')}>
  <div class="modal" on:click|stopPropagation>
    <h2>Generate System Report</h2>
    
    <div class="form-group">
      <label>Report Mode</label>
      <div class="radio-group">
        <label class:selected={selectedMode === 'GM'}>
          <input type="radio" bind:group={selectedMode} value="GM">
          <span class="label-text">GM (Full Intel)</span>
          <span class="desc">Includes hidden objects and GM notes.</span>
        </label>
        <label class:selected={selectedMode === 'Player'}>
          <input type="radio" bind:group={selectedMode} value="Player">
          <span class="label-text">Player (Redacted)</span>
          <span class="desc">Hides spoilers, GM notes, and hidden constructs.</span>
        </label>
      </div>
    </div>

    <div class="form-group">
      <label>Detail Level</label>
      <label class="checkbox-label">
        <input type="checkbox" bind:checked={includeConstructs}>
        <span class="label-text" style="color: #fff; margin-left: 8px;">Include Artificial Constructs</span>
      </label>
    </div>

    <div class="form-group">
      <label>Visual Theme</label>
      <select bind:value={selectedTheme}>
        <option value="retro">Retro Line Printer</option>
        <option value="corporate">Corporate / Industrial</option>
        <option value="standard">Standard Clean</option>
      </select>
    </div>

    <div class="buttons">
      <button on:click={() => dispatch('close')}>Cancel</button>
      <button class="primary" on:click={generate}>Generate Report</button>
    </div>
  </div>
</div>

<style>
  .modal-background {
    position: fixed;
    top: 0; left: 0; width: 100%; height: 100%;
    background: rgba(0,0,0,0.7);
    display: flex; justify-content: center; align-items: center;
    z-index: 2000;
  }
  .modal {
    background: #333; color: #fff;
    padding: 2rem; border-radius: 8px;
    width: 400px;
    display: flex; flex-direction: column; gap: 1.5rem;
  }
  h2 { margin: 0; border-bottom: 1px solid #555; padding-bottom: 0.5rem; }
  .form-group { display: flex; flex-direction: column; gap: 0.5rem; }
  .radio-group { display: flex; flex-direction: column; gap: 0.5rem; }
  
  .radio-group label {
    background: #444; padding: 10px; border-radius: 4px;
    cursor: pointer; display: flex; flex-direction: column;
    border: 1px solid transparent;
  }
  .radio-group label.selected {
    border-color: #ff3e00; background: #3a3a3a;
  }
  .radio-group input { display: none; }
  .label-text { font-weight: bold; color: #fff; }
  .desc { font-size: 0.8rem; color: #aaa; }

  select { padding: 8px; background: #444; color: #fff; border: 1px solid #555; border-radius: 4px; }
  
  .buttons { display: flex; justify-content: flex-end; gap: 1rem; margin-top: 1rem; }
  button { padding: 8px 16px; cursor: pointer; border-radius: 4px; border: none; background: #555; color: #fff; }
  button.primary { background: #ff3e00; }
</style>
