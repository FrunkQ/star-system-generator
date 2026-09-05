// R-13: THE SHIPPED-CONTENT MANIFEST — generated from the real sources, never hand-written.
//
// The hub has to tell GM-authored content from app-shipped content, and it does that today by
// HARDCODING lists copied out of this repo. Its own account of how that went: the first such list
// "drifted within an hour of being written" — the calendar baseline had one name where it needed
// four, and a facet lied on every map until it was corrected against the real file.
//
// THE ONE RULE THAT MATTERS, AND IT IS WHY THIS FILE EXISTS: **a hand-written manifest is the hub's
// hardcoded list moved one repository over.** It would drift exactly as theirs did, and it would
// drift silently, because nothing in this repo would break. So every value below is read from the
// thing that actually ships, and `shippedManifest.spec.mjs` fails the suite when the checked-in
// output no longer matches a fresh build. Add a star image, rename a calendar, define a fuel — the
// suite goes red until the manifest is rebuilt. That is the whole design.
//
// Same pattern as `scripts/starmap-build/build-starmaps.mjs`, which emits
// `src/lib/generated/bundledArchiveHosts.mjs` and is pinned by `buildKit.spec.mjs`. Nothing new was
// invented here.
//
// REBUILD AFTER THE VERSION BUMP, because `appVersion` is stamped into the file. The starmap kit
// taught that lesson twice; the pin makes it loud rather than subtle.
//
//   node scripts/shipped-manifest/build-shipped-manifest.mjs
//   node scripts/shipped-manifest/build-shipped-manifest.mjs --out <path>    (the pin's temp copy)
//
// TWO OF THE SOURCES ARE TYPESCRIPT and cannot be `import`ed by a plain node script — the tag
// categories and `BUNDLE_FORMAT`. Rather than duplicate either (which is the fault this file
// exists to prevent), the CLI loads them THROUGH VITE, and `buildShippedManifest` takes them as
// arguments so the spec can supply the same values by importing the modules directly. Two routes to
// one truth is deliberate here: if the loaders ever disagreed, the pin would say so.

