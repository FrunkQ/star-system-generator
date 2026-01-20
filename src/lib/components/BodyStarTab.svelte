<script lang="ts">
  import { createEventDispatcher, untrack } from 'svelte';
  import type { CelestialBody } from '$lib/types';
  import { SOLAR_MASS_KG, SOLAR_RADIUS_KM } from '$lib/constants';
  import { STAR_COLOR_MAP } from '$lib/rendering/colors';

  let { body, rulePack } = $props();

  const dispatch = createEventDispatcher();

  // --- State ---
  let massSuns = $state(0);
  let radiusSuns = $state(0);
  let tempK = $state(0);
  let radiation = $state(0);
  let rotationHours = $state(0);
  let magGauss = $state(0);

  // --- Mass Slider Config ---
  const massMin = 0.01; // ~10 Jupiter masses (Brown Dwarf range)
  const massMax = 300;
  const massLogMin = Math.log(massMin);
  const massLogMax = Math.log(massMax);
  let massSliderPos = $state(0.5);

  // --- Radius Slider Config ---
  const radiusMin = 0.01;
  const radiusMax = 2000;
  const radiusLogMin = Math.log(radiusMin);
  const radiusLogMax = Math.log(radiusMax);
  let radiusSliderPos = $state(0.5);

  // --- Temp Slider Config ---
  const tempMin = 500; // Brown Dwarf / Y-dwarf range
  const tempMax = 50000;
  const tempLogMin = Math.log(tempMin);
  const tempLogMax = Math.log(tempMax);
  let tempSliderPos = $state(0.5);

  // --- Radiation Slider Config ---
  const radMin = 0.01;
  const radMax = 50000;
  const radLogMin = Math.log(radMin);
  const radLogMax = Math.log(radMax);
  let radSliderPos = $state(0.25);

  // --- Magnetic Field Slider Config ---
  const magMin = 0.01;
  const magMax = 1e15; // 1 Quadrillion Gauss (Magnetar range)
  const magLogMin = Math.log(magMin);
  const magLogMax = Math.log(magMax);
  let magSliderPos = $state(0.5);

  const radZones = [
      { name: 'Neg', start: 0.01, end: 0.1, color: '#4ade80' },
      { name: 'Low', start: 0.1, end: 2, color: '#84cc16' },
      { name: 'Mod', start: 2, end: 10, color: '#eab308' },
      { name: 'High', start: 10, end: 100, color: '#f97316' },
      { name: 'V.High', start: 100, end: 1000, color: '#ef4444' },
      { name: 'Ext', start: 1000, end: 50000, color: '#7f1d1d' }
  ];

  const tempZones = [
      { name: 'Y', start: 500, end: 700, color: '#2a1a1a' },
      { name: 'T', start: 700, end: 1300, color: '#4a2a2a' },
      { name: 'L', start: 1300, end: 2000, color: '#8a4a4a' },
      { name: 'M', start: 2000, end: 3700, color: '#ffc46f' },
      { name: 'K', start: 3700, end: 5200, color: '#ffd2a1' },
      { name: 'G', start: 5200, end: 6000, color: '#fff4ea' },
      { name: 'F', start: 6000, end: 7500, color: '#f8f7ff' },
      { name: 'A', start: 7500, end: 10000, color: '#cad8ff' },
      { name: 'B', start: 10000, end: 30000, color: '#aabfff' },
      { name: 'O', start: 30000, end: 50000, color: '#9bb0ff' }
  ];

  const SPECTRAL_DATA: Record<string, { label: string, ranges: { mass: [number, number], radius: [number, number], temp: [number, number], rad: [number, number], mag: [number, number], rot: [number, number] } }> = {
      'star/O': { label: 'O-Type (Blue Supergiant)', ranges: { mass: [16, 100], radius: [6.6, 20], temp: [30000, 50000], rad: [10000, 100000], mag: [10, 1000], rot: [10, 100] } },
      'star/B': { label: 'B-Type (Blue Giant)', ranges: { mass: [2.1, 16], radius: [1.8, 6.6], temp: [10000, 30000], rad: [100, 10000], mag: [1, 20], rot: [10, 150] } },
      'star/A': { label: 'A-Type (White)', ranges: { mass: [1.4, 2.1], radius: [1.4, 1.8], temp: [7500, 10000], rad: [10, 100], mag: [1, 10], rot: [10, 200] } },
      'star/F': { label: 'F-Type (Yellow-White)', ranges: { mass: [1.04, 1.4], radius: [1.15, 1.4], temp: [6000, 7500], rad: [2, 10], mag: [1, 50], rot: [20, 300] } },
      'star/G': { label: 'G-Type (Yellow Dwarf)', ranges: { mass: [0.8, 1.04], radius: [0.96, 1.15], temp: [5200, 6000], rad: [0.6, 2], mag: [0.1, 10], rot: [24, 1000] } },
      'star/K': { label: 'K-Type (Orange Dwarf)', ranges: { mass: [0.45, 0.8], radius: [0.7, 0.96], temp: [3700, 5200], rad: [0.1, 0.6], mag: [0.1, 10], rot: [50, 1500] } },
      'star/M': { label: 'M-Type (Red Dwarf)', ranges: { mass: [0.08, 0.45], radius: [0.1, 0.7], temp: [2000, 3700], rad: [0.01, 0.1], mag: [0.1, 50], rot: [100, 2000] } },
      'star/L': { label: 'L-Type (Brown Dwarf)', ranges: { mass: [0.06, 0.08], radius: [0.08, 0.15], temp: [1300, 2000], rad: [0.001, 0.01], mag: [0.1, 100], rot: [5, 50] } },
      'star/T': { label: 'T-Type (Methane Dwarf)', ranges: { mass: [0.03, 0.06], radius: [0.08, 0.15], temp: [700, 1300], rad: [0.0001, 0.001], mag: [0.1, 100], rot: [5, 50] } },
      'star/Y': { label: 'Y-Type (Sub-Brown Dwarf)', ranges: { mass: [0.01, 0.03], radius: [0.08, 0.15], temp: [300, 700], rad: [0.00001, 0.0001], mag: [0.1, 100], rot: [5, 50] } },
      'star/red-giant': { label: 'Red Giant', ranges: { mass: [0.3, 8], radius: [20, 100], temp: [3000, 5000], rad: [100, 5000], mag: [0.1, 100], rot: [1000, 10000] } },
      'star/WD': { label: 'White Dwarf (WD)', ranges: { mass: [0.1, 1.4], radius: [0.008, 0.02], temp: [4000, 100000], rad: [0.01, 1], mag: [1e5, 1e9], rot: [0.1, 10] } },
      'star/NS': { label: 'Neutron Star (NS)', ranges: { mass: [1.4, 3], radius: [0.00001, 0.00002], temp: [100000, 1000000], rad: [100, 100000], mag: [1e8, 1e12], rot: [0.001, 1] } },
      'star/magnetar': { label: 'Magnetar', ranges: { mass: [1.4, 3], radius: [0.00001, 0.00002], temp: [100000, 1000000], rad: [10000, 1000000], mag: [1e13, 1e15], rot: [0.001, 1] } },
      'star/BH': { label: 'Black Hole (BH)', ranges: { mass: [3, 100], radius: [0.00001, 0.001], temp: [0, 100], rad: [0, 0.001], mag: [0, 0], rot: [0.001, 1] } },
      'star/BH_active': { label: 'Active Black Hole (Accretion)', ranges: { mass: [3, 100], radius: [0.00001, 0.001], temp: [10000, 1000000], rad: [1000, 1000000], mag: [1e3, 1e9], rot: [0.001, 1] } }
  };

  const spectralTypes = Object.keys(SPECTRAL_DATA);

  // --- Helper Functions (Moved up for scope) ---
  function getStarColorFromTemp(k: number) {
      if (k < 1000) return "#2a1a1a";
      if (k < 1500) return "#4a2a2a";
      if (k < 2000) return "#8a4a4a";
      if (k < 3700) return "#ffc46f";
      if (k < 5200) return "#ffd2a1";
      if (k < 6000) return "#fff4ea";
      if (k < 7500) return "#f8f7ff";
      if (k < 10000) return "#cad8ff";
      if (k < 30000) return "#aabfff";
      return "#9bb0ff";
  }

  function getLogPos(val: number) {
      return (Math.log(Math.max(radMin, val)) - radLogMin) / (radLogMax - radLogMin) * 100;
  }

  function getTempLogPos(val: number) {
      return (Math.log(Math.max(tempMin, val)) - tempLogMin) / (tempLogMax - tempLogMin) * 100;
  }

  // --- Derived Ranges ---
  let currentClass = $state('star/G');

  $effect(() => {
      if (body?.classes?.[0]) {
          currentClass = body.classes[0];
      }
  });

  function getRangePct(prop: 'mass' | 'radius' | 'temp' | 'rad' | 'mag' | 'rot', type: 'start' | 'width') {
      const data = SPECTRAL_DATA[currentClass] || SPECTRAL_DATA['star/G'];
      const range = data.ranges[prop];
      if (!range) return 0;

      let minL = 0, maxL = 0, startL = 0, endL = 0;
      if (prop === 'mass') { minL = massLogMin; maxL = massLogMax; startL = Math.log(Math.max(massMin, range[0])); endL = Math.log(Math.min(massMax, range[1])); }
      if (prop === 'radius') { minL = radiusLogMin; maxL = radiusLogMax; startL = Math.log(Math.max(radiusMin, range[0])); endL = Math.log(Math.min(radiusMax, range[1])); }
      if (prop === 'temp') { minL = tempLogMin; maxL = tempLogMax; startL = Math.log(Math.max(tempMin, range[0])); endL = Math.log(Math.min(tempMax, range[1])); }
      if (prop === 'rad') { minL = radLogMin; maxL = radLogMax; startL = Math.log(Math.max(radMin, range[0])); endL = Math.log(Math.min(radMax, range[1])); }
      if (prop === 'mag') { minL = magLogMin; maxL = magLogMax; startL = Math.log(Math.max(magMin, range[0])); endL = Math.log(Math.min(magMax, range[1])); }
      if (prop === 'rot') { minL = Math.log(0.1); maxL = Math.log(10000); startL = Math.log(Math.max(0.1, range[0])); endL = Math.log(Math.min(10000, range[1])); }

      const startPct = (startL - minL) / (maxL - minL) * 100;
      const endPct = (endL - minL) / (maxL - minL) * 100;
      
      if (type === 'start') return Math.max(0, startPct);
      return Math.max(2, endPct - startPct);
  }

  // --- Derived Values (Runes) ---
  let starColor = $derived.by(() => {
      return getStarColorFromTemp(tempK);
  });

  let starStyle = $derived.by(() => {
      const type = currentClass.split('/')[1];
      let bg = getStarColorFromTemp(tempK);
      let border = '#fff';
      let shadow = bg;

      if (type === 'magnetar') { bg = '#800080'; shadow = '#800080'; }
      if (type === 'BH') { bg = '#000000'; border = '#444'; shadow = 'transparent'; }
      if (type === 'BH_active') { bg = '#000000'; border = '#ffaa00'; shadow = '#ffaa00'; }
      if (type === 'NS') { bg = '#c0c0ff'; shadow = '#c0c0ff'; }
      if (type === 'WD') { bg = '#f0f0f0'; shadow = '#f0f0f0'; }
      if (type === 'red-giant') { bg = '#8b0000'; shadow = '#8b0000'; }

      return `background-color: ${bg}; border: 2px solid ${border}; box-shadow: 0 0 10px ${shadow};`;
  });

  let luminosity = $derived((radiusSuns ** 2) * ((tempK / 5778) ** 4));

  // --- Initialization & Sync ---
  $effect(() => {
      if (body) {
          if (body.massKg) {
              const m = body.massKg / SOLAR_MASS_KG;
              const currentMassSuns = untrack(() => massSuns);
              if (Math.abs(m - currentMassSuns) > 0.001) {
                  massSuns = m;
                  massSliderPos = (Math.log(Math.max(massMin, Math.min(massMax, m))) - massLogMin) / (massLogMax - massLogMin);
              }
          }
          if (body.radiusKm) {
              const r = body.radiusKm / SOLAR_RADIUS_KM;
              const currentRadiusSuns = untrack(() => radiusSuns);
              if (Math.abs(r - currentRadiusSuns) > 0.001) {
                  radiusSuns = r;
                  radiusSliderPos = (Math.log(Math.max(radiusMin, Math.min(radiusMax, r))) - radiusLogMin) / (radiusLogMax - radiusLogMin);
              }
          }
          if (body.temperatureK !== undefined) {
              const currentTempK = untrack(() => tempK);
              if (Math.abs(body.temperatureK - currentTempK) > 1) {
                  tempK = body.temperatureK;
                  tempSliderPos = (Math.log(Math.max(tempMin, Math.min(tempMax, body.temperatureK))) - tempLogMin) / (tempLogMax - tempLogMin);
              }
          }
          if (body.radiationOutput !== undefined) {
              const currentRadiation = untrack(() => radiation);
              if (Math.abs(body.radiationOutput - currentRadiation) > 0.01) {
                  radiation = body.radiationOutput;
                  radSliderPos = (Math.log(Math.max(radMin, Math.min(radMax, body.radiationOutput))) - radLogMin) / (radLogMax - radLogMin);
              }
          }
          rotationHours = body.rotation_period_hours || 0;
          
          if (body.magneticField?.strengthGauss !== undefined) {
              const currentMag = untrack(() => magGauss);
              if (Math.abs(body.magneticField.strengthGauss - currentMag) > (currentMag * 0.01 + 0.01)) {
                  magGauss = body.magneticField.strengthGauss;
                  magSliderPos = (Math.log(Math.max(magMin, Math.min(magMax, magGauss))) - magLogMin) / (magLogMax - magLogMin);
              }
          }

          const currentClassStr = body.classes?.[0];
          if (currentClassStr) {
              updateImage(currentClassStr);
          }
      }
  });

  // --- Updates ---
  function updateMass() {
      const val = Math.exp(massLogMin + (massLogMax - massLogMin) * massSliderPos);
      massSuns = parseFloat(val.toPrecision(3));
      body.massKg = massSuns * SOLAR_MASS_KG;
      dispatch('update');
  }

  function updateRadius() {
      const val = Math.exp(radiusLogMin + (radiusLogMax - radiusLogMin) * radiusSliderPos);
      radiusSuns = parseFloat(val.toPrecision(3));
      body.radiusKm = radiusSuns * SOLAR_RADIUS_KM;
      dispatch('update');
  }

  function updateTemp() {
      const val = Math.exp(tempLogMin + (tempLogMax - tempLogMin) * tempSliderPos);
      tempK = Math.round(val);
      body.temperatureK = tempK;
      updateClassFromTemp(tempK);
      dispatch('update');
  }

  function handleTempInput() {
      body.temperatureK = tempK;
      tempSliderPos = (Math.log(Math.max(tempMin, Math.min(tempMax, tempK))) - tempLogMin) / (tempLogMax - tempLogMin);
      updateClassFromTemp(tempK);
      dispatch('update');
  }

  function updateClassFromTemp(k: number) {
      const currentClassInBody = body.classes?.[0] || '';
      if (['star/red-giant', 'star/WD', 'star/NS', 'star/magnetar', 'star/BH', 'star/BH_active'].includes(currentClassInBody)) return;

      let newClass = 'star/Y';
      if (k >= 30000) newClass = 'star/O';
      else if (k >= 10000) newClass = 'star/B';
      else if (k >= 7500) newClass = 'star/A';
      else if (k >= 6000) newClass = 'star/F';
      else if (k >= 5200) newClass = 'star/G';
      else if (k >= 3700) newClass = 'star/K';
      else if (k >= 2000) newClass = 'star/M';
      else if (k >= 1300) newClass = 'star/L';
      else if (k >= 700) newClass = 'star/T';
      else newClass = 'star/Y';
      
      if (body.classes[0] !== newClass) {
          const prefixes = Object.keys(SPECTRAL_DATA);
          const others = body.classes.filter((c: string) => !prefixes.includes(c));
          body.classes = [newClass, ...others];
          currentClass = newClass;
          updateImage(newClass);
      }
  }

  function updateRadiation() {
      const val = Math.exp(radLogMin + (radLogMax - radLogMin) * radSliderPos);
      radiation = parseFloat(val.toPrecision(3));
      body.radiationOutput = radiation;
      dispatch('update');
  }

  function handleRadiationInput() {
      body.radiationOutput = radiation;
      radSliderPos = (Math.log(Math.max(radMin, Math.min(radMax, radiation))) - radLogMin) / (radLogMax - radLogMin);
      dispatch('update');
  }

  function updateRotation() {
      body.rotation_period_hours = rotationHours;
      dispatch('update');
  }

  function updateMagSlider() {
      const val = Math.exp(magLogMin + (magLogMax - magLogMin) * magSliderPos);
      magGauss = parseFloat(val.toPrecision(3));
      body.magneticField = { strengthGauss: magGauss };
      dispatch('update');
  }

  function handleMagInput() {
      body.magneticField = { strengthGauss: magGauss };
      magSliderPos = (Math.log(Math.max(magMin, Math.min(magMax, magGauss))) - magLogMin) / (magLogMax - magLogMin);
      dispatch('update');
  }

  function updateImage(starClass: string) {
      let lookupClass = starClass;
      if (starClass === 'star/red-giant') lookupClass = 'star/M';
      const images = rulePack?.classifier?.starImages || rulePack?.starImages;
      if (images?.[lookupClass]) {
          if (!body.image) body.image = { url: '' };
          body.image.url = images[lookupClass];
      }
  }

  function updateSpectralType(e: Event) {
      const val = (e.target as HTMLSelectElement).value;
      currentClass = val;
      if (!body.classes) body.classes = [];
      const prefixes = Object.keys(SPECTRAL_DATA);
      const others = body.classes.filter((c: string) => !prefixes.includes(c));
      body.classes = [val, ...others];
      updateImage(val);

      const data = SPECTRAL_DATA[val];
      if (data) {
          const newMass = (data.ranges.mass[0] + data.ranges.mass[1]) / 2;
          const newRadius = (data.ranges.radius[0] + data.ranges.radius[1]) / 2;
          const newTemp = (data.ranges.temp[0] + data.ranges.temp[1]) / 2;
          
          massSuns = newMass;
          massSliderPos = (Math.log(Math.max(massMin, Math.min(massMax, newMass))) - massLogMin) / (massLogMax - massLogMin);
          body.massKg = massSuns * SOLAR_MASS_KG;

          radiusSuns = newRadius;
          radiusSliderPos = (Math.log(Math.max(radiusMin, Math.min(radiusMax, newRadius))) - radiusLogMin) / (radiusLogMax - radiusLogMin);
          body.radiusKm = radiusSuns * SOLAR_RADIUS_KM;

          tempK = Math.round(newTemp);
          tempSliderPos = (Math.log(Math.max(tempMin, Math.min(tempMax, tempK))) - tempLogMin) / (tempLogMax - tempLogMin);
          body.temperatureK = tempK;
      }
      dispatch('update');
  }

