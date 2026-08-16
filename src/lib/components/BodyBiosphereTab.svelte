<script lang="ts">
  import { createEventDispatcher } from 'svelte';
  import type { CelestialBody, RulePack } from '$lib/types';

  export let body: CelestialBody;
  export let rulePack: RulePack;

  const dispatch = createEventDispatcher();

  import { allMorphologies, biosphereLayers } from '$lib/physics/vegetation';
  import { maxUsefulCoverage } from '$lib/rendering/landmass';
  import { allPigments } from '$lib/physics/pigments';

  const complexities = ['none', 'simple', 'complex', 'sapient'];
  const biochemistries = ['water-carbon', 'ammonia-silicon', 'methane-carbon'];
  const energySources = ['photosynthesis', 'chemosynthesis', 'thermosynthesis'];

  // The morphologies a GM can add come from the RULE PACK, not from a list in this file — so adding a
  // fifth (or a sixth) is a pack edit and this editor picks it up with no change. Settings → Planets
  // → Biospheres is where they are defined.
  $: morphDefs = allMorphologies(rulePack).slice().sort((a, b) => a.order - b.order);
  // ONE reader normalises both stored forms (a legacy list of bare strings, or the layer records this
  // editor writes). There is no second store of which morphologies are present.
  $: layers = biosphereLayers(body.biosphere, rulePack);
  $: presentKeys = new Set(layers.map((l) => l.morphology));

  // WHICH PIGMENT, as a free choice. Several always score as viable and the engine draws one of
  // them; picking a different one is not a correction, it is choosing among outcomes the model
  // itself says are all available — so this is an ordinary dropdown and not an override badge.
  //
  // The stored form is a hand-added `biodiversity/pigment` tag, which is the mechanism a manual
  // cloud deck already uses: the derivation READS it and everything downstream follows, so there is
  // no second store of what this world's pigment is.
  $: pigmentTag = body.tags?.find((t) => t.key === 'biodiversity/pigment');
  $: pinnedPigment = pigmentTag?.manual ? pigmentTag.value : '';
  // Offer every pigment the pack carries, ranked as this world's own light ranks them, so the list
  // reads as "what would work here" rather than as an alphabetical menu.
  $: pigmentChoices = (() => {
      const ranked = body.vegetation?.ranked ?? [];
      const rest = allPigments(rulePack)
          .filter((p) => !ranked.some((r) => r.key === p.key))
          .map((p) => ({ key: p.key, label: p.label, viable: false, reflectedUnderStarHex: null as string | null }));
      return [...ranked, ...rest];
  })();

  function setPigment(key: string) {
      const kept = (body.tags ?? []).filter((t) => t.key !== 'biodiversity/pigment');
      // Empty = hand the choice back to the engine's own weighted draw.
      body.tags = key ? [...kept, { key: 'biodiversity/pigment', value: key, manual: true }] : kept;
      dispatch('update');
  }
  // How much of this world is dry ground. Coverage is OF THE LAND, so 100% means the whole of it —
  // and the slider is allowed past that because plant life also lives in SHALLOW SEAS, which are
  // visible from orbit. A world with little land gets a longer run, because that is where its life
  // would actually be.
  $: landFraction = body.vegetation?.landFraction
      ?? (1 - (body.hydrosphere?.layers?.find((l) => l.location === 'surface')?.coverage
               ?? body.hydrosphere?.coverage ?? 0));
  // The ceiling is PER MORPHOLOGY, because how far past the shore one can reach is a property of
  // that morphology (its `waterReach`) rather than of the world. Plants stop at the sunlit shelf;
  // technological life can roof the whole ocean, so its slider runs to the entire globe.
  $: coverMaxFor = (key: string) =>
      maxUsefulCoverage(landFraction, morphDefs.find((d) => d.key === key)?.waterReach ?? 0.1);

  let habitabilityTier = 'None';
  let tierColor = 'var(--tier-none)';

  // Habitability is computed authoritatively by the processor and read from body.habitabilityBreakdown
  // (see the reactive `bd` below) — no local recompute, so the bars, modifiers and headline agree.

  function getTierColor(tier: string) {
      switch (tier) {
          case 'earth-like': return 'var(--tier-earthlike)';
          case 'human': return 'var(--tier-human)';
          case 'alien': return 'var(--tier-alien)';
          default: return 'var(--tier-none)';
      }
  }

  $: tierTag = body.tags?.find(t => t.key.startsWith('habitability/'))?.key.split('/')[1] || 'none';
  $: habitabilityTier = tierTag.split('-').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' '); // Title Case
  $: tierColor = getTierColor(tierTag);
  // The AUTHORITATIVE breakdown from the processor (one calc — not the old local recompute).
  $: bd = body.habitabilityBreakdown;

  function toggleBiosphere() {
      if (!body.biosphere || body.biosphere.complexity === 'none') {
          body.biosphere = { 
              complexity: 'simple',
              coverage: 0.1,
              biochemistry: 'water-carbon',
              energy_source: 'photosynthesis',
              morphologies: [{ morphology: 'microbial', coverage: 0.4 }]
          };
      } else {
          body.biosphere = undefined;
      }
      dispatch('update');
  }

  // Every write below goes through the NORMALISED list, so a legacy save is migrated the first time
  // the GM touches it and never half-converted.
  function writeLayers(next: { morphology: string; coverage: number }[]) {
      if (!body.biosphere) return;
      body.biosphere.morphologies = next;
      dispatch('update');
  }

  function toggleMorphology(key: string) {
      if (!body.biosphere) return;
      const cur = biosphereLayers(body.biosphere, rulePack);
      if (cur.some((l) => l.morphology === key)) {
          writeLayers(cur.filter((l) => l.morphology !== key));
      } else {
          const def = morphDefs.find((d) => d.key === key);
          // A new layer joins at its definition's default coverage, in its definition's order slot —
          // so switching one on lands it where the hierarchy says it belongs rather than on top.
          const next = [...cur, { morphology: key, coverage: def?.defaultCoverage ?? 0.5 }];
          next.sort((a, b) =>
            (morphDefs.findIndex((d) => d.key === a.morphology)) - (morphDefs.findIndex((d) => d.key === b.morphology)));
          writeLayers(next);
      }
  }

  function setCoverage(key: string, value: number) {
      const cur = biosphereLayers(body.biosphere, rulePack);
      writeLayers(cur.map((l) => (l.morphology === key ? { ...l, coverage: value } : l)));
  }

  // THE ORDER IS THE HIERARCHY, so moving a row is a real edit and not a display preference.
  function move(index: number, delta: number) {
      const cur = biosphereLayers(body.biosphere, rulePack);
      const to = index + delta;
      if (to < 0 || to >= cur.length) return;
      const next = cur.slice();
      [next[index], next[to]] = [next[to], next[index]];
      writeLayers(next);
  }

  function handleUpdate() {
      dispatch('update');
  }
