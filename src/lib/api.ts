// ===== api.ts =====
// This file is the public API for the star system generator.
// It re-exports the main functions from the other modules.

import type { System, RulePack, ID, CelestialBody, Barycenter, BurnPlan, Orbit, Expr } from "./types";

// Main generation function
export { generateSystem } from './generation/system';

// GM editing functions
export { deleteNode, addPlanetaryBody, renameNode, getValidPlanetTypesForHost } from './system/modifiers';

// Other utility functions
export { classifyBody } from './system/classification';
export { computePlayerSnapshot, propagate, rerollNode, applyImpulsiveBurn } from './system/utils';

export interface GenOptions { maxBodies?: number; }