</script>

<div class="tab-panel">
    <!-- CLASSIFICATION -->
    <div class="form-group">
        <label>Spectral Type</label>
        <div style="display: flex; gap: 10px;">
            <select value={body.classes?.[0] || 'star/G'} on:change={updateSpectralType}>
                {#each spectralTypes as type}
                    <option value={type}>{SPECTRAL_DATA[type].label}</option>
                {/each}
            </select>
            <div class="color-preview" style="{starStyle}"></div>
        </div>
    </div>

    <hr/>

    <!-- MASS -->
    <div class="form-group">
        <div class="label-row">
            <label>Mass (Solar Masses)</label>
            <input type="number" step="0.01" bind:value={massSuns} on:change={() => { body.massKg = massSuns * SOLAR_MASS_KG; dispatch('update'); }} />
        </div>
        <div class="slider-container">
            <svg class="slider-svg" width="100%" height="30">
                <rect x="{getRangePct('mass', 'start')}%" y="0" width="{getRangePct('mass', 'width')}%" height="8" fill="#22aa44" />
            </svg>
            <input type="range" min="0" max="1" step="0.001" bind:value={massSliderPos} on:input={updateMass} class="full-width-slider overlay" />
        </div>
    </div>

    <!-- RADIUS -->
    <div class="form-group">
        <div class="label-row">
            <label>Radius (Solar Radii)</label>
            <input type="number" step="0.01" bind:value={radiusSuns} on:change={() => { body.radiusKm = radiusSuns * SOLAR_RADIUS_KM; dispatch('update'); }} />
        </div>
        <div class="slider-container">
            <svg class="slider-svg" width="100%" height="30">
                <rect x="{getRangePct('radius', 'start')}%" y="0" width="{getRangePct('radius', 'width')}%" height="8" fill="#22aa44" />
            </svg>
            <input type="range" min="0" max="1" step="0.001" bind:value={radiusSliderPos} on:input={updateRadius} class="full-width-slider overlay" />
        </div>
        <div class="sub-label">{Math.round(body.radiusKm || 0).toLocaleString()} km</div>
    </div>

    <hr/>

    <!-- TEMPERATURE -->
    <div class="form-group">
        <div class="label-row">
            <label for="temp">Effective Temperature ({tempK} K)</label>
            <input type="number" step="100" bind:value={tempK} on:change={handleTempInput} />
        </div>
        <div class="slider-container">
            <svg class="slider-svg" width="100%" height="30">
                {#each tempZones as zone}
                    {@const x = getTempLogPos(zone.start)}
                    <line x1="{x}%" y1="5" x2="{x}%" y2="18" stroke="#666" stroke-width="1" />
                    <text x="{x + 1}%" y="28" class="rad-label">{zone.name}</text>
                {/each}
                <rect x="{getRangePct('temp', 'start')}%" y="0" width="{getRangePct('temp', 'width')}%" height="8" fill="#22aa44" />
            </svg>
            <input type="range" min="0" max="1" step="0.001" bind:value={tempSliderPos} on:input={updateTemp} class="full-width-slider overlay" />
        </div>
    </div>

    <!-- RADIATION -->
    <div class="form-group">
        <div class="label-row">
            <label>Ionising Radiation Level ({radiation.toFixed(2)})</label>
            <input type="number" step="0.1" bind:value={radiation} on:change={handleRadiationInput} />
        </div>
        <div class="slider-container">
            <svg class="slider-svg" width="100%" height="30">
                {#each radZones as zone}
                    {@const x = getLogPos(zone.start)}
                    <line x1="{x}%" y1="5" x2="{x}%" y2="18" stroke="#666" stroke-width="1" />
                    <text x="{x + 1}%" y="28" class="rad-label">{zone.name}</text>
                {/each}
                <rect x="{getRangePct('rad', 'start')}%" y="0" width="{getRangePct('rad', 'width')}%" height="8" fill="#22aa44" />
            </svg>
            <input type="range" min="0" max="1" step="0.001" bind:value={radSliderPos} on:input={updateRadiation} class="full-width-slider overlay" />
        </div>
        <div class="sub-label">Est. Luminosity: {luminosity.toExponential(2)} L☉</div>
    </div>

    <hr/>

    <!-- ROTATION -->
    <div class="form-group">
        <div class="label-row">
            <label>Rotation Period (Hours)</label>
            <input type="number" step="0.1" bind:value={rotationHours} on:input={updateRotation} />
        </div>
        <div class="slider-container">
            <svg class="slider-svg" width="100%" height="30">
                <rect x="{getRangePct('rot', 'start')}%" y="0" width="{getRangePct('rot', 'width')}%" height="8" fill="#22aa44" />
            </svg>
            <input type="range" min="0.1" max="10000" step="0.1" bind:value={rotationHours} on:input={updateRotation} class="full-width-slider overlay" />
        </div>
    </div>

    <!-- MAGNETIC FIELD -->
    <div class="form-group">
        <div class="label-row">
            <label>Magnetic Field (Gauss)</label>
            <input type="number" step="0.1" bind:value={magGauss} on:input={handleMagInput} />
        </div>
        <div class="slider-container">
            <svg class="slider-svg" width="100%" height="30">
                <rect x="{getRangePct('mag', 'start')}%" y="0" width="{getRangePct('mag', 'width')}%" height="8" fill="#22aa44" />
            </svg>
            <input type="range" min="0" max="1" step="0.001" bind:value={magSliderPos} on:input={updateMagSlider} class="full-width-slider overlay" />
        </div>
        <div class="sub-label">
            {#if magGauss > 10000}
                {magGauss.toExponential(2)} G
            {:else}
                {Math.round(magGauss).toLocaleString()} G
            {/if}
        </div>
    </div>

</div>

<style>
  .tab-panel { padding: 10px; display: flex; flex-direction: column; gap: 15px; }
  .form-group { display: flex; flex-direction: column; gap: 5px; }
  .label-row { display: flex; justify-content: space-between; align-items: center; }
  label { color: #ccc; font-size: 0.9em; margin: 0; }
  input[type="number"], select { 
      padding: 4px; background: #444; border: 1px solid #555; 
      color: #eee; border-radius: 3px; width: 100px; text-align: right; 
  }
  select { width: 100%; text-align: left; }
  .full-width-slider { width: 100%; margin: 0; cursor: pointer; }
  hr { border: 0; border-top: 1px solid #444; margin: 5px 0; width: 100%; }
  .sub-label { font-size: 0.75em; color: #888; text-align: right; }
  
  .color-preview {
      width: 30px; height: 30px;
      border-radius: 50%;
      border: 1px solid #fff;
      flex-shrink: 0;
  }

  .slider-container {
      position: relative;
      height: 45px;
      margin-top: 5px;
  }
  .slider-svg {
      position: absolute;
      top: 0;
      left: 0;
      pointer-events: none;
  }
  .rad-label {
      font-size: 8px;
      fill: #aaa;
      text-transform: uppercase;
  }
  .rad-label.ref {
      fill: #fff;
      font-weight: bold;
  }
  input[type="range"].overlay {
      position: absolute;
      top: 0;
      left: 0;
      background: transparent;
      height: 20px;
      z-index: 2;
  }
</style>