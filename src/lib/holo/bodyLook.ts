// src/lib/holo/bodyLook.ts
// ONE assembly for "what a body LOOKS like at a given rendered radius".
//
// Before this file there were TWO inline assemblies over the same twelve `bodyFeatures` builders —
// the live holo's, inside `createHoloScene`, and the reference gallery's `buildBody` — and they had
// already drifted: the gallery inlined its own corona at `R * (3.2 + activity * 3)` while the holo
// called `buildStarLook`, whose corona is `radius * (5 + activity * 4)`. A third caller (the size
// comparison view) would have been a third copy, so the assembly lives here once and the callers
// pass their differences in as OPTIONS.
//
// WHAT THIS DOES NOT DECIDE: how big the body is. The radius is the caller's, because the three
// callers answer that question differently — the holo binds the size law (RENDER-S11), the gallery
// draws every tile the same size on purpose, and the comparison view uses TRUE radii. Nothing about
// sizing belongs in here.
//
// WHAT STAYS WITH THE CALLER: the wireframe render family (scene-only, no second copy to remove),
// the black-hole horizon and its accretion ring node, a star's point light, orbit rings, labels,
// and per-frame spin. This function builds a LOOK and hands back the updaters for it.
import * as THREE from 'three';
import { getPlanetTextureEquirect, getEmissiveEquirect } from '$lib/rendering/planetTexture';
import { deriveAppearance } from '$lib/rendering/planetAppearance';
import { lightningStrength } from '$lib/physics/cloudDecks';
import { deriveAurora, auroraEmitters } from '$lib/physics/aurora';
import { activityStrength, flaresVisibly } from '$lib/physics/stellarActivity';
import {
  buildMagmaVents, buildCryoPlumes, buildSelfLumGlow, buildAtmoGlow, buildCloudDeck, buildTholinHaze,
  buildDeckStack, buildLightning, buildAuroraShell, applyLimbDarkening, buildStarLook,
  makeStarSurfaceTexture, type StarLookVisual, type LightningVisual, type EmissiveVisual
} from './bodyFeatures';

/**
 * The render families. Lives here rather than in `scene.ts` because the assembly branches on it and
 * `scene.ts` imports this module (the other direction would be a cycle). `scene.ts` re-exports it,
 * so every existing `import type { RenderStyle } from '$lib/holo/scene'` still resolves.
 */
export type RenderStyle = 'filled' | 'lopoly-filled' | 'lopoly-lines' | 'wire-glow' | 'wire-flat' | 'wire-glow-occ' | 'wire-flat-occ';

/** True for the styles this module builds. The wire family belongs to `scene.ts` and is not shared. */
export function isFilledFamily(style: RenderStyle): boolean {
  return style === 'filled' || style === 'lopoly-filled' || style === 'lopoly-lines';
}

/** The three shared canvas textures a look needs. The caller owns and disposes them. */
export interface BodyLookTextures {
  glow: THREE.Texture;
  hotspot: THREE.Texture;
  plume: THREE.Texture;
}

