// B5 — the surface albedo model. Bare rock was a flat 0.15 for every world, which is too BRIGHT for
// bare rock (Mercury measures 0.088, Luna 0.11) and far too DARK for a world carrying surface
// deposits (Mars 0.25 from ferric dust, Io 0.63 from SO2 frost). The measurements point three ways
// at once, so the fix is a model — lower the bare-rock constant, then brighten from the deposits the
// engine already derives — and not a Mars patch.
//
// THE ACCEPTANCE TEST IS VISIBLE RATHER THAN DIFF-ONLY: Mars regains its real 210 ppm water-ice
// wisp, with no cloud code and no Mars-specific branch. It survives to Teq 214.5 K and Mars sits at
// 216.7, so it is missing by 2.2 K; at the measured Bond albedo of 0.25 it sits at 210.2 and the
// deck returns with margin. If the wisp does not come back the albedo has not moved far enough; if
// it turns up on a world that should not have one, the deposit brightening is too generous.
import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import { systemProcessor } from '../core/SystemProcessor';
import type { CelestialBody, RulePack, System } from '../types';

function isObject(i: any) { return i && typeof i === 'object' && !Array.isArray(i); }
function deepMerge(t: any, s: any): any {
	const o = { ...t };
	if (isObject(t) && isObject(s)) Object.keys(s).forEach((k) => { o[k] = isObject(s[k]) && (k in t) ? deepMerge(t[k], s[k]) : s[k]; });
	return o;
}
function loadPack(): RulePack {
	const base = path.resolve('static/rulepacks/starter-sf');
	let p: any = JSON.parse(fs.readFileSync(path.join(base, 'main.json'), 'utf-8'));
	for (const f of ['stars.json', 'planets.json', 'generation.json', 'orbital_constants.json',
		'construct_templates.json', 'engine-definitions.json', 'fuel-definitions.json',
		'liquids.json', 'classification.json', 'atmospheres.json']) {
		const fp = path.join(base, f);
		if (fs.existsSync(fp)) p = deepMerge(p, JSON.parse(fs.readFileSync(fp, 'utf-8')));
	}
	return p as RulePack;
}
const pack = loadPack();

function sol(): System {
	const map = JSON.parse(fs.readFileSync(path.resolve('static/example-starmaps/Local_Neighbourhood-Starmap.json'), 'utf-8'));
	return JSON.parse(JSON.stringify(map.systems.find((s: any) => s.name === 'Sol').system)) as System;
}
const processed = () => systemProcessor.process(sol(), pack);
const byName = (s: System, n: string) => s.nodes.find((x) => x.name === n) as CelestialBody;
const decksOf = (b: CelestialBody) => (b.tags ?? []).filter((t) => t.key === 'structure/cloud-deck').map((t) => t.value);

describe('B5 — surface albedo from bare rock plus its deposits', () => {
	// The four anchors, all of them cloud-free, so what is asserted here is the SURFACE model with
	// nothing overhead confusing it. Tolerances are wide enough to be a model rather than a fit and
	// tight enough to fail the flat 0.15 that prompted this: every one of the four is currently
	// 0.15-0.17, so a single band would pass for all four and prove nothing.
	const ANCHORS: { name: string; measured: number; tol: number }[] = [
		{ name: 'Mercury', measured: 0.088, tol: 0.045 },  // bare, dark, airless rock
		{ name: 'Luna', measured: 0.11, tol: 0.045 },      // the other bare-rock anchor
		{ name: 'Mars', measured: 0.25, tol: 0.06 },       // ferric dust brightening
		{ name: 'Io', measured: 0.63, tol: 0.15 }          // SO2 frost, the extreme case
	];

	it('lands the four measured Bond albedos', () => {
		const s = processed();
		const miss: string[] = [];
		for (const a of ANCHORS) {
			const b = byName(s, a.name);
			const got = (b as any).albedoBreakdown?.albedo ?? 0;
			if (Math.abs(got - a.measured) > a.tol) miss.push(`${a.name}: ${got} vs measured ${a.measured} (tol ${a.tol})`);
		}
		expect(miss, 'anchors off:\n  ' + miss.join('\n  ')).toEqual([]);
	});

	it('does not simply move every rocky world to one new constant', () => {
		// Guard the guard. The old model gave all four 0.15-0.17; a fix that gives them all 0.3 would
		// be the same fault with a different number. The anchors must SPREAD.
		const s = processed();
		const vals = ANCHORS.map((a) => (byName(s, a.name) as any).albedoBreakdown?.albedo ?? 0);
		expect(Math.max(...vals) - Math.min(...vals), `anchors did not spread: ${vals.join(', ')}`).toBeGreaterThan(0.35);
	});

	// THE ACCEPTANCE TEST.
	it("Mars regains its water-ice wisp, with no cloud code and no Mars branch", () => {
		const mars = byName(processed(), 'Mars');
		const decks = decksOf(mars);
		expect(decks.length, `Mars has no cloud deck; teq ${(mars as any).equilibriumTempK}`).toBeGreaterThan(0);
		// The real deck is the WATER-ice wisp at 210 ppm, not a CO2 one — Mars has real CO2 clouds
		// but they were never what the engine modelled, and B1 deleted the bogus CO2 deck that had
		// been propping this up for the wrong reason.
		expect(decks.join(','), 'the deck that returned is not the water-ice wisp').toMatch(/water/i);
	});

	it('does not hand a cloud deck to a world that should not have one', () => {
		// If the deposit brightening is too generous, worlds cool into condensation that should not.
		// Venus, Earth and Titan have decks and keep them; Mercury and Luna have no atmosphere at all
		// and must not gain one; the giants are unaffected by a SURFACE model.
		const s = processed();
		for (const n of ['Mercury', 'Luna']) {
			expect(decksOf(byName(s, n)), `${n} gained a cloud deck`).toEqual([]);
		}
		for (const n of ['Venus', 'Earth', 'Titan']) {
			expect(decksOf(byName(s, n)).length, `${n} lost its cloud deck`).toBeGreaterThan(0);
		}
	});

	// The bistability guard. The rust feedback is real — colder, water freezes, stagnant lid, older
	// surface, more rust, brighter, colder — which is the snowball-Earth loop, and a bright
	// condensate is exactly what makes this solve bistable. Of 34 rust-eligible bundled bodies
	// exactly one sits near the water freezing point, so this is a nameable risk, not an unbounded
	// one; the assertion is that the solve still SETTLES on every body rather than oscillating.
	it('the thermal solve still converges on every body in Sol', () => {
		const s = processed();
		const unconverged = s.nodes
			.filter((n: any) => n.kind === 'body' && n.albedoBreakdown)
			.filter((n: any) => /settles between the cloudy and clear states/.test(n.albedoBreakdown.note ?? ''))
			.map((n: any) => n.name);
		expect(unconverged, `solve did not converge on: ${unconverged.join(', ')}`).toEqual([]);
	});
});
