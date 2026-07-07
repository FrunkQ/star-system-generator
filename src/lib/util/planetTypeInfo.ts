// Deep links into Pablo Carlos Budassi's planet-type classification page (Education1),
// keyed by SSE fingerprint class. Anchor ids were verified against the live page HTML —
// a few (hyabitableplanet-style typos, 'smtp') are the page's own ids, not ours.
// Types with no entry on the page (e.g. planet/helium) are simply absent: no link is shown.

const PAGE = 'https://pablocarlosbudassi.com/2021/02/planet-types.html';

const ANCHORS: Record<string, string> = {
  'planet/barren': 'barrenplanet',
  'planet/terrestrial': 'terrestrialplanet',
  'planet/planetesimal': 'planetesimal',
  'planet/dwarf-planet': 'dwarfplanet',
  'planet/protoplanet': 'protoplanet',
  'planet/sub-earth': 'subearthplanet',
  'planet/desert': 'desertplanet',
  'planet/ice': 'iceplanet',
  'planet/crater': 'craterplanet',
  'planet/mesoplanet': 'mesoplanet',
  'planet/gas-giant': 'gasgiant',
  'planet/ice-giant': 'icegiant',
  'planet/super-earth': 'superearth',
  'planet/mini-neptune': 'minineptune',
  'planet/sub-neptune': 'subneptune',
  'planet/mega-earth': 'megaearth',
  'planet/ocean': 'oceanplanet',
  'planet/earth-analogue': 'earthanalogplanet',
  'planet/earth-like': 'earthlikeplanet',
  'planet/forest': 'forestplanet',
  'planet/jungle': 'jungleplanet',
  'planet/swamp': 'swampplanet',
  'planet/superhabitable': 'superhabitableplanet',
  'planet/iron': 'ironplanet',
  'planet/silicate': 'silicateplanet',
  'planet/carbon': 'carbonplanet',
  'planet/coreless': 'corelessplanet',
  'planet/supermassive-terrestrial': 'smtp',
  'planet/eyeball': 'eyeballplanet',
  'planet/cold-eyeball': 'coldeyeballplanet',
  'planet/hot-eyeball': 'hoteyeballplanet',
  'planet/methane': 'methaneplanet',
  'planet/ammonia-planet': 'ammoniaplanet',
  'planet/subsurface-ocean': 'subsurfaceoceanplanet',
  'planet/mini-jupiter': 'minijupiter',
  'planet/super-jupiter': 'superjupiter',
  'planet/super-neptune': 'superneptune',
  'planet/water-clouds-gas-giant': 'watercloudsgasgiant',
  'planet/ammonia-clouds-gas-giant': 'ammoniaclouds',
  'planet/hycean': 'hyceanplanet',
  'planet/lava': 'lavaplanet',
  'planet/chthonian': 'chthonianplanet',
  'planet/hot-neptune': 'hotneptune',
  'planet/hot-jupiter': 'hotjupiter',
  'planet/cloudless-gas-giant': 'cloudlessgasgiant',
  'planet/puffy': 'puffyplanet',
  'planet/super-puff': 'superpuffplanet',
  'planet/rogue': 'rogueplanet',
  'planet/ultra-cool-dwarf': 'ultracooldwarf',
  'planet/brown-dwarf': 'browndwarf',
  'planet/sub-brown-dwarf': 'subbrowndwarf',
  'planet/sulfur': 'sulfurplanet',
  'planet/chlorine': 'chlorineplanet',
  'planet/fluorine': 'fluorineplanet',
  'planet/phosphorus': 'phosphorusplanet',
  'planet/alkali-metal-clouds-gas-giant': 'alkalimetal',
  'planet/silicate-clouds-gas-giant': 'silicatecloudsgasgiant',
  'planet/ultra-hot-neptune': 'ultrahotneptune',
  'planet/ultra-hot-jupiter': 'ultrahotjupiter',
};

/** Classification deep-link for a body's primary class, or null when the page has no entry. */
export function planetTypeInfoUrl(classes: string[] | undefined | null): string | null {
  for (const cls of classes ?? []) {
    const anchor = ANCHORS[cls];
    if (anchor) return `${PAGE}#${anchor}`;
  }
  return null;
}
