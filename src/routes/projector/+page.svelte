<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import { systemStore } from '$lib/stores';
  import { panStore, zoomStore } from '$lib/cameraStore';
  import SystemVisualizer from '$lib/components/SystemVisualizer.svelte';
  import CRTOverlay from '$lib/components/CRTOverlay.svelte';
  import { broadcastService } from '$lib/broadcast';
  import { browser } from '$app/environment';
  import type { RulePack } from '$lib/types';
  import { fetchAndLoadRulePack } from '$lib/rulepack-loader';
  import { page } from '$app/stores';
  
  let rulePack: RulePack | null = null;
  let currentTime = Date.now();
  let focusedBodyId: string | null = null;
  let animationFrameId: number;
  let isFollowingGM = true;
  let showMenu = false;
  let cameraMode: 'FOLLOW' | 'MANUAL' = 'FOLLOW';
  let isCrtMode = false;
  let broadcastSessionId: string | null = null;

  // View Settings
  let showNames = true;
  let showZones = false;
  let showLPoints = false;

  // Time State
  let isPlaying = false;
  let timeScale = 0;

  // Animation loop
  function startLoop() {
      if (!browser) return;
      let lastTimestamp = performance.now();
      function tick(timestamp: number) {
          const delta = (timestamp - lastTimestamp) / 1000;
          
          if (isPlaying) {
              currentTime += delta * timeScale * 1000; 
          }
          
          lastTimestamp = timestamp;
          animationFrameId = requestAnimationFrame(tick);
      }
      animationFrameId = requestAnimationFrame(tick);
  }

  onMount(async () => {
      // Get session ID from URL
      const urlParams = new URLSearchParams(window.location.search);
      broadcastSessionId = urlParams.get('sid');
  
      // Load RulePack (assuming standard)
      try {
        rulePack = await fetchAndLoadRulePack('/rulepacks/starter-sf/main.json');
      } catch (e) {
          console.error("Failed to load rulepack for player view", e);
      }
      
  // Init Receiver
      broadcastService.initReceiver(
          (sys) => systemStore.set(sys),
          (pack) => rulePack = pack,
          (id) => {
              if (isFollowingGM) focusedBodyId = id;
          },
          (pan, zoom, isManual) => {
              if (isFollowingGM) {
                  if (isManual) {
                      // GM is manually panning/dragging. We must mirror this exactly.
                      cameraMode = 'MANUAL';
                      
                      // Use fast transition if dragging (updates are frequent), smooth if it was a discrete set
                      const duration = 100; 
                      
                      panStore.set(pan, { duration }); 
                      zoomStore.set(zoom, { duration });
                  } else {
                      // GM is in FOLLOW mode (tracking a body).
                      // We switch to FOLLOW mode so our local Visualizer calculates the correct center 
                      // based on the physics simulation (which is synced via time/system).
                      cameraMode = 'FOLLOW';
                      
                      // We still sync zoom, as the GM might auto-zoom or manual zoom while following.
                      zoomStore.set(zoom, { duration: 500 });
                  }
              }
          },
          (settings) => {
              showNames = settings.showNames;
              showZones = settings.showZones;
              showLPoints = settings.showLPoints;
          },
          (time) => {
              isPlaying = time.isPlaying;
              timeScale = time.timeScale;
              if (Math.abs(currentTime - time.currentTime) > 1000) {
                  currentTime = time.currentTime;
              }
          },
          (crtMode) => {
              isCrtMode = crtMode;
          },
          broadcastSessionId
      );

      startLoop();
  });
  
  function handleInteraction() {
      // If player interacts, stop following GM automatically
      if (isFollowingGM) {
          isFollowingGM = false;
      }
  }
  
  onDestroy(() => {
      broadcastService.close();
      if (browser) {
        cancelAnimationFrame(animationFrameId);
      }
  });

</script>

<main class="player-view" class:crt-mode={isCrtMode} 
    on:mousedown={handleInteraction} 
    on:wheel|passive={handleInteraction}
    on:touchstart={handleInteraction}>
    {#if isCrtMode}
        <CRTOverlay />
    {/if}

    {#if $systemStore && rulePack}
        <SystemVisualizer 
            system={$systemStore} 
            {rulePack} 
            {currentTime} 
            {focusedBodyId}
            {showNames} 
            {showZones} 
            {showLPoints}
            toytownFactor={$systemStore.toytownFactor || 0}
            fullScreen={true}
            bind:cameraMode={cameraMode}
        />
        <div class="time-display">
            {#if isPlaying}
                Running: 1s = {
                    timeScale === 1 ? '1s' : 
                    timeScale === 3600 ? '1h' :
                    timeScale === 86400 ? '1d' :
                    timeScale === 2592000 ? '30d' :
                    timeScale === 7776000 ? '90d' :
                    timeScale === 31536000 ? '1y' :
                    timeScale === 315360000 ? '10y' :
                    timeScale + 'x'}
            {:else}
                Paused
            {/if}
        </div>
        <div class="projector-menu">
            <button class="hamburger" on:click={() => showMenu = !showMenu}>☰</button>
            {#if showMenu}
                <div class="menu-content">
                    <label>
                        <input type="checkbox" bind:checked={isFollowingGM}>
                        Follow GM View
                    </label>
                </div>
            {/if}
        </div>
    {:else}
        <div class="loading">
            <h1>Waiting for GM...</h1>
            <p>Open a System in the main window.</p>
            <button on:click={() => broadcastService.sendMessage({ type: 'REQUEST_SYNC', payload: broadcastSessionId })}>
                Retry Connection
            </button>
        </div>
    {/if}
</main>

<style>
    .player-view {
        width: 100vw;
        height: 100vh;
        overflow: hidden;
        background-color: #08090d;
        margin: 0;
        padding: 0;
        position: relative;
    }
    .player-view.crt-mode {
        filter: sepia(1) hue-rotate(80deg) saturate(3) brightness(1.3) contrast(1.1) blur(0.5px);
        /* Barrel Warp Simulation */
        border-radius: 50px; 
        box-shadow: inset 0 0 100px rgba(0,0,0,0.9);
        transform: scale(0.98); /* Shrink slightly to show the "bezel" or background if any */
    }
    .loading {
        display: flex;
        flex-direction: column;
        justify-content: center;
        align-items: center;
        height: 100%;
        color: #666;
        font-family: sans-serif;
    }
    .time-display {
        position: absolute;
        top: 10px;
        left: 10px;
        color: rgba(255, 255, 255, 0.7);
        font-family: monospace;
        font-size: 14px;
        pointer-events: none;
        z-index: 999;
    }
    .projector-menu {
        position: absolute;
        top: 10px;
        right: 10px;
        z-index: 1000;
    }
    .hamburger {
        background: rgba(0, 0, 0, 0.5);
        color: #eee;
        border: 1px solid #444;
        font-size: 1.5em;
        padding: 5px 10px;
        cursor: pointer;
        border-radius: 4px;
    }
    .menu-content {
        position: absolute;
        top: 100%;
        right: 0;
        background: rgba(0, 0, 0, 0.8);
        padding: 10px;
        border: 1px solid #444;
        border-radius: 4px;
        min-width: 150px;
        margin-top: 5px;
    }
    .menu-content label {
        display: block;
        color: #eee;
        font-family: sans-serif;
        font-size: 14px;
        cursor: pointer;
    }
    /* Hide canvas border/margin if any */
    :global(canvas) {
        border: none !important;
        margin: 0 !important;
        width: 100% !important;
        height: 100% !important;
    }
    :global(body) {
        margin: 0;
        overflow: hidden;
    }
</style>