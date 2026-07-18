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
					// Deflection toward the hole ∝ rE²/b, capped so a sample never crosses the centre.
					float defl = min(rE * rE / max(b, 1e-4), b * 0.88);
					sampleUv -= (dir * defl) / asp;
					horizon = max(horizon, 1.0 - smoothstep(rE * 0.20, rE * 0.30, b)); // black event horizon (kept small so the accretion disc still shows around it)
					ring = max(ring, exp(-pow((b - rE) / (rE * 0.16), 2.0)));          // brighten the Einstein ring
				}
				vec4 col = texture2D(tDiffuse, sampleUv);
				col.rgb += col.rgb * ring * 0.6;                 // photon-ring glint from the lensed light
				col.rgb = mix(col.rgb, vec3(0.0), horizon);      // swallow the horizon
				gl_FragColor = col;
			}
		`
	};
}
