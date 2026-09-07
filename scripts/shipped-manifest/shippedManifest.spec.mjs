// R-13: THE PIN. `static/shipped-content.json` is generated, so this is what stops it going stale.
//
// The hub's whole reason for asking is that a hand-copied list drifted within an hour of being
// written. A manifest that is ALSO hand-maintained just moves that failure into this repository,
// where it would be quieter — nothing renders it, nothing reads it, and no GM would ever notice.
// So the rule is: **the manifest is not a file somebody edits, it is a build output**, and this
// spec regenerates it in memory and fails when the checked-in copy disagrees.
//
// Add a picture to `static/images/star_types/`, rename a calendar, define a fuel, bump the version:
// this goes red until `npm run manifest` has been run. The
// version case is the one that will actually bite, and it is deliberate — `appVersion` is stamped
// into the manifest, so the REBUILD MUST FOLLOW THE BUMP. The starmap kit learned that twice.
//
// IT READS THE TYPESCRIPT SOURCES DIRECTLY, by a different route from the generator's (which loads
// them through vite, since a plain node script cannot import `.ts`). That is on purpose: the two
// routes to one truth mean a disagreement between them shows up here rather than in the file.
//
// GATE DISCIPLINE (PHY-34): the assertions below include ABSOLUTE ones — a literal model path, a
// literal calendar name, a literal image path, a literal `bundleFormat` — because a spec that only
// deep-equals a build against itself passes just as happily when the builder is wrong.
import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { buildShippedManifest, serialiseManifest, MANIFEST_FILE, MANIFEST_URL, REPO } from './build-shipped-manifest.mjs';
import { BUNDLE_FORMAT } from '../../src/lib/io/bundle.ts';
import { pristineTagCategories } from '../../src/lib/tags/tagCategories.ts';
import { LIQUIDS } from '../../src/lib/constants.ts';
import { STAR_IMAGE } from '../../src/lib/import/realsky/stars.mjs';

/** The manifest as it would be built RIGHT NOW, from the sources as they stand right now. */
function freshManifest() {
	return buildShippedManifest({
		bundleFormat: BUNDLE_FORMAT,
		tagCategoryIds: pristineTagCategories().map((c) => c.id),
		liquidNames: LIQUIDS.map((l) => l.name)
	});
}

/** Said in full wherever the pin can fail for the ordinary reason, because the version bump WILL
 *  trip this and a failing assertion that does not name its remedy gets argued with rather than run. */
const REBUILD =
	'the manifest is stale - run `npm run manifest` (it stamps appVersion, so run it AFTER the version bump)';

const onDiskText = readFileSync(MANIFEST_FILE, 'utf8');
const onDisk = JSON.parse(onDiskText);

describe('R-13: the shipped-content manifest is a build output, not a document', () => {
	it('matches a fresh build, value for value', () => {
		// THE WHOLE POINT. If this fails, something the app ships changed and the manifest did not.
		expect(onDisk, REBUILD).toEqual(freshManifest());
	});

	it('matches a fresh build byte for byte, once line endings are set aside', () => {
		// Formatting counts too - a hand-edit that happens to parse the same is still a hand-edit,
		// and the next generation would rewrite it. Endings are normalised because `core.autocrlf`
		// means the bytes on disk differ between a fresh clone and a working tree.
		const norm = (t) => t.replace(/\r\n/g, '\n');
		expect(norm(onDiskText), REBUILD).toBe(norm(serialiseManifest(freshManifest())));
	});

	it('is served from the app root, at the address the hub is told to fetch', () => {
		// ABSOLUTE: `static/` is copied verbatim into the build, so this path IS the public URL.
		expect(MANIFEST_URL).toBe('/shipped-content.json');
		expect(MANIFEST_FILE).toBe(join(REPO, 'static', 'shipped-content.json'));
	});
});

