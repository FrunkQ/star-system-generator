<script lang="ts">
  export let gridType: 'grid' | 'hex' | 'traveller-hex' | 'none' = 'none';
  export let gridSize: number = 50;
  export let panX: number = 0;
  export let panY: number = 0;
  export let zoom: number = 1;
  export let viewWidth: number = 800;
  export let viewHeight: number = 600;
  export let originX: number = 0;
  export let originY: number = 0;
  export let travellerMetadata: any = null;

  let gridPaths = '';
  let hexPaths = '';
  let subsectorPaths = '';
  let hexLabels: Array<{x: number, y: number, text: string, title?: string}> = [];

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
      hexPaths = '';
      subsectorPaths = '';
      hexLabels = [];
    } else if (gridType === 'hex' || gridType === 'traveller-hex') {
      gridPaths = '';
      let paths = '';
      let subPaths = '';
      let labels = [];
      
      // Flat-topped geometry
      const size = gridSize / 2;
      const hexWidth = 2 * size;
      const hexHeight = Math.sqrt(3) * size;
      const horizDist = 1.5 * size;

      const startCol = Math.floor((-panX / zoom - originX) / horizDist);
      const endCol = startCol + viewWidth / zoom / horizDist + 2;
      const startRow = Math.floor((-panY / zoom - originY) / hexHeight);
      const endRow = startRow + viewHeight / zoom / hexHeight + 2;

      for (let col = startCol; col < endCol; col++) {
        for (let row = startRow; row < endRow; row++) {
          const x = col * horizDist + originX;
          const y = row * hexHeight + (Math.abs(col) % 2) * (hexHeight / 2) + originY;

          // Flat-topped Hex Path
          paths += `
            M ${x + size} ${y}
            L ${x + size/2} ${y + hexHeight/2}
            L ${x - size/2} ${y + hexHeight/2}
            L ${x - size} ${y}
            L ${x - size/2} ${y - hexHeight/2}
            L ${x + size/2} ${y - hexHeight/2}
            Z `;

          if (gridType === 'traveller-hex') {
              // Traveller Logic
              // Coordinate system: 1-based, Col-Row (CCRR)
              // We assume originX/Y corresponds to 0,0 in our internal grid space, which maps to hex 0101
              // BUT, the prompt implies importing a subsector aligns top-left. 
              // Standard Traveller maps use 1-based indexing relative to the sector/subsector.
              // Here, we'll calculate absolute indices and map them to the 8x10 subsector grid.
              
              const absCol = col + 1; // 1-based
              const absRow = row + 1; // 1-based
              
              // We want 0101 to be the first hex.
              // If cols can be negative (pan left), we need to handle that.
              // For visualization, let's just display the absolute coordinates relative to origin.
              // The user requirement says: "Small numbers are added to the top of a box starting 0101... go up to 32 (cols) and 40 (rows)".
              // And they repeat.
              
              let displayCol = absCol % 32;
              if (displayCol === 0) displayCol = 32;
              if (displayCol < 0) displayCol += 32;
              
              let displayRow = absRow % 40;
              if (displayRow === 0) displayRow = 40;
              if (displayRow < 0) displayRow += 40;
              
              const colStr = displayCol.toString().padStart(2, '0');
              const rowStr = displayRow.toString().padStart(2, '0');
              
              // Find if this hex belongs to any imported subsector
              let title = "";
              if (travellerMetadata && travellerMetadata.importedSubsectors) {
                  for (const sub of travellerMetadata.importedSubsectors) {
                      const dx = x - sub.originX;
                      const dy = y - sub.originY;
                      // Approximate bounds check
                      if (dx >= -hexWidth && dx < 8 * horizDist && 
                          dy >= -hexHeight && dy < 10 * hexHeight) {
                          const subName = sub.name !== 'Subsector ' + sub.subsectorCode ? ` (${sub.name})` : '';
                          title = `${sub.sectorName} - Subsector ${sub.subsectorCode}${subName} - Hex ${colStr}${rowStr}`;
                          break;
                      }
                  }
              }

              labels.push({
                  x: x,
                  y: y - hexHeight * 0.3, // Top of hex
                  text: `${colStr}${rowStr}`,
                  title: title
              });

              // Vertical Boundary (Right of Col 8, 16...)
              // Zig-zag line for flat-topped vertical separation
              if (absCol % 8 === 0) {
                   subPaths += `
                    M ${x + size/2} ${y - hexHeight/2}
                    L ${x + size} ${y}
                    L ${x + size/2} ${y + hexHeight/2}
                   `;
              }
              
              // Horizontal Boundary (Bottom of Row 10)
              if (absRow % 10 === 0) {
                   // Bottom Flat
                   subPaths += `
                    M ${x + size/2} ${y + hexHeight/2}
                    L ${x - size/2} ${y + hexHeight/2}
                   `;
                   
                   // Bridge to next column (Right)
                   // If Even Col (0, 2..), Next is Odd (Lower) -> Go Down
                   // If Odd Col (1, 3..), Next is Even (Higher) -> Go Up
                   const isEvenCol = Math.abs(absCol - 1) % 2 === 0; // absCol is 1-based. col is 0-based.
                   // Actually, let's use 'col' (0-based index) directly for parity check.
                   // If col=0 (Even), y_offset=0. Next col=1, y_offset=h/2. Go Down.
                   
                   if (Math.abs(col) % 2 === 0) {
                       // Go Down-Right to (x+s, y+h)
                       subPaths += `
                        M ${x + size/2} ${y + hexHeight/2}
                        L ${x + size} ${y + hexHeight}
                       `;
                   } else {
                       // Go Up-Right to (x+s, y)
                       subPaths += `
                        M ${x + size/2} ${y + hexHeight/2}
                        L ${x + size} ${y}
                       `;
                   }
              }
          }
        }
      }
      hexPaths = paths;
      subsectorPaths = subPaths;
      hexLabels = labels;
    } else {
      gridPaths = '';
      hexPaths = '';
      subsectorPaths = '';
      hexLabels = [];
    }
  }
</script>

{#if gridType === 'grid'}
  <path d={gridPaths} stroke="#555" stroke-width={1 / zoom} />
{/if}

{#if gridType === 'hex' || gridType === 'traveller-hex'}
  <path d={hexPaths} stroke="#555" stroke-width={1 / zoom} fill="none" />
{/if}

{#if gridType === 'traveller-hex'}
  <path d={subsectorPaths} stroke="#888" stroke-width={3 / zoom} fill="none" />
  {#each hexLabels as label}
      <text 
        x={label.x} 
        y={label.y} 
        font-size={8 / zoom} 
        fill="#888" 
        text-anchor="middle"
        style="pointer-events: all; cursor: help; user-select: none; -webkit-user-select: none;"
      >
        {#if label.title}<title>{label.title}</title>{/if}
        {label.text}
      </text>
  {/each}
{/if}