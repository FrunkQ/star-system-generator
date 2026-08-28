// src/lib/generation/star.ts
import type { CelestialBody, RulePack, ID, Tag } from '../types';
import { SeededRNG } from '../rng';
import { weightedChoice, randomFromRange, drawFromBand } from '../utils';
import { SOLAR_MASS_KG, SOLAR_RADIUS_KM } from '../constants';
import { luminositySolarFromRT } from '../physics/luminosity';
import { bodyFactory } from '../core/BodyFactory';
import { resolveStarImage, spectralLetterOf } from '../system/starImage';
import { activityScatterFromRoll } from '../physics/ionisingOutput';
import { stellarTypeForBand, starClassParts, bandKeyOf } from '../physics/starDesignation';

// The stat template for a star class, falling back from the full spectral class to its letter
// (star/G5V -> star/G). Exported because BOTH star-creation paths need it: the legacy random
// generator here and the wizard's explicit HR/preset seeds in generateFromConfig. They used to
// look this up separately and only one of them read `mag_gauss`, which is why a wizard-built star
// arrived with no magnetic field at all (inbox B9a).
// `star/red-giant` is RETIRED in favour of `star/M-III` (inbox B46a). The two described the same
// object and disagreed by about 100x on radiation output — 30 Lsun against 2,750 — and which one
// answered depended only on whether the star was generated or imported. The band is gone from the
// pack and the distribution no longer offers it, but a SAVED campaign may still hold the key on a
// body, so it resolves here rather than falling through to `star/default` and becoming a G dwarf.
const LEGACY_CLASS_ALIAS: Record<string, string> = { 'star/red-giant': 'star/M-III' };

/**
 * A STAR CLASS'S FAMILY, for the generation lookups that key on it — planet-count table, binary
 * odds. Read from the LETTER, never from the whole class string: `star/G-III` is a G, `star/M-I` is
 * an M, and a comparison like `['A','F','G','K'].includes('G-III')` is false and falls to whatever
 * the last branch happens to be (it put a G giant on the low-mass binary table). L, T and Y are
 * BROWN DWARFS — not remnants, which is where they fell before because no branch named them.
 */
export type StarFamily = 'massive' | 'sunlike' | 'low_mass' | 'brown_dwarf' | 'remnant';
export function starFamilyOf(classKey: string | undefined): StarFamily {
    const cls = (classKey ?? '').split('/')[1] ?? '';
    if (/^(WD|NS|BH|BH_active|magnetar)\b/.test(cls)) return 'remnant';
    if (cls === 'red-giant') return 'sunlike';
    const letter = cls[0];
    if (letter === 'O' || letter === 'B' || letter === 'A') return 'massive';
    if (letter === 'F' || letter === 'G' || letter === 'K') return 'sunlike';
    if (letter === 'M') return 'low_mass';
    if (letter === 'L' || letter === 'T' || letter === 'Y') return 'brown_dwarf';
    return 'remnant';
}
/** The pack's planet-count table for a family. */
export function planetCountTableKey(family: StarFamily): string {
    switch (family) {
        case 'massive': return 'planet_count_massive';
        case 'sunlike': case 'low_mass': return 'planet_count_main_sequence';
        case 'brown_dwarf': return 'planet_count_brown_dwarf';
        default: return 'planet_count_remnant';
    }
}

export function starStatTemplate(pack: RulePack, starClass: string): any | undefined {
    // Pack-safe, like `resolveStarImage`: the editor renders before a pack has loaded, and a lookup
    // that throws there takes the whole panel with it.
    if (!pack || !starClass) return undefined;
    starClass = LEGACY_CLASS_ALIAS[starClass] ?? starClass;
    const direct = pack.statTemplates?.[starClass];
    if (direct) return direct;
    // A DESIGNATION RESOLVES TO ITS OWN BAND, WHICH MEANS ITS LUMINOSITY CLASS TOO — `star/G5III` is a
    // G GIANT and must not fall back to the G dwarf band, which is what taking the first character
    // alone did (a 10-solar-radius star handed a 1-radius template). One lookup, most specific first,
    // using the same key parser that WRITES these keys (inbox B60).
    if (starClass.startsWith('star/')) {
        const band = bandKeyOf(starClass);
        if (band !== starClass) {
            const byBand = pack.statTemplates?.[band];
            if (byBand) return byBand;
            const p = starClassParts(starClass);
            if (p.letter) {
                const byLetter = pack.statTemplates?.[`star/${p.letter}`];
                if (byLetter) return byLetter;
            }
        }
    }
    return pack.statTemplates?.['star/default'];
}

