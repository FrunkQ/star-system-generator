import type { System, CelestialBody, RulePack, ID } from '../types';

/**
 * Interface for any service that can generate a Star System.
 * This allows swapping the default procedural generator for other types 
 * (e.g., specific scientific models, empty templates, or scenario-based generators).
 */
export interface ISystemGenerator {
    /**
     * Generates a new star system.
     * @param seed The random seed for deterministic generation.
     * @param rulePack The configuration data driving the generation.
     * @param options Optional generation parameters (e.g., star type overrides).
     */
    generate(seed: string, rulePack: RulePack, options?: any): System;
}

/**
 * Interface for the factory responsible for instantiating Celestial Bodies.
 * Centralizes the logic for creating nodes to ensure consistency between
 * the generator and the manual editor.
 */
export interface IBodyFactory {
    /**
     * Creates a basic, initialized Celestial Body.
     * @param config Configuration object for the body.
     */
    createBody(config: BodyCreationConfig): CelestialBody;
    
    /**
     * Creates a body from a specific template defined in the RulePack.
     */
    createFromTemplate(templateId: string, rulePack: RulePack): CelestialBody;
}

/**
 * Interface for the post-processing service.
 * This service "breathes life" into the system by calculating physics, 
 * temperatures, and zones based on the structural data.
 */
export interface ISystemProcessor {
    /**
     * Recalculates all derived physical properties (zones, temps, etc.) for the system.
     * Should be called after Generation and after any Manual Edit.
     * @param system The system to process.
     * @param rulePack The rule definitions to use for calculations.
     */
    process(system: System, rulePack: RulePack): System;
}

export interface BodyCreationConfig {
    name: string;
    roleHint: 'star' | 'planet' | 'moon' | 'barycenter' | 'construct' | 'belt' | 'ring';
    parentId: ID | null;
    seed?: string; // For procedural generation
    massKg?: number;
    radiusKm?: number;
    // Add other optional overrides here
}
