<script lang="ts">
  // THE OVERRIDES TAB (G37) — every quantity a GM has pinned by hand, in one place.
  //
  // THIS COMPONENT KNOWS NOTHING ABOUT ANY PARTICULAR OVERRIDE. Every label, unit, range, derived
  // default and warning sentence comes from the roster in `$lib/physics/overrides.ts`. That is the
  // point of the tab: before it, four editors each held one override with its own seed, its own
  // clamp, its own reset wording and its own idea of what "overridden" looked like, and one override
  // (`flareActivity`) had no editor at all. A ninth override is a record in the roster, not a row here.
  //
  // WARN, NEVER STOP. A figure outside the plausible band is kept, saved, fed into the derivation and
  // LABELLED — the same rule the star editor has always followed. Nothing on this tab clamps to a
  // plausible range; the only limit is the roster's absurd-but-finite `hard` pair, which exists so a
  // typo cannot produce an Infinity the solve has to survive.
  import { createEventDispatcher } from 'svelte';
  import type { CelestialBody } from '$lib/types';
  import {
    overrideDefsFor, overrideStatus, formatOverrideValue, setOverride, clearOverride, overrideSeverity,
    type OverrideDef, type OverrideKey
  } from '$lib/physics/overrides';
  import { tagCategories, addTagToCategory } from '$lib/tags/tagCategories';
  import { describeTag } from '$lib/tags/tagPresentation';

  export let body: CelestialBody;

  const dispatch = createEventDispatcher();

  // Re-read on every body change AND on every update tick: a pin changes what the engine derives, so
  // the derived column beside it moves as soon as the processor has run.
  $: defs = overrideDefsFor(body);
  $: rows = defs.map((d) => overrideStatus(body, d));
  $: pinnedCount = rows.filter((r) => r.pinned).length;

  function pin(def: OverrideDef) {
    const seed = def.derived(body);
    setOverride(body, def.key, Number.isFinite(seed as number) ? (seed as number) : def.soft[0]);
    body = body;
    dispatch('update');
  }
  function unpin(def: OverrideDef) {
    clearOverride(body, def.key);
    body = body;
    dispatch('update');
  }
  function edit(def: OverrideDef, raw: number | string) {
    const v = typeof raw === 'number' ? raw : parseFloat(raw);
    if (!Number.isFinite(v)) return;
    // `setOverride` runs the record's own `commit` consequence, if it has one — no branch here.
    setOverride(body, def.key, v);
    body = body;
  }
  const commit = () => dispatch('update');

  // A pin's own CHOICE, rendered generically. Density has the only one today: which of mass and
  // radius is the second quantity being held, with the third following from the relation (owner Q1).
  // Changing it re-runs the pin's consequence, so the world rearranges to match immediately.
  const choiceValue = (b: CelestialBody, def: OverrideDef): string =>
    (def.choice && (b.overrides as Record<string, unknown> | undefined)?.[def.choice.key] as string)
      || def.choice?.fallback || '';
  function setChoice(def: OverrideDef, value: string) {
    if (!def.choice || !body.overrides) return;
    (body.overrides as Record<string, unknown>)[def.choice.key] = value;
    const current = (body.overrides as Record<string, number>)[def.key];
    if (typeof current === 'number') setOverride(body, def.key, current);
    body = body;
    dispatch('update');
  }

  // ── The ANOMALY binding: the GM's stated REASON for a pin. ──────────────────────────────────────
  // A tag DEFINITION lives in the Anomaly category and survives everything; an ASSIGNMENT lives on
  // the override and dies with it (`clearOverride`). The picker is here rather than on the Tags tab
  // because the reason only means anything beside the thing it is explaining.
  $: anomalyCat = $tagCategories.find((c) => c.id === 'anomaly');
  $: anomalyTags = (anomalyCat?.tags ?? []).slice().sort((a, b) => a.label.localeCompare(b.label));
  const assignmentFor = (b: CelestialBody, key: OverrideKey) => b.overrides?.anomalies?.[key];

  function setAnomaly(key: OverrideKey, tag: string) {
    if (!body.overrides) return;
    if (!tag) {
      const map = body.overrides.anomalies;
      if (map) { delete map[key]; if (!Object.keys(map).length) delete body.overrides.anomalies; }
    } else {
      body.overrides.anomalies = body.overrides.anomalies || {};
      const was = body.overrides.anomalies[key];
      body.overrides.anomalies[key] = { tag, ...(was?.secret ? { secret: true } : {}) };
    }
    body = body;
    dispatch('update');
  }
  function toggleAnomalySecret(key: OverrideKey) {
    const a = body.overrides?.anomalies?.[key];
    if (!a) return;
    if (a.secret) delete a.secret; else a.secret = true;
    body = body;
    dispatch('update');
  }

  // Add-your-own, in place. The Anomaly category is a category like any other, so this is the same
  // mutator the tagging settings use — not a second way to define a tag.
  let newAnomalyFor: OverrideKey | null = null;
  let newAnomalyName = '';
  function addAnomaly(key: OverrideKey) {
    const label = newAnomalyName.trim();
    if (!label) return;
    const added = addTagToCategory('anomaly', label);
    if (added) setAnomaly(key, added);
    newAnomalyName = ''; newAnomalyFor = null;
  }

  // A log slider maps its travel onto the DECADES between the soft bounds, so a field strength or a
  // pressure is draggable across the range where it actually varies. The zero end is the floor of the
  // soft range rather than a true zero, which cannot be logged; typing 0 still works.
  const LOG_FLOOR = 1e-4;
  const toSlider = (def: OverrideDef, v: number): number => {
    if (!def.log) return v;
    const lo = Math.log(Math.max(LOG_FLOOR, def.soft[0] || LOG_FLOOR));
    const hi = Math.log(Math.max(lo + 1e-9, def.soft[1]));
    return ((Math.log(Math.max(LOG_FLOOR, v)) - lo) / (hi - lo)) * 100;
  };
  const fromSlider = (def: OverrideDef, pct: number): number => {
    if (!def.log) return pct;
    const lo = Math.log(Math.max(LOG_FLOOR, def.soft[0] || LOG_FLOOR));
    const hi = Math.log(Math.max(lo + 1e-9, def.soft[1]));
    return Math.exp(lo + (pct / 100) * (hi - lo));
  };

  // ── THE SLIDER'S OWN TRACK ─────────────────────────────────────────────────────────────────────
  // OWNER, 2026-08-22: "a green zone of the sliders to show the actual CORRECT/calculated value.
  // Also highlight red what is TOTALLY IMPOSSIBLE (negative albedo) rather than impossible (too high
  // magnetic field)."
  //
  // So the track carries three things and each is a different claim:
  //   GREEN  where the physics' own answer sits — the figure Reset would return to.
  //   AMBER  the stretch that is implausible for THIS body but breaks no law.
  //   RED    the stretch that is impossible for anything, ever.
  // All three come from the roster (`plausible`, `possible`, `derived`), so a ninth override draws
  // its own track without a line of code here.
  //
  // Percentages are along the SOFT range, which is what the slider spans; a figure typed beyond
  // either end simply pins the marker to that end rather than drawing outside the track.
  const pctOf = (def: OverrideDef, v: number): number =>
    Math.max(0, Math.min(100, def.log
      ? toSlider(def, v)
      : ((v - def.soft[0]) / Math.max(1e-12, def.soft[1] - def.soft[0])) * 100));

  /** The value a point along the track stands for — the inverse of `pctOf`. */
  const valueAtPct = (def: OverrideDef, pct: number): number =>
    def.log ? fromSlider(def, pct) : def.soft[0] + (pct / 100) * (def.soft[1] - def.soft[0]);

  /**
   * The zone gradient, coloured by asking `overrideSeverity` — the SAME function that writes the
   * warning. One authority for "how wrong is this figure", so the colour under the thumb and the
   * sentence under the slider can never disagree.
   *
   * The stops are the band EDGES projected onto the track, so the bands land exactly where the thumb
   * does at the same value. Each sub-interval is coloured by the severity at its midpoint, which is
   * safe because severity is piecewise-constant between edges.
   */
  function trackGradient(def: OverrideDef, b: CelestialBody): string {
    const band = def.plausible(b);
    const hard = def.possible?.(b) ?? null;
    const edges = [0, 100];
    for (const pair of [band, hard]) {
      if (!pair) continue;
      for (const v of pair) {
        const x = pctOf(def, v);
        if (x > 0.01 && x < 99.99) edges.push(x);
      }
    }
    const cuts = [...new Set(edges.map((x) => +x.toFixed(3)))].sort((x, y) => x - y);
    const colour = { ok: 'var(--ovr-ok)', implausible: 'var(--ovr-warn)', impossible: 'var(--ovr-bad)' };
    const parts: string[] = [];
    for (let i = 0; i < cuts.length - 1; i++) {
      const mid = (cuts[i] + cuts[i + 1]) / 2;
      const c = colour[overrideSeverity(def, b, valueAtPct(def, mid))];
      parts.push(`${c} ${cuts[i]}%`, `${c} ${cuts[i + 1]}%`);
    }
    return `linear-gradient(to right, ${parts.join(', ')})`;
  }
