<script lang="ts">
  // Non-interactive current-time readout, shown as an overlay at the top of the orrery /
  // starmap (freed from the transport pill so it isn't width-constrained). Read-only.
  import type { Starmap } from '$lib/types';
  import { resolveTemporalDisplay } from '$lib/temporal/utre';

  type Temporal = NonNullable<Starmap['temporal']>;
  export let temporal: Temporal;
  // When the parent animates the display clock (e.g. SystemView's align), drive the readout
  // from this override instead of temporal.displayTimeSec.
  export let displayOverrideSec: bigint | null = null;

  $: label = (() => {
    try {
      const t = displayOverrideSec !== null
        ? { ...temporal, displayTimeSec: displayOverrideSec.toString() }
        : temporal;
      return resolveTemporalDisplay(t)?.formatted ?? '';
    } catch {
      return '';
    }
  })();
</script>

<div class="time-display" aria-hidden="true">{label}</div>

<style>
  .time-display {
    pointer-events: none;
    user-select: none;
    white-space: nowrap;
    font-weight: 600;
    font-size: 0.92rem;
    line-height: 1;
    color: var(--text, #e8e8e8);
    background: color-mix(in srgb, var(--bg-panel, #14161c) 72%, transparent);
    border: 1px solid var(--border, #2a2d36);
    padding: 6px 14px;
    border-radius: 999px;
    backdrop-filter: blur(5px);
    box-shadow: 0 2px 10px rgba(0, 0, 0, 0.35);
  }
</style>
