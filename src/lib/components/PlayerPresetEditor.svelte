<script lang="ts">
  // Unified Player View — preset editor as a WIZARD (Alex 2026-07-10): General → Cover → Starmap →
  // System → Filter. Each tab has its controls on the left and a live preview of THAT stage on the
  // right. The filter is deliberately LAST (set everything up clean, then costume it) with its own
  // cover/starmap/system preview buttons: the 3D view gets the true GLSL filter, DOM views get the
  // CSS approximation (FilterFrame). Edits a DRAFT; Save commits to the campaign.
  import { createEventDispatcher, onMount } from 'svelte';
  import { browser } from '$app/environment';
  import { get } from 'svelte/store';
  import type { System, RulePack } from '$lib/types';
  import type { PlayerPreset, ViewModule } from '$lib/player/presetTypes';
  import { holoStyleOf, systemStageStyle, FONT_STACKS, isRainbow, RAINBOW, RAINBOW_GRADIENT, accentSolid } from '$lib/player/presets';
  import { RATE_STEPS } from '$lib/player/timeRates';
  import { updatePreset, playerAssetList, addAssetFromFile, deleteAsset } from '$lib/player/presetStore';
  import { systemStore } from '$lib/stores';
  import { starmapStore } from '$lib/starmapStore';
  import { starmapUiStore } from '$lib/starmapUiStore';
  // The GM's live snap-grid, so the preview shows the same grid the players will see.
  $: previewMapGrid = { type: ($starmapUiStore.travellerMode ? 'traveller-hex' : $starmapUiStore.gridType) as 'grid' | 'hex' | 'traveller-hex' | 'none', size: 50 };
  import { fetchAndLoadRulePack } from '$lib/rulepack-loader';
  import HoloView from '$lib/holo/HoloView.svelte';
  import FilterParamControls from './FilterParamControls.svelte';
  import CoverView from './CoverView.svelte';
  import FilterFrame from './FilterFrame.svelte';
  import GraphicLayer from './GraphicLayer.svelte';
  import GraphicPlacementControls from './GraphicPlacementControls.svelte';
  import StarmapListView from '$lib/starmap/StarmapListView.svelte';
  import Starmap3DView from '$lib/starmap/Starmap3DView.svelte';
  import FilteredDocumentView from './FilteredDocumentView.svelte';
  import { DOCUMENT_STYLES, documentStyleBase } from '$lib/catalogue/document/documentStyles';
  import TransitionParamControls from './TransitionParamControls.svelte';
  import { transitionRegistry } from '$lib/transitions/TransitionRegistry';
  import { starsOf } from '$lib/catalogue/document/systemTopology';

  // ── Document colouration (feedback): the documentStyle is a SEED — it fills the editable colour set,
  //    then the user tweaks individual slots. Each is a <input type=color> (hex), so rgba seed values are
  //    shown as their opaque colour and become solid hex once edited.
  const DOC_COLOUR_SLOTS = [
    { id: 'bg', label: 'Background' }, { id: 'heading', label: 'Heading' }, { id: 'body', label: 'Body text' },
    { id: 'label', label: 'Labels' }, { id: 'value', label: 'Values' }, { id: 'accent', label: 'Accent' },
    { id: 'rule', label: 'Lines / rules' }
  ] as const;
  function toHex(c: string | undefined): string {
    if (!c) return '#000000';
    if (c[0] === '#') return c.length === 4 ? '#' + c.slice(1).split('').map((ch) => ch + ch).join('') : c.slice(0, 7);
    const m = /rgba?\((\d+),\s*(\d+),\s*(\d+)/.exec(c);
    if (m) { const h = (n: string) => parseInt(n).toString(16).padStart(2, '0'); return `#${h(m[1])}${h(m[2])}${h(m[3])}`; }
    return '#888888';
  }
  function docColour(id: string): string {
    const seed = (documentStyleBase(draft.documentStyle) as any).colors[id];
    return toHex((draft.themeColors as any)?.[id] ?? seed);
  }
  function setDocColour(id: string, hex: string) {
    draft = { ...draft, themeColors: { ...(draft.themeColors ?? {}), [id]: hex } };
  }
  function applyColouration(style: string) {
    // New colouration → reset any per-slot tweaks so the picked style's colours show cleanly.
    draft = { ...draft, documentStyle: style as any, themeColors: {} };
  }

  export let preset: PlayerPreset;

  const dispatch = createEventDispatcher();

  let draft: PlayerPreset = structuredClone(preset);

  // Colouration swatches — reactive so they refresh when the Colouration style (or a tweak) changes.
  $: docSeedColors = (documentStyleBase(draft.documentStyle) as any).colors;
  $: docColours = DOC_COLOUR_SLOTS.map((s) => ({
    id: s.id, label: s.label,
    hex: toHex((draft.themeColors as any)?.[s.id] ?? docSeedColors[s.id])
  }));

  // ── Wizard tabs ─────────────────────────────────────────────────────────────
  const TABS = [
    { id: 'general', label: 'General' },
    { id: 'cover', label: 'Cover' },
    { id: 'starmap', label: 'Starmap' },
    { id: 'system', label: 'System' },
    { id: 'transitions', label: 'Transitions' },
    { id: 'filter', label: 'Visual filter' }
  ] as const;
  type TabId = (typeof TABS)[number]['id'];
  let tab: TabId = 'general';
  $: tabIndex = TABS.findIndex((t) => t.id === tab);

  // What the preview pane shows. The filter tab picks a layer with its own buttons; other tabs
  // preview themselves (general shows a theme sample).
  let filterPreview: 'cover' | 'starmap' | 'system' = 'system';
  $: if (tab === 'filter') {
    // default to the first ENABLED layer, preferring system
    if (filterPreview === 'system' && !draft.systemEnabled) filterPreview = draft.starmapEnabled ? 'starmap' : 'cover';
  }
  $: previewLayer = tab === 'filter' ? filterPreview : tab === 'general' ? 'theme' : tab === 'transitions' ? 'system' : tab;
  $: filterActive = tab === 'filter' && draft.filter !== 'none';

  // The 3D style: filter only applied on the filter tab (set up clean, costume last).
  $: holoStyle = { ...holoStyleOf(draft), ...(tab === 'filter' ? {} : { filter: 'none', filterParams: undefined }) };
  // What the system stage REALLY renders with (2D map = the holo locked flat) — shared with the player view.
  $: systemPreviewStyle = systemStageStyle(draft, holoStyle);

  // ── Preview data ────────────────────────────────────────────────────────────
  // Prefer a REAL, processed campaign system: the open one, else the first starmap system that carries
  // apparentColor (SystemProcessor's derived true-colour palette). A raw example fetched off disk has no
  // apparentColor, so true-colour would fall back to flat swatches — which is why the preview looked flat
  // while the player view (fed the GM's processed system) rendered textured.
  function firstProcessedSystem(): System | null {
    const sm = get(starmapStore);
    const list = (sm?.systems ?? []) as any[];
    const textured = list.find((s) => s.system?.nodes?.some((n: any) => n.apparentColor));
    const anySys = list.find((s) => s.system?.nodes?.length);
    return (textured ?? anySys)?.system ?? null;
  }
  let previewSystem: System | null = get(systemStore) ?? firstProcessedSystem();
  let rulePack: RulePack | null = null;
  let currentTime = 0;
  let raf = 0;

  onMount(() => {
    (async () => {
      try { rulePack = await fetchAndLoadRulePack('/rulepacks/starter-sf/main.json'); } catch { /* ok */ }
      if (!previewSystem && browser) {
        try { const r = await fetch('/examples/Sol_2030-System.json'); if (r.ok) previewSystem = await r.json(); } catch { /* ok */ }
      }
    })();
    let last = 0;
    const tick = (t: number) => {
      if (last) currentTime += (t - last) * 3600; // preview clock ~1s ≈ 1h
      last = t;
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  });

  // ── Assets (General tab) ────────────────────────────────────────────────────
  let fileInput: HTMLInputElement;
  function onAssetPick(e: Event) {
    const f = (e.target as HTMLInputElement).files?.[0];
    if (f) addAssetFromFile(f, f.name.replace(/\.[a-z0-9]+$/i, ''), () => { /* list is reactive */ });
    (e.target as HTMLInputElement).value = '';
  }

  // The preview's click focus. HoloView deliberately owns no focus state — a tap dispatches 'focus' and
  // the PARENT feeds it back as the prop; that loop-back is what makes click-to-frame (and the click
  // ladder) work. The catalogue always wired it; the preview didn't, so clicks there did nothing.
  let previewFocusId: string | null = null;
  // Preselect the primary star so the Document preview shows a body's file straight away.
  $: if (draft.systemView === 'document' && previewSystem && !previewFocusId) {
    const star: any = starsOf(previewSystem)[0];
    if (star) previewFocusId = star.id;
  }

  // A real colour for CSS vars / non-cover components (rainbow → representative mid colour).
  $: accentCss = accentSolid(draft.accentColor);
  // Which overlay the current preview shows (cover's own image is inside CoverView).
  $: currentOverlay = previewLayer === 'starmap' ? draft.starmapOverlay : previewLayer === 'system' ? draft.systemOverlay : null;

  function save() {
    updatePreset(draft);
    dispatch('saved', draft);
    dispatch('close');
  }
</script>

<!-- svelte-ignore a11y-click-events-have-key-events a11y-no-static-element-interactions -->
<div class="modal-bg" on:click={() => dispatch('close')}>
  <!-- svelte-ignore a11y-click-events-have-key-events a11y-no-static-element-interactions -->
  <div class="modal" on:click|stopPropagation>
    <header>
      <h2>Edit preset — {draft.name}</h2>
      <div class="tabs" role="tablist">
        {#each TABS as t, i (t.id)}
          <button role="tab" class:on={tab === t.id} aria-selected={tab === t.id} on:click={() => (tab = t.id)}>
            <span class="step">{i + 1}</span> {t.label}
          </button>
        {/each}
      </div>
      <div class="hbtns">
        <button on:click={() => dispatch('close')}>Cancel</button>
        <button class="primary" on:click={save}>Save</button>
      </div>
    </header>

    <div class="body">
      <div class="controls">
        {#if tab === 'general'}
          <fieldset>
            <legend>Identity</legend>
            <label>Name <input type="text" bind:value={draft.name} /></label>
            <label>Description <input type="text" bind:value={draft.description} /></label>
          </fieldset>
          <fieldset>
            <legend>Behaviour</legend>
            <label class="chk"><input type="checkbox" bind:checked={draft.followGM} /> Follows the GM (projection-style)</label>
            <label class="chk"><input type="checkbox" bind:checked={draft.interactive} /> Players can click / focus / scrub</label>
            <label>Default time
              <select bind:value={draft.defaultRateIndex}>
                {#each RATE_STEPS as r, i}<option value={i}>1 s ≈ {r.label}</option>{/each}
              </select>
            </label>
            <label class="chk"><input type="checkbox" bind:checked={draft.defaultPlaying} /> Start playing (unticked = paused)</label>
          </fieldset>
          <fieldset>
            <legend>Theme (used by every stage)</legend>
            <label>Font{draft.systemView === 'document' ? ' (body)' : ''}
              <select bind:value={draft.font}>
                {#each FONT_STACKS as f}<option value={f.css}>{f.label}</option>{/each}
              </select>
            </label>
            {#if draft.systemView === 'document'}
              <!-- The document can use a separate heading font; default follows the body font. -->
              <label>Heading font
                <select value={draft.headingFont ?? ''} on:change={(e) => { const v = (e.currentTarget as HTMLSelectElement).value; draft = { ...draft, headingFont: v || undefined }; }}>
                  <option value="">Same as body</option>
                  {#each FONT_STACKS as f}<option value={f.css}>{f.label}</option>{/each}
                </select>
              </label>
            {/if}
            <label class="chk"><input type="checkbox" checked={isRainbow(draft.accentColor)} on:change={(e) => (draft = { ...draft, accentColor: (e.currentTarget as HTMLInputElement).checked ? RAINBOW : '#6aa0ff' })} /> Rainbow (The Guide look)</label>
            {#if !isRainbow(draft.accentColor)}
              <label class="inline">Accent colour <input type="color" bind:value={draft.accentColor} /></label>
            {/if}
            <label>Guide tips
              <select bind:value={draft.guideTips}>
                <option value="off">Off</option>
                <option value="top">Top edge</option>
                <option value="bottom">Bottom edge</option>
                <option value="both">Top &amp; bottom</option>
              </select>
            </label>
            <p class="hint">Funny in-universe advisories ("The Guide" margin notes) shown inside the filter on every stage; a fresh line each time the view changes.</p>
          </fieldset>
          <fieldset>
            <legend>Graphics library</legend>
            <div class="assets">
              {#each $playerAssetList as a (a.id)}
                <div class="asset">
                  <img src={a.dataUrl} alt={a.name} />
                  <span class="a-name">{a.name}</span>
                  {#if !a.id.startsWith('builtin-')}
                    <button class="a-del" title="Remove" on:click={() => deleteAsset(a.id)}>×</button>
                  {/if}
                </div>
              {/each}
            </div>
            <button on:click={() => fileInput?.click()}>Upload image…</button>
            <input type="file" accept="image/*" bind:this={fileInput} on:change={onAssetPick} style="display:none" />
            <p class="hint">PNG keeps transparency. Auto-shrunk; saved with the campaign. Upload here, then place any of them on the Cover, Starmap and System stages — different images and positions per screen.</p>
          </fieldset>
        {:else if tab === 'cover'}
          <fieldset>
            <legend>Cover page</legend>
            <label class="chk"><input type="checkbox" bind:checked={draft.cover.enabled} /> This preset has a cover / hold screen</label>
            {#if draft.cover.enabled}
              <label>Title <input type="text" bind:value={draft.cover.title} placeholder="DON'T PANIC" /></label>
              <label>Subtitle <input type="text" bind:value={draft.cover.subtitle} /></label>
              <label>Body <input type="text" bind:value={draft.cover.body} /></label>
              <label>Label / stamp <input type="text" bind:value={draft.cover.label} placeholder="CONFIDENTIAL" /></label>
            {/if}
          </fieldset>
          {#if draft.cover.enabled}
            <fieldset>
              <legend>Cover graphic</legend>
              <GraphicPlacementControls placement={draft.cover.graphic} assets={$playerAssetList} label="Image"
                on:change={(e) => (draft = { ...draft, cover: { ...draft.cover, graphic: e.detail } })} />
            </fieldset>
          {/if}
        {:else if tab === 'starmap'}
          <fieldset>
            <legend>Starmap stage</legend>
            <label class="chk"><input type="checkbox" bind:checked={draft.starmapEnabled} /> Players get a starmap level</label>
            {#if draft.starmapEnabled}
              <label>View
                <select bind:value={draft.starmapView}>
                  <option value="list">Text list</option>
                  <option value="diagram2d">2D map</option>
                  <option value="holo3d">3D map</option>
                </select>
              </label>
              <!-- 2D and 3D starmap are the same engine (2D = overhead), so both get the look controls. -->
              {#if draft.starmapView === 'holo3d' || draft.starmapView === 'diagram2d'}
                <label>Grid
                  <select bind:value={draft.grid}>
                    <option value="off">Off</option>
                    <option value="plain">Polar</option>
                    <option value="scaled">Polar + scale</option>
                    <option value="hex">Hex</option>
                  </select>
                </label>
                <label class="chk"><input type="checkbox" bind:checked={draft.starmapRouteGlow} /> Glowing routes</label>
                <label class="chk"><input type="checkbox" bind:checked={draft.starmapMono} /> Monochrome (for tints)</label>
                {#if draft.starmapView === 'holo3d'}
                  <label>View angle <span>{Math.round(draft.angleDeg)}°</span><input type="range" min="0" max="80" step="1" bind:value={draft.angleDeg} /></label>
                {:else}
                  <!-- 2D only: keeps the classic flat fixed starmap. Zoom + pan still work either way. -->
                  <label class="chk"><input type="checkbox" bind:checked={draft.lockRotation} /> Lock rotation (fixed flat map)</label>
                {/if}
                <label>Label size <span>{draft.labelSize}px</span><input type="range" min="8" max="24" step="1" bind:value={draft.labelSize} /></label>
              {/if}
            {:else}
              <p class="hint">Disabled: players skip straight to the system level; no back-to-systems navigation is shown.</p>
            {/if}
          </fieldset>
          {#if draft.starmapEnabled}
            <fieldset>
              <legend>Starmap overlay</legend>
              <GraphicPlacementControls placement={draft.starmapOverlay} assets={$playerAssetList} label="Overlay image"
                on:change={(e) => (draft = { ...draft, starmapOverlay: e.detail })} />
            </fieldset>
          {/if}
        {:else if tab === 'system'}
          <fieldset>
            <legend>System stage</legend>
            <label class="chk"><input type="checkbox" bind:checked={draft.systemEnabled} /> Players can open systems</label>
            {#if draft.systemEnabled}
              <label>View
                <select bind:value={draft.systemView}>
                  <option value="document">Document</option>
                  <option value="diagram2d">2D map</option>
                  <option value="holo3d">3D holo</option>
                </select>
              </label>
            {:else}
              <p class="hint">Disabled: systems aren't openable; the starmap (or cover) is the whole guide.</p>
            {/if}
          </fieldset>
          {#if draft.systemEnabled}
            <fieldset>
              <legend>Appearance</legend>
              {#if draft.systemView === 'document'}
                <!-- Colouration: a documentStyle SEEDS the colours, then tweak each slot. Layout is the
                     same across styles — only the palette (and fonts, set on General) changes. -->
                <label>Colouration
                  <select value={draft.documentStyle} on:change={(e) => applyColouration((e.currentTarget as HTMLSelectElement).value)}>
                    {#each DOCUMENT_STYLES as ds}<option value={ds.value}>{ds.label}</option>{/each}
                  </select>
                </label>
                <label>Colour
                  <select bind:value={draft.bodyStyle}>
                    <option value="textured">True colour</option>
                    <option value="flat">Flat colour (by type)</option>
                    <option value="white">Monochrome (bleach — for a tinting filter)</option>
                  </select>
                </label>
                {#if draft.bodyStyle !== 'white'}
                  <div class="doc-colours">
                    {#each docColours as slot (slot.id)}
                      <label class="col-row"><span>{slot.label}</span>
                        <input type="color" value={slot.hex} on:input={(e) => setDocColour(slot.id, (e.currentTarget as HTMLInputElement).value)} />
                      </label>
                    {/each}
                  </div>
                {/if}
              {:else}
                <label>Colour
                  <select bind:value={draft.bodyStyle}>
                    <option value="textured">True colour</option>
                    <option value="flat">Flat colour</option>
                    <option value="white">Monochrome (for tinting filters)</option>
                  </select>
                </label>
              {/if}
              <label>Body graphics
                <select bind:value={draft.bodyGfx}>
                  <option value="sphere">3D sphere</option>
                  <option value="photo">Photo</option>
                  <option value="disc">Simple disc</option>
                  <option value="flat">Flat shape</option>
                  <option value="none">None</option>
                </select>
              </label>
              {#if draft.systemView === 'document' && draft.bodyGfx === 'photo'}
                <label>Photo framing
                  <select bind:value={draft.photoFrame}>
                    <option value="letterbox">Letterbox band</option>
                    <option value="full">Full image</option>
                    <option value="sliver">Vertical sliver</option>
                  </select>
                </label>
              {/if}
              {#if draft.systemView === 'document'}
                <label>Tags
                  <select bind:value={draft.tagStyle}>
                    <option value="pills">Coloured pills</option>
                    <option value="grouped">Grouped pills</option>
                    <option value="grouped-list">Grouped list (headings, plain)</option>
                    <option value="list">Plain list</option>
                  </select>
                </label>
                <label>Navigation
                  <select bind:value={draft.navStyle}>
                    <option value="plain">Plain text</option>
                    <option value="boxed">Boxes / buttons</option>
                  </select>
                </label>
              {/if}
              {#if draft.systemView !== 'document'}
                <!-- The scene background (space / chroma key). The document sets its own ground via its
                     style/theme colours, so this doesn't apply there. -->
                <label>Background
                  <select bind:value={draft.background}>
                    <option value="space">Space</option>
                    <option value="green">Greenscreen</option>
                    <option value="blue">Bluescreen</option>
                    <option value="black">Black</option>
                  </select>
                </label>
              {/if}
              <!-- The 2D map is the same engine locked flat, so the LOOK controls apply to both. Only the
                   genuinely 3D ideas (tilt, lock-overhead, lighting, the turntable) are 3D-only — a flat map
                   can't use them — and 2D gets its own "Lock rotation" in their place. -->
              {#if draft.systemView === 'holo3d' || draft.systemView === 'diagram2d'}
                <!-- Styles the star, and the bodies when Body graphics is a 3D sphere (the flat disc looks
                     draw their own way and ignore it). -->
                <label>Render
                  <select bind:value={draft.render}>
                    <option value="filled">Filled</option>
                    <option value="lopoly-filled">Lo-poly — filled</option>
                    <option value="lopoly-lines">Lo-poly — filled + lines</option>
                    <option value="wire-glow">Wireframe — glow</option>
                    <option value="wire-flat">Wireframe — flat</option>
                    <option value="wire-glow-occ">Wireframe — glow (solid)</option>
                    <option value="wire-flat-occ">Wireframe — flat (solid)</option>
                  </select>
                </label>
                <label>Grid
                  <select bind:value={draft.grid}>
                    <option value="off">Off</option>
                    <option value="plain">Grid</option>
                    <option value="scaled">Grid + scale</option>
                  </select>
                </label>
                <label>Spread <span>{Math.round(draft.compression * 100)}%</span><input type="range" min="0" max="1" step="0.05" bind:value={draft.compression} /></label>
                <label>Body size <span>{draft.bodySize === 0 ? 'true' : draft.bodySize >= 1 ? 'readable' : Math.round(draft.bodySize * 100) + '%'}</span><input type="range" min="0" max="1" step="0.05" bind:value={draft.bodySize} /></label>
                <label>Belts &amp; rings
                  <select bind:value={draft.beltStyle}>
                    <option value="rocks">Rocks</option>
                    <option value="band">Grey bands (like the GM orrery)</option>
                  </select>
                </label>
                {#if draft.beltStyle !== 'band'}
                  <!-- Only the rock field has a particle budget; a band is one flat shape. -->
                  <label>Belt detail <span>{Math.round(draft.beltDetail * 100)}%</span><input type="range" min="0" max="1" step="0.05" bind:value={draft.beltDetail} /></label>
                {/if}
                <label>Label size <span>{draft.labelSize}px</span><input type="range" min="8" max="24" step="1" bind:value={draft.labelSize} /></label>
                {#if draft.systemView === 'holo3d'}
                  <!-- 3D only: a flat map has no tilt to set, and no turntable to spin. -->
                  <label>View angle <span>{Math.round(draft.angleDeg)}°</span><input type="range" min="0" max="80" step="1" bind:value={draft.angleDeg} disabled={draft.lockOverhead} /></label>
                  <label class="chk"><input type="checkbox" bind:checked={draft.lockOverhead} /> Lock overhead (2D look)</label>
                  <label class="chk"><input type="checkbox" bind:checked={draft.unlit} /> Flat / no lighting (efficient 2D map)</label>
                  <label class="chk"><input type="checkbox" checked={draft.lensing !== false} on:change={(e) => draft.lensing = e.currentTarget.checked} /> Black-hole gravitational lensing</label>
                  <label>View orbit <span>{draft.orbitSpeed === 0 ? 'off' : Math.round(draft.orbitSpeed * 100) + '%'}</span><input type="range" min="0" max="1" step="0.05" bind:value={draft.orbitSpeed} /></label>
                {:else}
                  <!-- 2D only, in the turntable's place: a flat map stays fixed unless you say otherwise. -->
                  <label class="chk"><input type="checkbox" bind:checked={draft.lockRotation} /> Lock rotation (fixed flat map)</label>
                {/if}
                <!-- Both: off = tapping a body zooms to it (GM-orrery style); on = a fixed whole-system
                     plan view that never zooms. -->
                <label class="chk"><input type="checkbox" bind:checked={draft.whole} /> Frame whole system (never zoom to a body)</label>
                <label class="chk"><input type="checkbox" bind:checked={draft.skybox} /> Starfield</label>
                {#if draft.bodyGfx === 'sphere'}
                  <!-- Auroras are an emissive shell on the 3D globe — the flat disc looks don't draw them. -->
                  <label class="chk"><input type="checkbox" bind:checked={draft.auroras} /> Auroras</label>
                {/if}
              {/if}
              <label class="chk"><input type="checkbox" bind:checked={draft.hideInfoPanel} /> Hide body info {draft.systemView === 'document' ? 'block' : 'panel'} (clean display)</label>
              {#if !draft.hideInfoPanel}
                <!-- Panel WIDTH is a docked side-panel concept (holo / 2D map). The document's info block is
                     part of the page, so it has no width to set — only a text size. -->
                {#if draft.systemView === 'holo3d' || draft.systemView === 'diagram2d'}
                  <label>Info panel width (desktop) <span>{draft.inspectorWidth}px</span><input type="range" min="240" max="560" step="10" bind:value={draft.inspectorWidth} /></label>
                {/if}
                {#if draft.systemView !== 'list'}
                  <label>Info text size <span>{Math.round(draft.infoFontScale * 100)}%</span><input type="range" min="0.8" max="1.6" step="0.05" bind:value={draft.infoFontScale} /></label>
                {/if}
              {/if}
            </fieldset>
            <fieldset>
              <legend>System overlay</legend>
              <GraphicPlacementControls placement={draft.systemOverlay} assets={$playerAssetList} label="Overlay image"
                on:change={(e) => (draft = { ...draft, systemOverlay: e.detail })} />
            </fieldset>
          {/if}
        {:else if tab === 'transitions'}
          <fieldset>
            <legend>Page transition</legend>
            <label>Transition
              <select value={draft.transition}
                on:change={(e) => { const id = (e.currentTarget as HTMLSelectElement).value; draft = { ...draft, transition: id, transitionParams: transitionRegistry.defaultParams(id) }; }}>
                {#each transitionRegistry.getAll() as t}<option value={t.id}>{t.label}</option>{/each}
              </select>
            </label>
            <p class="hint">Plays when the reader opens a different world in the Document view: the old page is captured, the new one is built underneath, then the snapshot is animated away. Tap a world in the preview to see it. (Other views cut instantly for now.)</p>
            {#if draft.transition !== 'none'}
              <div class="filter-params">
                <TransitionParamControls transitionId={draft.transition} values={draft.transitionParams}
                  on:change={(e) => (draft = { ...draft, transitionParams: e.detail })} />
              </div>
            {/if}
          </fieldset>
        {:else if tab === 'filter'}
          <fieldset>
            <legend>Visual filter</legend>
            <label>Filter
              <select bind:value={draft.filter}>
                <option value="none">No filter</option>
                <option value="crt">CRT Terminal</option>
                <option value="night_vision">Night Vision</option>
                <option value="thermal">Thermal</option>
              </select>
            </label>
            {#if draft.filter !== 'none'}
              <div class="filter-params">
                <FilterParamControls filterId={draft.filter} values={draft.filterParams}
                  on:change={(e) => (draft = { ...draft, filterParams: e.detail })} />
              </div>
              <p class="hint">The 3D view uses the exact shader; text and 2D screens use a lighter matched version so their content stays readable.</p>
            {/if}
          </fieldset>
        {/if}

        <div class="wiz-nav">
          <button disabled={tabIndex === 0} on:click={() => (tab = TABS[tabIndex - 1].id)}>‹ Back</button>
          <button disabled={tabIndex === TABS.length - 1} on:click={() => (tab = TABS[tabIndex + 1].id)}>Next ›</button>
        </div>
      </div>

      <div class="preview-col">
        <div class="preview-tabs">
          {#if tab === 'filter'}
            <span class="pt-label">Preview filter on:</span>
            <button class:on={filterPreview === 'cover'} disabled={!draft.cover.enabled} on:click={() => (filterPreview = 'cover')}>Cover</button>
            <button class:on={filterPreview === 'starmap'} disabled={!draft.starmapEnabled} on:click={() => (filterPreview = 'starmap')}>Starmap</button>
            <button class:on={filterPreview === 'system'} disabled={!draft.systemEnabled} on:click={() => (filterPreview = 'system')}>System</button>
          {:else}
            <span class="pt-label">Preview — {TABS[tabIndex].label}</span>
          {/if}
        </div>
        <div class="preview">
          {#if previewLayer === 'theme'}
            <div class="theme-sample" class:rainbow={isRainbow(draft.accentColor)} style="font-family:{draft.font}; --accent:{accentCss}; --rainbow:{RAINBOW_GRADIENT}">
              <span class="ts-label">Cover heading</span>
              <h1>Aa Bb 0123</h1>
              <p>The quick brown fox orbits the lazy gas giant.</p>
              <span class="ts-foot">Font &amp; accent preview</span>
            </div>
          {:else if previewLayer === 'cover'}
            {#if draft.cover.enabled}
              <FilterFrame filterId={draft.filter} params={draft.filterParams} active={filterActive}>
                <CoverView cover={draft.cover} accentColor={draft.accentColor} font={draft.font} companyName={draft.companyName} footerText={draft.footerText} assets={$playerAssetList} />
              </FilterFrame>
            {:else}
              <div class="ph">Cover page is disabled for this preset.</div>
            {/if}
          {:else if previewLayer === 'starmap'}
            {#if !draft.starmapEnabled}
              <div class="ph">Starmap stage is disabled — players go straight to systems.</div>
            {:else if !($starmapStore?.systems?.length)}
              <div class="ph">No starmap loaded — open or create a campaign map to preview this stage.</div>
            {:else if draft.starmapView === 'holo3d' || draft.starmapView === 'diagram2d'}
              <!-- BOTH map views are the same engine (2D = it locked flat) and run the real shader
                   themselves — mirroring the live player view exactly, so this preview can't drift. -->
              <Starmap3DView starmap={$starmapStore} accentColor={accentCss} font={draft.font} grid={draft.grid} routeGlow={draft.starmapRouteGlow} mono={draft.starmapMono} mapGrid={previewMapGrid}
                flat={draft.starmapView === 'diagram2d'}
                lockRotation={draft.starmapView === 'diagram2d' && draft.lockRotation !== false}
                background={draft.background} angleDeg={draft.starmapView === 'diagram2d' ? 0 : draft.angleDeg} labelSize={draft.labelSize} filter={filterActive ? draft.filter : 'none'} filterParams={draft.filterParams} />
            {:else}
              <FilterFrame filterId={draft.filter} params={draft.filterParams} active={filterActive}>
                <StarmapListView starmap={$starmapStore} accentColor={accentCss} font={draft.font} />
              </FilterFrame>
            {/if}
          {:else if previewLayer === 'system'}
            {#if !draft.systemEnabled}
              <div class="ph">System stage is disabled for this preset.</div>
            <!-- BOTH map views are the holo (the 2D map is it locked flat) and run the real shader
                 themselves — systemStageStyle is the same one the live player view uses, so this preview
                 can't drift from what players actually get. -->
            {:else if (draft.systemView === 'holo3d' || draft.systemView === 'diagram2d') && previewSystem && rulePack}
              <HoloView system={previewSystem} {currentTime} style={systemPreviewStyle}
                focusedBodyId={previewFocusId} on:focus={(e) => (previewFocusId = e.detail)} />
            {:else if draft.systemView === 'document' && previewSystem}
              <!-- The WS2 Guide document, drawn through the real filter exactly as players get it. Tap a
                   world on the schematic (or a navigator row) to drill in — the info block is in-page. -->
              <FilteredDocumentView
                system={previewSystem} selectedId={previewFocusId}
                font={draft.font} headingFont={draft.headingFont} accent={draft.accentColor} mono={draft.bodyStyle === 'white'}
                colorful={draft.accentColor === 'rainbow'}
                imagery={draft.bodyGfx} photoFrame={draft.photoFrame}
                hideInfoBlock={draft.hideInfoPanel}
                transition={draft.transition} transitionParams={draft.transitionParams ?? {}}
                listStyle={draft.listStyle} documentStyle={draft.documentStyle} tagStyle={draft.tagStyle} navStyle={draft.navStyle} themeColors={draft.themeColors}
                fontScale={draft.infoFontScale}
                filterId={draft.filter} filterParams={draft.filterParams}
                companyName={draft.companyName} footerText={draft.footerText}
                selectable={true}
                on:select={(e) => (previewFocusId = e.detail)} />
            {:else if draft.systemView === 'list' && previewSystem}
              <FilterFrame filterId={draft.filter} params={draft.filterParams} active={filterActive}>
                <div class="sm-preview" style="font-family:{draft.font}; --accent:{accentCss}">
                  <ul class="sm-list">{#each previewSystem.nodes.filter((n) => n.kind === 'body') as b (b.id)}<li>{b.name}</li>{/each}</ul>
                </div>
              </FilterFrame>
            {:else}
              <div class="ph">Loading preview…</div>
            {/if}
          {/if}

          <!-- Per-screen overlay (watermark/frame/logo) — this stage's own, under the filter. The
               cover's image is drawn by CoverView itself, so only starmap/system add a layer here. -->
          {#if currentOverlay}
            <div class="overlay-wrap">
              <FilterFrame filterId={draft.filter} params={draft.filterParams} active={filterActive}>
                <GraphicLayer placement={currentOverlay} assets={$playerAssetList} />
              </FilterFrame>
            </div>
          {/if}
        </div>
      </div>
    </div>
  </div>
</div>

<style>
  .modal-bg { position: fixed; inset: 0; background: rgba(0,0,0,0.72); display: flex; justify-content: center; align-items: center; z-index: 2100; }
  .modal { background: var(--bg-panel); color: var(--text); border-radius: 8px; width: 1100px; max-width: 97vw; height: 90vh; display: flex; flex-direction: column; overflow: hidden; }
  header { display: flex; align-items: center; gap: 1rem; padding: 0.7rem 1.1rem; border-bottom: 1px solid var(--border); flex-wrap: wrap; }
  header h2 { margin: 0; font-size: 1rem; flex: 0 0 auto; }
  .tabs { display: flex; gap: 4px; flex: 1 1 auto; }
  .tabs button { display: flex; align-items: center; gap: 6px; font-size: 0.78rem; padding: 5px 11px; border-radius: 5px; border: 1px solid var(--border); background: var(--bg-control); color: var(--text-muted); cursor: pointer; }
  .tabs button.on { color: var(--text); border-color: var(--accent); background: color-mix(in srgb, var(--accent) 14%, var(--bg-control)); }
  .tabs .step { display: inline-flex; align-items: center; justify-content: center; width: 16px; height: 16px; border-radius: 50%; background: var(--border); font-size: 0.62rem; }
  .tabs button.on .step { background: var(--accent); color: #fff; }
  .hbtns { display: flex; gap: 0.5rem; }
  .body { display: grid; grid-template-columns: 330px 1fr; min-height: 0; flex: 1; }
  .controls { overflow-y: auto; padding: 0.9rem 1rem; display: flex; flex-direction: column; gap: 0.9rem; border-right: 1px solid var(--border); }
  fieldset { border: 1px solid var(--border); border-radius: 6px; padding: 0.6rem 0.8rem 0.8rem; display: flex; flex-direction: column; gap: 0.5rem; margin: 0; }
  legend { font-size: 0.72rem; text-transform: uppercase; letter-spacing: 0.06em; color: var(--text-muted); padding: 0 4px; }
  label { display: flex; flex-direction: column; gap: 3px; font-size: 0.75rem; color: var(--text-muted); }
  label span { color: var(--text); font-size: 0.72rem; }
  label.inline, label.chk { flex-direction: row; align-items: center; gap: 8px; font-size: 0.8rem; color: var(--text); }
  input[type=text], select { background: var(--bg-control); color: var(--text); border: 1px solid var(--border); border-radius: 4px; padding: 5px 7px; font: inherit; }
  input[type=range] { width: 100%; accent-color: var(--accent, #6aa0ff); }
  .hint { font-size: 0.72rem; color: var(--text-muted); font-style: italic; margin: 0; line-height: 1.4; }
  .filter-params { border-left: 2px solid var(--border); padding-left: 8px; margin: 2px 0; }
  .doc-colours { display: grid; grid-template-columns: 1fr 1fr; gap: 4px 10px; padding: 2px 0 2px 8px; border-left: 2px solid var(--border); }
  .col-row { display: flex; align-items: center; justify-content: space-between; font-size: 0.72rem; color: var(--text-muted); gap: 6px; }
  .col-row input[type=color] { width: 34px; height: 20px; padding: 0; border: 1px solid var(--border); border-radius: 3px; background: none; cursor: pointer; }
  .overlay-wrap { position: absolute; inset: 0; pointer-events: none; z-index: 2; }
  .assets { display: flex; flex-direction: column; gap: 6px; }
  .asset { display: flex; align-items: center; gap: 8px; background: var(--bg-control); border: 1px solid var(--border); border-radius: 5px; padding: 4px 6px; }
  .asset img { width: 44px; height: 28px; object-fit: contain; background: repeating-conic-gradient(#2a2d36 0 25%, #1b1e26 0 50%) 0 0/12px 12px; border-radius: 3px; }
  .a-name { flex: 1; font-size: 0.72rem; color: var(--text-muted); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .a-del { background: none; border: none; color: #ff8080; cursor: pointer; font-size: 1rem; }
  .wiz-nav { display: flex; justify-content: space-between; margin-top: auto; padding-top: 0.4rem; }
  .preview-col { display: flex; flex-direction: column; min-height: 0; }
  .preview-tabs { display: flex; align-items: center; gap: 6px; padding: 6px 10px; border-bottom: 1px solid var(--border); }
  .pt-label { font-size: 0.7rem; color: var(--text-muted); text-transform: uppercase; letter-spacing: 0.05em; }
  .preview-tabs button { font-size: 0.72rem; padding: 3px 10px; border-radius: 4px; border: 1px solid var(--border); background: var(--bg-control); color: var(--text-muted); cursor: pointer; }
  .preview-tabs button.on { color: var(--text); border-color: var(--accent); }
  .preview-tabs button:disabled { opacity: 0.35; cursor: not-allowed; }
  .preview { position: relative; background: #05070c; min-height: 0; flex: 1; }
  .ph { position: absolute; inset: 0; display: flex; align-items: center; justify-content: center; text-align: center; padding: 2rem; color: var(--text-muted); font-size: 0.85rem; }
  .theme-sample { position: absolute; inset: 0; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 0.5rem; color: #e8edf4; }
  .theme-sample h1 { margin: 0; font-size: 3.4rem; color: var(--accent); }
  .theme-sample.rainbow h1 { background: var(--rainbow); -webkit-background-clip: text; background-clip: text; color: transparent; }
  .theme-sample.rainbow .ts-label { background: var(--rainbow); -webkit-background-clip: text; background-clip: text; color: transparent; }
  .theme-sample p { margin: 0; opacity: 0.75; }
  .ts-label { font-size: 0.72rem; letter-spacing: 0.2em; text-transform: uppercase; color: var(--accent); }
  .ts-foot { position: absolute; bottom: 6%; font-size: 0.7rem; opacity: 0.5; text-transform: uppercase; letter-spacing: 0.08em; }
  .sm-preview { position: absolute; inset: 0; color: #dfe7f0; }
  .sm-preview svg { width: 100%; height: 100%; }
  .sm-preview text { fill: #cfd8e4; font-size: 12px; }
  .sm-list { margin: 0; padding: 2rem 2.4rem; list-style: none; columns: 2; }
  .sm-list li { padding: 4px 0; border-bottom: 1px solid rgba(140,170,210,0.15); font-size: 0.9rem; }
  button { padding: 7px 14px; cursor: pointer; border-radius: 4px; border: 1px solid var(--border); background: var(--bg-control); color: var(--text); font: inherit; }
  button.primary { background: var(--accent); border-color: var(--accent); }
</style>
