<div class="crt-overlay">
  <div class="scanlines"></div>
  <div class="vignette"></div>
  <div class="noise"></div>
</div>

<style>
  .crt-overlay {
    position: fixed;
    top: 0;
    left: 0;
    width: 100vw;
    height: 100vh;
    pointer-events: none;
    z-index: 9000;
    mix-blend-mode: overlay; /* Or hard-light? */
  }

  /* Scanlines */
  .scanlines {
    position: absolute;
    top: 0; left: 0; right: 0; bottom: 0;
    background: linear-gradient(
      to bottom,
      rgba(255,255,255,0) 75%,
      rgba(0,0,0,0.6) 100%
    );
    background-size: 100% 3px; /* Slightly larger for visibility */
    animation: scroll 15s linear infinite; 
  }

  /* Vignette / Glow */
  .vignette {
    position: absolute;
    top: 0; left: 0; right: 0; bottom: 0;
    background: radial-gradient(
      circle,
      rgba(0, 0, 0, 0) 60%,
      rgba(0, 0, 0, 0.4) 90%,
      rgba(0, 0, 0, 0.8) 100%
    );
    box-shadow: inset 0 0 150px rgba(0,0,0,0.7);
  }

  @keyframes scroll {
    0% { background-position: 0 0; }
    100% { background-position: 0 100%; }
  }
  
  /* Use global CSS on the body/canvas container to apply the GREEN tint and BLUR */
  /* This component just provides the texture overlays */
</style>
