<script lang="ts">
  import type { CelestialBody, Barycenter, System } from "$lib/types";
  import { createEventDispatcher } from "svelte";

  export let system: System | null;
  export let focusedBody: CelestialBody | Barycenter | null;
  export let showDropdown: boolean;
  export let handleDownloadJson: () => void;
  export let handleUploadJson: (event: Event) => void;
  export let handleShare: () => void;

  const dispatch = createEventDispatcher();

  let gasGiants = 0;
  let iceGiants = 0;
  let terrestrials = 0;
  let humanHabitable = 0;
  let earthLike = 0;
  let biospheres = 0;
  let totalPlanets = 0;
  let totalMoons = 0;
  let belts = 0;
  let starCount = 0;
  const constructCount = 0; // Placeholder

  function getPlanetColor(node: CelestialBody): string {
    if (node.roleHint === 'star') return '#fff'; // White
    if (node.biosphere) return '#00ff00'; // Green
    if (node.tags?.some(t => t.key === 'habitability/earth-like' || t.key === 'habitability/human')) return '#007bff'; // Blue
    const isIceGiant = node.classes?.some(c => c.includes('ice-giant'));
    if (isIceGiant) return '#add8e6'; // Light Blue
    const isGasGiant = node.classes?.some(c => c.includes('gas-giant'));
    if (isGasGiant) return '#cc0000'; // Darker Red for Gas Giants
    return '#cc6600'; // Darker Orange/Brown for Terrestrial Bodies
  }

  $: {
    gasGiants = 0;
    iceGiants = 0;
    terrestrials = 0;
    humanHabitable = 0;
    earthLike = 0;
    biospheres = 0;
    totalPlanets = 0;
    totalMoons = 0;
    belts = 0;
    starCount = 0;

    if (system) {
        for (const node of system.nodes) {
            if (node.kind !== 'body') continue;

            if (node.roleHint === 'planet') {
                totalPlanets++;
            } else if (node.roleHint === 'moon') {
                totalMoons++;
            } else if (node.roleHint === 'belt') {
                belts++;
            } else if (node.roleHint === 'star') {
                starCount++;
            }

            if (node.roleHint === 'planet' || node.roleHint === 'moon') {
                const isGasGiant = node.classes?.some(c => c.includes('gas-giant'));
                const isIceGiant = node.classes?.some(c => c.includes('ice-giant'));

                if (isIceGiant) {
                    iceGiants++;
                } else if (isGasGiant) {
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
    <div class="header">
      <h3 class="focus-title">Star System View - Current Focus: {focusedBody?.name || 'System View'}</h3>
      <div class="save-load-controls">
          <div class="dropdown">
              <button on:click={() => showDropdown = !showDropdown} class="hamburger-button">&#9776;</button>
              {#if showDropdown}
                  <div class="dropdown-content">
                      <button on:click={handleDownloadJson} disabled={!system}>Download System</button>
                      <button on:click={() => document.getElementById('upload-json-summary')?.click()}>Upload System</button>
                      <button on:click={handleShare} class="todo-button">Share Player Link (Todo)</button>
                      <button on:click={() => alert('This is a star system generator.')}>About</button>
                  </div>
              {/if}
          </div>
          <input type="file" id="upload-json-summary" hidden accept=".json,application/json" on:change={handleUploadJson} />
      </div>
    </div>
    <div class="summary-grid">
        <div class="summary-item" style="border: 2px solid #ffc107;">
            <span class="value">{starCount}</span>
            <span class="label">Stars</span>
        </div>
        <div class="summary-item">
            <span class="value">{totalPlanets}</span>
            <span class="label">Planets</span>
        </div>
        <div class="summary-item">
            <span class="value">{totalMoons}</span>
            <span class="label">Moons</span>
        </div>
        <div class="summary-item">
            <span class="value">{belts}</span>
            <span class="label">Belts</span>
        </div>
        <div class="summary-item" style="border: 2px solid #cc6600">
            <span class="value">{terrestrials}</span>
            <span class="label">Terrestrial Bodies</span>
        </div>
        <div class="summary-item" style="border: 2px solid #cc0000">
            <span class="value">{gasGiants}</span>
            <span class="label">Gas Giants</span>
        </div>
        <div class="summary-item" style="border: 2px solid #add8e6">
            <span class="value">{iceGiants}</span>
            <span class="label">Ice Giants</span>
        </div>
        <div class="summary-item" style="border: 2px solid #007bff">
            <span class="value">{humanHabitable}</span>
            <span class="label">Human-Habitable</span>
        </div>
        <div class="summary-item" style="border: 2px solid #007bff">
            <span class="value">{earthLike}</span>
            <span class="label">Earth-like</span>
        </div>
        <div class="summary-item" style="border: 2px solid #00ff00">
            <span class="value">{biospheres}</span>
            <span class="label">Biospheres</span>
        </div>
        <div class="summary-item" style="border: 2px solid #f0f0f0;">
            <span class="value">{constructCount}</span>
            <span class="label">Constructs</span>
        </div>
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
    .header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 0.5em;
    }
    h3.focus-title {
        margin: 0;
        color: #eee; /* White color for the title */
        font-size: 1.5em;
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
    .dropdown {
      position: relative;
      display: inline-block;
    }

    .dropdown-content {
      display: block;
      position: absolute;
      background-color: #333;
      min-width: 160px;
      box-shadow: 0px 8px 16px 0px rgba(0,0,0,0.2);
      z-index: 1;
      right: 0;
    }

    .dropdown-content button {
      color: #eee;
      padding: 12px 16px;
      text-decoration: none;
      display: block;
      width: 100%;
      text-align: left;
      background: none;
      border: none;
    }

    .dropdown-content button:hover {background-color: #555;}

    .hamburger-button {
      font-size: 1.5em;
      background: none;
      border: none;
      color: #eee;
    }

    .todo-button {
      color: #888 !important;
    }
</style>