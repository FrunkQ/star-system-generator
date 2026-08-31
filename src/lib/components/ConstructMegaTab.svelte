<script lang="ts">
  // THE KNOB EDITOR (G58, design §4c) — the tab is GENERIC and the registry is the UI.
  //
  // Nothing in this file knows what a ringworld is. Every row below is generated from the record's
  // own `MegaParamDef`s — label, unit, hint, soft slider range (log-scaled where declared), hard
  // typed range, amber/red band sentences, coherent seed — which were OverrideDef-shaped from day
  // one precisely so a generic row could render them. Add a param to a record and the slider
  // exists; add a record and the whole tab exists. That is the owner's "custom slider" ask
  // delivered as declaration, not as another hand-built panel (DATA-R33).
  //
  // Storage is SPARSE (`construct.megaParams`, resolved only through `instanceMegaParams`): a row
  // stores its value only when it differs from the seed, so a save says what the GM chose and old
  // instances keep drinking seed improvements. Reset deletes the key. Values feed derive()/shape()
  // and the starlight-occlusion chain on the next process pass — these sliders move temperatures.
  import { createEventDispatcher } from 'svelte';
  import type { CelestialBody, System } from '$lib/types';
  import { megaTypeDef, instanceMegaParams, type MegaParamDef } from '$lib/constructs/megaTypes';
  import { megaSummaryLine } from '$lib/constructs/megaPreview';

  export let construct: CelestialBody;
  export let system: System | null = null;

  const dispatch = createEventDispatcher();

  $: def = megaTypeDef(construct.megaType);
  // The GRAVITATIONAL parent is the structure's host (a mega is centred on / anchored to it).
  $: host = (system?.nodes.find((n) => n.id === construct.parentId) ?? null) as CelestialBody | null;
  $: resolved = def && host ? instanceMegaParams(construct, def, host) : null;
  $: derived = def && host && resolved ? def.derive(resolved, host) : null;
  $: summary = derived && host ? megaSummaryLine(derived, host) : '';

  const SLIDER_STEPS = 1000;

  function toSlider(p: MegaParamDef, v: number): number {
    const [lo, hi] = p.soft;
    if (p.log && lo > 0 && hi > lo) {
      return Math.round((Math.log(Math.max(lo, Math.min(hi, v)) / lo) / Math.log(hi / lo)) * SLIDER_STEPS);
    }
    return Math.round(((Math.max(lo, Math.min(hi, v)) - lo) / (hi - lo)) * SLIDER_STEPS);
  }

  function fromSlider(p: MegaParamDef, pos: number): number {
    const [lo, hi] = p.soft;
    const t = Math.max(0, Math.min(SLIDER_STEPS, pos)) / SLIDER_STEPS;
    const raw = p.log && lo > 0 ? lo * Math.pow(hi / lo, t) : lo + (hi - lo) * t;
    // Snap to the declared step so the slider and the number box speak the same values.
    const snapped = p.step > 0 ? Math.round(raw / p.step) * p.step : raw;
    return Number(snapped.toFixed(Math.max(0, p.decimals)));
  }

  function setValue(p: MegaParamDef, v: number) {
    if (!def || !host || !Number.isFinite(v)) return;
    // The HARD range is exactly "how far a TYPED number may go" — the one boundary that clamps.
    const clamped = Math.max(p.hard[0], Math.min(p.hard[1], v));
    const seed = p.seed(host);
    const next: Record<string, number> = { ...(construct.megaParams ?? {}) };
    if (clamped === seed) delete next[p.key];
    else next[p.key] = clamped;
    if (Object.keys(next).length === 0) delete construct.megaParams;
    else construct.megaParams = next;
    construct = construct;
    dispatch('update');
  }

  function reset(p: MegaParamDef) {
    if (!construct.megaParams) return;
    const next = { ...construct.megaParams };
    delete next[p.key];
    if (Object.keys(next).length === 0) delete construct.megaParams;
    else construct.megaParams = next;
    construct = construct;
    dispatch('update');
  }

  /** The band sentence for the current value: red (`possible`/`breaks`) outranks amber
   *  (`plausible`/`absurd`); inside both bands there is nothing to say. Never a refusal. */
  function bandNote(p: MegaParamDef, v: number): { tone: 'amber' | 'red'; text: string } | null {
    if (!host) return null;
    const red = p.possible?.(host);
    if (red && (v < red[0] || v > red[1]) && p.breaks) return { tone: 'red', text: p.breaks };
    const amber = p.plausible(host);
    if (amber && (v < amber[0] || v > amber[1])) return { tone: 'amber', text: p.absurd };
    return null;
  }

  const fmt = (p: MegaParamDef, v: number) => v.toFixed(Math.max(0, p.decimals));
