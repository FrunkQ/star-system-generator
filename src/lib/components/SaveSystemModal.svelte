<script lang="ts">
  // G42 phase 3: this screen must say WHICH WORLD it is saving. The owner's report was that users
  // "may save a system map thinking they are saving everything" - so the scope is stated in plain
  // words, including what is NOT in the file, and the suggested filename is shown so the saved file
  // is recognisable later. The GM/Player and constructs options are unchanged.
  import { createEventDispatcher } from 'svelte';

  /** Which world this save covers. 'system' = the open system only; 'starmap' = the whole campaign. */
  export let scope: 'system' | 'starmap' = 'system';
  /** Name of the thing being saved, used for the suggested filename. */
  export let subjectName = '';
  /** GM/Player and constructs choices. The campaign save has no such options today: it always
   *  writes the full GM file, so offering the radios there would promise a handout it never makes. */
  export let showOptions = true;

  const dispatch = createEventDispatcher();

  let selectedMode: 'GM' | 'Player' = 'GM';
  let includeConstructs = true;

  // Mirrors the download naming in SystemView.handleSaveSystem / +page.handleDownloadStarmap. The
  // extension is decided at save time (a file carrying assets becomes a .sse.zip bundle, DATA-M3),
  // so this shows the stem and says as much rather than promising an extension it cannot know.
  $: suggestedName = `${(subjectName || (scope === 'starmap' ? 'starmap' : 'system')).replace(/\s+/g, '_')}-${scope === 'starmap' ? 'Starmap' : 'System'}${selectedMode === 'Player' ? '-Player' : ''}`;

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
    {#if scope === 'starmap'}
      <h2>Save the whole campaign</h2>
      <p class="scope">
        This file holds <strong>everything</strong> — every system on the map, the routes between
        them, and your campaign settings.
      </p>
    {:else}
      <h2>Save this system only</h2>
      <p class="scope">
        This file holds <strong>{subjectName || 'this system'} only</strong> — this one star system.
        Your other systems, the map they sit on and the routes between them are
        <strong>not</strong> in it. To save all of that, go back to the starmap and use
        File &gt; Save Starmap.
      </p>
    {/if}

    {#if showOptions}
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
    {:else}
      <p class="scope note">This is the full GM file: hidden objects, GM notes and your rules travel with it.</p>
    {/if}

    <p class="filename">Saves as <code>{suggestedName}</code></p>

    <div class="buttons">
      <button on:click={() => dispatch('close')}>Cancel</button>
      <button class="primary" on:click={handleSave}>{scope === 'starmap' ? 'Save campaign' : 'Save system'}</button>
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
  .scope { margin: -0.75rem 0 0; font-size: 0.82rem; line-height: 1.5; color: var(--text-muted); }
  .scope strong { color: var(--text); }
  .filename { margin: -0.75rem 0 0; font-size: 0.78rem; color: var(--text-muted); }
  .filename code { overflow-wrap: anywhere; }
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