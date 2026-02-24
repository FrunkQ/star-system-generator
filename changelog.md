# Changelog

All notable changes are listed here:


## v1.9.0 - WIP (22nd Feb 2026)
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
- Remaining work for v1.9.0:
  - additional transit scheduling and multi-construct timeline work.

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
