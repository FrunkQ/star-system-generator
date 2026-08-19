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
import { rayleighTau550 } from './surfaceSpectrum';
import { scaleHeightM } from './visibility';

/**
 * HOW DEEP THE SLIDER GOES, in bar — and it is the honest limit, not a round number.
 *
 * Measured against the one descent anyone has made: Galileo's probe into Jupiter. Extrapolating the
 * dry adiabat below the 1 bar anchor, we say 319 K at 10 bar (the probe read ~330 K) and ~400 K at
 * 22 bar (the probe read ~425 K and died there). So the temperature law holds to a few percent all
 * the way down, and by 100 bar at ~640 K the air's own thermal glow is still nothing a human eye
 * would see. What the model does NOT carry below the anchor: the wet adiabat, opacity growing with
 * density beyond Rayleigh, and any emission. Past 100 bar those start to matter and nothing here has
 * been checked against them, so the slider stops.
 */
export const GIANT_DEPTH_LIMIT_BAR = 100;
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
	/** Extinction per metre AT THIS DEPTH — Rayleigh scaled by density, plus the deck if you are in it.
	 *  This is what shortens your view and veils your lamps as you go down. */
	extinctionPerM: number;
	/** How far you can see here, by the same contrast rule the surface visibility uses. */
	seeM: number;
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
	// The DEEP profile: same anchor at 1 bar, continued down to the limit. This is what finds the
	// water deck, which lives below the reference on every cold giant and which the published tags
	// never see — they are built from the shallow profile and that is correct for a renderer looking
	// DOWN from space, where a deck under another deck is invisible.
	const profile = atmosphereProfile(body, comp, pack, { giantDepthBar: GIANT_DEPTH_LIMIT_BAR });
	if (!profile) return null;
	// Deepest first — the order a scan from the ground up would meet them. Derived on the DEEP profile
	// so the scan can reach a base below 1 bar; the shallow set the tags carry is a subset of this.
	const decks = deriveCloudDecks(body, pack, profile)
		.filter((d) => typeof d.baseBar === 'number' && d.baseBar > 0)
		.sort((a, b) => (b.baseBar as number) - (a.baseBar as number));

	const topBar = Math.max(MIN_ATM_BAR, profile.levels[profile.levels.length - 1]?.pBar ?? MIN_ATM_BAR);
	const bottomBar = profile.pSurfBar;
	// Extinction per metre at the 1 bar level, the same Rayleigh the visibility model uses. Below it
	// the air is denser in proportion to pressure and so is the scattering — which is exactly the
	// owner's point that haze shortens how far you see and veils your own lamps as you go down.
	const beta1 = (() => { const h = scaleHeightM(body); return h > 0 ? rayleighTau550(body, pack) / h : 0; })();

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
		// Gas scattering grows with density — pressure over temperature. Inside a deck the droplets
		// dominate and the view closes to metres: the deck's optical depth spread over a scale height
		// of it, which is the same coarse stand-in the surface visibility uses for fog.
		const h = scaleHeightM(body);
		let extinctionPerM = beta1 * (pBar / GIANT_REFERENCE_BAR) * (profile.tSurfK / Math.max(1, tempK));
		if (inCloud && floor && h > 0) extinctionPerM += (floor.opticalDepth ?? 0) / (h * 0.5);
		// Capped at the horizon from a balloon's height, because at a microbar the air itself would let
		// you see half a billion kilometres and that is true and unsayable. A planet the size of Jupiter
		// curves away in a few hundred kilometres; that is the number a GM can actually use.
		const horizon = Math.sqrt(2 * Math.max(1, (body.radiusKm ?? 6371) * 1000) * 100);  // 100 m aloft
		const seeM = Math.min(horizon, extinctionPerM > 0 ? 3.912 / extinctionPerM : Infinity);
		return { pBar, tempK, light, transmission, floor, ceiling, inCloud, floorHex, extinctionPerM, seeM };
	};

	return {
		topBar, bottomBar, decks, at,
		floorReason:
			`The temperature law is the dry adiabat from the ${GIANT_REFERENCE_BAR} bar anchor, and it matches ` +
			`Galileo's descent into Jupiter to a few percent all the way down. Past ${GIANT_DEPTH_LIMIT_BAR} bar the ` +
			`things it leaves out — the wet adiabat, opacity growing with density, the air's own glow — start ` +
			`to matter, and none of them has been checked. So it stops here.`
	};
}

/** A pressure into words a GM can say. */
export function pressureWords(pBar: number): string {
	if (pBar >= 1) return `${pBar.toFixed(pBar >= 10 ? 0 : 1)} bar`;
	if (pBar >= 0.001) return `${(pBar * 1000).toFixed(0)} mbar`;
	return `${(pBar * 1e6).toFixed(0)} µbar`;
}

export { GRID_NM };
