// src/lib/holo/galleryScene.ts
// The 3D reference gallery: lays out every example body (from galleryExamples) in a labelled GRID in
// ONE holo scene, so all the 3D renderings — textures, glows, volcanic vents, cryo plumes, star types,
// black-hole accretion discs — are reviewable at a glance. Reuses the SAME feature builders as the live
// holo (bodyFeatures) so what you see here is what the system view draws.
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { makeLensingShader, feedDiscEllipse, MAX_LENSES } from './lensingShader';
import { getPlanetTextureEquirect, getEmissiveEquirect } from '$lib/rendering/planetTexture';
import { deriveAppearance } from '$lib/rendering/planetAppearance';
import { buildAuroraShell } from './scene';
import {
	makeHotspotTexture, makePlumeTexture, makeGlowTexture,
	buildMagmaVents, buildCryoPlumes, buildSelfLumGlow, updateMagma, updatePlumes, accretionColor,
	type EmissiveVisual
} from './bodyFeatures';
import { GALLERY_ROWS, GALLERY_BLACK_HOLES } from '$lib/catalogue/galleryExamples';

const R = 0.44;        // rendered body radius (scene units)
const COL_GAP = 2.5;   // horizontal spacing between tiles (wide enough for the labels)
const ROW_GAP = 2.8;   // vertical spacing between rows (room for labels + downward plumes)

function makeLabel(text: string, colour = '#dfe6f0', px = 34): THREE.Sprite {
	const pad = 8;
	const cnv = document.createElement('canvas');
	const ctx = cnv.getContext('2d')!;
	const font = `${px}px system-ui, sans-serif`;
	ctx.font = font;
	const w = Math.ceil(ctx.measureText(text).width) + pad * 2;
	cnv.width = w; cnv.height = px + pad * 2;
	ctx.font = font; ctx.fillStyle = colour; ctx.textBaseline = 'middle';
	ctx.fillText(text, pad, cnv.height / 2);
	const tex = new THREE.Texture(cnv); tex.needsUpdate = true;
	const spr = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false }));
	const hgt = 0.26;
	spr.scale.set((w / cnv.height) * hgt, hgt, 1);
	return spr;
}

