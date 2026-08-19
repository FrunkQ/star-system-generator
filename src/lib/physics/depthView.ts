// GOING DOWN INTO A WORLD THAT HAS NO GROUND.
//
// A gas giant's Surface view was painting rock, sea and trees. That is a lie — there is nothing to
// stand on — and the honest picture is a cloudscape seen from inside the air: a soft deck below you,
// darker atmosphere above, and a depth you can CHOOSE, because a balloon can float at any level a
// person can survive. So the view gets a depth slider, and this is the physics under it.
//
// EVERYTHING HERE IS A READ OF THINGS THE ENGINE ALREADY DERIVES. The adiabatic profile gives
// temperature at any pressure; `deriveCloudDecks` gives each deck's base pressure and optical depth;
// the top-of-atmosphere light is the star through the upper air. Nothing new is modelled — this
// walks down through answers that already exist and reports what you would see at each level.
//
// WHERE IT STOPS, AND WHY — said here because the UI says it too:
//   The profile is anchored at GIANT_REFERENCE_BAR and models nothing beneath it. Below that there is
//   no temperature law, no radiative transfer, and at a few hundred bar the atmosphere glows by its
//   own heat — a continuous version of the brown-dwarf self-luminosity, which is V4 work. The slider
//   runs from the top of the air to the reference level and no further, because past it every number
//   would be an extrapolation nobody has checked. A balloon will not take a person there anyway:
//   Jupiter's hundred-bar level is hot enough to cook, and the pressure alone is a submarine's.
import type { CelestialBody, RulePack } from '$lib/types';
import { deriveCloudDecks, effectiveComposition, type CloudDeck } from './cloudDecks';
import { atmosphereProfile, GIANT_REFERENCE_BAR, MIN_ATM_BAR } from './atmosphereProfile';
import { liquidDef } from './liquids';
import { makeupFractions } from './makeup';
import { GRID_NM, type Spectrum } from './spectrum';

export interface DepthLevel {
	/** Pressure at this level, bar. */
	pBar: number;
	/** Temperature at this level, K, from the adiabatic profile. */
	tempK: number;
	/** Light reaching this level, as a spectrum on the grid. */
	light: Spectrum;
	/** Share of top-of-atmosphere light surviving to here, 0..1 — the decks above you, nothing else. */
	transmission: number;
	/** The deck whose base is closest BELOW you — what you are looking down onto. Null above all decks
	 *  or below the last one. */
	floor: CloudDeck | null;
	/** The deck whose base is closest ABOVE you — what is overhead. */
	ceiling: CloudDeck | null;
	/** Whether you are INSIDE a deck rather than between two. */
	inCloud: boolean;
	/** The authored colour of the deck you are in or under, as a material. */
	floorHex: string | null;
}

export interface DepthProbe {
	/** Shallowest and deepest pressures the slider may visit, bar. */
	topBar: number;
	bottomBar: number;
	/** Why the bottom is where it is. */
	floorReason: string;
	/** The decks, deepest first, each with its base pressure. */
	decks: CloudDeck[];
	at(pBar: number): DepthLevel;
}

/**
 * One probe for a body, then `at(p)` as many times as the slider moves. The expensive calls — the
 * profile and the decks — happen once; each level is then arithmetic over them.
 */
export function depthProbe(
	body: CelestialBody, topLight: Spectrum, pack?: RulePack | null
): DepthProbe | null {
	const isGiant = makeupFractions(body).gas > 0.5;
	if (!isGiant) return null;
	const comp = effectiveComposition({ ...(body.atmosphere?.composition ?? {}) }, pack);
	const profile = atmosphereProfile(body, comp, pack);
	if (!profile) return null;
	// Deepest first — the order a scan from the ground up would meet them.
	const decks = deriveCloudDecks(body, pack)
		.filter((d) => typeof d.baseBar === 'number' && d.baseBar > 0)
		.sort((a, b) => (b.baseBar as number) - (a.baseBar as number));

	const topBar = Math.max(MIN_ATM_BAR, profile.levels[profile.levels.length - 1]?.pBar ?? MIN_ATM_BAR);
	const bottomBar = Math.min(profile.pSurfBar, GIANT_REFERENCE_BAR);

	const at = (pBarRaw: number): DepthLevel => {
		const pBar = Math.max(topBar, Math.min(bottomBar, pBarRaw));
		const tempK = profile.tempAt(pBar);
		// Every deck whose base is ABOVE this level is between you and the star. You are under it, and
		// its whole optical depth is in your way. A deck whose base is BELOW you has not started yet.
		// A grey extinction, as the surface spectrum already treats it: droplets scatter every colour
		// alike, so a deck dims the light without tinting it — the tint comes from what you look AT.
		let tauAbove = 0;
		let ceiling: CloudDeck | null = null;
		let floor: CloudDeck | null = null;
		let inCloud = false;
		for (const d of decks) {
			const base = d.baseBar as number;
			const tau = d.opticalDepth ?? 0;
			if (base < pBar) {
				// Base is at lower pressure = higher up = above you.
				tauAbove += tau;
				if (!ceiling || base > (ceiling.baseBar as number)) ceiling = d;
			} else {
				// Base is at or below you. The deck extends UPWARD from its base, so if its base is just
				// below and it is thick enough you are inside it.
				if (!floor || base < (floor.baseBar as number)) floor = d;
			}
		}
		// "Inside": within a scale-height-ish slab above the floor deck's base, for a deck thick enough
		// to count. Coverage is the honest proxy for how far up it reaches — a wisp is not a slab.
		if (floor && floor.coverage >= 0.3) {
			const base = floor.baseBar as number;
			inCloud = pBar > base * 0.55;
		}
		const transmission = Math.exp(-tauAbove);
		const light = topLight.map((v) => v * transmission);
		const src = inCloud ? floor : (floor ?? ceiling);
		const floorHex = src ? (liquidDef(src.species, pack)?.colorHex ?? null) : null;
		return { pBar, tempK, light, transmission, floor, ceiling, inCloud, floorHex };
	};

	return {
		topBar, bottomBar, decks, at,
		floorReason:
			`The model is anchored at the ${GIANT_REFERENCE_BAR} bar reference level and describes nothing ` +
			`beneath it: no temperature law, no radiative transfer, and at a few hundred bar the air glows ` +
			`by its own heat. Every number past this line would be an extrapolation.`
	};
}

/** A pressure into words a GM can say. */
export function pressureWords(pBar: number): string {
	if (pBar >= 1) return `${pBar.toFixed(pBar >= 10 ? 0 : 1)} bar`;
	if (pBar >= 0.001) return `${(pBar * 1000).toFixed(0)} mbar`;
	return `${(pBar * 1e6).toFixed(0)} µbar`;
}

export { GRID_NM };
