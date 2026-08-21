<script lang="ts">
  // The one tag-category editor — it replaces the PoI pack editor and the CoI editor.
  //
  // A CATEGORY is the unit now: its colour, its tags, its automated rules, and which kinds of object
  // it may be applied to. Packs are gone. A pack was only ever a bag of categories, and two packs
  // defining the same category was a merge conflict with no UI to resolve it.
  //
  // The rule condition builder (guided field/operator/value rows, ANDed or ORed, with a raw-JSON
  // fallback for nested logic) is carried over unchanged — only what it edits moved.
  import { createEventDispatcher } from 'svelte';
  import { POI_FIELDS, POI_ROLES, DEFAULT_POI_ROLES,
    type PoIRule, type PoIExpr, type PoIField, type PoIRole } from '$lib/physics/reasonsToVisit';
  import {
    tagCategories, upsertCategory, deleteCategory, setCategoryEnabled, setCategoryPlayerHidden,
    addTagToCategory, removeTagFromCategory, updateTagDef, exportCategory, importCategory,
    isSystemCategory, type TagCategory
  } from '$lib/tags/tagCategories';
  import { tagSlugSegment } from '$lib/tags/tagLifecycle';
  import DualRange from './DualRange.svelte';
  import { describeTag } from '$lib/tags/tagPresentation';
  import HelpModal from './HelpModal.svelte';
  import tagsGuide from '../../../docs/tags-guide.md?raw';

  let showHelp = false;
  export let existingTags: string[] = [];   // every tag key present across the systems (for has: rows)

  const dispatch = createEventDispatcher();
  let selectedId = 'resource';
  $: cats = $tagCategories;
  $: cat = cats.find((c) => c.id === selectedId) ?? cats[0];
  $: isSystem = !!cat && isSystemCategory(cat.id);

  // A tag renders in its OWN colour if it has one, else its category's — the whole mechanism behind
  // "one faction category, a different colour per faction".
  const tagBg = (key: string) => cat?.tags.find((t) => t.key === key)?.color || cat?.color || '#555a66';
  const tagFg = (key: string) => cat?.tags.find((t) => t.key === key)?.textColor || cat?.textColor || '#ffffff';
  const catBg = () => cat?.color || '#555a66';
  const catFg = () => cat?.textColor || '#ffffff';
  const slug = tagSlugSegment;
  const compoundTag = (catId: string, suffix: string) => `${catId}/${slug(suffix) || 'new-hook'}`;
  const prettyName = (s: string) => (slug(s) || 'new-hook').replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());

  const fieldOf = (name: string): PoIField | undefined => POI_FIELDS.find((f) => f.field === name);
  const opsFor = (f?: PoIField) => f?.type === 'number' ? ['gte', 'lte', 'gt', 'lt', 'between'] : ['eq'];
  const rangeText = (f?: PoIField) => f && f.type === 'number'
    ? (f.max !== undefined && f.max <= 1 ? '0.0–1.0' : `${f.min ?? 0}–${f.max ?? '∞'}`)
    : '';
  const hasRange = (f?: PoIField) => !!f && f.type === 'number' && f.min !== undefined && f.max !== undefined;
  const stepFor = (f: PoIField) => (f.max! <= 1 ? 0.01 : (f.max! <= 10 ? 0.1 : 1));
  const betweenVals = (v: string, f: PoIField) => {
    const [a, b] = (v || '').split(',').map((x) => parseFloat(x));
    return { low: Number.isNaN(a) ? f.min! : a, high: Number.isNaN(b) ? f.max! : b };
  };
  const isHasField = (field: string) => field.startsWith('has:');
  const opsForRow = (row: { field: string }) => isHasField(row.field) ? [] : opsFor(fieldOf(row.field));
  function onFieldChange(row: { field: string; op: string }, value: string) {
    row.field = value;
    row.op = isHasField(value) ? '' : opsFor(fieldOf(value))[0];
    rows = rows;
  }
  function onOpChange(row: { field: string; op: string; value: string }, value: string) {
    const f = fieldOf(row.field);
    if (value === 'between' && !row.value.includes(',')) {
      const cur = parseFloat(row.value);
      const lo = Number.isNaN(cur) ? (f?.min ?? 0) : cur;
      row.value = `${lo},${f?.max ?? lo}`;
    } else if (value !== 'between' && row.value.includes(',')) {
      row.value = row.value.split(',')[0];
    }
    row.op = value;
    rows = rows;
  }
  const OP_LABEL: Record<string, string> = { gte: '≥', lte: '≤', gt: '>', lt: '<', between: 'between', eq: 'is' };

  // --- category ops ---
  function patchCat(patch: Partial<TagCategory>) { if (cat) upsertCategory({ ...cat, ...patch }); }
  function newCategory() {
    const id = 'category-' + Math.random().toString(36).slice(2, 6);
    upsertCategory({
      id, shortName: 'New category', longName: 'New category', color: '#6c8cb5', textColor: '#ffffff',
      appliesTo: [...DEFAULT_POI_ROLES], enabled: true, tags: [], rules: []
    });
    selectedId = id;
  }
  function removeCategory(id: string) {
    if (isSystemCategory(id)) return;
    const name = cats.find((c) => c.id === id)?.longName || id;
    if (!confirm(`Delete the "${name}" category?\n\nTags already applied to bodies and ships are NOT removed — they simply stop being described by this category, and its rules stop running.`)) return;
    deleteCategory(id);
    selectedId = cats.find((c) => c.id !== id)?.id ?? 'resource';
  }
  function doExport(c: TagCategory) {
    const blob = new Blob([exportCategory(c)], { type: 'application/json' });
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob);
    a.download = `${(c.longName || c.id).replace(/[^\w-]+/g, '_')}.tagcategory.json`; a.click(); URL.revokeObjectURL(a.href);
  }
  let importError = '';
  function onImportFile(e: Event) {
    const file = (e.target as HTMLInputElement).files?.[0]; if (!file) return;
    const r = new FileReader();
    r.onload = () => {
      try { const c = importCategory(String(r.result)); upsertCategory(c); selectedId = c.id; importError = ''; }
      catch (err) { importError = (err as Error).message; }
    };
    r.readAsText(file); (e.target as HTMLInputElement).value = '';
  }
  function toggleAppliesTo(role: PoIRole, on: boolean) {
    if (!cat) return;
    const cur = new Set(cat.appliesTo);
    if (on) cur.add(role); else cur.delete(role);
    patchCat({ appliesTo: [...cur] });
  }

  // --- the category's own tag list ---
  let newTagLabel = '';
  function addTag() {
    if (!cat || !newTagLabel.trim()) return;
    addTagToCategory(cat.id, newTagLabel);
    newTagLabel = '';
  }

  // --- rules ---
  let editing: PoIRule | null = null;
  let ruleSuffix = '';
  type Row = { field: string; op: string; value: string; neg?: boolean };
  let rows: Row[] = [];
  let rawMode = false; let rawText = ''; let ruleError = '';
  let matchMode: 'all' | 'any' = 'all';
  const suffixOf = (tag: string) => tag.includes('/') ? tag.split('/').slice(1).join('/') : tag;

  function clauseToRow(c: any): Row | null {
    if ('hasTag' in c) return { field: `has:${c.hasTag}`, op: '', value: '' };
    if ('between' in c) return { field: c.between[0], op: 'between', value: `${c.between[1]},${c.between[2]}` };
    if ('eq' in c) return { field: c.eq[0], op: 'eq', value: String(c.eq[1]) };
    const op = ['gt', 'lt', 'gte', 'lte'].find((o) => o in c);
    return op ? { field: c[op][0], op, value: String(c[op][1]) } : null;
  }
  function whenToRows(when: PoIExpr): { rows: Row[]; raw: boolean; mode: 'all' | 'any' } {
    if (when === true) return { rows: [], raw: false, mode: 'all' };
    let clauses: any[]; let mode: 'all' | 'any' = 'all';
    if ('all' in (when as any)) clauses = (when as any).all;
    else if ('any' in (when as any)) { clauses = (when as any).any; mode = 'any'; }
    else clauses = [when];
    const out: Row[] = [];
    for (const c of clauses) {
      const neg = 'not' in c;
      const row = clauseToRow(neg ? c.not : c);
      if (!row) return { rows: [], raw: true, mode };
      if (neg) row.neg = true;
      out.push(row);
    }
    return { rows: out, raw: false, mode };
  }
  function rowsToWhen(rs: Row[], mode: 'all' | 'any' = 'all'): PoIExpr {
    const clauses = rs.filter((r) => r.field).map((r): PoIExpr => {
      let base: PoIExpr;
      if (isHasField(r.field)) base = { hasTag: r.field.slice(4) };
      else {
        const f = fieldOf(r.field);
        if (r.op === 'eq') { const v = f?.type === 'bool' ? r.value === 'true' : (f?.type === 'number' ? parseFloat(r.value) : r.value); base = { eq: [r.field, v] }; }
        else if (r.op === 'between') { const [a, b] = r.value.split(',').map((x) => parseFloat(x)); base = { between: [r.field, Number.isNaN(a) ? 0 : a, Number.isNaN(b) ? 0 : b] }; }
        else base = { [r.op]: [r.field, parseFloat(r.value) || 0] } as PoIExpr;
      }
      return r.neg ? { not: base } : base;
    });
    return clauses.length === 0 ? true : (clauses.length === 1 ? clauses[0] : (mode === 'any' ? { any: clauses } : { all: clauses }));
  }
  function toggleRaw() {
    if (rawMode) {
      let parsed: PoIExpr;
      try { parsed = JSON.parse(rawText); } catch { ruleError = 'Invalid JSON.'; return; }
      const p = whenToRows(parsed);
      if (p.raw) { ruleError = 'This condition mixes nested all/any (or a tag-prefix match) the builder can’t show — keep editing it as JSON (see the reference link above).'; return; }
      rows = p.rows; matchMode = p.mode; rawMode = false; ruleError = '';
    } else {
      rawText = JSON.stringify(rowsToWhen(rows, matchMode)); rawMode = true; ruleError = '';
    }
  }
  function startRule(r?: PoIRule) {
    const cid = cat?.id || 'custom';
    editing = r ? { ...r } : { id: 'r' + Math.random().toString(36).slice(2, 7), tag: cid + '/new-hook', category: cid, chance: 0.5, when: true };
    ruleSuffix = suffixOf(editing.tag);
    const parsed = whenToRows(editing.when); rows = parsed.rows; rawMode = parsed.raw; matchMode = parsed.mode; rawText = JSON.stringify(editing.when, null, 0); ruleError = '';
  }
  function saveRule() {
    if (!editing || !cat) return;
    let when: PoIExpr;
    if (rawMode) { try { when = JSON.parse(rawText); } catch { ruleError = 'Invalid JSON'; return; } }
    else when = rowsToWhen(rows, matchMode);
    // A rule belongs to the category being edited, so its tag cannot drift out of the namespace.
    const r: PoIRule = {
      ...editing, category: cat.id, tag: compoundTag(cat.id, ruleSuffix), when,
      label: editing.label?.trim() || undefined,
      description: editing.description?.trim() || undefined
    };
    const rules = cat.rules.some((x) => x.id === r.id) ? cat.rules.map((x) => x.id === r.id ? r : x) : [...cat.rules, r];
    // The rule's tag IS one of the category's tags — register it so it is listed and colourable.
    const tags = cat.tags.some((t) => t.key === r.tag)
      ? cat.tags
      : [...cat.tags, { key: r.tag, label: r.label || prettyName(ruleSuffix), description: r.description }];
    upsertCategory({ ...cat, rules, tags });
    editing = null;
  }
  function toggleRole(role: PoIRole, on: boolean) {
    if (!editing) return;
    const cur = new Set(editing.appliesTo && editing.appliesTo.length ? editing.appliesTo : DEFAULT_POI_ROLES);
    if (on) cur.add(role); else cur.delete(role);
    editing.appliesTo = [...cur]; editing = editing;
  }
  const ruleRoles = (r: PoIRule): PoIRole[] => (r.appliesTo && r.appliesTo.length ? r.appliesTo : DEFAULT_POI_ROLES);
  function deleteRule(id: string) { patchCat({ rules: cat.rules.filter((r) => r.id !== id) }); }
  function toggleRule(id: string) { patchCat({ rules: cat.rules.map((r) => r.id === id ? { ...r, enabled: r.enabled === false } : r) }); }
  function addRow() { rows = [...rows, { field: POI_FIELDS[0].field, op: 'gte', value: '0.3' }]; }

  $: tagOptions = (() => {
    const set = new Set<string>(existingTags);
    for (const c of cats) for (const r of c.rules) set.add(r.tag);
    return [...set].filter(Boolean).sort();
  })();