</script>

<div class="tab-panel">
    <div class="habitability-section">
        <div class="total-score-header">
            <h4>Habitability Score</h4>
            <span class="tier-badge" style="background-color: {tierColor}">{habitabilityTier} ({body.habitabilityScore?.toFixed(0) || 0}%)</span>
        </div>
        
        <div class="total-progress-bar-bg">
            <div class="threshold" style="left: 40%" title="Alien Habitable (40%)"></div>
            <div class="threshold" style="left: 60%" title="Human Habitable (60%)"></div>
            <div class="threshold" style="left: 90%" title="Earth-like (90%)"></div>
            <div class="progress-bar-fill" style="width: {body.habitabilityScore || 0}%; background-color: {tierColor}"></div>
        </div>

        <div class="score-breakdown">
            {#if bd}
                {#each bd.factors as factor}
                    <div class="score-row">
                        <div class="score-header">
                            <span class="label">{factor.label}</span>
                            <span class="score-val">{factor.points}/{factor.max}</span>
                        </div>
                        <div class="score-details">
                            <span class="current">{factor.value}</span>
                            {#if factor.ideal}<span class="ideal">Habitable: {factor.ideal}</span>{/if}
                        </div>
                        {#if factor.range}
                            {@const r = factor.range}
                            {@const span = (r.hi - r.lo) || 1}
                            {@const pct = (x) => Math.max(0, Math.min(100, ((x - r.lo) / span) * 100))}
                            {@const below = r.value < r.lo}
                            {@const above = r.value > r.hi}
                            <div class="range-bar" title="{r.lo}–{r.hi} {r.unit}; ideal {r.idealLo}{r.idealHi !== r.idealLo ? `–${r.idealHi}` : ''} {r.unit}">
                                <!-- green ideal (full-marks) band -->
                                <div class="ideal-band" style="left: {pct(r.idealLo)}%; width: {Math.max(2, pct(r.idealHi) - pct(r.idealLo))}%"></div>
                                <!-- this body's reading -->
                                <div class="marker" class:out={below || above}
                                     style="left: {below ? 0 : above ? 100 : pct(r.value)}%"></div>
                            </div>
                            <div class="range-ends">
                                <span>{r.lo} {r.unit}{below ? ' ◀' : ''}</span>
                                <span>{r.hi} {r.unit}{above ? ' ▶' : ''}</span>
                            </div>
                        {:else}
                            <div class="progress-bar-bg">
                                <div class="progress-bar-fill" style="width: {Math.min(100, (factor.points / factor.max) * 100)}%"></div>
                            </div>
                        {/if}
                    </div>
                {/each}
                <div class="subtotal-row"><span>Surface subtotal</span><span>{bd.surfaceScore} / 100</span></div>
                {#if bd.modifiers.length}
                    <div class="modifiers">
                        <div class="mod-title">Long-term modifiers — geology &amp; magnetism</div>
                        {#each bd.modifiers as m}
                            <div class="mod-row" class:neg={m.delta < 0} class:pos={m.delta > 0}>
                                <span>{m.label}</span><span class="mod-delta">{m.delta > 0 ? '+' : ''}{m.delta}</span>
                            </div>
                        {/each}
                    </div>
                {/if}
                <div class="final-row"><span>Final habitability</span><span>{bd.finalScore}%</span></div>
            {:else}
                <p class="no-bd">No habitability breakdown (re-process the system to compute it).</p>
            {/if}
        </div>
    </div>

    <hr />

    <div class="form-group checkbox-row">
        <input type="checkbox" id="hasBio" checked={body.biosphere && body.biosphere.complexity !== 'none'} on:change={toggleBiosphere} />
        <label for="hasBio">Has Evolved Biosphere</label>
    </div>

    {#if body.biosphere && body.biosphere.complexity !== 'none'}
        <hr />
        <h4>Biosphere Details</h4>

        <div class="form-group">
            <label>Complexity</label>
            <select bind:value={body.biosphere.complexity} on:change={handleUpdate}>
                {#each complexities as comp}
                    <option value={comp}>{comp}</option>
                {/each}
            </select>
        </div>

        <div class="form-group">
            <label>Biochemistry</label>
            <select bind:value={body.biosphere.biochemistry} on:change={handleUpdate}>
                {#each biochemistries as bio}
                    <option value={bio}>{bio}</option>
                {/each}
            </select>
        </div>

        <div class="form-group">
            <label>Energy Source</label>
            <select bind:value={body.biosphere.energy_source} on:change={handleUpdate}>
                {#each energySources as energy}
                    <option value={energy}>{energy}</option>
                {/each}
            </select>
        </div>

        <!-- The old single global Coverage slider used to live here. It is gone, not hidden: with a
             coverage per morphology it was a second answer to the same question, sitting directly
             above the sliders that actually drive the render, and a GM moving it saw nothing happen.
             The stored field is still read — it is what scales a legacy save's morphologies the
             first time it is opened (see biosphereLayers) — but it is no longer an input. -->
        <div class="form-group">
            <div class="label-row">
                <label>Morphologies &amp; land cover</label>
                <span class="hint-inline">order = hierarchy</span>
            </div>
            <p class="hint">Each covers that share of the <strong>land</strong>, painted over the ones above it —
                so they are independent and may total past 100%. Move a row to change which covers which.</p>
            <p class="hint">Land fills <strong>first</strong>, from the coasts inwards. Past the tick a row has taken
                all the dry ground and is going out over the water — how far it can get is that morphology's own
                business, and only a technological one can roof an entire ocean.</p>
            {#if layers.length}
                <div class="layer-list">
                    {#each layers as l, i}
                        {@const def = morphDefs.find((d) => d.key === l.morphology)}
                        {@const cMax = coverMaxFor(l.morphology)}
                        {@const drawn = body.vegetation?.layers?.find((v) => v.morphology === l.morphology)}
                        <div class="layer-row">
                            <div class="order-btns">
                                <button type="button" title="Move deeper (drawn earlier)" disabled={i === 0} on:click={() => move(i, -1)}>▲</button>
                                <button type="button" title="Move on top (drawn later)" disabled={i === layers.length - 1} on:click={() => move(i, 1)}>▼</button>
                            </div>
                            {#if drawn?.colorHex}
                                <span class="chip" style="background:{drawn.colorHex}" title="{drawn.colorHex} — as human eyes would see it under this star"></span>
                            {:else}
                                <span class="chip none" title="This morphology contributes no colour seen from orbit"></span>
                            {/if}
                            <span class="layer-name">{def?.label ?? l.morphology}</span>
                            <span class="slider-wrap">
                                <input type="range" min="0" max={cMax} step="0.01" value={l.coverage}
                                       on:input={(e) => setCoverage(l.morphology, +e.currentTarget.value)} />
                                {#if cMax > 1.01}
                                    <span class="land-tick" style="left: {(1 / cMax) * 100}%"
                                          title="All the dry land — {Math.round(landFraction * 100)}% of the globe. Past here it is out over the water."></span>
                                {/if}
                            </span>
                            <span class="layer-pct" class:shallows={l.coverage > 1}
                                  title="of the LAND — the layers stack, so these are independent and may total past 100%">{Math.round(l.coverage * 100)}%</span>
                            <span class="layer-globe" title="of the WHOLE GLOBE, which is what you would see from orbit">
                                {Math.round(Math.min(1, l.coverage * landFraction + Math.max(0, l.coverage - 1) * landFraction) * 100)}%&#8202;g</span>
                            <button type="button" class="drop" title="Remove" on:click={() => toggleMorphology(l.morphology)}>×</button>
                        </div>
                    {/each}
                </div>
            {:else}
                <p class="hint">No morphologies yet — add one below.</p>
            {/if}
            <div class="morphology-checkboxes">
                {#each morphDefs.filter((d) => !presentKeys.has(d.key)) as def}
                    <button type="button" class="add-morph" title={def.note ?? ''} on:click={() => toggleMorphology(def.key)}>+ {def.label}</button>
                {/each}
            </div>
        </div>

        {#if body.vegetation}
            <hr />
            <h4>Derived look</h4>
            <div class="derived">
                {#if body.vegetation.pigmentLabel}
                    <div class="derived-row">
                        <span class="k">Dominant pigment</span>
                        <span class="v pigment-pick">
                            <select value={pinnedPigment} on:change={(e) => setPigment(e.currentTarget.value)}>
                                <option value="">{body.vegetation.pigmentLabel} — drawn for this world</option>
                                {#each pigmentChoices as c}
                                    <option value={c.key}>{c.label}{c.viable === false && 'viable' in c ? ' (outclassed here)' : ''}</option>
                                {/each}
                            </select>
                            <span class="swatches">
                                {#each (body.vegetation.ranked ?? []).filter((r) => r.viable) as r}
                                    <button type="button" class="pig-chip" class:on={r.key === body.vegetation?.pigment}
                                            style="background:{r.reflectedUnderStarHex}"
                                            title="{r.label} — {Math.round(r.drawWeight * 100)}% of the draw. Click to pin it."
                                            on:click={() => setPigment(r.key)} aria-label={r.label}></button>
                                {/each}
                            </span>
                        </span>
                    </div>
                    <p class="hint">All of these work under this world's light — the engine draws one, and picking
                        another is choosing among outcomes it already calls viable, not correcting it. Leave it on
                        the first entry to let the draw stand.</p>
                {:else}
                    <div class="derived-row">
                        <span class="k">Pigment</span>
                        <span class="v">none — this biosphere does not photosynthesise, so it takes no colour from its star</span>
                    </div>
                {/if}
                <div class="derived-row">
                    <span class="k">Life on the land</span>
                    <span class="v">{Math.round(body.vegetation.visibleCover * 100)}% (the union of the layers, not their sum)</span>
                </div>
                <div class="derived-row">
                    <span class="k">Clusters at</span>
                    <span class="v">{Math.round(Math.max(0, body.vegetation.bandCentreDeg - body.vegetation.bandWidthDeg))}°–{Math.round(Math.min(90, body.vegetation.bandCentreDeg + body.vegetation.bandWidthDeg))}° latitude, where the solvent stays liquid</span>
                </div>
                {#if body.surfaceSpectrum}
                    <div class="derived-row">
                        <span class="k">Daylight there</span>
                        <span class="v">
                            <span class="chip inline" style="background:{body.surfaceSpectrum.surfaceLightHex}"></span>
                            peaks at {body.surfaceSpectrum.peakSurfaceNm} nm at the {body.surfaceSpectrum.level}
                            ({Math.round(body.surfaceSpectrum.totalSurfaceWm2)} W/m² of {Math.round(body.surfaceSpectrum.totalTopWm2)})
                        </span>
                    </div>
                {/if}
                <p class="hint">Which pigment dominates is a weighted draw over everything viable, seeded on this
                    body — several usually work, and without a history the outcome genuinely is contingent.
                    <a href="/physics#biosphere" target="_blank" rel="noopener">How this is derived</a>.</p>
            </div>
        {/if}
    {/if}
</div>

<style>
  .tab-panel { padding: 10px; display: flex; flex-direction: column; gap: 15px; }
  .form-group { display: flex; flex-direction: column; gap: 5px; }
  
  .label-row {
      display: flex;
      justify-content: space-between;
      align-items: center;
  }
  
  label { color: var(--text-muted); font-size: 0.9em; }
  input, select { padding: 8px; border-radius: 4px; border: 1px solid var(--border); background-color: var(--bg-control); color: var(--text); }

  .full-width-slider { width: 100%; margin: 0; }

  .checkbox-row {
      flex-direction: row;
      align-items: center;
      gap: 10px;
  }
  .checkbox-row label { margin: 0; }
  
  hr { border: 0; border-top: 1px solid var(--border); margin: 5px 0; width: 100%; }
  h4 { margin: 0; color: var(--link); font-size: 0.9em; text-transform: uppercase; }

  .habitability-section {
      background-color: var(--bg-panel);
      border-radius: 4px;
  }
  
  .score-breakdown {
      display: flex;
      flex-direction: column;
      gap: 8px;
      margin-top: 10px;
  }
  
  .total-score-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 5px; }
  .tier-badge { font-size: 0.9em; font-weight: bold; color: white; padding: 2px 8px; border-radius: 10px; }
  
  .total-progress-bar-bg {
      height: 10px;
      background-color: var(--bg-panel);
      border-radius: 5px;
      position: relative;
      margin-bottom: 15px;
      overflow: hidden;
  }
  .threshold {
      position: absolute;
      top: 0;
      bottom: 0;
      width: 2px;
      background-color: rgba(255,255,255,0.3);
      z-index: 1;
  }

  .score-row {
      display: flex;
      flex-direction: column;
      gap: 2px;
  }
  
  .score-header {
      display: flex;
      justify-content: space-between;
      font-size: 0.9em;
      font-weight: bold;
      color: #ddd;
  }
  
  .score-details {
      display: flex;
      justify-content: space-between;
      font-size: 0.8em;
      color: var(--text-muted);
  }

  .progress-bar-bg {
      height: 4px;
      background-color: var(--bg-control);
      border-radius: 2px;
      overflow: hidden;
  }
  
  .progress-bar-fill {
      height: 100%;
      background-color: var(--tier-earthlike);
  }

  /* Range bar: where this body's reading sits within the habitable band. */
  .range-bar {
      position: relative;
      height: 8px;
      border-radius: 4px;
      margin-top: 2px;
      /* faded red toward the score-zero edges, neutral in the middle */
      background: linear-gradient(90deg,
          rgba(231,76,60,0.35) 0%, rgba(231,76,60,0.08) 18%,
          rgba(231,76,60,0.08) 82%, rgba(231,76,60,0.35) 100%);
      overflow: visible;
  }
  .ideal-band {
      position: absolute;
      top: 0; bottom: 0;
      background: var(--tier-earthlike, #2ecc71);
      opacity: 0.55;
      border-radius: 4px;
  }
  .marker {
      position: absolute;
      top: -2px; bottom: -2px;
      width: 2px;
      background: #fff;
      box-shadow: 0 0 3px rgba(0,0,0,0.8);
      transform: translateX(-1px);
  }
  .marker.out {
      width: 3px;
      background: #e74c3c; /* reading is off the scored range — pinned at the edge */
  }
  .range-ends {
      display: flex;
      justify-content: space-between;
      font-size: 0.68rem;
      color: var(--text-faint, #8a8a8a);
      margin-top: 1px;
  }

  /* Subtotal / modifiers / final — were rendering run-together (no CSS). */
  .score-row { padding-bottom: 6px; border-bottom: 1px solid rgba(255,255,255,0.04); }
  .subtotal-row, .final-row, .mod-row {
      display: flex;
      justify-content: space-between;
      align-items: baseline;
      gap: 12px;
  }
  .subtotal-row {
      margin-top: 10px;
      padding-top: 8px;
      font-size: 0.85em;
      color: var(--text-muted, #cfcfcf);
  }
  .subtotal-row span:last-child { font-variant-numeric: tabular-nums; }
  .modifiers { margin-top: 8px; display: flex; flex-direction: column; gap: 4px; }
  .mod-title {
      font-size: 0.72rem;
      text-transform: uppercase;
      letter-spacing: 0.04em;
      color: var(--text-faint, #8a8a8a);
      margin-bottom: 2px;
  }
  .mod-row { font-size: 0.82em; color: var(--text-muted, #cfcfcf); }
  .mod-delta { font-weight: 700; font-variant-numeric: tabular-nums; }
  .mod-row.neg .mod-delta { color: #e74c3c; }
  .mod-row.pos .mod-delta { color: var(--tier-earthlike, #2ecc71); }
  .final-row {
      margin-top: 10px;
      padding-top: 8px;
      border-top: 1px solid var(--border, #2a2d36);
      font-weight: 700;
      font-size: 0.95em;
      color: var(--text, #fff);
  }
  .final-row span:last-child { font-variant-numeric: tabular-nums; }
  .no-bd { color: var(--text-faint, #8a8a8a); font-size: 0.85em; font-style: italic; }

  .morphology-checkboxes {
      display: flex;
      flex-wrap: wrap;
      gap: 6px;
      margin-top: 6px;
  }
  .add-morph {
      padding: 3px 8px;
      font-size: 0.8em;
      border-radius: 999px;
      border: 1px dashed var(--border, #2a2d36);
      background: transparent;
      color: var(--text-muted, #cfcfcf);
      cursor: pointer;
  }
  .add-morph:hover { background: var(--bg-control-hover, #232733); color: var(--text, #fff); }

  .hint { font-size: 0.78em; color: var(--text-faint, #8a8f9a); margin: 2px 0 6px; }
  .hint-inline { font-size: 0.72em; color: var(--text-faint, #8a8f9a); text-transform: uppercase; letter-spacing: 0.04em; }

  .layer-list { display: flex; flex-direction: column; gap: 4px; }
  .layer-row { display: flex; align-items: center; gap: 6px; }
  .layer-row .slider-wrap { position: relative; flex: 1; min-width: 60px; display: flex; align-items: center; }
  .layer-row input[type="range"] { width: 100%; margin: 0; padding: 0; }
  /* Where the dry land runs out. Beyond it the slider is buying shallow-sea life. */
  .land-tick {
      position: absolute; top: 0; bottom: 0; width: 2px;
      background: var(--text-faint, #8a8f9a); opacity: 0.75; pointer-events: none;
      transform: translateX(-1px);
  }
  .layer-pct.shallows { color: var(--link, #6cb6ff); }
  /* Both figures, because a GM thinks in globes and the model stores land. */
  .layer-globe { font-size: 0.72em; min-width: 34px; text-align: right; color: var(--text-faint, #8a8f9a); font-variant-numeric: tabular-nums; }
  .layer-name { font-size: 0.85em; min-width: 74px; color: var(--text, #eee); }
  .layer-pct { font-size: 0.8em; min-width: 34px; text-align: right; font-variant-numeric: tabular-nums; color: var(--text-muted, #cfcfcf); }
  .order-btns { display: flex; flex-direction: column; gap: 1px; }
  .order-btns button {
      line-height: 1; font-size: 0.55em; padding: 1px 3px; border-radius: 2px;
      border: 1px solid var(--border, #2a2d36); background: var(--bg-control, #1b1e26);
      color: var(--text-muted, #cfcfcf); cursor: pointer;
  }
  .order-btns button:disabled { opacity: 0.3; cursor: default; }
  .drop {
      border: none; background: transparent; color: var(--text-faint, #8a8f9a);
      cursor: pointer; font-size: 1em; line-height: 1; padding: 0 2px;
  }
  .drop:hover { color: #e74c3c; }
  .chip {
      width: 14px; height: 14px; border-radius: 3px; flex: none;
      border: 1px solid var(--border, #2a2d36);
  }
  .chip.none { background: repeating-linear-gradient(45deg, #3a3d46 0 3px, transparent 3px 6px); }
  .chip.inline { display: inline-block; vertical-align: -2px; margin-right: 4px; }

  .derived { display: flex; flex-direction: column; gap: 4px; }
  .derived-row { display: flex; gap: 10px; font-size: 0.82em; align-items: baseline; }
  .derived-row .k { color: var(--text-faint, #8a8f9a); min-width: 108px; flex: none; }
  .derived-row .v { color: var(--text-muted, #cfcfcf); }
  .pigment-pick { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
  .pigment-pick select { padding: 3px 6px; font-size: 0.95em; max-width: 210px; }
  .swatches { display: flex; gap: 3px; }
  .pig-chip {
      width: 15px; height: 15px; border-radius: 3px; cursor: pointer; padding: 0;
      border: 1px solid var(--border, #2a2d36);
  }
  .pig-chip.on { border-color: var(--link, #6cb6ff); box-shadow: 0 0 0 1px var(--link, #6cb6ff); }
</style>
