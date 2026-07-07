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

              // End ticks only, matching the system map's scale bar.
              ticks = [0, displayWidthPx];
          }
      }
  }
</script>

{#if isScaled}
<!-- Bottom-RIGHT, styled to match the system map's canvas scale bar (label above, end ticks). -->
<div class="scale-bar-container">
    <div class="scale-label">{label}</div>
    <div class="scale-bar" style="width: {displayWidthPx}px;">
        {#each ticks as tick}
            <div class="tick" style="left: {tick}px;"></div>
        {/each}
    </div>
</div>
{/if}

<style>
    .scale-bar-container {
        position: absolute;
        bottom: 16px;
        right: 20px;
        display: flex;
        flex-direction: column;
        align-items: center;
        pointer-events: none;
        z-index: 10;
        padding: 5px 10px;
    }

    .scale-bar {
        height: 1px;
        background-color: #fff;
        position: relative;
        transition: width 0.2s;
    }

    .tick {
        position: absolute;
        width: 1px;
        height: 10px;
        background-color: #fff;
        top: -4.5px;
    }

    .scale-label {
        color: #fff;
        font-size: 12px;
        font-family: sans-serif;
        text-shadow: 1px 1px 2px black;
        margin-bottom: 6px;
    }
</style>
