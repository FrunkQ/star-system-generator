<script lang="ts">
  // Non-interactive current-time readout, shown as an overlay at the top-left of the
  // orrery / starmap (freed from the transport pill so it isn't width-constrained).
  // Shows BOTH clocks: Display (the time you're viewing/scrubbing) and Actual ("now",
  // the authoritative anchor). Read-only.
  import type { Starmap } from '$lib/types';
  import { parseClockSeconds, resolveCalendar, resolveTemporalDisplay } from '$lib/temporal/utre';

  type Temporal = NonNullable<Starmap['temporal']>;
  export let temporal: Temporal;
  // When the parent animates the clocks (e.g. SystemView's align), drive the read-outs
  // from these overrides instead of temporal.displayTimeSec / masterTimeSec.
  export let displayOverrideSec: bigint | null = null;
  export let masterOverrideSec: bigint | null = null;

  $: displayLabel = (() => {
    try {
      const t = displayOverrideSec !== null
        ? { ...temporal, displayTimeSec: displayOverrideSec.toString() }
        : temporal;
      return resolveTemporalDisplay(t)?.formatted ?? '';
    } catch {
      return '';
    }
  })();

  $: actualLabel = (() => {
    try {
      const masterSeconds = masterOverrideSec ?? parseClockSeconds(temporal.masterTimeSec, 0n);
      const calendar = temporal.temporal_registry[temporal.activeCalendarKey];
      return calendar ? resolveCalendar(masterSeconds, calendar).formatted : masterSeconds.toString();
    } catch {
      return '';
    }
  })();

</script>

<div class="time-display" aria-hidden="true">
  <div class="td-row">
    <span class="td-k">Display</span>
    <span class="td-v">{displayLabel}</span>
  </div>
  {#if actualLabel}
    <div class="td-row td-actual">
      <span class="td-k">Actual</span>
      <span class="td-v">{actualLabel}</span>
    </div>
  {/if}
</div>

<style>
  .time-display {
    pointer-events: none;
    user-select: none;
    display: inline-flex;
    flex-direction: column;
    gap: 2px;
    white-space: nowrap;
    color: var(--text, #e8e8e8);
    background: color-mix(in srgb, var(--bg-panel, #14161c) 72%, transparent);
    border: 1px solid var(--border, #2a2d36);
    padding: 6px 12px;
    border-radius: 12px;
    backdrop-filter: blur(5px);
    box-shadow: 0 2px 10px rgba(0, 0, 0, 0.35);
    line-height: 1.25;
  }
  .td-row {
    display: flex;
    align-items: baseline;
    gap: 8px;
    font-size: 0.9rem;
  }
  .td-k {
    flex: 0 0 auto;
    width: 3.4em;
    font-size: 0.62rem;
    text-transform: uppercase;
    letter-spacing: 0.6px;
    color: var(--text-faint, #8a8f9a);
  }
  .td-v { font-weight: 600; font-variant-numeric: tabular-nums; }
  /* Actual ("now") is secondary — smaller + dimmer, sitting under the Display line. */
  .td-actual .td-k,
  .td-actual .td-v { font-size: 0.72rem; }
  .td-actual .td-v { font-weight: 500; color: var(--text-muted, #cfcfcf); }
</style>
