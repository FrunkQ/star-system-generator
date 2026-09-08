// REAL CATALOGUE ROWS, CAPTURED LIVE - the fixtures every real-sky gate stands on (D29, stream U).
//
// WHY THIS FILE EXISTS. A network call does not belong in the suite, but neither does a hand-written
// row: the whole of D29 is the transform mishandling what the catalogue ACTUALLY returns, and a
// synthesised row encodes what we ASSUMED it returns. substellarImport.spec.ts is the worked
// example - it types Luhman 16 'BrownD*', and SIMBAD types it '**', which is the difference between
// an ordinary object and a multiple-star container.
//
// CAPTURED 2026-09-08 by running the importer's OWN simbadStarsAdql for the Local Neighbourhood
// preset (Sol-centred, 16.5 ly) against the live service. 74 rows, verbatim, RA/Dec rounded to 6
// decimal places (~4 mas, far below any separation this code reasons about). Re-capture with
// simbadStarsAdql({ centre: SOL_CENTRE, radiusLy: 16.5 }) if SIMBAD's astrometry moves.
//
// THE ROWS ARE NOT TIDY AND THAT IS THE POINT. Read the four the fault lives in:
//   '* alf CMa'      Sirius A - otype SB*, a SINGLE spectral type. A real star, not a container.
//   '* alf Cen'      a TRUE container - otype SB* as well, but a COMPOSITE type 'G2V+K1V'.
//   'NAME Luhman 16' otype **, composite 'L7.5+T0.5'; its components are not in this result at all.
//   '* eps Ind B'    otype BD*, composite 'T1V+T6V' - the Ba/Bb pair as one row.

export interface SkyRow {
  main_id: string;
  ra: number;
  dec: number;
  plx_value: number | null;
  sp_type: string | null;
  otype: string;
}

