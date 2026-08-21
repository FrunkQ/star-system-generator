<script lang="ts">
  // WS8 — the base-map upgrade offer. Three stages: the OFFER (what will happen, and back up first), the
  // BUILD, then the REVIEW of what actually happened before anything replaces the GM's current campaign.
  //
  // The safety rules this screen exists to enforce:
  //  - Back up FIRST. A campaign can live only in browser storage, so a GM who never saved a file has no
  //    copy at all. The upgrade button stays disabled until they have exported one or said they already have.
  //  - The upgrade is built as a SEPARATE campaign and only becomes current if they accept it. Declining
  //    leaves the original exactly as it was, so a bad result costs nothing but the time spent looking.
  //  - Every consequence is listed BEFORE they commit, not after.
  import { createEventDispatcher, onMount } from 'svelte';
  import type { Starmap } from '$lib/types';
  import { loadBundledMap } from '$lib/map/baseMapManifest';
  import { planRebase, applyRebase, type RebasePlan } from '$lib/map/rebase';
  import type { UpgradeOffer } from '$lib/map/upgradeOffer';

  export let campaign: Starmap;
  export let offer: UpgradeOffer;

  const dispatch = createEventDispatcher<{ backup: void; accept: Starmap; close: void; dismiss: void }>();

  type Stage = 'offer' | 'working' | 'review' | 'failed';
  let stage: Stage = 'offer';
  let plan: RebasePlan | null = null;
  let rebuilt: Starmap | null = null;
  let failure = '';
  let backedUp = false;      // they clicked "Save a copy first"
  let haveOwnBackup = false; // ...or asserted they already have one
  $: canProceed = backedUp || haveOwnBackup;

  const unit = campaign.scale?.unit ?? 'ly';

  function fmt(v: number): string {
    return v < 10 ? v.toFixed(1) : String(Math.round(v));
  }

  function backup() {
    dispatch('backup');
    backedUp = true;
  }

  // Plan EAGERLY, as the offer opens. The GM is told what will happen to THEIR campaign — which systems of
  // theirs move, which of their changes do not survive — not a generic description of an upgrade. That is
  // the difference between an informed decision and a dice roll. If the base map cannot be fetched the
  // generic list stands in, and pressing on surfaces the failure rather than the offer lying about it.
  let base: Starmap | null = null;
  onMount(async () => {
    if (!offer.base) return;
    base = await loadBundledMap(offer.base.file);
    if (base) {
      const p = planRebase(campaign, base, offer.base, offer.fromEdition ?? null);
      if (p.applicable) plan = p;
    }
  });

  async function build() {
    if (!offer.base) return;
    stage = 'working';
    try {
      const newBase = base ?? (await loadBundledMap(offer.base.file));
      if (!newBase) throw new Error('The updated map could not be loaded.');
      const p = plan ?? planRebase(campaign, newBase, offer.base, offer.fromEdition ?? null);
      if (!p.applicable) throw new Error('This campaign does not contain any systems from the bundled map.');
      plan = p;
      rebuilt = applyRebase(
        campaign, newBase, offer.base, p,
        `starmap-${campaign.id}-rebased-${p.toEdition}`,
        `${campaign.name} (upgraded)`
      );
      stage = 'review';
    } catch (e) {
      failure = (e as Error).message || 'The upgrade could not be prepared.';
      stage = 'failed';
    }
  }

  $: moved = plan?.systems.filter((s) => s.kind === 'custom-moved') ?? [];
  $: replaced = plan?.systems.filter((s) => s.kind === 'base-replaced') ?? [];
  $: lossy = replaced.filter((s) => (s.losses?.length ?? 0) > 0);
</script>

