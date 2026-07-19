// src/lib/holo/bodyFeatures.ts
// Shared 3D body-surface FEATURE builders (emissive sprites + their textures), used by BOTH the live
// system holo (holo/scene.ts) and the 3D reference gallery (holo/galleryScene.ts). Each builder is pure
// THREE construction given a radius + the shared appearance model's params, so the two surfaces render
// identically. Textures are passed IN (created once by the caller) so a scene shares a single instance.
import * as THREE from 'three';

// An additive sprite whose opacity is animated (flicker/glisten) each frame from a base + seed.
export interface EmissiveVisual {
	mat: THREE.SpriteMaterial;
	base: number;
	seed: number;
}

// --- Textures -------------------------------------------------------------------------------------

// A filled hot spot (bright opaque core → transparent), for glowing volcanic vents.
export function makeHotspotTexture(): THREE.Texture {
	const size = 64;
	const c = document.createElement('canvas');
	c.width = c.height = size;
	const ctx = c.getContext('2d')!;
	const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
	g.addColorStop(0, 'rgba(255,255,255,1)');
	g.addColorStop(0.3, 'rgba(255,240,210,0.85)');
	g.addColorStop(0.7, 'rgba(255,170,80,0.25)');
	g.addColorStop(1, 'rgba(255,140,60,0)');
	ctx.fillStyle = g;
	ctx.fillRect(0, 0, size, size);
	const tex = new THREE.Texture(c);
	tex.needsUpdate = true;
	return tex;
}

// A soft WHITE puff (fully tintable by the sprite colour), for icy cryovolcanic plume spray.
export function makePlumeTexture(): THREE.Texture {
	const size = 64;
	const c = document.createElement('canvas');
	c.width = c.height = size;
	const ctx = c.getContext('2d')!;
	const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
	g.addColorStop(0, 'rgba(255,255,255,0.9)');
	g.addColorStop(0.5, 'rgba(255,255,255,0.32)');
	g.addColorStop(1, 'rgba(255,255,255,0)');
	ctx.fillStyle = g;
	ctx.fillRect(0, 0, size, size);
	const tex = new THREE.Texture(c);
	tex.needsUpdate = true;
	return tex;
}

// A corona HALO: transparent through the centre (so the body shows), a bright ring just outside it,
// fading to nothing — additive-blended around a star / self-luminous body / feeding black hole.
export function makeGlowTexture(): THREE.Texture {
	const size = 128;
	const c = document.createElement('canvas');
	c.width = c.height = size;
	const ctx = c.getContext('2d')!;
	const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
	g.addColorStop(0, 'rgba(255,255,255,0)');
	g.addColorStop(0.32, 'rgba(255,255,255,0.05)');
	g.addColorStop(0.5, 'rgba(255,255,255,0.55)');
	g.addColorStop(0.72, 'rgba(255,255,255,0.18)');
	g.addColorStop(1, 'rgba(255,255,255,0)');
	ctx.fillStyle = g;
	ctx.fillRect(0, 0, size, size);
	const tex = new THREE.Texture(c);
	tex.needsUpdate = true;
	return tex;
}

// --- Feature builders -----------------------------------------------------------------------------

/** Volcanic vents: additive hot-spot sprites at seeded, equator-biased surface points. Lava world =
 *  many white-hot vents; discrete volcanism/hotspots = a few orange ones. Parented to the sphere. */
export function buildMagmaVents(
	radius: number,
	spec: { vents: number; lava: boolean },
	id: string,
	hotspotTexture: THREE.Texture
): { group: THREE.Group; visuals: EmissiveVisual[] } {
	const group = new THREE.Group();
	const visuals: EmissiveVisual[] = [];
	let s = 11; for (let k = 0; k < id.length; k++) s = (s * 31 + id.charCodeAt(k)) & 0xffffff;
	const rnd = () => { s = (s * 1103515245 + 12345) & 0x7fffffff; return s / 0x7fffffff; };
	const core = spec.lava ? 0xfff0c0 : 0xff8a3c; // molten world = white-hot; discrete vents = orange
	const pos = new THREE.Vector3();
	for (let i = 0; i < spec.vents; i++) {
		const lat = rnd() * 2 - 1; const latEq = lat * lat * lat * 0.6; // equator-biased latitude fraction
		const phi = latEq * Math.PI * 0.5;                              // → latitude angle
		const lon = rnd() * Math.PI * 2;
		const cphi = Math.cos(phi);
		pos.set(Math.cos(lon) * cphi, Math.sin(phi), Math.sin(lon) * cphi).multiplyScalar(radius * 1.02);
		const base = spec.lava ? 0.95 : 0.8;
		const mat = new THREE.SpriteMaterial({ map: hotspotTexture, color: core, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, opacity: base });
		const sprite = new THREE.Sprite(mat);
		sprite.position.copy(pos);
		const sz = radius * (spec.lava ? 0.6 : 0.42) * (0.7 + rnd() * 0.6);
		sprite.scale.set(sz, sz, 1);
		group.add(sprite);
		visuals.push({ mat, base, seed: rnd() });
	}
	return { group, visuals };
}

