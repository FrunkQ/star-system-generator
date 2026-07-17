// Night Vision — image-intensifier scope look. Luminance is mapped to
// monochrome green, then layered with horizontal scanlines, animated grain,
// and a heavy edge vignette to sell the "through a scope" feel. Optional
// scope-overlay toggle adds the hard circular cutout + crosshair reticle
// for the full FPS-scope vibe (vignette alone reads as "I'm wearing NV
// goggles"; scope on top reads as "I'm looking through a sniper scope").

uniform sampler2D tDiffuse;
uniform vec2      resolution;
uniform float     time;
uniform float     uGreenStrength;
uniform float     uScanlines;
uniform float     uGrain;
uniform float     uVignetteAmt;
uniform float     uScopeOverlay;
varying vec2      vUv;

float hash21(vec2 p) {
  p = fract(p * vec2(123.34, 456.21));
  p += dot(p, p + 78.233);
  return fract(p.x * p.y);
}

void main() {
  vec4 color = texture2D(tDiffuse, vUv);

  // Luma → green channel only. Boosting low-end so detail in shadows pops
  // (intensifier behaviour — gain is highest in the dark).
  float luma = dot(color.rgb, vec3(0.299, 0.587, 0.114));
  luma = pow(luma, 0.7);
  vec3 nv = vec3(0.08, luma * 1.15 + 0.10, 0.05);
  color.rgb = mix(color.rgb, nv, uGreenStrength);

  // Horizontal scanlines.
  if (uScanlines > 0.001) {
    float lineY = vUv.y * resolution.y;
    float band  = sin(lineY * 3.14159) * 0.5 + 0.5;
    color.rgb *= 1.0 - (1.0 - band) * 0.40 * uScanlines;
  }

  // Animated white-noise grain (time-shifted hash).
  if (uGrain > 0.001) {
    float g = hash21(vUv * resolution + time * 60.0) - 0.5;
    color.rgb += vec3(g * 0.18 * uGrain);
  }

  // Aspect-corrected coords used by both the soft vignette and the optional
  // hard scope overlay below.
  vec2 sd = (vUv - 0.5) * vec2(resolution.x / resolution.y, 1.0);
  float dist = length(sd);

  // Soft vignette — pushed harder again. Start 0.12 (very near centre), fade
  // complete by 0.55, multiplier 1.0 — true-black corners at vignette = 1.
  float vig = smoothstep(0.12, 0.55, dist);
  color.rgb *= 1.0 - vig * uVignetteAmt;

  // Scope overlay — hard circular cutout + crosshair reticle. Toggled
  // separately from the soft vignette so the GM can have one, the other,
  // or both.
  if (uScopeOverlay > 0.5) {
    // Hard scope cutout: very dark outside the viewable circle.
    float r = 0.42;
    float ringW = 0.022;
    float outside = smoothstep(r - ringW * 0.5, r, dist);
    color.rgb *= 1.0 - outside * 0.97;

    // Sharp dark ring at the scope rim.
    float rim = smoothstep(r + 0.004, r, dist) * smoothstep(r - ringW * 1.6, r - ringW, dist);
    color.rgb = mix(color.rgb, vec3(0.02, 0.06, 0.02), rim);

    // Crosshair reticle inside the scope — thin lines that don't run all the
    // way to the rim so they read like a proper reticle, not a cross-cut.
    float reticleR = r * 0.85;
    float lineWidth = 0.0015;
    float gap = 0.020; // small inner gap around the centre
    float hLine = smoothstep(lineWidth, 0.0, abs(sd.y))
                * smoothstep(reticleR, reticleR - 0.04, abs(sd.x))
                * smoothstep(gap - 0.004, gap, abs(sd.x));
    float vLine = smoothstep(lineWidth, 0.0, abs(sd.x))
                * smoothstep(reticleR, reticleR - 0.04, abs(sd.y))
                * smoothstep(gap - 0.004, gap, abs(sd.y));
    vec3 reticleCol = vec3(0.10, 0.55, 0.10);
    color.rgb = mix(color.rgb, reticleCol, clamp(hLine + vLine, 0.0, 1.0));

    // Small centre dot.
    float centreDot = smoothstep(0.005, 0.001, dist);
    color.rgb = mix(color.rgb, reticleCol, centreDot * 0.9);
  }

  gl_FragColor = color;
}
