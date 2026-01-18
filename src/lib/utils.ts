import type { TableSpec } from './types';
import type { SeededRNG } from './rng';

export function weightedChoice<T>(rng: SeededRNG, table: TableSpec): T {
  const totalWeight = table.entries.reduce((sum, entry) => sum + entry.weight, 0);
  let random = rng.nextFloat() * totalWeight;

  for (const entry of table.entries) {
    if (random < entry.weight) {
      return entry.value as T;
    }
    random -= entry.weight;
  }

  // Fallback to the last entry, should not be reached if weights are correct.
  return table.entries[table.entries.length - 1].value as T;
}

export function randomFromRange(rng: SeededRNG, min: number, max: number): number {
  return rng.nextFloat() * (max - min) + min;
}

export function toRoman(num: number): string {
    const roman = {
        M: 1000, CM: 900, D: 500, CD: 400, C: 100, XC: 90, L: 50, XL: 40, X: 10, IX: 9, V: 5, IV: 4, I: 1
    };
    let str = '';

    for (const i of Object.keys(roman)) {
        const q = Math.floor(num / roman[i]);
        num -= q * roman[i];
        str += i.repeat(q);
    }

    return str;
}

export function generateId(): string {
  return `id-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

export function validateStarmap(data: any): string[] {
    const errors: string[] = [];

    if (!data) {
        return ['File is empty or not valid JSON.'];
    }

    // Top-level checks
    if (!data.id) errors.push('Missing top-level "id".');
    if (!data.name) errors.push('Missing top-level "name".');
    if (typeof data.distanceUnit !== 'string') errors.push('Missing or invalid "distanceUnit".');
    if (!Array.isArray(data.systems)) errors.push('Missing "systems" array.');
    if (!Array.isArray(data.routes)) errors.push('Missing "routes" array.');

    if (errors.length > 0) return errors; // Stop if structure is fundamentally broken

    // System checks
    const systemIds = new Set<string>();
    
    data.systems.forEach((sysNode: any, index: number) => {
        const context = `System #${index} (${sysNode.name || 'Unknown'})`;

        if (!sysNode.id) errors.push(`${context}: Missing "id".`);
        else {
            if (systemIds.has(sysNode.id)) errors.push(`${context}: Duplicate System ID "${sysNode.id}".`);
            systemIds.add(sysNode.id);
        }

        if (!sysNode.position || typeof sysNode.position.x !== 'number' || typeof sysNode.position.y !== 'number') {
            errors.push(`${context}: Invalid or missing "position" (x, y).`);
        }

        if (!sysNode.system) {
            errors.push(`${context}: Missing "system" object data.`);
        } else {
            const innerSys = sysNode.system;
            if (!innerSys.id) errors.push(`${context}: Inner system missing "id".`);
            if (!innerSys.nodes || !Array.isArray(innerSys.nodes)) errors.push(`${context}: Missing or invalid "nodes" array.`);
            if (!innerSys.rulePackId) errors.push(`${context}: Missing "rulePackId".`);
            
            // Check if rulePackId is potentially a mismatch (heuristic)
            if (innerSys.rulePackId === 'starter-sf') {
                 errors.push(`${context}: Warning - "rulePackId" is "starter-sf". Did you mean "starter-sf-pack"?`);
            }
        }
    });

    return errors;
}

/**
 * Evaluates a trigger condition string against a context object.
 * Supports:
 * - Numeric comparisons: >, <, >=, <=, = (e.g., "pp > 0.5")
 * - Boolean flags: (e.g., "O2_gas_present", "!moisture_present")
 * - Logical AND: (e.g., "pp > 0.5 AND O2_gas_present")
 * 
 * @param trigger The condition string.
 * @param context A dictionary of values to check against.
 */
export function evaluateTagTriggers(trigger: string, context: Record<string, number | boolean>): boolean {
    if (trigger === 'always') return true;
    if (!trigger) return false;

    const conditions = trigger.split(/\s+AND\s+/i);

    for (const condition of conditions) {
        const trimmed = condition.trim();
        
        // Check for numeric comparison
        const match = trimmed.match(/^([a-zA-Z0-9_]+)\s*(>=|<=|>|<|=)\s*(-?[\d.]+)$/);
        
        if (match) {
            const [, key, op, valStr] = match;
            const contextVal = context[key];
            const targetVal = parseFloat(valStr);

            if (typeof contextVal !== 'number') return false; // Key missing or not a number

            switch (op) {
                case '>': if (!(contextVal > targetVal)) return false; break;
                case '<': if (!(contextVal < targetVal)) return false; break;
                case '>=': if (!(contextVal >= targetVal)) return false; break;
                case '<=': if (!(contextVal <= targetVal)) return false; break;
                case '=': if (!(Math.abs(contextVal - targetVal) < 0.000001)) return false; break;
                default: return false;
            }
        } else {
            // Boolean check
            let key = trimmed;
            let expected = true;
            
            if (key.startsWith('!')) {
                key = key.substring(1);
                expected = false;
            }

            // Treat > 0 as true for numeric context values used as flags
            const contextVal = context[key];
            const boolVal = typeof contextVal === 'number' ? contextVal > 0 : !!contextVal;

            if (boolVal !== expected) return false;
        }
    }

    return true;
}
