<script lang="ts">
  import { createEventDispatcher, onMount } from 'svelte';
  import type { Starmap, RulePack, LiquidDef, LiquidFamily } from '$lib/types';
  import { LIQUIDS } from '$lib/constants';
  import { applyListDelta, makeListDelta } from '$lib/rulepackDelta';
  import { foreground } from '$lib/ui/foreground';

  export let showModal: boolean;
  export let rulePack: RulePack;
  export let starmap: Starmap;

  const dispatch = createEventDispatcher();

  const FAMILIES: LiquidFamily[] = ['water', 'hydrocarbon', 'cryo', 'acid', 'molten', 'exotic', 'internal'];
  const familyHelp = "Groups a solvent. 'internal' = a derived cloud/interior fluid, NEVER a surface ocean (excluded from the ocean picker and from procedural generation). Any other family CAN appear as an ocean where it is liquid.";
  // Field help lives in `packs/fieldHelp.ts` - one table, four editors (G86).
  import FieldHelp from './FieldHelp.svelte';
  import { LIQUID_FIELD_HELP } from '$lib/packs/fieldHelp';
  const biosolventHelp = 'Suitability as a solvent for life: ideal (water), alternative (ammonia, hydrocarbons…), or none.';

  // The base default = the pack's liquids if it ships any, else the built-in engine list.
  const packList: LiquidDef[] = (rulePack.liquids && rulePack.liquids.length ? rulePack.liquids : LIQUIDS) as LiquidDef[];

  /**
   * THE EDITOR'S OWN DEFAULTS, APPLIED TO BOTH SIDES OF THE COMPARISON.
   *
   * A `bind:checked` on an ABSENT boolean writes `false` into the record the moment the dialog
   * renders, and `bind:value` on an absent select writes its first option. So every row comes back
   * from the form carrying fields the pack never declared - and the saved delta then said the GM had
   * changed `incandescent` on nineteen of the twenty-two shipped liquids, when all they had done was
   * open the dialog and press Save. An override that says nothing is worse than no override: it
   * reads as if it said something, and it is what `rulepackDelta` exists to avoid storing.
   *
   * The fix is to compare like with like rather than to special-case the fields, because the list of
   * fields a binding materialises grows every time somebody adds a control.
   */
  const withEditorDefaults = (l: LiquidDef): LiquidDef => ({
    conductive: false,
    incandescent: false,
    biosolvent: 'ideal',
    family: FAMILIES[0],
    ...JSON.parse(JSON.stringify(l))
  }) as LiquidDef;

  const baseList: LiquidDef[] = packList.map(withEditorDefaults);
  const baseByName: Record<string, LiquidDef> = {};
  const defaultNames = new Set<string>();

  let liquids: any[] = [];

  onMount(() => {
    baseList.forEach((l) => { baseByName[l.name] = l; defaultNames.add(l.name); });
    // Open on the EFFECTIVE list - the pack's, with this campaign's override laid over it, through
    // the SAME function `effectiveRulePack` uses, so the editor and the engine cannot disagree
    // about what this campaign's liquids are.
    //
    // IT USED TO TEST `.length` AND THAT WAS A DATA-LOSING BUG, live since D25 made this section
    // delta-capable: a delta is an OBJECT and has no `.length`, so the test read `undefined`, the
    // editor fell back to the shipped list, and the next Save wrote that list over the GM's delta.
    // A starmap that shipped with a custom liquid lost it the first time anybody opened this dialog.
    liquids = JSON.parse(JSON.stringify(
      applyListDelta(baseList, starmap.rulePackOverrides?.liquids, (l) => l.name)));
  });

  function handleSave() {
    // Save the DIFFERENCE, not the list - the same discipline the biosphere editors already follow,
    // and the reason `rulepackDelta` exists: a whole-list override freezes the shipped defaults at
    // the moment of the edit, so every later improvement to the pack silently stops reaching this
    // campaign. `undefined` means "no override at all", which is what a GM who changed nothing back
    // should end up storing.
    const overrides: any = { liquids: makeListDelta(baseList, liquids.map(withEditorDefaults), (l) => l.name) };
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
<div class="modal-backdrop" on:click={() => dispatch('close')} use:foreground>
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
                            <label>Melting Point (K)<FieldHelp help={LIQUID_FIELD_HELP.meltK} /></label>
                            <input type="number" bind:value={liq.meltK} />
                        </div>
                        <div class="field">
                            <label>Boiling Point (K, 1 bar)<FieldHelp help={LIQUID_FIELD_HELP.boilK} /></label>
                            <input type="number" bind:value={liq.boilK} />
                        </div>
                        <div class="field">
                            <label title="Below this pressure the substance sublimates — no liquid phase (optional).">Triple Pressure (bar)<FieldHelp help={LIQUID_FIELD_HELP.tripleBar} /></label>
                            <input type="number" step="0.001" bind:value={liq.tripleBar} />
                        </div>
                        <div class="field">
                            <label title="Above this temperature it is supercritical at any pressure (optional).">Critical Temp (K)<FieldHelp help={LIQUID_FIELD_HELP.criticalK} /></label>
                            <input type="number" bind:value={liq.criticalK} />
                        </div>
                        <div class="field">
                            <label title="Pressure at the critical point (optional).">Critical Pressure (bar)<FieldHelp help={LIQUID_FIELD_HELP.criticalBar} /></label>
                            <input type="number" bind:value={liq.criticalBar} />
                        </div>
                        <div class="field">
                            <label>Density (g/cc)<FieldHelp help={LIQUID_FIELD_HELP.density_gcc} /></label>
                            <input type="number" step="0.01" bind:value={liq.density_gcc} />
                        </div>
                        <div class="field">
                            <label title="Refractive index — sets the specular starlight share of the apparent colour.">Refractive Index<FieldHelp help={LIQUID_FIELD_HELP.refractiveIndex} /></label>
                            <input type="number" step="0.001" bind:value={liq.refractiveIndex} />
                        </div>
                        <div class="field">
                            <label>Colour<FieldHelp help={LIQUID_FIELD_HELP.colorHex} /></label>
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
                            <label title="How opaquely a CLOUD DECK of this substance veils the ground beneath it. Water clouds are patchy and let the surface through; a sulphuric-acid deck hides Venus completely. The deck's colour comes from the Colour above, paled — clouds are scattering droplets, so they read far lighter than the bulk liquid.">Cloud Opacity<FieldHelp help={LIQUID_FIELD_HELP.cloudOpacity} /></label>
                            <input type="number" step="0.05" min="0" max="1"
                                   value={liq.cloudOpacity ?? 0.5}
                                   on:input={(e) => { liq.cloudOpacity = Math.max(0, Math.min(1, +e.currentTarget.value)); liquids = [...liquids]; }} />
                        </div>
                        <div class="field">
                            <label title="How much starlight a CLOUD DECK of this substance sends back out — its reflectivity, which is not the same thing as its opacity. This is what makes a cloudy world COLD: it feeds the body's Bond albedo and through that its equilibrium temperature. Venus's sulphuric acid returns three quarters of the light that reaches it; a methane haze returns barely a quarter.">Cloud Albedo<FieldHelp help={LIQUID_FIELD_HELP.cloudAlbedo} /></label>
                            <input type="number" step="0.05" min="0" max="1"
                                   value={liq.cloudAlbedo ?? 0.45}
                                   on:input={(e) => { liq.cloudAlbedo = Math.max(0, Math.min(1, +e.currentTarget.value)); liquids = [...liquids]; }} />
                        </div>
                        <div class="field">
                            <label title="How far from WHITE a cloud deck of this substance stays, in 0-255 colour terms. Droplets that only scatter light go white however dark the bulk liquid is -- that is water, and 60 is its number. A suspension whose particles absorb keeps its colour however finely divided it is: Jupiter's belts are genuinely brown and a martian dust storm genuinely ochre. Raise it for a pigmented condensate; leave it for a clean one.">Cloud Tint Distance<FieldHelp help={LIQUID_FIELD_HELP.cloudTintDistance} /></label>
                            <input type="number" step="10" min="0" max="255"
                                   value={liq.cloudTintDistance ?? 60}
                                   on:input={(e) => { liq.cloudTintDistance = Math.max(0, Math.min(255, +e.currentTarget.value)); liquids = [...liquids]; }} />
                        </div>
                        <div class="field">
                            <label title={biosolventHelp}>Biosolvent<FieldHelp help={LIQUID_FIELD_HELP.biosolvent} /></label>
                            <select bind:value={liq.biosolvent}>
                                <option value="ideal">ideal</option>
                                <option value="alternative">alternative</option>
                                <option value="none">none</option>
                            </select>
                        </div>
                        <div class="field">
                            <label>Electrically Conductive<FieldHelp help={LIQUID_FIELD_HELP.conductive} /></label>
                            <div class="colour-row">
                                <input type="checkbox" bind:checked={liq.conductive} />
                                <span class="muted">drives a dynamo</span>
                            </div>
                        </div>
                        <div class="field">
                            <label title="Self-luminous when molten (magma, molten metals). Adds a temperature-scaled thermal glow so the ocean lights up on its own — brighter and whiter the hotter it is — even under a dim star.">Incandescent<FieldHelp help={LIQUID_FIELD_HELP.incandescent} /></label>
                            <div class="colour-row">
                                <input type="checkbox" bind:checked={liq.incandescent} />
                                <span class="muted">self-glowing molten</span>
                            </div>
                        </div>
                        <div class="field">
                            <label title={familyHelp}>Family<FieldHelp help={LIQUID_FIELD_HELP.family} /></label>
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
