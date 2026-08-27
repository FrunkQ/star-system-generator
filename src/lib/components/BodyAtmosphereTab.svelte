<script lang="ts">
  import type { CelestialBody, RulePack, System, Tag } from '$lib/types';
  import { createEventDispatcher, onMount } from 'svelte';
  import { systemProcessor } from '$lib/core/SystemProcessor';
  import { systemStore } from '$lib/stores';
  import { unitBodyTypeFor } from '$lib/units';
  import UnitValue from './UnitValue.svelte';
  import { checkGasRetention, isCryoImpactedGreenhouseGas } from '$lib/physics/atmosphere';
  import { evaluateTagTriggers as evalTrigger } from '$lib/utils';
  import { formatGauss } from '$lib/physics/magnetism';
  import { starmapStore } from '$lib/starmapStore';
  import { parseGiantRecipe, recipeToPreset, uniquePresetName } from '$lib/catalogue/giantRecipe';
  import { calculateDistanceToStar } from '$lib/physics/temperature';
  import { isLuminousSource } from '$lib/physics/substellar';

  const dispatch = createEventDispatcher();

  export let body: CelestialBody;
  export let rulePack: RulePack;
  export let system: System;

  let availableAtmospheres: any[] = [];
  let availableGases: string[] = [];
  let selectedAtmosphereName: string = '';
  let showAdvanced = false;

  // G7 — IMPORT A GAS-GIANT RECIPE. Always mints a campaign preset and selects it (owner's call: it
  // will be rare, and a durable named entry is worth more than a tidy dropdown).
  //
  // WHAT IT CANNOT DO, AND WHY IT SAYS SO: a recipe's `requires.temperatureK` is DERIVED on every
  // pass from the star, the orbit, the albedo and the air — there is no override for it. So the
  // import sets the composition and pressure, then REPORTS the temperature the colour needs against
  // the one this world actually has. A giant is that colour BECAUSE it is that cold; silently
  // dropping the condition would leave a GM staring at the wrong planet wondering what broke.
  const RECIPE_PLACEHOLDER = "Paste the JSON from a gallery giant's Copy recipe button";
  let showRecipe = false;
  let recipeText = '';
  let recipeError: string | null = null;
  let recipeNote: string | null = null;
  // A mismatch is the one thing the import cannot fix for you, so it must not look like the
  // confirmation. Reported live: a 700 K recipe went onto a 112 K world and the warning was there
  // but read as a footnote — quiet grey text in the edit panel, while the GM was looking at the
  // render. Correct message, invisible placement.
  let recipeWarn = false;
  let recipeMsgEl: HTMLElement | null = null;

  function importRecipe() {
    recipeError = null; recipeNote = null; recipeWarn = false;
    const parsed = parseGiantRecipe(recipeText);
    if (!parsed.ok) { recipeError = parsed.error; return; }
    const recipe = parsed.recipe;

    // The override REPLACES the whole entries list (see +page.svelte's effectiveRulePack), so mint
    // from the EFFECTIVE list rather than from the pack's defaults — otherwise this would silently
    // drop every preset the GM had already edited.
    const current: any[] = (rulePack.distributions?.['atmosphere_composition']?.entries ?? []) as any[];
    const taken = current.map((e) => e?.value?.name).filter(Boolean) as string[];
    // NAME IT AFTER THE MIX, not the planet it landed on: what is being saved is a gas mixture, and
    // 'sodium overcast · potassium veil' says what it does where 'Sol XVII recipe' only says where it
    // went. Older recipes carry no label, so the body's name stays as the fallback.
    const name = uniquePresetName(recipe.label?.trim() || `${body.name} recipe`, taken);
    const entry = recipeToPreset(recipe, name);
    starmapStore.update((m) => m ? ({
      ...m,
      rulePackOverrides: { ...(m.rulePackOverrides ?? {}), atmosphereCompositions: [...current, entry] }
    }) : m);

    // Apply to THIS body directly — the dropdown repopulates from the pack a tick later, and waiting
    // for that would make the button look like it had done nothing.
    const comp = { ...recipe.atmosphere.composition };
    body.atmosphere = {
      name,
      composition: comp,
      pressure_bar: recipe.atmosphere.pressure_bar,
      main: Object.keys(comp).reduce((a, b) => (comp[a] > comp[b] ? a : b))
    } as any;
    selectedAtmosphereName = name;
    applyChanges();

    // WHERE THE COLOURS ARE BRIGHTEST — advice, never a guard. The import always succeeds; a giant
    // simply shows the decks its temperature allows, which is the model working rather than failing.
    // The owner moved a 700 K recipe from 22.7 AU in to 0.12 AU and it 'became super intense', which
    // is the whole point: say where that happens instead of telling them what will not work.
    //
    // THE SUGGESTED DISTANCE IS A RATIO ON THE ENGINE'S OWN NUMBER, not a second formula. Equilibrium
    // temperature follows the inverse square, so d_target = d_now x (T_now / T_target)^2 anchored on
    // whatever `equilibriumTempK` the processor committed. Nothing here can drift from the physics
    // because nothing here recomputes it. Surface temperature is deliberately NOT used: greenhouse and
    // internal heat sit on top of it and do not scale with distance.
    // TWO DIFFERENT NUMBERS, and conflating them showed the wrong one. `temperatureK` is what the
    // gallery card LABELS the giant ('165 K - Jupiter-like'), so it is what a GM recognises and what
    // this quotes. `equilibriumTempK` is what DISTANCE actually sets, so it is what the ratio uses.
    // They are equal on the hot-Jupiter rows and far apart on the cool ones.
    const want = recipe.requires.temperatureK || recipe.requires.equilibriumTempK;
    const wantEq = recipe.requires.equilibriumTempK || recipe.requires.temperatureK;
    const haveEq = (body as any).equilibriumTempK as number | undefined;
    const haveSurface = body.temperatureK;
    let suggestAU: number | null = null;
    try {
      const nodes = (system?.nodes ?? []) as any[];
      const star = nodes.find((n) => isLuminousSource(n));
      const dNow = star ? calculateDistanceToStar(body as any, star, nodes as any) : 0;
      // Fall back to the orbit's own semi-major axis when the walk finds nothing (a body under a
      // barycentre, a half-built system). Advice that silently loses its most useful half is worse
      // than advice with a stated assumption — and for a planet orbiting its star these agree.
      const dAU = dNow > 0 ? dNow : ((body as any).orbit?.elements?.a_AU ?? 0);
      if (dAU > 0 && haveEq && haveEq > 0 && wantEq > 0) suggestAU = dAU * Math.pow(haveEq / wantEq, 2);
    } catch { /* advice is optional; never let it break an import that worked */ }

    const fmtAU = (au: number) => au >= 10 ? au.toFixed(0) : au >= 1 ? au.toFixed(1) : au.toFixed(3).replace(/0+$/, '');
    const saved = `Saved as "${name}" and applied.`;
    if (!(want > 0)) {
      recipeNote = saved;
    } else if (!(haveSurface && haveSurface > 0) && !haveEq) {
      recipeNote = `${saved} These colours are strongest near ${Math.round(want)} K — give ${body.name} a star and an orbit to see where that falls.`;
    } else if (haveEq && Math.abs(haveEq - wantEq) <= Math.max(5, wantEq * 0.08)) {
      recipeNote = `${saved} ${body.name} is already about where these colours are brightest (near ${Math.round(want)} K).`;
    } else if (suggestAU) {
      recipeNote = `${saved} These colours are brightest near ${Math.round(want)} K. ${body.name} runs about ${Math.round(haveEq!)} K where it is — bring it to roughly ${fmtAU(suggestAU)} AU and they come alive. It will still work where it is; different decks condense, so you get a paler version.`;
    } else {
      recipeNote = `${saved} These colours are brightest near ${Math.round(want)} K${haveEq ? `, and ${body.name} runs about ${Math.round(haveEq)} K where it is` : ''}.`;
    }
    recipeWarn = false; // advice, not a warning — the import worked
    recipeText = '';
    showRecipe = false;
    // Bring it to the eye rather than hoping. Cheap, and it is the only moment this matters.
    setTimeout(() => recipeMsgEl?.scrollIntoView({ block: 'nearest', behavior: 'smooth' }), 0);
  }

  // Reactive Gas Physics Data
  $: gasPhysics = rulePack.gasPhysics || {};

  // G37: the FIELD IS NO LONGER EDITED HERE. It is a derived reading on this tab (against the
  // class zones below) and the GM's pin lives on the Overrides tab with every other pin. So there is
  // no binding to keep an object alive for, and no second place that can set the field.
  $: magPinned = typeof body?.overrides?.magneticFieldGauss === 'number';

  // Only sync the dropdown when we switch to a different body
  let currentBodyId = '';
  $: if (body.id !== currentBodyId) {
      currentBodyId = body.id;
      if (body.atmosphere) {
          const match = availableAtmospheres.find(a => a.name === body.atmosphere!.name);
          selectedAtmosphereName = match ? body.atmosphere.name : 'Custom Mix';
      } else {
          selectedAtmosphereName = 'None';
      }
  }

  $: {
    if (rulePack.distributions && rulePack.distributions.atmosphere_composition) {
      availableAtmospheres = rulePack.distributions.atmosphere_composition.entries.map((e: any) => e.value);
    }
    
    if (rulePack.gasPhysics) {
        availableGases = Object.keys(rulePack.gasPhysics).sort();
    }
  }

  function handleAtmosphereChange() {
    lockAging();
    if (selectedAtmosphereName === 'None') {
      body.atmosphere = undefined;
      body.greenhouseTempK = 0;
      applyChanges();
      return;
    }

    if (selectedAtmosphereName === 'Custom Mix') return;

    const template = availableAtmospheres.find(a => a.name === selectedAtmosphereName);
    if (template) {
        const newComposition: Record<string, number> = {};
        for(const [gas, val] of Object.entries(template.composition)) {
            if (Array.isArray(val)) {
                newComposition[gas] = (val[0] + val[1]) / 2;
            } else {
                newComposition[gas] = val as number;
            }
        }
        
        normalizeComposition(newComposition);

        let newPressure = 1.0;
        if (template.pressure_range_bar) {
            newPressure = (template.pressure_range_bar[0] + template.pressure_range_bar[1]) / 2;
        }

        body.atmosphere = {
            name: template.name,
            composition: newComposition,
            pressure_bar: newPressure,
            main: Object.keys(newComposition).reduce((a, b) => newComposition[a] > newComposition[b] ? a : b)
        };
        
        applyChanges();
    }
  }

  function normalizeComposition(comp: Record<string, number>) {
      const total = Object.values(comp).reduce((a, b) => a + b, 0);
      if (total > 0) {
          for (const key in comp) {
              comp[key] = comp[key] / total;
          }
      }
  }

  function calculateShieldingScore(atm: any, pack: RulePack): number {
      if (!atm.composition) return 0.5;
      let totalShielding = 0;
      let totalGas = 0;
      for (const [gas, amount] of Object.entries(atm.composition)) {
          const coeff = pack.gasPhysics?.[gas]?.shielding ?? pack.gasShielding?.[gas] ?? 0.5;
          totalShielding += (coeff as number) * (amount as number);
          totalGas += (amount as number);
      }
      return totalGas > 0 ? totalShielding / totalGas : 0.5;
  }

  function updateGasFraction(gas: string, newPercentage: number) {
      if (!body.atmosphere) return;
      lockAging();

      const newFraction = newPercentage / 100;
      const oldFraction = body.atmosphere.composition[gas] || 0;
      const diff = newFraction - oldFraction;
      
      body.atmosphere.composition[gas] = newFraction;

      const otherGases = Object.keys(body.atmosphere.composition).filter(g => g !== gas);
      const totalOthers = otherGases.reduce((sum, g) => sum + (body.atmosphere!.composition[g] || 0), 0);

      if (totalOthers > 0) {
          for (const other of otherGases) {
              const share = body.atmosphere.composition[other] / totalOthers;
              let newOtherVal = body.atmosphere.composition[other] - (diff * share);
              body.atmosphere.composition[other] = Math.max(0, newOtherVal);
          }
      } else if (newFraction < 1.0 && otherGases.length === 0) {
          body.atmosphere.composition[gas] = 1.0;
      }
      
      normalizeComposition(body.atmosphere.composition);
      
      if (!body.atmosphere.name.includes("Custom")) {
          body.atmosphere.name = "Custom Mix";
          selectedAtmosphereName = "Custom Mix";
      }

      applyChanges();
  }

  // B100 — HOW A TRACE GAS USED TO BE DELETED BY A CLICK.
  //
  // The box rendered `(fraction * 100).toFixed(3)` and its `on:blur` wrote that DISPLAYED string
  // straight back. A gas at 0.0004 % displays as '0.000' under three fixed decimals, so merely
  // focusing the field and leaving it again SET THE GAS TO ZERO — no edit made, no warning, and on
  // the reporter's own Jupiter six of eight gases sat below that rounding floor. Two guards, and
  // BOTH are needed: `fmtGasPct` below keeps enough significant figures that the value round-trips,
  // and this refuses to write at all when the number has not actually moved. The equality is
  // RELATIVE because the value has been through a format/parse cycle and will not be bit-identical;
  // 1e-9 is far below any edit a human can express in this box and far above float round-trip noise.
  function updateGasFractionFromText(gas: string, rawValue: string) {
      const parsed = parseFloat(rawValue);
      if (!isFinite(parsed)) return;
      const clamped = Math.max(0, Math.min(100, parsed));
      // Compare against what was DISPLAYED, not against the stored value. The box necessarily
      // rounds (three significant figures), so a stored 0.001818 % shows as 0.00182 — and a guard
      // comparing the typed text with the STORED number reads that rounding as a real edit and
      // writes it, which is the same data loss in a smaller coat.
      const shown = fmtGasPct(body.atmosphere?.composition?.[gas] ?? 0);
      if (clamped === parseFloat(shown)) return;
      updateGasFraction(gas, clamped);
  }

  // B100: SIGNIFICANT FIGURES, NOT FIXED DECIMALS. Atmospheric physics keys on partial pressure,
  // so what matters is the RATIO: 0.0004 % and 0.04 % are two decades apart and both must be
  // legible and editable. Three significant figures, trailing zeros trimmed, capped at twelve
  // decimals so a pathological value cannot stretch the control.
  export function fmtGasPct(fraction: number): string {
      const pct = (fraction ?? 0) * 100;
      if (!isFinite(pct) || pct === 0) return '0';
      const abs = Math.abs(pct);
      const decimals = abs >= 1 ? 3 : Math.min(12, 3 - Math.floor(Math.log10(abs)) - 1);
      return pct.toFixed(decimals).replace(/(\.\d*?)0+$/, '$1').replace(/\.$/, '');
  }

  function addGas(gas: string) {
      if (!body.atmosphere) return;
      if (body.atmosphere.composition[gas]) return;
      lockAging();

      body.atmosphere.composition[gas] = 0.05; // Start with 5%
      normalizeComposition(body.atmosphere.composition);
      
      if (!body.atmosphere.name.includes("Custom")) {
          body.atmosphere.name = "Custom Mix";
          selectedAtmosphereName = "Custom Mix";
      }
      
      applyChanges();
  }

  function removeGas(gas: string) {
      if (!body.atmosphere) return;
      lockAging();
      delete body.atmosphere.composition[gas];
      
      if (Object.keys(body.atmosphere.composition).length > 0) {
          normalizeComposition(body.atmosphere.composition);
      } else {
          body.atmosphere.composition = { "N2": 1.0 }; // Fallback to avoid empty
      }
      
      if (!body.atmosphere.name.includes("Custom")) {
          body.atmosphere.name = "Custom Mix";
          selectedAtmosphereName = "Custom Mix";
      }

      applyChanges();
  }

  function toggleAtmosphereAging(e: Event) {
      const on = (e.currentTarget as HTMLInputElement).checked;
      body.evolveAtmosphere = on;
      // Turning aging OFF freezes what you currently see as the authored end-state.
      if (!on) body.atmosphere0 = undefined;
      applyChanges();
  }

  // A hand edit makes the atmosphere END-STATE: aging auto-skips (the toggle re-enables it).
  function lockAging() {
      if (body.evolveAtmosphere) { body.evolveAtmosphere = false; body.atmosphere0 = undefined; }
  }

  function applyChanges() {
      // 1. Recalculate Logic — the ONE physics pipeline (same pass as load/generation), so an edit can
      // never disagree with a reload. (The old light recalculateSystemPhysics fork drifted twice: the
      // heat-model audit and the habitability scorer.) process() mutates the node objects in place,
      // so the local `body` reference stays live.
      systemProcessor.process(system, rulePack);
      
      // 2. Sync to global store
      systemStore.update(s => {
          if (!s) return s;
          const index = s.nodes.findIndex(n => n.id === body.id);
          if (index !== -1) {
              s.nodes[index] = { ...body };
          }
          return { ...s };
      });

      // 3. Trigger local UI refresh
      body = body;
      dispatch('update', body);
  }

  function getActiveTags(gas: string, fraction: number): string[] {
      const physics = gasPhysics[gas];
      if (!physics || !physics.tags || !body.atmosphere) return [];
      
      const pressure = body.atmosphere.pressure_bar || 0;
      const context: Record<string, number | boolean> = {
          pressure_bar: pressure,
          gravity: (body.calculatedGravity_ms2 || 0) / 9.81,
          temp: body.temperatureK || 0,
          pp: pressure * fraction,
          percent: fraction
      };
      for (const g in body.atmosphere.composition) {
          context[`${g}_gas_present`] = true;
      }

      return physics.tags
          .filter(t => evalTrigger(t.trigger, context))
          .map(t => t.name);
  }

  // --- SVG Slider Logic ---
  let svgPressureSlider: SVGSVGElement;
  let isPressureDragging = false;

  const minP = 0.0001;
  const maxP = 1000;
  const minMag = 0.01;
  const maxMag = 100;

  const pressureMarks = [
    { val: 0.0001, label: '0' },
    { val: 0.01, label: '0.01' },
    { val: 1, label: '1' },
    { val: 100, label: '100' },
    { val: 1000, label: '1000' },
  ];

  const magMarks = [
      { val: 0.01, label: '0' },
      { val: 0.1, label: '0.1' },
      { val: 1, label: '1' },
      { val: 10, label: '10' },
      { val: 100, label: '100' }
  ];

  function getPressurePercent(val: number) {
      if (val <= minP) return 0; 
      const minLog = Math.log(minP);
      const maxLog = Math.log(maxP);
      return ((Math.log(val) - minLog) / (maxLog - minLog)) * 100;
  }

  function getMagPercent(val: number) {
      if (val <= minMag) return 0;
      const minLog = Math.log(minMag);
      const maxLog = Math.log(maxMag);
      return ((Math.log(val) - minLog) / (maxLog - minLog)) * 100;
  }

  function handlePressureMouseDown(e: MouseEvent) {
      isPressureDragging = true;
      updatePressureValue(e);
  }

  function updatePressureValue(e: MouseEvent) {
      if (!svgPressureSlider || !body.atmosphere) return;
      lockAging();
      const rect = svgPressureSlider.getBoundingClientRect();
      const pct = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
      const minLog = Math.log(minP);
      const maxLog = Math.log(maxP);
      body.atmosphere.pressure_bar = Math.exp(minLog + (maxLog - minLog) * pct);
      applyChanges();
  }

