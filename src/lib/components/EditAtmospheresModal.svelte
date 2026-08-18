<script lang="ts">
  import { createEventDispatcher, onMount } from 'svelte';
  import type { Starmap, RulePack } from '$lib/types';
  import { allLiquids } from '$lib/physics/liquids';
  import { foreground } from '$lib/ui/foreground';
  import AbsorptionBandsEditor from './AbsorptionBandsEditor.svelte';
  import { blackbodySpectrum, gridShare, GRID_NM } from '$lib/physics/spectrum';
  import { bandAbsorbance } from '$lib/physics/surfaceSpectrum';

  export let showModal: boolean;
  export let rulePack: RulePack;
  export let starmap: Starmap;

  const dispatch = createEventDispatcher();

  let activeTab: 'gases' | 'reactions' | 'compositions' = 'gases';
  
  // Local state for editing
  let gases: Record<string, any> = {};
  let compositions: any[] = [];
  
  // Track original keys to know what is default vs custom
  let defaultGasKeys = new Set<string>();
  let defaultCompositions = new Set<string>();
  const greenhouseFactorHelp = 'Relative warming potency for this gas. Higher values add more greenhouse heating at the same partial pressure. This is a model coefficient, not direct Kelvin.';
  const shieldingFactorHelp = 'Radiation blocking strength per bar for this gas. Used in transmission = exp(-(factor x pressure_bar)). Higher values block more incoming radiation.';
  const rayleighHelp = 'Rayleigh scattering cross-section RELATIVE TO N2 — the visible-light analogue of shielding, which is the ionising one. Blank = 1, i.e. treat it like nitrogen. CO2 scatters about 2.4x as hard, H2 about 0.2x, which is why a thick CO2 sky is not simply a thicker blue one.';

  // A56 — THE BAND PREVIEW. Same idea as the pigment editor's preview star: the chart is drawn by
  // the ENGINE's own band maths from whatever is in the boxes right now, so moving a centre and
  // watching the notch move is the fastest way to understand what the numbers mean.
  //
  // ONE CHART AT A TIME, and that is not cosmetic: every gas card is expanded at once (there is no
  // accordion here, unlike the pigment list), so binding a chart to each would render 33 of them on
  // open. The rows are cheap; the plot is not.
  let previewTempK = 5778;
  let previewGas: string | null = null;
  $: previewLight = blackbodySpectrum(previewTempK, 1361 * gridShare(previewTempK));
  // Absorbed fraction at ONE EARTH-LIKE COLUMN of this gas, which is the unit the pack's strengths are
  // authored in (`surfaceSpectrum` multiplies by the real column ratio x mixing fraction). Same
  // transmittance law as the engine, exp(-tau), so the notch depth here is the notch depth there.
  $: previewAbsorbed = (() => {
    if (!previewGas) return null;
    const bands = gases[previewGas]?.absorptionBands;
    if (!bands?.length) return null;
    return GRID_NM.map((nm, i) => previewLight[i] * (1 - Math.exp(-bandAbsorbance(nm, bands))));
  })();

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

  // A56. `bind:bands` on a gas with no authored bands writes the editor's `[]` default back into the
  // record, and `[]` is not the same JSON as an ABSENT key — so without this every band-less gas
  // (17 of 33) compared unequal to the pack and was written out as an override the GM never made.
  // An empty list means "no bands", which is exactly what absent already meant: drop it before diffing.
  function withoutEmptyBands(val: any) {
    if (!val || !Array.isArray(val.absorptionBands) || val.absorptionBands.length) return val;
    const { absorptionBands, ...rest } = val;
    return rest;
  }

  function handleSave() {
    const overrides: any = {};
    
    // Determine Gas Overrides
    const gasOverrides: Record<string, any> = {};
    let hasGasOverrides = false;
    
    Object.entries(gases).forEach(([key, raw]) => {
        const val = withoutEmptyBands(raw);
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

  // --- Cloud formation (per gas) ---------------------------------------------------------------
  // A gas condenses into a LIQUID, and that liquid carries the deck's look (colour, opacity) — so
  // this side only says "does it condense, into what, and above what concentration".
  $: liquidNames = allLiquids(rulePack).map((l) => l.name).sort();
  function toggleGasCloud(gas: any, on: boolean) {
      if (on) gas.cloud = gas.cloud ?? { condensesTo: liquidNames[0] ?? 'water', minFraction: 0.001 };
      else delete gas.cloud;
      gases = { ...gases };
  }

  // --- Reactions -------------------------------------------------------------------------------
  // The DATA lives on the product gas (`reaction: { from: [A, B], yield }`); this tab is just a
  // view over it as a table, because a reaction reads as "A + B → C" rather than as C's config.
  // Every gas in the dropdowns must already exist — this tab creates reactions, never gases.
  $: gasNames = Object.keys(gases).sort();
  $: reactionRows = Object.entries(gases)
      .filter(([, g]: any) => g.reaction?.from?.length >= 2)
      .map(([product, g]: any) => ({ product, from: g.reaction.from as string[], yield: g.reaction.yield ?? 1 }))
      .sort((a, b) => a.product.localeCompare(b.product));
  $: canAddReaction = gasNames.some((g) => !gases[g].reaction) && gasNames.length >= 3;

  function addReaction() {
      const product = gasNames.find((g) => !gases[g].reaction);
      if (!product) return;
      const others = gasNames.filter((g) => g !== product);
      gases[product].reaction = { from: [others[0], others[1] ?? others[0]], yield: 1 };
      gases = { ...gases };
  }
  function removeReaction(product: string) {
      delete gases[product]?.reaction;
      gases = { ...gases };
  }
  function setReactant(product: string, idx: number, gas: string) {
      const from = [...(gases[product].reaction.from as string[])];
      from[idx] = gas;
      gases[product].reaction.from = from;
      gases = { ...gases };
  }
  function setYield(product: string, v: number) {
      gases[product].reaction.yield = Math.max(0, Math.min(1, Number.isFinite(v) ? v : 1));
      gases = { ...gases };
  }
  // Re-point a reaction at a different PRODUCT — the recipe moves to that gas, since that is where
  // the data lives. Refuses to overwrite a product that already has one.
  function moveReaction(oldProduct: string, newProduct: string) {
      if (oldProduct === newProduct) return;
      if (gases[newProduct]?.reaction) { alert(`${newProduct} already has a reaction. Remove it first.`); gases = { ...gases }; return; }
      gases[newProduct].reaction = gases[oldProduct].reaction;
      delete gases[oldProduct].reaction;
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

  // Swap a row's gas IN PLACE. Deleting the old key and re-adding moved the row to the END of the mix,
  // so changing the first gas made the row jump down the list under the cursor. Rebuilding the object in
  // order keeps every row where the user left it.
  function updateGasInComp(compIndex: number, oldGas: string, newGas: string) {
      const comp = compositions[compIndex].value;
      if (oldGas === newGas) return;
      const rebuilt: Record<string, any> = {};
      for (const [k, v] of Object.entries(comp.composition)) {
          if (k === oldGas) rebuilt[newGas] = v;          // same slot, new gas
          else if (k !== newGas) rebuilt[k] = v;          // drop a duplicate of the incoming gas
      }
      comp.composition = rebuilt;
      compositions = [...compositions];
  }

  // The gases not yet in this mix — what "+ Add Gas" can actually offer.
  function unusedGasesFor(index: number): string[] {
      const used = new Set(Object.keys(compositions[index]?.value?.composition ?? {}));
      return Object.keys(gases).filter((g) => !used.has(g));
  }

  // Add the first gas NOT already in the mix. This used to add Object.keys(gases)[0] unconditionally —
  // which, when that gas was already present (it usually is: N2/CO2 lead the list), silently overwrote
  // that row's fraction instead of adding a row. Delete a gas and you could never get one back.
  function addGasToComp(index: number) {
      const gas = unusedGasesFor(index)[0];
      if (!gas) return;
      compositions[index].value.composition[gas] = 0.1;
      compositions = [...compositions];
  }

  // Fractions should sum to 1. Ranges count by their midpoint. Surfaced so a mix that silently doesn't
  // add up is visible while editing rather than a mystery later.
  function mixTotal(comp: any): number {
      return Object.values(comp.composition ?? {}).reduce((sum: number, v: any) =>
          sum + (Array.isArray(v) ? ((v[0] ?? 0) + (v[1] ?? 0)) / 2 : (Number(v) || 0)), 0) as number;
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
<div class="modal-backdrop" on:click={() => dispatch('close')} use:foreground>
  <div class="modal" on:click|stopPropagation>
    <div class="header">
        <h2>Edit Atmospheres & Mixes</h2>
        <div class="tabs">
            <button class:active={activeTab === 'gases'} on:click={() => activeTab = 'gases'}>Gas Physics</button>
            <button class:active={activeTab === 'reactions'} on:click={() => activeTab = 'reactions'}>Reactions</button>
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
                            <!-- A56: two headings, so a GM can tell what the engine COMPUTES FROM from what it
                                 merely draws with. No fields were moved between meanings; cloud formation sits
                                 with derivation because it gates whether a deck forms at all. -->
                            <h4 class="group-head" title="The engine reads these to work out what the sky does to light, heat and radiation.">Derivation &mdash; what the physics reads</h4>
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
                                <label title={rayleighHelp}>Rayleigh (relative to N&#8322;)</label>
                                <input type="number" step="0.1" min="0" placeholder="1"
                                       value={gas.rayleigh ?? ''}
                                       on:input={(e) => { gas.rayleigh = e.currentTarget.value === '' ? undefined : +e.currentTarget.value; gases = { ...gases }; }} />
                            </div>
                            <div class="field bands-field">
                                <label title="Where this gas EATS the incoming spectrum, as Gaussian notches. This is what the surface-light chain actually reads.">Absorption Bands</label>
                                <p class="aurora-help">
                                    Where this gas <strong>eats</strong> the incoming spectrum. These feed the surface-light
                                    chain directly &mdash; the ground spectrum, what a plant has to live on, and what the sky
                                    looks like from below. Blank means the gas takes only its Rayleigh share, which is the
                                    honest answer for N&#8322;, O&#8322; and Ar.
                                </p>
                                <AbsorptionBandsEditor
                                    bind:bands={gas.absorptionBands}
                                    label="Bands (centre / width / strength)"
                                    emptyNote="No bands &mdash; this gas only scatters."
                                    newBand={{ centreNm: 760, widthNm: 20, strength: 0.5 }}
                                    previewLight={previewGas === key ? previewLight : null}
                                    absorbed={previewGas === key ? previewAbsorbed : null}
                                    absorbedLabel={`what ${key} takes`}
                                    onChange={() => (gases = { ...gases })} />
                                <div class="preview-row">
                                    <button class="mini-add" on:click={() => (previewGas = previewGas === key ? null : key)}>
                                        {previewGas === key ? 'Hide preview' : 'Preview against a star'}
                                    </button>
                                    {#if previewGas === key}
                                        <label class="inline-lbl" title="Preview star surface temperature. The Sun is 5778 K; an M dwarf about 3200 K; an A star about 9000 K.">star {previewTempK} K</label>
                                        <input type="range" min="2400" max="12000" step="100" bind:value={previewTempK} />
                                        <small class="muted">absorbed at one Earth-like column of this gas</small>
                                    {/if}
                                </div>
                            </div>
                            <div class="field aurora-field">
                                <label title="Whether this gas condenses into cloud, and what it condenses into.">Cloud Formation</label>
                                <p class="aurora-help">Tick this and the gas can form a <strong>cloud deck</strong> wherever the physics says it condenses. What the deck LOOKS like — its colour and how opaquely it veils the ground — comes from the liquid it condenses into, in the Liquids editor.</p>
                                <div class="colour-row">
                                    <input type="checkbox" checked={!!gas.cloud} on:change={(e) => toggleGasCloud(gas, e.currentTarget.checked)} />
                                    {#if gas.cloud}
                                        <label class="inline-lbl" title="The liquid this gas condenses into — it carries the deck's colour and opacity.">condenses to</label>
                                        <!-- Explicit value + on:change, NOT bind:value: a two-way binding on a
                                             select whose options are rebuilt each render re-syncs itself, writing
                                             the state it just read — an infinite effect loop that hung the whole
                                             settings modal. -->
                                        <select value={gas.cloud.condensesTo}
                                                on:change={(e) => { gas.cloud.condensesTo = e.currentTarget.value; gases = { ...gases }; }}>
                                            {#each liquidNames as ln}
                                                <option value={ln}>{ln}</option>
                                            {/each}
                                        </select>
                                        <label class="inline-lbl" title="Below this fraction of the atmosphere the deck is too thin to see. A visibility floor, not a bulk-abundance one — Jupiter's real ammonia is 0.026%.">min fraction</label>
                                        <input type="number" class="band-num" step="0.0001" min="0" max="1"
                                               value={gas.cloud.minFraction ?? 0.001}
                                               on:input={(e) => { gas.cloud.minFraction = +e.currentTarget.value; gases = { ...gases }; }} />
                                    {:else}
                                        <span class="muted">does not form cloud</span>
                                    {/if}
                                </div>
                            </div>
                            <h4 class="group-head" title="These decide how the gas is DRAWN. Nothing here feeds the physics — the surface-light chain deliberately never reads a gas colour.">Presentation &mdash; how it is drawn</h4>
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
        {:else if activeTab === 'reactions'}
            <div class="list-container">
                <p class="tab-help">
                    Gases that combine to make another gas. The product is an ordinary gas — define it on
                    the <strong>Gas Physics</strong> tab first (with its colour, and its cloud formation if it
                    should form a deck), then create the reaction here. There is no chemistry database:
                    only the reactions you care about exist, so <em>Krypton + Unobtanium = pink bubblegum</em>
                    is a perfectly good rule.
                </p>
                {#each reactionRows as r (r.product)}
                    <div class="item-card">
                        <div class="item-header">
                            <div class="header-main">
                                <span class="header-summary">{r.from[0] ?? '?'} + {r.from[1] ?? '?'} → {r.product}</span>
                            </div>
                            <button class="delete-btn" title="Remove this reaction" on:click={() => removeReaction(r.product)}>✕</button>
                        </div>
                        <div class="item-body">
                            <div class="field">
                                <label>Gas A</label>
                                <select value={r.from[0]} on:change={(e) => setReactant(r.product, 0, e.currentTarget.value)}>
                                    {#each gasNames as g}<option value={g}>{g}</option>{/each}
                                </select>
                            </div>
                            <div class="field">
                                <label>Gas B</label>
                                <select value={r.from[1]} on:change={(e) => setReactant(r.product, 1, e.currentTarget.value)}>
                                    {#each gasNames as g}<option value={g}>{g}</option>{/each}
                                </select>
                            </div>
                            <div class="field">
                                <label title="Which gas the pair produces. Must already exist on the Gas Physics tab.">Produces</label>
                                <select value={r.product} on:change={(e) => moveReaction(r.product, e.currentTarget.value)}>
                                    {#each gasNames as g}<option value={g}>{g}</option>{/each}
                                </select>
                            </div>
                            <div class="field full">
                                <div class="label-row">
                                    <label title="How much of the scarcer ingredient converts. 1 = all of it (bulk chemistry, like ammonium hydrosulphide); a tiny value models a photochemical trace, like Titan's hydrogen cyanide.">Yield</label>
                                    <input type="number" class="band-num" step="0.001" min="0" max="1"
                                           value={r.yield} on:input={(e) => setYield(r.product, +e.currentTarget.value)} />
                                </div>
                                <input type="range" min="0" max="1" step="0.001" class="full-width-slider"
                                       value={r.yield} on:input={(e) => setYield(r.product, +e.currentTarget.value)} />
                                <div class="info-row">
                                    Converts {(r.yield * 100).toFixed(1)}% of whichever ingredient runs out first; that
                                    much of each is used up.
                                </div>
                            </div>
                        </div>
                    </div>
                {/each}
                {#if !reactionRows.length}
                    <p class="tab-help muted">No reactions defined.</p>
                {/if}
                <button class="add-btn" disabled={!canAddReaction} on:click={addReaction}
                        title={canAddReaction ? 'Create a reaction' : 'Every gas already has a reaction — add a new gas on the Gas Physics tab first'}>
                    + Add Reaction
                </button>
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
                                <div class="mix-head">
                                    <label>Gas Mix (fraction of 1)</label>
                                    {#key compositions}
                                        {@const total = mixTotal(entry.value)}
                                        <span class="mix-total" class:off={Math.abs(total - 1) > 0.005}
                                              title="Fractions should add up to 1. Ranges are counted by their midpoint.">
                                            total {total.toFixed(2)}{#if Math.abs(total - 1) > 0.005}{' '}— should be 1.00{/if}
                                        </span>
                                    {/key}
                                </div>
                                <div class="mix-grid">
                                    {#each Object.entries(entry.value.composition) as [gas, amount]}
                                        <div class="mix-row" class:range={Array.isArray(amount)}>
                                            <select class="mix-gas" value={gas} on:change={(e) => updateGasInComp(idx, gas, e.currentTarget.value)}>
                                                {#each Object.keys(gases) as g}
                                                    <option value={g}>{g}</option>
                                                {/each}
                                            </select>

                                            {#if Array.isArray(entry.value.composition[gas])}
                                                <input class="mix-num" type="number" step="0.01" min="0" max="1" bind:value={entry.value.composition[gas][0]} placeholder="Min" title="Minimum fraction" />
                                                <span class="sep">–</span>
                                                <input class="mix-num" type="number" step="0.01" min="0" max="1" bind:value={entry.value.composition[gas][1]} placeholder="Max" title="Maximum fraction" />
                                                <button class="small-btn" title="Use a single fixed fraction instead of a range" on:click={() => { entry.value.composition[gas] = (entry.value.composition[gas][0] + entry.value.composition[gas][1]) / 2; compositions = [...compositions]; }}>=</button>
                                            {:else}
                                                <input class="mix-num wide" type="number" step="0.01" min="0" max="1" bind:value={entry.value.composition[gas]} placeholder="Val" title="Fraction of the atmosphere" />
                                                <button class="small-btn" title="Vary this gas over a range instead of a fixed fraction" on:click={() => { entry.value.composition[gas] = [entry.value.composition[gas], entry.value.composition[gas]]; compositions = [...compositions]; }}>↔</button>
                                            {/if}

                                            <button class="small-del" title="Remove {gas} from this mix" on:click={() => { delete entry.value.composition[gas]; compositions = [...compositions]; }}>✕</button>
                                        </div>
                                    {/each}
                                </div>
                                {#key compositions}
                                    {@const spare = unusedGasesFor(idx)}
                                    <button class="small-add" disabled={spare.length === 0} on:click={() => addGasToComp(idx)}
                                            title={spare.length ? `Add ${spare[0]} to this mix` : 'Every defined gas is already in this mix'}>
                                        + Add Gas{#if spare.length} ({spare[0]}){/if}
                                    </button>
                                {/key}
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
    width: min(900px, 96vw);   /* fixed 900px overflowed the viewport on a laptop/tablet */
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
  /* A56 group headings + band preview row. */
  .group-head {
    grid-column: 1 / -1; margin: 10px 0 2px; font-size: 0.72em; font-weight: 600;
    text-transform: uppercase; letter-spacing: 0.06em;
    color: var(--text-faint, #8a8f9a);
    border-bottom: 1px solid var(--border-soft, #1c1f27); padding-bottom: 4px;
  }
  .group-head:first-child { margin-top: 0; }
  .bands-field { grid-column: 1 / -1; }
  .preview-row { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; margin-top: 6px; }
  .preview-row input[type='range'] { flex: 1 1 140px; max-width: 220px; }
  .preview-row .muted { font-size: 0.72em; }
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

  /* A mix row must never be wider than its column, or the later gases sit off the edge of the modal —
     which is what hid the third compound entirely. The column min is sized for the WIDEST row (a range:
     gas + min + max + two buttons), and every control inside may shrink (min-width: 0 defeats the
     default min-content floor on selects and number inputs). */
  .mix-grid {
      display: grid; grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
      gap: 6px; margin-top: 5px; min-width: 0;
  }
  .mix-row {
      display: flex; gap: 4px; align-items: center; min-width: 0;
      background: var(--bg-control); border: 1px solid var(--border); border-radius: 4px; padding: 4px 6px;
  }
  .mix-row .mix-gas { flex: 1 1 auto; min-width: 0; }
  .mix-row .mix-num { flex: 0 0 62px; width: 62px; min-width: 0; }
  .mix-row .mix-num.wide { flex-basis: 78px; width: 78px; }
  .mix-head { display: flex; justify-content: space-between; align-items: baseline; gap: 8px; }
  .mix-total { font-size: 0.78em; color: var(--text-faint); }
  .mix-total.off { color: var(--accent, #ff5a1f); }
  .small-add[disabled] { opacity: 0.45; cursor: not-allowed; }
  .add-btn[disabled] { opacity: 0.45; cursor: not-allowed; }
  .tab-help { color: var(--text-faint); font-size: 0.8em; line-height: 1.5; margin: 0 0 10px; }
  .inline-lbl { color: var(--text-muted); font-size: 0.85em; margin-left: 6px; }
  
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
