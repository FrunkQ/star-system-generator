import type { RulePack } from './types';

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
