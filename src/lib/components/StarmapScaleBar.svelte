<script lang="ts">
  export let zoom: number;
  export let svgScale: number = 1;
  export let calibration: { pixelsPerUnit: number } | undefined;
  export let distanceUnit: string;
  export let unitIsPrefix: boolean;
  export let isScaled: boolean;

  // Visual constants
  const targetWidthPx = 200; // Target width for the scale bar in screen pixels

  let displayWidthPx = targetWidthPx;
  let displayValue = 0;
  let label = "?";
  let ticks: number[] = [];

  $: {
      if (!isScaled || !calibration || calibration.pixelsPerUnit <= 0) {
          label = "?";
          displayWidthPx = 100;
          ticks = [0, 100];
      } else {
          // Calculate how many 'units' fit in the target width
          // pixelsPerUnit is World Space pixels per 1 Unit.
          // Screen pixels per unit = pixelsPerUnit * zoom * svgScale (DOM pixels per SVG unit).
          const screenPixelsPerUnit = calibration.pixelsPerUnit * zoom * svgScale;
          
          if (screenPixelsPerUnit <= 0) {
              label = "?";
          } else {
              const rawUnits = targetWidthPx / screenPixelsPerUnit;
              
              // Find a nice round number for the units (e.g. 1, 2, 5, 10, 0.5)
              const magnitude = Math.pow(10, Math.floor(Math.log10(rawUnits)));
              const residual = rawUnits / magnitude;
              let niceUnits = magnitude;
              if (residual > 5) niceUnits = 5 * magnitude;
              else if (residual > 2) niceUnits = 2 * magnitude;
              else niceUnits = magnitude;

              displayValue = niceUnits;
              displayWidthPx = niceUnits * screenPixelsPerUnit;
              
              const formattedValue = displayValue >= 1000 ? (displayValue/1000).toFixed(1) + 'k' : displayValue.toString();
              label = unitIsPrefix ? `${distanceUnit}${formattedValue}` : `${formattedValue} ${distanceUnit}`;

              // Ticks
              ticks = [];
              const numTicks = 5; // Try to have sub-ticks
              for(let i=0; i<=numTicks; i++) {
                  ticks.push((i / numTicks) * displayWidthPx);
              }
          }
      }
  }
</script>

{#if isScaled}
<div class="scale-bar-container">
    <div class="scale-bar" style="width: {displayWidthPx}px;">
        {#each ticks as tick}
            <div class="tick" style="left: {tick}px;"></div>
        {/each}
    </div>
    <div class="scale-label">{label}</div>
</div>
{/if}

<style>
    .scale-bar-container {
        position: absolute;
        bottom: 16px;
        left: 20px; 
        display: flex;
        flex-direction: column;
        align-items: center;
        pointer-events: none;
        z-index: 10;
        background-color: rgba(0, 0, 0, 0.5);
        padding: 5px 10px;
        border-radius: 4px;
    }

    .scale-bar {
        height: 2px;
        background-color: #fff;
        position: relative;
        margin-bottom: 5px;
        transition: width 0.2s;
    }

    .tick {
        position: absolute;
        width: 1px;
        height: 8px;
        background-color: #fff;
        bottom: 0;
    }

    .scale-label {
        color: #fff;
        font-size: 12px;
        font-family: monospace;
        text-shadow: 1px 1px 2px black;
    }
</style>
