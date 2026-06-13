<script lang="ts">
  // GM launcher for the Companion App (/catalogue). Shows the same-machine link + QR + a skin
  // picker, and opens the players' live field guide. v1 is local-only: the link works for windows
  // on THIS machine (a mirrored tablet, a second screen, the GM's own phone via the same profile).
  // Cross-device over wifi is the deferred PeerJS transport (COMPANION-APP-SPEC.md §3/C4).
  import { createEventDispatcher, onMount } from 'svelte';
  import { browser } from '$app/environment';
  import QRCode from 'qrcode';
  import { broadcastService } from '$lib/broadcast';
  import { brandingStore } from '$lib/catalogue/branding';
  import { guideConfigStore, MONO_COLORS } from '$lib/catalogue/guideConfig';
  import CrtControlsPanel from '$lib/catalogue/CrtControlsPanel.svelte';
  import type { MonoColor } from '$lib/catalogue/guideConfig';

  export let sessionId: string;

  const dispatch = createEventDispatcher();
  let logoInput: HTMLInputElement;

  // Downscale any uploaded logo to a small PNG data URL (max 160px) so it's tiny enough to broadcast
  // every time and store locally. Keeps the "letterhead" feature cheap.
  function onLogoPick(e: Event) {
    const file = (e.target as HTMLInputElement).files?.[0];
    if (!file || !browser) return;
    const img = new Image();
    img.onload = () => {
      const max = 160;
      const scale = Math.min(1, max / Math.max(img.width, img.height));
      const c = document.createElement('canvas');
      c.width = Math.max(1, Math.round(img.width * scale));
      c.height = Math.max(1, Math.round(img.height * scale));
      const ctx = c.getContext('2d');
      if (!ctx) return;
      ctx.drawImage(img, 0, 0, c.width, c.height);
      brandingStore.update((b) => ({ ...b, logo: c.toDataURL('image/png') }));
    };
    img.src = URL.createObjectURL(file);
  }

  // The skin is GM-ENFORCED: broadcast to every connected guide; players have no picker.
  const SKINS = [
    { key: 'mono',    label: 'Monochrome Terminal', blurb: 'Salvaged CRT — pick the phosphor colour' },
    { key: 'guide',   label: 'The Guide',           blurb: 'Friendly illustrated travel companion' },
    { key: 'clean',   label: 'Survey Datapad',      blurb: 'Clean instrument feed, no costume' },
    { key: 'console', label: 'Starship Console',    blurb: 'Live orbital plot, tap a world to inspect' }
  ] as const;
  const MONO_KEYS = Object.keys(MONO_COLORS) as MonoColor[];
  let copied = false;
  let qrDataUrl = '';
  let origin = '';

  onMount(() => {
    if (browser) origin = window.location.origin;
    // Sharing intent: start hosting a cross-device endpoint so players can connect over the network.
    broadcastService.enableRemote();
  });

  // Theme/colour ride the URL too so a freshly-opened guide paints right before the first broadcast.
  $: url = `${origin}/catalogue?sid=${sessionId}&theme=${$guideConfigStore.theme}&color=${$guideConfigStore.monoColor}&constructs=${$guideConfigStore.includeConstructs ? 1 : 0}`;
  $: if (browser && url) {
    QRCode.toDataURL(url, { margin: 1, width: 240, color: { dark: '#0a0d14', light: '#ffffff' } })
      .then((d) => (qrDataUrl = d))
      .catch(() => (qrDataUrl = ''));
  }

  function open() {
    window.open(url, 'StarSystemCatalogue', 'width=480,height=880,menubar=no,toolbar=no,location=no');
  }
  async function copy() {
    try {
      await navigator.clipboard.writeText(url);
      copied = true;
      setTimeout(() => (copied = false), 1600);
    } catch { /* clipboard blocked */ }
  }
</script>

