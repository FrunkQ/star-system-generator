<script lang="ts">
  import { createEventDispatcher } from 'svelte';
  import type { CelestialBody } from '$lib/types';
  import { fmt } from '$lib/stores';
  import { SOLAR_MASS_KG, SOLAR_RADIUS_KM, EARTH_MASS_KG, G, C_MS } from '$lib/constants';
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
  // Which body the editable fields below were last synced from. The sync effect re-runs on every render
  // (the body proxy re-resolves as the clock ticks), so we only pull values FROM the body when a different
  // body is selected — otherwise it clobbers a half-typed value (the "can't type a precise mass" bug).
  let lastSyncedBodyId: string | null = null;

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
      // BH radius band = Schwarzschild radii for the 3–300 M☉ mass band (8.9 km → 886 km). Mass cap
      // 300 M☉ comfortably covers reality: heaviest known stellar-merger remnant ≈ 142 M☉ (GW190521);
      // beyond that you're into galactic-core intermediate/supermassive territory, not a system anchor.
      'star/BH': { label: 'Black Hole (BH)', ranges: { mass: [3, 300], radius: [1.27e-5, 1.27e-3], temp: [0, 100], rad: [0, 0.001], mag: [0, 0], rot: [0.001, 1] } },
      'star/BH_active': { label: 'Active Black Hole (Accretion)', ranges: { mass: [3, 300], radius: [1.27e-5, 1.27e-3], temp: [10000, 1000000], rad: [1000, 1000000], mag: [1e3, 1e9], rot: [0.001, 1] } }
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
      // A red giant is a thermal star — keep the temperature colour (from getStarColorFromTemp above),
      // no special-case override. Only accretion/non-thermal remnants get a fixed swatch.

      return `background-color: ${bg}; border: 2px solid ${border}; box-shadow: 0 0 10px ${shadow};`;
  });

  // Bolometric luminosity from Stefan-Boltzmann: L/L☉ = (R/R☉)²·(T/T☉)⁴.
  let luminosity = $derived((radiusSuns ** 2) * ((tempK / 5778) ** 4));

  // For a THERMAL emitter (any real star — incl. white dwarfs / red giants, but NOT accretion- or
  // non-thermal remnants), the radiated output IS that bolometric luminosity. So when the user edits
  // temperature or radius we recompute radiationOutput from Stefan-Boltzmann instead of leaving it
  // locked — fixing the old "change T, luminosity barely moves" behaviour. BH/NS/magnetar keep their
  // independent (accretion/magnetospheric) radiation slider.
  function syncRadiationFromSB() {
      if (['star/BH', 'star/BH_active', 'star/NS', 'star/magnetar'].includes(currentClass)) return;
      const L = (radiusSuns ** 2) * ((tempK / 5778) ** 4);
      radiation = parseFloat(L.toPrecision(3));
      body.radiationOutput = radiation;
      radSliderPos = (Math.log(Math.max(radMin, Math.min(radMax, L))) - radLogMin) / (radLogMax - radLogMin);
  }

  // --- Initialization & Sync ---
  $effect(() => {
      if (!body) return;

      // Keep the preview image in step with the spectral class on every pass (idempotent + cheap).
      const currentClassStr = body.classes?.[0];
      if (currentClassStr) updateImage(currentClassStr);

      // Pull the editable numeric fields FROM the body only when a DIFFERENT body is selected. This effect
      // re-runs on every render (the body proxy re-resolves as the clock ticks / store updates); doing the
      // sync each time would overwrite a value you're mid-way through typing — type or paste a precise mass
      // and it snaps back to the stored one. Same-body edits (sliders, number inputs, spectral type) set
      // these locals in their own handlers, so this is purely the on-load seed.
      if (body.id === lastSyncedBodyId) return;
      lastSyncedBodyId = body.id;

      if (body.massKg) {
          const m = body.massKg / SOLAR_MASS_KG;
          massSuns = m;
          massSliderPos = (Math.log(Math.max(massMin, Math.min(massMax, m))) - massLogMin) / (massLogMax - massLogMin);
      }
      if (body.radiusKm) {
          const r = body.radiusKm / SOLAR_RADIUS_KM;
          radiusSuns = r;
          radiusSliderPos = (Math.log(Math.max(radiusMin, Math.min(radiusMax, r))) - radiusLogMin) / (radiusLogMax - radiusLogMin);
      }
      if (body.temperatureK !== undefined) {
          tempK = body.temperatureK;
          tempSliderPos = (Math.log(Math.max(tempMin, Math.min(tempMax, body.temperatureK))) - tempLogMin) / (tempLogMax - tempLogMin);
      }
      if (body.radiationOutput !== undefined) {
          radiation = body.radiationOutput;
          radSliderPos = (Math.log(Math.max(radMin, Math.min(radMax, body.radiationOutput))) - radLogMin) / (radLogMax - radLogMin);
      }
      rotationHours = body.rotation_period_hours || 0;
      if (body.magneticField?.strengthGauss !== undefined) {
          magGauss = body.magneticField.strengthGauss;
          magSliderPos = (Math.log(Math.max(magMin, Math.min(magMax, magGauss))) - magLogMin) / (magLogMax - magLogMin);
      }
      // Black-hole accretion slider — seed from the stored Eddington fraction (active class ⇒ a default).
      accF = (body as any).accretionEddington ?? ((body.classes?.[0] === 'star/BH_active') ? 0.5 : 0);
      accSliderPos = posFromF(accF);
  });

  // --- Updates ---
  function updateMass() {
      const val = Math.exp(massLogMin + (massLogMax - massLogMin) * massSliderPos);
      massSuns = parseFloat(val.toPrecision(3));
      body.massKg = massSuns * SOLAR_MASS_KG;
      if (isBH) applySchwarzschild(); // event horizon is mass-driven
      dispatch('update');
  }

  function handleMassNumberInput() {
      body.massKg = massSuns * SOLAR_MASS_KG;
      massSliderPos = (Math.log(Math.max(massMin, Math.min(massMax, massSuns))) - massLogMin) / (massLogMax - massLogMin);
      if (isBH) applySchwarzschild();
      dispatch('update');
  }

  function updateRadius() {
      const val = Math.exp(radiusLogMin + (radiusLogMax - radiusLogMin) * radiusSliderPos);
      radiusSuns = parseFloat(val.toPrecision(3));
      body.radiusKm = radiusSuns * SOLAR_RADIUS_KM;
      syncRadiationFromSB();
      dispatch('update');
  }

  function handleRadiusInput() {
      body.radiusKm = radiusSuns * SOLAR_RADIUS_KM;
      radiusSliderPos = (Math.log(Math.max(radiusMin, Math.min(radiusMax, radiusSuns))) - radiusLogMin) / (radiusLogMax - radiusLogMin);
      syncRadiationFromSB();
      dispatch('update');
  }

  function updateTemp() {
      const val = Math.exp(tempLogMin + (tempLogMax - tempLogMin) * tempSliderPos);
      tempK = Math.round(val);
      body.temperatureK = tempK;
      updateClassFromTemp(tempK);
      syncRadiationFromSB();
      dispatch('update');
  }

  function douseStar() {
      body.roleHint = 'planet';
      if (!body.classes) body.classes = [];
      body.classes[0] = 'planet/brown-dwarf';
      body.massKg = Math.min(body.massKg || 0, 26000 * EARTH_MASS_KG);
      body.temperatureK = 1000;
      dispatch('update');
  }

  function handleTempInput() {
      body.temperatureK = tempK;
      tempSliderPos = (Math.log(Math.max(tempMin, Math.min(tempMax, tempK))) - tempLogMin) / (tempLogMax - tempLogMin);
      updateClassFromTemp(tempK);
      syncRadiationFromSB();
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

  // A neutron star tips into a (purple) magnetar once its field crosses ~1e13 G.
  const MAGNETAR_MIN_GAUSS = 1e13;
  function reclassifyForMagnetism() {
      if (currentClass !== 'star/NS' && currentClass !== 'star/magnetar') return;
      const target = magGauss >= MAGNETAR_MIN_GAUSS ? 'star/magnetar' : 'star/NS';
      if (target === currentClass) return;
      currentClass = target;
      const prefixes = Object.keys(SPECTRAL_DATA);
      const others = (body.classes || []).filter((c: string) => !prefixes.includes(c));
      body.classes = [target, ...others];
      updateImage(target);
  }

  function updateMagSlider() {
      const val = Math.exp(magLogMin + (magLogMax - magLogMin) * magSliderPos);
      magGauss = parseFloat(val.toPrecision(3));
      body.magneticField = { strengthGauss: magGauss };
      reclassifyForMagnetism();
      dispatch('update');
  }

  function handleMagInput() {
      body.magneticField = { strengthGauss: magGauss };
      magSliderPos = (Math.log(Math.max(magMin, Math.min(magMax, magGauss))) - magLogMin) / (magLogMax - magLogMin);
      reclassifyForMagnetism();
      dispatch('update');
  }

  // --- Black holes ---
  const isBH = $derived(currentClass === 'star/BH' || currentClass === 'star/BH_active');

  // Event-horizon (Schwarzschild) radius in solar radii: r_s = 2GM/c² (1 M☉ → 2.95 km).
  function schwarzschildRadiusSuns(mSuns: number): number {
      return (2 * G * mSuns * SOLAR_MASS_KG) / (C_MS * C_MS) / 1000 / SOLAR_RADIUS_KM;
  }
  // BH radius is not a free property — it IS the mass. Lock it whenever mass changes.
  function applySchwarzschild() {
      radiusSuns = parseFloat(schwarzschildRadiusSuns(massSuns).toPrecision(3));
      body.radiusKm = radiusSuns * SOLAR_RADIUS_KM;
      radiusSliderPos = (Math.log(Math.max(radiusMin, Math.min(radiusMax, radiusSuns))) - radiusLogMin) / (radiusLogMax - radiusLogMin);
  }

  // Sensible "middle ground" presets per BH state, validated against real objects:
  //   Quiescent — a bare horizon: ~0 K (Hawking T is nano-Kelvin), no luminosity, and NO magnetic
  //     field (the no-hair theorem: an isolated BH keeps only mass/spin/charge).
  //   Feeding — an X-ray-binary-like accretor: hot blue disc (10⁴–10⁵ K effective), near-Eddington
  //     output (XRBs run 10⁴–10⁶ L☉ for 3–30 M☉), and a disc-anchored field of ~10⁶ G (stellar-mass
  //     MAD-model estimates span 10⁴–10⁸ G at the horizon).
  // --- Black-hole accretion: a single "material infall" slider (Eddington fraction) drives EVERYTHING
  //     from physics. Below a threshold it's a bare quiescent horizon (dark, ~0 K, no field); above it,
  //     a feeding accretion disc whose luminosity, inner-disc temperature and field are all derived.
  //     Hard limit: the radiative output is capped at the Eddington luminosity. ---
  const SOLAR_LUM_W = 3.828e26;
  const SB_SIGMA = 5.670374e-8;     // Stefan–Boltzmann
  const QUIESCENT_F = 1e-4;         // below this Eddington fraction → no meaningful disc (quiescent)
  let accF = $state(0);             // current accretion rate as a fraction of Eddington (0..1)
  let accSliderPos = $state(0);     // 0..1 log-mapped slider position
  // log map: pos 0 → off; pos→1 → f = 1 (Eddington). f = 10^(6·pos − 6).
  const fFromPos = (pos: number) => (pos <= 0.001 ? 0 : Math.pow(10, 6 * pos - 6));
  const posFromF = (f: number) => (f <= 0 ? 0 : Math.max(0, Math.min(1, (Math.log10(f) + 6) / 6)));
  const eddLsun = $derived(32000 * ((body.massKg || 0) / SOLAR_MASS_KG)); // Eddington luminosity (L☉)

  function applyAccretion(f: number) {
      f = Math.max(0, Math.min(1, f)); // Eddington-limited (hard cap)
      accF = f;
      (body as any).accretionEddington = f;
      applySchwarzschild(); // event horizon is mass-driven, both states

      let cls: string, T: number, L: number, B: number, R: number;
      if (f < QUIESCENT_F) {
          // Bare horizon: Hawking T is nano-kelvin → effectively 0; no luminosity; no-hair → no field.
          cls = 'star/BH'; T = 0; L = 1e-9; B = 0; R = 0;
      } else {
          cls = 'star/BH_active';
          L = f * eddLsun;                                   // L = f · L_Edd (≤ Eddington)
          const Rs_m = 2 * G * (body.massKg || 0) / (C_MS * C_MS);
          const Rin_m = 3 * Rs_m;                             // ~ISCO; disc inner edge
          const Lw = L * SOLAR_LUM_W;
          T = Math.round(Math.pow(Lw / (4 * Math.PI * Rin_m * Rin_m * SB_SIGMA), 0.25)); // inner-disc T (K)
          B = Math.round(1e6 * Math.sqrt(f));                 // disc-anchored field, scales with infall
          R = L;                                              // radiation output tracks luminosity
      }
      tempK = T; magGauss = B; radiation = R;
      body.temperatureK = T;
      body.luminositySolar = L;
      body.magneticField = { strengthGauss: B };
      body.radiationOutput = R;
      currentClass = cls;
      if (!body.classes) body.classes = [];
      const others = body.classes.filter((c: string) => !Object.keys(SPECTRAL_DATA).includes(c));
      body.classes = [cls, ...others];
      updateImage(cls);
      accSliderPos = posFromF(f);
      tempSliderPos = (Math.log(Math.max(tempMin, Math.min(tempMax, Math.max(tempMin, tempK)))) - tempLogMin) / (tempLogMax - tempLogMin);
      magSliderPos = (Math.log(Math.max(magMin, Math.min(magMax, Math.max(magMin, magGauss)))) - magLogMin) / (magLogMax - magLogMin);
      radSliderPos = (Math.log(Math.max(radMin, Math.min(radMax, Math.max(radMin, radiation)))) - radLogMin) / (radLogMax - radLogMin);
      dispatch('update');
  }
  // Picking a BH from the dropdown seeds a state: keep its current infall, else default quiescent.
  function applyBHPresets(target: string) {
      const seed = target === 'star/BH_active' ? Math.max((body as any).accretionEddington ?? 0.5, QUIESCENT_F) : ((body as any).accretionEddington ?? 0);
      applyAccretion(seed);
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
      // Picking a black hole from the dropdown applies the per-state presets too (event horizon
      // from mass, no-hair zero field for quiescent / disc values for feeding).
      if (val === 'star/BH' || val === 'star/BH_active') applyBHPresets(val);
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
        {#if currentClass === 'star/BH' || currentClass === 'star/BH_active'}
            <div class="bh-accretion" style="margin-top:10px;">
                <label style="font-size:0.85em; display:flex; justify-content:space-between;">
                    <span>Material infall (accretion)</span>
                    <span style="opacity:0.8;">{accF < QUIESCENT_F ? 'quiescent' : `${(accF * 100).toPrecision(2)}% Eddington`}</span>
                </label>
                <input type="range" min="0" max="1" step="0.005" bind:value={accSliderPos} on:input={() => applyAccretion(fFromPos(accSliderPos))} style="width:100%;" />
                <div style="display:flex; justify-content:space-between; font-size:0.72em; opacity:0.7;"><span>bare horizon</span><span>Eddington limit</span></div>
                <p style="font-size:0.76em; opacity:0.8; margin:5px 0 0;">
                    {#if accF < QUIESCENT_F}
                        Dark, ~0 K, no field — an isolated horizon (Hawking radiation is negligible).
                    {:else}
                        Feeding disc: <strong>{tempK.toLocaleString()} K</strong> inner edge · <strong>{body.luminositySolar < 0.01 ? body.luminositySolar.toExponential(1) : Math.round(body.luminositySolar).toLocaleString()} L☉</strong> · <strong>{magGauss.toExponential(0)} G</strong>{#if accF >= 0.999} · at the Eddington limit{/if}
                    {/if}
                </p>
            </div>
        {/if}
        {#if currentClass === 'star/NS' || currentClass === 'star/magnetar'}
            <p class="ns-hint" style="margin:6px 0 0; font-size:0.78em; opacity:0.7;">
                Push the magnetic field past 10¹³ G to turn this neutron star into a {currentClass === 'star/magnetar' ? '(purple) magnetar — drop it below to revert' : 'purple magnetar'}.
            </p>
        {/if}
    </div>

    <hr/>

    <!-- MASS -->
    <div class="form-group">
        <div class="label-row">
            <label>Mass (Solar Masses)</label>
            <input type="number" step="any" bind:value={massSuns} on:change={handleMassNumberInput} />
        </div>
        <div class="slider-container">
            <svg class="slider-svg" width="100%" height="30">
                <rect x="{getRangePct('mass', 'start')}%" y="0" width="{getRangePct('mass', 'width')}%" height="8" fill="#22aa44" />
            </svg>
            <input type="range" min="0" max="1" step="0.001" bind:value={massSliderPos} on:input={updateMass} class="full-width-slider overlay" />
        </div>
        {#if massSuns <= 0.015}
            <button class="action-btn douse-btn" on:click={douseStar}>❄️ Douse into Planet</button>
        {/if}
    </div>

    <!-- RADIUS (for black holes: the event horizon, locked to mass) -->
    <div class="form-group">
        <div class="label-row">
            <label>{isBH ? 'Event Horizon Radius (Solar Radii)' : 'Radius (Solar Radii)'}</label>
            <input type="number" step="any" bind:value={radiusSuns} disabled={isBH} on:change={handleRadiusInput} />
        </div>
        <div class="slider-container">
            <svg class="slider-svg" width="100%" height="30">
                <rect x="{getRangePct('radius', 'start')}%" y="0" width="{getRangePct('radius', 'width')}%" height="8" fill="#22aa44" />
            </svg>
            <input type="range" min="0" max="1" step="0.001" bind:value={radiusSliderPos} disabled={isBH} on:input={updateRadius} class="full-width-slider overlay" />
        </div>
        <div class="sub-label">
            {Math.round((body.radiusKm || 0) * 100) / 100 > 1000 ? $fmt.km(body.radiusKm || 0) : $fmt.km(body.radiusKm || 0, 1)}
            {#if isBH}— Schwarzschild radius, driven by mass (r = 2GM/c²){/if}
        </div>
    </div>

    <hr/>

    <!-- TEMPERATURE -->
    <div class="form-group">
        <div class="label-row">
            <label for="temp">Effective Temperature ({tempK} K)</label>
            <input type="number" step="any" bind:value={tempK} on:change={handleTempInput} />
        </div>
        <div class="slider-container">
            <svg class="slider-svg" width="100%" height="30">
                {#each tempZones as zone}
                    {@const x = getTempLogPos(zone.start)}
                    <line x1="{x}%" y1="5" x2="{x}%" y2="18" stroke="var(--text-faint)" stroke-width="1" />
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
            <input type="number" step="any" bind:value={radiation} on:change={handleRadiationInput} />
        </div>
        <div class="slider-container">
            <svg class="slider-svg" width="100%" height="30">
                {#each radZones as zone}
                    {@const x = getLogPos(zone.start)}
                    <line x1="{x}%" y1="5" x2="{x}%" y2="18" stroke="var(--text-faint)" stroke-width="1" />
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
            <input type="number" step="any" bind:value={rotationHours} on:input={updateRotation} />
        </div>
        <div class="slider-container">
            <svg class="slider-svg" width="100%" height="30">
                <rect x="{getRangePct('rot', 'start')}%" y="0" width="{getRangePct('rot', 'width')}%" height="8" fill="#22aa44" />
            </svg>
            <input type="range" min="0.1" max="10000" step="0.1" bind:value={rotationHours} on:input={updateRotation} class="full-width-slider overlay" />
        </div>
    </div>

    <!-- MAGNETIC FIELD (quiescent BHs have none — no-hair theorem; feeding BHs carry a disc field) -->
    <div class="form-group">
        <div class="label-row">
            <label>Magnetic Field (Gauss)</label>
            <input type="number" step="any" bind:value={magGauss} disabled={currentClass === 'star/BH'} on:input={handleMagInput} />
        </div>
        <div class="slider-container">
            <svg class="slider-svg" width="100%" height="30">
                <rect x="{getRangePct('mag', 'start')}%" y="0" width="{getRangePct('mag', 'width')}%" height="8" fill="#22aa44" />
            </svg>
            <input type="range" min="0" max="1" step="0.001" bind:value={magSliderPos} disabled={currentClass === 'star/BH'} on:input={updateMagSlider} class="full-width-slider overlay" />
        </div>
        <div class="sub-label">
            {#if currentClass === 'star/BH'}
                0 G — an isolated black hole keeps no magnetic field (no-hair theorem); feed it to anchor a disc field
            {:else if magGauss > 10000}
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
  label { color: var(--text-muted); font-size: 0.9em; margin: 0; }
  input[type="number"], select {
      padding: 4px; background: var(--bg-control); border: 1px solid var(--border);
      color: var(--text); border-radius: 3px; width: 100px; text-align: right;
  }
  select { width: 100%; text-align: left; }
  .full-width-slider { width: 100%; margin: 0; cursor: pointer; }
  hr { border: 0; border-top: 1px solid var(--border); margin: 5px 0; width: 100%; }
  .sub-label { font-size: 0.75em; color: var(--text-faint); text-align: right; }
  
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
      fill: var(--text-muted);
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

  .action-btn {
      width: 100%;
      padding: 8px;
      margin-top: 10px;
      border: none;
      border-radius: 4px;
      font-weight: bold;
      cursor: pointer;
  }
  .douse-btn {
      background-color: #2980b9;
      color: white;
  }
  .douse-btn:hover { background-color: #3498db; }
</style>