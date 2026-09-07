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
import { magnetopauseOutlineRadii, magnetosphereConstants, readableStandoffRadii, readableTailRadii } from '$lib/physics/magnetosphere';
import { tokenColor } from '$lib/rendering/colors';
import { activityStrength, flaresVisibly } from '$lib/physics/stellarActivity';
import { jetStrength, sheddingStrength } from '$lib/physics/stellarOutflows';
import {
  buildMagmaVents, buildCryoPlumes, buildSelfLumGlow, buildAtmoGlow, buildCloudDeck, buildTholinHaze,
  buildDeckStack, buildLightning, buildAuroraShell, applyLimbDarkening, buildStarLook,
  buildMagnetosphereBubble, buildBeltTorus,
  makeStarSurfaceTexture, buildHorizonLook, buildStarRim, isBlackHoleNode, isFeedingBlackHole,
  type StarLookVisual, type LightningVisual, type EmissiveVisual
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
   * G82: draw the body's MAGNETOSPHERE - the revolved Shue boundary with its shielded region nested
   * inside, plus the trapped belt on the magnetic axis. Default OFF everywhere, because it is a GM's
   * analytical overlay rather than part of what a world looks like; the holo turns it on from the GM
   * View checkbox and a player view from its preset, both through `drawsHeavy` so Low Power drops it.
   */
  magnetospheres?: boolean;
  /**
   * ONE BODY RADIUS, IN SCENE UNITS, FOR THE BUBBLE ONLY. Defaults to the globe's own `radius`,
   * which is right for an isolated body (the gallery, the size comparison, a portrait) where the
   * frame holds nothing else to lie about.
   *
   * IT IS SEPARATE FROM `radius` BECAUSE A FLOORED RADIUS MULTIPLIED IS NOT A FLOOR - the same fault
   * the orrery hit and RENDER-S56 records. In a SYSTEM view a planet is drawn hundreds of times its
   * true size relative to its orbit; multiply that by a twenty-standoff tail and the bubble is bigger
   * than the system, additively white over everything. The caller that knows the frame caps it - the
   * holo at the body's Hill sphere, exactly as the 2D overlay does - and hands the result in here.
   */
  magnetosphereUnit?: number;
  /**
   * THE ANIMATED EXTRAS THAT HAVE NO SWITCH OF THEIR OWN: storm lightning, magma glow and cryo
   * plumes. Default ON, so nothing changes for a caller that has not asked.
   *
   * Why these three and not the auroras: an aurora already has its own control on a preset, and one
   * switch that silently swallowed another's job would make the second look broken - the same rule
   * `presetTypes.ts` states where `atmospheres` deliberately leaves `auroras` alone. These three had
   * NO control anywhere, which is why the owner could turn low power on and still watch a planet
   * flashing at him: *"low power mode does not yet turn off auroras and lightning flashes on the
   * size comparison"*.
   *
   * It gates the BUILD rather than the animation, and it has to: a frozen bolt is worse than a
   * flashing one - it leaves a permanent lightning strike painted on the cloud tops.
   */
  dynamics?: boolean;
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
  /**
   * Star only: `stellar/jets` and `stellar/shedding` strengths. Default to `jetStrength(node.tags)` and
   * `sheddingStrength(node.tags)` - the TAG decides, in one place, exactly as flares do above (G76). The
   * 3D starmap passes its glyph record's numbers explicitly; every other caller inherits the tag's. Until
   * this defaulted, a jetted star read as jetted on the map and as an ordinary star inside its own system.
   */
  starJets?: 0 | 1 | 2;
  starShedding?: 0 | 1 | 2;
  /**
   * STAR only: a TIGHT additive bloom on the limb, so a photosphere reads as a light source rather
   * than as a painted disc. For a surface that has turned the full corona off — the size comparison
   * — and wants a star to look like a star anyway. See `STAR_RIM_SCALE` for why it is a fifth of a
   * radius and not the corona's nine.
   */
  starRim?: boolean;
  /**
   * STAR only: how far the photosphere burns out to WHITE at the centre of the disc, 0 to 1.
   *
   * DEFAULT 0, WHICH IS THE HOLO'S ANSWER AND DELIBERATE: there the corona does the work of saying
   * "this is a light source", and the owner is happy with how a star looks at system level. On a
   * surface that has turned the corona OFF the disc has to carry that impression alone, and a flat
   * chromaticity disc cannot - see the note in `applyLimbDarkening` for why the white core is the
   * more honest picture as well as the brighter one.
   */
  starCore?: number;
  /**
   * BLACK HOLE only: draw the thin photon ring that makes a horizon findable against black.
   *
   * FALSE (the default) for a surface with a gravitational-lensing pass — there the shader draws
   * the ring for real and a painted one would be a second, wrong answer. TRUE for a surface with no
   * lensing, which is the size comparison: a pure black sphere on a black backdrop is a labelled
   * hole in the strip.
   */
  photonRing?: boolean;
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
   * G82: the field bubble, and it is DELIBERATELY NOT A CHILD OF `mesh`. A magnetopause is oriented by
   * the WIND, so it must not inherit the globe's axial tilt or its per-frame spin - Earth's bubble does
   * not turn once a day. The caller parents this to the body's POSITION and calls `aim` with the
   * direction of whatever is blowing on it (the star, or the host for a moon inside its host's field).
   * Absent when the body has no bubble, or when the option is off.
   */
  field?: { group: THREE.Group; aim: (dir: THREE.Vector3) => void; /** the READABLE nose actually drawn, in body radii */ noseScene: number };
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
  const dynamics = opts.dynamics !== false;
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

  // A BLACK HOLE IS NOT A STAR, whatever its `roleHint` says, and it has to be tested FIRST.
  // Every black hole in this app carries `roleHint: 'star'`, so without this branch it goes down the
  // photosphere path and draws as a glowing orange ball with a granulation texture — which is what
  // the size-comparison strip did until 2026-09-06. The horizon look is shared with the live holo
  // and the reference gallery (`buildHorizonLook`); what those two add on top of it — the lensing
  // pass and the temperature-graded accretion disc — are SCENE effects rather than a body's look,
  // and stay with them (RENDER-S53's line, applied to the one case that tested it).
  if (isBlackHoleNode(node)) {
    const horizon = buildHorizonLook(radius, { photonRing: opts.photonRing, feeding: isFeedingBlackHole(node) });
    disposables.push(horizon);
    look.mesh = horizon.mesh;
    if (tiltMode !== 'none') applyTilt(horizon.mesh, appear, tiltMode);
    look.inventory = () => inventoryOf(horizon.mesh);
    return look;
  }

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
    if (!isLopoly) applyLimbDarkening(starMat, 0.55, opts.starCore ?? 0);
    const sphere = new THREE.Mesh(new THREE.SphereGeometry(radius, segW, segH), starMat);
    disposables.push(starMat, st, sphere.geometry);
    // Corona + flares + outflow decorations, parented to the sphere so they track it. The corona is
    // a billboard and ignores the sphere's spin.
    // The rim bloom goes on FIRST so it sits behind the photosphere in the transparent pass.
    if (opts.starRim) {
      const rim = buildStarRim(radius, colorHex, tex.glow);
      sphere.add(rim.sprite);
      disposables.push(rim);
    }
    // WHAT A STAR *DOES* SURVIVES `starDecorations: false`; WHAT MAKES IT LOOK BIGGER DOES NOT.
    // That switch used to be all-or-nothing, and it conflated three different things - the halo, the
    // flares, and the outflows. The owner asked for the third on the size comparison
    // (*"would be nice if those jets appeared on the stars that need them"*) and it could not be had
    // without the first. Now the halo and the flares answer to `starDecorations` and the OUTFLOWS
    // answer only to the tags, so a true-scale view gets a jetting star that still measures true.
    const jets = opts.starJets ?? jetStrength(node.tags);
    const shedding = opts.starShedding ?? sheddingStrength(node.tags);
    if (opts.starDecorations !== false || jets || shedding) {
      const star = buildStarLook(radius, colorHex, activity, seedSum(node.id, 13, 2147483647) || 1, tex.glow, {
        corona: opts.starDecorations !== false,
        flares: opts.starDecorations !== false && !isLopoly && (opts.starFlares ?? flaresVisibly(node.tags)),
        jets,
        shedding
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
        // [[G82]] job 3: the oval's latitude is PUBLISHED now - the footprint of the last closed
        // field line - instead of nailed at 63 degrees for every world in the app. A body with no
        // magnetosphere block (an older save, mid-import) passes undefined and keeps the old ring,
        // which is the honest fallback: no worse than it was, and never a wrong claim.
        const built = buildAuroraShell(radius, e.colorHex, strength, e.weight / ems[0].weight, e.altitude, node.magnetosphere?.ovalColatDeg);
        sphere.add(built.shell);
        look.aurora.push({ mat: built.mat, base: built.base, seed: (seed / 997 + i * 0.31) % 1 });
        disposables.push(built.mat, built.shell.geometry);
      });
    }
  }

  // Volcanism: additive hot-spot vents that flicker like heat (a lava world reads white-hot, a
  // hotspot world a few orange). Cryovolcanism: icy plume jets from a pole, thrown far on a
  // low-gravity world. Both parented to the sphere, so they turn with the surface.
  if (appear.magma && dynamics) {
    const built = buildMagmaVents(radius, appear.magma, String(node.id), tex.hotspot);
    sphere.add(built.group); look.magma.push(...built.visuals);
  }
  if (appear.cryoPlumes && dynamics) {
    const built = buildCryoPlumes(radius, appear.cryoPlumes, String(node.id), tex.plume);
    sphere.add(built.group); look.plumes.push(...built.visuals);
  }
  // Storms firing INSIDE the cloud deck — the tag says a world has the convection for lightning,
  // the clouds are what it lights up, so a deck is a precondition.
  const storms = dynamics ? lightningStrength(node.tags) : 0;
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

  // THE MAGNETOSPHERE (G82 job 4), on every 3D surface at once because this is the one assembly -
  // the holo, the reference gallery and the size comparison (RENDER-S53). Two revolved surfaces from
  // the SAME profile function the orrery draws, so the map and the globe cannot disagree; plus the
  // trapped belt, which unlike the bubble DOES ride the magnetic axis and therefore lives in the spin
  // frame. Nothing here re-derives anything: every number is read off the published block.
  if (opts.magnetospheres) {
    const ms = node.magnetosphere;
    if (ms && ms.shape !== 'none' && ms.standoffRadii > 0) {
      const mc = magnetosphereConstants(null);
      const tag = (node.tags ?? []).some((t: any) => t.key === 'magnetic/anomalous')
        ? '--field-anomalous' : ms.shape === 'induced' ? '--field-belt' : '--field-cage';
      const cageHex = tokenColor(tag, ms.shape === 'induced' ? '#d9b8f0' : '#b48ad6');
      const beltHex = tokenColor('--field-belt', '#d9b8f0');
      // See `magnetosphereUnit`: the bubble is NOT drawn in the globe's floored radius unless the
      // caller says so, because a floor multiplied by 224 is not a floor.
      const fieldUnit = opts.magnetosphereUnit ?? radius;
      // THE 3D DRAWS THE READABLE STANDOFF, NOT THE PUBLISHED ONE, and that is the same choice this
      // view already makes about every globe in it (RENDER-S11). A bubble in inflated radii is bigger
      // than the system: Jupiter's is 838 radii long. The log map keeps the ORDER - which is what a
      // GM reads at a glance - and the true figure stays on the card and on the 2D map.
      const outerR0 = readableStandoffRadii(ms.standoffRadii, mc);
      const outerTail = readableTailRadii(outerR0, mc);
      const innerR0 = readableStandoffRadii(ms.closedFieldRadii, mc);
      const innerTail = innerR0 * mc.VIEW_TAIL_STANDOFFS;
      const bubble = buildMagnetosphereBubble(
        fieldUnit,
        // TAPERED, WHERE THE MAP LEAVES IT OPEN - and the reason is the third dimension rather than
        // taste. An open tail is a TUBE, and a camera that has drifted past its far end is "outside"
        // by any axial test while looking straight up the inside of it, which fills the screen:
        // measured 2026-09-07 with the camera at axial -1.33 against a tail ending at -1.27. Closing
        // it makes the volume well defined, so "am I inside?" has an answer - and it costs nothing to
        // look at, because the colour has already faded to black by then and black adds nothing under
        // additive blending. The 2D map keeps its open tail: there is no inside to be on a plane.
        magnetopauseOutlineRadii(outerR0, outerTail, mc, 32, true),
        innerR0 > 0
          ? magnetopauseOutlineRadii(innerR0, innerTail, mc, 32, true)
          : [],
        cageHex, beltHex,
        outerR0, outerTail, innerR0, innerTail, mc.FLARING_ALPHA, 32
      );
      disposables.push(bubble);
      look.field = {
        group: bubble.group,
        noseScene: outerR0,
        // The lathe puts the nose at +Y, so aiming is one rotation and the caller never needs to know
        // how the profile was built.
        aim: (dir: THREE.Vector3) => {
          if (dir.lengthSq() > 0) bubble.group.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.clone().normalize());
        }
      };
      // The belt: on the MAGNETIC axis, in the spin frame, leaning by the published dipole tilt about
      // its published (seeded, and admittedly unobservable) longitude. This is what makes an ice
      // giant's field visibly wrong-way-up.
      if (ms.beltPeakRadii && ms.ordered) {
        // The SAME unit as the bubble, or the belt would sit outside the boundary that contains it.
        const belt = buildBeltTorus(fieldUnit, ms.beltPeakRadii, ms.beltScaleRadii ?? ms.beltPeakRadii * 0.3, beltHex, 0.35);
        const lean = new THREE.Group();
        const lon = ((ms.dipoleLongitudeDeg ?? 0) * Math.PI) / 180;
        lean.rotation.set(0, lon, (ms.dipoleTiltDeg * Math.PI) / 180, 'YZX');
        lean.add(belt.mesh);
        sphere.add(lean);
        disposables.push(belt);
      }
    }
  }

  look.inventory = () => {
    const body = inventoryOf(sphere);
    if (!look.field) return body;
    // The bubble is a sibling rather than a child, so the drift detector has to be told about it -
    // otherwise a caller could grow or lose a magnetosphere and RENDER-S53's gate would not notice.
    const f = inventoryOf(look.field.group);
    return { children: [...body.children, ...f.children].sort(), materials: body.materials + f.materials };
  };
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
