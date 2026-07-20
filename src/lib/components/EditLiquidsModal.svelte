<script lang="ts">
  import { createEventDispatcher, onMount } from 'svelte';
  import type { Starmap, RulePack, LiquidDef, LiquidFamily } from '$lib/types';
  import { LIQUIDS } from '$lib/constants';

  export let showModal: boolean;
  export let rulePack: RulePack;
  export let starmap: Starmap;

  const dispatch = createEventDispatcher();

  const FAMILIES: LiquidFamily[] = ['water', 'hydrocarbon', 'cryo', 'acid', 'molten', 'exotic', 'internal'];
  const familyHelp = "Groups a solvent. 'internal' = a derived cloud/interior fluid, NEVER a surface ocean (excluded from the ocean picker and from procedural generation). Any other family CAN appear as an ocean where it is liquid.";
  const biosolventHelp = 'Suitability as a solvent for life: ideal (water), alternative (ammonia, hydrocarbons…), or none.';

  // The base default = the pack's liquids if it ships any, else the built-in engine list.
  const baseList: LiquidDef[] = (rulePack.liquids && rulePack.liquids.length ? rulePack.liquids : LIQUIDS) as LiquidDef[];
  const baseByName: Record<string, LiquidDef> = {};
  const defaultNames = new Set<string>();

  let liquids: any[] = [];

  onMount(() => {
    baseList.forEach((l) => { baseByName[l.name] = l; defaultNames.add(l.name); });
    // Start from a clone of the base, then apply any saved starmap override wholesale.
    const source = starmap.rulePackOverrides?.liquids && starmap.rulePackOverrides.liquids.length
      ? starmap.rulePackOverrides.liquids
      : baseList;
    liquids = JSON.parse(JSON.stringify(source));
  });

  function handleSave() {
    const overrides: any = {};
    // Whole-list replace (like atmosphere mixes): only record an override if it differs from the base.
    if (JSON.stringify(baseList) !== JSON.stringify(liquids)) {
      overrides.liquids = liquids;
    }
    dispatch('save', overrides);
    dispatch('close');
  }

  function addLiquid() {
    const name = prompt('Enter a unique id for the new liquid (e.g. liquid-neon):');
    if (!name) return;
    if (liquids.some((l) => l.name === name)) { alert('A liquid with that id already exists.'); return; }
    liquids = [...liquids, {
      name, label: name, meltK: 100, boilK: 200,
      colorHex: '#4f8fb0', density_gcc: 1.0, conductive: false,
      biosolvent: 'none', family: 'exotic', refractiveIndex: 1.3
    }];
  }

  function resetLiquid(i: number) {
    const name = liquids[i]?.name;
    if (name && baseByName[name]) {
      liquids[i] = JSON.parse(JSON.stringify(baseByName[name]));
      liquids = [...liquids];
    }
  }
  function deleteLiquid(i: number) {
    liquids = liquids.filter((_, j) => j !== i);
  }
  function toggleColour(liq: any, on: boolean) {
    liq.colorHex = on ? (liq.colorHex ?? '#4f8fb0') : null;
    liquids = [...liquids];
  }
</script>

