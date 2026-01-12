<script lang="ts">
  import { onMount, onDestroy, createEventDispatcher, tick } from 'svelte';
  import { browser } from '$app/environment';
  import { pushState, replaceState, beforeNavigate } from '$app/navigation';
  import { page } from '$app/stores';
  import type { RulePack, System, CelestialBody } from '$lib/types';
  import { deleteNode, renameNode, generateSystem, computePlayerSnapshot } from '$lib/api';
  import SystemVisualizer from '$lib/components/SystemVisualizer.svelte';
  import SystemSummary from './SystemSummary.svelte';
  import SystemGenerationControls from './SystemGenerationControls.svelte';
  import SystemSummaryContextMenu from './SystemSummaryContextMenu.svelte'; 
  import BodyTechnicalDetails from './BodyTechnicalDetails.svelte';
  import BodyImage from './BodyImage.svelte';
  import DescriptionEditor from './DescriptionEditor.svelte';
  import GmNotesEditor from './GmNotesEditor.svelte';
  import ZoneKey from './ZoneKey.svelte';
  import ContextMenu from './ContextMenu.svelte'; 
  import AddConstructModal from './AddConstructModal.svelte'; 
  import ConstructDerivedSpecs from './ConstructDerivedSpecs.svelte';
  import ConstructSidePanel from './ConstructSidePanel.svelte';
  import BodySidePanel from './BodySidePanel.svelte';
  import LoadConstructTemplateModal from './LoadConstructTemplateModal.svelte';
  import ReportConfigModal from './ReportConfigModal.svelte';
  import TransitPlannerPanel from './TransitPlannerPanel.svelte';
  import type { TransitPlan } from '$lib/transit/types';

  import { systemStore, viewportStore } from '$lib/stores';
  import { panStore, zoomStore } from '$lib/cameraStore';
  import { get } from 'svelte/store';
  import { calculateSurfaceTemperature } from '$lib/system/postprocessing';
  import { systemProcessor } from '$lib/core/SystemProcessor';
  import { generateId, toRoman } from '$lib/utils';
  import { AU_KM, EARTH_MASS_KG, G } from '$lib/constants';
  import { propagate } from '$lib/api';
  import { broadcastService } from '$lib/broadcast';
  import { sanitizeSystem } from '$lib/system/utils';
  import { calculateAllStellarZones } from '$lib/physics/zones';
  import { calculateEquilibriumTemperature } from '$lib/physics/temperature';

  export let system: System;
  export let rulePack: RulePack;
  export let exampleSystems: string[];

  const dispatch = createEventDispatcher();

  // Enforce hierarchical navigation on Back button
  beforeNavigate(({ type, to, cancel }) => {
      // console.log('SystemView beforeNavigate:', { type, to, focusedBodyId });
      if (type === 'popstate' && focusedBody) {
          // Identify intended parent ID (where we logically want to go)
          const intendedParentId = focusedBody.parentId;
          const rootId = $systemStore?.nodes.find(n => !n.parentId)?.id;

          // Parse Target State
          const targetState = to?.state as any;
          const targetSystemId = targetState?.systemId;
          const targetFocusId = targetState?.focusId || rootId; // Default to Root if focusId missing
          
          /*
          console.log('SystemView Back Logic:', { 
              intendedParentId, 
              rootId, 
              targetSystemId, 
              targetFocusId,
              isAtRoot: !intendedParentId
          });
          */

          // Case 0: At Root (Star). Back button should ALWAYS exit to Starmap.
          // If the history would keep us in the system (targetSystemId exists), cancel and force exit.
          if (!intendedParentId) {
              if (targetSystemId) {
                  // console.log('At Root: Cancelling internal nav, forcing exit to Starmap');
                  cancel();
                  // Dispatch with force: true to tell parent to nuke the state
                  dispatch('back', { force: true });
              } else {
                   // console.log('At Root: Allowing exit to Starmap (target has no systemId)');
              }
              return;
          }

          // Case 1: Leaving System entirely while deep in hierarchy (e.g. Moon -> Starmap)
          if (!targetSystemId) {
              // console.log('Deep Hierarchy: Cancelling exit, forcing one step up');
              cancel();
              updateFocus(intendedParentId, true);
              return;
          }

          // Case 2: Navigating within system but skipping hierarchy (e.g. Moon -> Star, skipping Planet)
          // We want strict one-step-up navigation.
          if (targetFocusId !== intendedParentId) {
              // console.log('Skipping Hierarchy: Cancelling jump, forcing one step up');
              cancel();
              updateFocus(intendedParentId, true);
          }
      }
  });

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
  let isCrtMode = false;
  let isEditing = false;
  let isPlanning = false;
  let plannerOriginId: ID = '';
  let planningConstructId: ID = '';
  let transitDelayDays: number = 0;
  let transitJourneyOffset: number = 0;
  let transitPreviewPos: { x: number, y: number } | null = null;
  let activeEditTab = 'Basics';
  
  let currentTransitPlan: TransitPlan | null = null;
  let completedTransitPlans: TransitPlan[] = [];
  let transitAlternatives: TransitPlan[] = [];
  let transitChainTime: number = 0;
  let transitChainState: any = undefined; // StateVector imported later
  let isTransitExecuting: boolean = false;
  
  let broadcastSessionId = generateId(); 

  function handleToggleCrt() {
      isCrtMode = !isCrtMode;
      broadcastService.sendMessage({ type: 'SYNC_CRT_MODE', payload: isCrtMode });
  }

  // Context Menu State
  let showSummaryContextMenu = false;
  let contextMenuX = 0;
  let contextMenuY = 0;
  let contextMenuItems: CelestialBody[] = [];
  let contextMenuType = '';
  let contextMenuNode: CelestialBody | Barycenter | null = null; 

  // Linking State
  let isLinking = false;
  let linkStartNode: CelestialBody | Barycenter | null = null;

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

  // Add Construct Modal State
  let showAddConstructModal = false;
  let constructHostBody: CelestialBody | null = null;

  // Create Construct (Background) Modal State
  let showCreateConstructModal = false;
  let backgroundClickHost: CelestialBody | Barycenter | null = null;
  let backgroundClickPosition: { x: number, y: number } | null = null;
  let showBackgroundContextMenu = false;
  let contextMenuActionLabel = 'Add Planet Here';
  let showAddBeltOption = false;
  let showAddRingOption = false;

  // Edit Construct Modal State
  let showConstructEditorModal = false;
  let constructToEdit: CelestialBody | null = null;
  let constructHostBodyForEditor: CelestialBody | null = null;

  // ...

  function handleBackgroundContextMenu(event: CustomEvent<{ x: number, y: number, dominantBody: CelestialBody | Barycenter | null, screenX: number, screenY: number }>) {
      console.log('Background Context Menu Triggered:', event.detail);
      backgroundClickHost = event.detail.dominantBody;
      backgroundClickPosition = { x: event.detail.x, y: event.detail.y };
      contextMenuX = event.detail.screenX;
      contextMenuY = event.detail.screenY;
      
      showAddBeltOption = false;
      showAddRingOption = false;

      // Determine label and extra options
      if (backgroundClickHost && backgroundClickHost.kind === 'body') {
          const body = backgroundClickHost as CelestialBody;
          if (body.roleHint === 'planet' || body.roleHint === 'moon') {
              contextMenuActionLabel = 'Add Moon Here';
              if (body.roleHint === 'planet' || body.roleHint === 'moon') showAddRingOption = true;
          } else {
              contextMenuActionLabel = 'Add Planet Here';
              if (body.roleHint === 'star') showAddBeltOption = true;
          }
      } else {
          contextMenuActionLabel = 'Add Planet Here';
          // If no dominant body (deep space?), default to Star if it exists?
          // Usually backgroundClickHost is the Star if nothing else is close.
          if (backgroundClickHost?.kind === 'barycenter' || (backgroundClickHost && backgroundClickHost.roleHint === 'star')) {
              showAddBeltOption = true;
          }
      }
      
      showBackgroundContextMenu = true;
      showSummaryContextMenu = false;
  }

  function handleCreateBodyFromBackground(forceRole?: string) {
      showBackgroundContextMenu = false;
      const host = backgroundClickHost;
      if (!host || !$systemStore) return;

      // 1. Calculate Distance (a_AU) & Angle
      let distAU = 0;
      let startAngle = 0;
      
      let hostPos = { x: 0, y: 0 };
      // ... (existing calc logic) ...
      if (host.parentId) {
         const getAbsolutePosition = (nodeId: string): { x: number, y: number } => {
             const node = $systemStore.nodes.find(n => n.id === nodeId);
             if (!node || !node.parentId) return { x: 0, y: 0 };
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

      const dx = backgroundClickPosition!.x - hostPos.x;
      const dy = backgroundClickPosition!.y - hostPos.y;
      distAU = Math.sqrt(dx*dx + dy*dy);
      startAngle = Math.atan2(dy, dx);

      // 2. Determine Naming
      const siblings = $systemStore.nodes.filter(n => n.parentId === host.id);
      let name = `${host.name} ${toRoman(siblings.length + 1)}`;
      if (forceRole === 'belt') name = `${host.name} Belt ${toRoman(siblings.filter(n => n.roleHint === 'belt').length + 1)}`;
      if (forceRole === 'ring') name = `${host.name} Ring ${String.fromCharCode(65 + siblings.filter(n => n.roleHint === 'ring').length)}`;

      // 3. Determine Defaults
      const newPlanet: CelestialBody = {
          id: generateId(),
          name: name,
          kind: 'body',
          parentId: host.id,
          tags: [],
          atmosphere: { name: 'None', composition: {}, pressure_bar: 0 },
          hydrosphere: { coverage: 0, composition: 'water' }, 
          biosphere: null,
          classes: [],
          roleHint: 'planet' // Default, updated below
      };

      if (forceRole) {
          newPlanet.roleHint = forceRole as any;
          if (forceRole === 'belt') {
              newPlanet.radiusInnerKm = (distAU * AU_KM) * 0.95;
              newPlanet.radiusOuterKm = (distAU * AU_KM) * 1.05;
              newPlanet.classes = ['belt/rocky'];
          } else if (forceRole === 'ring') {
              newPlanet.radiusInnerKm = (distAU * AU_KM) * 0.98;
              newPlanet.radiusOuterKm = (distAU * AU_KM) * 1.02;
              newPlanet.classes = ['ring/ice'];
          }
      } else {
          // Existing Planet/Moon Logic
          const hostMass = (host as CelestialBody).massKg || (host as Barycenter).effectiveMassKg || 0;

          if (host.roleHint === 'star') {
              newPlanet.roleHint = 'planet';
              const zones = calculateAllStellarZones(host as CelestialBody, rulePack);
              const frostLine = (zones && zones.frostLine) ? zones.frostLine : 2.7;
              const co2Line = (zones && zones.co2IceLine) ? zones.co2IceLine : (frostLine * 3); 

              if (distAU < frostLine) {
                  newPlanet.classes = ['planet/terrestrial'];
                  newPlanet.massKg = EARTH_MASS_KG * (0.5 + Math.random());
                  newPlanet.radiusKm = 6371 * Math.pow(newPlanet.massKg / EARTH_MASS_KG, 1/3);
                  newPlanet.rotation_period_hours = 20 + Math.random() * 10;
                  newPlanet.axial_tilt_deg = 23.5 + (Math.random() * 20 - 10);
                  
                  if (distAU > 0.5) {
                      newPlanet.atmosphere = { name: 'Thin CO2', composition: { 'CO2': 0.95, 'N2': 0.05 }, pressure_bar: 0.1 };
                  }
                  newPlanet.magneticField = { strengthGauss: 0.1 + Math.random() * 1.9 };
              } else if (distAU < co2Line) {
                  newPlanet.classes = ['planet/ice-giant'];
                  newPlanet.massKg = EARTH_MASS_KG * (10 + Math.random() * 10);
                  newPlanet.radiusKm = 25000;
                  newPlanet.rotation_period_hours = 10 + Math.random() * 6;
                  newPlanet.axial_tilt_deg = 25 + (Math.random() * 10 - 5);
                  newPlanet.atmosphere = { name: 'H2/He/CH4', composition: { 'H2': 0.80, 'He': 0.15, 'CH4': 0.05 }, pressure_bar: 100 };
                  newPlanet.magneticField = { strengthGauss: 0.1 + Math.random() * 0.9 };
              } else {
                  newPlanet.classes = ['planet/gas-giant'];
                  newPlanet.massKg = EARTH_MASS_KG * (50 + Math.random() * 250);
                  newPlanet.radiusKm = 70000;
                  newPlanet.rotation_period_hours = 9 + Math.random() * 5;
                  newPlanet.axial_tilt_deg = 3 + Math.random() * 27;
                  newPlanet.atmosphere = { name: 'Hydrogen/Helium', composition: { 'H2': 0.75, 'He': 0.24 }, pressure_bar: 1000 };
                  newPlanet.magneticField = { strengthGauss: 4 + Math.random() * 96 };
              }
          } else {
              newPlanet.roleHint = 'moon';
              newPlanet.classes = ['planet/barren'];
              newPlanet.tidallyLocked = true;
              newPlanet.axial_tilt_deg = Math.random() * 5;
              newPlanet.rotation_period_hours = 0; 
              
              const pClasses = (host as CelestialBody).classes || [];
              const isGiant = pClasses.some(c => c.includes('gas-giant') || c.includes('ice-giant'));
              
              if (isGiant) {
                  newPlanet.massKg = hostMass / 10000;
              } else {
                  newPlanet.massKg = hostMass / (100 + Math.random() * 900);
              }
              newPlanet.radiusKm = 6371 * Math.pow((newPlanet.massKg || 0) / EARTH_MASS_KG, 1/3) * 0.8;
          }
      }

      // 4. Orbit (Common)
      // For belts, we might not strictly need an orbit object if visuals use inner/outer radius, 
      // but 'orbit' defines the 'center' distance for sorting and logic.
      const hostMass = (host as CelestialBody).massKg || (host as Barycenter).effectiveMassKg || 0;
      newPlanet.orbit = {
          hostId: host.id,
          hostMu: hostMass * G,
          t0: currentTime,
          elements: {
              a_AU: Math.max(distAU, 0.000001),
              e: forceRole ? 0 : 0.01, // Circular for belts/rings by default
              i_deg: 0,
              omega_deg: Math.random() * 360,
              Omega_deg: Math.random() * 360,
              M0_rad: startAngle
          }
      };

      // 4.5 Calculate Temperature (Fix for 0K issue)
      // We need to pass the new planet as if it were in the system to check relationships
      // But the function takes 'body' and 'allNodes'.
      // If we pass 'newPlanet', it has parentId.
      // We just need to make sure allNodes contains the stars/barycenters.
      // It doesn't strictly need newPlanet to be IN the array, unless we traverse UP from it?
      // No, the function uses 'allNodes.find(n => n.id === body.parentId)'.
      // So as long as the parent is in allNodes, we are good.
      const tempK = calculateEquilibriumTemperature(newPlanet, $systemStore.nodes);
      newPlanet.equilibriumTempK = tempK;
      newPlanet.temperatureK = tempK + (newPlanet.greenhouseTempK || 0) + (newPlanet.tidalHeatK || 0) + (newPlanet.radiogenicHeatK || 0);

      // 5. Commit & Focus
      systemStore.update(s => {
          if (!s) return s;
          return { ...s, nodes: [...s.nodes, newPlanet], isManuallyEdited: true };
      });
      updateFocus(newPlanet.id);
      isEditing = true;
  }

  function handleCreateConstructFromBackground() {
      showCreateConstructModal = true;
      showBackgroundContextMenu = false;
      constructHostBody = null;
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
    backgroundClickHost = null;
    backgroundClickPosition = null;
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

      // If a Star or Barycenter was updated, recalculate physics for the entire system
      if (updatedBody.roleHint === 'star' || updatedBody.kind === 'barycenter') {
          return systemProcessor.process({ ...system, nodes: system.nodes }, rulePack);
      }

      return { ...system, isManuallyEdited: true };
    });
  }

  let showReportConfigModal = false;

  function handleGenerateReport(event: CustomEvent<{mode: 'GM' | 'Player', theme: string, includeConstructs: boolean}>) {
      if (!$systemStore) return;
      const reportData = {
          system: $systemStore,
          mode: event.detail.mode,
          theme: event.detail.theme,
          includeConstructs: event.detail.includeConstructs
      };
      sessionStorage.setItem('reportData', JSON.stringify(reportData));
      window.open('/report', '_blank');
      showReportConfigModal = false;
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
    updateFocus(null, true); // Reset focus
  }

  function updateFocus(id: string | null, replace: boolean = false) {
      isEditing = false;
      showZoneKeyPanel = false; // Close Zone Key on navigation
      
      // Canonicalize: If targeting Root, treat as null (System View default)
      if (rootStar && id === rootStar.id) {
          id = null;
      }

      const currentFocus = $page.state.focusId || null;
      if (id === currentFocus) return; // Prevent duplicate state entries

      const state = id ? { systemId: system.id, focusId: id } : { systemId: system.id };
      
      if (replace) {
          replaceState('', state);
      } else {
          pushState('', state);
      }
  }

  function handleFocus(event: CustomEvent<string | null>) {
    updateFocus(event.detail);
  }

  function zoomOut() {
    if (focusedBody && focusedBody.parentId) {
      updateFocus(focusedBody.parentId, true);
    } else {
      // "To Starmap" button clicked. Force exit to ensure state is cleared.
      dispatch('back', { force: true });
    }
  }

  // Reactive Focus Handling via SvelteKit Router State
  $: focusedBodyId = $page.state.focusId ?? ($systemStore?.nodes.find(n => !n.parentId)?.id || null);
  $: focusedBody = $systemStore?.nodes.find(n => n.id === focusedBodyId) as CelestialBody || null;
  $: parentBody = focusedBody && focusedBody.parentId ? $systemStore?.nodes.find(n => n.id === focusedBody.parentId) as CelestialBody : null;
  $: rootStar = $systemStore?.nodes.find(n => !n.parentId && (n.roleHint === 'star' || n.kind === 'barycenter')) as CelestialBody || null;

  // Handle Back to Starmap if systemId is lost from state
  $: if (browser && !$page.state.systemId) {
      // dispatch('back'); // Handled by parent reactivity now
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
            systemStore.set(systemProcessor.process(deleteNode($systemStore, nodeId), rulePack));
            return; 
        }
    }

    systemStore.set({ ...systemProcessor.process(deleteNode($systemStore, nodeId), rulePack), isManuallyEdited: true });

    if (nextFocusId) {
        handleFocus({ detail: nextFocusId } as CustomEvent<string | null>);
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
        systemStore.set(systemProcessor.process(newSystem, rulePack));
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
          systemStore.set(systemProcessor.process(newSystem, rulePack));
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
      window.open(`/projector?sid=${broadcastSessionId}`, 'StarSystemProjector', 'width=1280,height=720,menubar=no,toolbar=no,location=no');
      if ($systemStore) {
          broadcastService.sendMessage({ type: 'SYNC_SYSTEM', payload: computePlayerSnapshot($systemStore) });
      }
  }

  let unsubscribePanStore: () => void;
  let unsubscribeZoomStore: () => void;

  onMount(() => {
    if (system) {
        systemStore.set(systemProcessor.process(system, rulePack));
        currentTime = system.epochT0;
    }
    
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
        broadcastService.initSender(broadcastSessionId);
        broadcastService.onRequestSync = (requestingId: string | null) => {
            // Only respond if the request is for THIS session, or if it's a legacy/wildcard request (null)
            if (requestingId && requestingId !== broadcastSessionId) return;

            if (get(systemStore)) {
                const snapshot = computePlayerSnapshot(get(systemStore)!);
                broadcastService.sendMessage({ type: 'SYNC_SYSTEM', payload: snapshot });
                broadcastService.sendMessage({ type: 'SYNC_RULEPACK', payload: rulePack });
                broadcastService.sendMessage({ type: 'SYNC_FOCUS', payload: focusedBodyId });
                broadcastService.sendMessage({ type: 'SYNC_CAMERA', payload: { pan: get(panStore), zoom: get(zoomStore), isManual: cameraMode === 'MANUAL' } });
                broadcastService.sendMessage({ type: 'SYNC_VIEW_SETTINGS', payload: { showNames, showZones, showLPoints } });
                broadcastService.sendMessage({ type: 'SYNC_TIME', payload: { currentTime, isPlaying, timeScale } });
                broadcastService.sendMessage({ type: 'SYNC_CRT_MODE', payload: isCrtMode });
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

  function handleStartPlanning() {
      if (!focusedBody) return;
      isPlanning = true; 
      isEditing = false; 
      showZoneKeyPanel = false; 
      visualizer?.resetView(); 
      plannerOriginId = focusedBody.id;
      planningConstructId = focusedBody.id;
      
      // Attempt to restore draft plan
      if (focusedBody.draft_transit_plan && focusedBody.draft_transit_plan.length > 0) {
          const draft = focusedBody.draft_transit_plan as TransitPlan[];
          const firstLegStart = draft[0].startTime;
          
          // Only restore if the plan starts in the future relative to current time
          // (Allowing for small epsilon or if we assume simulation time stops while planning)
          if (firstLegStart >= currentTime - 1000) {
              completedTransitPlans = draft;
              
              // Reconstruct chain state from last leg
              const lastLeg = draft[draft.length - 1];
              transitChainTime = lastLeg.startTime + (lastLeg.totalTime_days * 86400 * 1000);
              plannerOriginId = lastLeg.targetId;
              
              if (lastLeg.segments.length > 0) {
                  const endState = lastLeg.segments[lastLeg.segments.length - 1].endState;
                  transitChainState = { r: { ...endState.r }, v: { ...endState.v } };
              }
              return;
          }
      }
      
      // Default: Start fresh
      transitChainTime = currentTime;
      completedTransitPlans = [];
      transitChainState = undefined;
      transitDelayDays = 0;
  }

  function handleTakeoff(event: CustomEvent<{fuel: number}>) {
      if (!$systemStore || !focusedBody || !parentBody) return;
      
      const fuelCostKg = event.detail.fuel * 1000;
      
      systemStore.update(sys => {
          if (!sys) return null;
          const newNodes = sys.nodes.map(n => {
              if (n.id === focusedBody!.id) {
                  // Deduct Fuel
                  let remainingFuel = fuelCostKg;
                  if (n.fuel_tanks && rulePack.fuelDefinitions) {
                      for (const tank of n.fuel_tanks) {
                          const def = rulePack.fuelDefinitions.entries.find(f => f.id === tank.fuel_type_id);
                          if (def && remainingFuel > 0) {
                              const mass = tank.current_units * def.density_kg_per_m3;
                              if (mass >= remainingFuel) {
                                  tank.current_units -= remainingFuel / def.density_kg_per_m3;
                                  remainingFuel = 0;
                              } else {
                                  remainingFuel -= mass;
                                  tank.current_units = 0;
                              }
                          }
                      }
                  }
                  
                  // Update Position to Low Orbit (Standard Parking: Min + 400km)
                  const minAlt = parentBody!.orbitalBoundaries?.minLeoKm || 100;
                  const radiusKm = (parentBody!.radiusKm || 1000) + minAlt + 400;
                  
                  return {
                      ...n,
                      placement: 'Low Orbit',
                      orbit: {
                          ...n.orbit!,
                          elements: { ...n.orbit!.elements, a_AU: radiusKm / AU_KM }
                      }
                  };
              }
              return n;
          });
          return { ...sys, nodes: newNodes, isManuallyEdited: true };
      });
  }

  function handleLand(event: CustomEvent<{fuel: number}>) {
      if (!$systemStore || !focusedBody || !parentBody) return;
      
      const fuelCostKg = event.detail.fuel * 1000;
      
      systemStore.update(sys => {
          if (!sys) return null;
          const newNodes = sys.nodes.map(n => {
              if (n.id === focusedBody!.id) {
                  // Deduct Fuel (Same logic, should extract helper really)
                  let remainingFuel = fuelCostKg;
                  if (n.fuel_tanks && rulePack.fuelDefinitions) {
                      for (const tank of n.fuel_tanks) {
                          const def = rulePack.fuelDefinitions.entries.find(f => f.id === tank.fuel_type_id);
                          if (def && remainingFuel > 0) {
                              const mass = tank.current_units * def.density_kg_per_m3;
                              if (mass >= remainingFuel) {
                                  tank.current_units -= remainingFuel / def.density_kg_per_m3;
                                  remainingFuel = 0;
                              } else {
                                  remainingFuel -= mass;
                                  tank.current_units = 0;
                              }
                          }
                      }
                  }
                  
                  // Update Position to Surface
                  const radiusKm = parentBody!.radiusKm || 1000;
                  
                  return {
                      ...n,
                      placement: 'Surface',
                      orbit: {
                          ...n.orbit!,
                          elements: { ...n.orbit!.elements, a_AU: radiusKm / AU_KM }
                      }
                  };
              }
              return n;
          });
          return { ...sys, nodes: newNodes, isManuallyEdited: true };
      });
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
      on:generatereport={() => showReportConfigModal = true}
      on:togglecrt={handleToggleCrt}
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
        <button on:click={zoomOut}>
            {focusedBody && focusedBody.parentId ? 'Zoom Out' : 'To Starmap'}
        </button>
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
            <SystemVisualizer 
                bind:this={visualizer} 
                bind:cameraMode 
                system={$systemStore} 
                {rulePack} 
                currentTime={isPlanning ? (transitChainTime + (transitDelayDays * 86400 * 1000) + transitJourneyOffset) : currentTime} 
                {focusedBodyId} 
                {showNames} 
                {showZones} 
                {showLPoints} 
                toytownFactor={$systemStore.toytownFactor} 
                forceOrbitView={isEditing && activeEditTab === 'Orbit'}
                transitPlan={currentTransitPlan}
                alternativePlans={transitAlternatives}
                completedPlans={completedTransitPlans}
                transitPreviewPos={transitPreviewPos}
                isExecuting={isTransitExecuting}
                on:focus={handleFocus} 
                on:showBodyContextMenu={handleShowBodyContextMenu} 
                on:backgroundContextMenu={handleBackgroundContextMenu} 
            />

            {#if focusedBody}
                <DescriptionEditor body={focusedBody} on:update={handleBodyUpdate} />
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
                  {#if !isEditing && !isPlanning}
                      <button class="edit-btn small" on:click={() => { isEditing = true; showZoneKeyPanel = false; visualizer?.resetView(); }} style="margin-left: 5px;">Edit</button>
                  {/if}
            </div>
            {/if}

            {#if isPlanning}
                <TransitPlannerPanel 
                    system={$systemStore} 
                    {rulePack}
                    currentTime={transitChainTime}
                    originId={plannerOriginId}
                    constructId={planningConstructId}
                    completedPlans={completedTransitPlans}
                    initialState={transitChainState}
                    bind:departureDelayDays={transitDelayDays}
                    on:planUpdate={(e) => currentTransitPlan = e.detail}
                    on:alternativesUpdate={(e) => transitAlternatives = e.detail}
                    on:executionStateChange={(e) => isTransitExecuting = e.detail}
                    on:previewUpdate={(e) => {
                        transitJourneyOffset = e.detail.offset;
                        transitPreviewPos = e.detail.position;
                    }}
                    on:targetSelected={(e) => {
                        const { origin, target } = e.detail;
                        visualizer?.fitToNodes([origin, target]);
                    }}
                    on:addNextLeg={(e) => {
                         const plan = e.detail;
                         completedTransitPlans = [...completedTransitPlans, plan];
                         const durationMs = plan.totalTime_days * 86400 * 1000;
                         const delayMs = transitDelayDays * 86400 * 1000;
                         transitChainTime += durationMs + delayMs;
                         
                         plannerOriginId = plan.targetId;
                         transitDelayDays = 0;
                         currentTransitPlan = null;
                         transitAlternatives = [];
                         transitPreviewPos = null;
                         transitJourneyOffset = 0;
                         
                         // Store arrival state for next leg chaining
                         if (plan.segments.length > 0) {
                             const endState = plan.segments[plan.segments.length - 1].endState;
                             transitChainState = { r: { ...endState.r }, v: { ...endState.v } };
                             // console.log('Chaining State:', transitChainState, 'Time:', transitChainTime);
                         }
                    }}
                    on:undoLastLeg={() => {
                        if (completedTransitPlans.length === 0) return;
                        
                        // Remove last plan
                        completedTransitPlans = completedTransitPlans.slice(0, -1);
                        
                        if (completedTransitPlans.length > 0) {
                            // Revert to state at end of the NEW last leg
                            const lastPlan = completedTransitPlans[completedTransitPlans.length - 1];
                            
                            // We need to reconstruct the chain time.
                            // Ideally, we'd store the 'end time' in the plan object or a parallel array.
                            // But transitChainTime tracks cumulative time.
                            // Approximate Reversion: startTime of removed plan? 
                            // Wait, plan.startTime IS the start of that leg.
                            // So if we remove the last leg, the chain time should revert to that leg's startTime?
                            // Yes! transitChainTime is essentially the "Current Time" cursor.
                            // The removed plan started at 'startTime'.
                            // So we just set transitChainTime = removedPlan.startTime.
                            // But wait, there might have been a delay *before* that leg started.
                            // The 'startTime' in TransitPlan includes the delay relative to the previous leg's end?
                            // In 'calculateTransitPlan', effectiveStartTime = currentTime + delay.
                            // Yes! plan.startTime IS the correct time cursor for the start of that leg (after delay).
                            
                            // Actually, we want the cursor to be at the END of the previous leg, ready for a new delay?
                            // Or do we want it at the start of the undone leg?
                            // If we undo, we probably want to re-plan that leg.
                            // So we want to be at the END of the previous leg (or Start of mission).
                            
                            // Let's use the END of the previous leg.
                            // prevLeg.startTime + prevLeg.duration.
                            const prevLeg = completedTransitPlans[completedTransitPlans.length - 1];
                            // Note: This ignores the delay that happened *before* prevLeg.
                            // But prevLeg.startTime is absolute.
                            transitChainTime = prevLeg.startTime + (prevLeg.totalTime_days * 86400 * 1000);
                            
                            plannerOriginId = prevLeg.targetId;
                            
                            if (prevLeg.segments.length > 0) {
                                const endState = prevLeg.segments[prevLeg.segments.length - 1].endState;
                                transitChainState = { r: { ...endState.r }, v: { ...endState.v } };
                            }
                        } else {
                            // Reset to initial
                            transitChainTime = currentTime;
                            plannerOriginId = focusedBody ? focusedBody.id : '';
                            transitChainState = undefined;
                        }
                        
                        // Clear previews
                        currentTransitPlan = null;
                        transitAlternatives = [];
                        transitPreviewPos = null;
                        transitJourneyOffset = 0;
                        transitDelayDays = 0;
                    }}
                    on:executePlan={(e) => {
                         const finalPlan = e.detail;
                         
                         // Determine which plan to use for the final state (move ship to)
                         const targetPlan = finalPlan || (completedTransitPlans.length > 0 ? completedTransitPlans[completedTransitPlans.length - 1] : null);
                         if (!targetPlan) return;

                         // Calculate Totals
                         let totalFuelKg = completedTransitPlans.reduce((acc, p) => acc + p.totalFuel_kg, 0);
                         let finalTime = transitChainTime;

                         if (finalPlan) {
                             totalFuelKg += finalPlan.totalFuel_kg;
                             finalTime += (finalPlan.totalTime_days * 86400 * 1000) + (transitDelayDays * 86400 * 1000);
                         }
                         
                         // Update System
                         systemStore.update(sys => {
                             if (!sys) return null;
                             
                             const targetNode = sys.nodes.find(n => n.id === targetPlan.targetId);
                             if (!targetNode) return sys;

                             const newNodes = sys.nodes.map(node => {
                                 if (node.id === focusedBodyId) {
                                     // 1. Deduct Fuel
                                     let remainingFuelToDeductKg = totalFuelKg;
                                     if (node.fuel_tanks && node.fuel_tanks.length > 0 && rulePack.fuelDefinitions?.entries) {
                                         for (const tank of node.fuel_tanks) {
                                             if (remainingFuelToDeductKg <= 0.1) break;
                                             const fuelDef = rulePack.fuelDefinitions.entries.find(f => f.id === tank.fuel_type_id);
                                             if (fuelDef && fuelDef.density_kg_per_m3 > 0) {
                                                 const tankMassKg = tank.current_units * fuelDef.density_kg_per_m3;
                                                 if (tankMassKg >= remainingFuelToDeductKg) {
                                                     tank.current_units = Math.max(0, tank.current_units - (remainingFuelToDeductKg / fuelDef.density_kg_per_m3));
                                                     remainingFuelToDeductKg = 0;
                                                 } else {
                                                     remainingFuelToDeductKg -= tankMassKg;
                                                     tank.current_units = 0;
                                                 }
                                             }
                                         }
                                     }
                                     
                                     // 2. Flight Dynamics Tracking
                                     let flightState: 'Orbiting' | 'Transit' | 'Deep Space' | 'Landed' | 'Docked' = 'Orbiting';
                                     let finalVel = { x: 0, y: 0 };
                                     
                                     if (targetPlan.arrivalPlacement === 'surface') {
                                         flightState = 'Landed';
                                     } else if (targetPlan.arrivalVelocity_ms > 50) {
                                         flightState = 'Deep Space';
                                     }
                                     
                                     if (targetPlan.segments.length > 0) {
                                         const lastSeg = targetPlan.segments[targetPlan.segments.length - 1];
                                         finalVel = { 
                                             x: lastSeg.endState.v.x * AU_KM * 1000, 
                                             y: lastSeg.endState.v.y * AU_KM * 1000 
                                         };
                                     }

                                     // 3. Move Ship Logic
                                     const isLagrange = targetPlan.arrivalPlacement === 'l4' || targetPlan.arrivalPlacement === 'l5';
                                     const specificTargetNode = sys.nodes.find(n => n.id === targetPlan.arrivalPlacement);
                                     
                                     let updatedNode = { 
                                         ...node, 
                                         flight_state: flightState, 
                                         vector_velocity_ms: finalVel,
                                         draft_transit_plan: undefined // Clear draft on execution
                                     };

                                     if (targetNode.kind === 'construct') {
                                         // Case: Docking with Station
                                         updatedNode.parentId = targetNode.parentId;
                                         updatedNode.ui_parentId = targetNode.id;
                                         updatedNode.orbit = targetNode.orbit ? JSON.parse(JSON.stringify(targetNode.orbit)) : node.orbit;
                                         updatedNode.placement = `Docked at ${targetNode.name}`;
                                         updatedNode.flight_state = 'Docked';
                                     } else if (specificTargetNode) {
                                         // Case: Targeted Moon or Specific Station via dropdown
                                         if (specificTargetNode.kind === 'construct') {
                                             updatedNode.parentId = specificTargetNode.parentId;
                                             updatedNode.ui_parentId = specificTargetNode.id;
                                             updatedNode.orbit = specificTargetNode.orbit ? JSON.parse(JSON.stringify(specificTargetNode.orbit)) : node.orbit;
                                             updatedNode.placement = `Docked at ${specificTargetNode.name}`;
                                             updatedNode.flight_state = 'Docked';
                                         } else {
                                             const radiusKm = (specificTargetNode.radiusKm || 1000) + (specificTargetNode.orbitalBoundaries?.minLeoKm || 200);
                                             updatedNode.parentId = specificTargetNode.id;
                                             updatedNode.ui_parentId = null;
                                             updatedNode.placement = 'Low Orbit';
                                             updatedNode.orbit = {
                                                 hostId: specificTargetNode.id,
                                                 elements: { a_AU: radiusKm / AU_KM, e: 0, i_deg: 0, Omega_deg: 0, omega_deg: 0, M0_rad: 0 },
                                                 t0: finalTime,
                                                 hostMu: (specificTargetNode.massKg || 0) * G
                                             };
                                         }
                                     } else if (isLagrange && targetNode.parentId) {
                                         // Case: Lagrange Points
                                         const offset = targetPlan.arrivalPlacement === 'l4' ? Math.PI/3 : -Math.PI/3;
                                         let newOrbit = JSON.parse(JSON.stringify(targetNode.orbit));
                                         newOrbit.elements.M0_rad = (newOrbit.elements.M0_rad + offset + 2*Math.PI) % (2*Math.PI);
                                         updatedNode.parentId = targetNode.parentId;
                                         updatedNode.ui_parentId = targetNode.id;
                                         updatedNode.orbit = newOrbit;
                                         updatedNode.placement = targetPlan.arrivalPlacement.toUpperCase();
                                     } else {
                                         // Case: Standard Capture (Planet/Star/Barycenter)
                                         let placementString = 'Parking Orbit';
                                         let radiusKm = (targetNode.radiusKm || 1000) * 1.2; 
                                         const b = targetNode.orbitalBoundaries;
                                         
                                         if (targetPlan.arrivalPlacement === 'lo') {
                                             placementString = 'Low Orbit';
                                             radiusKm = (targetNode.radiusKm || 0) + (b?.minLeoKm || 200);
                                         } else if (targetPlan.arrivalPlacement === 'mo') {
                                             placementString = 'Medium Orbit';
                                             radiusKm = (targetNode.radiusKm || 0) + ((b?.leoMoeBoundaryKm || 2000) + (b?.meoHeoBoundaryKm || 10000)) / 2;
                                         } else if (targetPlan.arrivalPlacement === 'ho') {
                                             placementString = 'High Orbit';
                                             radiusKm = (targetNode.radiusKm || 0) + ((b?.meoHeoBoundaryKm || 10000) + (b?.heoUpperBoundaryKm || 50000)) / 2;
                                         } else if (targetPlan.arrivalPlacement === 'geo' && b?.geoStationaryKm) {
                                             placementString = 'Geostationary Orbit';
                                             radiusKm = (targetNode.radiusKm || 0) + b.geoStationaryKm;
                                         }

                                         const mass = (targetNode.kind === 'body' ? (targetNode as CelestialBody).massKg : (targetNode as Barycenter).effectiveMassKg) || 0;
                                         
                                         updatedNode.parentId = targetNode.id;
                                         updatedNode.ui_parentId = null;
                                         updatedNode.placement = placementString;
                                         updatedNode.orbit = {
                                             hostId: targetNode.id,
                                             elements: { a_AU: radiusKm / AU_KM, e: 0, i_deg: 0, Omega_deg: 0, omega_deg: 0, M0_rad: 0 },
                                             t0: finalTime,
                                             hostMu: mass * G
                                         };
                                     }
                                     return updatedNode;
                                 }
                                 return node;
                             });
                             
                             return { ...sys, nodes: newNodes, epochT0: finalTime, isManuallyEdited: true };
                         });
                         
                         // Reset UI
                         currentTime = finalTime;
                         isPlanning = false;
                         currentTransitPlan = null;
                         completedTransitPlans = [];
                         transitAlternatives = [];
                         transitPreviewPos = null;
                         transitJourneyOffset = 0;
                         transitChainTime = 0;
                    }}
                    on:close={() => { 
                        // Save Draft Plan
                        if (focusedBody && completedTransitPlans.length > 0) {
                            focusedBody.draft_transit_plan = completedTransitPlans;
                            handleBodyUpdate({ detail: focusedBody } as CustomEvent);
                        }
                        
                        isPlanning = false; 
                        currentTransitPlan = null; 
                        transitDelayDays = 0; 
                        transitJourneyOffset = 0; 
                        transitPreviewPos = null; 
                        completedTransitPlans = [];
                        transitAlternatives = [];
                    }} 
                />

// ...
                {#if focusedBody}
                    <ConstructDerivedSpecs 
                        construct={focusedBody} 
                        hostBody={parentBody} 
                        {rulePack} 
                        hideActions={true}
                        on:planTransit={handleStartPlanning}
                        on:takeoff={handleTakeoff}
                        on:land={handleLand}
                    />
                {/if}
            {:else if focusedBody}
            
            {#if showZoneKeyPanel}
                <ZoneKey />
            {:else}
                {#if focusedBody && focusedBody.kind !== 'construct'}
                    {@const parentBody = focusedBody.parentId ? $systemStore.nodes.find(n => n.id === (focusedBody.ui_parentId || focusedBody.parentId)) : null}
                    {@const rootStar = $systemStore.nodes.find(n => n.parentId === null)}
                    {#if isEditing}
                        <BodySidePanel 
                            body={focusedBody} 
                            {rulePack}
                            system={$systemStore}
                            parentBody={parentBody}
                            rootStar={rootStar}
                            on:update={handleBodyUpdate}  
                            on:delete={handleDeleteNode} 
                            on:close={() => isEditing = false} 
                            on:tabchange={(e) => activeEditTab = e.detail} 
                        />
                    {:else}
                        <BodyTechnicalDetails body={focusedBody} {rulePack} parentBody={parentBody} rootStar={rootStar} />
                    {/if}
                {/if}

                {#if focusedBody && focusedBody.kind === 'construct'}
                  {@const parentBody = focusedBody.parentId ? $systemStore.nodes.find(n => n.id === (focusedBody.ui_parentId || focusedBody.parentId)) : null}
                  {#if isEditing}
                      <ConstructSidePanel 
                        system={$systemStore} 
                        construct={focusedBody} 
                        hostBody={parentBody} 
                        {rulePack} 
                        hideActions={isPlanning}
                        on:update={handleConstructUpdate} 
                        on:delete={handleDeleteNode} 
                        on:close={() => isEditing = false}
                        on:tabchange={(e) => activeEditTab = e.detail}
                      />
                  {:else}
                      <ConstructDerivedSpecs 
                          construct={focusedBody} 
                          hostBody={parentBody} 
                          {rulePack} 
                          isEditingConstruct={isEditing}
                          hideActions={isPlanning}
                          on:planTransit={handleStartPlanning}
                          on:takeoff={handleTakeoff}
                          on:land={handleLand}
                      />
                  {/if}
                {/if}
            {/if}
            
            <BodyImage body={focusedBody} />
            <GmNotesEditor body={focusedBody} on:update={handleBodyUpdate} />
            {/if}


            
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
                <li on:click={() => handleCreateBodyFromBackground()}>{contextMenuActionLabel}</li>
                {#if showAddBeltOption}
                    <li on:click={() => handleCreateBodyFromBackground('belt')}>Add Belt Here</li>
                {/if}
                {#if showAddRingOption}
                    <li on:click={() => handleCreateBodyFromBackground('ring')}>Add Ring Here</li>
                {/if}
            </ul>
        </div>
    {/if}

    {#if showAddConstructModal && constructHostBody}
      <AddConstructModal {rulePack} hostBody={constructHostBody} orbitalBoundaries={constructHostBody.orbitalBoundaries} on:create={handleAddConstructCreated} on:close={() => showAddConstructModal = false} />
    {/if}

    {#if showCreateConstructModal}
        <LoadConstructTemplateModal {rulePack} mode="create" on:load={handleCreateConstructLoad} on:close={() => showCreateConstructModal = false} />
    {/if}

    {#if showReportConfigModal}
        <ReportConfigModal on:generate={handleGenerateReport} on:close={() => showReportConfigModal = false} />
    {/if}

    <div class="debug-controls">
        <button on:click={() => showJson = !showJson}>
            {showJson ? 'Hide' : 'Show'} JSON
        </button>
        <button on:click={() => {
            if ($systemStore) {
                const newSys = sanitizeSystem($systemStore, rulePack);
                // Always update because we run full physics recalculation now
                systemStore.set(newSys);
                alert('System updated: Fixed legacy constructs/rings and recalculated all physics (Temp/Radiation).');
            }
        }}>Update & Repair System</button>
    </div>

    {#if showJson}
        <pre>{JSON.stringify($systemStore, null, 2)}</pre>
    {/if}

                            <footer class="attributions">

                              <p><strong>Image Attributions:</strong></p>

                              <p>Planet Images: Courtesy of Pablo Carlos Budassi, used under a <a href="https://creativecommons.org/licenses/by-sa/4.0/" target="_blank" rel="noopener noreferrer">CC BY-SA 4.0</a> license. Source: <a href="https://pablocarlosbudassi.com/2021/02/planet-types.html" target="_blank" rel="noopener noreferrer">pablocarlosbudassi.com</a>.</p>

                              <p>Star Images: Sourced from the <a href="https://beyond-universe.fandom.com/wiki/" target="_blank" rel="noopener noreferrer">Beyond Universe Wiki</a> on Fandom, used under a <a href="https://creativecommons.org/licenses/by-sa/3.0/us/" target="_blank" rel="noopener noreferrer">CC-BY-SA</a> license.</p>

                              <p>Magnetar Image & Starmap Background: Courtesy of ESO/L. Calçada & S. Brunier, used under a <a href="https://creativecommons.org/licenses/by/4.0/" target="_blank" rel="noopener noreferrer">CC BY 4.0</a> license. Sources: <a href="https://www.eso.org/public/images/eso1415a/" target="_blank" rel="noopener noreferrer">ESO Magnetar</a>, <a href="https://www.eso.org/public/images/eso0932a/" target="_blank" rel="noopener noreferrer">ESO Milky Way</a>.</p>

                              <p>Black Hole Accretion Disk Image: Courtesy of NASA’s Goddard Space Flight Center/Jeremy Schnittman, used under a <a href="https://svs.gsfc.nasa.gov/13232" target="_blank" rel="noopener noreferrer">Public Domain</a> license. Source: <a href="https://svs.gsfc.nasa.gov/13232" target="_blank" rel="noopener noreferrer">NASA SVS</a>.</p>

                              <p>Weyland-Yutani Logo: Sourced from <a href="https://commons.wikimedia.org/wiki/File:Weyland-Yutani_cryo-tube.jpg" target="_blank" rel="noopener noreferrer">Wikimedia Commons</a> by <a href="https://commons.wikimedia.org/wiki/User:IllaZilla" target="_blank" rel="noopener noreferrer">IllaZilla</a>, used under a <a href="https://creativecommons.org/licenses/by-sa/3.0/deed.en" target="_blank" rel="noopener noreferrer">Creative Commons Attribution-Share Alike 3.0 Unported</a> license. Changes made: Logo Extracted.</p>

                              <hr class="attribution-separator">

                              <p class="project-attribution">

                                                              <a href="https://github.com/FrunkQ/star-system-generator" target="_blank" rel="noopener noreferrer">Star System Explorer</a> © 2026 FrunkQ. Licensed under <a href="https://www.gnu.org/licenses/gpl-3.0.en.html" target="_blank" rel="noopener noreferrer">GPL-3.0</a>. Join us on <a href="https://discord.gg/UAEq4zzjD8" target="_blank" rel="noopener noreferrer">Discord!</a>

                                                            </p>

                            </footer>  {/if}
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
    .details-section-header .visibility-btn {
        margin-right: 10px;
    }

    .attributions {
        margin-top: 1em; /* Add some top margin to separate from notes */
        padding-top: 1em;
        border-top: 1px solid #333;
        color: #999;
        font-size: 0.9em; /* Increased font size */
        text-align: center;
    }
    .attributions a {
        color: #88ccff;
        text-decoration: none;
    }
    .attributions p {
        margin: 0; /* Zero out default browser margins for paragraphs inside attributions */
        padding: 0;
    }
    .attributions p + p { /* Apply top margin to paragraphs that immediately follow another paragraph */
        margin-top: 0.2em; /* Tighten spacing between paragraphs (e.g. image attributions) */
    }
    .attributions p:first-child {
        margin-bottom: 0.5em; /* Space *after* the "Image Attributions:" title. This is fine. */
    }
    .attribution-separator {
        border: 0;
        border-top: 1px solid #555;
        margin: 1.5em 0; /* Blank space above and below the separator */
    }
    .project-attribution {
        font-size: 1.1em; /* Slightly larger for the last line */
        font-weight: bold;
    }

</style>
