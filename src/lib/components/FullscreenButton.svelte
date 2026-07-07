<script lang="ts">
  // Touch/tablet full-screen toggle — drops the browser chrome (address bar etc.) that
  // otherwise pops in on view changes. Self-hides where the Fullscreen API is unavailable.
  // The host gates this to phone/tablet mode and places it next to the Reset control.
  import { onMount, onDestroy } from 'svelte';
  import { browser } from '$app/environment';

  let isFs = false;
  let supported = false;

  function sync() {
    if (browser) isFs = !!document.fullscreenElement;
  }

  onMount(() => {
    supported = !!(document.fullscreenEnabled && document.documentElement.requestFullscreen);
    sync();
    document.addEventListener('fullscreenchange', sync);
  });
  onDestroy(() => {
    if (browser) document.removeEventListener('fullscreenchange', sync);
  });

  async function toggle() {
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else await document.documentElement.requestFullscreen();
    } catch {
      /* user gesture / unsupported — ignore */
    }
  }
</script>

{#if supported}
  <button
    class="fs-btn"
    on:click={toggle}
    title={isFs ? 'Exit full screen' : 'Full screen'}
    aria-label={isFs ? 'Exit full screen' : 'Full screen'}
  >
    {#if isFs}
      <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M8 3v3a2 2 0 0 1-2 2H3"/><path d="M21 8h-3a2 2 0 0 1-2-2V3"/><path d="M3 16h3a2 2 0 0 1 2 2v3"/><path d="M16 21v-3a2 2 0 0 1 2-2h3"/></svg>
    {:else}
      <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M8 3H5a2 2 0 0 0-2 2v3"/><path d="M21 8V5a2 2 0 0 0-2-2h-3"/><path d="M3 16v3a2 2 0 0 0 2 2h3"/><path d="M16 21h3a2 2 0 0 0 2-2v-3"/></svg>
    {/if}
  </button>
{/if}

<style>
  .fs-btn {
    height: 32px;
    width: 32px;
    display: flex;
    align-items: center;
    justify-content: center;
    border: 1px solid var(--border, #2a2d36);
    border-radius: 8px;
    background: color-mix(in srgb, var(--bg-panel, #14161c) 86%, transparent);
    color: var(--text, #e8e8e8);
    cursor: pointer;
    backdrop-filter: blur(6px);
  }
  .fs-btn:hover { background: var(--bg-control-hover, #232733); }
</style>
