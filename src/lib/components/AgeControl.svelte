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
  import { ageDriven, ageDrivesSentence, formatAgeGyr } from '$lib/physics/ageDrives';
  import { brownDwarfThermal, brownDwarfAgeForTeff, type BrownDwarfAgeFit } from '$lib/physics/substellar';
  import { unitBodyTypeFor } from '$lib/units';
  import UnitValue from './UnitValue.svelte';
  import UnitInput from './UnitInput.svelte';

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

  // ── A BROWN DWARF: THE TEMPERATURE THIS AGE GIVES, AND THE AGE A TEMPERATURE NEEDS (G94 job 4) ──
  // A brown dwarf's temperature is its cooling track, so this is the control that moves it, and the
  // figure is shown here straight from the track at the age on the slider. And because what a GM
  // usually HAS is a temperature (B150: he typed 914 and it snapped back), he can still type one:
  // the track is asked which age gives it, and the answer is OFFERED as an age to set. Nothing is
  // pinned, so nothing can snap back.
  //
  // Whether the track applies is asked of the model (`ageDriven`), never of the role: a brown dwarf
  // filed as a planet gets exactly this, on its Temperature tab.
  $: cooling = ageDriven(body, rulePack).includes('cooling-track');
  $: teffNow = cooling ? brownDwarfThermal(body.massKg || 0, age, body.radiusKm || 0).teffK : 0;
  $: unitType = unitBodyTypeFor(body);

  let aimK: number | null = null;
  let fit: BrownDwarfAgeFit | null = null;
  // The offer is about ONE body at ONE mass: forget it when either changes under the panel.
  let aimKey = '';
  $: {
    const key = `${body.id}:${body.massKg}`;
    if (key !== aimKey) { aimKey = key; aimK = null; fit = null; }
  }
  function aimFor(teffK: number) {
    aimK = teffK;
    fit = brownDwarfAgeForTeff(body.massKg || 0, teffK);
  }
  // The age is the track's; whether the universe is old enough for it is the campaign's to say.
  $: reachable = fit?.kind === 'age' && fit.ageGyr <= nowGyr;
  $: coolestReachableK = cooling ? brownDwarfThermal(body.massKg || 0, nowGyr, body.radiusKm || 0).teffK : 0;
  function acceptFit() {
    if (fit?.kind !== 'age') return;
    commitAge(fit.ageGyr);
    aimK = null; fit = null;
  }
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

    {#if cooling}
        <div class="cooling">
            <div class="row teff">
                <span>Effective temperature at this age</span>
                <strong><UnitValue quantity="temperature" bodyType={unitType} value={teffNow} decimals={0} /></strong>
            </div>
            <div class="row aim">
                <label for="{idPrefix}-aim">Aim for a temperature</label>
                <UnitInput quantity="temperature" bodyType={unitType} id="{idPrefix}-aim" value={aimK ?? Math.round(teffNow)}
                    on:commit={(e) => aimFor(e.detail)} />
            </div>
            {#if fit && aimK != null}
                <div class="fit" role="status">
                    {#if fit.kind === 'age' && reachable}
                        <span>A dwarf of this mass is <UnitValue quantity="temperature" bodyType={unitType} value={aimK} decimals={0} /> at {formatAgeGyr(fit.ageGyr)}.</span>
                        <button type="button" class="accept" on:click={acceptFit}>Set its age to {formatAgeGyr(fit.ageGyr)}</button>
                    {:else if fit.kind === 'age'}
                        <span>A dwarf of this mass would need {formatAgeGyr(fit.ageGyr)} to cool to
                            <UnitValue quantity="temperature" bodyType={unitType} value={aimK} decimals={0} />, and the universe is
                            {formatAgeGyr(nowGyr)} old here. The coolest it can be by now is
                            <UnitValue quantity="temperature" bodyType={unitType} value={coolestReachableK} decimals={0} />; a lighter
                            dwarf cools faster.</span>
                    {:else if fit.kind === 'too-hot'}
                        <span>A dwarf of this mass is never that hot: it starts at about
                            <UnitValue quantity="temperature" bodyType={unitType} value={fit.hottestK} decimals={0} /> and only cools. A
                            heavier one starts hotter.</span>
                    {:else if fit.kind === 'too-cold'}
                        <span>No brown dwarf is colder than
                            <UnitValue quantity="temperature" bodyType={unitType} value={fit.coldestK} decimals={0} />. This one reaches
                            that at {formatAgeGyr(fit.ageGyr)}.</span>
                    {/if}
                </div>
            {/if}
        </div>
    {/if}
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
  .cooling { display: flex; flex-direction: column; gap: 6px; margin-top: 6px; padding-top: 6px; border-top: 1px dashed var(--border); }
  .row { display: flex; justify-content: space-between; align-items: center; gap: 8px; font-size: 0.9em; color: var(--text-muted); }
  .teff strong { color: var(--text); }
  .fit { display: flex; flex-direction: column; gap: 6px; font-size: 0.82em; color: var(--text-muted); line-height: 1.4; }
  .accept { align-self: flex-start; background: var(--bg-control); border: 1px solid var(--accent); border-radius: 3px; color: var(--text); padding: 3px 10px; cursor: pointer; }
</style>
