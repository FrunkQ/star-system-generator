// A HoloStyle bundles every look-and-feel knob of the 3D view — the GPU filter, the toytown
// compression, the camera framing, the skybox — as ONE value the scene can be handed.
//
// IT IS NO LONGER A PRESET STORE. This file used to own a second one: seven STARTER_PRESETS, a
// `holo-presets` localStorage slot, and save/delete/load around it, from when a look was a thing a GM
// picked from a dropdown on the 3D view. Player Views absorbed all of that — a look is a PlayerPreset
// now, saved with the campaign — and the only thing still reading that storage key is
// `player/presets.migrateLocalHoloPresets`, which folds any old saved looks into the campaign once and
// then removes it. Deleted at A54; two of the dead starters were even named `projector` and
// `greenscreen`, the tools A42 removed.
//
// So what remains is a TYPE and a DEFAULT. If you are looking for where a look is stored, it is
// `player/presetTypes.ts` and the starmap, not here.
import type { FilterParamValues } from './filters/schema';

export interface HoloStyle {
  filter: string; // GPU post filter id (none / crt / night_vision / thermal)
  filterParams?: FilterParamValues; // per-filter controls (e.g. CRT phosphor colour)
  compression: number; // toytown 0 (true scale) .. 1 (fully compressed)
  angleDeg: number; // camera tilt from overhead (0 = top-down, 64 = 3/4)
  whole: boolean; // frame the whole system vs the focused body
  skybox: boolean; // background starfield
  beltDetail: number; // belt particle-budget quality 0..1 (performance; physics sets relative density)
  bodyStyle: 'textured' | 'flat' | 'white' | 'tint'; // colour selection ('tint' = legacy alias for white)
  render?: 'filled' | 'lopoly-filled' | 'lopoly-lines' | 'wire-glow' | 'wire-flat' | 'wire-glow-occ' | 'wire-flat-occ'; // solid vs 80s wireframe
  unlit?: boolean; // flat lighting (no terminator) — the efficient "2D map" look
  lensing?: boolean; // stylised gravitational lensing around black holes (§A13); default on (no BH = no-op)
  lockOverhead?: boolean; // pin the camera flat top-down (the "2D map" view) — never becomes a 3D view
  lockRotation?: boolean; // fix the heading: no spin by drag, and follow a focused body by PANNING
  auroras?: boolean; // show the emissive polar aurora shells (default on)
  beltStyle?: 'rocks' | 'band'; // belts/rings as tumbling rocks, or the GM orrery's flat grey band
  background: 'space' | 'green' | 'blue' | 'black'; // dark space, or a chroma-key colour for OBS
  bodySize: number; // 1 = readable (chunky) .. 0 = true physical scale
  grid: 'off' | 'plain' | 'scaled' | 'hex'; // ground reference: none / polar rings / scale rings / hex (hex is starmap-only; the system view treats it as plain)
  gridFalloff?: number; // G4: ground-grid distance fade, 0 (even, the default) .. 1 (bright centre, gone by the edge)
  gridDepth?: number;   // ground-grid depth curtain, 0 (flat, the default) .. 1 — the starmap's twin
  gridScaleAu?: number; // lattice cell in AU; 0/undefined = automatic decade ladder
  // Body-name text colour. The starmap has always drawn its names in the preset's ACCENT; this view
  // drew them in a fixed pale blue, so one highlighted map matched the theme and the other did not.
  // Undefined keeps the scene's own default, which is what a caller with no preset (BodyGraphic) wants.
  labelColor?: string;
  // G9: how the campaign's OWN charted systems are shown in this view's sky — 'off' (generic starfield
  // alone), 'true' (real direction/magnitude/colour), 'marked' (the same, with diffraction spikes and
  // names). The STAR LIST is data and arrives separately; only the choice is part of the look.
  constellations?: import('$lib/map/skyStars').SkyMode;
  constellationBoost?: number;      // 0 true brightness .. 1 backdrop faded, charted stars oversaturated
  constellationLabelSize?: number;  // name size in screen px; 0 = spikes without names
  orbitSpeed: number; // auto view-orbit: how fast the camera slowly circles the focused object (0 = static)
  // G5: orbit-line strength, 0..1, as a multiplier of each line's designed opacity. 1 is the look
  // this view has always had, so nothing moves until someone asks. Its reason is import-scale: a
  // 45-planet, 25-moon system buries its own map under 70 orbit lines.
  orbitOpacity?: number;
  labelSize?: number; // in-scene body-label font size in px (default 11)
  font?: string; // in-scene label font-family — inherited from the preset theme when set
  portrait?: string | null; // isolated-body key light in this star colour at a 3/4 angle (null = normal star lighting)
  fillFrac?: number; // close-up framing: object diameter as a fraction of the smaller viewport dimension.
                     // Omitted = the shared click-ladder default (0.5), which is right for a MAP, where a
                     // framed body wants room around it. An isolated portrait has no context to leave room
                     // for, so the info block asks for nearly the whole frame.
  portraitFixed?: boolean; // portrait light is WORLD-fixed (tidally-locked body) rather than camera-relative
}

export const DEFAULT_STYLE: HoloStyle = {
  filter: 'none',
  compression: 0.65,
  angleDeg: 64,
  whole: false,
  skybox: true,
  beltDetail: 0.6,
  bodyStyle: 'textured',
  background: 'space',
  bodySize: 1,
  grid: 'plain',
  gridFalloff: 0,
  gridDepth: 0,
  gridScaleAu: 0,
  orbitSpeed: 0,
  orbitOpacity: 1,
  labelSize: 11,
  render: 'filled',
  auroras: true,
  beltStyle: 'rocks'
};
