<script lang="ts">
  import { createEventDispatcher } from 'svelte';
  import { luminositySolarFromRT } from '$lib/physics/luminosity';
  import type { CelestialBody, StellarType } from '$lib/types';
  import UnitValue from './UnitValue.svelte';
  import UnitInput from './UnitInput.svelte';
  import { undoEpoch } from '$lib/undo/systemUndo';
  import { SOLAR_MASS_KG, SOLAR_RADIUS_KM, EARTH_MASS_KG, G, C_MS } from '$lib/constants';
  import { STAR_COLOR_MAP } from '$lib/rendering/colors';
  import CustomImageBlock from './CustomImageBlock.svelte';
  import { resolveStarImage } from '$lib/system/starImage';
  import { explainStarClass, explainObservedStarClass, pickerLabel } from '$lib/system/starClassExplain';
  import { observedStarOf, apparentColourTempK } from '$lib/physics/observedStar';
  import { STELLAR_ACTIVITY_TAG } from '$lib/physics/stellarActivity';
  import { ionisingBands, activityForFraction, IONISING_FRACTION_QUIET, hasHotCorona, ionisingFromField, saturationFieldGauss } from '$lib/physics/ionisingOutput';
  import { starStatsFromPack } from '$lib/generation/star';
  // A83: the slider bounds are DATA, not seven const pairs buried in this script block.
  import { STAR_BOUNDS, SUPERMASSIVE_MASS, SUPERMASSIVE_AMBER_ABOVE, SUPERMASSIVE_AMBER_NOTE,
      massSoftRange, boundPos, boundValue, bandPct } from '$lib/physics/starBounds';
  import { stellarTypeForBand, spectralSubclass, starClassParts, starClassKeyFor, isBandKey, bandKeyOf } from '$lib/physics/starDesignation';

  // A key a BODY holds rather than a range it was drawn from — used to drop the previous designation
  // when a new one is written, so a star cannot accumulate two.
  const isDesignationKey = (c: string) => c.startsWith('star/') && !isBandKey(c);
  import { SeededRNG } from '$lib/rng';

  // `nodes` is the star's own system. It is what lets this panel say what an OBSERVER measures as
  // well as what the star IS — a megastructure in front of it is a fact about the system, not about
  // the star's record. Defaulted so every existing mount keeps working and simply shows the
  // intrinsic half, which is the honest answer when there is no system in hand.
  let { body, rulePack, nodes = [] } = $props();

  const dispatch = createEventDispatcher();

  // Plain-English explanation of the current designation, rebuilt whenever the class changes.
  // The star's own activity bucket, so a flare star is DESCRIBED as one. Read off the tag the
  // processor derives (class AND age) rather than re-deriving it here — an old M dwarf is not a
  // flare star, and only the processor knows the system's age.
  const activityBucket = $derived(
      (body?.tags ?? []).find((t: any) => t.key === STELLAR_ACTIVITY_TAG)?.value as string | undefined
  );
  const classExplanation = $derived(
      explainStarClass(rulePack, currentClass, activityBucket)
  );
  // G54: WHAT AN OBSERVER MEASURES, beside what the star IS. Built by the ONE designation builder,
  // never a second one. No viewpoint exists in a body panel, so this is the isotropic answer and it
  // NAMES any band it could not test rather than quietly counting or quietly ignoring it.
  //
  // THE GM SEES THE CAUSE. This is the GM's own editor; the disclosure ladder governs what reaches a
  // PLAYER, and it does that at the snapshot (TAG-9), not here.
  const observed = $derived.by(() => {
      if (!body || body.roleHint !== 'star' || !nodes?.length) return null;
      const { reading, los } = observedStarOf(body, nodes);
      if (!los.sources.length && !los.bandsUnresolved.length) return null;
      // THE HELD DESIGNATION, NOT THE PICKER'S BAND. `currentClass` is the BAND key the selector
      // sits on (`star/G`), which is right for the picker and wrong in a sentence: the panel says
      // "Currently G2V" two lines below, and "too faint for a G" beside it reads as a second opinion.
      // The body's own first class is the designation the engine wrote; fall back to the band when
      // it has none, which is what a freshly-picked star looks like.
      const held = (body.classes ?? []).find((c: string) => c.startsWith('star/')) ?? currentClass;
      const explanation = explainObservedStarClass(rulePack, held, reading, {
          activity: activityBucket,
          apparentTempK: reading.reddened ? apparentColourTempK(body.temperatureK ?? 0, los) : undefined,
          cause: los.sources.map((s) => s.name).join(', ') || undefined
      });
      return explanation ? { explanation, unresolved: los.bandsUnresolved.map((b) => b.name) } : null;
  });

  // The designation the body actually holds, shown so a GM can see it follow the sliders. Remnants
  // and anything with no letter show nothing rather than a made-up string.
  const designationNow = $derived.by(() => {
      const held = body?.classes?.[0] ?? '';
      const p = starClassParts(held);
      // `star/K-III` is the pack's KEY spelling; the MK form a reader knows is "K III". The hyphen is
      // there to keep one spelling in the data, not to be read out.
      return p.letter && !p.bare ? held.replace(/^star\//, '').replace('-', ' ') : '';
  });

  // --- State ---
  let massSuns = $state(0);
  let radiusSuns = $state(0);
  let tempK = $state(0);
  let radiation = $state(0);
  // Rotation and tilt are UNDEFINED when nothing has set them, not 0 (inbox B9a). A star has no
  // rotation model yet, so a freshly-made one genuinely does not have a spin — and "0 h" reads as a
  // measurement rather than the gap it is. The boxes stay empty until something fills them in.
  let rotationHours: number | undefined = $state(undefined);
  // A85: rotation is a 0..1 POSITION on a log track now, like every other slider in this editor.
  // `rotationHours` stays the authored figure and stays legitimately undefined; this is only
  // where the thumb is. 0.5 is the track midpoint, which is where the browser put an empty
  // range input before, so an unset rotation looks exactly as it did.
  let rotSliderPos = $state(0.5);
  let axialTilt: number | undefined = $state(undefined);
  let magGauss = $state(0);

  // --- Slider travel: DATA (A83), pinned bit-for-bit by `physics/starBounds.spec.ts`. ---
  // `soft` is TRAVEL, never a wall: a typed figure outside it pins the thumb and is kept as
  // typed, which is what every writer below already did and what steer-don't-stop requires.
  // A83 THE SUPERMASSIVE SWITCH. Owner: *"a switch that can offer 'supermassive black holes' -
  // the scale will change from 300 to 270 Billion SM - which is the theoretical limit (log
  // slider!)"*. It moves the slider's TRAVEL and nothing else: the mass under the thumb does not
  // change when it is thrown, because a control that edits the thing it is describing is a trap.
  //
  // IT IS NOT STORED, IT IS DERIVED - from whether this hole is ALREADY heavier than any star.
  // A stored flag would be a second answer to a question the mass already answers, and the two
  // would drift the first time a mass arrived from an import, a preset or an undo. So a 4e6 M☉
  // hole always opens with the fine scale it needs, and nothing has to remember that it did.
  let supermassive = $state(false);
  const massSoft = $derived(massSoftRange(supermassive));
  let massSliderPos = $state(0.5);
  // Which body the editable fields below were last synced from. The sync effect re-runs on every render
  // (the body proxy re-resolves as the clock ticks), so we only pull values FROM the body when a different
  // body is selected — otherwise it clobbers a half-typed value (the "can't type a precise mass" bug).
  let lastSyncedBodyId: string | null = null;
  let lastSyncedUndoEpoch = -1;

  const radiusSoft = STAR_BOUNDS.radius.soft;
  let radiusSliderPos = $state(0.5);

  const tempSoft = STAR_BOUNDS.temp.soft;
  let tempSliderPos = $state(0.5);

  const radSoft = STAR_BOUNDS.radiation.soft;
  let radSliderPos = $state(0.25);

  const magSoft = STAR_BOUNDS.mag.soft;
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

  // ONE TABLE, NOT TWO (inbox D22). The per-class parameter ranges used to be hard-coded here as
  // well as living in the rule pack's `statTemplates`, and the two copies DISAGREED for 8 of 16
  // classes — so a GM editing a white dwarf saw 0.1-1.4 Msun / 4,000-100,000 K while a GENERATED or
  // IMPORTED white dwarf drew from 0.6-1.4 / 8,000-40,000. Both copies are consumed by taking the
  // MIDPOINT, so that is not a cosmetic difference: it is two different answers to one question
  // (52,000 K against 24,000 K for the same pick).
  //
  // The PACK is authoritative, on three grounds:
  //   1. It has three consumers (the generator's `starStatTemplate` and `starFieldFromPack`, and the
  //      real-sky importer's `starParamsFromType`); this had one. A pack is also retunable per
  //      starmap, which a record compiled into a component can never be.
  //   2. The engine's own rule puts numbers in DATA, not code (DATA-R4). `import/realsky/stars.mjs`
  //      states the intent outright: "NOTHING IS INVENTED HERE. The bands are statTemplates from the
  //      RULE PACK - the same data the generator draws its own stars from."
  //   3. Where they differ, the pack's bands are TYPICAL and this copy's were PERMISSIVE — and since
  //      a band is consumed by its midpoint, a permissive band yields an ATYPICAL member. 4,000 to
  //      100,000 K centres a white dwarf on 52,000 K, which is a very young and very hot one; the
  //      neutron-star and magnetar bands ran to 3 Msun, above the observed maximum; and the red-giant
  //      floor of 0.3 Msun is unreachable, because nothing that light has had time to leave the main
  //      sequence in the age of the universe.
  //
  // WHAT STAYS HERE IS PRESENTATION AND NOTHING ELSE: the label a GM reads, and the rotation band,
  // which has no pack counterpart because the engine has no stellar rotation model yet (inbox B9b,
  // B43). The new giant and supergiant bands deliberately have no `rot` — the range bar simply
  // doesn't draw, which is honest, rather than inventing a figure to fill it.
  //
  // The two labels that changed are the ones D19 was about: `star/O` was captioned "Blue Supergiant"
  // and `star/B` "Blue Giant" while both are MAIN-SEQUENCE bands. That is the letter being read as
  // though it implied a luminosity class — the exact confusion — and it cannot stand next to a real
  // `star/O-I` in the same list.
  const STAR_PRESENTATION: Record<string, { label: string, rot?: [number, number] }> = {
      'star/O': { label: 'O-Type (Blue)', rot: [10, 100] },
      'star/B': { label: 'B-Type (Blue-White)', rot: [10, 150] },
      'star/A': { label: 'A-Type (White)', rot: [10, 200] },
      'star/F': { label: 'F-Type (Yellow-White)', rot: [20, 300] },
      'star/G': { label: 'G-Type (Yellow Dwarf)', rot: [24, 1000] },
      'star/K': { label: 'K-Type (Orange Dwarf)', rot: [50, 1500] },
      'star/M': { label: 'M-Type (Red Dwarf)', rot: [100, 2000] },
      'star/O-III': { label: 'O-Type Giant' },
      'star/B-III': { label: 'B-Type Giant' },
      'star/A-III': { label: 'A-Type Giant' },
      'star/F-III': { label: 'F-Type Giant' },
      'star/G-III': { label: 'G-Type Giant (Capella)' },
      'star/K-III': { label: 'K-Type Giant (Arcturus)' },
      'star/M-III': { label: 'M-Type Giant (red)' },
      'star/O-I': { label: 'O-Type Supergiant' },
      'star/B-I': { label: 'B-Type Supergiant (Rigel)' },
      'star/A-I': { label: 'A-Type Supergiant (Deneb)' },
      'star/F-I': { label: 'F-Type Supergiant (Polaris)' },
      'star/G-I': { label: 'G-Type Supergiant' },
      'star/K-I': { label: 'K-Type Supergiant' },
      'star/M-I': { label: 'M-Type Supergiant (Betelgeuse)' },
      'star/L': { label: 'L-Type (Brown Dwarf)', rot: [5, 50] },
      'star/T': { label: 'T-Type (Methane Dwarf)', rot: [5, 50] },
      'star/Y': { label: 'Y-Type (Sub-Brown Dwarf)', rot: [5, 50] },
      'star/WD': { label: 'White Dwarf (WD)', rot: [0.1, 10] },
      'star/NS': { label: 'Neutron Star (NS)', rot: [0.001, 1] },
      'star/magnetar': { label: 'Magnetar', rot: [0.001, 1] },
      'star/BH': { label: 'Black Hole (BH)', rot: [0.001, 1] },
      'star/BH_active': { label: 'Active Black Hole (Accretion)', rot: [0.001, 1] }
  };

  type SpectralEntry = { label: string, ranges: { mass: [number, number], radius: [number, number], temp: [number, number], rad: [number, number], mag: [number, number], rot?: [number, number] } };

  // Pack band -> the shape this tab draws with. A pack whose bands are named differently still
  // appears: anything `star/*` the presentation map has not captioned falls back to its own key.
  const SPECTRAL_DATA: Record<string, SpectralEntry> = $derived.by(() => {
      const templates = (rulePack?.statTemplates ?? {}) as Record<string, any>;
      const keys = Object.keys(STAR_PRESENTATION).filter((k) => templates[k])
          .concat(Object.keys(templates).filter((k) => k.startsWith('star/') && k !== 'star/default' && !STAR_PRESENTATION[k]));
      const out: Record<string, SpectralEntry> = {};
      for (const key of keys) {
          const t = templates[key];
          out[key] = {
              label: STAR_PRESENTATION[key]?.label ?? key.split('/')[1],
              ranges: {
                  mass: t.mass_solar, radius: t.radius_solar, temp: t.temp_k,
                  rad: t.radiation_output ?? [0, 0], mag: t.mag_gauss ?? [0, 0],
                  rot: STAR_PRESENTATION[key]?.rot
              }
          };
      }
      return out;
  });

  const spectralTypes = $derived(Object.keys(SPECTRAL_DATA));

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
      return boundPos(radSoft, val) * 100;
  }

  function getTempLogPos(val: number) {
      return boundPos(tempSoft, val) * 100;
  }

  // --- Derived Ranges ---
  let currentClass = $state('star/G');

  // THE DROPDOWN'S VALUE IS A BAND, AND A BODY NOW HOLDS A DESIGNATION, so the held key is mapped
  // back to the range it came from: `star/G2V` selects "G-Type (Yellow Dwarf)". That mapping is the
  // designation's own letter and luminosity class — no table, and it inverts `starClassKeyFor`.
  $effect(() => {
      if (body?.classes?.[0]) {
          currentClass = bandKeyOf(body.classes[0]);
      }
  });

  function getRangePct(prop: 'mass' | 'radius' | 'temp' | 'rad' | 'mag' | 'rot', type: 'start' | 'width') {
      const data = SPECTRAL_DATA[currentClass] || SPECTRAL_DATA['star/G'];
      const range = data?.ranges[prop];
      // A band the pack states as zero is a real statement, not a gap — a quiescent black hole has
      // no temperature and no field — and log(0) would poison the bar's geometry. Draw nothing.
      const soft = prop === 'mass' ? massSoft
          : prop === 'radius' ? radiusSoft
          : prop === 'temp' ? tempSoft
          : prop === 'rad' ? radSoft
          : prop === 'mag' ? magSoft
          : STAR_BOUNDS.rot.soft;
      // ONE AXIS FOR BOTH HALVES (A85): the band reads the same `log` flag the slider is built
      // from, so a future retune cannot part them again the way it had for rotation.
      const pct = bandPct(soft, range, STAR_BOUNDS[prop === 'rad' ? 'radiation' : prop === 'rot' ? 'rot' : prop].log);
      if (!pct) return 0;
      if (type === 'start') return pct.start;
      return pct.width;
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

  // Bolometric luminosity, through the ONE Stefan-Boltzmann ([[B110]]). This was written out here
  // with a bare 5778 while `syncRadiationFromSB` below already called the shared function - the same
  // quantity computed twice in one component.
  let luminosity = $derived(luminositySolarFromRT(radiusSuns * SOLAR_RADIUS_KM, tempK));

  // The four classes whose output is NOT their own surface: an accretion disc or a magnetosphere.
  // Same list `syncRadiationFromSB` returns early on — one spelling, checked in one place.

  let isNonThermal = $derived(['star/BH', 'star/BH_active', 'star/NS', 'star/magnetar'].includes(currentClass));

  // IONISING OUTPUT, AND THE GAUGE THAT SHOWS IT. All derived — there is no control here, only the
  // magnetic-field slider below, which is what actually moves any of it.
  let ionisingSolar = $derived(ionisingFromField({
      fieldGauss: magGauss, radiusSolar: radiusSuns, massSolar: massSuns,
      tempK, luminositySolar: radiation || 0
  }));
  // At the ceiling? Then the field slider's remaining travel does nothing, and saying so is the
  // difference between "physically capped" and "apparently broken".
  let satField = $derived(saturationFieldGauss({
      radiusSolar: radiusSuns, massSolar: massSuns, tempK, luminositySolar: radiation || 0
  }));
  let isSaturated = $derived(!!satField && magGauss >= satField);
  /** The saturation field as a position on the magnetic slider's own log axis. */
  let satFieldPct = $derived.by(() => {
      if (!(satField! > 0)) return null;
      const p = boundPos(magSoft, satField!);
      return p > 0.02 && p < 0.98 ? p * 100 : null;
  });
  function fmtField(g: number | undefined): string {
      if (!(g! > 0)) return '';
      return g! > 10000 ? `${g!.toExponential(1)} G` : `${Math.round(g!).toLocaleString()} G`;
  }
  let pastCoronalLine = $derived(!isNonThermal && !hasHotCorona(massSuns, radiusSuns, tempK));

  /** Solar multiples, readable at any magnitude: a Sun-like 1.6, a wound-up giant 4.9e+5. */
  function fmtIonising(x: number): string {
      if (!(x > 0)) return '0';
      if (x < 10) return x.toPrecision(2);
      if (x < 1e4) return Math.round(x).toLocaleString();
      return x.toExponential(1);
  }

  // WHERE THE MARKER SITS, and the two bands behind it. Both follow the star's own state, so the
  // gauge tracks the field slider without being one: there is nothing here a GM can grab.
  let derivedActivity = $derived((body as any)?.flareActivity ?? undefined);
  let ionisingPos = $derived(
      100 * activityForFraction(((ionisingSolar || 0) * IONISING_FRACTION_QUIET) / (radiation || 1))
  );
  let ionisingRanges = $derived.by(() => {
      const bands = ionisingBands(radiation || 0, derivedActivity);
      if (!bands) return null;
      const pos = (out: number) => 100 * activityForFraction((out * IONISING_FRACTION_QUIET) / (radiation || 1));
      const tx = pos(bands.typical[0]), tw = Math.max(1.5, pos(bands.typical[1]) - tx);
      const fx = pos(bands.flaring[0]), fw = Math.max(1.5, pos(bands.flaring[1]) - fx);
      return { typicalX: tx, typicalW: tw, flaringX: fx, flaringW: fw };
  });

  // For a THERMAL emitter (any real star — incl. white dwarfs / red giants, but NOT accretion- or
  // non-thermal remnants), the radiated output IS that bolometric luminosity. So when the user edits
  // temperature or radius we recompute radiationOutput from Stefan-Boltzmann instead of leaving it
  // locked — fixing the old "change T, luminosity barely moves" behaviour. BH/NS/magnetar keep their
  // independent (accretion/magnetospheric) radiation slider.
  function syncRadiationFromSB() {
      if (['star/BH', 'star/BH_active', 'star/NS', 'star/magnetar'].includes(currentClass)) return;
      // The SHARED Stefan-Boltzmann, not a second copy of it. This and the brown-dwarf cooling track
      // hand over to each other at the fusion limit, so if they disagreed about how bright a given
      // radius and temperature are, igniting a body would change its brightness for no reason.
      const L = luminositySolarFromRT(radiusSuns * SOLAR_RADIUS_KM, tempK);
      radiation = parseFloat(L.toPrecision(3));
      body.radiationOutput = radiation;
      radSliderPos = boundPos(radSoft, L);
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
      // ...and after an UNDO, which is the other time the model legitimately changes underneath the
      // panel rather than because of it (G28). Without this the fields keep the pre-undo numbers
      // until you select another body and come back.
      if (body.id === lastSyncedBodyId && $undoEpoch === lastSyncedUndoEpoch) return;
      lastSyncedBodyId = body.id;
      lastSyncedUndoEpoch = $undoEpoch;

      if (body.massKg) {
          const m = body.massKg / SOLAR_MASS_KG;
          massSuns = m;
          // Seeded from the DATA, not from a remembered switch (see the note beside `massSoft`).
          // Read off the body's own class rather than `currentClass`, which a separate effect
          // writes - this must not depend on which effect ran first.
          supermassive = String(body.classes?.[0] ?? '').startsWith('star/BH')
              && m > STAR_BOUNDS.mass.soft[1];
          massSliderPos = boundPos(massSoftRange(supermassive), m);
      }
      if (body.radiusKm) {
          const r = body.radiusKm / SOLAR_RADIUS_KM;
          radiusSuns = r;
          radiusSliderPos = boundPos(radiusSoft, r);
      }
      if (body.temperatureK !== undefined) {
          tempK = body.temperatureK;
          tempSliderPos = boundPos(tempSoft, body.temperatureK);
      }
      if (body.radiationOutput !== undefined) {
          radiation = body.radiationOutput;
          radSliderPos = boundPos(radSoft, body.radiationOutput);
      }
      rotationHours = body.rotation_period_hours ?? undefined;
      rotSliderPos = rotationHours === undefined ? 0.5 : boundPos(STAR_BOUNDS.rot.soft, rotationHours);
      axialTilt = body.axial_tilt_deg ?? undefined;
      if (body.magneticField?.strengthGauss !== undefined) {
          magGauss = body.magneticField.strengthGauss;
          magSliderPos = boundPos(magSoft, magGauss);
      }
      // Black-hole accretion slider — seed from the stored Eddington fraction (active class ⇒ a default).
      accF = (body as any).accretionEddington ?? ((body.classes?.[0] === 'star/BH_active') ? 0.5 : 0);
      // Seed the activity lever from what the star ACTUALLY has — the GM's pin if there is one, else
      // the value the processor derived. Starting it at zero would make the slider lie about a quiet
      // star and make its first nudge look like a huge change.
      accSliderPos = posFromF(accF);
  });

  // --- Updates ---
  /** Flip the travel. Re-seats the THUMB from the mass; never the mass from the thumb. */
  function toggleSupermassive() {
      supermassive = !supermassive;
      massSliderPos = boundPos(massSoftRange(supermassive), massSuns);
  }

  function updateMass() {
      const val = boundValue(massSoft, massSliderPos);
      massSuns = parseFloat(val.toPrecision(3));
      body.massKg = massSuns * SOLAR_MASS_KG;
      if (isBH) applySchwarzschild(); // event horizon is mass-driven
      dispatch('update');
  }

  function handleMassNumberInput() {
      body.massKg = massSuns * SOLAR_MASS_KG;
      // THE SWITCH FOLLOWS THE NUMBER, exactly as it does on load. Type 4e6 M☉ into a hole and
      // the scale it needs is already there; without this the thumb pins to the top of a stellar
      // track and the slider is dead until the GM finds the switch themselves. It steers - the
      // typed value is never touched, in either direction.
      if (isBH && massSuns > STAR_BOUNDS.mass.soft[1]) supermassive = true;
      massSliderPos = boundPos(massSoftRange(supermassive), massSuns);
      if (isBH) applySchwarzschild();
      dispatch('update');
  }

  function updateRadius() {
      const val = boundValue(radiusSoft, radiusSliderPos);
      radiusSuns = parseFloat(val.toPrecision(3));
      body.radiusKm = radiusSuns * SOLAR_RADIUS_KM;
      syncRadiationFromSB();
      dispatch('update');
  }

  function handleRadiusInput() {
      body.radiusKm = radiusSuns * SOLAR_RADIUS_KM;
      radiusSliderPos = boundPos(radiusSoft, radiusSuns);
      syncRadiationFromSB();
      dispatch('update');
  }

  function updateTemp() {
      const val = boundValue(tempSoft, tempSliderPos);
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
      tempSliderPos = boundPos(tempSoft, tempK);
      updateClassFromTemp(tempK);
      syncRadiationFromSB();
      dispatch('update');
  }

  function updateClassFromTemp(k: number) {
      // Temperature re-derives the class ONLY for a star that is on the main sequence, because that
      // is the only place where temperature alone determines the band. Anything that states more
      // than a letter — a giant, a supergiant, a red giant, a remnant — keeps what it was given: an
      // M supergiant and an M dwarf sit at the same temperature and differ in everything else, so
      // re-deriving would silently demote a supergiant the moment a GM nudged the slider (D19,
      // reappearing inside the editor). Previously a fixed list of six; now anything that is not a
      // bare letter band, so a pack's own extra classes are covered too.
      // Anything that states MORE than a main-sequence position keeps what it was given. Reads the
      // class key rather than testing for a bare letter, so `star/G2V` — what a pick now writes —
      // counts as main sequence exactly as `star/G` did.
      const currentClassInBody = body.classes?.[0] || '';
      const heldParts = starClassParts(currentClassInBody);
      if (currentClassInBody && (!heldParts.letter || (heldParts.band && heldParts.band !== 'V'))) return;

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
      
      const newKey = starClassKeyFor({ letter: newClass.split('/')[1], tempK: k, band: 'V' }, rulePack);
      if (body.classes[0] !== newKey) {
          const prefixes = Object.keys(SPECTRAL_DATA);
          const others = body.classes.filter((c: string) => !prefixes.includes(c) && !isDesignationKey(c));
          body.classes = [newKey, ...others];
          // Keep the structured classification in step, or the body says one thing in its class and
          // another in its type. The SUBCLASS is RE-DERIVED rather than dropped: it is relative to the
          // letter, so the 5.5 of M5.5V means nothing once the star is a K — but the new temperature
          // states a new digit, and dropping it published less than the engine knows (inbox B60). The
          // luminosity class is kept, since the GM moved the temperature and not the size class.
          const { luminosity, band } = body.stellarType ?? {};
          const letter = newClass.split('/')[1];
          const sub = spectralSubclass(letter, k, rulePack, band);
          body.stellarType = {
              spectral: letter,
              ...(sub != null ? { subclass: Math.round(sub) } : {}),
              ...(luminosity ? { luminosity, band } : {})
          };
          currentClass = newClass;   // the BAND, for the dropdown; the body holds the designation
          updateImage(newClass);
      }
  }

  function updateRadiation() {
      const val = boundValue(radSoft, radSliderPos);
      radiation = parseFloat(val.toPrecision(3));
      body.radiationOutput = radiation;
      dispatch('update');
  }

  function handleRadiationInput() {
      body.radiationOutput = radiation;
      radSliderPos = boundPos(radSoft, radiation);
      dispatch('update');
  }

  // Clearing the box removes the field rather than writing 0 — an empty box means "we do not know",
  // and that has to survive the round trip or the honest state is unreachable once you leave it.
  function updateRotation() {
      if (typeof rotationHours === 'number' && Number.isFinite(rotationHours)) {
          body.rotation_period_hours = rotationHours;
          rotSliderPos = boundPos(STAR_BOUNDS.rot.soft, rotationHours);
      } else {
          delete body.rotation_period_hours;
      }
      dispatch('update');
  }

  /** The thumb, on the same log track the green band is painted on (A85). */
  function updateRotationSlider() {
      rotationHours = parseFloat(boundValue(STAR_BOUNDS.rot.soft, rotSliderPos).toPrecision(3));
      updateRotation();
  }

  function updateTilt() {
      if (typeof axialTilt === 'number' && Number.isFinite(axialTilt)) body.axial_tilt_deg = axialTilt;
      else delete body.axial_tilt_deg;
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
      const val = boundValue(magSoft, magSliderPos);
      magGauss = parseFloat(val.toPrecision(3));
      body.magneticField = { strengthGauss: magGauss };
      reclassifyForMagnetism();
      dispatch('update');
  }

  function handleMagInput() {
      body.magneticField = { strengthGauss: magGauss };
      magSliderPos = boundPos(magSoft, magGauss);
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
      radiusSliderPos = boundPos(radiusSoft, radiusSuns);
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
      const others = body.classes.filter((c: string) => !Object.keys(SPECTRAL_DATA).includes(c) && !isDesignationKey(c));
      body.classes = [cls, ...others];
      updateImage(cls);
      accSliderPos = posFromF(f);
      tempSliderPos = boundPos(tempSoft, tempK);
      magSliderPos = boundPos(magSoft, magGauss);
      radSliderPos = boundPos(radSoft, radiation);
      dispatch('update');
  }
  // Picking a BH from the dropdown seeds a state: keep its current infall, else default quiescent.
  function applyBHPresets(target: string) {
      const seed = target === 'star/BH_active' ? Math.max((body as any).accretionEddington ?? 0.5, QUIESCENT_F) : ((body as any).accretionEddington ?? 0);
      applyAccretion(seed);
  }

  // (`stellarTypeForBand` lived here and now lives in `physics/starDesignation`, because generation
  //  needs the same answer: a star built by the wizard used to carry no structured classification at
  //  all, so only an IMPORTED star had one. Two doors, one map — inbox B60.)

  function updateImage(starClass: string) {
      // G20 - A GM-UPLOADED PICTURE OUTRANKS THE CLASS PORTRAIT, AND THIS IS THE ONE WRITER THAT
      // REPEATS. Called from the sync $effect above, which re-runs on EVERY pass by design; without
      // this line a custom star image would be overwritten before the GM let go of the mouse. The
      // other three writers of `starImages` (generation/star.ts, generateFromConfig.ts, the realsky
      // importer) all write at CREATION, so they cannot stomp an image that does not exist yet.
      // SystemProcessor already exempts stars from type images and already honours `custom`.
      if ((body.image as any)?.custom) return;
      // G21 - the lookup itself lives in `system/starImage.ts` and is shared with both generators.
      // This copy only fell back to the letter for a HYPHENATED band, so a subtype like `star/G5V`
      // matched nothing and the editor set no portrait at all, while the generator resolved the same
      // key to `star/G`: two doors, two answers. Leaving an existing image alone on a miss is this
      // caller's own rule and stays here - the generators clear it instead.
      const url = resolveStarImage(rulePack, starClass);
      if (url) {
          if (!body.image) body.image = { url: '' };
          body.image.url = url;
      }
  }

  // G20 - REMOVE MUST HAND THE PICTURE BACK IMMEDIATELY, not at the next render. The guard above makes
  // `updateImage` a no-op while a custom picture is set, so calling it here is idempotent on upload and
  // is exactly what repopulates the class portrait on remove. Leaving it to the sync $effect looked
  // right in a unit test and was WRONG in the app: the effect re-runs on a render, and with the clock
  // paused nothing re-renders - the GM pressed Remove and got a blank where the portrait should be.
  function onPictureChange() {
      const currentClassStr = body.classes?.[0];
      if (currentClassStr) updateImage(currentClassStr);
      dispatch('update');
  }

  function updateSpectralType(e: Event) {
      const val = (e.target as HTMLSelectElement).value;
      currentClass = val;
      if (!body.classes) body.classes = [];
      const prefixes = Object.keys(SPECTRAL_DATA);
      const others = body.classes.filter((c: string) => !prefixes.includes(c) && !isDesignationKey(c));
      updateImage(val);

      // A SEEDED DRAW ACROSS THE BAND, NOT ITS MIDPOINT (owner, 2026-08-16: "always seeded draw").
      // The midpoint made every G dwarf a GM placed numerically identical to every other one — the
      // artefact, not the variety — and it disagreed with generation, which has always drawn.
      // `starStatsFromPack` is that one draw, so the two paths cannot answer differently (inbox B61).
      //
      // THE SEED IS THE BODY ID PLUS THE CHOSEN CLASS, and both halves matter. The body id makes the
      // draw stable: this is an EDITOR, and a positional or time-based seed would reroll the star
      // every time the panel re-rendered, under the GM's hands. The class makes the draws
      // INDEPENDENT between classes — seeding on the id alone would land every band at the same
      // fraction of its width, so a star switched from G to K would land at the same relative point
      // each time rather than being a fresh K. Its own stream, never the system's (DATA-G1).
      const drawn = starStatsFromPack(rulePack, val, new SeededRNG(`${body.id}|starpick|${val}`));
      if (drawn) {
          const newMass = drawn.massSolar;
          const newRadius = drawn.radiusSolar;
          const newTemp = drawn.tempK;

          massSuns = newMass;
          massSliderPos = boundPos(massSoft, newMass);
          body.massKg = massSuns * SOLAR_MASS_KG;

          radiusSuns = newRadius;
          radiusSliderPos = boundPos(radiusSoft, newRadius);
          body.radiusKm = radiusSuns * SOLAR_RADIUS_KM;

          tempK = Math.round(newTemp);
          tempSliderPos = boundPos(tempSoft, tempK);
          body.temperatureK = tempK;
      }
      // PICKING IS THE FORWARD DIRECTION and it must leave the same structured classification an
      // IMPORT would (owner, 2026-08-14). Without this, a GM-built supergiant is a supergiant only by
      // its class string, and the inverse — parameters back to a designation — has nothing to read.
      // IT NOW STATES A SUBCLASS TOO, and it can only do so because the pick DRAWS a temperature: a
      // midpoint stood for the whole band and implied no particular digit, but a drawn 5,772 K G star
      // is a G2 and saying so is stating what the draw already decided (inbox B60). Runs AFTER the
      // draw for exactly that reason.
      body.stellarType = stellarTypeForBand(val, body.temperatureK, rulePack);
      // A PICK IS A BAND; WHAT THE STAR ENDS UP BEING IS A DESIGNATION (owner, 2026-08-16: "O is
      // dead, O1a is valid"). The dropdown offers the pack's ranges — "make this a G dwarf" — and the
      // body records what the draw produced, `star/G2V`. A giant keeps its band key, because the
      // subclass ladder is main-sequence and `star/K-III` already states everything we can say.
      const bandParts = starClassParts(val);
      const designation = bandParts.letter
          ? starClassKeyFor({ letter: bandParts.letter, tempK: body.temperatureK ?? 0, band: bandParts.band }, rulePack)
          : val;   // remnants keep their own key
      body.classes = [designation, ...others];
      // Picking a black hole from the dropdown applies the per-state presets too (event horizon
      // from mass, no-hair zero field for quiescent / disc values for feeding).
      if (val === 'star/BH' || val === 'star/BH_active') applyBHPresets(val);
      // RE-ROLL THE LUMINOSITY FOR THE NEW CLASS (owner, 2026-08-15: it "SHOULD reroll on selection
      // of a star class to show accurate data on a new selection"). Picking a band applies its mass,
      // radius and temperature and used to leave `radiationOutput` at the PREVIOUS class's value —
      // so a Sun switched to B kept 1 Lsun beside a 4.2 Rsun / 20,000 K body, which the physics
      // plausibility pass then correctly reported as `luminosity-mismatch`. `syncRadiationFromSB`
      // already computes it and returns early for the non-thermal remnants; it simply was not called
      // from here.
      syncRadiationFromSB();
      dispatch('update');
  }

