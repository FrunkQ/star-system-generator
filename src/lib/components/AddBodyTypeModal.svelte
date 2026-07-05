<script lang="ts">
  // §4c — the location-aware "add by type" picker. Shows only the types VIABLE at the orbit the GM
  // clicked (their T_eq band contains this spot), so the Goldilocks zone offers life/ocean worlds
  // and a hot orbit offers lava. Pick one → a body with matching randomised params is dropped in.
  import { createEventDispatcher } from 'svelte';
  import type { Fingerprint, RulePack } from '$lib/types';
  import { viableTypesAt } from '$lib/generation/generateBodyOfType';
  import { rarityOf, rarityTier } from '$lib/generation/typeDraw';
  import { thumbUrl } from '$lib/util/thumbs';
  import { fmt } from '$lib/stores';

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
  const tierOf = (cls: string) => rarityTier(rarityOf(cls, rulePack));
  const LEGEND = [
    { label: 'Common', color: '#b8c0cc' }, { label: 'Uncommon', color: '#4caf50' },
    { label: 'Rare', color: '#3b82f6' }, { label: 'Epic', color: '#a855f7' }, { label: 'Legendary', color: '#f5a623' }
  ];
</script>

<div class="overlay" on:click|self={close} role="presentation">
  <div class="modal" role="dialog" aria-label="Add body by type">
    <header>
      <div>
        <h2>Add {role === 'moon' ? 'moon' : 'planet'} — pick a type</h2>
        <p class="sub">All viable at this orbit (~{$fmt.tempK(teqK)}) — rarity just signals how eccentric. {viable.length} types.</p>
        <div class="legend">
          {#each LEGEND as l}<span class="leg"><span class="dot" style="background:{l.color}"></span>{l.label}</span>{/each}
        </div>
      </div>
      <button class="close" on:click={close} aria-label="Close">×</button>
    </header>
    <div class="grid">
      {#each viable as fp}
        {@const tier = tierOf(fp.class)}
        <button class="card" style="--tier:{tier.color}" on:click={() => dispatch('select', { fp })}
          title="{pretty(fp.class)} — {tier.label}{fp.note ? `: ${fp.note}` : ''}">
          {#if images[fp.class]}
            <img src={thumbUrl(images[fp.class])} alt={pretty(fp.class)} loading="lazy" width="80" height="80" />
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
  .overlay { position: fixed; inset: 0; background: rgba(0,0,0,0.6); display: flex; align-items: center; justify-content: center; z-index: 2000; padding: 4vh 2vw; }
  .modal { background: var(--bg-app, #0b0d12); border: 1px solid var(--border, #2a2d36); border-radius: 10px; width: min(760px, 96vw); max-height: 88vh; display: flex; flex-direction: column; overflow: hidden; color: var(--text, #e8e8e8); box-shadow: 0 12px 48px rgba(0,0,0,0.5); }
  header { display: flex; align-items: flex-start; justify-content: space-between; padding: 14px 18px; border-bottom: 1px solid var(--border, #2a2d36); }
  h2 { margin: 0; font-size: 1.05rem; color: var(--accent, #ff5a1f); }
  .sub { margin: 3px 0 0; font-size: 0.82rem; color: var(--text-muted, #cfcfcf); }
  .legend { display: flex; flex-wrap: wrap; gap: 10px; margin-top: 6px; }
  .leg { display: flex; align-items: center; gap: 4px; font-size: 0.68rem; color: var(--text-faint, #8a8a8a); text-transform: uppercase; letter-spacing: 0.04em; }
  .leg .dot { width: 9px; height: 9px; border-radius: 50%; }
  .close { background: none; border: none; color: var(--text-muted, #cfcfcf); font-size: 1.6rem; line-height: 1; cursor: pointer; }
  .close:hover { color: var(--text, #fff); }
  .grid { overflow-y: auto; -webkit-overflow-scrolling: touch; min-height: 0; padding: 14px 16px; display: grid; grid-template-columns: repeat(auto-fill, minmax(110px, 1fr)); gap: 10px; }
  /* Loot-box rarity: each card is ringed + tinted by its type's tier (common→legendary). */
  .card { position: relative; display: flex; flex-direction: column; align-items: center; gap: 6px; padding: 8px; background: var(--bg-panel, #14161c); border: 1px solid color-mix(in srgb, var(--tier) 55%, var(--border, #2a2d36)); border-radius: 8px; cursor: pointer; transition: box-shadow 0.15s, transform 0.1s, border-color 0.15s; }
  .card:hover { border-color: var(--tier); transform: translateY(-2px); box-shadow: 0 0 12px color-mix(in srgb, var(--tier) 60%, transparent); }
  .card img { width: 80px; height: 80px; object-fit: cover; border-radius: 50%; border: 2px solid var(--tier); box-shadow: 0 0 8px color-mix(in srgb, var(--tier) 45%, transparent); }
  .noimg { width: 80px; height: 80px; border-radius: 50%; background: var(--bg-control, #232733); border: 2px solid var(--tier); display: flex; align-items: center; justify-content: center; text-transform: uppercase; color: var(--text-faint, #8a8a8a); font-weight: 700; }
  .name { font-size: 0.78rem; text-transform: capitalize; text-align: center; color: var(--text, #e8e8e8); line-height: 1.2; }
  .empty { grid-column: 1 / -1; color: var(--text-faint, #8a8a8a); text-align: center; padding: 24px; }
  /* Phone: take the whole screen and shrink the thumbnails so the grid fits + scrolls. */
  @media (max-width: 600px), (pointer: coarse) and (max-height: 700px) {
    .overlay { padding: 0; align-items: stretch; justify-content: stretch; }
    .modal { width: 100%; height: 100dvh; max-height: 100dvh; border-radius: 0; border: none; }
    .grid { grid-template-columns: repeat(auto-fill, minmax(86px, 1fr)); gap: 8px; padding: 10px 12px calc(10px + env(safe-area-inset-bottom)); }
    .card { padding: 6px; }
    .card img, .noimg { width: 56px; height: 56px; }
    .name { font-size: 0.72rem; }
  }
</style>
