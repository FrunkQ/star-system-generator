<script lang="ts">
  import { createEventDispatcher } from 'svelte';
  import type {
    BucketDrainCalendarDefinition,
    RatioLinearCalendarDefinition,
    Starmap,
    TemporalCalendarDefinition
  } from '$lib/types';
  import { ensureTemporalState } from '$lib/temporal/defaults';

  export let showModal: boolean;
  export let starmap: Starmap;

  const dispatch = createEventDispatcher();

  let initializedForOpen = false;
  let workingTemporal: NonNullable<Starmap['temporal']> | null = null;
  let selectedKey = '';

  $: if (showModal && !initializedForOpen) {
    const normalized = ensureTemporalState(starmap);
    workingTemporal = JSON.parse(JSON.stringify(normalized.temporal)) as NonNullable<Starmap['temporal']>;
    selectedKey = workingTemporal.activeCalendarKey || Object.keys(workingTemporal.temporal_registry)[0] || '';
    initializedForOpen = true;
  }

  $: if (!showModal) {
    initializedForOpen = false;
  }

  $: calendarKeys = workingTemporal ? Object.keys(workingTemporal.temporal_registry) : [];
  $: selectedCalendar = workingTemporal?.temporal_registry[selectedKey];
  $: if (selectedCalendar && selectedCalendar.math_type === 'BUCKET_DRAIN') {
    const fallbackId = selectedCalendar.id || toCalendarId(selectedKey || 'calendar');
    selectedCalendar.hierarchy = selectedCalendar.hierarchy && selectedCalendar.hierarchy.length > 0
      ? selectedCalendar.hierarchy
      : createBucketTemplate(fallbackId).hierarchy;
    selectedCalendar.leap_logic = selectedCalendar.leap_logic || {
      drift_per_year_t: 0,
      threshold_t: 86400,
      apply_to: 'day'
    };
    selectedCalendar.lookup_tables = selectedCalendar.lookup_tables || {};
    selectedCalendar.lookup_tables.weekdays = selectedCalendar.lookup_tables.weekdays || ['Day 1', 'Day 2', 'Day 3', 'Day 4', 'Day 5', 'Day 6', 'Day 7'];
    selectedCalendar.lookup_tables.months = selectedCalendar.lookup_tables.months && selectedCalendar.lookup_tables.months.length > 0
      ? selectedCalendar.lookup_tables.months
      : createBucketTemplate(fallbackId).lookup_tables?.months;
  }
  $: if (selectedCalendar && selectedCalendar.math_type === 'RATIO_LINEAR') {
    selectedCalendar.parameters = selectedCalendar.parameters || {
      units_per_earth_year: 1000,
      seconds_per_earth_year: 31557600,
      precision_digits: 1
    };
  }

  let calendarKeys: string[] = [];
  let selectedCalendar: TemporalCalendarDefinition | undefined = undefined;

  function toCalendarId(name: string): string {
    const slug = name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '_')
      .replace(/^_+|_+$/g, '');
    return `CAL_${slug || 'custom'}`;
  }

  function createBucketTemplate(id: string): BucketDrainCalendarDefinition {
    return {
      id,
      math_type: 'BUCKET_DRAIN',
      epoch_offset_t: '0',
      format: '{hour:02}:{min:02}:{sec:02}, Day {day}, Year {year}',
      hierarchy: [
        { unit: 'year', multiplier: 31536000 },
        { unit: 'day', multiplier: 86400 },
        { unit: 'hour', multiplier: 3600 },
        { unit: 'min', multiplier: 60 },
        { unit: 'sec', multiplier: 1 }
      ],
      leap_logic: {
        drift_per_year_t: 0,
        threshold_t: 86400,
        apply_to: 'day'
      },
      lookup_tables: {
        weekdays: ['Day 1', 'Day 2', 'Day 3', 'Day 4', 'Day 5', 'Day 6', 'Day 7'],
        months: [
          { name: 'Month 1', days: 30 },
          { name: 'Month 2', days: 30 },
          { name: 'Month 3', days: 30 },
          { name: 'Month 4', days: 30 },
          { name: 'Month 5', days: 30 },
          { name: 'Month 6', days: 30 },
          { name: 'Month 7', days: 30 },
          { name: 'Month 8', days: 30 },
          { name: 'Month 9', days: 30 },
          { name: 'Month 10', days: 30 },
          { name: 'Month 11', days: 30 },
          { name: 'Month 12', days: 30 }
        ]
      }
    };
  }

  function createRatioTemplate(id: string): RatioLinearCalendarDefinition {
    return {
      id,
      math_type: 'RATIO_LINEAR',
      epoch_offset_t: '0',
      format: 'Stardate {val}',
      parameters: {
        units_per_earth_year: 1000,
        seconds_per_earth_year: 31557600,
        precision_digits: 1
      }
    };
  }

  function addCalendar() {
    if (!workingTemporal) return;
    let i = 1;
    let key = `New Calendar ${i}`;
    while (workingTemporal.temporal_registry[key]) {
      i++;
      key = `New Calendar ${i}`;
    }
    workingTemporal.temporal_registry[key] = createBucketTemplate(toCalendarId(key));
    selectedKey = key;
    workingTemporal = { ...workingTemporal };
  }

  function removeCalendar() {
    if (!workingTemporal || !selectedKey) return;
    if (calendarKeys.length <= 1) {
      alert('At least one calendar must remain.');
      return;
    }
    const nextKey = calendarKeys.find((k) => k !== selectedKey) || '';
    delete workingTemporal.temporal_registry[selectedKey];
    if (workingTemporal.activeCalendarKey === selectedKey) {
      workingTemporal.activeCalendarKey = nextKey;
    }
    selectedKey = nextKey;
    workingTemporal = { ...workingTemporal };
  }

  function renameCalendarKey(newKeyRaw: string) {
    if (!workingTemporal || !selectedKey) return;
    const newKey = newKeyRaw.trim();
    if (!newKey || newKey === selectedKey) return;
    if (workingTemporal.temporal_registry[newKey]) return;
    const value = workingTemporal.temporal_registry[selectedKey];
    delete workingTemporal.temporal_registry[selectedKey];
    value.id = toCalendarId(newKey);
    workingTemporal.temporal_registry[newKey] = value;
    if (workingTemporal.activeCalendarKey === selectedKey) {
      workingTemporal.activeCalendarKey = newKey;
    }
    selectedKey = newKey;
    workingTemporal = { ...workingTemporal };
  }

  function setMathType(type: 'BUCKET_DRAIN' | 'RATIO_LINEAR') {
    if (!workingTemporal || !selectedKey || !selectedCalendar || selectedCalendar.math_type === type) return;
    const epoch_offset_t = selectedCalendar.epoch_offset_t;
    const id = toCalendarId(selectedKey);
    workingTemporal.temporal_registry[selectedKey] = type === 'BUCKET_DRAIN'
      ? { ...createBucketTemplate(id), epoch_offset_t }
      : { ...createRatioTemplate(id), epoch_offset_t };
    workingTemporal = { ...workingTemporal };
  }

  function addMonth() {
    if (!selectedCalendar || selectedCalendar.math_type !== 'BUCKET_DRAIN') return;
    selectedCalendar.lookup_tables = selectedCalendar.lookup_tables || {};
    selectedCalendar.lookup_tables.months = selectedCalendar.lookup_tables.months || [];
    selectedCalendar.lookup_tables.months.push({
      name: `Month ${selectedCalendar.lookup_tables.months.length + 1}`,
      days: 30
    });
    workingTemporal = { ...workingTemporal! };
  }

  function removeMonth(index: number) {
    if (!selectedCalendar || selectedCalendar.math_type !== 'BUCKET_DRAIN') return;
    const months = selectedCalendar.lookup_tables?.months;
    if (!months || months.length <= 1) return;
    months.splice(index, 1);
    workingTemporal = { ...workingTemporal! };
  }

  function handleSave() {
    if (!workingTemporal) return;
    // Keep stable internal IDs without exposing them in UI.
    Object.entries(workingTemporal.temporal_registry).forEach(([key, calendar]) => {
      calendar.id = toCalendarId(key);
    });
    dispatch('save', { temporal: workingTemporal });
    dispatch('close');
  }