/** The Local Neighbourhood census exactly as SIMBAD answers it, largest parallax first. */
export const LOCAL_NEIGHBOURHOOD_ROWS: SkyRow[] = [
  { main_id: "NAME Proxima Centauri", ra: 217.428942, dec: -62.67949, plx_value: 768.0665, sp_type: "M5.5Ve", otype: "PM*" },
  { main_id: "* alf Cen", ra: 219.902083, dec: -60.833972, plx_value: 750.81, sp_type: "G2V+K1V", otype: "SB*" },
  { main_id: "* alf Cen A", ra: 219.902058, dec: -60.833993, plx_value: 742.12, sp_type: "G2V", otype: "PM*" },
  { main_id: "* alf Cen B", ra: 219.896096, dec: -60.837528, plx_value: 742.12, sp_type: "K1V", otype: "PM*" },
  { main_id: "NAME Barnard's star", ra: 269.452077, dec: 4.693365, plx_value: 546.9759, sp_type: "M4V", otype: "BY*" },
  { main_id: "NAME Luhman 16", ra: 162.328814, dec: -53.319466, plx_value: 501.557, sp_type: "L7.5+T0.5", otype: "**" },
  { main_id: "WISEA J085510.74-071442.5", ra: 133.818908, dec: -7.247048, plx_value: 439, sp_type: "Y2", otype: "BD*" },
  { main_id: "Wolf  359", ra: 164.120504, dec: 7.014723, plx_value: 415.1794, sp_type: "dM6", otype: "PM*" },
  { main_id: "HD  95735", ra: 165.834145, dec: 35.969882, plx_value: 392.7529, sp_type: "M2+V", otype: "PM*" },
  { main_id: "* alf CMa", ra: 101.287155, dec: -16.716116, plx_value: 379.21, sp_type: "A0mA1Va", otype: "SB*" },
  { main_id: "G 272-61", ra: 24.756054, dec: -17.950568, plx_value: 375, sp_type: "M5.5V+M6V", otype: "**" },
  { main_id: "* alf CMa B", ra: 101.288767, dec: -16.716868, plx_value: 374.4896, sp_type: "DA1.9", otype: "WD*" },
  { main_id: "G 272-61B", ra: 24.756824, dec: -17.950278, plx_value: 373.8443, sp_type: "M6V", otype: "Em*" },
  { main_id: "G 272-61A", ra: 24.755739, dec: -17.950719, plx_value: 367.7119, sp_type: "M5.5V", otype: "PM*" },
  { main_id: "CD-23 14742", ra: 282.455682, dec: -23.836235, plx_value: 336.0266, sp_type: "M3.5Ve", otype: "PM*" },
  { main_id: "Ross  248", ra: 355.479318, dec: 44.17745, plx_value: 316.4812, sp_type: "M5.0V", otype: "BY*" },
  { main_id: "* eps Eri", ra: 53.232685, dec: -9.458261, plx_value: 310.5773, sp_type: "K2V", otype: "BY*" },
  { main_id: "HD 217987", ra: 346.466816, dec: -35.853071, plx_value: 304.1354, sp_type: "M2V", otype: "PM*" },
  { main_id: "Ross  128", ra: 176.934989, dec: 0.804556, plx_value: 296.3053, sp_type: "dM4", otype: "PM*" },
  { main_id: "V* EZ Aqr", ra: 339.6399, dec: -15.299933, plx_value: 293.6, sp_type: "M5V", otype: "Er*" },
  { main_id: "*  61 Cyg B", ra: 316.730266, dec: 38.742044, plx_value: 286.0054, sp_type: "K7V", otype: "PM*" },
  { main_id: "*  61 Cyg A", ra: 316.724748, dec: 38.749417, plx_value: 285.9949, sp_type: "K5V", otype: "BY*" },
  { main_id: "* alf CMi", ra: 114.825498, dec: 5.224988, plx_value: 284.56, sp_type: "F5IV-V+DQZ", otype: "SB*" },
  { main_id: "HD 173739", ra: 280.694602, dec: 59.630392, plx_value: 283.8401, sp_type: "M3V", otype: "PM*" },
  { main_id: "HD 173740", ra: 280.695394, dec: 59.626867, plx_value: 283.8378, sp_type: "M3.5V", otype: "PM*" },
  { main_id: "HD   1326", ra: 4.595354, dec: 44.022955, plx_value: 280.7068, sp_type: "M2V", otype: "PM*" },
  { main_id: "HD   1326B", ra: 4.607605, dec: 44.027248, plx_value: 280.6947, sp_type: "M3.5V", otype: "PM*" },
  { main_id: "G  51-15", ra: 127.455637, dec: 26.776007, plx_value: 279.2496, sp_type: "M6.5Ve", otype: "PM*" },
  { main_id: "* eps Ind", ra: 330.840223, dec: -56.785979, plx_value: 274.8431, sp_type: "K5V", otype: "PM*" },
  { main_id: "* tau Cet", ra: 26.017013, dec: -15.93748, plx_value: 273.8097, sp_type: "G8V", otype: "PM*" },
  { main_id: "L  372-58", ra: 53.998747, dec: -44.512703, plx_value: 272.1615, sp_type: "M5.5V", otype: "PM*" },
  { main_id: "* eps Ind B", ra: 331.044147, dec: -56.782844, plx_value: 270.658, sp_type: "T1V+T6V", otype: "BD*" },
  { main_id: "V* YZ Cet", ra: 18.127654, dec: -16.998988, plx_value: 269.0573, sp_type: "M4.0Ve", otype: "PM*" },
  { main_id: "BD+05  1668", ra: 111.852079, dec: 5.225789, plx_value: 264.1269, sp_type: "M3.5V", otype: "PM*" },
  { main_id: "NAME Teegarden's Star", ra: 43.253716, dec: 16.881287, plx_value: 260.9884, sp_type: "dM6", otype: "LM*" },
  { main_id: "SCR J1845-6357B", ra: 281.2719, dec: -63.96328, plx_value: 259.45, sp_type: "T6", otype: "BD*" },
  { main_id: "HD  33793", ra: 77.919124, dec: -45.018434, plx_value: 254.1986, sp_type: "M1VIp", otype: "PM*" },
  { main_id: "V* AX Mic", ra: 319.313621, dec: -38.867362, plx_value: 251.9124, sp_type: "M1V", otype: "PM*" },
  { main_id: "HD 239960B", ra: 336.999148, dec: 57.697152, plx_value: 249.9668, sp_type: "M4V", otype: "PM*" },
  { main_id: "HD 239960", ra: 336.997804, dec: 57.695898, plx_value: 249.94, sp_type: "M3", otype: "**" },
  { main_id: "SCR J1845-6357", ra: 281.271889, dec: -63.963181, plx_value: 249.6651, sp_type: "M8.5V", otype: "LM*" },
  { main_id: "HD 239960A", ra: 336.998156, dec: 57.695022, plx_value: 249.3926, sp_type: "M3V", otype: "PM*" },
  { main_id: "DENIS J104814.6-395606", ra: 162.060723, dec: -39.935234, plx_value: 247.2156, sp_type: "M8.5Ve:", otype: "LM*" },
  { main_id: "Ross  614", ra: 97.347465, dec: -2.813557, plx_value: 242.9659, sp_type: "M4.5V", otype: "**" },
  { main_id: "WISE J072227.27-054029.9", ra: 110.616275, dec: -5.675994, plx_value: 242.8, sp_type: "T9", otype: "BD*" },
  { main_id: "BD-12  4523", ra: 247.575243, dec: -12.662589, plx_value: 232.139, sp_type: "M3V", otype: "BY*" },
  { main_id: "Wolf   28", ra: 12.291243, dec: 5.388609, plx_value: 231.78, sp_type: "DZ7.5", otype: "WD*" },
  { main_id: "Wolf  424 A", ra: 188.322573, dec: 9.021124, plx_value: 231.1185, sp_type: null, otype: "PM*" },
  { main_id: "HD 225213", ra: 1.351785, dec: -37.357363, plx_value: 230.097, sp_type: "M2V", otype: "PM*" },
  { main_id: "G   3-33", ra: 30.053985, dec: 13.051945, plx_value: 223.7321, sp_type: "M4.5V", otype: "PM*" },
  { main_id: "Wolf  424 B", ra: 188.322374, dec: 9.020926, plx_value: 223.4775, sp_type: null, otype: "PM*" },
  { main_id: "BD+68   946", ra: 264.107914, dec: 68.339142, plx_value: 219.7898, sp_type: "M3.0V", otype: "PM*" },
  { main_id: "CD-46 11540", ra: 262.16644, dec: -46.895191, plx_value: 219.6463, sp_type: "M3V", otype: "LM*" },
  { main_id: "LP  731-58", ra: 162.052559, dec: -11.336003, plx_value: 219.3302, sp_type: "M6.5V", otype: "PM*" },
  { main_id: "LAWD 37", ra: 176.428821, dec: -64.841517, plx_value: 215.6753, sp_type: "DQ", otype: "WD*" },
  { main_id: "G 208-45", ra: 298.479752, dec: 44.415041, plx_value: 214.5745, sp_type: "M6V", otype: "LM*" },
  { main_id: "BD-15  6290", ra: 343.319719, dec: -14.263696, plx_value: 214.038, sp_type: "M3.5V", otype: "**" },
  { main_id: "G 208-44", ra: 298.477009, dec: 44.414262, plx_value: 213.1329, sp_type: "M5.5Ve", otype: "PM*" },
  { main_id: "L  143-23", ra: 161.08847, dec: -61.209799, plx_value: 206.9698, sp_type: "M5.5V", otype: "PM*" },
  { main_id: "G 158-27", ra: 1.679989, dec: -7.538061, plx_value: 206.35, sp_type: "M5.5V", otype: "PM*" },
  { main_id: "DENIS J025503.3-470049", ra: 43.765386, dec: -47.014266, plx_value: 205.4251, sp_type: "L9", otype: "BD*" },
  { main_id: "HD  88230", ra: 152.84225, dec: 49.454236, plx_value: 205.3148, sp_type: "K6VeFe-1", otype: "PM*" },
  { main_id: "BD+44  2051", ra: 166.369071, dec: 43.526774, plx_value: 203.8876, sp_type: "M1.0V", otype: "PM*" },
  { main_id: "BD+44  2051B", ra: 166.37869, dec: 43.521635, plx_value: 203.8323, sp_type: "M6.0V", otype: "Em*" },
  { main_id: "WISE J163940.83-684738.6", ra: 249.920156, dec: -68.794066, plx_value: 202.3, sp_type: "Y0pec", otype: "BD*" },
  { main_id: "V* AD Leo", ra: 154.90117, dec: 19.870003, plx_value: 201.4064, sp_type: "dM3", otype: "PM*" },
  { main_id: "HD 204961", ra: 323.391563, dec: -49.009, plx_value: 201.3252, sp_type: "M1.5V", otype: "PM*" },
  { main_id: "G 158-50", ra: 3.867129, dec: -16.133786, plx_value: 200.53, sp_type: "M4V", otype: "**" },
  { main_id: "CD-44 11909", ra: 264.265273, dec: -44.319213, plx_value: 199.6944, sp_type: "M3.5V", otype: "PM*" },
  { main_id: "* omi02 Eri B", ra: 63.840815, dec: -7.658112, plx_value: 199.6911, sp_type: "DA2.9", otype: "WD*" },
  { main_id: "* omi02 Eri", ra: 63.817998, dec: -7.65287, plx_value: 199.608, sp_type: "K0V", otype: "PM*" },
  { main_id: "* omi02 Eri b", ra: 63.817998, dec: -7.65287, plx_value: 199.608, sp_type: null, otype: "err" },
  { main_id: "* omi02 Eri C", ra: 63.839733, dec: -7.655748, plx_value: 199.4516, sp_type: "M4.5V", otype: "PM*" },
  { main_id: "V* EV Lac", ra: 341.707214, dec: 44.333993, plx_value: 197.9573, sp_type: "M4.0Ve", otype: "PM*" }
];

