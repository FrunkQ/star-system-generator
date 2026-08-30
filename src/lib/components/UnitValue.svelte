<script lang="ts">
  // G34 — a read-only value whose unit is the click target. Clicking cycles the ladder stop for
  // this quantity × body type and EVERY field showing that pairing follows at once (the pref is
  // campaign data on the starmap). Player views set `unitPrefsLocked` and get a plain label.
  // `value` is ALWAYS SI (K, kg, km, km/s) — storage never leaves SI; this only relabels.
  import { unitPrefs, unitPrefsLocked, cycleUnitPref } from '../unitPrefsStore';
  import {
    resolveUnitPref, resolveAutoUnit, unitFromSI, unitIdLabel, formatUnitNum, groupRefValue, quantityNoun,
    type UnitQuantity, type UnitBodyType
  } from '../units';

  export let quantity: UnitQuantity;
  export let bodyType: UnitBodyType;
  export let value: number = NaN;                 // SI: K / kg / km / km·s⁻¹ / m³ / W
  export let decimals: number | undefined = undefined;
  // SEVERAL readings of ONE quantity that must share a unit — a hull's three axes, a current/max
  // pair. They render as one value with ONE unit button, because they are one reading and cycling
  // them apart is the thing this component exists to prevent (A80: "one click cycling all three
  // together, never three separate prefs").
  export let values: number[] | undefined = undefined;
  export let separator = ' × ';

  $: list = values ?? [value];
  // The MIDDLE of the group picks the rung (see groupRefValue) so every member stays readable,
  // not just the biggest. Shared with formatPrefValues so the card and the report cannot drift.
  $: ref = groupRefValue(list);
  $: unit = resolveUnitPref($unitPrefs, quantity, bodyType);
  $: shown = resolveAutoUnit(unit, ref, quantity); // 'auto' resolves by the QUANTITY's rule
  $: nums = list.map((v) => formatUnitNum(shown, unitFromSI(shown, v), decimals, unit === 'auto'));
  $: renderable = list.length > 0 && list.every((v) => Number.isFinite(v));
</script>

{#if renderable}
  <span class="unit-value">{nums.join(separator)}&nbsp;{#if $unitPrefsLocked}<span class="unit">{unitIdLabel(shown)}</span>{:else}<button
    type="button" class="unit clickable"
    title="Change unit — every {bodyType} {quantityNoun(quantity)} follows"
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
