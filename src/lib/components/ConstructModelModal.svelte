<script lang="ts">
  // G3 stage 3: the model import modal - pick a file, see EXACTLY what will be stored (the
  // preview parses the converted bytes back, not the upload), fix its orientation in 90-degree
  // steps, attach attribution, save. Conversion runs eagerly on file choice so the caps and the
  // simplification report are in front of the GM before they commit to anything.
  import { createEventDispatcher, onMount, onDestroy } from 'svelte';
  import * as THREE from 'three';
  import type { CelestialBody, ModelRef } from '$lib/types';
  import { parseModel, type ParsedModel } from '$lib/constructs/modelImport';
  import { convertParsedModel, MODEL_WARN_BYTES, type ConvertResult } from '$lib/constructs/modelConvert';
  import { putModel } from '$lib/constructs/modelStore';
  import { createModelViewer, type ModelViewer } from '$lib/constructs/modelViewer';

  export let construct: CelestialBody;
  // Optional: only used to preview the ship's real exhaust colour while placing drives.
  export let rulePack: any = null;

  const dispatch = createEventDispatcher();

  let fileInput: HTMLInputElement;
  let previewCanvas: HTMLCanvasElement;
  let viewer: ModelViewer | null = null;

  let busy = false;              // parsing/converting
  let saving = false;
  let error: string | null = null;
  let fileName = '';
  let uploadBytes = 0;
  let parsed: ParsedModel | null = null;   // the ORIGINAL parse (hadMaterials comes from here)
  let converted: ConvertResult | null = null;

  // Two things the GM sets up here, in order: which way the ship faces, then where its drives
  // are. The mode decides what a click on the preview DOES - inspect (drag to spin) or place.
  let mode: 'orient' | 'engines' = 'orient';
  // Nozzles in the model's own space, plus the size dial that applies to all of them.
  let nozzles: [number, number, number][] = [...((construct.model?.nozzles ?? []) as [number, number, number][])];
  let nozzleScale = construct.model?.nozzleScale ?? 1;
  // Livery accent: auto (derived from the ship's colour) unless the GM pins one.
  let accentAuto = !construct.model?.accentHex;
  let accentHex = construct.model?.accentHex ?? '#d8642f';
  // Finish carries over from the construct so the preview shows what the map will draw.
  let finish: NonNullable<CelestialBody['model']>['finish'] = construct.model?.finish;

  // Orientation: 90-degree steps about world axes, composed as the GM presses; stored on the ref.
  let orient = new THREE.Quaternion();
  $: orientArr = [orient.x, orient.y, orient.z, orient.w] as [number, number, number, number];
  const isIdentity = (q: THREE.Quaternion) => Math.abs(q.w) > 0.9999;

  // Attribution (owner decision 5): CC-BY is allowed, so the fields exist at the front door.
  let title = '';
  let credit = '';
  let license = '';
  let sourceUrl = '';
  $: creditMissing = license === 'CC-BY' && !credit.trim();

  let previewRo: ResizeObserver | null = null;
  onMount(() => {
    // No auto-spin here: the modal's job is ALIGNMENT (drag orbits, buttons orient), and a
    // turntable moving under the orange drive arrow makes aligning to it a shooting-gallery game.
    viewer = createModelViewer(previewCanvas, { interactive: true, spin: false, background: null, driveMarker: true, zoom: true });
    const size = () => viewer?.setSize(previewCanvas.clientWidth, previewCanvas.clientHeight);
    size();
    // The preview is responsive now (it fills its column), so it must follow the box rather than
    // trust one measurement taken before layout settled.
    previewRo = new ResizeObserver(size);
    previewRo.observe(previewCanvas);
  });
  onDestroy(() => { previewRo?.disconnect(); viewer?.dispose(); });

  async function processBytes(name: string, bytes: ArrayBuffer) {
    busy = true; error = null; parsed = null; converted = null;
    fileName = name;
    uploadBytes = bytes.byteLength;
    try {
      const p = await parseModel(name, bytes);
      const c = await convertParsedModel(p, bytes);
      // Preview the STORED bytes, not the upload - what the GM approves is what everyone sees.
      const stored = await parseModel('stored.glb', c.glb);
      parsed = p; converted = c;
      viewer?.setObject(stored.object, {
        hadMaterials: p.hadMaterials, tintHex: construct.icon_color || '#ffd24d',
        finish: finish ?? null, seed: construct.id, accentHex: accentAuto ? null : accentHex
      });
      viewer?.setOrient(orientArr);
      viewer?.setNozzles(nozzles, nozzleScale, mode === 'engines');
      previewBurn();
    } catch (err) {
      error = err instanceof Error ? err.message : 'Could not read that file.';
    } finally {
      busy = false;
    }
  }

  async function onFile(e: Event) {
    const input = e.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;
    if (!title) title = file.name.replace(/\.(glb|stl|obj)$/i, '');
    await processBytes(file.name, await file.arrayBuffer());
    input.value = '';
  }

  // G3 Phase 4: the bundled NASA starter hulls (static/models/nasa) - real public-domain craft,
  // fetched on demand and run through the SAME convert path as an upload (they pass through
  // byte-identical), with attribution prefilled from the manifest.
  interface StarterEntry { id: string; file: string; name: string; lengthM: number; credit: string; license: string; sourceUrl: string }
  let starters: StarterEntry[] = [];
  let starterId = '';
  onMount(async () => {
    try {
      const res = await fetch('/models/nasa/manifest.json');
      if (res.ok) starters = (await res.json()).models ?? [];
    } catch { /* no starter set in this deployment - the picker simply does not render */ }
  });
  async function onStarterPick() {
    const entry = starters.find((s) => s.id === starterId);
    if (!entry) return;
    try {
      const res = await fetch(`/models/nasa/${entry.file}`);
      if (!res.ok) throw new Error('Could not fetch that starter hull.');
      title = entry.name;
      credit = entry.credit;
      license = entry.license;
      sourceUrl = entry.sourceUrl;
      await processBytes(entry.file, await res.arrayBuffer());
    } catch (err) {
      error = err instanceof Error ? err.message : 'Could not fetch that starter hull.';
    }
  }

  // In the engines step the plumes are lit at a representative power so the GM is placing
  // something they can SEE - the map still drives them from real thrust.
  function previewBurn() {
    viewer?.setBurn(mode === 'engines' ? { thrust01: 0.55, braking: false, colorHex: exhaustHex } : null);
  }
  // The dominant engine's authored exhaust colour, so the placer previews the ship's real flame.
  $: exhaustHex = (() => {
    const defs = (rulePack as any)?.engineDefinitions?.entries ?? [];
    let best = -1, hex: string | undefined;
    for (const inst of (construct as any).engines ?? []) {
      const def = defs.find((d: any) => d.id === inst.engine_id);
      const total = (def?.thrust_kN ?? 0) * (inst.quantity ?? 1);
      if (def?.exhaust_color_hex && total > best) { best = total; hex = def.exhaust_color_hex; }
    }
    return hex;
  })();
  // Re-dress the preview whenever a look parameter changes (cheap: no re-parse, just materials).
  $: if (parsed && viewer) {
    finish; accentAuto; accentHex;
    redress();
  }
  let redressKey = '';
  async function redress() {
    const key = `${finish ?? ''}|${accentAuto ? 'auto' : accentHex}`;
    if (!converted || key === redressKey) return;
    redressKey = key;
    const stored = await parseModel('stored.glb', converted.glb);
    viewer?.setObject(stored.object, {
      hadMaterials: parsed!.hadMaterials, tintHex: construct.icon_color || '#ffd24d',
      finish: finish ?? null, seed: construct.id, accentHex: accentAuto ? null : accentHex
    });
    viewer?.setOrient(orientArr);
    viewer?.setNozzles(nozzles, nozzleScale, mode === 'engines');
    previewBurn();
  }

  function setMode(m: 'orient' | 'engines') {
    mode = m;
    viewer?.setNozzles(nozzles, nozzleScale, mode === 'engines');
    previewBurn();
  }
  // A click on the hull in the engines step drops a drive there.
  function onPreviewClick(e: MouseEvent) {
    if (mode !== 'engines' || !parsed) return;
    // Swinging the camera round ends in a click over the hull; that is navigation, not placement.
    if (viewer?.wasDrag()) return;
    const hit = viewer?.pickOnHull(e.clientX, e.clientY);
    if (!hit) return;
    nozzles = [...nozzles, hit];
    viewer?.setNozzles(nozzles, nozzleScale, true);
  }
  function removeNozzle(i: number) {
    nozzles = nozzles.filter((_, k) => k !== i);
    viewer?.setNozzles(nozzles, nozzleScale, mode === 'engines');
  }
  function onScale() {
    viewer?.setNozzles(nozzles, nozzleScale, mode === 'engines');
  }

  function rotate(axis: 'x' | 'y' | 'z') {
    const v = axis === 'x' ? new THREE.Vector3(1, 0, 0) : axis === 'y' ? new THREE.Vector3(0, 1, 0) : new THREE.Vector3(0, 0, 1);
    orient = new THREE.Quaternion().setFromAxisAngle(v, Math.PI / 2).multiply(orient).normalize();
    viewer?.setOrient([orient.x, orient.y, orient.z, orient.w]);
  }
  function resetOrient() {
    orient = new THREE.Quaternion();
    viewer?.setOrient(null);
  }

  async function save() {
    if (!parsed || !converted) return;
    saving = true; error = null;
    try {
      const meta: Omit<ModelRef, 'hash'> = {
        name: title.trim() || fileName,
        sourceFormat: parsed.sourceFormat,
        triangles: converted.triangles,
        bytes: converted.glb.byteLength,
        hadMaterials: parsed.hadMaterials,
        ...(isIdentity(orient) ? {} : { orient: orientArr }),
        ...(finish ? { finish } : {}),
        ...(nozzles.length ? { nozzles } : {}),
        ...(nozzleScale !== 1 ? { nozzleScale } : {}),
        ...(accentAuto ? {} : { accentHex }),
        ...(title.trim() ? { title: title.trim() } : {}),
        ...(credit.trim() ? { credit: credit.trim() } : {}),
        ...(license ? { license } : {}),
        ...(sourceUrl.trim() ? { sourceUrl: sourceUrl.trim() } : {}),
        custom: true
      };
      const hash = await putModel(converted.glb, meta);
      dispatch('save', { ...meta, hash } as ModelRef);
    } catch (err) {
      error = err instanceof Error ? err.message : 'Could not store the model.';
      saving = false;
    }
  }

  const kb = (n: number) => n >= 1048576 ? `${(n / 1048576).toFixed(1)} MB` : `${Math.round(n / 1024)} KB`;
