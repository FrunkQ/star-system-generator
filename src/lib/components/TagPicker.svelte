<script lang="ts">
  // THE FULL-VOCABULARY TAG PICKER. One of TWO pickers, and the distinction is deliberate:
  //
  //   TagPicker (this)  — EVERY category, engine namespace and tag the app knows about, whether or
  //                       not anything currently carries it. Use it when the answer may not be on the
  //                       map yet: adding a tag by hand, authoring, configuring.
  //   TagFinder (rail)  — only what is ACTUALLY PRESENT on the map, with counts and results. Use it
  //                       when the question is "where is X", including choosing what to highlight,
  //                       because highlighting something nothing carries shows nothing.
  //
  // Picking the wrong one is a real usability failure in both directions: a manual-tagging picker
  // that hides tags nothing carries yet can never add the first one, and a highlight picker full of
  // tags nothing carries is a list of things that will not appear.
  //
  // Three groups, searchable, each row in the colour the tag will actually render in:
  //   YOUR CATEGORIES      — from the tag store, the things a GM defined
  //   PHYSICS & GENERATED  — the engine's own namespaces, whole-namespace selections
  //   INDIVIDUAL TAGS      — DECLARED (a category's own list) plus OBSERVED (present on a body),
  //                          because physics tags are emitted and never declared anywhere.
  import { createEventDispatcher } from 'svelte';
  import { tagCategories } from '$lib/tags/tagCategories';
  import { ENGINE_NAMESPACES } from '$lib/tags/tagDefaults';
  import { describeTag } from '$lib/tags/tagPresentation';
  import { canonicalTagKey } from '$lib/tags/tagLifecycle';
  import { starmapStore } from '$lib/starmapStore';

  /** Refs already selected, so they can be shown as chosen rather than offered again. */
  export let selected: string[] = [];

  const dispatch = createEventDispatcher();
  let query = '';

  // Every tag key actually present anywhere in the campaign. Physics tags only exist here.
  $: observedKeys = (() => {
    const out = new Set<string>();
    for (const s of $starmapStore?.systems ?? []) {
      for (const n of (s as any)?.system?.nodes ?? []) {
        for (const t of n?.tags ?? []) if (t?.key) out.add(canonicalTagKey(t.key));
      }
    }
    return out;
  })();

  const swatch = (ref: string) => {
    if (!ref.includes('/')) {
      const c = $tagCategories.find((x) => x.id === ref);
      if (c) return { color: c.color, textColor: c.textColor || '#fff' };
      const meta = describeTag(`${ref}/x`);
      return { color: meta.color, textColor: meta.textColor || '#fff' };
    }
    const info = describeTag(ref);
    return { color: info.color, textColor: info.textColor || '#fff' };
  };

  $: userCats = $tagCategories
    .filter((c) => c.enabled)
    .map((c) => ({ ref: c.id, label: c.longName, sub: `${c.tags.length} tags`, ...swatch(c.id) }));

  $: engineCats = ENGINE_NAMESPACES
    .filter((n) => !n.id.includes('/'))                       // whole namespaces only
    .filter((n) => !$tagCategories.some((c) => c.id === n.id)) // not already a user category
    .map((n) => ({
      ref: n.id,
      label: n.label,
      sub: n.provenance === 'authored' ? 'generated' : 'physics',
      ...swatch(n.id)
    }));

  // Declared tags (a category's own list) plus observed ones (present on a body). Observed catches
  // everything the engine emits, which is never declared anywhere.
  $: allTags = (() => {
    const seen = new Map<string, { ref: string; label: string; sub: string; color: string; textColor: string }>();
    for (const c of $tagCategories) {
      for (const t of c.tags) {
        const k = canonicalTagKey(t.key);
        if (!seen.has(k)) seen.set(k, { ref: k, label: t.label, sub: c.shortName || c.longName, ...swatch(k) });
      }
    }
    for (const k of observedKeys) {
      if (seen.has(k)) continue;
      const info = describeTag(k);
      seen.set(k, { ref: k, label: info.label, sub: info.group, ...swatch(k) });
    }
    return [...seen.values()].sort((a, b) => a.sub.localeCompare(b.sub) || a.label.localeCompare(b.label));
  })();

  const match = (r: { ref: string; label: string; sub: string }) => {
    const q = query.trim().toLowerCase();
    if (!q) return true;
    return r.ref.toLowerCase().includes(q) || r.label.toLowerCase().includes(q) || r.sub.toLowerCase().includes(q);
  };
  // With no search the tag list would be hundreds of rows; the categories above are the answer for
  // browsing, and search is the answer for finding one tag.
  $: shownTags = query.trim() ? allTags.filter(match) : allTags.slice(0, 12);
  $: shownUser = userCats.filter(match);
  $: shownEngine = engineCats.filter(match);
  $: hiddenTagCount = query.trim() ? 0 : Math.max(0, allTags.length - shownTags.length);

  const isOn = (ref: string) => selected.includes(ref);
  const pick = (ref: string) => dispatch('pick', ref);
