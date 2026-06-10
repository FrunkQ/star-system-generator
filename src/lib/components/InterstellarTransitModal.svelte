<script lang="ts">
  // Plan a star-to-star journey for a ship. The ship is fixed (opened from that ship); the GM picks
  // a destination star system AND a body within it, chooses a travel model, reads back feasibility +
  // crew-frame/observer times, then either cancels or starts the journey (which drops a moving ship
  // marker onto the starmap). Physics lives in $lib/interstellar/transit.
  import { createEventDispatcher } from 'svelte';
  import type { Starmap, RulePack, CelestialBody } from '$lib/types';
  import { calculateFullConstructSpecs } from '$lib/construct-logic';
  import { getAbsoluteOrbitalDistanceAU } from '$lib/system/utils';
  import { AU_KM, C_MS } from '$lib/constants';
  import {
    realisticTransit, masslessTransit, relativisticTransit, jumpTransit,
    distanceToMeters, formatDuration, crewLoad, kineticEnergyJoules, massEnergyEquivalent, fmtFractionC,
    type TransitMode, type TransitResult,
  } from '$lib/interstellar/transit';

  export let starmap: Starmap;
  export let rulePack: RulePack;
  export let initialShipId = ''; // the ship this planner was opened from

  const dispatch = createEventDispatcher();
  const AU_M = AU_KM * 1000;
  const G0 = 9.80665;

  const MODES: { key: TransitMode; label: string; blurb: string; physical: boolean }[] = [
    { key: 'realistic',    label: 'Realistic',     blurb: 'Rocket equation — fuel must escape the star and brake at the far end.', physical: true },
    { key: 'massless',     label: 'Massless fuel', blurb: 'Free propellant; pick the burn g-load. Constant-g flip-and-burn — no cruise.', physical: true },
    { key: 'relativistic', label: 'Relativistic',  blurb: 'Ignore the ship: instant accel to a chosen fraction of c, with time dilation.', physical: true },
    { key: 'jump',         label: 'Jump drive',    blurb: 'Abstract — just say how many days the jump takes. Works on any map.', physical: false },
  ];

  // On a diagrammatic (unscaled) map there is no real distance, so the physical models can't produce
  // meaningful times — only the abstract Jump drive works.
  $: isDiagrammatic = (starmap.mapMode ?? 'diagrammatic') === 'diagrammatic';
  $: if (isDiagrammatic && mode !== 'jump') mode = 'jump';

  let mode: TransitMode = 'realistic';
  let fuelFraction = 0.6;     // realistic: share of fuel for the outbound burn
  let gForce = 1;            // realistic/massless: sustained burn acceleration, in g
  let speedSv = 0.55;         // relativistic: double-log slider position
  let jumpDays = 30;

  $: accel_ms2 = gForce * G0;
  $: crew = crewLoad(accel_ms2);
  $: crewColor = crew.status === 'green' ? '#46c46a' : crew.status === 'yellow' ? '#e8b341' : '#e0484d';

  // Double-log speed slider: log resolution below 0.5c, and log-of-(1−β) above it so the top end
  // reaches 99.999% c with fine control near the wall.
  const F_LO = 1e-4, MID = 0.5, GAP_MIN = 1e-5;
  $: speedFrac = speedSv <= 0.5
    ? F_LO * Math.pow(MID / F_LO, speedSv / 0.5)
    : 1 - MID * Math.pow(GAP_MIN / MID, (speedSv - 0.5) / 0.5);
  const fmtPctC = fmtFractionC;

  function isStar(n: any) {
    return n?.roleHint === 'star' || (Array.isArray(n?.classes) && n.classes.some((c: string) => String(c).startsWith('star/')));
  }

  // The ship is fixed (opened from it). Fall back to the first construct on the map if none was passed.
  $: ships = (starmap?.systems || []).flatMap((sysNode) =>
    (sysNode.system?.nodes || [])
      .filter((n) => n.kind === 'construct')
      .map((c) => ({ construct: c as CelestialBody, sysNode })));
  let shipId = '';
  $: shipId = initialShipId || (ships[0]?.construct.id ?? '');
  $: shipEntry = ships.find((s) => s.construct.id === shipId) || null;
  $: shipSystemNode = shipEntry?.sysNode || null;

  // Destination is two-fold: a star system, then a body within it (the final destination).
  $: destOptions = (starmap?.systems || []).filter((s) => s.id !== shipSystemNode?.id);
  let destId = '';
  $: if ((!destId || !destOptions.some((d) => d.id === destId)) && destOptions.length) destId = destOptions[0].id;
  $: destNode = (starmap?.systems || []).find((s) => s.id === destId) || null;

  // Bodies in the destination system, ordered star → its orbiters, for the object picker.
  $: destBodies = (() => {
    const nodes = (destNode?.system?.nodes || []).filter((n) => n.kind === 'body' || n.kind === 'construct') as CelestialBody[];
    const stars = nodes.filter(isStar).sort((a: any, b: any) => (b.massKg || 0) - (a.massKg || 0));
    const others = nodes.filter((n) => !isStar(n)).sort((a, b) => (a.orbit?.elements?.a_AU || 0) - (b.orbit?.elements?.a_AU || 0));
    return [...stars, ...others];
  })();
  let destBodyId = '';
  $: if ((!destBodyId || !destBodies.some((b) => b.id === destBodyId)) && destBodies.length) destBodyId = destBodies[0].id;
  $: destBody = destBodies.find((b) => b.id === destBodyId) || null;
  const bodyLabel = (b: CelestialBody) => `${isStar(b) ? '★ ' : b.roleHint === 'moon' ? '   ○ ' : b.kind === 'construct' ? '   ◆ ' : '  ● '}${b.name}`;

  $: specs = (() => {
    if (!shipEntry) return null;
    try {
      const sys = shipEntry.sysNode.system;
      const host = shipEntry.construct.parentId ? sys.nodes.find((n) => n.id === shipEntry.construct.parentId) || null : null;
      return calculateFullConstructSpecs(shipEntry.construct, rulePack.engineDefinitions?.entries || [], rulePack.fuelDefinitions?.entries || [], host as any);
    } catch { return null; }
  })();
  // Wet mass for the relativistic energy readout.
  $: shipMassKg = specs ? ((specs.dryMass_tonnes || 0) + (specs.fuelMass_tonnes || 0)) * 1000 : 0;

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
    if (mode === 'jump') return jumpTransit(jumpDays, distanceInfo?.meters || 0);
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
        accel_ms2,
      });
    }
    if (mode === 'massless') return masslessTransit(accel_ms2, d);
    return relativisticTransit(speedFrac, d);
  })();

  $: statusColor = result?.status === 'green' ? '#46c46a' : result?.status === 'yellow' ? '#e8b341' : '#e0484d';
  $: shipDv = specs ? (specs.totalVacuumDeltaV_ms || 0) : 0;
  // The relativistic energy bill to reach the chosen speed for THIS ship.
  $: relEnergyJ = mode === 'relativistic' && shipMassKg > 0 ? kineticEnergyJoules(shipMassKg, speedFrac) : 0;

  // Start Journey is allowed whenever the journey actually arrives (finite observer time).
  $: canStart = !!(result && Number.isFinite(result.observerSeconds) && result.observerSeconds >= 0 && shipEntry && destNode);

  function startJourney() {
    if (!canStart || !shipEntry || !destNode || !result) return;
    dispatch('startjourney', {
      shipId,
      shipName: shipEntry.construct.name,
      fromSystemId: shipSystemNode!.id,
      toSystemId: destNode.id,
      toBodyId: destBodyId || null,
      toBodyName: destBody?.name || destNode.name,
      mode,
      observerSeconds: result.observerSeconds,
      shipSeconds: result.shipSeconds,
      headline: result.headline,
    });
  }
