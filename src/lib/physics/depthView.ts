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

/**
 * WHERE A DECK'S SLAB IS TAKEN TO START, as a fraction of its base pressure. A deck has a base (the
 * saturation crossing) and NO modelled top, so its occupied slab is approximated as
 * [DECK_TOP_AT x base, base] — the same range the "are you inside it" test always used. B83 owns
 * replacing this with a real thickness.
 */
export const DECK_TOP_AT = 0.55;
import { liquidDef } from './liquids';
import { makeupFractions } from './makeup';
import { GRID_NM, blackbodySpectrum, type Spectrum } from './spectrum';
import { bdGlowColour } from '$lib/rendering/apparentColor';
import { SOLAR_TEFF_K } from './luminosity';

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
	/** 0..1 — how deep into the deck's murk you are. Ramps over the top of the slab (a cloud top is
	 *  diffuse), holds 1 to the base (a cloud base is sharp). 0 whenever `inCloud` is false. */
	cloudImmersion: number;
	/** The authored colour of the deck you are in or under, as a material. */
	floorHex: string | null;
	/** Extinction per metre AT THIS DEPTH — Rayleigh scaled by density, plus the deck if you are in it.
	 *  This is what shortens your view and veils your lamps as you go down. */
	extinctionPerM: number;
	/** How far you can see here, by the same contrast rule the surface visibility uses. */
	seeM: number;
	/** Metres BELOW the top of the highest cloud deck — negative means above it. Computed from the
	 *  scale height, so it is the same hydrostatic air the temperature came from. */
	belowCloudTopM: number;
	/** 0..1, how much of the light here is the AIR'S OWN GLOW rather than starlight. Zero on a cold
	 *  giant at any depth; rises past about 800 K and dominates by 1500 K, where the air is a furnace. */
	glowShare: number;
	/** The colour of that glow — the substellar ramp, because it is the same physics: a hot gas
	 *  emitting by temperature. */
	glowHex: string | null;
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
		let cloudImmersion = 0;
		for (const d of decks) {
			const base = d.baseBar as number;
			const tau = d.opticalDepth ?? 0;
			const top = base * DECK_TOP_AT;
			if (base < pBar) {
				// Base is at lower pressure = higher up = wholly above you: its full depth is in the way.
				tauAbove += tau;
				if (!ceiling || base > (ceiling.baseBar as number)) ceiling = d;
			} else if (pBar > top) {
				// INSIDE THE SLAB. The share of the deck above you grows from nothing at its top to
				// everything at its base — which is what makes descending through a deck a fade rather
				// than a step. The step used to land the whole tau the instant you crossed the base, and
				// it read as a jump cut on the slider. Linear in pressure across the slab: cheap, exact
				// at both ends, continuous with the branches either side.
				tauAbove += tau * ((pBar - top) / (base - top));
				if (!floor || base < (floor.baseBar as number)) floor = d;
			} else {
				// Wholly below you — not started yet.
				if (!floor || base < (floor.baseBar as number)) floor = d;
			}
		}
		// "Inside": within the same slab, for a deck thick enough to count — coverage is the honest
		// proxy, a wisp is not a slab. IMMERSION ramps over the first third of the slab, because a
		// cloud TOP is diffuse: you sink into murk, you do not cross a wall. The BASE stays sharp,
		// deliberately — dropping out of a cloud base really is sudden, which is why aircraft do it.
		if (floor && floor.coverage >= 0.3) {
			const base = floor.baseBar as number;
			const top = base * DECK_TOP_AT;
			if (pBar > top) {
				inCloud = true;
				cloudImmersion = Math.min(1, ((pBar - top) / (base - top)) / 0.33);
			}
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
		// HOW FAR DOWN. Hydrostatic: z = H ln(P_top / P), with the top of the highest deck as zero, so
		// the figure reads the way a balloonist would say it — so many kilometres below the cloud tops.
		const topDeckBar = decks.length ? Math.min(...decks.map((d) => d.baseBar as number)) : GIANT_REFERENCE_BAR;
		const belowCloudTopM = h > 0 ? h * Math.log(pBar / topDeckBar) : 0;
		// THE AIR'S OWN GLOW. Below an opaque deck starlight is gone, and on a cold giant that is the
		// end of it — but on a hot one the adiabat runs to incandescence within a few bar, and a dark
		// room is the wrong picture of a furnace. The share is the local blackbody's visible output
		// against the starlight that reached the top of the air: zero at Jupiter's 165 K, rising past
		// ~800 K, dominant by ~1500 K. The colour is the substellar ramp, which is the same physics.
		const glow = blackbodySpectrum(tempK, 1);
		const visSum = (sp: Spectrum) => { let a = 0; for (let i = 0; i < GRID_NM.length; i++) if (GRID_NM[i] >= 380 && GRID_NM[i] <= 700) a += sp[i]; return a; };
		const starVis = visSum(topLight), glowVis = visSum(glow);
		// Scale the blackbody so a 5778 K surface would match the star's own top-of-air light; that
		// makes the ratio meaningful without an absolute radiometric calibration.
		const refVis = visSum(blackbodySpectrum(SOLAR_TEFF_K, 1));
		const glowRel = refVis > 0 && starVis > 0 ? (glowVis / refVis) : 0;
		const glowShare = tempK < 600 ? 0 : Math.max(0, Math.min(1, glowRel / (glowRel + transmission + 1e-12)));
		const glowHex = glowShare > 0.001 ? bdGlowColour(tempK) : null;
		return { pBar, tempK, light, transmission, floor, ceiling, inCloud, cloudImmersion, floorHex, extinctionPerM, seeM, belowCloudTopM, glowShare, glowHex };
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
