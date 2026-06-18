<script lang="ts">
  // Disengage-autopilot confirmation. Four choices on the usual risk scale (green→orange→red, neutral
  // cancel), coloured as accents on a dark dialog — never black-on-red. Emits 'choose' with the mode.
  import { createEventDispatcher } from 'svelte';
  export let shipName = 'this ship';
  export let inTransit = false; // only show drift/stop if it's actually under way
  const dispatch = createEventDispatcher();
  const choose = (mode: 'graceful' | 'drift' | 'stop') => dispatch('choose', mode);
  const cancel = () => dispatch('close');
</script>

<div class="overlay" on:click|self={cancel} role="presentation">
  <div class="dialog" role="dialog" aria-label="Disengage autopilot">
    <h3>Disengage autopilot</h3>
    <p class="sub">{shipName} — how should it stop?</p>

    <button class="opt green" on:click={() => choose('graceful')}>
      <strong>End after this leg</strong>
      <small>finish the current hop and dock, then hand control back — tidy</small>
    </button>

    {#if inTransit}
      <button class="opt orange" on:click={() => choose('drift')}>
        <strong>Abandon — drift</strong>
        <small>cut now, keep its momentum and coast under gravity</small>
      </button>
      <button class="opt red" on:click={() => choose('stop')}>
        <strong>Abandon — stop</strong>
        <small>cut now and kill velocity — dead in the water</small>
      </button>
    {/if}

    <button class="opt neutral" on:click={cancel}>
      <strong>Cancel</strong>
      <small>keep flying — change nothing</small>
    </button>
  </div>
</div>

<style>
  .overlay { position: fixed; inset: 0; background: rgba(0,0,0,0.6); display: flex; align-items: center; justify-content: center; z-index: 1500; padding: 5vh 4vw; }
  .dialog { background: #0b0d12; border: 1px solid #2a2d36; border-radius: 12px; width: min(420px, 96vw); padding: 18px; display: flex; flex-direction: column; gap: 9px; box-shadow: 0 14px 50px rgba(0,0,0,0.55); color: var(--text, #e8e8e8); }
  h3 { margin: 0; font-size: 1.05rem; }
  .sub { margin: 0 0 4px; font-size: 0.84rem; color: var(--text-muted, #cfcfcf); }
  .opt { display: flex; flex-direction: column; gap: 2px; width: 100%; text-align: left; padding: 10px 12px; border-radius: 8px; background: #14161c; border: 1px solid #2a2d36; border-left-width: 4px; color: var(--text, #e8e8e8); cursor: pointer; transition: background 0.12s; }
  .opt:hover { background: #1c1f27; }
  .opt strong { font-size: 0.95rem; }
  .opt small { font-size: 0.77rem; color: var(--text-faint, #9a9a9a); }
  .opt.green { border-left-color: #4a9e5c; }
  .opt.green strong { color: #7fd1a8; }
  .opt.orange { border-left-color: #d8922f; }
  .opt.orange strong { color: #e0a050; }
  .opt.red { border-left-color: #cc5555; }
  .opt.red strong { color: #e08080; }
  .opt.neutral { border-left-color: #555a66; }
  .opt.neutral strong { color: var(--text-muted, #cfcfcf); }
</style>
