// src/lib/holo/lensingShader.ts
// A LIGHTWEIGHT, stylised gravitational-lensing post-process for black holes (the banked §A13 plan —
// NOT full-GR ray-marching). One screen-space ShaderPass in the holo's EffectComposer chain: for each
// black hole on screen (centre UV + Einstein radius, fed per frame) it bends the sampled background
// toward the hole (thin-lens deflection ∝ rE²/impact-param), wrapping whatever is BEHIND (stars, the
// disc's far side) into arcs OVER and UNDER a genuinely-black shadow, plus a slim pure-white photon
// halo. Cheap: a fixed 4-iteration loop, ≤2 texture fetches, one fullscreen pass. Mobile-friendly.
//
// THE FRONT-DISC PROBLEM, SOLVED ANALYTICALLY (no depth buffer): a post-process is pure 2D — it can't
// know that light from the accretion disc's NEAR side (in front of the hole) travelled straight to the
// camera and must not be bent or swallowed by the shadow. Because WE auto-generate the disc, we know
// exactly where it is: its projected screen footprint is an ellipse band around the hole. Each lens is
// fed that ellipse (major-axis direction + semi-axes via uDisc, inner/outer ratio via uBH.w) and the
// shader simply EXEMPTS pixels inside the band — they pass through un-lensed, so the near side crosses
// in front of the shadow. Pixels outside the band still lens normally, and the over/under arcs still
// form because they SAMPLE from the band's location; they don't care that the band itself is shown.
// (Nearly edge-on, the near and far halves project onto the same band, so one exemption serves both.)
// Trade-off: background stars inside the thin band also show unbent — invisible under the glowing disc.
import * as THREE from 'three';

export const MAX_LENSES = 4;

export function makeLensingShader() {
	return {
		uniforms: {
			tDiffuse: { value: null as THREE.Texture | null },
			uCount: { value: 0 },
			// xy = black-hole centre in [0,1] screen UV; z = Einstein/ring radius (aspect-corrected UV
			// units, i.e. pixels/height); w = the accretion disc's inner/outer radius ratio k (0 = no disc).
			uBH: { value: Array.from({ length: MAX_LENSES }, () => new THREE.Vector4()) },
			// Projected accretion-disc ellipse, aspect-corrected: xy = major-axis direction,
			// z = semi-major extent A, w = semi-minor extent B. A = 0 → no disc on this lens.
			uDisc: { value: Array.from({ length: MAX_LENSES }, () => new THREE.Vector4()) },
			uAspect: { value: 1 }
		},
		vertexShader: /* glsl */ `
			varying vec2 vUv;
			void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }
		`,
		fragmentShader: /* glsl */ `
			uniform sampler2D tDiffuse;
			uniform int uCount;
			uniform vec4 uBH[${MAX_LENSES}];
			uniform vec4 uDisc[${MAX_LENSES}];
			uniform float uAspect;
			varying vec2 vUv;
			void main() {
				vec2 asp = vec2(uAspect, 1.0);
				vec2 sampleUv = vUv;
				float horizon = 0.0;
				float ring = 0.0;
				float band = 0.0;
				for (int i = 0; i < ${MAX_LENSES}; i++) {
					if (i >= uCount) break;
					vec2 c = uBH[i].xy;
					float rE = uBH[i].z;
					if (rE <= 0.0) continue;
					vec2 d = (vUv - c) * asp;          // fragment relative to the hole, aspect-corrected
					float b = length(d);
					vec2 dir = d / max(b, 1e-4);
					// Thin-lens deflection ∝ rE²/b. At b = rE the sample reaches straight BEHIND the hole,
					// so whatever is behind (the disc's far side, or stars) wraps into a full ring.
					float defl = min(rE * rE / max(b, 1e-4), rE * 2.2);
					sampleUv -= (dir * defl) / asp;
					// Large shadow: light within the photon sphere is captured (black); everything behind is
					// thrown OUT to the ring at its edge, not leaking through the centre.
					horizon = max(horizon, 1.0 - smoothstep(rE * 0.72, rE * 0.86, b));
					ring = max(ring, exp(-pow((b - rE * 0.90) / (rE * 0.075), 2.0)));
					// Accretion-disc band exemption (see header): inside the disc's projected ellipse band,
					// light reaches us straight — pass it through. Soft edges avoid seams.
					float A = uDisc[i].z;
					if (A > 1e-5) {
						vec2 ax = uDisc[i].xy;
						float u = dot(d, ax);
						float v = dot(d, vec2(-ax.y, ax.x));
						float B = uDisc[i].w;
						float e = (u * u) / (A * A) + (v * v) / max(B * B, 1e-10);
						float k2 = uBH[i].w * uBH[i].w;
						band = max(band, (1.0 - smoothstep(1.0, 1.3, e)) * smoothstep(k2 * 0.75, k2, e));
					}
				}
				vec4 lensed = texture2D(tDiffuse, sampleUv);
				lensed.rgb += ring * (lensed.rgb * 0.8 + vec3(1.0)); // pure-white halo — averaged lensed starlight
				lensed.rgb = mix(lensed.rgb, vec3(0.0), horizon);    // swallow the horizon (pure-black centre)
				vec4 straight = texture2D(tDiffuse, vUv);            // un-lensed: the disc's near side
				gl_FragColor = mix(lensed, straight, band);
			}
		`
	};
}

// --- CPU-side feed helper (shared by the live holo + the 3D gallery) ------------------------------
// Computes a disc's projected screen ellipse for uDisc: project the disc plane's two basis vectors
// (scaled to the outer radius) from the hole's position, then take the principal axes of the resulting
// 2×2 map via the eigenvalues of M·Mᵀ. All in the shader's aspect-corrected UV space.
const _e1 = new THREE.Vector3();
const _e2 = new THREE.Vector3();
const _pt = new THREE.Vector3();
export function feedDiscEllipse(
	out: THREE.Vector4,
	discObj: THREE.Object3D, // its local XZ plane holds the disc (ring pivot / gallery points)
	bhWorld: THREE.Vector3,
	outer: number, // outer disc radius in scene units
	camera: THREE.Camera,
	cNdcX: number, // the hole centre's projected NDC x/y
	cNdcY: number,
	aspect: number
): void {
	discObj.updateMatrixWorld();
	_e1.setFromMatrixColumn(discObj.matrixWorld, 0).normalize();
	_e2.setFromMatrixColumn(discObj.matrixWorld, 2).normalize();
	_pt.copy(bhWorld).addScaledVector(_e1, outer).project(camera);
	const px = (_pt.x - cNdcX) * 0.5 * aspect, py = (_pt.y - cNdcY) * 0.5;
	_pt.copy(bhWorld).addScaledVector(_e2, outer).project(camera);
	const qx = (_pt.x - cNdcX) * 0.5 * aspect, qy = (_pt.y - cNdcY) * 0.5;
	const m00 = px * px + qx * qx, m01 = px * py + qx * qy, m11 = py * py + qy * qy;
	const tr = m00 + m11;
	const root = Math.sqrt(Math.max(0, tr * tr - 4 * (m00 * m11 - m01 * m01)));
	const l1 = (tr + root) / 2, l2 = (tr - root) / 2;
	let dx: number, dy: number;
	if (Math.abs(m01) > 1e-12) { dx = l1 - m11; dy = m01; }
	else { dx = m00 >= m11 ? 1 : 0; dy = m00 >= m11 ? 0 : 1; }
	const len = Math.hypot(dx, dy) || 1;
	out.set(dx / len, dy / len, Math.sqrt(Math.max(l1, 0)), Math.sqrt(Math.max(l2, 1e-10)));
}
