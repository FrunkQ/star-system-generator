<script lang="ts">
  import { createEventDispatcher } from 'svelte';
  import type { CelestialBody, RulePack } from '$lib/types';
  import { describeTag, formatTagValue } from '$lib/tags/tagPresentation';
  import { poiPacks } from '$lib/physics/reasonsToVisit';
  import { customTagVocabulary } from '$lib/tags/customTags';
  import { canonicalTagKey, tagSlugSegment, tagOrigin, overridableNamespaces, isPhysicsNamespace } from '$lib/tags/tagLifecycle';
  import { tagCategories, categoriesFor, addTagToCategory } from '$lib/tags/tagCategories';

  export let body: CelestialBody;
  export let rulePack: RulePack | null = null;

  const dispatch = createEventDispatcher();

  // Add-a-tag form: pick a category (Custom = free-form key) → name → live preview of the full tag.
  let newCat = 'custom';
  let newName = '';
  let newValue = '';
  // Only categories that apply to THIS kind of object — a ship's Purpose has no business on a moon.
  $: cats = categoriesFor($tagCategories, (body.roleHint as any) || 'planet');
  // Both spellings come from tagLifecycle so the key the preview shows is the key that gets stored:
  // a whole key for the free-text path (slashes kept, so `faction/red` still works), one segment for
  // the category path. Previously the custom path stored the raw text, which is how "Smugglers" and
  // "Red Syndicate" became keys that the import strip then read as V1 display-name tags and deleted.
  $: previewKey = newCat === 'custom'
    ? (canonicalTagKey(newName) || 'tag')
    : `${newCat}/${tagSlugSegment(newName) || 'name'}`;
  $: previewInfo = describeTag(previewKey);

  // The tags already defined in the chosen category that this body doesn't have yet — click one to
  // add it manually (kept as the player's own, so the reasons pass never strips it).
  // For "Custom", offer the starmap-wide vocabulary of custom tags used on ANY body/construct (across all
  // systems), minus the ones this body already has — so a tag added anywhere is a one-click reuse here.
  $: availableInCat = newCat === 'custom' ? (() => {
    const have = new Set((body.tags ?? []).map((t) => t.key));
    return $customTagVocabulary
      .filter((e) => !have.has(e.key))
      .map((e) => { const info = describeTag(e.key); return { key: e.key, label: info.label, color: info.color, textColor: info.textColor || '#fff' }; });
  })() : (() => {
    const have = new Set((body.tags ?? []).map((t) => t.key));
    const seen = new Set<string>();
    const out: { key: string; label: string; color: string; textColor: string }[] = [];
    const offer = (key: string) => {
      if (!key || have.has(key) || seen.has(key)) return;
      seen.add(key);
      const info = describeTag(key);
      out.push({ key, label: info.label, color: info.color, textColor: info.textColor || '#fff' });
    };
    // The category's DECLARED tags first (A73): a custom tag added under a category registers into
    // its vocabulary, and must then be a one-click reuse on the next body — reading only the rule
    // tags left a declared-but-ruleless tag invisible here.
    for (const c of $tagCategories) if (c.id === newCat) for (const td of c.tags) offer(td.key);
    for (const p of $poiPacks) {
      if (p.enabled === false) continue;
      for (const r of p.rules ?? []) if (r.category === newCat && r.tag) offer(r.tag);
    }
    return out;
  })();
  function addExisting(key: string) {
    if (!body.tags) body.tags = [];
    if (!body.tags.some((t) => t.key === key)) { body.tags = [...body.tags, { key, manual: true }]; dispatch('update'); }
  }

  function removeTag(key: string) {
      if (!body.tags) return;
      body.tags = body.tags.filter((t) => t.key !== key);
      dispatch('update');
  }
  function addCustomTag() {
      const key = newCat === 'custom' ? canonicalTagKey(newName) : `${newCat}/${tagSlugSegment(newName)}`;
      if (!key || (newCat !== 'custom' && !tagSlugSegment(newName))) return;
      if (!body.tags) body.tags = [];
      if (!body.tags.some((t) => t.key === key)) {
          // manual:true marks it as the player's own — it survives every re-derive pass even when
          // filed under a physics namespace, and always reads as yours (removable). `override` says
          // it sits in a namespace the engine derives, so the UI can be honest that the physics did
          // not produce it and may disagree with it.
          const override = isPhysicsNs(key) || undefined;
          body.tags = [...body.tags, { key, value: newValue || undefined, manual: true, override } as any];
          // A73: the dialog PROMISED the category — the dropdown chose it and the preview shows the
          // namespaced key — so the tag registers into that category's vocabulary too. It then
          // appears in Settings > Tagging (colour-editable, deletable, rule-able) and as an
          // Available chip on every other body. Idempotent; a physics namespace has no category
          // entry and is skipped. The tag on THIS body stays yours either way.
          if (newCat !== 'custom' && !isPhysicsNs(key)) addTagToCategory(newCat, newName);
          dispatch('update');
      }
      newName = ''; newValue = '';
  }

  // Group by real PROVENANCE, from tagLifecycle — not by guessing at the namespace.
  //
  // Inbox A44: this used to ask `tagSource(key)`, which reads the namespace and knows only "PoI or
  // physics". A generator-written tag like `spin/axis-inferred` therefore landed in physics and wore
  // the red "derived from the physics — fixed, recomputed every run" lock. Every word of that was
  // wrong: NOTHING re-derives it, it is the generator's own claim, and the GM can legitimately delete
  // it. A tag that misreports where it came from is worse than an unexplained one, because the reader
  // has no reason to doubt it — so provenance now comes from the one module that actually knows.
  interface TagItem { key: string; value?: string; label: string; color: string; textColor: string; desc: string; source?: string; secret?: boolean; }
  $: groups = (() => {
    const manual: TagItem[] = [];      // hand-added, including overrides
    const overrides: TagItem[] = [];   // hand-added INSIDE a physics namespace
    const authored: TagItem[] = [];    // the generator's own claims — nothing re-derives them
    const poi: Record<string, TagItem[]> = {};
    const physics: Record<string, TagItem[]> = {};
    for (const t of body.tags ?? []) {
      const info = describeTag(t.key);
      const item: TagItem = {
        key: t.key, value: t.value, label: info.label, color: info.color,
        textColor: info.textColor || '#fff', desc: info.description, source: t.source,
        secret: (t as any).secret
      };
      switch (tagOrigin(t)) {
        case 'manual':
          ((t as any).override || isPhysicsNs(t.key) ? overrides : manual).push(item);
          break;
        case 'authored': authored.push(item); break;
        case 'rule': (poi[info.group] ||= []).push(item); break;
        default: (physics[info.group] ||= []).push(item); break;   // physics | inherited | derived
      }
    }
    return { manual, overrides, authored, poi, physics };
  })();
  const isPhysicsNs = (key: string) => isPhysicsNamespace(key);

  function toggleSecret(key: string) {
    if (!body.tags) return;
    body.tags = body.tags.map((t) => t.key === key ? { ...t, secret: (t as any).secret ? undefined : true } as any : t);
    dispatch('update');
  }
  const sortedGroups = (r: Record<string, TagItem[]>) => Object.keys(r).sort();

  // Which rule seeded a tag (Tag.source = 'rule:<id>') — so the mouseover says exactly where it came from
  // and whether it was deterministic (chance 100%) or a roll. Rules live on their tag category.
  $: ruleById = (() => { const m = new Map<string, any>(); for (const p of $poiPacks) for (const r of (p.rules ?? [])) m.set(r.id, r); return m; })();
  function provenance(source?: string): string {
    if (!source?.startsWith('rule:')) return 'Seeded by an automated tagging rule — re-applied every run. Edit the rule to change it.';
    const r = ruleById.get(source.slice(5));
    if (!r) return 'Seeded by a rule no longer in the pack.';
    const det = r.chance >= 1 ? 'always seeded (deterministic)' : `${Math.round(r.chance * 100)}% chance`;
    return `Seeded by rule "${r.label || r.tag}" — ${det}. Edit it in Settings → Tagging.`;
  }
