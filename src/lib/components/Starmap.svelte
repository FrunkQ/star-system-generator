<script lang="ts">
  import { createEventDispatcher, onMount, onDestroy } from 'svelte';
  import type { Starmap, System, CelestialBody, RulePack, Barycenter } from '$lib/types';
  import GmNotesEditor from './GmNotesEditor.svelte';
  import Grid from './Grid.svelte';
  import { starmapUiStore } from '$lib/starmapUiStore';
  import MarkdownModal from './MarkdownModal.svelte';
  import EditFuelAndDrivesModal from './EditFuelAndDrivesModal.svelte';

  export let starmap: Starmap;
  export let rulePack: RulePack; // We need this prop to show defaults!
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

  // Header State
  let showDropdown = false;
  let showAboutModal = false;
  let showFuelModal = false;
  
  const aboutContent = `
<h1>Star System Generator</h1>

<p><strong>Version:</strong> 1.2.1<br>
<strong>Date:</strong> 08-Jan-26</p>

<p>A tool for creating and exploring scientifically-plausible star systems.</p>

<hr>

<p><strong>Community & Support:</strong><br>
<a href="https://discord.gg/prvKpZMgNY" target="_blank">Join us on Discord!</a></p>
`;

  let panX = 0;
  let panY = 0;
  let zoom = 1;

  let isPanning = false;
  let lastMouseX = 0;
  let lastMouseY = 0;

  let gridSize = 50;

  function handleSaveFuelOverrides(event: CustomEvent<any>) {
      const overrides = event.detail;
      const newStarmap = { ...starmap, rulePackOverrides: overrides };
      dispatch('updatestarmap', newStarmap);
  }

  function handleWheel(event: WheelEvent) {
    if ($starmapUiStore.mouseZoomDisabled) return;
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

    // Cap the newZoom at the default starting zoom of 1
    zoom = Math.min(newZoom, 1);

    const centerX = minX + (maxX - minX) / 2;
    const centerY = minY + (maxY - minY) / 2;

    panX = viewBox.width / 2 - centerX * zoom;
    panY = viewBox.height / 2 - centerY * zoom;
  }

  onMount(async () => {
    document.addEventListener('click', handleClickOutside);
    resetView();
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
        if (star.classes.includes('star/red-giant')) return '#8b0000'; // Deep Red for Red Giant
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
    contextMenuSystemId = null;

    const svgRect = svgElement.getBoundingClientRect();
    const viewBox = svgElement.viewBox.baseVal;
    const scaleX = viewBox.width / svgRect.width;
    const scaleY = viewBox.height / svgRect.height;

    let clickX = ((event.clientX - svgRect.left) * scaleX - panX) / zoom;
    let clickY = ((event.clientY - svgRect.top) * scaleY - panY) / zoom;

    const firstSystemX = starmap.systems[0]?.position.x || 0;
    const firstSystemY = starmap.systems[0]?.position.y || 0;

    if ($starmapUiStore.gridType === 'grid') {
      const originX = firstSystemX - gridSize / 2;
      const originY = firstSystemY - gridSize / 2;
      const cellIndexX = Math.floor((clickX - originX) / gridSize);
      const cellIndexY = Math.floor((clickY - originY) / gridSize);
      clickX = (cellIndexX * gridSize) + (gridSize / 2) + originX;
      clickY = (cellIndexY * gridSize) + (gridSize / 2) + originY;
    } else if ($starmapUiStore.gridType === 'hex') {
      const hexSize = gridSize / 2;
      const hexHeight = gridSize;
      const hexWidth = Math.sqrt(3) * hexSize;

      const originX = firstSystemX;
      const originY = firstSystemY;

      // Find the approximate row and column
      const approxRow = (clickY - originY) / (hexHeight * 0.75);
      const approxCol = (clickX - originX) / hexWidth - (approxRow % 2) * 0.5;

      const r = Math.round(approxRow);
      const c = Math.round(approxCol);

      // Get the center of the nearest hex
      const centerX = originX + c * hexWidth + (r % 2) * (hexWidth / 2);
      const centerY = originY + r * hexHeight * 0.75;

      // Check neighbors to find the true closest hex
      let minDistSq = Infinity;
      let closestCenter = { x: centerX, y: centerY };

      for (let dr = -1; dr <= 1; dr++) {
        for (let dc = -1; dc <= 1; dc++) {
          const nr = r + dr;
          const nc = c + dc;
          const nx = originX + nc * hexWidth + (nr % 2) * (hexWidth / 2);
          const ny = originY + nr * hexHeight * 0.75;
          const dx = clickX - nx;
          const dy = clickY - ny;
          const distSq = dx * dx + dy * dy;
          if (distSq < minDistSq) {
            minDistSq = distSq;
            closestCenter = { x: nx, y: ny };
          }
        }
      }
      clickX = closestCenter.x;
      clickY = closestCenter.y;
    }

    contextMenuClickCoords = { x: clickX, y: clickY };
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
  <div class="starmap-header">
    <h1>{starmap.name}</h1>
    <div class="header-controls">
      <label>
        <input type="checkbox" bind:checked={$starmapUiStore.mouseZoomDisabled} />
        Disable Mouse Zoom
      </label>
      <label>
        <input type="checkbox" bind:checked={$starmapUiStore.showBackgroundImage} />
        Show Background
      </label>
      <label>
        Snap Grid:
        <select bind:value={$starmapUiStore.gridType} class="grid-select inline">
          <option value="none">No Grid</option>
          <option value="grid">Grid</option>
          <option value="hex">Hex</option>
        </select>
      </label>
      <button on:click={resetView}>Reset View</button>
      
      <div class="dropdown">
          <button on:click={() => showDropdown = !showDropdown} class="hamburger-button">&#9776;</button>
          {#if showDropdown}
              <div class="dropdown-content">
                  <button on:click={() => dispatch('download')}>Download Starmap</button>
                  <button on:click={() => dispatch('upload')}>Upload Starmap</button>
                  <hr />
                  <button on:click={() => dispatch('clear')} class="danger">Clear Starmap</button>
                  <hr />
                  <button on:click={() => showFuelModal = true}>Edit Fuel & Drives</button>
                  <button on:click={() => dispatch('settings')}>Global Settings</button>
                  <hr />
                  <button on:click={() => showAboutModal = true}>About</button>
              </div>
          {/if}
      </div>
    </div>
  </div>
  <svg
    bind:this={svgElement}
    class="starmap"
    class:with-background={$starmapUiStore.showBackgroundImage}
    xmlns="http://www.w3.org/2000/svg"
    viewBox="0 0 800 600"
    on:contextmenu={handleMapContextMenu}
    on:mousedown={handleMouseDown}
    on:mousemove={handleMouseMove}
    on:mouseup={handleMouseUp}
    on:wheel={handleWheel}
    role="button"
    tabindex="0"
  >
    <g bind:this={groupElement} transform={`translate(${panX}, ${panY}) scale(${zoom})`}>
      <Grid 
        gridType={$starmapUiStore.gridType} 
        {gridSize} 
        {panX} 
        {panY} 
        {zoom} 
        viewWidth={800} 
        viewHeight={600} 
        originX={
          $starmapUiStore.gridType === 'hex' 
            ? (starmap.systems[0]?.position.x || 0) - (Math.sqrt(3) * gridSize / 4)
            : (starmap.systems[0]?.position.x || 0) - gridSize / 2
        } 
        originY={
          (starmap.systems[0]?.position.y || 0) - gridSize / 2
        } 
      />
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
    <div class="context-menu" style="left: {contextMenuX}px; top: {contextMenuY}px;">
      <ul>
        {#if contextMenuSystemId}
            <li on:click={handleContextMenuZoom}>Zoom to System</li>
            <li on:click={handleContextMenuLink}>
              {#if selectedSystemForLink === null}
                Start Link
              {:else if selectedSystemForLink === contextMenuSystemId}
                Cancel Link
              {:else}
                Complete Link
              {/if}
            </li>
            <li on:click={handleContextMenuDelete}>Delete System</li>
        {:else}
          <li on:click={handleContextMenuAddSystem}>Add System Here</li>
        {/if}
      </ul>
    </div>
  {/if}
  
  {#if showAboutModal}
      <MarkdownModal htmlContent={aboutContent} on:close={() => showAboutModal = false} />
  {/if}

  {#if showFuelModal}
      <EditFuelAndDrivesModal 
          showModal={showFuelModal} 
          {rulePack} 
          {starmap} 
          on:save={handleSaveFuelOverrides} 
          on:close={() => showFuelModal = false} 
      />
  {/if}
</div>

<style>
  .context-menu {
    position: absolute;
    background-color: #333;
    border: 1px solid #555;
    border-radius: 5px;
    z-index: 100;
    color: #eee;
  }
  .context-menu ul {
    list-style: none;
    padding: 0;
    margin: 0;
  }
  .context-menu li {
    padding: 0.5em 1em;
    cursor: pointer;
  }
  .context-menu li:hover {
    background-color: #555;
  }

  .starmap-container {
    width: 100%;
    height: 100%;
    display: flex;
    flex-direction: column;
  }

  .starmap-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 0.5rem 0;
    flex-shrink: 0; /* Prevent header from shrinking */
    margin-top: 10px;
    margin-bottom: 10px;
  }

  .starmap-header h1 {
    margin: 0;
    font-size: 1.5rem;
  }

  .header-controls {
    display: flex;
    align-items: center;
    gap: 15px;
  }
  
  .header-controls label {
      display: flex;
      align-items: center;
      gap: 5px;
      font-size: 0.9em;
      color: #ccc;
      cursor: pointer;
      white-space: nowrap;
  }

  .dropdown {
    position: relative;
    display: inline-block;
  }

  .dropdown-content {
    display: block;
    position: absolute;
    background-color: #333;
    min-width: 200px;
    box-shadow: 0px 8px 16px 0px rgba(0,0,0,0.5);
    z-index: 1000;
    right: 0;
    border: 1px solid #555;
    border-radius: 4px;
    padding: 5px 0;
  }

  .dropdown-content button {
    color: #eee;
    padding: 10px 16px;
    text-decoration: none;
    display: block;
    width: 100%;
    text-align: left;
    background: none;
    border: none;
    cursor: pointer;
  }

  .dropdown-content button:hover {background-color: #444;}
  .dropdown-content button.danger { color: #ff4444; }
  .dropdown-content button.danger:hover { background-color: #442222; }

  .grid-select {
      padding: 4px;
      background: #222;
      color: #eee;
      border: 1px solid #555;
      border-radius: 3px;
  }
  .grid-select.inline {
      width: auto;
  }

  .hamburger-button {
    font-size: 1.5em;
    background: none;
    border: none;
    color: #eee;
    cursor: pointer;
    padding: 0 10px;
  }
  
  hr { border: 0; border-top: 1px solid #555; margin: 5px 0; }

  .starmap {
    width: 100%;
    flex: 1; /* Make the SVG take up remaining space */
    border: 1px solid #ccc;
    background-color: #000; /* Default background */
  }

  .starmap.with-background {
    /* 
      Image Credit: ESO/S. Brunier 
      https://www.eso.org/public/images/eso0932a/
    */
    background-image: url('/images/ui/MilkyWay.jpg');
    background-size: cover;
    background-position: center center;
    background-repeat: no-repeat;
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
    paint-order: stroke;
    stroke: #000;
    stroke-width: 2px;
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
    paint-order: stroke;
    stroke: #000;
    stroke-width: 2px;
  }
</style>