import { readFileSync, writeFileSync, readdirSync, statSync, mkdirSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
export const REPO = resolve(HERE, '..', '..');

/** Where the manifest is served from. `static/` is copied verbatim, so this is its public URL too. */
export const MANIFEST_FILE = join(REPO, 'static', 'shipped-content.json');
export const MANIFEST_URL = '/shipped-content.json';

/**
 * The asset directories whose CONTENTS are app artwork. Only the two a node's `image.url` can name:
 * `ui/` and `logo/` are chrome and never land on a body, so listing them would tell the hub about
 * pictures it will never meet and invite it to treat chrome as content.
 */
const IMAGE_DIRS = [
  { key: 'starTypes', dir: join('static', 'images', 'star_types'), prefix: '/images/star_types/' },
  { key: 'planetTypes', dir: join('static', 'images', 'planet_types'), prefix: '/images/planet_types/' }
];

const json = (relative) => JSON.parse(readFileSync(join(REPO, relative), 'utf8'));

/**
 * Every file directly inside a directory, sorted, as public URLs.
 *
 * SUBDIRECTORIES ARE SKIPPED, which matters for exactly one of them: `planet_types/thumbs/` holds a
 * generated 128 px WebP for each full-res picture. A thumbnail is DERIVED at display time by
 * `thumbUrl()` and never stored on a node, so it cannot appear in a save the hub is reading; listing
 * 74 more paths the hub will never meet would be noise wearing the costume of completeness.
 */
function filesUnder(dir, prefix) {
  const abs = join(REPO, dir);
  return readdirSync(abs)
    .filter((name) => statSync(join(abs, name)).isFile())
    .sort()
    .map((name) => prefix + name);
}

/**
 * BUILD THE MANIFEST OBJECT.
 *
 * `deps` carries the values that live in TypeScript. Everything else is read here from the file
 * that actually ships it, and every list is SORTED, so a directory listing order or an object key
 * order cannot produce a diff that means nothing.
 */
export function buildShippedManifest(deps) {
  const { bundleFormat, tagCategoryIds, liquidNames } = deps;
  const pkg = json('package.json');

  // Calendars: the registry the app loads at startup (`loadTemporalRegistryConfig`). Its KEYS are
  // the names a GM sees and the names the hub's facet compares against.
  const calendars = Object.keys(json('static/temporal/calendars.json').temporal_registry).sort();

  // Starter models: the NASA hulls, named by the manifest that ships beside them rather than by a
  // directory listing, because that file is what decides which of them the app offers.
  const starterModels = json('static/models/nasa/manifest.json')
    .models.map((m) => `/models/nasa/${m.file}`)
    .sort();

  const appImages = {};
  for (const { key, dir, prefix } of IMAGE_DIRS) appImages[key] = filesUnder(dir, prefix);

  // Gases and fuels ship inside the starter rule pack; liquids are an app constant that a pack MAY
  // override (`allLiquids`). Both are "what SSE ships" as far as the hub is concerned, which is the
  // question this file answers - but the difference is stated in `_comment` rather than smuggled.
  const gases = Object.keys(json('static/rulepacks/starter-sf/atmospheres.json').gasPhysics).sort();
  const fuels = json('static/rulepacks/starter-sf/fuel-definitions.json').entries.map((e) => e.id).sort();

  return {
    _comment:
      'GENERATED by scripts/shipped-manifest/build-shipped-manifest.mjs - do not edit by hand. ' +
      'R-13: what this build of Star System Explorer ships, so the Creator Hub can tell app content ' +
      'from a creator\'s own without hardcoding a copy of these lists. Everything under a path in ' +
      'appAssetPrefixes is app artwork; anything else on a node came from the GM. Lists are sorted. ' +
      'calendars, gases and fuels ship in static/; liquids are the app default and a rule pack may ' +
      'replace them; tagCategories are the categories a fresh campaign starts with.',
    appVersion: pkg.version,
    bundleFormat,
    appAssetPrefixes: [...IMAGE_DIRS.map((d) => d.prefix), '/models/nasa/'].sort(),
    calendars,
    tagCategories: [...tagCategoryIds],
    starterModels,
    appImages,
    gases,
    liquids: [...liquidNames].sort(),
    fuels
  };
}

/** The exact bytes of the manifest. CRLF, because the working tree is CRLF and a mismatch here is
 *  a file that reports itself modified the moment anybody checks it out. */
export function serialiseManifest(manifest) {
  return JSON.stringify(manifest, null, 2).replace(/\n/g, '\r\n') + '\r\n';
}

/** Load the two TypeScript sources through vite, so the CLI reads the same modules the app does. */
async function depsFromSource() {
  const { createServer } = await import('vite');
  const server = await createServer({
    configFile: join(REPO, 'vite.config.ts'),
    server: { middlewareMode: true },
    appType: 'custom',
    logLevel: 'warn'
  });
  try {
    const bundle = await server.ssrLoadModule('/src/lib/io/bundle.ts');
    const tags = await server.ssrLoadModule('/src/lib/tags/tagCategories.ts');
    const constants = await server.ssrLoadModule('/src/lib/constants.ts');
    return {
      bundleFormat: bundle.BUNDLE_FORMAT,
      tagCategoryIds: tags.pristineTagCategories().map((c) => c.id),
      liquidNames: constants.LIQUIDS.map((l) => l.name)
    };
  } finally {
    await server.close();
  }
}

if (import.meta.url === `file://${process.argv[1]}` || process.argv[1]?.endsWith('build-shipped-manifest.mjs')) {
  const outFlag = process.argv.indexOf('--out');
  const out = outFlag === -1 ? MANIFEST_FILE : resolve(process.argv[outFlag + 1]);
  const manifest = buildShippedManifest(await depsFromSource());
  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(out, serialiseManifest(manifest), 'utf8');
  console.log(
    `shipped-content.json written to ${out}: ${manifest.calendars.length} calendars, ` +
      `${manifest.tagCategories.length} tag categories, ${manifest.starterModels.length} starter models, ` +
      `${manifest.appImages.starTypes.length + manifest.appImages.planetTypes.length} images, ` +
      `${manifest.gases.length} gases, ${manifest.liquids.length} liquids, ${manifest.fuels.length} fuels ` +
      `(appVersion ${manifest.appVersion}).`
  );
}
