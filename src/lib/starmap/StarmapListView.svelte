<script lang="ts">
  // Starmap as a text list — one player-view module for the starmap layer. Systems with a one-line
  // contents summary; multi-star systems say so. Themeable by accent + font.
  import { createEventDispatcher } from 'svelte';
  import type { Starmap } from '$lib/types';
  import { systemVisualStars } from './systemStars';

  export let starmap: Starmap | null = null;
  export let accentColor = '#6aa0ff';
  export let font = 'system-ui';
  export let selectable = false;      // live view: rows become tappable
  export let selectedId: string | null = null;

  const dispatch = createEventDispatcher<{ select: string }>();
  $: systems = starmap?.systems ?? [];
  function summary(node: any): string {
    const ns = node.system?.nodes ?? [];
    const stars = systemVisualStars(node.system).length;
    let planets = 0, moons = 0;
    for (const n of ns) {
      if (n.kind !== 'body') continue;
      if (n.roleHint === 'planet' || n.roleHint === 'dwarf-planet') planets++;
      else if (n.roleHint === 'moon') moons++;
    }
    const parts: string[] = [];
    if (stars) parts.push(stars > 1 ? `${stars} stars` : '1 star');
    if (planets) parts.push(`${planets} planet${planets > 1 ? 's' : ''}`);
    if (moons) parts.push(`${moons} moon${moons > 1 ? 's' : ''}`);
    return parts.join(' · ') || 'uncharted';
  }
</script>

<div class="sm-list" style="font-family:{font}; --accent:{accentColor}">
  <h2>{starmap?.name || 'Known Space'}</h2>
  {#if !systems.length}
    <p class="empty">No systems charted.</p>
  {:else}
    <ul>
      {#each systems as node (node.id)}
        <li>
          {#if selectable}
            <button class="row" class:sel={node.id === selectedId} on:click={() => dispatch('select', node.id)}>
              <span class="dots">
                {#each systemVisualStars(node.system) as s}<span class="dot" style="background:{s.color}"></span>{/each}
              </span>
              <span class="nm">{node.name}</span>
              <span class="sum">{summary(node)}</span>
            </button>
          {:else}
            <span class="dots">
              {#each systemVisualStars(node.system) as s}<span class="dot" style="background:{s.color}"></span>{/each}
            </span>
            <span class="nm">{node.name}</span>
            <span class="sum">{summary(node)}</span>
          {/if}
        </li>
      {/each}
    </ul>
  {/if}
</div>

<style>
  .sm-list { position: absolute; inset: 0; overflow-y: auto; color: #e6ecf4; padding: 6% 8%; }
  h2 { margin: 0 0 1rem; color: var(--accent); font-size: 1.6rem; }
  ul { list-style: none; margin: 0; padding: 0; }
  li { display: grid; grid-template-columns: auto 1fr auto; align-items: center; gap: 12px; padding: 8px 0; border-bottom: 1px solid rgba(140,170,210,0.15); }
  .row { display: grid; grid-template-columns: auto 1fr auto; align-items: center; gap: 12px; width: 100%; background: none; border: none; color: inherit; font: inherit; text-align: left; padding: 2px 4px; margin: -2px -4px; border-radius: 5px; cursor: pointer; }
  .row:hover { background: color-mix(in srgb, var(--accent) 14%, transparent); }
  .row.sel { background: color-mix(in srgb, var(--accent) 22%, transparent); }
  .dots { display: inline-flex; gap: 3px; }
  .dot { width: 11px; height: 11px; border-radius: 50%; box-shadow: 0 0 6px currentColor; }
  .nm { font-weight: 600; }
  .sum { color: #9fb0c8; font-size: 0.82rem; text-align: right; }
  .empty { color: #9fb0c8; }
</style>
