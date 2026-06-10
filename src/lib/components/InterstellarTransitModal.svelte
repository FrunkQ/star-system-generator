<script lang="ts">
  // Plan a star-to-star journey for a ship: pick a construct + destination system, choose one of four
  // travel models, and read back feasibility (red/yellow/green) plus crew-frame and outside-observer
  // times. Physics lives in $lib/interstellar/transit.
  import { createEventDispatcher } from 'svelte';
  import type { Starmap, RulePack, CelestialBody } from '$lib/types';
  import { calculateFullConstructSpecs } from '$lib/construct-logic';
  import { getAbsoluteOrbitalDistanceAU } from '$lib/system/utils';
  import { AU_KM, C_MS } from '$lib/constants';
  import {
    realisticTransit, masslessTransit, relativisticTransit, jumpTransit,
    distanceToMeters, formatDuration, type TransitMode, type TransitResult,
  } from '$lib/interstellar/transit';

  export let starmap: Starmap;
  export let rulePack: RulePack;
  export let initialShipId = ''; // preselect the ship when opened from a construct's transit planner

  const dispatch = createEventDispatcher();
  const AU_M = AU_KM * 1000;

  const MODES: { key: TransitMode; label: string; blurb: string }[] = [
    { key: 'realistic',    label: 'Realistic',     blurb: 'Rocket equation — fuel must escape the star and brake at the far end.' },
    { key: 'massless',     label: 'Massless fuel', blurb: 'Free, infinite propellant; the drive g-load and your chosen speed set the time.' },
    { key: 'relativistic', label: 'Relativistic',  blurb: 'Ignore the ship: instant accel to a chosen fraction of c, with time dilation.' },
    { key: 'jump',         label: 'Jump drive',    blurb: 'Abstract — just say how many days the jump takes.' },
  ];

  let mode: TransitMode = 'realistic';
  let shipId = initialShipId;
  let destId = '';
  let fuelFraction = 0.6;     // realistic: share of fuel for the outbound burn
  let speedSv = 0.45;         // massless/relativistic: log-slider position
  let jumpDays = 30;

  // log speed slider 0..1 → fraction of c (1e-4 .. 0.999)
  const F_MIN = 1e-4, F_MAX = 0.999;
  $: speedFrac = F_MIN * Math.pow(F_MAX / F_MIN, speedSv);

  function isStar(n: any) {
    return n?.roleHint === 'star' || (Array.isArray(n?.classes) && n.classes.some((c: string) => String(c).startsWith('star/')));
  }

  // Every construct across the whole map, tagged with its system.
  $: ships = (starmap?.systems || []).flatMap((sysNode) =>
    (sysNode.system?.nodes || [])
      .filter((n) => n.kind === 'construct')
      .map((c) => ({ construct: c as CelestialBody, sysNode })));
  $: if (!shipId && ships.length) shipId = ships[0].construct.id;

  $: shipEntry = ships.find((s) => s.construct.id === shipId) || null;
  $: shipSystemNode = shipEntry?.sysNode || null;
  $: destOptions = (starmap?.systems || []).filter((s) => s.id !== shipSystemNode?.id);
  $: if ((!destId || !destOptions.some((d) => d.id === destId)) && destOptions.length) destId = destOptions[0].id;
  $: destNode = (starmap?.systems || []).find((s) => s.id === destId) || null;

  $: specs = (() => {
    if (!shipEntry) return null;
    try {
      const sys = shipEntry.sysNode.system;
      const host = shipEntry.construct.parentId ? sys.nodes.find((n) => n.id === shipEntry.construct.parentId) || null : null;
      return calculateFullConstructSpecs(shipEntry.construct, rulePack.engineDefinitions?.entries || [], rulePack.fuelDefinitions?.entries || [], host as any);
    } catch { return null; }
  })();

  $: primaryStar = (shipSystemNode?.system?.nodes || []).filter(isStar).sort((a: any, b: any) => (b.massKg || 0) - (a.massKg || 0))[0] || null;
  $: orbitRadius_m = (() => {
    if (!shipEntry) return AU_M;
    const au = getAbsoluteOrbitalDistanceAU(shipEntry.construct as any, shipEntry.sysNode.system);
    return (au && au > 0 ? au : 1) * AU_M;
  })();

  // Straight-line distance between the two systems, using the starmap scale.
  $: distanceInfo = (() => {
    if (!shipSystemNode || !destNode) return null;
    const dx = (shipSystemNode.position?.x ?? 0) - (destNode.position?.x ?? 0);
    const dy = (shipSystemNode.position?.y ?? 0) - (destNode.position?.y ?? 0);
    const px = Math.hypot(dx, dy);
    const unit = starmap.scale?.unit || starmap.distanceUnit || 'LY';
    const perUnit = starmap.scale?.pixelsPerUnit || 1;
    const value = px / perUnit;
    return { value, unit, meters: distanceToMeters(value, unit) };
  })();

  $: result = ((): TransitResult | null => {
    if (!distanceInfo) return null;
    const d = distanceInfo.meters;
    if (mode === 'realistic') {
      if (!specs) return null;
      return realisticTransit({
        avgIsp_s: specs.avgVacIsp || 0,
        dryMassKg: (specs.dryMass_tonnes || 0) * 1000,
        fuelMassKg: (specs.fuelMass_tonnes || 0) * 1000,
        fuelFraction,
        starMassKg: (primaryStar as any)?.massKg || 0,
        orbitRadius_m,
        distance_m: d,
      });
    }
    if (mode === 'massless') return masslessTransit(((specs?.maxVacuumG || 0) * 9.80665) || 9.80665, speedFrac, d);
    if (mode === 'relativistic') return relativisticTransit(speedFrac, d);
    return jumpTransit(jumpDays, d);
  })();

  $: statusColor = result?.status === 'green' ? '#46c46a' : result?.status === 'yellow' ? '#e8b341' : '#e0484d';
  $: shipDv = specs ? (specs.totalVacuumDeltaV_ms || 0) : 0;
