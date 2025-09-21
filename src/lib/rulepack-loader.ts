import type { RulePack } from './types';

// A simple loader function that validates the structure of a rule pack.
// For now, it's a basic type assertion, but it can be expanded with
// more robust validation logic (e.g., using a schema validation library).

export function loadRulePack(data: any): RulePack {
  // Basic validation to ensure the object looks like a RulePack.
  if (!data || typeof data.id !== 'string' || typeof data.version !== 'string' || !Array.isArray(data.tagVocab)) {
    throw new Error('Invalid RulePack data: missing essential properties.');
  }
  
  // The data is assumed to be a valid RulePack.
  // In a real application, you would add more thorough validation here.
  return data as RulePack;
}

// Example of how to fetch and load a rule pack from the static directory.
export async function fetchAndLoadRulePack(url: string): Promise<RulePack> {
    const response = await fetch(url);
    if (!response.ok) {
        throw new Error(`Failed to fetch rule pack from ${url}: ${response.statusText}`);
    }
    const data = await response.json();
    return loadRulePack(data);
}
