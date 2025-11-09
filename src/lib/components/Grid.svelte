<script lang="ts">
  export let gridType: 'grid' | 'hex' | 'none' = 'none';
  export let gridSize: number = 50;
  export let panX: number = 0;
  export let panY: number = 0;
  export let zoom: number = 1;
  export let viewWidth: number = 800;
  export let viewHeight: number = 600;
  export let originX: number = 0;
  export let originY: number = 0;

  let gridPaths = '';
  let hexPaths = '';

  $: {
    if (gridType === 'grid') {
      let paths = '';
      const startX = Math.floor((-panX / zoom - originX) / gridSize) * gridSize + originX;
      const endX = startX + viewWidth / zoom;
      const startY = Math.floor((-panY / zoom - originY) / gridSize) * gridSize + originY;
      const endY = startY + viewHeight / zoom;

      for (let x = startX; x < endX; x += gridSize) {
        paths += `M ${x} ${startY} L ${x} ${endY} `;
      }
      for (let y = startY; y < endY; y += gridSize) {
        paths += `M ${startX} ${y} L ${endX} ${y} `;
      }
      gridPaths = paths;
    } else {
      gridPaths = '';
    }
  }

  $: {
    if (gridType === 'hex') {
      let paths = '';
      const hexSize = gridSize / 2;
      const hexWidth = Math.sqrt(3) * hexSize;
      const hexHeight = 2 * hexSize;

      const startCol = Math.floor((-panX / zoom - originX) / hexWidth);
      const endCol = startCol + viewWidth / zoom / hexWidth + 2;
      const startRow = Math.floor((-panY / zoom - originY) / (hexHeight * 0.75));
      const endRow = startRow + viewHeight / zoom / (hexHeight * 0.75) + 2;

      for (let row = startRow; row < endRow; row++) {
        for (let col = startCol; col < endCol; col++) {
          const x = col * hexWidth + (row % 2) * (hexWidth / 2) + originX;
          const y = row * hexHeight * 0.75 + originY;

          paths += `
            M ${x + hexWidth / 2} ${y}
            L ${x + hexWidth} ${y + hexHeight / 4}
            L ${x + hexWidth} ${y + hexHeight * 0.75}
            L ${x + hexWidth / 2} ${y + hexHeight}
            L ${x} ${y + hexHeight * 0.75}
            L ${x} ${y + hexHeight / 4}
            Z `;
        }
      }
      hexPaths = paths;
    } else {
      hexPaths = '';
    }
  }
</script>

{#if gridType === 'grid'}
  <path d={gridPaths} stroke="#555" stroke-width={1 / zoom} />
{/if}

{#if gridType === 'hex'}
  <path d={hexPaths} stroke="#555" stroke-width={1 / zoom} fill="none" />
{/if}