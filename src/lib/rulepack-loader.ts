import type { RulePack } from './types';
import { warnIfLegacyRules } from './system/classification';

// Helper function for deep merging objects. This is a simple implementation.
function deepMerge(target: any, source: any): any {
    const output = { ...target };

    if (isObject(target) && isObject(source)) {
        Object.keys(source).forEach(key => {
            if (isObject(source[key])) {
                if (!(key in target)) {
                    Object.assign(output, { [key]: source[key] });
                } else {
                    output[key] = deepMerge(target[key], source[key]);
                }
            } else {
                Object.assign(output, { [key]: source[key] });
            }
        });
    }

    return output;
}

function isObject(item: any): boolean {
    return (item && typeof item === 'object' && !Array.isArray(item));
}

export function loadRulePack(data: unknown): RulePack {
  if (!data || typeof (data as RulePack).id !== 'string' || typeof (data as RulePack).version !== 'string') {
    throw new Error('Invalid RulePack data: missing essential properties.');
  }
  // Say it where a pack author can see it (inbox B67): the additive classifier.rules seam is gone.
  warnIfLegacyRules(data as RulePack);
  return data as RulePack;
}

export async function fetchAndLoadRulePack(url: string): Promise<RulePack> {
    // Ensure the initial URL is absolute
    const absoluteUrl = new URL(url, window.location.origin).href;

    const response = await fetch(absoluteUrl);
    if (!response.ok) {
        throw new Error(`Failed to fetch rule pack from ${absoluteUrl}: ${response.statusText}`);
    }
    let mainPack: RulePack = await response.json();

    // Determine the base URL for fetching related definition files
    const baseUrl = new URL('.', absoluteUrl).href;

    // Fetch construct templates
    const constructTemplatesResponse = await fetch(new URL('construct_templates.json', baseUrl).href);
    if (constructTemplatesResponse.ok) {
        mainPack.constructTemplates = await constructTemplatesResponse.json();
    } else {
        console.warn(`Failed to load construct templates from ${new URL('construct_templates.json', baseUrl).href}: ${constructTemplatesResponse.statusText}`);
    }

    // Fetch engine definitions
    const engineDefinitionsResponse = await fetch(new URL('engine-definitions.json', baseUrl).href);
    if (engineDefinitionsResponse.ok) {
        mainPack.engineDefinitions = await engineDefinitionsResponse.json();
    } else {
        console.warn(`Failed to load engine definitions from ${new URL('engine-definitions.json', baseUrl).href}: ${engineDefinitionsResponse.statusText}`);
    }

    // Fetch fuel definitions
    const fuelDefinitionsResponse = await fetch(new URL('fuel-definitions.json', baseUrl).href);
    if (fuelDefinitionsResponse.ok) {
        mainPack.fuelDefinitions = await fuelDefinitionsResponse.json();
    } else {
        console.warn(`Failed to load fuel definitions from ${new URL('fuel-definitions.json', baseUrl).href}: ${fuelDefinitionsResponse.statusText}`);
    }

    // NO PACK-LEVEL liquids.json OR biospheres.json FETCH. Removed 2026-08-26; it produced TWO GUARANTEED
    // 404s on every single page load, which reads to a user as a broken app.
    //
    // The mechanism was a second way to fill fields that already have a live one, and it had never once
    // fired: only one rule pack exists (starter-sf) and it ships NEITHER file, so `response.ok` was always
    // false and `mainPack.liquids` / `.pigments` / `.morphologies` were never set here. Deleting it is
    // therefore behaviour-identical, not a behaviour change.
    //
    // WHERE OVERRIDES ACTUALLY COME FROM, and why a pack file is the wrong home for them: a campaign's own
    // customisations live in `starmap.rulePackOverrides` (Edit Liquids / Edit Atmospheres / Edit Biospheres
    // write there) and are merged onto a CLONE of the pack in routes/+page.svelte — `pack.liquids` by
    // whole-list replace, `pack.pigments` and `pack.morphologies` by list delta. That path rides the save
    // file, so a GM's liquids travel with the campaign to every device. A pack file could not do that.
    //
    // The built-in defaults are src/lib/data/liquids.json, pigments.json and morphologies.json, reached
    // through allLiquids() / allPigments() / allMorphologies(), which fall back whenever the pack field is
    // empty — which, absent a campaign override, is always. If a pack ever genuinely needs to ship its own
    // set, DECLARE the file in main.json and fetch only what is declared: never probe for a file that is
    // normally absent, because the browser logs the 404 whatever the code does with it.

    // Fetch classification definitions (including tagVocab, planetImages etc.)
    const classificationResponse = await fetch(new URL('classification.json', baseUrl).href);
    if (classificationResponse.ok) {
        const classificationData = await classificationResponse.json();
        console.log('Loaded Classification Data:', Object.keys(classificationData));
        
        // Deep merge to combine distributions if any, but ensure planetImages sticks
        mainPack = deepMerge(mainPack, classificationData);

    } else {
        console.warn(`Failed to load classification definitions from ${new URL('classification.json', baseUrl).href}: ${classificationResponse.statusText}`);
    }

    if (mainPack.imports) {
        // Use the absolute URL of the main pack as the base for imports
        const importPromises = mainPack.imports.map(async (importPath: string) => {
            const importUrl = new URL(importPath, absoluteUrl).href;
            const importResponse = await fetch(importUrl);
            if (!importResponse.ok) {
                throw new Error(`Failed to fetch imported rule pack from ${importUrl}: ${importResponse.statusText}`);
            }
            return importResponse.json();
        });

        const importedPacks = await Promise.all(importPromises);
        importedPacks.forEach(importedPack => {
            mainPack = deepMerge(mainPack, importedPack);
        });
    }

    return loadRulePack(mainPack);
}
