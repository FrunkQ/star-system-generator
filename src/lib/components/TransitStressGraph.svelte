<script lang="ts">
  import { onMount, afterUpdate } from 'svelte';
  import type { TelemetryPoint } from '$lib/transit/telemetry';

  export let telemetry: TelemetryPoint[];
  export let progress: number; // 0 to 100

  let canvas: HTMLCanvasElement;
  let container: HTMLDivElement;
  let width = 0;
  let height = 0;

  // Resize Observer
  onMount(() => {
      const ro = new ResizeObserver(entries => {
          for (const entry of entries) {
              width = entry.contentRect.width;
              height = entry.contentRect.height;
              draw();
          }
      });
      if (container) ro.observe(container);
      return () => ro.disconnect();
  });

  afterUpdate(() => {
      draw();
  });

  function draw() {
      if (!canvas || !telemetry || telemetry.length === 0) return;
      
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      canvas.width = width;
      canvas.height = height;
      
      ctx.clearRect(0, 0, width, height);

      // X: Time (linear from 0 to length)
      // Y: G-Force (0 to Max observed + buffer, or fixed 12G?)
      // Let's allow Y to scale, but clamp min to 2G so small burns show up.
      // Clamp max visual G to 15G (spikes go off chart)
      let maxG = 2;
      telemetry.forEach(p => { if (p.gForce > maxG) maxG = p.gForce; });
      maxG = Math.ceil(maxG * 1.1); // 10% buffer
      if (maxG > 15) maxG = 15;

      const startTime = telemetry[0].time;
      const endTime = telemetry[telemetry.length - 1].time;
      const duration = Math.max(1, endTime - startTime);
      const yScale = height / maxG;

      // Draw Grid Lines (Thresholds)
      const drawThreshold = (g: number, color: string, dash: number[]) => {
          if (g > maxG) return;
          const y = height - (g * yScale);
          ctx.beginPath();
          ctx.strokeStyle = color;
          ctx.lineWidth = 1;
          ctx.setLineDash(dash);
          ctx.moveTo(0, y);
          ctx.lineTo(width, y);
          ctx.stroke();
          ctx.fillStyle = color;
          ctx.font = '10px sans-serif';
          ctx.fillText(`${g}G`, 2, y - 2);
      };

      drawThreshold(1, '#444', [2, 2]);
      drawThreshold(2, '#d97706', [4, 4]); // Orange warning
      drawThreshold(10, '#dc2626', [4, 4]); // Red danger (Extreme)
      
      // Draw G-Force Line
      ctx.beginPath();
      ctx.strokeStyle = '#00ffff';
      ctx.lineWidth = 2;
      ctx.setLineDash([]);
      ctx.lineJoin = 'round';

      telemetry.forEach((p, i) => {
          const x = ((p.time - startTime) / duration) * width;
          // Clamp y to 0 (top of chart) if gForce > maxG
          let y = height - (p.gForce * yScale);
          if (y < 0) y = 0;
          
          if (i === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
      });
      ctx.stroke();
      
      // Draw Cursor
      const cursorX = (progress / 100) * width;
      ctx.beginPath();
      ctx.strokeStyle = '#fff';
      ctx.lineWidth = 1;
      ctx.moveTo(cursorX, 0);
      ctx.lineTo(cursorX, height);
      ctx.stroke();
      
      // Highlight current G value
      // Find closest point
      const idx = Math.floor((progress / 100) * (telemetry.length - 1));
      const currentPoint = telemetry[idx];
      if (currentPoint) {
          let cy = height - (currentPoint.gForce * yScale);
          if (cy < 0) cy = 0;
          
          ctx.beginPath();
          ctx.fillStyle = '#fff';
          ctx.arc(cursorX, cy, 3, 0, 2 * Math.PI);
          ctx.fill();
          
          ctx.fillStyle = '#fff';
          ctx.textAlign = 'left';
          // If off-chart, indicate it
          const text = currentPoint.gForce > 15 ? `>15G (${currentPoint.gForce.toFixed(1)})` : `${currentPoint.gForce.toFixed(1)}G`;
          ctx.fillText(text, cursorX + 5, Math.min(cy + 15, height - 5));
      }
  }
  
  // Hazard Overlay Logic
  // We identify all distinct continuous hazard events
  let hazardZones: any[] = [];
  
  $: {
      if (!telemetry || telemetry.length <= 1) {
          hazardZones = [];
      } else {
          const completedZones = [];
          const activeZones = new Map<string, { startIdx: number, endIdx: number, type: string, source: string, level: string, message: string }>();
          
          for (let i = 0; i < telemetry.length; i++) {
              const p = telemetry[i];
              const foundKeys = new Set<string>();
              
              for (const h of p.hazards) {
                  // Include Level in key so transitions (Orange -> Red) create new zones
                  const key = `${h.type}-${h.sourceName}-${h.level}`;
                  foundKeys.add(key);
                  
                  if (activeZones.has(key)) {
                      // Continue zone
                      activeZones.get(key)!.endIdx = i;
                  } else {
                      // Start new zone
                      activeZones.set(key, {
                          startIdx: i,
                          endIdx: i,
                          type: h.type,
                          source: h.sourceName,
                          level: h.level,
                          message: h.message
                  });
                  }
              }
              
              // Close zones that ended
              for (const [key, zone] of activeZones) {
                  if (!foundKeys.has(key)) {
                      completedZones.push(zone);
                      activeZones.delete(key);
                  }
              }
          }
          // Close remaining
          for (const zone of activeZones.values()) {
              completedZones.push(zone);
          }
          
      // Calculate stacking rows to avoid overlap
      // Simple heuristic: Map Type to Row
      const typeRows: Record<string, number> = { 'G-Force': 0, 'Gravity': 0, 'Aerobrake': 0, 'Radiation': 1, 'Debris': 2 };
      
      const startTime = telemetry[0].time;
      const endTime = telemetry[telemetry.length - 1].time;
      const duration = Math.max(1, endTime - startTime);

      hazardZones = completedZones.map(z => {
          const startT = telemetry[z.startIdx].time;
          const endT = telemetry[z.endIdx].time;
          
          const startPct = ((startT - startTime) / duration) * 100;
          const endPct = ((endT - startTime) / duration) * 100;
          const width = Math.max(0.5, endPct - startPct);
          const center = startPct + width / 2;
          
          let leftPos = center;
          let transform = 'translateX(-50%)';
          
          // Edge clamping for labels
          if (center < 5) {
              leftPos = startPct;
              transform = 'none';
          } else if (center > 95) {
              leftPos = endPct;
              transform = 'translateX(-100%)';
          }

          return {
              left: startPct, // For Background Zone (Left edge)
              width: width,   // For Background Zone
              labelLeftStyle: `left: ${leftPos}%; transform: ${transform}; top: ${ (typeRows[z.type] || 0) * 12 }px;`, // For Label
              color: getColorForLevel(z.level),
              badgeColor: getBadgeColorForLevel(z.level),
              title: `${z.message} (${z.source})`,
              label: getShortLabel(z.type)
          };
      });
  }
  }
  
  function getShortLabel(type: string) {
      if (type === 'Radiation') return 'RAD';
      if (type === 'Debris') return 'BELT';
      if (type === 'Gravity') return 'ROCHE';
      if (type === 'G-Force') return 'HIGH-G';
      if (type === 'Aerobrake') return 'AERO';
      return type;
  }
  
  function getBadgeColorForLevel(level: string) {
      switch(level) {
          case 'Critical': return '#dc2626'; // Red
          case 'Danger': return '#ea580c'; // Orange-Red
          case 'Warning': return '#d97706'; // Orange
          default: return '#2563eb'; // Blue
      }
  }
  
  function getColorForLevel(level: string) {
      switch(level) {
          case 'Critical': return 'rgba(220, 38, 38, 0.4)'; // Red
          case 'Danger': return 'rgba(234, 88, 12, 0.4)'; // Orange-Red
          case 'Warning': return 'rgba(217, 119, 6, 0.3)'; // Orange
          default: return 'rgba(59, 130, 246, 0.2)'; // Blue
      }
  }
</script>

<div class="wrapper">
    <!-- Hazard Tags Layer -->
    <div class="tags-container">
        {#each hazardZones as zone}
            <div class="tag-badge" 
                 style="{zone.labelLeftStyle} background-color: {zone.badgeColor};"
                 title={zone.title}>
                 {zone.label}
            </div>
        {/each}
    </div>

    <div class="graph-container" bind:this={container}>
        <!-- Hazard Background Layer -->
        <div class="hazard-layer">
            {#each hazardZones as zone}
                <div class="zone" 
                     style="left: {zone.left}%; width: {zone.width}%; background-color: {zone.color};"
                     title={zone.title}>
                </div>
            {/each}
        </div>
        
        <!-- Canvas Layer -->
        <canvas bind:this={canvas}></canvas>
    </div>
</div>

<style>
    .wrapper {
        display: flex;
        flex-direction: column;
        gap: 2px;
        width: 100%;
        position: relative;
    }
    .tags-container {
        position: relative;
        width: 100%;
        height: 36px;
    }
    .tag-badge {
        position: absolute;
        /* top set inline */
        font-size: 9px;
        font-weight: bold;
        color: #000;
        padding: 1px 3px;
        border-radius: 2px;
        white-space: nowrap;
        pointer-events: none; /* Allow click-through */
        z-index: 10;
        box-shadow: 0 1px 2px rgba(0,0,0,0.5);
    }
    .graph-container {
        position: relative;
        width: 100%;
        height: 80px;
        background-color: #111;
        border: 1px solid #333;
        border-radius: 4px;
        margin-bottom: 10px;
        overflow: hidden;
    }
    canvas {
        position: absolute;
        top: 0;
        left: 0;
        z-index: 2;
    }
    .hazard-layer {
        position: absolute;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        z-index: 1;
    }
    .zone {
        position: absolute;
        top: 0;
        height: 100%;
        /* Min width to be visible */
        min-width: 2px;
        cursor: help;
    }
    .zone:hover {
        opacity: 0.8; /* Highlight on hover */
    }
</style>
