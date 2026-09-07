// WHAT EVERY FIELD IN A PACK EDITOR ACTUALLY MEANS — as data, in one place.
//
// WHY IT EXISTS. A user, 2026-09-07, working through the gas editor: *"greenhouse factor - I
// actually have no idea how i'm supposed to use this? It's not GWP... shielding factor - i have no
// fucking clue... radiative cooling - i also dont know"*. Every one of those questions has an exact
// answer in the code, and none of it was reachable from the screen where the question is asked.
// Some of it existed as `title=` attributes, which is to say it existed and nobody found it.
//
// THE THREE THINGS A READER NEEDS, and the reason `kind` is a field rather than prose:
//   - MEASURED  - a real physical quantity in real units. Look it up; there is a right answer.
//   - MODEL     - an authored coefficient on a scale this engine invented, with Earth as the
//                 calibration. There is no right answer, only a considered one, and only the RATIOS
//                 between entries carry meaning.
//   - UNREAD    - declared, editable, and read by no engine code. Saying so is the honest thing;
//                 pretending otherwise is how a number acquires a meaning nobody gave it.
// Telling those three apart is most of what the user above was missing: they were hunting for a
// textbook source for a number this project made up, and for a formula behind a number that has no
// formula because nothing reads it.
//
// IT IS DATA BECAUSE FOUR EDITORS ASK THE SAME QUESTION. Gases, Liquids, Fuel & Drives and Sensors
// all present rule-pack fields, and a help string written inline in one modal is a help string the
// next modal writes again and slightly differently. Same standing rule as every other scattered
// constant: a human will want to change these after using the product, so they belong in a file
// that can be read and tested.
//
// EVERY `reads` LINE NAMES THE CODE IT WAS TAKEN FROM, so the next person to change the physics can
// find the sentence that will go stale. `fieldHelp.spec.ts` pins that the named files still exist
// and that every field the editor renders has an entry.

export type FieldHelpKind = 'measured' | 'model' | 'unread';

export interface FieldHelp {
  /** The field as the UI labels it, so a reader can match them by eye. */
  label: string;
  /** What it is, in one sentence a GM can hold. */
  what: string;
  /** What a reader may know it by elsewhere — the name to search a textbook for. */
  alsoCalled?: string;
  /** Real units, when it has any. A bare coefficient has none, and saying so is the point. */
  units?: string;
  kind: FieldHelpKind;
  /** Where the engine reads it and what it does with it, file named. */
  reads?: string;
  /** What the shipped pack actually uses, so a new value has something to sit against. */
  range?: string;
  /** The trap. Usually "it is not the thing you think it is". */
  note?: string;
}

const KIND_BLURB: Record<FieldHelpKind, string> = {
  measured: 'A real measured quantity — look it up and there is a right answer.',
  model: 'An invented scale, calibrated on Earth — only the ratios between gases mean anything.',
  unread: 'Declared and editable, but no engine code reads it. Changing it does nothing today.'
};
export const kindBlurb = (k: FieldHelpKind): string => KIND_BLURB[k];

const KIND_LABEL: Record<FieldHelpKind, string> = {
  measured: 'measured',
  model: 'model coefficient',
  unread: 'not read by the engine'
};
export const kindLabel = (k: FieldHelpKind): string => KIND_LABEL[k];

