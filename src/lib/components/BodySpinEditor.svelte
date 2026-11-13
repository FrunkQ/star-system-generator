<script lang="ts">
  // A WORLD'S SPIN AND SHAPE: day length, spin direction, lobes and axial tilt (A105).
  //
  // These four controls lived on the Composition tab until the owner asked for them beside the
  // orbit ("more space than composition"), and they are mounted by `BodyOrbitTab` now. They are a
  // component of their own so that the script, the markup and the SCOPED STYLES travel as one
  // piece (engine map UI-C8: markup lifted out of a parent loses the parent's CSS silently).
  //
  // The Day Length control here is the HOUSE SLIDER IDIOM that other editors cite: the zone
  // gradient painted into the runnable track, and a notch ON the track at the value it stands for.
  //
  // A STAR's tilt is a different block on `BodyStarTab` and is not this.
  import { createEventDispatcher } from 'svelte';
  import type { CelestialBody } from '$lib/types';
  import { EARTH_MASS_KG, EARTH_RADIUS_KM } from '$lib/constants';
  import { densityGcc } from '$lib/physics/bodyEdit';
  import { breakupPeriodHours, rotationalDeform, type RotationalShape } from '$lib/physics/rotation';
  import { isSmallBodyShape, lobeCount, MAX_LOBES } from '$lib/catalogue/smallBodyShape';

  export let body: CelestialBody;

  const dispatch = createEventDispatcher();
  function handleUpdate() { dispatch('update'); }

  // A44 / B10. `spin/axis-inferred` and `spin/period-inferred` say "this number was invented, not
  // measured" — a promise to the reader that an inferred value is distinguishable from a real one.
  // The moment the GM types a real one in, that claim stops being true, and a tag asserting it is
  // simply wrong. Nothing re-derives these (they are `authored`), so nothing would ever clear them:
  // retiring the claim is the edit's job.
  function clearSpinProvenance(which: 'axis' | 'period') {
    const key = which === 'axis' ? 'spin/axis-inferred' : 'spin/period-inferred';
    if (!body.tags?.some((t) => t.key === key)) return;
    body.tags = body.tags.filter((t) => t.key !== key);
    body = body;
  }
  // B21: THE SLIDER IS ONE-WAY ON PURPOSE. A range input always HAS a value - with nothing to show
  // it sits at its midpoint, 90 here - and a two-way binding on a field the body does not carry
  // makes Svelte write that midpoint back at MOUNT. So merely opening this tab gave every tilt-less
  // world a 90 degree axis nobody chose, and the next edit of anything saved it. The slider now only
  // DISPLAYS the tilt, and writes one when the GM actually moves it (engine map UI-C19).
  function onTiltSlider(e: Event) {
    body.axial_tilt_deg = +(e.currentTarget as HTMLInputElement).value;
    onTiltInput();
  }
  // Clearing the number box deletes the field rather than leaving a null or a zero behind: "not set"
  // has to stay reachable once you have left it (engine map PHY-9).
  function onTiltInput() {
    if (body.axial_tilt_deg == null) delete body.axial_tilt_deg;
    body = body;
    clearSpinProvenance('axis');
    handleUpdate();
  }

  // LOBES — the one shape fact the engine does not derive, so the GM states it ([[G90]]).
  //
  // It is only OFFERED on a body small enough to be drawn irregular, because on anything rounder it
  // would do nothing and a control that does nothing is a lie. That is a question of relevance and
  // not a refusal: the field itself is unrestricted, so an imported or scripted body keeps whatever
  // it says, and the number a GM types here is never written back to or corrected.
  $: canBeLobed = isSmallBodyShape(body);
  $: lobes = lobeCount(body);
  function setLobes(n: number) {
    const v = Math.max(1, Math.min(MAX_LOBES, Math.round(n)));
    if (v <= 1) delete (body as { lobes?: number }).lobes; else body.lobes = v;
    body = body;
    handleUpdate();
  }

  // Rotational deformation (E4): the bulk density sets a hard BREAK-UP spin — spin any faster and the
  // equator sheds mass into a ring. Derived live from density + the day length, so it tracks composition
  // edits too. We surface the shape and hard-clamp the day length at the break-up period.
  // The density is the Composition tab's own figure for a planet or moon (`densityGcc` over the
  // body's mass and radius), read off the body rather than off that tab's state.
  $: rotDensity = densityGcc((body.massKg ?? 0) / EARTH_MASS_KG, (body.radiusKm ?? 0) / EARTH_RADIUS_KM);
  $: breakupHours = breakupPeriodHours(rotDensity || 0);
  $: rotDeform = rotationalDeform(body.rotation_period_hours ?? 0, rotDensity || 0);
  const SHAPE_LABEL: Record<RotationalShape, string> = {
    spherical: 'Spherical', oblate: 'Oblate (flattened)', ellipsoid: 'Ellipsoid',
    'near-breakup': 'Near break-up', unstable: 'Would fly apart → ring'
  };

  // Day-length slider: one LOG-scaled control from the break-up limit (fast, left) to very slow (right),
  // its track coloured by the shape zone. Spin DIRECTION is a separate retrograde flag (the stored period's
  // sign), and the synchronous (tidally-locked) period sits on the track as a snap notch — no checkbox.
  const SNAP_FRAC = 0.03;           // how close (in slider units) to the notch you must be to snap-lock
  $: rotMagHours = Math.abs(body.rotation_period_hours ?? 0);
  $: isRetrograde = (body.rotation_period_hours ?? 0) < 0;
  $: syncPeriodHours = Math.max(0, (body.orbital_period_days ?? 0) * 24); // locked ⇒ day = orbit
  $: pMin = Math.max(0.01, breakupHours);
  $: pMax = Math.max(pMin * 4, syncPeriodHours * 1.5, 20000);
  $: logSpan = Math.log(pMax / pMin) || 1;
  const clamp01 = (x: number) => Math.min(1, Math.max(0, x));
  $: periodToPos = (p: number) => clamp01(Math.log(Math.min(pMax, Math.max(pMin, p || pMin)) / pMin) / logSpan);
  $: posToPeriod = (s: number) => pMin * Math.pow(pMax / pMin, clamp01(s));
  $: rotPos = periodToPos(rotMagHours || pMax); // no spin ⇒ park at the slow end
  $: syncPos = syncPeriodHours >= pMin ? periodToPos(syncPeriodHours) : -1;
  // Colour-zone track. Boundaries are spin FRACTIONS (period = breakup / fraction): near-breakup 0.8,
  // ellipsoid 0.5, oblate 0.25. Fast (small period) = left = red; slow = right = green.
  $: rotTrack = (() => {
    const pct = (x: number) => (periodToPos(x) * 100).toFixed(1) + '%';
    const s08 = pct(pMin / 0.8), s05 = pct(pMin / 0.5), s025 = pct(pMin / 0.25);
    return `linear-gradient(to right,` +
      `var(--rot-unstable) 0%, var(--rot-unstable) ${s08},` +
      `var(--rot-ellipsoid) ${s08}, var(--rot-ellipsoid) ${s05},` +
      `var(--rot-oblate) ${s05}, var(--rot-oblate) ${s025},` +
      `var(--rot-spherical) ${s025}, var(--rot-spherical) 100%)`;
  })();

  function writePeriod(magHours: number, opts: { locked: boolean }) {
    let mag = Math.abs(magHours) || 0;
    if (mag > 0 && mag < breakupHours) mag = +breakupHours.toFixed(2); // hard break-up floor
    body.rotation_period_hours = +(isRetrograde ? -mag : mag).toFixed(2);
    body.tidallyLocked = opts.locked;
    (body as any).tidalLockManual = true; // any hand-set rate/lock is a manual pin
    clearSpinProvenance('period');          // a typed period is no longer an inferred one (A44)
    body = body;
    dispatch('update');
  }
  function onRotSlider(e: Event) {
    const s = parseFloat((e.currentTarget as HTMLInputElement).value);
    if (syncPos >= 0 && Math.abs(s - syncPos) <= SNAP_FRAC) { writePeriod(syncPeriodHours, { locked: true }); return; }
    writePeriod(posToPeriod(s), { locked: false });
  }
  function onRotMagInput(e: Event) {
    writePeriod(parseFloat((e.currentTarget as HTMLInputElement).value) || 0, { locked: false });
  }
  function lockTidally() { if (syncPeriodHours >= pMin) writePeriod(syncPeriodHours, { locked: true }); }
  function toggleRetrograde(e: Event) {
    const retro = (e.currentTarget as HTMLInputElement).checked;
    body.rotation_period_hours = (retro ? -1 : 1) * Math.abs(body.rotation_period_hours ?? 0);
    body = body;
    dispatch('update');
  }
  function resetTidalLockAuto() { delete (body as any).tidalLockManual; dispatch('update'); }
