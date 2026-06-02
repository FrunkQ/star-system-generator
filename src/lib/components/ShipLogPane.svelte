<script lang="ts">
  // Ship's Log pane, extracted from SystemView (Phase 01.7). Renders a
  // construct's scheduled journeys. Its display helpers (which only read the
  // global stores) live here; the two action counts depend on SystemView's
  // currentTime so they come in as props, and the actions dispatch back.
  import { createEventDispatcher } from 'svelte';
  import { get } from 'svelte/store';
  import type { CelestialBody } from '$lib/types';
  import { systemStore } from '$lib/stores';
  import { starmapStore } from '$lib/starmapStore';
  import { resolveCalendar, BIG_BANG_TO_UNIX_EPOCH_T } from '$lib/temporal/utre';
  import { getJourneyBounds } from '$lib/transit/scheduler';

  export let focusedBody: CelestialBody;
  export let clearFutureCount: number;
  export let activeCount: number;

  const dispatch = createEventDispatcher();

  function formatLogTime(ms: number): string {
      if (!Number.isFinite(ms)) return 'n/a';
      const sec = BigInt(Math.floor(ms / 1000));
      const temporal = get(starmapStore)?.temporal;
      if (temporal) {
          const calendar = temporal.temporal_registry[temporal.activeCalendarKey];
          if (calendar) return resolveCalendar(sec, calendar).formatted;
      }
      const d = new Date(ms);
      if (Number.isFinite(d.getTime())) return d.toISOString();
      return `${sec.toString()}s`;
  }

  function safeClockSecStringToMs(value: string | undefined): number {
      try {
          if (!value) return 0;
          const sec = BigInt(value);
          const unixSec = sec - BIG_BANG_TO_UNIX_EPOCH_T;
          return Number(unixSec) * 1000;
      } catch {
          return 0;
      }
  }

  function nodeName(nodeId: string): string {
      const n = $systemStore?.nodes.find((x) => x.id === nodeId);
      return n?.name || nodeId;
  }
</script>

<div class="ship-log-panel">
  <div class="ship-log-header">
    <h4>Ship's Log</h4>
    <button class="ship-log-close" on:click={() => dispatch('close')}>Close Log</button>
  </div>
  <div class="ship-log-controls">
    <button class="ship-log-action" on:click={() => dispatch('clearfuture')} disabled={clearFutureCount === 0} title="Remove all future scheduled journeys using Actual/Global time">
      Clear Future Plans ({clearFutureCount})
    </button>
    <button class="ship-log-action warn" on:click={() => dispatch('cancelactive')} disabled={activeCount === 0} title="Cancel currently active journey, keep current velocity vector, and clear all future plans">
      Cancel Active (+Future) ({activeCount})
    </button>
  </div>
  {#if (focusedBody.scheduled_journeys || []).length === 0}
    <div class="ship-log-empty">No journeys logged.</div>
  {:else}
    {#each (focusedBody.scheduled_journeys || []) as log, i}
      <div class="ship-log-entry">
        <div class="ship-log-title">
          <strong>Journey {i + 1}</strong>
          <span class="ship-log-status">{log.status.toUpperCase()}</span>
        </div>
        <div class="ship-log-meta">Created: {formatLogTime(safeClockSecStringToMs(log.createdAtSec))}</div>
        {#if getJourneyBounds(log.plans)}
          {@const bounds = getJourneyBounds(log.plans)!}
          <div class="ship-log-meta">Window: {formatLogTime(bounds.startMs)} -> {formatLogTime(bounds.endMs)}</div>
        {/if}
        <div class="ship-log-legs">
          {#each log.plans as leg, legIndex}
            <div class="ship-log-leg">
              <div><strong>Leg {legIndex + 1}:</strong> {nodeName(leg.originId)} -> {nodeName(leg.targetId)}</div>
              <div class="ship-log-meta">Depart: {formatLogTime(leg.startTime)}</div>
              <div class="ship-log-meta">Arrive: {formatLogTime(leg.startTime + (leg.totalTime_days * 86400 * 1000))}</div>
            </div>
          {/each}
        </div>
      </div>
    {/each}
  {/if}
</div>

<style>
  .ship-log-panel {
      background: #1f1f1f;
      border: 1px solid #3b3b3b;
      border-radius: 6px;
      padding: 0.8em;
      display: flex;
      flex-direction: column;
      gap: 0.7em;
  }
  .ship-log-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 0.8em;
  }
  .ship-log-header h4 {
      margin: 0;
      color: #ffb088;
  }
  .ship-log-close {
      background: #444;
      color: #eee;
      border: 1px solid #666;
      border-radius: 4px;
      padding: 0.35em 0.7em;
      cursor: pointer;
  }
  .ship-log-close:hover {
      background: #555;
  }
  .ship-log-empty {
      color: #aaa;
  }
  .ship-log-entry {
      border: 1px solid #363636;
      border-radius: 5px;
      background: #181818;
      padding: 0.6em;
  }
  .ship-log-title {
      display: flex;
      justify-content: space-between;
      gap: 0.6em;
      color: #fff;
  }
  .ship-log-status {
      color: #88ccff;
      font-size: 0.85em;
  }
  .ship-log-meta {
      color: #b8b8b8;
      font-size: 0.85em;
      margin-top: 0.2em;
  }
  .ship-log-legs {
      margin-top: 0.45em;
      display: flex;
      flex-direction: column;
      gap: 0.4em;
  }
  .ship-log-leg {
      border-left: 2px solid #2f5d76;
      padding-left: 0.55em;
  }
</style>
