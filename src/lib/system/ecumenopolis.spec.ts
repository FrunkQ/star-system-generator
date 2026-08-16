import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import { classifyByFingerprint } from './classification';
import type { Fingerprint } from '$lib/types';

// `planet/ecumenopolis` had a PICTURE in the rule pack and nothing that could ever emit it — a type
// that shipped and could never be reached. These tests are the guard against that happening again:
// they read the SHIPPED pack rather than a fixture, so deleting the fingerprint or renaming the
// feature it keys on turns them red.
const pack = JSON.parse(fs.readFileSync(path.resolve('static/rulepacks/starter-sf/classification.json'), 'utf-8'));
const classifier = pack.classifier ?? pack;
const FPS: Fingerprint[] = classifier.fingerprints;

describe('a world built from coast to coast is classified as one', () => {
	it('has a fingerprint that can actually emit the type the pack has a picture for', () => {
		expect(classifier.planetImages['planet/ecumenopolis']).toBeTruthy();
		expect(FPS.some((f) => f.class === 'planet/ecumenopolis')).toBe(true);
	});

	it('classifies a fully settled world as an ecumenopolis', () => {
		const city = {
			mass_Me: 1, radius_Re: 1, density: 5.5, Teq_K: 288,
			'hydrosphere.coverage': 0.6, 'atm.pressure_bar': 1,
			settledCover: 1.0
		};
		expect(classifyByFingerprint(city, FPS, 4)[0]).toBe('planet/ecumenopolis');
	});

	it('leaves a lightly settled world alone — Earth is not a city', () => {
		const earth = {
			mass_Me: 1, radius_Re: 1, density: 5.5, Teq_K: 288,
			'hydrosphere.coverage': 0.71, 'atm.pressure_bar': 1,
			settledCover: 0.7
		};
		expect(classifyByFingerprint(earth, FPS, 4)).not.toContain('planet/ecumenopolis');
	});

	it('keys on a GENERIC feature, not on a named morphology', () => {
		// The classifier must not know that `techno` exists — a pack adding a second lit morphology
		// gets this for free. So the match band is on how SETTLED the world is, and nothing else.
		const fp = FPS.find((f) => f.class === 'planet/ecumenopolis')!;
		const keys = Object.keys(fp.match ?? {});
		expect(keys).toContain('settledCover');
		expect(JSON.stringify(fp)).not.toMatch(/techno/i);
	});
});
