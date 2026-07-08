// EffectComposer passthrough filter
// tDiffuse = composited scene render target (map + fog layers)
uniform sampler2D tDiffuse;
uniform float uInvertDisplay;

varying vec2 vUv;

void main() {
    vec4 color = texture2D(tDiffuse, vUv);
    if (uInvertDisplay > 0.5) {
        color.rgb = 1.0 - color.rgb;
    }
    gl_FragColor = vec4(color.rgb, 1.0);
}