</script>

<div class="spin-editor">
    <!-- The heading is what keeps this tab's two retrogrades apart: everything under it is about
         the world turning on its own axis, everything above it about the path round its host. -->
    <div class="spin-title">Spin and shape</div>

    <div class="rot-editor">
        <div class="rot-head">
            <label for="rotation">Day Length</label>
            <div class="rot-num">
                <input type="number" id="rotation" step="0.1" min={breakupHours.toFixed(2)}
                       value={rotMagHours ? +rotMagHours.toFixed(2) : ''} on:input={onRotMagInput} />
                <span class="unit">h</span>
            </div>
        </div>
        {#if (rotDensity || 0) > 0}
            <div class="rot-slider-wrap">
                <input class="rot-slider" type="range" min="0" max="1" step="0.001"
                       value={rotPos} on:input={onRotSlider} style="--rot-track: {rotTrack};"
                       aria-label="Day length — log scale from the break-up limit (fast) to slow" />
                {#if syncPos >= 0}
                    <button type="button" class="rot-lock-notch" class:on={body.tidallyLocked}
                            style="left: {(syncPos * 100).toFixed(1)}%;" on:click={lockTidally}
                            title="Tidally locked — the day equals the orbit. Click, or drag the slider onto this notch, to lock.">🔒</button>
                {/if}
            </div>
            <div class="rot-scale"><span>fast · break-up</span><span>slow</span></div>
            <span class="sub-label shape-note shape-{rotDeform.shape}" title="Faster spin (shorter day) flattens the body; below the break-up period the equator sheds mass and it would become a ring. The limit is set by the bulk density (composition).">
                {SHAPE_LABEL[rotDeform.shape]}{#if body.tidallyLocked} · tidally locked{/if} · break-up {breakupHours < 1 ? breakupHours.toFixed(2) : breakupHours.toFixed(1)} h{#if rotDeform.shape !== 'spherical'} · f {rotDeform.oblateness.toFixed(2)}{/if}
            </span>
        {/if}
        <div class="rot-flags">
            <label class="inline-check" title="Spin direction: which way the world turns on its own axis. A retrograde spinner (like Venus) turns opposite to its orbit; stored as a negative day length. This is not the direction of the orbit, which is set above.">
                <input type="checkbox" id="retrograde-spin" checked={isRetrograde} on:change={toggleRetrograde} />
                Retrograde spin (turns backwards)
            </label>
            {#if (body as any).tidalLockManual}
                <button type="button" class="link-btn" on:click={resetTidalLockAuto}>Reset spin to auto</button>
            {/if}
        </div>
    </div>

    {#if canBeLobed}
      <div class="form-group lobe-editor">
        <label for="lobes">Lobes</label>
        <div class="lobe-row">
          <input type="number" id="lobes" min="1" max={MAX_LOBES} step="1" value={lobes}
                 on:input={(e) => setLobes(+e.currentTarget.value)} />
          <span class="sub-label">
            {#if lobes >= 2}
              Two or more bodies that met gently and stayed joined &mdash; a <strong>contact binary</strong>, like Arrokoth or comet 67P. Drawn with a neck on the map, the card and in 3D.
            {:else}
              One body. Set this to 2 for a contact binary &mdash; two lobes joined at a neck, like Arrokoth or comet 67P.
            {/if}
          </span>
        </div>
      </div>
    {/if}

    <div class="form-group">
        <label for="tilt">Axial Tilt: {body.axial_tilt_deg == null ? 'not set' : `${body.axial_tilt_deg.toFixed(0)}°`}</label>
        <div class="tilt-row">
            <input class="tilt-slider" type="range" id="tilt" min="0" max="180" step="1"
                   value={body.axial_tilt_deg ?? 0} on:input={onTiltSlider} />
            <input class="tilt-num" type="number" step="0.1" min="0" max="180"
                   bind:value={body.axial_tilt_deg} on:input={onTiltInput} />
        </div>
    </div>
</div>

<style>
  /* These rules came across from the Composition tab WITH the controls, base rules included, so
     the block reads exactly as it did there whatever its new host styles its own inputs as. */
  .spin-editor { display: flex; flex-direction: column; gap: 15px; }
  .spin-title { font-weight: 600; color: var(--text); font-size: 0.95em; }
  .form-group { display: flex; flex-direction: column; flex: 1; gap: 5px; }
  label { color: var(--text-muted); font-size: 0.9em; margin: 0; }

  input[type="number"] {
      padding: 4px;
      background: var(--bg-control);
      border: 1px solid var(--border);
      color: var(--text);
      border-radius: 3px;
      width: 100px;
      text-align: right;
      font-size: 1em;
      box-sizing: border-box;
  }
  .sub-label { font-size: 0.75em; color: var(--text-faint); }
  .shape-note { font-variant-numeric: tabular-nums; }

  /* --- Day-length slider (E4 shape-aware) --- */
  .rot-editor {
    --rot-unstable: #c0392b; --rot-ellipsoid: #e07b39; --rot-oblate: #d6b53c; --rot-spherical: #3c9a5f;
    display: flex; flex-direction: column; gap: 6px;
  }
  .rot-head { display: flex; align-items: center; justify-content: space-between; }
  .rot-head label { margin: 0; color: var(--text-muted); font-size: 0.9em; }
  .rot-num { display: flex; align-items: center; gap: 4px; }
  .rot-num input { width: 90px; padding: 4px 6px; border-radius: 4px; border: 1px solid var(--border); background: var(--bg-control); color: var(--text); }
  .rot-num .unit { color: var(--text-faint); font-size: 0.85em; }
  .rot-slider-wrap { position: relative; padding: 2px 0; }
  .rot-slider { width: 100%; margin: 0; -webkit-appearance: none; appearance: none; background: transparent; cursor: pointer; }
  .rot-slider::-webkit-slider-runnable-track { height: 10px; border-radius: 5px; background: var(--rot-track); border: 1px solid rgba(0,0,0,0.25); }
  .rot-slider::-moz-range-track { height: 10px; border-radius: 5px; background: var(--rot-track); border: 1px solid rgba(0,0,0,0.25); }
  .rot-slider::-webkit-slider-thumb { -webkit-appearance: none; appearance: none; width: 16px; height: 16px; margin-top: -4px; border-radius: 50%; background: #fff; border: 2px solid #222; box-shadow: 0 1px 3px rgba(0,0,0,0.4); }
  .rot-slider::-moz-range-thumb { width: 16px; height: 16px; border-radius: 50%; background: #fff; border: 2px solid #222; box-shadow: 0 1px 3px rgba(0,0,0,0.4); }
  .rot-lock-notch {
    position: absolute; top: -3px; transform: translateX(-50%); z-index: 2;
    background: var(--bg-panel); border: 1px solid var(--border); border-radius: 4px;
    padding: 0 2px; font-size: 0.8em; line-height: 1.4; cursor: pointer; opacity: 0.7;
  }
  .rot-lock-notch:hover { opacity: 1; }
  .rot-lock-notch.on { opacity: 1; border-color: var(--accent, #ff5a1f); box-shadow: 0 0 0 1px var(--accent, #ff5a1f); }
  .rot-scale { display: flex; justify-content: space-between; font-size: 0.7em; color: var(--text-faint); }
  .rot-flags { display: flex; align-items: center; justify-content: space-between; gap: 8px; flex-wrap: wrap; }
  .inline-check { display: flex; align-items: center; gap: 6px; margin: 0; color: var(--text); font-size: 0.85em; }
  .inline-check input { width: auto; }
  .lobe-row { display: flex; align-items: flex-start; gap: 8px; }
  .lobe-row input { width: 70px; flex: none; padding: 4px 6px; border-radius: 4px; border: 1px solid var(--border); background: var(--bg-control); color: var(--text); }
  .lobe-row .sub-label { flex: 1; }
  .tilt-row { display: flex; align-items: center; gap: 8px; }
  .tilt-slider { flex: 1; }
  .tilt-num { width: 70px; padding: 4px 6px; border-radius: 4px; border: 1px solid var(--border); background: var(--bg-control); color: var(--text); }
  .shape-oblate { color: #6aa0d8; }
  .shape-ellipsoid { color: #e0a24a; }
  .shape-near-breakup { color: #e06a4a; font-weight: 600; }
  .shape-unstable { color: #e0483c; font-weight: 700; }
  /* The Composition tab declares .link-btn twice and the later rule wins on every property both
     set, so this is the resolved result of the pair rather than either one alone. */
  .link-btn {
      background: none; border: none; padding: 0; margin-top: 2px;
      color: var(--link, #6aa0d8); font-size: 0.9em; cursor: pointer; text-align: left;
  }
  .link-btn:hover { text-decoration: underline; }
  input[type="checkbox"] { width: auto; margin-right: 5px; }
</style>
