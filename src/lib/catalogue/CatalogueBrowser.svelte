<script lang="ts">
  // Diagrammatic catalogue tier — the "app feel" for the lo-fi/datapad skins: a clickable
  // star/planet layout up top, and the selected body's player-safe facts in a panel below.
  // Skin-agnostic: uses currentColor + thin borders so each skin's colour drives the look.
  import type { System, CelestialBody } from '$lib/types';
  import { bodyFacts, bodyGlyph } from '$lib/catalogue/bodyFacts';

  export let system: System;
  export let includeConstructs = true;

  let selectedId: string | null = null;

  function isStar(n: any): boolean {
    return n?.roleHint === 'star' || (Array.isArray(n?.classes) && n.classes.some((c: string) => String(c).startsWith('star/')));
  }

  $: nodes = (system?.nodes ?? []).filter((n) => includeConstructs || n.kind !== 'construct') as CelestialBody[];
  $: stars = nodes.filter(isStar).sort((a, b) => (b.massKg || 0) - (a.massKg || 0));

  function orbiters(hostId: string): CelestialBody[] {
    return nodes
      .filter((n) => !isStar(n) && n.kind !== 'moon' && (n.parentId === hostId || n.orbit?.hostId === hostId) && n.roleHint !== 'moon')
      .sort((a, b) => (a.orbit?.elements?.a_AU || 0) - (b.orbit?.elements?.a_AU || 0));
  }
  function moonsOf(id: string): CelestialBody[] {
    return nodes
      .filter((n) => (n.parentId === id || n.orbit?.hostId === id) && n.roleHint === 'moon')
      .sort((a, b) => (a.orbit?.elements?.a_AU || 0) - (b.orbit?.elements?.a_AU || 0));
  }
  // Bodies with no stellar host shown (rogue planets / unparented constructs).
  $: rogues = nodes.filter((n) => !isStar(n) && n.roleHint !== 'moon' && !n.parentId && !n.orbit?.hostId);

  $: selected = nodes.find((n) => n.id === selectedId) || null;
  $: facts = selected ? bodyFacts(selected) : [];
  $: selectedMoons = selected ? moonsOf(selected.id) : [];

  // Auto-select the first interesting body once data arrives.
  $: if ((!selectedId || !nodes.some((n) => n.id === selectedId)) && stars.length) {
    const o = orbiters(stars[0].id);
    selectedId = o[0]?.id ?? stars[0].id;
  }
</script>

<div class="cat-browser">
  <header class="cat-head">
    <h1>{system?.name ?? 'Field Guide'}</h1>
    <p class="sub">Field guide · {nodes.length} catalogued object{nodes.length === 1 ? '' : 's'}</p>
  </header>

  <div class="layout">
    {#each stars as star (star.id)}
      <div class="sys-row">
        <button class="chip star" class:sel={selectedId === star.id} on:click={() => (selectedId = star.id)}>
          <span class="g">{bodyGlyph(star)}</span> {star.name}
        </button>
        <div class="orbiters">
          {#each orbiters(star.id) as b (b.id)}
            <button class="chip" class:sel={selectedId === b.id} on:click={() => (selectedId = b.id)}>
              <span class="g">{bodyGlyph(b)}</span> {b.name}{#if moonsOf(b.id).length}<span class="moons">{moonsOf(b.id).length}🌙</span>{/if}
            </button>
          {/each}
          {#if orbiters(star.id).length === 0}<span class="empty">no catalogued bodies</span>{/if}
        </div>
      </div>
    {/each}

    {#if rogues.length}
      <div class="sys-row">
        <span class="chip star muted"><span class="g">✦</span> Unbound</span>
        <div class="orbiters">
          {#each rogues as b (b.id)}
            <button class="chip" class:sel={selectedId === b.id} on:click={() => (selectedId = b.id)}>
              <span class="g">{bodyGlyph(b)}</span> {b.name}
            </button>
          {/each}
        </div>
      </div>
    {/if}
  </div>

  {#if selected}
    <section class="panel">
      <div class="panel-head">
        <h2><span class="g">{bodyGlyph(selected)}</span> {selected.name}</h2>
      </div>

      {#if selectedMoons.length}
        <div class="moon-row">
          <span class="moon-label">Moons:</span>
          {#each selectedMoons as m (m.id)}
            <button class="chip small" class:sel={selectedId === m.id} on:click={() => (selectedId = m.id)}>{m.name}</button>
          {/each}
        </div>
      {/if}

      <dl class="facts">
        {#each facts as f}
          <dt>{f.label}</dt><dd>{f.value}</dd>
        {/each}
      </dl>

      {#if selected.description}
        <p class="desc">{selected.description}</p>
      {/if}
    </section>
  {/if}
</div>

<style>
  .cat-browser {
    max-width: 760px;
    margin: 0 auto;
    padding: 16px 18px 40px;
    font-family: inherit;
  }
  .cat-head h1 { margin: 0; font-size: 1.5rem; letter-spacing: 0.02em; }
  .cat-head .sub { margin: 2px 0 14px; opacity: 0.6; font-size: 0.8rem; }

  .layout { display: flex; flex-direction: column; gap: 10px; }
  .sys-row {
    border: 1px solid currentColor;
    border-radius: 8px;
    padding: 10px 12px;
    opacity: 0.96;
  }
  .orbiters { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 8px; }
  .empty { opacity: 0.45; font-size: 0.8rem; font-style: italic; }

  .chip {
    display: inline-flex; align-items: center; gap: 6px;
    background: transparent; color: inherit; font: inherit; font-size: 0.86rem;
    border: 1px solid currentColor; border-radius: 6px;
    padding: 5px 10px; cursor: pointer; opacity: 0.8;
  }
  .chip:hover { opacity: 1; }
  .chip.sel { opacity: 1; background: currentColor; }
  .chip.sel :global(*), .chip.sel { /* invert text on the filled chip via mix-blend */ }
  .chip.sel { box-shadow: 0 0 0 1px currentColor; }
  .chip.star { font-weight: 700; font-size: 0.95rem; }
  .chip.small { font-size: 0.8rem; padding: 3px 8px; }
  .chip.muted { opacity: 0.6; cursor: default; }
  .chip .g { font-size: 0.9em; }
  .chip .moons { opacity: 0.6; font-size: 0.7rem; margin-left: 2px; }

  /* Selected chip: fill with currentColor, punch the label out via the panel bg. Because skins
     vary, we keep it simple — a filled chip with a contrasting inset using mix-blend difference. */
  .chip.sel { color: inherit; background: color-mix(in srgb, currentColor 22%, transparent); }

  .panel {
    margin-top: 18px;
    border: 1px solid currentColor;
    border-radius: 8px;
    padding: 14px 16px 18px;
  }
  .panel-head { display: flex; align-items: baseline; gap: 10px; border-bottom: 1px solid currentColor; padding-bottom: 8px; margin-bottom: 12px; }
  .panel-head h2 { margin: 0; font-size: 1.2rem; }
  .moon-row { display: flex; flex-wrap: wrap; align-items: center; gap: 6px; margin-bottom: 12px; }
  .moon-label { opacity: 0.55; font-size: 0.78rem; }
  .facts { display: grid; grid-template-columns: max-content 1fr; gap: 5px 16px; margin: 0; font-size: 0.9rem; }
  .facts dt { opacity: 0.55; }
  .facts dd { margin: 0; }
  .desc { margin-top: 14px; line-height: 1.6; font-size: 0.95rem; white-space: pre-wrap; opacity: 0.92; }
</style>
