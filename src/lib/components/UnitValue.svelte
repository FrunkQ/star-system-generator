<script lang="ts">
  // G34 — a read-only value whose unit is the click target. Clicking cycles the ladder stop for
  // this quantity × body type and EVERY field showing that pairing follows at once (the pref is
  // campaign data on the starmap). Player views set `unitPrefsLocked` and get a plain label.
  // `value` is ALWAYS SI (K, kg, km, km/s) — storage never leaves SI; this only relabels.
  import { unitPrefs, unitPrefsLocked, cycleUnitPref } from '../unitPrefsStore';
  import {
    resolveUnitPref, resolveAutoUnit, unitFromSI, unitIdLabel, formatUnitNum,
    type UnitQuantity, type UnitBodyType
  } from '../units';

  export let quantity: UnitQuantity;
  export let bodyType: UnitBodyType;
  export let value: number;                       // SI: K / kg / km / km·s⁻¹
  export let decimals: number | undefined = undefined;

  $: unit = resolveUnitPref($unitPrefs, quantity, bodyType);
  $: shown = resolveAutoUnit(unit, value);        // 'auto' (orbit) picks km/AU by magnitude
  $: num = formatUnitNum(shown, unitFromSI(shown, value), decimals);
</script>

{#if Number.isFinite(value)}
  <span class="unit-value">{num}&nbsp;{#if $unitPrefsLocked}<span class="unit">{unitIdLabel(shown)}</span>{:else}<button
    type="button" class="unit clickable"
    title="Change unit — every {bodyType} {quantity} follows"
    on:click|stopPropagation={() => cycleUnitPref(quantity, bodyType)}>{unitIdLabel(shown)}</button>{/if}</span>
{:else}
  <span class="unit-value">—</span>
{/if}

<style>
  .unit-value { white-space: nowrap; }
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
