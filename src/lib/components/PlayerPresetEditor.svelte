<script lang="ts">
  // Unified Player View — preset editor as a WIZARD (Alex 2026-07-10): General → Cover → Starmap →
  // System → Filter. Each tab has its controls on the left and a live preview of THAT stage on the
  // right. The filter is deliberately LAST (set everything up clean, then costume it) with its own
  // cover/starmap/system preview buttons: the 3D view gets the true GLSL filter, DOM views get the
  // CSS approximation (FilterFrame). Edits a DRAFT; Save commits to the campaign.
  import { createEventDispatcher, onMount } from 'svelte';
  // Grid depth was a checkbox before it was a slider; a preset saved then holds a boolean.
  // Read both rather than migrate — true becomes a full-depth curtain, false becomes flat.
  const gridDepthPct = (v: unknown): number => (typeof v === 'number' ? v : v ? 1 : 0);
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
  import Starmap3DView from '$lib/starmap/Starmap3DView.svelte';
  import FilteredDocumentView from './FilteredDocumentView.svelte';
  import { DOCUMENT_STYLES, documentStyleBase } from '$lib/catalogue/document/documentStyles';
  import TransitionParamControls from './TransitionParamControls.svelte';
  import CollapsibleSection from './CollapsibleSection.svelte';
  import { transitionRegistry } from '$lib/transitions/TransitionRegistry';
  import { starsOf } from '$lib/catalogue/document/systemTopology';
  import { MAP_OVERLAY_OPTIONS, SYSTEM_OVERLAY_OPTIONS } from '$lib/map/mapOverlay';
  import { SKY_MODE_OPTIONS, skyStarsFor, magnitudeLimitFor } from '$lib/map/skyStars';
  import DocPanel from './DocPanel.svelte';

  // D6: for the 2D/3D views the info-block preview APPEARS while you're tweaking Info Block controls
  // and hides while you're on the display (scene) controls, so each edit shows the thing it changes.
  let infoPreview = false;

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
  // The SAME control, twice: the system document and the starmap document each have their own
  // colouration and per-slot colours. `scope` picks which of the two a control is editing; the starmap
  // falls back to the system's values until it is given its own, so nothing changes for an existing
  // preset until a GM touches it.
  type ColourScope = 'system' | 'starmap';
  const styleOf = (scope: ColourScope) =>
    scope === 'starmap' ? (draft.starmapDocumentStyle ?? draft.documentStyle) : draft.documentStyle;
  const colorsOf = (scope: ColourScope) =>
    scope === 'starmap' ? (draft.starmapThemeColors ?? draft.themeColors) : draft.themeColors;
  function setDocColour(scope: ColourScope, id: string, hex: string) {
    const next = { ...(colorsOf(scope) ?? {}), [id]: hex };
    draft = scope === 'starmap' ? { ...draft, starmapThemeColors: next } : { ...draft, themeColors: next };
  }
  function applyColouration(scope: ColourScope, style: string) {
    // New colouration → reset any per-slot tweaks so the picked style's colours show cleanly.
    draft = scope === 'starmap'
      ? { ...draft, starmapDocumentStyle: style as any, starmapThemeColors: {} }
      : { ...draft, documentStyle: style as any, themeColors: {} };
  }

  export let preset: PlayerPreset;

  const dispatch = createEventDispatcher();

  let draft: PlayerPreset = structuredClone(preset);

  // Colouration swatches — reactive so they refresh when the Colouration style (or a tweak) changes.
  // The swatches must show what is ACTUALLY used, and the preset's accent seeds the accent + heading
  // slots on top of the colouration (see makeDocTheme) — so seed them the same way here.
  $: docColoursFor = (scope: ColourScope) => {
    const seed = {
      ...(documentStyleBase(styleOf(scope)) as any).colors,
      ...(draft.accentColor && draft.accentColor !== 'rainbow'
        ? { accent: draft.accentColor, heading: draft.accentColor } : {})
    };
    return DOC_COLOUR_SLOTS.map((s) => ({
      id: s.id, label: s.label,
      hex: toHex((colorsOf(scope) as any)?.[s.id] ?? seed[s.id])
    }));
  };

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

  // ── A48: collapsible sections, per GM ───────────────────────────────────────
  // The tab strip above IS the top-level grouping the item asked for — Identity/Theme, Cover,
  // Starmap, System, Transitions, Filter — and it has been there since the wizard landed. What was
  // missing is INSIDE the two long steps: the Starmap's one fieldset ran to fifteen controls and the
  // System's "3D display" to twenty, mixing four different jobs in one scroll. So the regroup is
  // within a step, and it is by WHAT A GM IS DOING rather than by which component renders it:
  // bodies, then scale and camera, then the scene and sky, then labels and markers.
  //
  // WHICH SECTIONS START OPEN IS DATA, and this is the whole of it. Everything else about a section
  // (its label, its controls, when they appear) stays at the use site, because these controls are not
  // declarable — see CollapsibleSection's header for why the FilterParamControls COMPONENT could not
  // simply be reused. A section id missing from a GM's stored map takes its default here, so adding a
  // section later opens as intended rather than arriving silently shut.
  const SECTION_DEFAULTS: Record<string, boolean> = {
    // Open on a first run: identity, and the one section per step that carries the choice everything
    // else on that step hangs off. Discovery still works; the wall does not.
    identity: true, behaviour: false, theme: false, graphics: false,
    'cover-page': true, 'cover-graphic': false,
    'starmap-stage': true, 'starmap-document': false, 'starmap-look': false,
    'starmap-background': false, 'starmap-scale': false, 'starmap-camera': false,
    'starmap-labels': false, 'starmap-graphic': false,
    'system-stage': true, 'system-look': false, 'system-background': false, 'system-scale': false,
    'system-camera': false, 'system-labels': false, 'system-info': false, 'system-graphic': false,
    transition: true,
    filter: true,
    // The per-slot palette inside the two document sections — one each, so tweaking the system's
    // colours does not silently open the starmap's.
    'colours-system': false, 'colours-starmap': false
  };
  // A GM's layout, not the preset's (A48 point 3): saving it into the preset would send one GM's
  // scroll position to a player's screen.
  const SECTION_KEY = 'sse-preset-editor-sections';
  let openSections: Record<string, boolean> = (() => {
    const out = { ...SECTION_DEFAULTS };
    if (!browser) return out;
    try {
      const saved = JSON.parse(localStorage.getItem(SECTION_KEY) || '{}');
      for (const k of Object.keys(out)) if (typeof saved?.[k] === 'boolean') out[k] = saved[k];
    } catch { /* unreadable / private mode — the defaults are a fine answer */ }
    return out;
  })();
  function setSection(id: string, open: boolean) {
    openSections = { ...openSections, [id]: open };
    try { localStorage.setItem(SECTION_KEY, JSON.stringify(openSections)); } catch { /* private mode */ }
  }

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
  // G9 preview: which starmap system the previewed System actually IS, so its sky is the real one
  // rather than an invented viewpoint. Matched on the System's own id, which is what the starmap node
  // carries; no match (a fallback example system) simply means no charted stars to show.
  $: previewSkyStars = (draft?.constellations ?? 'off') === 'off'
    ? []
    : skyStarsFor($starmapStore, ($starmapStore?.systems ?? []).find((s: any) => s.system?.id === previewSystem?.id)?.id ?? null,
        { magnitudeLimit: magnitudeLimitFor(draft.constellations ?? 'off') });
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
  // The 2D/3D info-block preview subject: the tapped body, else the primary star.
  $: previewInfoId = previewFocusId ?? ((previewSystem ? (starsOf(previewSystem)[0] as any)?.id : null) ?? null);

  // A real colour for CSS vars / non-cover components (rainbow → representative mid colour).
  $: accentCss = accentSolid(draft.accentColor);
  // Which overlay the current preview shows (cover's own image is inside CoverView).
  $: currentOverlay = previewLayer === 'starmap' ? draft.starmapOverlay : previewLayer === 'system' ? draft.systemOverlay : null;

  function save() {
    updatePreset(draft);
    dispatch('saved', draft);
    dispatch('close');
  }

  // Losing a preset's worth of design work to a stray click was far too easy: the editor filled only
  // part of the screen and ANY click on the backdrop discarded silently. Now the editor takes the whole
  // screen (so there's barely a backdrop to hit), and every exit route — backdrop, Cancel, Escape —
  // checks for unsaved changes first. `dirty` compares the draft against the preset we opened.
  $: dirty = JSON.stringify(draft) !== JSON.stringify(preset);
  function requestClose() {
    if (dirty && !confirm('You have unsaved changes to this preset. Discard them?')) return;
    dispatch('close');
  }
  function onKeydown(e: KeyboardEvent) {
    if (e.key === 'Escape') { e.preventDefault(); requestClose(); }
  }