/** Cryovolcanic plumes: a few icy jets from the southern polar region, each a chain of additive puffs
 *  marching OUTWARD (widening + fading) so it reads as spray into space. reachRadii (from the model,
 *  driven by low gravity) sets throw distance in body radii. Parented to the sphere. */
export function buildCryoPlumes(
	radius: number,
	spec: { jets: number; reachRadii: number },
	id: string,
	plumeTexture: THREE.Texture
): { group: THREE.Group; visuals: EmissiveVisual[] } {
	const group = new THREE.Group();
	const visuals: EmissiveVisual[] = [];
	let s = 61; for (let k = 0; k < id.length; k++) s = (s * 31 + id.charCodeAt(k)) & 0xffffff;
	const rnd = () => { s = (s * 1103515245 + 12345) & 0x7fffffff; return s / 0x7fffffff; };
	const color = 0xdff2ff; // icy blue-white
	const reach = radius * spec.reachRadii;
	const N = 5; // puffs per jet
	const normal = new THREE.Vector3();
	for (let j = 0; j < spec.jets; j++) {
		const lat = -(0.45 + rnd() * 0.5) * Math.PI * 0.5; // south-biased (−40°..−85°), not dead-on the pole
		const lon = rnd() * Math.PI * 2;
		const cphi = Math.cos(lat);
		normal.set(Math.cos(lon) * cphi, Math.sin(lat), Math.sin(lon) * cphi).normalize();
		for (let i = 0; i < N; i++) {
			const f = i / (N - 1); // 0 (base) .. 1 (tip)
			const mat = new THREE.SpriteMaterial({ map: plumeTexture, color, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, opacity: 0.72 * (1 - f * 0.6) });
			const sprite = new THREE.Sprite(mat);
			sprite.position.copy(normal).multiplyScalar(radius + f * reach);
			const sz = radius * (0.18 + f * 0.55); // widens toward the tip (spray)
			sprite.scale.set(sz, sz, 1);
			group.add(sprite);
			visuals.push({ mat, base: mat.opacity, seed: rnd() });
		}
	}
	return { group, visuals };
}

/** A self-luminous body (brown dwarf / hot young sub-stellar world) glows with a dim, cool corona-like
 *  halo coloured by its emission temperature — a steady glow, not a blazing stellar corona. */
export function buildSelfLumGlow(radius: number, colorHex: string, glowTexture: THREE.Texture): THREE.Sprite {
	const mat = new THREE.SpriteMaterial({ map: glowTexture, color: new THREE.Color(colorHex), blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, opacity: 0.9 });
	const halo = new THREE.Sprite(mat);
	halo.scale.setScalar(radius * 3.0);
	return halo;
}

// ATMOSPHERE LIMB-GLOW — a translucent shell that lights up at the LIMB (grazing viewing angle, where
// the line of sight passes through the most air) and is clear over the disc centre, so it reads as a
// thin halo hugging the silhouette. A Fresnel term on a slightly-enlarged back-side sphere, additive-
// blended. `strength` (0..1, log-scaled from pressure) sets the halo brightness; the shell sits CLOSE
// to the surface so it reads as an atmosphere skin, not a big bubble.
export function buildAtmoGlow(radius: number, colorHex: string, strength: number): THREE.Mesh {
	const mat = new THREE.ShaderMaterial({
		uniforms: { uColor: { value: new THREE.Color(colorHex) }, uStrength: { value: strength } },
		vertexShader: `
			varying vec3 vN; varying vec3 vView;
			void main() {
				vec4 mv = modelViewMatrix * vec4(position, 1.0);
				vN = normalize(normalMatrix * normal);
				vView = normalize(-mv.xyz);
				gl_Position = projectionMatrix * mv;
			}`,
		fragmentShader: `
			uniform vec3 uColor; uniform float uStrength; varying vec3 vN; varying vec3 vView;
			void main() {
				float f = 1.0 - abs(dot(normalize(vN), normalize(vView)));  // 0 face-on → 1 at the limb
				f = pow(f, 3.0);                                            // tight to the limb
				gl_FragColor = vec4(uColor, f * (0.35 + 0.6 * uStrength));
			}`,
		transparent: true, blending: THREE.AdditiveBlending, side: THREE.BackSide, depthWrite: false
	});
	const shell = new THREE.Mesh(new THREE.SphereGeometry(radius * (1.015 + 0.03 * strength), 32, 24), mat);
	shell.renderOrder = 2;
	return shell;
}

