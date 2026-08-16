<script lang="ts">
  // Axes, gridlines and labels — the frame every chart in the vocabulary sits inside. It draws
  // nothing about the data; the caller renders its marks over the top using the SAME scales, which
  // is what stops two plots of one quantity disagreeing about where a value sits.
  import { ticks, type PlotBox, type Scale } from './plotScale';

  let {
    box, sx, sy, xLabel = '', yLabel = '', xUnit = '', xTickCount = 6, yTickCount = 4,
    xFormat = (v: number) => String(v), yFormat = (v: number) => String(v)
  }: {
    box: PlotBox; sx: Scale; sy: Scale;
    xLabel?: string; yLabel?: string; xUnit?: string;
    xTickCount?: number; yTickCount?: number;
    xFormat?: (v: number) => string; yFormat?: (v: number) => string;
  } = $props();

  const xt = $derived(ticks(sx.min, sx.max, xTickCount));
  const yt = $derived(ticks(sy.min, sy.max, yTickCount));
  const x0 = $derived(box.padLeft);
  const x1 = $derived(box.width - box.padRight);
  const y0 = $derived(box.height - box.padBottom);
  const y1 = $derived(box.padTop);
</script>

<g class="axes">
  {#each yt as v}
    <line class="grid" x1={x0} x2={x1} y1={sy(v)} y2={sy(v)} />
    <text class="tick y" x={x0 - 6} y={sy(v) + 3}>{yFormat(v)}</text>
  {/each}
  {#each xt as v}
    <line class="grid faint" x1={sx(v)} x2={sx(v)} y1={y0} y2={y1} />
    <text class="tick x" x={sx(v)} y={y0 + 14}>{xFormat(v)}</text>
  {/each}
  <line class="frame" x1={x0} x2={x1} y1={y0} y2={y0} />
  <line class="frame" x1={x0} x2={x0} y1={y0} y2={y1} />
  {#if xLabel}
    <text class="label x" x={(x0 + x1) / 2} y={box.height - 2}>{xLabel}{xUnit ? ` (${xUnit})` : ''}</text>
  {/if}
  {#if yLabel}
    <text class="label y" transform={`translate(11 ${(y0 + y1) / 2}) rotate(-90)`}>{yLabel}</text>
  {/if}
</g>

<style>
  .grid { stroke: var(--border, #2a2d36); stroke-width: 1; }
  .grid.faint { stroke-opacity: 0.35; }
  .frame { stroke: var(--text-faint, #8a8f9a); stroke-width: 1; }
  .tick { fill: var(--text-faint, #8a8f9a); font-size: 10px; }
  .tick.y { text-anchor: end; }
  .tick.x { text-anchor: middle; }
  .label { fill: var(--text-muted, #cfcfcf); font-size: 11px; text-anchor: middle; }
</style>