/** The gas editor's "Derivation — what the physics reads" block, field by field. */
export const GAS_FIELD_HELP: Record<string, FieldHelp> = {
  molarMass: {
    label: 'Molar Mass',
    what: 'The mass of one mole of the gas. It sets how heavy the air is, which decides the scale height, the lapse rate and how easily the gas escapes to space.',
    alsoCalled: 'Molecular weight (M)',
    units: 'kg/mol — note the kilograms: N2 is 0.028, not 28',
    kind: 'measured',
    reads: 'Everywhere. The atmosphere profile turns it into molar heat capacity; escape, scale height and mean molecular weight all read it.',
    range: '0.001 (H) to 0.121 (CFC). N2 0.028, CO2 0.044, H2O 0.018.'
  },

  greenhouse: {
    label: 'Greenhouse Factor',
    what: 'How strongly this gas warms a world for a given amount of it in the air. It is the coefficient in this engine’s own forcing law, not a figure from anywhere else.',
    alsoCalled: 'Nothing standard. It is closest in spirit to a radiative-efficiency term, but it is not one.',
    units: 'none — a bare coefficient',
    kind: 'model',
    reads: 'physics/atmosphere.ts: each gas adds greenhouse x ln(1 + sqrt(100 x its partial pressure in bar)), the sum is broadened by pressure and boosted for dense CO2, then run through a saturating response to get the temperature rise.',
    range: '0 to 150. CO2 22, CH4 25, NH3 18, H2O 3, CFC 150. Zero means it is not a greenhouse gas at all — N2, O2, argon, helium, neon, krypton and H2 are all 0.',
    note: 'IT IS NOT GWP, and the two are not comparable. GWP is per unit MASS, integrated over a century, and includes how long the gas survives in the air. This is per PARTIAL PRESSURE, instantaneous, and inside a logarithm — which is why CO2 and CH4 sit at 22 and 25 here rather than at 1 and about 28. The scale has no external meaning: what it has to do is make Earth’s own mix at 1 bar come out around +33 K, and the ratios between gases carry the judgement.'
  },

  shielding: {
    label: 'Shielding Factor',
    what: 'How well the gas stops ionising radiation — the cosmic rays and stellar particles that would otherwise reach the ground.',
    alsoCalled: 'A mass attenuation coefficient, in spirit. Not radiative forcing, which is a different quantity entirely.',
    units: 'per bar (it multiplies pressure inside an exponential)',
    kind: 'model',
    reads: 'physics/radiation.ts: the composition-weighted mean of this factor times the surface pressure gives transmission = exp(-score x pressure_bar), applied to photons and to any particles the magnetosphere did not already deflect.',
    range: '0.2 (atomic hydrogen) to 80 (iron vapour). N2 7.2, O2 7.5, CO2 8. A gas with no value at all is treated as 0.5.',
    note: 'Earth is the calibration here too: its N2/O2 mix at 1 bar scores about 7, so transmission is e^-7 — roughly a thousandth of what arrives at the top of the air gets down.'
  },

  boilK: {
    label: 'Boiling Point',
    what: 'Where this substance turns from liquid to gas at one atmosphere.',
    alsoCalled: 'Boiling point, T_b',
    units: 'K',
    kind: 'measured',
    reads: 'The body’s Atmosphere tab, which compares it with the world’s temperature to tell you a listed gas is actually condensed there. No derivation reads it: whether a cloud deck forms is decided by the gas’s own `cloud` block, not by this figure.',
    range: 'N2 77, CO2 195, H2O 373.',
    note: 'CO2 sublimes at one bar rather than boiling, so its 195 is the working figure the panel needs rather than a true boiling point.'
  },

  meltK: {
    label: 'Melting Point',
    what: 'Where this substance freezes out. For the world’s MAIN gas this decides whether it frosts onto the ground.',
    alsoCalled: 'Melting point, freezing point, T_m',
    units: 'K',
    kind: 'measured',
    reads: 'physics/albedo.ts: if the surface is below the main gas’s melting point, that share of the air frosts out and brightens the ground — deliberately general rather than a special case, which is why Mars’s CO2 correctly does not frost globally and Earth’s nitrogen never comes close.',
    range: 'N2 63, CH4 90, H2O 273.'
  },

  specificHeat: {
    label: 'Specific Heat',
    what: 'How much heat it takes to warm a kilogram of the gas by one kelvin, at constant pressure. It decides how fast temperature falls with altitude.',
    alsoCalled: 'Isobaric specific heat capacity, c_p',
    units: 'kJ/(kg·K) — per MASS, not per mole',
    kind: 'measured',
    reads: 'physics/atmosphereProfile.ts: multiplied by 1000 and by the molar mass to get molar c_p, which gives the adiabatic exponent K = R/c_p and therefore the lapse rate — about 0.29 for a hydrogen giant, 0.22 for a CO2 world.',
    range: '0.25 (krypton) to 14.3 (hydrogen). N2 1.04, CO2 0.84, H2O 1.86.',
    note: 'A straight textbook lookup. Watch the units: tables often give J/(mol·K), and this field wants kJ/(kg·K) — divide by the molar mass in grams.'
  },

  radiativeCooling: {
    label: 'Radiative Cooling',
    what: 'Intended as how readily the gas radiates heat back to space. It has never been connected to anything.',
    units: 'none',
    kind: 'unread',
    reads: 'Nothing. It is declared in types.ts, defaulted to 0.1 when you add a gas, and carried on all 33 shipped gases — and no engine code reads it. Every world would come out identical with all of these set to zero.',
    range: '0 to 0.9 in the shipped pack, which is authored intent rather than measured behaviour.',
    note: 'Reported for a decision on whether to wire it up or remove it. Until then, changing it has no effect on any world, and the group heading above overstates this one field.'
  },

  rayleigh: {
    label: 'Rayleigh',
    what: 'How hard the gas scatters visible light, relative to nitrogen. This is what makes a sky blue, and what colour of blue.',
    alsoCalled: 'Rayleigh scattering cross-section',
    units: 'none — a ratio, with N2 as 1',
    kind: 'measured',
    reads: 'The surface-light chain: the visible-light counterpart of the shielding factor, which handles the ionising end.',
    range: '0.06 (helium) to 50 (potassium vapour). CO2 2.45, H2 0.21. Blank means 1 — treat it like nitrogen.',
    note: 'The ratio is why a thick CO2 sky is not simply a thicker blue one.'
  },

  absorptionBands: {
    label: 'Absorption Bands',
    what: 'Where in the spectrum this gas eats incoming light, written as Gaussian notches — a centre wavelength, a width and a depth.',
    alsoCalled: 'Absorption lines or bands; the notches are a smoothed stand-in for real line structure.',
    units: 'nm for the centre and width',
    kind: 'measured',
    reads: 'The surface-light chain: these notches are cut out of the star’s spectrum on the way down, which sets the colour of the ground, the sea and the sky, and what colour photosynthesis would be.',
    range: '16 of the 33 shipped gases carry bands. No bands is the honest answer for nitrogen, argon and the noble gases — they then take only their Rayleigh share.',
    note: 'Oxygen does carry one (the 762 nm A-band), so "no bands" is not the same as "not interesting".'
  },

  colorHex: {
    label: 'Colour',
    what: 'The colour this gas lends the air when there is enough of it to see.',
    units: 'hex colour, or blank for colourless',
    kind: 'model',
    reads: 'rendering/apparentColor.ts, for the tint of a thick atmosphere, and the chips on the body’s Atmosphere tab. It feeds appearance only — no derived figure changes if you change it.',
    range: '13 of the 33 shipped gases carry one: methane, SO2, chlorine, fluorine, sodium, potassium, iron, SiO, sulphuric acid, sulphur and NH4SH. The rest are blank, which is the honest answer for a colourless gas.'
  }
};

