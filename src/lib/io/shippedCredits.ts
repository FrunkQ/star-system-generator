// WHAT SHIPS WITH THE APP, AND WHO IT BELONGS TO — as data, in one place.
//
// WHY THIS EXISTS, and it is an obligation rather than tidiness. `ATTRIBUTIONS.md` is the file that
// TRAVELS: a save gets handed to a player, posted to a Discord, opened on somebody else's machine a
// year later by a person who may never run this app. It carried one static sentence ("Bundled
// starter models from NASA are public domain") while the app's own shipped imagery includes CC BY-SA
// and CC BY works — the exact licences that require the author be named wherever the work goes. The
// file even warns a GM that "CC-BY requires naming the author" about THEIR uploads, while saying
// nothing about ours. That is the fault this table closes.
//
// IT IS DATA, NOT PROSE, for the standing reason: a human will want to change these after using the
// product (a new starter model, a replaced illustration), and a credit buried in a template string
// is one nobody can test. `attributions.spec.ts` asserts against the table, so an entry that loses
// its licence is a red suite rather than a silent breach.
//
// KNOWN DUPLICATION, REPORTED RATHER THAN FIXED HERE (stream I, 2026-09-06). Two other copies of
// this list exist and have ALREADY drifted, which is this codebase's most recurring fault:
//   - `components/AboutModal.svelte` (~lines 69-84) — the most complete and current copy, and the
//     one this table was built from.
//   - `README.md` "Visual & Media Credits" — MISSING four of these: the WOH G64 red supergiant, the
//     NASA/Chris Smith red giant, the asteroid and comet images, and the World Zero corporate logos.
// Both should read this table. Moving them is a change to a component and to prose rather than to
// the generator this sweep was asked to fix, so it is written up on the board instead of smuggled in.

/** One thing the app ships, and the terms it ships under. */
export interface ShippedCredit {
  /** What it is, in a GM's words — the reader may never have run the app. */
  what: string;
  /** Who must be named. */
  who: string;
  /** The licence, exactly as claimed. `public domain` and `not subject to copyright` are stated as such. */
  licence: string;
  /** Where it came from, when there is a URL worth carrying. */
  source?: string;
  /** Any change made to the original — a share-alike condition in its own right. */
  changes?: string;
}

/**
 * ASTRONOMY DATA is separate from art because the obligation is different: these are acknowledgement
 * requirements attached to the DATA a real-sky import and the bundled maps are built from, and they
 * hold whether or not the save carries a single picture.
 */
export const SHIPPED_DATA_CREDITS: readonly ShippedCredit[] = [
  {
    what: 'Confirmed exoplanets behind the real-sky import and the bundled starmaps (a snapshot ships with the app)',
    who: 'NASA Exoplanet Archive, operated by the California Institute of Technology under contract with NASA under the Exoplanet Exploration Program',
    licence: 'Acknowledgement required',
    source: 'https://exoplanetarchive.ipac.caltech.edu/'
  },
  {
    what: 'Star identification and astrometry; star-name resolution queries it live',
    who: 'SIMBAD, operated at CDS, Strasbourg, France',
    licence: 'Acknowledgement required',
    source: 'https://simbad.cds.unistra.fr/simbad/'
  },
  {
    what: 'S-star orbital elements at the galactic centre',
    who: 'Gillessen et al. 2017, refined by the GRAVITY Collaboration',
    licence: 'Cited'
  }
];

/** The art and models the app ships, in the order a reader meets them. */
export const SHIPPED_ART_CREDITS: readonly ShippedCredit[] = [
  {
    what: 'Planet type images',
    who: 'Pablo Carlos Budassi',
    licence: 'CC BY-SA 4.0',
    source: 'https://pablocarlosbudassi.com/2021/02/planet-types.html'
  },
  {
    what: 'Star images',
    who: 'Beyond Universe Wiki, on Fandom',
    licence: 'CC BY-SA 3.0 US',
    source: 'https://beyond-universe.fandom.com/wiki/'
  },
  {
    what: 'Star-type illustration: orange giant (Arcturus)',
    who: 'Pablo Carlos Budassi, Wikimedia Commons',
    licence: 'CC BY-SA 4.0'
  },
  {
    what: 'Star-type illustration: red giant',
    who: "NASA's Goddard Space Flight Center / Chris Smith (KBRwyle)",
    licence: 'Public domain',
    source: 'https://science.nasa.gov/universe/stars/types/'
  },
  {
    what: 'Magnetar image',
    who: 'ESO / L. Calcada',
    licence: 'CC BY 4.0',
    source: 'https://www.eso.org/public/images/eso1415a/'
  },
  {
    what: "Red supergiant: an artist's reconstruction of WOH G64",
    who: 'ESO / L. Calcada',
    licence: 'CC BY 4.0',
    source: 'https://www.eso.org/public/images/eso2417a/'
  },
  {
    what: 'Starmap background (the default Milky Way)',
    who: 'ESO / S. Brunier',
    licence: 'CC BY 4.0',
    source: 'https://www.eso.org/public/images/eso0932a/'
  },
  {
    what: 'H-R diagram background',
    who: 'ESO',
    licence: 'CC BY 4.0',
    source: 'https://www.eso.org/public/images/eso0728c/'
  },
  {
    what: 'Black-hole accretion disc image',
    who: "NASA's Goddard Space Flight Center / Jeremy Schnittman",
    licence: 'Public domain',
    source: 'https://svs.gsfc.nasa.gov/13232'
  },
  {
    what: 'Asteroid and comet images: 253 Mathilde (NEAR), 433 Eros (NEAR Shoemaker), 16 Psyche illustration, comet Hartley 2 (EPOXI)',
    who: 'NASA / JPL-Caltech / UMD',
    licence: 'Not subject to copyright'
  },
  {
    what: 'Starter spacecraft models: ISS, Hubble, Cassini-Huygens, Juno, Voyager, Mars Reconnaissance Orbiter',
    who: 'NASA',
    licence: 'Public domain',
    source: 'https://github.com/nasa/NASA-3D-Resources',
    changes: 'Textured models resampled for bundle size. The protected NASA insignia is not used.'
  },
  {
    what: 'Weyland-Yutani logo',
    who: 'IllaZilla, Wikimedia Commons',
    licence: 'CC BY-SA 3.0 Unported',
    source: 'https://commons.wikimedia.org/wiki/File:Weyland-Yutani_cryo-tube.jpg',
    changes: 'Logo extracted.'
  },
  {
    what: 'Corporate logos: Interspan, Kelido, Nexum, Terra, TSEC',
    who: 'World Zero',
    licence: 'CC BY 4.0',
    source: 'https://worldzero.itch.io/'
  }
];

/**
 * The licences that carry a NAMING obligation wherever the work travels — which is precisely why
 * this section is written into a file that leaves the machine. Public-domain entries are listed
 * because a reader deserves to know what is free to reuse, not because they must be.
 */
export const licenceRequiresNaming = (licence: string): boolean => /^cc[- ]by/i.test(licence.trim());