</script>

<svelte:window 
    on:mouseup={() => { isPressureDragging = false; }} 
    on:mousemove={(e) => { 
        if (isPressureDragging) updatePressureValue(e);
    }} 
/>

<div class="atmosphere-tab">
  <!-- MAGNETOSPHERE -->
  <div class="form-group">
      <div class="label-row">
           <label>Magnetosphere (Gauss) {#if magPinned}<span class="mag-override" title="Pinned by the GM on the Overrides tab — this field governs the shielding tags instead of the interior model.">pinned</span>{/if}</label>
           <span class="mag-reading">{formatGauss(body.magneticField?.strengthGauss ?? 0)} G</span>
      </div>
      <p class="mag-where">{magPinned ? 'Pinned' : 'Set'} on the <strong>Overrides</strong> tab.</p>
      <div class="orbital-slider-container" style="height: 80px;">
          <svg class="orbital-slider" preserveAspectRatio="none">
              <rect x="0" y="20" width="100%" height="10" fill="var(--bg-panel)" rx="5" />
              <!-- Zone Indicators -->
              <rect x="0" y="35" width="{getMagPercent(2)}%" height="4" fill="orange" rx="1" />
              <text x="0%" y="50" fill="orange" font-size="10">Terrestrial</text>
              
              <rect x="{getMagPercent(0.1)}%" y="35" width="{getMagPercent(1) - getMagPercent(0.1)}%" height="4" fill="#add8e6" rx="1" />
              <text x="{getMagPercent(0.1)}%" y="50" fill="#add8e6" font-size="10">Ice</text>

              <rect x="{getMagPercent(4)}%" y="32" width="{getMagPercent(100) - getMagPercent(4)}%" height="4" fill="#cc0000" rx="1" />
              <text x="{getMagPercent(4)}%" y="50" fill="#cc0000" font-size="10">Gas</text>

              {#each magMarks as mark}
                  {@const pct = getMagPercent(mark.val)}
                  <line x1="{pct}%" y1="15" x2="{pct}%" y2="35" stroke="var(--text-faint)" stroke-width="1" />
                  <text x="{pct}%" y="65" fill="var(--text-faint)" font-size="9" text-anchor="middle">{mark.label}</text>
              {/each}
              <circle cx="{getMagPercent(body.magneticField?.strengthGauss || minMag)}%" cy="25" r="6" fill={magPinned ? '#d08a4a' : '#fff'} stroke="#000" stroke-width="2" />
          </svg>
      </div>
      {#if body.magnetism}
          {@const m = body.magnetism}
          <div class="mag-derived">
              <div class="mag-derived-head">
                  <span class="mag-source">{m.source.replace(/-/g, ' ')}</span>
                  {#if m.source !== 'none'}
                      <span class="mag-geom">{m.geometry.replace(/-/g, ' ')}{m.intrinsic ? ' · intrinsic' : ' · induced'}</span>
                      <span class="mag-range">implies ~{formatGauss(m.estimatedRangeGauss.min)}–{formatGauss(m.estimatedRangeGauss.max)} G</span>
                  {/if}
              </div>
              {#if m.notes.length}<p class="mag-note">{m.notes[0]}</p>{/if}
          </div>
      {/if}
  </div>

  <div class="form-group">
    <label for="atmosphere-preset">Atmosphere Preset</label>
    <select id="atmosphere-preset" bind:value={selectedAtmosphereName} on:change={handleAtmosphereChange}>
      <option value="None">None</option>
      {#each availableAtmospheres as atm}
        <option value={atm.name}>{atm.name}</option>
      {/each}
      <option value="Custom Mix">Custom Mix</option>
    </select>
    <div class="recipe-row">
      <button type="button" class="recipe-btn" on:click={() => { showRecipe = !showRecipe; recipeError = null; }}>
        {showRecipe ? "Cancel" : "Import recipe…"}
      </button>
      <a class="recipe-link" href="/discgallery#giant-lab" target="_blank" rel="noopener"
         title="The gas-giant gallery — every giant there carries a Copy recipe button">gas-giant gallery</a>
    </div>
    {#if showRecipe}
      <div class="recipe-panel">
        <p class="recipe-help">Paste a recipe copied from the gas-giant gallery. It becomes a named preset on this
          campaign and is applied here.</p>
        <textarea bind:value={recipeText} rows="6" placeholder={RECIPE_PLACEHOLDER}></textarea>
        <button type="button" class="recipe-btn primary" on:click={importRecipe}>Import</button>
      </div>
    {/if}
    {#if recipeError}<p class="recipe-msg bad">{recipeError}</p>{/if}
    {#if recipeNote}<p class="recipe-msg" class:warn={recipeWarn} bind:this={recipeMsgEl}>{recipeNote}</p>{/if}
  </div>

  {#if body.atmosphere}
    <div class="form-group">
      <label for="atm-name">Name Override</label>
      <input type="text" id="atm-name" bind:value={body.atmosphere.name} on:change={applyChanges} />
    </div>

    <!-- AGING (evolution opt-in) -->
    <div class="aging-row">
      <label class="aging-toggle" title="Off (default): this atmosphere is the end-state you authored — the engine never erodes it. On: it is treated as primordial and thins over the system's age (Jeans + stellar-wind escape, derived from a stored baseline so re-processing never compounds). Hand-editing the mix switches this off automatically.">
        <input type="checkbox" checked={!!body.evolveAtmosphere} on:change={toggleAtmosphereAging} />
        <span>Age over system lifetime</span>
      </label>
      {#if body.evolveAtmosphere && body.atmosphere0}
        <span class="aging-hint">eroding from a {(body.atmosphere0.pressure_bar || 0).toPrecision(2)} bar baseline</span>
      {/if}
    </div>

    <!-- PRESSURE -->
    <div class="form-group">
      <div class="label-row">
          <label for="pressure">Surface Pressure (bar)</label>
          <input type="number" bind:value={body.atmosphere.pressure_bar} step="0.01" on:input={() => { lockAging(); applyChanges(); }} />
      </div>
      <div class="orbital-slider-container" style="height: 60px;">
          <svg 
              bind:this={svgPressureSlider}
              class="orbital-slider" 
              on:mousedown={handlePressureMouseDown}
              preserveAspectRatio="none"
          >
              <rect x="0" y="20" width="100%" height="10" fill="var(--bg-panel)" rx="5" />
              {#each pressureMarks as mark}
                  {@const pct = getPressurePercent(mark.val)}
                  <line x1="{pct}%" y1="15" x2="{pct}%" y2="35" stroke="var(--text-faint)" stroke-width="1" />
                  <text x="{pct}%" y="45" fill="var(--text-faint)" font-size="9" text-anchor="middle">{mark.label}</text>
              {/each}
              <circle cx="{getPressurePercent(body.atmosphere.pressure_bar || minP)}%" cy="25" r="6" fill="#fff" stroke="#000" stroke-width="2" />
          </svg>
      </div>
    </div>

    <div class="stats-panel">
        <div class="stat">
            <span class="label" title="Total modeled greenhouse warming added by the current atmosphere, shown as +K on top of equilibrium temperature.">Greenhouse:</span>
            <span class="value" class:hot={body.greenhouseTempK > 50}>+{Math.round(body.greenhouseTempK || 0)} K</span>
        </div>
        <div class="stat">
            <span class="label">Scale Height:</span>
            <span class="value">{#if body.atmosphere.scaleHeightKm}<UnitValue quantity="radius" bodyType={unitBodyTypeFor(body)} value={body.atmosphere.scaleHeightKm} decimals={1} />{:else}-{/if}</span>
        </div>
        <div class="stat">
            <span class="label" title="Percent of incoming stellar radiation blocked by atmospheric composition and pressure.">Radiation Block:</span>
            <span class="value">
                {#if body.atmosphere && body.atmosphere.pressure_bar > 0}
                    {@const transmission = Math.exp(-calculateShieldingScore(body.atmosphere, rulePack) * body.atmosphere.pressure_bar)}
                    {((1 - transmission) * 100).toFixed(1)}%
                {:else}
                    0%
                {/if}
            </span>
        </div>
    </div>

    <div class="advanced-toggle" on:click={() => showAdvanced = !showAdvanced}>
        {showAdvanced ? '▼' : '▶'} Advanced Composition Editor
    </div>

    {#if showAdvanced}
        <div class="composition-editor">
            {#each Object.entries(body.atmosphere.composition) as [gas, fraction]}
                {@const physics = gasPhysics[gas]}
                {@const currentTemp = body.temperatureK || 288}
                {@const isGas = currentTemp >= (physics?.boilK || 0)}
                {@const isLiquid = !isGas && currentTemp >= (physics?.meltK || 0)}
                {@const phaseLabel = isGas ? 'Gas' : (isLiquid ? 'Liquid' : 'Solid')}
                {@const activeTags = getActiveTags(gas, fraction)}
                {@const retention = physics ? checkGasRetention(physics.molarMass, body) : 'stable'}
                
                <div class="gas-editor-row">
                    <div class="gas-row" class:condensed={!isGas} class:escaping={retention !== 'stable'}>
                        <span class="gas-name" title={!isGas ? `${phaseLabel} at ${Math.round(currentTemp)}K (Melt: ${physics.meltK}K, Boil: ${physics.boilK}K)` : (retention !== 'stable' ? `Unstable: Gas is too light and will escape into space.` : '')}>
                            {gas}
                            {#if isCryoImpactedGreenhouseGas(body, gas, rulePack)}
                                <span class="cryo-icon" title="Cryo Temps - Greenhouse effects lower due to spectral shift">❄</span>
                            {/if}
                            {#if !isGas}<span class="phase-warning">!</span>{/if}
                            {#if retention !== 'stable'}<span class="phase-warning escape">{retention === 'unstable' ? '△' : '🔥'}</span>{/if}
                        </span>
                        <input 
                            type="range" 
                            min="0" max="100" step="0.1" 
                            value={fraction * 100} 
                            on:input={(e) => updateGasFraction(gas, parseFloat(e.currentTarget.value))}
                        />
                        <input
                            class="gas-val-input"
                            type="number"
                            min="0"
                            max="100"
                            step="0.001"
                            value={fmtGasPct(fraction)}
                            on:change={(e) => updateGasFractionFromText(gas, e.currentTarget.value)}
                            on:blur={(e) => updateGasFractionFromText(gas, e.currentTarget.value)}
                            title="Gas percentage (0-100). Trace values keep their significant figures."
                        />
                        <button class="remove-btn" on:click={() => removeGas(gas)} title="Remove Gas">×</button>
                    </div>
                    {#if activeTags.length > 0}
                        <div class="gas-tags">
                            {#each activeTags as tag}
                                <span class="mini-tag">{tag}</span>
                            {/each}
                        </div>
                    {/if}
                </div>
            {/each}

            <div class="add-gas-row">
                <select id="add-gas-select" on:change={(e) => { addGas(e.currentTarget.value); e.currentTarget.value = ''; }}>
                    <option value="" disabled selected>+ Add Gas Component</option>
                    {#each availableGases as g}
                        {#if !body.atmosphere.composition[g]}
                            {@const physics = gasPhysics[g]}
                            {@const currentTemp = body.temperatureK || 288}
                            {@const isGas = currentTemp >= (physics?.boilK || 0)}
                            {@const isLiquid = !isGas && currentTemp >= (physics?.meltK || 0)}
                            {@const phaseLabel = isGas ? '' : (isLiquid ? '(Liquid)' : '(Solid)')}
                            {@const retention = physics ? checkGasRetention(physics.molarMass, body) : 'stable'}
                            <option value={g}>
                                {g} {phaseLabel} {retention !== 'stable' ? '(Escaping)' : ''}
                            </option>
                        {/if}
                    {/each}
                </select>
            </div>
        </div>
    {:else}
        <div class="composition-summary">
            {#each Object.entries(body.atmosphere.composition) as [gas, fraction]}
                {#if fraction > 0.005}
                    {@const physics = gasPhysics[gas]}
                    {@const isGas = (body.temperatureK || 288) >= (physics?.boilK || 0)}
                    {@const activeTags = getActiveTags(gas, fraction)}
                    <div class="summary-chip" style="background: {gasPhysics[gas]?.colorHex || '#444'}44" class:condensed={!isGas}>
                        <span class="gas">
                            {gas}
                            {#if isCryoImpactedGreenhouseGas(body, gas, rulePack)}
                                <span class="cryo-icon" title="Cryo Temps - Greenhouse effects lower due to spectral shift">❄</span>
                            {/if}
                        </span>
                        <span class="pct">{(fraction * 100).toFixed(1)}%</span>
                        {#if !isGas}<span class="phase-indicator">❄</span>{/if}
                        {#if activeTags.length > 0}
                            <div class="chip-tags">
                                <span class="tag-info-icon" title={activeTags.join(', ')}>i</span>
                            </div>
                        {/if}
                    </div>
                {/if}
            {/each}
        </div>
    {/if}

  {/if}
</div>

<style>
  .atmosphere-tab {
    display: flex;
    flex-direction: column;
    gap: 1.2rem;
    padding: 10px;
  }
  .mag-derived {
    margin-top: 4px; padding: 6px 8px; border-radius: 4px;
    background: var(--bg-panel); border: 1px solid var(--border);
  }
  .mag-derived-head { display: flex; flex-wrap: wrap; gap: 6px 10px; align-items: baseline; }
  .mag-source { font-weight: 600; text-transform: capitalize; color: var(--text); }
  .mag-geom { font-size: 0.8em; color: var(--text-muted); text-transform: capitalize; }
  .mag-range { font-size: 0.8em; color: var(--link); margin-left: auto; }
  .mag-note { margin: 4px 0 0; font-size: 0.78em; color: var(--text-faint); line-height: 1.4; }
  .mag-override {
    font-size: 0.7em; text-transform: uppercase; letter-spacing: 0.04em; color: var(--accent, #ff5a1f);
    border: 1px solid var(--accent, #ff5a1f); border-radius: 3px; padding: 0 4px; margin-left: 6px; cursor: help;
  }
  .mag-reading { font-variant-numeric: tabular-nums; color: var(--text); font-size: 0.85em; }
  .mag-where { margin: 2px 0 0; font-size: 0.7em; color: var(--text-faint); }
  .mag-reset-btn {
    align-self: flex-start; background: none; border: none; padding: 2px 0; margin-top: 2px;
    color: var(--link, #6aa0d8); font-size: 0.78em; cursor: pointer;
  }
  .mag-reset-btn:hover { text-decoration: underline; }
  .form-group {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }
  .label-row {
      display: flex;
      justify-content: space-between;
      align-items: center;
  }
  .slider-row input[type="number"], .label-row input[type="number"] {
      width: 85px;
      padding: 4px;
      background: var(--bg-panel);
      border: 1px solid var(--border);
      color: var(--text);
      text-align: right;
  }
  .orbital-slider-container {
      width: 100%;
      user-select: none;
      margin-top: 5px;
  }
  .orbital-slider {
      width: 100%;
      height: 100%;
      overflow: visible;
  }
  text { pointer-events: none; font-family: sans-serif; }
  
  .aging-row {
      display: flex;
      align-items: baseline;
      gap: 10px;
      flex-wrap: wrap;
  }
  .aging-toggle {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      cursor: pointer;
      font-size: 0.9em;
      color: var(--text-muted);
  }
  .aging-hint {
      font-size: 0.78em;
      color: var(--text-faint);
  }
  .advanced-toggle {
      cursor: pointer;
      font-weight: bold;
      color: var(--link);
      user-select: none;
      padding: 8px 0;
      border-top: 1px solid var(--border-soft);
      font-size: 0.9em;
  }
  .advanced-toggle:hover {
      color: var(--text);
  }
  
  .composition-editor {
      background: rgba(0,0,0,0.15);
      padding: 10px;
      border-radius: 6px;
      display: flex;
      flex-direction: column;
      gap: 12px;
  }
  .gas-editor-row {
      display: flex;
      flex-direction: column;
      gap: 4px;
  }
  .gas-row {
      display: flex;
      align-items: center;
      gap: 10px;
  }
  .gas-row.condensed .gas-name {
      color: var(--link);
  }
  .gas-row.escaping .gas-name {
      color: #ffaa88;
  }
  .phase-warning {
      color: var(--warning);
      font-weight: bold;
      margin-left: 4px;
      font-size: 0.8em;
  }
  .phase-warning.escape {
      color: #ff4400;
  }
  .gas-name {
      width: 55px;
      font-weight: bold;
      font-size: 0.9em;
  }
  .cryo-icon {
      margin-left: 4px;
      color: var(--link);
      font-size: 0.9em;
      cursor: help;
  }
  .gas-row input[type="range"] { flex: 1; }
  .gas-val-input {
      width: 72px;
      text-align: right;
      font-family: monospace;
      font-size: 0.85em;
      background: #1f1f1f;
      border: 1px solid var(--border);
      color: var(--text);
      padding: 2px 4px;
      border-radius: 3px;
  }
  .remove-btn {
      background: none;
      border: none;
      color: #f55;
      cursor: pointer;
      font-size: 1.4em;
      line-height: 1;
      padding: 0 5px;
  }
  .remove-btn:hover { color: #f00; }

  .gas-tags {
      display: flex;
      flex-wrap: wrap;
      gap: 4px;
      padding-left: 65px;
  }
  .mini-tag {
      font-size: 0.7em;
      background: var(--bg-control);
      color: var(--text-muted);
      padding: 1px 6px;
      border-radius: 4px;
      border: 1px solid var(--border);
  }

  .add-gas-row select {
      width: 100%;
      margin-top: 5px;
      padding: 6px;
      background: var(--bg-panel);
      border: 1px dashed var(--border);
      color: var(--text-muted);
  }

  .composition-summary {
      display: flex;
      flex-wrap: wrap;
      gap: 6px;
  }
  .summary-chip {
      background: var(--bg-panel);
      padding: 3px 8px;
      border-radius: 12px;
      font-size: 0.8em;
      border: 1px solid var(--border);
      display: flex;
      align-items: center;
      position: relative;
  }
  .summary-chip.condensed {
      border-color: #5588aa;
      color: var(--link);
  }
  .summary-chip .gas { font-weight: bold; margin-right: 4px; }
  .summary-chip .pct { color: var(--text-muted); }
  .phase-indicator {
      margin-left: 5px;
      font-size: 0.9em;
  }
  .chip-tags {
      display: flex;
      gap: 2px;
      margin-left: 6px;
  }
  .tag-info-icon {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      width: 12px;
      height: 12px;
      background: #ffaa00;
      color: #000;
      font-size: 9px;
      font-weight: bold;
      border-radius: 50%;
      cursor: help;
      line-height: 1;
  }

  .stats-panel {
      display: grid;
      grid-template-columns: 1fr 1fr 1fr;
      gap: 8px;
      background: var(--bg-panel);
      padding: 12px;
      border-radius: 8px;
      border: 1px solid var(--border-soft);
  }
  .stat {
      display: flex;
      flex-direction: column;
      align-items: center;
      text-align: center;
  }
  .stat .label {
      color: var(--text-faint);
      font-size: 0.7em;
      text-transform: uppercase;
      letter-spacing: 0.05em;
      margin-bottom: 2px;
  }
  .stat .value {
      font-weight: bold;
      font-size: 0.95em;
      color: var(--text);
  }
  .stat .value.hot { color: #ffaa88; }
  /* G7 recipe import */
  .recipe-row { display: flex; align-items: center; gap: 10px; margin-top: 6px; }
  .recipe-btn {
    font-size: 0.75em; padding: 3px 9px; border-radius: 4px; cursor: pointer;
    background: var(--bg-control, #1b1e26); border: 1px solid var(--border, #2a2d36); color: var(--text-muted, #cfcfcf);
  }
  .recipe-btn:hover { border-color: var(--link, #6cb6ff); color: var(--text, #eee); }
  .recipe-btn.primary { border-color: var(--link, #6cb6ff); color: var(--link, #6cb6ff); margin-top: 6px; }
  .recipe-link { font-size: 0.75em; color: var(--link, #6cb6ff); }
  .recipe-panel { margin-top: 8px; }
  .recipe-panel textarea {
    width: 100%; font-family: ui-monospace, monospace; font-size: 0.75em;
    background: var(--bg-control, #1b1e26); border: 1px solid var(--border, #2a2d36);
    color: var(--text, #eee); border-radius: 4px; padding: 6px;
  }
  .recipe-help { font-size: 0.75em; color: var(--text-faint, #8a8f9a); margin: 0 0 4px; line-height: 1.4; }
  .recipe-msg { font-size: 0.75em; color: var(--text-muted, #cfcfcf); margin: 6px 0 0; line-height: 1.45; }
  .recipe-msg.bad { color: #e08a7a; }
  /* The mismatch case. Not an error — the import worked — but the GM must not walk away thinking
     the world will look like the gallery, so it is a callout rather than a footnote. */
  .recipe-msg.warn {
    color: #f0c674; background: rgba(240, 198, 116, 0.08);
    border: 1px solid rgba(240, 198, 116, 0.35); border-left-width: 3px;
    border-radius: 4px; padding: 7px 9px; font-size: 0.78em;
  }
</style>
