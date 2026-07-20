<script lang="ts">
  import { createEventDispatcher, onMount } from 'svelte';
  import type { Starmap, RulePack } from '$lib/types';

  export let showModal: boolean;
  export let rulePack: RulePack;
  export let starmap: Starmap;

  const dispatch = createEventDispatcher();

  let activeTab: 'gases' | 'compositions' = 'gases';
  
  // Local state for editing
  let gases: Record<string, any> = {};
  let compositions: any[] = [];
  
  // Track original keys to know what is default vs custom
  let defaultGasKeys = new Set<string>();
  let defaultCompositions = new Set<string>();
  const greenhouseFactorHelp = 'Relative warming potency for this gas. Higher values add more greenhouse heating at the same partial pressure. This is a model coefficient, not direct Kelvin.';
  const shieldingFactorHelp = 'Radiation blocking strength per bar for this gas. Used in transmission = exp(-(factor x pressure_bar)). Higher values block more incoming radiation.';

  onMount(() => {
    // Load Defaults
    if (rulePack.gasPhysics) {
      Object.entries(rulePack.gasPhysics).forEach(([key, val]) => {
        defaultGasKeys.add(key);
        gases[key] = JSON.parse(JSON.stringify(val));
      });
    }

    if (rulePack.distributions?.['atmosphere_composition']) {
      const defaults = rulePack.distributions['atmosphere_composition'].entries;
      defaults.forEach((c: any) => defaultCompositions.add(c.value.name));
      compositions = JSON.parse(JSON.stringify(defaults));
    }

    // Apply Overrides from Starmap
    if (starmap.rulePackOverrides) {
      if (starmap.rulePackOverrides.gasPhysics) {
        Object.entries(starmap.rulePackOverrides.gasPhysics).forEach(([key, val]) => {
          gases[key] = JSON.parse(JSON.stringify(val));
        });
      }
      if (starmap.rulePackOverrides.atmosphereCompositions) {
          compositions = JSON.parse(JSON.stringify(starmap.rulePackOverrides.atmosphereCompositions));
      }
    }
  });

  function handleSave() {
    const overrides: any = {};
    
    // Determine Gas Overrides
    const gasOverrides: Record<string, any> = {};
    let hasGasOverrides = false;
    
    Object.entries(gases).forEach(([key, val]) => {
        const defaultVal = rulePack.gasPhysics?.[key];
        if (!defaultVal || JSON.stringify(defaultVal) !== JSON.stringify(val)) {
            gasOverrides[key] = val;
            hasGasOverrides = true;
        }
    });
    
    if (hasGasOverrides) overrides.gasPhysics = gasOverrides;

    // Determine Composition Overrides
    const defaultComps = rulePack.distributions?.['atmosphere_composition']?.entries;
    if (JSON.stringify(defaultComps) !== JSON.stringify(compositions)) {
        overrides.atmosphereCompositions = compositions;
    }

    dispatch('save', overrides);
    dispatch('close');
  }

  function addGas() {
      const key = prompt('Enter gas formula (e.g. O3):');
      if (key && !gases[key]) {
          gases[key] = {
              molarMass: 0.032,
              shielding: 5,
              greenhouse: 0,
              specificHeat: 1.0,
              radiativeCooling: 0.1,
              colorHex: null,
              meltK: 100,
              boilK: 150,
              tags: [],
              aurora: []
          };
          gases = { ...gases };
      }
  }

  function addAuroraBand(gas: any) {
      gas.aurora = [...(gas.aurora ?? []), { colour: 'green', hex: '#57e39a', efficiency: 1, altitude: 1 }];
      gases = { ...gases };
  }
  function removeAuroraBand(gas: any, i: number) {
      gas.aurora = (gas.aurora ?? []).filter((_: any, j: number) => j !== i);
      gases = { ...gases };
  }
  function toggleGasColour(gas: any, on: boolean) {
      gas.colorHex = on ? (gas.colorHex ?? '#8aa0b8') : null;
      gases = { ...gases };
  }

  function removeGas(key: string) {
      if (defaultGasKeys.has(key)) {
          gases[key] = JSON.parse(JSON.stringify(rulePack.gasPhysics![key]));
          alert('Gas properties reverted to default.');
      } else {
          delete gases[key];
      }
      gases = { ...gases };
  }

  function addComposition() {
      compositions = [...compositions, {
          weight: 10,
          value: {
              name: "New Atmosphere Mix",
              pressure_range_bar: [0.8, 1.2],
              composition: { "N2": 0.8, "O2": 0.2 },
              occurs_on: "terrestrial"
          }
      }];
  }

  function removeComposition(index: number) {
      const comp = compositions[index];
      if (defaultCompositions.has(comp.value.name)) {
          alert("Cannot delete default atmosphere mixes. You can only modify their spawn weight or properties.");
          return;
      }
      compositions = compositions.filter((_, i) => i !== index);
  }

  function updateGasInComp(compIndex: number, oldGas: string, newGas: string) {
      const comp = compositions[compIndex].value;
      const amount = comp.composition[oldGas];
      delete comp.composition[oldGas];
      comp.composition[newGas] = amount;
      compositions = [...compositions];
  }

  function addGasToComp(index: number) {
      const gas = Object.keys(gases)[0];
      if (gas) {
          compositions[index].value.composition[gas] = 0.1;
          compositions = [...compositions];
      }
  }

  function getCompositionSummary(comp: any): string {
      const parts = [];
      for (const [gas, amount] of Object.entries(comp.composition)) {
          if (Array.isArray(amount)) {
              parts.push(`${gas} ${(amount[0]*100).toFixed(0)}-${(amount[1]*100).toFixed(0)}%`);
          } else {
              parts.push(`${gas} ${(amount as number * 100).toFixed(0)}%`);
          }
      }
      return parts.join(', ');
  }
