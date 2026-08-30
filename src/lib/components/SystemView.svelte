<script lang="ts">
  import { onMount, onDestroy, createEventDispatcher, tick } from 'svelte';
  import { playerConnections } from '$lib/playerConnections';
  import { browser } from '$app/environment';
  import { pushState, replaceState, beforeNavigate } from '$app/navigation';
  import { page } from '$app/stores';
  import type { RulePack, System, CelestialBody, Starmap } from '$lib/types';
  import { deleteNode, renameNode, generateSystem, computePlayerSnapshot } from '$lib/api';
  import SystemVisualizer from '$lib/components/SystemVisualizer.svelte';
  import TimeControls from '$lib/components/TimeControls.svelte';
  import { drainFuelMassKg } from '$lib/construct-logic';
  import SystemSummaryContextMenu from './SystemSummaryContextMenu.svelte'; 
  import BodyDetailsPane from './BodyDetailsPane.svelte';
  import BodyImage from './BodyImage.svelte';
  import ConstructPortrait from './ConstructPortrait.svelte';
  import DescriptionEditor from './DescriptionEditor.svelte';
  import BodyPicker from './BodyPicker.svelte';
  import TimeDisplay from './TimeDisplay.svelte';
  import FullscreenButton from './FullscreenButton.svelte';
  import { railCollapsed } from '$lib/railStore';
  import { trueColorMode } from '$lib/rendering/colorModeStore';
  import GmNotesEditor from './GmNotesEditor.svelte';
  import UndoPill from './UndoPill.svelte';
  import { attachSystemUndo, detachSystemUndo, silentSystemWrite, setUndoFocus, undoStatus, undo as undoSystem, redo as redoSystem } from '$lib/undo/systemUndo';
  import ZoneKey from './ZoneKey.svelte';
  import ContextMenu from './ContextMenu.svelte'; 
  import AddConstructModal from './AddConstructModal.svelte';
  import { megaTypeDef } from '$lib/constructs/megaTypes';
  import { effectiveMegaRequires, megaSteerNotes } from '$lib/constructs/megaPlacement';
  import { calculateGoldilocksZone } from '$lib/physics/zones';
  import ConstructDetailsPane from './ConstructDetailsPane.svelte';
  import LoadConstructTemplateModal from './LoadConstructTemplateModal.svelte';
  import ReportConfigModal from './ReportConfigModal.svelte';
  import SaveSystemModal from './SaveSystemModal.svelte';
  import SisterFileModal from './SisterFileModal.svelte';
  import PlannerPane from './PlannerPane.svelte';
  import type { TransitPlan } from '$lib/transit/types';
  import { sampleJourneyKinematicsAtTime, getJourneyBounds, countFutureJourneys, clearFutureJourneys, cancelActiveJourney, resolveConstructCurrentHostId, reconcileConstructArrival, trimFlownAutopilotPast, needsStampedPosition } from '$lib/transit/scheduler';

  import { systemStore, viewportStore } from '$lib/stores';
  import { unitPrefs } from '$lib/unitPrefsStore';
  import { starmapStore } from '$lib/starmapStore';
  import { interstellarConstructIds, adriftFromSystemExit } from '$lib/transit/interstellar';
  import { rootStarHillAu } from '$lib/physics/twoBodyCoast';
  import { generateAutopilotChain } from '$lib/transit/autopilotAdapter';
  import AutopilotDisengageDialog from './AutopilotDisengageDialog.svelte';
  import { starmapUiStore } from '$lib/starmapUiStore';
  import { systemUiStore } from '$lib/systemUiStore';
  import { SYSTEM_OVERLAY_OPTIONS, isLattice, type MapOverlay } from '$lib/map/mapOverlay';
  import { panStore, zoomStore } from '$lib/viewport/stores';
  import { get } from 'svelte/store';
  import { systemProcessor } from '$lib/core/SystemProcessor';
  import { packBundle, BUNDLE_EXT } from '$lib/io/bundle';
  import { classifySaveFile } from '$lib/io/classify';
  import { collectModelsForExport, importEmbeddedModels } from '$lib/constructs/modelTransfer';
  import { fixUpImportedSystem, stripSystemForExport } from '$lib/system/importFixup';
  import ImportModal from './ImportModal.svelte';
  import { adapterForFile, type ImportAdapter } from '$lib/import/adapters';
  import { generateId, toRoman } from '$lib/utils';
  import { AU_KM, EARTH_MASS_KG, EARTH_RADIUS_KM, G } from '$lib/constants';
  import { predictTidalLock } from '$lib/physics/tidalLock';
  import { propagate } from '$lib/api';
  import { broadcastService } from '$lib/broadcast';
  import FocusHeader from './FocusHeader.svelte';
  import PhysicsTraceModal from './PhysicsTraceModal.svelte';
  import AddBodyTypeModal from './AddBodyTypeModal.svelte';
  import { generateBodyOfType } from '$lib/generation/generateBodyOfType';
  import { deriveCoOrbitalOrbit, maxTrojanMassKg, placeBodyAtCoOrbitalPoint } from '$lib/physics/lagrange';
  import { maxCircumbinaryMassKg } from '$lib/physics/circumbinary';
  import { laplaceRadiusAU } from '$lib/generation/planet';
  import { spinProvenanceTags } from '$lib/generation/spinProvenance';
  import AppShell from './AppShell.svelte';
  import RailNav from './RailNav.svelte';
  import { calculateAllStellarZones } from '$lib/physics/zones';
  import { calculateEquilibriumTemperature, composeSurfaceTemperatureFromDeltaComponents, estimateBondAlbedo, estimateInternalHeatK } from '$lib/physics/temperature';
  import { ensureTemporalState, setMasterToDisplay, updateDisplayBySeconds } from '$lib/temporal/defaults';
  import { parseClockSeconds, resolveCalendar, resolveTemporalDisplay, BIG_BANG_TO_UNIX_EPOCH_T, unixMsToMasterSeconds } from '$lib/temporal/utre';
  import { chrome } from '$lib/ui/foreground';

  export let system: System;
  export let rulePack: RulePack;
  export let exampleSystems: string[];
  export let routesAttention: 'stuck' | 'intervention' | 'done' | null = null; // worst fleet attention → rail Routes dot

  // Phase 03: SystemView owns its own AppShell. `mode` is driven by the shell (bound), and
  // the detail panes live in the shell's detail slot (right panel on desktop, BottomSheet on
  // phone). `dispatch('new'|'open'|'save'|'settings'|'llmsettings')` forwards the rail's app
  // nav up to +page. Phone FAB actions:
  let mode: 'desktop' | 'phone' = 'desktop';
  let sheetSnap: 'peek' | 'half' | 'full' = 'peek';
  let railOpen = false; // phone slide-in rail; closed before opening a modal
  let railUploadInput: HTMLInputElement; // hidden file input for the rail's Upload JSON
  // External-format import (.ubox / .sc / .pak) — the rail upload routes these to the converter modal.
  let importBytes: Uint8Array | null = null;
  let importFileName = '';
  let importSource: ImportAdapter | null = null;

  // Orbit scale: binary Toytown (compressed, fits one screen) vs Real (true AU). The
  // continuous compression slider stays as the advanced control while in Toytown.
  let toytownPref = 0.6; // remembered compression when toggled to Real
  let viewOpen = false; // on-canvas "View" toggles popover
  function closeViewOnOutside(e: Event) {
    const t = e.target as HTMLElement;
    if (!t.closest?.('.ov-view')) { viewOpen = false; window.removeEventListener('pointerdown', closeViewOnOutside, true); }
  }
  function toggleViewPopover() {
    viewOpen = !viewOpen;
    if (viewOpen) window.addEventListener('pointerdown', closeViewOnOutside, true);
    else window.removeEventListener('pointerdown', closeViewOnOutside, true);
  }
  $: toytownOn = ($systemStore?.toytownFactor ?? 0) > 0;
  // A construct that's currently interstellar (in transit OR stranded) belongs to NO system map — its node
  // still physically lives in its origin system, but it must not be drawn there; it only shows at starmap
  // level. Hide such constructs from the orrery (reactive to the clock, so it appears/disappears as you
  // scrub through its journey window).
  // NB: journey times are stored in MASTER/universe seconds (since the Big Bang), but the orrery's
  // currentTime is a unix-epoch clock — convert before asking who's interstellar, or the placement is
  // evaluated in the wrong epoch (always reads "not departed") and nothing ever hides.
  $: interstellarIds = ($starmapStore && $systemStore)
      ? interstellarConstructIds($starmapStore, Number(unixMsToMasterSeconds(currentTime)))
      : new Set<string>();
  $: displaySystem = ($systemStore && interstellarIds.size)
      ? { ...$systemStore, nodes: $systemStore.nodes.filter((n) => !(n.kind === 'construct' && interstellarIds.has(n.id))) }
      : $systemStore;
  function setScaleMode(toytown: boolean) {
    if (!$systemStore) return;
    systemStore.update(s => {
      if (!s) return s;
      if (toytown) return { ...s, toytownFactor: toytownPref || 0.6 };
      if ((s.toytownFactor ?? 0) > 0) toytownPref = s.toytownFactor!;
      return { ...s, toytownFactor: 0 };
    });
    handleSliderRelease();
    // re-frame after the scaled positions recompute
    setTimeout(() => visualizer?.resetView(), 80);
  }
  // Phone has no right-click background menu, so the FAB is the "add body" entry point.
  // We synthesize the same inputs the background-context-menu path produces — a host and a
  // world-space (AU) click position — then reuse the existing creation handlers verbatim.
  // Host = the focused star/planet/moon if it can host, else the primary (root) star;
  // a star host -> a planet, a planet/moon host -> a moon (handler auto-types by host).
  // Position = just beyond the outermost existing child orbit (or a sensible default).
  function pickAddHost() {
    const nodes = $systemStore?.nodes ?? [];
    const fb = focusedBody;
    if (fb && (fb.roleHint === 'star' || fb.roleHint === 'planet' || fb.roleHint === 'moon')) return fb;
    return nodes.find(n => n.parentId === null && n.roleHint === 'star')
      ?? nodes.find(n => n.roleHint === 'star')
      ?? nodes.find(n => n.parentId === null)
      ?? null;
  }
  function addBodyViaFab(role?: string) {
    if (!$systemStore) return;
    const host = pickAddHost();
    if (!host) return;
    const nodes = $systemStore.nodes;
    const absPos = (nodeId: string): { x: number, y: number } => {
      const node = nodes.find(n => n.id === nodeId);
      if (!node || !node.parentId) return { x: 0, y: 0 };
      const pp = absPos(node.parentId);
      let rel = { x: 0, y: 0 };
      if ((node.kind === 'body' || node.kind === 'construct') && (node as any).orbit) {
        const p = propagate(node as any, currentTime);
        if (p) rel = p;
      }
      return { x: pp.x + rel.x, y: pp.y + rel.y };
    };
    const children = nodes.filter(n => n.parentId === host.id && (n as any).orbit?.elements?.a_AU);
    const maxA = children.reduce((m, n) => Math.max(m, (n as any).orbit.elements.a_AU), 0);
    const D = maxA > 0 ? maxA * 1.4 : (host.roleHint === 'star' ? 1.0 : 0.01);
    const hp = absPos(host.id);
    backgroundClickHost = host as any;
    backgroundClickPosition = { x: hp.x + D, y: hp.y };
    if (role === 'construct') handleCreateConstructFromBackground();
    else handleCreateBodyFromBackground(role);
  }

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
  let generationOptions: string[] = ['Random'];
  let selectedGenerationOption = 'Random';
  let showDropdown = false;
  let showNames = true;
  let showZones = false;
  let showHillSpheres = false;
  // WS3: the 2D system view's spatial overlay (shared vocabulary — see lib/map/mapOverlay.ts).
  let systemOverlay: MapOverlay = 'off';
  // The lattice cell in AU. 0 = the automatic 1/2/5 ladder that sizes cells by zoom. Pinning it is what
  // makes the grid a measure a table can rely on — the same choice the player preset offers, because a
  // GM and their players looking at the same system should not disagree about what one cell is.
  let systemGridScaleAu = 0;
  let showZoneKeyPanel = false; // Controls display of ZoneKey in the right panel
  let showLPoints = false;
  let showTravellerZones = false;
  let showSensors = false;
  let showVectors = false;
  let rulerActive = false; // measuring-tape tool: tap two bodies for their AU separation
  let throttleTimeout: ReturnType<typeof setTimeout> | null = null;
  let lastToytownFactor: number | undefined = undefined;
  let timeSyncInterval: ReturnType<typeof setInterval> | undefined;
  let cameraMode: 'FOLLOW' | 'MANUAL' = 'FOLLOW';
  // The visualizer's wheel-zoom flag: FOLLOW keeps panning with the body but the ZOOM is the user's —
  // followers must treat that viewport as manual too (zoom-out over a focused body was never mirrored).
  let userZoomOverride = false;
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
  let focusedFutureJourneyCount: number = 0;
  let isShipLogOpen: boolean = false;
  
  export let broadcastSessionId: string; // owned by +page so the guide works from the starmap too

  // Context Menu State
  let showSummaryContextMenu = false;
  let contextMenuX = 0;
  let contextMenuY = 0;
  let contextMenuItems: CelestialBody[] = [];
  let contextMenuType = '';
  let contextMenuOpenToken = 0;
  let contextMenuNode: CelestialBody | Barycenter | null = null; 

  // Linking State
  let isLinking = false;
  let linkStartNode: CelestialBody | Barycenter | null = null;

  function handleShowContextMenu(event: CustomEvent<{ x: number, y: number, items: any[], type: string }>) {
    contextMenuItems = event.detail.items;
    contextMenuX = event.detail.x;
    contextMenuY = event.detail.y;
    contextMenuType = event.detail.type;
    contextMenuOpenToken += 1;
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

  // Physics "working" (Newton/Apple) panel
  let showPhysicsModal = false;

  // §4c add-by-viable-type picker. `trojan` (G43) rides along when the add came from a click
  // inside an L4/L5 area: the body will be co-orbital with that secondary, and the picker shows
  // the pair's trojan mass guide (guide + honest tags, never a hard block — owner Q3).
  let showAddTypeModal = false;
  let pendingAdd: { distAU: number; startAngle: number; hostId: string; hostMassKg: number; role: 'planet' | 'moon'; teqK: number; ageGyr?: number; canTidallyLock?: boolean;
      trojan?: { secondaryId: string; secondaryName: string; point: 'l4' | 'l5'; maxTrojanMassKg: number };
      circumbinary?: { pairName: string; maxMassKg: number } } | null = null;

  // Create Construct (Background) Modal State
  let showCreateConstructModal = false;
  let showSaveModal = false;
  let backgroundClickHost: CelestialBody | Barycenter | null = null;
  let backgroundClickPosition: { x: number, y: number } | null = null;
  let backgroundLagrangeHit: { secondaryId: string; secondaryName: string; point: string } | null = null; // G43: click landed inside an L-zone
  let backgroundCircumbinaryHit: { baryId: string; baryName: string } | null = null; // G45: click landed inside a pair's circumbinary ring
  let constructInitialPlacement: string | undefined = undefined;   // G43: preselect an L-point in the add-construct modal
  // G53: a megaconstruct chosen in the rich picker routes HERE for its placement step - the
  // template locked, the AU field seeded from the click when the GM clicked a place.
  let constructInitialTemplate: CelestialBody | undefined = undefined;
  let constructInitialAuDistance: number | undefined = undefined;
  /** G53: how far from the host the GM clicked, AU - known before a template is even chosen. */
  let constructClickAU: number | undefined = undefined;
  let showBackgroundContextMenu = false;
  let contextMenuActionLabel = 'Add Planet Here';
  let showAddBeltOption = false;
  let showAddRingOption = false;

  // Edit Construct Modal State
  let showConstructEditorModal = false;
  let constructToEdit: CelestialBody | null = null;
  let constructHostBodyForEditor: CelestialBody | null = null;

  // ...

  function handleBackgroundContextMenu(event: CustomEvent<{ x: number, y: number, dominantBody: CelestialBody | Barycenter | null, screenX: number, screenY: number, lagrangeHit?: { secondaryId: string; secondaryName: string; point: string } | null, circumbinaryHit?: { baryId: string; baryName: string } | null }>) {
      backgroundClickHost = event.detail.dominantBody;
      backgroundClickPosition = { x: event.detail.x, y: event.detail.y };
      backgroundLagrangeHit = event.detail.lagrangeHit ?? null;
      backgroundCircumbinaryHit = event.detail.circumbinaryHit ?? null;
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

  // G43: the click landed inside an L4/L5 area — offer a TROJAN of that secondary. The body picker
  // opens with the pair's trojan mass guide; the created body carries the coOrbital marker and the
  // processor derives its orbit from the secondary every pass.
  function handleAddTrojanFromBackground() {
      showBackgroundContextMenu = false;
      const hit = backgroundLagrangeHit;
      backgroundLagrangeHit = null;
      if (!hit || !$systemStore) return;
      const secondary = $systemStore.nodes.find(n => n.id === hit.secondaryId) as CelestialBody | undefined;
      const star = secondary?.parentId ? $systemStore.nodes.find(n => n.id === secondary.parentId) : null;
      if (!secondary?.orbit || !star) return;
      const starMassKg = ((star as any).kind === 'barycenter' ? (star as any).effectiveMassKg : (star as any).massKg) || 0;
      const aAU = secondary.orbit.elements.a_AU || 1;
      const probe = { id: 'probe', kind: 'body', roleHint: 'planet', parentId: star.id,
          orbit: { hostId: star.id, elements: { a_AU: aAU, e: 0, i_deg: 0, omega_deg: 0, Omega_deg: 0, M0_rad: 0 } } } as unknown as CelestialBody;
      const teqK = calculateEquilibriumTemperature(probe, $systemStore.nodes, 0.3);
      pendingAdd = {
          distAU: aAU, startAngle: 0, hostId: star.id, hostMassKg: secondary.massKg || 0,
          role: 'moon', teqK, ageGyr: ($systemStore as any)?.age_Gyr, canTidallyLock: undefined,
          trojan: { secondaryId: secondary.id, secondaryName: secondary.name, point: hit.point as 'l4' | 'l5',
                    maxTrojanMassKg: maxTrojanMassKg(starMassKg, secondary.massKg || 0) }
      };
      showAddTypeModal = true;
  }

  // G43: put a CONSTRUCT at whichever of the five points was clicked. All five are offered — what
  // each costs is physics and arrives as the flight/fuel-use tag, so the menu does not judge. The
  // modal opens on the secondary with the point preselected, and its own placement writer stamps
  // the coOrbital marker and derives the orbit.
  function handleAddConstructAtLagrange() {
      showBackgroundContextMenu = false;
      const hit = backgroundLagrangeHit;
      backgroundLagrangeHit = null;
      if (!hit || !$systemStore) return;
      const secondary = $systemStore.nodes.find(n => n.id === hit.secondaryId) as CelestialBody | undefined;
      if (!secondary) return;
      constructHostBody = secondary;
      constructInitialPlacement = hit.point.toUpperCase();
      constructInitialTemplate = undefined;
      constructInitialAuDistance = undefined;
      showAddConstructModal = true;
  }

  // Absolute position of any node, by walking the hierarchy and propagating each hop. Was a local
  // closure inside handleCreateBodyFromBackground; hoisted so the circumbinary handler measures its
  // click against the barycentre with the SAME arithmetic rather than a second copy of it.
  function absolutePositionOf(nodeId: string): { x: number, y: number } {
      if (!$systemStore) return { x: 0, y: 0 };
      const node = $systemStore.nodes.find(n => n.id === nodeId);
      if (!node || !node.parentId) return { x: 0, y: 0 };
      const parentPos = absolutePositionOf(node.parentId);
      let relativePos = { x: 0, y: 0 };
      if ((node.kind === 'body' || node.kind === 'construct' || node.kind === 'barycenter') && (node as any).orbit) {
          const p = propagate(node as any, currentTime);
          if (p) relativePos = p;
      }
      return { x: parentPos.x + relativePos.x, y: parentPos.y + relativePos.y };
  }

  // G45: the click landed inside a pair's drawn circumbinary ring — offer a P-type body of that
  // pair. The host is the BARYCENTRE (which is what makes it circumbinary), the distance is measured
  // from the barycentre, and the type picker is given a mass CEILING rather than a mass rule: the
  // Holman & Wiegert annulus is a massless-test-particle result, so a body comparable to the pair is
  // outside what any of this models. It is a guide the GM can switch off, like every other gate.
  function handleAddCircumbinaryFromBackground() {
      showBackgroundContextMenu = false;
      const hit = backgroundCircumbinaryHit;
      backgroundCircumbinaryHit = null;
      if (!hit || !$systemStore) return;
      const bary = $systemStore.nodes.find(n => n.id === hit.baryId) as Barycenter | undefined;
      if (!bary) return;
      const pairMassKg = bary.effectiveMassKg || 0;
      const baryPos = absolutePositionOf(bary.id);
      const dx = (backgroundClickPosition?.x ?? 0) - baryPos.x;
      const dy = (backgroundClickPosition?.y ?? 0) - baryPos.y;
      const distAU = Math.hypot(dx, dy);
      if (!(distAU > 0)) return;
      // A pair of STARS hosts planets; a pair of anything else hosts moons. Same question the rest of
      // the menu asks, asked of the members rather than of a single host.
      const members = (bary.memberIds || []).map(id => $systemStore!.nodes.find(n => n.id === id)).filter(Boolean) as CelestialBody[];
      const role: 'planet' | 'moon' = members.some(m => m.roleHint === 'star') ? 'planet' : 'moon';
      const probe = { id: 'probe', kind: 'body', roleHint: role, parentId: bary.id,
          orbit: { hostId: bary.id, elements: { a_AU: distAU, e: 0, i_deg: 0, omega_deg: 0, Omega_deg: 0, M0_rad: 0 } } } as unknown as CelestialBody;
      const teqK = calculateEquilibriumTemperature(probe, $systemStore.nodes, 0.3);
      pendingAdd = {
          distAU, startAngle: Math.atan2(dy, dx), hostId: bary.id, hostMassKg: pairMassKg,
          role, teqK, ageGyr: ($systemStore as any)?.age_Gyr, canTidallyLock: undefined,
          circumbinary: { pairName: bary.name || 'the pair', maxMassKg: maxCircumbinaryMassKg(pairMassKg) }
      };
      showAddTypeModal = true;
  }

  function handleCreateBodyFromBackground(forceRole?: string) {
      showBackgroundContextMenu = false;
      const host = backgroundClickHost;
      if (!host || !$systemStore) return;

      // 1. Calculate Distance (a_AU) & Angle
      let distAU = 0;
      let startAngle = 0;
      
      let hostPos = { x: 0, y: 0 };
      if (host.parentId) hostPos = absolutePositionOf(host.id);

      const dx = backgroundClickPosition!.x - hostPos.x;
      const dy = backgroundClickPosition!.y - hostPos.y;
      distAU = Math.sqrt(dx*dx + dy*dy);
      startAngle = Math.atan2(dy, dx);

      // §4c: for a planet/moon (not a belt/ring), offer the TYPES viable at this orbit instead of
      // auto-assigning one. Compute the equilibrium temperature here, then open the picker.
      if (forceRole !== 'belt' && forceRole !== 'ring') {
          const role: 'planet' | 'moon' = host.roleHint === 'star' ? 'planet' : 'moon';
          const hostMassKg = (host as CelestialBody).massKg || (host as Barycenter).effectiveMassKg || 0;
          const probe = { id: 'probe', kind: 'body', roleHint: 'planet', parentId: host.id,
              orbit: { hostId: host.id, elements: { a_AU: Math.max(distAU, 1e-6), e: 0, i_deg: 0, omega_deg: 0, Omega_deg: 0, M0_rad: 0 } } } as unknown as CelestialBody;
          const teqK = calculateEquilibriumTemperature(probe, $systemStore.nodes, 0.3);
          // The picker's physics filters want the system's age and whether this orbit can lock a
          // planet in that time; both are answered here so the picker and the generator judge
          // viability from the same context.
          const ageGyr: number | undefined = ($systemStore as any)?.age_Gyr;
          const canTidallyLock = role === 'planet' && hostMassKg > 0
              ? predictTidalLock(distAU, EARTH_RADIUS_KM, EARTH_MASS_KG, hostMassKg, ageGyr ?? 4.6)
              : undefined;
          pendingAdd = { distAU, startAngle, hostId: host.id, hostMassKg, role, teqK, ageGyr, canTidallyLock };
          showAddTypeModal = true;
          return;
      }

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
              const zones = calculateAllStellarZones(host as CelestialBody, rulePack, ($systemStore?.nodes || []) as any);
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

      // 4.2 PROVENANCE — the same invariant the two generators carry (inbox B10, D2a). This route
      // builds its body inline and touches neither BodyFactory nor _generatePlanetaryBody, so
      // nothing it invented was ever marked: a hand-added world stated its tilt exactly as firmly
      // as Earth does. The rule EXISTED and simply did not reach here, which is how B9a happened.
      // Which values qualify — and why the die-rolled magnetic field does not, since the processor
      // always replaces it — lives in spinProvenance.ts. One rule, three routes.
      newPlanet.tags.push(...spinProvenanceTags(newPlanet));

      // 4.3 C3(c): a moon far enough out follows the SYSTEM plane rather than its host's equator.
      // Same helper the generators call, imported rather than copied — this block having its own
      // private copy of everything is the fault, not the pattern to follow.
      if (newPlanet.roleHint === 'moon' && (host as CelestialBody).orbit) {
          const hostOrbit = (host as CelestialBody).orbit!;
          const isGiantHost = ((host as CelestialBody).classes || []).some((c) => c.includes('gas-giant') || c.includes('ice-giant'));
          const rL = laplaceRadiusAU(host as CelestialBody, hostOrbit.elements.a_AU, hostOrbit.hostMu / G, isGiantHost, rulePack);
          if (rL != null && newPlanet.orbit.elements.a_AU > rL) newPlanet.orbit.frame = 'ecliptic';
      }

      // 4.5 Calculate Temperature (Fix for 0K issue)
      // We need to pass the new planet as if it were in the system to check relationships
      // But the function takes 'body' and 'allNodes'.
      // If we pass 'newPlanet', it has parentId.
      // We just need to make sure allNodes contains the stars/barycenters.
      // It doesn't strictly need newPlanet to be IN the array, unless we traverse UP from it?
      // No, the function uses 'allNodes.find(n => n.id === body.parentId)'.
      // So as long as the parent is in allNodes, we are good.
      const tempK = calculateEquilibriumTemperature(newPlanet, $systemStore.nodes, estimateBondAlbedo(newPlanet));
      newPlanet.equilibriumTempK = tempK;
      newPlanet.internalHeatK = estimateInternalHeatK(newPlanet, rulePack, ($systemStore as any)?.age_Gyr ?? 4.6);
      newPlanet.temperatureK = composeSurfaceTemperatureFromDeltaComponents(
          tempK,
          newPlanet.greenhouseTempK || 0,
          newPlanet.tidalHeatK || 0,
          newPlanet.radiogenicHeatK || 0,
          newPlanet.internalHeatK || 0
      );

      // 5. Commit & Focus
      systemStore.update(s => {
          if (!s) return s;
          return { ...s, nodes: [...s.nodes, newPlanet] };
      });
      updateFocus(newPlanet.id);
      isEditing = true;
  }

  // §4c: the GM picked a type from the location-aware picker — generate a matching body, drop it at
  // the clicked orbit, and let the full processor derive the rest.
  function placeBodyOfType(event: CustomEvent<{ fp: any }>) {
      showAddTypeModal = false;
      const ctx = pendingAdd; pendingAdd = null;
      if (!ctx || !$systemStore) return;
      const host = $systemStore.nodes.find(n => n.id === ctx.hostId);
      if (!host) return;

      // G43: a trojan placement — the body is a sibling of its secondary (both orbit the star),
      // carries the coOrbital marker, and gets its orbit from the one convention module. The
      // process() below re-derives it every pass thereafter.
      //
      // UNLESS THE POINT IS ALREADY TAKEN (B111's third part). A second marker at an occupied point
      // derives a second rider exactly on top of the first - same ellipse, same phase, invisibly
      // stacked - and both being children of the star, no mass ratio ever compares them and no pair
      // can form however the GM fiddles. What a GM adding a body onto an existing trojan MEANS is a
      // COMPANION: parented to the rider, orbiting inside its Hill sphere, no marker of its own.
      // The reconciler then does what it already knows how to do - a comparable mass promotes into
      // a pair whose barycentre rides the point (B98/PHY-32); a small one stays the trojan's moon.
      if (ctx.trojan) {
          const secondary = $systemStore.nodes.find(n => n.id === ctx.trojan!.secondaryId) as CelestialBody | undefined;
          if (!secondary) return;
          const gen = generateBodyOfType(event.detail.fp, { distAU: ctx.distAU, hostMassKg: ctx.hostMassKg, role: ctx.role, teqK: ctx.teqK });
          const starMassKg = ((host as any).kind === 'barycenter' ? (host as any).effectiveMassKg : (host as any).massKg) || 0;
          const placement = placeBodyAtCoOrbitalPoint($systemStore, secondary.id, ctx.trojan.point, starMassKg);

          let trojanBody: CelestialBody;
          if (placement.kind === 'companion' && placement.rider) {
              const rider = placement.rider;
              const riderMassKg = ((rider as any).kind === 'barycenter' ? (rider as any).effectiveMassKg : (rider as any).massKg) || 0;
              // Never inside contact: the suggestion is a quarter Hill radius, floored well clear
              // of the two surfaces for a rider small enough that the Hill fraction dips inside.
              const contactAU = (((rider as any).radiusKm || 0) + ((gen as any).radiusKm || 0)) * 4 / AU_KM;
              const aAU = Math.max(placement.suggestedAAU ?? contactAU, contactAU, 1e-9);
              trojanBody = {
                  id: generateId(),
                  name: `${(rider as any).name} Companion`,
                  kind: 'body',
                  parentId: rider.id,
                  roleHint: 'moon',
                  atmosphere: { name: 'None', composition: {}, pressure_bar: 0 },
                  hydrosphere: { coverage: 0, composition: 'water' },
                  biosphere: null,
                  classes: [],
                  ...gen,
                  tags: [...(gen.tags || [])],
                  orbit: {
                      hostId: rider.id,
                      hostMu: riderMassKg * G,
                      t0: currentTime,
                      elements: { a_AU: aAU, e: 0.02, i_deg: 0, omega_deg: 0, Omega_deg: 0, M0_rad: Math.random() * 2 * Math.PI }
                  }
              } as CelestialBody;
          } else {
              trojanBody = {
                  id: generateId(),
                  name: `${secondary.name} ${ctx.trojan.point.toUpperCase()} Trojan`,
                  kind: 'body',
                  parentId: host.id,
                  ui_parentId: secondary.id,
                  roleHint: 'moon',
                  atmosphere: { name: 'None', composition: {}, pressure_bar: 0 },
                  hydrosphere: { coverage: 0, composition: 'water' },
                  biosphere: null,
                  classes: [],
                  ...gen,
                  tags: [...(gen.tags || [])],
                  coOrbital: { hostId: secondary.id, point: ctx.trojan.point },
                  orbit: deriveCoOrbitalOrbit(secondary, starMassKg, ctx.trojan.point) ?? undefined
              } as CelestialBody;
          }
          systemStore.set({ ...systemProcessor.process({ ...$systemStore, nodes: [...$systemStore.nodes, trojanBody] }, rulePack) });
          updateFocus(trojanBody.id);
          isEditing = true;
          return;
      }

      const siblings = $systemStore.nodes.filter(n => n.parentId === ctx.hostId);
      const gen = generateBodyOfType(event.detail.fp, { distAU: ctx.distAU, hostMassKg: ctx.hostMassKg, role: ctx.role, teqK: ctx.teqK });
      // Some moons are CAPTURED rogues (irregular satellites): eccentric, inclined, often retrograde —
      // a Triton/irregular-moon flavour, distinct from the flat regular satellites that formed in place.
      const captured = ctx.role === 'moon' && Math.random() < 0.18;
      const newBody: CelestialBody = {
          id: generateId(),
          name: `${host.name} ${toRoman(siblings.length + 1)}`,
          kind: 'body',
          parentId: ctx.hostId,
          roleHint: ctx.role,
          atmosphere: { name: 'None', composition: {}, pressure_bar: 0 },
          hydrosphere: { coverage: 0, composition: 'water' },
          biosphere: null,
          classes: [],
          ...gen,
          tags: [...(gen.tags || []), ...(captured ? [{ key: 'origin/captured' }] : [])],
          orbit: {
              hostId: ctx.hostId,
              hostMu: ctx.hostMassKg * G,
              t0: currentTime,
              isRetrogradeOrbit: captured && Math.random() < 0.6,
              elements: {
                  a_AU: Math.max(ctx.distAU, 1e-6),
                  e: captured ? 0.1 + Math.random() * 0.35 : 0.01 + Math.random() * 0.04,
                  i_deg: captured ? 20 + Math.random() * 140 : Math.random() * 5,
                  omega_deg: Math.random() * 360, Omega_deg: Math.random() * 360, M0_rad: ctx.startAngle
              }
          }
      } as CelestialBody;
      systemStore.set({ ...systemProcessor.process({ ...$systemStore, nodes: [...$systemStore.nodes, newBody] }, rulePack) });
      updateFocus(newBody.id);
      isEditing = true;
  }

  function handleCreateConstructFromBackground() {
      showCreateConstructModal = true;
      showBackgroundContextMenu = false;
      constructHostBody = null;
      // G53: THE CLICK ALREADY SAID WHERE. Measure it once here so the picker can show a
      // megaconstruct's placement advice while the GM is still choosing - the warning belongs
      // BEFORE the commit, which is the whole point of steering rather than stopping.
      constructClickAU = undefined;
      if (backgroundClickHost && backgroundClickPosition) {
          const hp = backgroundClickHost.parentId ? absolutePositionOf(backgroundClickHost.id) : { x: 0, y: 0 };
          constructClickAU = Math.hypot(backgroundClickPosition.x - hp.x, backgroundClickPosition.y - hp.y);
      }
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

      // G53: a megaconstruct is placement-SENSITIVE, so it never takes the default-orbit stamp.
      // The rich picker chose WHAT; AddConstructModal chooses WHERE, with the hard/steer machinery
      // attached - and the AU field starts at the clicked distance when there is one.
      // G53: ASK ONLY WHEN THE CLICK DID NOT ALREADY SAY WHERE (owner, 2026-08-28: "that is where I
      // clicked - so that is where it should be"). An ordinary construct placed from "Add Construct
      // Here" has never been asked a second time; the mega placement dialog was a step I added on
      // top of that, and on the click route it re-asks a question the GM has answered. So the
      // dialog is now reserved for the route with NO click - "Add Construct" on a body, where
      // nothing says where it goes - and the click route falls through to the ordinary creation
      // path below, gaining only its steer tags.
      const clickPlaced = !!(backgroundClickPosition && backgroundClickHost);
      if ((template as CelestialBody).megaType && !clickPlaced) {
          showCreateConstructModal = false;
          constructHostBody = host as CelestialBody;
          constructInitialTemplate = template;
          constructInitialPlacement = undefined;
          constructInitialAuDistance = undefined;
          showAddConstructModal = true;
          return;
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

      // G53: the placement went ahead - record WHY it is interesting. Same evaluator and same tags
      // the dialog route stamps, so a mega placed by clicking and one placed through the dialog
      // carry identical provenance; only the number of questions asked differs.
      if ((newConstruct as any).megaType) {
          const mDef = megaTypeDef((newConstruct as any).megaType);
          const notes = megaSteerNotes(
              effectiveMegaRequires(newConstruct as any, mDef),
              host as any,
              {
                  placementAU: distAU > 0 ? distAU : undefined,
                  goldilocks: (host as any).roleHint === 'star'
                      ? calculateGoldilocksZone(host as any, $systemStore.nodes as any)
                      : null
              }
          );
          if (notes.length) newConstruct.tags = [...(newConstruct.tags ?? []), ...notes.map((n) => n.tag)];
      }
      console.log('Creating New Construct:', newConstruct);

      // Add to System
      systemStore.update(s => {
          if (!s) return s;
          return {
              ...s,
              nodes: [...s.nodes, newConstruct]
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
      constructInitialTemplate = undefined;
      constructInitialAuDistance = undefined;
      
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
    let updatedConstruct = event.detail;
    delete apTopUpMark[updatedConstruct.id]; // a manual edit (refuel / route change) gets a fresh top-up attempt
    systemStore.update(system => {
      if (!system) return null;

      // Autopilot: an engaged ship with no pending journeys gets its plan flown — generate the chain
      // from its current position + the clock and attach it. (Regenerates once it runs dry; clock-advance
      // top-up + status/disengage come next.)
      if ((updatedConstruct as any).autopilot?.enabled
          && countFutureJourneys(updatedConstruct, currentTime) === 0) {
        try {
          const working = { ...system, nodes: system.nodes.map(n => n.id === updatedConstruct.id ? updatedConstruct : n) };
          const gen = generateAutopilotChain(updatedConstruct, working, rulePack, currentTime);
          if (gen?.logs?.length) {
            updatedConstruct = { ...updatedConstruct,
              scheduled_journeys: [ ...(updatedConstruct.scheduled_journeys || []), ...gen.logs ],
              flight_log: [ ...(updatedConstruct.flight_log || []), ...gen.flightLog ],
              autopilotStuckReason: undefined };
          } else {
            // No journeys — engaged but going nowhere. ALWAYS surface why (null = couldn't even start, e.g.
            // missing engine/fuel data or no ship specs) so the ship never silently sits there "flying".
            console.warn('[autopilot] no journeys generated:', gen?.attention, gen?.stuckReason);
            updatedConstruct = { ...updatedConstruct, autopilotStuckReason: gen ? apReasonText(gen) : 'could not start — no engine/fuel data or ship specs' };
          }
        } catch (e) {
          console.warn('[autopilot] chain generation failed:', e);
          updatedConstruct = { ...updatedConstruct, autopilotStuckReason: 'planner error while plotting the route (see console)' };
        }
      }

      const nodeIndex = system.nodes.findIndex(n => n.id === updatedConstruct.id);
      if (nodeIndex !== -1) {
        system.nodes[nodeIndex] = updatedConstruct;
      }
      return { ...system };
    });
  }

  // --- Autopilot clock top-up + run-once disengage. Keyed on the DISPLAY clock (the GM's working view),
  //     so a ship visibly keeps flying as they scrub/play. Top-up keeps exactly Planning legs committed AHEAD
  //     of the display clock (what the slider promises), appending as the clock advances — never destructive on
  //     scrub-back. The hard disengage commits at ACTUAL time (the backstop). ---
  // How many FLOWN autopilot legs to keep in the heavy journey/path data (the orrery draws these). A repeat
  // ship tops up forever, so otherwise the committed past grows without bound (a spider-web of stale paths).
  // The lightweight flight-log history is kept FOREVER — only this regenerable journey data is bounded.
  const AP_KEEP_FLOWN = 2;
  function endOfLogs(logs: any[]): number {
    let end = -Infinity;
    for (const l of logs || []) { if (l.status === 'cancelled') continue; const b = getJourneyBounds(l.plans); if (b) end = Math.max(end, b.endMs); }
    return end;
  }
  // Human reason a course couldn't be plotted, for the Autopilot tab (so the GM doesn't need the console).
  function apReasonText(gen: { attention: string | null; stuckReason?: string }): string {
    if (gen.stuckReason) return gen.stuckReason;
    if (gen.attention === 'intervention') return 'no resolvable stops — check the resource or place exists and is reachable';
    return 'could not plot a course';
  }
  const planningOf = (n: any) => Math.max(1, Math.floor(n.autopilot?.planning ?? 2));
  // Per-ship "last future-leg count we already handled". The replan must fire ONCE per leg-completion — i.e.
  // only when the future count has freshly DROPPED below Planning — never re-attempt at a level we've already
  // tried (so a ship that can't be topped up, e.g. stuck on fuel, doesn't re-solve its route every frame).
  // Cleared on a manual edit (refuel / route change) so the ship gets a fresh attempt. Nothing changes between
  // leg-completions, so between them there is zero solving.
  let apTopUpMark: Record<string, number> = {};
  function maybeTopUpAutopilot(displayMs: number) {
    if (!Number.isFinite(displayMs)) return;
    const sys = get(systemStore);
    if (!sys) return;
    const wantsGen = (n: any) => n.kind === 'construct' && n.autopilot?.enabled && n.autopilot.repeat !== false
      && (n.scheduled_journeys || []).some((l: any) => l.status !== 'cancelled')
      && (() => { const f = countFutureJourneys(n, displayMs); return f < planningOf(n) && f < (apTopUpMark[n.id] ?? Infinity); })();
    if (!sys.nodes.some(wantsGen)) return;
    systemStore.update((s) => {
      if (!s) return s;
      let changed = false;
      const nodes = s.nodes.map((n: any) => {
        if (n.kind !== 'construct' || !n.autopilot?.enabled || n.autopilot.repeat === false) return n;
        const planning = planningOf(n);
        let logs = n.scheduled_journeys || [];
        let flog = n.flight_log || [];
        let future = countFutureJourneys({ ...n, scheduled_journeys: logs }, displayMs);
        // Only on a FRESH drop below Planning; record the level so the same shortfall isn't retried every frame.
        if (future >= planning || future >= (apTopUpMark[n.id] ?? Infinity)) { apTopUpMark[n.id] = future; return n; }
        let added = false, guard = 0;
        // Append from the chain's end until Planning legs are committed ahead of the display clock.
        while (future < planning && guard++ < 24) {
          const end = endOfLogs(logs);
          const from = Number.isFinite(end) ? end : displayMs;
          try {
            const gen = generateAutopilotChain({ ...n, scheduled_journeys: logs }, s, rulePack, from, planning - future);
            if (!gen?.logs?.length) break;
            logs = [...logs, ...gen.logs];
            flog = [...flog, ...gen.flightLog];
          } catch (e) { console.warn('[autopilot] top-up failed:', e); break; }
          const nf = countFutureJourneys({ ...n, scheduled_journeys: logs }, displayMs);
          if (nf <= future) break; // no forward progress → stop (avoid a spin)
          future = nf; added = true;
        }
        apTopUpMark[n.id] = future; // Planning if topped up, else the stuck level — don't re-solve it next frame.
        if (added) { changed = true; return { ...n, scheduled_journeys: logs, flight_log: flog }; }
        return n;
      });
      return changed ? { ...s, nodes } : s;
    });
  }

  function handleBodyUpdate(event: CustomEvent<CelestialBody>) {
    let updatedBody = event.detail;
    systemStore.update(system => {
      if (!system) return null;

      // Autopilot: an engaged ship with no pending journeys gets its plan flown — generate the journey
      // chain from its current position + the clock and attach it. (Regenerates after it runs dry; the
      // clock-advance top-up + status/disengage wiring come next.)
      if (updatedBody.kind === 'construct' && (updatedBody as any).autopilot?.enabled
          && countFutureJourneys(updatedBody, currentTime) === 0) {
        try {
          const working = { ...system, nodes: system.nodes.map(n => n.id === updatedBody.id ? updatedBody : n) };
          const gen = generateAutopilotChain(updatedBody, working, rulePack, currentTime);
          if (gen?.logs?.length) {
            updatedBody = { ...updatedBody,
              scheduled_journeys: [ ...(updatedBody.scheduled_journeys || []), ...gen.logs ],
              flight_log: [ ...(updatedBody.flight_log || []), ...gen.flightLog ],
              autopilotStuckReason: undefined };
          } else {
            updatedBody = { ...updatedBody, autopilotStuckReason: gen ? apReasonText(gen) : 'could not start — no engine/fuel data or ship specs' };
          }
        } catch (e) {
          console.warn('[autopilot] chain generation failed:', e);
          updatedBody = { ...updatedBody, autopilotStuckReason: 'planner error while plotting the route (see console)' };
        }
      }

      const nodeIndex = system.nodes.findIndex(n => n.id === updatedBody.id);
      if (nodeIndex !== -1) {
        system.nodes[nodeIndex] = updatedBody;
      }

      // Always recalculate physics (Radiation, Temp, Period) when any body is updated
      const processed = systemProcessor.process({ ...system, nodes: system.nodes }, rulePack);
      return { ...processed };
    });
  }

  let showReportConfigModal = false;

  function handleGenerateReport(event: CustomEvent<{mode: 'GM' | 'Player', theme: string, includeConstructs: boolean}>) {
      if (!$systemStore) return;
      const reportData = {
          system: $systemStore,
          mode: event.detail.mode,
          theme: event.detail.theme,
          includeConstructs: event.detail.includeConstructs,
          unitPrefs: get(unitPrefs) // carry the campaign's unit choices into the (separate-route) report
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
  let timeScale = 0;
  let displayClockLabel = '';
  let displayClockSeconds = '';
  let masterClockSeconds = '';
  let masterCalendarLabel = '';
  let alignRafId: number | null = null;
  let isAligningTime = false;
  let alignActualSecondsOverride: bigint | null = null;
  // Target (the new "now") shown on the Actual read-out during the align, while
  // alignActualSecondsOverride animates the Display read-out up to it.
  let alignTargetSec: bigint | null = null;


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

  function updateTemporalDisplayState() {
    const starmap = get(starmapStore);
    if (!starmap?.temporal) return;
    const temporal = starmap.temporal;
    const resolved = resolveTemporalDisplay(temporal);
    displayClockLabel = resolved.formatted;
    displayClockSeconds = parseClockSeconds(temporal.displayTimeSec, 0n).toString();
    const persistedMasterSeconds = parseClockSeconds(temporal.masterTimeSec, 0n);
    const masterSeconds = (isAligningTime && alignActualSecondsOverride !== null)
      ? alignActualSecondsOverride
      : persistedMasterSeconds;
    masterClockSeconds = masterSeconds.toString();
    const calendar = temporal.temporal_registry[temporal.activeCalendarKey];
    masterCalendarLabel = calendar ? resolveCalendar(masterSeconds, calendar).formatted : masterClockSeconds;
  }

  function applyTemporalUpdate(mutator: (temporal: NonNullable<Starmap['temporal']>) => NonNullable<Starmap['temporal']>) {
    starmapStore.update((map) => {
      if (!map) return map;
      const normalized = ensureTemporalState(map);
      const nextTemporal = mutator(normalized.temporal!);
      return { ...normalized, temporal: nextTemporal };
    });
  }

  // --- Shared <TimeControls> wiring (Phase 01.1 part 2b) ---
  // The component owns the scrub/play UI; we forward its temporal updates into
  // the starmap. The reactive block below (currentTime derivation) keeps the
  // orbit simulation in step, and masterOverrideSec lets the actual-time read-out
  // keep counting up during the 5-sec align.
  $: ensuredTemporal = $starmapStore ? ensureTemporalState($starmapStore).temporal! : null;

  function handleTimeControlsUpdate(event: CustomEvent) {
    applyTemporalUpdate(() => event.detail);
  }

  // Actual/master clock on the SAME unix-ms scale as currentTime + journey times (mirrors the currentTime
  // derivation in the reactive below, but from masterTimeSec). NB getActualTimeMs() returns masterSec*1000
  // WITHOUT the Big-Bang offset — that's a different (universe-ms) scale and must NOT be compared with
  // journey times; this is the correct one for the ship-log seek cutoff.
  $: actualTimeMs = ensuredTemporal
    ? Number(parseClockSeconds(ensuredTemporal.masterTimeSec, 0n) - BIG_BANG_TO_UNIX_EPOCH_T) * 1000
    : currentTime;

  // Ship's-log "jump display time here": set DISPLAY time only (a preview/scrub, never touches actual time).
  // The reactive currentTime derivation picks it up. The clocks are only offered for times >= actualTimeMs,
  // so this never rewinds display before the committed present.
  function handleSeekDisplayTime(event: CustomEvent) {
    const ms = event.detail?.ms;
    if (!Number.isFinite(ms)) return;
    stopAlignAnimation();
    isAligningTime = false;
    alignActualSecondsOverride = null;
    const displaySec = unixMsToMasterSeconds(ms);
    applyTemporalUpdate((time) => ({ ...time, displayTimeSec: displaySec.toString() }));
  }

  function handleToggleVisibility() {
    if (focusedBody && $systemStore) {
      systemStore.update(sys => {
        if (!sys) return null;
        const updatedNodes = sys.nodes.map(n =>
          n.id === focusedBody!.id
            ? { ...n, object_playerhidden: !n.object_playerhidden }
            : n
        );
        return { ...sys, nodes: updatedNodes };
      });
    }
  }

  function stopAlignAnimation() {
    if (alignRafId !== null) {
      cancelAnimationFrame(alignRafId);
      alignRafId = null;
    }
    alignActualSecondsOverride = null;
    alignTargetSec = null;
  }

  function handleAlignActualToDisplayAnimated() {
    const map = get(starmapStore);
    const temporal = map?.temporal;
    if (!temporal) return;

    const actualSec = parseClockSeconds(temporal.masterTimeSec, 0n);
    const targetDisplaySec = parseClockSeconds(temporal.displayTimeSec, actualSec);
    const startMs = Number(actualSec * 1000n);
    const targetMs = Number(targetDisplaySec * 1000n);

    // (TimeControls already stops its own playback before dispatching setactual.)
    stopAlignAnimation();
    isAligningTime = true;
    alignActualSecondsOverride = actualSec;
    alignTargetSec = targetDisplaySec;
    updateTemporalDisplayState();

    // Phase 1: snap simulation/orbits to current Actual Time.
    currentTime = startMs;

    // Phase 2: animate simulation time to the captured Display Time.
    const durationMs = 5000;
    const animStart = performance.now();
    function animate(now: number) {
      const t = Math.min(1, (now - animStart) / durationMs);
      const eased = t < 0.5 ? (2 * t * t) : (1 - Math.pow(-2 * t + 2, 2) / 2);
      currentTime = startMs + ((targetMs - startMs) * eased);
      alignActualSecondsOverride = BigInt(Math.floor(currentTime / 1000));
      updateTemporalDisplayState();
      if (t < 1) {
        alignRafId = requestAnimationFrame(animate);
      } else {
        alignRafId = null;
        currentTime = targetMs;
        applyTemporalUpdate((time) => ({
          ...setMasterToDisplay({
            ...time,
            displayTimeSec: targetDisplaySec.toString()
          }),
          displayTimeSec: targetDisplaySec.toString()
        }));
        isAligningTime = false;
        alignActualSecondsOverride = null;
        alignTargetSec = null;
        updateTemporalDisplayState();
      }
    }
    alignRafId = requestAnimationFrame(animate);
  }

  function handleResetDisplayToActual() {
    // (TimeControls already stops its own playback before dispatching resetdisplay.)
    stopAlignAnimation();
    isAligningTime = false;
    alignActualSecondsOverride = null;
    const map = get(starmapStore);
    const temporal = map?.temporal;
    if (!temporal) return;
    const actualSec = parseClockSeconds(temporal.masterTimeSec, 0n);
    
    currentTime = Number(actualSec * 1000n);
    
    applyTemporalUpdate((time) => ({
      ...time,
      displayTimeSec: actualSec.toString()
    }));
  }

  async function handleGenerate(empty: boolean = false) {
    const seed = `seed-${Date.now()}`;
    // Keep the old ID to preserve starmap link
    const oldId = $systemStore?.id;
    
    const newSystem = generateSystem(seed, rulePack, {}, selectedGenerationOption, empty, $systemStore?.toytownFactor || 0);
    
    if (oldId) {
        newSystem.id = oldId;
    }

    systemStore.set(newSystem);
    const map = get(starmapStore);
    if (map?.temporal) {
        const universeSec = parseClockSeconds(map.temporal.displayTimeSec, 0n);
        currentTime = Number(universeSec - BIG_BANG_TO_UNIX_EPOCH_T) * 1000;
    } else {
        currentTime = newSystem.epochT0;
    }
    updateFocus(null, true); // Reset focus
  }

  // Barycentres are never directly selectable: selecting one (a click, a picker, a saved focus, or the
  // system root) resolves to its PRIMARY (most-massive) member, recursing through nested barycentres.
  // The pair is then edited from that member's panel (distance-from-host + separation sliders).
  function primaryMemberOf(id: string | null): string | null {
      if (!id || !$systemStore) return id;
      const byId = new Map($systemStore.nodes.map((n) => [n.id, n]));
      let node: any = byId.get(id);
      let guard = 0;
      while (node && node.kind === 'barycenter' && guard++ < 16) {
          const members = ((node.memberIds || []) as string[]).map((m) => byId.get(m)).filter(Boolean) as any[];
          if (!members.length) break;
          node = members.reduce((best, m) =>
              ((m.massKg || m.effectiveMassKg || 0) > (best.massKg || best.effectiveMassKg || 0) ? m : best));
      }
      return node?.id ?? id;
  }

  function updateFocus(id: string | null, replace: boolean = false) {
      isEditing = false;
      showZoneKeyPanel = false; // Close Zone Key on navigation

      // Targeting the system root (a lone star OR the root barycentre) is the System View default —
      // no body selected. Otherwise a barycentre target resolves to its primary member.
      if (rootStar && id === rootStar.id) {
          id = null;
      } else {
          id = primaryMemberOf(id);
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
      // If the parent is the root barycentre, there's nothing higher in-system (the barycentre isn't
      // selectable) — a top-level binary member zooms straight out to the starmap, like a lone root star.
      const parent = $systemStore?.nodes.find(n => n.id === focusedBody!.parentId);
      if (parent && !parent.parentId && parent.kind === 'barycenter') {
        dispatch('back', { force: true });
        return;
      }
      updateFocus(focusedBody.parentId, true);
    } else {
      // "To Starmap" button clicked. Force exit to ensure state is cleared.
      dispatch('back', { force: true });
    }
  }

  // Reactive Focus Handling via SvelteKit Router State
  $: focusedBodyId = primaryMemberOf($page.state.focusId ?? ($systemStore?.nodes.find(n => !n.parentId)?.id || null));
  $: focusedBody = $systemStore?.nodes.find(n => n.id === focusedBodyId) as CelestialBody || null;
  // G28: the selection NAMES an undo step when one edit moves several bodies (give Earth mass and
  // tidally-locked Luna's rotation period follows). Naming only - it never decides what is recorded.
  $: setUndoFocus(focusedBodyId);
  // For a construct, its *current* host is where its journeys have taken it (e.g. a
  // planet it's parked at), not its authored parentId (often the star it was first
  // placed around). Resolving this at the display time keeps land/takeoff + the specs
  // panel pointed at the real body. Non-constructs just use parentId as before.
  $: currentHostId = focusedBody
      ? (focusedBody.kind === 'construct'
          ? resolveConstructCurrentHostId(focusedBody, currentTime)
          : (focusedBody.parentId ?? null))
      : null;
  $: parentBody = currentHostId ? ($systemStore?.nodes.find(n => n.id === currentHostId) as CelestialBody ?? null) : null;
  $: rootStar = $systemStore?.nodes.find(n => !n.parentId && (n.roleHint === 'star' || n.kind === 'barycenter')) as CelestialBody || null;
  $: focusedFutureJourneyCount = (focusedBody && focusedBody.kind === 'construct')
      ? countFutureJourneys(focusedBody, currentTime)
      : 0;
  // The focused ship's live kinematic state (Transit / Deep Space / Orbiting / Docked / Landed) at the
  // display clock — drives the location heading in its stat block.
  $: focusedKinematicState = (focusedBody && focusedBody.kind === 'construct' && $systemStore)
      ? (sampleJourneyKinematicsAtTime($systemStore, focusedBody, currentTime)?.state ?? null)
      : null;
  $: if (!focusedBody || focusedBody.kind !== 'construct') isShipLogOpen = false;
  // Keep autopilot routes extended ahead of the display clock as the GM scrubs/plays.
  // G28: the CLOCK writes here, not the GM. Wrapped so the undo recorder adopts the result
  // silently instead of filling its stack while a system sits idle with time running (this fires
  // several times a second). Time is out of undo's V1 scope; this is where that is enforced.
  $: silentSystemWrite(() => maybeTopUpAutopilot(currentTime));

  // Handle Back to Starmap if systemId is lost from state
  $: if (browser && !$page.state.systemId) {
      // dispatch('back'); // Handled by parent reactivity now
  }

  function handleDeleteNode(event: CustomEvent<string>) {
    if (!$systemStore) return;
    const nodeId = event.detail;
    const nodeToDelete = $systemStore.nodes.find(n => n.id === nodeId);

    // Deleting the system's parentless root (the primary star, or the root barycentre of a multiple
    // star) is really "delete the whole system": removing just the star would leave an orphaned,
    // unusable husk on the starmap. Confirm loudly, then drop the entire system via the starmap owner.
    const isSystemRoot = !!nodeToDelete && !nodeToDelete.parentId
      && (nodeToDelete.roleHint === 'star' || nodeToDelete.kind === 'barycenter');
    if (isSystemRoot) {
      const ok = confirm(
        `Delete the entire "${$systemStore.name || 'system'}" system?\n\n` +
        `${nodeToDelete.name} is its primary star — deleting it removes the whole system and ` +
        `everything orbiting it. This can't be undone.`);
      if (!ok) return;
      dispatch('deletesystem', $systemStore.id);
      return;
    }

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

    systemStore.set({ ...systemProcessor.process(deleteNode($systemStore, nodeId), rulePack) });

    if (nextFocusId) {
        handleFocus({ detail: nextFocusId } as CustomEvent<string | null>);
    }
  }



  // ONE gate for both load paths (a file and a bundled example). `rulePackId` is deliberately NOT part of
  // it: the loader processes with the app's CURRENT pack whatever the file says, so the field is a
  // record, not a requirement - and a blank one is common. V2 exported systems without it, and this
  // app still writes '' on SpaceEngine and ubox imports and portrait systems, so demanding it here
  // refused real files with the message 'missing' for a field that was present and empty. A blank
  // id is stamped with the current pack on load, so the file records what actually processed it.
  function isLoadableSystem(doc: any): boolean {
    if (!doc || typeof doc !== 'object' || !doc.id || !doc.name || !Array.isArray(doc.nodes)) return false;
    if (!doc.rulePackId) { doc.rulePackId = rulePack?.id ?? ''; doc.rulePackVersion = doc.rulePackVersion || rulePack?.version || ''; }
    return true;
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
      if (isLoadableSystem(newSystem)) {
        // Keep the old ID to preserve starmap link
        const oldId = $systemStore?.id;
        if (oldId) {
            newSystem.id = oldId;
        }

        systemStore.set(systemProcessor.process(newSystem, rulePack));
        currentTime = newSystem?.epochT0 || Date.now();
        focusedBodyId = null;
      } else {
        alert('Invalid system file: it needs an id, a name and a nodes array.');
      }
    } catch (err) {
      alert('Failed to parse JSON file.');
      console.error(err);
    }
  }


  function handleDownloadJson() {
    showSaveModal = true;
  }

  // G42: a whole campaign (starmap) was dropped on Load System. The classified payload waits here
  // while the sister-file modal offers open-as-campaign; the actual load runs in the root page
  // (the campaign pipeline lives there), so confirm just hands the payload up.
  let sisterStarmap: { doc: any; models: Record<string, { b64: string; meta: Record<string, unknown> }> | null; name: string } | null = null;

  async function handleSaveSystem(event: CustomEvent<{mode: 'GM' | 'Player', includeConstructs: boolean}>) {
    if (!$systemStore) return;
    
    let systemToSave = $systemStore;
    const { mode, includeConstructs } = event.detail;

    // 1. Redact for Player if needed
    if (mode === 'Player') {
        systemToSave = computePlayerSnapshot($systemStore);
    } else {
        // GM save: strip derived physics from a clone (the load path re-derives it), so the file is small
        // and carries only authored inputs — never stale baked-in data.
        systemToSave = stripSystemForExport($systemStore, rulePack);
    }

    // 2. Filter Constructs if requested
    if (!includeConstructs) {
        systemToSave.nodes = systemToSave.nodes.filter(n => n.kind !== 'construct');
    }

    // 3. Download. A system carrying assets (body photos, ship models) saves as a BUNDLE - a zip
    // with a readable system.json beside the assets as real files; without them it stays plain
    // JSON. Same container the campaign save uses, so one reader opens either.
    const models = await collectModelsForExport({ systems: [{ system: systemToSave }] }).catch(() => undefined);
    const bundle = packBundle('system', systemToSave, { models });
    const blob = bundle
      ? new Blob([bundle], { type: 'application/zip' })
      : new Blob([JSON.stringify(systemToSave, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${systemToSave.name.replace(/\s+/g, '_') || 'system'}-System${mode === 'Player' ? '-Player' : ''}${bundle ? BUNDLE_EXT : '.json'}`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  async function handleUploadJson(event: Event) {
    const input = event.target as HTMLInputElement;
    if (!input.files || input.files.length === 0) return;
    const file = input.files[0];
    // An external simulator file (.ubox / .sc / .pak) goes through the converter modal, not the JSON path.
    const adapter = adapterForFile(file.name);
    if (adapter) {
      importSource = adapter;
      importFileName = file.name;
      importBytes = new Uint8Array(await file.arrayBuffer());
      input.value = '';
      return;
    }
    const reader = new FileReader();
    reader.onload = async (e) => {
      try {
        // G42: classify FIRST (bundle kind from the zip, JSON kind from shape — classify.ts), so a
        // campaign dropped here is named in plain words instead of failing isLoadableSystem with a
        // message about missing fields. A real system still goes through isLoadableSystem below.
        const raw = new Uint8Array(e.target?.result as ArrayBuffer);
        const classified = classifySaveFile(raw);
        if (classified.kind === 'starmap') {
          // Sister file: hold the already-classified payload and OFFER open-as-campaign. Nothing
          // is loaded unless the GM confirms; closing the modal drops the payload untouched.
          sisterStarmap = { doc: classified.doc, models: classified.models ?? null, name: file.name };
          return;
        }
        if (classified.kind === 'unknown') {
          alert('This file is not a Star System Explorer save.\n\n' + (classified.problem ?? ''));
          return;
        }
        if (classified.container === 'bundle') await importEmbeddedModels(classified.models).catch(() => 0);
        let newSystem: any = classified.doc;
        if (isLoadableSystem(newSystem)) {
          // Keep the old ID to preserve starmap link
          const oldId = $systemStore?.id;
          if (oldId) {
              newSystem.id = oldId;
          }

          // One-way fix-up: strip baked-in derived data / legacy tags so the new engine re-derives
          // cleanly (v1 imports otherwise carry stale physics that shadows the model).
          newSystem = fixUpImportedSystem(newSystem, rulePack);
          systemStore.set(systemProcessor.process(newSystem, rulePack));
          currentTime = newSystem?.epochT0 || Date.now();
          focusedBodyId = null;
        } else {
          // classify said 'system' (it has a nodes array), so what is missing is the id or name.
          alert('This system file is missing its "id" or "name", so it cannot be loaded.');
        }
      } catch (err) {
        // Unreadable files never reach here (classifySaveFile answers 'unknown' for them and the
        // guard above already spoke) - this catch is the load pipeline itself failing.
        alert(`The file loaded but could not be opened: ${(err as Error)?.message ?? err}`);
        console.error(err);
      }
    };
    reader.readAsArrayBuffer(file);
    // Clear the picker so cancelling a sister-file modal and choosing the SAME file again re-fires.
    input.value = '';
  }

  let unsubscribePanStore: () => void;
  let unsubscribeZoomStore: () => void;

  onMount(() => {
    if (system) {
        systemStore.set(systemProcessor.process(system, rulePack));
        const map = get(starmapStore);
        if (map) {
          const normalized = ensureTemporalState(map);
          starmapStore.set(normalized);
          const universeSec = parseClockSeconds(normalized.temporal?.displayTimeSec, 0n);
          currentTime = Number(universeSec - BIG_BANG_TO_UNIX_EPOCH_T) * 1000;
        } else {
          currentTime = system.epochT0;
        }
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
                // No SYNC_SYSTEM here either - see the note by the retired reactive send below.
                broadcastService.sendMessage({ type: 'SYNC_RULEPACK', payload: rulePack });
                broadcastService.sendMessage({ type: 'SYNC_FOCUS', payload: focusedBodyId });
                broadcastService.sendMessage({ type: 'SYNC_CAMERA', payload: { pan: get(panStore), zoom: get(zoomStore), isManual: cameraMode === 'MANUAL' || userZoomOverride, viewMin: Math.min(window.innerWidth, window.innerHeight) } });
                broadcastService.sendMessage({ type: 'SYNC_VIEW_SETTINGS', payload: { showNames, showZones, showHillSpheres, showLPoints, showTravellerZones } });
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
        broadcastService.sendMessage({ type: 'SYNC_CAMERA', payload: { pan: panState, zoom: get(zoomStore), isManual: cameraMode === 'MANUAL' || userZoomOverride, viewMin: Math.min(window.innerWidth, window.innerHeight) } });
    });
    unsubscribeZoomStore = zoomStore.subscribe(zoomState => {
        viewportStore.update(v => ({ ...v, zoom: zoomState }));
        broadcastService.sendMessage({ type: 'SYNC_CAMERA', payload: { pan: get(panStore), zoom: zoomState, isManual: cameraMode === 'MANUAL' || userZoomOverride, viewMin: Math.min(window.innerWidth, window.innerHeight) } });
    });

    document.addEventListener('click', handleClickOutside);

    // G28: start recording the GM's authored edits. Attached LAST, after the initial
    // `systemStore.set` above, so the state the view opens on is the baseline rather than the first
    // undo entry. `rulePack` is passed as a GETTER because `process()` - which IS the redo function
    // - has to run against whichever pack is live when the undo happens.
    attachSystemUndo(() => rulePack);
  });

  // Reactive Broadcasts for View Settings
  $: if (browser && $systemStore) {
      broadcastService.sendIfChanged({
          type: 'SYNC_VIEW_SETTINGS',
          payload: { showNames, showZones, showHillSpheres, showLPoints, showTravellerZones }
      });
  }

  // Reactive Broadcast for Focus
  $: if (browser && typeof focusedBodyId !== 'undefined') {
      broadcastService.sendMessage({ type: 'SYNC_FOCUS', payload: focusedBodyId });
  }

  // SYNC_SYSTEM IS NO LONGER SENT (G51, owner's call 2026-08-27 on Q5).
  //
  // Nothing consumed it. The only `initReceiver` call site in the app registers `onSystemUpdate` as
  // `() => {}`, and four places were checked before it was stopped: the SSE receiver, `/bridge`
  // (which only ever sends REQUEST_HELLO / REQUEST_REMOTE), `vtt-integration-design.md`'s message
  // list, and Mappadux's own `Sse2Bridge.ts` - which handles discover/announce and no per-system
  // message at all.
  //
  // AND IT WAS THE WORST PAYLOAD IN THE APP: unlike the starmap path it never passed through
  // `slimNode`, because `computePlayerSnapshot` REDACTS but does not SLIM (engine-map SYNC-2). So it
  // published the full `scheduled_journeys` INCLUDING the dense `pathPoints` arrays that
  // `shipRoute.ts` opens by explaining must never be broadcast - ~245 KB per send, on every
  // `systemStore` change.
  //
  // The TYPE and the RECEIVER HANDLER are deliberately kept: a Foundry/Owlbear shim may reasonably
  // expect the contract to exist, and a deleted handler fails silently where a live one does not.

  onDestroy(() => {
    if (browser) {
      if (timeSyncInterval) clearInterval(timeSyncInterval);
    }
    stopAlignAnimation();
    if (unsubscribePanStore) {
        unsubscribePanStore();
    }
    if (unsubscribeZoomStore) {
        unsubscribeZoomStore();
    }
    document.removeEventListener('click', handleClickOutside);
    detachSystemUndo();
  });

  $: if ($starmapStore) {
    const normalized = ensureTemporalState($starmapStore);
    if (normalized !== $starmapStore) {
      starmapStore.set(normalized);
    } else if (normalized.temporal) {
      if (!isAligningTime) {
        const nextMs = Number(parseClockSeconds(normalized.temporal.displayTimeSec, 0n) - BIG_BANG_TO_UNIX_EPOCH_T) * 1000;
        if (Math.abs(nextMs - currentTime) > 1) {
          currentTime = nextMs;
        }
      }
      updateTemporalDisplayState();
    }
  }

  function nearlyEqual(a: number, b: number, eps = 1e-9): boolean {
    return Math.abs(a - b) <= eps;
  }

  function syncScheduledJourneysAtDisplayTime(timeMs: number) {
    if (!Number.isFinite(timeMs)) return;
    const strands: { node: any; vel: { x: number; y: number }; atSec: string }[] = [];
    systemStore.update((sys) => {
      if (!sys) return null;
      let changed = false;

      // The actual/master clock is the GM's campaign checkpoint. It still drives the autopilot's
      // run-once backstop and the flown-past trim below - but NOT arrival reconciliation, which now
      // reads the display clock (see reconcileConstructArrival, and [[B97]]).
      const actualMs = getActualTimeMs();

      // C1 — a construct that has coasted BEYOND the system edge has left the local system. The edge is a
      // configurable AU distance (Settings → Starmap → System edge), or the root star's Hill limit by default.
      const rootNode: any = sys.nodes.find((n) => (n as any).parentId == null);
      const rootMass = (rootNode?.massKg ?? rootNode?.effectiveMassKg ?? 0) as number;
      const edgeAu = get(starmapStore)?.systemEdgeAu;
      const hillLimitAu = (edgeAu && edgeAu > 0) ? edgeAu : (rootMass > 0 ? rootStarHillAu(rootMass) : Infinity);
      const exitAtSec = String(Math.floor(Number(unixMsToMasterSeconds(actualMs))));

      const nodes = sys.nodes.map((node) => {
        if (node.kind !== 'construct') return node;
        const logs = Array.isArray(node.scheduled_journeys) ? node.scheduled_journeys : [];
        if (logs.length === 0) return node;

        let nextNode = node;
        let nodeChanged = false;

        const updatedLogs = logs.map((log) => {
          if (log.status === 'cancelled') return log;
          const bounds = getJourneyBounds(log.plans);
          if (!bounds) return log;

          let nextStatus = log.status;
          if (timeMs >= bounds.endMs) nextStatus = 'completed';
          else if (timeMs >= bounds.startMs && log.status !== 'completed') nextStatus = 'active';
          
          if (nextStatus !== log.status) {
            nodeChanged = true;
            
            // Memory optimization: Once a journey is completed, we don't need its full HD trajectory.
            // We just need the start point, and the last 2 points (to calculate final velocity tangents).
            let processedPlans = log.plans;
            if (nextStatus === 'completed') {
                processedPlans = log.plans.map(p => ({
                    ...p,
                    segments: p.segments.map(s => {
                        let pts = s.pathPoints || [];
                        let times = s.pathTimes;
                        if (pts.length > 3) {
                            const keep = [0, pts.length - 2, pts.length - 1];
                            // The STAMPS have to be pruned with the points they belong to. Keeping a
                            // full time array against three points would make them disagree in length,
                            // and every reader would silently fall back to assuming even spacing across
                            // a segment whose remaining samples are anything but (G46).
                            if (times && times.length === pts.length) times = keep.map(i => times![i]);
                            pts = keep.map(i => pts[i]);
                        }
                        return { ...s, pathPoints: pts, ...(times ? { pathTimes: times } : {}) };
                    })
                }));
            }

            return { ...log, status: nextStatus, plans: processedPlans };
          }
          return log;
        });
        if (nodeChanged) {
          nextNode = { ...nextNode, scheduled_journeys: updatedLogs };
        }

        const sampled = sampleJourneyKinematicsAtTime(sys, nextNode, timeMs);
        // A SAMPLE ONLY BECOMES A STAMPED VECTOR WHILE THE SHIP IS ACTUALLY FREE-FLOATING.
        //
        // The sampler keeps answering forever: past its last arrival it returns a LIVE PARKING ORBIT,
        // which moves. Stamping that meant every ship that had ever arrived anywhere rewrote its own
        // node several times a second, for the rest of the campaign - and a changed node is a changed
        // broadcast snapshot, so a player's holo scene called setSystem (and bumped `buildGen`) about
        // twice a second and never held still long enough for anything to finish. That is one cause
        // with three faces the owner reported: the ship's 3D model never attached, the camera reset
        // itself every few seconds while following, and the ship was placed at a GM instant rather
        // than orbiting on the player's own clock.
        //
        // A PARKED ship does not need a vector: its ORBIT describes it, and since the heal now stores
        // the phase as well as the radius that orbit reproduces this very sampler exactly. A ship in
        // TRANSIT or adrift in DEEP SPACE genuinely has no orbit to describe it, and keeps the stamp.
        const freeFloating = !!sampled && needsStampedPosition(sampled.state);
        if (sampled && freeFloating) {
          const priorPos = nextNode.vector_position_au;
          const priorVel = nextNode.vector_velocity_ms;
          if (
            !priorPos ||
            !nearlyEqual(priorPos.x, sampled.position_au.x) ||
            !nearlyEqual(priorPos.y, sampled.position_au.y) ||
            !priorVel ||
            !nearlyEqual(priorVel.x, sampled.velocity_ms.x, 1e-3) ||
            !nearlyEqual(priorVel.y, sampled.velocity_ms.y, 1e-3) ||
            nextNode.flight_state !== sampled.state
          ) {
            nextNode = {
              ...nextNode,
              vector_position_au: { x: sampled.position_au.x, y: sampled.position_au.y },
              vector_velocity_ms: { x: sampled.velocity_ms.x, y: sampled.velocity_ms.y },
              vector_epoch_ms: timeMs,
              flight_state: sampled.state
            };
            nodeChanged = true;
          }
        } else if (sampled) {
          // PARKED (Orbiting / Landed / Docked). Drop the stamp and let the orbit speak. Once this has
          // run the node stops changing, which is what lets a player's scene stand still.
          if (nextNode.vector_position_au || nextNode.vector_epoch_ms !== undefined || nextNode.flight_state !== sampled.state) {
            nextNode = {
              ...nextNode,
              vector_position_au: undefined,
              vector_epoch_ms: undefined,
              flight_state: sampled.state
            };
            nodeChanged = true;
          }
        } else if (nextNode.vector_position_au) {
          // No sampled journey at all at this display time.
          // Keep deep-space constructs moving inertially instead of snapping back to legacy orbit.
          if (
            nextNode.flight_state === 'Deep Space' &&
            nextNode.vector_velocity_ms &&
            Number.isFinite(nextNode.vector_epoch_ms)
          ) {
            const dtSec = (timeMs - (nextNode.vector_epoch_ms || timeMs)) / 1000;
            if (Math.abs(dtSec) > 1e-6) {
              const auPerSecX = nextNode.vector_velocity_ms.x / (AU_KM * 1000);
              const auPerSecY = nextNode.vector_velocity_ms.y / (AU_KM * 1000);
              nextNode = {
                ...nextNode,
                vector_position_au: {
                  x: nextNode.vector_position_au.x + (auPerSecX * dtSec),
                  y: nextNode.vector_position_au.y + (auPerSecY * dtSec)
                },
                vector_epoch_ms: timeMs
              };
              nodeChanged = true;
            }
            if (nodeChanged) changed = true;
            return nextNode;
          }

          nextNode = {
            ...nextNode,
            vector_position_au: undefined,
            vector_epoch_ms: undefined,
            flight_state: nextNode.flight_state === 'Deep Space' ? 'Deep Space' : 'Orbiting'
          };
          nodeChanged = true;
        }

        // Heal a ship still carrying the orbit it departed from, judged against DISPLAY time - the
        // clock everyone is actually looking at. Idempotent, so this is a no-op once healed, and it
        // counts its own repairs on the node (`placementHealCount`) so a saved file says whether
        // anything upstream is still writing ships wrong.
        const reconciled = reconcileConstructArrival(sys, nextNode, timeMs);
        if (reconciled !== nextNode) {
          nextNode = reconciled;
          nodeChanged = true;
        }

        // Run-once autopilot: once ACTUAL time has flown the whole route (every journey completed),
        // disengage for real — the persistent backstop. (The display-time "done · green" is derived.)
        const ap: any = (nextNode as any).autopilot;
        if (ap?.enabled && ap.repeat === false && (nextNode.scheduled_journeys || []).length) {
          const live = (nextNode.scheduled_journeys || []).filter((l: any) => l.status !== 'cancelled');
          if (live.length && live.every((l: any) => l.status === 'completed')) {
            nextNode = { ...nextNode, autopilot: { ...ap, enabled: false } };
            nodeChanged = true;
          }
        }

        // Trim the heavy flown-past JOURNEY data of a REPEAT autopilot route so the orrery + journey list stay
        // bounded over a long run (the flight-log history is kept forever — only this regenerable data is cut).
        if (ap?.enabled && ap.repeat !== false) {
          const trimmed = trimFlownAutopilotPast(nextNode, actualMs, AP_KEEP_FLOWN);
          if (trimmed !== nextNode) { nextNode = trimmed; nodeChanged = true; }
        }

        if (nodeChanged) changed = true;
        return nextNode;
      });

      // Collect Hill-limit crossings (Deep Space ships past the boundary) and pull them out of the system.
      if (hillLimitAu < Infinity) {
        for (const n of nodes as any[]) {
          if (n.kind === 'construct' && n.flight_state === 'Deep Space' && n.vector_position_au) {
            const dist = Math.hypot(n.vector_position_au.x, n.vector_position_au.y);
            if (dist > hillLimitAu) strands.push({ node: n, vel: n.vector_velocity_ms ?? { x: 0, y: 0 }, atSec: exitAtSec });
          }
        }
      }
      const strandedIds = new Set(strands.map((s) => s.node.id));
      const finalNodes = strandedIds.size ? nodes.filter((n) => !strandedIds.has(n.id)) : nodes;
      if (!changed && !strandedIds.size) return sys;
      return { ...sys, nodes: finalNodes };
    });

    // Hand the stranded ships to the starmap as interstellar adrift constructs (park + slow drift, keeping
    // their in-system heading angle). Only touches adriftConstructs — the node removal above syncs to the
    // starmap via +page. One-shot: once gone from the system they can't re-trigger.
    if (strands.length) {
      const map = get(starmapStore);
      const sysId = get(systemStore)?.id;
      if (map && sysId) {
        const sysNode = map.systems.find((s) => s.system.id === sysId || s.id === sysId);
        const systemPos = sysNode?.position ?? { x: 0, y: 0 };
        const adrifts = strands.map((s) => adriftFromSystemExit(s.node, systemPos, s.vel, s.atSec, map.distanceUnit, sysNode?.id));
        starmapStore.update((m) => (m ? { ...m, adriftConstructs: [...(m.adriftConstructs ?? []), ...adrifts] } : m));
      }
    }
  }

  // Throttle the (potentially expensive, for coasting ships) re-derive while the clock is being jogged:
  // run it at most every ~150ms during a scrub, then a trailing "settle" pass so the FINAL time is exact.
  // Fast/cheap while dragging, right when you let go.
  const SYNC_THROTTLE_MS = 150;
  let lastSyncWallMs = 0;
  let settleTimer: ReturnType<typeof setTimeout> | null = null;
  let settleTime = 0;
  function requestSync(timeMs: number) {
    settleTime = timeMs;
    const now = (typeof performance !== 'undefined' ? performance.now() : 0);
    if (now - lastSyncWallMs >= SYNC_THROTTLE_MS) {
      lastSyncWallMs = now;
      if (settleTimer) { clearTimeout(settleTimer); settleTimer = null; }
      // G28: clock-driven, like the autopilot top-up above - never an undo entry.
      silentSystemWrite(() => syncScheduledJourneysAtDisplayTime(timeMs));
    } else {
      if (settleTimer) clearTimeout(settleTimer);
      settleTimer = setTimeout(() => {
        settleTimer = null;
        lastSyncWallMs = (typeof performance !== 'undefined' ? performance.now() : 0);
        silentSystemWrite(() => syncScheduledJourneysAtDisplayTime(settleTime));   // exact at the resting time
      }, SYNC_THROTTLE_MS);
    }
  }

  $: if ($systemStore && !isPlanning) {
    requestSync(currentTime);
  }

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
      isShipLogOpen = false;
      isPlanning = true; 
      isEditing = false; 
      showZoneKeyPanel = false; 
      visualizer?.resetView(); 
      plannerOriginId = focusedBody.id;
      planningConstructId = focusedBody.id;
      completedTransitPlans = [];
      transitDelayDays = 0;

      // Timeline chaining: the next hop starts where the ship's LATEST scheduled journey ends, picking up
      // its exit state (position + velocity vector) as the entry. So multi-stop is built one hop at a time,
      // each appended to the timeline — no in-journey legs. Else start fresh from the ship now.
      const logs = (focusedBody.scheduled_journeys || []).filter((l) => l.status !== 'cancelled');
      let latest: { endMs: number; plan: TransitPlan } | null = null;
      for (const log of logs) {
          const p = log.plans?.[log.plans.length - 1];
          if (!p) continue;
          const endMs = p.startTime + (p.totalTime_days * 86400 * 1000);
          if (!latest || endMs > latest.endMs) latest = { endMs, plan: p };
      }
      if (latest && latest.endMs >= currentTime - 1000) {
          transitChainTime = latest.endMs;
          plannerOriginId = latest.plan.targetId;
          const seg = latest.plan.segments?.[latest.plan.segments.length - 1];
          transitChainState = seg ? { r: { ...seg.endState.r }, v: { ...seg.endState.v } } : undefined;
          return;
      }

      // Adrift / coasting (an aborted journey) — replot from where the ship ACTUALLY is now, carrying its
      // current position + velocity so the redirect-Δv physics applies (matches interstellar "Chart a new
      // course"). Frame it on the system root so the heliocentric state passes through unchanged.
      const kin = $systemStore ? sampleJourneyKinematicsAtTime($systemStore, focusedBody as CelestialBody, currentTime) : null;
      if (kin && (kin.state === 'Deep Space' || kin.state === 'Transit')) {
          const AU_M = AU_KM * 1000;
          const root = $systemStore.nodes.find((n) => !n.parentId);
          transitChainTime = currentTime;
          plannerOriginId = root?.id ?? focusedBody.id;
          transitChainState = {
              r: { x: kin.position_au.x, y: kin.position_au.y },
              v: { x: kin.velocity_ms.x / AU_M, y: kin.velocity_ms.y / AU_M }
          };
          return;
      }

      transitChainTime = currentTime;
      transitChainState = undefined;
  }

  // --- Transit planner handlers (extracted from the markup in 01.7; PlannerPane
  //     forwards TransitPlannerPanel's events, the chaining state machine stays here) ---
  function handlePlannerPreviewUpdate(e: CustomEvent) {
      transitJourneyOffset = e.detail.offset;
      transitPreviewPos = e.detail.position;
  }

  function handlePlannerTargetSelected(e: CustomEvent) {
      const { origin, target } = e.detail;
      visualizer?.fitToNodes([origin, target]);
  }


  // One-button refuel: top up every tank of the ship being planned.
  function handleRefuel() {
      const id = planningConstructId || plannerOriginId;
      if (!id) return;
      systemStore.update(sys => {
          if (!sys) return sys;
          const nodes = sys.nodes.map(n => {
              if (n.id !== id || !Array.isArray((n as any).fuel_tanks)) return n;
              return { ...n, fuel_tanks: (n as any).fuel_tanks.map((t: any) => ({ ...t, current_units: t.capacity_units })) };
          });
          return { ...sys, nodes };
      });
  }

  function handleExecutePlan(e: CustomEvent) {
      const payload = e.detail as { plan?: TransitPlan | null; force?: boolean } | TransitPlan | null;
      const finalPlan = (payload && typeof payload === 'object' && 'plan' in payload)
          ? (payload.plan ?? null)
          : (payload as TransitPlan | null);
      const forceExecute = !!(payload && typeof payload === 'object' && 'force' in payload && payload.force);

      // Single-hop: one plan -> one journey on the timeline. Multi-stop is built by planning the next hop
      // (which starts from this one's end-state) — chained on the timeline, not as legs in one journey.
      const plansToSchedule = finalPlan ? [finalPlan] : [];
      if (plansToSchedule.length === 0 || !focusedBodyId) return;
      const startScheduledTimeMs = plansToSchedule[0].startTime;

      systemStore.update(sys => {
          if (!sys) return null;
          const newNodes = sys.nodes.map(node => {
              if (node.id !== focusedBodyId) return node;
              const existing = Array.isArray(node.scheduled_journeys) ? node.scheduled_journeys : [];
              // Each hop is now its OWN single-plan journey on the timeline (no more multi-leg journey
              // object). The scheduler already chains multiple logs in time and reconciles to the latest
              // arrival, so the trajectory is identical — but every leg is independently log-able / autopilot-
              // sequenceable, and carries its own entry/exit state.
              const createdAtSec = BigInt(Math.floor(currentTime / 1000)).toString();
              return {
                  ...node,
                  scheduled_journeys: [
                      ...existing,
                      ...plansToSchedule.map((p) => ({
                          id: generateId(),
                          createdAtSec,
                          plans: [JSON.parse(JSON.stringify(p))],
                          status: 'scheduled' as const,
                          forceExecute
                      }))
                  ],
                  draft_transit_plan: undefined
              };
          });
          return { ...sys, nodes: newNodes };
      });

      // The execute animation simulated the trip; now REWIND Display Time to the journey's start so no
      // apparent time has passed — the ship sits at departure with its faint transit line ahead. Actual/
      // master time was never touched.
      currentTime = startScheduledTimeMs;
      const bigBangSec = unixMsToMasterSeconds(startScheduledTimeMs);
      applyTemporalUpdate((temporal) => ({
        ...temporal,
        displayTimeSec: bigBangSec.toString()
      }));

      // Reset planner UI (journey is now scheduled, not immediately executed)
      isPlanning = false;
      currentTransitPlan = null;
      completedTransitPlans = [];
      transitAlternatives = [];
      transitPreviewPos = null;
      transitJourneyOffset = 0;
      transitChainTime = 0;
  }

  function handleClosePlanner() {
      isPlanning = false;
      currentTransitPlan = null;
      transitDelayDays = 0;
      transitJourneyOffset = 0;
      transitPreviewPos = null;
      completedTransitPlans = [];
      transitAlternatives = [];
  }

  function getActualTimeMs(): number {
      const temporal = get(starmapStore)?.temporal;
      if (!temporal) return currentTime;
      // ACTUAL time in UNIX-ms (to compare with journey startMs/endMs, which are unix-ms). masterTimeSec is
      // MASTER seconds (since the Big Bang) — must subtract the Big-Bang→unix offset, exactly like the
      // actualTimeMs reactive. Without it this returned master-ms (~4.35e20), so countFutureJourneys saw every
      // journey as long past → Clear/Cancel always 0, and the autopilot trim/arrival reconcile were skewed.
      return Number(parseClockSeconds(temporal.masterTimeSec, 0n) - BIG_BANG_TO_UNIX_EPOCH_T) * 1000;
  }


  function activeJourneyCountForActualTime(body: CelestialBody): number {
      const logs = body.scheduled_journeys || [];
      const nowMs = getActualTimeMs();
      return logs.filter((log) => {
          const bounds = getJourneyBounds(log.plans);
          if (!bounds) return false;
          return log.status !== 'cancelled' && nowMs >= bounds.startMs && nowMs <= bounds.endMs;
      }).length;
  }

  function handleOpenJourneyLog() {
      if (!focusedBody || focusedBody.kind !== 'construct') return;
      isEditing = false;
      isPlanning = false;
      isShipLogOpen = true;
  }

  function handleCloseJourneyLog() {
      isShipLogOpen = false;
  }

  // Drop flight-log events at/after a cutoff — keeps the deterministic ledger in step when future journeys
  // are cleared/cancelled, so cargo (derived from the log) doesn't show deliveries that never happen now.
  function pruneFlightLog(node: any, cutoffMs: number) {
      const log = node.flight_log;
      if (!log?.length) return node;
      const cutSec = Math.floor(cutoffMs / 1000);
      const kept = log.filter((e: any) => Number(e.atSec) < cutSec);
      return kept.length === log.length ? node : { ...node, flight_log: kept };
  }

  function handleClearFuturePlans() {
      if (!focusedBody || focusedBody.kind !== 'construct') return;
      const nowMs = getActualTimeMs();
      systemStore.update((sys) => {
          if (!sys) return null;
          const nodes = sys.nodes.map((n) => {
              if (n.id !== focusedBody.id || n.kind !== 'construct') return n;
              return pruneFlightLog(clearFutureJourneys(n as CelestialBody, nowMs), nowMs);
          });
          return { ...sys, nodes };
      });
  }

  // Resume the most-recently-aborted in-system journey: un-cancel it so it re-flies its original plan
  // (orange / unphysical — it ignores that the ship stopped). Pairs with Cancel · drift/stop.
  function handleResumeJourney() {
      if (!focusedBody || focusedBody.kind !== 'construct') return;
      systemStore.update((sys) => {
          if (!sys) return null;
          const nodes = sys.nodes.map((n) => {
              if (n.id !== focusedBody.id || n.kind !== 'construct') return n;
              const logs = [...((n as CelestialBody).scheduled_journeys || [])];
              // newest cancelled journey (by cancel time) → un-cancel.
              let bestIdx = -1, bestT = -Infinity;
              logs.forEach((l, i) => { if (l.status === 'cancelled') { const t = Number(l.cancelledAtSec ?? 0); if (t >= bestT) { bestT = t; bestIdx = i; } } });
              if (bestIdx < 0) return n;
              const { cancelledAtSec, cancelState, ...rest } = logs[bestIdx] as any;
              logs[bestIdx] = { ...rest, status: 'scheduled' };
              return { ...n, scheduled_journeys: logs };
          });
          return { ...sys, nodes };
      });
  }

  // Disengage autopilot via the confirmation dialog. 'graceful' = finish the current leg then stop;
  // 'drift'/'stop' = abort the active journey now (coast vs dead). All clear the autopilot flag so the
  // generator won't refill the route. Reuses the existing manual cancel/clear handlers.
  let showDisengageDialog = false;
  function disengageAutopilot(mode: 'graceful' | 'drift' | 'stop') {
    if (!focusedBody || focusedBody.kind !== 'construct') { showDisengageDialog = false; return; }
    const id = focusedBody.id;
    systemStore.update((sys) => {
      if (!sys) return null;
      const nodes = sys.nodes.map((n) =>
        n.id === id && n.kind === 'construct'
          ? { ...n, autopilot: { ...(n as any).autopilot, enabled: false } }
          : n);
      return { ...sys, nodes };
    });
    if (mode === 'graceful') handleClearFuturePlans();
    else handleCancelActivePlan({ detail: { coast: mode === 'drift' } } as CustomEvent);
    showDisengageDialog = false;
  }

  function handleCancelActivePlan(e?: CustomEvent) {
      if (!focusedBody || focusedBody.kind !== 'construct') return;
      const coast = e?.detail?.coast ?? true;   // default drift; false = stop dead
      // Abort at the DISPLAY time — strand the ship where the GM currently sees it (the abort buttons are
      // shown based on the live display state), not at actual/master time where it may not have launched yet.
      const nowMs = currentTime;
      systemStore.update((sys) => {
          if (!sys) return null;
          const nodes = sys.nodes.map((n) => {
              if (n.id !== focusedBody.id || n.kind !== 'construct') return n;
              const cancelled = cancelActiveJourney(sys, n as CelestialBody, nowMs, coast);
              // Cascading policy: cancelling active also clears all future plans (+ their flight-log events).
              return pruneFlightLog(clearFutureJourneys(cancelled, nowMs), nowMs);
          });
          return { ...sys, nodes };
      });
  }

  function handleTakeoff(event: CustomEvent<{fuel: number}>) {
      if (!$systemStore || !focusedBody || !parentBody) return;
      
      // Easter Egg: Go Go Artemis II!
      if (focusedBody.name.includes('Artemis II')) alert("Go Go Artemis II! 🚀");

      const fuelCostKg = event.detail.fuel * 1000;
      
      systemStore.update(sys => {
          if (!sys) return null;
          const newNodes = sys.nodes.map(n => {
              if (n.id === focusedBody!.id) {
                  // Deduct Fuel
                  const drained = drainFuelMassKg(n as CelestialBody, rulePack, fuelCostKg);

                  // Update Position to Low Orbit (Standard Parking: Min + 400km)
                  const minAlt = parentBody!.orbitalBoundaries?.minLeoKm || 100;
                  const radiusKm = (parentBody!.radiusKm || 1000) + minAlt + 400;
                  const a_AU = radiusKm / AU_KM;
                  const parentMassKg = (parentBody as any).massKg || (parentBody as any).effectiveMassKg || 0;
                  const hostMu = parentMassKg * G;
                  const aMeters = a_AU * AU_KM * 1000;
                  const keplerN = hostMu > 0 && aMeters > 0 ? Math.sqrt(hostMu / Math.pow(aMeters, 3)) : undefined;

                  return {
                      ...drained,
                      placement: 'Low Orbit',
                      flight_state: 'Orbiting',
                      vector_velocity_ms: undefined,
                      orbit: {
                          ...n.orbit!,
                          hostMu: hostMu || n.orbit!.hostMu,
                          n_rad_per_s: keplerN,
                          elements: { ...n.orbit!.elements, a_AU, e: n.orbit!.elements.e || 0 }
                      }
                  };
              }
              return n;
          });
          return { ...sys, nodes: newNodes };
      });
  }

  function handleLand(event: CustomEvent<{fuel: number}>) {
      if (!$systemStore || !focusedBody || !parentBody) return;
      
      const fuelCostKg = event.detail.fuel * 1000;
      
      systemStore.update(sys => {
          if (!sys) return null;
          const newNodes = sys.nodes.map(n => {
              if (n.id === focusedBody!.id) {
                  // Deduct Fuel
                  const drained = drainFuelMassKg(n as CelestialBody, rulePack, fuelCostKg);

                  // Update Position to Surface
                  const radiusKm = parentBody!.radiusKm || 1000;
                  const a_AU = radiusKm / AU_KM;
                  let rotationHours = (parentBody as any).rotation_period_hours;
                  if (rotationHours === undefined && (parentBody as any).physical_parameters) {
                      rotationHours = (parentBody as any).physical_parameters.rotation_period_hours;
                  }
                  const periodSeconds = rotationHours ? rotationHours * 3600 : ((parentBody as any).calculatedRotationPeriod_s || 0);
                  const surfaceN = periodSeconds > 0 && isFinite(periodSeconds) ? (2 * Math.PI) / periodSeconds : undefined;
                  
                  return {
                      ...drained,
                      placement: 'Surface',
                      flight_state: 'Landed',
                      vector_velocity_ms: undefined,
                      orbit: {
                          ...n.orbit!,
                          n_rad_per_s: surfaceN,
                          elements: { ...n.orbit!.elements, a_AU, e: 0 }
                      }
                  };
              }
              return n;
          });
          return { ...sys, nodes: newNodes };
      });
  }

</script>
<main>
  {#if $systemStore}
  <AppShell bind:mode bind:railOpen sheetTitle={focusedBody?.name ?? 'Details'} bind:sheetSnap>
    <svelte:fragment slot="rail">
      <RailNav
        activeView="system"
        rulerOn={rulerActive}
        {routesAttention}
        playerConns={{ local: $playerConnections.local, remote: $playerConnections.remote }}
        playerConnSummary={$playerConnections.summary}
        on:starmap={() => { railOpen = false; dispatch('back', { force: true }); }}
        on:report={() => { railOpen = false; showReportConfigModal = true; }}
        on:playerviews={() => { railOpen = false; dispatch('playerviews'); }}
        on:ruler={() => { railOpen = false; rulerActive = !rulerActive; }}
        on:downloadsystem={() => { railOpen = false; handleDownloadJson(); }}
        on:uploadsystem={() => { railOpen = false; railUploadInput?.click(); }}
        on:new={() => dispatch('new')}
        on:open={() => dispatch('open')}
        on:save={() => dispatch('save')}
        on:settings={() => dispatch('settings')}
        on:llmsettings={() => dispatch('llmsettings')}
        on:about={() => dispatch('about')}
        on:help={() => dispatch('help')}
        on:navigate={() => (railOpen = false)}
        on:allbodies={() => { railOpen = false; dispatch('allbodies'); }}
        on:findtag={() => { railOpen = false; dispatch('findtag'); }}
        on:allships={() => { railOpen = false; dispatch('allships'); }}
        on:routes={() => { railOpen = false; dispatch('routes'); }}
      >
      <!-- System actions (formerly the SystemSummary hamburger) — shown on desktop AND
           phone now that the summary strip is retired in favour of the BodyPicker. The
           Starmap nav and Report moved up into the icon rail proper. -->
      <!-- System-JSON download/upload moved into the File group. Hidden input kept here
           for the File group's Upload action. -->
      <input type="file" accept="application/json,.json,.zip,.ubox,.sc,.pak" bind:this={railUploadInput} on:change={handleUploadJson} style="display:none" />
      </RailNav>
    </svelte:fragment>
    <svelte:fragment slot="canvas">
    <!-- Legacy in-canvas "Regenerate Solar System: Select Star Type" controls removed — the
         generation wizard (Add System) now owns all star/system creation. -->

    <!-- The canvas toggle toolbar moved to the rail's View section (clean orrery). -->

        <div class="main-view">
            {#if ensuredTemporal}
              <div class="time-display-overlay">
                <TimeDisplay
                  temporal={ensuredTemporal}
                  displayOverrideSec={isAligningTime ? alignActualSecondsOverride : null}
                  masterOverrideSec={isAligningTime ? alignTargetSec : null}
                />
              </div>
            {/if}
            <BodyPicker
                floating
                nodes={displaySystem?.nodes ?? $systemStore.nodes}
                focusedId={focusedBodyId}
                top={mode === 'phone' ? 64 : 56}
                on:select={(e) => updateFocus(e.detail)}
            />

            <!-- G28: the floating undo/redo. Shows itself once there is something to wind back;
                 marks itself `use:chrome` so a dialog on a phone hides it (UI-C6). -->
            <UndoPill {mode} status={undoStatus} undo={undoSystem} redo={redoSystem} />

            <!-- On-canvas orrery controls: faded Reset + a "View" popover of the
                 frequently-used display toggles (per the wireframe). -->
            <div class="orrery-controls" class:phone={mode === 'phone'}>
              {#if mode === 'phone'}<FullscreenButton />{/if}
              <button class="ov-btn faded" title="Reset view" aria-label="Reset view" on:click={() => visualizer?.resetView()}>⟲{#if !$railCollapsed} Reset View{/if}</button>
              <div class="ov-view">
                <button class="ov-btn ov-eye" class:active={viewOpen} on:click={toggleViewPopover} title="View options" aria-label="View options">
                  <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="21" x2="14" y1="4" y2="4"/><line x1="10" x2="3" y1="4" y2="4"/><line x1="21" x2="12" y1="12" y2="12"/><line x1="8" x2="3" y1="12" y2="12"/><line x1="21" x2="16" y1="20" y2="20"/><line x1="12" x2="3" y1="20" y2="20"/><line x1="14" x2="14" y1="2" y2="6"/><line x1="8" x2="8" y1="10" y2="14"/><line x1="16" x2="16" y1="18" y2="22"/></svg>
                </button>
                {#if viewOpen}
                  <div class="ov-popover">
                    <label><input type="checkbox" bind:checked={showNames} /> Names</label>
                    <label><input type="checkbox" bind:checked={showZones} on:change={() => showZoneKeyPanel = showZones} /> Zones</label>
                    <label title="Each planet-mass body's gravitational bubble — where an adrift ship gets grabbed"><input type="checkbox" bind:checked={showHillSpheres} /> Hill spheres</label>
                    <label><input type="checkbox" bind:checked={showLPoints} /> Lagrange points</label>
                    <label class="ov-select" title="Spatial overlay — the same set every map view offers">Overlay
                      <select bind:value={systemOverlay}>
                        {#each SYSTEM_OVERLAY_OPTIONS as o}<option value={o.value}>{o.label}</option>{/each}
                      </select>
                    </label>
                    {#if isLattice(systemOverlay)}
                      <label class="ov-select" title="How much space one cell covers. Automatic sizes cells by zoom; a fixed cell keeps its meaning while you scroll.">Cell
                        <select bind:value={systemGridScaleAu}>
                          <option value={0}>Automatic</option>
                          {#each [0.25, 0.5, 1, 2, 5, 10] as au}<option value={au}>{au} AU</option>{/each}
                        </select>
                      </label>
                    {/if}
                    {#if $starmapUiStore.travellerMode}
                      <label><input type="checkbox" bind:checked={showTravellerZones} /> Traveller zones</label>
                    {/if}
                    <label><input type="checkbox" bind:checked={showVectors} /> Vectors</label>
                    <!-- G5: the GM's OWN orbit-line strength. Local to this browser (systemUiStore),
                         NOT campaign data and NOT the player's - a player view takes its value from
                         the preset, and joining the two is the A10/A3 fault. 100% is unchanged. -->
                    <label class="ov-slider" title="How strongly orbit lines are drawn on your map. A dense import can bury its own bodies under them.">
                      <span>Orbit lines</span>
                      <input type="range" min="0" max="1" step="0.05" bind:value={$systemUiStore.orbitOpacity} />
                    </label>
                    <label title="Show each body's derived true colour vs broad per-class colours"><input type="checkbox" bind:checked={$trueColorMode} /> True colour</label>
                    <div class="ov-seg" role="group" aria-label="Orbit scale">
                      <button class:active={toytownOn} on:click={() => setScaleMode(true)} title="Compressed spacing so the whole system fits one screen">Toytown</button>
                      <button class:active={!toytownOn} on:click={() => setScaleMode(false)} title="True linear AU spacing">Real</button>
                    </div>
                    {#if toytownOn}
                      <label class="ov-slider">
                        <span>Compression</span>
                        <input type="range" min="0.05" max="1" step="0.01" bind:value={$systemStore.toytownFactor} on:change={() => {
                          if ($systemStore.toytownFactor < 0.05) $systemStore.toytownFactor = 0.05;
                          toytownPref = $systemStore.toytownFactor;
                          handleSliderRelease();
                        }} />
                      </label>
                    {/if}
                  </div>
                {/if}
              </div>
            </div>

            <SystemVisualizer
                orbitOpacity={$systemUiStore.orbitOpacity}
                bind:this={visualizer}
                bind:cameraMode
                bind:userZoomOverride
                fullScreen={true}
                system={displaySystem}
                {rulePack} 
                currentTime={isPlanning ? (transitChainTime + (transitDelayDays * 86400 * 1000) + transitJourneyOffset) : currentTime} 
                {focusedBodyId} 
                {showNames}
                {showZones}
                {showHillSpheres}
                overlay={systemOverlay}
                gridScaleAu={systemGridScaleAu}
                {showLPoints}
                {showTravellerZones}
                {showSensors}
                {showVectors}
                {rulerActive}
                toytownFactor={$systemStore.toytownFactor}
                forceOrbitView={isEditing && activeEditTab === 'Orbit'}
                transitPlan={currentTransitPlan}
                alternativePlans={transitAlternatives}
                completedPlans={completedTransitPlans}
                transitPreviewPos={transitPreviewPos}
                isExecuting={isTransitExecuting}
                on:focus={handleFocus}
                on:levelchange={(e) => broadcastService.sendMessage({ type: 'SYNC_FOCUS_LEVEL', payload: e.detail })}
                on:showBodyContextMenu={handleShowBodyContextMenu}
                on:backgroundContextMenu={handleBackgroundContextMenu}
            />

            {#if ensuredTemporal}
              <div class="time-overlay" class:phone={mode === 'phone'} use:chrome>
                <TimeControls
                  compact={mode === 'phone'}
                  temporal={ensuredTemporal}
                  masterOverrideSec={isAligningTime ? alignTargetSec : null}
                  displayOverrideSec={isAligningTime ? alignActualSecondsOverride : null}
                  bind:isPlaying
                  bind:timeScale
                  on:updatetemporal={handleTimeControlsUpdate}
                  on:resetdisplay={handleResetDisplayToActual}
                  on:setactual={handleAlignActualToDisplayAnimated}
                />
              </div>
            {/if}
        </div>
    </svelte:fragment>
    <svelte:fragment slot="detail">
        <div class="details-view">
            {#if focusedBody}
            <FocusHeader
                focusedBody={focusedBody}
                bind:showSensors
                {isEditing} {isPlanning} {isShipLogOpen}
                on:togglevisibility={handleToggleVisibility}
                on:rename={(e) => { dispatch('renameNode', e.detail); systemStore.update(s => s ? { ...s } : s); }}
                on:toggleedit={() => { isEditing = !isEditing; if (isEditing) { showZoneKeyPanel = false; visualizer?.resetView(); } }}
                on:showphysics={() => showPhysicsModal = true}
            />
            {/if}

            <!-- The picture leads now, the way a construct's does. It stopped being decoration when it
                 gained the derived views: the 2D and 3D renders, the colours and the horizon are all
                 answers a GM wants BEFORE the prose, not after the delta-v table. -->
            {#if focusedBody && !isPlanning}
                {#if focusedBody.kind === 'construct'}
                    <!-- A construct's own chain (model > uploaded image > icon glyph) leads, not the
                         planet picture block - BodyImage has no construct views, so it showed a bare
                         fallback sphere above a SECOND picture in the specs below (owner, 2026-08-19). -->
                    <ConstructPortrait construct={focusedBody} {rulePack} nowMs={currentTime} />
                {:else}
                    <BodyImage body={focusedBody} {system} {rulePack} />
                {/if}
            {/if}

            {#if focusedBody && !isPlanning}
                <DescriptionEditor body={focusedBody} editing={isEditing} on:update={handleBodyUpdate} />
            {/if}

            {#if isPlanning}
                <PlannerPane
                    system={$systemStore}
                    {rulePack}
                    currentTime={transitChainTime}
                    originId={plannerOriginId}
                    constructId={planningConstructId}
                    completedPlans={completedTransitPlans}
                    initialState={transitChainState}
                    bind:departureDelayDays={transitDelayDays}
                    focusedBody={focusedBody}
                    hostBody={parentBody}
                    futureJourneyCount={focusedFutureJourneyCount}
                    on:planUpdate={(e) => currentTransitPlan = e.detail}
                    on:alternativesUpdate={(e) => transitAlternatives = e.detail}
                    on:executionStateChange={(e) => isTransitExecuting = e.detail}
                    on:previewUpdate={handlePlannerPreviewUpdate}
                    on:targetSelected={handlePlannerTargetSelected}
                    on:executePlan={handleExecutePlan}
                    on:interstellar={() => dispatch('interstellar', { shipId: planningConstructId || plannerOriginId })}
                    on:refuel={handleRefuel}
                    on:close={handleClosePlanner}
                    on:planTransit={handleStartPlanning}
                    on:openJourneyLog={handleOpenJourneyLog}
                    on:takeoff={handleTakeoff}
                    on:land={handleLand}
                />
            {:else if focusedBody}
            
            {#if showZoneKeyPanel}
                <ZoneKey on:close={() => showZoneKeyPanel = false} />
            {:else}
                {#if focusedBody && focusedBody.kind !== 'construct'}
                    <BodyDetailsPane
                        focusedBody={focusedBody}
                        system={$systemStore || system}
                        {rulePack}
                        {isEditing}
                        nowMs={currentTime}
                        on:update={handleBodyUpdate}
                        on:delete={handleDeleteNode}
                        on:close={() => isEditing = false}
                        on:tabchange={(e) => activeEditTab = e.detail}
                    />
                {/if}

                {#if focusedBody && focusedBody.kind === 'construct'}
                  <ConstructDetailsPane
                    focusedBody={focusedBody}
                    system={$systemStore}
                    hostBody={parentBody}
                    {rulePack}
                    {isShipLogOpen}
                    {isEditing}
                    {isPlanning}
                    futureJourneyCount={focusedFutureJourneyCount}
                    kinematicState={focusedKinematicState}
                    clearFutureCount={countFutureJourneys(focusedBody, getActualTimeMs())}
                    activeCount={activeJourneyCountForActualTime(focusedBody)}
                    {actualTimeMs}
                    displayTimeMs={currentTime}
                    on:seek={handleSeekDisplayTime}
                    on:closelog={handleCloseJourneyLog}
                    on:clearfuture={handleClearFuturePlans}
                    on:cancelactive={handleCancelActivePlan}
                    on:resumejourney={handleResumeJourney}
                    on:update={handleConstructUpdate}
                    on:disengage={() => { showDisengageDialog = true; }}
                    on:delete={handleDeleteNode}
                    on:closeedit={() => isEditing = false}
                    on:tabchange={(e) => activeEditTab = e.detail}
                    on:planTransit={handleStartPlanning}
                    on:openJourneyLog={handleOpenJourneyLog}
                    on:takeoff={handleTakeoff}
                    on:land={handleLand}
                  />
                {/if}
            {/if}
            
            {#if focusedBody?.roleHint === 'star' && $systemStore?.credits?.author}
                {@const c = $systemStore.credits}
                <div class="system-credit">
                    <span class="cred-line">This system was created by <strong>{c.author}</strong>{#if c.version} <span class="cred-ver">v{c.version}</span>{/if}{#if c.created} <span class="cred-date">· {c.created}</span>{/if}</span>
                    {#if c.contact}<div class="cred-contact">{c.contact}</div>{/if}
                </div>
            {/if}
            <!-- GM notes are ALWAYS editable (not gated on Edit) — Edit is only for body
                 properties + the flavour description. -->
            <GmNotesEditor body={focusedBody} on:update={handleBodyUpdate} />
            {/if}


            
        </div>
    </svelte:fragment>
  </AppShell>

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
        <SystemSummaryContextMenu items={contextMenuItems} x={contextMenuX} y={contextMenuY} type={contextMenuType} openToken={contextMenuOpenToken} on:select={handleContextMenuSelect} />
      {/if}
    {/if}

    {#if showBackgroundContextMenu}
        <div class="context-menu" style="left: {contextMenuX}px; top: {contextMenuY}px;" on:click|stopPropagation>
            <ul>
                {#if backgroundCircumbinaryHit}
                    <li on:click={handleAddCircumbinaryFromBackground}>Add circumbinary body around {backgroundCircumbinaryHit.baryName}</li>
                {/if}
                {#if backgroundLagrangeHit}
                    {@const lagName = backgroundLagrangeHit.secondaryName}
                    {@const lagPt = backgroundLagrangeHit.point.toUpperCase()}
                    <li on:click={handleAddConstructAtLagrange}>Put construct at {lagName} {lagPt}</li>
                    {#if backgroundLagrangeHit.point === 'l4' || backgroundLagrangeHit.point === 'l5'}
                        <li on:click={handleAddTrojanFromBackground}>Add Trojan at {lagName} {lagPt}</li>
                    {/if}
                {/if}
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
      <AddConstructModal {rulePack} hostBody={constructHostBody} orbitalBoundaries={constructHostBody.orbitalBoundaries} initialPlacement={constructInitialPlacement} initialTemplate={constructInitialTemplate} initialAuDistance={constructInitialAuDistance} on:create={handleAddConstructCreated} on:close={() => { showAddConstructModal = false; constructInitialTemplate = undefined; constructInitialAuDistance = undefined; }} />
    {/if}

    {#if showCreateConstructModal}
        <LoadConstructTemplateModal {rulePack} mode="create" hostBody={backgroundClickHost || constructHostBody} placementAU={constructClickAU} on:load={handleCreateConstructLoad} on:close={() => showCreateConstructModal = false} />
    {/if}

    {#if showReportConfigModal}
        <ReportConfigModal on:generate={handleGenerateReport} on:close={() => showReportConfigModal = false} />
    {/if}



    {#if sisterStarmap}
        <SisterFileModal fileKind="starmap" context="system" fileName={sisterStarmap.name}
            on:close={() => (sisterStarmap = null)}
            on:confirm={() => { const p = sisterStarmap; sisterStarmap = null; if (p) dispatch('openstarmap', { doc: p.doc, models: p.models }); }} />
    {/if}
    {#if showSaveModal}
        <SaveSystemModal scope="system" subjectName={$systemStore?.name ?? ''} on:save={handleSaveSystem} on:close={() => showSaveModal = false} />
    {/if}

    {#if showDisengageDialog && focusedBody && focusedBody.kind === 'construct'}
        <AutopilotDisengageDialog
            shipName={focusedBody.name}
            inTransit={focusedKinematicState === 'Transit'}
            on:choose={(e) => disengageAutopilot(e.detail)}
            on:close={() => { showDisengageDialog = false; }} />
    {/if}

    {#if showPhysicsModal && focusedBody && focusedBody.kind === 'body'}
        <PhysicsTraceModal body={focusedBody} system={$systemStore} {rulePack} on:update={handleBodyUpdate} on:close={() => showPhysicsModal = false} />
    {/if}

    {#if showAddTypeModal && pendingAdd}
        <AddBodyTypeModal {rulePack} teqK={pendingAdd.teqK} role={pendingAdd.role} hostMassKg={pendingAdd.hostMassKg}
            ageGyr={pendingAdd.ageGyr} canTidallyLock={pendingAdd.canTidallyLock} trojan={pendingAdd.trojan} circumbinary={pendingAdd.circumbinary}
            on:select={placeBodyOfType} on:close={() => { showAddTypeModal = false; pendingAdd = null; }} />
    {/if}

    {#if importBytes && importSource}
        <ImportModal bytes={importBytes} fileName={importFileName} source={importSource} {rulePack}
            on:close={() => (importBytes = null)}
            on:load={(e) => {
                let sys = e.detail.system;
                const oldId = $systemStore?.id;
                if (oldId) sys.id = oldId;       // preserve the starmap link, like a JSON load
                systemStore.set(sys);
                currentTime = sys?.epochT0 || Date.now();
                focusedBodyId = null;
                importBytes = null;
            }} />
    {/if}

    {/if}
</main>


<style>
  main {
    font-family: sans-serif;
    padding: 0;
    font-size: 0.9em;
    position: relative;
  }
  .system-credit {
    margin: 6px 0 2px; padding: 6px 10px; border-left: 2px solid var(--accent, #ff5a1f);
    background: var(--bg-panel, #1c1c22); border-radius: 4px; font-size: 0.82em; color: var(--text-muted);
  }
  .system-credit .cred-line { color: var(--text); }
  .system-credit .cred-ver, .system-credit .cred-date { color: var(--text-faint); font-variant-numeric: tabular-nums; }
  .system-credit .cred-contact { font-size: 0.92em; color: var(--text-faint); margin-top: 2px; }
  .controls {
    margin: 0.5em 0;
    display: flex;
    align-items: center;
    gap: 1em;
  }
  .clock-line {
    display: flex;
    align-items: center;
    gap: 1.2em;
    color: var(--text-muted);
    font-size: 0.85em;
    flex: 1 1 auto;
    width: 100%;
    min-width: 0;
  }
  .time-readouts {
    display: flex;
    flex-direction: column;
    gap: 2px;
    justify-content: center;
  }
  .actual-time {
    color: var(--text-faint);
    font-size: 0.9em;
  }
  .scrub-rate {
    color: #00ffff;
    font-weight: bold;
    margin-left: 4px;
  }
  .scrub-label {
    color: var(--text-muted);
    font-size: 0.8rem;
  }
  .scrub-slider {
    width: 100%;
  }
  .scrub-control {
    display: flex;
    flex-direction: column;
    gap: 3px;
    flex: 0 0 auto;
    min-width: 390px;
  }
  .scrub-label-row {
    display: flex;
    justify-content: space-between;
    align-items: center;
    width: 100%;
  }
  .checkbox-label {
    display: flex;
    align-items: center;
    gap: 4px;
    font-size: 0.72rem;
    color: var(--text-faint);
    cursor: pointer;
  }
  .checkbox-label input {
    margin: 0;
    cursor: pointer;
  }
  .scrub-slider-row {
    display: flex;
    align-items: center;
    gap: 6px;
  }
  .scrub-slider-wrap {
    display: flex;
    flex-direction: column;
    gap: 3px;
    flex: 1 1 auto;
    min-width: 0;
  }
  .play-toggle {
    width: 30px;
    min-width: 30px;
    height: 24px;
    padding: 0;
    line-height: 1;
    font-size: 0.9rem;
    background: #1f1f1f;
    border: 1px solid var(--border);
    color: var(--text);
    border-radius: 4px;
    cursor: pointer;
  }
  .play-toggle:hover {
    background: var(--bg-control-hover);
  }
  .scrub-scale {
    display: grid;
    grid-template-columns: 1fr 1fr 1fr 1fr 1fr;
    font-size: 0.72rem;
    color: var(--text-faint);
  }
  .scrub-scale span:nth-child(1) { text-align: left; }
  .scrub-scale span:nth-child(2) { text-align: center; }
  .scrub-scale span:nth-child(3) { text-align: center; }
  .scrub-scale span:nth-child(4) { text-align: center; }
  .scrub-scale span:nth-child(5) { text-align: right; }
  .clock-line > span {
    white-space: nowrap;
  }
  .clock-line .display-time {
    font-size: 1rem;
  }
  .clock-line .clock-action.btn-blue {
    background: var(--accent);
    border: 1px solid var(--accent);
    color: var(--on-accent);
  }
  .clock-line .clock-action.btn-blue:hover {
    background: var(--accent-hover);
  }
  .clock-line .clock-action.btn-red {
    background: var(--status-bad);
    border: 1px solid var(--status-bad);
    color: #fff;
  }
  .clock-line .clock-action.btn-red:hover {
    filter: brightness(1.12);
  }
  .clock-actions {
    margin-left: auto;
    display: flex;
    gap: 8px;
    align-items: center;
  }
  .time-panel {
    border: 1px solid var(--border);
    border-radius: 6px;
    background: rgba(18, 18, 18, 0.9);
    padding: 8px 10px;
    margin: 0.5em 0;
    display: flex;
    gap: 12px;
    align-items: center;
    width: 100%;
    box-sizing: border-box;
  }
  .time-title {
    font-size: 3rem;
    font-weight: 400;
    color: var(--text);
    line-height: 1;
    display: flex;
    align-items: center;
    justify-content: center;
    white-space: nowrap;
  }
  .focus-header h2 {
      margin: 0;
  }
  .time-scales {
    display: flex;
    align-items: center;
    gap: 0.5em;
    background-color: var(--bg-control);
    padding: 0.25em;
    border-radius: 5px;
  }
  .time-scales button {
      border: 1px solid var(--border);
      background-color: var(--bg-control);
      color: var(--text);
  }
  .time-scales button.active {
      border-color: var(--link);
      background-color: var(--accent);
      color: white;
  }
  .dropdown {
    position: relative;
    display: inline-block;
  }

  .dropdown-content {
    display: block;
    position: absolute;
    background-color: var(--bg-panel);
    min-width: 160px;
    box-shadow: 0px 8px 16px 0px rgba(0,0,0,0.2);
    z-index: 1;
    right: 0;
  }

  .dropdown-content button {
    color: var(--text);
    padding: 12px 16px;
    text-decoration: none;
    display: block;
    width: 100%;
    text-align: left;
    background: none;
    border: none;
  }

  .dropdown-content button:hover {background-color: var(--bg-control-hover);}

  .hamburger-button {
    font-size: 1.5em;
    background: none;
    border: none;
    color: var(--text);
  }

  .todo-button {
    color: var(--text-faint) !important;
  }

  /* SystemView no longer owns the layout grid — AppShell places canvas/detail into its
     slots. main-view (orrery wrapper) + details-view (panes) just flow inside their slots. */
  .main-view {
    width: 100%;
    height: 100%;
    position: relative; /* anchor the BodyPicker + time overlays */
    min-height: 0;
    min-width: 0;
    overflow: hidden; /* the orrery fills this exactly; clip any sub-pixel overshoot */
  }
  .time-display-overlay {
    position: absolute;
    top: 8px;
    left: 8px;
    z-index: 57;
  }
  /* On-canvas orrery controls (top-right): faded Reset + a View popover. */
  .orrery-controls {
    position: absolute;
    top: 8px;
    right: 8px;
    z-index: 66; /* above the BodyPicker (60) so the eye is never hidden behind it */
    display: flex;
    gap: 8px;
    align-items: flex-start;
  }
  .orrery-controls.phone { top: 62px; }
  .ov-btn {
    height: 32px;
    padding: 0 10px;
    display: flex;
    align-items: center;
    gap: 4px;
    border: 1px solid var(--border, #2a2d36);
    border-radius: 8px;
    background: color-mix(in srgb, var(--bg-panel, #14161c) 86%, transparent);
    color: var(--text, #e8e8e8);
    font-size: 0.85rem;
    cursor: pointer;
    backdrop-filter: blur(6px);
  }
  .ov-btn:hover { background: var(--bg-control-hover, #232733); }
  .ov-btn.faded { opacity: 0.55; font-size: 1rem; }
  .ov-btn.faded:hover { opacity: 1; }
  .ov-btn.active { border-color: var(--accent, #ff5a1f); }
  /* Semitransparent round sliders button that floats on the orrery and opens the View options (wireframe feel). */
  .ov-eye {
    width: 36px;
    padding: 0;
    justify-content: center;
    border-radius: 50%;
    background: color-mix(in srgb, var(--bg-panel, #14161c) 50%, transparent);
    opacity: 0.85;
  }
  .ov-eye:hover { opacity: 1; }
  .ov-eye.active { border-color: var(--accent, #ff5a1f); color: var(--accent, #ff5a1f); opacity: 1; }
  .ov-view { position: relative; }
  .ov-popover {
    position: absolute;
    top: calc(100% + 6px);
    right: 0;
    min-width: 190px;
    display: flex;
    flex-direction: column;
    gap: 8px;
    padding: 10px;
    background: var(--bg-panel, #14161c);
    border: 1px solid var(--border, #2a2d36);
    border-radius: 10px;
    box-shadow: 0 8px 24px rgba(0, 0, 0, 0.55);
  }
  .ov-popover label {
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: 0.9rem;
    cursor: pointer;
  }
  .ov-popover label.ov-slider { flex-direction: column; align-items: stretch; gap: 4px; }
  .ov-popover label.ov-slider input { width: 100%; }
  .ov-seg {
    display: flex;
    gap: 2px;
    padding: 2px;
    background: var(--bg-control, #1b1e26);
    border: 1px solid var(--border, #2a2d36);
    border-radius: 8px;
  }
  .ov-seg button {
    flex: 1 1 0;
    padding: 6px 8px;
    border: none;
    border-radius: 6px;
    background: transparent;
    color: var(--text-muted, #cfcfcf);
    font-size: 0.82rem;
    cursor: pointer;
  }
  .ov-seg button.active { background: var(--accent, #ff5a1f); color: var(--on-accent, #fff); }
  /* Time transport floats over the bottom-LEFT of the orrery — under the top-left time
     read-out, so all the time controls live on the left. */
  .time-overlay {
    position: absolute;
    bottom: 14px;
    left: 14px;
    z-index: 55;
    max-width: min(460px, calc(100% - 28px));
  }
  .time-overlay.phone {
    /* fixed to the viewport (the orrery .main-view is short on phone); sit above the
       bottom-sheet peek (~86px) and leave the bottom-right FAB room */
    position: fixed;
    z-index: 1150;
    bottom: 98px;
    left: 84px; /* clear the bottom-left menu FAB */
    right: 8px;
    transform: none;
    width: auto;
  }
  .details-view {
    width: 100%;
  }

  .name-input {
    background-color: transparent;
    border: 1px solid transparent;
    color: var(--accent);
    font-size: 1.8em;
    font-weight: bold;
    padding: 0.1em;
    margin: 0;
    width: 100%;
    border-radius: 4px;
  }
  .name-input:hover, .name-input:focus {
      background-color: #252525;
      border-color: var(--border);
  }

  .context-menu {
    position: fixed; /* Fixed positioning for clientX/clientY */
    background-color: var(--bg-panel);
    border: 1px solid var(--border);
    border-radius: 5px;
    z-index: 1000;
    color: var(--text);
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
    background-color: var(--bg-control-hover);
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
      color: var(--text);
      background-color: var(--bg-control);
      transition: background-color 0.2s;
  }

  .action-buttons button.edit-btn:hover {
      background-color: var(--accent);
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
      border: 1px solid var(--border);
      border-radius: 4px;
      cursor: pointer;
      padding: 4px;
      display: flex;
      align-items: center;
      justify-content: center;
      background-color: var(--bg-panel);
  }
  .visibility-btn:hover {
      background-color: var(--bg-control);
      border-color: var(--border);
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
        border-top: 1px solid var(--border-soft);
        color: var(--text-muted);
        font-size: 0.9em; /* Increased font size */
        text-align: center;
    }
    .attributions a {
        color: var(--link);
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
        border-top: 1px solid var(--border);
        margin: 1.5em 0; /* Blank space above and below the separator */
    }
    .project-attribution {
        font-size: 1.1em; /* Slightly larger for the last line */
        font-weight: bold;
    }

    /* Phone slide-in rail: per-system View options (toggles live here on phone,
       since the desktop canvas toolbar is hidden in phone mode). */
    .rail-view-options {
        display: flex;
        flex-direction: column;
        gap: 10px;
        margin-top: 16px;
        padding-top: 12px;
        border-top: 1px solid var(--border);
    }
    .rail-section-title {
        margin: 0;
        font-size: 0.8rem;
        text-transform: uppercase;
        letter-spacing: 0.5px;
        color: var(--text-faint);
    }
    .rail-view-options label {
        display: flex;
        align-items: center;
        gap: 8px;
        font-size: 0.95rem;
        color: var(--text);
        cursor: pointer;
    }
    .rail-view-options label.rail-slider {
        flex-direction: column;
        align-items: stretch;
        gap: 4px;
    }
    .rail-seg {
        display: flex;
        gap: 2px;
        padding: 2px;
        background: var(--bg-panel, #14161c);
        border: 1px solid var(--border);
        border-radius: 8px;
    }
    .rail-seg button {
        flex: 1 1 0;
        padding: 7px 8px;
        border: none;
        border-radius: 6px;
        background: transparent;
        color: var(--text-muted, #cfcfcf);
        font-size: 0.85rem;
        cursor: pointer;
    }
    .rail-seg button.active {
        background: var(--accent, #ff5a1f);
        color: var(--on-accent, #fff);
    }
    .rail-view-options label.rail-slider input {
        width: 100%;
    }
    .rail-btn {
        margin-top: 4px;
        padding: 10px 12px;
        background: var(--bg-control, #1b1e26);
        border: 1px solid var(--border);
        color: var(--text);
        border-radius: 8px;
        cursor: pointer;
        text-align: left;
    }
    .rail-btn:hover {
        background: var(--bg-control-hover, #232733);
    }

</style>


