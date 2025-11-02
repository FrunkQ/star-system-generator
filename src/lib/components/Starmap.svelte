<script lang="ts">
  import { createEventDispatcher, onMount, onDestroy } from 'svelte';
  import type { Starmap, System, CelestialBody, RulePack, Barycenter } from '$lib/types';
  import ContextMenu from './ContextMenu.svelte';

  export let starmap: Starmap;
  export let linkingMode: boolean = false;
  export let selectedSystemForLink: string | null = null;

  const dispatch = createEventDispatcher();

  let svgElement: SVGSVGElement;
  let panzoomInstance: any; // Use 'any' to avoid type errors with dynamic import
  let groupElement: SVGGElement;

  let showContextMenu = false;
  let contextMenuX = 0;
  let contextMenuY = 0;
  let contextMenuSystemId: string | null = null;
  let isStarContextMenu = false;

  onMount(async () => {
    const { default: Panzoom } = await import('@panzoom/panzoom');
    if (groupElement) {
      panzoomInstance = Panzoom(groupElement, {
        maxScale: 5, // Maximum zoom level
        minScale: 0.5, // Minimum zoom level
        pan: true, // Enable panning
      });

      // Optional: Add event listeners for zoom controls
      // For example, to zoom with mouse wheel:
      svgElement.parentElement?.addEventListener('wheel', panzoomInstance.zoomWithWheel);
    }

    document.addEventListener('click', handleClickOutside);
  });

  onDestroy(() => {
    // Clean up the panzoom instance when the component is destroyed
    if (panzoomInstance) {
      panzoomInstance.destroy();
    }
    document.removeEventListener('click', handleClickOutside);
  });

  function handleClickOutside(event: MouseEvent) {
    if (showContextMenu) {
      closeContextMenu();
    }
  }

  function getStarColor(star: CelestialBody): string {
    if (star && star.classes && star.classes.length > 0) {
        const starClass = star.classes[0].split('/')[1]; // e.g., "star/G2V" -> "G2V"
        const spectralType = starClass[0]; // e.g., "G2V" -> "G"
        switch (spectralType) {
            case 'O': return '#9bb0ff'; // Blue
            case 'B': return '#aabfff'; // Blue-white
            case 'A': return '#cad7ff'; // White
            case 'F': return '#f8f7ff'; // Yellow-white
            case 'G': return '#fff8e8'; // Yellow (Sun-like)
            case 'K': return '#ffddb4'; // Orange
            case 'M': return '#ff8f5a'; // Red
            default: return '#cccccc'; // Default for unknown
        }
    }
    return '#cccccc'; // Default color
  }

  function handleStarClick(event: MouseEvent, systemId: string) {
    if (event.button === 0) { // Left click
      if (linkingMode) {
        dispatch('selectsystemforlink', systemId);
      } else {
        dispatch('systemclick', systemId);
      }
    }
  }

  function handleStarDblClick(systemId: string) {
    dispatch('systemzoom', systemId);
  }

  function handleStarContextMenu(event: MouseEvent, systemId: string) {
    event.preventDefault();
    event.stopPropagation();
    showContextMenu = true;
    isStarContextMenu = true;
    contextMenuX = event.clientX;
    contextMenuY = event.clientY;
    contextMenuSystemId = systemId;
  }

  function handleMapContextMenu(event: MouseEvent) {
    event.preventDefault();
    event.stopPropagation();
  }

  function closeContextMenu() {
    showContextMenu = false;
    contextMenuSystemId = null;
  }

  function handleContextMenuZoom() {
    if (contextMenuSystemId) {
      dispatch('systemzoom', contextMenuSystemId);
    }
    closeContextMenu();
  }

  function handleContextMenuLink() {
    if (contextMenuSystemId) {
      dispatch('selectsystemforlink', contextMenuSystemId);
    }
    closeContextMenu();
  }

  function handleContextMenuDelete() {
    if (contextMenuSystemId) {
      dispatch('deletesystem', contextMenuSystemId);
    }
    closeContextMenu();
  }

  let addingSystem = false;

  function handleAddSystemClick() {
    addingSystem = !addingSystem;
  }

  function handleMapClick(event: MouseEvent) {
    if (addingSystem) {
      const rect = svgElement.getBoundingClientRect();
      const x = event.clientX - rect.left;
      const y = event.clientY - rect.top;
      dispatch('addsystemat', { x, y });
      addingSystem = false;
    }
  }

  export function resetView() {
    if (panzoomInstance) {
      panzoomInstance.reset();
    }
  }
</script>