export interface BodyLookOptions {
  textures: BodyLookTextures;
  /** Filled family only ('filled' | 'lopoly-filled' | 'lopoly-lines'). Default 'filled'. */
  renderStyle?: RenderStyle;
  /** 'textured' = the procedural surface; 'white'/'flat' are the holo's schematic looks. */
  bodyStyle?: 'textured' | 'white' | 'flat';
  /** The holo's "2D map" look: MeshBasic, no lighting, and therefore no emissive features at all. */
  unlit?: boolean;
  /** The holo's atmospheres toggle: gates the limb glow, the cloud decks and the tholin haze. */
  atmospheres?: boolean;
  /**
   * WHERE THE AURORA COMES FROM, and the two callers disagree — recorded as inbox B117 rather than
   * unified silently here. 'model' reads the published `aurora/*` TAG through `deriveAppearance`
   * (the gallery, and what the physics-drives-tags-drives-visuals rule asks for); 'physics' calls
   * `deriveAurora` directly (the live holo, as shipped). 'off' draws none.
   */
  aurora?: 'physics' | 'model' | 'off';
  /**
   * 'none' = the caller owns the orientation and applies it per frame (the holo composes tilt with
   * sidereal spin). 'axial' stamps the axial tilt once. 'showcase' is the gallery's review posture:
   * a cryovolcanic body is tipped south-pole-toward-camera so its jets spray at the viewer, a polar
   * vortex north-pole-toward-camera so the hexagon shows; everything else takes its axial tilt.
   */
  tilt?: 'none' | 'axial' | 'showcase';
  /** Texture anisotropy from the caller's renderer (`renderer.capabilities.getMaxAnisotropy()`). */
  anisotropy?: number;
  /** The class/true colour the caller has already resolved for this node. */
  colorHex?: number;
  /** `bodyStyle: 'flat'` swatch, when it differs from `colorHex`. */
  flatColorHex?: number;
  /** Sphere tessellation. Defaults: 32x24 filled, 16x10 lo-poly. */
  segments?: { width: number; height: number };
  /**
   * Star only: timed limb flares. Defaults to `flaresVisibly(node.tags)` — the tag decides, in one
   * place, rather than each caller reading it. Lo-poly never flares whatever this says.
   */
  starFlares?: boolean;
  /** Star only: `stellar/jets` and `stellar/shedding` strengths. */
  starJets?: 0 | 1 | 2;
  starShedding?: 0 | 1 | 2;
  /**
   * Star only: the corona, the flares and the outflow decorations. Default true.
   *
   * FALSE FOR A SIZE COMPARISON, and it is a correctness point rather than a taste one: the corona
   * is `radius * (5 + activity * 4)` across, so on a true-scale strip a star's glow reaches five
   * times its own width and reads as part of the object. A view whose whole claim is "this is how
   * big these things really are" cannot draw a halo that makes a star look nine times its diameter.
   * Seen live at 2026-09-05 on the starmap strip: the coronas overlapped into one grey wash and the
   * photospheres were the only honest thing on screen.
   */
  starDecorations?: boolean;
  /**
   * Called with the lit material BEFORE the mesh is made, so a caller can hang a shader hook on it
   * (the holo's eclipse shadow). Never fires for an unlit or wire body — there is no lighting to
   * darken.
   */
  onLitMaterial?: (mat: THREE.MeshStandardMaterial) => void;
}

/** Everything the per-frame loop needs, plus what has to be disposed. */
export interface BodyLook {
  /** The globe (or photosphere). The caller adds it to its own scene graph. */
  mesh: THREE.Mesh;
  /** Present for a star: corona, flares and outflow decorations, for `updateStarLook`. */
  star?: StarLookVisual;
  magma: EmissiveVisual[];
  plumes: EmissiveVisual[];
  lightning: LightningVisual[];
  aurora: { mat: THREE.Material & { opacity: number }; base: number; seed: number }[];
  clouds: { mesh: THREE.Mesh; drift: number }[];
  /**
   * The child names and material count this look actually built — the drift detector. A spec runs
   * one node through both callers' option sets and compares these, so the gallery and the holo
   * cannot silently grow different features again.
   */
  inventory: () => { children: string[]; materials: number };
  dispose(): void;
}

/** A stable per-node seed. The two old assemblies each rolled these inline, identically. */
function seedSum(id: unknown, mul = 1, mod = 997): number {
  let s = 0;
  for (const ch of String(id)) s = (s + ch.charCodeAt(0) * mul) % mod;
  return s;
}

/**
 * Assemble the look for one node at `radius` scene units.
 *
 * `radius` is the RENDERED radius and this function never questions it: true scale, readable scale
 * and the gallery's one-size-fits-all tile are all legitimate answers arrived at elsewhere.
 */
