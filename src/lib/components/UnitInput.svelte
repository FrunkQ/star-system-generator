<script lang="ts">
  // G34 — an editable number whose unit is the click target. The field shows the SI value
  // expressed in the pref unit for this quantity × body type; typing stays LOCAL and converts to
  // SI exactly once, on commit (change/Enter/blur — never mid-keystroke). `value` in and the
  // `commit` event out are ALWAYS SI (K, kg, km, km/s). Clicking the unit first commits any
  // pending text (the blur fires before the click), then re-expresses the value — so cycling
  // never converts a stored number, it only relabels the view of it.
  import { createEventDispatcher } from 'svelte';
  import { unitPrefs, unitPrefsLocked, cycleUnitPref } from '../unitPrefsStore';
  import {
    resolveUnitPref, resolveAutoUnit, unitFromSI, unitToSI, unitIdLabel,
    type UnitQuantity, type UnitBodyType
  } from '../units';

  export let quantity: UnitQuantity;
  export let bodyType: UnitBodyType;
  export let value: number;                       // SI: K / kg / km / km·s⁻¹
  export let min: number | undefined = undefined; // SI, clamped on commit
  export let max: number | undefined = undefined; // SI
  export let step: number | string | undefined = undefined; // display-unit granularity
  export let id: string | undefined = undefined;
  export let disabled = false;
  export let width: string | undefined = undefined;

  const dispatch = createEventDispatcher<{ commit: number }>();

  let text = '';
  let focused = false;

  $: unit = resolveUnitPref($unitPrefs, quantity, bodyType);
  $: shown = resolveAutoUnit(unit, value, quantity);
  $: if (!focused) text = toText(unitFromSI(shown, value));

  // Trim float noise from the conversion (310.92777777777775 → 310.927777778) without rounding
  // away real precision; inputs never show locale grouping.
  function toText(v: number): string {
    return Number.isFinite(v) ? String(Number(v.toPrecision(12))) : '';
  }

  function commit() {
    const n = Number(text);
    if (!Number.isFinite(n) || text.trim() === '') {
      text = toText(unitFromSI(shown, value)); // revert rubbish rather than storing it
      return;
    }
    let si = unitToSI(shown, n);
    if (min !== undefined) si = Math.max(min, si);
    if (max !== undefined) si = Math.min(max, si);
    if (si !== value) dispatch('commit', si);
    text = toText(unitFromSI(shown, si));
  }
</script>

<span class="unit-input">
  <input
    type="number"
    {id} {disabled} {step}
    min={min !== undefined ? Number(unitFromSI(shown, min).toPrecision(12)) : undefined}
    max={max !== undefined ? Number(unitFromSI(shown, max).toPrecision(12)) : undefined}
    style={width ? `width: ${width};` : undefined}
    value={text}
    on:input={(e) => (text = e.currentTarget.value)}
    on:focus={() => (focused = true)}
    on:blur={() => { focused = false; }}
    on:change={commit}
  />
  {#if $unitPrefsLocked}
    <span class="unit">{unitIdLabel(shown)}</span>
  {:else}
    <button
      type="button" class="unit clickable" tabindex="-1"
      title="Change unit — every {bodyType} {quantity} follows"
      on:click|stopPropagation={() => cycleUnitPref(quantity, bodyType)}>{unitIdLabel(shown)}</button>
  {/if}
</span>

<style>
  .unit-input {
    display: inline-flex;
    align-items: baseline;
    gap: 4px;
    white-space: nowrap;
  }
  .unit {
    font-size: 0.92em;
    color: var(--text-muted, #8a8f9a);
  }
  button.unit {
    background: none;
    border: none;
    padding: 0;
    margin: 0;
    font: inherit;
    font-size: 0.92em;
    cursor: pointer;
    text-decoration: underline dotted;
    text-underline-offset: 2px;
  }
  button.unit:hover { color: var(--accent, #ff5a1f); }
</style>
