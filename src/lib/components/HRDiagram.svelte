<script lang="ts">
    import { createEventDispatcher, onMount } from 'svelte';
    import { deriveStarFromHR, type StarSeed } from '$lib/physics/stellar-evolution';

    const dispatch = createEventDispatcher();
    
    let canvas: HTMLCanvasElement;
    let ctx: CanvasRenderingContext2D;
    let container: HTMLDivElement;
    
    export let selectedStars: StarSeed[] = [];
    const MAX_STARS = 50;

    // Redraw the numbered markers whenever the selection changes (e.g. the parent appended a star on
    // click) — without this the new circle wouldn't appear until the next hover/resize.
    $: { selectedStars; if (imageLoaded) drawDiagram(); }

    const MAX_TEMP = 50000;
    const MIN_TEMP = 2000;
    const MIN_LUM = 0.00001;
    const MAX_LUM = 1000000; 

    let logicalWidth = 800;
    let logicalHeight = 600;

    // HARD-CODED CALIBRATION (Aligned to eso0728c.jpg grid lines)
    const PLOT_BOX = {
        left: 0.131,  // 50,000K axis
        right: 0.984, // 2,000K tick
        top: 0.055,   // 10^6 grid line
        bottom: 0.869 // 10^-5 axis line
    };

    function xToTemp(x: number, width: number) {
        const relativeX = (x / width - PLOT_BOX.left) / (PLOT_BOX.right - PLOT_BOX.left);
        if (relativeX < 0 || relativeX > 1) return -1;
        const logMinT = Math.log10(MIN_TEMP);
        const logMaxT = Math.log10(MAX_TEMP);
        const logT = logMaxT - relativeX * (logMaxT - logMinT);
        return Math.pow(10, logT);
    }

    function tempToX(temp: number, width: number) {
        const logMinT = Math.log10(MIN_TEMP);
        const logMaxT = Math.log10(MAX_TEMP);
        const logCurrent = Math.log10(temp);
        const relativeX = (logMaxT - logCurrent) / (logMaxT - logMinT);
        return (PLOT_BOX.left + relativeX * (PLOT_BOX.right - PLOT_BOX.left)) * width;
    }

    function lumToY(lum: number, height: number) {
        const logMin = Math.log10(MIN_LUM);
        const logMax = Math.log10(MAX_LUM);
        const logCurrent = Math.log10(lum);
        const relativeY = (logMax - logCurrent) / (logMax - logMin);
        return (PLOT_BOX.top + relativeY * (PLOT_BOX.bottom - PLOT_BOX.top)) * height;
    }

    function getStarFromPixels(x: number, y: number): StarSeed | null {
        const temp = xToTemp(x, logicalWidth);
        const relativeY = (y / logicalHeight - PLOT_BOX.top) / (PLOT_BOX.bottom - PLOT_BOX.top);
        
        if (temp === -1 || relativeY < -0.028 || relativeY > 1) return null;

        const logMinL = Math.log10(MIN_LUM);
        const logMaxL = Math.log10(MAX_LUM);
        const logL = logMaxL - relativeY * (logMaxL - logMinL);
        const lum = Math.pow(10, logL);

        return deriveStarFromHR(temp, lum);
    }

    let bgImage: HTMLImageElement;
    let imageLoaded = false;
    let hoverStar: StarSeed | null = null;

    function drawDiagram() {
        if (!ctx || !canvas || !imageLoaded) return;
        
        // Clear the entire canvas (physical bounds for clear is safer)
        ctx.save();
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.restore();

        // Draw image at logical size
        ctx.drawImage(bgImage, 0, 0, logicalWidth, logicalHeight);

        selectedStars.forEach((star, index) => {
            const x = tempToX(star.temperatureK, logicalWidth);
            const y = lumToY(star.luminositySolar, logicalHeight);
            ctx.strokeStyle = '#00ff00';
            ctx.lineWidth = 2;
            ctx.beginPath(); ctx.arc(x, y, 8, 0, Math.PI * 2); ctx.stroke();
            // Marker value label (works on touch — no hover needed) so click→value alignment is testable.
            drawLabel(x, y, `${index + 1}: ${fmtT(star.temperatureK)} · ${fmtL(star.luminositySolar)}`, '#bfffbf');
        });

        if (hoverStar) {
            const x = tempToX(hoverStar.temperatureK, logicalWidth);
            const y = lumToY(hoverStar.luminositySolar, logicalHeight);
            ctx.strokeStyle = 'rgba(255, 255, 255, 0.4)';
            ctx.setLineDash([5, 5]);
            ctx.beginPath();
            ctx.moveTo(x, 0); ctx.lineTo(x, logicalHeight);
            ctx.moveTo(0, y); ctx.lineTo(logicalWidth, y);
            ctx.stroke();
            ctx.setLineDash([]);
            drawLabel(x, y, `${fmtT(hoverStar.temperatureK)} · ${fmtL(hoverStar.luminositySolar)}`, '#ffffff');
        }
    }

    // Compact value formatters + a readable label (dark pill, light text) for on-canvas readouts.
    const fmtT = (t: number) => `${Math.round(t).toLocaleString()} K`;
    const fmtL = (l: number) => l >= 100 || l < 0.01 ? `${l.toExponential(0)} L☉` : l >= 1 ? `${l.toFixed(1)} L☉` : `${l.toPrecision(2)} L☉`;
    function drawLabel(x: number, y: number, text: string, color: string) {
        ctx.font = '11px sans-serif';
        const w = ctx.measureText(text).width;
        let lx = x + 12, ly = y - 12;
        if (lx + w + 6 > logicalWidth) lx = x - 12 - w;   // flip left near the right edge
        if (ly < 14) ly = y + 22;                          // drop below near the top edge
        ctx.fillStyle = 'rgba(0,0,0,0.7)';
        ctx.fillRect(lx - 3, ly - 11, w + 6, 15);
        ctx.fillStyle = color;
        ctx.fillText(text, lx, ly);
    }

    function handleMouseMove(e: MouseEvent) {
        const rect = canvas.getBoundingClientRect();
        hoverStar = getStarFromPixels(e.clientX - rect.left, e.clientY - rect.top);
        drawDiagram();
        dispatch('hover', hoverStar);
    }

    function handleCanvasClick(e: MouseEvent) {
        const rect = canvas.getBoundingClientRect();
        const clickedStar = getStarFromPixels(e.clientX - rect.left, e.clientY - rect.top);
        if (clickedStar && !clickedStar.category.includes('Invalid')) {
            dispatch('select', clickedStar);
            drawDiagram();
        }
    }

    let resizeObserver: ResizeObserver;

    function handleResize() {
        if (!canvas || !imageLoaded || !container) return;
        
        const dpr = window.devicePixelRatio || 1;
        const aspect = bgImage.width / bgImage.height;
        
        // Use the container (hr-container) width
        const availWidth = container.clientWidth;
        const availHeight = Math.min(window.innerHeight * 0.8, 850);
        
        if (availWidth < 100) return; // Ignore tiny/uninitialized widths

        let targetWidth = availWidth;
        let targetHeight = targetWidth / aspect;
        
        if (targetHeight > availHeight) {
            targetHeight = availHeight;
            targetWidth = targetHeight * aspect;
        }
        
        logicalWidth = targetWidth;
        logicalHeight = targetHeight;

        canvas.style.height = `${targetHeight}px`;
        canvas.style.width = `${targetWidth}px`;
        
        canvas.width = targetWidth * dpr;
        canvas.height = targetHeight * dpr;
        
        ctx.scale(dpr, dpr);
        drawDiagram();
    }

    onMount(() => {
        ctx = canvas.getContext('2d')!;
        bgImage = new Image();
        bgImage.src = '/images/ui/hr-diagram-eso.jpg';
        bgImage.onload = () => {
            imageLoaded = true;
            handleResize();
        };

        // ResizeObserver is much more reliable than window resize for layout shifts
        resizeObserver = new ResizeObserver(() => {
            handleResize();
        });
        resizeObserver.observe(container);
    });

    import { onDestroy } from 'svelte';
    onDestroy(() => {
        if (resizeObserver) resizeObserver.disconnect();
    });
</script>

<div class="hr-container" bind:this={container}>
    <div class="canvas-wrapper">
        <canvas 
            bind:this={canvas} 
            on:click={handleCanvasClick}
            on:mousemove={handleMouseMove}
            on:mouseleave={() => { hoverStar = null; drawDiagram(); dispatch('hover', null); }}
        ></canvas>
    </div>
</div>

<style>
    .hr-container { display: flex; flex-direction: column; align-items: center; gap: 1rem; width: 100%; height: 100%; }
    .canvas-wrapper { position: relative; background: #000; border: 1px solid #4a5568; line-height: 0; box-shadow: 0 0 30px rgba(0,0,0,0.5); display: flex; justify-content: center; width: 100%; }
    canvas { cursor: crosshair; display: block; }
</style>
