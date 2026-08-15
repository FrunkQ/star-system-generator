<script lang="ts">
  // ONE custom-picture block, three consumers (G20). A planet, a star and a construct all answer the
  // same question -- "show THIS instead of whatever derives the picture" -- so they share one control
  // rather than three transcriptions of it. Owner, 2026-08-15: "absolutely unify! there should not
  // even be 2!" The planet and construct copies had already been living side by side, identical but
  // for their button wording; that wording is now a prop, which is all it ever was.
  //
  // The block owns the WHOLE contract: upload, downscale to 512px, the `custom: true` flag that every
  // picture-deriving pass honours, the thumbnail, remove-and-fall-back, and the provenance trio that
  // DATA-M4 collects into a bundle's ATTRIBUTIONS.md.
  //
  // WHAT `custom` HOLDS OFF, per consumer -- three different writers, one flag:
  //   planet    SystemProcessor's type image (`roleHint !== 'star' && !image.custom`)
  //   star      BodyStarTab's class portrait, re-applied from an $effect on EVERY pass (G20's trap)
  //   construct nothing derives one; the picture simply outranks the icon glyph (UI-C2)
  // So clearing the ref is the same gesture everywhere: hand the picture back to whatever derives it.
  import type { ImageRef } from '$lib/types';
  import { fileToDownscaledDataUrl } from '$lib/util/imageUpload';

  let {
    target,
    onUpdate,
    addLabel = 'Upload custom image…',
    replaceLabel = 'Replace image…',
    removeLabel = 'Remove (use type image)',
    alt = 'Custom artwork'
  }: {
    target: { image?: ImageRef };
    onUpdate?: () => void;
    addLabel?: string;
    replaceLabel?: string;
    removeLabel?: string;
    alt?: string;
  } = $props();

  let fileInput = $state<HTMLInputElement | undefined>(undefined);

  // The three consumers span both compiler modes (BodyBasicsTab and ConstructBasicsTab are legacy,
  // BodyStarTab is runes) and the object handed in is a plain node, not a state proxy -- so writing
  // `target.image` does not by itself repaint this block. `rev` is the local repaint signal and every
  // write bumps it; the parent's own invalidation still happens through `onUpdate`, but this block no
  // longer DEPENDS on it, which is what lets one component serve all three call sites.
  let rev = $state(0);
  const image = $derived.by(() => { void rev; return target?.image; });

  function write(next: ImageRef | undefined) {
    target.image = next;
    rev++;
    onUpdate?.();
  }

  async function onUpload(e: Event) {
    const input = e.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;
    try {
      const url = await fileToDownscaledDataUrl(file, 512);
      // Keep any provenance already recorded when the picture is replaced -- the artist was credited
      // once and a re-crop should not quietly anonymise them.
      write({ ...(target.image ?? {}), url, custom: true });
    } catch { alert('Could not read that image file.'); }
    finally { input.value = ''; }
  }

  // Clearing the whole ref rather than just the flag: `custom` is what holds the deriving pass off,
  // and a stale url left behind would be shown by every generic `image.url` reader in the meantime.
  function removeCustom() { write(undefined); }

  // Provenance edits repaint immediately (so the CC-BY warning answers as you type) but only SAVE on
  // change -- a dispatch per keystroke re-processes the system.
  function setField(key: 'credit' | 'license' | 'sourceUrl', value: string) {
    if (!target.image) return;
    target.image = { ...target.image, [key]: value || undefined };
    rev++;
  }
  function commit() { onUpdate?.(); }
</script>

<div class="cib">
  <div class="cib-row">
    {#if image?.custom}
      <img class="cib-thumb" src={image.url} {alt} />
    {/if}
    <button type="button" class="cib-btn" onclick={() => fileInput?.click()}>
      {image?.custom ? replaceLabel : addLabel}
    </button>
    {#if image?.custom}
      <button type="button" class="cib-btn remove" onclick={removeCustom}>{removeLabel}</button>
    {/if}
    <input type="file" accept="image/*" bind:this={fileInput} onchange={onUpload} hidden />
  </div>

  {#if image?.custom}
    <!-- Provenance for an UPLOADED picture. It travels with the save (ATTRIBUTIONS.md in a save
         bundle), because a campaign gets handed to players and posted publicly - and CC-BY is an
         obligation, not a preference. -->
    <div class="cib-row cib-attr">
      <input class="attr" type="text" placeholder="Artist or source"
             value={image.credit ?? ''}
             oninput={(e) => setField('credit', e.currentTarget.value)}
             onchange={commit} />
      <select class="attr-lic" value={image.license ?? ''}
              onchange={(e) => { setField('license', e.currentTarget.value); commit(); }}>
        <option value="">Licence&hellip;</option>
        <option value="Own work">Own work</option>
        <option value="Public domain">Public domain</option>
        <option value="CC0">CC0</option>
        <option value="CC-BY">CC-BY</option>
        <option value="Other">Other</option>
      </select>
      <input class="attr" type="text" placeholder="Source URL"
             value={image.sourceUrl ?? ''}
             oninput={(e) => setField('sourceUrl', e.currentTarget.value)}
             onchange={commit} />
    </div>
    {#if image.license === 'CC-BY' && !image.credit}
      <span class="cib-warn">CC-BY requires naming the author.</span>
    {/if}
  {/if}
</div>

<style>
  /* width:100% so the block fills whatever cell it is dropped into - the body tabs stack it in a
     column, the construct's Appearance grid puts it in a flex ROW cell where a shrink-wrapped block
     would squeeze the provenance row to nothing. */
  .cib { display: flex; flex-direction: column; gap: 6px; min-width: 0; width: 100%; }
  .cib-row { display: flex; align-items: center; flex-wrap: wrap; gap: 6px; min-width: 0; }
  .cib-thumb {
    width: 48px; height: 48px; object-fit: cover; border-radius: 4px;
    border: 1px solid var(--border); background: var(--bg-control);
  }
  .cib-btn {
    width: auto; padding: 6px 10px; font-size: 0.9em; cursor: pointer;
    background: var(--bg-control); color: var(--text);
    border: 1px solid var(--border); border-radius: 4px;
  }
  .cib-btn:hover { border-color: var(--accent, var(--text-muted)); }
  .cib-btn.remove { color: var(--danger, #e06c6c); }
  /* Three small controls that must not shove the block wider than its panel column. */
  .cib-attr .attr { flex: 1 1 8rem; min-width: 0; font-size: 0.85em; padding: 2px 6px; }
  .cib-attr .attr-lic { font-size: 0.85em; padding: 2px 4px; }
  .cib-warn { font-size: 0.75em; color: var(--warning, #e0b352); }
</style>
