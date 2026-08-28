<script lang="ts">
  // G42 phase 2: the wrong-loader OFFER. classifySaveFile (DATA-M6) has already named the dropped
  // file as the sister type; this modal says so in plain words and, where the app can act, offers
  // the right load WITH its real consequence stated. Where it cannot act it guides. Declining
  // must always leave the current map untouched - the only side effect lives behind 'confirm'.
  //
  // A starmap dropped on Load System OFFERS open-as-campaign (the wipe warning is the campaign).
  // A system dropped on Load Starmap GUIDES to File > Load System - whether it may instead be
  // ADDED to the campaign as a new system is an owner decision, deliberately not built yet.
  import { createEventDispatcher } from 'svelte';
  import { foreground } from '$lib/ui/foreground';

  /** What the dropped file actually is. */
  export let fileKind: 'starmap' | 'system';
  /** Which loader it was dropped on: 'starmap' = Load Starmap, 'system' = Load System. */
  export let context: 'starmap' | 'system';
  export let fileName = '';

  const dispatch = createEventDispatcher<{ confirm: void; close: void }>();

  // The only cross-case the app can act on today.
  $: offersLoad = fileKind === 'starmap' && context === 'system';
</script>

<div class="scrim" role="presentation" on:click|self={() => dispatch('close')} use:foreground>
  <div class="modal" role="dialog" aria-modal="true" aria-label="This file is a different kind of save">
    {#if fileKind === 'starmap'}
      <h2>That file is a whole campaign</h2>
      <p class="lede">
        <strong class="fname">{fileName}</strong> is a saved <strong>campaign</strong> (a starmap) —
        every system on the map and the routes between them, not a single system.
      </p>
      {#if offersLoad}
        <p class="warn">
          Loading it will <strong>replace your current campaign</strong> — every system in it,
          including the one you are viewing. If the current campaign is not saved, cancel and use
          File &gt; Save Starmap first.
        </p>
      {:else}
        <p>To open it, use File &gt; Load Starmap.</p>
      {/if}
    {:else}
      <h2>That file is a single system</h2>
      <p class="lede">
        <strong class="fname">{fileName}</strong> is a saved <strong>system</strong> — one star
        system, not a whole campaign (starmap).
      </p>
      <p>
        To view it, open any system and use File &gt; Load System. Loading it there replaces the
        system you are viewing; the rest of the campaign is untouched.
      </p>
    {/if}

    <footer>
      <span class="spacer"></span>
      {#if offersLoad}
        <button class="secondary" type="button" on:click={() => dispatch('close')}>Cancel</button>
        <button class="primary" type="button" on:click={() => dispatch('confirm')}>Open as campaign</button>
      {:else}
        <button class="primary" type="button" on:click={() => dispatch('close')}>OK</button>
      {/if}
    </footer>
  </div>
</div>

<style>
  .scrim {
    position: fixed; inset: 0; z-index: 2100; display: flex; align-items: center; justify-content: center;
    background: rgba(0, 0, 0, 0.66); padding: 20px;
  }
  .modal {
    width: min(460px, 100%); max-height: calc(100vh - 40px); overflow-y: auto;
    background: var(--bg-panel); border: 1px solid var(--border); border-radius: 10px;
    padding: 18px 20px 16px; color: var(--text); box-shadow: 0 20px 60px rgba(0, 0, 0, 0.6);
  }
  h2 { margin: 0 0 8px; font-size: 17px; }
  p { margin: 0 0 10px; font-size: 13px; line-height: 1.55; color: var(--text); }
  .lede { font-size: 13.5px; }
  .fname { overflow-wrap: anywhere; }
  .warn {
    padding: 10px 12px; border: 1px solid rgba(255, 122, 69, 0.45); border-radius: 8px;
    background: rgba(255, 122, 69, 0.08);
  }
  footer { display: flex; align-items: center; gap: 10px; margin-top: 14px; }
  .spacer { flex: 1; }
  button { border-radius: 6px; padding: 8px 14px; font-size: 13px; cursor: pointer; border: 1px solid transparent; }
  .secondary { background: var(--bg-control); border-color: var(--border); color: var(--text); }
  .primary { background: var(--accent); color: var(--bg-panel); font-weight: 600; }
</style>
