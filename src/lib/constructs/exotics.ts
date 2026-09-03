// EXOTICS — the capability vocabulary for non-standard objects (G58, N1).
//
// The owner's stop/think, 2026-08-31: *"we have all the elements but we are combining them
// haphazardly... rather than building an if/then/else rat's nest... create a new manageable
// subsystem."* One record per exotic type DECLARES what it is; consumers switch on declarations
// instead of testing type keys, `kind`, or scattered flags. `nonstandard-objects-design.md` holds
// the full case, the thirteen-seam probe, and the phasing; the owner's four §8 answers are LAW
// here:
//   1. The system is named EXOTICS. (`MegaTypeDef` keeps its name until the N2/N3 flips touch its
//      import sites — the DATA-R31 as-touched migration, not a 20-file rename commit.)
//   2. PACKS INSTANTIATE, THEY DO NOT REMIX: a rule pack picks a registered type and sets params;
//      capability blocks are CODE, never pack data. (Owner's call — simpler support surface; a new
//      behaviour combination is an app release, deliberately.)
//   3. Edit panels declare COARSE GROUPS, split only when two types disagree.
//   4. The four outstanding visual tweaks ride the N2 seam flips, not ad-hoc wiring.
//
// PLACEMENT GATES ARE ALREADY RECORD-OWNED, and the owner's note makes them officially part of
// this vocabulary: `requires` (hard greys / steer explains, UI-B2), `allowedPlacements`, and
// `explain` on the record ARE the placement capability — where a type is offered, and whether it
// shows available or greyed there (a space elevator in deep space is GREYED WITH A SENTENCE, never
// hidden without one). They predate this file and stay where they are; nothing may duplicate them.
//
// N1 SCOPE — DECLARE + PARITY, ZERO BEHAVIOUR CHANGE. Every axis below is consumed TODAY by
// `exoticsParity.spec.ts`, which pins each declaration to the legacy behaviour it will replace.
// That is deliberate and load-bearing: the board's own criticism of `secretDefault` ("a second
// unconsumed field is a second thing that looks implemented") applies to us first. For the same
// reason, axes where ALL SEVEN types currently agree are OMITTED until a second value exists —
// a capability earns its axis when two types disagree, not before:
//   - `ui.menu` (all seven enter via the construct picker) — arrives with N5's body-side exotics.
//   - `ui.panels` groups (all seven get the same construct tabs) — arrives with phase 5's honesty
//     gate, the first type to disagree.
//   - `lod` (all seven use the hull pixel-LOD; §5b.5's belt-LOD intent is an N2 item).
//   - `disclosure` — arrives with the phase-5 flip (N3), which is what will consume it.
//   - declared tag `outputs` (the owner's "occluded by ring" ask) — arrives with the N2 flux flip
//     that emits them.
//
// N2 CONTRACT: when a consumer seam flips, it reads THESE fields and the flag or key-test it
// replaces is deleted in the same commit (DATA-R33). A new per-type `if` in a consumer after its
// seam has flipped is the fork this system exists to prevent.

/** How this type's APPARENT GRAVITY figure is derived — the owner's own example of one quantity
 *  with several honest wirings (design §1). Values map to what `derive()` publishes today:
 *  - 'own-rotation': ω²r from the type's own rotation param at its own radius (`spinGravityMs2`).
 *    NOTE the owner's orbital-ring refinement — rotation about a host should really be netted
 *    against the host's pull (ω²r − GM/r², zero at orbital rate). That CHANGES displayed numbers,
 *    so it is an owner decision scheduled with the N2 crew-tab flip, not smuggled into N1 parity.
 *  - 'spin-section': a separate habitat ring on a hull (`spinRadiusM` + `rotation_period_hours`) —
 *    ordinary stations; no registry type uses it yet but the crew tab serves it today.
 *  - 'surface': GM/r² of the object's own mass (`surfaceGravityMs2`) — the Death Star.
 *  - 'none': no meaningful figure; panels show nothing rather than a number without meaning. */
export type ExoticApparentG = 'own-rotation' | 'spin-section' | 'surface' | 'none';

/** What this type does to STARLIGHT (G53 phase 4's chain). 'isotropic' dims every body outside
 *  its radius; 'band' dims only what aligns with its plane (`occlusionBandWidthKm` beside
 *  `starOcclusion` in derive()). `amplifies` is RESERVED for the soletta (design §3): a mirror's
 *  target receives MORE than inverse-square, which falsifies receivedLuminosityWatts's dims-only
 *  clamp — declaring it here is what will force that clamp honest in N4. */
export interface ExoticFlux {
	occludes?: 'isotropic' | 'band';
	amplifies?: 'target';
}

/** How the 3D scene builds and anchors it — the axis behind scene.ts's `megaCentred`/`megaTether`
 *  flags and the geometry family switch. 'host-centred' encloses its host (RENDER-S44);
 *  'surface-stand' is stood on its anchor and turns with the world; 'node' sits where its orbit
 *  says, like any hull. */
export interface ExoticRender3d {
	generator: 'sphere-section' | 'tether' | 'hull';
	anchor: 'host-centred' | 'surface-stand' | 'node';
}

/** How the 2D orrery draws it: 'orbit-line' = the structure IS its own coloured orbit path with
 *  the glyph kept on top as the click target (v3.0.211, `isMegaRing`'s rule); 'glyph' = marker
 *  only. */
export interface ExoticRender2d {
	/** 'orbit-line': the node's own orbit line IS the structure (sphere-sections, centred on the
	 *  host at their radius). 'radial': a line from the host's drawn edge out to a declared altitude
	 *  (a tether - dock at geo, counterweight above), the plan view's beanstalk. 'glyph': marker only. */
	structure: 'orbit-line' | 'glyph' | 'radial';
}

/** Which SHOT a click takes (computeBase's three construct branches, named): 'annulus' = the belt
 *  shot, structure AND host in frame (v3.0.232); 'surface-host' = frame the host world close-up
 *  with the construct dead centre; 'point' = the ordinary construct shot. */
export type ExoticFraming = 'annulus' | 'surface-host' | 'point';

export interface ExoticCapabilities {
	apparentG: ExoticApparentG;
	/** Absent = touches no starlight (the planetary torus: it circles a PLANET and shades nothing
	 *  the flux chain models — what it does to its host's own moons is a recorded open question). */
	flux?: ExoticFlux;
	render3d: ExoticRender3d;
	render2d: ExoticRender2d;
	framing: ExoticFraming;
}
