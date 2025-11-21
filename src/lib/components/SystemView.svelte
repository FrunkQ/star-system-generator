<script lang="ts">
  import { onMount, onDestroy, createEventDispatcher, tick } from 'svelte';
  import { browser } from '$app/environment';
  import type { RulePack, System, CelestialBody } from '$lib/types';
  import { deleteNode, addPlanetaryBody, renameNode, addHabitablePlanet, generateSystem, computePlayerSnapshot } from '$lib/api';
  import SystemVisualizer from '$lib/components/SystemVisualizer.svelte';
  import SystemSummary from './SystemSummary.svelte';
  import SystemGenerationControls from './SystemGenerationControls.svelte';
  import SystemSummaryContextMenu from './SystemSummaryContextMenu.svelte'; 
  import BodyTechnicalDetails from './BodyTechnicalDetails.svelte';
  import BodyImage from './BodyImage.svelte';
  import BodyGmTools from './BodyGmTools.svelte';
  import DescriptionEditor from './DescriptionEditor.svelte';
  import GmNotesEditor from './GmNotesEditor.svelte';
  import ZoneKey from './ZoneKey.svelte';
  import ContextMenu from './ContextMenu.svelte'; 
  import AddConstructModal from './AddConstructModal.svelte'; 
  import ConstructEditorModal from './ConstructEditorModal.svelte'; 
  import ConstructDerivedSpecs from './ConstructDerivedSpecs.svelte';
  import LoadConstructTemplateModal from './LoadConstructTemplateModal.svelte';

  import { systemStore, viewportStore } from '$lib/stores';
  import { panStore, zoomStore } from '$lib/cameraStore';
  import { get } from 'svelte/store';
  import { processSystemData } from '$lib/system/postprocessing';
  import { generateId } from '$lib/utils';
  import { AU_KM } from '$lib/constants';
  import { propagate } from '$lib/api';
  import { broadcastService } from '$lib/broadcast';
  import { sanitizeSystem } from '$lib/system/utils';

  export let system: System;
  export let rulePack: RulePack;
  export let exampleSystems: string[];

  const dispatch = createEventDispatcher();

  const generatedSystem = systemStore;
  let visualizer: SystemVisualizer;
  let shareStatus = '';
  let showJson = false;
  let generationOptions: string[] = ['Random'];
  let selectedGenerationOption = 'Random';
  let showDropdown = false;
  let showNames = true;
  let showZones = false;
  let showZoneKeyPanel = false; // Controls display of ZoneKey in the right panel
  let showLPoints = false;
  let throttleTimeout: ReturnType<typeof setTimeout> | null = null;
  let lastToytownFactor: number | undefined = undefined;
  let timeSyncInterval: ReturnType<typeof setInterval> | undefined;
  let cameraMode: 'FOLLOW' | 'MANUAL' = 'FOLLOW';

  // Context Menu State
  let showSummaryContextMenu = false;
  let contextMenuX = 0;
  let contextMenuY = 0;
  let contextMenuItems: CelestialBody[] = [];
  let contextMenuType = '';
  let contextMenuNode: CelestialBody | Barycenter | null = null; 

  // Add Construct Modal State
  let showAddConstructModal = false;
  let constructHostBody: CelestialBody | null = null;

  // Create Construct (Background) Modal State
  let showCreateConstructModal = false;
  let backgroundClickHost: CelestialBody | Barycenter | null = null;
  let backgroundClickPosition: { x: number, y: number } | null = null;
  let showBackgroundContextMenu = false;

  // Edit Construct Modal State
  let showConstructEditorModal = false;
  let constructToEdit: CelestialBody | null = null;
  let constructHostBodyForEditor: CelestialBody | null = null;

  // Route Creation State
  let isLinking: boolean = false;
  let linkStartNode: CelestialBody | Barycenter | null = null;

  // Broadcast View Settings
  $: if (browser) {
      broadcastService.sendMessage({ 
          type: 'SYNC_VIEW_SETTINGS', 
          payload: { showNames, showZones, showLPoints } 
      });
  }

  // Broadcast System Updates
  $: if (browser && $systemStore) {
      const snapshot = computePlayerSnapshot($systemStore);
      broadcastService.sendMessage({ type: 'SYNC_SYSTEM', payload: snapshot });
  }

  // Broadcast Focus Updates
  $: if (browser && focusedBodyId) {
      broadcastService.sendMessage({ type: 'SYNC_FOCUS', payload: focusedBodyId });
  }

  function handleShowContextMenu(event: CustomEvent<{ x: number, y: number, items: any[], type: string }>) {
    contextMenuItems = event.detail.items;
    contextMenuX = event.detail.x;
    contextMenuY = event.detail.y;
    contextMenuType = event.detail.type;
    showSummaryContextMenu = true;
  }

  function handleLinkStartOrFinish(event: CustomEvent<CelestialBody | Barycenter>) {
    const clickedNode = event.detail;
    showSummaryContextMenu = false;

    if (!isLinking) {
      // Start a new link
      isLinking = true;
      linkStartNode = clickedNode;
      // Future: Update cursor or provide visual feedback that linking is active
      alert(`Linking started from ${linkStartNode.name}. Click another system to finish.`);
    } else if (linkStartNode && clickedNode.id === linkStartNode.id) {
      // Clicked the same node again, cancel linking
      isLinking = false;
      linkStartNode = null;
      alert('Linking cancelled.');
    } else if (linkStartNode && clickedNode.id !== linkStartNode.id) {
      // Finish the link
      // TODO: Implement actual route creation logic here
      alert(`Link created from ${linkStartNode.name} to ${clickedNode.name}!`);
      isLinking = false;
      linkStartNode = null;
    }
  }

  function handleShowBodyContextMenu(event: CustomEvent<{ node: CelestialBody, x: number, y: number }>) {
    contextMenuNode = event.detail.node;
    contextMenuX = event.detail.x;
    contextMenuY = event.detail.y;
    showSummaryContextMenu = true; 
    contextMenuType = 'generic';
    showBackgroundContextMenu = false;
  }

  function handleBackgroundContextMenu(event: CustomEvent<{ x: number, y: number, dominantBody: CelestialBody | Barycenter | null, screenX: number, screenY: number }>) {
      console.log('Background Context Menu Triggered:', event.detail);
      backgroundClickHost = event.detail.dominantBody;
      backgroundClickPosition = { x: event.detail.x, y: event.detail.y };
      contextMenuX = event.detail.screenX;
      contextMenuY = event.detail.screenY;
      showBackgroundContextMenu = true;
      showSummaryContextMenu = false;
  }

  function handleCreateConstructFromBackground() {
      showCreateConstructModal = true;
      showBackgroundContextMenu = false;
  }

  async function handleCreateConstructLoad(event: CustomEvent<CelestialBody>) {
      console.log('handleCreateConstructLoad triggered', { backgroundClickHost, backgroundClickPosition, constructHostBody });

      // Determine context: Background click OR Direct "Add Construct" on body
      const host = backgroundClickHost || constructHostBody;

      if (!$systemStore || !host) {
        console.error('Missing required state for construct creation', { systemStore: !!$systemStore, host });
        return;
      }
      const template = event.detail;
      
      // Prepare new construct
      const newConstruct: CelestialBody = JSON.parse(JSON.stringify(template));
      newConstruct.id = generateId();
      newConstruct.IsTemplate = false;
      newConstruct.parentId = host.id;
      newConstruct.ui_parentId = null;

      let distAU = 0;
      let startAngle = 0;

      if (backgroundClickPosition && backgroundClickHost) {
          // Case 1: Add Construct Here (Background Click)
          // 1. Get Host Position
          let hostPos = { x: 0, y: 0 };
          if (host.parentId) {
             const getAbsolutePosition = (nodeId: string): { x: number, y: number } => {
                 const node = $systemStore.nodes.find(n => n.id === nodeId);
                 if (!node || !node.parentId) return { x: 0, y: 0 }; // Star/Root is 0,0
                 
                 const parentPos = getAbsolutePosition(node.parentId);
                 let relativePos = { x: 0, y: 0 };
                 if ((node.kind === 'body' || node.kind === 'construct') && node.orbit) {
                     const p = propagate(node, currentTime);
                     if (p) relativePos = p;
                 }
                 return { x: parentPos.x + relativePos.x, y: parentPos.y + relativePos.y };
             };
             hostPos = getAbsolutePosition(host.id);
          }

          // 2. Calculate Distance
          const dx = backgroundClickPosition.x - hostPos.x;
          const dy = backgroundClickPosition.y - hostPos.y;
          distAU = Math.sqrt(dx*dx + dy*dy);
          startAngle = Math.atan2(dy, dx);
      } else {
          // Case 2: Add Construct (Direct on Planet) - Default Orbit
          const minKm = host.orbitalBoundaries?.minLeoKm || (host.radiusKm ? (host.radiusKm + 500) : 6000); // Minimum LEO or a default
          const maxKm = host.orbitalBoundaries?.heoUpperBoundaryKm || (host.radiusKm ? (host.radiusKm + 100000) : 100000); // Upper HEO or a default large value
          const middleKm = (minKm + maxKm) / 2;
          distAU = middleKm / AU_KM;
          startAngle = Math.random() * 2 * Math.PI;
      }

      // 3. Create Circular Orbit
      const massKg = (host as CelestialBody).massKg || (host as Barycenter).effectiveMassKg || 0;
      const G_constant = 6.67430e-11;
      
      newConstruct.orbit = {
          hostId: host.id,
          hostMu: massKg * G_constant,
          t0: currentTime,
          elements: {
              a_AU: Math.max(distAU, 0.000001),
              e: 0,
              i_deg: 0,
              omega_deg: 0,
              Omega_deg: 0,
              M0_rad: startAngle
          }
      };

      // 4. Determine Placement String
      let placement = 'High Orbit'; // Default fallback
      const altitudeKm = (distAU * AU_KM) - ((host as CelestialBody).radiusKm || 0);

      if (host.roleHint === 'star') {
          // Star Logic: Inner System, Outer System, or Planet-Planet
          const planets = $systemStore.nodes
              .filter(n => n.parentId === host.id && n.kind === 'body' && n.orbit)
              .sort((a, b) => (a.orbit?.elements.a_AU || 0) - (b.orbit?.elements.a_AU || 0));
          
          if (planets.length === 0) {
              placement = 'AU Distance';
          } else if (distAU < (planets[0].orbit?.elements.a_AU || 0)) {
              placement = 'Inner System';
          } else if (distAU > (planets[planets.length - 1].orbit?.elements.a_AU || 0)) {
              placement = 'Outer System';
          } else {
              for (let i = 0; i < planets.length - 1; i++) {
                  const p1Dist = planets[i].orbit?.elements.a_AU || 0;
                  const p2Dist = planets[i+1].orbit?.elements.a_AU || 0;
                  if (distAU >= p1Dist && distAU <= p2Dist) {
                      placement = `${planets[i].name} - ${planets[i+1].name}`;
                      break;
                  }
              }
          }
      } else {
          // Planet/Moon Logic
          const boundaries = (host as CelestialBody).orbitalBoundaries;
          if (boundaries) {
              // Robust checks for placement
              if (altitudeKm <= (boundaries.minLeoKm || 100)) placement = 'Low Orbit';
              else if (altitudeKm <= boundaries.leoMoeBoundaryKm) placement = 'Low Orbit';
              else if (altitudeKm <= boundaries.meoHeoBoundaryKm) placement = 'Medium Orbit';
              else if (boundaries.geosynchronousOrbit && boundaries.geoStationaryKm && Math.abs(altitudeKm - boundaries.geoStationaryKm) < 1000) placement = 'Geosynchronous Orbit';
              else placement = 'High Orbit';
          }
      }

      newConstruct.placement = placement;
      console.log('Creating New Construct:', newConstruct);

      // Add to System
      systemStore.update(s => {
          if (!s) return s;
          return {
              ...s,
              nodes: [...s.nodes, newConstruct],
              isManuallyEdited: true
          };
      });

      // Open Editor
      showCreateConstructModal = false;
      await tick();
      constructToEdit = newConstruct;
      constructHostBodyForEditor = backgroundClickHost as CelestialBody;
      showConstructEditorModal = true;
      console.log('Editor should be open');
      handleFocus({ detail: newConstruct.id } as CustomEvent<string | null>);
  }

  function handleAddConstruct(event: CustomEvent<CelestialBody>) {
    constructHostBody = event.detail;
    showCreateConstructModal = true;
    showSummaryContextMenu = false;
  }

  async function handleAddConstructCreated(event: CustomEvent<CelestialBody>) {
      const newConstruct = event.detail;
      showAddConstructModal = false;
      
      // Find the host body for the editor context
      let hostBodyForEditor: CelestialBody | null = null;
      if ($systemStore) {
        const hostId = newConstruct.ui_parentId || newConstruct.parentId;
        if (hostId) {
           hostBodyForEditor = $systemStore.nodes.find(n => n.id === hostId) as CelestialBody || null;
        }
      }

      await tick(); // Ensure store update is processed/rendered
      constructToEdit = newConstruct;
      constructHostBodyForEditor = hostBodyForEditor;
      showConstructEditorModal = true;
      handleFocus({ detail: newConstruct.id } as CustomEvent<string | null>);
  }

  function handleEditConstruct(event: CustomEvent<CelestialBody>) {
    constructToEdit = event.detail;
    if ($systemStore) {
      const hostId = constructToEdit.ui_parentId || constructToEdit.parentId;
      if (hostId) {
        constructHostBodyForEditor = $systemStore.nodes.find(n => n.id === hostId) as CelestialBody;
      } else {
        constructHostBodyForEditor = null;
      }
    } else {
      constructHostBodyForEditor = null;
    }
    showConstructEditorModal = true;
  }

  function handleConstructUpdate(event: CustomEvent<CelestialBody>) {
    const updatedConstruct = event.detail;
    systemStore.update(system => {
      if (!system) return null;
      const nodeIndex = system.nodes.findIndex(n => n.id === updatedConstruct.id);
      if (nodeIndex !== -1) {
        system.nodes[nodeIndex] = updatedConstruct;
      }
      return { ...system, isManuallyEdited: true };
    });
  }

  function handleBodyUpdate(event: CustomEvent<CelestialBody>) {
    const updatedBody = event.detail;
    systemStore.update(system => {
      if (!system) return null;
      const nodeIndex = system.nodes.findIndex(n => n.id === updatedBody.id);
      if (nodeIndex !== -1) {
        system.nodes[nodeIndex] = updatedBody;
      }
      return { ...system, isManuallyEdited: true };
    });
  }

  function handleContextMenuSelect(event: CustomEvent<string>) {
    showSummaryContextMenu = false;
    handleFocus({ detail: event.detail } as CustomEvent<string | null>);
  }

  $: if ($systemStore && typeof $systemStore.toytownFactor === 'undefined') {
    $systemStore.toytownFactor = 0;
  }

  $: if ($systemStore && $systemStore.toytownFactor !== lastToytownFactor) {
    lastToytownFactor = $systemStore.toytownFactor;
    if (!throttleTimeout) {
      throttleTimeout = setTimeout(() => {
        visualizer?.resetView();
        throttleTimeout = null;
      }, 250);
    }
  }

  let currentTime = Date.now();
  let isPlaying = false;
  let timeScale = 3600 * 24 * 30;
  let animationFrameId: number;

  let focusedBodyId: string | null = null;
  let focusedBody: CelestialBody | null = null;

  $: if ($systemStore) {
    if (focusedBodyId) {
        const foundBody = $systemStore.nodes.find(n => n.id === focusedBodyId);
        focusedBody = foundBody ? JSON.parse(JSON.stringify(foundBody)) as CelestialBody : null;
    } else {
        const foundBody = $systemStore.nodes.find(n => n.parentId === null);
        focusedBody = foundBody ? JSON.parse(JSON.stringify(foundBody)) as CelestialBody : null;
    }
  }

  function handleSliderRelease() {
    if (throttleTimeout) {
      clearTimeout(throttleTimeout);
      throttleTimeout = null;
    }
    visualizer?.resetView();
  }

  function play() {
    if (!browser) return;
    isPlaying = true;
    let lastTimestamp: number | null = null;

    function tick(timestamp: number) {
      if (lastTimestamp) {
        const delta = (timestamp - lastTimestamp) / 1000;
        currentTime += delta * timeScale * 1000;
      }
      lastTimestamp = timestamp;
      if (isPlaying) {
        animationFrameId = requestAnimationFrame(tick);
      }
    }
    animationFrameId = requestAnimationFrame(tick);
  }

  function pause() {
    if (!browser) return;
    isPlaying = false;
    cancelAnimationFrame(animationFrameId);
  }

  async function handleGenerate(empty: boolean = false) {
    const seed = `seed-${Date.now()}`;
    const newSystem = generateSystem(seed, rulePack, {}, selectedGenerationOption, empty, $systemStore?.toytownFactor || 0);
    systemStore.set(newSystem);
    currentTime = newSystem.epochT0;
    focusedBodyId = null;
  }

  function handleFocus(event: CustomEvent<string | null>) {
    focusedBodyId = event.detail;
    showZoneKeyPanel = false; // Hide the ZoneKey panel when focus changes
    history.pushState({ focusedBodyId }, '');
  }

  function handlePopState(event: PopStateEvent) {
    if (focusedBody?.parentId) {
        focusedBodyId = focusedBody.parentId;
    } else {
        dispatch('back');
    }
  }

  function zoomOut() {
    history.back();
  }

  function handleDeleteNode(event: CustomEvent<string>) {
    if (!$systemStore) return;
    const nodeId = event.detail;
    const nodeToDelete = $systemStore.nodes.find(n => n.id === nodeId);

    let nextFocusId: string | null = null;
    if (focusedBodyId === nodeId) {
        if (nodeToDelete?.parentId) {
            nextFocusId = nodeToDelete.parentId;
        } else {
            dispatch('back'); 
            systemStore.set(processSystemData(deleteNode($systemStore, nodeId), rulePack));
            return; 
        }
    }

    systemStore.set({ ...processSystemData(deleteNode($systemStore, nodeId), rulePack), isManuallyEdited: true });

    if (nextFocusId) {
        handleFocus({ detail: nextFocusId } as CustomEvent<string | null>);
    }
  }

  function handleAddNode(event: CustomEvent<{hostId: string, planetType: string}>) {
      if (!$systemStore) return;
      const { hostId, planetType } = event.detail;
      try {
        const oldNodes = $systemStore.nodes; // Capture state before update
        const newSys = addPlanetaryBody($systemStore, hostId, planetType, rulePack);
        systemStore.set({ ...processSystemData(newSys, rulePack), isManuallyEdited: true });
        if (visualizer) {
          visualizer.resetView();
        }
        // Find the new planet by comparing node lists
        const newPlanet = newSys.nodes.find(node => !oldNodes.some(oldNode => oldNode.id === node.id));
        if (newPlanet) {
            handleFocus({ detail: newPlanet.id } as CustomEvent<string | null>);
        }
      } catch (e: any) {
        alert(e.message);
      }
  }

  function handleAddHabitablePlanet(event: CustomEvent<{hostId: string, habitabilityType: 'earth-like' | 'human-habitable' | 'alien-habitable'}>) {
      if (!$systemStore) return;
      const { hostId, habitabilityType } = event.detail;
      try {
        const oldNodes = $systemStore.nodes; // Capture state before update
        const newSys = addHabitablePlanet($systemStore, hostId, habitabilityType, rulePack);
        systemStore.set({ ...processSystemData(newSys, rulePack), isManuallyEdited: true });
        // Find the new planet by comparing node lists
        const newPlanet = newSys.nodes.find(node => !oldNodes.some(oldNode => oldNode.id === node.id));
        if (newPlanet) {
            handleFocus({ detail: newPlanet.id } as CustomEvent<string | null>);
        }
      } catch (e: any) {
        alert(e.message);
      }
  }

  async function handleLoadExample(event: CustomEvent<string>) {
    const fileName = event.detail;
    if (!fileName) return;

    try {
      const response = await fetch(`/examples/${fileName}`);
      if (!response.ok) {
        throw new Error(`Failed to fetch ${fileName}`);
      }
      let newSystem = await response.json();
      if (newSystem.id && newSystem.name && Array.isArray(newSystem.nodes) && newSystem.rulePackId) {
        systemStore.set(processSystemData(newSystem, rulePack));
        currentTime = newSystem?.epochT0 || Date.now();
        focusedBodyId = null;
      } else {
        alert('Invalid system file. Missing system-specific properties.');
      }
    } catch (err) {
      alert('Failed to parse JSON file.');
      console.error(err);
    }
  }


  function handleDownloadJson() {
    if (!$systemStore) return;
    const json = JSON.stringify($systemStore, null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${$systemStore.name.replace(/\s+/g, '_') || 'system'}-System.json`;
    document.body.appendChild(a);
a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  function handleUploadJson(event: Event) {
    const input = event.target as HTMLInputElement;
    if (!input.files || input.files.length === 0) return;
    const file = input.files[0];
    const reader = new FileReader();
    reader.onload = async (e) => {
      try {
        const json = e.target?.result as string;
        let newSystem = JSON.parse(json);
        if (newSystem.id && newSystem.name && Array.isArray(newSystem.nodes) && newSystem.rulePackId) {
          systemStore.set(processSystemData(newSystem, rulePack));
          currentTime = newSystem?.epochT0 || Date.now();
          focusedBodyId = null;
        } else {
          alert('Invalid system file. Missing system-specific properties.');
        }
      } catch (err) {
        alert('Failed to parse JSON file.');
        console.error(err);
      }
    };
    reader.readAsText(file);
  }

  async function handleShare() {
      window.open('/projector', 'StarSystemProjector', 'width=1280,height=720,menubar=no,toolbar=no,location=no');
      if ($systemStore) {
          broadcastService.sendMessage({ type: 'SYNC_SYSTEM', payload: computePlayerSnapshot($systemStore) });
      }
  }

  let unsubscribePanStore: () => void;
  let unsubscribeZoomStore: () => void;

  onMount(() => {
    systemStore.set(processSystemData(system, rulePack));
    currentTime = system.epochT0;
    const starTypes = rulePack.distributions['star_types'].entries.map(st => st.value);
    const options: string[] = ['Random'];
    starTypes.forEach(st => {
      const typeName = st.replace('star/', '');
      options.push(`Type ${typeName}`);
      options.push(`Type ${typeName} Binary`);
    });
    generationOptions = options;

    const currentViewport = get(viewportStore);
    panStore.set(currentViewport.pan, { duration: 0 });
    zoomStore.set(currentViewport.zoom, { duration: 0 });

    if (browser) {
        broadcastService.initSender();
        broadcastService.onRequestSync = () => {
            if (get(systemStore)) {
                const snapshot = computePlayerSnapshot(get(systemStore)!);
                broadcastService.sendMessage({ type: 'SYNC_SYSTEM', payload: snapshot });
                broadcastService.sendMessage({ type: 'SYNC_FOCUS', payload: focusedBodyId });
                broadcastService.sendMessage({ type: 'SYNC_CAMERA', payload: { pan: get(panStore), zoom: get(zoomStore), isManual: cameraMode === 'MANUAL' } });
                broadcastService.sendMessage({ type: 'SYNC_VIEW_SETTINGS', payload: { showNames, showZones, showLPoints } });
                broadcastService.sendMessage({ type: 'SYNC_TIME', payload: { currentTime, isPlaying, timeScale } });
            }
        };

        timeSyncInterval = setInterval(() => {
             broadcastService.sendMessage({ 
                 type: 'SYNC_TIME', 
                 payload: { currentTime, isPlaying, timeScale } 
             });
        }, 1000);
    }

    unsubscribePanStore = panStore.subscribe(panState => {
        viewportStore.update(v => ({ ...v, pan: panState }));
        broadcastService.sendMessage({ type: 'SYNC_CAMERA', payload: { pan: panState, zoom: get(zoomStore), isManual: cameraMode === 'MANUAL' } });
    });
    unsubscribeZoomStore = zoomStore.subscribe(zoomState => {
        viewportStore.update(v => ({ ...v, zoom: zoomState }));
        broadcastService.sendMessage({ type: 'SYNC_CAMERA', payload: { pan: get(panStore), zoom: zoomState, isManual: cameraMode === 'MANUAL' } });
    });

    window.addEventListener('popstate', handlePopState);
    document.addEventListener('click', handleClickOutside);
  });

  onDestroy(() => {
    if (browser) {
      pause();
      if (timeSyncInterval) clearInterval(timeSyncInterval);
    }
    if (unsubscribePanStore) {
        unsubscribePanStore();
    }
    if (unsubscribeZoomStore) {
        unsubscribeZoomStore();
    }
    window.removeEventListener('popstate', handlePopState);
    document.removeEventListener('click', handleClickOutside);
  });

  function handleClickOutside(event: MouseEvent) {
    const menu = document.querySelector('.context-menu');
    if (menu && !menu.contains(event.target as Node)) {
      if (showSummaryContextMenu) showSummaryContextMenu = false;
      if (showBackgroundContextMenu) showBackgroundContextMenu = false;
    }
  }

  function closeContextMenuOnClickOutside(event: MouseEvent) {
    const contextMenu = document.querySelector('.context-menu');
    if (contextMenu && !contextMenu.contains(event.target as Node)) {
      showSummaryContextMenu = false;
    }
  }

</script>
<main>
    <div class="top-bar">
        
    </div>

  {#if $systemStore}
    <SystemSummary 
      system={$systemStore} 
      {focusedBody}
      bind:showDropdown
      {handleDownloadJson}
      {handleUploadJson}
      {handleShare}
      on:showcontextmenu={handleShowContextMenu}
      on:clearmanualedit={() => systemStore.update(s => s ? { ...s, isManuallyEdited: false } : s)}
    />

    {#if !$systemStore.isManuallyEdited}
      <SystemGenerationControls
        system={$systemStore}
        {generationOptions}
        bind:selectedGenerationOption={selectedGenerationOption}
        {exampleSystems}
        {handleGenerate}
        on:loadexample={handleLoadExample}
      />
    {/if}

    <div class="controls">
        {#if focusedBody}
            <button on:click={zoomOut}>Zoom Out</button>
        {/if}
        <button on:click={() => visualizer?.resetView()}>Reset View</button>
        <label>
            <input type="checkbox" bind:checked={showNames} />
            Toggle Names
        </label>
        <label>
            <input type="checkbox" bind:checked={showZones} on:change={() => showZoneKeyPanel = showZones} />
            Show Zones
        </label>
        <label>
            <input type="checkbox" bind:checked={showLPoints} />
            Show L-Points
        </label>
        <label>
            Toytown View:
            <input type="range" min="0" max="1" step="0.01" bind:value={$systemStore.toytownFactor} on:change={handleSliderRelease} />
        </label>
        <button on:click={() => isPlaying ? pause() : play()}>
            {isPlaying ? 'Pause' : 'Play'}
        </button>
        <div class="time-scales">
            <span>1s = </span>
            <button on:click={() => timeScale = 1} class:active={timeScale === 1}>1s</button>
            <button on:click={() => timeScale = 3600} class:active={timeScale === 3600}>1h</button>
            <button on:click={() => timeScale = 3600 * 24} class:active={timeScale === 3600 * 24}>1d</button>
            <button on:click={() => timeScale = 3600 * 24 * 30} class:active={timeScale === 3600 * 24 * 30}>30d</button>
            <button on:click={() => timeScale = 3600 * 24 * 90} class:active={timeScale === 3600 * 24 * 90}>90d</button>
            <button on:click={() => timeScale = 3600 * 24 * 365} class:active={timeScale === 3600 * 24 * 365}>1y</button>
            <button on:click={() => timeScale = 3600 * 24 * 365 * 10} class:active={timeScale === 3600 * 24 * 365 * 10}>10y</button>
        </div>
    </div>

    <div class="system-view-grid">
        <div class="main-view">
            <SystemVisualizer bind:this={visualizer} bind:cameraMode system={$systemStore} {rulePack} {currentTime} {focusedBodyId} {showNames} {showZones} {showLPoints} toytownFactor={$systemStore.toytownFactor} on:focus={handleFocus} on:showBodyContextMenu={handleShowBodyContextMenu} on:backgroundContextMenu={handleBackgroundContextMenu} />

            <BodyGmTools body={focusedBody} on:deleteNode={handleDeleteNode} on:addNode={handleAddNode} on:addHabitablePlanet={handleAddHabitablePlanet} on:editConstruct={handleEditConstruct} />
            {#if focusedBody}
                <DescriptionEditor body={focusedBody} on:update={handleBodyUpdate} on:change={() => { systemStore.update(s => s ? { ...s, isManuallyEdited: true } : s); }} />
            {/if}
        </div>
        <div class="details-view">
            {#if focusedBody}
            <div class="name-row">
                <button class="visibility-btn" on:click={() => {
                    if (focusedBody && $systemStore) {
                        systemStore.update(sys => {
                            if (!sys) return null;
                            const updatedNodes = sys.nodes.map(n => 
                                n.id === focusedBody!.id 
                                    ? { ...n, object_playerhidden: !n.object_playerhidden }
                                    : n
                            );
                            return { ...sys, nodes: updatedNodes, isManuallyEdited: true };
                        });
                    }
                }} title={focusedBody.object_playerhidden ? "Hidden from Players" : "Visible to Players"}>
                    {#if focusedBody.object_playerhidden}
                        <!-- Eye Closed -->
                        <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#888" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/></svg>
                    {:else}
                        <!-- Eye Open -->
                        <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#eee" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
                    {/if}
                </button>
                <input type="text" value={focusedBody.name} on:change={(e) => {
                  dispatch('renameNode', {nodeId: focusedBody.id, newName: e.target.value});
                  systemStore.update(s => s ? { ...s, isManuallyEdited: true } : s);
                }} class="name-input" title="Click to rename" />
            </div>
            {/if}
            
            <div class="action-buttons">
                {#if focusedBody && focusedBody.kind === 'construct'}
                    <button class="edit-btn" on:click={() => handleEditConstruct({ detail: focusedBody })}>Edit Construct</button>
                {/if}
                {#if focusedBody.parentId}
                    <button class="delete-btn" on:click={() => {
                      if (confirm(`Are you sure you want to delete ${focusedBody.name} and all its children? This cannot be undone.`)) {
                        handleDeleteNode({ detail: focusedBody.id });
                      }
                    }}>Delete</button>
                {/if}
            </div>

            {#if showZoneKeyPanel}
                <ZoneKey />
            {:else}
                {#if focusedBody.kind !== 'construct'}
                    {@const parentBody = focusedBody.parentId ? $systemStore.nodes.find(n => n.id === (focusedBody.ui_parentId || focusedBody.parentId)) : null}
                    <BodyTechnicalDetails body={focusedBody} {rulePack} parentBody={parentBody} />
                {/if}

                {#if focusedBody && focusedBody.kind === 'construct'}
                  {@const parentBody = focusedBody.parentId ? $systemStore.nodes.find(n => n.id === (focusedBody.ui_parentId || focusedBody.parentId)) : null}
                  <ConstructDerivedSpecs construct={focusedBody} hostBody={parentBody} {rulePack} />
                {/if}
            {/if}
            
            <BodyImage body={focusedBody} />
            <GmNotesEditor body={focusedBody} on:change={() => { systemStore.update(s => s ? { ...s, isManuallyEdited: true } : s); }} />
        </div>

    </div>

    {#if showSummaryContextMenu}
      {#if contextMenuType === 'generic'}
        <ContextMenu 
          selectedNode={contextMenuNode} 
          x={contextMenuX} 
          y={contextMenuY} 
          on:addConstruct={handleAddConstruct}
          on:link={handleLinkStartOrFinish}
          {isLinking}
          {linkStartNode}
        />
      {:else}
        <SystemSummaryContextMenu items={contextMenuItems} x={contextMenuX} y={contextMenuY} type={contextMenuType} on:select={handleContextMenuSelect} />
      {/if}
    {/if}

    {#if showBackgroundContextMenu}
        <div class="context-menu" style="left: {contextMenuX}px; top: {contextMenuY}px;" on:click|stopPropagation>
            <ul>
                <li on:click={handleCreateConstructFromBackground}>Add Construct Here</li>
            </ul>
        </div>
    {/if}

    {#if showAddConstructModal && constructHostBody}
      <AddConstructModal {rulePack} hostBody={constructHostBody} orbitalBoundaries={constructHostBody.orbitalBoundaries} on:create={handleAddConstructCreated} on:close={() => showAddConstructModal = false} />
    {/if}

    {#if showCreateConstructModal}
        <LoadConstructTemplateModal {rulePack} mode="create" on:load={handleCreateConstructLoad} on:close={() => showCreateConstructModal = false} />
    {/if}

    {#if showConstructEditorModal && constructToEdit}
      <ConstructEditorModal system={$systemStore} {rulePack} construct={constructToEdit} hostBody={constructHostBodyForEditor} on:close={() => showConstructEditorModal = false} on:update={handleConstructUpdate} />
    {/if}

    <div class="debug-controls">
        <button on:click={() => showJson = !showJson}>
            {showJson ? 'Hide' : 'Show'} JSON
        </button>
        <button on:click={() => {
            if ($systemStore) {
                const newSys = sanitizeSystem($systemStore);
                if (newSys !== $systemStore) {
                    systemStore.set(newSys);
                    alert('System sanitized: Fixed orbit parameters for surface constructs.');
                } else {
                    alert('System is clean. No fixes needed.');
                }
            }
        }}>Sanitize System</button>
    </div>

    {#if showJson}
        <pre>{JSON.stringify($systemStore, null, 2)}</pre>
    {/if}
  {/if}
</main>


<style>
  main {
    font-family: sans-serif;
    padding: 0.5em;
    font-size: 0.9em;
    position: relative; 
  }
  .top-bar, .controls {
    margin: 0.5em 0;
    display: flex;
    align-items: center;
    gap: 1em;
  }
  .top-bar {
      justify-content: space-between;
  }
  .focus-header h2 {
      margin: 0;
  }
  .time-scales {
    display: flex;
    align-items: center;
    gap: 0.5em;
    background-color: #444;
    padding: 0.25em;
    border-radius: 5px;
  }
  .time-scales button {
      border: 1px solid #666;
      background-color: #555;
      color: #eee;
  }
  .time-scales button.active {
      border-color: #88ccff;
      background-color: #007bff;
      color: white;
  }
  .debug-controls {
      margin-top: 1em;
  }
  pre {
    background-color: #1a1a1a;
    border: 1px solid #333;
    padding: 1em;
    border-radius: 5px;
    white-space: pre-wrap;
    color: #eee;
    font-family: monospace;
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

  .system-view-grid {
    display: grid;
    grid-template-columns: 2fr 1fr;
    gap: 1em;
  }

  .main-view {
    grid-column: 1;
  }

  .details-view {
    grid-column: 2;
  }

  .name-input {
    background-color: transparent;
    border: 1px solid transparent;
    color: #ff3e00;
    font-size: 1.8em;
    font-weight: bold;
    padding: 0.1em;
    margin: 0;
    width: 100%;
    border-radius: 4px;
  }
  .name-input:hover, .name-input:focus {
      background-color: #252525;
      border-color: #444;
  }

  .context-menu {
    position: fixed; /* Fixed positioning for clientX/clientY */
    background-color: #333;
    border: 1px solid #555;
    border-radius: 5px;
    z-index: 1000;
    color: #eee;
    min-width: 150px;
  }
  .context-menu ul {
    list-style: none;
    padding: 0;
    margin: 0;
  }
  .context-menu li {
    padding: 0.8em 1em;
    cursor: pointer;
  }
  .context-menu li:hover {
    background-color: #555;
  }

  .action-buttons {
      display: flex;
      gap: 0.5em;
      margin-bottom: 1em;
      margin-top: 0.5em;
  }
  
  .action-buttons button {
      flex: 1;
      padding: 0.4em;
      border: none;
      border-radius: 3px;
      cursor: pointer;
      font-size: 0.9em;
      color: #eee;
      background-color: #444;
      transition: background-color 0.2s;
  }

  .action-buttons button.edit-btn:hover {
      background-color: #007bff;
  }

  .action-buttons button.delete-btn:hover {
      background-color: #c00;
  }
  .name-row {
      display: flex;
      align-items: center;
      gap: 0.5em;
      width: 100%;
      margin-bottom: 0.5em;
  }
  .visibility-btn {
      background: none;
      border: 1px solid #444;
      border-radius: 4px;
      cursor: pointer;
      padding: 4px;
      display: flex;
      align-items: center;
      justify-content: center;
      background-color: #222;
  }
  .visibility-btn:hover {
      background-color: #333;
      border-color: #666;
  }
  .name-input {
      flex-grow: 1;
      margin-bottom: 0 !important; /* Override previous margin if any */
  }
</style>
