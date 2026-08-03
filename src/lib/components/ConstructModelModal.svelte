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

  onMount(() => {
    // No auto-spin here: the modal's job is ALIGNMENT (drag inspects, buttons orient), and a
    // turntable moving under the orange drive arrow makes aligning to it a shooting-gallery game.
    viewer = createModelViewer(previewCanvas, { interactive: true, spin: false, background: null, driveMarker: true });
    viewer.setSize(previewCanvas.clientWidth, previewCanvas.clientHeight);
  });
  onDestroy(() => viewer?.dispose());

  async function onFile(e: Event) {
    const input = e.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;
    busy = true; error = null; parsed = null; converted = null;
    fileName = file.name;
    uploadBytes = file.size;
    if (!title) title = file.name.replace(/\.(glb|stl|obj)$/i, '');
    try {
      const bytes = await file.arrayBuffer();
      const p = await parseModel(file.name, bytes);
      const c = await convertParsedModel(p, bytes);
      // Preview the STORED bytes, not the upload - what the GM approves is what everyone sees.
      const stored = await parseModel('stored.glb', c.glb);
      parsed = p; converted = c;
      viewer?.setObject(stored.object, { hadMaterials: p.hadMaterials, tintHex: construct.icon_color || '#ffd24d' });
      viewer?.setOrient(orientArr);
    } catch (err) {
      error = err instanceof Error ? err.message : 'Could not read that file.';
    } finally {
      busy = false;
      input.value = '';
    }
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

<div class="modal-background" on:click={() => dispatch('close')}>
  <div class="modal" on:click|stopPropagation>
    <h3>3D Model</h3>

    <div class="body">
      <div class="preview-col">
        <canvas bind:this={previewCanvas} class="preview"></canvas>
        {#if busy}<div class="overlay">Converting&hellip;</div>{/if}
        {#if !parsed && !busy}<div class="overlay hint">GLB, STL or OBJ</div>{/if}
        <div class="orient-row">
          <span class="lbl">Orientation:</span>
          <button type="button" on:click={() => rotate('x')} disabled={!parsed} title="Pitch 90&deg;">Pitch</button>
          <button type="button" on:click={() => rotate('y')} disabled={!parsed} title="Yaw 90&deg;">Yaw</button>
          <button type="button" on:click={() => rotate('z')} disabled={!parsed} title="Roll 90&deg;">Roll</button>
          <button type="button" on:click={resetOrient} disabled={!parsed || isIdentity(orient)}>Reset</button>
        </div>
        <div class="drive-hint">
          <span class="aft">Orange arrow = rear of ship</span> &mdash; turn the hull so its
          <span class="aft">main drive</span> (engines) points into it.
          <span class="fwd">Green arrow = direction of travel</span>, out past the nose.
          Drag to inspect from any side.
        </div>
      </div>

      <div class="form-col">
        <button type="button" class="pick" on:click={() => fileInput.click()} disabled={busy}>
          {parsed ? 'Choose a different file…' : 'Choose a model file…'}
        </button>
        <input type="file" accept=".glb,.stl,.obj" bind:this={fileInput} on:change={onFile} style="display:none" />

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
              <option value="CC0">CC0 / Public domain</option>
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
    width: min(720px, 94vw); max-height: 90vh; overflow: auto;
    padding: 16px 18px; box-shadow: 0 12px 40px rgba(0, 0, 0, 0.5);
  }
  h3 { margin: 0 0 12px; }
  .body { display: flex; gap: 16px; }
  .preview-col { position: relative; flex: 0 0 280px; }
  .preview { width: 280px; height: 280px; background: #0a0d13; border-radius: 6px; display: block; touch-action: none; cursor: grab; }
  .preview:active { cursor: grabbing; }
  .overlay {
    position: absolute; top: 0; left: 0; width: 280px; height: 280px;
    display: flex; align-items: center; justify-content: center; pointer-events: none;
  }
  .overlay.hint { color: #5a6374; }
  .orient-row { display: flex; gap: 6px; align-items: center; margin-top: 8px; flex-wrap: wrap; }
  .orient-row .lbl { font-size: 0.85em; color: #9aa4b4; }
  .orient-row button { padding: 3px 10px; }
  .drive-hint { font-size: 0.8em; color: #9aa4b4; margin-top: 6px; max-width: 280px; }
  .drive-hint .aft { color: #ff8c3a; }
  .drive-hint .fwd { color: #4ade80; }
  .form-col { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 8px; }
  .pick { padding: 8px; }
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