</script>

<div class="tab-panel">
  <div class="tags-section">
    {#if !(body.tags && body.tags.length)}
      <span class="no-tags">No tags yet.</span>
    {/if}

    <!-- Your own tags (removable). -->
    {#if groups.manual.length}
      <div class="tag-group">
        <h5 class="src-head manual-head">Yours</h5>
        <div class="tags-list">
          {#each groups.manual as t (t.key)}
            <button class="tag-chip active" class:secret={t.secret} style="background-color:{t.color}; color:{t.textColor}" title={(t.desc ? t.desc + '\n\n' : '') + 'Your tag — click to remove' + (t.secret ? '\nSECRET: players never see this one.' : '')} on:click={() => removeTag(t.key)}>
              {#if t.secret}<span class="eye" title="Hidden from players">◍</span>{/if}
              {t.label}{#if formatTagValue(t.key, t.value)}: {formatTagValue(t.key, t.value)}{/if} <span class="x">×</span>
            </button>
            <button class="secret-btn" title={t.secret ? 'Visible to players — click to hide' : 'Hide from players'} on:click={() => toggleSecret(t.key)}>{t.secret ? 'hidden' : 'hide'}</button>
          {/each}
        </div>
      </div>
    {/if}

    <!-- GM overrides: hand-added INSIDE a namespace the engine derives. -->
    {#if groups.overrides.length}
      <div class="tag-group">
        <h5 class="src-head override-head">GM override <span class="src-note">· may not respect the physics</span></h5>
        <p class="grp-note">
          You added these by hand in a namespace the engine derives. They survive every re-derive and
          the physics will not argue — but it did not produce them, and they may contradict it.
          <a href="/physics" target="_blank" rel="noreferrer">How the physics tags work</a>.
        </p>
        <div class="tags-list">
          {#each groups.overrides as t (t.key)}
            <button class="tag-chip active override" style="background-color:{t.color}; color:{t.textColor}" title={(t.desc ? t.desc + '\n\n' : '') + 'Your override — the engine did not derive this. Click to remove.'} on:click={() => removeTag(t.key)}>
              {t.label}{#if formatTagValue(t.key, t.value)}: {formatTagValue(t.key, t.value)}{/if} <span class="x">×</span>
            </button>
          {/each}
        </div>
      </div>
    {/if}

    <!-- Generated: the generator's own claims. Inbox A44 — NOT physics, and not locked. -->
    {#if groups.authored.length}
      <div class="tag-group">
        <h5 class="src-head authored-head">Generated <span class="src-note">· not re-derived</span></h5>
        <p class="grp-note">
          Written when this body was generated or imported, recording something the physics cannot work
          out for itself — an inferred spin, a captured orbit, a world invented to fill out a real star.
          Nothing re-creates these, so removing one removes it for good.
        </p>
        <div class="tags-list">
          {#each groups.authored as t (t.key)}
            <button class="tag-chip active" style="background-color:{t.color}; color:{t.textColor}" title={(t.desc ? t.desc + '\n\n' : '') + 'Recorded at generation — nothing re-derives it. Click to remove.'} on:click={() => removeTag(t.key)}>
              {t.label}{#if formatTagValue(t.key, t.value)}: {formatTagValue(t.key, t.value)}{/if} <span class="x">×</span>
            </button>
          {/each}
        </div>
      </div>
    {/if}

    <!-- Rule-seeded tags: changeable by editing the rule (orange lock). -->
    {#each sortedGroups(groups.poi) as g (g)}
      <div class="tag-group">
        <h5 class="src-head poi-head">{g} <span class="src-note">· automated rule</span></h5>
        <div class="tags-list">
          {#each groups.poi[g] as t (t.key)}
            <button class="tag-chip locked" style="background-color:{t.color}; color:{t.textColor}" title={(t.desc ? t.desc + '\n\n' : '') + provenance(t.source)}>
              {t.label}{#if formatTagValue(t.key, t.value)}: {formatTagValue(t.key, t.value)}{/if}
              <svg class="lock poi" viewBox="0 0 24 24" width="11" height="11"><rect x="5" y="11" width="14" height="9" rx="1.5" fill="#111" stroke="currentColor" stroke-width="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3" fill="none" stroke="currentColor" stroke-width="2"/></svg>
            </button>
          {/each}
        </div>
      </div>
    {/each}

    <!-- Physics-derived tags: fixed (red lock). -->
    {#each sortedGroups(groups.physics) as g (g)}
      <div class="tag-group">
        <h5 class="src-head physics-head">{g} <span class="src-note">· physics</span></h5>
        <div class="tags-list">
          {#each groups.physics[g] as t (t.key)}
            <button class="tag-chip locked" style="background-color:{t.color}" title={(t.desc || t.label) + '\n\nDerived from the physics — fixed, recomputed every run.'}>
              {t.label}{#if formatTagValue(t.key, t.value)}: {formatTagValue(t.key, t.value)}{/if}
              <svg class="lock physics" viewBox="0 0 24 24" width="11" height="11"><rect x="5" y="11" width="14" height="9" rx="1.5" fill="#111" stroke="currentColor" stroke-width="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3" fill="none" stroke="currentColor" stroke-width="2"/></svg>
            </button>
          {/each}
        </div>
      </div>
    {/each}

  </div>

  <hr />
  <h4>Add a tag</h4>
  <div class="add-tag-form">
    <label class="fld">Category
      <select bind:value={newCat}>
        <option value="custom">Custom</option>
        {#each cats as c}<option value={c.id}>{c.longName}</option>{/each}
        <!-- The engine's own namespaces, so a GM can force one the physics did not derive. -->
        <optgroup label="Physics (GM override)">
          {#each overridableNamespaces() as n}<option value={n.id}>{n.label}</option>{/each}
        </optgroup>
      </select>
    </label>
    {#if isPhysicsNs(previewKey)}
      <p class="override-warn">
        The engine derives <code>{newCat}/…</code> itself. Adding one here overrides it: it will survive
        every re-derive and suppress the tag the physics would have written — which may be exactly what
        you want, and may contradict the physics.
      </p>
    {/if}
    {#if availableInCat.length}
      <div class="avail-row">
        <span class="avail-lbl">{newCat === 'custom' ? 'Reuse from this starmap:' : 'Available:'}</span>
        {#each availableInCat as a (a.key)}
          <button class="avail-chip" style="background:{a.color}; color:{a.textColor}" on:click={() => addExisting(a.key)} title="Add {a.label}">+ {a.label}</button>
        {/each}
      </div>
    {/if}
    <label class="fld">Name (what players see)
      <input type="text" bind:value={newName} placeholder={newCat === 'custom' ? 'e.g. Smugglers, faction/control' : 'e.g. spice'} />
    </label>
    <label class="fld">Value (optional)
      <input type="text" bind:value={newValue} placeholder="e.g. Empire, 7" />
    </label>
    <div class="preview-row">Players see:
      <span class="tag-chip-preview" style="background:{previewInfo.color}; color:{previewInfo.textColor || '#fff'}">{previewInfo.label}{#if newValue.trim()}: {newValue}{/if}</span>
      {#if previewInfo.label.toLowerCase() !== previewKey.toLowerCase()}<code class="key-hint">{previewKey}</code>{/if}
    </div>
    <button class="add-btn" on:click={addCustomTag} disabled={!newName.trim()}>Add tag</button>
  </div>
</div>

<style>
  .tab-panel { padding: 10px; display: flex; flex-direction: column; gap: 14px; }
  .tags-section { display: flex; flex-direction: column; gap: 10px; }
  .tag-group { display: flex; flex-direction: column; gap: 5px; }
  .src-head { margin: 4px 0 2px; font-size: 0.72em; text-transform: uppercase; letter-spacing: 0.06em; color: var(--text-muted); }
  .src-note { opacity: 0.6; text-transform: none; letter-spacing: 0; }
  .manual-head { color: var(--link, #6aa0d8); }
  .poi-head { color: #e0973a; }
  .physics-head { color: var(--text-faint); }
  .override-head { color: #d08a4a; }
  .authored-head { color: #8fa8c8; }
  .grp-note { margin: 0 0 4px; font-size: 0.7em; color: var(--text-faint); line-height: 1.35; }
  .grp-note a { color: var(--link, #6aa0d8); }
  .override-warn { margin: 0; font-size: 0.7em; color: #d08a4a; line-height: 1.35; }
  .tag-chip.override { outline: 1px dashed rgba(255,255,255,0.45); outline-offset: -2px; }
  .tag-chip.secret { opacity: 0.85; }
  .eye { font-size: 0.85em; opacity: 0.9; }
  .secret-btn { border: 1px solid var(--border); background: transparent; color: var(--text-faint); border-radius: 3px; font-size: 0.62em; padding: 1px 4px; cursor: pointer; align-self: center; }
  .secret-btn:hover { color: var(--text); }
  .tags-list { display: flex; flex-wrap: wrap; gap: 5px; }
  /* THE TAG PILL — geometry from the tokens, so this chip and the map markers stay one shape. */
  .tag-chip { border: none; border-radius: var(--tag-pill-radius); padding: var(--tag-pill-pad-y) var(--tag-pill-pad-x); font-size: var(--tag-pill-font-size); cursor: pointer; display: flex; align-items: center; gap: var(--tag-pill-gap); color: #fff; }
  .tag-chip.active:hover { filter: brightness(1.12); }
  .tag-chip.locked { cursor: default; }
  .x { font-weight: bold; font-size: 1.1em; line-height: 0.5; }
  .lock { flex: 0 0 auto; }
  .lock.physics { color: #ef4444; }   /* red outline — physics, cannot change */
  .lock.poi { color: #f59e0b; }       /* orange outline — rule-seeded, changeable */
  .no-tags { color: var(--text-faint); font-style: italic; }
  .add-tag-form { display: flex; flex-direction: column; gap: 8px; }
  .fld { display: flex; flex-direction: column; gap: 3px; font-size: 0.75em; color: var(--text-muted); }
  select { padding: 7px; border-radius: 4px; border: 1px solid var(--border); background-color: var(--bg-control); color: var(--text); }
  input { flex: 1; padding: 8px; border-radius: 4px; border: 1px solid var(--border); background-color: var(--bg-control); color: var(--text); }
  .preview-row { display: flex; align-items: center; gap: 7px; font-size: 0.75em; color: var(--text-muted); flex-wrap: wrap; }
  .tag-chip-preview { font-size: 0.92em; padding: 2px 7px; border-radius: 4px; }
  .avail-row { display: flex; flex-wrap: wrap; gap: 5px; align-items: center; }
  .avail-lbl { font-size: 0.72em; color: var(--text-faint); }
  .avail-chip { border: none; border-radius: 4px; padding: 3px 8px; font-size: 0.78em; cursor: pointer; }
  .avail-chip:hover { filter: brightness(1.12); }
  .key-hint { font-family: var(--font-mono, monospace); font-size: 0.85em; color: var(--text-faint); }
  .add-btn { width: 100%; padding: 8px; background-color: var(--bg-panel); color: var(--text); border: 1px solid var(--border); border-radius: 4px; cursor: pointer; }
  .add-btn:hover { background-color: var(--bg-control); }
  .add-btn:disabled { opacity: 0.5; cursor: not-allowed; }
  hr { border: 0; border-top: 1px solid var(--border); margin: 5px 0; width: 100%; }
  h4 { margin: 0; color: var(--link); font-size: 0.9em; text-transform: uppercase; }
</style>