</script>

<div class="modal-background" on:click={() => dispatch('close')}>
  <div class="modal" on:click|stopPropagation>
    <h2>Interstellar Transit</h2>

    {#if ships.length === 0}
      <p class="empty">No ships (constructs) on the map yet. Add a construct to a system first.</p>
    {:else if !shipEntry}
      <p class="empty">That ship is no longer on the map.</p>
    {:else}
      <!-- Ship is fixed (opened from it) -->
      <p class="ship-line">Ship: <strong>{shipEntry.construct.name}</strong> <span class="muted">— currently at {shipSystemNode?.name}</span></p>

      <!-- Two-fold destination: system, then a body within it -->
      <div class="row">
        <label class="field">
          <span>Destination system</span>
          <select bind:value={destId}>
            {#each destOptions as d (d.id)}<option value={d.id}>{d.name}</option>{/each}
          </select>
        </label>
        <label class="field">
          <span>Destination body</span>
          <select bind:value={destBodyId}>
            {#each destBodies as b (b.id)}<option value={b.id}>{bodyLabel(b)}</option>{/each}
          </select>
        </label>
      </div>

      {#if distanceInfo}
        <p class="distance">Distance: <strong>{distanceInfo.value.toFixed(2)} {distanceInfo.unit}</strong>{#if destBody} → final approach to <strong>{destBody.name}</strong>{/if}</p>
      {:else}
        <p class="distance">Pick a different destination system.</p>
      {/if}

      <div class="modes">
        {#each MODES as m}
          {@const disabled = isDiagrammatic && m.physical}
          <button class="mode" class:active={mode === m.key} {disabled}
            on:click={() => { if (!disabled) mode = m.key; }}
            title={disabled ? 'Needs a scaled (ly/pc) map — this map is diagrammatic.' : m.blurb}>{m.label}</button>
        {/each}
      </div>
      {#if isDiagrammatic}
        <p class="blurb warn">This is a diagrammatic (unscaled) map, so only the Jump drive is available. Switch to a Light-Years or Parsecs map for the physical models.</p>
      {:else}
        <p class="blurb">{MODES.find((m) => m.key === mode)?.blurb}</p>
      {/if}

      <!-- Mode controls -->
      <div class="controls">
        {#if mode === 'realistic'}
          <label class="slider">
            <span>Fuel committed to the outbound burn: <strong>{Math.round(fuelFraction * 100)}%</strong></span>
            <input type="range" min="0" max="1" step="0.01" bind:value={fuelFraction} />
            <span class="hint">More fuel out = faster, but leaves less to brake. Ship Δv (full tank): {(shipDv / 1000).toFixed(1)} km/s</span>
          </label>
          <label class="slider">
            <span>Burn acceleration: <strong style="color:{crewColor}">{gForce.toFixed(1)} g</strong></span>
            <input type="range" min="0.1" max="15" step="0.1" bind:value={gForce} />
            <span class="hint" style="color:{crewColor}">{crew.note}</span>
          </label>
        {:else if mode === 'massless'}
          <label class="slider">
            <span>Burn acceleration: <strong style="color:{crewColor}">{gForce.toFixed(1)} g</strong></span>
            <input type="range" min="0.1" max="15" step="0.1" bind:value={gForce} />
            <span class="hint" style="color:{crewColor}">{crew.note}</span>
          </label>
        {:else if mode === 'relativistic'}
          <label class="slider">
            <span>Cruise speed: <strong>{fmtPctC(speedFrac)}</strong></span>
            <input type="range" min="0" max="1" step="0.001" bind:value={speedSv} />
            <span class="hint">{(speedFrac * C_MS / 1000).toLocaleString(undefined, { maximumFractionDigits: 0 })} km/s · slider is log near 0 and near c (reaches 99.999%).</span>
          </label>
          {#if relEnergyJ > 0}
            <p class="energy">Kinetic energy to reach {fmtPctC(speedFrac)} for this ship ({(shipMassKg / 1000).toLocaleString(undefined, { maximumFractionDigits: 0 })} t): <strong>{relEnergyJ.toExponential(2)} J</strong> — equivalent to converting <strong>{massEnergyEquivalent(relEnergyJ)}</strong> entirely to energy.</p>
          {/if}
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
            <div><span class="k">{mode === 'massless' ? 'Peak speed' : 'Cruise'}</span><span class="v">{result.cruise_ms > 0 ? (result.fractionC >= 0.01 ? fmtFractionC(result.fractionC) : (result.cruise_ms / 1000).toFixed(0) + ' km/s') : '—'}</span></div>
            {#if result.gamma > 1.01 && Number.isFinite(result.gamma)}<div><span class="k">Dilation</span><span class="v">×{result.gamma.toFixed(2)}</span></div>{/if}
          </div>
          <p class="detail">{result.detail}</p>
        </div>
      {/if}
    {/if}

    <div class="buttons">
      <button on:click={() => dispatch('close')}>Cancel</button>
      <button class="primary" disabled={!canStart} on:click={startJourney} title={canStart ? 'Begin this journey — the ship appears on the starmap' : 'This journey does not arrive — adjust the plan'}>Start Journey</button>
    </div>
  </div>
</div>

<style>
  .modal-background { position: fixed; inset: 0; background: rgba(0,0,0,0.7); display: flex; justify-content: center; align-items: center; z-index: 2000; }
  .modal { background: var(--bg-panel); color: var(--text); padding: 1.6rem; border-radius: 8px; width: 540px; max-width: 94vw; max-height: 92vh; overflow-y: auto; display: flex; flex-direction: column; gap: 1rem; box-sizing: border-box; }
  h2 { margin: 0; border-bottom: 1px solid var(--border); padding-bottom: 0.5rem; }
  .empty { color: var(--text-muted); }
  .ship-line { margin: 0; font-size: 0.95rem; }
  .ship-line .muted { color: var(--text-muted); font-size: 0.85rem; }
  .row { display: flex; gap: 1rem; flex-wrap: wrap; }
  .field { flex: 1; min-width: 200px; display: flex; flex-direction: column; gap: 0.3rem; font-size: 0.85rem; color: var(--text-muted); }
  select, input[type="range"] { width: 100%; box-sizing: border-box; }
  select { padding: 0.4em; background: var(--bg-control); color: var(--text); border: 1px solid var(--border); border-radius: 4px; }
  .distance { margin: 0; font-size: 0.9rem; color: var(--text-muted); }
  .distance strong { color: var(--text); }
  .modes { display: flex; gap: 0.4rem; flex-wrap: wrap; }
  .mode { flex: 1; min-width: 110px; padding: 0.5em; background: var(--bg-control); color: var(--text); border: 1px solid transparent; border-radius: 4px; cursor: pointer; font: inherit; }
  .mode.active { border-color: var(--accent); }
  .mode:disabled { opacity: 0.4; cursor: not-allowed; }
  .blurb { margin: 0; font-size: 0.78rem; color: var(--text-muted); }
  .blurb.warn { color: #e8b341; }
  .controls { background: var(--bg-control); border-radius: 6px; padding: 0.8rem; display: flex; flex-direction: column; gap: 0.9rem; }
  .slider { display: flex; flex-direction: column; gap: 0.4rem; font-size: 0.85rem; }
  .slider .hint { font-size: 0.72rem; color: var(--text-muted); }
  .energy { margin: 0; font-size: 0.76rem; color: var(--text-muted); line-height: 1.5; }
  .energy strong { color: var(--text); }
  .result { border: 1px solid; border-radius: 8px; padding: 0.9rem 1rem; display: flex; flex-direction: column; gap: 0.6rem; }
  .result-head { display: flex; align-items: center; gap: 0.5rem; font-size: 1rem; }
  .dot { width: 12px; height: 12px; border-radius: 50%; flex: 0 0 auto; }
  .times { display: grid; grid-template-columns: repeat(auto-fit, minmax(110px, 1fr)); gap: 0.6rem; }
  .times .k { display: block; font-size: 0.7rem; text-transform: uppercase; letter-spacing: 0.05em; color: var(--text-muted); }
  .times .v { display: block; font-size: 1.05rem; font-weight: 700; }
  .detail { margin: 0; font-size: 0.82rem; color: var(--text-muted); line-height: 1.5; }
  .buttons { display: flex; justify-content: flex-end; gap: 0.6rem; }
  .buttons button { padding: 8px 16px; cursor: pointer; border-radius: 4px; border: none; background: var(--bg-control); color: var(--text); font: inherit; }
  .buttons button.primary { background: var(--accent); color: var(--on-accent, #fff); }
  .buttons button:disabled { opacity: 0.45; cursor: not-allowed; }
</style>