/** Pull one row by identifier - the specs name the star they are about. */
export const skyRow = (mainId: string): SkyRow => {
  const row = LOCAL_NEIGHBOURHOOD_ROWS.find((r) => r.main_id === mainId);
  if (!row) throw new Error('skyFixtures: no captured row for ' + mainId);
  return row;
};

// SIMBAD'S h_link HIERARCHY, same capture. THE COORDINATOR'S PARALLAX SUSPICION IS TRUE HERE AND
// ONLY HERE: Luhman 16's two components exist, carry their own positions and their own spectral
// types, and have NO PARALLAX OF THEIR OWN - so plx_value > 0, which every star query carries,
// removes them from every result. '* alf CMa' and '* eps Ind B' have NO children at all, so their
// missing members cannot be recovered this way; only the composite spectral type records them.
export const H_LINK_CHILDREN: Record<string, SkyRow[]> = {
  'NAME Luhman 16': [
    { main_id: 'NAME Luhman 16A', ra: 162.308433, dec: -53.318057, plx_value: null, sp_type: 'L7.5', otype: 'BD*' },
    { main_id: 'NAME Luhman 16B', ra: 162.308644, dec: -53.318278, plx_value: null, sp_type: 'T0.5', otype: 'BD*' }
  ],
  '* alf Cen': [
    { main_id: '* alf Cen A', ra: 219.902058, dec: -60.833993, plx_value: 742.12, sp_type: 'G2V', otype: 'PM*' },
    { main_id: '* alf Cen B', ra: 219.896096, dec: -60.837528, plx_value: 742.12, sp_type: 'K1V', otype: 'PM*' }
  ],
  '* alf CMa': [],
  '* eps Ind B': []
};

