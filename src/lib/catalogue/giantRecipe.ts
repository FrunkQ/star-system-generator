// THE GAS-GIANT RECIPE: the inputs behind a gallery giant's colour, and the two directions it travels
// (G7). Deliberately its OWN module rather than part of `galleryExamples.ts` — the body editor imports
// this, and galleryExamples drags in the processor, the cloud model and apparentColor, none of which
// an atmosphere tab has any business loading.
//
// WHAT IS IN A RECIPE, AND WHY IT IS SPLIT IN TWO. `atmosphere` is what a GM SETS: composition and
// pressure are authored fields that survive a process pass untouched. `requires` is what must be TRUE
// for the colour to appear — and it is separated because `temperatureK` / `equilibriumTempK` are
// DERIVED by SystemProcessor on every pass, from the star, the orbit, the albedo and the air. There is
// no override for them (the body's `overrides` block covers albedo, not temperature), so nothing can
// paste them in.
//
// That is not a shortcoming to hide, it is the model: a giant is that colour BECAUSE it is that cold.
// A flat block mixing the four numbers would have promised something the engine cannot honour, so the
// importer states the condition and compares it with the world in front of you instead.
import type { CelestialBody } from '$lib/types';

export interface GiantRecipe {
	/** What you SET. Authored fields; they survive a process pass. */
	atmosphere: { pressure_bar: number; composition: Record<string, number> };
	/** What must be TRUE. DERIVED per pass — nothing can set these; they follow from where the world is. */
	requires: { temperatureK: number; equilibriumTempK?: number };
}

/** Read a built giant back into its recipe. Null when the body has no atmosphere to describe. */
export function giantRecipe(body: CelestialBody): GiantRecipe | null {
	const atm = (body as { atmosphere?: { pressure_bar?: number; composition?: Record<string, number> } }).atmosphere;
	const t = (body as { temperatureK?: number }).temperatureK;
	const eq = (body as { equilibriumTempK?: number }).equilibriumTempK;
	if (!atm?.composition || !(t && t > 0)) return null;
	return {
		atmosphere: { pressure_bar: atm.pressure_bar ?? 1, composition: { ...atm.composition } },
		requires: { temperatureK: t, ...(eq && eq > 0 ? { equilibriumTempK: eq } : {}) }
	};
}

/** The recipe as pasteable JSON. */
export function giantRecipeJson(body: CelestialBody): string | null {
	const r = giantRecipe(body);
	if (!r) return null;
	const comp: Record<string, number> = {};
	// 6 significant figures: H2/He are computed as (1 - trace) shares and would otherwise paste as
	// 0.8569999999999999. Trace species run to 8e-5, so this must NOT be a fixed decimal count.
	for (const [k, v] of Object.entries(r.atmosphere.composition)) comp[k] = Number(v.toPrecision(6));
	return JSON.stringify({ ...r, atmosphere: { ...r.atmosphere, composition: comp } }, null, 2);
}

/**
 * Parse pasted text back into a recipe. Returns a REASON on failure rather than null, because the
 * only person who sees this is a GM who has just pasted something and needs to know what was wrong
 * with it.
 */
export function parseGiantRecipe(text: string): { ok: true; recipe: GiantRecipe } | { ok: false; error: string } {
	let raw: unknown;
	try {
		raw = JSON.parse(text);
	} catch {
		return { ok: false, error: 'That is not valid JSON. Copy the whole block, braces included.' };
	}
	const r = raw as Partial<GiantRecipe>;
	const comp = r?.atmosphere?.composition;
	if (!comp || typeof comp !== 'object' || !Object.keys(comp).length) {
		return { ok: false, error: 'No atmosphere composition in there — this does not look like a gas-giant recipe.' };
	}
	for (const [gas, v] of Object.entries(comp)) {
		if (typeof v !== 'number' || !(v >= 0)) return { ok: false, error: `The fraction for ${gas} is not a number.` };
	}
	const p = r.atmosphere?.pressure_bar;
	return {
		ok: true,
		recipe: {
			atmosphere: { pressure_bar: typeof p === 'number' && p > 0 ? p : 1, composition: { ...comp } as Record<string, number> },
			requires: {
				temperatureK: Number(r.requires?.temperatureK) || 0,
				...(Number(r.requires?.equilibriumTempK) ? { equilibriumTempK: Number(r.requires!.equilibriumTempK) } : {})
			}
		}
	};
}

/**
 * The recipe as an atmosphere PRESET entry, in the shape `distributions.atmosphere_composition.entries`
 * uses. `pressure_range_bar` is a zero-width band on purpose: a preset is normally a range and the
 * editor applies its MIDPOINT, so a recipe that stated [0.9, 1.1] would come back as something the
 * gallery never showed.
 */
export function recipeToPreset(recipe: GiantRecipe, name: string): { weight: number; value: Record<string, unknown> } {
	const p = recipe.atmosphere.pressure_bar;
	return {
		// Weight 0: this is a named look a GM chose, not something random generation should start
		// rolling up on unrelated worlds.
		weight: 0,
		value: {
			name,
			pressure_range_bar: [p, p],
			composition: { ...recipe.atmosphere.composition },
			...(recipe.requires.temperatureK > 0
				? { temp_range_K: [Math.round(recipe.requires.temperatureK), Math.round(recipe.requires.temperatureK)] }
				: {}),
			source: 'gas-giant recipe'
		}
	};
}

/** A unique preset name, so importing the same recipe twice does not collide with the first. */
export function uniquePresetName(base: string, taken: string[]): string {
	if (!taken.includes(base)) return base;
	for (let i = 2; i < 500; i++) {
		const n = `${base} (${i})`;
		if (!taken.includes(n)) return n;
	}
	return `${base} (${Date.now()})`;
}
