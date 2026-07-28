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
			const mat = new THREE.SpriteMaterial({ map: plumeTexture, color, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, opacity: 0.82 * (1 - f * 0.55) });
			const sprite = new THREE.Sprite(mat);
			sprite.position.copy(normal).multiplyScalar(radius + f * reach);
			const sz = radius * (0.22 + f * 0.62); // widens toward the tip (spray)
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

// A cloud/haze equirect texture. Clouds aren't random blobs — winds run EAST-WEST (Coriolis/convection),
// so weather organises into latitude BANDS of E-W streaks with clearer lanes between. An even band count
// leaves the EQUATOR in a clear lane, so the surface shows through there. A THIN deck (Earth) draws
// scattered streaks with open surface; a THICK deck (Venus) adds a near-solid base veil. Seeded per body.
export function makeCloudTexture(colorHex: string, coverage: number, seed: number): THREE.Texture {
	const W = 512, H = 256, c = document.createElement('canvas'); c.width = W; c.height = H;
	const ctx = c.getContext('2d')!;
	let s = (seed || 1) >>> 0;
	const rnd = () => ((s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296);
	const col = new THREE.Color(colorHex);
	const r = Math.round(col.r * 255), g = Math.round(col.g * 255), b = Math.round(col.b * 255);
	const thick = coverage > 0.72;
	if (thick) { ctx.fillStyle = `rgba(${r},${g},${b},${Math.min(0.95, 0.45 + (coverage - 0.72) * 2)})`; ctx.fillRect(0, 0, W, H); }
	const bands = thick ? 6 : 4;                                     // even → a clear equatorial lane
	// Cloud-system COUNT must scale from near-zero with coverage. A flat floor of 16 meant a wisp
	// deck (Mars, 0.08) drew almost as much cloud as an overcast one (Earth, 0.64) — the deck's
	// coverage was barely visible in the result.
	const systems = thick ? Math.round(30 + coverage * 44) : Math.max(2, Math.round(coverage * 42));
	for (let i = 0; i < systems; i++) {
		const bandY = ((Math.floor(rnd() * bands) + 0.5) / bands) * H;
		const cy = bandY + (rnd() - 0.5) * (H / bands) * 0.55;       // jitter within the band; lanes stay clear
		if (cy < H * 0.08 || cy > H * 0.92) continue;               // skip the pinching poles
		const cx = rnd() * W;
		const spanX = (thick ? 70 : 48) + rnd() * (thick ? 70 : 80); // wide  E-W
		const spanY = (thick ? 16 : 7) + rnd() * (thick ? 14 : 8);   // narrow N-S
		const puffs = thick ? 7 : 4 + Math.floor(rnd() * 5);
		// Thin decks fade with coverage — wisps are faint as well as sparse — but the curve must not
		// drag a genuinely cloudy world down with them. Earth (0.67) sits near the top of this range
		// and should read as bright white cloud over its ocean; Mars (0.08) as barely-there wisps.
		const core = thick ? 0.18 + rnd() * 0.2 : (0.26 + coverage * 0.62) * (0.7 + rnd() * 0.45);
		for (let j = 0; j < puffs; j++) {
			const px = cx + (rnd() - 0.5) * spanX, py = cy + (rnd() - 0.5) * spanY;
			const radY = (thick ? 9 : 5) + rnd() * (thick ? 16 : 11);
			const radX = radY * (1.6 + rnd() * 1.2);                 // stretched east-west
			const a = core * (0.5 + rnd() * 0.5);
			// Per-puff tonal shift: some puffs lighter, some darker than the base — so a same-colour deck
			// (Venus yellow, a giant's band colour) SWIRLS with shades instead of reading as one flat tone.
			const sh = 0.72 + rnd() * 0.56;
			const rr = Math.min(255, Math.round(r * sh)), gg = Math.min(255, Math.round(g * sh)), bb = Math.min(255, Math.round(b * sh));
			// Draw the puff — and a wrapped copy when it straddles the u=0/1 seam, so the deck tiles
			// horizontally and no cut-off edge shows as a vertical seam on the sphere.
			const drawPuff = (ox: number) => {
				ctx.save(); ctx.translate(ox, py); ctx.scale(radX / radY, 1);
				const grad = ctx.createRadialGradient(0, 0, 0, 0, 0, radY);
				grad.addColorStop(0, `rgba(${rr},${gg},${bb},${a})`);
				grad.addColorStop(0.6, `rgba(${rr},${gg},${bb},${a * 0.4})`);
				grad.addColorStop(1, `rgba(${rr},${gg},${bb},0)`);
				ctx.fillStyle = grad; ctx.beginPath(); ctx.arc(0, 0, radY, 0, 2 * Math.PI); ctx.fill();
				ctx.restore();
			};
			drawPuff(px);
			if (px < radX * 1.5) drawPuff(px + W); else if (px > W - radX * 1.5) drawPuff(px - W);
		}
	}
	const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace;
	tex.wrapS = THREE.RepeatWrapping;
	return tex;
}

// A star photosphere: base colour + granulation + SPOT GROUPS with bright faculae around them, all
// scaled by the star's magnetic activity (the stellar/activity tag). Seeded from the star id so it
// is stable frame-to-frame. Limb darkening is NOT baked here — it is a view-dependent effect and
// belongs on the sphere (see the limb-darkening material), not in the surface map.
export function makeStarSurfaceTexture(colorHex: number, activity: number, seedStr: string): HTMLCanvasElement {
  const W = 512;   // was 256: spot groups and faculae need the room to read as structure, not specks
  const H = 256;
  const c = document.createElement('canvas');
  c.width = W;
  c.height = H;
  const ctx = c.getContext('2d')!;
  let s = 2166136261;
  for (let i = 0; i < seedStr.length; i++) { s ^= seedStr.charCodeAt(i); s = Math.imul(s, 16777619); }
  const rnd = () => { s = (s * 1103515245 + 12345) & 0x7fffffff; return s / 0x7fffffff; };
  const base = new THREE.Color(colorHex);
  const css = (f: number) => `rgb(${Math.round(Math.min(255, base.r * 255 * f))},${Math.round(Math.min(255, base.g * 255 * f))},${Math.round(Math.min(255, base.b * 255 * f))})`;

  ctx.fillStyle = css(1);
  ctx.fillRect(0, 0, W, H);
  // Granulation: convection cells. Denser and finer than before so the surface reads as boiling
  // rather than dusty.
  for (let i = 0; i < 1400; i++) {
    ctx.globalAlpha = 0.09;
    ctx.fillStyle = css(0.82 + rnd() * 0.36);
    ctx.beginPath();
    ctx.arc(rnd() * W, rnd() * H, 2 + rnd() * 5, 0, 2 * Math.PI);
    ctx.fill();
  }

  // SPOT GROUPS. Real starspots come in groups along two ACTIVE LATITUDE BANDS either side of the
  // equator (the Sun's butterfly diagram), not scattered anywhere — and each group is several spots
  // of varying size, not one dot. Count, size and darkness all climb with magnetic activity, so a
  // quiet sun shows a few small grey-ish groups and a flare star is blotched with near-black ones.
  const groups = Math.round(2 + activity * 9);
  const bandCentre = 0.30 + 0.06 * (1 - activity);   // very active stars spot closer to their poles
  for (let g = 0; g < groups; g++) {
    const north = rnd() < 0.5;
    const gx = rnd() * W;
    const gy = H * (north ? bandCentre : 1 - bandCentre) + (rnd() - 0.5) * H * 0.16;
    const gr = (4 + rnd() * 7) * (0.7 + activity * 0.9);
    const members = 1 + Math.floor(rnd() * (2 + activity * 4));

    // Faculae: the bright magnetic froth that surrounds a spot group. On a quiet star these are the
    // most visible magnetic feature of all — the Sun is slightly BRIGHTER at solar maximum because
    // of them, despite having more spots.
    ctx.globalAlpha = 0.16 + activity * 0.12;
    ctx.fillStyle = css(1.28);
    for (let f = 0; f < members * 3; f++) {
      ctx.beginPath();
      ctx.ellipse(gx + (rnd() - 0.5) * gr * 5, gy + (rnd() - 0.5) * gr * 3,
        gr * (0.5 + rnd()), gr * (0.3 + rnd() * 0.5), rnd() * Math.PI, 0, 2 * Math.PI);
      ctx.fill();
    }

    for (let m = 0; m < members; m++) {
      const x = gx + (rnd() - 0.5) * gr * 3.4;
      const y = gy + (rnd() - 0.5) * gr * 1.8;
      const r = gr * (0.35 + rnd() * 0.75);
      // Penumbra — the filamentary grey skirt.
      ctx.globalAlpha = 0.55;
      ctx.fillStyle = css(0.5);
      ctx.beginPath();
      ctx.ellipse(x, y, r * 1.7, r * 1.05, 0, 0, 2 * Math.PI);
      ctx.fill();
      // Umbra — the cold dark core. Darker on an active star (stronger fields, cooler spots).
      ctx.globalAlpha = 0.9;
      ctx.fillStyle = css(0.3 - activity * 0.14);
      ctx.beginPath();
      ctx.ellipse(x, y, r * 0.9, r * 0.55, 0, 0, 2 * Math.PI);
      ctx.fill();
    }
  }
  ctx.globalAlpha = 1;
  return c;
}

// LIMB DARKENING — a star is dimmer and redder at its edge than at its centre, because at the limb
// you are looking along a shallow slant through the photosphere and see only its cooler upper layers.
// It is the single strongest cue that a star is a SPHERE rather than a flat glowing disc, and it is
// view-dependent, so it belongs on the material and not in the surface map. Applied as a cheap patch
// on the standard emissive material: one dot product, no extra pass, no extra draw.
export function applyLimbDarkening(mat: THREE.Material, strength = 0.55): void {
	mat.onBeforeCompile = (shader) => {
		shader.uniforms.uLimb = { value: strength };
		shader.vertexShader = shader.vertexShader
			.replace('#include <common>', '#include <common>\nvarying vec3 vLimbN;\nvarying vec3 vLimbP;')
			.replace('#include <begin_vertex>',
				'#include <begin_vertex>\nvLimbN = normalize(normalMatrix * normal);\nvLimbP = (modelViewMatrix * vec4(position,1.0)).xyz;');
		shader.fragmentShader = shader.fragmentShader
			.replace('#include <common>', '#include <common>\nuniform float uLimb;\nvarying vec3 vLimbN;\nvarying vec3 vLimbP;')
			.replace('#include <dithering_fragment>',
				`#include <dithering_fragment>
				 // mu = cos(angle between the surface normal and the line of sight). 1 at the disc
				 // centre, 0 at the limb. The classic linear law: I(mu) = 1 - u(1 - mu).
				 float mu = clamp(dot(normalize(vLimbN), normalize(-vLimbP)), 0.0, 1.0);
				 float darken = 1.0 - uLimb * (1.0 - mu);
				 // Redden as it darkens — the limb shows cooler gas, so the blue falls off fastest.
				 gl_FragColor.rgb *= vec3(darken, darken * (0.94 + 0.06 * mu), darken * (0.86 + 0.14 * mu));`);
	};
	mat.needsUpdate = true;
}

// STELLAR FLARES — brief brilliant arcs at the limb of a magnetically active star. Additive sprites
// on a timer, only built for stars that actually flare, so a quiet sun costs nothing at all. Kept to
// a handful of quads: this is the one "moderate" effect in the stellar pass and it must stay
// mobile-safe. Returns the group plus the per-flare state the animator drives.
export interface FlareVisual { mesh: THREE.Mesh; mat: THREE.Material & { opacity: number }; phase: number; period: number }
export function buildStellarFlares(radius: number, colorHex: string, activity: number, seed: number, tex: THREE.Texture)
		: { group: THREE.Group; flares: FlareVisual[] } {
	const group = new THREE.Group();
	const flares: FlareVisual[] = [];
	let s = (seed || 1) >>> 0;
	const rnd = () => ((s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296);
	const n = Math.round(2 + activity * 3);
	const col = new THREE.Color(colorHex).lerp(new THREE.Color('#ffffff'), 0.55);
	for (let i = 0; i < n; i++) {
		const mat = new THREE.SpriteMaterial({
			map: tex, color: col, transparent: true, opacity: 0,
			blending: THREE.AdditiveBlending, depthWrite: false
		});
		const sp = new THREE.Sprite(mat);
		// Sit them ON the limb, in the active latitude bands where the field emerges.
		const lat = (rnd() < 0.5 ? 1 : -1) * (0.25 + rnd() * 0.35);
		const lon = rnd() * Math.PI * 2;
		const rr = radius * 1.02;
		sp.position.set(Math.cos(lat) * Math.cos(lon) * rr, Math.sin(lat) * rr, Math.cos(lat) * Math.sin(lon) * rr);
		const size = radius * (0.35 + rnd() * 0.4) * (0.6 + activity * 0.8);
		sp.scale.set(size, size, 1);
		sp.renderOrder = 3;
		group.add(sp);
		flares.push({ mesh: sp as unknown as THREE.Mesh, mat: mat as any, phase: rnd() * 20, period: 6 + rnd() * 14 });
	}
	return { group, flares };
}

/** Flares: a sharp rise and a slower decay, mostly dark between events. */
export function updateStellarFlares(flares: FlareVisual[], nowSec: number): void {
	for (const f of flares) {
		const t = ((nowSec + f.phase) % f.period) / f.period;
		// A short burst occupying ~18% of the cycle: fast rise, exponential-ish fall.
		const burst = t < 0.18 ? (t < 0.04 ? t / 0.04 : Math.exp(-(t - 0.04) * 14)) : 0;
		f.mat.opacity = burst * 0.85;
	}
}

// ATMOSPHERIC THOLIN HAZE — Titan's orange smog. Unlike surface tholin staining (Pluto), this is a
// high photochemical layer ABOVE the cloud decks, so it gets its own outermost shell rather than
// being baked into the surface texture: baked below the clouds, Titan's pale methane deck hid it
// completely. Uniform (a smog has no structure at this scale) and lightly emissive so the limb keeps
// its glow.
export function buildTholinHaze(radius: number, colorHex: string, strength: number): THREE.Mesh {
	const mat = new THREE.MeshStandardMaterial({
		color: new THREE.Color(colorHex),
		transparent: true,
		opacity: Math.min(0.8, 0.3 + strength * 0.5),
		roughness: 1, metalness: 0, depthWrite: false,
		emissive: new THREE.Color(colorHex), emissiveIntensity: 0.14
	});
	const mesh = new THREE.Mesh(new THREE.SphereGeometry(radius * 1.075, 40, 28), mat);
	mesh.renderOrder = 2;   // outside the cloud shells (renderOrder 1)
	return mesh;
}

// CLOUD DECK — TWO cloud shells just above the surface, each on its own sphere and drifting INDEPENDENTLY
// (of the planet's spin and of each other), so the deck has parallax depth: a lower main deck plus a high,
// wispier deck that slides the other way a bit faster. Normal-blended (a real veil, not a glow); the
// texture alpha carries the gaps so the surface shows between streaks. Returns the group + per-layer drift.
export function buildCloudDeck(radius: number, colorHex: string, colorHex2: string, coverage: number, seed: number, giant = false): { group: THREE.Group; layers: { mesh: THREE.Mesh; drift: number }[] } {
	const group = new THREE.Group();
	const layers: { mesh: THREE.Mesh; drift: number }[] = [];
	const layer = (rMul: number, cov: number, sd: number, hex: string, emissive: number, drift: number) => {
		const tex = makeCloudTexture(hex, cov, sd);
		const mat = new THREE.MeshStandardMaterial({ map: tex, transparent: true, roughness: 1, metalness: 0, depthWrite: false, emissive: new THREE.Color(hex), emissiveMap: tex, emissiveIntensity: emissive, opacity: 1 });
		const mesh = new THREE.Mesh(new THREE.SphereGeometry(radius * rMul, 40, 28), mat);
		mesh.renderOrder = 1;
		group.add(mesh); layers.push({ mesh, drift });
	};
	if (giant) {
		// A GAS/ICE GIANT is all atmosphere: its clouds ARE the surface. So bake the deck to ground level
		// (one layer right on the surface, no floating shells — those read wrong on a giant and hide the
		// poles); it just slides slowly over the banding to give the storms a little drift.
		layer(1.003, coverage, seed || 1, colorHex, 0.12, 0.012);
	} else {
		layer(1.02, coverage, seed || 1, colorHex, 0.22, 0.02 + 0.02 * (1 - coverage));                 // main deck
		layer(1.05, coverage * 0.5, (Math.imul(seed || 1, 7) + 13) >>> 0 || 2, colorHex2, 0.16, -0.035 - 0.02 * (1 - coverage)); // high deck, a different gas tint, drifting the other way
	}
	return { group, layers };
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
