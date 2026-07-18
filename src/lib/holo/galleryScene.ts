// src/lib/holo/galleryScene.ts
// The 3D reference gallery: lays out every example body (from galleryExamples) in a labelled GRID in
// ONE holo scene, so all the 3D renderings — textures, glows, volcanic vents, cryo plumes, star types,
// black-hole accretion discs — are reviewable at a glance. Reuses the SAME feature builders as the live
// holo (bodyFeatures) so what you see here is what the system view draws.
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { getPlanetTextureEquirect } from '$lib/rendering/planetTexture';
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
			if (texCanvas) { const t = new THREE.CanvasTexture(texCanvas); t.colorSpace = THREE.SRGBColorSpace; mat.map = t; }
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
		const mat = new THREE.PointsMaterial({ map: glowTexture, vertexColors: true, size: accretion ? outer * 0.18 : outer * 0.09, sizeAttenuation: true, transparent: true, opacity: accretion ? 0.95 : 0.7, depthWrite: false, blending: accretion ? THREE.AdditiveBlending : THREE.NormalBlending });
		const pts = new THREE.Points(geo, mat);
		pts.rotation.x = accretion ? 1.15 : 1.35; // tilt the disc toward the viewer
		return pts;
	}

	function buildBlackHole(entry: { node: any; disc: any }, x: number, y: number): void {
		const g = new THREE.Group(); g.position.set(x, y, 0);
		const eh = new THREE.Mesh(new THREE.SphereGeometry(R * 0.55, 32, 24), new THREE.MeshBasicMaterial({ color: 0x000000 }));
		g.add(eh);
		const edd = entry.node.accretionEddington || 0;
		const feeding = edd > 0.01;
		const glowMat = new THREE.SpriteMaterial({ map: glowTexture, color: feeding ? 0xffe8b0 : 0x7f93b5, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, opacity: feeding ? 1 : 0.4 });
		const glow = new THREE.Sprite(glowMat); glow.scale.setScalar(R * 0.55 * (feeding ? 3 + edd * 3 : 2)); g.add(glow);
		if (feeding) {
			const disc = buildStaticRing(R * 0.8, R * 0.8 + (R * 1.6) * (0.4 + edd * 0.6), 0xffd060, true);
			g.add(disc); discs.push({ points: disc, rate: 0.5 + edd });
		}
		const label = makeLabel(String(entry.node.name), '#ffd8a0'); label.position.set(0, -R - 0.34, 0); g.add(label);
		scene.add(g);
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
	placeRow('Black holes — by accretion level', GALLERY_BLACK_HOLES.length, (i, x, y) => buildBlackHole(GALLERY_BLACK_HOLES[i], x, y));

	// Frame the whole grid.
	const totalH = row * ROW_GAP;
	const midY = -totalH / 2 + ROW_GAP / 2;
	controls.target.set(0, midY, 0);
	camera.position.set(0, midY, Math.max(9, totalH * 0.62));

	let raf = 0; let disposed = false; const clock = { t: 0 };
	function resize() {
		const w = canvas.clientWidth || 1, h = canvas.clientHeight || 1;
		renderer.setSize(w, h, false);
		camera.aspect = w / h; camera.updateProjectionMatrix();
	}
	resize();
	const ro = new ResizeObserver(resize); ro.observe(canvas);

	const _q = new THREE.Quaternion(); const _yAxis = new THREE.Vector3(0, 1, 0);
	function frame() {
		if (disposed) return;
		clock.t += 0.016;
		for (const s of spinners) { _q.setFromAxisAngle(_yAxis, 0.016 * s.rate); s.obj.quaternion.multiply(_q); }
		for (const d of discs) d.points.rotation.z += 0.016 * d.rate;
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
		renderer.render(scene, camera);
		raf = requestAnimationFrame(frame);
	}
	frame();

	return {
		dispose() {
			disposed = true; cancelAnimationFrame(raf); ro.disconnect(); controls.dispose();
			for (const d of disposables) d.dispose();
			renderer.dispose();
			scene.traverse((o) => {
				const m = (o as any).material; const geo = (o as any).geometry;
				if (geo) geo.dispose();
				if (m) { (Array.isArray(m) ? m : [m]).forEach((mm) => { mm.map?.dispose?.(); mm.dispose?.(); }); }
			});
		}
	};
}
