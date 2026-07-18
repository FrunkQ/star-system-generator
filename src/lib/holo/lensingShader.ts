// src/lib/holo/lensingShader.ts
// A LIGHTWEIGHT, stylised gravitational-lensing post-process for black holes (the banked §A13 plan —
// NOT full-GR ray-marching). One screen-space ShaderPass in the holo's EffectComposer chain: for each
// black hole on screen (centre UV + Einstein radius, fed per frame) it bends the sampled background
// toward the hole (deflection ∝ rE²/impact-parameter), wrapping stars into the tell-tale Einstein ring,
// and paints a black event-horizon disc. Cheap: a fixed 4-iteration loop, no branching per pixel beyond
// the count. Browser/mobile-friendly. Toggle-able (setLensing) and off by default unless a preset asks.
import * as THREE from 'three';

export const MAX_LENSES = 4;

export function makeLensingShader() {
	return {
		uniforms: {
			tDiffuse: { value: null as THREE.Texture | null },
			uCount: { value: 0 },
			// xy = black-hole centre in [0,1] screen UV; z = Einstein radius (aspect-corrected UV units).
			uBH: { value: Array.from({ length: MAX_LENSES }, () => new THREE.Vector3()) },
			uAspect: { value: 1 }
		},
		vertexShader: /* glsl */ `
			varying vec2 vUv;
			void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }
		`,
		fragmentShader: /* glsl */ `
			uniform sampler2D tDiffuse;
			uniform int uCount;
			uniform vec3 uBH[${MAX_LENSES}];
			uniform float uAspect;
			varying vec2 vUv;
			void main() {
				vec2 asp = vec2(uAspect, 1.0);
				vec2 sampleUv = vUv;
				float horizon = 0.0;
				float ring = 0.0;
				for (int i = 0; i < ${MAX_LENSES}; i++) {
					if (i >= uCount) break;
					vec2 c = uBH[i].xy;
					float rE = uBH[i].z;
					if (rE <= 0.0) continue;
					vec2 d = (vUv - c) * asp;          // fragment relative to the hole, aspect-corrected
					float b = length(d);
					vec2 dir = d / max(b, 1e-4);
					// Thin-lens deflection ∝ rE²/b (the lens equation source-radius is b - rE²/b). At b = rE
					// the sample reaches straight BEHIND the hole, so whatever is behind (the disc's far
					// side, or the stars) is wrapped into a full ring — arcs OVER the top AND UNDER the
					// bottom of the shadow, and a bright Einstein halo for a bare hole. Capped near the
					// centre so it stays finite.
					float defl = min(rE * rE / max(b, 1e-4), rE * 2.2);
					sampleUv -= (dir * defl) / asp;
					// The SHADOW is large — light from within the photon sphere is captured (black), and
					// everything behind is thrown OUT to the bright ring at its edge (not leaking through
					// the centre). Sits just inside the Einstein radius rE.
					horizon = max(horizon, 1.0 - smoothstep(rE * 0.72, rE * 0.86, b));
					ring = max(ring, exp(-pow((b - rE * 0.90) / (rE * 0.075), 2.0))); // slim, bright photon ring at the shadow edge
				}
				vec4 col = texture2D(tDiffuse, sampleUv);
				// Photon ring at the shadow edge: brighten whatever lensed light lands there (disc/stars)
				// AND add a faint self-lit halo, so even a bare (quiescent) hole shows the tell-tale ring
				// of refracted starlight rather than nothing.
				col.rgb += ring * (col.rgb * 0.8 + vec3(1.0, 1.0, 1.0)); // pure-white halo — the averaged lensed starlight
				col.rgb = mix(col.rgb, vec3(0.0), horizon);      // swallow the horizon (pure-black centre)
				gl_FragColor = col;
			}
		`
	};
}