</script>

<div class="modal-background" role="presentation" on:click={() => dispatch('close')} on:keydown={(e) => { if (e.key === 'Escape') dispatch('close'); }}>
  <div class="modal" role="dialog" aria-modal="true" aria-label="3D model" tabindex="-1" on:click|stopPropagation on:keydown|stopPropagation>
    <h3>3D Model</h3>

    <div class="body">
      <div class="preview-col">
        <canvas bind:this={previewCanvas} class="preview" class:placing={mode === 'engines'} on:click={onPreviewClick}></canvas>
        {#if busy}<div class="overlay">Converting&hellip;</div>{/if}
        {#if !parsed && !busy}<div class="overlay hint">GLB, STL or OBJ</div>{/if}
        <div class="view-hint">
          Drag to orbit &middot; wheel or pinch to zoom
          <button type="button" class="link" on:click={() => viewer?.resetView()} disabled={!parsed}>Reset view</button>
        </div>

        <div class="mode-tabs">
          <button type="button" class:on={mode === 'orient'} on:click={() => setMode('orient')} disabled={!parsed}>1 &middot; Facing</button>
          <button type="button" class:on={mode === 'engines'} on:click={() => setMode('engines')} disabled={!parsed}>2 &middot; Engines</button>
        </div>

        {#if mode === 'orient'}
          <div class="orient-row">
            <button type="button" on:click={() => rotate('x')} disabled={!parsed} title="Pitch 90&deg;">Pitch</button>
            <button type="button" on:click={() => rotate('y')} disabled={!parsed} title="Yaw 90&deg;">Yaw</button>
            <button type="button" on:click={() => rotate('z')} disabled={!parsed} title="Roll 90&deg;">Roll</button>
            <button type="button" on:click={resetOrient} disabled={!parsed || isIdentity(orient)}>Reset</button>
          </div>
          <div class="drive-hint">
            <span class="aft">Orange arrow = rear of ship</span> &mdash; turn the hull so its
            <span class="aft">main drive</span> points into it.
            <span class="fwd">Green arrow = direction of travel</span>, out past the nose.
            Drag to inspect from any side.
          </div>
        {:else}
          <div class="orient-row">
            <span class="lbl">{nozzles.length || 'no'} drive{nozzles.length === 1 ? '' : 's'} placed</span>
            {#if nozzles.length}
              <button type="button" on:click={() => { nozzles = []; viewer?.setNozzles([], nozzleScale, true); }}>Clear</button>
            {/if}
          </div>
          <label class="slider-row">
            <span class="lbl">Size</span>
            <input type="range" min="0.3" max="2.5" step="0.05" bind:value={nozzleScale} on:input={onScale} disabled={!parsed} />
            <span class="lbl">{nozzleScale.toFixed(2)}&times;</span>
          </label>
          {#if nozzles.length}
            <div class="nozzle-list">
              {#each nozzles as n, i}
                <button type="button" class="nozzle-chip" on:click={() => removeNozzle(i)} title="Remove this drive">
                  Drive {i + 1} &times;
                </button>
              {/each}
            </div>
          {/if}
          <div class="drive-hint">
            <strong>Click the ship</strong> where each drive sits &mdash; a plume lights there.
            Orbit and zoom in first to reach the stern or the belly.
            Click a chip to remove one. No drives placed means one plume at the stern, which suits
            most hulls. The <em>length and brightness</em> come from real thrust on the map; this
            size dial only sets how wide they are.
          </div>
        {/if}
      </div>

      <div class="form-col">
        <button type="button" class="pick" on:click={() => fileInput.click()} disabled={busy}>
          {parsed ? 'Choose a different file…' : 'Choose a model file…'}
        </button>
        <input type="file" accept=".glb,.stl,.obj" bind:this={fileInput} on:change={onFile} style="display:none" />
        {#if starters.length}
          <div class="starter-row">
            <span class="lbl">or a starter hull:</span>
            <select bind:value={starterId} on:change={onStarterPick} disabled={busy}>
              <option value="">Real spacecraft (NASA)&hellip;</option>
              {#each starters as s}
                <option value={s.id}>{s.name}</option>
              {/each}
            </select>
          </div>
        {/if}

        {#if converted && parsed}
          <div class="stats">
            <div>{fileName} &middot; {parsed.sourceFormat.toUpperCase()} &middot; {kb(uploadBytes)} uploaded</div>
            <div>
              Stored: {kb(converted.glb.byteLength)}
              {#if converted.passthrough}(unchanged){:else}as GLB{/if}
              &middot; {converted.triangles.toLocaleString()} triangles{#if converted.simplified}
                (simplified from {converted.originalTriangles.toLocaleString()}){/if}
            </div>
            {#if !parsed.hadMaterials}
              <div class="note">No materials in the source &mdash; shown in the ship's icon colour with panel-line edges.</div>
            {/if}
            {#if converted.overWarn}
              <div class="warn">Over {Math.round(MODEL_WARN_BYTES / 1024)} KB &mdash; fine locally, but every player download carries it.</div>
            {/if}
          </div>
        {/if}
        {#if error}<div class="error">{error}</div>{/if}

        {#if parsed}
          <div class="row">
            <div class="form-group" style="flex:1">
              <label for="mdl-finish">Shading</label>
              <select id="mdl-finish" bind:value={finish}>
                <option value={undefined}>Flat + panel lines</option>
                <option value="plated">Panelled hull</option>
                <option value="patina">Weathered</option>
                <option value="cel">Cel shaded</option>
                <option value="matcap">Brushed metal</option>
                <option value="iridescent">Iridescent</option>
                <option value="blueprint">Blueprint</option>
              </select>
            </div>
            <div class="form-group" style="flex:1">
              <label for="mdl-accent">Livery accent</label>
              <div class="accent-row">
                <label class="tick"><input type="checkbox" bind:checked={accentAuto} /> Auto</label>
                <input id="mdl-accent" type="color" bind:value={accentHex} disabled={accentAuto} />
              </div>
            </div>
          </div>
        {/if}

        <div class="form-group">
          <label for="mdl-title">Model name</label>
          <input id="mdl-title" type="text" bind:value={title} placeholder="e.g. Light freighter hull" />
        </div>
        <div class="form-group">
          <label for="mdl-credit">Credit <span class="descriptor">(author / source)</span></label>
          <input id="mdl-credit" type="text" bind:value={credit} placeholder="Modeller or site name" />
        </div>
        <div class="row">
          <div class="form-group" style="flex:1">
            <label for="mdl-license">Licence</label>
            <select id="mdl-license" bind:value={license}>
              <option value="">Unknown / personal use</option>
              <option value="Public domain">Public domain</option>
              <option value="CC0">CC0</option>
              <option value="CC-BY">CC-BY (credit required)</option>
              <option value="Other">Other</option>
            </select>
          </div>
          <div class="form-group" style="flex:2">
            <label for="mdl-src">Source URL</label>
            <input id="mdl-src" type="text" bind:value={sourceUrl} placeholder="https://&hellip;" />
          </div>
        </div>
        {#if creditMissing}
          <div class="warn">CC-BY requires attribution &mdash; add the author to Credit.</div>
        {/if}
      </div>
    </div>

    <div class="actions">
      <button type="button" on:click={() => dispatch('close')}>Cancel</button>
      <button type="button" class="primary" on:click={save} disabled={!converted || busy || saving}>
        {saving ? 'Saving…' : 'Use this model'}
      </button>
    </div>
  </div>
</div>

<style>
  .modal-background {
    position: fixed; top: 0; left: 0; width: 100%; height: 100%;
    background-color: rgba(0, 0, 0, 0.6);
    display: flex; justify-content: center; align-items: center;
    z-index: 2000; backdrop-filter: blur(2px);
  }
  .modal {
    background: var(--panel-bg, #1a1e26); color: var(--text-color, #dfe6f0);
    border: 1px solid var(--border-color, #333a46); border-radius: 8px;
    width: min(1040px, 96vw); max-height: 92vh; overflow: auto;
    padding: 16px 18px; box-shadow: 0 12px 40px rgba(0, 0, 0, 0.5);
  }
  h3 { margin: 0 0 12px; }
  .body { display: flex; gap: 16px; }
  /* The preview is the point of this dialog - give it the room. It fills its column and stays
     square-ish, so a wide screen gets a big model rather than a big form. */
  .preview-col { position: relative; flex: 1 1 460px; min-width: 300px; display: flex; flex-direction: column; }
  .preview {
    width: 100%; aspect-ratio: 1 / 1; max-height: 62vh; background: #0a0d13; border-radius: 6px;
    display: block; touch-action: none; cursor: grab;
  }
  .preview:active { cursor: grabbing; }
  .overlay {
    position: absolute; top: 0; left: 0; right: 0; aspect-ratio: 1 / 1; max-height: 62vh;
    display: flex; align-items: center; justify-content: center; pointer-events: none;
  }
  .overlay.hint { color: #5a6374; }
  .orient-row { display: flex; gap: 6px; align-items: center; margin-top: 8px; flex-wrap: wrap; }
  .orient-row .lbl { font-size: 0.85em; color: #9aa4b4; }
  .orient-row button { padding: 3px 10px; }
  .mode-tabs { display: flex; gap: 4px; margin-top: 8px; }
  .mode-tabs button { flex: 1; padding: 4px 6px; font-size: 0.85em; }
  .mode-tabs button.on { background: var(--accent, #3a6ea5); color: #fff; }
  .slider-row { display: flex; align-items: center; gap: 8px; margin-top: 6px; }
  .slider-row input[type='range'] { flex: 1; }
  .nozzle-list { display: flex; flex-wrap: wrap; gap: 4px; margin-top: 6px; }
  .nozzle-chip { font-size: 0.78em; padding: 2px 8px; border-radius: 10px; }
  .accent-row { display: flex; align-items: center; gap: 8px; }
  .accent-row .tick { display: flex; align-items: center; gap: 4px; font-size: 0.85em; color: #9aa4b4; }
  .preview.placing { cursor: crosshair; }
  .drive-hint { font-size: 0.8em; color: #9aa4b4; margin-top: 6px; }
  .drive-hint .aft { color: #ff8c3a; }
  .drive-hint .fwd { color: #4ade80; }
  .form-col { flex: 1 1 340px; min-width: 280px; display: flex; flex-direction: column; gap: 8px; }
  .body { flex-wrap: wrap; }
  .view-hint { display: flex; align-items: center; gap: 8px; font-size: 0.8em; color: #6f7a8a; margin-top: 6px; }
  .view-hint .link { background: none; border: none; color: #7fb2d9; padding: 0; font-size: 1em; text-decoration: underline; }
  .view-hint .link:disabled { color: #4a5260; text-decoration: none; }
  .pick { padding: 8px; }
  .starter-row { display: flex; align-items: center; gap: 6px; }
  .starter-row .lbl { font-size: 0.85em; color: #9aa4b4; white-space: nowrap; }
  .starter-row select { flex: 1; min-width: 0; }
  .stats { font-size: 0.85em; color: #9aa4b4; display: flex; flex-direction: column; gap: 3px; }
  .stats .note { color: #7fb2d9; }
  .warn { font-size: 0.85em; color: #e0b352; }
  .error { font-size: 0.85em; color: #e06a6a; }
  .form-group { display: flex; flex-direction: column; gap: 3px; }
  .form-group label { font-size: 0.85em; color: #9aa4b4; }
  .descriptor { color: #5a6374; }
  .row { display: flex; gap: 10px; }
  input[type='text'], select {
    background: var(--input-bg, #10141b); color: inherit;
    border: 1px solid var(--border-color, #333a46); border-radius: 4px; padding: 5px 8px;
  }
  .actions { display: flex; justify-content: flex-end; gap: 8px; margin-top: 14px; }
  .actions .primary { background: var(--accent, #3a6ea5); color: #fff; }
  button { cursor: pointer; }
  button:disabled { opacity: 0.5; cursor: default; }
</style>