{#if showModal}
<div class="modal-backdrop" on:click={() => dispatch('close')}>
  <div class="modal" on:click|stopPropagation>
    <div class="header">
        <h2>Edit Liquids</h2>
        <p class="sub">Solvents the sim can place as oceans (and the fluids it condenses into clouds / interior layers). Edits are saved as overrides on this starmap.</p>
    </div>

    <div class="content">
        <div class="list-container">
            {#each liquids as liq, i}
                <div class="item-card">
                    <div class="item-header">
                        <span class="formula">{liq.name}</span>
                        <input class="name-input" bind:value={liq.label} placeholder="Display label" />
                        {#if defaultNames.has(liq.name)}
                            <button class="delete-btn" on:click={() => resetLiquid(i)} title="Revert to Default">↺</button>
                        {:else}
                            <button class="delete-btn" on:click={() => deleteLiquid(i)} title="Delete Custom Liquid">✕</button>
                        {/if}
                    </div>
                    <div class="item-body">
                        <div class="field">
                            <label>Melting Point (K)</label>
                            <input type="number" bind:value={liq.meltK} />
                        </div>
                        <div class="field">
                            <label>Boiling Point (K, 1 bar)</label>
                            <input type="number" bind:value={liq.boilK} />
                        </div>
                        <div class="field">
                            <label title="Below this pressure the substance sublimates — no liquid phase (optional).">Triple Pressure (bar)</label>
                            <input type="number" step="0.001" bind:value={liq.tripleBar} />
                        </div>
                        <div class="field">
                            <label title="Above this temperature it is supercritical at any pressure (optional).">Critical Temp (K)</label>
                            <input type="number" bind:value={liq.criticalK} />
                        </div>
                        <div class="field">
                            <label title="Pressure at the critical point (optional).">Critical Pressure (bar)</label>
                            <input type="number" bind:value={liq.criticalBar} />
                        </div>
                        <div class="field">
                            <label>Density (g/cc)</label>
                            <input type="number" step="0.01" bind:value={liq.density_gcc} />
                        </div>
                        <div class="field">
                            <label title="Refractive index — sets the specular starlight share of the apparent colour.">Refractive Index</label>
                            <input type="number" step="0.001" bind:value={liq.refractiveIndex} />
                        </div>
                        <div class="field">
                            <label>Colour</label>
                            <div class="colour-row">
                                <input type="checkbox" checked={liq.colorHex !== null && liq.colorHex !== undefined} on:change={(e) => toggleColour(liq, e.currentTarget.checked)} />
                                {#if liq.colorHex !== null && liq.colorHex !== undefined}
                                    <input type="color" bind:value={liq.colorHex} />
                                {:else}
                                    <span class="muted">colourless</span>
                                {/if}
                            </div>
                        </div>
                        <div class="field">
                            <label title={biosolventHelp}>Biosolvent</label>
                            <select bind:value={liq.biosolvent}>
                                <option value="ideal">ideal</option>
                                <option value="alternative">alternative</option>
                                <option value="none">none</option>
                            </select>
                        </div>
                        <div class="field">
                            <label>Electrically Conductive</label>
                            <div class="colour-row">
                                <input type="checkbox" bind:checked={liq.conductive} />
                                <span class="muted">drives a dynamo</span>
                            </div>
                        </div>
                        <div class="field">
                            <label title={familyHelp}>Family</label>
                            <select bind:value={liq.family}>
                                {#each FAMILIES as f}
                                    <option value={f}>{f}</option>
                                {/each}
                            </select>
                        </div>
                    </div>
                    {#if liq.family === 'internal'}
                        <div class="note">Derived-only: this fluid is used for clouds / interior layers and will NOT be offered as a surface ocean. Change the family to make it a pickable/generatable ocean solvent.</div>
                    {/if}
                </div>
            {/each}
            <button class="add-btn" on:click={addLiquid}>+ Add Custom Liquid</button>
        </div>
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
    position: fixed; top: 0; left: 0; width: 100%; height: 100%;
    background: rgba(0,0,0,0.7);
    display: flex; justify-content: center; align-items: center;
    z-index: 2000;
  }
  .modal {
    background: var(--bg-panel);
    width: 900px; height: 85%;
    border-radius: 8px;
    display: flex; flex-direction: column;
    border: 1px solid var(--border);
    box-shadow: 0 10px 30px rgba(0,0,0,0.5);
  }
  .header { padding: 15px; border-bottom: 1px solid var(--border-soft); background: var(--bg-panel); }
  h2 { margin: 0 0 4px 0; color: var(--text); font-size: 1.2em; }
  .sub { margin: 0; font-size: 0.8em; color: var(--text-faint); }

  .content { flex: 1; overflow-y: auto; padding: 15px; background: var(--bg-panel); }
  .list-container { display: flex; flex-direction: column; gap: 10px; }

  .item-card { background: var(--bg-panel); border: 1px solid var(--border); border-radius: 4px; padding: 10px; }
  .item-header {
      display: flex; justify-content: space-between; align-items: center; gap: 10px;
      margin-bottom: 10px; border-bottom: 1px solid var(--border-soft); padding-bottom: 5px;
  }
  .formula { font-weight: bold; color: var(--accent); font-family: monospace; font-size: 1.1em; white-space: nowrap; }
  .name-input { flex: 1; background: transparent; border: none; color: var(--text); font-weight: bold; font-size: 1.05em; }
  .delete-btn { background: transparent; color: var(--text-faint); border: none; cursor: pointer; font-size: 1.2em; }
  .delete-btn:hover { color: var(--status-bad); }

  .item-body { display: flex; flex-wrap: wrap; gap: 10px; }
  .field { flex: 1; min-width: 150px; display: flex; flex-direction: column; gap: 2px; }
  label { font-size: 0.8em; color: var(--text-faint); }
  input, select { background: var(--bg-panel); border: 1px solid var(--border); color: var(--text); padding: 4px; border-radius: 3px; }
  input[type="color"] { padding: 0; width: 34px; height: 26px; }
  .colour-row { display: flex; align-items: center; gap: 6px; }
  .muted { font-size: 0.8em; color: var(--text-faint); font-style: italic; }
  .note { margin-top: 8px; font-size: 0.75em; color: var(--text-faint); background: var(--bg-control); padding: 5px 8px; border-radius: 3px; }

  .add-btn { padding: 10px; background: var(--bg-panel); border: 1px dashed var(--border); color: var(--text-muted); cursor: pointer; width: 100%; text-align: center; }
  .footer { padding: 15px; border-top: 1px solid var(--border-soft); background: var(--bg-panel); display: flex; justify-content: flex-end; gap: 10px; }
  .footer button { padding: 8px 20px; border-radius: 4px; border: none; cursor: pointer; }
  .primary { background: var(--accent); color: white; }
</style>