</script>

<div class="picker">
  <input class="q" type="search" bind:value={query} placeholder="Search categories and tags…" aria-label="Search highlights" />

  {#if shownUser.length}
    <div class="grp">Your categories</div>
    {#each shownUser as r (r.ref)}
      <button class="row" class:on={isOn(r.ref)} on:click={() => pick(r.ref)} disabled={isOn(r.ref)}>
        <span class="dot" style="background:{r.color}"></span>
        <span class="lbl">{r.label}</span><span class="sub">{r.sub}</span>
      </button>
    {/each}
  {/if}

  {#if shownEngine.length}
    <div class="grp">Physics &amp; generated <span class="grp-note">whole namespace</span></div>
    {#each shownEngine as r (r.ref)}
      <button class="row" class:on={isOn(r.ref)} on:click={() => pick(r.ref)} disabled={isOn(r.ref)}>
        <span class="dot" style="background:{r.color}"></span>
        <span class="lbl">{r.label}</span><span class="sub">{r.sub}</span>
      </button>
    {/each}
  {/if}

  {#if shownTags.length}
    <div class="grp">Individual tags</div>
    {#each shownTags as r (r.ref)}
      <button class="row" class:on={isOn(r.ref)} on:click={() => pick(r.ref)} disabled={isOn(r.ref)}>
        <span class="dot" style="background:{r.color}"></span>
        <span class="lbl">{r.label}</span><span class="sub">{r.sub}</span>
      </button>
    {/each}
    {#if hiddenTagCount}
      <p class="more">…and {hiddenTagCount} more — search to find one.</p>
    {/if}
  {:else if query.trim()}
    <p class="more">Nothing matches “{query}”.</p>
  {/if}
</div>

<style>
  .picker { display: flex; flex-direction: column; gap: 2px; max-height: 260px; overflow-y: auto; border: 1px solid var(--border); border-radius: 5px; padding: 5px; background: var(--bg-panel); }
  .q { width: 100%; padding: 4px 6px; font-size: 0.72rem; border-radius: 4px; border: 1px solid var(--border); background: var(--bg-control); color: var(--text); margin-bottom: 3px; }
  .grp { font-size: 0.6rem; text-transform: uppercase; letter-spacing: 0.06em; color: var(--text-faint); margin-top: 5px; }
  .grp-note { text-transform: none; letter-spacing: 0; opacity: 0.7; }
  .row { display: flex; align-items: center; gap: 6px; width: 100%; text-align: left; background: none; border: none; padding: 3px 4px; border-radius: 3px; cursor: pointer; color: var(--text); font-size: 0.72rem; }
  .row:hover:not(:disabled) { background: var(--bg-control); }
  .row:disabled { opacity: 0.45; cursor: default; }
  .dot { width: 9px; height: 9px; border-radius: 50%; flex: 0 0 auto; }
  .lbl { flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .sub { font-size: 0.62rem; color: var(--text-faint); flex: 0 0 auto; }
  .more { margin: 4px 0 0; font-size: 0.62rem; color: var(--text-faint); }
</style>
