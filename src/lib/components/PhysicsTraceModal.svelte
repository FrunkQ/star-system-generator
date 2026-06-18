<script lang="ts">
  // The Newton / "Apple" panel — shows all the working for a body: every physics layer's
  // inputs → outputs, and the provenance of every tag, each deep-linking to /physics. Primary
  // educational + debug surface. Opened from the apple icon next to Edit.
  import { createEventDispatcher } from 'svelte';
  import type { CelestialBody, StarSystem } from '$lib/types';
  import { buildPhysicsTrace } from '$lib/physics/physicsTrace';

  export let body: CelestialBody;
  export let system: StarSystem | null = null;

  const dispatch = createEventDispatcher();
  const close = () => dispatch('close');

  $: star = system?.nodes.find((nd) => nd.parentId === null) as CelestialBody | undefined;
  $: trace = buildPhysicsTrace(body, { ageGyr: (system as any)?.age_Gyr, star });

  // Classification working + borderline override. body.classification is the engine's explanation
  // (recorded even for pinned bodies, so we can show "physics would say X"). body.classes[0] is the
  // ACTUAL type; autoClassify === false means the GM has pinned it.
  $: cls = (body as any).classification as import('$lib/system/classification').ClassExplanation | undefined;
  $: currentClass = body.classes?.[0];
  $: pinned = (body as any).autoClassify === false;
  const tlabel = (k?: string) => (k || '').split('/').pop()?.replace(/[-_]/g, ' ') || (k ?? '');
  function pickClass(c: string) {
    body.classes = [c];
    (body as any).autoClassify = false; // pin — the processor won't override an authored class
    dispatch('update', body);
  }
  function useAuto() {
    (body as any).autoClassify = true;
    dispatch('update', body);
  }
</script>

