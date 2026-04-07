<script lang="ts">
    import { createEventDispatcher, onMount } from 'svelte';
    import { deriveStarFromHR, type StarSeed } from '$lib/physics/stellar-evolution';

    const dispatch = createEventDispatcher();
    
    let canvas: HTMLCanvasElement;
    let ctx: CanvasRenderingContext2D;
    
    export let selectedStars: StarSeed[] = [];
    const MAX_STARS = 50;

    const MAX_TEMP = 50000;
    const MIN_TEMP = 2000;
    const MIN_LUM = 0.00001;
    const MAX_LUM = 1000000; // Calibrated grid top is 10^6

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
        // Calculate relativeY where 0 is 10^6 and 1 is 10^-5
        const relativeY = (logMax - logCurrent) / (logMax - logMin);
        return (PLOT_BOX.top + relativeY * (PLOT_BOX.bottom - PLOT_BOX.top)) * height;
    }

    function getStarFromPixels(x: number, y: number): StarSeed | null {
        const temp = xToTemp(x, canvas.width);
        
        const relativeY = (y / canvas.height - PLOT_BOX.top) / (PLOT_BOX.bottom - PLOT_BOX.top);
        
        /**
         * Headroom Logic: 
         * Allow selection up to 2.0e+6 (approx -0.028 relative units above the top line)
         */
        if (temp === -1 || relativeY < -0.028 || relativeY > 1) return null;

        const logMinL = Math.log10(MIN_LUM);
        const logMaxL = Math.log10(MAX_LUM);
        // Map relativeY back to logL
        const logL = logMaxL - relativeY * (logMaxL - logMinL);
        const lum = Math.pow(10, logL);

        return deriveStarFromHR(temp, lum);
    }

    let bgImage: HTMLImageElement;
    let imageLoaded = false;
    let hoverStar: StarSeed | null = null;

    function drawDiagram() {
        if (!ctx || !canvas || !imageLoaded) return;
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(bgImage, 0, 0, canvas.width, canvas.height);

        selectedStars.forEach((star, index) => {
            const x = tempToX(star.temperatureK, canvas.width);
            const y = lumToY(star.luminositySolar, canvas.height);
            ctx.strokeStyle = 'white';
            ctx.lineWidth = 2;
            ctx.beginPath(); ctx.arc(x, y, 8, 0, Math.PI * 2); ctx.stroke();
            ctx.fillStyle = 'white';
            ctx.font = 'bold 12px sans-serif';
            ctx.fillText(`${index + 1}`, x + 10, y + 5);
        });

        if (hoverStar) {
            const x = tempToX(hoverStar.temperatureK, canvas.width);
            const y = lumToY(hoverStar.luminositySolar, canvas.height);
            ctx.strokeStyle = 'rgba(255, 255, 255, 0.4)';
            ctx.setLineDash([5, 5]);
            ctx.beginPath();
            ctx.moveTo(x, 0); ctx.lineTo(x, canvas.height);
            ctx.moveTo(0, y); ctx.lineTo(canvas.width, y);
            ctx.stroke();
            ctx.setLineDash([]);
        }
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

    onMount(() => {
        ctx = canvas.getContext('2d')!;
        bgImage = new Image();
        bgImage.src = '/images/ui/hr-diagram-eso.jpg';
        bgImage.onload = () => {
            imageLoaded = true;
            canvas.height = 550;
            canvas.width = canvas.height * (bgImage.width / bgImage.height);
            drawDiagram();
        };
    });
</script>

<div class="hr-container">
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
    .hr-container { display: flex; flex-direction: column; align-items: center; gap: 1rem; }
    .canvas-wrapper { position: relative; background: #000; border: 1px solid #4a5568; line-height: 0; box-shadow: 0 0 30px rgba(0,0,0,0.5); }
    canvas { cursor: crosshair; }
</style>
