<script lang="ts">
  // 3D reference gallery — the holo counterpart of /discgallery. Renders every example body in one
  // grid so all the 3D renderings (textures, glows, volcanic vents, cryo plumes, star types, black-hole
  // accretion discs) can be reviewed at a glance. Drag to orbit, scroll to zoom, right-drag to pan.
  import { onMount } from 'svelte';

  let canvas: HTMLCanvasElement;

  // The real solar system, fetched and run through the same processor and rule pack the app uses,
  // appended as a final row. Not hand-authored: if the data or the physics changes, this row moves
  // with it — the 3D counterpart of the same reality check on /discgallery.
  async function liveSolarSystemRow(): Promise<{ title: string; bodies: any[] }[]> {
    try {
      const { fetchAndLoadRulePack } = await import('$lib/rulepack-loader');
      const { systemProcessor } = await import('$lib/core/SystemProcessor');
      const [pack, res] = await Promise.all([
        fetchAndLoadRulePack('/rulepacks/starter-sf/main.json'),
        fetch('/examples/Sol_2030-System.json')
      ]);
      if (!res.ok) return [];
      const raw = await res.json();
      const processed = systemProcessor.process(JSON.parse(JSON.stringify(raw.system ?? raw)), pack);
      const wanted = ['Venus', 'Earth', 'Mars', 'Jupiter', 'Saturn', 'Titan', 'Uranus', 'Neptune', 'Triton', 'Pluto'];
      const bodies = wanted.map((n) => processed.nodes.find((x: any) => x.name === n)).filter(Boolean);
      // …and the giant lab beneath it: synthetic giants defined by nothing but composition, pressure
      // and temperature, with every deck and every colour derived. Sol is the reality check; the lab
      // is where you sweep one variable and watch the model answer.
      const { buildGiantLab } = await import('$lib/catalogue/galleryExamples');
      const lab = buildGiantLab(pack).map((r) => ({ title: r.title, bodies: r.bodies as any[] }));
      const sol = bodies.length ? [{ title: 'Our solar system — live from the data', bodies }] : [];
      return [...sol, ...lab];
    } catch {
      return [];   // the gallery is still worth showing without it
    }
  }

  onMount(() => {
    let handle: { dispose(): void } | null = null;
    let cancelled = false;
    (async () => {
      const { createGalleryScene } = await import('$lib/holo/galleryScene');
      const extraRows = await liveSolarSystemRow();
      if (cancelled || !canvas) return;
      handle = createGalleryScene(canvas, extraRows);
    })();
    return () => { cancelled = true; handle?.dispose(); };
  });
</script>

<div class="page">
  <header>
    <h1>Rendered worlds — 3D reference gallery</h1>
    <p>Every example body in the holo engine: surfaces, glows, volcanic vents, cryovolcanic plumes, star
      types and black-hole accretion discs. Drag to orbit · scroll to zoom · right-drag to pan.
      <a href="/discgallery">2D disc gallery →</a></p>
  </header>
  <canvas bind:this={canvas}></canvas>
</div>

<style>
  .page { position: fixed; inset: 0; display: flex; flex-direction: column; background: #05070c; }
  header { padding: 0.6rem 1rem; color: #cdd6e2; border-bottom: 1px solid #1b2230; z-index: 2; }
  header h1 { margin: 0; font-size: 1.05rem; }
  header p { margin: 0.25rem 0 0; font-size: 0.8rem; color: #8fa0b6; }
  header a { color: #6fb0ff; }
  canvas { flex: 1; width: 100%; height: 100%; display: block; touch-action: none; }
</style>