/**
 * WHERE THE HELP PANEL GOES, as arithmetic rather than as CSS — so it can be tested.
 *
 * THE FAULT THIS EXISTS TO PREVENT, measured 2026-09-07 before it was fixed: these editors are long
 * lists inside a modal whose body scrolls, and an absolutely-positioned panel is CLIPPED by that
 * scroller as soon as its field sits low in the list. The panel was cut off by 146 px, and what goes
 * missing is the bottom - which is where the note a reader most needs sits. So the panel is
 * positioned `fixed` from the button's own rect, where no ancestor can crop it, and this decides
 * where: below when there is room, flipped above when there is not, clamped into the viewport on
 * both axes, and never shorter than a usable height.
 */
export interface PopoverBox { left: number; top: number; maxH: number; }
export function placePopover(
  dot: { left: number; top: number; bottom: number },
  viewport: { width: number; height: number },
  opts: { width?: number; gap?: number; margin?: number; maxH?: number; minH?: number } = {}
): PopoverBox {
  const width = opts.width ?? 380;
  const gap = opts.gap ?? 6;
  const margin = opts.margin ?? 12;
  const cap = opts.maxH ?? 420;
  const floor = opts.minH ?? 160;
  const w = Math.min(width, viewport.width - margin * 2);
  const below = viewport.height - dot.bottom - gap - margin;
  const above = dot.top - gap - margin;
  // Prefer dropping DOWN, which is what a reader expects, and flip only when below is both
  // insufficient and worse than above.
  const dropDown = below >= 200 || below >= above;
  const room = dropDown ? below : above;
  return {
    left: Math.max(margin, Math.min(dot.left, viewport.width - w - margin)),
    top: dropDown ? dot.bottom + gap : Math.max(margin, dot.top - gap - Math.min(above, cap)),
    maxH: Math.max(floor, Math.min(cap, room))
  };
}

