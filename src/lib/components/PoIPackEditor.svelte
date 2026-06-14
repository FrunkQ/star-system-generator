<script lang="ts">
  // Point-of-Interest pack editor: manage stacked packs (enable/import/export/new/delete), their
  // categories, and rules. Rule conditions are built with guided field → operator → value rows
  // (ANDed), with a raw-JSON fallback for complex any/not/nested logic.
  import { createEventDispatcher } from 'svelte';
  import { poiPacks, exportPack, importPack, POI_FIELDS, DEFAULT_POI_PACK, POI_ROLES, DEFAULT_POI_ROLES,
    type PoIPack, type PoIRule, type PoIExpr, type PoIField, type ReasonCategory, type PoIRole } from '$lib/physics/reasonsToVisit';
  import { EXAMPLE_POI_PACKS } from '$lib/physics/poiExamplePacks';
  import DualRange from './DualRange.svelte';
  import { describeTag } from '$lib/tags/tagPresentation';

  export let existingTags: string[] = [];   // every tag key present across the systems (for has: rows)

  const dispatch = createEventDispatcher();
  let selectedId = 'default';
  $: packs = $poiPacks;
  $: pack = packs.find((p) => p.id === selectedId) ?? packs[0];
  $: isDefault = pack?.id === 'default';

  // Category colour helpers (chip background / font) — drive the live tag previews + the rule list.
  const catOf = (id: string): ReasonCategory | undefined => pack?.categories.find((c) => c.id === id);
  const catBg = (id: string) => catOf(id)?.color || '#555a66';
  const catFg = (id: string) => catOf(id)?.textColor || '#ffffff';
  // The compound tag is category-id + "/" + a sanitised suffix the user types.
  const slug = (s: string) => s.trim().toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9/_-]/g, '');
  const compoundTag = (catId: string, suffix: string) => `${catId}/${slug(suffix) || 'new-hook'}`;
  const prettyName = (s: string) => (slug(s).split('/').pop() || 'new-hook').replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());

  const fieldOf = (name: string): PoIField | undefined => POI_FIELDS.find((f) => f.field === name);
  const opsFor = (f?: PoIField) => f?.type === 'number' ? ['gte', 'lte', 'gt', 'lt', 'between'] : ['eq'];
  // Human-readable range for a numeric field — fractions read clearer as 0.0–1.0.
  const rangeText = (f?: PoIField) => f && f.type === 'number'
    ? (f.max !== undefined && f.max <= 1 ? '0.0–1.0' : `${f.min ?? 0}–${f.max ?? '∞'}`)
    : '';
  // When a numeric field has explicit bounds, offer a slider (the number stays hand-editable).
  const hasRange = (f?: PoIField) => !!f && f.type === 'number' && f.min !== undefined && f.max !== undefined;
  const stepFor = (f: PoIField) => (f.max! <= 1 ? 0.01 : (f.max! <= 10 ? 0.1 : 1));
  // Parse a "low,high" between value, defaulting empties to the field bounds.
  const betweenVals = (v: string, f: PoIField) => {
    const [a, b] = (v || '').split(',').map((x) => parseFloat(x));
    return { low: Number.isNaN(a) ? f.min! : a, high: Number.isNaN(b) ? f.max! : b };
  };
  // A `has:<tag>` field is a tag-PRESENCE check (the body carries that tag). With the row's NOT
  // toggle it becomes "lacks that tag". The tag list is the real tags present across the systems.
  const isHasField = (field: string) => field.startsWith('has:');
  const opsForRow = (row: { field: string }) => isHasField(row.field) ? [] : opsFor(fieldOf(row.field));
  function onFieldChange(row: { field: string; op: string }, value: string) {
    row.field = value;
    row.op = isHasField(value) ? '' : opsFor(fieldOf(value))[0];
    rows = rows;
  }
  // Switching op to/from "between" reshapes the value between a single number and a "lo,hi" pair.
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

  // --- pack ops ---
  function update(fn: (ps: PoIPack[]) => PoIPack[]) { poiPacks.update(fn); }
  function patchPack(patch: Partial<PoIPack>) { update((ps) => ps.map((p) => p.id === pack.id ? { ...p, ...patch } : p)); }
  function newPack() {
    const id = 'pack-' + Math.random().toString(36).slice(2, 8);
    update((ps) => [...ps, { id, name: 'New pack', description: '', enabled: true, categories: [{ id: 'custom', label: 'Custom', desc: '' }], rules: [] }]);
    selectedId = id;
  }
  function deletePack(id: string) {
    if (id === 'default') return;
    update((ps) => ps.filter((p) => p.id !== id));
    selectedId = 'default';
  }
  function resetDefault() {
    if (!confirm('Reset the built-in pack to its original categories and rules? Your edits to it will be lost.')) return;
    update((ps) => ps.map((p) => p.id === 'default' ? { ...structuredClone(DEFAULT_POI_PACK), enabled: p.enabled } : p));
  }
  function doExport(p: PoIPack) {
    const blob = new Blob([exportPack(p)], { type: 'application/json' });
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob);
    a.download = `${p.name.replace(/[^\w-]+/g, '_')}.poi.json`; a.click(); URL.revokeObjectURL(a.href);
  }
  let importError = '';
  function onImportFile(e: Event) {
    const file = (e.target as HTMLInputElement).files?.[0]; if (!file) return;
    const r = new FileReader();
    r.onload = () => { try { const p = importPack(String(r.result)); update((ps) => [...ps.filter((x) => x.id !== p.id), p]); selectedId = p.id; importError = ''; } catch (err) { importError = (err as Error).message; } };
    r.readAsText(file); (e.target as HTMLInputElement).value = '';
  }
  function loadExample(ex: PoIPack) {
    const copy = structuredClone(ex);
    update((ps) => [...ps.filter((x) => x.id !== copy.id), copy]); selectedId = copy.id;
  }

  // --- categories ---
  function addCategory() { patchPack({ categories: [...pack.categories, { id: 'new-category', label: 'New category', desc: '', color: '#6c8cb5', textColor: '#ffffff' }] }); }
  function patchCategory(i: number, patch: Partial<ReasonCategory>) {
    patchPack({ categories: pack.categories.map((c, j) => j === i ? { ...c, ...patch } : c) });
  }
  function removeCategory(i: number) { patchPack({ categories: pack.categories.filter((_, j) => j !== i) }); }

  // --- rules ---
  let editing: PoIRule | null = null;
  let ruleSuffix = '';          // the part after the category prefix, e.g. "geochem-sample"
  type Row = { field: string; op: string; value: string; neg?: boolean };
  let rows: Row[] = [];
  let rawMode = false; let rawText = ''; let ruleError = '';
  let matchMode: 'all' | 'any' = 'all';      // builder combines its rows with AND (all) or OR (any)
  const suffixOf = (tag: string) => tag.includes('/') ? tag.split('/').slice(1).join('/') : tag;

  // Parse a single flat clause into a row (no NOT). Returns null if it isn't flat-representable.
  function clauseToRow(c: any): Row | null {
    if ('hasTag' in c) return { field: `has:${c.hasTag}`, op: '', value: '' };
    if ('between' in c) return { field: c.between[0], op: 'between', value: `${c.between[1]},${c.between[2]}` };
    if ('eq' in c) return { field: c.eq[0], op: 'eq', value: String(c.eq[1]) };
    const op = ['gt', 'lt', 'gte', 'lte'].find((o) => o in c);
    return op ? { field: c[op][0], op, value: String(c[op][1]) } : null;
  }
  // A condition is builder-representable if it's `true`, a flat clause (optionally NOT-wrapped), or a
  // flat all/any of those. Nested all/any and hasTagPrefix fall back to raw JSON.
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
      if (!row) return { rows: [], raw: true, mode };   // nested / hasTagPrefix → raw
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
    const cat0 = pack.categories[0]?.id || 'custom';
    editing = r ? { ...r } : { id: 'r' + Math.random().toString(36).slice(2, 7), tag: cat0 + '/new-hook', category: cat0, chance: 0.5, when: true };
    ruleSuffix = suffixOf(editing.tag);
    const parsed = whenToRows(editing.when); rows = parsed.rows; rawMode = parsed.raw; matchMode = parsed.mode; rawText = JSON.stringify(editing.when, null, 0); ruleError = '';
  }
  function saveRule() {
    if (!editing) return;
    let when: PoIExpr;
    if (rawMode) { try { when = JSON.parse(rawText); } catch { ruleError = 'Invalid JSON'; return; } }
    else when = rowsToWhen(rows, matchMode);
    // The tag is always category-id + "/" + the typed suffix, so it stays in sync with its category.
    const r: PoIRule = {
      ...editing, tag: compoundTag(editing.category, ruleSuffix), when,
      label: editing.label?.trim() || undefined,
      description: editing.description?.trim() || undefined
    };
    patchPack({ rules: pack.rules.some((x) => x.id === r.id) ? pack.rules.map((x) => x.id === r.id ? r : x) : [...pack.rules, r] });
    editing = null;
  }
  function toggleRole(role: PoIRole, on: boolean) {
    if (!editing) return;
    const cur = new Set(editing.appliesTo && editing.appliesTo.length ? editing.appliesTo : DEFAULT_POI_ROLES);
    if (on) cur.add(role); else cur.delete(role);
    editing.appliesTo = [...cur]; editing = editing;
  }
  const ruleRoles = (r: PoIRule): PoIRole[] => (r.appliesTo && r.appliesTo.length ? r.appliesTo : DEFAULT_POI_ROLES);
  function deleteRule(id: string) { patchPack({ rules: pack.rules.filter((r) => r.id !== id) }); }
  function toggleRule(id: string) { patchPack({ rules: pack.rules.map((r) => r.id === id ? { ...r, enabled: r.enabled === false } : r) }); }
  function addRow() { rows = [...rows, { field: POI_FIELDS[0].field, op: 'gte', value: '0.3' }]; }
  // Tags selectable as presence ("has:") conditions: real tags on bodies + any tag a rule produces.
  $: tagOptions = (() => {
    const set = new Set<string>(existingTags);
    for (const p of packs) for (const r of p.rules) set.add(r.tag);
    return [...set].filter(Boolean).sort();
  })();
