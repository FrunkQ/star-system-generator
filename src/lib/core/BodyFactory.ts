import type { IBodyFactory, BodyCreationConfig } from './interfaces';
import type { CelestialBody, RulePack } from '../types';
import { generateId } from '../utils';

export class BodyFactory implements IBodyFactory {
    
    createBody(config: BodyCreationConfig): CelestialBody {
        const id = generateId(); // Use the existing utility for consistency
        
        const body: CelestialBody = {
            id: id,
            name: config.name,
            kind: config.roleHint === 'construct' ? 'construct' : 'body', // Simple mapping for now
            parentId: config.parentId,
            roleHint: config.roleHint,
            
            // Default Physical Properties (Avoid NaNs)
            massKg: config.massKg || 0,
            radiusKm: config.radiusKm || 0,
            axial_tilt_deg: 0,
            rotation_period_hours: 0,
            
            // Empty Complex Properties
            tags: [],
            classes: [],
            atmosphere: {
                name: "None",
                composition: {},
                pressure_bar: 0
            },
            hydrosphere: {
                coverage: 0,
                composition: 'water'
            },
            biosphere: null,
            magneticField: {
                strengthGauss: 0
            },
            
            // Orbit defaults (to be populated by placement logic)
            orbit: undefined
        };

        // Specific defaults based on Role
        if (config.roleHint === 'star') {
            body.surfaceTempK = 5778; // Default Sun-like
        }

        return body;
    }

    createFromTemplate(templateId: string, rulePack: RulePack): CelestialBody {
        // Placeholder for Phase 3: Template instantiation logic
        // This will eventually look up the template in the RulePack and hydration logic
        throw new Error("Method not implemented.");
    }
}

// Export a singleton instance for ease of use, 
// though dependency injection would be preferred in a larger app.
export const bodyFactory = new BodyFactory();
