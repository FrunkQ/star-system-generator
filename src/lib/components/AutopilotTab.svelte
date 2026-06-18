<script lang="ts">
  // Autopilot wizard (docs/autopilot-spec.md §12). CAPTURE-ONLY for now: builds + saves the plan on the
  // construct; the planner that actually flies it comes later. Sections — Route (legs), Behaviour, Avoid, Logistics.
  import { createEventDispatcher } from 'svelte';
  import type { CelestialBody, System, Autopilot, AutopilotAction, AutopilotWhere, AutopilotLeg, RulePack } from '$lib/types';
  import { coiCategories, coiTagLabel } from '$lib/constructs/coi';
  import { calculateFullConstructSpecs } from '$lib/construct-logic';

  export let construct: CelestialBody;
  export let system: System | null = null;
  export let rulePack: RulePack | null = null;
  export let hostBody: CelestialBody | null = null;

  // Drive ceiling at vacuum — derived. maxVacuumG is at CURRENT fuel; scale by mass to get the empty→full
  // range so the GM sees why a "15 g" hull only manages ~1 g when its tanks are full.
  $: specs = (rulePack?.engineDefinitions && rulePack?.fuelDefinitions)
    ? calculateFullConstructSpecs(construct, rulePack.engineDefinitions.entries, rulePack.fuelDefinitions.entries, hostBody)
    : null;
  $: accelRange = (() => {
    if (!specs || !specs.maxVacuumG || !specs.totalMass_tonnes) return null;
    const massEmpty = specs.totalMass_tonnes - specs.fuelMass_tonnes;          // tanks dry
    const massFull = massEmpty + specs.fuelCapacity_tonnes;                    // tanks full
    const thrustConst = specs.maxVacuumG * specs.totalMass_tonnes;             // ∝ thrust (g·t)
    return {
      empty: massEmpty > 0 ? thrustConst / massEmpty : 0,
      full: massFull > 0 ? thrustConst / massFull : 0
    };
  })();
  const fmtG = (g: number) => (g < 1 ? g.toFixed(2) : g.toFixed(1));
  // Max-accel slider bounds: top = the ship's best (empty-tank) accel, else a sane fallback. Hazard tint
  // follows standardised human limits — orange above 2 g, red above 10 g.
  $: accelCeiling = Math.max(1, Math.ceil(accelRange?.empty ?? 15));
  $: accelStep = accelCeiling > 20 ? 1 : accelCeiling > 5 ? 0.5 : accelCeiling > 1 ? 0.1 : 0.05;
  $: accelEff = ap.maxAccelG ?? accelCeiling; // effective cap (full thrust ⇒ the ceiling)
  $: accelHazard = accelEff > 10 ? 'danger' : accelEff > 2 ? 'warn' : '';

  const dispatch = createEventDispatcher();
  const update = () => dispatch('update');

  const DEFAULT_AP: Autopilot = {
    enabled: false, traversal: 'in-order', legs: [], repeat: true, planning: 2, drive: 0.5,
    ignoreFuel: false, ignoreSupplies: false, avoidPlaceIds: []
  };
  // Ensure the object exists AND is well-shaped — older saves may carry a partial/legacy autopilot (e.g. the
  // pre-`legs` `waypoints` model), so merge defaults and guarantee `legs` is an array before anything reads it.
  $: if (construct) {
    const a: any = construct.autopilot;
    if (!a || !Array.isArray(a.legs)) {
      construct.autopilot = { ...DEFAULT_AP, ...(a ?? {}), legs: Array.isArray(a?.legs) ? a.legs : [] };
    }
  }
  $: ap = construct.autopilot ?? DEFAULT_AP;

  // Four verbs = two behaviours × two targeting modes. Dock/unload fall out of deliverTo; scan folded into patrol.
  const ACTIONS: { a: AutopilotAction; label: string; desc: string }[] = [
    { a: 'mine', label: 'Mine', desc: 'go to the nearest source of a resource and extract it' },
    { a: 'transport', label: 'Transport', desc: 'carry cargo or people from a place to a destination' },
    { a: 'patrol', label: 'Patrol', desc: 'loiter and sweep a place — set loiter 0 to race past' },
    { a: 'explore', label: 'Explore', desc: 'seek new sources it hasn’t logged, surveying each' },
    { a: 'escort', label: 'Escort', desc: 'shadow another ship at a set standoff distance' }
  ];
  // HAUL = gather + deliver (mine/transport); LOITER = go + dwell (patrol/explore, loiter 0 ⇒ flyby); ESCORT = shadow a construct.
  const FAMILY: Record<AutopilotAction, 'haul' | 'loiter' | 'escort'> = { mine: 'haul', transport: 'haul', patrol: 'loiter', explore: 'loiter', escort: 'escort' };
  const NEEDS_CARGO = (a: AutopilotAction) => FAMILY[a] === 'haul';
  const PEOPLE_KEY = 'people/passengers';
  $: cats = $coiCategories;
  const labelFor = (k: string) => (k === PEOPLE_KEY ? 'Passengers' : coiTagLabel(k, cats));

  // Place options = bodies + other constructs in this system; Resource options = the CoI Resources.
  $: placeOpts = (system?.nodes ?? []).filter((n: any) => n.id !== construct.id && (n.kind === 'body' || n.kind === 'construct'))
       .map((n: any) => ({ id: n.id, name: n.name }));
  // Escort targets a MOVING construct, so only other constructs are eligible.
  $: constructOpts = (system?.nodes ?? []).filter((n: any) => n.id !== construct.id && n.kind === 'construct')
       .map((n: any) => ({ id: n.id, name: n.name }));
  $: resourceOpts = (cats.find((c) => c.id === 'resource')?.tags ?? []).map((t) => ({ key: t.key, label: t.label }));
  // Transport can carry people as well as any resource.
  $: carryOpts = [{ key: PEOPLE_KEY, label: 'Passengers' }, ...resourceOpts];
  const placeName = (id?: string) => placeOpts.find((p) => p.id === id)?.name ?? '';

  // Action suggested from the ship's own capabilities (overridable).
  function suggestedAction(): AutopilotAction {
    const keys = new Set((construct.tags ?? []).map((t) => t.key));
    if (keys.has('purpose/mining')) return 'mine';
    if (keys.has('purpose/survey-prospecting') || keys.has('purpose/science') || keys.has('purpose/research')) return 'explore';
    if (keys.has('purpose/patrol') || (construct.sensors ?? []).length) return 'patrol';
    if ((construct.physical_parameters?.cargoCapacity_tonnes ?? 0) > 0) return 'transport';
    return 'patrol';
  }
  // Default mine/load rate from the hull's mining capability tag value, else a size-scaled guess.
  function defaultRate(): number {
    const mineTag = (construct.tags ?? []).find((t) => t.key === 'purpose/mining');
    if (mineTag?.value) return Number(mineTag.value) || 10;
    const cap = construct.physical_parameters?.cargoCapacity_tonnes ?? 0;
    return Math.max(1, Math.round(cap / 100)) || 10;
  }
  // Free cargo space = capacity − what's already aboard. Default fill target for mine/transport.
  function freeCargo(): number {
    const cap = construct.physical_parameters?.cargoCapacity_tonnes ?? 0;
    return Math.max(0, Math.round(cap - (construct.current_cargo_tonnes ?? 0)));
  }

  function blankLeg(a: AutopilotAction): AutopilotLeg {
    if (a === 'mine') return { action: a, resourceKeys: [], rate_tpd: defaultRate(), fillAmount_t: freeCargo() || undefined };
    if (a === 'transport') return { action: a, resourceKeys: [], rate_tpd: defaultRate(), fillAmount_t: freeCargo() || undefined };
    if (a === 'patrol') return { action: a, loiterDays: 30 };
    if (a === 'escort') return { action: a, escortKm: 100 }; // shadow a construct at a standoff distance
    return { action: a, resourceKeys: [], loiterDays: 30, noRevisit: true }; // explore: resource-driven loiter, non-repeating
  }
  function addLeg() { construct.autopilot!.legs = [...(ap.legs ?? []), blankLeg(suggestedAction())]; update(); }
  function removeLeg(i: number) { construct.autopilot!.legs = ap.legs.filter((_, j) => j !== i); update(); }
  // Switching action resets the action-specific fields so stale data doesn't leak across verbs.
  function setAction(leg: AutopilotLeg, a: AutopilotAction) {
    const fresh = blankLeg(a);
    Object.assign(leg, { action: a, placeId: undefined, resourceKeys: undefined, rate_tpd: undefined, fillAmount_t: undefined, deliverTo: undefined, loiterDays: undefined, noRevisit: undefined, escortKm: undefined }, fresh);
    construct.autopilot!.legs = [...ap.legs];
    update();
  }

  // Resource lists are multi-select (mine: what to extract; transport: what to carry).
  function addLegResource(leg: AutopilotLeg, key: string) {
    if (!key) return;
    const keys = leg.resourceKeys ?? [];
    if (!keys.includes(key)) leg.resourceKeys = [...keys, key];
    construct.autopilot!.legs = [...ap.legs];
    update();
  }
  function removeLegResource(leg: AutopilotLeg, key: string) {
    leg.resourceKeys = (leg.resourceKeys ?? []).filter((k) => k !== key);
    construct.autopilot!.legs = [...ap.legs];
    update();
  }

  // Drag-to-reorder legs.
  let dragIndex: number | null = null;
  function moveLeg(from: number, to: number) {
    if (from === to || from == null) return;
    const arr = [...ap.legs];
    const [x] = arr.splice(from, 1);
    arr.splice(to, 0, x);
    construct.autopilot!.legs = arr;
    update();
  }

  // Avoid list (places the ship won't visit/replenish at).
  function addAvoid(id: string) {
    if (!id) return;
    const ids = ap.avoidPlaceIds ?? [];
    if (!ids.includes(id)) construct.autopilot!.avoidPlaceIds = [...ids, id];
    update();
  }
  function removeAvoid(id: string) { construct.autopilot!.avoidPlaceIds = (ap.avoidPlaceIds ?? []).filter((x) => x !== id); update(); }
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
    <div class="row">
      <span class="lbl">Then</span>
      <div class="seg">
        <button class:on={ap.repeat} on:click={() => { construct.autopilot!.repeat = true; update(); }}>Repeat forever</button>
        <button class:on={!ap.repeat} on:click={() => { construct.autopilot!.repeat = false; update(); }}>Run once</button>
      </div>
      {#if !ap.repeat}<span class="explore-note">finishes the route, flags green, and disengages autopilot</span>{/if}
    </div>

    {#each ap.legs as leg, i}
      <div class="leg"
           role="listitem"
           on:dragover|preventDefault
           on:drop|preventDefault={() => { if (dragIndex !== null) moveLeg(dragIndex, i); dragIndex = null; }}>
        <div class="leg-head">
          <span class="grip" draggable="true" role="button" tabindex="0" aria-label="Drag to reorder leg" title="Drag to reorder"
                on:dragstart={() => (dragIndex = i)} on:dragend={() => (dragIndex = null)}>⠿</span>
          <span class="leg-no">Leg {i + 1}</span>
          <select class="action" bind:value={leg.action} on:change={(e) => setAction(leg, e.currentTarget.value as AutopilotAction)}>
            {#each ACTIONS as o}<option value={o.a}>{o.label}</option>{/each}
          </select>
          <span class="leg-desc">{ACTIONS.find((o) => o.a === leg.action)?.desc}</span>
          <button class="rm" title="Remove leg" on:click={() => removeLeg(i)}>✕</button>
        </div>

        <div class="leg-body">
          {#if leg.action === 'mine'}
            <span class="lbl">nearest source of</span>
            <span class="res-pick">
              {#each leg.resourceKeys ?? [] as k}
                <span class="chip">{labelFor(k)}<button class="chip-x" title="Remove" on:click={() => removeLegResource(leg, k)}>✕</button></span>
              {/each}
              <select value="" on:change={(e) => { addLegResource(leg, e.currentTarget.value); e.currentTarget.value = ''; }}>
                <option value="">+ resource</option>
                {#each resourceOpts.filter((r) => !(leg.resourceKeys ?? []).includes(r.key)) as r}<option value={r.key}>{r.label}</option>{/each}
              </select>
            </span>
            <span class="lbl">at</span>
            <input class="num" type="number" min="0" bind:value={leg.rate_tpd} on:change={update} /> <span class="unit">t/day</span>
            <span class="lbl">fill</span>
            <input class="num" type="number" min="0" placeholder="free space" bind:value={leg.fillAmount_t} on:change={update} /> <span class="unit">t</span>

          {:else if leg.action === 'transport'}
            <span class="lbl">from</span>
            <select bind:value={leg.placeId} on:change={update}>
              <option value={undefined}>— pick a place —</option>
              {#each placeOpts as p}<option value={p.id}>{p.name}</option>{/each}
            </select>
            <span class="lbl">carry</span>
            <span class="res-pick">
              {#each leg.resourceKeys ?? [] as k}
                <span class="chip">{labelFor(k)}<button class="chip-x" title="Remove" on:click={() => removeLegResource(leg, k)}>✕</button></span>
              {/each}
              <select value="" on:change={(e) => { addLegResource(leg, e.currentTarget.value); e.currentTarget.value = ''; }}>
                <option value="">+ cargo / people</option>
                {#each carryOpts.filter((r) => !(leg.resourceKeys ?? []).includes(r.key)) as r}<option value={r.key}>{r.label}</option>{/each}
              </select>
            </span>
            <span class="lbl">up to</span>
            <input class="num" type="number" min="0" placeholder="free space" bind:value={leg.fillAmount_t} on:change={update} /> <span class="unit">t</span>

          {:else if leg.action === 'patrol'}
            <span class="lbl">around</span>
            <select bind:value={leg.placeId} on:change={update}>
              <option value={undefined}>— whole system —</option>
              {#each placeOpts as p}<option value={p.id}>{p.name}</option>{/each}
            </select>
            <span class="lbl">loiter</span>
            <input class="num" type="number" min="0" bind:value={leg.loiterDays} on:change={update} /> <span class="unit">days</span>
            {#if (leg.loiterDays ?? 0) === 0}<span class="explore-note">0 = flyby — races past without stopping (planner WIP)</span>{/if}

          {:else if leg.action === 'escort'}
            <span class="lbl">shadow</span>
            <select bind:value={leg.placeId} on:change={update}>
              <option value={undefined}>— pick a ship —</option>
              {#each constructOpts as c}<option value={c.id}>{c.name}</option>{/each}
            </select>
            <span class="lbl">at</span>
            <input class="num" type="number" min="0" bind:value={leg.escortKm} on:change={update} /> <span class="unit">km standoff</span>
            {#if !constructOpts.length}<span class="explore-note">no other ships in this system to escort</span>{/if}

          {:else}
            <span class="lbl">seeking</span>
            <span class="res-pick">
              {#each leg.resourceKeys ?? [] as k}
                <span class="chip">{labelFor(k)}<button class="chip-x" title="Remove" on:click={() => removeLegResource(leg, k)}>✕</button></span>
              {/each}
              <select value="" on:change={(e) => { addLegResource(leg, e.currentTarget.value); e.currentTarget.value = ''; }}>
                <option value="">+ resource (any if blank)</option>
                {#each resourceOpts.filter((r) => !(leg.resourceKeys ?? []).includes(r.key)) as r}<option value={r.key}>{r.label}</option>{/each}
              </select>
            </span>
            <span class="lbl">survey</span>
            <input class="num" type="number" min="0" bind:value={leg.loiterDays} on:change={update} /> <span class="unit">days</span>
            <label class="inline-chk" title="Skip places already in the ship's log so it keeps pushing into new territory">
              <input type="checkbox" bind:checked={leg.noRevisit} on:change={update} /> don't revisit logged places
            </label>
            {#if (leg.loiterDays ?? 0) === 0}<span class="explore-note">0 = flyby — races past without stopping (planner WIP)</span>{/if}
          {/if}
        </div>

        {#if NEEDS_CARGO(leg.action)}
          <div class="leg-body sub">
            <span class="arrow">deliver to</span>
            <span class="seg sm">
              <button class:on={leg.deliverTo?.kind !== 'resource'} on:click={() => { leg.deliverTo = { kind: 'place', placeId: leg.deliverTo?.placeId }; construct.autopilot!.legs = [...ap.legs]; update(); }}>Place</button>
              <button class:on={leg.deliverTo?.kind === 'resource'} on:click={() => { leg.deliverTo = { kind: 'resource', resourceKeys: leg.deliverTo?.resourceKeys }; construct.autopilot!.legs = [...ap.legs]; update(); }}>Resource</button>
            </span>
            {#if leg.deliverTo?.kind === 'resource'}
              <select value={leg.deliverTo.resourceKeys?.[0] ?? ''} on:change={(e) => { leg.deliverTo = { kind: 'resource', resourceKeys: e.currentTarget.value ? [e.currentTarget.value] : [] }; construct.autopilot!.legs = [...ap.legs]; update(); }}>
                <option value="">— any market —</option>{#each resourceOpts as r}<option value={r.key}>{r.label}</option>{/each}
              </select>
            {:else}
              <select value={leg.deliverTo?.placeId ?? ''} on:change={(e) => { leg.deliverTo = { kind: 'place', placeId: e.currentTarget.value || undefined }; construct.autopilot!.legs = [...ap.legs]; update(); }}>
                <option value="">— back to base —</option>{#each placeOpts as p}<option value={p.id}>{p.name}</option>{/each}
              </select>
            {/if}
          </div>
        {/if}
      </div>
    {/each}
    <button class="add" on:click={addLeg}>+ add stop</button>
  </section>

  <!-- B. BEHAVIOUR -->
  <section>
    <h6>Behaviour <span class="note">how it flies</span></h6>
    <div class="sld">
      <div class="sld-top"><span>Discipline</span><span class="v">{ap.tardiness == null ? 'from owner' : ap.tardiness <= 0.33 ? 'on time' : ap.tardiness >= 0.66 ? "Bob's time" : 'relaxed'}</span></div>
      <input type="range" min="0" max="1" step="0.05" value={ap.tardiness ?? 0.5} on:input={(e) => { construct.autopilot!.tardiness = parseFloat(e.currentTarget.value); update(); }} />
      <div class="ends"><span>Military</span><span>Bob's</span></div>
      <p class="hint subtle">Adds random slack to time spent stopped (loading, loitering, docking) — no effect on a non-stop flyby.</p>
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
      <div class="sld-top"><span>Max accel</span><span class="v" class:warn={accelHazard === 'warn'} class:danger={accelHazard === 'danger'}>{ap.maxAccelG == null ? 'full thrust' : `${fmtG(ap.maxAccelG)} g`}</span></div>
      <input type="range" min="0" max={accelCeiling} step={accelStep} value={ap.maxAccelG ?? accelCeiling} on:input={(e) => { const v = parseFloat(e.currentTarget.value); construct.autopilot!.maxAccelG = v >= accelCeiling ? undefined : v; update(); }} />
      <div class="ends"><span>0 g</span><span>{fmtG(accelCeiling)} g · full</span></div>
      {#if accelRange}<p class="hint subtle">This drive: <strong>{fmtG(accelRange.full)} g</strong> fully fuelled → <strong>{fmtG(accelRange.empty)} g</strong> empty (heavy tanks = slower).</p>{/if}
      <p class="hint subtle">Above 2 g is uncomfortable, above 10 g hazardous to a human crew. Cap it for comfort, or so a slow escort keeps up.</p>
    </div>
    <div class="sld">
      <div class="sld-top"><span>Max time per leg</span><span class="v">{ap.maxJourneyDays ? `${ap.maxJourneyDays} days` : 'no cap'}</span></div>
      <input type="range" min="0" max="3650" step="10" value={ap.maxJourneyDays ?? 0} on:input={(e) => { const v = parseInt(e.currentTarget.value); construct.autopilot!.maxJourneyDays = v || undefined; update(); }} />
      <div class="ends"><span>no cap</span><span>whole leg: travel out, work, and return</span></div>
    </div>
  </section>

  <!-- C. AVOID -->
  <section>
    <h6>Avoid <span class="note">won't visit or replenish here — e.g. politically unaligned</span></h6>
    <div class="res-pick">
      {#each ap.avoidPlaceIds ?? [] as id}
        <span class="chip">{placeName(id)}<button class="chip-x" title="Remove" on:click={() => removeAvoid(id)}>✕</button></span>
      {/each}
      <select value="" on:change={(e) => { addAvoid(e.currentTarget.value); e.currentTarget.value = ''; }}>
        <option value="">+ add location</option>
        {#each placeOpts.filter((p) => !(ap.avoidPlaceIds ?? []).includes(p.id)) as p}<option value={p.id}>{p.name}</option>{/each}
      </select>
    </div>
  </section>

  <!-- D. LOGISTICS -->
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
  /* Legs — a strong-bordered card each so they read as discrete route legs. */
  .leg { border: 1.5px solid var(--border); border-radius: 7px; padding: 8px 9px; margin-bottom: 9px; background: var(--bg-control); }
  .leg-head { display: flex; align-items: center; gap: 8px; }
  .grip { cursor: grab; color: var(--text-faint); user-select: none; font-size: 13px; }
  .leg-no { font-weight: 600; font-size: 11px; text-transform: uppercase; letter-spacing: 0.04em; color: var(--text-muted); }
  .action { font-weight: 600; }
  .leg-desc { color: var(--text-faint); font-size: 11px; }
  .leg-body { display: flex; align-items: center; flex-wrap: wrap; gap: 7px; margin-top: 8px; }
  .leg-body.sub { margin-top: 7px; padding-top: 7px; border-top: 1px solid var(--border-soft); }
  .explore-note { color: var(--text-muted); font-size: 12px; }
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
  .hint.subtle { color: var(--text-faint); }
  .sld-top .v.warn { color: #d8922f; }
  .sld-top .v.danger { color: #cc5555; }
  .chk { display: flex; align-items: center; gap: 6px; margin-bottom: 8px; flex-wrap: wrap; }
  .inline-chk { display: inline-flex; align-items: center; gap: 5px; color: var(--text-muted); cursor: pointer; font-size: 12px; }
  .res-pick { display: inline-flex; align-items: center; flex-wrap: wrap; gap: 5px; }
  .chip { display: inline-flex; align-items: center; gap: 4px; background: var(--bg-surface, var(--bg-control)); border: 1px solid var(--border); border-radius: 999px; padding: 2px 4px 2px 8px; font-size: 11px; }
  .chip-x { background: none; border: none; color: var(--text-faint); cursor: pointer; padding: 0 2px; font-size: 10px; }
  .chip-x:hover { color: var(--text); }
</style>
