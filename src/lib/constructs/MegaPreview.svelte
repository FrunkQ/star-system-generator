<script lang="ts">
  // The dumb half of the mega preview: maps megaPreview.ts primitives to SVG and owns nothing but
  // colour. All the proportions live in megaPreviewPrimitives, where they are headlessly tested
  // (E7). SVG rather than canvas on purpose — a declarative surface an agent can verify.
  import type { CelestialBody } from '$lib/types';
  import type { MegaTypeDef } from './megaTypes';
  import { megaPreviewPrimitives, PREVIEW_BOX } from './megaPreview';

  export let def: MegaTypeDef;
  export let host: CelestialBody;
  /** The template's own icon_color — one colour drives the whole look (UI-C1). */
  export let color: string = '#ffd24d';
  export let size = 44;

  $: prims = megaPreviewPrimitives(def, host);

  const stroke = (role: string): string =>
    role === 'structure' ? color : role === 'host' ? 'var(--text-muted, #a8aeb9)' : 'var(--border, #555)';

  // An arc as an SVG path (sweep from startRad, positive = clockwise in screen space).
  function arcPath(cx: number, cy: number, r: number, startRad: number, sweepRad: number): string {
    const s = Math.min(sweepRad, 2 * Math.PI - 1e-4); // a full sweep degenerates; cap just under
    const x1 = cx + r * Math.cos(startRad);
    const y1 = cy + r * Math.sin(startRad);
    const x2 = cx + r * Math.cos(startRad + s);
    const y2 = cy + r * Math.sin(startRad + s);
    const large = s > Math.PI ? 1 : 0;
    return `M ${x1.toFixed(2)} ${y1.toFixed(2)} A ${r} ${r} 0 ${large} 1 ${x2.toFixed(2)} ${y2.toFixed(2)}`;
  }
</script>

<svg viewBox="0 0 {PREVIEW_BOX} {PREVIEW_BOX}" width={size} height={size} aria-hidden="true">
  {#each prims as p}
    {#if p.kind === 'circle'}
      <circle cx={p.cx} cy={p.cy} r={p.r} fill="none" stroke={stroke(p.role)} stroke-width={p.width}
              stroke-dasharray={p.dashed ? '3 3' : undefined} />
    {:else if p.kind === 'disc'}
      <circle cx={p.cx} cy={p.cy} r={p.r} fill={stroke(p.role)} />
    {:else if p.kind === 'arc'}
      <path d={arcPath(p.cx, p.cy, p.r, p.startRad, p.sweepRad)} fill="none" stroke={stroke(p.role)}
            stroke-width={p.width} stroke-linecap="round" />
    {:else if p.kind === 'line'}
      <line x1={p.x1} y1={p.y1} x2={p.x2} y2={p.y2} stroke={stroke(p.role)} stroke-width={p.width} />
    {:else if p.kind === 'rect'}
      <rect x={p.x} y={p.y} width={p.w} height={p.h} fill={stroke(p.role)} rx="1" />
    {:else if p.kind === 'dots'}
      {#each p.points as pt}
        <circle cx={pt.x} cy={pt.y} r={p.r} fill={stroke(p.role)} />
      {/each}
    {/if}
  {/each}
</svg>
