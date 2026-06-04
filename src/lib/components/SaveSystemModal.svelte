<script lang="ts">
  import { createEventDispatcher } from 'svelte';

  const dispatch = createEventDispatcher();

  let selectedMode: 'GM' | 'Player' = 'GM';
  let includeConstructs = true;

  function handleSave() {
    dispatch('save', {
      mode: selectedMode,
      includeConstructs
    });
    dispatch('close');
  }
</script>

<div class="modal-background" on:click={() => dispatch('close')}>
  <div class="modal" on:click|stopPropagation>
    <h2>Save System Data</h2>
    
    <div class="form-group">
      <label>Save Version</label>
      <div class="radio-group">
        <label class:selected={selectedMode === 'GM'}>
          <input type="radio" bind:group={selectedMode} value="GM">
          <span class="label-text">GM (Full Backup)</span>
          <span class="desc">Contains all hidden objects, GM notes, and complete data. Best for saving your work.</span>
        </label>
        <label class:selected={selectedMode === 'Player'}>
          <input type="radio" bind:group={selectedMode} value="Player">
          <span class="label-text">Player (Redacted)</span>
          <span class="desc">Removes hidden objects, GM notes, and spoilers. Safe to share with players.</span>
        </label>
      </div>
    </div>

    <div class="form-group">
      <label>Data Options</label>
      <label class="checkbox-label">
        <input type="checkbox" bind:checked={includeConstructs}>
        <span class="label-text" style="color: var(--text); margin-left: 8px;">Include Artificial Constructs</span>
      </label>
    </div>

    <div class="buttons">
      <button on:click={() => dispatch('close')}>Cancel</button>
      <button class="primary" on:click={handleSave}>Download JSON</button>
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
    background: var(--bg-panel); color: var(--text);
    padding: 2rem; border-radius: 8px;
    width: 400px;
    display: flex; flex-direction: column; gap: 1.5rem;
  }
  h2 { margin: 0; border-bottom: 1px solid var(--border); padding-bottom: 0.5rem; }
  .form-group { display: flex; flex-direction: column; gap: 0.5rem; }
  .radio-group { display: flex; flex-direction: column; gap: 0.5rem; }
  
  .radio-group label {
    background: var(--bg-control); padding: 10px; border-radius: 4px;
    cursor: pointer; display: flex; flex-direction: column;
    border: 1px solid transparent;
  }
  .radio-group label.selected {
    border-color: var(--accent); background: var(--bg-control);
  }
  .radio-group input { display: none; }
  .label-text { font-weight: bold; color: var(--text); }
  .checkbox-label { display: flex; align-items: center; cursor: pointer; }
  .desc { font-size: 0.8rem; color: var(--text-muted); }

  .buttons { display: flex; justify-content: flex-end; gap: 1rem; margin-top: 1rem; }
  button { padding: 8px 16px; cursor: pointer; border-radius: 4px; border: none; background: var(--bg-control); color: var(--text); }
  button.primary { background: var(--accent); }
</style>