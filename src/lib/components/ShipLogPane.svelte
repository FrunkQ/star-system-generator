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
  import { resolveCalendar, unixMsToMasterSeconds } from '$lib/temporal/utre';
  import { getJourneyBounds } from '$lib/transit/scheduler';

  export let focusedBody: CelestialBody;
  export let clearFutureCount: number;
  export let activeCount: number;

  const dispatch = createEventDispatcher();

  function formatLogTime(ms: number): string {
      if (!Number.isFinite(ms)) return 'n/a';
      const temporal = get(starmapStore)?.temporal;
      if (temporal) {
          const calendar = temporal.temporal_registry[temporal.activeCalendarKey];
          // Journey times are unix-epoch ms; the calendar resolver wants MASTER (since-Big-Bang) seconds.
          if (calendar) return resolveCalendar(unixMsToMasterSeconds(ms), calendar).formatted;
      }
      const d = new Date(ms);
      if (Number.isFinite(d.getTime())) return d.toISOString();
      return `${Math.floor(ms / 1000)}s`;
  }

  // createdAtSec / cancelledAtSec are stored as unix-epoch SECONDS → unix ms for formatLogTime.
  function safeClockSecStringToMs(value: string | undefined): number {
      try {
          if (!value) return 0;
          return Number(BigInt(value)) * 1000;
      } catch {
          return 0;
      }
  }

  function nodeName(nodeId: string): string {
      const n = $systemStore?.nodes.find((x) => x.id === nodeId);
      return n?.name || nodeId;
  }

  // How a hop ENDS — the handoff the next journey (or autopilot) picks up: parked (docked / in orbit) or
  // free with a leftover velocity (a fly-past). Read straight off the plan.
  const PLACEMENT: Record<string, string> = {
      lo: 'Low orbit', mo: 'Medium orbit', ho: 'High orbit', geo: 'Geostationary orbit',
      surface: 'Surface', l4: 'L4', l5: 'L5'
  };
  const fmtSpeed = (ms: number) => ms >= 1000 ? `${(ms / 1000).toFixed(1)} km/s` : `${Math.round(ms)} m/s`;
  function exitState(leg: any): string {
      const isFlyby = (leg.interceptSpeed_ms || 0) > 0 || (leg.segments || []).some((s: any) => (s.warnings || []).includes('Flyby'));
      if (isFlyby) {
          const v = leg.arrivalVelocity_ms || leg.interceptSpeed_ms || 0;
          return `Fly-past — carries ${fmtSpeed(v)} Δv`;
      }
      if (leg.arrivalPlacement && PLACEMENT[leg.arrivalPlacement]) return `In ${PLACEMENT[leg.arrivalPlacement]}`;
      return 'Docked';
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
          {#each log.plans as leg}
            <div class="ship-log-leg">
              <div class="ship-log-route">{nodeName(leg.originId)} → {nodeName(leg.targetId)}</div>
              <div class="ship-log-meta">Depart: {formatLogTime(leg.startTime)}</div>
              <div class="ship-log-meta">Arrive: {formatLogTime(leg.startTime + (leg.totalTime_days * 86400 * 1000))}</div>
              <div class="ship-log-meta">Arrival speed: {fmtSpeed(leg.arrivalVelocity_ms || 0)}</div>
              <div class="ship-log-meta ship-log-exit">Ends: {exitState(leg)}</div>
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
      border: 1px solid var(--border);
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
      background: var(--bg-control);
      color: var(--text);
      border: 1px solid var(--border);
      border-radius: 4px;
      padding: 0.35em 0.7em;
      cursor: pointer;
  }
  .ship-log-close:hover {
      background: var(--bg-control-hover);
  }
  .ship-log-empty {
      color: var(--text-muted);
  }
  .ship-log-entry {
      border: 1px solid var(--border);
      border-radius: 5px;
      background: #181818;
      padding: 0.6em;
  }
  .ship-log-title {
      display: flex;
      justify-content: space-between;
      gap: 0.6em;
      color: var(--text);
  }
  .ship-log-status {
      color: var(--link);
      font-size: 0.85em;
  }
  .ship-log-meta {
      color: var(--text-muted);
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
  .ship-log-route {
      font-weight: 600;
      color: var(--text);
  }
  .ship-log-exit {
      color: #8fcf9f;
  }
</style>
