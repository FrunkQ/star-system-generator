<script lang="ts">
  import type { CelestialBody, Barycenter, System } from "$lib/types";

  export let system: System | null;
  export let generationOptions: string[];
  export let selectedGenerationOption: string;
  export let handleGenerate: (empty: boolean) => void;

  let gasGiants = 0;
  let terrestrials = 0;
  let humanHabitable = 0;
  let earthLike = 0;
  let biospheres = 0;
  let totalPlanets = 0;
  let totalMoons = 0;

    $: {

      gasGiants = 0;

      terrestrials = 0;

      humanHabitable = 0;

      earthLike = 0;

      biospheres = 0;

      totalPlanets = 0;

      totalMoons = 0;

  

      if (system) {

          for (const node of system.nodes) {

              if (node.kind !== 'body') continue;

  

              if (node.roleHint === 'planet') {

                  totalPlanets++;

              } else if (node.roleHint === 'moon') {

                  totalMoons++;

              }

  

              if (node.roleHint === 'planet' || node.roleHint === 'moon') {

                  const isGasGiant = node.classes?.some(c => c.includes('gas-giant'));

  

                  if (isGasGiant) {

                      gasGiants++;

                  } else {

                      terrestrials++;

                  }

  

                  if (node.tags?.some(t => t.key === 'habitability/human')) {

                      humanHabitable++;

                  }

                  if (node.tags?.some(t => t.key === 'habitability/earth-like')) {

                      earthLike++;

                  }

                  if (node.biosphere) {

                      biospheres++;

                  }

              }

          }

      }

    }

</script>

<div class="summary-panel">
    <h3>System Summary</h3>
    <div class="summary-grid">
        <div class="summary-item">
            <span class="value">{totalPlanets}</span>
            <span class="label">Planets</span>
        </div>
        <div class="summary-item">
            <span class="value">{totalMoons}</span>
            <span class="label">Moons</span>
        </div>
        <div class="summary-item">
            <span class="value">{terrestrials}</span>
            <span class="label">Terrestrial Bodies</span>
        </div>
        <div class="summary-item">
            <span class="value">{gasGiants}</span>
            <span class="label">Gas Giants</span>
        </div>
        <div class="summary-item">
            <span class="value">{humanHabitable}</span>
            <span class="label">Human-Habitable</span>
        </div>
        <div class="summary-item">
            <span class="value">{earthLike}</span>
            <span class="label">Earth-like</span>
        </div>
        <div class="summary-item">
            <span class="value">{biospheres}</span>
            <span class="label">Biospheres</span>
        </div>
    </div>
    <div class="regeneration-controls">
        <span>Regenerate Solar System: Select Star Type:</span>
        <select bind:value={selectedGenerationOption}>
            {#each generationOptions as option (option)}
                <option value={option}>{option}</option>
            {/each}
        </select>
        <span>then:</span>
        <button on:click={() => handleGenerate(false)}>
          Generate System
        </button>
        <button on:click={() => handleGenerate(true)}>
          Generate Empty System
        </button>
    </div>
</div>

<style>
    .summary-panel {
        border: 1px solid #444;
        background-color: #1a1a1a;
        padding: 0.5em;
        margin: 0.5em 0;
        border-radius: 5px;
    }
    h3 {
        margin: 0 0 0.5em 0;
        color: #ff3e00;
    }
    .summary-grid {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(100px, 1fr));
        gap: 0.5em;
    }
    .summary-item {
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        background-color: #252525;
        padding: 0.5em;
        border-radius: 4px;
    }
    .value {
        font-size: 1.5em;
        font-weight: bold;
        color: #eee;
    }
    .label {
        font-size: 0.8em;
        color: #999;
        text-transform: uppercase;
    }
    .regeneration-controls {
        display: flex;
        align-items: center;
        gap: 0.5em;
        margin-top: 0.5em;
        padding-top: 0.5em;
        border-top: 1px solid #333;
    }
    .regeneration-controls span {
        color: #eee;
    }
    .regeneration-controls select, .regeneration-controls button {
        padding: 0.25em 0.5em;
        border-radius: 4px;
        border: 1px solid #666;
        background-color: #555;
        color: #eee;
        cursor: pointer;
    }
    .regeneration-controls button:hover {
        background-color: #666;
    }
</style>