describe('R-13: what the manifest actually claims, asserted absolutely', () => {
	it('carries the build stamp the hub asked for', () => {
		const pkg = JSON.parse(readFileSync(join(REPO, 'package.json'), 'utf8'));
		expect(onDisk.appVersion, REBUILD).toBe(pkg.version);
		// ABSOLUTE, and it is the one in `bundle.ts`: a reader meeting a higher number should refuse
		// rather than parse what it does not understand, so a silent bump here would be a lie.
		expect(onDisk.bundleFormat).toBe(1);
	});

	it('names the app artwork by path, and the prefixes that identify it', () => {
		// The hub tells app artwork from an upload by matching a path prefix. These ARE those
		// prefixes, so its hardcoded copy can become a fetch.
		expect(onDisk.appAssetPrefixes).toEqual(['/images/planet_types/', '/images/star_types/', '/models/nasa/']);
		expect(onDisk.appImages.starTypes).toContain('/images/star_types/M.webp');
		expect(onDisk.appImages.planetTypes).toContain('/images/planet_types/Comet.png');
		// Every listed image sits under a listed prefix - otherwise the prefix rule the hub is being
		// handed would not cover the list it is handed alongside it.
		for (const url of [...onDisk.appImages.starTypes, ...onDisk.appImages.planetTypes, ...onDisk.starterModels]) {
			expect(onDisk.appAssetPrefixes.some((p) => url.startsWith(p)), url).toBe(true);
		}
	});

	it('leaves the derived thumbnails out, because they never reach a save', () => {
		// `thumbUrl()` builds these at display time; a node's stored `image.url` is always the
		// full-res picture. Listing them would be 73 paths the hub can never meet.
		expect(onDisk.appImages.planetTypes.some((u) => u.includes('/thumbs/'))).toBe(false);
	});

	it('lists the calendars, the starter hulls and the tag categories by name', () => {
		// ABSOLUTE. The calendar list is the exact one whose hand-copied version had ONE name where
		// it needed FOUR - which is the drift that produced this requirement.
		expect(onDisk.calendars).toEqual([
			'Chinese Lunisolar (Simplified)',
			'Earth Gregorian',
			'Mayan Haab (Simplified)',
			'Star Trek Stardate'
		]);
		expect(onDisk.starterModels).toContain('/models/nasa/iss.glb');
		expect(onDisk.tagCategories.slice(0, 3)).toEqual(['status', 'owner', 'purpose']);
		expect(onDisk.liquids).toContain('water');
		expect(onDisk.fuels).toContain('fuel-hydrogen');
		expect(onDisk.gases).toContain('CO2');
	});

	it('keeps every list sorted, so a rebuild cannot produce a diff that means nothing', () => {
		// `tagCategories` is deliberately NOT sorted: its order is the order a fresh campaign shows
		// them in, which is information rather than presentation.
		for (const key of ['appAssetPrefixes', 'calendars', 'starterModels', 'gases', 'liquids', 'fuels']) {
			expect([...onDisk[key]].sort(), key).toEqual(onDisk[key]);
		}
	});
});

describe('R-13: the manifest is only honest if the paths in it exist', () => {
	it('ships a file for every image it lists', () => {
		for (const url of [...onDisk.appImages.starTypes, ...onDisk.appImages.planetTypes]) {
			expect(existsSync(join(REPO, 'static', url.replace(/^\//, ''))), url).toBe(true);
		}
		for (const url of onDisk.starterModels) {
			expect(existsSync(join(REPO, 'static', url.replace(/^\//, ''))), url).toBe(true);
		}
	});

	it('lists every picture the star-type map actually reaches', () => {
		// The reverse direction, and it is the one that catches a REAL fault rather than a stale
		// manifest: `STAR_IMAGE` hands a class its picture, and a path there that is not among the
		// shipped files is a class that draws nothing. Cheap to assert here because both lists are
		// already in hand.
		for (const url of Object.values(STAR_IMAGE)) {
			expect(onDisk.appImages.starTypes, url).toContain(url);
		}
	});
});