/** The liquids editor. A "liquid" here is any condensable substance - a sea, a cloud deck's
 *  condensate, or a molten interior layer - and water is not special: every one carries its own
 *  phase diagram. */
export const LIQUID_FIELD_HELP: Record<string, FieldHelp> = {
  meltK: {
    label: 'Melting Point',
    what: 'Where this substance freezes at one bar. The bottom of its liquid range.',
    alsoCalled: 'Freezing point, T_m',
    units: 'K',
    kind: 'measured',
    reads: 'physics/liquids.ts `phaseAt`, and it is the low anchor of the pressure-aware curve in `boilKAt`. Below it the engine has ice rather than a sea, which changes albedo, the hydrosphere and what can condense.',
    range: 'methane 90, nitrogen 63, water 273, sulfur 388, molten iron 1811.'
  },
  boilK: {
    label: 'Boiling Point (1 bar)',
    what: 'Where it boils at one bar - the top of the liquid range at Earth sea-level pressure.',
    alsoCalled: 'Normal boiling point, T_b',
    units: 'K',
    kind: 'measured',
    reads: 'physics/liquids.ts. It is the MIDDLE anchor of `boilKAt`, and only when the triple pressure sits below 1 bar: for carbon dioxide, whose triple point is at 5.1 bar, this figure is never consulted at all.',
    range: 'methane 112, nitrogen 77, water 373, sulfuric acid 610.'
  },
  tripleBar: {
    label: 'Triple Pressure',
    what: 'The pressure at the triple point, where solid, liquid and gas all meet. Below it a solid sublimes straight to gas and there is no liquid at any temperature.',
    alsoCalled: 'Triple point pressure',
    units: 'bar',
    kind: 'measured',
    reads: 'physics/liquids.ts `boilKAt` uses it as the low anchor, and the saturation curve switches to Clausius-Clapeyron below it - which is the whole reason Mars has water-ice clouds at 180 K. SystemProcessor also reads it to decide that a surface ice sublimes rather than melts.',
    range: 'water 0.006, CO2 5.1 (above one bar, which is why dry ice sublimes), ethane 1e-5.'
  },
  criticalK: {
    label: 'Critical Temperature',
    what: 'Above this there is no liquid at any pressure - the substance is a supercritical fluid and there is no longer a distinct condensate.',
    alsoCalled: 'Critical point temperature, T_c',
    units: 'K',
    kind: 'measured',
    reads: 'physics/cloudDecks.ts stops a deck forming above it (no distinct condensate to make cloud out of), and it is the high anchor of `boilKAt`.',
    range: 'methane 191, water 647, sulfur 1314. Blank for the molten interior liquids, which never get near it.'
  },
  criticalBar: {
    label: 'Critical Pressure',
    what: 'The pressure at the critical point - the high end of the phase curve.',
    alsoCalled: 'Critical point pressure, P_c',
    units: 'bar',
    kind: 'measured',
    reads: 'physics/liquids.ts, the high anchor of `boilKAt`. With the triple point it defines the whole boiling curve, which is read both ways: forwards for "does this boil here" and backwards for "at what partial pressure does this condense".',
    range: 'water 218, methane 46, ammonia 113.'
  },
  density_gcc: {
    label: 'Density',
    what: 'How heavy the liquid is, which decides how much of it a cloud deck can hold up.',
    alsoCalled: 'Mass density, rho',
    units: 'g/cc (grams per cubic centimetre) - water is 1',
    kind: 'measured',
    reads: 'physics/cloudDecks.ts converts it to kg/m3 for the column a deck suspends.',
    range: '0.42 (methane) to 7 (molten iron). Water 1, ammonia 0.68.'
  },
  refractiveIndex: {
    label: 'Refractive Index',
    what: 'How much the liquid bends light, which sets how strongly a sea reflects at a glancing angle - why an ocean turns to glare near the horizon.',
    alsoCalled: 'Index of refraction, n',
    units: 'none - a ratio against vacuum',
    kind: 'measured',
    reads: 'rendering/apparentColor.ts, for the Fresnel reflection off a liquid surface. Blank falls back to 1.33, which is water.',
    range: '1.2 to 2.9. Water 1.333, methane 1.286, molten iron 2.9.'
  },
  colorHex: {
    label: 'Colour',
    what: 'The colour of the liquid itself, seen as a sea and as the tint of a cloud made of it.',
    units: 'hex colour',
    kind: 'model',
    reads: 'rendering/apparentColor.ts, for the sea and for the condensate tint of a deck. Appearance only - no derived figure moves.',
    range: 'Every shipped liquid carries one, from water at a pale blue to molten iron at a glowing orange.'
  },
  cloudOpacity: {
    label: 'Cloud Opacity',
    what: 'How much light a deck of this condensate blocks, at full coverage.',
    units: '0 to 1',
    kind: 'model',
    reads: 'physics/surfaceSpectrum.ts: it veils the light reaching the ground, scaled by how much of the sky the deck holds. Blank behaves as 0.5.',
    range: '0 to 1; most shipped condensates sit around 0.5 to 0.8.'
  },
  cloudAlbedo: {
    label: 'Cloud Albedo',
    what: 'How much sunlight a deck of this condensate reflects back to space - the biggest single lever on a world temperature once it is cloudy.',
    alsoCalled: 'Cloud reflectivity',
    units: '0 to 1',
    kind: 'measured',
    reads: 'The albedo fixed point, which is why it moves TEMPERATURE and not only appearance: decks composite bottom-up and the top one has the largest say. The apple panel prints it beside the coverage. Blank behaves as 0.45.',
    range: 'water 0.42, sulphuric acid 0.76, ammonia 0.51, methane haze 0.28.'
  },
  cloudTintDistance: {
    label: 'Cloud Tint Distance',
    what: 'How deep you have to look through this condensate before it shows its own colour rather than reading white.',
    units: 'a depth scale, not metres',
    kind: 'model',
    reads: 'physics/cloudDecks.ts `condensateTint`, by way of rendering/apparentColor.ts. It is measured in 0-255 colour terms against the liquid own distance from white, so a small number keeps a deck pale and a large one lets its colour through.',
    range: 'Only 6 of the 24 shipped liquids set one, from 110 (ammonium hydrosulphide) to 210 (astrophage bloom). Blank takes the engine default of 60, which is what keeps water and ammonia decks reading white.',
    note: 'Droplets scatter light and go white however dark the bulk liquid is - that is the physical fact this dial exists to express, so leaving it blank is usually right.'
  },
  biosolvent: {
    label: 'Biosolvent',
    what: 'How good this liquid is as a solvent for life, which is a quarter of a world habitability score.',
    units: 'ideal / alternative / none',
    kind: 'model',
    reads: 'physics/liquids.ts `biosolventScore` turns it into 1.0 for ideal, 0.6 for alternative and 0 for anything else, into the 25-mark solvent term. So an alternative solvent tops out at 15 of those 25.',
    range: 'ideal: water and salty water. alternative: ammonia, water-ammonia, methane, ethane, hydrogen cyanide. Everything else none.',
    note: 'One shipped liquid is marked `poor`, which the scorer does not recognise and therefore treats exactly as `none`. If you meant "worse than alternative", there is no such rung today.'
  },
  conductive: {
    label: 'Electrically Conductive',
    what: 'Whether a layer of this can carry a dynamo - the thing that gives a world a magnetic field.',
    units: 'yes / no',
    kind: 'measured',
    reads: 'The magnetism chain by way of the fluid layers: a conductive layer in motion is what a magnetic field is generated by.',
    range: 'Off for almost everything; on for the molten metals, metallic hydrogen, superionic water and a salty ocean.'
  },
  incandescent: {
    label: 'Incandescent',
    what: 'Whether the liquid glows by its own heat - a lava sea that lights its own night side.',
    units: 'yes / no',
    kind: 'model',
    reads: 'rendering/planetAppearance.ts: a molten ocean covering enough of the world is drawn glowing rather than lit.',
    range: 'Only 3 of the 24 shipped liquids set it: magma, molten iron and molten glass.'
  },
  family: {
    label: 'Family',
    what: 'Which kind of liquid this is, which decides where it is allowed to appear.',
    units: 'water / cryo / hydrocarbon / acid / molten / rock / exotic / internal',
    kind: 'model',
    reads: 'generation/generateBodyOfType.ts excludes `internal` from surface seas - those are interior layers only - and rendering/apparentColor.ts reads the family for how a sea of it looks.',
    range: 'Use `internal` for anything that only ever exists under the crust, such as metallic hydrogen or a molten mantle.'
  }
};

