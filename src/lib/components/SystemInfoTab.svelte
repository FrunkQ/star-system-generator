<script lang="ts">
  // System-level properties. Editable on a STAR's "System Info" tab: the system's AGE, and its
  // authorship (the read-only credit is shown under the star's image - see SystemView). Saved with
  // the system.
  import type { System } from '$lib/types';
  import { createEventDispatcher } from 'svelte';
  import { cosmicNowGyr, systemAgeGyr, hasOwnAge } from '$lib/physics/bodyAge';
  import { formatAgeGyr } from '$lib/physics/ageDrives';

  export let system: System;
  const dispatch = createEventDispatcher();

  // ── THE SYSTEM'S AGE (G94, B150) ─────────────────────────────────────────────────────────────
  // Until this control an existing system's age could not be changed at all: the wizard set it, the
  // import dialog set it, and after that there was no handle. That is why "the lever that works is
  // the system's age" (the B150 workaround) was true and useless to the people it was said to.
  //
  // It is the age of every body that has not been given one of its own, and of nothing else: a body
  // with its own age does not follow, and the count of those is shown so a GM is not surprised.
  // Changing it marks the age as CHOSEN (`ageEstimated` goes), exactly as the import dialog does.
  //
  // THE RANGE IS BOUND ONE WAY (engine map UI-C19) and written only from a handler, so opening this
  // tab changes nothing. The slider is log-scaled like the creation dials', because the interesting
  // young ages would otherwise share its first pixel; its top is the universe on this system's own
  // reference date, derived from the master clock.
  const AGE_FLOOR_GYR = 0.001;
  $: nowGyr = cosmicNowGyr(system);
  $: ageGyr = systemAgeGyr(system);
  $: logLo = Math.log10(AGE_FLOOR_GYR);
  $: logHi = Math.log10(nowGyr);
  $: logAge = Math.log10(Math.max(AGE_FLOOR_GYR, Math.min(nowGyr, ageGyr)));
  $: ownAged = (system?.nodes ?? []).filter((n) => hasOwnAge(n as any)).length;
  $: band = system?.ageBandGyr;
  $: outsideBand = !!band && (ageGyr < band[0] || ageGyr > band[1]);

  function setAge(v: number) {
    if (!Number.isFinite(v)) return;
    system.age_Gyr = Math.max(0, Math.min(nowGyr, v));
    delete system.ageEstimated;
    system = system;
    dispatch('update');
  }
  const onAgeSlider = (e: Event) => setAge(+Math.pow(10, +(e.currentTarget as HTMLInputElement).value).toPrecision(3));
  function onAgeNumber(e: Event) {
    const text = (e.currentTarget as HTMLInputElement).value;
    if (text.trim() === '') return;      // an emptied box is not an age of zero
    setAge(+text);
  }

  // Ensure the credits object exists so the inputs can bind.
  $: if (system && !system.credits) system.credits = {};
  const update = () => dispatch('update');
  function stampToday() {
    if (!system.credits) system.credits = {};
    system.credits.created = new Date().toISOString().slice(0, 10);
    update();
  }
</script>

