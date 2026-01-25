<script lang="ts">
  import { createEventDispatcher, onMount, onDestroy } from 'svelte';
  import type { Starmap, System, CelestialBody, RulePack, Barycenter } from '$lib/types';
  import GmNotesEditor from './GmNotesEditor.svelte';
  import Grid from './Grid.svelte';
  import { starmapUiStore } from '$lib/starmapUiStore';
  import MarkdownModal from './MarkdownModal.svelte';
  import EditFuelAndDrivesModal from './EditFuelAndDrivesModal.svelte';
  import EditSensorsModal from './EditSensorsModal.svelte';
  import SaveSystemModal from './SaveSystemModal.svelte';
  import ImportTravellerModal from './ImportTravellerModal.svelte';
  import AddTravellerSystemModal from './AddTravellerSystemModal.svelte';
  import { TravellerImporter } from '$lib/traveller/importer';
  import { computePlayerSnapshot } from '$lib/system/utils';
  import { APP_VERSION, APP_DATE } from '$lib/constants';

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
  let detectedSubsector: any = null;
  let isStarContextMenu = false;

  // Header State
  let showDropdown = false;
  let showAboutModal = false;
  let showFuelModal = false;
  let showSensorsModal = false;
  let showSaveModal = false;
  let showImportModal = false;
  let showAddTravellerModal = false;
  
  let travellerImportCoords = { x: 0, y: 0 };
  
  const aboutContent = `
<h1>Star System Explorer</h1>

<p><strong>Version:</strong> ${APP_VERSION}<br>
<strong>Date:</strong> ${APP_DATE}</p>

<p>A tool for creating and exploring scientifically-plausible star systems.</p>

<hr>

<p><strong>Community & Support:</strong><br>
<a href="https://discord.gg/UAEq4zzjD8" target="_blank">Join us on Discord!</a><br>
<a href="https://youtu.be/LrgNh2PVOlg" target="_blank">Watch the Tutorial Video</a></p>
`;

  let panX = 0;
  let panY = 0;
  let zoom = 1;

  let isPanning = false;
  let lastMouseX = 0;
  let lastMouseY = 0;

  let gridSize = 50;

  $: if ($starmapUiStore.gridType === 'traveller-hex') {
    if (starmap.distanceUnit !== 'Jump-' || !starmap.unitIsPrefix) {
        const newStarmap = { ...starmap, distanceUnit: 'Jump-', unitIsPrefix: true };
        dispatch('updatestarmap', newStarmap);
    }
  }

  function handleSaveFuelOverrides(event: CustomEvent<any>) {
      const overrides = event.detail;
      const newStarmap = { ...starmap, rulePackOverrides: { ...starmap.rulePackOverrides, ...overrides } };
      dispatch('updatestarmap', newStarmap);
  }

  function handleSaveSensorOverrides(event: CustomEvent<any>) {
      const overrides = event.detail;
      const newStarmap = { ...starmap, rulePackOverrides: { ...starmap.rulePackOverrides, ...overrides } };
      dispatch('updatestarmap', newStarmap);
  }

  function handleSaveStarmap(event: CustomEvent<{mode: 'GM' | 'Player', includeConstructs: boolean}>) {
      const { mode, includeConstructs } = event.detail;
      
      // Deep copy first
      const starmapToSave = JSON.parse(JSON.stringify(starmap));

      // Process each system
      starmapToSave.systems = starmapToSave.systems.map((node: any) => {
          // If the system data is loaded in the node
          if (node.system) {
              if (mode === 'Player') {
                  node.system = computePlayerSnapshot(node.system);
              }
              if (!includeConstructs) {
                  node.system.nodes = node.system.nodes.filter((n: any) => n.kind !== 'construct');
              }
          }
          return node;
      });

      // Download
      const json = JSON.stringify(starmapToSave, null, 2);
      const blob = new Blob([json], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${starmap.name.replace(/\s+/g, '_') || 'starmap'}-Starmap${mode === 'Player' ? '-Player' : ''}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
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
      // Center on World (0,0)
      const viewBox = svgElement.viewBox.baseVal;
      panX = viewBox.width / 2;
      panY = viewBox.height / 2;
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

    const paddingLeft = 75;
    const paddingRight = 160; // Extra space for long system names
    const paddingVertical = 50;

    const bboxWidth = maxX - minX + paddingLeft + paddingRight;
    const bboxHeight = maxY - minY + paddingVertical * 2;

    const viewBox = svgElement.viewBox.baseVal;
    const zoomX = viewBox.width / bboxWidth;
    const zoomY = viewBox.height / bboxHeight;
    const newZoom = Math.min(zoomX, zoomY) * 1.2; // Zoom in 20% more than the tightest fit

    // Cap the newZoom at the default starting zoom of 1
    zoom = Math.min(newZoom, 1);

    // Center point calculation:
    // We want the visual center of the viewBox to align with the center of the bounding box
    // BUT shifted to account for the asymmetric padding.
    // The "center" of the content is (minX + maxX) / 2.
    // The "center" of the padded area is (minX - paddingLeft + maxX + paddingRight) / 2.
    // This shifts the view so that more space is visible on the right.
    const centerX = (minX - paddingLeft + maxX + paddingRight) / 2;
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
          if (star.classes.some(c => c.includes('BH'))) return '#000000'; // Black for all Black Holes (Active or Quiescent)
          if (star.classes.includes('star/red-giant')) return '#8b0000'; // Deep Red for Red Giant
          if (star.classes.includes('star/brown-dwarf')) return '#5d4037'; // Dark Brown for Brown Dwarf
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
              case 'L': return '#8a4a4a'; // Brown Dwarf (L-type)
              case 'T': return '#4a2a2a'; // Brown Dwarf (T-type)
              case 'Y': return '#2a1a1a'; // Brown Dwarf (Y-type)
              default: return '#cccccc'; // Default for unknown
          }
      }
      return '#cccccc'; // Default color
    }
  function getVisualNodes(system: System): CelestialBody[] {
      const stars = system.nodes.filter(n => n.kind === 'body' && n.roleHint === 'star') as CelestialBody[];
      if (stars.length > 0) {
          // Sort by mass descending so primary is first
          return stars.sort((a, b) => (b.massKg || 0) - (a.massKg || 0));
      }
      // No stars? Return root node if it's a body
      const root = system.nodes.find(n => n.parentId === null);
      if (root && root.kind === 'body') return [root as CelestialBody];
      return [];
  }

  function getBlackHoleType(body: CelestialBody): 'none' | 'BH' | 'BH_active' {
      if (body.classes.includes('star/BH_active') || body.classes.includes('BH_active')) return 'BH_active';
      if (body.classes.includes('star/BH') || body.classes.includes('BH')) return 'BH';
      return 'none';
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
    } else if ($starmapUiStore.gridType === 'hex' || $starmapUiStore.gridType === 'traveller-hex') {
      const hexSize = gridSize / 2;
      // Flat-topped geometry
      const hexWidth = 2 * hexSize;
      const hexHeight = Math.sqrt(3) * hexSize;
      const horizDist = 1.5 * hexSize;

      const originX = firstSystemX;
      const originY = firstSystemY;

      // Find the approximate col and row
      // x = col * 1.5 * size -> col ~ x / (1.5*size)
      const approxCol = (clickX - originX) / horizDist;
      // y = row * h + offset -> row ~ y / h
      const approxRow = (clickY - originY) / hexHeight - (Math.abs(Math.round(approxCol)) % 2) * 0.5;

      const c = Math.round(approxCol);
      const r = Math.round(approxRow);

      // Check neighbors to find the true closest hex
      let minDistSq = Infinity;
      let closestCenter = { x: 0, y: 0 };

      for (let dc = -1; dc <= 1; dc++) {
        for (let dr = -1; dr <= 1; dr++) {
          const nr = r + dr;
          const nc = c + dc;
          const nx = originX + nc * horizDist;
          const ny = originY + nr * hexHeight + (Math.abs(nc) % 2) * (hexHeight / 2);
          
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

    // Subsector Detection
    detectedSubsector = null;
    if ($starmapUiStore.gridType === 'traveller-hex' && starmap.travellerMetadata) {
        const size = gridSize / 2;
        const hexWidth = 2 * size;
        const hexHeight = Math.sqrt(3) * size;
        const horizDist = 1.5 * size;

        for (const sub of starmap.travellerMetadata.importedSubsectors) {
            const dx = clickX - sub.originX;
            const dy = clickY - sub.originY;
            // Buffer checks to handle edge of hexes
            if (dx >= -size && dx < (8 * horizDist) && 
                dy >= -hexHeight/2 && dy < (10 * hexHeight)) {
                detectedSubsector = sub;
                break;
            }
        }
    }
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

  function handleDeleteSubsector() {
      if (!detectedSubsector || !starmap.travellerMetadata) return;
      
      const subId = detectedSubsector.id;
      const subName = detectedSubsector.name;
      
      if (confirm(`Delete entire subsector ${subName} and all its systems?`)) {
          const newSystems = starmap.systems.filter(s => s.subsectorId !== subId);
          const newImported = starmap.travellerMetadata.importedSubsectors.filter(s => s.id !== subId);
          
          const newStarmap = {
              ...starmap,
              systems: newSystems,
              travellerMetadata: {
                  ...starmap.travellerMetadata,
                  importedSubsectors: newImported
              }
          };
          
          dispatch('updatestarmap', newStarmap);
      }
      closeContextMenu();
  }

  function handleContextMenuTravellerImport() {
      // Snap to nearest hex center if in hex mode
      if ($starmapUiStore.gridType === 'hex' || $starmapUiStore.gridType === 'traveller-hex') {
          // Re-calculate closest center using the logic from handleMapContextMenu
          // We can't reuse local vars from that function, so we must recalc or store the snapped coord.
          // contextMenuClickCoords is currently set to the snapped center in handleMapContextMenu!
          // Let's verify...
          // Yes: "contextMenuClickCoords = { x: clickX, y: clickY };" where clickX/Y are updated to closestCenter.
          // So it is already snapped?
          // Let's double check handleMapContextMenu logic.
          
          /* 
             In handleMapContextMenu:
             ...
             clickX = closestCenter.x;
             clickY = closestCenter.y;
             ...
             contextMenuClickCoords = { x: clickX, y: clickY };
          */
          
          // It seems it IS already snapped. 
          // However, the user mentioned "snapping to the centre and stra alignment".
          // If I already snapped it, maybe the issue is that "Import Here" usually implies "This Hex becomes 0101".
          // If the click was on 0202, we want 0101 to be at (0202_x - delta_x, 0202_y - delta_y).
          // But the importer currently takes (originX, originY) and places 0101 AT that location.
          // So if I click 0202, the importer puts "Cronor 0101" at 0202. 
          // That is correct behavior for "Import Here" (Start the subsector at this hex).
          
          travellerImportCoords = { ...contextMenuClickCoords };
      } else {
          travellerImportCoords = { ...contextMenuClickCoords };
      }
      
      showImportModal = true;
      closeContextMenu();
  }

  function handleTravellerImport(event: CustomEvent<any>) {
      const { sector, subsectorCode, rawData } = event.detail;
      const importer = new TravellerImporter();
      
      const { systems, metadata } = importer.processSubsectorData(
          sector,
          subsectorCode,
          rawData,
          travellerImportCoords.x,
          travellerImportCoords.y,
          gridSize,
          rulePack
      );

      const newMetadata = starmap.travellerMetadata || { importedSubsectors: [] };
      if (metadata) {
          newMetadata.importedSubsectors.push(metadata);
      }

      const newStarmap = {
          ...starmap,
          systems: [...starmap.systems, ...systems],
          travellerMetadata: newMetadata
      };

      dispatch('updatestarmap', newStarmap);
      showImportModal = false;
  }

  function handleContextMenuAddTravellerSystem() {
      // Use the same coordinates logic as Import
      travellerImportCoords = { ...contextMenuClickCoords };
      showAddTravellerModal = true;
      closeContextMenu();
  }

  function handleAddTravellerSystem(event: CustomEvent<any>) {
      const data = event.detail;
      const importer = new TravellerImporter();
      
      // Generate System using the new public method
      const system = importer.generateTravellerSystem(data, rulePack);
      
      const newSystemNode = {
          id: system.id,
          name: data.name,
          position: { x: travellerImportCoords.x, y: travellerImportCoords.y },
          system: system,
          subsectorId: 'manual-add' // Optional marker
      };

      const newStarmap = {
          ...starmap,
          systems: [...starmap.systems, newSystemNode]
      };

      dispatch('updatestarmap', newStarmap);
      showAddTravellerModal = false;
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
          <option value="traveller-hex">Traveller Hex</option>
        </select>
      </label>
      <button on:click={resetView}>Reset View</button>
      
      <div class="dropdown">
          <button on:click={() => showDropdown = !showDropdown} class="hamburger-button">&#9776;</button>
          {#if showDropdown}
              <div class="dropdown-content">
                  <button on:click={() => showSaveModal = true}>Download Starmap</button>
                  <button on:click={() => dispatch('upload')}>Upload Starmap</button>
                  <hr />
                  <button on:click={() => dispatch('clear')} class="danger">Clear Starmap</button>
                  <hr />
                  <button on:click={() => showFuelModal = true}>Edit Fuel & Drives</button>
                  <button on:click={() => showSensorsModal = true}>Edit Sensors</button>
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
    on:wheel|preventDefault={handleWheel}
    role="button"
    tabindex="0"
    style="touch-action: none;"
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
        originX={0} 
        originY={0} 
        travellerMetadata={starmap.travellerMetadata}
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
        {@const visualNodes = getVisualNodes(systemNode.system)}
        <g
          role="button"
          tabindex="0"
          on:click={(e) => handleStarClick(e, systemNode.id)}
          on:dblclick={() => handleStarDblClick(systemNode.id)}
          on:contextmenu={(e) => handleStarContextMenu(e, systemNode.id)}
          on:keydown={(e) => { if (e.key === 'Enter' || e.key === ' ') handleStarClick(e, systemNode.id); }}
        >
          {#if visualNodes.length === 0}
              <!-- Fallback for empty/invalid system -->
              <circle cx={systemNode.position.x} cy={systemNode.position.y} r={3} fill="#555" />
          {:else if visualNodes.length === 1}
              <circle
                cx={systemNode.position.x}
                cy={systemNode.position.y}
                r={5}
                style="fill: {getStarColor(visualNodes[0])};"
                class="star"
                class:selected={systemNode.id === selectedSystemForLink}
                class:bh-active={getBlackHoleType(visualNodes[0]) === 'BH_active'}
                class:bh-quiescent={getBlackHoleType(visualNodes[0]) === 'BH'}
              />
          {:else if visualNodes.length === 2}
              <circle
                cx={systemNode.position.x - 5}
                cy={systemNode.position.y}
                r={5}
                style="fill: {getStarColor(visualNodes[0])};"
                class="star"
                class:selected={systemNode.id === selectedSystemForLink}
                class:bh-active={getBlackHoleType(visualNodes[0]) === 'BH_active'}
                class:bh-quiescent={getBlackHoleType(visualNodes[0]) === 'BH'}
              />
              <circle
                cx={systemNode.position.x + 5}
                cy={systemNode.position.y}
                r={5}
                style="fill: {getStarColor(visualNodes[1])};"
                class="star"
                class:selected={systemNode.id === selectedSystemForLink}
                class:bh-active={getBlackHoleType(visualNodes[1]) === 'BH_active'}
                class:bh-quiescent={getBlackHoleType(visualNodes[1]) === 'BH'}
              />
          {:else}
              <!-- 3 or more stars: Pyramid layout (Primary Top, others below) -->
              <!-- Primary (Top Center) -->
              <circle
                cx={systemNode.position.x}
                cy={systemNode.position.y - 6}
                r={5}
                style="fill: {getStarColor(visualNodes[0])};"
                class="star"
                class:selected={systemNode.id === selectedSystemForLink}
                class:bh-active={getBlackHoleType(visualNodes[0]) === 'BH_active'}
                class:bh-quiescent={getBlackHoleType(visualNodes[0]) === 'BH'}
              />
              <!-- Second (Bottom Left) -->
              <circle
                cx={systemNode.position.x - 6}
                cy={systemNode.position.y + 5}
                r={5}
                style="fill: {getStarColor(visualNodes[1])};"
                class="star"
                class:selected={systemNode.id === selectedSystemForLink}
                class:bh-active={getBlackHoleType(visualNodes[1]) === 'BH_active'}
                class:bh-quiescent={getBlackHoleType(visualNodes[1]) === 'BH'}
              />
              <!-- Third (Bottom Right) -->
              <circle
                cx={systemNode.position.x + 6}
                cy={systemNode.position.y + 5}
                r={5}
                style="fill: {getStarColor(visualNodes[2])};"
                class="star"
                class:selected={systemNode.id === selectedSystemForLink}
                class:bh-active={getBlackHoleType(visualNodes[2]) === 'BH_active'}
                class:bh-quiescent={getBlackHoleType(visualNodes[2]) === 'BH'}
              />
          {:else if visualNodes.length === 3}
              <!-- 3 Stars: Pyramid layout (Primary Top, others below) -->
              <!-- Primary (Top Center) -->
              <circle
                cx={systemNode.position.x}
                cy={systemNode.position.y - 6}
                r={5}
                style="fill: {getStarColor(visualNodes[0])};"
                class="star"
                class:selected={systemNode.id === selectedSystemForLink}
                class:bh-active={getBlackHoleType(visualNodes[0]) === 'BH_active'}
                class:bh-quiescent={getBlackHoleType(visualNodes[0]) === 'BH'}
              />
              <!-- Second (Bottom Left) -->
              <circle
                cx={systemNode.position.x - 6}
                cy={systemNode.position.y + 5}
                r={5}
                style="fill: {getStarColor(visualNodes[1])};"
                class="star"
                class:selected={systemNode.id === selectedSystemForLink}
                class:bh-active={getBlackHoleType(visualNodes[1]) === 'BH_active'}
                class:bh-quiescent={getBlackHoleType(visualNodes[1]) === 'BH'}
              />
              <!-- Third (Bottom Right) -->
              <circle
                cx={systemNode.position.x + 6}
                cy={systemNode.position.y + 5}
                r={5}
                style="fill: {getStarColor(visualNodes[2])};"
                class="star"
                class:selected={systemNode.id === selectedSystemForLink}
                class:bh-active={getBlackHoleType(visualNodes[2]) === 'BH_active'}
                class:bh-quiescent={getBlackHoleType(visualNodes[2]) === 'BH'}
              />
          {:else}
              <!-- 4+ Stars: Diamond Layout -->
              <!-- Primary (Top) -->
              <circle
                cx={systemNode.position.x}
                cy={systemNode.position.y - 6}
                r={5}
                style="fill: {getStarColor(visualNodes[0])};"
                class="star"
                class:selected={systemNode.id === selectedSystemForLink}
                class:bh-active={getBlackHoleType(visualNodes[0]) === 'BH_active'}
                class:bh-quiescent={getBlackHoleType(visualNodes[0]) === 'BH'}
              />
              <!-- Second (Bottom) -->
              <circle
                cx={systemNode.position.x}
                cy={systemNode.position.y + 6}
                r={5}
                style="fill: {getStarColor(visualNodes[1])};"
                class="star"
                class:selected={systemNode.id === selectedSystemForLink}
                class:bh-active={getBlackHoleType(visualNodes[1]) === 'BH_active'}
                class:bh-quiescent={getBlackHoleType(visualNodes[1]) === 'BH'}
              />
              <!-- Third (Left) -->
              <circle
                cx={systemNode.position.x - 7}
                cy={systemNode.position.y}
                r={5}
                style="fill: {getStarColor(visualNodes[2])};"
                class="star"
                class:selected={systemNode.id === selectedSystemForLink}
                class:bh-active={getBlackHoleType(visualNodes[2]) === 'BH_active'}
                class:bh-quiescent={getBlackHoleType(visualNodes[2]) === 'BH'}
              />
              <!-- Fourth (Right) -->
              <circle
                cx={systemNode.position.x + 7}
                cy={systemNode.position.y}
                r={5}
                style="fill: {getStarColor(visualNodes[3])};"
                class="star"
                class:selected={systemNode.id === selectedSystemForLink}
                class:bh-active={getBlackHoleType(visualNodes[3]) === 'BH_active'}
                class:bh-quiescent={getBlackHoleType(visualNodes[3]) === 'BH'}
              />
              {#if visualNodes.length > 4}
                  <text
                    x={systemNode.position.x}
                    y={systemNode.position.y + 15}
                    class="plus-indicator"
                    text-anchor="middle"
                  >+</text>
              {/if}
          {/if}
        </g>
        <text
          x={systemNode.position.x + 15}
          y={systemNode.position.y + 5}
          class="star-label"
        >
          {systemNode.name}
        </text>
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
                    {#if $starmapUiStore.gridType === 'traveller-hex'}
                        <li on:click={handleContextMenuAddTravellerSystem}>Add Traveller UWP Here</li>
                        <li on:click={handleContextMenuTravellerImport}>Add Traveller Map SubSector Here</li>
                        {#if detectedSubsector}
                            <li on:click={handleDeleteSubsector} class="danger">
                                Delete {detectedSubsector.sectorName ? detectedSubsector.sectorName + ' ' : ''}Subsector {detectedSubsector.subsectorCode}{detectedSubsector.name !== 'Subsector ' + detectedSubsector.subsectorCode ? ' (' + detectedSubsector.name + ')' : ''}
                            </li>
                        {/if}
                    {/if}
                  {/if}
                </ul>
              </div>
          {/if}
            {#if showAboutModal}
      <MarkdownModal htmlContent={aboutContent} on:close={() => showAboutModal = false} />
  {/if}

  {#if showSaveModal}
      <SaveSystemModal on:save={handleSaveStarmap} on:close={() => showSaveModal = false} />
  {/if}
  
  {#if showImportModal}
      <ImportTravellerModal 
          showModal={showImportModal} 
          on:import={handleTravellerImport} 
          on:close={() => showImportModal = false} 
      />
  {/if}

  {#if showAddTravellerModal}
      <AddTravellerSystemModal 
          showModal={showAddTravellerModal} 
          on:generate={handleAddTravellerSystem} 
          on:close={() => showAddTravellerModal = false} 
      />
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

  {#if showSensorsModal}
      <EditSensorsModal
          showModal={showSensorsModal}
          {rulePack}
          {starmap}
          on:save={handleSaveSensorOverrides}
          on:close={() => showSensorsModal = false}
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

  .star.bh-active {
    stroke: #ffaa00;
    stroke-width: 2px;
  }

  .star.bh-quiescent {
    stroke: #444444;
    stroke-width: 1px;
  }

  .star-label {
    fill: #fff;
    font-size: 12px;
    paint-order: stroke;
    stroke: #000;
    stroke-width: 2px;
  }

  .plus-indicator {
    fill: #fff;
    font-size: 14px;
    font-weight: bold;
    pointer-events: none;
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
