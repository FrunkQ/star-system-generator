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
  import { constructDisplayPlacement, interstellarConstructIds } from '$lib/transit/interstellar';
  import { redirectDeltaV, headingOffsetDeg } from '$lib/physics/redirect';
  import { fmt } from '$lib/stores';

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

  // Destination can instead be an INTERSTELLAR VESSEL — a point in space (e.g. fly out to rescue a
  // stranded ship). The target is a snapshot of the vessel's current position; a stranded ship sits
  // still, an in-flight one keeps moving (true moving-intercept is a later refinement).
  let destKind: 'system' | 'vessel' = 'system';
  $: vessels = (() => {
    const nowSec = Number(starmap?.temporal?.displayTimeSec ?? 0);
    const nameOf = (id: string) => {
      for (const s of starmap.systems) { const n = s.system?.nodes?.find((x) => x.id === id); if (n) return n.name; }
      return (starmap.adriftConstructs ?? []).find((x) => x.construct?.id === id)?.construct?.name ?? 'Ship';
    };
    const out: { id: string; name: string; x: number; y: number; moving: boolean }[] = [];
    for (const id of interstellarConstructIds(starmap, nowSec)) {
      if (id === shipId) continue;
      const p = constructDisplayPlacement(starmap, id, nowSec);
      if (p.kind === 'transit' || p.kind === 'adrift') out.push({ id, name: nameOf(id), x: p.x, y: p.y, moving: p.kind === 'transit' });
    }
    return out;
  })();
  let vesselId = '';
  $: if ((!vesselId || !vessels.some((v) => v.id === vesselId)) && vessels.length) vesselId = vessels[0].id;
  $: selectedVessel = vessels.find((v) => v.id === vesselId) || null;
  $: if (destKind === 'vessel' && !vessels.length) destKind = 'system';   // nothing out there to fly to
  $: targetPoint = destKind === 'vessel'
    ? (selectedVessel ? { x: selectedVessel.x, y: selectedVessel.y } : null)
    : (destNode ? { x: destNode.position?.x ?? 0, y: destNode.position?.y ?? 0 } : null);

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

  // The ship's CURRENT position + velocity, derived from the clock — so a course replotted from an adrift
  // or in-flight ship starts from where it actually is (and carries its momentum), not its origin system.
  $: nowSec = Number(starmap?.temporal?.displayTimeSec ?? 0);
  $: originPlacement = shipId ? constructDisplayPlacement(starmap, shipId, nowSec) : null;
  $: originIsPoint = !!(originPlacement && (originPlacement.kind === 'transit' || originPlacement.kind === 'adrift'));
  $: originPoint = (() => {
    const p = originPlacement;
    if (p && (p.kind === 'transit' || p.kind === 'adrift')) return { x: p.x, y: p.y };
    if (p && p.kind === 'system') { const s = starmap.systems.find((x) => x.id === p.systemId); if (s) return { x: s.position?.x ?? 0, y: s.position?.y ?? 0 }; }
    return shipSystemNode ? { x: shipSystemNode.position?.x ?? 0, y: shipSystemNode.position?.y ?? 0 } : null;
  })();
  // Current drift velocity (starmap coords / game-second); only an adrift coast carries one.
  $: originVel = (originPlacement && originPlacement.kind === 'adrift')
    ? { vx: (originPlacement as any).vx ?? 0, vy: (originPlacement as any).vy ?? 0 }
    : { vx: 0, vy: 0 };

  // Straight-line distance from the ship's current position to the target, using the starmap scale.
  $: distanceInfo = (() => {
    if (!originPoint || !targetPoint) return null;
    const dx = originPoint.x - targetPoint.x;
    const dy = originPoint.y - targetPoint.y;
    const px = Math.hypot(dx, dy);
    const unit = starmap.scale?.unit || starmap.distanceUnit || 'LY';
    const perUnit = starmap.scale?.pixelsPerUnit || 1;
    const value = px / perUnit;
    const metersPerCoord = distanceToMeters(1, unit) / perUnit;
    return { value, unit, meters: distanceToMeters(value, unit), metersPerCoord };
  })();

  // Honest vector Δv to redirect the ship's existing momentum onto the new heading. A destination along
  // the current drift is ~free; reversing costs the whole speed. Surfaced so the physics is visible.
  $: redirectDvMs = (() => {
    if (!originPoint || !targetPoint || !distanceInfo) return 0;
    const m = distanceInfo.metersPerCoord;
    const vMs: [number, number] = [originVel.vx * m, originVel.vy * m];
    if (vMs[0] === 0 && vMs[1] === 0) return 0;
    return redirectDeltaV(vMs, [targetPoint.x - originPoint.x, targetPoint.y - originPoint.y]);
  })();
  $: headingOffset = (originVel.vx || originVel.vy) && originPoint && targetPoint
    ? headingOffsetDeg([originVel.vx, originVel.vy], [targetPoint.x - originPoint.x, targetPoint.y - originPoint.y])
    : 0;
  // Killing/redirecting your momentum burns REAL propellant (rocket equation from the wet mass) — it's
  // drained on departure, so the now-lighter ship carries into the next transit's Δv. Refuelling is the
  // GM's manual job, so we don't gate on it; we just charge the mass. Only matters where fuel is tracked
  // (realistic mode); massless/relativistic/jump don't.
  $: exhaustV = (specs?.avgVacIsp || 0) * G0;   // effective exhaust velocity, m/s
  $: redirectFuelKg = (mode === 'realistic' && redirectDvMs > 0 && exhaustV > 0 && shipMassKg > 0)
    ? shipMassKg * (1 - Math.exp(-redirectDvMs / exhaustV))
    : 0;
  $: originLabel = originPlacement?.kind === 'adrift' ? 'adrift in interstellar space'
    : originPlacement?.kind === 'transit' ? 'in transit'
    : (shipSystemNode?.name ?? 'unknown');
  const fmtMass = (kg: number) => kg >= 1000 ? `${(kg / 1000).toFixed(kg >= 100000 ? 0 : 1)} t` : `${Math.round(kg)} kg`;

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
        starMassKg: originIsPoint ? 0 : ((primaryStar as any)?.massKg || 0),  // adrift in deep space: no star to escape
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

  // Start Journey is allowed whenever the journey actually arrives (finite observer time) AND there's a
  // valid destination (a system, or a chosen vessel/point).
  $: hasDest = destKind === 'vessel' ? !!selectedVessel : !!destNode;
  $: canStart = !!(result && Number.isFinite(result.observerSeconds) && result.observerSeconds >= 0 && shipEntry && hasDest);

  function startJourney() {
    if (!canStart || !shipEntry || !result) return;
    const common = {
      shipId,
      shipName: shipEntry.construct.name,
      fromSystemId: shipSystemNode?.id ?? '',
      // Replotted from where the ship currently sits (adrift / in-flight): record the point origin + the
      // Δv spent to redirect its momentum onto the new heading. A fresh launch from a system omits these.
      ...(originIsPoint && originPoint ? { fromX: originPoint.x, fromY: originPoint.y, fromLabel: 'Replotted course', redirectDvMs } : {}),
      mode,
      observerSeconds: result.observerSeconds,
      shipSeconds: result.shipSeconds,
      headline: result.headline,
      cannotStop: result.cannotStop ?? false,
      fuelUsedKg: mode === 'realistic' ? ((result.fuelUsedKg ?? 0) + redirectFuelKg) : 0,
    };
    if (destKind === 'vessel' && selectedVessel) {
      dispatch('startjourney', {
        ...common,
        toSystemId: shipSystemNode!.id,   // nominal origin reference; the real target is the point below
        toBodyId: null,
        toBodyName: selectedVessel.name,
        toX: selectedVessel.x,
        toY: selectedVessel.y,
        toLabel: selectedVessel.name,
      });
    } else if (destNode) {
      dispatch('startjourney', {
        ...common,
        toSystemId: destNode.id,
        toBodyId: destBodyId || null,
        toBodyName: destBody?.name || destNode.name,
      });
    }
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
      <p class="ship-line">Ship: <strong>{shipEntry.construct.name}</strong> <span class="muted">— currently {originLabel}</span></p>

      {#if vessels.length}
        <div class="dest-kind">
          <label><input type="radio" bind:group={destKind} value="system" /> A star system</label>
          <label><input type="radio" bind:group={destKind} value="vessel" /> An interstellar ship ({vessels.length})</label>
        </div>
      {/if}

      {#if destKind === 'vessel'}
        <!-- Fly to a ship out in interstellar space (e.g. a rescue) — a point destination. -->
        <div class="row">
          <label class="field">
            <span>Target ship</span>
            <select bind:value={vesselId}>
              {#each vessels as v (v.id)}<option value={v.id}>{v.moving ? '➤ ' : '⚠ '}{v.name}{v.moving ? ' (in transit)' : ' (adrift)'}</option>{/each}
            </select>
          </label>
        </div>
        {#if selectedVessel?.moving}<p class="distance hint-warn">This ship is still moving — you'll be aimed at where it is now, not where it'll be. Best for stranded targets.</p>{/if}
      {:else}
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
      {/if}

      {#if distanceInfo}
        <p class="distance">Distance: <strong>{distanceInfo.value.toFixed(2)} {distanceInfo.unit}</strong>{#if destKind === 'vessel' && selectedVessel} → rendezvous with <strong>{selectedVessel.name}</strong>{:else if destBody} → final approach to <strong>{destBody.name}</strong>{/if}</p>
        {#if originVel.vx || originVel.vy}
          <p class="redirect">
            Redirect Δv: <strong>{$fmt.speedAuto(redirectDvMs)}</strong>{#if mode === 'realistic' && redirectFuelKg > 0} — burns <strong>{fmtMass(redirectFuelKg)}</strong> of propellant{/if}
            <span class="muted">— current drift is {headingOffset.toFixed(0)}° off the new heading{#if headingOffset < 5} (almost free — you're already going this way){:else if headingOffset > 150} (nearly a full reversal — costs your whole speed){/if}</span>
          </p>
        {/if}
      {:else}
        <p class="distance">Pick a destination.</p>
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
            <span class="hint">More fuel out = faster, but leaves less to brake. Ship Δv (full tank): {$fmt.speedMs(shipDv, 1)}</span>
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
            <div><span class="k">{mode === 'massless' ? 'Peak speed' : 'Cruise'}</span><span class="v">{result.cruise_ms > 0 ? (result.fractionC >= 0.01 ? fmtFractionC(result.fractionC) : $fmt.speedMs(result.cruise_ms, 0)) : '—'}</span></div>
            {#if result.gamma > 1.01 && Number.isFinite(result.gamma)}<div><span class="k">Dilation</span><span class="v">×{result.gamma.toFixed(2)}</span></div>{/if}
          </div>
          <p class="detail">{result.detail}</p>
        </div>
      {/if}
    {/if}

    <div class="buttons">
      <button on:click={() => dispatch('close')}>Cancel</button>
      <button class="primary" disabled={!canStart} on:click={startJourney} title={canStart ? (result?.cannotStop ? 'Begin — it reaches the destination but cannot brake, so it flies by and coasts on adrift' : 'Begin this journey — the ship appears on the starmap') : 'This journey does not arrive — adjust the plan'}>{result?.cannotStop ? 'Start (fly-by — won’t stop)' : 'Start Journey'}</button>
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
  .redirect { margin: 0; font-size: 0.85rem; color: var(--text); border-left: 3px solid #46c46a; padding-left: 8px; }
  .redirect .muted { color: var(--text-muted); }
  .hint-warn { color: var(--status-warn, #d8a23a); font-size: 0.82rem; }
  .dest-kind { display: flex; gap: 1.25rem; font-size: 0.88rem; }
  .dest-kind label { display: inline-flex; align-items: center; gap: 5px; cursor: pointer; }
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
