// Release masking — ONE switch per in-flight feature that is built but not yet shipping.
//
// The V2.2 line (the unified Player Views presentation system) lives in the codebase and is worked on
// continuously, but production ships the older Field Guide launcher until that line is ready. Rather
// than commenting call sites out and back in each cut, gate them here: flip the flag, nothing else.
//
// DO NOT DO THAT FOR V3 — the instruction below was correct for the V2.1 line and is now backwards.
// Historically: "to mask it again for a production cut, set PLAYER_VIEWS_ENABLED = false", which is
// what happened for the v2.1.3 release. PLAYER VIEWS IS NOT AN IN-FLIGHT FEATURE ANY MORE — IT IS
// WHAT V3 IS, the first line of the welcome list, and the thing the 3D view was built to serve.
// Setting this false at a V3 cut would hide the headline feature and restore the Field Guide and
// Projector, which the welcome list says V3 "replaces outright". See inbox E8.
// This flag should be DELETED, not flipped, once A42 removes those two surfaces — with nothing left
// to gate it is a flag with one branch (A42's own note).
//
// Nothing is deleted or unreachable at build time — PlayerViewModal and the preset editor still compile
// and are still covered by their tests; only the ways IN are hidden.
export const PLAYER_VIEWS_ENABLED = true;
