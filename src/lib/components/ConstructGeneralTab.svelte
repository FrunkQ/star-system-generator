<script lang="ts">
  import { createEventDispatcher, onMount } from 'svelte';
  import type { CelestialBody, System } from '$lib/types';
  import { AU_KM } from '$lib/constants';
  import UnitValue from './UnitValue.svelte';
  import UnitInput from './UnitInput.svelte';
  import { getPlanetColor } from '$lib/rendering/colors';
  import { deriveCoOrbitalOrbit, lagrangePlacementId, LAGRANGE_PLACEMENTS } from '$lib/physics/lagrange';
  import { hostCandidates } from '$lib/system/reparent';
  import { megaTypeDef } from '$lib/constructs/megaTypes';
  import { effectiveMegaRequires, megaHardCheck, filterMegaPlacements, megaPlacementAllowed, megaIsSurfaceOnly, type MegaHost } from '$lib/constructs/megaPlacement';

  export let system: System;
  export let construct: CelestialBody;
  
  const dispatch = createEventDispatcher();

  let availableParents: CelestialBody[] = [];
  let availablePlacements: string[] = [];
  
  let selectedParentId: string | undefined = undefined;
  let selectedPlacement: string | null = null;
  // G43: which of the five points the current placement names (null for Surface / an orbit band).
  // The orbit of a co-orbital construct is DERIVED from its secondary, so every element control
  // below is read-only for one — this is the single predicate they all gate on.
  $: selectedLagrangePoint = lagrangePlacementId(selectedPlacement);
  // G53 relevance, on the EDIT surface as well as the create dialog (UI-B2): a mega type's own
  // record says which placements and which hosts mean anything for it. An elevator is Surface or
  // nothing - so no L-point is offered, no host without a surface is offered, and it has no
  // altitude or orbital position to move (its position is its anchor, not an orbit).
  // Handlers ask `typeDef()` directly: a `$:` value is one flush behind inside an event handler
  // (see handleUpdate), and a gate must never be the stale half of a comparison.
  const typeDef = () => megaTypeDef(construct?.megaType);
  $: megaDef = megaTypeDef(construct?.megaType);
  $: surfaceOnly = megaIsSurfaceOnly(megaDef);
  function hostRefusal(parent: CelestialBody | undefined): string | undefined {
    const def = typeDef();
    if (!def || !parent) return undefined;
    const r = megaHardCheck(effectiveMegaRequires(construct, def), parent as MegaHost, construct.explain ?? def.explain);
    return r.ok ? undefined : r.reason;
  }
  let auDistance: number = 0;
  let anomalyDeg: number = 0;
  let eccentricity = 0;
  let eccentricityAngle = 0;

  // --- State for Planetary Orbital Slider ---
  type OrbitalZone = { name: string; startPos: number; endPos: number; color: string; };
  let showOrbitalSlider = false;
  let orbitalSliderMinKm = 0;
  let orbitalSliderMaxKm = 1000000;
  let orbitalSliderValue = 0; // Linear 0-1 value
  let orbitalZones: OrbitalZone[] = [];
  let goTickPos: number | null = null;
  let parentRadiusKm = 0;

  // --- State for Interplanetary Slider ---
  type PlanetTick = { name: string; pos: number; color: string; };
  let showInterplanetarySlider = false;
  let interplanetarySliderMinAu = 0.01;
  let interplanetarySliderMaxAu = 50;
  let interplanetarySliderValue = 0; // Linear 0-1 value
  let planetTicks: PlanetTick[] = [];
  let sortedPlanets: CelestialBody[] = [];

  // --- SVG Slider Interaction ---
  let isDragging = false;
  let sliderEl: SVGSVGElement;

  onMount(() => {
    // ONE list rule for "what may this orbit", shared with a body's re-home control (G64).
    availableParents = hostCandidates(system) as CelestialBody[];
    selectedParentId = construct.parentId || undefined; // Use physical parent for editor
    selectedPlacement = construct.placement;
    if (construct.orbit) {
        auDistance = construct.orbit.elements.a_AU;
        let trueDeg = (construct.orbit.elements.M0_rad || 0) * (180 / Math.PI);
        anomalyDeg = ((trueDeg + 90) % 360 + 360) % 360;
        eccentricity = construct.orbit.elements.e || 0;
        eccentricityAngle = construct.orbit.elements.omega_deg || 0;
    }
    updateUIFromState();
  });

  $: if (construct.id && construct.orbit) {
    if (!isDragging) {
        let trueDeg = (construct.orbit.elements.M0_rad || 0) * (180 / Math.PI);
        anomalyDeg = ((trueDeg + 90) % 360 + 360) % 360;
        eccentricity = construct.orbit.elements.e || 0; 
        eccentricityAngle = construct.orbit.elements.omega_deg || 0;
    }
  }

  function handleAnomalyChange() {
      // An emptied number box binds null/undefined; never write a non-number into an element.
      if (construct.orbit && Number.isFinite(anomalyDeg) && !megaIsSurfaceOnly(typeDef())) {
          let trueDeg = anomalyDeg - 90;
          construct.orbit.elements.M0_rad = trueDeg * (Math.PI / 180);
          dispatch('update');
      }
  }

  function handleEccentricityChange() {
      if (construct.orbit && Number.isFinite(eccentricity)) {
          construct.orbit.elements.e = Math.min(0.999, Math.max(0, parseFloat(eccentricity.toFixed(3))));
          dispatch('update');
      }
  }

  function handleEccentricityAngleChange() {
      if (construct.orbit && Number.isFinite(eccentricityAngle)) {
          construct.orbit.elements.omega_deg = eccentricityAngle;
          dispatch('update');
      }
  }

  // Planet-dot colour for the slider is the canonical getPlanetColor (token-driven),
  // so it matches the orrery / starmap.
  const getPlanetColorForSlider = getPlanetColor;

  function updateUIFromState() {
    updatePlacementsForParent();
    updateSliderState();
  }

  function updatePlacementsForParent() {
    if (!selectedParentId) return;
    const parentBody = system.nodes.find(n => n.id === selectedParentId);
    if (!parentBody) return;

    const placements: string[] = [];
    
    if (parentBody.roleHint === 'star' || parentBody.kind === 'barycenter') {
      sortedPlanets = system.nodes
        .filter(n => n.parentId === parentBody.id && n.kind === 'body' && n.orbit)
        .sort((a, b) => (a.orbit?.elements.a_AU || 0) - (b.orbit?.elements.a_AU || 0));
      
      if (sortedPlanets.length > 0) {
        placements.push('Inner System');
        for (let i = 0; i < sortedPlanets.length - 1; i++) {
          placements.push(`${sortedPlanets[i].name} - ${sortedPlanets[i+1].name}`);
        }
        placements.push('Outer System');
      } else {
        placements.push('AU Distance');
      }
    } else if (parentBody.kind === 'body' && (parentBody.roleHint === 'planet' || parentBody.roleHint === 'moon')) {
      const boundaries = parentBody.orbitalBoundaries;
      const isGasGiant = parentBody.classes?.some(c => c.includes('gas-giant')) ?? false;
      if (!isGasGiant) placements.push('Surface');
      placements.push('Low Orbit');
      
      if (boundaries) {
          if (boundaries.leoMoeBoundaryKm < boundaries.meoHeoBoundaryKm) {
              placements.push('Medium Orbit');
          }
          if (boundaries.meoHeoBoundaryKm < boundaries.heoUpperBoundaryKm) {
              placements.push('High Orbit');
          }
          if (boundaries.geoStationaryKm && !boundaries.isGeoFallback) {
              placements.push('Geostationary Orbit');
          }
      }
    }
    
    if (parentBody.parentId && parentBody.roleHint !== 'star') {
      // G43 P3: all five points, not just the triangular pair. What each COSTS is physics and
      // arrives as the flight/fuel-use tag; the editor does not judge, it just offers.
      placements.push(...LAGRANGE_PLACEMENTS);
    }
    
    // The type's half of the axis: the same narrowing the create dialog applies.
    availablePlacements = filterMegaPlacements(megaTypeDef(construct?.megaType), placements);
  }

  function updateSliderState() {
    const parentBody = system.nodes.find(n => n.id === selectedParentId);
    if (!parentBody) return;

    // Reset sliders
    showOrbitalSlider = false;
    showInterplanetarySlider = false;

    const isOrbital = ['Surface', 'Low Orbit', 'Medium Orbit', 'High Orbit', 'Geostationary Orbit'].includes(selectedPlacement || '');

    if (parentBody.roleHint === 'star' || parentBody.kind === 'barycenter') {
      showInterplanetarySlider = true;
      interplanetarySliderMinAu = (sortedPlanets[0]?.orbit?.elements.a_AU || 0.1) * 0.5;
      interplanetarySliderMaxAu = (sortedPlanets[sortedPlanets.length - 1]?.orbit?.elements.a_AU || 50) * 1.5;
      const logTransform = (au: number) => Math.log(Math.max(interplanetarySliderMinAu, au) / interplanetarySliderMinAu) / Math.log(interplanetarySliderMaxAu / interplanetarySliderMinAu);
      
      interplanetarySliderValue = logTransform(construct.orbit?.elements.a_AU || 0);

      planetTicks = sortedPlanets.map(p => ({
        name: p.name,
        pos: logTransform(p.orbit?.elements.a_AU || 0) * 100,
        color: getPlanetColorForSlider(p)
      }));

    } else if (parentBody.orbitalBoundaries && isOrbital && !megaIsSurfaceOnly(megaTypeDef(construct?.megaType))) {
      showOrbitalSlider = true;
      const boundaries = parentBody.orbitalBoundaries;
      parentRadiusKm = parentBody.radiusKm || 0;
      
      orbitalSliderMinKm = boundaries.hasSurface ? 0 : boundaries.minLeoKm;
      orbitalSliderMaxKm = boundaries.heoUpperBoundaryKm;

      const logTransform = (km: number) => Math.log(Math.max(1, km) / Math.max(1, orbitalSliderMinKm)) / Math.log(orbitalSliderMaxKm / Math.max(1, orbitalSliderMinKm));

      const currentAltitudeKm = ((construct.orbit?.elements.a_AU || 0) * AU_KM) - parentRadiusKm;
      orbitalSliderValue = currentAltitudeKm > orbitalSliderMinKm ? logTransform(currentAltitudeKm) : 0;

      const zones: OrbitalZone[] = [];
      let lastPos = 0;
      if (boundaries.hasSurface) {
        const endPos = logTransform(boundaries.surface.max) * 100;
        zones.push({ name: 'Surface', startPos: 0, endPos, color: '#5a5a5a' });
        lastPos = endPos;
      }
      const loEnd = logTransform(boundaries.leoMoeBoundaryKm) * 100;
      zones.push({ name: 'Low Orbit', startPos: lastPos, endPos: loEnd, color: '#3b82f6' });
      
      if (boundaries.leoMoeBoundaryKm < boundaries.meoHeoBoundaryKm) {
        const moEnd = logTransform(boundaries.meoHeoBoundaryKm) * 100;
        zones.push({ name: 'Med Orbit', startPos: loEnd, endPos: moEnd, color: '#10b981' });
        
        if (boundaries.meoHeoBoundaryKm < boundaries.heoUpperBoundaryKm) {
            zones.push({ name: 'High Orbit', startPos: moEnd, endPos: 100, color: '#a855f7' });
        }
      } else if (boundaries.meoHeoBoundaryKm < boundaries.heoUpperBoundaryKm) {
          // Fallback if Med is collapsed but High exists (unlikely but safe)
           zones.push({ name: 'High Orbit', startPos: loEnd, endPos: 100, color: '#a855f7' });
      }
      
      orbitalZones = zones;

      goTickPos = (boundaries.geoStationaryKm && !boundaries.isGeoFallback) ? logTransform(boundaries.geoStationaryKm) * 100 : null;
    }
  }

  function handleSliderInteraction(e: MouseEvent | TouchEvent, type: 'orbital' | 'interplanetary') {
    if (!sliderEl) return;
    const rect = sliderEl.getBoundingClientRect();
    const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX;
    const x = clientX - rect.left;
    const linearValue = Math.max(0, Math.min(1, x / rect.width));

    if (type === 'orbital') {
      // The inverse of updateSliderState's logTransform, floor and all: that one reads the minimum
      // through Math.max(1, ...) and this one did not, so a zero minimum made 0 x Infinity = NaN and
      // wrote it straight into the orbit. A slider may never write a non-number.
      const minKm = Math.max(1, orbitalSliderMinKm);
      const newAltitudeKm = minKm * Math.pow(orbitalSliderMaxKm / minKm, linearValue);
      if (!Number.isFinite(newAltitudeKm)) return;
      let zone = selectedPlacement;
      const parentBody = system.nodes.find(n => n.id === selectedParentId);
      if (parentBody && parentBody.orbitalBoundaries) {
          const boundaries = parentBody.orbitalBoundaries;
          if (boundaries.hasSurface && newAltitudeKm <= boundaries.surface.max) zone = 'Surface';
          else if (newAltitudeKm <= boundaries.leoMoeBoundaryKm) zone = 'Low Orbit';
          else if (newAltitudeKm <= boundaries.meoHeoBoundaryKm) zone = 'Medium Orbit';
          else if (boundaries.geosynchronousOrbit && newAltitudeKm <= boundaries.geoStationaryKm + 1000) zone = 'Geostationary Orbit';
          else zone = 'High Orbit';
      }
      // Relevance again: a drag may not carry a mega into a zone its type cannot take.
      if (!megaPlacementAllowed(typeDef(), zone)) return;
      orbitalSliderValue = linearValue;
      if (construct.orbit) construct.orbit.elements.a_AU = (newAltitudeKm + parentRadiusKm) / AU_KM;
      selectedPlacement = zone;
    } else { // Interplanetary
      const newAu = interplanetarySliderMinAu * Math.pow(interplanetarySliderMaxAu / interplanetarySliderMinAu, linearValue);
      if (!Number.isFinite(newAu) || !(newAu > 0)) return;
      interplanetarySliderValue = linearValue;
      if (construct.orbit) construct.orbit.elements.a_AU = newAu;

      if (newAu < (sortedPlanets[0]?.orbit?.elements.a_AU || 0)) {
        selectedPlacement = 'Inner System';
      } else if (newAu > (sortedPlanets[sortedPlanets.length - 1]?.orbit?.elements.a_AU || 0)) {
        selectedPlacement = 'Outer System';
      } else {
        for (let i = 0; i < sortedPlanets.length - 1; i++) {
          if (newAu > (sortedPlanets[i].orbit?.elements.a_AU || 0) && newAu < (sortedPlanets[i+1].orbit?.elements.a_AU || 0)) {
            selectedPlacement = `${sortedPlanets[i].name} - ${sortedPlanets[i+1].name}`;
            break;
          }
        }
      }
    }
    
    construct.placement = selectedPlacement;
    dispatch('update');
  }

  function handleParentChange() {
    // A host the type has nothing to attach to is greyed in the list; this is the same answer for
    // a value that arrives any other way. The pick is put back and nothing is written.
    if (hostRefusal(system.nodes.find(n => n.id === selectedParentId) as CelestialBody | undefined)) {
      selectedParentId = (construct.ui_parentId || construct.parentId) || undefined;
      updatePlacementsForParent();
      return;
    }
    updatePlacementsForParent();
    selectedPlacement = availablePlacements[0];
    handleUpdate();
  }

  function handleUpdate() {
    if (!construct || !selectedParentId || !selectedPlacement) return;
    const parentBody = system.nodes.find(n => n.id === selectedParentId);
    if (!parentBody) return;

    // Relevance is a hard gate: a placement the type cannot take is not written, whatever route
    // the value arrived by.
    if (!megaPlacementAllowed(typeDef(), selectedPlacement)) {
      selectedPlacement = construct.placement ?? null;
      return;
    }

    construct.placement = selectedPlacement;
    // READ THE PICK ITSELF, NOT THE `$:` MIRROR OF IT. A reactive statement runs on the next flush,
    // so inside this change handler `selectedLagrangePoint` still described the PREVIOUS pick: the
    // first L-point chosen was written as a surface orbit labelled 'L2', and the next pick - even
    // 'Surface' - was sent to the Lagrange point instead. One pick late, every time.
    const lagrangePoint = lagrangePlacementId(selectedPlacement);

    if (!construct.orbit) {
        construct.orbit = { hostId: '', hostMu: 0, t0: 0, elements: { a_AU: 0, e: 0, i_deg: 0, omega_deg: 0, Omega_deg: 0, M0_rad: 0 }};
    }

    if (lagrangePoint) {
      // G43: the structured marker is the load-bearing record — the processor re-derives the orbit
      // from the secondary every pass. The derivation here (same shared convention) is only the
      // instant feedback before the next process().
      construct.parentId = parentBody.parentId;
      construct.ui_parentId = parentBody.id;
      construct.coOrbital = { hostId: parentBody.id, point: lagrangePoint };
      const grandparent = parentBody.parentId ? system.nodes.find(n => n.id === parentBody.parentId) : null;
      const grandparentMassKg = grandparent
        ? ((grandparent as any).kind === 'barycenter' ? (grandparent as any).effectiveMassKg : (grandparent as any).massKg) || 0
        : 0;
      const derived = deriveCoOrbitalOrbit(parentBody, grandparentMassKg, lagrangePoint);
      if (derived) construct.orbit = derived;
      else if (parentBody.orbit) construct.orbit = JSON.parse(JSON.stringify(parentBody.orbit));
    } else {
      delete construct.coOrbital;
      construct.parentId = parentBody.id;
      construct.ui_parentId = null;
      
      // Ensure host physics are updated when reparenting
      if (construct.orbit) {
          construct.orbit.hostId = parentBody.id;
          const mass = (parentBody.kind === 'barycenter' ? (parentBody as any).effectiveMassKg : parentBody.massKg) || 0;
          construct.orbit.hostMu = mass * 6.67430e-11;
      }
      
      const boundaries = parentBody.orbitalBoundaries;
      const hostRadiusKm = parentBody.radiusKm || 0;
      let altitudeKm = 0;

      if (parentBody.roleHint === 'star' || parentBody.kind === 'barycenter') {
        let new_a_AU = construct.orbit?.elements.a_AU || 1;
        if (selectedPlacement === 'Inner System') {
          new_a_AU = (sortedPlanets[0]?.orbit?.elements.a_AU || 1) / 2;
        } else if (selectedPlacement === 'Outer System') {
          new_a_AU = (sortedPlanets[sortedPlanets.length - 1]?.orbit?.elements.a_AU || 50) * 1.5;
        } else if (selectedPlacement && selectedPlacement.includes(' - ')) {
          const [p1Name, p2Name] = selectedPlacement.split(' - ');
          const p1 = sortedPlanets.find(p => p.name === p1Name);
          const p2 = sortedPlanets.find(p => p.name === p2Name);
          new_a_AU = ((p1?.orbit?.elements.a_AU || 0) + (p2?.orbit?.elements.a_AU || 0)) / 2;
        }

        const mass = (parentBody.kind === 'barycenter' ? (parentBody as any).effectiveMassKg : parentBody.massKg) || 0;

        // Create a perfect, circular, non-inclined orbit
        construct.orbit = {
          hostId: parentBody.id,
          hostMu: mass * 6.67430e-11,
          t0: Date.now(),
          elements: {
            a_AU: new_a_AU,
            e: 0, // Default to circular for these placements initially
            i_deg: 0, // On the ecliptic plane
            omega_deg: 0, // Not relevant for circular orbit
            Omega_deg: 0, // Not relevant for non-inclined orbit
            M0_rad: Math.random() * 2 * Math.PI // Random starting position on the circle
          }
        };

      } else {
        switch (selectedPlacement) {
          case 'Surface': altitudeKm = 0; break;
          case 'Low Orbit': altitudeKm = ((boundaries?.minLeoKm || 0) + (boundaries?.leoMoeBoundaryKm || 0)) / 2; break;
          case 'Medium Orbit': altitudeKm = ((boundaries?.leoMoeBoundaryKm || 0) + (boundaries?.meoHeoBoundaryKm || 0)) / 2; break;
          case 'Geostationary Orbit': altitudeKm = boundaries?.geoStationaryKm || 0; break;
          case 'High Orbit': altitudeKm = ((boundaries?.meoHeoBoundaryKm || 0) + (boundaries?.heoUpperBoundaryKm || 0)) / 2; break;
        }
        construct.orbit.elements.a_AU = (hostRadiusKm + altitudeKm) / AU_KM;
        construct.orbit.elements.e = selectedPlacement === 'Surface' ? 0 : construct.orbit.elements.e || 0; // Force 0 for surface

        // Handle Surface Lock vs Keplerian Orbit
        if (selectedPlacement === 'Surface') {
            let rotationHours = (parentBody as any).rotation_period_hours; 
            if (rotationHours === undefined && (parentBody as any).physical_parameters) {
                rotationHours = (parentBody as any).physical_parameters.rotation_period_hours;
            }
            // Fallback to calculated seconds
            let periodSeconds = 0;
            if (rotationHours) {
                periodSeconds = rotationHours * 3600;
            } else if ((parentBody as any).calculatedRotationPeriod_s) {
                periodSeconds = (parentBody as any).calculatedRotationPeriod_s;
            }

            if (periodSeconds !== 0 && isFinite(periodSeconds)) {
                construct.orbit.n_rad_per_s = (2 * Math.PI) / periodSeconds;
            }
        } else {
            // Revert to Keplerian physics for non-surface orbits
            delete construct.orbit.n_rad_per_s;
        }
      }
    }
    
    updateSliderState();
    dispatch('update');
  }
