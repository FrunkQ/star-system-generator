<script lang="ts">
  // Starmap as a read-only 2D diagram — the player-view module. Multi-star systems render as MULTIPLE
  // star glyphs (the binaries-as-single fix), with route lines and name labels. Themeable.
  import { createEventDispatcher } from 'svelte';
  import type { Starmap } from '$lib/types';
  import { systemVisualStars, starClusterOffsets } from './systemStars';

  export let starmap: Starmap | null = null;
  export let accentColor = '#6aa0ff';
  export let font = 'system-ui';
  export let showLabels = true;
  export let selectable = false;      // live view: systems become tappable
  export let selectedId: string | null = null;

  const dispatch = createEventDispatcher<{ select: string }>();
  const R = 4.5; // glyph radius (viewBox units)

  $: systems = starmap?.systems ?? [];
  $: routes = starmap?.routes ?? [];

  // Fit all systems into a padded viewBox.
  $: view = (() => {
    const W = 800, H = 500, pad = 60;
    if (!systems.length) return { W, H, k: 1, ox: W / 2, oy: H / 2, minX: 0, minY: 0 };
    const xs = systems.map((s) => s.position?.x ?? 0), ys = systems.map((s) => s.position?.y ?? 0);
    const minX = Math.min(...xs), maxX = Math.max(...xs), minY = Math.min(...ys), maxY = Math.max(...ys);
    const k = Math.min((W - pad * 2) / ((maxX - minX) || 1), (H - pad * 2) / ((maxY - minY) || 1));
    return { W, H, k, ox: pad, oy: pad, minX, minY };
  })();
  const px = (x: number) => view.ox + (x - view.minX) * view.k;
  const py = (y: number) => view.oy + (y - view.minY) * view.k;
  $: posById = new Map(systems.map((s) => [s.id, { x: px(s.position?.x ?? 0), y: py(s.position?.y ?? 0) }]));
</script>

<div class="sm2d" style="font-family:{font}; --accent:{accentColor}">
  <svg viewBox="0 0 {view.W} {view.H}" preserveAspectRatio="xMidYMid meet">
    <defs>
      <!-- Accretion-disc gradient for feeding black holes (matches the reference gallery). -->
      <linearGradient id="sm2d-acc" x1="0" y1="0" x2="1" y2="0">
        <stop offset="0" stop-color="#6e2610" /><stop offset="0.3" stop-color="#e08a1e" />
        <stop offset="0.5" stop-color="#fff4d0" /><stop offset="0.7" stop-color="#e08a1e" /><stop offset="1" stop-color="#6e2610" />
      </linearGradient>
    </defs>
    <!-- routes -->
    {#each routes as r (r.id)}
      {@const a = posById.get(r.sourceSystemId)}
      {@const b = posById.get(r.targetSystemId)}
      {#if a && b}<line x1={a.x} y1={a.y} x2={b.x} y2={b.y} class="route" class:dashed={r.lineStyle === 'dashed'} />{/if}
    {/each}
    <!-- systems (multi-star clusters) -->
    {#each systems as node (node.id)}
      {@const c = posById.get(node.id)}
      {@const stars = systemVisualStars(node.system)}
      {@const offs = starClusterOffsets(stars.length)}
      {#if c}
        <g class="sys" class:selectable class:sel={node.id === selectedId}
           role={selectable ? 'button' : undefined} tabindex={selectable ? 0 : undefined}
           on:click={() => selectable && dispatch('select', node.id)}
           on:keydown={(e) => { if (selectable && (e.key === 'Enter' || e.key === ' ')) dispatch('select', node.id); }}>
          {#if selectable}<circle cx={c.x} cy={c.y} r={R * 3} class="hit" />{/if}
          {#each stars as s, i}
            {@const sx = c.x + (offs[i]?.dx ?? 0) * R}
            {@const sy = c.y + (offs[i]?.dy ?? 0) * R}
            {#if s.bh === 'active'}
              <!-- A FEEDING black hole: the accretion-disc schematic (matches the gallery) — an orange
                   ellipse, a black horizon, the white photon ring, and the near half lensed over the top. -->
              <ellipse cx={sx} cy={sy + R * 0.13} rx={R * 2} ry={R * 0.7} fill="none" stroke="url(#sm2d-acc)" stroke-width={R * 0.7} opacity="0.9" />
              <circle cx={sx} cy={sy} r={R} fill="#000" />
              <circle cx={sx} cy={sy} r={R * 1.17} fill="none" stroke="#fff" stroke-width={R * 0.17} />
              <path d="M{sx - R * 2} {sy - R * 0.27} A{R * 2} {R * 0.55} 0 0 1 {sx + R * 2} {sy - R * 0.27}" fill="none" stroke="url(#sm2d-acc)" stroke-width={R * 0.28} opacity="0.75" />
            {:else if s.bh}
              <!-- A quiescent black hole is #000000 → invisible on the dark map; a white-edged black disc reads clearly.
                   Inline style (beats the .star CSS stroke) keeps the white ring. -->
              <circle cx={sx} cy={sy} r={R} style="fill:#000; stroke:#dfe8f4; stroke-width:{R * 0.35}" class="star" />
            {:else}
              <circle cx={sx} cy={sy} r={R} style="fill:{s.color}" class="star" />
            {/if}
          {/each}
          {#if showLabels}<text x={c.x + R * 2 + 3} y={c.y + 4} class="lbl">{node.name}</text>{/if}
        </g>
      {/if}
    {/each}
  </svg>
</div>

<style>
  .sm2d { position: absolute; inset: 0; }
  svg { width: 100%; height: 100%; }
  .route { stroke: color-mix(in srgb, var(--accent) 55%, transparent); stroke-width: 1.4; }
  .route.dashed { stroke-dasharray: 5 4; }
  .star { stroke: rgba(0,0,0,0.4); stroke-width: 0.6; filter: drop-shadow(0 0 3px currentColor); }
  .lbl { fill: #d6deea; font-size: 12px; }
  .sys.selectable { cursor: pointer; }
  .hit { fill: transparent; }
  .sys.selectable:hover .star, .sys.sel .star { stroke: var(--accent); stroke-width: 1.4; }
  .sys.sel .lbl { fill: var(--accent); }
</style>