</script>

<div class="tab-panel">
  <p class="lede">
    Values you have pinned by hand. Everything else on this body is derived by the physics engine; a
    pinned value is saved and fed into the derivation <em>instead of</em> the computed one, so
    everything downstream of it follows honestly. Nothing here is refused — a figure the physics
    cannot account for is kept and labelled.
  </p>

  {#if !defs.length}
    <p class="empty">Nothing on this kind of object can be overridden.</p>
  {/if}

  {#each rows as r (r.def.key)}
    <div class="ovr-row" class:pinned={r.pinned} class:implausible={r.severity === 'implausible'}
         class:impossible={r.severity === 'impossible'}>
      <div class="row-head">
        <span class="name">{r.def.label}</span>
        {#if r.pinned}
          <span class="pill pinned-pill" title="Pinned by hand. The physics reads this figure instead of its own.">pinned</span>
        {:else}
          <span class="pill derived-pill" title="Derived by the engine every run.">derived</span>
        {/if}
        {#if r.pinned}
          <span class="num-wrap">
            <input type="number" step={r.def.step} value={r.value}
                   on:input={(e) => edit(r.def, e.currentTarget.value)} on:change={commit} />
            {#if r.def.unit}<span class="unit">{r.def.unit}</span>{/if}
          </span>
          <button type="button" class="link-btn" on:click={() => unpin(r.def)}
                  title="Delete the pin and hand the quantity back to the physics. Its anomaly tag goes with it.">Reset to calculated ↺</button>
        {:else}
          <span class="reading">{formatOverrideValue(r.def, r.value)}</span>
          <button type="button" class="link-btn" on:click={() => pin(r.def)}>Pin…</button>
        {/if}
      </div>

      {#if r.pinned}
        <!-- THE ZONES ARE THE SLIDER'S OWN TRACK, which is the only way they can be guaranteed to
             line up with the thumb — a separate bar above it spans its container while the range
             input spans whatever is left beside the number box, and the two drift apart. Same
             pattern as the Day Length and orbit controls: gradient into the runnable track, markers
             absolutely positioned over the wrap. -->
        <div class="slider-wrap">
          <input class="ovr-slider" type="range"
                 min={r.def.log ? 0 : r.def.soft[0]} max={r.def.log ? 100 : r.def.soft[1]}
                 step={r.def.log ? 0.1 : r.def.step}
                 value={toSlider(r.def, r.value ?? 0)}
                 style="--ovr-track: {trackGradient(r.def, body)};"
                 on:input={(e) => edit(r.def, fromSlider(r.def, parseFloat(e.currentTarget.value)))}
                 on:change={commit}
                 aria-label="{r.def.label} — {formatOverrideValue(r.def, r.def.soft[0])} to {formatOverrideValue(r.def, r.def.soft[1])}" />
          {#if r.derived != null && Number.isFinite(r.derived)}
            <span class="calc-notch" style="left: {pctOf(r.def, r.derived).toFixed(1)}%"
                  title="The physics' own answer: {formatOverrideValue(r.def, r.derived)}"></span>
          {/if}
        </div>
        <div class="scale">
          <span>{formatOverrideValue(r.def, r.def.soft[0])}</span>
          <span>{formatOverrideValue(r.def, r.def.soft[1])}</span>
        </div>
        {#if r.def.choice}
          <div class="anomaly-row">
            <label class="anom-lbl" for="hold-{r.def.key}">{r.def.choice.label}</label>
            <select id="hold-{r.def.key}" value={choiceValue(body, r.def)}
                    on:change={(e) => setChoice(r.def, e.currentTarget.value)}>
              {#each r.def.choice.options as o (o.value)}<option value={o.value}>{o.label}</option>{/each}
            </select>
          </div>
        {/if}
        <div class="derived-note">
          {#if r.derived != null}
            The physics says <strong>{formatOverrideValue(r.def, r.derived)}</strong>.
          {:else}
            <!-- The engine's own answer is suppressed by the pin itself, so quoting it here would
                 quote the pin straight back. Reset restores it; see OverrideDef.derived. -->
            The engine's own answer returns when you reset this.
          {/if}
          The slider covers {formatOverrideValue(r.def, r.def.soft[0])} to
          {formatOverrideValue(r.def, r.def.soft[1])}; type a figure beyond either end if you want one.
        </div>
        {#if r.warning}
          <p class="warn" class:breaks={r.severity === 'impossible'} role="status">{r.warning}</p>
        {/if}

        {#key r.def.key}
          {@const a = assignmentFor(body, r.def.key)}
          <div class="anomaly-row">
            <label class="anom-lbl" for="anom-{r.def.key}">Because…</label>
            <select id="anom-{r.def.key}" value={a?.tag ?? ''} on:change={(e) => setAnomaly(r.def.key, e.currentTarget.value)}>
              <option value="">(no reason given — players see nothing)</option>
              {#each anomalyTags as t (t.key)}<option value={t.key}>{t.label}</option>{/each}
            </select>
            {#if a?.tag}
              {@const info = describeTag(a.tag)}
              <span class="anom-chip" style="background:{info.color}; color:{info.textColor || '#fff'}" title={info.description}>{info.label}</span>
              <button type="button" class="link-btn" on:click={() => toggleAnomalySecret(r.def.key)}
                      title={a.secret ? 'Players never see this reason. Click to reveal it.' : 'Players can see this reason. Click to keep it to yourself.'}>{a.secret ? 'hidden' : 'hide'}</button>
            {:else}
              <button type="button" class="link-btn" on:click={() => { newAnomalyFor = newAnomalyFor === r.def.key ? null : r.def.key; newAnomalyName = ''; }}>new…</button>
            {/if}
          </div>
          {#if newAnomalyFor === r.def.key}
            <div class="anomaly-new">
              <input type="text" bind:value={newAnomalyName} placeholder="e.g. Tomb of the First Engineers"
                     on:keydown={(e) => { if (e.key === 'Enter') addAnomaly(r.def.key); }} />
              <button type="button" class="link-btn" on:click={() => addAnomaly(r.def.key)} disabled={!newAnomalyName.trim()}>Add to Anomaly</button>
            </div>
          {/if}
        {/key}
      {/if}

      <p class="hint">{r.def.hint}</p>
    </div>
  {/each}

  {#if defs.length && !pinnedCount}
    <p class="empty">Nothing is pinned on this body — every figure it carries is the engine's own.</p>
  {/if}
</div>

<style>
  .tab-panel { padding: 10px; display: flex; flex-direction: column; gap: 12px; }
  .lede { margin: 0; font-size: 0.72em; color: var(--text-faint); line-height: 1.4; }
  .empty { margin: 0; font-size: 0.75em; color: var(--text-faint); font-style: italic; }
  .ovr-row {
    display: flex; flex-direction: column; gap: 5px;
    padding: 8px; border-radius: 4px;
    background: var(--bg-card, #252525);
    border-left: 3px solid var(--border);
  }
  .ovr-row.pinned { border-left-color: #d08a4a; }
  .ovr-row.pinned.implausible { border-left-color: #d08a4a; }
  .ovr-row.pinned.impossible { border-left-color: #e05252; }
  .row-head { display: flex; align-items: center; gap: 7px; flex-wrap: wrap; }
  .name { font-size: 0.82em; color: var(--text); }
  .reading { margin-left: auto; font-variant-numeric: tabular-nums; font-size: 0.82em; color: var(--text-muted); }
  .reading.is-pinned { color: #d08a4a; }
  .pill {
    font-size: 0.6em; text-transform: uppercase; letter-spacing: 0.05em;
    padding: 1px 5px; border-radius: 3px; border: 1px solid currentColor;
  }
  .pinned-pill { color: #d08a4a; }
  .derived-pill { color: var(--text-faint); }
  .num-wrap { display: flex; align-items: center; gap: 4px; margin-left: auto; }
  .num-wrap input {
    width: 92px; padding: 4px 6px; border-radius: 4px;
    border: 1px solid var(--border); background: var(--bg-control); color: var(--text);
    font-variant-numeric: tabular-nums; text-align: right;
  }
  .unit { font-size: 0.72em; color: var(--text-faint); }
  .derived-note { font-size: 0.68em; color: var(--text-faint); line-height: 1.35; }
  .warn {
    margin: 0; font-size: 0.7em; line-height: 1.35; color: #d08a4a;
    border-left: 2px solid #d08a4a; padding-left: 6px;
  }
  /* Impossible reads louder than implausible, because it is a different claim. */
  .warn.breaks { color: #e05252; border-left-color: #e05252; }

  /* THE HOUSE SLIDER, same shape as Day Length and the composition controls: the zone gradient IS
     the runnable track, so it cannot drift out of scale with the thumb. */
  .ovr-row { --ovr-ok: #3c9a5f; --ovr-warn: #e07b39; --ovr-bad: #c0392b; }
  .slider-wrap { position: relative; padding: 2px 0; }
  .ovr-slider {
    width: 100%; margin: 0; -webkit-appearance: none; appearance: none;
    background: transparent; cursor: pointer;
  }
  .ovr-slider::-webkit-slider-runnable-track {
    height: 10px; border-radius: 5px; background: var(--ovr-track);
    border: 1px solid rgba(0, 0, 0, 0.25);
  }
  .ovr-slider::-moz-range-track {
    height: 10px; border-radius: 5px; background: var(--ovr-track);
    border: 1px solid rgba(0, 0, 0, 0.25);
  }
  .ovr-slider::-webkit-slider-thumb {
    -webkit-appearance: none; appearance: none; width: 16px; height: 16px; margin-top: -4px;
    border-radius: 50%; background: #fff; border: 2px solid #222; box-shadow: 0 1px 3px rgba(0,0,0,0.4);
  }
  .ovr-slider::-moz-range-thumb {
    width: 16px; height: 16px; border-radius: 50%; background: #fff; border: 2px solid #222;
    box-shadow: 0 1px 3px rgba(0,0,0,0.4);
  }
  /* Where the engine's own answer sits — the figure Reset returns to. Same idea as the tidal-lock
     notch on Day Length: a mark ON the track, at the value it stands for. */
  .calc-notch {
    position: absolute; top: 0; bottom: 0; width: 3px; transform: translateX(-50%);
    border-radius: 2px; background: #eaf7ee; box-shadow: 0 0 0 1px rgba(0,0,0,0.45);
    pointer-events: none;
  }
  .scale { display: flex; justify-content: space-between; font-size: 0.66em; color: var(--text-faint); }
  .hint { margin: 0; font-size: 0.68em; color: var(--text-faint); line-height: 1.35; }
  .anomaly-row { display: flex; align-items: center; gap: 6px; flex-wrap: wrap; }
  .anom-lbl { font-size: 0.68em; color: var(--text-faint); }
  .anomaly-row select {
    flex: 1; min-width: 120px; padding: 4px 6px; border-radius: 4px; font-size: 0.75em;
    border: 1px solid var(--border); background: var(--bg-control); color: var(--text);
  }
  .anom-chip {
    border-radius: var(--tag-pill-radius); padding: var(--tag-pill-pad-y) var(--tag-pill-pad-x);
    font-size: var(--tag-pill-font-size);
  }
  .anomaly-new { display: flex; align-items: center; gap: 6px; }
  .anomaly-new input {
    flex: 1; min-width: 0; padding: 4px 6px; border-radius: 4px; font-size: 0.75em;
    border: 1px solid var(--border); background: var(--bg-control); color: var(--text);
  }
  .link-btn {
    background: none; border: none; padding: 0; cursor: pointer;
    color: var(--link, #6aa0d8); font-size: 0.7em;
  }
  .link-btn:hover { text-decoration: underline; }
</style>
