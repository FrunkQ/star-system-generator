# Changelog

All notable changes are listed here:


## v1.9.0 - WIP (22nd Feb 2026)
- Global time/calendar foundation (UTRE-first pass), display/actual time model, and scrub/play controls.
- Data-driven calendar registry + save/migration support.
- HZ refresh:
  - replaced legacy Goldilocks with conservative modern HZ edges (Kopparapu-style),
  - eccentricity-aware habitability checks,
  - close-binary companion-flux adjustment (far binaries remain effectively separate).
- New StarMap Settings menu - most of the old "System Setting" in there alog with date stuff.
- LLM settings moved to own system menu (NB: Not exported with map - just local). 
- Incomplete: transit follow-up against the new temporal model is still pending.

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
