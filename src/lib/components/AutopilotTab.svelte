<script lang="ts">
  // Autopilot wizard (docs/autopilot-spec.md §12). CAPTURE-ONLY for now: builds + saves the plan on the
  // construct; the planner that actually flies it comes later. Three sections — Route, Behaviour, Logistics.
  import { createEventDispatcher } from 'svelte';
  import type { CelestialBody, System, Autopilot, AutopilotAction, AutopilotWhere } from '$lib/types';
  import { coiCategories, coiTagLabel } from '$lib/constructs/coi';

  export let construct: CelestialBody;
  export let system: System | null = null;

  const dispatch = createEventDispatcher();
  const update = () => dispatch('update');

  const DEFAULT_AP: Autopilot = {
    enabled: false, traversal: 'in-order', waypoints: [], planning: 2, drive: 0.5,
    ignoreFuel: false, ignoreSupplies: false
  };
  // Ensure the object exists so the bindings have something to write to.
  $: if (construct && !construct.autopilot) construct.autopilot = { ...DEFAULT_AP, waypoints: [] };
  $: ap = construct.autopilot ?? DEFAULT_AP;

  const ACTIONS: AutopilotAction[] = ['mine', 'scan', 'load', 'unload', 'dock', 'patrol'];
  const NEEDS_CARGO = (a: AutopilotAction) => a === 'mine' || a === 'load';
  $: cats = $coiCategories;
  const label = (k: string) => coiTagLabel(k, cats);

  // Place options = bodies + other constructs in this system; Resource options = the CoI Resources.
  $: placeOpts = (system?.nodes ?? []).filter((n: any) => n.id !== construct.id && (n.kind === 'body' || n.kind === 'construct'))
       .map((n: any) => ({ id: n.id, name: n.name }));
  $: resourceOpts = (cats.find((c) => c.id === 'resource')?.tags ?? []).map((t) => ({ key: t.key, label: t.label }));

  // Action suggested from the ship's own capabilities (overridable). mining tag → mine, sensors → scan, etc.
  function suggestedAction(): AutopilotAction {
    const keys = new Set((construct.tags ?? []).map((t) => t.key));
    if (keys.has('purpose/mining')) return 'mine';
    if ((construct.sensors ?? []).length) return 'scan';
    if ((construct.physical_parameters?.cargoCapacity_tonnes ?? 0) > 0) return 'load';
    if (keys.has('purpose/patrol')) return 'patrol';
    return 'dock';
  }
  // Default mine/load rate from the hull's mining capability tag value, else a size-scaled guess.
  function defaultRate(): number {
    const mineTag = (construct.tags ?? []).find((t) => t.key === 'purpose/mining');
    if (mineTag?.value) return Number(mineTag.value) || 10;
    const cap = construct.physical_parameters?.cargoCapacity_tonnes ?? 0;
    return Math.max(1, Math.round(cap / 100)) || 10;
  }

  // Free cargo space = capacity − what's already aboard. Default fill target for mine/load.
  function freeCargo(): number {
    const cap = construct.physical_parameters?.cargoCapacity_tonnes ?? 0;
    return Math.max(0, Math.round(cap - (construct.current_cargo_tonnes ?? 0)));
  }

  function addWaypoint() {
    const a = suggestedAction();
    construct.autopilot!.waypoints = [...ap.waypoints, {
      where: { kind: 'place' }, action: a,
      ...(NEEDS_CARGO(a) ? { rate_tpd: defaultRate(), fillAmount_t: freeCargo() || undefined } : {})
    }];
    update();
  }
  function removeWaypoint(i: number) { construct.autopilot!.waypoints = ap.waypoints.filter((_, j) => j !== i); update(); }
  function setWhereKind(w: AutopilotWhere, kind: 'place' | 'resource') { w.kind = kind; update(); }
  // Resource sources are multi-select — a waypoint may target ANY of several resources.
  function addResourceKey(w: AutopilotWhere, key: string) {
    if (!key) return;
    const keys = w.resourceKeys ?? [];
    if (!keys.includes(key)) w.resourceKeys = [...keys, key];
    update();
  }
  function removeResourceKey(w: AutopilotWhere, key: string) { w.resourceKeys = (w.resourceKeys ?? []).filter((k) => k !== key); update(); }
</script>