// The star's field, straight from the pack's `mag_gauss` band for its class. This is DATA, not a
// model: the pack carries every class from star/BH (0) through star/magnetar (1e11-1e15 G), and a
// real stellar rotation/dynamo model is a separate, larger piece of work (inbox B9b). Returns
// undefined when the class has no band, so "unknown" stays distinguishable from "no field".
/**
 * A neutron star whose drawn field is above the pack's magnetar threshold IS a magnetar.
 *
 * The threshold is rule-pack DATA (`stellarClassification.magnetar_field_gauss`), not a constant
 * here, because the boundary is a product choice inside a real continuum: magnetars sit at about
 * 1e14-1e15 gauss and ordinary pulsars near 1e12, with high-B pulsars occupying the decade between.
 * Exported so the editor and any future classifier read the same rule rather than spelling it again.
 */
export function magnetarLabelFor(pack: RulePack, starClass: string, fieldGauss: number | undefined): string {
    if (starClass !== 'star/NS' || fieldGauss == null) return starClass;
    const threshold = (pack as any)?.stellarClassification?.magnetar_field_gauss;
    if (!(threshold > 0)) return starClass; // a pack that states no threshold makes no magnetars
    return fieldGauss >= threshold ? 'star/magnetar' : starClass;
}

/**
 * The BULK STATS for a star class, drawn from the pack's own bands: mass, radius and temperature.
 *
 * Exported because there are two places that answer "what is a G2V like" and they must not answer
 * differently (inbox B61). Generation has always drawn from the band; the EDITOR's spectral-type
 * picker took the band MIDPOINT, so every G dwarf a GM placed by hand was numerically identical to
 * every other one — the artefact, not the variety. Same bands, same draw, one implementation.
 *
 * CALLERS PASS THEIR OWN STREAM (DATA-G1). The editor seeds from the BODY ID and the chosen class, so
 * re-opening the panel cannot reroll the star under the GM's hands, and two bodies given the same
 * class still differ.
 */
export function starStatsFromPack(pack: RulePack, starClass: string, rng: SeededRNG):
    { massSolar: number; radiusSolar: number; tempK: number } | undefined {
    const tpl = starStatTemplate(pack, starClass);
    if (!tpl) return undefined;
    return {
        massSolar: randomFromRange(rng, tpl.mass_solar[0], tpl.mass_solar[1]),
        radiusSolar: randomFromRange(rng, tpl.radius_solar[0], tpl.radius_solar[1]),
        tempK: randomFromRange(rng, tpl.temp_k[0], tpl.temp_k[1])
    };
}

