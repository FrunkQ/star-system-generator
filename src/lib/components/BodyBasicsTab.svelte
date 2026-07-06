<script lang="ts">
  import { createEventDispatcher } from 'svelte';
  import type { CelestialBody, RulePack, Makeup } from '$lib/types';
  import { fmt } from '$lib/stores';
  import { EARTH_MASS_KG, EARTH_RADIUS_KM, SOLAR_MASS_KG, SOLAR_RADIUS_KM } from '$lib/constants';
  import { makeupFractions, normalizeMakeup, gasThermalInflationFactor } from '$lib/physics/makeup';
  import { breakupPeriodHours, rotationalDeform, type RotationalShape } from '$lib/physics/rotation';
  import { fileToDownscaledDataUrl } from '$lib/util/imageUpload';
  import {
    densityGcc, editMass, editRadius, editDensity, editMakeup, setMakeupComponent,
    COMPOSITION_PRESETS, presetValidAt, presetActive,
    type EditLock, type BodyEditState
  } from '$lib/physics/bodyEdit';

  export let body: CelestialBody;
  export let rulePack: RulePack | null = null;

  const dispatch = createEventDispatcher();

  $: useSolarUnits = body.roleHint === 'star';
  $: isPlanetMoon = body.roleHint === 'planet' || body.roleHint === 'moon';

  const clamp = (x: number, a: number, b: number) => Math.max(a, Math.min(b, x));
  const r4 = (x: number) => (Number.isFinite(x) ? Number(x.toPrecision(4)) : 0);

  // ============================================================================
  //  STAR / BELT / RING size editor (unchanged) — mass + radius sliders, density
  //  read-out. Planets/moons use the Size & Composition editor further down.
  // ============================================================================
  let massValueInternal = 0;   // In Earths (planets/moons) or Suns (stars)
  let radiusValueInternal = 0; // In KM (planets/moons) or Solar radii (stars)
  let densityValue = 0;        // g/cm^3

  const massMinEarths = 0.000000001, massMaxEarths = 26000;
  const massMinSuns = 0.01, massMaxSuns = 100;
  $: currentMassMin = useSolarUnits ? massMinSuns : massMinEarths;
  $: currentMassMax = useSolarUnits ? massMaxSuns : massMaxEarths;
  $: massLogMin = Math.log(currentMassMin);
  $: massLogMax = Math.log(currentMassMax);
  let massSliderPos = 0.5;

  const radiusMinKm = 100;
  const radiusMaxEarths = 22 * EARTH_RADIUS_KM;
  const radiusMinSuns = 0.1 * SOLAR_RADIUS_KM;
  const radiusMaxSuns = 50 * SOLAR_RADIUS_KM;
  $: currentRadiusMin = useSolarUnits ? radiusMinSuns : radiusMinKm;
  $: currentRadiusMax = useSolarUnits ? radiusMaxSuns : radiusMaxEarths;
  $: radiusLogMin = Math.log(currentRadiusMin);
  $: radiusLogMax = Math.log(currentRadiusMax);
  let radiusSliderPos = 0.5;

  $: visualTypes = rulePack?.classifier?.planetImages ? Object.keys(rulePack.classifier.planetImages) : [];

  $: if (body.massKg !== undefined) {
      massValueInternal = useSolarUnits ? body.massKg / SOLAR_MASS_KG : body.massKg / EARTH_MASS_KG;
      const safeVal = Math.max(currentMassMin, Math.min(currentMassMax, massValueInternal));
      massSliderPos = (Math.log(safeVal) - massLogMin) / (massLogMax - massLogMin);
  }
  $: if (body.radiusKm !== undefined) {
      radiusValueInternal = useSolarUnits ? body.radiusKm / SOLAR_RADIUS_KM : body.radiusKm;
      const safeVal = Math.max(currentRadiusMin, Math.min(currentRadiusMax, radiusValueInternal));
      radiusSliderPos = (Math.log(safeVal) - radiusLogMin) / (radiusLogMax - radiusLogMin);
  }

  const massThresholdEarths = 0.001;
  $: displayMassUnit = useSolarUnits ? 'Suns' : ((massValueInternal < massThresholdEarths) ? 'Tonnes' : 'Earths');
  $: displayMassValue = (displayMassUnit === 'Tonnes') ? (body.massKg || 0) / 1000 : massValueInternal;
  $: displayRadiusUnit = useSolarUnits ? 'Suns' : 'km';
  $: displayRadiusValue = radiusValueInternal;

  $: if (body.massKg && body.radiusKm) {
      const massG = body.massKg * 1000;
      const radiusCm = body.radiusKm * 100000;
      const volCm3 = (4/3) * Math.PI * Math.pow(radiusCm, 3);
      densityValue = massG / volCm3;
  }

  function getSizeCategory(rKm: number, mKg: number): string {
      const mEarths = mKg / EARTH_MASS_KG;
      if (mEarths > 4000) return "Brown Dwarf";
      if (mEarths > 1000) return "Super Jupiter / Sub-Brown Dwarf";
      if (rKm < 200) return "Moonlet / Asteroid";
      if (rKm < 800) return "Dwarf Planet";
      if (rKm < 2 * EARTH_RADIUS_KM) return "Terrestrial Planet";
      if (rKm < 6 * EARTH_RADIUS_KM) return "Ice Giant / Sub-Neptune";
      return "Gas Giant";
  }
  $: sizeCategory = getSizeCategory(body.radiusKm || 0, body.massKg || 0);

  function updateClassFromSize() {
      const rKm = body.radiusKm || 0;
      const mKg = body.massKg || 0;
      const mEarths = mKg / EARTH_MASS_KG;
      let newClass = "", newColor = "";
      if (mEarths > 4000) { newClass = "planet/brown-dwarf"; newColor = "#5d4037"; }
      else if (rKm < 200) { /* moonlet */ }
      else if (rKm < 800) { newClass = "planet/dwarf-planet"; newColor = "#bdc3c7"; }
      else if (rKm < 2 * EARTH_RADIUS_KM) { newClass = "planet/terrestrial"; newColor = "#e67e22"; }
      else if (rKm < 6 * EARTH_RADIUS_KM) { newClass = "planet/ice-giant"; newColor = "#81ecec"; }
      else { newClass = "planet/gas-giant"; newColor = "#e74c3c"; }
      if (newClass) {
          if (!body.classes) body.classes = [];
          body.classes[0] = newClass;
          if (!body.tags) body.tags = [];
          const sizeTags = ["planet/dwarf-planet", "planet/terrestrial", "planet/ice-giant", "planet/gas-giant", "planet/brown-dwarf"];
          body.tags = body.tags.filter(t => !sizeTags.includes(t.key));
          body.tags.push({ key: newClass });
          body.color = newColor;
          if (rulePack?.classifier?.planetImages && rulePack.classifier.planetImages[newClass]) {
              if (!body.image) body.image = { url: '' };
              body.image.url = rulePack.classifier.planetImages[newClass];
          }
      }
  }

  function updateMassFromInput(event: Event) {
      const val = parseFloat((event.target as HTMLInputElement).value);
      if (isNaN(val)) return;
      if (displayMassUnit === 'Tonnes') body.massKg = val * 1000;
      else if (displayMassUnit === 'Suns') body.massKg = val * SOLAR_MASS_KG;
      else body.massKg = val * EARTH_MASS_KG;
      massValueInternal = useSolarUnits ? body.massKg / SOLAR_MASS_KG : body.massKg / EARTH_MASS_KG;
      updateClassFromSize();
      dispatch('update');
  }
  function updateMassFromSlider() {
      const val = Math.exp(massLogMin + (massLogMax - massLogMin) * massSliderPos);
      massValueInternal = parseFloat(val.toPrecision(4));
      body.massKg = massValueInternal * (useSolarUnits ? SOLAR_MASS_KG : EARTH_MASS_KG);
      updateClassFromSize();
      dispatch('update');
  }
  function updateRadiusFromInput(event: Event) {
      const val = parseFloat((event.target as HTMLInputElement).value);
      if (isNaN(val)) return;
      if (useSolarUnits) { body.radiusKm = val * SOLAR_RADIUS_KM; radiusValueInternal = val; }
      else { body.radiusKm = val; radiusValueInternal = val; }
      updateClassFromSize();
      dispatch('update');
  }
  function updateRadiusFromSlider() {
      const val = Math.exp(radiusLogMin + (radiusLogMax - radiusLogMin) * radiusSliderPos);
      if (useSolarUnits) { radiusValueInternal = parseFloat(val.toPrecision(4)); body.radiusKm = radiusValueInternal * SOLAR_RADIUS_KM; }
      else { radiusValueInternal = parseFloat(val.toFixed(0)); body.radiusKm = radiusValueInternal; }
      updateClassFromSize();
      dispatch('update');
  }

  // ============================================================================
  //  SIZE & COMPOSITION editor (planets / moons) — the mass/radius/density chain.
  //  Mass, radius and density are bound by rho = M/(4/3*pi*R^3): each edit HOLDS one
  //  quantity and DERIVES another (bodyEdit.ts), with an optional per-field lock.
  //  Interior makeup is slaved to the density unless the GM edits it directly.
  // ============================================================================
  const MK_KEYS: Array<keyof Makeup> = ['metal', 'rock', 'carbon', 'ice', 'gas'];
  const MK_LABEL: Record<string, string> = { metal: 'Metal', rock: 'Rock', carbon: 'Carbon', ice: 'Ice', gas: 'Gas' };
  const MK_SWATCH: Record<string, string> = { metal: '#9c8d7a', rock: '#a9805a', carbon: '#3a3a40', ice: '#cfe6ff', gas: '#d8c79a' };

  let lock: EditLock = null;
  function toggleLock(which: Exclude<EditLock, null>) { lock = lock === which ? null : which; }

  // Slider ranges (log scale). Bounds mirror bodyEdit.ts clamps.
  const pMassMin = 1e-4, pMassMax = 1e5;   // Earth masses (moonlet -> past brown dwarf)
  const pRadMin = 0.02,  pRadMax = 40;      // Earth radii
  const pDenMin = 0.1,   pDenMax = 30;      // g/cc
  const logPos = (v: number, lo: number, hi: number) =>
      clamp((Math.log(clamp(v, lo, hi)) - Math.log(lo)) / (Math.log(hi) - Math.log(lo)), 0, 1);
  const logVal = (pos: number, lo: number, hi: number) =>
      Math.exp(Math.log(lo) + (Math.log(hi) - Math.log(lo)) * pos);

  // Live state read straight from the body (Earth-relative units).
  $: pMassMe = (body.massKg ?? 0) / EARTH_MASS_KG;
  $: pRadiusRe = (body.radiusKm ?? 0) / EARTH_RADIUS_KM;
  $: pMakeup = normalizeMakeup(makeupFractions(body));
  $: pDensity = densityGcc(pMassMe, pRadiusRe);
  $: pMassPos = logPos(pMassMe, pMassMin, pMassMax);
  $: pRadPos = logPos(pRadiusRe, pRadMin, pRadMax);
  $: pDenPos = logPos(pDensity, pDenMin, pDenMax);

  // Unit selectors for the Mass & Radius number fields — a 3-way click cycler shown in the label gap, so
  // a tiny moon (awkward as 1e-8 M⊕) can be edited in tonnes or km instead. The SLIDER stays in canonical
  // Earth units; only the number field's display unit changes. Radius' third option follows the starmap's
  // km/mi choice.
  const M_JUP_ME = 317.8;    // Jupiter mass in Earth masses
  const R_JUP_RE = 11.209;   // Jupiter radius in Earth radii
  let massUnit: 'earth' | 'jupiter' | 'tonnes' = 'earth';
  let radUnit: 'earth' | 'jupiter' | 'dist' = 'earth';
  const cycleMassUnit = () => { massUnit = massUnit === 'earth' ? 'jupiter' : massUnit === 'jupiter' ? 'tonnes' : 'earth'; };
  const cycleRadUnit = () => { radUnit = radUnit === 'earth' ? 'jupiter' : radUnit === 'jupiter' ? 'dist' : 'earth'; };
  $: massUnitSym = massUnit === 'earth' ? 'M⊕' : massUnit === 'jupiter' ? 'M♃' : 't';
  $: radUnitSym = radUnit === 'earth' ? 'R⊕' : radUnit === 'jupiter' ? 'R♃' : $fmt.distUnit;
  // Tooltip: what the CURRENT unit means, then a "click to change" line below it.
  $: massUnitName = massUnit === 'earth' ? 'Earth masses' : massUnit === 'jupiter' ? 'Jupiter masses' : 'tonnes';
  $: radUnitName = radUnit === 'earth' ? 'Earth radii' : radUnit === 'jupiter' ? 'Jupiter radii' : ($fmt.distUnit === 'mi' ? 'miles' : 'kilometres');
  $: massUnitTitle = `${massUnitName} (${massUnitSym})\nClick to change units`;
  $: radUnitTitle = `${radUnitName} (${radUnitSym})\nClick to change units`;
  $: massDisp = massUnit === 'earth' ? pMassMe : massUnit === 'jupiter' ? pMassMe / M_JUP_ME : (body.massKg ?? 0) / 1000;
  $: radDisp = radUnit === 'earth' ? pRadiusRe : radUnit === 'jupiter' ? pRadiusRe / R_JUP_RE : $fmt.toDist(body.radiusKm ?? 0);
  const massMeFromDisp = (v: number) => massUnit === 'earth' ? v : massUnit === 'jupiter' ? v * M_JUP_ME : (v * 1000) / EARTH_MASS_KG;
  const radReFromDisp = (v: number) => radUnit === 'earth' ? v : radUnit === 'jupiter' ? v * R_JUP_RE : $fmt.fromDist(v) / EARTH_RADIUS_KM;

  // Read the live state straight from the body (NOT the reactive pMassMe/pMakeup vars, which are
  // stale within a synchronous edit batch — so consecutive edits chain off fresh values).
  function pState(): BodyEditState {
      return {
          massMe: (body.massKg ?? 0) / EARTH_MASS_KG,
          radiusRe: (body.radiusKm ?? 0) / EARTH_RADIUS_KM,
          makeup: normalizeMakeup(makeupFractions(body))
      };
  }
  // Every edit through this panel commits back to the body and hands the TYPE to the
  // physics: autoClassify on -> the fingerprint classifier re-derives class + image on
  // the next process (so terrestrial -> gas giant actually flips as you cross the bands).
  function commit(out: BodyEditState) {
      body.massKg = out.massMe * EARTH_MASS_KG;
      body.radiusKm = out.radiusRe * EARTH_RADIUS_KM;
      body.makeup = { ...out.makeup };
      body.autoClassify = true;
      body = body; // trigger local reactivity now, without waiting on the parent reprocess
      dispatch('update');
  }

  // Gas-giant THERMAL INFLATION (F-OVR): insolation puffs the envelope, so a gas giant's derived radius
  // (and hence density) tracks its equilibrium temperature. Derived from Teq by default; the GM can pin a
  // multiplier. Only meaningful for gas-dominated bodies (terrestrials ignore it).
  $: pGasDominated = pMakeup.gas > 0.5;
  $: pInflationDerived = gasThermalInflationFactor(body.equilibriumTempK ?? 0);
  $: pInflation = body.overrides?.gasThermalInflation ?? pInflationDerived;
  $: inflationOverridden = typeof body.overrides?.gasThermalInflation === 'number';
  const effInflation = () => (body.overrides?.gasThermalInflation ?? gasThermalInflationFactor(body.equilibriumTempK ?? 0));

  const heldDensity = () =>
      (lock === 'density' ? densityGcc((body.massKg ?? 0) / EARTH_MASS_KG, (body.radiusKm ?? 0) / EARTH_RADIUS_KM) : undefined);
  function applyMass(v: number)   { if (Number.isFinite(v)) commit(editMass(pState(), v, lock, heldDensity(), effInflation())); }
  function applyRadius(v: number) { if (Number.isFinite(v)) commit(editRadius(pState(), v, lock, heldDensity())); }
  function applyDensity(v: number){ if (Number.isFinite(v)) commit(editDensity(pState(), v, lock)); }
  function applyMakeupComp(k: keyof Makeup, pctVal: number) {
      const nm = setMakeupComponent(pState().makeup, k, clamp(pctVal, 0, 100) / 100);
      commit(editMakeup(pState(), nm, lock, effInflation()));
  }
  function applyPreset(mk: Makeup) {
      commit(editMakeup(pState(), normalizeMakeup(mk), lock, effInflation()));
  }

  // Thermal-inflation override controls (gas giants). Changing it re-derives the radius from the mass.
  function ensureOverrides() { if (!body.overrides) body.overrides = {}; }
  function setInflation(v: number) {
      if (!Number.isFinite(v)) return;
      ensureOverrides();
      body.overrides!.gasThermalInflation = clamp(v, 0.5, 3);
      commit(editMass(pState(), pState().massMe, lock, heldDensity(), body.overrides!.gasThermalInflation));
  }
  function startInflationOverride() { setInflation(pInflationDerived); }
  function resetInflationAuto() {
      if (body.overrides) {
          delete body.overrides.gasThermalInflation;
          if (Object.keys(body.overrides).length === 0) delete body.overrides;
      }
      commit(editMass(pState(), pState().massMe, lock, heldDensity(), gasThermalInflationFactor(body.equilibriumTempK ?? 0)));
  }
  const onInflSlider = (e: Event) => setInflation(+(e.target as HTMLInputElement).value);
  const onInflNum = (e: Event)    => setInflation(parseFloat((e.target as HTMLInputElement).value));

  const onMassSlider = (e: Event)  => applyMass(logVal(+(e.target as HTMLInputElement).value, pMassMin, pMassMax));
  const onRadSlider = (e: Event)   => applyRadius(logVal(+(e.target as HTMLInputElement).value, pRadMin, pRadMax));
  const onDenSlider = (e: Event)   => applyDensity(logVal(+(e.target as HTMLInputElement).value, pDenMin, pDenMax));
  const onMassNum = (e: Event)     => applyMass(massMeFromDisp(parseFloat((e.target as HTMLInputElement).value)));
  const onRadNum = (e: Event)      => applyRadius(radReFromDisp(parseFloat((e.target as HTMLInputElement).value)));
  const onDenNum = (e: Event)      => applyDensity(parseFloat((e.target as HTMLInputElement).value));
  const onMkSlider = (k: keyof Makeup, e: Event) => applyMakeupComp(k, +(e.target as HTMLInputElement).value);
  const onMkNum = (k: keyof Makeup, e: Event)    => applyMakeupComp(k, parseFloat((e.target as HTMLInputElement).value) || 0);

  // Live classification the physics has assigned (updated after each commit -> process()).
  function prettyClass(c: string | undefined): string {
      if (!c) return '—';
      return c.replace(/^(planet|star)\//, '').replace(/-/g, ' ').replace(/\b\w/g, m => m.toUpperCase());
  }
  $: liveType = prettyClass(body.classes?.[0]);
  $: makeupLocked = lock === 'density'; // density-lock === composition-lock

  function updateVisualType(e: Event) {
      const val = (e.target as HTMLSelectElement).value;
      if (!body.classes) body.classes = [];
      body.classes[0] = val;
      body.autoClassify = false; // an explicit pick is end-state
      if (rulePack?.classifier?.planetImages && rulePack.classifier.planetImages[val]) {
          if (!body.image) body.image = { url: '' };
          body.image.url = rulePack.classifier.planetImages[val];
      }
      dispatch('update');
  }

  function handleUpdate() { dispatch('update'); }

  // Rotational deformation (E4): the bulk density sets a hard BREAK-UP spin — spin any faster and the
  // equator sheds mass into a ring. Derived live from density + the day length, so it tracks composition
  // edits too. We surface the shape and hard-clamp the day length at the break-up period.
  $: rotDensity = isPlanetMoon ? pDensity : densityValue;
  $: breakupHours = breakupPeriodHours(rotDensity || 0);
  $: rotDeform = rotationalDeform(body.rotation_period_hours ?? 0, rotDensity || 0);
  const SHAPE_LABEL: Record<RotationalShape, string> = {
    spherical: 'Spherical', oblate: 'Oblate (flattened)', ellipsoid: 'Ellipsoid',
    'near-breakup': 'Near break-up', unstable: 'Would fly apart → ring'
  };

  // Day-length slider: one LOG-scaled control from the break-up limit (fast, left) to very slow (right),
  // its track coloured by the shape zone. Spin DIRECTION is a separate retrograde flag (the stored period's
  // sign), and the synchronous (tidally-locked) period sits on the track as a snap notch — no checkbox.
  const SNAP_FRAC = 0.03;           // how close (in slider units) to the notch you must be to snap-lock
  $: rotMagHours = Math.abs(body.rotation_period_hours ?? 0);
  $: isRetrograde = (body.rotation_period_hours ?? 0) < 0;
  $: syncPeriodHours = Math.max(0, (body.orbital_period_days ?? 0) * 24); // locked ⇒ day = orbit
  $: pMin = Math.max(0.01, breakupHours);
  $: pMax = Math.max(pMin * 4, syncPeriodHours * 1.5, 20000);
  $: logSpan = Math.log(pMax / pMin) || 1;
  const clamp01 = (x: number) => Math.min(1, Math.max(0, x));
  $: periodToPos = (p: number) => clamp01(Math.log(Math.min(pMax, Math.max(pMin, p || pMin)) / pMin) / logSpan);
  $: posToPeriod = (s: number) => pMin * Math.pow(pMax / pMin, clamp01(s));
  $: rotPos = periodToPos(rotMagHours || pMax); // no spin ⇒ park at the slow end
  $: syncPos = syncPeriodHours >= pMin ? periodToPos(syncPeriodHours) : -1;
  // Colour-zone track. Boundaries are spin FRACTIONS (period = breakup / fraction): near-breakup 0.8,
  // ellipsoid 0.5, oblate 0.25. Fast (small period) = left = red; slow = right = green.
  $: rotTrack = (() => {
    const pct = (x: number) => (periodToPos(x) * 100).toFixed(1) + '%';
    const s08 = pct(pMin / 0.8), s05 = pct(pMin / 0.5), s025 = pct(pMin / 0.25);
    return `linear-gradient(to right,` +
      `var(--rot-unstable) 0%, var(--rot-unstable) ${s08},` +
      `var(--rot-ellipsoid) ${s08}, var(--rot-ellipsoid) ${s05},` +
      `var(--rot-oblate) ${s05}, var(--rot-oblate) ${s025},` +
      `var(--rot-spherical) ${s025}, var(--rot-spherical) 100%)`;
  })();

  function writePeriod(magHours: number, opts: { locked: boolean }) {
    let mag = Math.abs(magHours) || 0;
    if (mag > 0 && mag < breakupHours) mag = +breakupHours.toFixed(2); // hard break-up floor
    body.rotation_period_hours = +(isRetrograde ? -mag : mag).toFixed(2);
    body.tidallyLocked = opts.locked;
    (body as any).tidalLockManual = true; // any hand-set rate/lock is a manual pin
    body = body;
    dispatch('update');
  }
  function onRotSlider(e: Event) {
    const s = parseFloat((e.currentTarget as HTMLInputElement).value);
    if (syncPos >= 0 && Math.abs(s - syncPos) <= SNAP_FRAC) { writePeriod(syncPeriodHours, { locked: true }); return; }
    writePeriod(posToPeriod(s), { locked: false });
  }
  function onRotMagInput(e: Event) {
    writePeriod(parseFloat((e.currentTarget as HTMLInputElement).value) || 0, { locked: false });
  }
  function lockTidally() { if (syncPeriodHours >= pMin) writePeriod(syncPeriodHours, { locked: true }); }
  function toggleRetrograde(e: Event) {
    const retro = (e.currentTarget as HTMLInputElement).checked;
    body.rotation_period_hours = (retro ? -1 : 1) * Math.abs(body.rotation_period_hours ?? 0);
    body = body;
    dispatch('update');
  }
  function resetTidalLockAuto() { delete (body as any).tidalLockManual; dispatch('update'); }
  function toggleAutoClassify(e: Event) { body.autoClassify = (e.currentTarget as HTMLInputElement).checked; dispatch('update'); }

  // F2 — custom body image. Upload a picture that replaces the derived type image; the processor leaves
  // a custom image alone (image.custom). Removing it hands the image back to the type.
  let imgInput: HTMLInputElement;
  async function onImageUpload(e: Event) {
    const input = e.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;
    try {
      const url = await fileToDownscaledDataUrl(file, 512);
      body.image = { url, custom: true };
      body = body;
      dispatch('update');
    } catch { alert('Could not read that image file.'); }
    finally { input.value = ''; }
  }
  function removeCustomImage() {
    body.image = undefined; // processor re-derives the type image next pass
    body = body;
    dispatch('update');
  }
  function igniteStar() {
      body.roleHint = 'star';
      if (!body.classes) body.classes = [];
      body.classes[0] = 'star/M';
      body.massKg = Math.max(body.massKg || 0, 0.08 * SOLAR_MASS_KG);
      body.temperatureK = 2800;
      dispatch('update');
  }
</script>

<div class="tab-panel">

  {#if isPlanetMoon}
    <!-- ===================== SIZE & COMPOSITION (planets / moons) ===================== -->
    <div class="sc-head">
        <div class="sc-title">Size &amp; Composition</div>
        <div class="sc-type"><span class="sc-type-label">Type</span> <span class="sc-type-val">{liveType}</span></div>
    </div>
    <div class="sc-sub"><span class="category-badge">{sizeCategory}</span></div>

    <!-- MASS -->
    <div class="sc-field" class:locked={lock === 'mass'}>
        <div class="sc-row">
            <button class="lock" class:on={lock === 'mass'} title={lock === 'mass' ? 'Mass pinned - click to release' : 'Pin the mass'} on:click={() => toggleLock('mass')} aria-label="Lock mass">{lock === 'mass' ? '🔒' : '🔓'}</button>
            <label>Mass</label>
            <input class="sc-num" type="number" step="any" value={r4(massDisp)} on:input={onMassNum} disabled={lock === 'mass'} />
            <button class="sc-unit-cycle" on:click={cycleMassUnit} title={massUnitTitle} aria-label="Change mass units">{massUnitSym}</button>
        </div>
        <input class="sc-slider" type="range" min="0" max="1" step="0.001" value={pMassPos} on:input={onMassSlider} disabled={lock === 'mass'} />
        <div class="sub-label">{(body.massKg || 0).toExponential(2)} kg{#if pMassMe >= 318} · {(pMassMe / 317.8).toFixed(2)} M♃{/if}</div>
    </div>

    <!-- RADIUS -->
    <div class="sc-field" class:locked={lock === 'radius'}>
        <div class="sc-row">
            <button class="lock" class:on={lock === 'radius'} title={lock === 'radius' ? 'Radius pinned - click to release' : 'Pin the radius'} on:click={() => toggleLock('radius')} aria-label="Lock radius">{lock === 'radius' ? '🔒' : '🔓'}</button>
            <label>Radius</label>
            <input class="sc-num" type="number" step="any" value={r4(radDisp)} on:input={onRadNum} disabled={lock === 'radius'} />
            <button class="sc-unit-cycle" on:click={cycleRadUnit} title={radUnitTitle} aria-label="Change radius units">{radUnitSym}</button>
        </div>
        <input class="sc-slider" type="range" min="0" max="1" step="0.001" value={pRadPos} on:input={onRadSlider} disabled={lock === 'radius'} />
        <div class="sub-label">{$fmt.km(body.radiusKm || 0)}</div>
    </div>

    <!-- DENSITY (lock = hold composition) -->
    <div class="sc-field" class:locked={lock === 'density'}>
        <div class="sc-row">
            <button class="lock" class:on={lock === 'density'} title={lock === 'density' ? 'Density & composition pinned - click to release' : 'Pin the density (holds the interior makeup)'} on:click={() => toggleLock('density')} aria-label="Lock density">{lock === 'density' ? '🔒' : '🔓'}</button>
            <label>Density</label>
            <input class="sc-num" type="number" step="any" value={r4(pDensity)} on:input={onDenNum} disabled={lock === 'density'} />
            <span class="sc-unit">g/cc</span>
        </div>
        <input class="sc-slider" type="range" min="0" max="1" step="0.001" value={pDenPos} on:input={onDenSlider} disabled={lock === 'density'} />
        <div class="sub-label">{lock === 'density' ? 'composition held' : 'infers the interior makeup below'}</div>
    </div>

    {#if pMassMe >= 25000}
        <button class="action-btn ignite-btn" on:click={igniteStar}>🔥 Ignite into Star</button>
    {/if}

    <hr/>

    <!-- COMPOSITION PRESETS - gated by the current density (bands overlap on purpose) -->
    <div class="sc-presets-label">Composition preset <span class="sc-presets-sub">- valid at {pDensity.toFixed(1)} g/cc</span></div>
    <div class="sc-presets">
        {#each COMPOSITION_PRESETS as p}
            <button class="preset"
                    class:active={presetActive(p, pMakeup)}
                    disabled={makeupLocked || !presetValidAt(p, pDensity)}
                    title={makeupLocked ? 'Unlock density to recompose' : (presetValidAt(p, pDensity) ? `Set a ${p.name} interior` : `Out of band at ${pDensity.toFixed(1)} g/cc (needs ${p.band[0]}-${p.band[1]})`)}
                    on:click={() => applyPreset(p.makeup)}>{p.name}</button>
        {/each}
    </div>

    <!-- INTERIOR MAKEUP - editable when density is unlocked; back-drives density -->
    <div class="sc-makeup" class:frozen={makeupLocked}>
        <div class="sc-makeup-head">
            <span>Interior makeup</span>
            <span class="hint">{makeupLocked ? 'held by density lock' : 'drives density -> size'}</span>
        </div>
        {#each MK_KEYS as k}
            <div class="mk-row">
                <span class="swatch" style="background-color: {MK_SWATCH[k]}"></span>
                <label for="mk-{k}">{MK_LABEL[k]}</label>
                <input id="mk-{k}" type="range" min="0" max="100" step="1" value={Math.round((pMakeup[k] ?? 0) * 100)} on:input={(e) => onMkSlider(k, e)} disabled={makeupLocked} />
                <input class="mk-num" type="number" min="0" max="100" step="1" value={Math.round((pMakeup[k] ?? 0) * 100)} on:input={(e) => onMkNum(k, e)} disabled={makeupLocked} />
                <span class="mk-pct">%</span>
            </div>
        {/each}
    </div>
    <p class="compress-note">Density is gravity-compressed by mass - the same mix packs denser on a super-Earth than on a moon. Adding metal or ice shifts the density (and its magnetic tagging); the physics re-reads the type on release.</p>

    {#if pGasDominated}
        <hr/>
        <div class="sc-field">
            <div class="sc-row">
                <label>Thermal inflation
                    {#if inflationOverridden}<span class="sc-ovr-pill" title="Manually overridden — this puffiness is used instead of the value implied by the equilibrium temperature.">overridden</span>
                    {:else}<span class="sc-derived-pill" title="Derived from the equilibrium temperature: a hotter giant puffs up (bigger radius, lower density); a cold one sits near 1 R Jupiter.">derived</span>{/if}
                </label>
                {#if inflationOverridden}
                    <input class="sc-num" type="number" min="0.5" max="3" step="0.01" value={pInflation.toFixed(2)} on:input={onInflNum} />
                {:else}
                    <span class="sc-derived-val">×{pInflation.toFixed(2)}</span>
                {/if}
                <span class="sc-unit">×R</span>
            </div>
            {#if inflationOverridden}
                <input class="sc-slider" type="range" min="0.8" max="2.2" step="0.01" value={pInflation} on:input={onInflSlider} />
                <div class="sub-label"><button type="button" class="link-btn" on:click={resetInflationAuto}>Reset to calculated ↺</button></div>
            {:else}
                <div class="sub-label">Insolation puffs the envelope (Teq {Math.round(body.equilibriumTempK ?? 0)} K → ×{pInflationDerived.toFixed(2)}). <button type="button" class="link-btn inline" on:click={startInflationOverride}>override</button></div>
            {/if}
        </div>
    {/if}

  {:else}
    <!-- ===================== STAR / BELT / RING size editor ===================== -->
    <div class="form-group">
        <div class="label-row">
            <label for="mass">Mass ({displayMassUnit})</label>
            <input type="number" id="mass" step="any" bind:value={displayMassValue} on:input={updateMassFromInput} />
        </div>
        <input type="range" min="0" max="1" step="0.001" bind:value={massSliderPos} on:input={updateMassFromSlider} class="full-width-slider" list="mass-ticks" />
        <datalist id="mass-ticks">
            <option value="0" label="{currentMassMin.toPrecision(1)}"></option>
            <option value="0.25"></option>
            <option value="0.5" label="1"></option>
            <option value="0.75"></option>
            <option value="1" label="{currentMassMax}"></option>
        </datalist>
        <div class="sub-label"><span>{(body.massKg || 0).toExponential(2)} kg</span></div>
        {#if !useSolarUnits && massValueInternal >= 25000}
            <button class="action-btn ignite-btn" on:click={igniteStar}>🔥 Ignite into Star</button>
        {/if}
    </div>

    <hr/>

    <div class="form-group">
        <div class="label-row">
            <label for="radius">Radius ({displayRadiusUnit})</label>
            <input type="number" id="radius" step="any" bind:value={displayRadiusValue} on:input={updateRadiusFromInput} />
        </div>
        <input type="range" min="0" max="1" step="0.001" bind:value={radiusSliderPos} on:input={updateRadiusFromSlider} class="full-width-slider" list="radius-ticks" />
        <datalist id="radius-ticks">
            <option value="0" label="{Math.round(currentRadiusMin)}"></option>
            <option value="0.33"></option>
            <option value="0.66"></option>
            <option value="1" label="{Math.round(currentRadiusMax)}"></option>
        </datalist>
        <div class="sub-label row-spaced">
            <span>{$fmt.km(body.radiusKm || 0)}</span>
            <span class="category-badge">{sizeCategory}</span>
        </div>
    </div>

    <div class="form-group density-group">
        <div class="label-row">
            <label>Calculated Density</label>
            <div class="read-only-value">{densityValue.toFixed(2)} g/cm³</div>
        </div>
        <div class="density-bar">
            <div class="density-fill" style="width: {Math.min(100, (densityValue / 15) * 100)}%; background-color: hsl({120 - Math.min(120, (densityValue/8)*120)}, 70%, 50%);"></div>
        </div>
        <div class="sub-label row-spaced">
            <span>Gas/Ice</span><span>Rock</span><span>Iron</span>
        </div>
    </div>
  {/if}

    <hr/>

    <div class="rot-editor">
        <div class="rot-head">
            <label for="rotation">Day Length</label>
            <div class="rot-num">
                <input type="number" id="rotation" step="0.1" min={breakupHours.toFixed(2)}
                       value={rotMagHours ? +rotMagHours.toFixed(2) : ''} on:input={onRotMagInput} />
                <span class="unit">h</span>
            </div>
        </div>
        {#if (rotDensity || 0) > 0}
            <div class="rot-slider-wrap">
                <input class="rot-slider" type="range" min="0" max="1" step="0.001"
                       value={rotPos} on:input={onRotSlider} style="--rot-track: {rotTrack};"
                       aria-label="Day length — log scale from the break-up limit (fast) to slow" />
                {#if syncPos >= 0}
                    <button type="button" class="rot-lock-notch" class:on={body.tidallyLocked}
                            style="left: {(syncPos * 100).toFixed(1)}%;" on:click={lockTidally}
                            title="Tidally locked — the day equals the orbit. Click, or drag the slider onto this notch, to lock.">🔒</button>
                {/if}
            </div>
            <div class="rot-scale"><span>fast · break-up</span><span>slow</span></div>
            <span class="sub-label shape-note shape-{rotDeform.shape}" title="Faster spin (shorter day) flattens the body; below the break-up period the equator sheds mass and it would become a ring. The limit is set by the bulk density (composition).">
                {SHAPE_LABEL[rotDeform.shape]}{#if body.tidallyLocked} · tidally locked{/if} · break-up {breakupHours < 1 ? breakupHours.toFixed(2) : breakupHours.toFixed(1)} h{#if rotDeform.shape !== 'spherical'} · f {rotDeform.oblateness.toFixed(2)}{/if}
            </span>
        {/if}
        <div class="rot-flags">
            <label class="inline-check" title="Spin direction. Retrograde bodies (like Venus) turn opposite their orbit; stored as a negative day length.">
                <input type="checkbox" checked={isRetrograde} on:change={toggleRetrograde} />
                Retrograde (spins backwards)
            </label>
            {#if (body as any).tidalLockManual}
                <button type="button" class="link-btn" on:click={resetTidalLockAuto}>Reset spin to auto</button>
            {/if}
        </div>
    </div>

    <div class="form-group">
        <label for="tilt">Axial Tilt: {(body.axial_tilt_deg ?? 0).toFixed(0)}°</label>
        <div class="tilt-row">
            <input class="tilt-slider" type="range" id="tilt" min="0" max="180" step="1"
                   bind:value={body.axial_tilt_deg} on:input={handleUpdate} />
            <input class="tilt-num" type="number" step="0.1" min="0" max="180"
                   bind:value={body.axial_tilt_deg} on:input={handleUpdate} />
        </div>
    </div>

    <hr/>

    <div class="form-group">
        <label>Type / Image</label>
        <select value={body.classes?.[0] || 'planet/terrestrial'} on:change={updateVisualType}>
            {#each visualTypes as type}
                <option value={type}>{type.replace('planet/', '').replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase())}</option>
            {/each}
            {#if visualTypes.length === 0}
                <option disabled>No types loaded (Check RulePack)</option>
            {/if}
        </select>
        <label title="Off (default): the type you picked is end-state - the classifier never overwrites it. On: the physics engine derives the type (and image) from mass, makeup, atmosphere and temperature on every recalculation.">
            <input type="checkbox" checked={!!body.autoClassify} on:change={toggleAutoClassify} />
            Auto-classify (physics decides the type)
        </label>
        <span class="sub-label">Sets the body's type and image. Picking one switches auto-classify off.</span>
        <div class="custom-image">
            {#if body.image?.custom}<img class="custom-thumb" src={body.image.url} alt="Custom image for {body.name}" />{/if}
            <button type="button" class="link-btn" on:click={() => imgInput?.click()}>{body.image?.custom ? 'Replace image…' : 'Upload custom image…'}</button>
            {#if body.image?.custom}<button type="button" class="link-btn" on:click={removeCustomImage}>Remove (use type image)</button>{/if}
            <input type="file" accept="image/*" bind:this={imgInput} on:change={onImageUpload} style="display:none" />
        </div>
    </div>
</div>

<style>
  .tab-panel { padding: 10px; display: flex; flex-direction: column; gap: 15px; }
  .row { display: flex; gap: 10px; }
  .form-group { display: flex; flex-direction: column; flex: 1; gap: 5px; }

  .label-row { display: flex; justify-content: space-between; align-items: center; }
  label { color: var(--text-muted); font-size: 0.9em; margin: 0; }

  input[type="number"], select, .read-only-value {
      padding: 4px;
      background: var(--bg-control);
      border: 1px solid var(--border);
      color: var(--text);
      border-radius: 3px;
      width: 100px;
      text-align: right;
      font-size: 1em;
      box-sizing: border-box;
  }
  select { width: 100%; text-align: left; }
  .read-only-value {
      background: var(--bg-panel); border: 1px solid var(--border);
      color: var(--text-muted); cursor: default; font-family: monospace;
  }
  .sub-label { font-size: 0.75em; color: var(--text-faint); }
  .shape-note { font-variant-numeric: tabular-nums; }

  /* --- Day-length slider (E4 shape-aware) --- */
  .rot-editor {
    --rot-unstable: #c0392b; --rot-ellipsoid: #e07b39; --rot-oblate: #d6b53c; --rot-spherical: #3c9a5f;
    display: flex; flex-direction: column; gap: 6px;
  }
  .rot-head { display: flex; align-items: center; justify-content: space-between; }
  .rot-head label { margin: 0; color: var(--text-muted); font-size: 0.9em; }
  .rot-num { display: flex; align-items: center; gap: 4px; }
  .rot-num input { width: 90px; padding: 4px 6px; border-radius: 4px; border: 1px solid var(--border); background: var(--bg-control); color: var(--text); }
  .rot-num .unit { color: var(--text-faint); font-size: 0.85em; }
  .rot-slider-wrap { position: relative; padding: 2px 0; }
  .rot-slider { width: 100%; margin: 0; -webkit-appearance: none; appearance: none; background: transparent; cursor: pointer; }
  .rot-slider::-webkit-slider-runnable-track { height: 10px; border-radius: 5px; background: var(--rot-track); border: 1px solid rgba(0,0,0,0.25); }
  .rot-slider::-moz-range-track { height: 10px; border-radius: 5px; background: var(--rot-track); border: 1px solid rgba(0,0,0,0.25); }
  .rot-slider::-webkit-slider-thumb { -webkit-appearance: none; appearance: none; width: 16px; height: 16px; margin-top: -4px; border-radius: 50%; background: #fff; border: 2px solid #222; box-shadow: 0 1px 3px rgba(0,0,0,0.4); }
  .rot-slider::-moz-range-thumb { width: 16px; height: 16px; border-radius: 50%; background: #fff; border: 2px solid #222; box-shadow: 0 1px 3px rgba(0,0,0,0.4); }
  .rot-lock-notch {
    position: absolute; top: -3px; transform: translateX(-50%); z-index: 2;
    background: var(--bg-panel); border: 1px solid var(--border); border-radius: 4px;
    padding: 0 2px; font-size: 0.8em; line-height: 1.4; cursor: pointer; opacity: 0.7;
  }
  .rot-lock-notch:hover { opacity: 1; }
  .rot-lock-notch.on { opacity: 1; border-color: var(--accent, #ff5a1f); box-shadow: 0 0 0 1px var(--accent, #ff5a1f); }
  .rot-scale { display: flex; justify-content: space-between; font-size: 0.7em; color: var(--text-faint); }
  .rot-flags { display: flex; align-items: center; justify-content: space-between; gap: 8px; flex-wrap: wrap; }
  .inline-check { display: flex; align-items: center; gap: 6px; margin: 0; color: var(--text); font-size: 0.85em; }
  .inline-check input { width: auto; }
  .tilt-row { display: flex; align-items: center; gap: 8px; }
  .tilt-slider { flex: 1; }
  .tilt-num { width: 70px; padding: 4px 6px; border-radius: 4px; border: 1px solid var(--border); background: var(--bg-control); color: var(--text); }
  .shape-oblate { color: #6aa0d8; }
  .shape-ellipsoid { color: #e0a24a; }
  .shape-near-breakup { color: #e06a4a; font-weight: 600; }
  .shape-unstable { color: #e0483c; font-weight: 700; }
  .link-btn {
      background: none; border: none; padding: 2px 0; margin-top: 2px;
      color: var(--link, #6aa0d8); font-size: 0.75em; cursor: pointer; text-align: left;
  }
  .link-btn:hover { text-decoration: underline; }
  .row-spaced { display: flex; justify-content: space-between; }
  .category-badge { color: #4da6ff; font-weight: bold; }

  input[type="checkbox"] { width: auto; margin-right: 5px; }
  .full-width-slider { width: 100%; margin: 0; cursor: pointer; }
  hr { border: 0; border-top: 1px solid var(--border); margin: 5px 0; width: 100%; }

  .density-bar { width: 100%; height: 6px; background: var(--bg-panel); border-radius: 3px; overflow: hidden; margin-top: 2px; }
  .density-fill { height: 100%; transition: width 0.3s, background-color 0.3s; }

  .action-btn { width: 100%; padding: 8px; margin-top: 10px; border: none; border-radius: 4px; font-weight: bold; cursor: pointer; }
  .ignite-btn { background-color: #d35400; color: white; }
  .ignite-btn:hover { background-color: #e67e22; }

  /* ---- Size & Composition editor ---- */
  .sc-head { display: flex; align-items: baseline; justify-content: space-between; }
  .sc-title { font-weight: 600; color: var(--text); }
  .sc-type { font-size: 0.85em; }
  .sc-type-label { color: var(--text-faint); text-transform: uppercase; font-size: 0.85em; letter-spacing: 0.04em; }
  .sc-type-val { color: #4da6ff; font-weight: 600; }
  .sc-sub { margin-top: -8px; }

  .sc-field { display: flex; flex-direction: column; gap: 4px; }
  .sc-field.locked { opacity: 0.85; }
  .sc-row { display: flex; align-items: center; gap: 8px; }
  .sc-row label { flex: 1; color: var(--text); font-size: 0.95em; }
  .sc-num { width: 90px; }
  .sc-unit { width: 34px; font-size: 0.8em; color: var(--text-faint); }
  /* Clickable 3-way unit cycler sitting in the gap between the label and the value. */
  .sc-unit-cycle {
      min-width: 30px; text-align: center; font-size: 0.8em; line-height: 1.2;
      background: var(--bg-control, #1b1e26); color: var(--text-muted);
      border: 1px solid var(--border); border-radius: 4px; padding: 2px 5px; cursor: pointer;
  }
  .sc-unit-cycle:hover { border-color: var(--accent, #ff5a1f); color: var(--text); }
  .lock {
      background: transparent; border: 1px solid var(--border); border-radius: 4px;
      padding: 2px 5px; cursor: pointer; font-size: 0.85em; line-height: 1;
  }
  .lock.on { background: var(--accent, #ff5a1f); border-color: var(--accent, #ff5a1f); }

  /* Larger, more prominent primary sliders */
  .sc-slider { width: 100%; height: 22px; cursor: pointer; margin: 0; accent-color: var(--accent, #ff5a1f); }
  .sc-slider:disabled { cursor: not-allowed; opacity: 0.5; }

  .sc-presets-label { font-size: 0.8em; color: var(--text-muted); }
  .sc-presets-sub { color: var(--text-faint); }
  .sc-presets { display: flex; flex-wrap: wrap; gap: 4px; }
  .preset { font-size: 0.75em; padding: 3px 8px; border-radius: 4px; border: 1px solid var(--border); background: var(--bg-panel); color: var(--link); cursor: pointer; }
  .preset:hover:not(:disabled) { background: var(--bg-control); }
  .preset:disabled { opacity: 0.35; cursor: not-allowed; }
  .preset.active { background: var(--accent, #ff5a1f); color: #fff; border-color: var(--accent, #ff5a1f); }

  .sc-makeup { display: flex; flex-direction: column; gap: 6px; }
  .sc-makeup.frozen { opacity: 0.6; }
  .sc-makeup-head { display: flex; justify-content: space-between; align-items: baseline; font-size: 0.85em; color: var(--text-muted); }
  .sc-makeup-head .hint { font-size: 0.85em; color: var(--text-faint); }
  .mk-row { display: grid; grid-template-columns: 14px 52px 1fr 52px 14px; align-items: center; gap: 8px; }
  .swatch { width: 12px; height: 12px; border-radius: 3px; border: 1px solid rgba(255,255,255,0.2); }
  .mk-row label { font-size: 0.85em; color: var(--text-muted); }
  .mk-row input[type="range"] { width: 100%; accent-color: var(--accent, #ff5a1f); }
  .mk-num { width: 52px; padding: 2px 4px; font-size: 0.85em; }
  .mk-pct { font-size: 0.8em; color: var(--text-faint); }
  .compress-note { margin: 2px 0 0; font-size: 0.72em; color: var(--text-faint); line-height: 1.4; }
  .custom-image { display: flex; align-items: center; flex-wrap: wrap; gap: 8px; margin-top: 4px; }
  .custom-thumb { width: 40px; height: 40px; object-fit: cover; border-radius: 4px; border: 1px solid var(--border); }
  .sc-derived-val { min-width: 90px; text-align: right; color: var(--text); font-variant-numeric: tabular-nums; }
  .sc-derived-pill { font-size: 0.68em; text-transform: uppercase; letter-spacing: 0.04em; color: var(--text-faint); border: 1px solid var(--border); border-radius: 3px; padding: 0 4px; margin-left: 4px; cursor: help; }
  .sc-ovr-pill { font-size: 0.68em; text-transform: uppercase; letter-spacing: 0.04em; color: var(--accent, #ff5a1f); border: 1px solid var(--accent, #ff5a1f); border-radius: 3px; padding: 0 4px; margin-left: 4px; cursor: help; }
  .link-btn { background: none; border: none; padding: 0; color: var(--link, #6aa0d8); font-size: 0.9em; cursor: pointer; }
  .link-btn.inline { margin-left: 4px; }
  .link-btn:hover { text-decoration: underline; }
</style>
