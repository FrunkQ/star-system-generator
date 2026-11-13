<script lang="ts">
  // THE AGE CONTROL (G94 job 3, placed by G96): one component, mounted on the Temperature tab for a
  // planet or moon and on the Star tab for a brown dwarf.
  //
  // IT IS LABELLED "AGE", NOT "TIME" - time in this app is the campaign date and already has a
  // clock, a calendar and transit times attached. And it is NOT an override: there is no pin, no
  // anomaly and no warning here, because a body older than its system is a history, not a cheat.
  //
  // THE AXIS IS THE ABSOLUTE ONE (deep-time-design.md section 4): the big bang at the left, the
  // system's own reference date at the right, and the thumb at the moment this body FORMED. So left
  // is older. The right-hand end is derived from the master clock, never typed, and it is not the
  // time a GM is scrubbing - moving this does not move the clock and the clock does not move this.
  //
  // ABSENT MEANS INHERIT, AND OPENING THE PANEL MUST NOT CHANGE THAT. The range is bound ONE WAY and
  // the body is written only from a handler (engine map UI-C19: a range bound to an absent field
  // writes its resting value into the data at mount). A body that has never been given an age shows
  // its system's, says so, and still has no field of its own after this mounts.
  import { createEventDispatcher } from 'svelte';
  import type { CelestialBody, RulePack } from '$lib/types';
  import { ageOf, hasOwnAge, setBodyAge, clearBodyAge, cosmicNowGyr, systemAgeGyr, type AgeFrame } from '$lib/physics/bodyAge';
  import { ageDrivesSentence, formatAgeGyr } from '$lib/physics/ageDrives';

  export let body: CelestialBody;
  export let system: Partial<AgeFrame> | null = null;
  export let rulePack: RulePack | null = null;
  /** Lets two controls share a page without sharing an id. */
  export let idPrefix = 'age';

  const dispatch = createEventDispatcher<{ update: void }>();

  $: nowGyr = cosmicNowGyr(system);
  $: sysAge = systemAgeGyr(system);
  $: own = hasOwnAge(body);
  $: age = ageOf(body, system);
  // Where on the axis this body formed, and where its system did. Both in Gyr after the big bang.
  $: formedAt = Math.max(0, nowGyr - age);
  $: systemFormedPct = Math.max(0, Math.min(100, 100 * (nowGyr - sysAge) / nowGyr));
  $: drives = ageDrivesSentence(body, rulePack);
  $: relation = !own ? '' : Math.abs(age - sysAge) < 1e-9 ? 'the same age as its system'
      : age > sysAge ? `${formatAgeGyr(age - sysAge)} older than its system`
      : `${formatAgeGyr(sysAge - age)} younger than its system`;

  function commitAge(ageGyr: number) {
    if (!Number.isFinite(ageGyr)) return;
    // Bounded by the universe on the day the campaign is set, and by nothing else.
    setBodyAge(body, Math.max(0, Math.min(nowGyr, ageGyr)), system);
    body = body;
    dispatch('update');
  }
  function onSlider(e: Event) {
    commitAge(nowGyr - +(e.currentTarget as HTMLInputElement).value);
  }
  function onNumber(e: Event) {
    const text = (e.currentTarget as HTMLInputElement).value;
    if (text.trim() === '') return;      // an emptied box is not an age of zero
    commitAge(+text);
  }
  function inherit() {
    clearBodyAge(body);
    body = body;
    dispatch('update');
  }
  /** For a caller that has worked out an age some other way (the temperature inversion). */
  export function setAge(ageGyr: number) { commitAge(ageGyr); }
</script>

<div class="age-control">
    <div class="label-row">
        <label for="{idPrefix}-num">Age</label>
        <span class="num">
            <input id="{idPrefix}-num" class="age-num" type="number" min="0" max={nowGyr} step="0.01"
                   value={Number(age.toFixed(4))} on:change={onNumber} />
            <span class="unit">Gyr</span>
        </span>
    </div>
    <div class="axis">
        <div class="pin" style="left: {systemFormedPct}%" title="When this system formed: {formatAgeGyr(sysAge)} ago"></div>
        <input id="{idPrefix}-slider" class="age-slider" type="range" min="0" max={nowGyr} step="0.001"
               value={formedAt} on:input={onSlider}
               aria-label="When this body formed, from the big bang to the system's reference date" />
    </div>
    <div class="ends"><span>big bang</span><span class="pin-key">&#9650; system formed</span><span>now</span></div>
    <div class="state" class:own>
        {#if own}
            <span class="own-text">{formatAgeGyr(age)} old &mdash; {relation}.</span>
            <button type="button" class="inherit" on:click={inherit}>Use the system's age</button>
        {:else}
            <span class="inherit-text">Same as its system ({formatAgeGyr(sysAge)}). Move it to give this body an age of its own.</span>
        {/if}
    </div>
    <div class="drives" role="note">{drives}</div>
    <slot {age} {own} />
</div>

<style>
  .age-control { display: flex; flex-direction: column; gap: 4px; margin: 6px 0 10px; }
  .label-row { display: flex; justify-content: space-between; align-items: center; }
  label { color: var(--text-muted); font-size: 0.9em; margin: 0; }
  .num { display: inline-flex; align-items: center; gap: 4px; }
  .age-num { width: 5.5em; padding: 4px 6px; background: var(--bg-control); border: 1px solid var(--border); color: var(--text); border-radius: 3px; text-align: right; }
  .unit { color: var(--text-muted); font-size: 0.85em; }
  .axis { position: relative; padding-top: 6px; }
  .age-slider { width: 100%; margin: 0; }
  .pin { position: absolute; top: 0; width: 2px; height: 8px; margin-left: -1px; background: var(--accent); pointer-events: none; }
  .ends { display: flex; justify-content: space-between; font-size: 0.72em; color: var(--text-faint); }
  .pin-key { color: var(--accent); }
  .state { display: flex; justify-content: space-between; align-items: center; gap: 8px; font-size: 0.82em; color: var(--text-muted); }
  .inherit-text { color: var(--text-faint); }
  .inherit { background: transparent; border: 1px solid var(--border); border-radius: 3px; color: var(--link); font-size: 0.9em; padding: 2px 8px; cursor: pointer; white-space: nowrap; }
  .inherit:hover { background: var(--bg-control); border-color: var(--accent); }
  .drives { font-size: 0.8em; color: var(--text-faint); line-height: 1.35; }
</style>