</script>

{#if showModal}
  <div class="modal-backdrop" on:click={() => dispatch('close')}>
    <div class="modal" on:click|stopPropagation>
      <div class="header">
        <h2>Edit Time & Calendars</h2>
        <p class="subtitle">Create and tune calendar systems. Choose the math model, then configure units and formatting.</p>
      </div>

      {#if workingTemporal}
        <div class="content">
          <aside class="calendar-list">
            <div class="list-title">Calendars</div>
            {#each calendarKeys as key}
              <button class:active={key === selectedKey} on:click={() => selectedKey = key}>{key}</button>
            {/each}
            <button class="add-btn" on:click={addCalendar}>+ Add Calendar</button>
            <button class="del-btn" on:click={removeCalendar}>Delete Selected</button>
          </aside>

          {#if selectedCalendar}
            <section class="editor">
              <div class="row">
                <div class="field">
                  <label title="Calendar name shown to users. Spaces are allowed.">Calendar Name</label>
                  <input type="text" value={selectedKey} on:change={(e) => renameCalendarKey((e.currentTarget as HTMLInputElement).value)} />
                </div>
              </div>

              <div class="row two">
                <div class="field">
                  <label title="BUCKET_DRAIN: decomposes seconds into year/day/hour/min/sec buckets. RATIO_LINEAR: linear conversion to a single running number.">Math Type</label>
                  <select value={selectedCalendar.math_type} on:change={(e) => setMathType((e.currentTarget as HTMLSelectElement).value as 'BUCKET_DRAIN' | 'RATIO_LINEAR')}>
                    <option value="BUCKET_DRAIN">Bucket Drain (calendar-like)</option>
                    <option value="RATIO_LINEAR">Ratio Linear (stardate-like)</option>
                  </select>
                </div>
                <div class="field">
                  <label title="Master-clock second used as this calendar's zero point.">Epoch Offset t (seconds from big bang you day ZERO starts)</label>
                  <input type="text" bind:value={selectedCalendar.epoch_offset_t} />
                </div>
              </div>

              <div class="row full-row">
                <div class="field full-width">
                  <label title="Render template. Bucket: use tokens like &#123;year&#125;, &#123;month&#125;, &#123;mday&#125;, &#123;hour:02&#125;. Ratio: use &#123;val&#125;.">Format</label>
                  <input type="text" bind:value={selectedCalendar.format} />
                </div>
              </div>

              {#if selectedCalendar.math_type === 'BUCKET_DRAIN'}
                <div class="section-title">Bucket Drain Setup</div>
                <div class="row five compact">
                  {#each selectedCalendar.hierarchy as unit}
                    <div class="field">
                      <label>{unit.unit} sec</label>
                      <input type="number" min="1" bind:value={unit.multiplier} />
                    </div>
                  {/each}
                </div>

                <div class="row three compact">
                  <div class="field">
                    <label title="Drift seconds applied per raw year before draining.">Leap drift/year (s)</label>
                    <input type="number" bind:value={selectedCalendar.leap_logic.drift_per_year_t} />
                  </div>
                  <div class="field">
                    <label title="Threshold in seconds to trigger leap carry behavior.">Leap threshold (s)</label>
                    <input type="number" bind:value={selectedCalendar.leap_logic.threshold_t} />
                  </div>
                  <div class="field">
                    <label title="Target unit for leap application.">Apply leap to</label>
                    <input type="text" bind:value={selectedCalendar.leap_logic.apply_to} />
                  </div>
                </div>

                <div class="row full-row">
                  <div class="field full-width">
                    <label title="Comma-separated names, in order.">Weekdays</label>
                    <input
                      type="text"
                      value={(selectedCalendar.lookup_tables?.weekdays || []).join(', ')}
                      on:change={(e) => {
                        selectedCalendar.lookup_tables = selectedCalendar.lookup_tables || {};
                        selectedCalendar.lookup_tables.weekdays = (e.currentTarget as HTMLInputElement).value.split(',').map((v) => v.trim()).filter(Boolean);
                        workingTemporal = { ...workingTemporal };
                      }}
                    />
                  </div>
                </div>

                <div class="section-title months-title">Months</div>
                <div class="months">
                  {#each selectedCalendar.lookup_tables?.months || [] as month, idx}
                    <div class="month-row">
                      <input type="text" bind:value={month.name} />
                      <input type="number" min="1" bind:value={month.days} />
                      <button class="small-del" on:click={() => removeMonth(idx)}>x</button>
                    </div>
                  {/each}
                </div>
                <button class="small-add" on:click={addMonth}>+ Add Month</button>
              {:else}
                <div class="section-title">Ratio Linear Setup</div>
                <div class="token-note">
                  Format token: <code>{`{val}`}</code> = computed running value from the ratio settings below.
                </div>
                <div class="row three compact">
                  <div class="field">
                    <label title="How many calendar units correspond to one Earth year.">Units / Earth year</label>
                    <input type="number" step="0.1" bind:value={selectedCalendar.parameters.units_per_earth_year} />
                  </div>
                  <div class="field">
                    <label title="Seconds used as one Earth year in this model.">Seconds / Earth year</label>
                    <input type="number" bind:value={selectedCalendar.parameters.seconds_per_earth_year} />
                  </div>
                  <div class="field">
                    <label title="Digits shown after decimal point for &#123;val&#125;.">Precision digits</label>
                    <input type="number" min="0" max="6" bind:value={selectedCalendar.parameters.precision_digits} />
                  </div>
                </div>
              {/if}

              <div class="row">
                <label class="active-calendar">
                  <input
                    type="radio"
                    checked={workingTemporal.activeCalendarKey === selectedKey}
                    on:change={() => {
                      workingTemporal!.activeCalendarKey = selectedKey;
                      workingTemporal = { ...workingTemporal! };
                    }}
                  />
                  Use this as active calendar for Display/Actual time
                </label>
              </div>
            </section>
          {/if}
        </div>
      {/if}

      <div class="footer">
        <button on:click={() => dispatch('close')}>Cancel</button>
        <button class="primary" on:click={handleSave}>Save Changes</button>
      </div>
    </div>
  </div>
{/if}

<style>
  .modal-backdrop {
    position: fixed;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    background: rgba(0, 0, 0, 0.7);
    display: flex;
    justify-content: center;
    align-items: center;
    z-index: 2000;
  }
  .modal {
    background: #1e1e1e;
    width: 980px;
    height: 88%;
    border-radius: 8px;
    display: flex;
    flex-direction: column;
    border: 1px solid #444;
  }
  .header {
    padding: 14px 16px;
    border-bottom: 1px solid #333;
    background: #252525;
  }
  .header h2 {
    margin: 0;
    color: #eee;
    font-size: 1.2em;
  }
  .subtitle {
    margin: 6px 0 0;
    color: #aaa;
    font-size: 0.85em;
  }
  .content {
    display: grid;
    grid-template-columns: 220px 1fr;
    flex: 1;
    min-height: 0;
  }
  .calendar-list {
    border-right: 1px solid #333;
    padding: 12px;
    display: flex;
    flex-direction: column;
    gap: 8px;
    overflow-y: auto;
  }
  .list-title {
    font-size: 0.9em;
    color: #bbb;
    margin-bottom: 4px;
  }
  .calendar-list button {
    text-align: left;
    background: #2c2c2c;
    border: 1px solid #3f3f3f;
    color: #ddd;
    border-radius: 4px;
    padding: 7px 8px;
    cursor: pointer;
  }
  .calendar-list button.active {
    border-color: #5a8ecf;
    background: #23466f;
  }
  .calendar-list .add-btn {
    border-style: dashed;
  }
  .calendar-list .del-btn {
    color: #ff9e9e;
  }
  .editor {
    padding: 14px;
    overflow-y: auto;
    display: flex;
    flex-direction: column;
    gap: 10px;
  }
  .row {
    display: flex;
    gap: 10px;
  }
  .row.full-row {
    width: 100%;
  }
  .row.two .field {
    width: 50%;
  }
  .row.three .field {
    width: 33.3%;
  }
  .row.five .field {
    width: 20%;
  }
  .row.five.compact .field input {
    max-width: 88px;
  }
  .row.compact input,
  .row.compact select {
    padding: 4px;
    font-size: 0.9em;
  }
  .field {
    display: flex;
    flex-direction: column;
    gap: 4px;
  }
  .field.full-width {
    width: 100%;
  }
  .field label {
    color: #9fa6b2;
    font-size: 0.78em;
  }
  input,
  select {
    background: #2b2b2b;
    border: 1px solid #474747;
    color: #eee;
    border-radius: 4px;
    padding: 6px 7px;
  }
  .section-title {
    margin-top: 6px;
    padding-top: 8px;
    border-top: 1px solid #333;
    color: #d4d8df;
    font-size: 0.9em;
    font-weight: 700;
  }
  .token-note {
    color: #b9c3d3;
    font-size: 0.82em;
    margin-top: 2px;
    margin-bottom: 4px;
  }
  .token-note code {
    background: #2f2f2f;
    border: 1px solid #4b4b4b;
    border-radius: 3px;
    padding: 1px 4px;
    color: #e8edf8;
  }
  .months-title {
    margin-bottom: 4px;
  }
  .months {
    display: flex;
    flex-direction: column;
    gap: 6px;
    max-height: 180px;
    overflow-y: auto;
    padding-right: 4px;
  }
  .month-row {
    display: grid;
    grid-template-columns: 1fr 90px 40px;
    gap: 6px;
  }
  .small-add,
  .small-del {
    background: #2f2f2f;
    border: 1px solid #4a4a4a;
    color: #ddd;
    border-radius: 4px;
    cursor: pointer;
    padding: 4px 8px;
  }
  .small-del {
    color: #f1a2a2;
  }
  .active-calendar {
    display: flex;
    align-items: center;
    gap: 8px;
    color: #cfd5df;
    font-size: 0.9em;
  }
  .footer {
    padding: 12px 16px;
    border-top: 1px solid #333;
    background: #252525;
    display: flex;
    justify-content: flex-end;
    gap: 10px;
  }
  .footer button {
    padding: 8px 18px;
    border: none;
    border-radius: 4px;
    cursor: pointer;
  }
  .footer .primary {
    background: #1f6fd1;
    color: white;
  }
</style>