</script>

<div class="modal-background" on:click={() => dispatch('close')}>
  <div class="modal" on:click|stopPropagation>
    <h2>Interstellar Transit</h2>

    {#if ships.length === 0}
      <p class="empty">No ships (constructs) on the map yet. Add a construct to a system first.</p>
    {:else}
      <div class="row">
        <label class="field">
          <span>Ship</span>
          <select bind:value={shipId}>
            {#each ships as s (s.construct.id)}
              <option value={s.construct.id}>{s.construct.name} — {s.sysNode.name}</option>
            {/each}
          </select>
        </label>
        <label class="field">
          <span>Destination</span>
          <select bind:value={destId}>
            {#each destOptions as d (d.id)}
              <option value={d.id}>{d.name}</option>
            {/each}
          </select>
        </label>
      </div>

      {#if distanceInfo}
        <p class="distance">Distance: <strong>{distanceInfo.value.toFixed(2)} {distanceInfo.unit}</strong></p>
      {:else}
        <p class="distance">Pick a different destination system.</p>
      {/if}

      <div class="modes">
        {#each MODES as m}
          <button class="mode" class:active={mode === m.key} on:click={() => (mode = m.key)} title={m.blurb}>{m.label}</button>
        {/each}
      </div>
      <p class="blurb">{MODES.find((m) => m.key === mode)?.blurb}</p>

      <!-- Mode controls -->
      <div class="controls">
        {#if mode === 'realistic'}
          <label class="slider">
            <span>Fuel committed to the outbound burn: <strong>{Math.round(fuelFraction * 100)}%</strong></span>
            <input type="range" min="0" max="1" step="0.01" bind:value={fuelFraction} />
            <span class="hint">More fuel out = faster, but leaves less to brake. Ship Δv (full tank): {(shipDv / 1000).toFixed(1)} km/s</span>
          </label>
        {:else if mode === 'massless' || mode === 'relativistic'}
          <label class="slider">
            <span>Cruise speed: <strong>{speedFrac >= 0.01 ? (speedFrac * 100).toFixed(1) : (speedFrac * 100).toPrecision(2)}% c</strong></span>
            <input type="range" min="0" max="1" step="0.001" bind:value={speedSv} />
            <span class="hint">{(speedFrac * C_MS / 1000).toLocaleString(undefined, { maximumFractionDigits: 0 })} km/s</span>
          </label>
        {:else}
          <label class="slider">
            <span>Jump duration: <strong>{jumpDays} days</strong></span>
            <input type="range" min="1" max="365" step="1" bind:value={jumpDays} />
          </label>
        {/if}
      </div>

      <!-- Result -->
      {#if result}
        <div class="result" style="border-color:{statusColor}">
          <div class="result-head">
            <span class="dot" style="background:{statusColor}"></span>
            <strong>{result.headline}</strong>
          </div>
          <div class="times">
            <div><span class="k">Crew time</span><span class="v">{formatDuration(result.shipSeconds)}</span></div>
            <div><span class="k">Observer time</span><span class="v">{formatDuration(result.observerSeconds)}</span></div>
            <div><span class="k">Cruise</span><span class="v">{result.cruise_ms > 0 ? (result.fractionC >= 0.01 ? (result.fractionC * 100).toFixed(1) + '% c' : (result.cruise_ms / 1000).toFixed(0) + ' km/s') : '—'}</span></div>
            {#if result.gamma > 1.01 && Number.isFinite(result.gamma)}<div><span class="k">Dilation</span><span class="v">×{result.gamma.toFixed(2)}</span></div>{/if}
          </div>
          <p class="detail">{result.detail}</p>
        </div>
      {/if}
    {/if}

    <div class="buttons">
      <button on:click={() => dispatch('close')}>Close</button>
    </div>
  </div>
</div>

<style>
  .modal-background { position: fixed; inset: 0; background: rgba(0,0,0,0.7); display: flex; justify-content: center; align-items: center; z-index: 2000; }
  .modal { background: var(--bg-panel); color: var(--text); padding: 1.6rem; border-radius: 8px; width: 540px; max-width: 94vw; max-height: 92vh; overflow-y: auto; display: flex; flex-direction: column; gap: 1rem; }
  h2 { margin: 0; border-bottom: 1px solid var(--border); padding-bottom: 0.5rem; }
  .empty { color: var(--text-muted); }
  .row { display: flex; gap: 1rem; flex-wrap: wrap; }
  .field { flex: 1; min-width: 200px; display: flex; flex-direction: column; gap: 0.3rem; font-size: 0.85rem; color: var(--text-muted); }
  select, input[type="range"] { width: 100%; }
  select { padding: 0.4em; background: var(--bg-control); color: var(--text); border: 1px solid var(--border); border-radius: 4px; }
  .distance { margin: 0; font-size: 0.9rem; color: var(--text-muted); }
  .distance strong { color: var(--text); }
  .modes { display: flex; gap: 0.4rem; flex-wrap: wrap; }
  .mode { flex: 1; min-width: 110px; padding: 0.5em; background: var(--bg-control); color: var(--text); border: 1px solid transparent; border-radius: 4px; cursor: pointer; font: inherit; }
  .mode.active { border-color: var(--accent); }
  .blurb { margin: 0; font-size: 0.78rem; color: var(--text-muted); }
  .controls { background: var(--bg-control); border-radius: 6px; padding: 0.8rem; }
  .slider { display: flex; flex-direction: column; gap: 0.4rem; font-size: 0.85rem; }
  .slider .hint { font-size: 0.72rem; color: var(--text-muted); }
  .result { border: 1px solid; border-radius: 8px; padding: 0.9rem 1rem; display: flex; flex-direction: column; gap: 0.6rem; }
  .result-head { display: flex; align-items: center; gap: 0.5rem; font-size: 1rem; }
  .dot { width: 12px; height: 12px; border-radius: 50%; flex: 0 0 auto; }
  .times { display: grid; grid-template-columns: repeat(auto-fit, minmax(110px, 1fr)); gap: 0.6rem; }
  .times .k { display: block; font-size: 0.7rem; text-transform: uppercase; letter-spacing: 0.05em; color: var(--text-muted); }
  .times .v { display: block; font-size: 1.05rem; font-weight: 700; }
  .detail { margin: 0; font-size: 0.82rem; color: var(--text-muted); line-height: 1.5; }
  .buttons { display: flex; justify-content: flex-end; }
  .buttons button { padding: 8px 16px; cursor: pointer; border-radius: 4px; border: none; background: var(--bg-control); color: var(--text); }
</style>