export function buildBodyLook(node: any, radius: number, opts: BodyLookOptions): BodyLook {
  const style: RenderStyle = opts.renderStyle ?? 'filled';
  const bodyStyle = opts.bodyStyle ?? 'textured';
  const isLopoly = style === 'lopoly-filled' || style === 'lopoly-lines';
  const segW = opts.segments?.width ?? (isLopoly ? 16 : 32);
  const segH = opts.segments?.height ?? (isLopoly ? 10 : 24);
  const atmospheres = opts.atmospheres ?? true;
  const auroraSource = opts.aurora ?? 'physics';
  const tiltMode = opts.tilt ?? 'none';
  const tex = opts.textures;
  const disposables: { dispose(): void }[] = [];
  const look: BodyLook = {
    mesh: null as unknown as THREE.Mesh,
    magma: [], plumes: [], lightning: [], aurora: [], clouds: [],
    inventory: () => ({ children: [], materials: 0 }),
    dispose() { for (const d of disposables) d.dispose(); }
  };
  const appear = deriveAppearance(node);
  const colorHex = opts.colorHex ?? new THREE.Color(node.apparentColorHex || '#8a8f99').getHex();

  if (node.roleHint === 'star') {
    // Photosphere: an emissive (unlit) textured sphere — granulation, spot groups and faculae from
    // the magnetic-activity strength — plus limb darkening, the cue that makes it read as a sphere.
    // Skipped under lo-poly, where flat facets are the point. No flatShading: a star is unlit, and
    // MeshBasicMaterial ignores normals and warns about the property.
    const activity = activityStrength(node.tags);
    const starMat = new THREE.MeshBasicMaterial();
    const st = new THREE.CanvasTexture(makeStarSurfaceTexture(colorHex, activity, String(node.id)));
    st.colorSpace = THREE.SRGBColorSpace;
    starMat.map = st;
    if (!isLopoly) applyLimbDarkening(starMat, 0.55);
    const sphere = new THREE.Mesh(new THREE.SphereGeometry(radius, segW, segH), starMat);
    disposables.push(starMat, st, sphere.geometry);
    // Corona + flares + outflow decorations, parented to the sphere so they track it. The corona is
    // a billboard and ignores the sphere's spin.
    if (opts.starDecorations !== false) {
      const star = buildStarLook(radius, colorHex, activity, seedSum(node.id, 13, 2147483647) || 1, tex.glow, {
        flares: !isLopoly && (opts.starFlares ?? flaresVisibly(node.tags)), jets: opts.starJets, shedding: opts.starShedding
      });
      sphere.add(star.group);
      look.star = star;
    }
    look.mesh = sphere;
    if (tiltMode !== 'none') applyTilt(sphere, appear, tiltMode);
    look.inventory = () => inventoryOf(sphere);
    return look;
  }

  // --- Everything that is not a star ------------------------------------------------------------
  const useUnlit = !!opts.unlit && !isLopoly;
  const mat = useUnlit
    ? new THREE.MeshBasicMaterial()
    : new THREE.MeshStandardMaterial({ roughness: 1, metalness: 0, flatShading: isLopoly });
  disposables.push(mat);
  if (bodyStyle === 'white') {
    mat.color.set(0xffffff);
  } else if (bodyStyle === 'flat') {
    mat.color.set(opts.flatColorHex ?? colorHex);
  } else {
    const texCanvas = getPlanetTextureEquirect(node); // true-colour procedural surface
    if (texCanvas) {
      const t = new THREE.CanvasTexture(texCanvas);
      t.colorSpace = THREE.SRGBColorSpace;
      t.wrapS = THREE.RepeatWrapping;   // wrap the longitude seam so u=0/u=1 blend
      if (opts.anisotropy) t.anisotropy = opts.anisotropy;
      mat.map = t;
      disposables.push(t);
    } else {
      mat.color.set(colorHex);
    }
    // Thermal EMISSION: a molten or incandescent surface glows of its own heat, so it shows against
    // space and on the night side. Nothing to emit onto in the unlit look.
    if (!useUnlit) {
      const emCanvas = getEmissiveEquirect(node);
      if (emCanvas) {
        const et = new THREE.CanvasTexture(emCanvas);
        et.colorSpace = THREE.SRGBColorSpace;
        if (opts.anisotropy) et.anisotropy = opts.anisotropy;
        const sm = mat as THREE.MeshStandardMaterial;
        sm.emissiveMap = et; sm.emissive = new THREE.Color(0xffffff); sm.emissiveIntensity = 1.15;
        disposables.push(et);
      }
    }
  }
  if (!useUnlit && opts.onLitMaterial) opts.onLitMaterial(mat as THREE.MeshStandardMaterial);

  const sphere = new THREE.Mesh(new THREE.SphereGeometry(radius, segW, segH), mat);
  disposables.push(sphere.geometry);
  const polF = appear.oblatePolarFactor;   // spin-axis flattening (E4)
  if (polF < 0.999) sphere.scale.set(1, polF, 1);
  look.mesh = sphere;
  if (tiltMode !== 'none') applyTilt(sphere, appear, tiltMode);

  // NB the lo-poly LINES overlay (glowing edges + vertex dots) is NOT built here. Its dot size comes
  // from the size law bound to the live dial (`scaleWireDotSize`), and RENDER-S11 forbids restating
  // that arithmetic outside the law's bindings — so the one caller that uses the style adds the
  // overlay itself, on the mesh this function returns.

  // An unlit body has no lighting to darken and no night side to glow against, so it takes none of
  // the emissive features — that is the holo's "2D map" look, not an omission.
  if (useUnlit) { look.inventory = () => inventoryOf(sphere); return look; }

  // AURORA: one additive shell per emitting gas, stacked at its physical ALTITUDE (purple N2 fringe
  // low, green O main, crimson O crown high) and fading independently, so at any moment the sky
  // shows one colour or several rather than a merged white.
  if (auroraSource !== 'off') {
    const strength = auroraSource === 'model' ? (appear.aurora?.strength ?? 0) : deriveAurora(node).strength;
    if (strength > 0.06) {
      const ems = auroraSource === 'model'
        ? (appear.aurora!.emitters.length ? appear.aurora!.emitters : [{ colorHex: appear.aurora!.coreHex, weight: 1, altitude: 1 }])
        : auroraEmitters(node).map((m) => ({ colorHex: m.hex, weight: m.weight, altitude: m.altitude }));
      const seed = seedSum(node.id);
      ems.forEach((e, i) => {
        const built = buildAuroraShell(radius, e.colorHex, strength, e.weight / ems[0].weight, e.altitude);
        sphere.add(built.shell);
        look.aurora.push({ mat: built.mat, base: built.base, seed: (seed / 997 + i * 0.31) % 1 });
        disposables.push(built.mat, built.shell.geometry);
      });
    }
  }

  // Volcanism: additive hot-spot vents that flicker like heat (a lava world reads white-hot, a
  // hotspot world a few orange). Cryovolcanism: icy plume jets from a pole, thrown far on a
  // low-gravity world. Both parented to the sphere, so they turn with the surface.
  if (appear.magma) {
    const built = buildMagmaVents(radius, appear.magma, String(node.id), tex.hotspot);
    sphere.add(built.group); look.magma.push(...built.visuals);
  }
  if (appear.cryoPlumes) {
    const built = buildCryoPlumes(radius, appear.cryoPlumes, String(node.id), tex.plume);
    sphere.add(built.group); look.plumes.push(...built.visuals);
  }
  // Storms firing INSIDE the cloud deck — the tag says a world has the convection for lightning,
  // the clouds are what it lights up, so a deck is a precondition.
  const storms = lightningStrength(node.tags);
  if (storms > 0 && (appear.clouds || appear.cloudDecks.length)) {
    const deckHex = appear.cloudDecks.at(-1)?.colorHex ?? appear.clouds?.colorHex ?? '#e8eef8';
    let lseed = 5; for (const ch of String(node.id)) lseed = (lseed * 31 + ch.charCodeAt(0)) & 0xffffff;
    const built = buildLightning(radius, deckHex, storms, lseed || 1, tex.glow);
    sphere.add(built.group); look.lightning.push(...built.visuals);
  }
  // A brown dwarf / hot young sub-stellar body radiating its own heat: a dim halo coloured by the
  // emission temperature. Not gated on the atmospheres toggle — it is the body, not its air.
  if (appear.selfLumGlow) sphere.add(buildSelfLumGlow(radius, appear.selfLumGlow.colorHex, tex.glow));
  // Atmosphere limb-glow: a thin Fresnel halo hugging the silhouette, coloured by the air or haze.
  if (appear.atmGlow && atmospheres) sphere.add(buildAtmoGlow(radius, appear.atmGlow.colorHex, appear.atmGlow.strength));
  // Cloud deck: a translucent shell above the surface that DRIFTS on its own. A world with a derived
  // deck STACK gets one shell per deck; a giant, or anything with no stack, keeps the single baked
  // deck — a giant's clouds ARE its surface, so floating shells read wrong on it.
  if (appear.clouds && atmospheres) {
    const cseed = seedSum(node.id, 7, 2147483647);
    const cl = (!appear.clouds.giant && appear.cloudDecks.length > 1)
      ? buildDeckStack(radius, appear.cloudDecks, cseed || 1)
      : buildCloudDeck(radius, appear.clouds.colorHex, appear.clouds.colorHex2, appear.clouds.coverage, cseed || 1, appear.clouds.giant);
    sphere.add(cl.group); look.clouds.push(...cl.layers);
  }
  // Titan's smog is a HIGH haze — outside the cloud shells, not baked into the surface.
  if (appear.tholin?.atmospheric && atmospheres) sphere.add(buildTholinHaze(radius, appear.tholin.colorHex, appear.tholin.strength));

  look.inventory = () => inventoryOf(sphere);
  return look;
}