/** The fuels half of Fuel & Drives. `availability` is deliberately absent: it is authored and
 *  editable but no code reads it, and the owner's call (2026-09-07) was to skip it rather than
 *  document a control that does nothing. */
export const FUEL_FIELD_HELP: Record<string, FieldHelp> = {
  density_kg_per_m3: {
    label: 'Density',
    what: 'How heavy a unit of this propellant is. It turns a tank volume into the mass the rocket equation acts on, so it is half of a ship range.',
    alsoCalled: 'Propellant density, rho',
    units: 'kg/m3',
    kind: 'measured',
    reads: 'construct-logic.ts: tank units times this gives the fuel mass, which sets the wet mass and therefore the delta-v.',
    range: '59 (helium-3) to 19,000 (enriched uranium). Liquid hydrogen 71, methalox 830, water 1000.',
    note: 'A low density is not a free win: hydrogen has a superb exhaust velocity and needs an enormous tank to hold it.'
  },
  refuel_tags: {
    label: 'Can be refuelled where',
    what: 'Which resource or frontier tags a place must carry before a ship can take this fuel on there.',
    units: 'a list of tag keys',
    kind: 'model',
    reads: 'transit/autopilotAdapter.ts and constructs/inheritance.ts: the autopilot searches for a stop carrying one of these when a ship needs topping up, and the ship own tags inherit them.',
    range: 'Liquid hydrogen lists `resource/water-ice`, `frontier/ice-mining`, `frontier/gas-skimming` and `frontier/fuel-depot`.',
    note: 'This is the whole of the refuelling economy. A fuel nothing on your map can supply will strand a ship, and its log will say so rather than quietly teleporting fuel to it.'
  }
};

