// Release masking — ONE switch per in-flight feature that is built but not yet shipping.
//
// The V2.2 line (the unified Player Views presentation system) lives in the codebase and is worked on
// continuously, but production ships the older Field Guide launcher until that line is ready. Rather
// than commenting call sites out and back in each cut, gate them here: flip the flag, nothing else.
//
// TO RESUME V2.2 BETA WORK: set PLAYER_VIEWS_ENABLED = true. That is the whole undo.
//
// Nothing is deleted or unreachable at build time — PlayerViewModal and the preset editor still compile
// and are still covered by their tests; only the ways IN are hidden.
export const PLAYER_VIEWS_ENABLED = false;
