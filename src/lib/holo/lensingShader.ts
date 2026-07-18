// src/lib/holo/lensingShader.ts
// A LIGHTWEIGHT, stylised gravitational-lensing post-process for black holes (the banked §A13 plan —
// NOT full-GR ray-marching). One screen-space ShaderPass in the holo's EffectComposer chain: for each
// black hole on screen (centre UV + Einstein radius, fed per frame) it bends the sampled background
// toward the hole (thin-lens deflection ∝ rE²/impact-param), wrapping whatever is BEHIND (stars, the
// disc's far side) into a bright ring — arcs over AND under a genuinely-black shadow — and a slim white
// photon halo. Cheap: a fixed 4-iteration loop, one pass. Browser/mobile-friendly, toggle-able.
//
// DEPTH-AWARE: light from FOREGROUND geometry (the accretion disc's near side, in front of the hole)
// reaches us straight, un-lensed — so where the depth buffer shows geometry closer than the hole, the
// pixel passes through unbent. That gives the disc's near side crossing IN FRONT of the shadow, while
// empty background pixels still lens the far side over/under. `uBH.w` carries each hole's depth-buffer
// value; `tDepth` is the scene depth. When no depth texture is supplied (uHasDepth 0) it degrades to the
// plain lens (everything bent).
import * as THREE from 'three';

export const MAX_LENSES = 4;

export function makeLensingShader() {
	return {
		uniforms: {
			tDiffuse: { value: null as THREE.Texture | null },
			tDepth: { value: null as THREE.Texture | null },
			uHasDepth: { value: 0 },
			uCount: { value: 0 },
			// xy = black-hole centre in [0,1] screen UV; z = Einstein radius (aspect-corrected UV units);
			// w = the hole's depth-buffer value [0,1] (for the foreground test).
			uBH: { value: Array.from({ length: MAX_LENSES }, () => new THREE.Vector4()) },
			uAspect: { value: 1 }
		},
		vertexShader: /* glsl */ `
			varying vec2 vUv;
			void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }
		`,
		fragmentShader: /* glsl */ `
			uniform sampler2D tDiffuse;
			uniform sampler2D tDepth;
			uniform float uHasDepth;
			uniform int uCount;
			uniform vec4 uBH[${MAX_LENSES}];
			uniform float uAspect;
			varying vec2 vUv;
			void main() {
				vec2 asp = vec2(uAspect, 1.0);
				float sceneDepth = uHasDepth > 0.5 ? texture2D(tDepth, vUv).x : 1.0;
				vec2 sampleUv = vUv;
				float horizon = 0.0;
				float ring = 0.0;
				bool foreground = false;
				for (int i = 0; i < ${MAX_LENSES}; i++) {
					if (i >= uCount) break;
					vec2 c = uBH[i].xy;
					float rE = uBH[i].z;
					if (rE <= 0.0) continue;
					vec2 d = (vUv - c) * asp;          // fragment relative to the hole, aspect-corrected
					float b = length(d);
					vec2 dir = d / max(b, 1e-4);
					// FOREGROUND: geometry here is closer than the hole (the disc's near side) → its light
					// reaches us straight, so leave this pixel un-lensed and un-shadowed.
					if (uHasDepth > 0.5 && b < rE * 1.6 && sceneDepth < uBH[i].w - 0.00015) foreground = true;
					// Thin-lens deflection ∝ rE²/b. At b = rE the sample reaches straight BEHIND the hole,
					// so whatever is behind (the disc's far side, or stars) wraps into a full ring.
					float defl = min(rE * rE / max(b, 1e-4), rE * 2.2);
					sampleUv -= (dir * defl) / asp;
					// Large shadow: light within the photon sphere is captured (black); everything behind is
					// thrown OUT to the ring at its edge, not leaking through the centre.
					horizon = max(horizon, 1.0 - smoothstep(rE * 0.72, rE * 0.86, b));
					ring = max(ring, exp(-pow((b - rE * 0.90) / (rE * 0.075), 2.0)));
				}
				if (foreground) { gl_FragColor = texture2D(tDiffuse, vUv); return; } // near disc, straight to us
				vec4 col = texture2D(tDiffuse, sampleUv);
				col.rgb += ring * (col.rgb * 0.8 + vec3(1.0, 1.0, 1.0)); // pure-white halo — averaged lensed starlight
				col.rgb = mix(col.rgb, vec3(0.0), horizon);              // swallow the horizon (pure-black centre)
				gl_FragColor = col;
			}
		`
	};
}