/**
 * Stamp an orientation on the globe. 'showcase' is the gallery's review posture and exists because a
 * feature that vents from a pole is invisible on an upright body: it tips the pole toward the camera
 * so the jets spray at the viewer, and the sphere still spins about that (now tilted) axis, so the
 * jets stay put while the surface turns.
 */
function applyTilt(sphere: THREE.Mesh, appear: ReturnType<typeof deriveAppearance>, mode: 'axial' | 'showcase'): void {
  if (mode === 'showcase' && appear.cryoPlumes) sphere.quaternion.setFromAxisAngle(new THREE.Vector3(1, 0, 0), -1.15);
  else if (mode === 'showcase' && appear.polarVortex) sphere.quaternion.setFromAxisAngle(new THREE.Vector3(1, 0, 0), 0.95);
  else sphere.quaternion.setFromAxisAngle(new THREE.Vector3(0, 0, 1), (appear.axialTiltDeg * Math.PI) / 180);
}

/**
 * The look's FEATURE INVENTORY: the sorted three.js type names of everything hanging off the globe,
 * and how many distinct materials are in play. Two callers building one node with the same options
 * must produce the same inventory — that is the whole assertion, and it is what stops the gallery
 * and the holo drifting apart again.
 */
function inventoryOf(root: THREE.Object3D): { children: string[]; materials: number } {
  const children: string[] = [];
  const mats = new Set<THREE.Material>();
  root.traverse((o) => {
    if (o !== root) children.push(o.type);
    const m = (o as any).material;
    if (m) (Array.isArray(m) ? m : [m]).forEach((mm: THREE.Material) => mats.add(mm));
  });
  return { children: children.sort(), materials: mats.size };
}
