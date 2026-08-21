<script lang="ts">
  // Gallery for The Guide's procedural PlanetDisc — a reference for how worlds are rendered from
  // their physics + tags (polar ice, gas-giant banding + spin-axis tilt, atmosphere glow, auroras,
  // rotational shape). Linked from Settings → System → Appearance. Uses synthetic example bodies.
  import PlanetDisc from '$lib/catalogue/PlanetDisc.svelte';
  import type { CelestialBody, RulePack, System } from '$lib/types';
  import { deriveApparentColorParts } from '$lib/rendering/apparentColor';
  import { onMount, tick } from 'svelte';
  import { fetchAndLoadRulePack } from '$lib/rulepack-loader';
  import { systemProcessor } from '$lib/core/SystemProcessor';
  import { decksFromTags, PRECIPITATION_TAG } from '$lib/physics/cloudDecks';
  import { GALLERY_STAR_TYPES, GALLERY_CRATERING, GALLERY_ICE_VS_ROCK, GALLERY_THOLIN_FROST,
    GALLERY_VOLCANISM, GALLERY_CRYO_PLUMES, GALLERY_HOT_EYEBALL, buildGiantLab,
    giantRecipeJson,
    GALLERY_COVERAGE, GALLERY_PIGMENTS, GALLERY_STACK, GALLERY_TECHNO } from '$lib/catalogue/galleryExamples';

  const mk = (over: Partial<CelestialBody> & { name: string }) => ({
    id: over.name, roleHint: 'planet', apparentColorHex: '#3a6ea5',
    temperatureK: 288, temperatureRangeK: { min: 240, max: 305 }, tags: [], ...over
  }) as unknown as CelestialBody;

  // Ammonia-giant palette (a base cloud + chromophore bands) vs a smooth ice-giant (one cloud stop).
  const ammonia = (b: string, c1: string, c2: string) => ([
    { hex: b, role: 'cloud', weight: 1 }, { hex: c1, role: 'cloud', weight: 0.6 }, { hex: c2, role: 'cloud', weight: 0.4 },
  ]);
  const iceGiant = (b: string) => ([{ hex: b, role: 'cloud', weight: 1 }]);

  const surface = [
    mk({ name: 'Temperate + polar ice', apparentColorHex: '#2f6ea5', tags: [{ key: 'climate/polar-ice', value: 'water' }] }),
    mk({ name: 'Polar ice, oblate', apparentColorHex: '#4a8ec5', oblateness: 0.32, tags: [{ key: 'climate/polar-ice', value: 'water' }] }),
    mk({ name: 'Polar ice, tidally locked', apparentColorHex: '#6aa0c0', tidallyLocked: true, tags: [{ key: 'climate/polar-ice', value: 'water' }] } as any),
    mk({ name: 'Dry world (no ice)', apparentColorHex: '#b08050', tags: [] }),
    mk({ name: 'Airless & cratered', apparentColorHex: '#9a9088', atmosphere: { pressure_bar: 0 } as any, tags: [{ key: 'geology/inactive' }, { key: 'science/impact-record' }] }),
    mk({ name: 'Lava world', apparentColorHex: '#7a2e1e', tags: [{ key: 'tidal/lava-flows' }] }),
  ];

  const atmospheres = [
    mk({ name: 'Wispy (0.05 bar)', apparentColorHex: '#b09070', atmosphere: { pressure_bar: 0.05 } as any }),
    mk({ name: 'Earth-like (1 bar) + ice', apparentColorHex: '#3a7ac0', atmosphere: { pressure_bar: 1 } as any, tags: [{ key: 'climate/polar-ice', value: 'water' }] }),
    mk({ name: 'Thick (Venus, 90 bar)', apparentColorHex: '#c9b070', atmosphere: { pressure_bar: 90 } as any }),
    mk({ name: 'None (airless)', apparentColorHex: '#9a9aa2', atmosphere: { pressure_bar: 0 } as any }),
  ];

  const litBody = mk({ name: 'lit', apparentColorHex: '#3a7ac0', atmosphere: { pressure_bar: 1 } as any });

  // The SAME Earth-like world under different spectral-class stars — starlight tints the ocean, clouds
  // and surface (water under a red dwarf is murky amber; under a blue star, cool and bright).
  const earthLike = {
    id: 'earth-star', roleHint: 'planet',
    makeup: { rock: 0.68, metal: 0.32 },
    hydrosphere: { coverage: 0.71, composition: 'water',
      layers: [{ location: 'surface', liquid: 'water' }, { location: 'cloud', liquid: 'water' }] },
    atmosphere: { pressure_bar: 1, composition: { N2: 0.78, O2: 0.21 } },
    equilibriumTempK: 288, temperatureK: 288,
    tags: [{ key: 'climate/polar-ice', value: 'water' }],
  };
  const starClasses = [
    { name: 'M dwarf · 3200 K', t: 3200 },
    { name: 'K star · 4500 K', t: 4500 },
    { name: 'G / Sun · 5800 K', t: 5800 },
    { name: 'A star · 9000 K', t: 9000 },
  ];
  // The G-star Earth on its own, for the layer-by-layer test row above the comparison.
  const earthDiagnostic = (() => {
    const ap = deriveApparentColorParts(earthLike as any, undefined, { starTempK: 5800 });
    return { ...JSON.parse(JSON.stringify(earthLike)), name: 'Earth · G / Sun', apparentColor: ap, apparentColorHex: ap.hex } as unknown as CelestialBody;
  })();

  // The known-good control: the water world from the oceans row. Same coverage, same derived palette
  // (surface #8c7157 at 1.0 + ocean #4579aa at 0.71) — so any difference is NOT the colour model.
  const waterControl = (() => {
    const base = {
      id: 'ocean-water', roleHint: 'planet', makeup: { rock: 0.68, metal: 0.32, ice: 0 },
      hydrosphere: { coverage: 0.71, composition: 'water', layers: [{ location: 'surface', liquid: 'water' }] },
      atmosphere: { pressure_bar: 2, composition: {} }, equilibriumTempK: 288, temperatureK: 288, tags: [],
    };
    const ap = deriveApparentColorParts(base as any, undefined, { starTempK: 5800 });
    return { ...JSON.parse(JSON.stringify(base)), name: 'Water control', apparentColor: ap, apparentColorHex: ap.hex } as unknown as CelestialBody;
  })();

  // Data bisection: the two things the Earth example carries that the control does not.
  const earthVariant = (id: string, mutate: (b: any) => void) => {
    const b: any = JSON.parse(JSON.stringify(earthLike));
    mutate(b);
    b.id = id;
    const ap = deriveApparentColorParts(b, undefined, { starTempK: 5800 });
    return { ...b, name: id, apparentColor: ap, apparentColorHex: ap.hex } as unknown as CelestialBody;
  };
  const earthNoCloudLayer = earthVariant('earth-no-cloud-layer',
    (b) => { b.hydrosphere.layers = b.hydrosphere.layers.filter((l: any) => l.location !== 'cloud'); });
  const earthNoPolarIce = earthVariant('earth-no-polar-ice', (b) => { b.tags = []; });

  const earthUnderStars = starClasses.map((s) => {
    const ap = deriveApparentColorParts(earthLike as any, undefined, { starTempK: s.t });
    return { ...JSON.parse(JSON.stringify(earthLike)), name: `Earth · ${s.name}`, apparentColor: ap, apparentColorHex: ap.hex } as unknown as CelestialBody;
  });

  // Oceans of DIFFERENT liquids — the same 71%-covered world for each solvent, its sea coloured by
  // the liquid's own absorption tint under a sun-like star (liquidApparentColor). Titan methane is
  // blue-grey, Io sulfur amber-gold, Venus sulfuric acid pale yellow, Europa brine steel-blue.
  const oceanLiquids = [
    { liquid: 'water', name: 'Water', teq: 288, rock: 0.68, metal: 0.32 },
    { liquid: 'salty-water', name: 'Brine', teq: 270, rock: 0.6, ice: 0.4 },
    { liquid: 'methane', name: 'Methane (Titan)', teq: 94, rock: 0.5, ice: 0.5 },
    { liquid: 'ethane', name: 'Ethane', teq: 100, rock: 0.5, ice: 0.5 },
    { liquid: 'ammonia', name: 'Ammonia', teq: 220, rock: 0.6, ice: 0.4 },
    { liquid: 'nitrogen', name: 'Nitrogen (Triton)', teq: 70, ice: 0.7, rock: 0.3 },
    { liquid: 'sulfuric-acid', name: 'Sulfuric acid (Venus)', teq: 330, rock: 0.7, metal: 0.3 },
    { liquid: 'sulfur', name: 'Sulfur (Io)', teq: 450, rock: 0.6, metal: 0.4 },
  ];
  const oceanWorlds = oceanLiquids.map((o) => {
    const base = {
      id: `ocean-${o.liquid}`, roleHint: 'planet',
      makeup: { rock: o.rock ?? 0, metal: o.metal ?? 0, ice: o.ice ?? 0 },
      hydrosphere: { coverage: 0.71, composition: o.liquid, layers: [{ location: 'surface', liquid: o.liquid }] },
      atmosphere: { pressure_bar: 2, composition: {} },
      equilibriumTempK: o.teq, temperatureK: o.teq, tags: [],
    };
    const ap = deriveApparentColorParts(base as any, undefined, { starTempK: 5800 });
    return { ...JSON.parse(JSON.stringify(base)), name: o.name, apparentColor: ap, apparentColorHex: ap.hex } as unknown as CelestialBody;
  });

  const shapes = [
    mk({ name: 'Oblate (fast spin)', apparentColorHex: '#c89868', oblateness: 0.4 }),
    mk({ name: 'Ellipsoid', apparentColorHex: '#b8916f', oblateness: 0.62 }),
    mk({ name: 'Near break-up', apparentColorHex: '#a89060', oblateness: 0.78 }),
    mk({ name: 'Toroid (flew apart)', apparentColorHex: '#c2a888', oblateness: 0.92 }),
  ];

  // Small bodies (composition redesign): sub-300km solids render as seeded irregular outlines —
  // lumpier when smaller/more porous — coloured by composition (C-type dark, S stony, M metallic,
  // comet icy). Same body id → same shape, every time.
  const smallBodies = [
    mk({ name: 'S-type asteroid · 8 km', apparentColorHex: '#a09078', radiusKm: 8, massKg: 5e14, makeup: { rock: 0.85, metal: 0.15 } as any, classes: ['asteroid/s-type'], atmosphere: { pressure_bar: 0 } as any }),
    mk({ name: 'C-type · 30 km', apparentColorHex: '#4a4640', radiusKm: 30, massKg: 3e16, makeup: { carbon: 0.5, rock: 0.5 } as any, classes: ['asteroid/c-type'], atmosphere: { pressure_bar: 0 } as any }),
    mk({ name: 'M-type · 100 km', apparentColorHex: '#8d8d96', radiusKm: 100, massKg: 2e19, makeup: { metal: 0.7, rock: 0.3 } as any, classes: ['asteroid/m-type'], atmosphere: { pressure_bar: 0 } as any }),
    mk({ name: 'Comet nucleus · 3 km (porous)', apparentColorHex: '#cfe0ea', radiusKm: 3, massKg: 1e13, makeup: { ice: 0.55, carbon: 0.25, rock: 0.2 } as any, classes: ['asteroid/comet'], atmosphere: { pressure_bar: 0 } as any }),
    mk({ name: 'Rubble pile · 0.5 km', apparentColorHex: '#93867a', radiusKm: 0.5, massKg: 7e10, makeup: { rock: 0.75, carbon: 0.15, metal: 0.1 } as any, classes: ['asteroid/s-type', 'asteroid/rubble-pile'], atmosphere: { pressure_bar: 0 } as any }),
    mk({ name: 'Round dwarf · 500 km (for contrast)', apparentColorHex: '#9a9088', radiusKm: 500, massKg: 5e20, atmosphere: { pressure_bar: 0 } as any, tags: [{ key: 'geology/inactive' }] }),
  ];

  const auroras = [
    mk({ name: 'O₂ + N₂ · green/purple (Earth)', apparentColorHex: '#2f6ea5', atmosphere: { pressure_bar: 1, composition: { N2: 0.78, O2: 0.21 } } as any, tags: [{ key: 'aurora/strong', value: '0.45' }, { key: 'climate/polar-ice', value: 'water' }] }),
    mk({ name: 'Nitrogen · purple · 40° tilt', apparentColorHex: '#37589a', axial_tilt_deg: 40, atmosphere: { pressure_bar: 1.5, composition: { N2: 0.98 } } as any, tags: [{ key: 'aurora/strong', value: '0.48' }] }),
    mk({ name: 'CO₂ · violet', apparentColorHex: '#9a6a5a', atmosphere: { pressure_bar: 2, composition: { CO2: 0.95, N2: 0.05 } } as any, tags: [{ key: 'aurora/strong', value: '0.4' }] }),
    mk({ name: 'O₂ + CO₂ · green/violet', apparentColorHex: '#5a8a6a', atmosphere: { pressure_bar: 1.5, composition: { CO2: 0.55, O2: 0.3, N2: 0.15 } } as any, tags: [{ key: 'aurora/strong', value: '0.45' }] }),
    mk({ name: 'N₂ + CH₄ · purple/blue', apparentColorHex: '#7a8a6a', atmosphere: { pressure_bar: 1.5, composition: { N2: 0.9, CH4: 0.1 } } as any, tags: [{ key: 'aurora/strong', value: '0.45' }] }),
    mk({ name: 'H/He giant · red-pink (brilliant)', apparentColorHex: '#c9a878', axial_tilt_deg: 3,
        atmosphere: { pressure_bar: 1000, composition: { H2: 0.9, He: 0.1 } } as any,
        apparentColor: { hex: '#c9a878', banding: 8, palette: ammonia('#e8d3ab', '#c89868', '#9c6b3e') } as any,
        tags: [{ key: 'aurora/brilliant', value: '0.75' }] }),
  ];

  // ── OUR SOLAR SYSTEM, LIVE ────────────────────────────────────────────────────────────────────
  // Not hand-authored examples: the real Sol data file, fetched and run through the SAME processor
  // and rule pack the app uses. If the data or the physics changes, this row changes with it — so
  // it doubles as the honesty check that what we generate still resembles the place we live.
  let solBodies: CelestialBody[] = [];
  let giantLab: { title: string; blurb?: string; bodies: CelestialBody[] }[] = [];
  let solError = '';
  // What the physics decided, shown beside each world so the tags are checkable at a glance.
  // getElementById, not querySelector: a fragment is arbitrary user text and `#3-body` is a valid id
  // but an invalid selector, which throws rather than missing.
  function scrollToHash() {
    if (typeof location === 'undefined' || !location.hash) return;
    const el = document.getElementById(decodeURIComponent(location.hash.slice(1)));
    el?.scrollIntoView({ block: 'start' });
  }

  const weatherOf = (b: CelestialBody, pack: RulePack | null) => {
    const decks = decksFromTags(b.tags, pack).map((d) => `${d.species} ${d.bucket}`);
    const precip = (b.tags ?? []).filter((t) => t.key === PRECIPITATION_TAG).map((t) => t.value);
    return { decks, precip };
  };
  let solPack: RulePack | null = null;

  onMount(async () => {
    try {
      solPack = await fetchAndLoadRulePack('/rulepacks/starter-sf/main.json');
      const res = await fetch('/examples/Sol_2030-System.json');
      if (!res.ok) throw new Error(`Sol example ${res.status}`);
      const raw = await res.json();
      const system: System = raw.system ?? raw;
      const processed = systemProcessor.process(JSON.parse(JSON.stringify(system)), solPack);
      // The worlds worth showing: everything with a real atmosphere or a familiar face, in orbit order.
      const wanted = ['Venus', 'Earth', 'Mars', 'Jupiter', 'Saturn', 'Titan', 'Uranus', 'Neptune', 'Triton', 'Pluto', 'Moon', 'Io', 'Europa'];
      giantLab = buildGiantLab(solPack);
      // A FRAGMENT LINK INTO ASYNC CONTENT NEEDS RE-APPLYING BY HAND. The browser resolves #giant-lab
      // once, early, and by then this row does not exist — `giantLab` is empty until the rule pack and
      // the Sol example have both been fetched. So a first visit lands at the top and a REFRESH works,
      // because the two files are cached by then and arrive before the browser gives up. That
      // difference is the whole tell, and it is why it reads as flaky rather than broken.
      await tick();
      scrollToHash();
      solBodies = wanted
        .map((n) => processed.nodes.find((x: any) => x.name === n))
        .filter(Boolean) as CelestialBody[];
    } catch (e: any) {
      solError = e?.message ?? String(e);
    }
  });

  // G7 — hand the reader the recipe behind a colour. INPUTS ONLY (see `giantRecipe`): the deck list
  // is already beside it in the caption, and copying a derived value would freeze an answer next to
  // its question. Only the LAB row gets this; the authored giants below have no recipe to give.
  let copiedId: string | null = null;
  let copyTimer: ReturnType<typeof setTimeout> | null = null;
  async function copyRecipe(b: CelestialBody, label?: string) {
    const json = giantRecipeJson(b, label);
    if (!json) return;
    try {
      await navigator.clipboard.writeText(json);
    } catch {
      // A denied clipboard must not look like a copy that worked. Fall back to a prompt so the text
      // is still obtainable, and say nothing was copied if even that is refused.
      window.prompt('Copy this recipe:', json);
      return;
    }
    copiedId = b.id ?? null;
    if (copyTimer) clearTimeout(copyTimer);
    copyTimer = setTimeout(() => (copiedId = null), 1600);
  }

  const giants = [
    mk({ name: 'Jupiter-like · fast spin · 3° tilt', apparentColorHex: '#d8b888', axial_tilt_deg: 3, makeup: { gas: 0.9, ice: 0.1 } as any,
        apparentColor: { hex: '#d8b888', banding: 8, palette: ammonia('#e8d3ab', '#c89868', '#9c6b3e') } as any }),
    mk({ name: 'Saturn-like · 27° tilt', apparentColorHex: '#d8c89a', axial_tilt_deg: 27, makeup: { gas: 0.9, ice: 0.1 } as any,
        apparentColor: { hex: '#d8c89a', banding: 5, palette: ammonia('#e6dcb8', '#c8b888', '#a89860') } as any }),
    mk({ name: 'Ice giant · smooth', apparentColorHex: '#8fc4d6', axial_tilt_deg: 28, makeup: { gas: 0.6, ice: 0.4 } as any,
        apparentColor: { hex: '#8fc4d6', banding: 3, palette: iceGiant('#a6d4e2') } as any }),
    mk({ name: 'Uranus-like · 98° tilt (on its side)', apparentColorHex: '#a6d8dc', axial_tilt_deg: 98, makeup: { gas: 0.6, ice: 0.4 } as any,
        apparentColor: { hex: '#a6d8dc', banding: 4, palette: iceGiant('#b8e0e4') } as any }),
  ];

  // Polar vortices — a gas giant's geometric polar jet. Saturn's north pole is a hexagon (6); Jupiter's
  // poles run polygonal cyclone rings 5–9. Side count rides on the feature/polar-vortex tag value.
  const gasGiant = (name: string, sides: number, hex: string, banding: number, pal: any) =>
    mk({ name, apparentColorHex: hex, radiusKm: 60000, makeup: { gas: 0.9, ice: 0.1 } as any,
        apparentColor: { hex, banding, palette: pal } as any, tags: [{ key: 'feature/polar-vortex', value: String(sides) }] });
  const polarVortices = [
    gasGiant('Pentagon jet (5)', 5, '#d8c89a', 6, ammonia('#e6dcb8', '#c8b888', '#a89860')),
    gasGiant('Hexagon jet (6) · Saturn', 6, '#d8c89a', 6, ammonia('#e6dcb8', '#c8b888', '#a89860')),
    gasGiant('Octagon jet (8) · Jupiter N', 8, '#d8b888', 9, ammonia('#e8d3ab', '#c89868', '#9c6b3e')),
  ];

  // Self-luminous brown dwarfs: the emission halo's colour comes from the thermal/self-luminous tag's
  // value (its effective temperature). Cool T-dwarf → deep red; hot young L-dwarf → amber.
  const brownDwarfs = [
    mk({ name: 'Y/T dwarf · 500 K', apparentColorHex: '#2e1410', temperatureK: 500, tags: [{ key: 'thermal/self-luminous', value: '500' }] }),
    mk({ name: 'T dwarf · 900 K', apparentColorHex: '#4a1e12', temperatureK: 900, tags: [{ key: 'thermal/self-luminous', value: '900' }] }),
    mk({ name: 'L dwarf · 1500 K', apparentColorHex: '#6e2c14', temperatureK: 1500, tags: [{ key: 'thermal/self-luminous', value: '1500' }] }),
    mk({ name: 'Hot young L · 2300 K', apparentColorHex: '#8a4018', temperatureK: 2300, tags: [{ key: 'thermal/self-luminous', value: '2300' }] }),
  ];
