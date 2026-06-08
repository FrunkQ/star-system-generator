<script lang="ts">
  // §4c — the location-aware "add by type" picker. Shows only the types VIABLE at the orbit the GM
  // clicked (their T_eq band contains this spot), so the Goldilocks zone offers life/ocean worlds
  // and a hot orbit offers lava. Pick one → a body with matching randomised params is dropped in.
  import { createEventDispatcher } from 'svelte';
  import type { Fingerprint, RulePack } from '$lib/types';
  import { viableTypesAt } from '$lib/generation/generateBodyOfType';

  export let rulePack: RulePack;
  export let teqK: number;
  export let role: 'planet' | 'moon';

  const dispatch = createEventDispatcher();
  const close = () => dispatch('close');

  $: fingerprints = (rulePack.classifier?.fingerprints ?? []) as Fingerprint[];
  $: images = (rulePack.classifier as any)?.planetImages ?? {};
  $: viable = viableTypesAt(teqK, role, fingerprints)
    .slice()
    .sort((a, b) => a.class.localeCompare(b.class));

  const pretty = (cls: string) => cls.replace('planet/', '').replace(/-/g, ' ');
  const tempC = Math.round(teqK - 273.15);
</script>

<div class="overlay" on:click|self={close} role="presentation">
  <div class="modal" role="dialog" aria-label="Add body by type">
    <header>
      <div>
        <h2>Add {role === 'moon' ? 'moon' : 'planet'} — pick a type</h2>
        <p class="sub">Viable at this orbit (~{tempC} °C / {Math.round(teqK)} K). {viable.length} types.</p>
      </div>
      <button class="close" on:click={close} aria-label="Close">×</button>
    </header>
    <div class="grid">
      {#each viable as fp}
        <button class="card" on:click={() => dispatch('select', { fp })} title={fp.note || ''}>
          {#if images[fp.class]}
            <img src={images[fp.class]} alt={pretty(fp.class)} loading="lazy" />
          {:else}
            <div class="noimg">{pretty(fp.class).slice(0, 2)}</div>
          {/if}
          <span class="name">{pretty(fp.class)}</span>
        </button>
      {/each}
      {#if viable.length === 0}
        <p class="empty">No catalogued types are viable at this temperature.</p>
      {/if}
    </div>
  </div>
</div>

<style>
  .overlay { position: fixed; inset: 0; background: rgba(0,0,0,0.6); display: flex; align-items: center; justify-content: center; z-index: 1000; padding: 4vh 2vw; }
  .modal { background: var(--bg-app, #0b0d12); border: 1px solid var(--border, #2a2d36); border-radius: 10px; width: min(760px, 96vw); max-height: 88vh; display: flex; flex-direction: column; color: var(--text, #e8e8e8); box-shadow: 0 12px 48px rgba(0,0,0,0.5); }
  header { display: flex; align-items: flex-start; justify-content: space-between; padding: 14px 18px; border-bottom: 1px solid var(--border, #2a2d36); }
  h2 { margin: 0; font-size: 1.05rem; color: var(--accent, #ff5a1f); }
  .sub { margin: 3px 0 0; font-size: 0.82rem; color: var(--text-muted, #cfcfcf); }
  .close { background: none; border: none; color: var(--text-muted, #cfcfcf); font-size: 1.6rem; line-height: 1; cursor: pointer; }
  .close:hover { color: var(--text, #fff); }
  .grid { overflow-y: auto; padding: 14px 16px; display: grid; grid-template-columns: repeat(auto-fill, minmax(110px, 1fr)); gap: 10px; }
  .card { display: flex; flex-direction: column; align-items: center; gap: 6px; padding: 8px; background: var(--bg-panel, #14161c); border: 1px solid var(--border, #2a2d36); border-radius: 8px; cursor: pointer; transition: border-color 0.15s, transform 0.1s; }
  .card:hover { border-color: var(--accent, #ff5a1f); transform: translateY(-2px); }
  .card img { width: 80px; height: 80px; object-fit: cover; border-radius: 50%; }
  .noimg { width: 80px; height: 80px; border-radius: 50%; background: var(--bg-control, #232733); display: flex; align-items: center; justify-content: center; text-transform: uppercase; color: var(--text-faint, #8a8a8a); font-weight: 700; }
  .name { font-size: 0.78rem; text-transform: capitalize; text-align: center; color: var(--text, #e8e8e8); line-height: 1.2; }
  .empty { grid-column: 1 / -1; color: var(--text-faint, #8a8a8a); text-align: center; padding: 24px; }
</style>
