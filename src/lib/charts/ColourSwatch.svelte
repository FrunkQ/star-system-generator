<script lang="ts">
  // A labelled colour chip. Part of the chart vocabulary rather than a one-off, because every
  // diagram that ends in "and it looks like THIS" needs the same thing.
  //
  // `whose` is not decoration. A colour derived from a spectrum is a claim about a viewer, and the
  // standing rule is to SAY WHOSE — "looks green to human eyes" is true and useful, "is green" is a
  // claim the physics has not made. The title text carries it for a screen reader too, because a
  // swatch on its own gives a screen-reader user nothing at all.
  let { hex, label = '', sub = '', whose = 'as human eyes would see it', size = 22 }:
    { hex: string; label?: string; sub?: string; whose?: string; size?: number } = $props();
</script>

<span class="swatch-row" title={`${label ? label + ' — ' : ''}${hex}, ${whose}`}>
  <span class="chip" style={`background:${hex};width:${size}px;height:${size}px`}></span>
  {#if label || sub}
    <span class="txt">
      {#if label}<span class="lab">{label}</span>{/if}
      {#if sub}<span class="sub">{sub}</span>{/if}
    </span>
  {/if}
  <span class="sr">{hex}, {whose}</span>
</span>

<style>
  .swatch-row { display: inline-flex; align-items: center; gap: 8px; }
  .chip {
    display: inline-block; border-radius: 4px;
    border: 1px solid var(--border, #2a2d36);
    box-shadow: inset 0 0 0 1px rgba(0, 0, 0, 0.25);
    flex: none;
  }
  .txt { display: flex; flex-direction: column; line-height: 1.15; }
  .lab { font-size: 0.85em; color: var(--text, #eee); }
  .sub { font-size: 0.72em; color: var(--text-faint, #8a8f9a); }
  .sr { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; }
</style>
