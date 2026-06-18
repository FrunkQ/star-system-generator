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
  // Actual/master clock in unix-ms. A log time gets a clickable "jump display time here" clock ONLY when it's
  // at or after actual time — you can preview the present/future, but not rewind display before what's
  // already committed. Default Infinity = no seek wired by this host, so no clocks render.
  export let actualTimeMs: number = Infinity;
  // The DISPLAY clock in unix-ms. The log may be open while time is scrubbed, so each journey's status badge
  // is derived from this (PLANNED / IN TRANSIT / COMPLETED / ADRIFT) rather than the stored status field.
  // NaN = host didn't wire it → fall back to the stored status.
  export let displayTimeMs: number = NaN;

  // Status of a journey AT the current display time, not its stored end-state. PLANNED before it starts,
  // IN TRANSIT mid-flight, then COMPLETED — or, for an aborted journey, ADRIFT · COASTING once cancelled.
  function dynamicStatus(log: any, bounds: { startMs: number; endMs: number } | null): string {
      if (!bounds || !Number.isFinite(displayTimeMs)) {
          return (log.status === 'cancelled' && log.cancelState) ? 'ADRIFT · COASTING' : String(log.status || '').toUpperCase();
      }
      if (displayTimeMs < bounds.startMs) return 'PLANNED';
      const cancelMs = log.cancelledAtSec ? safeClockSecStringToMs(log.cancelledAtSec) : null;
      if (cancelMs !== null && log.cancelState) {
          return displayTimeMs >= cancelMs ? 'ADRIFT · COASTING' : 'IN TRANSIT';
      }
      return displayTimeMs >= bounds.endMs ? 'COMPLETED' : 'IN TRANSIT';
  }

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
      const target = leg.targetId ? nodeName(leg.targetId) : '';
      const isFlyby = (leg.interceptSpeed_ms || 0) > 0 || (leg.segments || []).some((s: any) => (s.warnings || []).includes('Flyby'));
      if (isFlyby) {
          const v = leg.arrivalVelocity_ms || leg.interceptSpeed_ms || 0;
          return `Fly-past${target ? ` of ${target}` : ''} — carries ${fmtSpeed(v)} Δv`;
      }
      if (leg.arrivalPlacement && PLACEMENT[leg.arrivalPlacement]) return `In ${PLACEMENT[leg.arrivalPlacement]}${target ? ` of ${target}` : ''}`;
      return target ? `Docked at ${target}` : 'Docked';
  }
</script>

<!-- A small clock that jumps DISPLAY time to a logged moment. Only rendered for times at/after actual
     time (the cutoff) — rewinding display before the committed present isn't offered. -->
{#snippet seekClock(ms)}
  {#if Number.isFinite(ms) && ms >= actualTimeMs}
    <button class="seek-clock" type="button" title={`Set display time to ${formatLogTime(ms)}`} aria-label="Set display time to this moment" on:click={() => dispatch('seek', { ms })}>
      <svg viewBox="0 0 24 24" width="11" height="11" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M12 7.5v4.7l3 1.8"/></svg>
    </button>
  {/if}
{/snippet}

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
      {@const createdMs = safeClockSecStringToMs(log.createdAtSec)}
      {@const bounds = getJourneyBounds(log.plans)}
      {@const dynStatus = dynamicStatus(log, bounds)}
      {@const adriftNow = dynStatus === 'ADRIFT · COASTING'}
      {@const prevLog = (focusedBody.scheduled_journeys || [])[i - 1]}
      {@const startedAdrift = i > 0 && prevLog && prevLog.status === 'cancelled' && prevLog.cancelState && prevLog.cancelledAtSec}
      {@const driftFromMs = startedAdrift ? safeClockSecStringToMs(prevLog.cancelledAtSec) : 0}
      <div class="ship-log-entry">
        <div class="ship-log-title">
          <strong>Journey {i + 1}</strong>
          {#if log.autopilot}<span class="ship-log-auto" title="Planned and flown by autopilot"><span class="ap-ship" aria-hidden="true"><svg viewBox="0 0 24 24" width="11" height="11" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M3 11l19-9-9 19-2-8-8-2z" /></svg></span> autopilot</span>{/if}
          <span class="ship-log-status" class:adrift={adriftNow}>{dynStatus}</span>
        </div>
        <div class="ship-log-meta">Created: {formatLogTime(createdMs)} {@render seekClock(createdMs)}</div>
        {#if bounds}
          <div class="ship-log-meta">Window: {formatLogTime(bounds.startMs)} {@render seekClock(bounds.startMs)} -> {formatLogTime(bounds.endMs)} {@render seekClock(bounds.endMs)}</div>
        {/if}
        {#if adriftNow}
          {@const cancelMs = safeClockSecStringToMs(log.cancelledAtSec)}
          <div class="ship-log-meta ship-log-adrift">Cancelled &amp; coasting since {formatLogTime(cancelMs)} {@render seekClock(cancelMs)} from ({log.cancelState.position_au.x.toFixed(2)}, {log.cancelState.position_au.y.toFixed(2)}) AU</div>
        {/if}
        {#if adriftNow}
          <div class="ship-log-meta ship-log-planned-hdr">Originally planned route (aborted):</div>
        {/if}
        <div class="ship-log-legs">
          {#each log.plans as leg, legIndex}
            {@const arriveMs = leg.startTime + (leg.totalTime_days * 86400 * 1000)}
            {@const driftDays = Math.max(0, Math.round((leg.startTime - driftFromMs) / 86400000))}
            <div class="ship-log-leg">
              {#if startedAdrift && legIndex === 0}
                <div class="ship-log-route">Adrift around {nodeName(leg.originId)} (for {driftDays} days) → {nodeName(leg.targetId)}</div>
              {:else}
                <div class="ship-log-route">{nodeName(leg.originId)} → {nodeName(leg.targetId)}</div>
              {/if}
              <div class="ship-log-meta">Depart: {formatLogTime(leg.startTime)} {@render seekClock(leg.startTime)}</div>
              <div class="ship-log-meta">Arrive: {formatLogTime(arriveMs)} {@render seekClock(arriveMs)}</div>
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
  .ship-log-auto {
      align-self: center;
      display: inline-flex; align-items: center; gap: 4px;
      color: var(--accent, #ff5a1f);
      border: 1px solid var(--accent, #ff5a1f);
      border-radius: 999px;
      padding: 1px 8px;
      font-size: 0.72em;
      letter-spacing: 0.03em;
      white-space: nowrap;
  }
  .ship-log-auto .ap-ship { display: inline-flex; animation: ap-ship-pulse 1.9s ease-in-out infinite; }
  @keyframes ap-ship-pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.45; } }
  @media (prefers-reduced-motion: reduce) { .ship-log-auto .ap-ship { animation: none; } }
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
  .ship-log-status.adrift {
      color: #e8a857;
  }
  .ship-log-adrift {
      color: #e8a857;
  }
  .ship-log-planned-hdr {
      font-style: italic;
      opacity: 0.7;
      margin-top: 0.35rem;
  }
  .seek-clock {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      vertical-align: middle;
      padding: 1px;
      margin-left: 2px;
      background: transparent;
      border: none;
      border-radius: 3px;
      color: var(--accent, #e8a857);
      opacity: 0.55;
      cursor: pointer;
      transition: opacity 0.12s ease, background 0.12s ease;
  }
  .seek-clock:hover {
      opacity: 1;
      background: var(--bg-control-hover, rgba(255, 255, 255, 0.08));
  }
</style>
