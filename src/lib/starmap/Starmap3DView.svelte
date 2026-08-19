<script lang="ts">
  // Thin wrapper around the imperative 3D starmap scene. Lazy-imports starmapScene so three lands in
  // its own chunk. Feeds it systems (map x/y + multi-star colours) + routes, and the theme/look props.
  import { onMount, onDestroy, createEventDispatcher } from 'svelte';
  import type { MapOverlay } from '$lib/map/mapOverlay';
  import type { Starmap } from '$lib/types';
  import type { StarmapController, SmSystem, SmRoute, SceneMapBackground } from './starmapScene';
  // G16: the campaign's own picture behind the stars. The RECTANGLE is solved in one shared module
  // (map/mapBackground) and this wrapper only hands it on, so this scene and the GM 2D map cannot
  // disagree about where a georeferenced image sits.
  import { resolveMapBackground, backgroundRectMap, backgroundPixelsPerUnit } from '$lib/map/mapBackground';
  import { BUILTIN_ASSETS } from '$lib/player/presets';
  import { rollUpMarkers, type MapHighlights } from '$lib/tags/mapHighlights';
  import type { MarkerStyleName } from '$lib/tags/tagPill';
  import { liveOverrides } from '$lib/player/liveOverrides';
  import { tagCategories } from '$lib/tags/tagCategories';
  // THE GM'S TAG VOCABULARY, by the same rule as `highlights` above (TAG-15): a player window has its
  // own store instances, and for this store that means the SHIPPED DEFAULTS — every colour the GM
  // customised would be wrong there. So it arrives as a prop off the broadcast, and falls back to the
  // local store only on the GM's own screen, where the store IS the answer.
  export let tagStyles: import('$lib/tags/tagCategories').TagCategory[] | null = null;
  $: activeTagCategories = tagStyles ?? $tagCategories;
  import { systemVisualStars } from './systemStars';
  import { drawHud } from '$lib/catalogue/infoCard';

  export let starmap: Starmap | null = null;
  export let accentColor = '#6aa0ff';
  export let font = 'system-ui';
  // THE shared overlay vocabulary. This used to be the legacy four ('off'|'plain'|'scaled'|'hex'),
  // which excluded the two lattice types the preset can actually hold — a preset saying 'square'
  // was being passed to a prop whose type said that value did not exist (inbox A37).
  export let grid: MapOverlay = 'plain';
  // How far each grid line drops a curtain below itself, 0 (flat lattice) .. 1. The line stays at
  // full intensity and the curtain fades away downward. 0 by default — a plan view reads as flat, and
  // the overhead 2D starmap sees a curtain edge-on regardless. Only meaningful on a tilted 3D map,
  // and forced to 0 in `flat` mode so the 2D view cannot pick it up by accident.
  export let gridDepth = 0;
  // G4: how hard the grid fades with distance. 0 = even brightness across the field, 1 = bright
  // near cells falling away fast. Applies to every overlay type, polar included.
  export let gridFalloff = 0.5;
  export let routeGlow = true; // emissive glow on the transit routes
  // The vertical stems down to the reference plane and the rings marking where they land. On by
  // default: they are what makes exaggerated depth readable at all.
  export let dropLines = true;
  export let mono = false; // monochrome palette (white/grey) for tinting filters
  // The GM's snap-grid, in ITS OWN persisted spelling ('grid'/'none'). Kept verbatim rather than
  // migrated: it is what is already saved in campaigns. normaliseOverlay folds it in the scene.
  export let mapGrid: { type: 'grid' | 'hex' | 'traveller-hex' | 'none'; size: number } | null = null;
  // WS7: DISPLAY-ONLY depth stretch. 1 = true depth. Never reaches the distance maths.
  export let zExaggeration = 1;
  // G26: the GM SIZE SCALER for the star glyphs. 0 = every star the same size (the map as it was),
  // 1 = the four luminosity-class bands fully separated. Rides the PRESET (starmapStarScale), so a
  // player window gets the GM's choice for this view — the GM's own 2D map has its own local dial.
  export let starScale = 0;
  export let flat = false;         // 2D starmap: tilt pinned top-down — never becomes a 3D view
  export let lockRotation = false; // fix the heading (no spin by drag); independent of the tilt
  export let background: 'space' | 'green' | 'blue' | 'black' = 'space';
  export let angleDeg = 58;
  export let labelSize = 12;
  // ROLL-UP BADGES (design 9.4). Resolved HERE rather than in the scene, because this is the layer that
  // knows whose tags these are: `starmap` is already the audience's snapshot, so a secret tag has been
  // removed before it could ever become a badge (TAG-9/TAG-13). Prop first, store second — a player
  // window's stores are fresh empty instances (TAG-15).
  export let highlights: MapHighlights | null = null;
  export let markerStyle: MarkerStyleName = 'label';
  export let markerSize: number | undefined = undefined;
  export let flagStaff: 'silver' | 'gold' | 'white' | 'black' | 'tag' | undefined = undefined;
  export let pinText: 'none' | 'initial' | 'name' | undefined = undefined;
  export let filter = 'none';
  export let filterParams: Record<string, number | boolean | string> | undefined = undefined;
  export let selectable = false; // live view: tapping a system fires `select`
  export let tipTop = '';    // "The Guide" margin note for the top edge ('' = none)
  export let tipBottom = ''; // …and the bottom edge — drawn INTO the filtered render as a HUD quad
  export let tipMono = false;
  export let overlay: import('$lib/catalogue/infoCard').HudOverlay | null = null; // image overlay into the filter
  // G16: show the campaign's map background on this view. The preset's opt-out; the anchor itself is
  // campaign content and arrives on `starmap`, never as a second copy per preset.
  export let mapBackground = true;

  const dispatch = createEventDispatcher<{ select: string }>();

  let container: HTMLDivElement;
  let canvas: HTMLCanvasElement;
  let controller: StarmapController | null = null;
  let ro: ResizeObserver | null = null;
  let vw = 0, vh = 0;

  // Build (or clear) the HUD — guide-tip banners + a per-screen image overlay, composited into the filter.
  // Re-measure the container each build: the HUD canvas MUST match the current display size, else a stale
  // (smaller) size upscales onto the full-frame quad and the banners render several times too large.
  function applyTips() {
    if (!controller) return;
    if (container) { const r = container.getBoundingClientRect(); if (r.width > 0) { vw = r.width; vh = r.height; } }
    const hasTips = !!(tipTop || tipBottom);
    if ((!hasTips && !overlay) || vw <= 0 || vh <= 0) { controller.setHud(null); return; }
    const hud = drawHud({ viewW: vw, viewH: vh, overlay, tips: hasTips ? { top: tipTop, bottom: tipBottom, accent: accentColor, font, mono: tipMono } : null });
    controller.setHud(hud);
  }

  // A14: `z` is passed through UNCONDITIONALLY, including when the campaign has "ignore depth when
  // measuring distances" on. That setting governs what is COUNTED, not what is drawn — a 3D view
  // whose whole point is depth must keep its geometry, or the placement work vanishes. The 2D GM map
  // drops its depth CUES in that case (A12) because a number affecting no distance is noise; there is
  // no equivalent here, since this scene's only text is system names, route names and the planar
  // distance rings. Do not add a depth read-out to this view without revisiting A14.
  $: activeHighlights = $liveOverrides.highlightsMuted ? [] : (highlights ?? $liveOverrides.mapHighlights ?? []);
  // Every reactive value is NAMED in this expression rather than closed over in a helper, or the
  // badges would be computed once and frozen — the fault TAG-17 records on the 2D starmap.
  $: smSystems = ((starmap?.systems ?? []) as any[]).map<SmSystem>((s) => ({
    id: s.id, name: s.name, x: s.position?.x ?? 0, y: s.position?.y ?? 0, z: s.position?.z ?? 0,
    // Everything a glyph draws is resolved by systemVisualStars from the star's classes and TAGS
    // (band, activity/flares, jets, shedding) — the scene reads it and decides nothing (G26).
    stars: systemVisualStars(s.system).map((v) => ({ color: v.color, bh: v.bh, edd: v.edd, band: v.band, activity: v.activity, flares: v.flares, jets: v.jets, shedding: v.shedding })),
    markers: activeHighlights.length
      ? rollUpMarkers(s.system?.nodes ?? [], activeHighlights, activeTagCategories, markerStyle)
      : []
  }));
  $: smRoutes = ((starmap?.routes ?? []) as any[]).map<SmRoute>((r) => ({ fromId: r.sourceSystemId, toId: r.targetSystemId, dashed: r.lineStyle === 'dashed', name: r.name }));

  // G16. SCREEN-FIXED IS NOT A PLANE: on this surface it is the existing HUD overlay path (a
  // full-frame quad composited into the filter), exactly as the procedural backdrop behaves today.
  // Only MAP-FIXED becomes geometry, and only then does it need the fit transform.
  $: bgAssets = [...BUILTIN_ASSETS, ...(starmap?.playerAssets ?? [])];
  $: resolvedBg = mapBackground ? resolveMapBackground(starmap, bgAssets) : null;
  // Natural bitmap size: recorded on an uploaded asset, measured once otherwise.
  let bgNatural: { url: string; w: number; h: number } | null = null;
  function measureBackground(url: string) {
    if (bgNatural?.url === url) return;
    const im = new Image();
    im.onload = () => { bgNatural = { url, w: im.naturalWidth, h: im.naturalHeight }; };
    im.src = url;
  }
  $: if (typeof window !== 'undefined' && resolvedBg?.attach === 'map' && !(resolvedBg.naturalW && resolvedBg.naturalH)) {
    measureBackground(resolvedBg.url);
  }
  $: bgAspect = !resolvedBg ? 0
    : resolvedBg.naturalW && resolvedBg.naturalH ? resolvedBg.naturalW / resolvedBg.naturalH
    : bgNatural && bgNatural.url === resolvedBg.url && bgNatural.h > 0 ? bgNatural.w / bgNatural.h
    : 0;
  $: sceneBackground = ((): SceneMapBackground | null => {
    if (!resolvedBg || resolvedBg.attach !== 'map' || bgAspect <= 0) return null;
    const r = backgroundRectMap(resolvedBg.bg, bgAspect, backgroundPixelsPerUnit(starmap));
    return { url: resolvedBg.url, cx: r.cx, cy: r.cy, w: r.w, h: r.h, rotationDeg: r.rotationDeg, opacity: resolvedBg.opacity };
  })();

  function apply() {
    if (!controller) return;
    controller.setRouteGlow(routeGlow); // before setData so the rebuild picks it up
    controller.setMono(mono);
    controller.setMapGrid(mapGrid); // before setData: setData's rebuildGrid uses the fresh fit transform
    controller.setData(smSystems, smRoutes);
    // G10: the scaled polar rings need map-units-per-distance-unit or they label map coordinates.
    controller.setDistanceScale(starmap?.scale?.pixelsPerUnit ?? 0);
    controller.setDropLines(dropLines);
    controller.setGrid(grid);
    controller.setGridSkirt(flat ? 0 : gridDepth);
    controller.setGridFalloff(gridFalloff);
    controller.setZExaggeration(zExaggeration); // display-only depth stretch
    controller.setStarScale(starScale);          // G26: glyph size bands, a screen quantity
    controller.setBackground(background);
    controller.setFraming(angleDeg);
    controller.setFlatOverhead(flat); // after setFraming: pins the tilt overhead
    controller.setLockRotation(lockRotation);
    controller.setLabelSize(labelSize);
    controller.setMarkerOptions({ size: markerSize, staff: flagStaff, pinText });
    controller.setLabelFont(font);
    // Labels are in-scene sprites: theme accent, or grey in mono so a tint filter colours them.
    controller.setLabelColor(mono ? '#dfe6f0' : accentColor);
    controller.setFilter(filter, filterParams);
    // AFTER setData: setData recomputes the fit transform the plane is placed against.
    controller.setMapBackground(sceneBackground);
  }

  onMount(() => {
    let cancelled = false;
    (async () => {
      const { createStarmapScene } = await import('./starmapScene');
      if (cancelled || !canvas) return;
      controller = createStarmapScene(canvas, { distanceUnit: starmap?.distanceUnit, onSelect: selectable ? (id) => dispatch('select', id) : undefined });
      apply();
      const r = container.getBoundingClientRect();
      vw = r.width; vh = r.height;
      controller.resize(r.width, r.height);
      applyTips();
      ro = new ResizeObserver((e) => { const cr = e[0]?.contentRect; if (cr) { controller?.resize(cr.width, cr.height); vw = cr.width; vh = cr.height; applyTips(); } });
      ro.observe(container);
    })();
    return () => { cancelled = true; };
  });
  onDestroy(() => { ro?.disconnect(); controller?.dispose(); controller = null; });

  // Re-apply on any prop change (setData/setFilter short-circuit cheaply).
  $: if (controller) { smSystems; smRoutes; grid; gridDepth; gridFalloff; zExaggeration; starScale; routeGlow; dropLines; mono; mapGrid; flat; lockRotation; background; angleDeg; labelSize; font; filter; filterParams; accentColor; starmap?.scale?.pixelsPerUnit; apply(); }
  // Rebuild the tip HUD when the notes (or their theme) change.
  $: if (controller) { tipTop; tipBottom; tipMono; overlay; accentColor; font; applyTips(); }
  // G16: re-place the plane on any anchor change. Named rather than closed over, per the note above.
  $: if (controller) { controller.setMapBackground(sceneBackground); }
</script>

<div class="sm3d-root" bind:this={container}>
  <canvas bind:this={canvas}></canvas>
</div>

<style>
  .sm3d-root { position: absolute; inset: 0; overflow: hidden; }
  canvas { display: block; width: 100%; height: 100%; }
</style>
