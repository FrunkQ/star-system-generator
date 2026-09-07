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

/** Which help table an editor is asking for. More arrive with the other three editors. */
export const FIELD_HELP_TABLES = {
  gas: GAS_FIELD_HELP
} as const;