</script>

<div class="tab-panel">
    <!-- CLASSIFICATION -->
    <div class="form-group">
        <label>Spectral Type</label>
        <div style="display: flex; gap: 10px;">
            <!-- BOUND TO `currentClass`, NOT `body.classes[0]`. Dragging the temperature slider DOES
                 re-derive the class - temperature to spectral letter is a direct lookup - but it does
                 so by MUTATING `body.classes`, which nothing in this template tracks, so the dropdown
                 never moved and the change looked like it had not happened. `currentClass` is $state
                 and is already kept in step by every path that changes the class. -->
            <!-- BIND, not `value=`. A plain `value={...}` on a <select> whose options come from an
                 {#each} is NOT kept in step by Svelte - measured: dragging the temperature set
                 body.classes to star/Y and the dropdown still read star/G. Temperature to spectral
                 letter is a direct lookup and the class was being re-derived correctly all along;
                 only the control failed to show it. `bind:value` makes the select track the state. -->
            <select bind:value={currentClass} on:change={updateSpectralType}
                    title={classExplanation?.text ?? ''}>
                {#each spectralTypes as type}
                    <option value={type} title={explainStarClass(rulePack, type)?.text ?? ''}>{pickerLabel(rulePack, type) ?? SPECTRAL_DATA[type].label}</option>
                {/each}
            </select>
            <div class="color-preview" style="{starStyle}"></div>
        </div>
        <!-- Owner, 2026-08-15: explain the designation in simple terms. Derived from the pack's own
             radius band rather than authored prose, so it cannot drift from the physics. -->
        {#if classExplanation}
            <div class="class-explain">
                <strong>{classExplanation.kind}</strong>{#if classExplanation.colour}, {classExplanation.colour} to human eyes{/if}{#if classExplanation.size}, {classExplanation.size}{/if}
            </div>
        {/if}
        <!-- G54: what an OBSERVER measures. Shown only when the three readings actually disagree —
             an ordinary star has nothing to say here and a row saying "nothing in the way" on every
             star in the map would be noise. -->
        {#if observed?.explanation.disagrees}
            <div class="observed-explain">
                <div class="obs-head" title="A star's designation is what its SPECTRUM says. These are what the other measurements say, and the three disagreeing is the point.">Measured from outside</div>
                <div class="obs-row"><span class="obs-what">Spectroscopy</span><span>{observed.explanation.spectroscopy}</span></div>
                <div class="obs-row"><span class="obs-what">Photometry</span><span>{observed.explanation.photometry}</span></div>
                {#if observed.explanation.infrared}
                    <div class="obs-row"><span class="obs-what">Infrared</span><span>{observed.explanation.infrared}</span></div>
                {/if}
                {#if observed.explanation.cause}
                    <div class="obs-cause">Because of: {observed.explanation.cause}</div>
                {/if}
                {#if observed.unresolved.length}
                    <div class="obs-cause">Not counted here: {observed.unresolved.join(', ')} — a ring only dims observers near its own plane, and this panel has no viewpoint. The starmap answers it per system.</div>
                {/if}
            </div>
        {:else if observed?.unresolved.length}
            <div class="observed-explain">
                <div class="obs-cause">{observed.unresolved.join(', ')} stands around this star, but a ring only dims observers near its own plane — and this panel has no viewpoint. The starmap answers it per system.</div>
            </div>
        {/if}
        <!-- WHY A STAR HAS NO "auto-classify" CHECKBOX WHERE A PLANET DOES, said out loud (owner,
             2026-08-16). The opposite default on two body kinds is deliberate and reads as a bug
             unless the UI explains it: a planet's type is a judgement about parameters the GM
             authored, so it stays pinned; a star's designation is a READOUT of where it sits on the
             HR diagram, so it follows the numbers. Moving the temperature slider re-letters it in
             front of you, which is the same statement made by the control rather than in prose. -->
        {#if designationNow}
            <div class="designation-line" title="A star's designation is a readout of its physics, not a label attached to it — change the temperature or the radius and it changes. That is the opposite of a planet, whose type you pin and the engine leaves alone.">
                Currently <strong>{designationNow}</strong> — read from its temperature and radius, and it follows them.
            </div>
        {/if}
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

    <!-- PICTURE (G20). Sits directly under the spectral picker because the class is what supplies the
         default portrait, so "replace it" reads next to the thing being replaced - the same place the
         planet's block sits, under Type / Image. Removing the upload lets updateImage() resume and the
         class portrait comes back. -->
    <div class="form-group">
        <label>Picture</label>
        <CustomImageBlock
            target={body}
            onUpdate={onPictureChange}
            addLabel="Upload custom image…"
            replaceLabel="Replace image…"
            removeLabel="Remove (use class image)"
            alt="Custom image for {body.name}" />
        <span class="sub-label">Overrides the spectral-class portrait until you remove it.</span>
    </div>

    <hr/>

    <!-- MASS -->
    <div class="form-group">
        <div class="label-row">
            <label>Mass</label>
            <UnitInput quantity="mass" bodyType="star" value={massSuns * SOLAR_MASS_KG}
                on:commit={(e) => { massSuns = e.detail / SOLAR_MASS_KG; handleMassNumberInput(); }} />
        </div>
        <div class="slider-container">
            <svg class="slider-svg" width="100%" height="30">
                <rect x="{getRangePct('mass', 'start')}%" y="0" width="{getRangePct('mass', 'width')}%" height="8" fill="#22aa44" />
            </svg>
            <input type="range" min="0" max="1" step="0.001" bind:value={massSliderPos} on:input={updateMass} class="full-width-slider overlay" />
        </div>
        {#if isBH}
            <label class="sm-toggle">
                <input type="checkbox" checked={supermassive} on:change={toggleSupermassive} />
                Supermassive scale
                <span class="sub-label">— up to {SUPERMASSIVE_MASS[1].toExponential(1)} M☉, the theoretical limit</span>
            </label>
        {/if}
        {#if massSuns > SUPERMASSIVE_AMBER_ABOVE}
            <!-- AN EDGE, NOT A WALL. The figure is kept exactly as typed; this only says what is
                 remarkable about it. Steer, do not stop - alien engineering and plot devices are
                 legitimate reasons and the engine cannot tell one from a typo. -->
            <p class="mass-amber" role="status">{SUPERMASSIVE_AMBER_NOTE}</p>
        {/if}
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
            <UnitValue quantity="radius" bodyType="star" value={body.radiusKm || 0} decimals={(body.radiusKm || 0) > 1000 ? undefined : 1} />
            {#if isBH}— Schwarzschild radius, driven by mass (r = 2GM/c²){/if}
        </div>
    </div>

    <hr/>

    <!-- TEMPERATURE -->
    <div class="form-group">
        <div class="label-row">
            <label for="temp">Effective Temperature</label>
            <UnitInput quantity="temperature" bodyType="star" id="temp" value={tempK}
                on:commit={(e) => { tempK = e.detail; handleTempInput(); }} />
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

    <!-- ONE BLOCK, THREE ROWS, READ TOP-DOWN AS CAUSE AND EFFECT (owner, 2026-08-16): "the mag field
         should be UP under the Ionising output - and tied into a threesome in the UI to infer their
         relationship. I guess we don't need an actual lock and slider on Ionising Output as Magnetic
         field directly drives it now?"
         Correct, and the lock and the ionising slider are GONE. They were a second control for a
         quantity the field already determines - two ways to say one thing, which is the duplication
         this codebase keeps paying for. What is left is honest: two DERIVED readouts and the one
         INPUT that moves them.
             Luminosity      <- radius and temperature
             Ionising output <- magnetic flux (field x area), capped at saturation
             Magnetic field  <- the slider; the only thing here a GM sets -->
    <div class="form-group triad">
        <div class="label-row">
            <label>Luminosity</label>
            {#if isNonThermal}
                <input type="number" step="any" bind:value={radiation} on:change={handleRadiationInput} />
            {:else}
                <span class="derived-readout" title="Computed from radius and temperature — edit those to change it.">{radiation.toPrecision(3)} L&#9737;</span>
            {/if}
        </div>
        <div class="sub-label">
            {#if isNonThermal}
                Accretion- or magnetosphere-driven, so it is yours to set.
            {:else}
                Derived from radius and temperature.
            {/if}
        </div>

        <div class="label-row triad-row">
            <label>Ionising output</label>
            <span class="derived-readout">{fmtIonising(ionisingSolar)}&times; Sun</span>
        </div>
        <!-- A GAUGE, NEVER A CONTROL (owner, 2026-08-16): "seeing the slider move from typical to
             flaring is great - keep the visual - just never interactive." So the bands and the marker
             stay and the input does not: drag the FIELD below and the marker walks from the typical
             band into the flaring one, which is the relationship made visible rather than described. -->
        <div class="slider-container gauge">
            <svg class="slider-svg" width="100%" height="30">
                {#if ionisingRanges}
                    <rect x="{ionisingRanges.typicalX}%" y="0" width="{ionisingRanges.typicalW}%" height="8" fill="#22aa44" />
                    <rect x="{ionisingRanges.flaringX}%" y="0" width="{ionisingRanges.flaringW}%" height="8" fill="#e0a24a" />
                    <text x="{ionisingRanges.typicalX}%" y="26" class="rad-label">typical</text>
                    <text x="{ionisingRanges.flaringX}%" y="26" class="rad-label">flaring</text>
                {/if}
                <line x1="{ionisingPos}%" y1="-2" x2="{ionisingPos}%" y2="12" stroke="var(--text)" stroke-width="2" />
            </svg>
        </div>
        <div class="sub-label">
            {#if isSaturated}
                <strong>Saturated.</strong> Past about {fmtField(satField)} the dynamo stops responding
                and output stops climbing &mdash; more field buys nothing. A real ceiling, at a thousandth
                of the star's own brightness.
            {:else if pastCoronalLine}
                Cool and swollen &mdash; past the coronal dividing line, so it holds no hot corona and
                irradiates far less than its size suggests.
            {:else}
                Derived from the magnetic field below &mdash; field strength across the star's surface.
            {/if}
        </div>

        <div class="label-row triad-row">
            <label>Magnetic field (Gauss)</label>
            <input type="number" step="any" bind:value={magGauss} disabled={currentClass === 'star/BH'} on:input={handleMagInput} />
        </div>
        <div class="slider-container">
            <svg class="slider-svg" width="100%" height="30">
                <rect x="{getRangePct('mag', 'start')}%" y="0" width="{getRangePct('mag', 'width')}%" height="8" fill="#22aa44" />
                <!-- Where more field stops doing anything. Everything to its right is real field and
                     no extra radiation, which is worth SHOWING rather than leaving to be discovered. -->
                {#if satFieldPct != null}
                    <line x1="{satFieldPct}%" y1="0" x2="{satFieldPct}%" y2="12" stroke="#e0a24a" stroke-width="2" />
                    <text x="{Math.min(88, satFieldPct + 1)}%" y="26" class="rad-label">saturated</text>
                {/if}
            </svg>
            <input type="range" min="0" max="1" step="0.001" bind:value={magSliderPos} disabled={currentClass === 'star/BH'} on:input={updateMagSlider} class="full-width-slider overlay" />
        </div>
        <div class="sub-label">
            {#if currentClass === 'star/BH'}
                0 G &mdash; an isolated black hole keeps no magnetic field (no-hair theorem); feed it to anchor a disc field
            {:else if magGauss > 10000}
                {magGauss.toExponential(2)} G &mdash; drives the ionising output above
            {:else}
                {Math.round(magGauss).toLocaleString()} G &mdash; drives the ionising output above
            {/if}
        </div>
    </div>

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
            <input type="range" min="0" max="1" step="0.001" bind:value={rotSliderPos} on:input={updateRotationSlider} class="full-width-slider overlay" />
        </div>
        {#if rotationHours === undefined}
            <div class="sub-label">Not set &mdash; nothing derives a star's spin yet, so this is a gap rather than a still star. Set it if you need one.</div>
        {/if}
    </div>

    <!-- AXIAL TILT. A star's spin axis is not automatically square to the orbits around it: the two
         start aligned out of the same disc, and it takes something violent to knock them apart. The
         Sun is 7 degrees out. Systems that migrated hard, or were passed close by another star, can
         end up wildly misaligned -- so a big number here IS a statement about the system's past. -->
    <div class="form-group">
        <div class="label-row">
            <label>Axial Tilt (degrees)</label>
            <input type="number" step="any" min="0" max="180" bind:value={axialTilt} on:input={updateTilt} />
        </div>
        <div class="slider-container">
            <input type="range" min="0" max="180" step="0.5" bind:value={axialTilt} on:input={updateTilt} class="full-width-slider" />
        </div>
        <div class="sub-label">
            {#if axialTilt === undefined}
                Not set &mdash; unknown, rather than square to its planets
            {:else if axialTilt < 12}
                Aligned with its planets, as a star formed from the same disc should be (the Sun: 7&deg;)
            {:else if axialTilt < 45}
                Noticeably tilted &mdash; something stirred this system
            {:else if axialTilt < 120}
                Severely misaligned &mdash; a violent history: hard migration, or a close pass by another star
            {:else}
                Retrograde &mdash; spinning against the orbits around it
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
  .designation-line { font-size: 0.78em; color: var(--text-faint); margin-top: 4px; }
  /* One bordered group, so the three read as related rather than as three separate settings. */
  .triad { border-left: 2px solid var(--border); padding-left: 8px; }
  .triad-row { margin-top: 6px; }
  /* Read-only: no pointer affordance, because there is nothing to grab. */
  .gauge { pointer-events: none; }
  .derived-readout { width: 100px; text-align: right; color: var(--text-muted); font-variant-numeric: tabular-nums; font-size: 0.95em; }
  .observed-explain { margin-top: 6px; padding: 6px 8px; border: 1px solid var(--border); border-radius: 4px; font-size: 0.78em; line-height: 1.45; }
  .obs-head { font-weight: 600; opacity: 0.85; margin-bottom: 3px; }
  .obs-row { display: flex; gap: 6px; }
  .obs-what { flex: 0 0 5.6em; opacity: 0.7; }
  .obs-cause { margin-top: 3px; opacity: 0.75; font-style: italic; }
  .class-explain { font-size: 0.78em; color: var(--text-muted); margin-top: 4px; line-height: 1.4; }
  
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
  /* A83: the supermassive switch and the amber edge beneath the mass slider. */
  .sm-toggle {
    display: flex;
    align-items: center;
    gap: 6px;
    flex-wrap: wrap;
    margin-top: 4px;
    font-size: 0.85em;
    cursor: pointer;
  }
  .sm-toggle input { margin: 0; }
  .sm-toggle .sub-label { margin: 0; }
  .mass-amber {
    margin: 6px 0 0;
    padding: 5px 8px;
    border-left: 3px solid var(--warning, #ffcc00);
    background: var(--bg-control, #1b1e26);
    color: var(--warning, #ffcc00);
    font-size: 0.8em;
    line-height: 1.35;
    border-radius: 0 var(--radius-sm, 4px) var(--radius-sm, 4px) 0;
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