</script>

<div class="modal-bg" on:click={() => dispatch('close')} role="presentation">
<div class="modal" on:click|stopPropagation role="dialog" aria-label="PoI pack editor">
  <header><h2>Point-of-Interest packs</h2><button class="x" on:click={() => dispatch('close')} aria-label="Close">×</button></header>
  <p class="lede">Rules tag worlds with reasons to visit. Packs stack — enable several at once. Edit raw rules here, or hand a pack file to a friend. Physics-locked tags can't be changed; these add to them.</p>

  <div class="cols">
    <!-- pack list -->
    <aside class="packs">
      {#each packs as p (p.id)}
        <button class="pack-row" class:sel={p.id === selectedId} on:click={() => (selectedId = p.id)}>
          <input type="checkbox" checked={p.enabled !== false} on:click|stopPropagation on:change={() => poiPacks.update((ps) => ps.map((x) => x.id === p.id ? { ...x, enabled: x.enabled === false } : x))} />
          <span class="pname">{p.name}</span>
          <span class="pcount">{p.rules.length}</span>
        </button>
      {/each}
      <div class="pack-actions">
        <button on:click={newPack}>+ New</button>
        <label class="imp">Import…<input type="file" accept=".json" on:change={onImportFile} hidden /></label>
      </div>
      {#if importError}<p class="err">{importError}</p>{/if}
      <div class="examples">
        <span class="lbl">Examples:</span>
        {#each EXAMPLE_POI_PACKS as ex}<button class="ex" on:click={() => loadExample(ex)} title={ex.description}>{ex.name}</button>{/each}
      </div>
    </aside>

    <!-- pack detail -->
    {#if pack}
    <section class="detail">
      <div class="head-row">
        <input class="pack-name" value={pack.name} on:input={(e) => patchPack({ name: e.currentTarget.value })} />
        <button class="ghost" on:click={() => doExport(pack)}>Export</button>
        {#if isDefault}<button class="ghost" on:click={resetDefault} title="Restore the original built-in categories and rules">Reset</button>
        {:else}<button class="ghost danger" on:click={() => deletePack(pack.id)}>Delete</button>{/if}
      </div>
      {#if isDefault}<p class="note">This is the built-in pack — edit it freely. Use <b>Reset</b> to restore the originals.</p>{/if}

      <h3>Categories</h3>
      <p class="note">A category is a tag <b>prefix</b> + a <b>colour</b>. The <b>id</b> is what appears in the tag (e.g. <code>survey</code> → <code>survey/…</code>); the <b>label</b> is the heading players see (e.g. "Survey Value").</p>
      {#each pack.categories as cat, i (i)}
        <div class="cat-row">
          <input class="mono" value={cat.id} on:input={(e) => patchCategory(i, { id: e.currentTarget.value })} placeholder="id (prefix)" title="The prefix shown in the tag, e.g. 'survey' → survey/geochem-sample." />
          <input value={cat.label} on:input={(e) => patchCategory(i, { label: e.currentTarget.value })} placeholder="label (heading)" title="The display heading players see, e.g. 'Survey Value'." />
          <input class="swatch" type="color" value={cat.color || '#6c8cb5'} on:input={(e) => patchCategory(i, { color: e.currentTarget.value })} title="Tag background colour" />
          <input class="swatch" type="color" value={cat.textColor || '#ffffff'} on:input={(e) => patchCategory(i, { textColor: e.currentTarget.value })} title="Tag text colour" />
          <span class="tag-chip-preview" style="background:{cat.color || '#6c8cb5'}; color:{cat.textColor || '#fff'}">{cat.id}/…</span>
          <button class="x small" on:click={() => removeCategory(i)}>×</button>
        </div>
      {/each}
      <button class="add-line" on:click={addCategory}>+ category</button>

      <h3>Rules <span class="muted">({pack.rules.length})</span></h3>
      <div class="rules">
        {#each pack.rules as r (r.id)}
          <div class="rule-row" class:off={r.enabled === false}>
            <input type="checkbox" checked={r.enabled !== false} on:change={() => toggleRule(r.id)} title="Enable/disable" />
            <span class="rtag-chip" style="background:{catBg(r.category)}; color:{catFg(r.category)}" title={r.tag}>{r.tag}</span>
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
  {#if editing}
    <div class="rule-edit-bg" on:click={() => (editing = null)} role="presentation">
    <div class="rule-edit" on:click|stopPropagation role="dialog" aria-label="Edit rule">
      <h3>Edit rule</h3>
      <label class="fld" title="The category sets the tag's prefix and colour.">Category
        <select value={editing.category} on:change={(e) => { editing.category = e.currentTarget.value; editing = editing; }}>
          {#each pack.categories as c}<option value={c.id}>{c.label}</option>{/each}
        </select>
      </label>
      <label class="fld" title="The internal tag key, e.g. 'geochem-sample'. Combined with the category it becomes the full tag id below.">Tag id (name)
        <input value={ruleSuffix} on:input={(e) => { ruleSuffix = e.currentTarget.value; }} placeholder="e.g. geochem-sample" />
      </label>
      <label class="fld" title="The friendly name players see on the chip. Blank = auto from the tag id.">Player name (label)
        <input value={editing.label ?? ''} on:input={(e) => { editing.label = e.currentTarget.value; editing = editing; }} placeholder={prettyName(ruleSuffix)} />
      </label>
      <label class="fld" title="The hover text shown to players (the flavour / GM hook).">Hover description
        <textarea class="desc" rows="2" value={editing.description ?? ''} on:input={(e) => { editing.description = e.currentTarget.value; editing = editing; }} placeholder="e.g. Spacers' tales of a wreck in this neighbourhood. (GM hook.)"></textarea>
      </label>
      <div class="tag-final">Players see:
        <span class="tag-chip-preview" style="background:{catBg(editing.category)}; color:{catFg(editing.category)}" title={editing.description || ''}>{editing.label?.trim() || prettyName(ruleSuffix)}</span>
        <code class="key-mono">{compoundTag(editing.category, ruleSuffix)}</code>
      </div>
      <label class="fld">Chance: {Math.round(editing.chance * 100)}%
        <input type="range" min="0" max="1" step="0.01" value={editing.chance} on:input={(e) => editing.chance = parseFloat(e.currentTarget.value)} />
      </label>

      <div class="fld" title="Which kinds of body this rule may tag.">Applies to
        <div class="roles">
          {#each POI_ROLES as role}
            <label class="rolechk"><input type="checkbox" checked={ruleRoles(editing).includes(role)} on:change={(e) => toggleRole(role, e.currentTarget.checked)} /> {role}</label>
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
</style>
