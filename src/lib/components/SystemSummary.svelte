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
  let constructCount = 0;

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

  function groupItemsByHost(items: CelestialBody[], allNodes: (CelestialBody | Barycenter)[]) {
    const hosts = allNodes.filter(n => n.kind === 'body' && (n.roleHint === 'star' || n.roleHint === 'planet' || n.roleHint === 'moon'));
    const hostMap = new Map<string, (CelestialBody | Barycenter)>();
    hosts.forEach(h => hostMap.set(h.id, h));

    const grouped = new Map<string, CelestialBody[]>();

    items.forEach(item => {
      const hostId = item.ui_parentId || item.orbit?.hostId;
      if (hostId) {
        if (!grouped.has(hostId)) {
          grouped.set(hostId, []);
        }
        grouped.get(hostId)?.push(item);
      }
    });

    const result = Array.from(grouped.entries()).map(([hostId, children]) => {
      children.sort((a, b) => (a.orbit?.elements.a_AU || 0) - (b.orbit?.elements.a_AU || 0));
      return {
        host: hostMap.get(hostId),
        children: children
      };
    });

    const nodeMap = new Map(allNodes.map(n => [n.id, n]));
    const getDepth = (nodeId: ID | null): number => {
      if (!nodeId) return 0;
      const node = nodeMap.get(nodeId);
      if (!node || !node.parentId) return 0;
      return 1 + getDepth(node.parentId);
    };

    // Sort the hosts themselves by their orbital distance and depth
    result.sort((a, b) => {
        const aDepth = getDepth(a.host.id);
        const bDepth = getDepth(b.host.id);

        if (aDepth !== bDepth) {
          return aDepth - bDepth;
        }

        const aOrbit = (a.host as CelestialBody)?.orbit;
        const bOrbit = (b.host as CelestialBody)?.orbit;
        if (aOrbit && bOrbit) {
            return aOrbit.elements.a_AU - bOrbit.elements.a_AU;
        }
        if (!aOrbit) return -1;
        if (!bOrbit) return 1;
        return 0;
    });

    return result;
  }

  function showContextMenu(event: MouseEvent, type: string) {
    event.stopPropagation(); // Prevent the click from bubbling up and closing the menu immediately
    if (!system) return;

    let items: CelestialBody[] = [];
    let itemType = type;

    switch (type) {
      case 'star':
        items = system.nodes.filter(n => n.kind === 'body' && n.roleHint === 'star') as CelestialBody[];
        break;
      case 'planet':
        items = system.nodes.filter(n => n.kind === 'body' && n.roleHint === 'planet') as CelestialBody[];
        break;
      case 'moon':
        const moons = system.nodes.filter(n => n.kind === 'body' && n.roleHint === 'moon') as CelestialBody[];
        const groupedMoons = groupItemsByHost(moons, system.nodes);
        if (groupedMoons.length > 0) {
          dispatch('showcontextmenu', { x: event.clientX, y: event.clientY, items: groupedMoons, type: 'grouped' });
        }
        return;
      case 'belt':
        items = system.nodes.filter(n => n.kind === 'body' && n.roleHint === 'belt') as CelestialBody[];
        break;
      case 'terrestrial':
        const terrestrialBodies = system.nodes.filter(n => n.kind === 'body' && (n.roleHint === 'planet' || n.roleHint === 'moon') && !n.classes?.some(c => c.includes('gas-giant') || c.includes('ice-giant'))) as CelestialBody[];
        const groupedTerrestrials = groupItemsByHost(terrestrialBodies, system.nodes);
        if (groupedTerrestrials.length > 0) {
          dispatch('showcontextmenu', { x: event.clientX, y: event.clientY, items: groupedTerrestrials, type: 'grouped' });
        }
        return;
      case 'gas-giant':
        items = system.nodes.filter(n => n.kind === 'body' && n.classes?.some(c => c.includes('gas-giant'))) as CelestialBody[];
        break;
      case 'ice-giant':
        items = system.nodes.filter(n => n.kind === 'body' && n.classes?.some(c => c.includes('ice-giant'))) as CelestialBody[];
        break;
      case 'human-habitable':
        items = system.nodes.filter(n => n.kind === 'body' && n.tags?.some(t => t.key === 'habitability/human')) as CelestialBody[];
        break;
      case 'earth-like':
        items = system.nodes.filter(n => n.kind === 'body' && n.tags?.some(t => t.key === 'habitability/earth-like')) as CelestialBody[];
        break;
      case 'biosphere':
        items = system.nodes.filter(n => n.kind === 'body' && n.biosphere) as CelestialBody[];
        break;
      case 'construct':
        const constructs = system.nodes.filter(n => n.kind === 'construct') as CelestialBody[];
        const groupedConstructs = groupItemsByHost(constructs, system.nodes);
        if (groupedConstructs.length > 0) {
          dispatch('showcontextmenu', { x: event.clientX, y: event.clientY, items: groupedConstructs, type: 'grouped' });
        }
        return;
    }

    // Sort flat lists
    items.sort((a, b) => {
      const aOrbit = a.orbit;
      const bOrbit = b.orbit;
      if (aOrbit && bOrbit) {
        if (aOrbit.hostId === bOrbit.hostId) {
          return aOrbit.elements.a_AU - bOrbit.elements.a_AU;
        }
        // A bit of a hack to sort planets before moons if they are mixed
        const aIsPlanet = (a as CelestialBody).roleHint === 'planet';
        const bIsPlanet = (b as CelestialBody).roleHint === 'planet';
        if (aIsPlanet && !bIsPlanet) return -1;
        if (!aIsPlanet && bIsPlanet) return 1;
        return aOrbit.hostId.localeCompare(bOrbit.hostId);
      }
      return 0;
    });

    if (items.length > 0) {
      dispatch('showcontextmenu', {
        x: event.clientX,
        y: event.clientY,
        items: items,
        type: itemType
      });
    }
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
    constructCount = 0;

    if (system) {
        for (const node of system.nodes) {
            if (node.kind === 'construct') {
                constructCount++;
                continue; // Skip to next node
            }

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
                      {#if system?.isManuallyEdited}
                        <button on:click={() => dispatch('clearmanualedit')}>Show Regenerate Controls</button>
                      {/if}
                      <button on:click={() => alert('This is a star system generator.')}>About</button>
                  </div>
              {/if}
          </div>
          <input type="file" id="upload-json-summary" hidden accept=".json,application/json" on:change={handleUploadJson} />
      </div>
    </div>
    <div class="summary-grid">
        <div class="summary-item" style="border: 2px solid #ffc107;" on:click={(e) => showContextMenu(e, 'star')}>
            <span class="value">{starCount}</span>
            <span class="label">Stars</span>
        </div>
        <div class="summary-item" on:click={(e) => showContextMenu(e, 'planet')}>
            <span class="value">{totalPlanets}</span>
            <span class="label">Planets</span>
        </div>
        <div class="summary-item" on:click={(e) => showContextMenu(e, 'moon')}>
            <span class="value">{totalMoons}</span>
            <span class="label">Moons</span>
        </div>
        <div class="summary-item" on:click={(e) => showContextMenu(e, 'belt')}>
            <span class="value">{belts}</span>
            <span class="label">Belts</span>
        </div>
        <div class="summary-item" style="border: 2px solid #cc6600" on:click={(e) => showContextMenu(e, 'terrestrial')}>
            <span class="value">{terrestrials}</span>
            <span class="label">Terrestrial</span>
        </div>
        <div class="summary-item" style="border: 2px solid #cc0000" on:click={(e) => showContextMenu(e, 'gas-giant')}>
            <span class="value">{gasGiants}</span>
            <span class="label">Gas Giants</span>
        </div>
        <div class="summary-item" style="border: 2px solid #add8e6" on:click={(e) => showContextMenu(e, 'ice-giant')}>
            <span class="value">{iceGiants}</span>
            <span class="label">Ice Giants</span>
        </div>
        <div class="summary-item" style="border: 2px solid #007bff" on:click={(e) => showContextMenu(e, 'human-habitable')}>
            <span class="value">{humanHabitable}</span>
            <span class="label">Human-Habitable</span>
        </div>
        <div class="summary-item" style="border: 2px solid #007bff" on:click={(e) => showContextMenu(e, 'earth-like')}>
            <span class="value">{earthLike}</span>
            <span class="label">Earth-like</span>
        </div>
        <div class="summary-item" style="border: 2px solid #00ff00" on:click={(e) => showContextMenu(e, 'biosphere')}>
            <span class="value">{biospheres}</span>
            <span class="label">Biospheres</span>
        </div>
        <div class="summary-item" style="border: 2px solid #f0f0f0;" on:click={(e) => showContextMenu(e, 'construct')}>
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
        cursor: pointer;
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