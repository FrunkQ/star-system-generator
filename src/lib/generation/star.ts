// src/lib/generation/star.ts
import type { CelestialBody, RulePack, ID } from '../types';
import { SeededRNG } from '../rng';
import { weightedChoice, randomFromRange } from '../utils';
import { SOLAR_MASS_KG, SOLAR_RADIUS_KM } from '../constants';

// Generates a star object, but not its name, which is determined by the system context.
export function _generateStar(id: ID, parentId: ID | null, pack: RulePack, rng: SeededRNG, starTypeOverride?: string): CelestialBody {
    const starTypeTable = pack.distributions['star_types'];
    const starClass = starTypeOverride ?? (starTypeTable ? weightedChoice<string>(rng, starTypeTable) : 'star/G2V');
    const starTemplate = pack.statTemplates?.[starClass] || pack.statTemplates?.['star/default'];

    let starMassKg = SOLAR_MASS_KG;
    let starRadiusKm = SOLAR_RADIUS_KM;
    let starTemperatureK = 5778;
    let starMagneticField;

    if (starTemplate) {
        starMassKg = randomFromRange(rng, starTemplate.mass_solar[0], starTemplate.mass_solar[1]) * SOLAR_MASS_KG;
        starRadiusKm = randomFromRange(rng, starTemplate.radius_solar[0], starTemplate.radius_solar[1]) * SOLAR_RADIUS_KM;
        starTemperatureK = randomFromRange(rng, starTemplate.temp_k[0], starTemplate.temp_k[1]);
        if (starTemplate.mag_gauss) {
            starMagneticField = { strengthGauss: randomFromRange(rng, starTemplate.mag_gauss[0], starTemplate.mag_gauss[1]) };
        }
    }

    const radiationOutput = starTemplate?.radiation_output ? randomFromRange(rng, starTemplate.radiation_output[0], starTemplate.radiation_output[1]) : 1;

    const starImage = pack.classifier?.starImages?.[starClass];

    return {
        id: id,
        parentId: parentId,
        name: "", // Name is set by the caller
        kind: 'body',
        roleHint: 'star',
        classes: [starClass],
        massKg: starMassKg,
        radiusKm: starRadiusKm,
        temperatureK: starTemperatureK,
        magneticField: starMagneticField,
        radiationOutput: radiationOutput,
        image: starImage ? { url: starImage } : undefined,
        tags: [],
        areas: [],
    };
}
