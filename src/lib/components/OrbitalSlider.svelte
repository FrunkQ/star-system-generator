<script lang="ts">
  import { createEventDispatcher } from 'svelte';

  export let value: number;
  export let min: number;
  export let max: number;
  export let zones: any = null; // Result of calculateAllStellarZones + Roche

  const dispatch = createEventDispatcher();
  let svgEl: SVGSVGElement;
  let isDragging = false;

  $: minLog = Math.log(min);
  $: maxLog = Math.log(max);
  $: scale = maxLog - minLog;

  function getPercent(val: number) {
      if (val <= 0) return 0;
      const safeVal = Math.max(min, Math.min(max, val));
      return ((Math.log(safeVal) - minLog) / scale) * 100;
  }

  function handleMouseDown(e: MouseEvent) {
      isDragging = true;
      updateValue(e);
  }

  function handleMouseMove(e: MouseEvent) {
      if (!isDragging) return;
      updateValue(e);
  }

  function handleMouseUp() {
      isDragging = false;
  }

  function updateValue(e: MouseEvent) {
      const rect = svgEl.getBoundingClientRect();
      let x = e.clientX - rect.left;
      let pct = Math.max(0, Math.min(1, x / rect.width));
      
      // Reverse Log: exp(minLog + scale * pct)
      const newVal = Math.exp(minLog + scale * pct);
      value = parseFloat(newVal.toFixed(5));
      dispatch('input', value);
  }
</script>

<svelte:window on:mouseup={handleMouseUp} on:mousemove={handleMouseMove} />

<div class="orbital-slider-container">
    <svg 
        bind:this={svgEl}
        class="orbital-slider" 
        on:mousedown={handleMouseDown}
        preserveAspectRatio="none"
    >
        <!-- Background Track -->
        <rect x="0" y="20" width="100%" height="10" fill="#333" rx="5" />

        {#if zones}
            <!-- Zones (Bands) -->
            <!-- Kill Zone (0 to killZone) -->
            <rect x="0" y="22" width="{getPercent(zones.killZone)}%" height="6" fill="rgba(255, 0, 0, 0.5)" />
            
            <!-- Danger Zone (killZone to dangerZone) -->
            {#if zones.dangerZone > zones.killZone}
                <rect 
                    x="{getPercent(zones.killZone)}%" 
                    y="22" 
                    width="{getPercent(zones.dangerZone) - getPercent(zones.killZone)}%" 
                    height="6" 
                    fill="rgba(255, 165, 0, 0.4)" 
                />
            {/if}

            <!-- Goldilocks (Habitable) -->
            {#if zones.goldilocks}
                <rect 
                    x="{getPercent(zones.goldilocks.inner)}%" 
                    y="20" 
                    width="{getPercent(zones.goldilocks.outer) - getPercent(zones.goldilocks.inner)}%" 
                    height="10" 
                    fill="rgba(0, 255, 0, 0.4)" 
                />
            {/if}

            <!-- Lines (Ticks) -->
            {#each [
                { val: zones.rocheLimit, color: '#f88', label: 'Roche' },
                { val: zones.silicateLine, color: '#b88', label: 'Rock' },
                { val: zones.sootLine, color: '#888', label: 'Soot' },
                { val: zones.frostLine, color: '#acf', label: 'Frost' },
                { val: zones.co2IceLine, color: '#fff', label: 'CO2' },
                { val: zones.coIceLine, color: '#88f', label: 'CO' }
            ] as mark}
                {#if mark.val && mark.val >= min && mark.val <= max}
                    {@const pct = getPercent(mark.val)}
                    <line x1="{pct}%" y1="15" x2="{pct}%" y2="35" stroke="{mark.color}" stroke-width="2" />
                    <!-- Label with collision avoidance logic? Simple alternate height for now -->
                    <text 
                        x="{pct}%" 
                        y="{pct > 50 ? 12 : 45}" 
                        fill="{mark.color}" 
                        font-size="9" 
                        text-anchor="middle"
                    >{mark.label}</text>
                {/if}
            {/each}
        {/if}

        <!-- Thumb -->
        <circle cx="{getPercent(value)}%" cy="25" r="6" fill="#fff" stroke="#000" stroke-width="2" style="cursor: pointer;" />
    </svg>
</div>

<style>
    .orbital-slider-container {
        width: 100%;
        height: 50px;
        user-select: none;
        margin-top: 5px;
    }
    .orbital-slider {
        width: 100%;
        height: 100%;
        overflow: visible;
    }
    text {
        pointer-events: none;
        font-family: sans-serif;
    }
</style>
