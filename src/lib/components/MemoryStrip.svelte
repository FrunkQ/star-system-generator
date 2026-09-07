<script lang="ts">
  // The rail's memory line (A77, owner 2026-08-28): a thin strip at the very bottom, green until
  // the heap nears the zone where live sessions have actually died. Purely visual — the crash-save
  // watcher lives app-side in +page.svelte, not here; the rail stays presentational.
  // Renders nothing where performance.memory does not exist (Firefox/Safari): an empty gauge would
  // be a claim the browser cannot back.
  import { memoryReading, memoryLevel, formatMB } from '$lib/memoryWatch';
  $: r = $memoryReading;
  $: level = memoryLevel(r);
  $: fillPct = r.supported && r.limitMB > 0 ? Math.min(100, (r.usedMB / r.limitMB) * 100) : 0;
  $: title = r.supported
    ? `Memory: ${formatMB(r.usedMB)} of ${formatMB(r.limitMB)} this browser allows the tab`
    : '';
</script>

{#if r.supported}
  <div class="mem-strip" {title} role="meter" aria-label="Tab memory use"
    aria-valuemin={0} aria-valuemax={Math.round(r.limitMB)} aria-valuenow={Math.round(r.usedMB)}>
    <div class="fill {level}" style="width:{fillPct}%"></div>
  </div>
{/if}

<style>
  .mem-strip { flex: 0 0 auto; height: 3px; margin: 4px 6px 2px; border-radius: 2px; background: rgba(128, 144, 160, 0.18); overflow: hidden; }
  .fill { height: 100%; border-radius: 2px; transition: width 0.6s ease, background-color 0.6s ease; }
  .fill.green { background: #35c96b; }
  .fill.orange { background: #e8a33d; }
  .fill.red { background: #e05252; }
</style>