</script>

<svelte:window on:keydown={onKeydown} />

<!-- The two DOCUMENTS — the starmap's and the system's — are configured by the same controls, in the
     same order, on their own steps. These snippets are that shared pair: pick a colouration, then tweak
     its slots. `scope` says which document is being edited. Anything genuinely stage-specific (an
     arrangement, a body graphic) sits ABOVE them on its own step, so the important choice is nearest
     the top and the fiddly palette is where a reader has learned to expect it. -->
{#snippet colouration(scope: ColourScope)}
  <!-- A documentStyle SEEDS the colours; the slots below then override individual ones. Layout is the
       same across styles — only the palette (and the fonts, set on General) changes. -->
  <label>Colouration
    <select value={styleOf(scope)}
      on:change={(e) => applyColouration(scope, (e.currentTarget as HTMLSelectElement).value)}>
      {#each DOCUMENT_STYLES as ds}<option value={ds.value}>{ds.label}</option>{/each}
    </select>
  </label>
{/snippet}

{#snippet colourSlots(scope: ColourScope)}
  <!-- A48: this was a bare <details>/<summary> — a SECOND collapsing idiom in the same editor, which
       is the duplication this codebase keeps finding. Same component as every other section now; its
       open state is remembered with them, per scope so the two documents do not share one. -->
  <CollapsibleSection nested label="Colours" open={openSections['colours-' + scope] ?? false}
    on:toggle={(e) => setSection('colours-' + scope, e.detail)}>
    <div class="doc-colours">
      {#each docColoursFor(scope) as slot (slot.id)}
        <label class="col-row"><span>{slot.label}</span>
          <input type="color" value={slot.hex}
            on:input={(e) => setDocColour(scope, slot.id, (e.currentTarget as HTMLInputElement).value)} />
        </label>
      {/each}
    </div>
  </CollapsibleSection>
{/snippet}

<!-- svelte-ignore a11y-click-events-have-key-events a11y-no-static-element-interactions -->
<div class="modal-bg" on:click={requestClose}>
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
        <button on:click={requestClose}>Cancel</button>
        <button class="primary" on:click={save}>Save</button>
      </div>
    </header>

    <div class="body">
      <div class="controls">
        {#if tab === 'general'}
          <CollapsibleSection label="Identity" open={openSections['identity']}
            on:toggle={(e) => setSection('identity', e.detail)}>
            <label>Name <input type="text" bind:value={draft.name} /></label>
            <label>Description <input type="text" bind:value={draft.description} /></label>
          </CollapsibleSection>
          <CollapsibleSection label="Behaviour" open={openSections['behaviour']}
            on:toggle={(e) => setSection('behaviour', e.detail)}>
            <label class="chk"><input type="checkbox" bind:checked={draft.followGM} /> Follows the GM (projection-style)</label>
            <label class="chk"><input type="checkbox" bind:checked={draft.interactive} /> Players can click / focus / scrub</label>
            <label>Default time
              <select bind:value={draft.defaultRateIndex}>
                {#each RATE_STEPS as r, i}<option value={i}>1 s ≈ {r.label}</option>{/each}
              </select>
            </label>
            <label class="chk"><input type="checkbox" bind:checked={draft.defaultPlaying} /> Start playing (unticked = paused)</label>
          </CollapsibleSection>
          <CollapsibleSection label="Theme (every stage)" open={openSections['theme']}
            on:toggle={(e) => setSection('theme', e.detail)}>
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
          </CollapsibleSection>
          <CollapsibleSection label="Graphics library" open={openSections['graphics']}
            on:toggle={(e) => setSection('graphics', e.detail)}>
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
          </CollapsibleSection>
        {:else if tab === 'cover'}
          <CollapsibleSection label="Cover page" open={openSections['cover-page']}
            on:toggle={(e) => setSection('cover-page', e.detail)}>
            <label class="chk"><input type="checkbox" bind:checked={draft.cover.enabled} /> This preset has a cover / hold screen</label>
            {#if draft.cover.enabled}
              <label>Title <input type="text" bind:value={draft.cover.title} placeholder="DON'T PANIC" /></label>
              <label>Subtitle <input type="text" bind:value={draft.cover.subtitle} /></label>
              <label>Body <input type="text" bind:value={draft.cover.body} /></label>
              <label>Label / stamp <input type="text" bind:value={draft.cover.label} placeholder="CONFIDENTIAL" /></label>
            {/if}
          </CollapsibleSection>
          {#if draft.cover.enabled}
            <CollapsibleSection label="Cover graphic" open={openSections['cover-graphic']}
              on:toggle={(e) => setSection('cover-graphic', e.detail)}>
              <GraphicPlacementControls placement={draft.cover.graphic} assets={$playerAssetList} label="Image"
                on:change={(e) => (draft = { ...draft, cover: { ...draft.cover, graphic: e.detail } })} />
            </CollapsibleSection>
          {/if}
        {:else if tab === 'starmap'}
          <CollapsibleSection label="Starmap stage" open={openSections['starmap-stage']}
            on:toggle={(e) => setSection('starmap-stage', e.detail)}>
            <label class="chk"><input type="checkbox" bind:checked={draft.starmapEnabled} /> Players get a starmap level</label>
            {#if !draft.starmapEnabled}
              <!-- WS5 lock-down: no starmap ⇒ the player is dropped into ONE system and can never reach
                   the map. Pin WHICH system here so a shared link always lands in the same place. -->
              <label>Players are locked to
                <select value={draft.pinnedSystemId ?? ''}
                  on:change={(e) => (draft = { ...draft, pinnedSystemId: (e.currentTarget as HTMLSelectElement).value || undefined })}>
                  <option value="">First system on the map</option>
                  {#each ($starmapStore?.systems ?? []) as s (s.id)}<option value={s.id}>{s.name}</option>{/each}
                </select>
              </label>
              <p class="hint">Players drop straight into this system with no way back to the starmap. Leave
                as "first system" to follow whatever is first on the map.</p>
            {:else}
              <label>View
                <select bind:value={draft.starmapView}>
                  <option value="list">Document</option>
                  <option value="diagram2d">2D map</option>
                  <option value="holo3d">3D map</option>
                </select>
              </label>
            {/if}
          </CollapsibleSection>

          {#if draft.starmapEnabled && draft.starmapView === 'list'}
            <!-- The DOCUMENT starmap: the shape of the page, then its palette. -->
            <CollapsibleSection label="Document page" open={openSections['starmap-document']}
              on:toggle={(e) => setSection('starmap-document', e.detail)}>
              <!-- G1: the ARRANGEMENT — the shape the same content takes. It composes with the document
                   colouration and list style rather than replacing them, so the looks multiply. -->
              <label>Arrangement
                <select bind:value={draft.starmapLayout}>
                  <option value="list">Index — one row per system</option>
                  <option value="dossier">Dossier — a form per system</option>
                  <option value="glyphs">Catalogue — name and its worlds, drawn</option>
                  <option value="diagram">Diagram — compact system shapes</option>
                  <option value="diagram-full">Diagram — full, with names</option>
                </select>
              </label>
              <p class="hint">The shape of the page. Colouration and fonts apply on top.</p>
              {#if draft.starmapLayout === 'dossier'}
                <label class="chk"><input type="checkbox" bind:checked={draft.starmapFieldIcons} /> Field icons</label>
              {/if}
              <!-- Every width in the arrangements derives from the text scale — the card grid's column
                   count, the dossier's field columns, the glyph row's disc size — so this one slider is
                   what sizes the whole page, not just its type. -->
              <label>Text size <span>{Math.round((draft.starmapFontScale ?? 1) * 100)}%</span>
                <input type="range" min="0.7" max="1.8" step="0.05"
                  value={draft.starmapFontScale ?? 1}
                  on:input={(e) => (draft = { ...draft, starmapFontScale: Number((e.currentTarget as HTMLInputElement).value) })} />
              </label>
              <p class="hint">Sizes the layout as well as the type.</p>
              <!-- The starmap document's OWN palette, same controls and same order as the system
                   document's. No greyscale CHECKBOX here: the colouration list already offers it, and
                   picking it sets monochrome by itself (makeDocTheme) — one lever, not two that have
                   to agree. The 2D/3D map branch below keeps its checkbox, having no palette list. -->
              {@render colouration('starmap')}
              {#if styleOf('starmap') !== 'greyscale'}
                {@render colourSlots('starmap')}
              {/if}
            </CollapsibleSection>
          {/if}

          <!-- 2D and 3D starmap are the same engine (2D = overhead), so both get the look controls. -->
          {#if draft.starmapEnabled && (draft.starmapView === 'holo3d' || draft.starmapView === 'diagram2d')}
            <!-- Same skeleton as the System step, deliberately: look, then the ground it sits on,
                 then scale, then camera, then what is written on it. A GM who has learnt one stage's
                 shape should not have to learn the other's. -->
            <CollapsibleSection label="Look &amp; feel" open={openSections['starmap-look']}
              on:toggle={(e) => setSection('starmap-look', e.detail)}>
              <label class="chk"><input type="checkbox" bind:checked={draft.starmapMono} /> Monochrome (bleach &mdash; for a tinting filter)</label>
              <label class="chk"><input type="checkbox" bind:checked={draft.starmapRouteGlow} /> Glowing routes</label>
              <!-- The stems tie each system to the reference plane and the rings mark where they
                   land, which is what makes an exaggerated depth readable — you cannot otherwise
                   tell above from below. On a map with real depth and a crowded field they are also
                   the loudest thing on it, so this is a trade rather than a tidy-up. -->
              <label class="chk" title="The vertical lines down to the plane and the rings at their feet. Off is cleaner; depth becomes harder to judge."><input type="checkbox" checked={draft.starmapDropLines !== false} on:change={(e) => (draft.starmapDropLines = e.currentTarget.checked)} /> Depth tethers</label>
            </CollapsibleSection>

            <CollapsibleSection label="Background" open={openSections['starmap-background']}
              on:toggle={(e) => setSection('starmap-background', e.detail)}>
              <label>Overlay
                <select bind:value={draft.grid}>
                  {#each MAP_OVERLAY_OPTIONS as o}<option value={o.value}>{o.label}</option>{/each}
                </select>
              </label>
              <!-- The z-axis curtain: each grid line at full intensity with a skirt fading away
                   BELOW it, which is what gives the lattice its dimensional look. 3D only — the 2D
                   starmap is this renderer locked overhead, where a curtain is edge-on and invisible.
                   A slider rather than a switch: how deep it hangs is the whole of the effect. -->
              {#if draft.starmapView === 'holo3d' && draft.grid !== 'off'}
                <label>Grid depth <span>{Math.round(gridDepthPct(draft.starmapGridDepth) * 100)}%</span><input type="range" min="0" max="1" step="0.05" value={gridDepthPct(draft.starmapGridDepth)} on:input={(e) => (draft.starmapGridDepth = +e.currentTarget.value)} /></label>
              {/if}
              <!-- G4: one dial for every overlay type, polar included — near cells bright, falling
                   away with distance so the grid reads as ground rather than fighting the map. -->
              {#if draft.grid !== 'off'}
                <label>Grid falloff <span>{Math.round((draft.starmapGridFalloff ?? 0.5) * 100)}%</span><input type="range" min="0" max="1" step="0.05" bind:value={draft.starmapGridFalloff} /></label>
              {/if}
              <p class="hint">The starfield and the space/greenscreen backdrop are set once on the System step &mdash; one campaign, one backdrop, both stages.</p>
            </CollapsibleSection>

            {#if draft.starmapView === 'holo3d'}
              <CollapsibleSection label="Scaling" open={openSections['starmap-scale']}
                on:toggle={(e) => setSection('starmap-scale', e.detail)}>
                <!-- WS7: stretch DEPTH so it reads on screen. Visual only — journey distances are
                     unaffected (see lib/map/systemDistance.ts). 1x = true depth. -->
                <label>Depth exaggeration <span>{(draft.zExaggeration ?? 1) === 1 ? 'true depth' : (draft.zExaggeration ?? 1) + '×'}</span>
                  <input type="range" min="1" max="20" step="0.5" value={draft.zExaggeration ?? 1}
                    on:input={(e) => (draft = { ...draft, zExaggeration: Number((e.currentTarget as HTMLInputElement).value) })} />
                </label>
                <p class="hint">Lifts systems off the map plane so their depth reads on a tilted view. Display only &mdash; journey distances never change. A map with real depth is already dramatic at 1x, so a little goes a long way; zoom out if you push it.</p>
              </CollapsibleSection>
            {/if}

            <CollapsibleSection label="Camera" open={openSections['starmap-camera']}
              on:toggle={(e) => setSection('starmap-camera', e.detail)}>
              {#if draft.starmapView === 'holo3d'}
                <label>View angle <span>{Math.round(draft.angleDeg)}°</span><input type="range" min="0" max="80" step="1" bind:value={draft.angleDeg} /></label>
              {:else}
                <!-- 2D only: keeps the classic flat fixed starmap. Zoom + pan still work either way. -->
                <label class="chk"><input type="checkbox" bind:checked={draft.lockRotation} /> Lock rotation (fixed flat map)</label>
              {/if}
            </CollapsibleSection>

            <CollapsibleSection label="Labels &amp; markers" open={openSections['starmap-labels']}
              on:toggle={(e) => setSection('starmap-labels', e.detail)}>
              <label>Label size <span>{draft.labelSize}px</span><input type="range" min="8" max="24" step="1" bind:value={draft.labelSize} /></label>
              <p class="hint">Marker SHAPE (chip / pin / flag) is one choice for both maps and is set on the System step.</p>
            </CollapsibleSection>
          {/if}

          {#if !draft.starmapEnabled}
            <p class="hint">Disabled: players skip straight to the system level; no back-to-systems navigation is shown.</p>
          {:else}
            <CollapsibleSection label="Overlay graphic" open={openSections['starmap-graphic']}
              on:toggle={(e) => setSection('starmap-graphic', e.detail)}>
              <GraphicPlacementControls placement={draft.starmapOverlay} assets={$playerAssetList} label="Overlay image"
                on:change={(e) => (draft = { ...draft, starmapOverlay: e.detail })} />
            </CollapsibleSection>
          {/if}
        {:else if tab === 'system'}
          <CollapsibleSection label="System stage" open={openSections['system-stage']}
            on:toggle={(e) => setSection('system-stage', e.detail)}>
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
          </CollapsibleSection>
          {#if draft.systemEnabled}
            {#if draft.systemView === 'holo3d' || draft.systemView === 'diagram2d'}
              <!-- DISPLAY (orrery/scene) controls, split by WHAT A GM IS DOING rather than by which
                   renderer owns the setting: what the bodies look like, how the system is scaled and
                   framed, what surrounds it, and what is written on it. They share ONE wrapper because
                   they share ONE behaviour — interacting anywhere in here HIDES the info-block preview
                   so you can see the scene, and the Info block section below brings it back. Keeping
                   that on the wrapper rather than repeating it four times is also what makes clicking
                   a section HEADER switch the preview, which is what you want when you open it. -->
              <!-- svelte-ignore a11y-no-noninteractive-element-interactions -->
              <div class="scene-sections" on:pointerdown={() => (infoPreview = false)} on:focusin={() => (infoPreview = false)}>
                <CollapsibleSection label="Look &amp; feel" open={openSections['system-look']}
                  on:toggle={(e) => setSection('system-look', e.detail)}>
                  <label>Colour
                    <select bind:value={draft.bodyStyle}>
                      <option value="textured">True colour</option>
                      <option value="flat">Flat colour</option>
                      <option value="white">Monochrome (for tinting filters)</option>
                    </select>
                  </label>
                  {#if draft.systemView === 'holo3d'}
                    <!-- Lighting and Render are ORTHOGONAL, which is why this is its own two-option
                         dropdown above Render rather than a mode folded into it: seven render styles
                         times two lighting states would be a fourteen-item list where two small ones
                         say the same thing more clearly. 3D only — a 2D map is forced unlit
                         (systemStageStyle), so offering the choice there would be a control that
                         does nothing. -->
                    <label>Lighting
                      <select value={draft.unlit ? 'flat' : 'lit'}
                        on:change={(e) => (draft = { ...draft, unlit: (e.currentTarget as HTMLSelectElement).value === 'flat' })}>
                        <option value="lit">Lit — a star casts light and shadow</option>
                        <option value="flat">Flat — no lighting (efficient 2D look)</option>
                      </select>
                    </label>
                  {/if}
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
                  <label>Belts &amp; rings
                    <select bind:value={draft.beltStyle}>
                      <option value="rocks">Rocks</option>
                      <option value="band">Grey bands (like the GM orrery)</option>
                    </select>
                  </label>
                  <label class="chk"><input type="checkbox" bind:checked={draft.auroras} /> Auroras</label>
                  {#if draft.systemView === 'holo3d'}
                    <label class="chk"><input type="checkbox" checked={draft.lensing !== false} on:change={(e) => draft.lensing = e.currentTarget.checked} /> Black-hole gravitational lensing</label>
                  {/if}
                </CollapsibleSection>

                <CollapsibleSection label="Background" open={openSections['system-background']}
                  on:toggle={(e) => setSection('system-background', e.detail)}>
                  <label>Background
                    <select bind:value={draft.background}>
                      <option value="space">Space</option>
                      <option value="green">Greenscreen</option>
                      <option value="blue">Bluescreen</option>
                      <option value="black">Black</option>
                    </select>
                  </label>
                  <label>Overlay
                    <select bind:value={draft.grid}>
                      {#each SYSTEM_OVERLAY_OPTIONS as o}<option value={o.value}>{o.label}</option>{/each}
                    </select>
                  </label>
                  <!-- G4: the same falloff dial the starmap has, on the system view's ground grid. Its
                       OWN field, defaulted to 0 — the system grid has always been evenly lit and should
                       not change unless a GM asks. Deliberately not sharing `starmapGridFalloff`: the
                       grid TYPE already shares one field across both stages and that is a recorded fault. -->
                  {#if draft.grid !== 'off'}
                    <label>Grid falloff <span>{Math.round((draft.gridFalloff ?? 0) * 100)}%</span><input type="range" min="0" max="1" step="0.05" bind:value={draft.gridFalloff} /></label>
                  {/if}
                  <label class="chk"><input type="checkbox" bind:checked={draft.skybox} /> Starfield</label>
                  <!-- G9: the campaign's OWN charted systems, drawn into that starfield at their true
                       direction, brightness and colour. An enum rather than a tickbox because the third
                       state is a different claim, not a decoration: diffraction spikes are an INSTRUMENT
                       artifact, so they read as "annotated" rather than as something an eye would see.
                       Only meaningful over the starfield, so it follows it. -->
                  {#if draft.skybox}
                    <label>Charted stars
                      <select bind:value={draft.constellations}>
                        {#each SKY_MODE_OPTIONS as o}<option value={o.value}>{o.label}</option>{/each}
                      </select>
                    </label>
                    {#if (draft.constellations ?? 'off') !== 'off'}
                      <!-- ONE dial for the contrast between the two populations: it fades the generic
                           starfield back and lifts the charted stars together. Pushing only one of them
                           runs out of headroom before they separate. The right-hand end deliberately
                           oversaturates — past that point it is presentation, not apparent magnitude. -->
                      <label>Star boost <span>{Math.round((draft.constellationBoost ?? 0.35) * 100)}%</span><input type="range" min="0" max="1" step="0.05" bind:value={draft.constellationBoost} /></label>
                      {#if draft.constellations === 'marked'}
                        <!-- 0 is OFF, and it is the point of the control as much as the sizing is: with
                             names off you get the diffraction spikes alone, which is the cleaner way to
                             read a pattern. -->
                        <label>Name size <span>{(draft.constellationLabelSize ?? 11) > 0 ? `${draft.constellationLabelSize ?? 11} px` : 'Off'}</span><input type="range" min="0" max="28" step="1" bind:value={draft.constellationLabelSize} /></label>
                      {/if}
                    {/if}
                  {/if}
                </CollapsibleSection>

                <CollapsibleSection label="Scaling" open={openSections['system-scale']}
                  on:toggle={(e) => setSection('system-scale', e.detail)}>
                  <!-- Both dials share a convention that nothing on screen was saying: the LEFT end is
                       physical truth (0% spread = true distances; body size "true" = true radii) and the
                       right end is the readable exaggeration. The green pip marks the ACTUAL end, and the
                       read-out turns green when the dial is on it. -->
                  <label>Body size <span class:actual-on={draft.bodySize === 0}>{draft.bodySize === 0 ? 'actual size' : draft.bodySize >= 1 ? 'readable' : Math.round(draft.bodySize * 100) + '%'}</span>
                    <div class="range-actual" title="Left end = actual (true) body sizes"><span class="actual-pip" aria-hidden="true"></span><input type="range" min="0" max="1" step="0.05" bind:value={draft.bodySize} /></div>
                  </label>
                  <label>Spread <span class:actual-on={draft.compression === 0}>{draft.compression === 0 ? 'actual distances' : Math.round(draft.compression * 100) + '%'}</span>
                    <div class="range-actual" title="Left end = actual (true) distances"><span class="actual-pip" aria-hidden="true"></span><input type="range" min="0" max="1" step="0.05" bind:value={draft.compression} /></div>
                  </label>
                  {#if draft.beltStyle !== 'band'}
                    <!-- Only the rock field has a particle budget; a band is one flat shape. Its STYLE is
                         a look and lives above; how many rocks it spends is a scale, and lives here. -->
                    <label>Belt detail <span>{Math.round(draft.beltDetail * 100)}%</span><input type="range" min="0" max="1" step="0.05" bind:value={draft.beltDetail} /></label>
                  {/if}
                </CollapsibleSection>

                <CollapsibleSection label="Camera" open={openSections['system-camera']}
                  on:toggle={(e) => setSection('system-camera', e.detail)}>
                  {#if draft.systemView === 'holo3d'}
                    <!-- 3D only: a flat map has no tilt to set, and no turntable to spin. -->
                    <label>View angle <span>{Math.round(draft.angleDeg)}°</span><input type="range" min="0" max="80" step="1" bind:value={draft.angleDeg} disabled={draft.lockOverhead} /></label>
                    <label class="chk"><input type="checkbox" bind:checked={draft.lockOverhead} /> Lock overhead (2D look)</label>
                  {:else}
                    <!-- 2D only, in the tilt's place: a flat map stays fixed unless you say otherwise. -->
                    <label class="chk"><input type="checkbox" bind:checked={draft.lockRotation} /> Lock rotation (fixed flat map)</label>
                  {/if}
                  <!-- Both: off = tapping a body zooms to it (GM-orrery style); on = a fixed whole-system
                       plan view that never zooms. -->
                  <label class="chk"><input type="checkbox" bind:checked={draft.whole} /> Frame whole system (never zoom to a body)</label>
                  {#if draft.systemView === 'holo3d'}
                    <label>View orbit <span>{draft.orbitSpeed === 0 ? 'off' : Math.round(draft.orbitSpeed * 100) + '%'}</span><input type="range" min="0" max="1" step="0.05" bind:value={draft.orbitSpeed} /></label>
                  {/if}
                </CollapsibleSection>

                <CollapsibleSection label="Labels & markers" open={openSections['system-labels']}
                  on:toggle={(e) => setSection('system-labels', e.detail)}>
                  <label>Label size <span>{draft.labelSize}px</span><input type="range" min="8" max="24" step="1" bind:value={draft.labelSize} /></label>
                  <!-- ONE field, both maps. The colour is never chosen here: it always comes from the tag
                       or its category, so a faction flies its own colour whichever shape is picked. -->
                  <label>Highlighted tags
                    <select bind:value={draft.markerStyle}>
                      <option value="label">Tag chips — as they look in the panels</option>
                      <option value="pin">Map pins — initials on a pin</option>
                      <option value="flag">Flags — a chip on a staff</option>
                    </select>
                  </label>
                  <p class="hint">How a tag you have highlighted appears on the players' system map and starmap. Every shape carries its text, so it still reads under a CRT or colour-blind filter. Choose what to highlight in <strong>Find by tag</strong>.</p>
                </CollapsibleSection>
              </div>
            {/if}
            <!-- svelte-ignore a11y-no-noninteractive-element-interactions -->
            <div class="scene-sections" on:pointerdown={() => (infoPreview = true)} on:focusin={() => (infoPreview = true)}>
              <CollapsibleSection label="Info block appearance" open={openSections['system-info']}
                on:toggle={(e) => setSection('system-info', e.detail)}>
                {#if draft.systemView === 'document'}
                  <!-- Colouration: a documentStyle SEEDS the colours, then tweak each slot. Layout is the
                       same across styles — only the palette (and fonts, set on General) changes. -->
                  {@render colouration('system')}
                  <label>Colour
                    <select bind:value={draft.bodyStyle}>
                      <option value="textured">True colour</option>
                      <option value="flat">Flat colour (by type)</option>
                      <option value="white">Greyscale (for tinting filters)</option>
                    </select>
                  </label>
                  {#if draft.bodyStyle !== 'white' && draft.documentStyle !== 'greyscale'}
                    {@render colourSlots('system')}
                  {/if}
                {/if}
                <!-- "Body graphics" is the per-body PICTURE in the info block — now for EVERY view (D6:
                     the 2D/3D panels render through the same engine). The 3D orrery itself stays spheres. -->
                <label>Body graphics
                  <select bind:value={draft.bodyGfx}>
                    <option value="sphere">3D sphere</option>
                    <option value="photo">Photo</option>
                    <option value="disc">Simple disc</option>
                    <option value="flat">Flat shape</option>
                    <option value="none">None</option>
                  </select>
                </label>
                {#if draft.systemView === 'document' && draft.bodyGfx === 'sphere'}
                  <!-- The 3D body graphic is the real holo render, so it takes the same render styles. -->
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
                {/if}
                {#if draft.bodyGfx === 'photo'}
                  <label>Photo framing
                    <select bind:value={draft.photoFrame}>
                      <option value="letterbox">Letterbox band</option>
                      <option value="full">Full image</option>
                      <option value="sliver">Vertical sliver</option>
                    </select>
                  </label>
                {/if}
                <label>Tags
                  <select bind:value={draft.tagStyle}>
                    <option value="pills">Coloured pills</option>
                    <option value="grouped">Grouped pills</option>
                    <option value="grouped-list">Grouped list (headings, plain)</option>
                    <option value="list">Plain list</option>
                  </select>
                </label>
                {#if draft.systemView === 'document'}
                  <label>Navigation
                    <select bind:value={draft.navStyle}>
                      <option value="chips">Buttons — side by side</option>
                      <option value="boxed">Buttons — one per row</option>
                      <option value="plain">Plain text</option>
                    </select>
                  </label>
                {/if}
                <!-- The list GLYPHS are normally seeded by the colouration; this overrides them for both
                     stages. 'cards' is the one that changes the shape rather than the bullet. -->
                <label>Lists
                  <select value={draft.listStyle ?? ''}
                    on:change={(e) => { const v = (e.currentTarget as HTMLSelectElement).value;
                      draft = { ...draft, listStyle: (v || undefined) as any }; }}>
                    <option value="">From the colouration</option>
                    <option value="plain">Plain bullets</option>
                    <option value="illustrated-bullets">Illustrated bullets</option>
                    <option value="numbered-dossier">Numbered</option>
                    <option value="terminal-log">Terminal log</option>
                    <option value="ledger">Ruled rows</option>
                    <option value="manifest">Manifest</option>
                    <option value="cards">Pickable cards</option>
                  </select>
                </label>
                <!-- A29: a star catalogue holds what a ship CAN carry; only an instrument knows what is in
                     the tanks now. Off = capacity alone, on = current-of-capacity. -->
                <label class="chk"><input type="checkbox" bind:checked={draft.liveReadings} /> Live readings</label>
                <p class="hint">Fuel, cargo and crew as they are now, not just capacity.</p>
                <label class="chk"><input type="checkbox" bind:checked={draft.hideInfoPanel} /> Hide body info {draft.systemView === 'document' ? 'block' : 'panel'} (clean display)</label>
                {#if !draft.hideInfoPanel}
                  <!-- Panel WIDTH is a docked side-panel concept (holo / 2D map). The document's info block is
                       part of the page, so it has no width to set — only a text size. -->
                  {#if draft.systemView === 'holo3d' || draft.systemView === 'diagram2d'}
                    <label>Info panel width (desktop) <span>{Math.round(draft.inspectorWidthPct * 100)}% of screen</span><input type="range" min="0.15" max="0.5" step="0.01" bind:value={draft.inspectorWidthPct} /></label>
                  {/if}
                  {#if draft.systemView !== 'list'}
                    <label>Info text size <span>{Math.round(draft.infoFontScale * 100)}%</span><input type="range" min="0.8" max="2.5" step="0.05" bind:value={draft.infoFontScale} /></label>
                  {/if}
                {/if}
              </CollapsibleSection>
            </div>
            <CollapsibleSection label="Overlay graphic" open={openSections['system-graphic']}
              on:toggle={(e) => setSection('system-graphic', e.detail)}>
              <GraphicPlacementControls placement={draft.systemOverlay} assets={$playerAssetList} label="Overlay image"
                on:change={(e) => (draft = { ...draft, systemOverlay: e.detail })} />
            </CollapsibleSection>
          {/if}
        {:else if tab === 'transitions'}
          <CollapsibleSection label="Page transition" open={openSections['transition']}
            on:toggle={(e) => setSection('transition', e.detail)}>
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
          </CollapsibleSection>
        {:else if tab === 'filter'}
          <CollapsibleSection label="Visual filter" open={openSections['filter']}
            on:toggle={(e) => setSection('filter', e.detail)}>
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
          </CollapsibleSection>
        {/if}

        <div class="wiz-nav">
          <!-- No Back on the first step — a greyed-out button there is just noise. -->
          {#if tabIndex > 0}
            <button on:click={() => (tab = TABS[tabIndex - 1].id)}>‹ Back</button>
          {:else}
            <span></span>
          {/if}
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
              <Starmap3DView starmap={$starmapStore} accentColor={accentCss} font={draft.font} grid={draft.grid} gridDepth={gridDepthPct(draft.starmapGridDepth)} gridFalloff={draft.starmapGridFalloff ?? 0.5} routeGlow={draft.starmapRouteGlow} dropLines={draft.starmapDropLines !== false} mono={draft.starmapMono} mapGrid={previewMapGrid} zExaggeration={draft.zExaggeration ?? 1}
                flat={draft.starmapView === 'diagram2d'}
                lockRotation={draft.starmapView === 'diagram2d' && draft.lockRotation !== false}
                background={draft.background} angleDeg={draft.starmapView === 'diagram2d' ? 0 : draft.angleDeg} labelSize={draft.labelSize} markerStyle={draft.markerStyle} filter={filterActive ? draft.filter : 'none'} filterParams={draft.filterParams} />
            {:else}
              <!-- D9: the starmap DOCUMENT — same engine + theme as the system document, real filter. -->
              <FilteredDocumentView stage="starmap" starmap={$starmapStore} {rulePack}
                font={draft.font} headingFont={draft.headingFont} accent={draft.accentColor} mono={draft.starmapMono}
                listStyle={draft.listStyle} navStyle={draft.navStyle}
                documentStyle={draft.starmapDocumentStyle ?? draft.documentStyle}
                themeColors={draft.starmapThemeColors ?? draft.themeColors}
                starmapLayout={draft.starmapLayout} starmapFieldIcons={draft.starmapFieldIcons !== false}
                fontScale={draft.starmapFontScale ?? draft.infoFontScale}
                filterId={draft.filter} filterParams={draft.filterParams}
                companyName={draft.companyName} footerText={draft.footerText}
                selectable={false} />
            {/if}
          {:else if previewLayer === 'system'}
            {#if !draft.systemEnabled}
              <div class="ph">System stage is disabled for this preset.</div>
            <!-- BOTH map views are the holo (the 2D map is it locked flat) and run the real shader
                 themselves — systemStageStyle is the same one the live player view uses, so this preview
                 can't drift from what players actually get. -->
            {:else if (draft.systemView === 'holo3d' || draft.systemView === 'diagram2d') && previewSystem && rulePack}
              <div class="holo-wrap">
                <!-- markerStyle is previewed live: the GM is choosing a LOOK, so they have to see it.
                     The selection itself comes from the live overrides, exactly as the players' view
                     will read it, so the preview cannot show a different set of badges. -->
                <HoloView system={previewSystem} {currentTime} style={systemPreviewStyle} skyStars={previewSkyStars}
                  markerStyle={draft.markerStyle}
                  focusedBodyId={previewFocusId} on:focus={(e) => (previewFocusId = e.detail)} />
                {#if infoPreview && !draft.hideInfoPanel}
                  <!-- Info-block preview (D6): the SAME DocPanel players get, docked like the live view.
                       Shows while Info Block controls are being tweaked; display controls hide it. -->
                  <!-- The panel is a PROPORTION of the stage, so the preview shows the same proportion the
                       players will see. It used to be the raw pixel figure capped at 340, which meant the
                       top half of the slider's travel moved nothing on screen at all. -->
                  <aside class="preview-insp" style="width:{Math.round(draft.inspectorWidthPct * 100)}%; font-family:{draft.font}; font-size:{Math.round(13 * draft.infoFontScale)}px">
                    <DocPanel system={previewSystem} selectedId={previewInfoId} {rulePack} liveReadings={draft.liveReadings}
                      font={draft.font} headingFont={draft.headingFont} accent={draft.accentColor} mono={draft.bodyStyle === 'white'}
                      fontScale={draft.infoFontScale} listStyle={draft.listStyle} documentStyle={draft.documentStyle}
                      tagStyle={draft.tagStyle} themeColors={draft.themeColors}
                      imagery={draft.bodyGfx} photoFrame={draft.photoFrame}
                      bodyRender={draft.render} bodyStyle={draft.bodyStyle} interactive={true} transparentBg />
                  </aside>
                {/if}
              </div>
            {:else if draft.systemView === 'document' && previewSystem}
              <!-- The WS2 Guide document, drawn through the real filter exactly as players get it. Tap a
                   world on the schematic (or a navigator row) to drill in — the info block is in-page. -->
              <FilteredDocumentView
                system={previewSystem} selectedId={previewFocusId} {rulePack} liveReadings={draft.liveReadings}
                font={draft.font} headingFont={draft.headingFont} accent={draft.accentColor} mono={draft.bodyStyle === 'white'}
                colorful={draft.accentColor === 'rainbow'}
                imagery={draft.bodyGfx} photoFrame={draft.photoFrame}
                hideInfoBlock={draft.hideInfoPanel}
                transition={draft.transition} transitionParams={draft.transitionParams ?? {}}
                bodyRender={draft.render} bodyStyle={draft.bodyStyle}
                listStyle={draft.listStyle} documentStyle={draft.documentStyle} tagStyle={draft.tagStyle} navStyle={draft.navStyle} themeColors={draft.themeColors}
                fontScale={draft.infoFontScale}
                filterId={draft.filter} filterParams={draft.filterParams}
                companyName={draft.companyName} footerText={draft.footerText}
                tips={draft.guideTips && draft.guideTips !== 'off' ? {
                  top: (draft.guideTips === 'top' || draft.guideTips === 'both') ? 'Sample header note — players see a fresh quip each page.' : undefined,
                  bottom: (draft.guideTips === 'bottom' || draft.guideTips === 'both') ? 'Sample footer note — reserved space, wrecked by the filter.' : undefined
                } : null}
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
  /* Full-screen editor: the design surface deserves the room, and there is essentially no backdrop
     left to mis-click. A hair of inset keeps it readable as a layer above the app. */
  .modal-bg { position: fixed; inset: 0; background: rgba(0,0,0,0.86); display: flex; justify-content: center; align-items: center; z-index: 2100; }
  .modal { background: var(--bg-panel); color: var(--text); border-radius: 6px; width: 100vw; max-width: 100vw; height: 100vh; display: flex; flex-direction: column; overflow: hidden; }
  @media (min-width: 900px) { .modal { width: calc(100vw - 16px); max-width: calc(100vw - 16px); height: calc(100vh - 16px); } }
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
  /* A48: every group is a CollapsibleSection now, which carries its own box and head. The one thing
     that has to live here is the gap between sibling sections inside a group wrapper. */
  .scene-sections { display: flex; flex-direction: column; gap: 0.9rem; min-width: 0; }
  label { display: flex; flex-direction: column; gap: 3px; font-size: 0.75rem; color: var(--text-muted); }
  label span { color: var(--text); font-size: 0.72rem; }
  label.inline, label.chk { flex-direction: row; align-items: center; gap: 8px; font-size: 0.8rem; color: var(--text); }
  input[type=text], select { background: var(--bg-control); color: var(--text); border: 1px solid var(--border); border-radius: 4px; padding: 5px 7px; font: inherit; }
  input[type=range] { width: 100%; accent-color: var(--accent, #6aa0ff); }
  /* "Actual" pip: a green marker pinned at the left (physical-truth) end of a scale dial. */
  .range-actual { position: relative; display: flex; align-items: center; }
  .range-actual input { flex: 1; }
  .actual-pip { position: absolute; left: 1px; top: 50%; transform: translateY(-50%); width: 7px; height: 7px; border-radius: 50%; background: #35c96b; box-shadow: 0 0 4px rgba(53, 201, 107, 0.8); pointer-events: none; z-index: 1; }
  .actual-on { color: #35c96b !important; }
  .hint { font-size: 0.72rem; color: var(--text-muted); font-style: italic; margin: 0; line-height: 1.4; }
  .filter-params { border-left: 2px solid var(--border); padding-left: 8px; margin: 2px 0; }
  .holo-wrap { position: relative; width: 100%; height: 100%; }
  .preview-insp {
    position: absolute; top: 10px; right: 10px; bottom: 10px; overflow-y: auto;
    background: rgba(6, 8, 13, 0.97); border: 1px solid var(--border); border-radius: 8px; padding: 12px;
  }
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