</script>

{#if showModal}
<div class="modal-backdrop" on:click={() => dispatch('close')}>
  <div class="modal" on:click|stopPropagation>
    <div class="header">
        <h2>Edit Atmospheres & Mixes</h2>
        <div class="tabs">
            <button class:active={activeTab === 'gases'} on:click={() => activeTab = 'gases'}>Gas Physics</button>
            <button class:active={activeTab === 'compositions'} on:click={() => activeTab = 'compositions'}>Atmosphere Mixes</button>
        </div>
    </div>

    <div class="content">
        {#if activeTab === 'gases'}
            <div class="list-container">
                {#each Object.entries(gases) as [key, gas]}
                    <div class="item-card">
                        <div class="item-header">
                            <span class="formula">{key}</span>
                            {#if defaultGasKeys.has(key)}
                                <button class="delete-btn" on:click={() => removeGas(key)} title="Revert to Default">↺</button>
                            {:else}
                                <button class="delete-btn" on:click={() => removeGas(key)} title="Delete Custom Gas">✕</button>
                            {/if}
                        </div>
                        <div class="item-body">
                            <div class="field">
                                <label>Molar Mass (kg/mol)</label>
                                <input type="number" step="0.001" bind:value={gas.molarMass} />
                            </div>
                            <div class="field">
                                <label title={greenhouseFactorHelp}>Greenhouse Factor</label>
                                <input type="number" step="0.1" bind:value={gas.greenhouse} />
                            </div>
                            <div class="field">
                                <label title={shieldingFactorHelp}>Shielding Factor</label>
                                <input type="number" step="0.1" bind:value={gas.shielding} />
                            </div>
                            <div class="field">
                                <label>Boiling Point (K)</label>
                                <input type="number" bind:value={gas.boilK} />
                            </div>
                            <div class="field">
                                <label>Melting Point (K)</label>
                                <input type="number" bind:value={gas.meltK} />
                            </div>
                            <div class="field">
                                <label title="Heat capacity coefficient (model term)">Specific Heat</label>
                                <input type="number" step="0.01" bind:value={gas.specificHeat} />
                            </div>
                            <div class="field">
                                <label title="Radiative cooling coefficient (model term)">Radiative Cooling</label>
                                <input type="number" step="0.01" bind:value={gas.radiativeCooling} />
                            </div>
                            <div class="field">
                                <label title="Intrinsic tint of the gas. Colourless gases (N₂/O₂/CO₂) have none.">Gas Colour</label>
                                <div class="colour-row">
                                    <input type="checkbox" checked={gas.colorHex !== null && gas.colorHex !== undefined} on:change={(e) => toggleGasColour(gas, e.currentTarget.checked)} />
                                    {#if gas.colorHex !== null && gas.colorHex !== undefined}
                                        <input type="color" bind:value={gas.colorHex} />
                                    {:else}
                                        <span class="muted">colourless</span>
                                    {/if}
                                </div>
                            </div>
                            <div class="field aurora-field">
                                <label title="Auroral emission bands. A gas can emit more than one colour (atomic oxygen glows green low + crimson high).">Aurora Emission Bands</label>
                                <p class="aurora-help">The colour(s) this gas glows at the magnetic poles — a gas can emit several (oxygen glows green <em>and</em> crimson). These set the palette only: a world shows an aurora when it <strong>also</strong> has a magnetic field and an incident particle flux.</p>
                                {#if gas.aurora && gas.aurora.length}
                                    <div class="aurora-head">
                                        <span style="width:34px">Colour</span>
                                        <span style="width:80px">Name</span>
                                        <span style="width:62px" title="Brightness weight per unit of this gas. Atomic oxygen glows far brighter per molecule than nitrogen, which is why Earth's sky reads green.">Efficiency</span>
                                        <span style="width:72px" title="Which layer the glow sits in — low fringe, main band, or high tenuous band. Stacks the 3D shells in the right order.">Altitude</span>
                                        <span style="width:62px" title="Concentration threshold: the band only lights up once this gas is at least this fraction of the air (blank = always). Only O₂'s crimson band uses it, at 0.12 — the red crown appears only over a rich oxygen column.">Min frac.</span>
                                        <span style="width:20px"></span>
                                    </div>
                                    {#each gas.aurora as band, bi}
                                        <div class="aurora-band">
                                            <input type="color" bind:value={band.hex} title="Emission colour" />
                                            <input type="text" class="band-name" bind:value={band.colour} placeholder="name" title="Colour name (label only)" />
                                            <input type="number" step="0.1" class="band-num" bind:value={band.efficiency} placeholder="eff" title="Brightness per unit gas" />
                                            <select bind:value={band.altitude} title="Altitude layer">
                                                <option value={0}>low</option>
                                                <option value={1}>main</option>
                                                <option value={2}>high</option>
                                            </select>
                                            <input type="number" step="0.01" min="0" max="1" class="band-num" value={band.minFraction ?? ''} on:input={(e) => band.minFraction = e.currentTarget.value === '' ? undefined : +e.currentTarget.value} placeholder="—" title="Min gas fraction before this band lights up (blank = always)" />
                                            <button class="mini-del" on:click={() => removeAuroraBand(gas, bi)} title="Remove band">✕</button>
                                        </div>
                                    {/each}
                                {:else}
                                    <span class="muted">none (does not fluoresce)</span>
                                {/if}
                                <button class="mini-add" on:click={() => addAuroraBand(gas)}>+ Band</button>
                            </div>
                        </div>
                    </div>
                {/each}
                <button class="add-btn" on:click={addGas}>+ Add Custom Gas</button>
            </div>
        {:else}
            <div class="list-container">
                {#each compositions as entry, idx}
                    <div class="item-card">
                        <div class="item-header">
                            <div class="header-main">
                                <input type="text" class="name-input" bind:value={entry.value.name} />
                                <span class="header-summary">{getCompositionSummary(entry.value)}</span>
                            </div>
                            {#if !defaultCompositions.has(entry.value.name)}
                                <button class="delete-btn" on:click={() => removeComposition(idx)}>✕</button>
                            {/if}
                        </div>
                        <div class="item-body">
                            <div class="field">
                                <label>Spawn Weight</label>
                                <input type="number" bind:value={entry.weight} />
                            </div>
                            <div class="field">
                                <label>Min Pressure (bar)</label>
                                <input type="number" step="0.1" bind:value={entry.value.pressure_range_bar[0]} />
                            </div>
                            <div class="field">
                                <label>Max Pressure (bar)</label>
                                <input type="number" step="0.1" bind:value={entry.value.pressure_range_bar[1]} />
                            </div>
                            <div class="field">
                                <label>Occurs On</label>
                                <select bind:value={entry.value.occurs_on}>
                                    <option value="terrestrial">Terrestrial</option>
                                    <option value="gas giants">Gas Giants</option>
                                    <option value="both">Both</option>
                                </select>
                            </div>
                            <div class="composition-editor field full">
                                <label>Gas Mix (Fraction 0-1)</label>
                                <div class="mix-grid">
                                    {#each Object.entries(entry.value.composition) as [gas, amount]}
                                        <div class="mix-row">
                                            <select value={gas} on:change={(e) => updateGasInComp(idx, gas, e.currentTarget.value)}>
                                                {#each Object.keys(gases) as g}
                                                    <option value={g}>{g}</option>
                                                {/each}
                                            </select>
                                            
                                            {#if Array.isArray(entry.value.composition[gas])}
                                                <input type="number" step="0.01" min="0" max="1" bind:value={entry.value.composition[gas][0]} placeholder="Min" title="Min" />
                                                <span class="sep">-</span>
                                                <input type="number" step="0.01" min="0" max="1" bind:value={entry.value.composition[gas][1]} placeholder="Max" title="Max" />
                                                <button class="small-btn" title="Convert to Fixed" on:click={() => { entry.value.composition[gas] = (entry.value.composition[gas][0] + entry.value.composition[gas][1]) / 2; compositions = [...compositions]; }}>=</button>
                                            {:else}
                                                <input type="number" step="0.01" min="0" max="1" bind:value={entry.value.composition[gas]} placeholder="Val" />
                                                <button class="small-btn" title="Convert to Range" on:click={() => { entry.value.composition[gas] = [entry.value.composition[gas], entry.value.composition[gas]]; compositions = [...compositions]; }}>↔</button>
                                            {/if}

                                            <button class="small-del" on:click={() => { delete entry.value.composition[gas]; compositions = [...compositions]; }}>✕</button>
                                        </div>
                                    {/each}
                                    <button class="small-add" on:click={() => addGasToComp(idx)}>+ Add Gas</button>
                                </div>
                            </div>
                        </div>
                    </div>
                {/each}
                <button class="add-btn" on:click={addComposition}>+ Add Atmosphere Mix</button>
            </div>
        {/if}
    </div>

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
    top: 0; left: 0; width: 100%; height: 100%;
    background: rgba(0,0,0,0.7);
    display: flex; justify-content: center; align-items: center;
    z-index: 2000;
  }
  .modal {
    background: var(--bg-panel);
    width: 900px;
    height: 85%;
    border-radius: 8px;
    display: flex; flex-direction: column;
    border: 1px solid var(--border);
    box-shadow: 0 10px 30px rgba(0,0,0,0.5);
  }
  .header {
      padding: 15px;
      border-bottom: 1px solid var(--border-soft);
      background: var(--bg-panel);
  }
  h2 { margin: 0 0 10px 0; color: var(--text); font-size: 1.2em; }

  .tabs { display: flex; gap: 10px; }
  .tabs button {
      background: var(--bg-panel); border: none; color: var(--text-muted);
      padding: 8px 16px; cursor: pointer; border-radius: 4px;
  }
  .tabs button.active {
      background: var(--accent); color: white;
  }

  .content {
      flex: 1;
      overflow-y: auto;
      padding: 15px;
      background: var(--bg-panel);
  }

  .list-container {
      display: flex; flex-direction: column; gap: 10px;
  }

  .item-card {
      background: var(--bg-panel);
      border: 1px solid var(--border);
      border-radius: 4px;
      padding: 10px;
  }

  .item-header {
      display: flex; justify-content: space-between; align-items: center;
      margin-bottom: 10px; border-bottom: 1px solid var(--border-soft); padding-bottom: 5px;
  }
  .formula { font-weight: bold; color: var(--accent); font-family: monospace; font-size: 1.2em; }
  .name-input {
      background: transparent; border: none; color: var(--text); font-weight: bold; font-size: 1.1em;
      width: 100%;
  }

  .delete-btn {
      background: transparent; color: var(--text-faint); border: none; cursor: pointer; font-size: 1.2em;
  }
  .delete-btn:hover { color: var(--status-bad); }

  .item-body {
      display: flex; flex-wrap: wrap; gap: 10px;
  }
  .field {
      flex: 1; min-width: 180px; display: flex; flex-direction: column; gap: 2px;
  }
  .field.full { flex-basis: 100%; }
  
  label { font-size: 0.8em; color: var(--text-faint); }
  input, select {
      background: var(--bg-panel); border: 1px solid var(--border); color: var(--text); padding: 4px; border-radius: 3px;
  }
  input[type="color"] { padding: 0; width: 34px; height: 26px; }
  .colour-row { display: flex; align-items: center; gap: 6px; }
  .muted { font-size: 0.8em; color: var(--text-faint); font-style: italic; }
  .aurora-field { flex-basis: 100%; }
  .aurora-help { margin: 2px 0 6px; font-size: 0.75em; color: var(--text-faint); line-height: 1.35; }
  .aurora-help strong { color: var(--text-muted); }
  .aurora-head { display: flex; align-items: center; gap: 5px; margin-top: 2px; }
  .aurora-head span { font-size: 0.7em; color: var(--text-faint); text-transform: uppercase; letter-spacing: 0.03em; }
  .aurora-band { display: flex; align-items: center; gap: 5px; margin-top: 4px; }
  .aurora-band .band-name { width: 80px; }
  .aurora-band .band-num { width: 62px; }
  .aurora-band select { width: 72px; }
  .mini-add, .mini-del {
      background: var(--bg-panel); border: 1px solid var(--border); color: var(--text-muted);
      border-radius: 3px; cursor: pointer; font-size: 0.75em; padding: 2px 6px;
  }
  .mini-add { margin-top: 5px; }
  .mini-del:hover { color: var(--status-bad); }

  .mix-grid {
      display: grid; grid-template-columns: repeat(auto-fill, minmax(200px, 1fr)); gap: 5px; margin-top: 5px;
  }
  .mix-row { display: flex; gap: 5px; align-items: center; }
  .mix-row select { flex: 1; }
  .mix-row input { width: 60px; }
  
  .header-main {
      flex: 1; display: flex; flex-direction: column;
  }
  .header-summary {
      font-size: 0.75em; color: var(--text-faint); margin-top: 2px;
  }

  .small-del { background: none; border: none; color: var(--text-faint); cursor: pointer; }
  .small-add { background: var(--bg-panel); border: 1px dashed var(--border); color: var(--text-faint); padding: 4px; cursor: pointer; font-size: 0.8em; }
  .small-btn { background: var(--bg-panel); border: 1px solid var(--border); color: var(--text-muted); padding: 2px 6px; cursor: pointer; font-size: 0.8em; border-radius: 3px; }
  .small-btn:hover { color: var(--text); background: var(--bg-control); }
  .sep { color: var(--text-faint); font-size: 0.8em; }

  .add-btn {
      padding: 10px; background: var(--bg-panel); border: 1px dashed var(--border); color: var(--text-muted); cursor: pointer;
      width: 100%; text-align: center;
  }

  .footer {
      padding: 15px; border-top: 1px solid var(--border-soft); background: var(--bg-panel);
      display: flex; justify-content: flex-end; gap: 10px;
  }
  .footer button {
      padding: 8px 20px; border-radius: 4px; border: none; cursor: pointer;
  }
  .primary { background: var(--accent); color: white; }
</style>