// WHAT SIMBAD CARRIES ABOUT A STAR'S SIZE, measured over these same 74 rows on 2026-09-08.
// 'basic' HAS NO MASS, RADIUS OR TEMPERATURE COLUMN - see the TAP_SCHEMA dump on the D29 row.
// These are the coverage figures that decide which source a figure may come from:
//   mesFe_h.teff      64/74 (86%)   a measured effective temperature
//   mesFe_h.log_g     62/74 (84%)   surface gravity
//   allfluxes.K       63/74 (85%)   K magnitude (V is 59/74, G is 62/74)
//   mesDiameter       10/74 (14%)   a DIRECT diameter - and its 'unit' column carries BOTH 'mas'
//                                   and 'km', per row, so it is never read without reading the unit.
// There is no mass column anywhere in SIMBAD. Gaia DR3 is a DEAD END for this region: these stars
// are either absent (Sirius) or too bright to carry astrophysical parameters, and a cone on their
// positions returns faint background sources with null mass_flame/radius_flame.
export interface SkySize {
  main_id: string;
  teff: number | null;
  log_g: number | null;
  V: number | null;
  K: number | null;
  /** A direct diameter where SIMBAD has one, with its own unit. */
  diameter?: { value: number; unit: 'mas' | 'km' };
}

export const SIZE_ROWS: SkySize[] = [
  { main_id: '* alf CMa', teff: 9850, log_g: 4.3, V: -1.46, K: -1.35 },
  { main_id: '* alf CMa B', teff: 10896, log_g: null, V: 8.44, K: null },
  { main_id: '* alf Cen A', teff: 5838, log_g: 4.42, V: 0.01, K: -2.008 },
  { main_id: '* alf Cen B', teff: 5182, log_g: 4.59, V: 1.33, K: -0.6 },
  { main_id: 'NAME Proxima Centauri', teff: 2756, log_g: null, V: 11.13, K: 4.384 },
  { main_id: '* eps Ind', teff: 4694, log_g: 4.4, V: 4.69, K: 2.237 },
  { main_id: '* eps Ind B', teff: null, log_g: null, V: 24.12, K: 11.208 },
  { main_id: 'NAME Luhman 16', teff: null, log_g: null, V: 16.2, K: 8.841 },
  { main_id: 'NAME Luhman 16A', teff: null, log_g: null, V: null, K: 9.44 },
  { main_id: 'NAME Luhman 16B', teff: null, log_g: null, V: null, K: 9.73 },
  { main_id: '* eps Eri', teff: 5039, log_g: 4.52, V: 3.73, K: 1.776, diameter: { value: 960000, unit: 'km' } }
];
