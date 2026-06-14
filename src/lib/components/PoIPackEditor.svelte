<script lang="ts">
  // Point-of-Interest pack editor: manage stacked packs (enable/import/export/new/delete), their
  // categories, and rules. Rule conditions are built with guided field → operator → value rows
  // (ANDed), with a raw-JSON fallback for complex any/not/nested logic.
  import { createEventDispatcher } from 'svelte';
  import { poiPacks, exportPack, importPack, POI_FIELDS, DEFAULT_POI_PACK,
    type PoIPack, type PoIRule, type PoIExpr, type PoIField } from '$lib/physics/reasonsToVisit';
  import { EXAMPLE_POI_PACKS } from '$lib/physics/poiExamplePacks';

  const dispatch = createEventDispatcher();
  let selectedId = 'default';
  $: packs = $poiPacks;
  $: pack = packs.find((p) => p.id === selectedId) ?? packs[0];
  $: isDefault = pack?.id === 'default';

  const fieldOf = (name: string): PoIField | undefined => POI_FIELDS.find((f) => f.field === name);
  const opsFor = (f?: PoIField) => f?.type === 'number' ? ['gte', 'lte', 'gt', 'lt', 'between'] : ['eq'];
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
  function addCategory() { patchPack({ categories: [...pack.categories, { id: 'cat' + pack.categories.length, label: 'Category', desc: '' }] }); }
  function patchCategory(i: number, patch: Partial<{ id: string; label: string; desc: string }>) {
    patchPack({ categories: pack.categories.map((c, j) => j === i ? { ...c, ...patch } : c) });
  }
  function removeCategory(i: number) { patchPack({ categories: pack.categories.filter((_, j) => j !== i) }); }

  // --- rules ---
  let editing: PoIRule | null = null;
  let rows: { field: string; op: string; value: string }[] = [];
  let rawMode = false; let rawText = ''; let ruleError = '';

  function whenToRows(when: PoIExpr): { rows: typeof rows; raw: boolean } {
    const clauses = when === true ? [] : ('all' in (when as any) ? (when as any).all : [when]);
    const out: typeof rows = [];
    for (const c of clauses) {
      if ('between' in c) out.push({ field: c.between[0], op: 'between', value: `${c.between[1]},${c.between[2]}` });
      else if ('eq' in c) out.push({ field: c.eq[0], op: 'eq', value: String(c.eq[1]) });
      else { const op = ['gt', 'lt', 'gte', 'lte'].find((o) => o in c); if (op) out.push({ field: (c as any)[op][0], op, value: String((c as any)[op][1]) }); else return { rows: [], raw: true }; }
    }
    return { rows: out, raw: false };
  }
  function rowsToWhen(rs: typeof rows): PoIExpr {
    const clauses = rs.filter((r) => r.field).map((r): PoIExpr => {
      const f = fieldOf(r.field);
      if (r.op === 'eq') { const v = f?.type === 'bool' ? r.value === 'true' : (f?.type === 'number' ? parseFloat(r.value) : r.value); return { eq: [r.field, v] }; }
      if (r.op === 'between') { const [a, b] = r.value.split(',').map((x) => parseFloat(x)); return { between: [r.field, a || 0, b || 0] }; }
      return { [r.op]: [r.field, parseFloat(r.value) || 0] } as PoIExpr;
    });
    return clauses.length === 0 ? true : (clauses.length === 1 ? clauses[0] : { all: clauses });
  }
  function startRule(r?: PoIRule) {
    editing = r ? { ...r } : { id: 'r' + Math.random().toString(36).slice(2, 7), tag: pack.categories[0]?.id + '/new-hook', category: pack.categories[0]?.id || 'custom', chance: 0.5, when: true };
    const parsed = whenToRows(editing.when); rows = parsed.rows; rawMode = parsed.raw; rawText = JSON.stringify(editing.when, null, 0); ruleError = '';
  }
  function saveRule() {
    if (!editing) return;
    let when: PoIExpr;
    if (rawMode) { try { when = JSON.parse(rawText); } catch { ruleError = 'Invalid JSON'; return; } }
    else when = rowsToWhen(rows);
    const r = { ...editing, when };
    patchPack({ rules: pack.rules.some((x) => x.id === r.id) ? pack.rules.map((x) => x.id === r.id ? r : x) : [...pack.rules, r] });
    editing = null;
  }
  function deleteRule(id: string) { patchPack({ rules: pack.rules.filter((r) => r.id !== id) }); }
  function toggleRule(id: string) { patchPack({ rules: pack.rules.map((r) => r.id === id ? { ...r, enabled: r.enabled === false } : r) }); }
  function addRow() { rows = [...rows, { field: POI_FIELDS[0].field, op: 'gte', value: '0.3' }]; }
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
        <input class="pack-name" value={pack.name} disabled={isDefault} on:input={(e) => patchPack({ name: e.currentTarget.value })} />
        <button class="ghost" on:click={() => doExport(pack)}>Export</button>
        {#if !isDefault}<button class="ghost danger" on:click={() => deletePack(pack.id)}>Delete</button>{/if}
      </div>
      {#if isDefault}<p class="note">The built-in pack is read-only — duplicate via Export → edit → Import, or add your own.</p>{/if}

      <h3>Categories</h3>
      {#each pack.categories as cat, i (i)}
        <div class="cat-row">
          <input class="mono" value={cat.id} disabled={isDefault} on:input={(e) => patchCategory(i, { id: e.currentTarget.value })} placeholder="id" />
          <input value={cat.label} disabled={isDefault} on:input={(e) => patchCategory(i, { label: e.currentTarget.value })} placeholder="label" />
          {#if !isDefault}<button class="x small" on:click={() => removeCategory(i)}>×</button>{/if}
        </div>
      {/each}
      {#if !isDefault}<button class="add-line" on:click={addCategory}>+ category</button>{/if}

      <h3>Rules <span class="muted">({pack.rules.length})</span></h3>
      <div class="rules">
        {#each pack.rules as r (r.id)}
          <div class="rule-row" class:off={r.enabled === false}>
            <input type="checkbox" checked={r.enabled !== false} on:change={() => toggleRule(r.id)} title="Enable/disable" />
            <code class="rtag">{r.tag}</code>
            <span class="rchance">{Math.round(r.chance * 100)}%</span>
            {#if !isDefault}<button class="link" on:click={() => startRule(r)}>edit</button><button class="link danger" on:click={() => deleteRule(r.id)}>del</button>{/if}
          </div>
        {/each}
      </div>
      {#if !isDefault}<button class="add-line" on:click={() => startRule()}>+ rule</button>{/if}
    </section>
    {/if}
  </div>

  <!-- rule editor overlay -->
  {#if editing}
    <div class="rule-edit-bg" on:click={() => (editing = null)} role="presentation">
    <div class="rule-edit" on:click|stopPropagation role="dialog" aria-label="Edit rule">
      <h3>Edit rule</h3>
      <label class="fld">Tag <input value={editing.tag} on:input={(e) => editing.tag = e.currentTarget.value} placeholder="category/hook" /></label>
      <label class="fld">Category
        <select value={editing.category} on:change={(e) => editing.category = e.currentTarget.value}>
          {#each pack.categories as c}<option value={c.id}>{c.label}</option>{/each}
        </select>
      </label>
      <label class="fld">Chance: {Math.round(editing.chance * 100)}%
        <input type="range" min="0" max="1" step="0.01" value={editing.chance} on:input={(e) => editing.chance = parseFloat(e.currentTarget.value)} />
      </label>

      <div class="cond-head"><span>Condition {rawMode ? '(raw JSON)' : '(all of)'}</span>
        <button class="link" on:click={() => { if (rawMode) { const p = whenToRows((() => { try { return JSON.parse(rawText); } catch { return true; } })()); rows = p.rows; rawMode = p.raw; } else { rawText = JSON.stringify(rowsToWhen(rows)); rawMode = true; } }}>{rawMode ? 'use builder' : 'raw JSON'}</button>
      </div>
      {#if rawMode}
        <textarea class="raw" bind:value={rawText} rows="4" spellcheck="false"></textarea>
      {:else}
        {#each rows as row, i}
          {@const f = fieldOf(row.field)}
          <div class="cond-row">
            <select value={row.field} on:change={(e) => { row.field = e.currentTarget.value; const nf = fieldOf(row.field); row.op = opsFor(nf)[0]; rows = rows; }} title={f?.note}>
              {#each POI_FIELDS as pf}<option value={pf.field}>{pf.label}</option>{/each}
            </select>
            <select value={row.op} on:change={(e) => { row.op = e.currentTarget.value; rows = rows; }}>
              {#each opsFor(f) as op}<option value={op}>{OP_LABEL[op]}</option>{/each}
            </select>
            {#if f?.type === 'bool'}
              <select value={row.value} on:change={(e) => { row.value = e.currentTarget.value; rows = rows; }}><option value="true">true</option><option value="false">false</option></select>
            {:else if f?.type === 'string'}
              <input value={row.value} list="vals-{i}" on:input={(e) => { row.value = e.currentTarget.value; }} /><datalist id="vals-{i}">{#each (f?.values || []) as v}<option value={v}></option>{/each}</datalist>
            {:else}
              <input value={row.value} on:input={(e) => { row.value = e.currentTarget.value; }} placeholder={row.op === 'between' ? 'min,max' : (f ? `${f.min}–${f.max}` : 'value')} />
            {/if}
            <button class="x small" on:click={() => { rows = rows.filter((_, j) => j !== i); }}>×</button>
          </div>
          {#if f}<p class="fhint">{f.note}</p>{/if}
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
  .modal { background: var(--bg-panel); color: var(--text); border-radius: 8px; padding: 1.2rem 1.4rem; width: 860px; max-width: 96vw; max-height: 92vh; overflow-y: auto; display: flex; flex-direction: column; gap: 0.7rem; }
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
  .cat-row .mono { width: 110px; font-family: var(--font-mono, monospace); }
  .rules { display: flex; flex-direction: column; gap: 2px; max-height: 220px; overflow-y: auto; }
  .rule-row { font-size: 0.8rem; }
  .rule-row.off { opacity: 0.45; }
  .rtag { flex: 1; font-family: var(--font-mono, monospace); font-size: 0.76rem; overflow: hidden; text-overflow: ellipsis; }
  .rchance { color: var(--text-faint); width: 38px; text-align: right; }
  .link { background: none; border: none; color: var(--link); cursor: pointer; font-size: 0.76rem; padding: 0 2px; }
  .add-line { align-self: flex-start; background: none; border: 1px dashed var(--border); border-radius: 4px; color: var(--link); padding: 4px 10px; cursor: pointer; font-size: 0.78rem; margin-top: 3px; }
  .err { color: #f55; font-size: 0.78rem; }
  .rule-edit-bg { position: fixed; inset: 0; background: rgba(0,0,0,0.6); display: flex; justify-content: center; align-items: center; z-index: 2300; }
  .rule-edit { background: var(--bg-panel); border: 1px solid var(--border); border-radius: 8px; padding: 1.1rem; width: 460px; max-width: 94vw; max-height: 90vh; overflow-y: auto; display: flex; flex-direction: column; gap: 0.5rem; }
  .rule-edit h3 { margin: 0 0 0.3rem; }
  .fld { display: flex; flex-direction: column; gap: 3px; font-size: 0.78rem; color: var(--text-muted); }
  .fld input, .fld select { width: 100%; }
  .cond-head { display: flex; justify-content: space-between; align-items: baseline; margin-top: 0.5rem; font-size: 0.8rem; }
  .cond-row select:first-child { flex: 2; min-width: 0; }
  .cond-row input, .cond-row select { flex: 1; min-width: 0; }
  .raw { width: 100%; background: var(--bg-control); border: 1px solid var(--border); border-radius: 4px; color: var(--text); font-family: var(--font-mono, monospace); font-size: 0.76rem; padding: 6px; }
  .re-actions { display: flex; justify-content: flex-end; gap: 0.6rem; margin-top: 0.6rem; }
  .re-actions button, .modal button.primary { padding: 7px 14px; border: none; border-radius: 4px; background: var(--bg-control); color: var(--text); cursor: pointer; }
  .primary { background: var(--accent) !important; color: var(--on-accent, #fff); }
</style>