</script>

<div class="page">
  <h1>Rendered worlds — reference gallery</h1>
  <p class="lead">How The Guide draws a world from its physics and tags. These are illustrative examples.
    <a href="/discgallery3d">3D holo gallery →</a></p>

  <h2>Star types — by temperature</h2>
  <div class="gallery">
    {#each GALLERY_STAR_TYPES as b}
      <figure><PlanetDisc body={b} size={168} /><figcaption>{b.name}</figcaption></figure>
    {/each}
  </div>

  <h2>Black holes — by accretion level (2D schematic; comes alive with lensing in 3D)</h2>
  <div class="gallery">
    {#each [{ n: 'Quiescent', e: 0 }, { n: 'Feeding · 20%', e: 0.2 }, { n: 'Feeding · 50%', e: 0.5 }, { n: 'Feeding · 100%', e: 1 }] as bh, i}
      {@const rx = 22 + bh.e * 26}
      {@const ry = 2.5 + bh.e * 3.5}
      <figure>
        <svg viewBox="0 0 100 100" width="168" height="168">
          <defs>
            <!-- Concentric temperature grade across the disc: hot-white inner (at the hole) → orange → fade. -->
            <radialGradient id="acc-{i}" cx="0.5" cy="0.5" r="0.5">
              <stop offset="0" stop-color="#fff4d0" stop-opacity="0" /><stop offset="0.24" stop-color="#fff4d0" />
              <stop offset="0.45" stop-color="#f0a030" /><stop offset="0.75" stop-color="#8a3212" /><stop offset="1" stop-color="#8a3212" stop-opacity="0" />
            </radialGradient>
            <!-- The bright blade / lensed rims: hot-white in the middle, fading at the tips. -->
            <linearGradient id="accl-{i}" x1="0" y1="0" x2="1" y2="0">
              <stop offset="0" stop-color="#8a3212" stop-opacity="0" /><stop offset="0.22" stop-color="#f0a030" />
              <stop offset="0.5" stop-color="#fff4d0" /><stop offset="0.78" stop-color="#f0a030" /><stop offset="1" stop-color="#8a3212" stop-opacity="0" />
            </linearGradient>
            <!-- Particle fuzz for the blaze — heavier at higher accretion. -->
            <filter id="bhb-{i}" x="-40%" y="-300%" width="180%" height="700%"><feGaussianBlur stdDeviation={1.1 + bh.e * 1.7} /></filter>
          </defs>
          {#if bh.e > 0}
            <!-- The edge-on particle blaze: fuzzy blurred gradient ellipses, WIDTH growing with feeding. -->
            <ellipse cx="50" cy="50" rx={rx} ry={ry} fill="url(#acc-{i})" filter="url(#bhb-{i})" />
            <ellipse cx="50" cy="50" rx={rx * 0.72} ry={ry * 0.75} fill="url(#acc-{i})" filter="url(#bhb-{i})" opacity="0.95" />
            <!-- Far side of the disc lensed over the top, hugging the ring. -->
            <path d="M{50 - rx * 0.5} 50 Q 50 {28 - bh.e * 4} {50 + rx * 0.5} 50" fill="none" stroke="url(#accl-{i})" stroke-width={1.2 + bh.e * 1.2} opacity="0.9" />
          {/if}
          <!-- Event horizon + a bright photon ring (with a soft outer glow). -->
          <circle cx="50" cy="50" r="11" fill="#000" />
          <circle cx="50" cy="50" r="13.4" fill="none" stroke="#fff" stroke-width="1.1" opacity="0.3" />
          <circle cx="50" cy="50" r="12.2" fill="none" stroke="#fff" stroke-width="2.1" />
          {#if bh.e > 0}
            <!-- The near-side blade crossing IN FRONT of the hole — the signature of the lensed look. -->
            <ellipse cx="50" cy="50.8" rx={rx * 0.98} ry={0.9 + bh.e * 1.1} fill="url(#accl-{i})" opacity="0.95" />
          {/if}
        </svg>
        <figcaption>{bh.n}</figcaption>
      </figure>
    {/each}
  </div>

  <h2>Surface features</h2>
  <div class="gallery">
    {#each surface as b}
      <figure><PlanetDisc body={b} size={168} /><figcaption>{b.name}</figcaption></figure>
    {/each}
  </div>

  <h2>Atmosphere limb-glow — strength from surface pressure</h2>
  <div class="gallery">
    {#each atmospheres as b}
      <figure><PlanetDisc body={b} size={168} /><figcaption>{b.name}</figcaption></figure>
    {/each}
  </div>

  <!-- Bisection aid: the SAME body drawn with individual derived features dropped, so a wrong-looking
       world can be attributed to one layer instead of guessed at. Drawn large, since the complaint is
       about what the haze and the cloud deck do at close zoom. -->
  <h2>Test render — Earth under a G star, one layer at a time</h2>
  <p class="note">
    The same Earth-like world as the row below, drawn at full size with individual layers suppressed.
    Whichever pair differs is the layer responsible.
  </p>
  <div class="gallery">
    <figure><PlanetDisc body={earthDiagnostic} size={260} /><figcaption>As shipped (all layers)</figcaption></figure>
    <figure><PlanetDisc body={earthDiagnostic} size={260} suppress={{ clouds: true }} /><figcaption>No cloud deck</figcaption></figure>
    <figure><PlanetDisc body={earthDiagnostic} size={260} suppress={{ atmGlow: true }} /><figcaption>No atmosphere glow</figcaption></figure>
    <figure><PlanetDisc body={earthDiagnostic} size={260} suppress={{ clouds: true, atmGlow: true, aurora: true }} /><figcaption>Bare surface (nothing over it)</figcaption></figure>
    <figure><PlanetDisc body={waterControl} size={260} /><figcaption>Water-ocean control (renders correctly)</figcaption></figure>
    <figure><PlanetDisc body={waterControl} size={260} suppress={{ clouds: true, atmGlow: true, aurora: true }} /><figcaption>Control, bare surface</figcaption></figure>
    <figure><PlanetDisc body={earthNoCloudLayer} size={260} /><figcaption>Earth minus its hydrosphere CLOUD layer</figcaption></figure>
    <figure><PlanetDisc body={earthNoPolarIce} size={260} /><figcaption>Earth minus its polar-ice tag</figcaption></figure>
  </div>

  <h2>Same Earth under different stars — starlight tints ocean, cloud &amp; surface</h2>
  <div class="gallery">
    {#each earthUnderStars as b}
      <figure><PlanetDisc body={b} size={168} /><figcaption>{b.name}</figcaption></figure>
    {/each}
  </div>

  <h2>Life on the land — coverage grows from the coast inwards</h2>
  <p class="note">One world, one geography, one slider. Life reaches the land at the water&rsquo;s edge and spreads
    inland, so raising the coverage widens the band toward the interior — and past 100% it goes the other way,
    into the shallows. Nothing here is hand-tinted: each disc is <code>deriveSurfaceSpectrum</code> then
    <code>deriveVegetation</code>, the same two calls the processor makes on every body.</p>
  <div class="gallery">
    {#each GALLERY_COVERAGE as b}
      <figure><PlanetDisc body={b} size={168} /><figcaption>{b.name}</figcaption></figure>
    {/each}
  </div>

  <h2>The pigment decides the colour</h2>
  <p class="note">The same world under the same star, with each viable pigment pinned in turn. Each colour is what
    that pigment fails to absorb out of the light reaching this ground — which is why they are not swatches.</p>
  <div class="gallery">
    {#each GALLERY_PIGMENTS as b}
      <figure><PlanetDisc body={b} size={168} /><figcaption>{b.name}</figcaption></figure>
    {/each}
  </div>

  <h2>The hierarchy is a painter&rsquo;s algorithm</h2>
  <p class="note">Plant life covers fungal, fungal colours microbial — layers painted in order. Fauna is present on
    the last one and paints nothing, because animals do not tint a world seen from orbit.</p>
  <div class="gallery">
    {#each GALLERY_STACK as b}
      <figure><PlanetDisc body={b} size={168} /><figcaption>{b.name}</figcaption></figure>
    {/each}
  </div>

  <h2>Technological life — lights, not paint (look at the night side)</h2>
  <p class="note">A settlement spreads exactly as plant cover does, from the coasts inland, because people settle
    the same ground first. It reads as what it EMITS: a grey-brown urban haze by day and a network of light by
    night. <strong>It is also the only morphology that can take the oceans</strong> — a civilisation that has
    covered its continents roofs its seas next — and that is a number in its definition
    (<code>waterReach</code>), not a rule about technology anywhere in the code.</p>
  <p class="note">How LIT a world is and how much of it is OCCUPIED are different questions, which is why the
    first world below is dark. About a quarter of Earth's surface is held or worked by people, but only a few
    per cent of it is built and burning — so the night side is a scatter of coastal points rather than a web.
    Turn the light up and the same extent becomes a grid; take it past the shoreline and it becomes
    <code>biodiversity/ecumenopolis</code>.</p>
  <div class="gallery">
    {#each GALLERY_TECHNO as b}
      <figure><PlanetDisc body={b} size={168} /><figcaption>{b.name}</figcaption></figure>
    {/each}
  </div>

  <h2>Oceans of different liquids — each sea coloured by its solvent (sun-like star)</h2>
  <div class="gallery">
    {#each oceanWorlds as b}
      <figure><PlanetDisc body={b} size={168} /><figcaption>{b.name}</figcaption></figure>
    {/each}
  </div>

  <h2>Light direction (terminator) — for orrery reuse</h2>
  <div class="gallery">
    <figure><PlanetDisc body={litBody} size={168} /><figcaption>default (upper-left)</figcaption></figure>
    <figure><PlanetDisc body={litBody} size={168} lightAngle={0} /><figcaption>from right</figcaption></figure>
    <figure><PlanetDisc body={litBody} size={168} lightAngle={Math.PI / 2} /><figcaption>from below</figcaption></figure>
    <figure><PlanetDisc body={litBody} size={168} lightAngle={Math.PI} /><figcaption>from left</figcaption></figure>
  </div>

  <h2>Rotational shape — flattening to break-up</h2>
  <div class="gallery">
    {#each shapes as b}
      <figure><PlanetDisc body={b} size={168} /><figcaption>{b.name}</figcaption></figure>
    {/each}
  </div>

  <h2>Small bodies — irregular below ~300 km, repeatable per body, coloured by composition</h2>
  <div class="gallery">
    {#each smallBodies as b}
      <figure><PlanetDisc body={b} size={168} /><figcaption>{b.name}</figcaption></figure>
    {/each}
  </div>

  <h2>Surface weathering — cratering climbs with surface age (last is tidally locked)</h2>
  <div class="gallery">
    {#each GALLERY_CRATERING as b}
      <figure><PlanetDisc body={b} size={168} /><figcaption>{b.name}</figcaption></figure>
    {/each}
  </div>

  <h2>Ice fractures vs rock craters — a frozen former ocean rifts the crust</h2>
  <div class="gallery">
    {#each GALLERY_ICE_VS_ROCK as b}
      <figure><PlanetDisc body={b} size={168} /><figcaption>{b.name}</figcaption></figure>
    {/each}
  </div>

  <h2>Tholins &amp; volatile frosts — irradiated organics redden; retained ices frost</h2>
  <div class="gallery">
    {#each GALLERY_THOLIN_FROST as b}
      <figure><PlanetDisc body={b} size={168} /><figcaption>{b.name}</figcaption></figure>
    {/each}
  </div>

  <h2>Thermal emission &amp; eyeball worlds — a super-hot surface glows; star-locked worlds split day/night</h2>
  <div class="gallery">
    {#each GALLERY_HOT_EYEBALL as b}
      <figure><PlanetDisc body={b} size={168} /><figcaption>{b.name}</figcaption></figure>
    {/each}
  </div>

  <h2>Volcanism — glowing vents by tier</h2>
  <div class="gallery">
    {#each GALLERY_VOLCANISM as b}
      <figure><PlanetDisc body={b} size={168} /><figcaption>{b.name}</figcaption></figure>
    {/each}
  </div>

  <h2>Cryovolcanic plumes — icy jets vented through the crust</h2>
  <div class="gallery">
    {#each GALLERY_CRYO_PLUMES as b}
      <figure><PlanetDisc body={b} size={168} /><figcaption>{b.name}</figcaption></figure>
    {/each}
  </div>

  <h2>Auroras — atmosphere + magnetic field + ionising radiation</h2>
  <div class="gallery">
    {#each auroras as b}
      <figure><PlanetDisc body={b} size={168} /><figcaption>{b.name}</figcaption></figure>
    {/each}
  </div>

  <h2>Self-luminous brown dwarfs — glow &amp; colour from their own heat</h2>
  <div class="gallery">
    {#each brownDwarfs as b}
      <figure><PlanetDisc body={b} size={168} /><figcaption>{b.name}</figcaption></figure>
    {/each}
  </div>

  <h2>Gas &amp; ice giants — banding from spin, tilted by the axis</h2>
  <p class="lead authored-note">These four are an <strong>authored look</strong> &mdash; literal palettes chosen by hand to show
    banding and tilt. There is no recipe behind them, which is why they carry no copy control; the derived
    giants above are the ones built from composition and temperature.</p>
  <div class="gallery">
    {#each giants as b}
      <figure><PlanetDisc body={b} size={168} /><figcaption>{b.name}</figcaption></figure>
    {/each}
  </div>

  <h2>Polar vortices — a gas giant's geometric polar jet (Saturn's hexagon; 5–8 sides)</h2>
  <div class="gallery">
    {#each polarVortices as b}
      <figure><PlanetDisc body={b} size={168} /><figcaption>{b.name}</figcaption></figure>
    {/each}
  </div>

  <h2>Ringed &amp; tilted — squash, bands, poles and ring all tilt together</h2>
  <div class="gallery">
    <figure><PlanetDisc body={giants[1]} size={168} ringed={true} ringDensity={0.7} /><figcaption>Ringed giant · 27° tilt</figcaption></figure>
    <figure><PlanetDisc body={giants[3]} size={168} ringed={true} ringDensity={0.6} /><figcaption>Ringed giant · 98° tilt (on its side)</figcaption></figure>
    <figure><PlanetDisc body={mk({ name: 'Oblate + 45° tilt', apparentColorHex: '#c89868', oblateness: 0.4, axial_tilt_deg: 45, apparentColor: { hex: '#c89868', banding: 6, palette: ammonia('#e6dcb8', '#c8b888', '#a89860') } as any })} size={168} ringed={true} ringDensity={0.6} /><figcaption>Oblate + ring · 45° tilt</figcaption></figure>
  </div>

  <!-- THE REALITY CHECK. Everything above is a hand-authored example; this row is the real Sol
       data file put through the real processor. If our physics stops producing a recognisable
       solar system, it shows up here first. -->
  <h2>This is how OUR solar system looks — live from the data</h2>
  <p class="lead">
    Not hand-authored: <code>/examples/Sol_2030-System.json</code> fetched and run through the same
    processor and rule pack the app uses. Edit the data or the physics and this row moves with it.
  </p>
  {#if solError}
    <p class="lead err">Could not load the solar system: {solError}</p>
  {:else if !solBodies.length}
    <p class="lead">Processing the solar system…</p>
  {:else}
    <div class="gallery">
      {#each solBodies as b}
        {@const w = weatherOf(b, solPack)}
        <figure>
          <PlanetDisc body={b} size={168} />
          <figcaption>
            {b.name}
            {#if w.decks.length}
              <span class="weather">{w.decks.join(' · ')}</span>
              <span class="weather dim">{w.precip.map((p) => p.split(' ').slice(-1)[0]).join(' · ')}</span>
            {:else}
              <span class="weather dim">no cloud</span>
            {/if}
          </figcaption>
        </figure>
      {/each}
    </div>
  {/if}

  <!-- THE GIANT LAB. Sol above is the reality check; these are the controlled experiments. Each body
       is nothing but a composition, a pressure and a temperature — every deck, every colour derived
       by the same code that runs in the app. Sweep one variable along a row and the row IS the
       model's answer. -->
  <!-- G7: the atmosphere tab's "gas-giant gallery" link targets #giant-lab, so the anchor must stay. -->
  {#each giantLab as row, ri}
    <h2 id={ri === 0 ? 'giant-lab' : undefined}>{row.title}</h2>
    {#if row.blurb}<p class="lead">{row.blurb}</p>{/if}
    <div class="gallery">
      {#each row.bodies as b}
        {@const w = weatherOf(b, solPack)}
        <figure>
          <PlanetDisc body={b} size={168} />
          <figcaption>
            {b.name}
            {#if w.decks.length}
              <span class="weather">{w.decks.join(' · ')}</span>
            {:else}
              <span class="weather dim">clear</span>
            {/if}
            <button class="recipe" on:click={() => copyRecipe(b, w.decks.join(" · "))}
                    title="Copy the composition, pressure and temperatures that produced this colour — paste into a body's atmosphere block">
              {copiedId === b.id ? 'Copied' : 'Copy recipe'}
            </button>
          </figcaption>
        </figure>
      {/each}
    </div>
  {/each}
</div>

<style>
  :global(body) { background: #0a0a12; margin: 0; }
  .page { padding: 20px 24px 48px; font-family: system-ui, sans-serif; color: #ccd; }
  h1 { color: #cfe0ea; font-size: 1.15rem; margin: 8px 0 4px; }
  .lead { color: #8a97a6; margin: 0 0 18px; font-size: 0.85rem; }
  h2 { color: #8aa8bc; font-size: 0.82rem; text-transform: uppercase; letter-spacing: 0.06em; margin: 26px 0 4px; }
  .gallery { display: flex; flex-wrap: wrap; gap: 28px; padding: 12px 0; }

  .recipe {
    display: block; margin: 6px auto 0; font-size: 0.72rem; padding: 2px 8px; border-radius: 999px;
    cursor: pointer; background: #161c26; border: 1px solid #2a3340; color: #9fb2c4;
  }
  .recipe:hover { border-color: #6cb6ff; color: #cfe0ea; }
  .authored-note { margin-top: 2px; }
  figure { margin: 0; text-align: center; font-size: 0.78rem; width: 168px; }
  figcaption { margin-top: 8px; color: #b8c2cc; }
  .err { color: #e08a6a; }
  code { color: #9fb6c8; font-size: 0.92em; }
  /* The derived weather beside each real world — the check is "does this read as that planet?" */
  .weather { display: block; margin-top: 2px; font-size: 0.72rem; color: #8aa8bc; line-height: 1.35; }
  .weather.dim { color: #6b7787; }
</style>