// A patchy cloud/haze equirect texture: soft tinted blobs on transparent, their DENSITY set by coverage
// (Earth ≈ scattered, Venus ≈ a near-solid veil). Seeded per body so it's stable across frames.
export function makeCloudTexture(colorHex: string, coverage: number, seed: number): THREE.Texture {
	const W = 256, H = 128, c = document.createElement('canvas'); c.width = W; c.height = H;
	const ctx = c.getContext('2d')!;
	let s = (seed || 1) >>> 0;
	const rnd = () => ((s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296);
	const col = new THREE.Color(colorHex);
	const r = Math.round(col.r * 255), g = Math.round(col.g * 255), b = Math.round(col.b * 255);
	// A base veil for a thick deck (opaque worlds), then blobs on top for texture.
	if (coverage > 0.75) { ctx.fillStyle = `rgba(${r},${g},${b},${(coverage - 0.75) * 3.2})`; ctx.fillRect(0, 0, W, H); }
	const blobs = Math.round(40 + coverage * 160);
	for (let i = 0; i < blobs; i++) {
		const x = rnd() * W, y = rnd() * H, rad = (4 + rnd() * rnd() * 26) * (0.6 + coverage);
		const a = (0.10 + rnd() * 0.35) * coverage;
		const grad = ctx.createRadialGradient(x, y, 0, x, y, rad);
		grad.addColorStop(0, `rgba(${r},${g},${b},${a})`);
		grad.addColorStop(1, `rgba(${r},${g},${b},0)`);
		ctx.fillStyle = grad; ctx.beginPath(); ctx.arc(x, y, rad, 0, 2 * Math.PI); ctx.fill();
	}
	const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace;
	tex.wrapS = THREE.RepeatWrapping;
	return tex;
}

// CLOUD SHELL — a semi-transparent cloud/haze deck on its OWN sphere just above the surface, so it
// floats separately (the caller drifts it). Normal-blended (a real veil, not a glow). Returns the mesh
// and a slow longitudinal drift rate (rad/s) relative to the surface.
export function buildCloudShell(radius: number, colorHex: string, coverage: number, seed: number): { mesh: THREE.Mesh; drift: number } {
	const tex = makeCloudTexture(colorHex, coverage, seed);
	const mat = new THREE.MeshStandardMaterial({ map: tex, transparent: true, roughness: 1, metalness: 0, depthWrite: false, opacity: Math.min(1, 0.55 + coverage * 0.5) });
	const mesh = new THREE.Mesh(new THREE.SphereGeometry(radius * 1.03, 40, 28), mat);
	mesh.renderOrder = 1;
	return { mesh, drift: 0.02 + 0.03 * (1 - coverage) }; // thinner decks drift a touch faster
}

// --- Animation helpers ----------------------------------------------------------------------------

/** Flicker volcanic vents like heat — faster + hotter than the aurora shimmer. */
export function updateMagma(visuals: EmissiveVisual[], nowSec: number): void {
	for (const m of visuals) {
		const s = 0.5 + 0.5 * Math.sin(nowSec * 6 + m.seed * 6.283);
		m.mat.opacity = m.base * (0.6 + 0.4 * s);
	}
}

/** Glisten cryovolcanic plumes — a gentler, slower shimmer. */
export function updatePlumes(visuals: EmissiveVisual[], nowSec: number): void {
	for (const p of visuals) {
		const g = 0.5 + 0.5 * Math.sin(nowSec * 3.4 + p.seed * 6.283);
		p.mat.opacity = p.base * (0.55 + 0.45 * g);
	}
}

// --- Accretion-disc temperature gradient ----------------------------------------------------------

// Colour by NORMALISED radius (0 = inner edge / hottest, 1 = outer / coolest): white-hot → yellow →
// orange → deep red, the classic accretion-disc / "Interstellar" gradient. Shared by the live BH ring
// and the gallery's static disc.
const ACCRETION_STOPS: [number, THREE.Color][] = [
	[0.0, new THREE.Color(0xffffff)], [0.18, new THREE.Color(0xfff2d0)], [0.4, new THREE.Color(0xffd060)],
	[0.65, new THREE.Color(0xff7a1e)], [1.0, new THREE.Color(0x8f2408)]
];
export function accretionColor(t: number, out: THREE.Color): THREE.Color {
	const x = Math.max(0, Math.min(1, t));
	for (let i = 1; i < ACCRETION_STOPS.length; i++) {
		if (x <= ACCRETION_STOPS[i][0]) {
			const [t0, c0] = ACCRETION_STOPS[i - 1], [t1, c1] = ACCRETION_STOPS[i];
			return out.copy(c0).lerp(c1, (x - t0) / (t1 - t0));
		}
	}
	return out.copy(ACCRETION_STOPS[ACCRETION_STOPS.length - 1][1]);
}