<div class="tab-panel">
  <div class="form-group system-age">
    <div class="age-head">
      <label for="sys-age">System age {#if system.ageEstimated}<span class="est" title="Estimated from the main star's type when this system was imported. Set it here to make it yours.">estimated</span>{/if}</label>
      <span class="age-num-wrap">
        <input id="sys-age" class="age-num" type="number" min="0" max={nowGyr} step="0.01"
               value={Number(ageGyr.toPrecision(4))} on:change={onAgeNumber} />
        <span class="unit">Gyr</span>
      </span>
    </div>
    <input id="sys-age-slider" class="age-slider" type="range" min={logLo} max={logHi} step="0.01"
           value={logAge} on:input={onAgeSlider} aria-label="System age, from a million years to the age of the universe" />
    <div class="age-ends"><span>{formatAgeGyr(AGE_FLOOR_GYR)}</span><span>{formatAgeGyr(nowGyr)} &middot; the universe on this system's date</span></div>
    <p class="age-why">
      Every body that has not been given an age of its own is this old. It sets how hard the stars flare,
      how far brown dwarfs and giant planets have cooled, how much air a world has lost, whether worlds
      have had time to lock to their star, and how worn their surfaces are. It does not age the stars
      themselves: a star's temperature, size and brightness stay as you set them.
    </p>
    {#if ownAged > 0}
      <p class="age-note">{ownAged} {ownAged === 1 ? 'body here has' : 'bodies here have'} an age of {ownAged === 1 ? 'its' : 'their'} own and will not follow this.</p>
    {/if}
    {#if band}
      <p class="age-note" class:outside={outsideBand}>
        {#if outsideBand}
          {formatAgeGyr(ageGyr)} is outside what the main star's own life makes likely ({formatAgeGyr(band[0])} to {formatAgeGyr(band[1])}). It is kept as you set it.
        {:else}
          The main star's own life makes {formatAgeGyr(band[0])} to {formatAgeGyr(band[1])} likely.
        {/if}
      </p>
    {/if}
  </div>

  <hr />

  <p class="intro">Credit yourself for building this system — shown under the main star for anyone you share it with.</p>

  <div class="form-group">
    <label for="sc-author">Created by</label>
    <input id="sc-author" type="text" maxlength="80" placeholder="Your name or handle" bind:value={system.credits.author} on:input={update} />
  </div>

  <div class="form-group">
    <label for="sc-contact">Contact <span class="opt">(optional)</span></label>
    <input id="sc-contact" type="text" maxlength="120" placeholder="Email, Discord, website…" bind:value={system.credits.contact} on:input={update} />
  </div>

  <div class="row">
    <div class="form-group">
      <label for="sc-created">Date</label>
      <div class="date-row">
        <input id="sc-created" type="date" bind:value={system.credits.created} on:input={update} />
        <button type="button" class="today" on:click={stampToday}>Today</button>
      </div>
    </div>
    <div class="form-group">
      <label for="sc-version">Version</label>
      <input id="sc-version" type="text" maxlength="16" placeholder="e.g. 1.0" bind:value={system.credits.version} on:input={update} />
    </div>
  </div>

  {#if system.credits?.author}
    <div class="preview">Preview: <em>This system was created by {system.credits.author}{#if system.credits.version} · v{system.credits.version}{/if}{#if system.credits.created} · {system.credits.created}{/if}</em></div>
  {/if}
</div>

<style>
  .tab-panel { padding: 10px; display: flex; flex-direction: column; gap: 12px; }
  .intro { margin: 0; font-size: 0.82em; color: var(--text-faint); line-height: 1.4; }
  .form-group { display: flex; flex-direction: column; flex: 1; gap: 4px; }
  .row { display: flex; gap: 10px; }
  label { color: var(--text-muted); font-size: 0.9em; margin: 0; }
  .opt { color: var(--text-faint); font-weight: 400; }
  input { padding: 6px 8px; background: var(--bg-control); border: 1px solid var(--border); color: var(--text); border-radius: 3px; font-size: 1em; box-sizing: border-box; width: 100%; }
  .date-row { display: flex; gap: 6px; }
  .today { background: transparent; border: 1px solid var(--border); border-radius: 3px; color: var(--link); font-size: 0.8em; padding: 0 8px; cursor: pointer; white-space: nowrap; }
  .today:hover { background: var(--bg-control); border-color: var(--accent); }
  .age-head { display: flex; justify-content: space-between; align-items: center; }
  .age-num-wrap { display: inline-flex; align-items: center; gap: 4px; }
  .age-num { width: 5.5em; text-align: right; }
  .unit { color: var(--text-muted); font-size: 0.85em; }
  .age-slider { padding: 0; border: none; background: transparent; }
  .age-ends { display: flex; justify-content: space-between; font-size: 0.72em; color: var(--text-faint); }
  .age-why, .age-note { margin: 0; font-size: 0.8em; color: var(--text-faint); line-height: 1.4; }
  .age-note.outside { color: var(--warning, #ffcc00); }
  .est { font-size: 0.68em; text-transform: uppercase; letter-spacing: 0.04em; color: var(--text-faint); border: 1px solid var(--border); border-radius: 3px; padding: 0 4px; margin-left: 4px; cursor: help; }
  hr { border: none; border-top: 1px solid var(--border); margin: 0; width: 100%; }
  .preview { font-size: 0.8em; color: var(--text-faint); border-top: 1px solid var(--border); padding-top: 8px; }
</style>
