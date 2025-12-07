<script lang="ts">
  import { createEventDispatcher } from 'svelte';
  
  export let leftValue: number = 0; // 0..100
  export let rightValue: number = 100; // 0..100
  export let rightLocked: boolean = false;
  export let disabled: boolean = false;

  const dispatch = createEventDispatcher();
  
  let container: HTMLDivElement;

  function handleMouseDown(event: MouseEvent, handle: 'left' | 'right') {
    if (disabled) return;
    if (handle === 'right' && rightLocked) return;
    
    const startX = event.clientX;
    const startLeft = leftValue;
    const startRight = rightValue;
    const width = container.clientWidth;

    function onMouseMove(e: MouseEvent) {
      const deltaPx = e.clientX - startX;
      const deltaPercent = (deltaPx / width) * 100;
      
      if (handle === 'left') {
        let newVal = Math.max(0, Math.min(startLeft + deltaPercent, 100));
        // Cannot cross right value
        if (newVal > rightValue - 1) newVal = rightValue - 1; 
        leftValue = newVal;
        dispatch('input', { left: leftValue, right: rightValue });
        dispatch('change', { left: leftValue, right: rightValue });
      } else {
        let newVal = Math.max(0, Math.min(startRight + deltaPercent, 100));
        // Cannot cross left value
        if (newVal < leftValue + 1) newVal = leftValue + 1;
        rightValue = newVal;
        dispatch('input', { left: leftValue, right: rightValue });
        dispatch('change', { left: leftValue, right: rightValue });
      }
    }

    function onMouseUp() {
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
      dispatch('input', { left: leftValue, right: rightValue }); // Final commit
    }

    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
  }
</script>

<div class="dual-slider" bind:this={container} class:disabled={disabled}>
  <!-- Track Background (Yellow/Coast) -->
  <div class="track coast"></div>
  
  <!-- Left Bar (Green/Accel) -->
  <div class="bar accel" style="width: {leftValue}%;"></div>
  
  <!-- Right Bar (Red/Brake) -->
  <div class="bar brake" style="left: {rightValue}%; width: {100 - rightValue}%;"></div>
  
  <!-- Left Handle -->
  <div class="handle left" style="left: {leftValue}%" on:mousedown={(e) => handleMouseDown(e, 'left')}></div>
  
  <!-- Right Handle -->
  <div class="handle right {rightLocked ? 'locked' : ''}" style="left: {rightValue}%" on:mousedown={(e) => handleMouseDown(e, 'right')}></div>
</div>

<style>
  .dual-slider {
    position: relative;
    width: 100%;
    height: 20px;
    background: #333;
    border-radius: 10px;
    margin: 10px 0;
    user-select: none;
    transition: opacity 0.3s;
  }
  .dual-slider.disabled {
      opacity: 0.5;
      pointer-events: none; /* Disable all mouse events */
  }
  .track {
    position: absolute;
    top: 0; bottom: 0; left: 0; right: 0;
    border-radius: 10px;
  }
  .coast {
    background: repeating-linear-gradient(
      45deg,
      #444,
      #444 5px,
      #555 5px,
      #555 10px
    );
    border: 1px solid #554400;
  }
  .bar {
    position: absolute;
    top: 0; bottom: 0;
    height: 100%;
    opacity: 0.8;
  }
  .accel {
    background-color: #28a745; /* Green */
    border-radius: 10px 0 0 10px;
    left: 0;
  }
  .brake {
    background-color: #dc3545; /* Red */
    border-radius: 0 10px 10px 0;
  }
  .handle {
    position: absolute;
    top: -2px;
    width: 12px;
    height: 24px;
    background: #fff;
    border: 1px solid #000;
    border-radius: 4px;
    transform: translateX(-50%);
    cursor: ew-resize;
    z-index: 10;
    transition: background 0.2s, transform 0.2s;
  }
  .handle.locked {
    background: #888;
    cursor: not-allowed;
    border-color: #444;
  }
  .dual-slider.disabled .handle {
      cursor: not-allowed;
      background: #777;
      border-color: #555;
  }
  .handle:hover:not(.locked):not(.disabled) {
    background: #ddd;
    transform: translateX(-50%) scale(1.1);
  }
</style>