<div class="tab-panel ap">
  <div class="ap-head">
    <div>
      <span class="ap-title">Autopilot</span>
      <span class="ap-sub">capture-only — saves the plan; flying it comes later</span>
    </div>
    <label class="engage"><input type="checkbox" bind:checked={ap.enabled} on:change={update} /> Engage</label>
  </div>

  <!-- A. ROUTE -->
  <section>
    <h6>Route</h6>
    <div class="row">
      <span class="lbl">Visit</span>
      <div class="seg">
        {#each [['in-order', 'All · in order'], ['best-order', 'All · best order'], ['any', 'Any · as needed']] as [v, t]}
          <button class:on={ap.traversal === v} on:click={() => { construct.autopilot!.traversal = v as any; update(); }}>{t}</button>
        {/each}
      </div>
    </div>

    {#each ap.waypoints as w, i}
      <div class="wp">
        <div class="wp-line">
          <span class="seg sm">
            <button class:on={w.where.kind === 'place'} on:click={() => setWhereKind(w.where, 'place')}>Place</button>
            <button class:on={w.where.kind === 'resource'} on:click={() => setWhereKind(w.where, 'resource')}>Resource</button>
          </span>
          {#if w.where.kind === 'place'}
            <select bind:value={w.where.placeId} on:change={update}>
              <option value={undefined}>— pick a place —</option>
              {#each placeOpts as p}<option value={p.id}>{p.name}</option>{/each}
            </select>
          {:else}
            <span class="res-pick">
              <span class="lbl">any source of</span>
              {#each w.where.resourceKeys ?? [] as k}
                <span class="chip">{label(k)}<button class="chip-x" title="Remove" on:click={() => removeResourceKey(w.where, k)}>✕</button></span>
              {/each}
              <select value="" on:change={(e) => { addResourceKey(w.where, e.currentTarget.value); e.currentTarget.value = ''; }}>
                <option value="">+ add resource</option>
                {#each resourceOpts.filter((r) => !(w.where.resourceKeys ?? []).includes(r.key)) as r}<option value={r.key}>{r.label}</option>{/each}
              </select>
            </span>
          {/if}
          <span class="arrow">→</span>
          <select bind:value={w.action} on:change={update}>
            {#each ACTIONS as a}<option value={a}>{a}</option>{/each}
          </select>
          <button class="rm" title="Remove" on:click={() => removeWaypoint(i)}>✕</button>
        </div>
        {#if NEEDS_CARGO(w.action)}
          <div class="wp-line sub">
            <span class="lbl">at</span>
            <input class="num" type="number" min="0" bind:value={w.rate_tpd} on:change={update} /> <span class="unit">t/day</span>
            <span class="lbl">fill</span>
            <input class="num" type="number" min="0" placeholder="free space" bind:value={w.fillAmount_t} on:change={update} /> <span class="unit">t</span>
            <span class="arrow">→ deliver to</span>
            <span class="seg sm">
              <button class:on={w.deliverTo?.kind !== 'resource'} on:click={() => { w.deliverTo = { kind: 'place', placeId: w.deliverTo?.placeId }; update(); }}>Place</button>
              <button class:on={w.deliverTo?.kind === 'resource'} on:click={() => { w.deliverTo = { kind: 'resource', resourceKeys: w.deliverTo?.resourceKeys }; update(); }}>Resource</button>
            </span>
            {#if w.deliverTo?.kind === 'resource'}
              <select value={w.deliverTo.resourceKeys?.[0] ?? ''} on:change={(e) => { w.deliverTo = { kind: 'resource', resourceKeys: e.currentTarget.value ? [e.currentTarget.value] : [] }; update(); }}><option value="">—</option>{#each resourceOpts as r}<option value={r.key}>{r.label}</option>{/each}</select>
            {:else}
              <select value={w.deliverTo?.placeId} on:change={(e) => { w.deliverTo = { kind: 'place', placeId: e.currentTarget.value }; update(); }}><option value={undefined}>—</option>{#each placeOpts as p}<option value={p.id}>{p.name}</option>{/each}</select>
            {/if}
          </div>
        {/if}
      </div>
    {/each}
    <button class="add" on:click={addWaypoint}>+ add location</button>
  </section>

  <!-- B. BEHAVIOUR -->
  <section>
    <h6>Behaviour <span class="note">how it flies</span></h6>
    <div class="sld">
      <div class="sld-top"><span>Discipline</span><span class="v">{ap.tardiness == null ? 'from owner' : ap.tardiness <= 0.33 ? 'on time' : ap.tardiness >= 0.66 ? "Bob's time" : 'relaxed'}</span></div>
      <input type="range" min="0" max="1" step="0.05" value={ap.tardiness ?? 0.5} on:input={(e) => { construct.autopilot!.tardiness = parseFloat(e.currentTarget.value); update(); }} />
      <div class="ends"><span>Military</span><span>Bob's</span></div>
    </div>
    <div class="sld">
      <div class="sld-top"><span>Planning</span><span class="v">{ap.planning === 0 ? 'reactive' : `looks ${ap.planning} ahead`}</span></div>
      <input type="range" min="0" max="5" step="1" bind:value={ap.planning} on:input={update} />
      <div class="ends"><span>Reactive</span><span>Detailed · 5</span></div>
      {#if ap.planning >= 3}<p class="hint">Reorders + waits for an alignment when it pays off; also schedules refuel/restock ahead.</p>{/if}
    </div>
    <div class="sld">
      <div class="sld-top"><span>Drive</span><span class="v">{ap.drive <= 0.33 ? 'thrifty' : ap.drive >= 0.66 ? 'fast' : 'balanced'}</span></div>
      <input type="range" min="0" max="1" step="0.05" bind:value={ap.drive} on:input={update} />
      <div class="ends"><span>Thrifty · save fuel</span><span>Fast · burn hard</span></div>
    </div>
    <div class="sld">
      <div class="sld-top"><span>Max journey time</span><span class="v">{ap.maxJourneyDays ? `${ap.maxJourneyDays} days` : 'no cap'}</span></div>
      <input type="range" min="0" max="3650" step="10" value={ap.maxJourneyDays ?? 0} on:input={(e) => { const v = parseInt(e.currentTarget.value); construct.autopilot!.maxJourneyDays = v || undefined; update(); }} />
      <div class="ends"><span>no cap</span><span>caps any one hop — no 50-yr crawls</span></div>
    </div>
  </section>

  <!-- C. LOGISTICS -->
  <section>
    <h6>Logistics <span class="note">Planning schedules refuel + restock; tick to skip entirely</span></h6>
    <label class="chk"><input type="checkbox" bind:checked={ap.ignoreFuel} on:change={update} /> Ignore fuel — this ship doesn't require or burn fuel</label>
    <label class="chk"><input type="checkbox" bind:checked={ap.ignoreSupplies} on:change={update} /> Ignore life support — this ship doesn't need supplies</label>
  </section>
</div>

<style>
  .ap { display: flex; flex-direction: column; gap: 16px; font-size: 13px; }
  .ap-head { display: flex; align-items: center; justify-content: space-between; }
  .ap-title { font-weight: 600; font-size: 15px; }
  .ap-sub { color: var(--text-faint); font-size: 11px; margin-left: 8px; }
  .engage { display: inline-flex; align-items: center; gap: 6px; cursor: pointer; }
  section { border-top: 1px solid var(--border-soft); padding-top: 10px; }
  h6 { margin: 0 0 10px; font-size: 12px; text-transform: uppercase; letter-spacing: 0.04em; color: var(--text-muted); }
  .note { text-transform: none; letter-spacing: 0; color: var(--text-faint); font-weight: 400; }
  .row { display: flex; align-items: center; gap: 10px; margin-bottom: 12px; }
  .lbl { color: var(--text-faint); }
  .seg { display: inline-flex; border: 1px solid var(--border); border-radius: 5px; overflow: hidden; }
  .seg button { background: transparent; border: none; color: var(--text-muted); padding: 5px 10px; cursor: pointer; font-size: 12px; border-right: 1px solid var(--border-soft); }
  .seg button:last-child { border-right: none; }
  .seg button.on { background: var(--accent); color: #fff; }
  .seg.sm button { padding: 3px 7px; font-size: 11px; }
  .wp { border: 1px solid var(--border-soft); border-radius: 5px; padding: 8px; margin-bottom: 6px; }
  .wp-line { display: flex; align-items: center; flex-wrap: wrap; gap: 7px; }
  .wp-line.sub { margin-top: 7px; padding-top: 7px; border-top: 1px solid var(--border-soft); }
  .arrow { color: var(--text-faint); }
  .rm { margin-left: auto; background: none; border: none; color: var(--text-faint); cursor: pointer; }
  .add { width: 100%; border: 1px dashed var(--border); background: none; color: var(--text-muted); padding: 7px; border-radius: 5px; cursor: pointer; }
  select { background: var(--bg-control); border: 1px solid var(--border); color: var(--text); border-radius: 4px; padding: 3px 6px; font-size: 12px; }
  .num { width: 60px; background: var(--bg-control); border: 1px solid var(--border); color: var(--text); border-radius: 4px; padding: 3px 6px; }
  .unit { color: var(--text-faint); }
  .sld { margin-bottom: 14px; }
  .sld-top { display: flex; justify-content: space-between; margin-bottom: 4px; }
  .sld-top .v { color: var(--text-muted); }
  .sld input[type=range] { width: 100%; }
  .ends { display: flex; justify-content: space-between; font-size: 11px; color: var(--text-faint); margin-top: 2px; }
  .hint { margin: 6px 0 0; font-size: 11px; color: var(--accent); }
  .chk { display: flex; align-items: center; gap: 6px; margin-bottom: 8px; flex-wrap: wrap; }
  .res-pick { display: inline-flex; align-items: center; flex-wrap: wrap; gap: 5px; }
  .chip { display: inline-flex; align-items: center; gap: 4px; background: var(--bg-control); border: 1px solid var(--border); border-radius: 999px; padding: 2px 4px 2px 8px; font-size: 11px; }
  .chip-x { background: none; border: none; color: var(--text-faint); cursor: pointer; padding: 0 2px; font-size: 10px; }
  .chip-x:hover { color: var(--text); }
</style>