export function starFieldFromPack(pack: RulePack, starClass: string, rng: SeededRNG) {
    const tpl = starStatTemplate(pack, starClass);
    const band = tpl?.mag_gauss;
    if (!band) return undefined;
    // B56 - LOG-UNIFORM ACROSS A BAND THAT SPANS DECADES. Every field band here is multi-decade
    // (star/NS is 1e8..1e11, star/magnetar 1e11..1e15), and a linear draw put ~99% of neutron stars
    // in the top decade: the band advertised a range it would not produce. The band declares its own
    // scale, inferred by ratio unless the pack states one.
    return { strengthGauss: drawFromBand(rng, [band[0], band[1]], tpl?.mag_gauss_scale) };
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
    let starClass = starTypeOverride ?? (starTypeTable ? weightedChoice<string>(rng, starTypeTable) : 'star/G2V');

    const starTemplate = starStatTemplate(pack, starClass);

    let starMassKg = SOLAR_MASS_KG;
    let starRadiusKm = SOLAR_RADIUS_KM;
    let starTemperatureK = 5778;
    let starMagneticField;

    if (starTemplate) {
        // Same draw the editor's picker makes, so a generated G2V and a hand-placed one are the same
        // KIND of object rather than two implementations that can drift (inbox B61).
        const stats = starStatsFromPack(pack, starClass, rng)!;
        starMassKg = stats.massSolar * SOLAR_MASS_KG;
        starRadiusKm = stats.radiusSolar * SOLAR_RADIUS_KM;
        starTemperatureK = stats.tempK;
        starMagneticField = starFieldFromPack(pack, starClass, rng);
    }

    // B57 - LUMINOSITY IS NOT A FREE PARAMETER. L = 4(pi)R^2(sigma)T^4 is exact, so a star's
    // luminosity is DETERMINED by the radius and temperature drawn two lines above. Storing it as an
    // independent band let it drift: measured across the shipped main sequence, `star/G` agreed with
    // its own R and T to within 1% and NOTHING ELSE DID - out to 60,000x on `star/M`, 900x on
    // `star/O` and 470x on `star/WD`, whose computed 0.058 Lsun is Sirius B almost exactly. Someone
    // calibrated on the Sun and never checked the general law.
    //
    // THE PRESENCE OF A BAND IS NOW THE DECLARATION THAT L CANNOT BE COMPUTED, which is B57's rule
    // ("a band carries only what cannot be computed") expressed as data rather than as a list of
    // class names in code. Only four bands keep one, and each is genuinely NON-THERMAL: a black hole
    // emits from its accretion disc and a neutron star or magnetar from spin-down and its
    // magnetosphere, neither of which is R^2 T^4 of the object itself. Everything else computes.
    // Through the one Stefan-Boltzmann ([[B110]]); the guard is now inside it.
    const thermalLumSolar = luminositySolarFromRT(starRadiusKm, starTemperatureK);
    const radiationOutput = starTemplate?.radiation_output
        ? drawFromBand(rng, [starTemplate.radiation_output[0], starTemplate.radiation_output[1]], starTemplate.radiation_output_scale)
        : (thermalLumSolar || 1);

    // B55/B56 - A MAGNETAR IS NOT SPAWNED. Owner: "they are spawned as neutron stars with a physical
    // property that the classification engine defines them as magnetars - ie it is a sub-category of
    // neutron star, as they are in reality." So generation draws `star/NS`, the FIELD is drawn from
    // the band, and the label is read back off it. One spawn type, parameters, derived label - the
    // flexible-systems mantra applied to remnants, with no special casing and no rarity knob: the
    // magnetar RATE falls out of the field distribution rather than a spawn weight.
    //
    // THIS RUNS HERE ONLY BECAUSE NO STAR CLASSIFIER EXISTS YET (B48). It is the classifier reading
    // physical state, and it MOVES into that pass when it lands - it does not become a second
    // opinion. Nothing downstream may read the label back to decide the field; the arrow is
    // field -> label, and PHY-16 is the entry that explains why.
    starClass = magnetarLabelFor(pack, starClass, starMagneticField?.strengthGauss);

    // G21 - one lookup, shared with the editor and generateFromConfig. This copy truncated on
    // `spectral[0]` for any name longer than a character, so it was one pack edit away from sending
    // `star/BH` to `star/B` - a black hole drawn as a hot blue star.
    const starImage = resolveStarImage(pack, starClass);

    // NO `hazard/flaring` IS EMITTED HERE, DELIBERATELY. It used to be, gated on `radiationOutput >
    // 100` - LUMINOSITY, which is the wrong driver: a luminous O star is not especially flare-prone
    // and an M dwarf, which is, is feeble. It only ever appeared to work because the old `star/M`
    // band claimed up to 1500 Lsun (B57), so two wrongs cancelled.
    //
    // AND IT WAS ALREADY DEAD: `SystemProcessor` STRIPS this tag and re-derives it from
    // `flareActivity(class, systemAge, accretion)` on every pass, which is the model that gets it
    // right - M 0.85 and K 0.55 against G 0.35, times an age factor that runs a young M dwarf to
    // 0.850 (flaring) and an old one to 0.073 (quiet). That age term is the quiescent-versus-active
    // distinction, and it belongs to the pass that owns the namespace (TAG-6), not to generation.
    const tags: Tag[] = [];

    const spectralType = starClass.split('/')[1];
    // A GIANT OR SUPERGIANT IS CATEGORISED BY ITS MASS, NOT BY ITS LETTER'S MAIN-SEQUENCE HABITS.
    // `star/M-III` used to match none of these lists and came out `undefined`, while the retired
    // `star/red-giant` was listed as `main_sequence_star`, which it is by definition not.
    const evolved = /^([OBAFGKM])-(I|III)$/.exec(spectralType);
    const letter = evolved ? evolved[1] : spectralType;
    let starCategory: 'massive_star' | 'main_sequence_star' | 'low_mass_star' | 'star_remnant' | undefined;

    if (['WD', 'NS', 'magnetar', 'BH', 'BH_active'].includes(spectralType)) {
        starCategory = 'star_remnant';
    } else if (evolved) {
        // Every supergiant is massive by definition; a giant is a middleweight that has left the
        // main sequence, so it is not `low_mass_star` even when it is an M.
        starCategory = evolved[2] === 'I' ? 'massive_star' : 'main_sequence_star';
    } else if (['O', 'B'].includes(letter)) {
        starCategory = 'massive_star';
    } else if (['A', 'F', 'G', 'K'].includes(letter)) {
        starCategory = 'main_sequence_star';
    } else if (letter === 'M') {
        starCategory = 'low_mass_star';
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
    
    // THE BASE SPECTRAL CLASS, and this was fabricating nonsense (inbox B46a). It sliced
    // `spectralType[0]` and excluded a HARDCODED list of classes with no spectral letter — a list
    // that missed WD, NS, BH and BH_active. Measured over 2,000 generated stars: 1.8% carried
    // `star/W`, 0.5% `star/N`, and a feeding black hole carried `star/B` — the same 'B' collision
    // that gave black holes a B-star flare rate. None of those three classes exists.
    //
    // So the test is now "does this class actually START WITH A SPECTRAL LETTER", which is a
    // property rather than a list, and a list is what went stale.
    //
    // ORDER IS MOST-SPECIFIC-FIRST, matching `starClasses` in the importer (B44). It used to put the
    // letter first, so a generated `star/M-III` would have had `classes[0] === 'star/M'` and been
    // described as a red DWARF — D19's fault reappearing on the generation path.
    // The letter must be followed by something that CONTINUES a spectral type — a subclass digit,
    // a `-I`/`-III` band, or nothing at all. A bare prefix test is not enough: `star/BH_active`
    // starts with a valid spectral letter and is not a B star, which is the same collision a third
    // time (it gave black holes a flare rate, and a fabricated `star/B` class here).
    // G21 - the SHAPE test is now `spectralLetterOf`, the same one the image lookup asks. It is the
    // regex that used to be spelled out here, moved rather than rewritten: one spelling, two
    // questions, so a fix to either cannot leave the other behind.
    const baseLetter = spectralLetterOf(starClass);
    const baseSpectral = baseLetter ? `star/${baseLetter}` : null;
    star.classes = baseSpectral && starClass !== baseSpectral ? [starClass, baseSpectral] : [starClass];

    star.temperatureK = starTemperatureK;
    // THE STRUCTURED CLASSIFICATION, WHICH THIS PATH NEVER SET (inbox B60). An IMPORTED star has
    // carried `stellarType` since the real-sky work — spectral letter, subclass, luminosity class —
    // while a GENERATED one carried only a class string, so the inverse question ("what designation
    // does this star state") had nothing to read for two thirds of the stars in a campaign. The
    // subclass comes from the temperature drawn above, through the same anchors the editor uses.
    star.stellarType = stellarTypeForBand(starClass, starTemperatureK, pack);
    star.magneticField = starMagneticField;
    star.radiationOutput = radiationOutput;
    star.image = starImage ? { url: starImage } : undefined;
    // B-ACT: this star's own draw on the activity scatter, so a generated POPULATION spans the real
    // range rather than every G dwarf of one age being identical. An INPUT, not a derivation - there
    // is nothing to compute it from, it is the equivalent of birth rotation. Its own seeded stream so
    // adding it shifts nothing else.
    (star as any).activityScatter = activityScatterFromRoll(new SeededRNG(`${id}-activity`).nextFloat());
    star.tags = tags;

    return star;
}