<div class="scrim" role="presentation">
  <div class="modal" role="dialog" aria-modal="true" aria-label="Update the bundled map">
    {#if stage === 'offer'}
      <h2>This campaign uses an earlier edition of {offer.base?.name ?? 'the bundled map'}</h2>
      <p class="lede">
        The bundled map has been rebuilt from real astrometry: true three-dimensional positions, and stars and
        planets corrected against current catalogues. Your campaign can be moved onto it.
      </p>

      <h3>What would happen</h3>
      <ul class="issues">
        {#each plan?.warnings ?? [] as w}<li>{w}</li>{/each}
        {#if !plan}
          <li>Systems from the bundled map are replaced with their corrected versions.</li>
          <li>Your own systems move with the bundled system nearest to each of them, so what sits next to what is preserved.</li>
          <li>Links are re-measured, so journey times along them change.</li>
          <li>Replacing a bundled system drops anything in it that the new edition does not have. You will see the exact list before committing.</li>
          <li>Your current campaign is kept. The upgrade is built separately, you choose whether to use it, and Settings &gt; System keeps an offer to go back to today's version.</li>
        {/if}
      </ul>

      <div class="backup">
        <h3>Save a copy first</h3>
        <p>
          Campaigns can live only in this browser. If you have never saved this one to a file, do it now — then
          you can always come back to exactly what you have today.
        </p>
        <div class="backup-row">
          <button class="secondary" type="button" on:click={backup}>{backedUp ? 'Saved ✓' : 'Save a copy now'}</button>
          <label class="chk"><input type="checkbox" bind:checked={haveOwnBackup} /> I already have a saved copy</label>
        </div>
      </div>

      <footer>
        <label class="chk quiet"><input type="checkbox" on:change={(e) => e.currentTarget.checked && dispatch('dismiss')} /> Do not ask again for this campaign</label>
        <span class="spacer"></span>
        <button class="secondary" type="button" on:click={() => dispatch('close')}>Not now</button>
        <button class="primary" type="button" disabled={!canProceed} on:click={build}>Prepare the upgrade…</button>
      </footer>
      {#if !canProceed}<p class="gate">Save a copy (or confirm you have one) to continue.</p>{/if}

    {:else if stage === 'working'}
      <h2>Preparing the upgrade…</h2>
      <p class="lede">Reading the updated map and working out where everything lands.</p>

    {:else if stage === 'failed'}
      <h2>The upgrade could not be prepared</h2>
      <p class="lede">{failure}</p>
      <p>Your campaign has not been changed.</p>
      <footer>
        <span class="spacer"></span>
        <button class="secondary" type="button" on:click={() => dispatch('close')}>Close</button>
      </footer>

    {:else if stage === 'review' && plan}
      <h2>Ready — this is what changed</h2>
      <p class="lede">
        Nothing has replaced your campaign yet. Look this over, then keep it or throw it away.
      </p>

      <div class="counts">
        <div><strong>{replaced.length}</strong><span>bundled system{replaced.length === 1 ? '' : 's'} updated</span></div>
        <div><strong>{moved.length}</strong><span>of your systems moved</span></div>
        <div><strong>{plan.addedSystemNames.length}</strong><span>system{plan.addedSystemNames.length === 1 ? '' : 's'} added</span></div>
        <div><strong>{plan.routes.length}</strong><span>link{plan.routes.length === 1 ? '' : 's'} re-measured</span></div>
      </div>

      {#if lossy.length}
        <h3>Gone from the updated systems</h3>
        <ul class="detail warn">
          {#each lossy as s}<li><strong>{s.name}</strong> — {(s.losses ?? []).join(', ')}</li>{/each}
        </ul>
      {/if}

      {#if moved.length}
        <h3>Your systems, and what each followed</h3>
        <ul class="detail">
          {#each moved as s}
            <li><strong>{s.name}</strong> moved {fmt(s.movedBy ?? 0)} {unit}, following {s.anchorName}</li>
          {/each}
        </ul>
      {/if}

      {#if plan.routes.length}
        <h3>Links re-measured</h3>
        <ul class="detail">
          {#each plan.routes as r}
            <li>{r.name || `${r.fromName} → ${r.toName}`}: {fmt(r.oldDistance)} → <strong>{fmt(r.newDistance)} {unit}</strong></li>
          {/each}
        </ul>
      {/if}

      {#if plan.addedSystemNames.length}
        <h3>New in this edition</h3>
        <p class="detail-inline">{plan.addedSystemNames.join(', ')}</p>
      {/if}

      <footer>
        <span class="spacer"></span>
        <button class="secondary" type="button" on:click={() => dispatch('close')}>Discard the upgrade</button>
        <button class="primary" type="button" on:click={() => rebuilt && dispatch('accept', rebuilt)}>Use the upgraded campaign</button>
      </footer>
    {/if}
  </div>
</div>

<style>
  .scrim {
    position: fixed; inset: 0; z-index: 2000; display: flex; align-items: center; justify-content: center;
    background: rgba(0, 0, 0, 0.66); padding: 20px;
  }
  .modal {
    width: min(760px, 100%); max-height: calc(100vh - 40px); overflow-y: auto;
    background: #12151c; border: 1px solid rgba(255, 255, 255, 0.14); border-radius: 12px;
    padding: 20px 22px 18px; color: #e8ecf4; box-shadow: 0 20px 60px rgba(0, 0, 0, 0.6);
  }
  h2 { margin: 0 0 8px; font-size: 18px; }
  h3 { margin: 18px 0 6px; font-size: 13px; text-transform: uppercase; letter-spacing: 0.06em; color: #9aa4b4; }
  .lede { margin: 0 0 4px; line-height: 1.55; color: #cfd6e2; font-size: 13.5px; }
  p { font-size: 13px; line-height: 1.55; color: #cfd6e2; }

  ul { margin: 0; padding-left: 18px; }
  .issues li { margin: 6px 0; font-size: 13px; line-height: 1.5; color: #dbe2ec; }
  .detail { max-height: 190px; overflow-y: auto; }
  .detail li { margin: 3px 0; font-size: 12.5px; line-height: 1.45; color: #c3ccd9; }
  .detail.warn li { color: #ffc9a8; }
  .detail-inline { font-size: 12.5px; color: #c3ccd9; margin: 0; }

  .backup { margin-top: 18px; padding: 12px 14px; border: 1px solid rgba(255, 122, 69, 0.4);
            border-radius: 8px; background: rgba(255, 122, 69, 0.07); }
  .backup h3 { margin-top: 0; color: #ffb894; }
  .backup p { margin: 0 0 10px; }
  .backup-row { display: flex; align-items: center; gap: 14px; flex-wrap: wrap; }

  .counts { display: grid; grid-template-columns: repeat(auto-fit, minmax(130px, 1fr)); gap: 10px; margin-top: 14px; }
  .counts div { background: rgba(255, 255, 255, 0.05); border-radius: 8px; padding: 10px 12px; }
  .counts strong { display: block; font-size: 22px; line-height: 1.1; color: #ff9a6b; }
  .counts span { font-size: 11.5px; color: #9aa4b4; }

  footer { display: flex; align-items: center; gap: 10px; margin-top: 20px; flex-wrap: wrap; }
  .spacer { flex: 1; }
  button { border-radius: 6px; padding: 8px 14px; font-size: 13px; cursor: pointer; border: 1px solid transparent; }
  .secondary { background: rgba(255, 255, 255, 0.07); border-color: rgba(255, 255, 255, 0.18); color: #dbe2ec; }
  .secondary:hover { background: rgba(255, 255, 255, 0.13); }
  .primary { background: #ff7a45; color: #14100c; font-weight: 600; }
  .primary:hover:not(:disabled) { background: #ff8d5f; }
  .primary:disabled { opacity: 0.45; cursor: not-allowed; }
  .chk { display: flex; align-items: center; gap: 6px; font-size: 12.5px; color: #cfd6e2; }
  .chk.quiet { color: #8b95a5; font-size: 12px; }
  .gate { margin: 8px 0 0; font-size: 12px; color: #ffb894; }
</style>