</script>

<div class="tab-panel">
  {#if def && host && resolved}
    <h4>{def.label} — structure</h4>
    {#each def.params as p (p.key)}
      {@const v = resolved[p.key]}
      {@const note = bandNote(p, v)}
      {@const pinned = construct.megaParams?.[p.key] !== undefined}
      <div class="form-group">
        <label for={`mega-${p.key}`}>
          {p.label}{p.unit ? ` (${p.unit})` : ''}
          {#if pinned}
            <button class="reset" title="Back to the default for this host" on:click={() => reset(p)}>reset</button>
          {/if}
        </label>
        <div class="row knob">
          <input
            type="range" min="0" max={SLIDER_STEPS} step="1"
            value={toSlider(p, v)}
            on:input={(e) => setValue(p, fromSlider(p, Number(e.currentTarget.value)))}
          />
          <input
            class="num" type="number" id={`mega-${p.key}`}
            min={p.hard[0]} max={p.hard[1]} step={p.step}
            value={fmt(p, v)}
            on:change={(e) => setValue(p, Number(e.currentTarget.value))}
          />
        </div>
        <div class="hint">{p.hint}</div>
        {#if note}
          <div class="band {note.tone}">{note.text}</div>
        {/if}
      </div>
    {/each}
    {#if summary}
      <div class="separator"></div>
      <div class="derived">{summary}</div>
    {/if}
  {:else if def}
    <div class="hint">This structure's host is not in the system, so its figures cannot be derived.</div>
  {/if}
</div>

<style>
  .tab-panel { padding: 10px; display: flex; flex-direction: column; gap: 15px; width: 100%; box-sizing: border-box; overflow-x: hidden; }
  .row { display: flex; gap: 15px; }
  .knob { align-items: center; gap: 10px; }
  .form-group { display: flex; flex-direction: column; flex: 1; }
  label { margin-bottom: 5px; color: var(--text-muted); font-size: 0.9em; display: flex; align-items: baseline; gap: 8px; }
  input[type='number'] { padding: 8px; border-radius: 4px; border: 1px solid var(--border); background-color: var(--bg-control); color: var(--text); font-size: 1em; box-sizing: border-box; }
  .num { width: 9em; flex: 0 0 auto; }
  input[type='range'] { flex: 1; width: 100%; }
  h4 { margin: 0.5em 0 0 0; color: #ff9900; }
  .separator { height: 1px; background-color: var(--border); width: 100%; margin: 0; }
  .hint { color: var(--text-muted); font-size: 0.8em; }
  .band { font-size: 0.85em; padding: 4px 8px; border-radius: 4px; }
  .band.amber { color: #ffc966; background: rgba(255, 153, 0, 0.12); }
  .band.red { color: #ff8080; background: rgba(255, 64, 64, 0.12); }
  .derived { color: #ff9900; font-size: 0.9em; }
  .reset { background: none; border: 1px solid var(--border); color: var(--text-muted); border-radius: 3px; font-size: 0.75em; padding: 1px 6px; cursor: pointer; }
  .reset:hover { color: var(--text); }
</style>