export function createGalleryScene(canvas: HTMLCanvasElement) {
	const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
	renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
	const scene = new THREE.Scene();
	const camera = new THREE.PerspectiveCamera(45, 1, 0.05, 500);
	const controls = new OrbitControls(camera, canvas);
	controls.enableDamping = true;
	// A flat gallery: orbiting the grid just sends it edge-on, so LEFT-drag PANS (natural for a tall
	// sheet of tiles) and the wheel zooms. Each body's own axial spin shows its 3D form without orbiting.
	controls.enableRotate = false;
	controls.enablePan = true;
	controls.mouseButtons = { LEFT: THREE.MOUSE.PAN, MIDDLE: THREE.MOUSE.DOLLY, RIGHT: THREE.MOUSE.PAN };
	controls.touches = { ONE: THREE.TOUCH.PAN, TWO: THREE.TOUCH.DOLLY_PAN };
	controls.screenSpacePanning = true;

	// Lighting: a key light from the upper-front (so each body shows a soft terminator) + fill so the
	// far side isn't black in a review context.
	scene.add(new THREE.HemisphereLight(0xbfd0e6, 0x202430, 0.85));
	const key = new THREE.DirectionalLight(0xffffff, 1.6);
	key.position.set(0.4, 0.7, 1); scene.add(key);

	const glowTexture = makeGlowTexture();
	const hotspotTexture = makeHotspotTexture();
	const plumeTexture = makePlumeTexture();
	const disposables: { dispose(): void }[] = [glowTexture, hotspotTexture, plumeTexture];

	const spinners: { obj: THREE.Object3D; rate: number }[] = [];
	const magmaVisuals: EmissiveVisual[] = [];
	const plumeVisuals: EmissiveVisual[] = [];
	const auroraVisuals: { mat: THREE.Material & { opacity: number }; base: number; seed: number }[] = [];
	const discs: { points: THREE.Points; rate: number }[] = [];
	const starVisuals: { corona: THREE.Sprite; baseScale: number; activity: number; seed: number }[] = [];
	// Black-hole lensing centres: world pos + horizon radius, and (when feeding) the accretion disc's
	// object + radii so the lens can exempt its projected band (the front-of-hole fix).
	const lensBHs: { pos: THREE.Vector3; r: number; disc?: { obj: THREE.Object3D; inner: number; outer: number } }[] = [];

	// Build a single planet/moon/star/brown-dwarf tile at (x,y). Returns the group.
	function buildBody(node: any, x: number, y: number): void {
		const g = new THREE.Group();
		g.position.set(x, y, 0);
		const isStar = node.roleHint === 'star';
		const appear = deriveAppearance(node);

		if (isStar) {
			const col = new THREE.Color(node.apparentColorHex || '#ffddaa');
			const sphere = new THREE.Mesh(new THREE.SphereGeometry(R, 32, 24), new THREE.MeshBasicMaterial({ color: col }));
			g.add(sphere);
			const coronaMat = new THREE.SpriteMaterial({ map: glowTexture, color: col, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, opacity: 0.9 });
			const corona = new THREE.Sprite(coronaMat);
			const activity = node.flareActivity ?? 0.2;
			const baseScale = R * (3.2 + activity * 3);
			corona.scale.setScalar(baseScale);
			g.add(corona);
			spinners.push({ obj: sphere, rate: 0.25 });
			let ss = 0; for (const ch of String(node.id)) ss = (ss + ch.charCodeAt(0)) % 997;
			starVisuals.push({ corona, baseScale, activity, seed: ss / 997 });
		} else {
			const texCanvas = getPlanetTextureEquirect(node);
			const mat = new THREE.MeshStandardMaterial({ roughness: 1, metalness: 0 });
			if (texCanvas) { const t = new THREE.CanvasTexture(texCanvas); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = renderer.capabilities.getMaxAnisotropy(); mat.map = t; }
			const emCanvas = getEmissiveEquirect(node);
			if (emCanvas) { const et = new THREE.CanvasTexture(emCanvas); et.colorSpace = THREE.SRGBColorSpace; et.anisotropy = renderer.capabilities.getMaxAnisotropy(); mat.emissiveMap = et; mat.emissive = new THREE.Color(0xffffff); mat.emissiveIntensity = 1.15; }
			else mat.color.set(node.apparentColorHex || '#8a8f99');
			const sphere = new THREE.Mesh(new THREE.SphereGeometry(R, 32, 24), mat);
			const polF = appear.oblatePolarFactor;
			if (polF < 0.999) sphere.scale.set(1, polF, 1);
			// Axial tilt about Z (matches the holo). For a cryovolcanic body, instead tip the SOUTH pole
			// toward the camera so its plumes (which vent from the pole) spray toward the viewer rather
			// than straight down out of sight — the sphere still spins about that (now-tilted) pole axis,
			// so the jets stay put while the surface turns.
			if (appear.cryoPlumes) sphere.quaternion.setFromAxisAngle(new THREE.Vector3(1, 0, 0), -1.15);
			else sphere.quaternion.setFromAxisAngle(new THREE.Vector3(0, 0, 1), (appear.axialTiltDeg * Math.PI) / 180);
			g.add(sphere);
			spinners.push({ obj: sphere, rate: 0.35 });

			// Emissive features — the same builders the live holo uses.
			if (appear.magma) { const b = buildMagmaVents(R, appear.magma, node.id, hotspotTexture); sphere.add(b.group); magmaVisuals.push(...b.visuals); }
			if (appear.cryoPlumes) { const b = buildCryoPlumes(R, appear.cryoPlumes, node.id, plumeTexture); sphere.add(b.group); plumeVisuals.push(...b.visuals); }
			if (appear.selfLumGlow) g.add(buildSelfLumGlow(R, appear.selfLumGlow.colorHex, glowTexture));
			// Auroras from the shared appearance MODEL (the aurora/* tag) — consistent with the 2D disc.
			// (The live holo currently derives them from physics; the model tag is what the gallery shows.)
			if (appear.aurora) {
				const built = buildAuroraShell(R, appear.aurora.coreHex, appear.aurora.strength);
				sphere.add(built.shell);
				let seed = 0; for (const ch of String(node.id)) seed = (seed + ch.charCodeAt(0)) % 997;
				auroraVisuals.push({ mat: built.mat, base: built.base, seed: seed / 997 });
			}
			// A simple ring for a ringed giant.
			if (node.ringed) g.add(buildStaticRing(R * 1.35, R * 2.2, 0xcdd6e2, false));
		}
		const label = makeLabel(String(node.name ?? '')); label.position.set(0, -R - 0.34, 0);
		g.add(label);
		scene.add(g);
	}

	// A flat particle ring/disc. `accretion` grades it hot-inner → red-outer and makes it glow.
	function buildStaticRing(inner: number, outer: number, tint: number, accretion: boolean): THREE.Points {
		const count = accretion ? 2600 : 900;
		const pos = new Float32Array(count * 3);
		const col = new Float32Array(count * 3);
		const tmp = new THREE.Color(); const base = new THREE.Color(tint);
		const span = Math.max(1e-6, outer - inner);
		for (let i = 0; i < count; i++) {
			const r = inner + Math.random() * span;
			const a = Math.random() * Math.PI * 2;
			pos[3 * i] = r * Math.cos(a); pos[3 * i + 1] = 0; pos[3 * i + 2] = r * Math.sin(a);
			if (accretion) { accretionColor((r - inner) / span, tmp); col[3 * i] = tmp.r; col[3 * i + 1] = tmp.g; col[3 * i + 2] = tmp.b; }
			else { col[3 * i] = base.r; col[3 * i + 1] = base.g; col[3 * i + 2] = base.b; }
		}
		const geo = new THREE.BufferGeometry();
		geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
		geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
		const mat = new THREE.PointsMaterial({ map: glowTexture, vertexColors: true, size: accretion ? outer * 0.1 : outer * 0.09, sizeAttenuation: true, transparent: true, opacity: accretion ? 1 : 0.7, depthWrite: false,
			depthTest: !accretion, // accretion disc draws OVER the shadow so its far half is in the buffer for the lens to wrap
			blending: accretion ? THREE.AdditiveBlending : THREE.NormalBlending });
		const pts = new THREE.Points(geo, mat);
		pts.rotation.x = accretion ? 0.09 : 1.35; // accretion disc: nearly EDGE-ON — a slim band, so the lensed dome stays graceful
		return pts;
	}

	function buildBlackHole(entry: { node: any; disc: any }, x: number, y: number): void {
		const g = new THREE.Group(); g.position.set(x, y, 0);
		const shadowR = R * 0.5;
		// The DRAWN horizon mesh is much smaller than the lens's shadow mask — the lens magnifies
		// whatever black it finds at the centre, so a full-size sphere would smear black far past the
		// photon ring and eat the starfield around it. The shader's mask is the real shadow.
		const eh = new THREE.Mesh(new THREE.SphereGeometry(shadowR * 0.55, 32, 24), new THREE.MeshBasicMaterial({ color: 0x000000 }));
		g.add(eh); // a black hole is BLACK — no glow ball; the disc + lensing are the whole look
		const edd = entry.node.accretionEddington || 0;
		const lens: (typeof lensBHs)[number] = { pos: new THREE.Vector3(x, y, 0), r: shadowR };
		if (edd > 0.01) {
			const outer = shadowR * (2.6 + edd * 2.6);
			const disc = buildStaticRing(shadowR * 1.5, outer, 0xffd060, true);
			g.add(disc); discs.push({ points: disc, rate: 0.5 + edd });
			lens.disc = { obj: disc, inner: shadowR * 1.5, outer }; // the band the lens exempts
		}
		const label = makeLabel(String(entry.node.name), '#ffd8a0'); label.position.set(0, -R - 0.34, 0); g.add(label);
		scene.add(g);
		lensBHs.push(lens); // lens the disc + backdrop stars around it
	}

	// A patch of backdrop stars behind a row, so the black holes have something to lens.
	function addStarBackdrop(y: number, halfW: number, halfH: number): void {
		const count = 4200; // dense enough that the lens compresses them into a bright Einstein halo
		const pos = new Float32Array(count * 3);
		for (let i = 0; i < count; i++) {
			pos[3 * i] = (Math.random() * 2 - 1) * halfW;
			pos[3 * i + 1] = y + (Math.random() * 2 - 1) * halfH;
			pos[3 * i + 2] = -4 - Math.random() * 2; // behind the tiles (z=0)
		}
		const geo = new THREE.BufferGeometry();
		geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
		const mat = new THREE.PointsMaterial({ color: 0xeef2fa, size: 0.035, sizeAttenuation: true, transparent: true, opacity: 0.95 });
		scene.add(new THREE.Points(geo, mat));
		disposables.push(geo, mat);
	}

	// --- Layout: rows top→down, centred horizontally. ---
	let row = 0;
	const rowLabels: THREE.Sprite[] = [];
	const placeRow = (title: string, n: number, place: (i: number, x: number, y: number) => void) => {
		const y = -row * ROW_GAP;
		const rl = makeLabel(title, '#8fb4e0', 30); rl.position.set(-(n / 2) * COL_GAP - 0.2, y + R + 0.55, 0);
		rl.center.set(1, 0.5); scene.add(rl); rowLabels.push(rl);
		for (let i = 0; i < n; i++) place(i, (i - (n - 1) / 2) * COL_GAP, y);
		row++;
	};

	for (const r of GALLERY_ROWS) placeRow(r.title, r.bodies.length, (i, x, y) => buildBody(r.bodies[i], x, y));
	const bhRowY = -row * ROW_GAP;
	placeRow('Black holes — by accretion level', GALLERY_BLACK_HOLES.length, (i, x, y) => buildBlackHole(GALLERY_BLACK_HOLES[i], x, y));
	// Backdrop stars behind the black-hole row so the lensing has something to bend.
	addStarBackdrop(bhRowY, (GALLERY_BLACK_HOLES.length / 2) * COL_GAP + COL_GAP, ROW_GAP * 0.75);

	// Post-processing: the black-hole lensing pass (same shader as the live holo). The front-of-hole
	// disc is handled ANALYTICALLY in the shader (the projected disc-ellipse band passes through
	// un-lensed) — no depth buffer, no offscreen target, no twin geometry.
	const composer = new EffectComposer(renderer);
	composer.addPass(new RenderPass(scene, camera));
	const lensingPass = new ShaderPass(makeLensingShader());
	composer.addPass(lensingPass);
	// Final tone-map + sRGB (composer.render outputs LINEAR otherwise — that dulled the whole gallery).
	composer.addPass(new OutputPass());

	// Frame the whole grid.
	const totalH = row * ROW_GAP;
	const midY = -totalH / 2 + ROW_GAP / 2;
	controls.target.set(0, midY, 0);
	camera.position.set(0, midY, Math.max(9, totalH * 0.62));

	let raf = 0; let disposed = false; const clock = { t: 0 };
	let vpW = 1, vpH = 1;
	function resize() {
		const w = canvas.clientWidth || 1, h = canvas.clientHeight || 1;
		vpW = w; vpH = h;
		renderer.setSize(w, h, false);
		composer.setSize(w, h);
		camera.aspect = w / h; camera.updateProjectionMatrix();
	}
	resize();
	const ro = new ResizeObserver(resize); ro.observe(canvas);

	const _q = new THREE.Quaternion(); const _yAxis = new THREE.Vector3(0, 1, 0);
	const _lc = new THREE.Vector3(); const _le = new THREE.Vector3(); const _cr = new THREE.Vector3();
	function updateLensing() {
		_cr.setFromMatrixColumn(camera.matrixWorld, 0);
		const arr = lensingPass.uniforms.uBH.value as THREE.Vector4[];
		const discArr = lensingPass.uniforms.uDisc.value as THREE.Vector4[];
		const discNArr = lensingPass.uniforms.uDiscN.value as THREE.Vector2[];
		const aspect = vpW / Math.max(1, vpH);
		let n = 0;
		for (const b of lensBHs) {
			_lc.copy(b.pos).project(camera);
			if (_lc.z >= 1) continue;
			_le.copy(b.pos).addScaledVector(_cr, b.r).project(camera);
			// Horizon screen radius in the shader's aspect-corrected UV space (pixels/height).
			const rC = Math.hypot((_le.x - _lc.x) * 0.5 * aspect, (_le.y - _lc.y) * 0.5);
			if (rC <= 0.0002 || n >= MAX_LENSES) continue;
			const k = b.disc ? b.disc.inner / b.disc.outer : 0;
			arr[n].set(_lc.x * 0.5 + 0.5, _lc.y * 0.5 + 0.5, Math.min(0.5, rC * 0.85), k);
			if (b.disc) feedDiscEllipse(discArr[n], discNArr[n], b.disc.obj, b.pos, b.disc.outer, camera, _lc.x, _lc.y, aspect);
			else { discArr[n].set(0, 0, 0, 0); discNArr[n].set(0, 0); }
			n++;
		}
		lensingPass.uniforms.uCount.value = n;
		lensingPass.uniforms.uAspect.value = aspect;
	}
	function frame() {
		if (disposed) return;
		clock.t += 0.016;
		for (const s of spinners) { _q.setFromAxisAngle(_yAxis, 0.016 * s.rate); s.obj.quaternion.multiply(_q); }
		// Spin in-plane about the disc's local Y (its plane normal after the X-tilt). NB not rotation.z —
		// with XYZ euler order that would wobble the plane, not spin it, and break the lens's ellipse feed.
		for (const d of discs) d.points.rotation.y += 0.016 * d.rate;
		// Star flares: pulse each corona's size + brightness, amplitude ∝ flare activity, so an active
		// flare star (an M dwarf) visibly throbs while a calm one barely moves — like the discs animate.
		for (const s of starVisuals) {
			const t = clock.t;
			const flick = 0.5 + 0.5 * (0.6 * Math.sin(t * (2 + s.activity * 5) + s.seed * 6.283) + 0.4 * Math.sin(t * (5 + s.activity * 9) + s.seed * 12.57));
			const a = s.activity;
			s.corona.scale.setScalar(s.baseScale * (1 + a * 0.45 * flick));
			(s.corona.material as THREE.SpriteMaterial).opacity = Math.min(1, 0.9 * (1 - a * 0.35 + a * 0.6 * flick));
		}
		updateMagma(magmaVisuals, clock.t);
		updatePlumes(plumeVisuals, clock.t);
		for (const a of auroraVisuals) {
			const s = 0.5 + 0.5 * Math.sin(clock.t * 2.6 + a.seed * 6.283);
			a.mat.opacity = a.base * (0.5 + 0.5 * s);
		}
		controls.update();
		updateLensing();
		composer.render();
		raf = requestAnimationFrame(frame);
	}
	frame();

	return {
		dispose() {
			disposed = true; cancelAnimationFrame(raf); ro.disconnect(); controls.dispose();
			for (const d of disposables) d.dispose();
			(lensingPass.material as THREE.Material)?.dispose();
			composer.dispose();
			renderer.dispose();
			scene.traverse((o) => {
				const m = (o as any).material; const geo = (o as any).geometry;
				if (geo) geo.dispose();
				if (m) { (Array.isArray(m) ? m : [m]).forEach((mm) => { mm.map?.dispose?.(); mm.dispose?.(); }); }
			});
		}
	};
}
