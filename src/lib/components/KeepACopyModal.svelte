<script lang="ts">
  // G72: the one-version "keep a copy" notice before a rehosting. Shown ONCE per campaign from
  // KEEP_A_COPY_FROM (lib/map/keepACopy.ts) and answerable in exactly two ways, both of which stamp
  // the campaign: download a full bundle now, or say you already have one. No close, no escape, no
  // "later" - that is what "force save" means. The words come from keepACopyMessage(), so the modal
  // and its test cannot disagree about what is being said.
  import { createEventDispatcher } from 'svelte';
  import { keepACopyMessage } from '$lib/map/keepACopy';
  // A84: a full-viewport dialog registers with the chrome-yield contract, so a phone's persistent chrome yields to it.
  import { foreground } from '$lib/ui/foreground';

  const dispatch = createEventDispatcher<{ download: void; kept: void }>();
  const m = keepACopyMessage();
</script>

<div class="scrim" role="dialog" aria-modal="true" aria-labelledby="keep-a-copy-title" use:foreground>
  <div class="modal">
    <h2 id="keep-a-copy-title">{m.title}</h2>
    <p class="lede">{m.body}</p>
    {#if m.address}
      <p class="address">The new address is <a href={m.address}>{m.address}</a>.</p>
    {/if}
    <div class="row">
      <button class="primary" type="button" on:click={() => dispatch('download')}>Download a copy now</button>
      <button class="secondary" type="button" on:click={() => dispatch('kept')}>I already have a copy</button>
    </div>
    <p class="fine">The download is the same full campaign file as File and Save. Loading it gives you exactly what you have today.</p>
  </div>
</div>

<style>
  .scrim {
    position: fixed; inset: 0; z-index: 2000; display: flex; align-items: center; justify-content: center;
    background: rgba(0, 0, 0, 0.66); padding: 20px;
  }
  .modal {
    width: min(560px, 100%); background: #12151c; border: 1px solid rgba(255, 255, 255, 0.14); border-radius: 12px;
    padding: 20px 22px 18px; color: #e8ecf4; box-shadow: 0 20px 60px rgba(0, 0, 0, 0.6);
  }
  h2 { margin: 0 0 8px; font-size: 18px; }
  .lede { margin: 0 0 12px; line-height: 1.55; color: #cfd6e2; font-size: 13.5px; }
  .address { margin: 0 0 12px; font-size: 13px; color: #cfd6e2; }
  .address a { color: #7fc4ff; }
  .row { display: flex; gap: 10px; flex-wrap: wrap; margin-top: 6px; }
  .fine { margin: 12px 0 0; font-size: 12px; line-height: 1.5; color: #9aa4b4; }
  button {
    font: inherit; font-size: 13px; padding: 8px 14px; border-radius: 8px; cursor: pointer;
    border: 1px solid rgba(255, 255, 255, 0.18); background: rgba(255, 255, 255, 0.06); color: #e8ecf4;
  }
  button.primary { background: #ff7a45; border-color: #ff7a45; color: #1a0d06; font-weight: 600; }
  button:hover { filter: brightness(1.08); }
</style>
