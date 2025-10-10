// ===== api.ts =====
// This file is the public API for the star system generator.
// It re-exports the main functions from the other modules.

import type { System, RulePack, ID, CelestialBody, Barycenter, BurnPlan, Orbit, Expr } from "./types";

import { deleteNode, addPlanetaryBody, renameNode, getValidPlanetTypesForHost, addHabitablePlanet } from './system/modifiers';

// Main generation function
export { generateSystem } from './generation/system';

// GM editing functions
export { deleteNode, addPlanetaryBody, renameNode, getValidPlanetTypesForHost, addHabitablePlanet, classifyBody };
export { computePlayerSnapshot, propagate, rerollNode, applyImpulsiveBurn } from './system/utils';

export interface GenOptions { maxBodies?: number; }