/** The drives half of Fuel & Drives.
 *
 *  `exhaust_color_hex` has no entry ON PURPOSE: it is a real engine field, but this editor exposes
 *  no control for it, and help for a control that does not exist is help nobody ever sees. If the
 *  editor gains one, it wants an entry - the gate below will not remind you, because it only checks
 *  the direction that can mislead a reader. */
export const ENGINE_FIELD_HELP: Record<string, FieldHelp> = {
  type: {
    label: 'Type',
    what: 'What kind of drive this is. Mostly flavour - with one exception that catches people out.',
    units: 'free text',
    kind: 'model',
    reads: 'construct-logic.ts checks it for ONE exact string.',
    range: 'Chemical, Nuclear Thermal, Nuclear Pulse, Electric, Fusion, Annihilation, Spacetime and Photonic in the shipped set.',
    note: 'AN ENGINE TYPED EXACTLY `Chemical (Monopropellant)` IS LEFT OUT OF EVERY PROPULSION TOTAL - thrust, ISP and power all skip it. That is how RCS blocks are kept from flattering a ship main-drive figures, and it means the string is load-bearing rather than decorative: spell it differently and your thrusters start counting as a main drive.'
  },
  fuel_type_id: {
    label: 'Fuel Type',
    what: 'Which propellant this drive burns. It links the drive to a fuel entry, and through that to everywhere the ship can refuel.',
    units: 'a fuel id',
    kind: 'model',
    reads: 'construct-logic.ts matches it against the tank fuel to work out mass and endurance; the autopilot follows it to that fuel refuel tags when it goes looking for a depot.',
    range: 'One of the 14 shipped fuels - hydrazine, methalox, liquid hydrogen, water, xenon, argon, enriched uranium, pulse units, deuterium-tritium, helium-3, metallic hydrogen, antihydrogen, exotic matter or astrophage - or one you add.',
    note: 'A drive pointed at a fuel your map cannot supply anywhere is a drive that will strand its ship. The fuel own refuel tags are where that is decided.'
  },
  thrust_kN: {
    label: 'Thrust',
    what: 'How hard the drive pushes in vacuum. With the ship mass it decides the acceleration, and therefore whether it can lift off a world at all.',
    alsoCalled: 'Vacuum thrust, F',
    units: 'kN (kilonewtons). 1 kN accelerates 1 tonne at 1 m/s2.',
    kind: 'measured',
    reads: 'construct-logic.ts: thrust_kN x 1000 x how many you fitted, summed, gives the vacuum thrust; the flight profile turns it into a thrust-to-weight and an ascent verdict.',
    range: '0.05 kN (ion thruster) to 200,000 kN (antimatter beam core). Methalox main drive 2,500.',
    note: 'Thrust and ISP pull against each other in real propulsion, and the shipped set honours that: the ion thruster has 4,000,000 times less thrust than the antimatter drive while its ISP is only 830 times worse.'
  },
  efficiency_isp: {
    label: 'ISP',
    what: 'Specific impulse - how much push you get per unit of propellant burnt. The single biggest lever on how far a ship can go.',
    alsoCalled: 'Specific impulse, Isp. Exhaust velocity is Isp x 9.81 m/s.',
    units: 'seconds',
    kind: 'measured',
    reads: 'construct-logic.ts weights it by each engine thrust contribution, and the rocket equation turns it into range: dv = Isp x 9.81 x ln(wet mass / dry mass).',
    range: '230 s (monopropellant) to 30,570,000 s (Astrophage). Methalox 370, NTR 900, ion 12,000, Epstein fusion 1,100,000.',
    note: 'For scale: real chemical rockets top out near 450 s, so everything past the nuclear-thermal row is science fiction of one degree or another.'
  },
  atmo_efficiency: {
    label: 'Atmospheric Efficiency',
    what: 'What fraction of the vacuum thrust survives inside an atmosphere. Zero means the drive cannot be used in air at all.',
    units: '0 to 1',
    kind: 'model',
    reads: 'construct-logic.ts multiplies both the thrust and the ISP by it to get the in-atmosphere figures the ascent check reads.',
    range: '0 for the ion, plasma and pulse drives - none of them work in air. 0.6 to 0.95 for the chemical drives. Blank behaves as 1.',
    note: 'A zero here is what makes a ship orbit-only, and the flight profile says so rather than letting it try to land.'
  },
  powerDraw_MW: {
    label: 'Power',
    what: 'What the drive asks of the ship reactor while it is burning.',
    units: 'MW',
    kind: 'model',
    reads: 'construct-logic.ts sums it across the fitted engines into the ship total power draw.',
    range: '0.01 MW (RCS) to 5,000 MW (warp ring). The electric drives are the interesting case: tiny thrust, large appetite.'
  },
  drive_tags: {
    label: 'Provides FTL drive',
    what: 'Tags this drive grants the ship it is fitted to - which is how a ship becomes capable of interstellar travel.',
    units: 'a list of tag keys; blank means sublight',
    kind: 'model',
    reads: 'constructs/inheritance.ts: a ship inherits these from its fitted engines, and the interstellar routing asks the ship for them.',
    range: 'Exactly one of the 13 shipped drives carries any - the Alcubierre Warp Ring, tagged `drive/warp`. Every other drive, the antimatter beam core included, is sublight.',
    note: 'Blank is the normal case, and it is not a measure of power: a drive with nothing here is sublight however impressive its ISP.'
  }

};

