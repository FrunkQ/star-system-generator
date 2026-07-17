// Thermal — map luma onto a heat-vision palette (black → blue → green →
// yellow → red → white). The result is "what's hot is bright", regardless
// of the original map's actual colours. Adds optional scanlines + slow
// pulse so it reads as a live thermal feed rather than a still recolouring.

uniform sampler2D tDiffuse;
uniform vec2      resolution;
uniform float     time;
uniform float     uPalette;
uniform float     uContrast;
uniform float     uScanlines;
uniform float     uPulse;
varying vec2      vUv;

// Five-stop heat palette. t in 0..1 → vec3.
vec3 heatColor(float t) {
  t = clamp(t, 0.0, 1.0);
  vec3 c1 = vec3(0.00, 0.00, 0.10); // black-blue (cold)
  vec3 c2 = vec3(0.10, 0.10, 0.85); // deep blue
  vec3 c3 = vec3(0.10, 0.85, 0.30); // green
  vec3 c4 = vec3(1.00, 0.80, 0.05); // yellow
  vec3 c5 = vec3(1.00, 0.20, 0.05); // red
  vec3 c6 = vec3(1.00, 1.00, 0.95); // white-hot

  if      (t < 0.20) return mix(c1, c2, t * 5.0);
  else if (t < 0.40) return mix(c2, c3, (t - 0.20) * 5.0);
  else if (t < 0.60) return mix(c3, c4, (t - 0.40) * 5.0);
  else if (t < 0.80) return mix(c4, c5, (t - 0.60) * 5.0);
  else               return mix(c5, c6, (t - 0.80) * 5.0);
}

void main() {
  vec4 color = texture2D(tDiffuse, vUv);

  // Luma drives the palette index. Contrast slider stretches around the
  // midpoint so the GM can crush the response for a sharper hot/cold split.
  float luma = dot(color.rgb, vec3(0.299, 0.587, 0.114));
  float t = (luma - 0.5) * uContrast + 0.5;
  vec3 thermal = heatColor(t);
  color.rgb = mix(color.rgb, thermal, uPalette);

  // Slow brightness pulse — sells the "live feed" feel.
  if (uPulse > 0.001) {
    float p = sin(time * 1.7) * 0.5 + 0.5;
    color.rgb *= 1.0 + (p - 0.5) * 0.10 * uPulse;
  }

  // Scanlines — same band trick as Night Vision but lighter.
  if (uScanlines > 0.001) {
    float lineY = vUv.y * resolution.y;
    float band  = sin(lineY * 3.14159) * 0.5 + 0.5;
    color.rgb *= 1.0 - (1.0 - band) * 0.25 * uScanlines;
  }

  gl_FragColor = color;
}