</script>

<div class="tab-panel">
  <div class="placement-controls">
      <div class="form-group">
        <label for="parent-body">Current Orbit</label>
        <select id="parent-body" bind:value={selectedParentId} on:change={handleParentChange}>
          <option value={undefined} disabled>Select a body</option>
          {#each availableParents as parent}
            {@const refusal = megaDef ? hostRefusal(parent) : undefined}
            <option value={parent.id} disabled={!!refusal} title={refusal}>{parent.name}</option>
          {/each}
        </select>
      </div>
      <div class="form-group">
        <label for="placement">Zone</label>
        <select id="placement" bind:value={selectedPlacement} on:change={handleUpdate} disabled={!selectedParentId}>
          <option value={undefined} disabled>Select a placement</option>
          {#each availablePlacements as placementOption}
            <option value={placementOption}>{placementOption}</option>
          {/each}
        </select>
      </div>
  </div>

  {#if showOrbitalSlider}
    <div class="form-group slider-group">
        <div class="label-row">
            <label>Altitude</label>
            <UnitInput quantity="radius" bodyType="construct" min={0}
                value={((construct.orbit?.elements.a_AU || 0) * AU_KM) - parentRadiusKm}
                on:commit={(e) => {
                    if (construct.orbit) construct.orbit.elements.a_AU = (e.detail + parentRadiusKm) / AU_KM;
                    updateSliderState();
                    dispatch('update');
                }} />
        </div>
        <div class="altitude-display">
            <span class="radius-info">Radius: <UnitValue quantity="radius" bodyType="construct" value={parentRadiusKm} /></span>
        </div>
        <svg bind:this={sliderEl} class="slider-svg" 
             on:mousedown={() => isDragging = true} on:mouseup={() => isDragging = false} on:mouseleave={() => isDragging = false}
             on:mousemove={(e) => isDragging && handleSliderInteraction(e, 'orbital')}
             on:click={(e) => handleSliderInteraction(e, 'orbital')}>
            {#if sliderEl}
                {#each orbitalZones as zone} <rect x="{zone.startPos}%" y="5" width="{zone.endPos - zone.startPos}%" height="10" fill={zone.color} /> {/each}
                {#each orbitalZones as zone, i}
                    {#if i > 0} <line x1="{zone.startPos}%" y1="5" x2="{zone.startPos}%" y2="15" class="boundary-tick" /> {/if}
                    <text x="{(zone.startPos + zone.endPos) / 2}%" y="30" class="zone-label">{zone.name}</text>
                {/each}
                {#if goTickPos}
                    <line x1="{goTickPos}%" y1="2" x2="{goTickPos}%" y2="18" class="go-tick" />
                    <text x="{goTickPos}%" y="30" class="zone-label go-label">GO</text>
                {/if}
                <circle class="thumb" cx="{orbitalSliderValue * 100}%" cy="10" r="6" />
            {/if}
        </svg>
    </div>
  {/if}

  {#if showInterplanetarySlider}
    <div class="form-group slider-group">
        <div class="label-row">
            <label>Distance (AU)</label>
            <input type="number" step="any" min="0" value={construct.orbit?.elements.a_AU || 0} on:input={(e) => {
                const au = parseFloat(e.currentTarget.value);
                if (isNaN(au)) return;
                if (construct.orbit) construct.orbit.elements.a_AU = au;
                updateSliderState();
                dispatch('update');
            }} />
        </div>
        <svg bind:this={sliderEl} class="slider-svg"
             on:mousedown={() => isDragging = true} on:mouseup={() => isDragging = false} on:mouseleave={() => isDragging = false}
             on:mousemove={(e) => isDragging && handleSliderInteraction(e, 'interplanetary')}
             on:click={(e) => handleSliderInteraction(e, 'interplanetary')}>
            {#if sliderEl}
                <line class="track" x1="10" y1="10" x2={sliderEl.clientWidth - 10} y2="10" />
                {#each planetTicks as tick}
                    <g transform="translate({10 + (sliderEl.clientWidth - 20) * (tick.pos / 100)}, 0)">
                        <circle cx="0" cy="10" r="4" fill={tick.color} />
                        <text x="0" y="28" class="zone-label">{tick.name}</text>
                    </g>
                {/each}
                <circle class="thumb" cx="{10 + (sliderEl.clientWidth - 20) * interplanetarySliderValue}" cy="10" r="6" />
            {/if}
        </svg>
    </div>
  {/if}

  <div class="form-group">
    <div class="label-row">
        <label for="anomaly">Orbital Position (°)</label>
        <input type="number" step="any" min="0" max="360" bind:value={anomalyDeg} on:input={handleAnomalyChange} disabled={!selectedParentId || surfaceOnly} />
    </div>
    <input type="range" id="anomaly" min="0" max="360" step="0.01" bind:value={anomalyDeg} on:input={handleAnomalyChange} disabled={!selectedParentId || surfaceOnly} class="full-width-slider" />
    {#if surfaceOnly}
      <p class="anchor-note">This structure stands on its anchor and turns with its world, so it has no orbit to move.</p>
    {/if}
  </div>

  <div class="form-row-split">
      <div class="form-group">
        <div class="label-row">
            <label for="eccentricity">Eccentricity</label>
            <input type="number" step="any" min="0" max="0.999" bind:value={eccentricity} on:input={handleEccentricityChange} disabled={!selectedParentId || selectedPlacement === 'Surface' || selectedLagrangePoint} />
        </div>
        <input 
            type="range" 
            id="eccentricity" 
            min="0" 
            max="0.999" 
            step="0.001" 
            bind:value={eccentricity} 
            on:input={handleEccentricityChange} 
            disabled={!selectedParentId || selectedPlacement === 'Surface' || selectedLagrangePoint} 
            class="full-width-slider"
        />
      </div>
      <div class="form-group">
        <div class="label-row">
            <label for="eccentricityAngle">Arg. Periapsis (°)</label>
            <input type="number" step="any" min="0" max="360" bind:value={eccentricityAngle} on:input={handleEccentricityAngleChange} disabled={!selectedParentId || selectedPlacement === 'Surface' || selectedLagrangePoint || eccentricity === 0} />
        </div>
        <input 
            type="range" 
            id="eccentricityAngle" 
            min="0" 
            max="360" 
            step="0.01" 
            bind:value={eccentricityAngle} 
            on:input={handleEccentricityAngleChange} 
            disabled={!selectedParentId || selectedPlacement === 'Surface' || selectedLagrangePoint || eccentricity === 0} 
            class="full-width-slider"
        />
      </div>
  </div>
</div>

<style>
  .tab-panel { padding: 10px; display: flex; flex-direction: column; gap: 15px; }
  .form-group { display: flex; flex-direction: column; flex: 1; gap: 5px; }
  .form-row-split { display: flex; gap: 10px; }
  .label-row {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 2px;
  }
  label { margin-bottom: 0; color: var(--text-muted); font-size: 0.9em; }
  input, select { padding: 8px; border-radius: 4px; border: 1px solid var(--border); background-color: var(--bg-control); color: var(--text); font-size: 1em; }

  input[type="number"], select {
      padding: 4px;
      background: var(--bg-control);
      border: 1px solid var(--border);
      color: var(--text);
      border-radius: 3px;
      width: 100px;
      text-align: right;
  }

  .full-width-slider { width: 100%; margin: 5px 0; }
  .anchor-note { margin: 0; color: var(--text-muted); font-size: 0.85em; }
  input[type="color"] { height: 38px; padding: 2px; }
  hr { border: 1px solid var(--border); margin: 0.5em 0; }
  .icon-controls, .placement-controls { display: flex; gap: 15px; align-items: flex-end; }
  .icon-controls .form-group, .placement-controls .form-group { flex: 1; }
  .checkbox-group { display: flex; flex-direction: row; flex-wrap: wrap; gap: 15px; }
  .checkbox-group label { display: flex; align-items: center; gap: 10px; color: var(--text); }
  .descriptor { font-size: 0.9em; color: var(--text-muted); }
  .slider-group { margin-top: -10px; }
  .altitude-display { display: flex; justify-content: space-between; align-items: baseline; }
  .radius-info { font-size: 0.8em; color: var(--text-muted); }
  .slider-svg { width: 100%; height: 40px; cursor: pointer; user-select: none; }
  .track { stroke: var(--border); stroke-width: 2; }
  .boundary-tick { stroke: #fff; stroke-width: 1; }
  .zone-label { font-size: 0.7em; fill: var(--text-muted); text-anchor: middle; }
  .go-tick { stroke: #facc15; stroke-width: 2; }
  .go-label { fill: #facc15; font-weight: bold; }
  .thumb { fill: var(--accent); stroke: #fff; stroke-width: 2; pointer-events: none; }
</style>
