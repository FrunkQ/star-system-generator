<script lang="ts">
  // A45: the SHARED overlay vocabulary (map/mapOverlay), narrowed to what this SVG snap grid can
  // actually draw. A typed subset rather than a private union of its own, so a value added there can
  // never silently fail to reach here — which is what kept `subsector-hex` out of the GM's own map
  // for 300 versions after every player view could show it.
  import { hasSubsectors, type SnapGridType } from '$lib/map/mapOverlay';
  export let gridType: SnapGridType = 'off';
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

  // LEGIBILITY GATE — and it is a CRASH GUARD, which is why it comes first.
  //
  // Every loop below is sized in MAP units and iterates `view / zoom / cell` times, so its cost
  // grows without limit as the view zooms out. Zoom is fitted to the map's own extent, so the
  // driver is really how far apart the furthest two systems are. MEASURED on a map with two
  // systems 85,103 ly apart (a real user report): zoom settles at 2.6e-4, which is 61,422 x 46,066
  // lines for the square grid — it built a 4.95 MB path string — and 81,896 x 53,193 = 4.36 BILLION
  // hexes for the hex grid. At 664k hexes/second on a fast desktop that is 1.8 HOURS of blocking
  // the main thread while growing a ~670 GB string, so it dies of memory long before it finishes.
  // That is the reported "it takes too long to load and then crashes", and it lands AFTER the
  // physics has completed, which is why the progress bar sits at 100% while the app is gone.
  //
  // The gate is legibility, not a magic cap: at that zoom a 50-unit cell is 0.013 SCREEN pixels, so
  // those billions of hexes are drawing a grey haze at best. Below a few pixels a grid is noise, and
  // the correct render is nothing. `starmapScene.renderMapGrid` already reasons exactly this way for
  // the 3D starmap ("too dense to be useful"), which is why that view never had this fault — this
  // brings the 2D map into line rather than inventing a new rule.
  //
  // MAX_CELLS is a backstop UNDER the gate, not a second opinion: the gate decides what is worth
  // drawing, the cap guarantees that no future change to the gate can reintroduce an unbounded loop.
  // It must therefore sit ABOVE honest use, or it silently truncates real grids instead of catching
  // runaways. At the densest LEGIBLE zoom the hex grid genuinely wants 82,112 cells (355 x 231) —
  // that is today's behaviour and must not change — so the ceiling is set well clear of it. The
  // first attempt at this pair was 40,000 and would have cut a legitimate grid in half; the spec
  // caught it, which is why it asserts the two constants against each other rather than in isolation.
  const MIN_CELL_PX = 3;       // below this a grid is a haze, not a grid (0.013 px on the crash map)
  const MAX_CELLS = 250000;    // hard ceiling on emitted cells, ~3x the densest legitimate view
  $: cellPx = gridSize * zoom;
  $: gridLegible = cellPx >= MIN_CELL_PX;

  $: {
    if (!gridLegible) {
      // Zoomed too far out for the grid to mean anything. Draw nothing rather than a haze - and,
      // critically, never enter the loops.
      gridPaths = '';
      hexPaths = '';
      subsectorPaths = '';
      hexLabels = [];
    } else if (gridType === 'square') {
      let paths = '';
      const startX = Math.floor((-panX / zoom - originX) / gridSize) * gridSize + originX;
      const endX = startX + viewWidth / zoom;
      const startY = Math.floor((-panY / zoom - originY) / gridSize) * gridSize + originY;
      const endY = startY + viewHeight / zoom;

      let drawn = 0;
      for (let x = startX; x < endX && drawn < MAX_CELLS; x += gridSize, drawn++) {
        paths += `M ${x} ${startY} L ${x} ${endY} `;
      }
      for (let y = startY; y < endY && drawn < MAX_CELLS; y += gridSize, drawn++) {
        paths += `M ${startX} ${y} L ${endX} ${y} `;
      }
      gridPaths = paths;
      hexPaths = '';
      subsectorPaths = '';
      hexLabels = [];
    } else if (gridType === 'hex' || hasSubsectors(gridType)) {
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

      // The cap is tested on the INNER loop, because the explosion here is the PRODUCT of the two:
      // capping columns alone still lets one column emit tens of thousands of rows.
      let drawn = 0;
      for (let col = startCol; col < endCol && drawn < MAX_CELLS; col++) {
        for (let row = startRow; row < endRow && drawn < MAX_CELLS; row++) {
          drawn++;
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

          if (hasSubsectors(gridType)) {
              // A45: BORDERS for the whole subsector family, NUMBERS for Traveller hex alone. The two
              // were one branch, which is why "borders without numbering" could not be expressed even
              // though every line of geometry it needs was already here.
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

              if (gridType === 'traveller-hex') labels.push({
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

{#if gridType === 'square'}
  <path d={gridPaths} stroke="#555" stroke-width={1 / zoom} />
{/if}

{#if gridType === 'hex' || hasSubsectors(gridType)}
  <path d={hexPaths} stroke="#555" stroke-width={1 / zoom} fill="none" />
{/if}

{#if hasSubsectors(gridType)}
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