<div class="starmap-container" style="touch-action: none;">
  <div class="reset-view-controls">
    <button on:click={resetView}>Reset View</button>
    <button on:click={handleAddSystemClick}>{addingSystem ? 'Adding System - click on map' : 'Add System'}</button>
  </div>
  <h1>{starmap.name}</h1>
  <svg
    bind:this={svgElement}
    class="starmap"
    xmlns="http://www.w3.org/2000/svg"
    viewBox="0 0 800 600"
    on:contextmenu={handleMapContextMenu}
    on:click={handleMapClick}
    role="button"
    tabindex="0"
  >
    <g bind:this={groupElement}>
      {#each starmap.systems as systemNode}
        {@const rootNode = systemNode.system.nodes.find(n => n.parentId === null)}
        {#if rootNode && rootNode.kind === 'barycenter'}
          {@const barycenter = rootNode as Barycenter}
          {@const starA = systemNode.system.nodes.find(n => n.id === barycenter.memberIds[0]) as CelestialBody}
          {@const starB = systemNode.system.nodes.find(n => n.id === barycenter.memberIds[1]) as CelestialBody}
          <g
            role="button"
            tabindex="0"
            on:click={(e) => handleStarClick(e, systemNode.id)}
            on:dblclick={() => handleStarDblClick(systemNode.id)}
            on:contextmenu={(e) => handleStarContextMenu(e, systemNode.id)}
            on:keydown={(e) => { if (e.key === 'Enter' || e.key === ' ') handleStarClick(e, systemNode.id); }}
          >
            <circle
              cx={systemNode.position.x - 5}
              cy={systemNode.position.y}
              r={5}
              style="fill: {getStarColor(starA)};"
              class="star"
              class:selected={systemNode.id === selectedSystemForLink}
            />
            <circle
              cx={systemNode.position.x + 5}
              cy={systemNode.position.y}
              r={5}
              style="fill: {getStarColor(starB)};"
              class="star"
              class:selected={systemNode.id === selectedSystemForLink}
            />
          </g>
          <text
            x={systemNode.position.x + 15}
            y={systemNode.position.y + 5}
            class="star-label"
          >
            {systemNode.name}
          </text>
        {:else}
          <g
            role="button"
            tabindex="0"
            on:click={(e) => handleStarClick(e, systemNode.id)}
            on:dblclick={() => handleStarDblClick(systemNode.id)}
            on:contextmenu={(e) => handleStarContextMenu(e, systemNode.id)}
            on:keydown={(e) => { if (e.key === 'Enter' || e.key === ' ') handleStarClick(e, systemNode.id); }}
          >
            <circle
              cx={systemNode.position.x}
              cy={systemNode.position.y}
              r={5}
              style="fill: {getStarColor(rootNode as CelestialBody)};"
              class="star"
              class:selected={systemNode.id === selectedSystemForLink}
            />
          </g>
          <text
            x={systemNode.position.x + 10}
            y={systemNode.position.y + 5}
            class="star-label"
          >
            {systemNode.name}
          </text>
        {/if}
      {/each}

      {#each starmap.routes as route}
        {@const sourceSystem = starmap.systems.find(s => s.id === route.sourceSystemId)}
        {@const targetSystem = starmap.systems.find(s => s.id === route.targetSystemId)}
        {#if sourceSystem && targetSystem}
          {@const strokeWidth = Math.max(1, route.distance / 2)}
          <line
            x1={sourceSystem.position.x}
            y1={sourceSystem.position.y}
            x2={targetSystem.position.x}
            y2={targetSystem.position.y}
            class="route-clickable-area"
            on:click={() => dispatch('editroute', route)}
          />
          <line
            x1={sourceSystem.position.x}
            y1={sourceSystem.position.y}
            x2={targetSystem.position.x}
            y2={targetSystem.position.y}
            class="route"
            class:jump-route={route.unit === 'J'}
            style="stroke-width: {strokeWidth}px;"
          />
          <text
            x={(sourceSystem.position.x + targetSystem.position.x) / 2}
            y={(sourceSystem.position.y + targetSystem.position.y) / 2 - 5}
            class="route-label"
            on:click={() => dispatch('editroute', route)}
          >
            {route.unit === 'J' ? 'J' : ''}{route.distance}{route.unit !== 'J' ? ` ${route.unit}` : ''}
          </text>
        {/if}
      {/each}
    </g>
  </svg>

  {#if showContextMenu}
    <ContextMenu
      x={contextMenuX}
      y={contextMenuY}
      on:zoom={handleContextMenuZoom}
      on:link={handleContextMenuLink}
      on:delete={handleContextMenuDelete}
      isStar={isStarContextMenu}
    />
  {/if}
</div>

<style>
  .starmap-container {
    width: 100%;
    height: 100%;
    position: relative; /* Added for positioning children */
  }

  .reset-view-controls {
    position: absolute;
    top: 10px;
    right: 10px;
    z-index: 1001; /* Ensure it's above the SVG */
  }

  .starmap {
    width: 100%;
    height: 100%;
    border: 1px solid #ccc;
    background-color: #000;
  }

  .star {
    cursor: pointer;
  }

  .star.selected {
    stroke: #00ff00;
    stroke-width: 2;
  }

  .star-label {
    fill: #fff;
    font-size: 12px;
  }

  .route {
    stroke: #00ccff;
    stroke-width: 1;
  }

  .route.jump-route {
    stroke-dasharray: 4;
  }

  .route-clickable-area {
    stroke: transparent;
    stroke-width: 10px;
    cursor: pointer;
  }

  .route-label {
    fill: #00ccff;
    font-size: 10px;
    text-anchor: middle;
  }
</style>