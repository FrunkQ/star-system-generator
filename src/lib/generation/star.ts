// src/lib/generation/star.ts
import type { CelestialBody, RulePack, ID, Tag } from '../types';
import { SeededRNG } from '../rng';
import { weightedChoice, randomFromRange } from '../utils';
import { SOLAR_MASS_KG, SOLAR_RADIUS_KM } from '../constants';
import { bodyFactory } from '../core/BodyFactory';

// The stat template for a star class, falling back from the full spectral class to its letter
// (star/G5V -> star/G). Exported because BOTH star-creation paths need it: the legacy random
// generator here and the wizard's explicit HR/preset seeds in generateFromConfig. They used to
// look this up separately and only one of them read `mag_gauss`, which is why a wizard-built star
// arrived with no magnetic field at all (inbox B9a).
export function starStatTemplate(pack: RulePack, starClass: string): any | undefined {
    const direct = pack.statTemplates?.[starClass];
    if (direct) return direct;
    if (starClass.startsWith('star/')) {
        const spectral = starClass.split('/')[1];
        if (spectral && spectral.length > 1) {
            const byLetter = pack.statTemplates?.[`star/${spectral[0]}`];
            if (byLetter) return byLetter;
        }
    }
    return pack.statTemplates?.['star/default'];
}

// The star's field, straight from the pack's `mag_gauss` band for its class. This is DATA, not a
// model: the pack carries every class from star/BH (0) through star/magnetar (1e11-1e15 G), and a
// real stellar rotation/dynamo model is a separate, larger piece of work (inbox B9b). Returns
// undefined when the class has no band, so "unknown" stays distinguishable from "no field".
export function starFieldFromPack(pack: RulePack, starClass: string, rng: SeededRNG) {
    const band = starStatTemplate(pack, starClass)?.mag_gauss;
    if (!band) return undefined;
    return { strengthGauss: randomFromRange(rng, band[0], band[1]) };
}

// The star's spin axis, in degrees from the system plane. Exported for the same reason as
// starFieldFromPack above: there are TWO star-creation paths and a value set in only one of them is
// the B9a bug repeating (inbox B10 — the legacy generator gave no body a tilt at all).
//
// The number is not decoration. A star and its planets condense out of one disc, so they start
// ALIGNED and stay aligned unless something moves them — the Sun is about 7 degrees off after four
// and a half billion years. Misalignment is therefore evidence of a violent past, which is why the
// baseline here is small and the WIZARD's dynamical-history knob is what opens it up
// (applyKnobBias, generateFromConfig.ts, which overrides this for a knob-driven run).
//
// CALLERS MUST PASS THEIR OWN STREAM, seeded from the body's id — never the system rng. Adding a
// draw to the shared stream shifts every subsequent draw, so every planet in every saved seed would
// silently re-roll and a written-down seed would stop reproducing its system. B9a's field draw is
// separated for exactly this reason.
export function starTiltFromPack(pack: RulePack, rng: SeededRNG): number {
    const spread = pack.generation_parameters?.star_axial_tilt_baseline_deg ?? 8;
    return Math.round(rng.nextFloat() * spread * 10) / 10;
}

// Generates a star object, but not its name, which is determined by the system context.
export function _generateStar(id: ID, parentId: ID | null, pack: RulePack, rng: SeededRNG, starTypeOverride?: string): CelestialBody {
    const starTypeTable = pack.distributions['star_types'];
    const starClass = starTypeOverride ?? (starTypeTable ? weightedChoice<string>(rng, starTypeTable) : 'star/G2V');

    const starTemplate = starStatTemplate(pack, starClass);

    let starMassKg = SOLAR_MASS_KG;
    let starRadiusKm = SOLAR_RADIUS_KM;
    let starTemperatureK = 5778;
    let starMagneticField;

    if (starTemplate) {
        starMassKg = randomFromRange(rng, starTemplate.mass_solar[0], starTemplate.mass_solar[1]) * SOLAR_MASS_KG;
        starRadiusKm = randomFromRange(rng, starTemplate.radius_solar[0], starTemplate.radius_solar[1]) * SOLAR_RADIUS_KM;
        starTemperatureK = randomFromRange(rng, starTemplate.temp_k[0], starTemplate.temp_k[1]);
        starMagneticField = starFieldFromPack(pack, starClass, rng);
    }

    const radiationOutput = starTemplate?.radiation_output ? randomFromRange(rng, starTemplate.radiation_output[0], starTemplate.radiation_output[1]) : 1;

    let starImage = pack.classifier?.starImages?.[starClass];
    if (!starImage && starClass.startsWith('star/')) {
        // Generalized fix: Truncate star/G5V -> star/G for image lookup
        const spectral = starClass.split('/')[1];
        if (spectral && spectral.length > 1) {
             const baseClass = `star/${spectral[0]}`;
             starImage = pack.classifier?.starImages?.[baseClass];
        }
    }

    const tags: Tag[] = [];
    if (radiationOutput > 100) {
        tags.push({ key: 'hazard/flaring' });
    }

    const spectralType = starClass.split('/')[1];
    let starCategory: 'massive_star' | 'main_sequence_star' | 'low_mass_star' | 'star_remnant' | undefined;

    if (['O', 'B'].includes(spectralType)) {
        starCategory = 'massive_star';
    } else if (['A', 'F', 'G', 'K', 'red-giant'].includes(spectralType)) {
        starCategory = 'main_sequence_star';
    } else if (['M'].includes(spectralType)) {
        starCategory = 'low_mass_star';
    } else if (['WD', 'NS', 'magnetar', 'BH', 'BH_active'].includes(spectralType)) {
        starCategory = 'star_remnant';
    }

    const star = bodyFactory.createBody({
        name: "", // Name is set by the caller
        roleHint: 'star',
        parentId: parentId,
        seed: id,
        massKg: starMassKg,
        radiusKm: starRadiusKm
    });

    star.id = id; // Override ID
    star.axial_tilt_deg = starTiltFromPack(pack, new SeededRNG(`${id}-tilt`));
    star.starCategory = starCategory;
    
    // Ensure base spectral class is present (e.g., star/G5V -> ['star/G', 'star/G5V'])
    const baseSpectral = `star/${spectralType[0]}`;
    if (starClass !== baseSpectral && !['star/red-giant', 'star/brown-dwarf', 'star/sub-brown-dwarf', 'star/magnetar'].includes(starClass)) {
        star.classes = [baseSpectral, starClass];
    } else {
        star.classes = [starClass];
    }

    star.temperatureK = starTemperatureK;
    star.magneticField = starMagneticField;
    star.radiationOutput = radiationOutput;
    star.image = starImage ? { url: starImage } : undefined;
    star.tags = tags;

    return star;
}
