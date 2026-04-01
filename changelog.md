# Changelog

All notable changes are listed here:


## v1.9.3 - 24th Mar 2026
- Data Unification & Editor Features:
  - Unified Star and Planet data structures into a single cohesive `CelestialBody` type, simplifying physics processing and resolving TS errors.
  - High mass planets (Brown Dwarfs) can now be "Ignited" into stars directly within the UI.
  - Low mass stars can be "Doused" back into planets directly within the UI.
  - Added "Rebuild Hierarchy" button to System View. When mass edits fundamentally shift the system's center of mass (e.g. creating a massive star), this button flattens and fully rebuilds the orbital parent-child chains relative to the new heaviest body.
- Terminology & Unit Standardization:
  - Standardized acceleration units to lowercase **"g"** (9.81 m/s²) across tech details, and hazard messages.
- Time Control System Enhancements:
  - Added **"Manual Speed"** mode (speed dial) allowing for persistent integration rates and reversible playback. Like OLD system.
  - New live **Speed Indicator** (e.g., +1s/s to +10y/s) providing real-time feedback during scrubbing.
  - Increased scrubber precision with a 50% wider slider and unified logic across System and Starmap views.
- Printed Report Improvements (Binary Systems):
  - Implemented hierarchical **stacked rendering** for binary planets in the System Overview diagram.
  - Enclosed binary pairs within a detailed **Barycenter Info Block** in the Celestial Survey for better organization.
  - Added dynamic unit scaling: small orbital distances now automatically switch from **AU** to **km** for readability.
- Bug Fixes & UI Polish:
  - Improved flyby math to correctly calculate zero Delta-V intercepts for unpowered flypasts.
  - Unified "About" dialogs into a single, maintainable component.

## v1.9.2 - 24th Mar 2026
- N-Body Gravitational Summation:
  - Transit solvers now sum gravitational forces from all massive bodies (Stars, Planets, Barycenters) for realistic ballistic drift.
  - Replaces single-body Keplerian assumptions with full integrated pathing for all mission types.
- Trajectory Correction Manoeuvres (TCM):
  - Automatic drift tracking injects discrete TCM burn points if n-body perturbations exceed 100km.
  - Compact, color-coded timeline labels and trajectory markers signal manoeuvre intensity (Blue/Orange/Red) based on Max-G.
  - TCMs now correctly consume fuel and contribute to total mission delta-V.
- Planner UI & Stability:
  - "Transit Tags" summary box added to mission stats for better awareness of aerobraking, TCMs, and high-G status.
  - Direct Burn profile state (Accel/Coast/Brake) is now persistent and decoupled from ballistic plan states.
  - Fixed various "ReferenceError" and "Shadowing" bugs in the transit calculation engine.

## v1.9.1 - 15th Mar 2026
- Torch-Ship Kinematic Simplification:
  - Bypassed Lambert solver artifacts for high-thrust "Direct Burn" plans.
  - Eliminates "2000c" speed-of-light errors in favour of robust kinematic straight-line profiling.
- Lowest Common Ancestor (LCA) frame selection for transits:
  - ensures transfers in multi-star systems use the correct gravitational host,
  - fixes "40 AU loop" bug where binary star transits default to system barycenter.
- Smart Target Redirection:
  - Interplanetary moon transfers now automatically target the parent planet's gravity well while maintaining moon-radius capture.
  - Fixes "dive into the star" bug for local stellar constructs.
- Expanded Lagrange point support (L1-L5):
  - added L1, L2 (radial offsets) and L3 (hidden co-orbital),
  - co-orbital framing ensures L-points are tracked in the host's parent frame.
- Transit intercept accuracy and stability:
  - Fixed "missed intercept" bug: solvers now target actual $(x, y)$ node coordinates at arrival rather than just orbital radius.
  - Stability filter overhaul: removed hard 100km/s cap, increased to 10,000 km/s insanity check to support high-G ship jumps.
  - Forced direct-path (short-way only) for Speed/Direct Burn plans to prevent unrealistic looping arcs.
  - Improved station/construct state resolution: orbiting constructs correctly resolve positions even without explicit orbit objects.
- UI/UX refinements:
  - New "Major Target -> Sub-Target" dropdown workflow in Transit Planner.
  - Improved hidden-plan reason messages in the UI.
  - Added internal transit debug logging to developer console.

