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
  import { cargoAboardAt, fuelKgAt, computeAutopilotTotals } from '$lib/transit/autopilotPlanner';
  import { calculateFullConstructSpecs } from '$lib/construct-logic';
  import AutopilotShipIcon from './AutopilotShipIcon.svelte';

  export let focusedBody: CelestialBody;
  export let rulePack: any = null;
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

  // Flight log: the stop-work breadcrumbs (load/unload/mine/refuel/loiter) the journeys don't show, time-
  // sorted. Cargo aboard at the display moment is DERIVED from it (no stored cargo state to drift).
  const KIND_GLYPH: Record<string, string> = {
      load: '▲', unload: '▼', mine: '⛏', refuel: '⛽', loiter: '◷', stuck: '!', disengage: '✕', depart: '→', arrive: '⇲'
  };
  $: flightLog = [...(focusedBody.flight_log || [])].sort((a, b) => Number(a.atSec) - Number(b.atSec));
  $: cargoAboard = Number.isFinite(displayTimeMs) ? cargoAboardAt(focusedBody.flight_log, Math.floor(displayTimeMs / 1000), focusedBody.current_cargo_tonnes || 0) : 0;
  // Fuel % at the display moment — derived from the burn segments + refuel events (see fuelKgAt). Needs the
  // rulepack to size the tanks; null when unavailable so the read-out simply hides.
  $: fuelSpecs = (rulePack?.engineDefinitions && rulePack?.fuelDefinitions && focusedBody.kind === 'construct')
      ? calculateFullConstructSpecs(focusedBody, rulePack.engineDefinitions.entries, rulePack.fuelDefinitions.entries, null) : null;
  $: fuelCapKg = fuelSpecs ? (fuelSpecs.fuelCapacity_tonnes || 0) * 1000 : 0;
  $: startFuelKg = fuelSpecs ? Math.max(0, ((fuelSpecs.totalMass_tonnes || 0) - (fuelSpecs.dryMass_tonnes || 0)) * 1000) : 0;
  $: fuelPct = (fuelCapKg > 0 && Number.isFinite(displayTimeMs))
      ? Math.round(100 * fuelKgAt(focusedBody.scheduled_journeys, focusedBody.flight_log, fuelCapKg, startFuelKg, Math.floor(displayTimeMs / 1000)) / fuelCapKg)
      : null;
  // Totals / averages, aggregated from the flight log up to the display moment (spec §7).
  $: totals = Number.isFinite(displayTimeMs) ? computeAutopilotTotals(focusedBody.flight_log, Math.floor(displayTimeMs / 1000)) : null;
  const fmtT = (t: number) => t >= 1000 ? `${(t / 1000).toFixed(1)} kt` : `${Math.round(t)} t`;
  const resLabel = (k?: string) => (k ? k.replace(/^resource\//, '').replace(/-/g, ' ') : '');

  // A flight-log entry rendered AGAINST the display clock: a transfer in progress shows how far through it is
  // (and its window gives the ETA); before it's a plan, after it's done. Instant events read the same always.
  function liveEventText(ev: any, displaySec: number): string {
    const place = nodeName(ev.placeId);
    const res = resLabel(ev.resourceKey);
    const total = ev.tonnes || 0;
    const start = Number(ev.atSec);
    const dur = ev.durationSec || 0;
    const future = Number.isFinite(displaySec) && displaySec < start;
    const active = dur > 0 && Number.isFinite(displaySec) && displaySec >= start && displaySec < start + dur;
    const frac = !Number.isFinite(displaySec) ? 1 : dur > 0 ? Math.min(1, Math.max(0, (displaySec - start) / dur)) : (future ? 0 : 1);
    if (ev.kind === 'mine' || ev.kind === 'load' || ev.kind === 'unload') {
      const what = res || (ev.kind === 'mine' ? 'ore' : 'cargo');
      const ing = ev.kind === 'mine' ? 'Mining' : ev.kind === 'load' ? 'Loading' : 'Unloading';
      const ed = ev.kind === 'mine' ? 'Mined' : ev.kind === 'load' ? 'Loaded' : 'Unloaded';
      if (future) return `${ing} ${fmtT(total)} ${what} at ${place} (planned)`;
      if (active) return `${ing} ${fmtT(total * frac)} / ${fmtT(total)} ${what} at ${place} — ${Math.round(frac * 100)}%`;
      return `${ed} ${fmtT(total)} ${what} at ${place}`;
    }
    if (ev.kind === 'refuel') {
      if (future) return `Refuel${res ? ` (${res})` : ''} at ${place} (planned)`;
      if (active) return `Refuelling${res ? ` (${res})` : ''} at ${place} — ${Math.round(frac * 100)}%`;
      return `Refuelled${res ? ` (${res})` : ''} at ${place}`;
    }
    if (ev.kind === 'loiter') return future ? `Hold at ${place} (planned)` : `Held station at ${place}`;
    return ev.text || ev.kind;
  }

  // The log reads like an itinerary. DEFAULT: what's happening + what's coming, soonest-first (current at the
  // top, furthest-planned at the bottom), each journey's work events under it; then a small "recent history" of
  // the last 2 finished journeys (most-recent first); then a "Show full history" button. FULL HISTORY: every
  // trip, most-recent at the top (reverse-chrono). The flight log is kept forever, so history can reach back
  // past the journey paths the trim has dropped.
  let showAll = false;
  $: journeys = focusedBody.scheduled_journeys || [];
  $: nowSec = Number.isFinite(displayTimeMs) ? displayTimeMs / 1000 : Number.POSITIVE_INFINITY;
  $: allItems = (() => {
    const items: any[] = [];
    journeys.forEach((log: any, idx: number) => {
      const b = getJourneyBounds(log.plans);
      const start = b ? b.startMs / 1000 : Number(log.createdAtSec || 0);
      items.push({ type: 'journey', key: 'j' + log.id, atSec: start, endSec: b ? b.endMs / 1000 : start, log, idx });
    });
    for (const ev of (focusedBody.flight_log || [])) {
      const s = Number(ev.atSec);
      items.push({ type: 'event', key: 'e' + ev.id, atSec: s, endSec: s + (ev.durationSec || 0), ev });
    }
    return items;
  })();
  // Not-yet-finished (active + planned), soonest first → current at top, future downward.
  $: futureItems = allItems.filter((it) => it.endSec >= nowSec).sort((a, b) => a.atSec - b.atSec);
  // Finished, newest first; default keeps only the last 2 journeys' worth.
  $: pastItems = allItems.filter((it) => it.endSec < nowSec).sort((a, b) => b.atSec - a.atSec);
  $: pastJourneyStarts = pastItems.filter((it) => it.type === 'journey').map((it) => it.atSec);
  $: pastCutoff = pastJourneyStarts.length >= 2 ? pastJourneyStarts[1] : Number.NEGATIVE_INFINITY;
  $: recentPast = pastItems.filter((it) => it.atSec >= pastCutoff);
  $: hasOlderHistory = pastItems.length > recentPast.length;
  $: allReverse = [...allItems].sort((a, b) => b.atSec - a.atSec);
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

<!-- One log entry — a journey block or a flight-log work-event row. Shared across the planned, recent-history
     and full-history lists so they all render identically. -->
{#snippet logEntry(item)}
  {#if item.type === 'journey'}
    {@const log = item.log}
    {@const i = item.idx}
    {@const createdMs = safeClockSecStringToMs(log.createdAtSec)}
    {@const bounds = getJourneyBounds(log.plans)}
    {@const dynStatus = dynamicStatus(log, bounds)}
    {@const adriftNow = dynStatus === 'ADRIFT · COASTING'}
    {@const prevLog = journeys[i - 1]}
    {@const startedAdrift = i > 0 && prevLog && prevLog.status === 'cancelled' && prevLog.cancelState && prevLog.cancelledAtSec}
    {@const driftFromMs = startedAdrift ? safeClockSecStringToMs(prevLog.cancelledAtSec) : 0}
    <div class="ship-log-entry">
      <div class="ship-log-title">
        <strong>Journey {i + 1}</strong>
        {#if log.autopilot}<span class="ship-log-auto" title="Planned and flown by autopilot"><AutopilotShipIcon size={11} /> autopilot</span>{/if}
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
  {:else}
    {@const ev = item.ev}
    {@const evMs = safeClockSecStringToMs(ev.atSec)}
    {@const endMs = evMs + (ev.durationSec ? ev.durationSec * 1000 : 0)}
    {@const future = Number.isFinite(displayTimeMs) && evMs > displayTimeMs}
    {@const active = ev.durationSec && Number.isFinite(displayTimeMs) && evMs <= displayTimeMs && displayTimeMs < endMs}
    <div class="flight-log-row" class:future class:active>
      <span class="fl-kind fl-{ev.kind}">{KIND_GLYPH[ev.kind] || '·'}</span>
      <span class="fl-text">{liveEventText(ev, Math.floor(displayTimeMs / 1000))}</span>
      <span class="fl-time">{#if active}done {formatLogTime(endMs)} {@render seekClock(endMs)}{:else}{formatLogTime(evMs)} {@render seekClock(evMs)}{/if}</span>
    </div>
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
  {#if Number.isFinite(displayTimeMs) && (focusedBody.flight_log || []).length}
    <div class="now-stats-bar">
      {#if fuelPct !== null}<span class="fuel-now" class:low={fuelPct <= 15} title="Fuel at the display time, derived from burns + refuels">Fuel: {fuelPct}%</span>{/if}
      <span class="cargo-now" title="Cargo aboard at the display time, derived from the log">Cargo: {Math.round(cargoAboard)} t</span>
    </div>
  {/if}

  {#if futureItems.length === 0 && pastItems.length === 0}
    <div class="ship-log-empty">Nothing logged yet.</div>
  {:else if showAll}
    <!-- Full history: every trip, most-recent at the top. -->
    <div class="timeline">
      {#each allReverse as item (item.key)}{@render logEntry(item)}{/each}
    </div>
    <button class="history-toggle" type="button" on:click={() => (showAll = false)}>Hide full history</button>
  {:else}
    <!-- What's happening + what's coming, soonest first (current at top, future downward). -->
    <div class="timeline">
      {#each futureItems as item (item.key)}{@render logEntry(item)}{/each}
    </div>
    {#if recentPast.length}
      <div class="history-divider">Recent history</div>
      <div class="timeline">
        {#each recentPast as item (item.key)}{@render logEntry(item)}{/each}
      </div>
    {/if}
    {#if hasOlderHistory}
      <button class="history-toggle" type="button" on:click={() => (showAll = true)}>Show full history</button>
    {/if}
  {/if}

  {#if (futureItems.length || pastItems.length)}

    {#if totals && (totals.deliveredTotal_t > 0 || totals.gatheredTotal_t > 0 || totals.refuels > 0)}
      <details class="totals">
        <summary>Totals &amp; averages</summary>
        <div class="totals-grid">
          <span class="tl-key">Delivered</span><span class="tl-val">{fmtT(totals.deliveredTotal_t)}</span>
          <span class="tl-key">Efficiency</span><span class="tl-val">{fmtT(totals.tonnesPerAnnum)}/yr</span>
          <span class="tl-key">Gathered</span><span class="tl-val">{fmtT(totals.gatheredTotal_t)}</span>
          <span class="tl-key">Refuels</span><span class="tl-val">{totals.refuels}</span>
          <span class="tl-key">Stops worked</span><span class="tl-val">{totals.stopsWorked}</span>
          <span class="tl-key">Over</span><span class="tl-val">{Math.round(totals.spanDays)} days</span>
        </div>
        {#if Object.keys(totals.delivered).length}
          <div class="totals-by">{#each Object.entries(totals.delivered) as [res, t]}<span class="tl-chip">{fmtT(t as number)} {res.replace(/-/g, ' ')}</span>{/each}</div>
        {/if}
      </details>
    {/if}
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
  .flight-log {
      border: 1px solid var(--border);
      border-radius: 5px;
      background: #181818;
      padding: 0.6em;
      display: flex;
      flex-direction: column;
      gap: 0.3em;
  }
  .flight-log-hdr {
      display: flex;
      align-items: baseline;
      justify-content: space-between;
      gap: 0.6em;
      color: #ffb088;
      margin-bottom: 0.2em;
  }
  .now-stats { display: inline-flex; gap: 0.7em; align-items: baseline; }
  .now-stats-bar { display: flex; gap: 1.1em; align-items: baseline; padding: 0.1em 0.1em 0.4em; border-bottom: 1px solid var(--border); }
  .timeline { display: flex; flex-direction: column; gap: 0.5em; }
  .history-toggle { align-self: center; background: var(--bg-control); color: var(--text-muted); border: 1px solid var(--border); border-radius: 4px; padding: 0.3em 0.9em; cursor: pointer; font-size: 0.82em; }
  .history-toggle:hover { color: var(--text); border-color: var(--accent); }
  .history-divider { display: flex; align-items: center; gap: 0.6em; color: var(--text-muted); font-size: 0.78em; text-transform: uppercase; letter-spacing: 0.05em; margin: 0.3em 0 0.1em; }
  .history-divider::before, .history-divider::after { content: ''; flex: 1; height: 1px; background: var(--border); }
  .cargo-now {
      color: #8fcf9f;
      font-size: 0.82em;
      font-weight: 600;
  }
  .fuel-now { color: #6fb6ff; font-size: 0.82em; font-weight: 600; }
  .fuel-now.low { color: #e8714f; }
  .totals { margin-top: 0.5em; border-top: 1px solid var(--border); padding-top: 0.4em; }
  .totals > summary { cursor: pointer; color: #ffb088; font-size: 0.85em; font-weight: 600; user-select: none; }
  .totals-grid { display: grid; grid-template-columns: auto 1fr; gap: 0.15em 0.8em; margin-top: 0.4em; font-size: 0.85em; }
  .tl-key { color: var(--text-muted); }
  .tl-val { color: var(--text); font-weight: 600; }
  .totals-by { display: flex; flex-wrap: wrap; gap: 0.35em; margin-top: 0.5em; }
  .tl-chip { background: var(--bg-control); border: 1px solid var(--border); border-radius: 999px; padding: 1px 8px; font-size: 0.78em; color: #8fcf9f; }
  .flight-log-row {
      display: grid;
      grid-template-columns: 1.2em 1fr auto;
      align-items: baseline;
      gap: 0.5em;
      font-size: 0.85em;
      color: var(--text);
  }
  .flight-log-row.future {
      opacity: 0.5;
  }
  .flight-log-row.active .fl-text { color: #ffcf8f; font-weight: 600; } /* a transfer underway right now */
  .fl-kind {
      text-align: center;
      color: var(--text-muted);
  }
  .fl-load, .fl-mine { color: #8fcf9f; }
  .fl-unload { color: #e8a857; }
  .fl-refuel { color: #6fb6ff; }
  .fl-time {
      color: var(--text-muted);
      font-size: 0.92em;
      white-space: nowrap;
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
