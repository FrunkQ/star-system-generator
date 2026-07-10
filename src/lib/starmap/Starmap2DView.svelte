<script lang="ts">
  // Starmap as a read-only 2D diagram — the player-view module. Multi-star systems render as MULTIPLE
  // star glyphs (the binaries-as-single fix), with route lines and name labels. Themeable.
  import type { Starmap } from '$lib/types';
  import { systemVisualStars, starClusterOffsets } from './systemStars';

  export let starmap: Starmap | null = null;
  export let accentColor = '#6aa0ff';
  export let font = 'system-ui';
  export let showLabels = true;

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
        <g>
          {#each stars as s, i}
            <circle cx={c.x + (offs[i]?.dx ?? 0) * R} cy={c.y + (offs[i]?.dy ?? 0) * R} r={R} style="fill:{s.color}" class="star" />
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
</style>