</script>

<div class="modal-bg" on:click={() => dispatch('close')} role="presentation">
<div class="modal" on:click|stopPropagation role="dialog" aria-label="Tag category editor">
  <header><h2>Tag categories</h2>
    <div class="head-actions">
      <button type="button" class="poi-help" title="About tags" on:click={() => (showHelp = true)}>
        <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/><line x1="12" x2="12.01" y1="17" y2="17"/></svg>
        Guide
      </button>
      <button class="x" on:click={() => dispatch('close')} aria-label="Close">×</button>
    </div>
  </header>
  {#if showHelp}<HelpModal markdown={tagsGuide} on:close={() => (showHelp = false)} />{/if}
  <p class="lede">A category is a group of tags with a colour and a namespace. Its tags can be applied by hand, or seeded automatically by rules. Physics tags are separate — they are derived and can't be edited here.</p>

  <div class="cols">
    <!-- category list -->
    <aside class="packs">
      {#each cats as c (c.id)}
        <button class="pack-row" class:sel={c.id === selectedId} on:click={() => (selectedId = c.id)}>
          <input type="checkbox" checked={c.enabled} on:click|stopPropagation on:change={(e) => setCategoryEnabled(c.id, e.currentTarget.checked)} title="Available for use" />
          <span class="cat-dot" style="background:{c.color}"></span>
          <span class="pname">{c.longName}{#if c.system}<span class="sysbadge" title="Needed by the engine — can be switched off, but not deleted">sys</span>{/if}</span>
          <span class="pcount">{c.tags.length}</span>
        </button>
      {/each}
      <div class="pack-actions">
        <button on:click={newCategory}>+ New</button>
        <label class="imp">Import…<input type="file" accept=".json" on:change={onImportFile} hidden /></label>
      </div>
      {#if importError}<p class="err">{importError}</p>{/if}
    </aside>

    <!-- category detail -->
    {#if cat}
    <section class="detail">
      <div class="head-row">
        <input class="pack-name" value={cat.longName} on:input={(e) => patchCat({ longName: e.currentTarget.value, shortName: e.currentTarget.value })} />
        <button class="ghost" on:click={() => doExport(cat)}>Export</button>
        {#if !isSystem}<button class="ghost danger" on:click={() => removeCategory(cat.id)}>Delete</button>{/if}
      </div>
      {#if isSystem}
        <p class="note">A <b>system</b> category: the engine matches these tags by name — refuelling, mining, drives, readiness — so it can't be deleted. Everything else about it is yours to change, including switching it off.</p>
      {/if}

      <div class="cat-props">
        <label class="fld mono-fld" title="The namespace shown in every tag, e.g. 'faction' → faction/red-syndicate.">Namespace
          <input class="mono" value={cat.id} readonly title="Fixed once created — tags already applied carry it." />
        </label>
        <label class="fld" title="Tag background colour. A single tag can override this.">Colour
          <input class="swatch" type="color" value={cat.color} on:input={(e) => patchCat({ color: e.currentTarget.value })} />
        </label>
        <label class="fld" title="Tag text colour.">Text
          <input class="swatch" type="color" value={cat.textColor || '#ffffff'} on:input={(e) => patchCat({ textColor: e.currentTarget.value })} />
        </label>
      </div>
      <label class="fld" title="Shown as the hover blurb wherever this category is explained.">Description
        <input value={cat.description ?? ''} on:input={(e) => patchCat({ description: e.currentTarget.value })} placeholder="What this category is for" />
      </label>

      <div class="fld" title="Which kinds of object this category's tags can be applied to.">Applies to
        <div class="roles">
          {#each POI_ROLES as role}
            <label class="rolechk"><input type="checkbox" checked={cat.appliesTo.includes(role)} on:change={(e) => toggleAppliesTo(role, e.currentTarget.checked)} /> {role}</label>
          {/each}
        </div>
      </div>
      <label class="rolechk hide-row" title="Redact every tag in this category from players — they never reach the player view, the catalogue or a report.">
        <input type="checkbox" checked={!!cat.playerHidden} on:change={(e) => setCategoryPlayerHidden(cat.id, e.currentTarget.checked)} /> Hide this category from players
      </label>

      <h3>Tags <span class="muted">({cat.tags.length})</span></h3>
      <p class="note">A tag takes its category's colour unless you give it one of its own — which is how one Faction category can fly a different colour per faction.</p>
      <div class="taglist">
        {#each cat.tags as t (t.key)}
          <div class="tag-row" class:derived={t.derived}>
            <span class="tag-chip-preview" style="background:{tagBg(t.key)}; color:{tagFg(t.key)}">{t.label}</span>
            <code class="key-mono">{t.key}</code>
            <input class="swatch" type="color" value={t.color || cat.color} on:input={(e) => updateTagDef(cat.id, t.key, { color: e.currentTarget.value })} title="Colour for THIS tag (overrides the category)" />
            {#if t.color}<button class="link" on:click={() => updateTagDef(cat.id, t.key, { color: undefined, textColor: undefined })} title="Use the category colour again">reset</button>{/if}
            {#if t.derived}<span class="muted small" title="Mirrored from the ship's live state — not hand-set">auto</span>
            {:else if !t.locked}<button class="x small" on:click={() => removeTagFromCategory(cat.id, t.key)}>×</button>{/if}
          </div>
        {/each}
      </div>
      <div class="addtag">
        <input placeholder="New tag name, e.g. Red Syndicate" bind:value={newTagLabel} on:keydown={(e) => { if (e.key === 'Enter') addTag(); }} />
        <button class="add-line" on:click={addTag} disabled={!newTagLabel.trim()}>+ tag</button>
      </div>

      <h3>Automated rules <span class="muted">({cat.rules.length})</span></h3>
      <p class="note">Rules seed this category's tags onto worlds from the physics, with a seeded roll so a starmap always tags the same way.</p>
      <div class="rules">
        {#each cat.rules as r (r.id)}
          <div class="rule-row" class:off={r.enabled === false}>
            <input type="checkbox" checked={r.enabled !== false} on:change={() => toggleRule(r.id)} title="Enable/disable" />
            <span class="rtag-chip" style="background:{tagBg(r.tag)}; color:{tagFg(r.tag)}" title={r.tag}>{r.tag}</span>
            <span class="rchance">{Math.round(r.chance * 100)}%</span>
            <button class="link" on:click={() => startRule(r)}>edit</button><button class="link danger" on:click={() => deleteRule(r.id)}>del</button>
          </div>
        {/each}
      </div>
      <button class="add-line" on:click={() => startRule()}>+ rule</button>
    </section>
    {/if}
  </div>

  <!-- rule editor overlay -->
  {#if editing && cat}
    <div class="rule-edit-bg" on:click={() => (editing = null)} role="presentation">
    <div class="rule-edit" on:click|stopPropagation role="dialog" aria-label="Edit rule">
      <h3>Edit rule — {cat.longName}</h3>
      <label class="fld" title="The internal tag key, e.g. 'geochem-sample'. Combined with the category namespace it becomes the full tag below.">Tag id (name)
        <input value={ruleSuffix} on:input={(e) => { ruleSuffix = e.currentTarget.value; }} placeholder="e.g. geochem-sample" />
      </label>
      <label class="fld" title="The friendly name players see on the chip. Blank = auto from the tag id.">Player name (label)
        <input value={editing.label ?? ''} on:input={(e) => { editing.label = e.currentTarget.value; editing = editing; }} placeholder={prettyName(ruleSuffix)} />
      </label>
      <label class="fld" title="The hover text shown to players (the flavour / GM hook).">Hover description
        <textarea class="desc" rows="2" value={editing.description ?? ''} on:input={(e) => { editing.description = e.currentTarget.value; editing = editing; }} placeholder="e.g. Spacers' tales of a wreck in this neighbourhood. (GM hook.)"></textarea>
      </label>
      <div class="tag-final">Players see:
        <span class="tag-chip-preview" style="background:{catBg()}; color:{catFg()}" title={editing.description || ''}>{editing.label?.trim() || prettyName(ruleSuffix)}</span>
        <code class="key-mono">{compoundTag(cat.id, ruleSuffix)}</code>
      </div>
      <label class="fld">Chance: {Math.round(editing.chance * 100)}%
        <input type="range" min="0" max="1" step="0.01" value={editing.chance} on:input={(e) => editing.chance = parseFloat(e.currentTarget.value)} />
      </label>

      <div class="fld" title="Which kinds of body this rule may tag. Limited to what the category applies to.">Applies to
        <div class="roles">
          {#each POI_ROLES as role}
            <label class="rolechk" class:ghosted={!cat.appliesTo.includes(role)} title={cat.appliesTo.includes(role) ? '' : `The ${cat.longName} category doesn't apply to ${role}s — add it above first.`}>
              <input type="checkbox" disabled={!cat.appliesTo.includes(role)} checked={ruleRoles(editing).includes(role) && cat.appliesTo.includes(role)} on:change={(e) => toggleRole(role, e.currentTarget.checked)} /> {role}
            </label>
          {/each}
        </div>
      </div>

      <div class="cond-head">
        {#if rawMode}<span>Condition (raw JSON)</span>
        {:else}
          <span class="match">Match
            <select class="modesel" bind:value={matchMode}>
              <option value="all">all of</option>
              <option value="any">any of</option>
            </select>
            conditions
          </span>
        {/if}
        <span class="cond-actions">
          <a class="link" href="/poi-reference" target="_blank" rel="noopener" title="Fields, operators and JSON shapes">reference ↗</a>
          <button class="link" on:click={toggleRaw}>{rawMode ? 'use builder' : 'raw JSON'}</button>
        </span>
      </div>
      {#if rawMode}
        <textarea class="raw" bind:value={rawText} rows="4" spellcheck="false"></textarea>
      {:else}
        {#each rows as row, i}
          {@const isHas = isHasField(row.field)}
          {@const f = isHas ? undefined : fieldOf(row.field)}
          <div class="cond-row">
            <label class="negchk" title="Negate this condition (NOT)"><input type="checkbox" checked={!!row.neg} on:change={(e) => { row.neg = e.currentTarget.checked; rows = rows; }} /> not</label>
            <select value={row.field} on:change={(e) => onFieldChange(row, e.currentTarget.value)} title={f?.note}>
              <optgroup label="Properties">
                {#each POI_FIELDS as pf}<option value={pf.field}>{pf.label}</option>{/each}
              </optgroup>
              {#if tagOptions.length}
                <optgroup label="Has tag…">
                  {#each tagOptions as tk}<option value={'has:' + tk}>{describeTag(tk).label}</option>{/each}
                </optgroup>
              {/if}
            </select>
            {#if isHas}
              <span class="has-label">{row.neg ? 'is absent' : 'is present'}</span>
            {:else}
              <select class="op" value={row.op} on:change={(e) => onOpChange(row, e.currentTarget.value)}>
                {#each opsForRow(row) as op}<option value={op}>{OP_LABEL[op]}</option>{/each}
              </select>
              {#if f?.type === 'bool'}
                <select value={row.value} on:change={(e) => { row.value = e.currentTarget.value; rows = rows; }}><option value="true">true</option><option value="false">false</option></select>
              {:else if f?.type === 'string'}
                <input value={row.value} list="vals-{i}" on:input={(e) => { row.value = e.currentTarget.value; }} /><datalist id="vals-{i}">{#each (f?.values || []) as v}<option value={v}></option>{/each}</datalist>
              {:else if f && hasRange(f) && row.op !== 'between'}
                <div class="num-range">
                  <input class="slider" type="range" min={f.min} max={f.max} step={stepFor(f)} value={row.value === '' ? String(f.min) : row.value} on:input={(e) => { row.value = e.currentTarget.value; rows = rows; }} title="{f.min}–{f.max}" />
                  <input class="num" type="number" value={row.value} on:input={(e) => { row.value = e.currentTarget.value; rows = rows; }} />
                </div>
              {:else if f && hasRange(f) && row.op === 'between'}
                <!-- the dual slider renders full-width on its own line below -->
              {:else}
                <input value={row.value} on:input={(e) => { row.value = e.currentTarget.value; }} placeholder={row.op === 'between' ? 'min,max' : (f ? rangeText(f) : 'value')} />
              {/if}
            {/if}
            <button class="x small" on:click={() => { rows = rows.filter((_, j) => j !== i); }}>×</button>
          </div>
          {#if !isHas && f && hasRange(f) && row.op === 'between'}
            {@const bv = betweenVals(row.value, f)}
            <div class="between-row">
              <input class="num" type="number" value={bv.low} on:input={(e) => { row.value = `${e.currentTarget.value},${bv.high}`; rows = rows; }} />
              <DualRange min={f.min} max={f.max} step={stepFor(f)} low={bv.low} high={bv.high} on:change={(e) => { row.value = `${e.detail.low},${e.detail.high}`; rows = rows; }} />
              <input class="num" type="number" value={bv.high} on:input={(e) => { row.value = `${bv.low},${e.currentTarget.value}`; rows = rows; }} />
            </div>
          {/if}
          {#if isHas}<p class="fhint">True when the body carries the tag <code>{row.field.slice(4)}</code>{row.neg ? ' — negated, so it must NOT have it' : ''}.</p>{:else if f}<p class="fhint">{f.note}{#if rangeText(f)} <span class="range">(range {rangeText(f)})</span>{/if}</p>{/if}
        {/each}
        <button class="add-line" on:click={addRow}>+ condition</button>
        <p class="muted small">No conditions = always applies.</p>
      {/if}
      {#if ruleError}<p class="err">{ruleError}</p>{/if}
      <div class="re-actions"><button on:click={() => (editing = null)}>Cancel</button><button class="primary" on:click={saveRule}>Save rule</button></div>
    </div>
    </div>
  {/if}
</div>
</div>
<style>
  .modal-bg { position: fixed; inset: 0; background: rgba(0,0,0,0.7); display: flex; justify-content: center; align-items: center; z-index: 2200; }
  .modal { background: var(--bg-panel); color: var(--text); border-radius: 8px; padding: 1.2rem 1.4rem; width: 860px; max-width: 96vw; max-height: 95vh; overflow-y: auto; display: flex; flex-direction: column; gap: 0.7rem; }
  header { display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid var(--border); padding-bottom: 0.5rem; }
  header h2 { margin: 0; }
  .lede { margin: 0; font-size: 0.82rem; color: var(--text-muted); line-height: 1.45; }
  .head-actions { display: flex; align-items: center; gap: 10px; }
  .poi-help { display: inline-flex; align-items: center; gap: 4px; background: none; border: 1px solid var(--border); border-radius: 6px; color: var(--text-muted, #b8bcc4); font-size: 0.78rem; padding: 3px 8px; cursor: pointer; }
  .poi-help:hover { color: var(--accent); border-color: var(--accent); }
  .poi-help svg { flex: 0 0 auto; }
  .x { background: none; border: none; color: var(--text); font-size: 1.4rem; line-height: 1; cursor: pointer; }
  .x.small { font-size: 1rem; color: #f55; }
  .cols { display: grid; grid-template-columns: 230px 1fr; gap: 1rem; min-height: 320px; }
  .packs { display: flex; flex-direction: column; gap: 4px; border-right: 1px solid var(--border); padding-right: 0.8rem; }
  .pack-row { display: flex; align-items: center; gap: 6px; background: var(--bg-control); border: 1px solid transparent; border-radius: 4px; padding: 6px 8px; cursor: pointer; color: var(--text); text-align: left; }
  .pack-row.sel { border-color: var(--accent); }
  .pname { flex: 1; font-size: 0.85rem; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .pcount { font-size: 0.7rem; color: var(--text-faint); }
  .pack-actions { display: flex; gap: 6px; margin-top: 6px; }
  .pack-actions button, .imp { flex: 1; text-align: center; background: var(--bg-control); border: 1px solid var(--border); border-radius: 4px; padding: 5px; cursor: pointer; font-size: 0.78rem; color: var(--text); }
  .examples { margin-top: 10px; display: flex; flex-direction: column; gap: 4px; }
  .examples .lbl { font-size: 0.7rem; color: var(--text-faint); }
  .ex { background: var(--bg-control); border: 1px dashed var(--border); border-radius: 4px; padding: 5px; font-size: 0.76rem; cursor: pointer; color: var(--link); text-align: left; }
  .detail { display: flex; flex-direction: column; gap: 0.4rem; min-width: 0; }
  .head-row { display: flex; gap: 8px; align-items: center; }
  .pack-name { flex: 1; font-size: 1rem; font-weight: 700; background: var(--bg-control); border: 1px solid var(--border); border-radius: 4px; padding: 6px 8px; color: var(--text); }
  .ghost { background: var(--bg-control); border: 1px solid var(--border); border-radius: 4px; padding: 6px 10px; cursor: pointer; color: var(--text); font-size: 0.8rem; }
  .ghost.danger, .link.danger { color: #f55; }
  .note, .fhint, .small.muted { font-size: 0.74rem; color: var(--text-faint); margin: 2px 0; }
  h3 { margin: 0.6rem 0 0.2rem; font-size: 0.85rem; }
  .muted { color: var(--text-faint); font-weight: 400; }
  .cat-row, .rule-row, .cond-row { display: flex; gap: 6px; align-items: center; margin: 3px 0; }
  .cat-row input, .cond-row input, .cond-row select, .rule-edit input, .rule-edit select { background: var(--bg-control); border: 1px solid var(--border); border-radius: 4px; padding: 5px 7px; color: var(--text); font-size: 0.8rem; }
  .cat-row .mono { width: 96px; font-family: var(--font-mono, monospace); }
  .cat-row .swatch { width: 26px; height: 26px; padding: 1px; flex: 0 0 auto; cursor: pointer; }
  .tag-chip-preview { font-family: var(--font-mono, monospace); font-size: 0.72rem; padding: 2px 7px; border-radius: 4px; white-space: nowrap; }
  .cat-row .tag-chip-preview { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; }
  .rules { display: flex; flex-direction: column; gap: 2px; max-height: 46vh; overflow-y: auto; padding-right: 8px; }
  .rule-row { font-size: 0.8rem; }
  .rule-row.off { opacity: 0.45; }
  .rtag-chip { flex: 1; min-width: 0; font-family: var(--font-mono, monospace); font-size: 0.72rem; padding: 2px 7px; border-radius: 4px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .rchance { color: var(--text-muted); min-width: 40px; text-align: right; padding-right: 4px; }
  .tag-final { display: flex; align-items: center; gap: 7px; font-size: 0.76rem; color: var(--text-muted); margin: 2px 0; flex-wrap: wrap; }
  .key-mono { font-family: var(--font-mono, monospace); font-size: 0.72rem; color: var(--text-faint); }
  .rule-edit .desc { width: 100%; background: var(--bg-control); border: 1px solid var(--border); border-radius: 4px; color: var(--text); font-size: 0.8rem; padding: 6px; resize: vertical; }
  .cond-head .modesel { padding: 2px 4px; }
  .cond-actions { display: inline-flex; gap: 10px; align-items: baseline; }
  .cond-actions a.link { text-decoration: none; }
  .roles { display: flex; flex-wrap: wrap; gap: 4px 12px; }
  .rolechk { display: inline-flex; align-items: center; gap: 4px; font-size: 0.8rem; color: var(--text); text-transform: capitalize; }
  .rolechk input { width: auto; }
  .range { color: var(--text-faint); }
  .link { background: none; border: none; color: var(--link); cursor: pointer; font-size: 0.76rem; padding: 0 2px; }
  .add-line { align-self: flex-start; background: none; border: 1px dashed var(--border); border-radius: 4px; color: var(--link); padding: 4px 10px; cursor: pointer; font-size: 0.78rem; margin-top: 3px; }
  .err { color: #f55; font-size: 0.78rem; }
  .rule-edit-bg { position: fixed; inset: 0; background: rgba(0,0,0,0.6); display: flex; justify-content: center; align-items: center; z-index: 2300; }
  .rule-edit { background: var(--bg-panel); border: 1px solid var(--border); border-radius: 8px; padding: 1.1rem; width: 540px; max-width: 94vw; max-height: 92vh; overflow-y: auto; overflow-x: hidden; display: flex; flex-direction: column; gap: 0.5rem; }
  .rule-edit input, .rule-edit select, .rule-edit textarea { box-sizing: border-box; }
  .rule-edit input[type="range"] { width: 100%; margin: 0; }
  .rule-edit h3 { margin: 0 0 0.3rem; }
  .fld { display: flex; flex-direction: column; gap: 3px; font-size: 0.78rem; color: var(--text-muted); }
  .fld input, .fld select { width: 100%; }
  .cond-head { display: flex; justify-content: space-between; align-items: baseline; margin-top: 0.5rem; font-size: 0.8rem; }
  .cond-row select:first-child { flex: 2; min-width: 0; }
  .cond-row input, .cond-row select { flex: 1; min-width: 0; }
  .cond-row .op { flex: 0 0 auto; min-width: 58px; width: auto; }
  .cond-row .negchk { flex: 0 0 auto; display: inline-flex; align-items: center; gap: 3px; font-size: 0.72rem; color: var(--text-muted); }
  .cond-row .negchk input { width: auto; }
  .cond-row .has-label { flex: 1; min-width: 0; font-size: 0.8rem; color: var(--text-muted); }
  .cond-row .num-range { flex: 1; display: flex; gap: 6px; align-items: center; min-width: 0; }
  .cond-row .num-range .slider { flex: 1; min-width: 36px; padding: 0; }
  .cond-row .num-range .num { flex: 0 0 58px; width: 58px; }
  .between-row { display: flex; align-items: center; gap: 8px; margin: 1px 0 2px; padding: 0 2px; }
  .between-row .num { flex: 0 0 56px; width: 56px; background: var(--bg-control); border: 1px solid var(--border); border-radius: 4px; padding: 5px 7px; color: var(--text); font-size: 0.8rem; }
  .fhint code { font-family: var(--font-mono, monospace); background: var(--bg-control); padding: 0 3px; border-radius: 3px; }
  .raw { width: 100%; background: var(--bg-control); border: 1px solid var(--border); border-radius: 4px; color: var(--text); font-family: var(--font-mono, monospace); font-size: 0.76rem; padding: 6px; }
  .re-actions { display: flex; justify-content: flex-end; gap: 0.6rem; margin-top: 0.6rem; }
  .re-actions button, .modal button.primary { padding: 7px 14px; border: none; border-radius: 4px; background: var(--bg-control); color: var(--text); cursor: pointer; }
  .primary { background: var(--accent) !important; color: var(--on-accent, #fff); }

  /* Mobile: stop the side-by-side from overflowing — stack the pack list above the detail, run the
     pack list as wrapping chips, and let the rule editor + condition rows use the full width. */
  @media (max-width: 760px) {
    .modal { width: 100%; padding: 0.9rem; }
    .cols { display: flex; flex-direction: column; gap: 0.7rem; min-height: 0; }
    .packs { flex-direction: row; flex-wrap: wrap; align-items: center; border-right: none; border-bottom: 1px solid var(--border); padding: 0 0 0.7rem; }
    .pack-row { flex: 0 0 auto; }
    .pname { max-width: 120px; }
    .pack-actions, .examples { flex: 0 0 auto; margin-top: 0; }
    .examples { flex-direction: row; align-items: center; }
    .rule-edit { width: 100%; padding: 0.9rem; }
    .cond-row { flex-wrap: wrap; }
    .cond-row select:first-child { flex: 1 1 100%; }
    .cond-row .op { flex: 0 0 auto; }
    .cat-row { flex-wrap: wrap; }
    .cat-row .mono, .cat-row input { flex: 1 1 40%; }
  }

  /* unified editor additions */
  .cat-dot { width: 10px; height: 10px; border-radius: 50%; flex: 0 0 auto; }
  .sysbadge { font-size: 0.62rem; text-transform: uppercase; letter-spacing: 0.05em; opacity: 0.65; margin-left: 5px; border: 1px solid currentColor; border-radius: 3px; padding: 0 3px; }
  .cat-props { display: flex; gap: 10px; align-items: flex-end; flex-wrap: wrap; }
  .mono-fld { flex: 1 1 160px; }
  .taglist { display: flex; flex-direction: column; gap: 4px; margin: 4px 0; }
  .tag-row { display: flex; align-items: center; gap: 7px; }
  .tag-row.derived { opacity: 0.7; }
  .addtag { display: flex; gap: 6px; align-items: center; }
  .addtag input { flex: 1; }
  .hide-row { margin: 6px 0; }
  .rolechk.ghosted { opacity: 0.4; }
</style>