<div class="overlay" on:click|self={close} role="presentation">
  <div class="modal" role="dialog" aria-label="Physics working">
    <header>
      <div class="title">
        <span class="apple" aria-hidden="true">
          <!-- Newton's apple -->
          <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
            <path d="M12 7c-1-2-3-2-4-1-2 1.5-2 5 0 8 1.2 1.8 2.6 3 4 3s2.8-1.2 4-3c2-3 2-6.5 0-8-1-1-3-1-4 1Z"/>
            <path d="M12 7c0-2 .6-3.5 2-4.5"/>
          </svg>
        </span>
        <div>
          <h2>The working — {body.name}</h2>
          <p class="sub">Every layer's inputs → outputs, and where each tag came from. <a href="/physics" target="_blank" rel="noopener">Full physics reference ›</a></p>
        </div>
      </div>
      <button class="close" on:click={close} aria-label="Close">×</button>
    </header>

    <div class="content">
      {#if cls && !cls.fallback}
        <section class="layer">
          <div class="layer-head">
            <h3>Classification {#if cls.borderline}<span class="borderline" title="Two types scored within 10% of each other — a borderline call. Pick the one you want below.">! borderline</span>{/if}</h3>
            <a class="layer-link" href="/physics" target="_blank" rel="noopener">physics ›</a>
          </div>
          <div class="cls-now">
            <span>Type: <strong>{tlabel(currentClass)}</strong></span>
            {#if pinned}<span class="pin-tag" title="You pinned this type — the engine won't override it.">pinned</span>{/if}
          </div>
          {#if pinned && cls.base !== currentClass}
            <p class="note">Physics would call this <strong>{tlabel(cls.base)}</strong> ({cls.baseScore}). <button class="linkish" on:click={useAuto}>hand it back to the engine</button></p>
          {/if}

          <span class="col-label" style="margin-top:8px; display:block;">Candidates — click to pin</span>
          <div class="cands">
            {#each cls.candidates as c}
              <button class="cand" class:win={c.class === cls.base} class:cur={c.class === currentClass} on:click={() => pickClass(c.class)} title={c.class === cls.base ? 'Engine pick — click to pin' : 'Pin this type instead'}>
                <span class="cand-name">{tlabel(c.class)}</span>
                <span class="cand-score">{c.score}</span>
              </button>
            {/each}
          </div>

          {#if cls.bands.length}
            <span class="col-label" style="margin-top:10px; display:block;">Why {tlabel(cls.base)}</span>
            {#each cls.bands as b}
              <div class="field"><span class="f-label">{b.feature}: {b.value}</span><span class="f-value">{b.band} <span class="fit">{Math.round(b.fit * 100)}%</span></span></div>
            {/each}
          {/if}
          {#if cls.modifiers.length}<p class="note">Modifiers: {cls.modifiers.map((m) => `${tlabel(m.class)} (${m.score})`).join(', ')}</p>{/if}
        </section>
      {/if}

      {#each trace.layers as layer}
        <section class="layer">
          <div class="layer-head">
            <h3>{layer.title}</h3>
            <a class="layer-link" href={layer.link} target="_blank" rel="noopener" title="Open the physics reference for this layer">physics ›</a>
          </div>
          <div class="io">
            <div class="col">
              <span class="col-label">Inputs</span>
              {#each layer.inputs as f}
                <div class="field"><span class="f-label">{f.label}</span><span class="f-value">{f.value}</span></div>
              {/each}
            </div>
            <div class="arrow" aria-hidden="true">→</div>
            <div class="col">
              <span class="col-label">Outputs</span>
              {#each layer.outputs as f}
                <div class="field"><span class="f-label">{f.label}</span><span class="f-value out">{f.value}</span></div>
              {/each}
            </div>
          </div>
          {#each layer.notes as note}<p class="note">{note}</p>{/each}
        </section>
      {/each}

      {#if trace.tags.length}
        <section class="layer">
          <div class="layer-head"><h3>Tag provenance</h3></div>
          <div class="tags">
            {#each trace.tags as t}
              <div class="prov">
                <span class="chip" style="background-color: {t.color};">{t.label}</span>
                <span class="prov-layer">{t.layer}</span>
                <span class="prov-desc">{t.description}</span>
              </div>
            {/each}
          </div>
        </section>
      {/if}
    </div>
  </div>
</div>

<style>
  .overlay { position: fixed; inset: 0; background: rgba(0,0,0,0.6); display: flex; align-items: center; justify-content: center; z-index: 1000; padding: 4vh 2vw; }
  .modal { background: var(--bg-app, #0b0d12); border: 1px solid var(--border, #2a2d36); border-radius: 10px; width: min(720px, 96vw); max-height: 92vh; display: flex; flex-direction: column; color: var(--text, #e8e8e8); box-shadow: 0 12px 48px rgba(0,0,0,0.5); }
  header { display: flex; align-items: flex-start; justify-content: space-between; gap: 12px; padding: 16px 18px; border-bottom: 1px solid var(--border, #2a2d36); }
  .title { display: flex; gap: 12px; align-items: flex-start; }
  .apple { color: var(--accent, #ff5a1f); margin-top: 2px; flex: 0 0 auto; }
  h2 { margin: 0; font-size: 1.1rem; color: var(--text, #fff); }
  .sub { margin: 3px 0 0; font-size: 0.82rem; color: var(--text-muted, #cfcfcf); }
  .sub a { color: var(--accent, #ff5a1f); text-decoration: none; }
  .close { background: none; border: none; color: var(--text-muted, #cfcfcf); font-size: 1.6rem; line-height: 1; cursor: pointer; padding: 0 4px; }
  .close:hover { color: var(--text, #fff); }
  .content { overflow-y: auto; padding: 12px 18px 18px; }
  .layer { margin: 14px 0; padding: 12px 14px; background: var(--bg-panel, #14161c); border: 1px solid var(--border, #2a2d36); border-radius: 8px; }
  .layer-head { display: flex; align-items: baseline; justify-content: space-between; margin-bottom: 8px; }
  .layer-head h3 { margin: 0; font-size: 0.95rem; color: var(--accent, #ff5a1f); }
  .layer-link { font-size: 0.75rem; color: var(--text-muted, #cfcfcf); text-decoration: none; }
  .layer-link:hover { color: var(--accent, #ff5a1f); }
  .io { display: grid; grid-template-columns: 1fr auto 1fr; gap: 10px; align-items: start; }
  .col-label { display: block; font-size: 0.7rem; text-transform: uppercase; letter-spacing: 0.05em; color: var(--text-faint, #8a8a8a); margin-bottom: 4px; }
  .arrow { color: var(--text-faint, #8a8a8a); align-self: center; font-size: 1.2rem; }
  .field { display: flex; justify-content: space-between; gap: 8px; padding: 2px 0; font-size: 0.85rem; }
  .f-label { color: var(--text-muted, #cfcfcf); }
  .f-value { color: var(--text, #e8e8e8); font-variant-numeric: tabular-nums; text-align: right; }
  .f-value.out { color: #7fd1a8; }
  .note { margin: 8px 0 0; font-size: 0.78rem; color: var(--text-faint, #8a8a8a); line-height: 1.4; }
  .borderline { font-size: 0.72rem; font-weight: 700; color: #fff; background: #d8922f; border-radius: 4px; padding: 1px 7px; margin-left: 8px; }
  .cls-now { display: flex; align-items: center; gap: 8px; font-size: 0.9rem; }
  .pin-tag { font-size: 0.68rem; text-transform: uppercase; letter-spacing: 0.04em; color: #d8922f; border: 1px solid #d8922f; border-radius: 3px; padding: 0 5px; }
  .cands { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 5px; }
  .cand { display: inline-flex; align-items: center; gap: 8px; background: var(--bg-control, #1a1d24); border: 1px solid var(--border, #2a2d36); border-radius: 6px; padding: 4px 10px; cursor: pointer; color: var(--text-muted, #cfcfcf); font-size: 0.82rem; }
  .cand:hover { border-color: var(--accent, #ff5a1f); color: var(--text, #fff); }
  .cand.win { border-color: #7fd1a8; }
  .cand.cur { background: var(--accent, #ff5a1f); color: #fff; border-color: var(--accent, #ff5a1f); }
  .cand-score { font-variant-numeric: tabular-nums; opacity: 0.7; font-size: 0.76rem; }
  .fit { color: var(--text-faint, #8a8a8a); font-size: 0.76rem; }
  .linkish { background: none; border: none; color: var(--accent, #ff5a1f); cursor: pointer; padding: 0; font: inherit; text-decoration: underline; }
  .tags { display: flex; flex-direction: column; gap: 8px; }
  .prov { display: grid; grid-template-columns: 150px 130px 1fr; gap: 8px; align-items: baseline; font-size: 0.82rem; }
  .chip { color: #fff; border-radius: 4px; padding: 2px 8px; font-size: 0.78rem; justify-self: start; }
  .prov-layer { color: var(--text-muted, #cfcfcf); }
  .prov-desc { color: var(--text-faint, #9a9a9a); line-height: 1.4; }
  @media (max-width: 560px) {
    .io { grid-template-columns: 1fr; }
    .arrow { display: none; }
    .prov { grid-template-columns: 1fr; gap: 2px; }
  }
</style>
