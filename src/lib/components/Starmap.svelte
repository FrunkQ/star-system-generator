<script lang="ts">
  import { createEventDispatcher, onMount, onDestroy } from 'svelte';
  import type { Starmap, System, CelestialBody, RulePack, Barycenter } from '$lib/types';
  import ContextMenu from './ContextMenu.svelte';
  import GmNotesEditor from './GmNotesEditor.svelte';

  export let starmap: Starmap;
  export let linkingMode: boolean = false;
  export let selectedSystemForLink: string | null = null;

  const dispatch = createEventDispatcher();

  let svgElement: SVGSVGElement;
  let groupElement: SVGGElement;
  let starmapContainer: HTMLDivElement;

  let showContextMenu = false;
  let contextMenuX = 0;
  let contextMenuY = 0;
  let contextMenuSystemId: string | null = null;
  let isStarContextMenu = false;

  let panX = 0;
  let panY = 0;
  let zoom = 1;

  let isPanning = false;
  let lastMouseX = 0;
  let lastMouseY = 0;

  function handleWheel(event: WheelEvent) {
    event.preventDefault();
    const scaleAmount = 0.1;
    const scale = event.deltaY > 0 ? 1 - scaleAmount : 1 + scaleAmount;

    const svgRect = svgElement.getBoundingClientRect();
    const viewBox = svgElement.viewBox.baseVal;
    const scaleX = viewBox.width / svgRect.width;
    const scaleY = viewBox.height / svgRect.height;

    const mouseX = (event.clientX - svgRect.left) * scaleX;
    const mouseY = (event.clientY - svgRect.top) * scaleY;

    const newZoom = zoom * scale;

    panX = mouseX - (mouseX - panX) * scale;
    panY = mouseY - (mouseY - panY) * scale;
    zoom = newZoom;
  }

  function handleMouseDown(event: MouseEvent) {
    if (event.button !== 0) return; // Left mouse button
    if (event.target !== svgElement) return; // Only pan on blank space
    isPanning = true;
    lastMouseX = event.clientX;
    lastMouseY = event.clientY;
  }

  function handleMouseMove(event: MouseEvent) {
    if (!isPanning) return;
    const deltaX = event.clientX - lastMouseX;
    const deltaY = event.clientY - lastMouseY;
    lastMouseX = event.clientX;
    lastMouseY = event.clientY;

    panX += deltaX;
    panY += deltaY;
  }

  function handleMouseUp(event: MouseEvent) {
    if (event.button !== 0) return;
    isPanning = false;
  }

  function resetView() {
    if (starmap.systems.length === 0) {
      panX = 0;
      panY = 0;
      zoom = 1;
      return;
    }

    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;

    for (const system of starmap.systems) {
      minX = Math.min(minX, system.position.x);
      minY = Math.min(minY, system.position.y);
      maxX = Math.max(maxX, system.position.x);
      maxY = Math.max(maxY, system.position.y);
    }

    const padding = 50;
    const bboxWidth = maxX - minX + padding * 2;
    const bboxHeight = maxY - minY + padding * 2;

    const viewBox = svgElement.viewBox.baseVal;
    const zoomX = viewBox.width / bboxWidth;
    const zoomY = viewBox.height / bboxHeight;
    const newZoom = Math.min(zoomX, zoomY);

    const centerX = minX + (maxX - minX) / 2;
    const centerY = minY + (maxY - minY) / 2;

    panX = viewBox.width / 2 - centerX * newZoom;
    panY = viewBox.height / 2 - centerY * newZoom;
    zoom = newZoom;
  }

  onMount(async () => {
    document.addEventListener('click', handleClickOutside);
  });

  onDestroy(() => {
    document.removeEventListener('click', handleClickOutside);
  });

  function handleClickOutside(event: MouseEvent) {
    if (showContextMenu) {
      closeContextMenu();
    }
  }

  function getStarColor(star: CelestialBody): string {
    if (star && star.classes && star.classes.length > 0) {
        if (star.classes.includes('star/magnetar')) return '#800080'; // Purple for Magnetar
        if (star.classes.includes('BH') || star.classes.includes('star/BH')) return '#000000'; // Black for Black Hole
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
    const rect = starmapContainer.getBoundingClientRect();
    contextMenuX = event.clientX - rect.left;
    contextMenuY = event.clientY - rect.top;
    contextMenuSystemId = systemId;
  }

  let contextMenuClickCoords = { x: 0, y: 0 };

  function handleMapContextMenu(event: MouseEvent) {
    event.preventDefault();
    event.stopPropagation();
    showContextMenu = true;
    isStarContextMenu = false;
    const rect = starmapContainer.getBoundingClientRect();
    contextMenuX = event.clientX - rect.left;
    contextMenuY = event.clientY - rect.top;
    contextMenuSystemId = null; // No system selected for map context menu

    const svgRect = svgElement.getBoundingClientRect();
    const viewBox = svgElement.viewBox.baseVal;
    const scaleX = viewBox.width / svgRect.width;
    const scaleY = viewBox.height / svgRect.height;

    contextMenuClickCoords = {
      x: ((event.clientX - svgRect.left) * scaleX - panX) / zoom,
      y: ((event.clientY - svgRect.top) * scaleY - panY) / zoom
    };
  }

  function closeContextMenu() {
    showContextMenu = false;
    contextMenuSystemId = null;
  }

  function handleContextMenuAddSystem() {
    dispatch('addsystemat', contextMenuClickCoords);
    closeContextMenu();
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




</script>

<div class="starmap-container" style="touch-action: none;" bind:this={starmapContainer}>
  <div class="reset-view-controls">
    <button on:click={resetView}>Reset View</button>
  </div>
  <h1>{starmap.name}</h1>
  <svg
    bind:this={svgElement}
    class="starmap"
    xmlns="http://www.w3.org/2000/svg"
    viewBox="0 0 800 600"
    on:contextmenu={handleMapContextMenu}
    on:wheel={handleWheel}
    on:mousedown={handleMouseDown}
    on:mousemove={handleMouseMove}
    on:mouseup={handleMouseUp}
    role="button"
    tabindex="0"
  >
    <g bind:this={groupElement} transform={`translate(${panX}, ${panY}) scale(${zoom})`}>
      {#each starmap.routes as route}
        {@const sourceSystem = starmap.systems.find(s => s.id === route.sourceSystemId)}
        {@const targetSystem = starmap.systems.find(s => s.id === route.targetSystemId)}
        {#if sourceSystem && targetSystem}
          {@const strokeWidth = 2}
          <line
            x1={sourceSystem.position.x}
            y1={sourceSystem.position.y}
            x2={targetSystem.position.x}
            y2={targetSystem.position.y}
            class="route-clickable-area"
          />
          <line
            x1={sourceSystem.position.x}
            y1={sourceSystem.position.y}
            x2={targetSystem.position.x}
            y2={targetSystem.position.y}
            class="route"
            class:jump-route={route.lineStyle === 'dashed'}
            style="stroke-width: {strokeWidth}px;"
          />
          <text
            x={(sourceSystem.position.x + targetSystem.position.x) / 2}
            y={(sourceSystem.position.y + targetSystem.position.y) / 2 - 5}
            class="route-label"
            on:click={() => dispatch('editroute', route)}
          >
            {starmap.unitIsPrefix ? starmap.distanceUnit : ''}{route.distance}{!starmap.unitIsPrefix ? ` ${starmap.distanceUnit}` : ''}
          </text>
        {/if}
      {/each}

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
              class:black-hole={starA.classes.includes('BH') || starA.classes.includes('star/BH')}
            />
            <circle
              cx={systemNode.position.x + 5}
              cy={systemNode.position.y}
              r={5}
              style="fill: {getStarColor(starB)};"
              class="star"
              class:selected={systemNode.id === selectedSystemForLink}
              class:black-hole={starB.classes.includes('BH') || starB.classes.includes('star/BH')}
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
              class:black-hole={(rootNode as CelestialBody).classes.includes('BH') || (rootNode as CelestialBody).classes.includes('star/BH')}
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
    </g>
  </svg>
  <GmNotesEditor body={starmap} />

  {#if showContextMenu}
    <ContextMenu
      x={contextMenuX}
      y={contextMenuY}
      on:zoom={handleContextMenuZoom}
      on:link={handleContextMenuLink}
      on:delete={handleContextMenuDelete}
      on:addsystem={handleContextMenuAddSystem}
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

  .star.black-hole {
    stroke: #ffffff;
    stroke-width: 1;
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
    fill: #FFFF00;
    font-size: 10px;
    text-anchor: middle;
  }
</style>