<div class="modal-background" on:click={() => dispatch('close')}>
  <div class="modal" on:click|stopPropagation>
    <h2>Players' Field Guide</h2>
    <p class="lede">A live, redacted companion to the system you're running. Players open it on their
      own phones or tablets (scan the QR / share the link) and it updates as you play. Hidden bodies
      and GM notes are never sent.</p>

    <div class="form-group">
      <label>Branding (in-universe letterhead)</label>
      <input type="text" class="org-name" placeholder="Company / faction name (e.g. a megacorp or survey authority)" bind:value={$brandingStore.name} />
      <div class="logo-row">
        {#if $brandingStore.logo}
          <img class="logo-preview" src={$brandingStore.logo} alt="Logo preview" />
          <button on:click={() => brandingStore.update((b) => ({ ...b, logo: null }))}>Remove logo</button>
        {:else}
          <button on:click={() => logoInput?.click()}>Upload logo…</button>
          <span class="logo-hint">PNG/JPG; auto-shrunk. Use your own art (no trademarked logos).</span>
        {/if}
        <input type="file" accept="image/*" bind:this={logoInput} on:change={onLogoPick} style="display:none" />
      </div>
    </div>

    <div class="form-group">
      <label>View (enforced on every player's guide)</label>
      <div class="skins">
        {#each SKINS as s}
          <button class="skin" class:selected={$guideConfigStore.theme === s.key} on:click={() => guideConfigStore.update((c) => ({ ...c, theme: s.key }))}>
            <span class="skin-label">{s.label}</span>
            <span class="skin-blurb">{s.blurb}</span>
          </button>
        {/each}
      </div>
      {#if $guideConfigStore.theme === 'mono'}
        <div class="mono-colors">
          <span class="mono-label">Terminal colour:</span>
          {#each MONO_KEYS as k}
            <button class="mono-swatch" class:selected={$guideConfigStore.monoColor === k}
              style="--swatch:{MONO_COLORS[k].hex}" title={MONO_COLORS[k].label}
              on:click={() => guideConfigStore.update((c) => ({ ...c, monoColor: k }))}>
              <span class="dot"></span>{MONO_COLORS[k].label}
            </button>
          {/each}
        </div>
        <!-- GM-controlled CRT effect, broadcast to every player's terminal. -->
        <div class="crt-section" style="--mono:{MONO_COLORS[$guideConfigStore.monoColor].hex}">
          <span class="crt-hint">CRT effect (applied to every player's terminal — crank it to make them squint):</span>
          <CrtControlsPanel embedded />
        </div>
      {/if}
    </div>

    <div class="form-group">
      <label class="check"><input type="checkbox" checked={$guideConfigStore.includeConstructs} on:change={(e) => guideConfigStore.update((c) => ({ ...c, includeConstructs: (e.currentTarget as HTMLInputElement).checked }))} /> Include artificial constructs (stations, ships) in the guide</label>
    </div>

    <div class="share">
      {#if qrDataUrl}
        <img class="qr" src={qrDataUrl} alt="QR code for the field guide link" />
      {/if}
      <div class="link-col">
        <code class="link">{url}</code>
        <div class="link-actions">
          <button on:click={copy}>{copied ? 'Copied' : 'Copy link'}</button>
        </div>
        <p class="hint">Works across devices over the internet (peer-to-peer) as well as same-machine.
          Keep this app open while players are connected.</p>
      </div>
    </div>

    <div class="buttons">
      <button on:click={() => dispatch('close')}>Close</button>
      <button class="primary" on:click={open}>Open Local Field Guide Window</button>
    </div>
  </div>
</div>

<style>
  .modal-background {
    position: fixed; inset: 0;
    background: rgba(0, 0, 0, 0.7);
    display: flex; justify-content: center; align-items: center;
    z-index: 2000;
  }
  .modal {
    background: var(--bg-panel); color: var(--text);
    padding: 1.6rem; border-radius: 8px;
    width: 480px; max-width: 94vw; max-height: 92vh; overflow-y: auto;
    display: flex; flex-direction: column; gap: 1.1rem;
  }
  h2 { margin: 0; border-bottom: 1px solid var(--border); padding-bottom: 0.5rem; }
  .lede { margin: 0; font-size: 0.85rem; color: var(--text-muted); line-height: 1.45; }
  .form-group { display: flex; flex-direction: column; gap: 0.5rem; }
  .form-group > label { font-size: 0.8rem; color: var(--text-muted); text-transform: uppercase; letter-spacing: 0.06em; }
  .form-group > label.check { display: flex; align-items: center; gap: 8px; text-transform: none; letter-spacing: 0; font-size: 0.85rem; color: var(--text); }
  .org-name { width: 100%; padding: 0.5em; background: var(--bg-control); color: var(--text); border: 1px solid var(--border); border-radius: 4px; }
  .logo-row { display: flex; align-items: center; gap: 0.6rem; margin-top: 0.5rem; flex-wrap: wrap; }
  .logo-row button { background: var(--bg-control); color: var(--text); border: 1px solid var(--border); border-radius: 4px; padding: 5px 10px; cursor: pointer; font: inherit; }
  .logo-preview { height: 40px; width: auto; max-width: 120px; border-radius: 4px; background: #fff; padding: 3px; }
  .logo-hint { font-size: 0.72rem; color: var(--text-muted); }
  .skins { display: grid; grid-template-columns: 1fr 1fr; gap: 0.5rem; }
  .skin {
    display: flex; flex-direction: column; gap: 2px; text-align: left;
    background: var(--bg-control); color: var(--text);
    border: 1px solid transparent; border-radius: 4px; padding: 9px 10px; cursor: pointer;
  }
  .skin.selected { border-color: var(--accent); }
  .skin-label { font-weight: 700; font-size: 0.9rem; }
  .skin-blurb { font-size: 0.72rem; color: var(--text-muted); }
  .mono-colors { display: flex; flex-wrap: wrap; align-items: center; gap: 0.45rem; margin-top: 0.55rem; }
  .crt-section { margin-top: 0.7rem; border-top: 1px solid var(--border, #2a2f3a); padding-top: 0.5rem; }
  .crt-hint { display: block; font-size: 0.78rem; opacity: 0.7; margin-bottom: 0.3rem; }
  .mono-label { font-size: 0.75rem; color: var(--text-muted); }
  .mono-swatch {
    display: inline-flex; align-items: center; gap: 6px;
    background: var(--bg-control); color: var(--text);
    border: 1px solid transparent; border-radius: 4px; padding: 4px 9px;
    font: inherit; font-size: 0.78rem; cursor: pointer;
  }
  .mono-swatch .dot { width: 11px; height: 11px; border-radius: 50%; background: var(--swatch); box-shadow: 0 0 5px var(--swatch); }
  .mono-swatch.selected { border-color: var(--swatch); }
  .share { display: flex; gap: 1rem; align-items: flex-start; }
  .qr { width: 120px; height: 120px; border-radius: 6px; background: #fff; flex: 0 0 auto; }
  .link-col { display: flex; flex-direction: column; gap: 0.5rem; min-width: 0; }
  .link {
    font-size: 0.72rem; word-break: break-all; background: var(--bg-control);
    padding: 6px 8px; border-radius: 4px; color: var(--text-muted);
  }
  .link-actions { display: flex; gap: 0.5rem; }
  .hint { margin: 0; font-size: 0.72rem; color: var(--text-muted); line-height: 1.4; }
  .buttons { display: flex; justify-content: flex-end; gap: 1rem; margin-top: 0.2rem; }
  button {
    padding: 8px 16px; cursor: pointer; border-radius: 4px; border: none;
    background: var(--bg-control); color: var(--text); font: inherit;
  }
  button.primary { background: var(--accent); }
</style>