## v1.9.0 - 24th Feb 2026
- New time system foundations are in place:
  - Display Time and Actual Time are now separate and can be aligned/reset.
  - Time scrub/play controls now drive system visuals and orbit updates.
  - Calendar/time settings are saved with each starmap.
- Calendar system is now data-driven and extensible:
  - calendars are loaded from data,
  - new calendars can be added/edited,
  - legacy saves are migrated safely.
- Transit planner reliability pass:
  - short/local transfers (planet/moon) now use correct local reference frames,
  - Direct Burn now solves for a feasible duration instead of producing impossible spike values,
  - orbit targeting now respects selected arrival orbit level (LO/MO/HO),
  - Brake-at-arrival now targets orbital tangential velocity instead of assuming stationary capture,
  - flypast velocity now carries correctly into the next leg for all route types,
  - local launch-window search no longer suggests absurd long waits for moon transfers,
  - route label updated: `Efficient Alt` -> `Efficient Now`.
- Transit visuals improved:
  - during preview/execution, the focused construct moves along the route,
  - optional vector overlay added (single `Show Vectors` toggle) for velocity/acceleration.
- Habitable Zone model refreshed and old Goldilocks logic replaced with conservative modern HZ edges.
- Zone rendering performance improved (screen-space draw path, culling, and cheaper dash behavior).
- StarMap settings and LLM settings reorganized:
  - StarMap settings consolidated,
  - LLM/API settings moved to separate local-only config (not exported).
- Time-driven transit scheduling shipped:
  - `Schedule Journey` now writes planned routes into each construct's own ship log data,
  - planned routes persist with constructs in saved systems/starmaps,
  - multiple constructs can move concurrently from scheduled plans.
- Ship's Log shipped in System View:
  - shows journey windows and per-leg departure/destination entries,
  - includes controls to clear future plans and cancel active (+future) plans.
- Transit intercept and stability improvements:
  - moving construct targets are available in planner target lists,
  - intercept solving now uses live kinematic target state (position + velocity),
  - direct-burn sanity filters reduce unstable/crazy solutions for moving targets - these WILL happen

## v1.8.4 - 20th Feb 2026
- Temperature model refresh (cryo greenhouse behavior, improved range presentation, tidal hotspot handling).
- Printable report overhaul with compact system diagram and multi-star hierarchy fixes.
- QoL updates including invert display mode, finer atmosphere composition editing, and Traveller import edge-case fixes.

## v1.8.1 - 14th Feb 2026
- Scaled starmap mode with persistent map mode/scale controls.
- Route-based map rescaling workflow.
- Draggable systems with live route distance updates in scaled mode.
- Scale bar integration and placement consistency updates.

## v1.8.0 - 14th Feb 2026
- Orbital stability post-processing (overlap + Hill-spacing proxy) with calibrated severity tiers.
- Dedicated orbital stability technical-details UI block and tags integration.

## v1.7.2 - 14th Feb 2026
- Transit planner GM override flow (`Force Journey`) for blocked plans.
- Name filtering in system summary context menus.
- PWA install/offline support and update prompt behavior.

## v1.7.1 - 14th Feb 2026
- IndexedDB starmap persistence migration from localStorage.
- High-e orbit/camera stability improvements and Kepler propagation hardening.
- Orbit editing guardrails and Lagrange placement correction.

## v1.7.0 - 24th Jan 2026
- Traveller integration (subsector import, UWP entry, extended decoding, PBG population logic).
- Global atmosphere editor and related physics/placement integrity updates.
- Broad UI/UX polish across starmap/system flows.

## v1.6.0 - 21st Jan 2026
- Sensor suite data model/editor/overlay implementation.
- Save redaction workflow for player-safe exports.
- Habitability and Earth-temperature calibration refinements.

## v1.3.4 (14th Jan 2026)
- Brown dwarf support expansion and procedural realism upgrades.
- Binary dynamics and orbital mechanics improvements (including retrograde support).
- Multiple UI/UX stability fixes.

## v1.3.3 (13th Jan 2026)
- Documentation/tutorial improvements and sync/performance fixes.
- Critical starmap/system relink bug fix.