/** The sensors editor. A sensor is a range and a promise about what it can see at that range. */
export const SENSOR_FIELD_HELP: Record<string, FieldHelp> = {
  range_km: {
    label: 'Range',
    what: 'How far this sensor reaches. Everything a sensor does follows from this one number.',
    units: 'km internally. The editor lets you type km or AU and converts; 1 AU is 149,597,870 km.',
    kind: 'model',
    reads: 'components/ConstructSensorsTab.svelte, which compares it with the distance to a target to decide what a ship can see.',
    range: '0.5 km (a hardline datalink) to 15 billion km (a passive RF antenna at 100 AU). The Traveller bands sit in here too, at their own standard distances.',
    note: 'It is stored in km whatever you typed, so a figure that looks wrong is usually a unit that was not the one you meant.'
  },
  preferred_unit: {
    label: 'Unit',
    what: 'Which unit this sensor range is quoted in when it is shown to you.',
    units: 'km or AU',
    kind: 'model',
    reads: 'components/ConstructSensorsTab.svelte. Blank falls back to a sensible guess: AU when the range is an AU or more, km below that.',
    range: 'The shipped set quotes the telescopes and the passive antenna in AU and everything closer-range in km.',
    note: 'Display only - it changes nothing about what the sensor can see.'
  },
  description: {
    label: 'Description (Targets / Data)',
    what: 'What this sensor is for, in your own words: what it can be pointed at, and what it tells you when it is.',
    units: 'free text',
    kind: 'model',
    reads: 'Shown to you and to your players on the sensors tab. Nothing parses it.',
    range: 'The shipped set writes "Range: 50 AU. Targets: Star, Gas Giant, Ice Giant. Reveals: Stellar Details, Planetary Basics".',
    note: 'That "Range / Targets / Reveals" shape is a convention rather than a format - the engine reads none of it, so the phrasing is yours. Note that the range it repeats is only prose: the actual reach is the Range field above, and nothing keeps the two in step for you.'
  }
};

/** Which help table an editor is asking for. More arrive with the other three editors. */
export const FIELD_HELP_TABLES = {
  gas: GAS_FIELD_HELP,
  liquid: LIQUID_FIELD_HELP,
  fuel: FUEL_FIELD_HELP,
  engine: ENGINE_FIELD_HELP,
  sensor: SENSOR_FIELD_HELP
} as const;
