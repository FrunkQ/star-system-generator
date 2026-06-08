// Generates static/examples/Testion-System.json — a demo/test system whose bodies are built
// to each classify as a DISTINCT planet type once physics runs. Dev tool (run with node).
const fs = require('fs');
const EM = 5.972e24, ER = 6371; // Earth mass kg, radius km
// radius (Re) from mass (Me) + bulk density (g/cc): density = 5.513 * Me / Re^3
const reFromDensity = (Me, d) => Math.cbrt(5.513 * Me / d);
// Interior makeup → bulk density → radius (mirrors lib/physics/makeup.ts).
const GRAIN = { metal: 7.9, rock: 3.3, carbon: 2.3, ice: 0.95, gas: 0.12 };
const densFromMakeup = (m) => { let inv = 0, sum = 0; for (const k in m) sum += m[k]; for (const k in m) inv += (m[k] / sum) / GRAIN[k]; return 1 / inv; };
const reFromMakeup = (Me, m) => Math.cbrt((Me / densFromMakeup(m)) * 5.513);
// a_AU for a target equilibrium temp. Testion is luminous (~30 L☉), so Teq ≈ 651 / sqrt(a):
// hot zones spread to larger orbits, separating the cloud-type giants from each other.
const aFromTeq = (Teq, K = 651) => +( (K / Teq) ** 2 ).toFixed(4);

let idn = 0;
const nodes = [];
const star = {
  id: 'testion', parentId: null, name: 'Testion', kind: 'body', roleHint: 'star',
  classes: ['star/F', 'star/F2V'], massKg: 2.6e30, radiusKm: 2750000, temperatureK: 6800,
  magneticField: { strengthGauss: 1 }, radiationOutput: 1,
  image: { url: '/images/star_types/F.webp' }, tags: [],
  description: 'Testion — a luminous F-type star hosting one of (nearly) every planet type. A classification test-bed: load it, run physics, and every world classifies to a distinct type.'
};
nodes.push(star);

function body(spec) {
  const { target, Me, d, Re, makeup, Teq, a, e = 0.02, atmMain, atmP = 0, comp, hydroComp, hydroCov = 0, rotH, mag = 0.3, locked = false, name, parent = 'testion', role = 'planet' } = spec;
  const radius_Re = Re != null ? Re : (makeup ? reFromMakeup(Me, makeup) : reFromDensity(Me, d));
  const id = `t-${++idn}-${target.replace('planet/', '')}`;
  const aAU = a != null ? a : aFromTeq(Teq);
  const n = {
    id, parentId: parent, name: name || target.replace('planet/', '').replace(/-/g, ' '),
    kind: 'body', roleHint: role, __target: target,
    orbit: { hostId: parent, elements: { a_AU: aAU, e, i_deg: 0, omega_deg: 0, Omega_deg: 0, M0_rad: 0 } },
    massKg: Me * EM, radiusKm: radius_Re * ER,
    magneticField: { strengthGauss: mag }, tags: [],
  };
  if (rotH != null) n.rotation_period_hours = rotH;
  if (makeup) n.makeup = makeup;
  if (locked) n.tidallyLocked = true;
  if (atmMain) n.atmosphere = { name: atmMain, main: atmMain, pressure_bar: atmP, composition: comp || { [atmMain]: 1 } };
  if (hydroCov > 0) n.hydrosphere = { composition: hydroComp || 'water', coverage: hydroCov };
  nodes.push(n);
  return n;
}

// Density bands: coreless 1.5-3.2 | terrestrial(generic) 3-8.5 | silicate 4.5-8 | iron 8-25.
// Climate/atmosphere worlds use density 4.0 (a terrestrial "gap" below silicate, above
// coreless) so their Teq/hydro/atm bands — not density — decide the type.

// The neutral rocky density 3.75 g/cc sits in the gap between coreless (≤3.2) and silicate
// (≥4.5) so climate/atmosphere worlds classify by Teq/hydro/atm, not density.
const NEU = 3.75;

// ---- Rocky size / composition series ----
body({ target: 'planet/sub-earth', Me: 0.25, d: 5.0, Teq: 280, atmMain: 'CO2', atmP: 0.01 });
body({ target: 'planet/terrestrial', Me: 0.8, makeup: { rock: 1.0 }, Teq: 200, atmMain: 'N2', atmP: 0.5, comp: { N2: 0.9, Ar: 0.1 } });
// Composition types are now defined by interior MAKEUP (density/radius derive from it).
body({ target: 'planet/iron', Me: 1.5, makeup: { metal: 0.7, rock: 0.3 }, Teq: 200, atmMain: 'CO2', atmP: 0.02 });
body({ target: 'planet/silicate', Me: 1.2, makeup: { rock: 0.85, metal: 0.15 }, Teq: 200 });
body({ target: 'planet/coreless', Me: 1, makeup: { rock: 0.55, ice: 0.45 }, Teq: 240, atmMain: 'CO2', atmP: 0.1 });
body({ target: 'planet/carbon', Me: 1.5, makeup: { carbon: 0.6, rock: 0.4 }, Teq: 200, atmMain: 'CO', atmP: 2, comp: { CO: 0.7, CH4: 0.3 } });
body({ target: 'planet/super-earth', Me: 5, d: 6.5, Teq: 270, atmMain: 'N2', atmP: 3, comp: { N2: 0.8, CO2: 0.2 } });
body({ target: 'planet/mega-earth', Me: 18, d: 10.5, Teq: 260, atmMain: 'N2', atmP: 4, comp: { N2: 0.9, CO2: 0.1 } });
body({ target: 'planet/supermassive-terrestrial', Me: 55, d: 12, Teq: 250, atmMain: 'N2', atmP: 5, comp: { N2: 0.9, CO2: 0.1 } });

// ---- Climate / surface ----
body({ target: 'planet/lava', Me: 1, d: NEU, Teq: 1500, atmMain: 'None' });
body({ target: 'planet/desert', Me: 0.9, d: NEU, Teq: 320, hydroCov: 0.02, atmMain: 'N2', atmP: 0.3 });
body({ target: 'planet/barren', Me: 0.05, d: NEU, Teq: 250, mag: 0 });
body({ target: 'planet/crater', Me: 0.012, Re: 0.3, Teq: 200, atmMain: 'CO2', atmP: 0.02, mag: 0 });
body({ target: 'planet/ice', Me: 0.8, d: 3.6, Teq: 120, hydroComp: 'water', hydroCov: 0.8 });
body({ target: 'planet/ocean', Me: 1.1, d: NEU, Teq: 290, hydroComp: 'water', hydroCov: 0.95, atmMain: 'N2', atmP: 1.2, comp: { N2: 0.9, CO2: 0.1 } });
body({ target: 'planet/hycean', Me: 4, Re: 2.0, Teq: 350, hydroComp: 'water', hydroCov: 0.95, atmMain: 'H2', atmP: 5 });
body({ target: 'planet/methane', Me: 0.6, d: NEU, Teq: 110, hydroComp: 'methane', hydroCov: 0.6, atmMain: 'N2', atmP: 1.5 });

// ---- Atmosphere-composition worlds (cool, so 'desert' doesn't grab them) ----
body({ target: 'planet/sulfur', Me: 0.5, d: NEU, Teq: 220, atmMain: 'SO2', atmP: 0.5 });
body({ target: 'planet/chlorine', Me: 0.9, d: NEU, Teq: 220, atmMain: 'Cl2', atmP: 1 });
body({ target: 'planet/fluorine', Me: 0.9, d: NEU, Teq: 220, atmMain: 'F2', atmP: 1 });
body({ target: 'planet/phosphorus', Me: 0.9, d: NEU, Teq: 220, atmMain: 'PH3', atmP: 1 });
body({ target: 'planet/ammonia-planet', Me: 0.9, d: NEU, Teq: 220, atmMain: 'NH3', atmP: 1.5 });

// ---- Habitable family ----
body({ target: 'planet/earth-analogue', Me: 1, d: 5.5, Teq: 288, hydroComp: 'water', hydroCov: 0.7, atmMain: 'N2', atmP: 1, comp: { N2: 0.78, O2: 0.21, Ar: 0.01 }, mag: 0.5 });
body({ target: 'planet/earth-like', Me: 1.8, d: 5.5, Teq: 280, hydroComp: 'water', hydroCov: 0.4, atmMain: 'N2', atmP: 1.1, comp: { N2: 0.79, O2: 0.2, CO2: 0.01 }, mag: 0.5 });
body({ target: 'planet/superhabitable', Me: 3, d: 5.5, Teq: 300, hydroComp: 'water', hydroCov: 0.8, atmMain: 'N2', atmP: 1.3, comp: { N2: 0.75, O2: 0.24, CO2: 0.01 }, mag: 0.6 });

// ---- Eyeball (tidally locked); neutral density + airless/CO2 (no carbon trigger) ----
body({ target: 'planet/eyeball', Me: 1, d: NEU, Teq: 290, locked: true, hydroComp: 'water', hydroCov: 0.3, atmMain: 'N2', atmP: 1 });
body({ target: 'planet/hot-eyeball', Me: 1, d: NEU, Teq: 500, locked: true, atmMain: 'None' });
body({ target: 'planet/cold-eyeball', Me: 1, d: NEU, Teq: 180, locked: true });

// ---- Neptune family ----
body({ target: 'planet/mini-neptune', Me: 7, Re: 2.6, Teq: 300, atmMain: 'H2', atmP: 50, comp: { H2: 0.8, He: 0.2 } });
body({ target: 'planet/sub-neptune', Me: 6, Re: 2.1, Teq: 280, atmMain: 'N2', atmP: 40, comp: { N2: 0.6, CO2: 0.4 } });
body({ target: 'planet/ice-giant', Me: 16, Re: 3.8, Teq: 70, atmMain: 'H2', atmP: 100, comp: { H2: 0.8, He: 0.15, CH4: 0.05 } });
body({ target: 'planet/super-neptune', Me: 60, Re: 6.5, Teq: 130, atmMain: 'H2', atmP: 100, comp: { H2: 0.8, He: 0.2 } });
body({ target: 'planet/hot-neptune', Me: 20, Re: 4, Teq: 1000, atmMain: 'H2', atmP: 100, comp: { H2: 0.8, He: 0.2 } });
body({ target: 'planet/ultra-hot-neptune', Me: 18, Re: 4, Teq: 2000, atmMain: 'H2', atmP: 100, comp: { H2: 0.8, He: 0.2 } });

// ---- Gas giants by cloud type (Teq controls cloud species; luminous star spreads them) ----
body({ target: 'planet/ammonia-clouds-gas-giant', Me: 300, Re: 11, Teq: 120 });
body({ target: 'planet/water-clouds-gas-giant', Me: 250, Re: 11, Teq: 220 });
body({ target: 'planet/cloudless-gas-giant', Me: 200, Re: 11, Teq: 600 });
body({ target: 'planet/alkali-metal-clouds-gas-giant', Me: 300, Re: 12, Teq: 1100 });
body({ target: 'planet/silicate-clouds-gas-giant', Me: 300, Re: 12, Teq: 1700 });
body({ target: 'planet/gas-giant', Me: 150, Re: 11, Teq: 320 });
body({ target: 'planet/mini-jupiter', Me: 100, Re: 8, Teq: 250 });
const superJ = body({ target: 'planet/super-jupiter', Me: 1500, Re: 13, Teq: 250 });
// a ring child → the super-jupiter also gets the 'planet/ringed' modifier
nodes.push({ id: 't-ring', parentId: superJ.id, name: 'Ring', kind: 'body', roleHint: 'ring',
  radiusInnerKm: 90000, radiusOuterKm: 140000, tags: [],
  orbit: { hostId: superJ.id, elements: { a_AU: 0.0008, e: 0, i_deg: 0, omega_deg: 0, Omega_deg: 0, M0_rad: 0 } } });
// an icy, tidally-flexed moon → subsurface-ocean
body({ target: 'planet/subsurface-ocean', name: 'Subsurface Ocean', parent: superJ.id, Me: 0.02,
  makeup: { rock: 0.5, ice: 0.5 }, a: 0.003, e: 0.04, hydroComp: 'water', hydroCov: 0.4, mag: 0, role: 'moon' });
body({ target: 'planet/puffy', Me: 60, Re: 10, Teq: 900 });
body({ target: 'planet/super-puff', Me: 8, Re: 8, Teq: 500 });
body({ target: 'planet/helium', Me: 60, Re: 5, Teq: 400, atmMain: 'He' });
body({ target: 'planet/chthonian', Me: 20, d: 6, Teq: 1700 });

// ---- Dwarf / substellar (escape velocity ≈ 11.19·sqrt(Me/Re) km/s) ----
body({ target: 'planet/dwarf-planet', Me: 0.005, Re: 0.15, Teq: 60, mag: 0 });
body({ target: 'planet/mesoplanet', Me: 0.03, Re: 0.3, Teq: 150, mag: 0 });
body({ target: 'planet/planetesimal', Me: 0.001, Re: 0.1, Teq: 100, mag: 0 });
body({ target: 'planet/sub-brown-dwarf', Me: 3500, Re: 11, Teq: 200 });
body({ target: 'planet/brown-dwarf', Me: 6000, Re: 12, Teq: 1100 });
body({ target: 'planet/ultra-cool-dwarf', Me: 9000, Re: 13, Teq: 400 });

// ---- Rotation modifiers on a rocky (silicate) base — the toroidal/ellipsoid MODIFIER is the demo ----
body({ target: 'planet/silicate', name: 'Toroid', Me: 1, makeup: { rock: 0.85, metal: 0.15 }, Teq: 200, rotH: 1.5 });
body({ target: 'planet/silicate', name: 'Ellipsoid', Me: 1, makeup: { rock: 0.85, metal: 0.15 }, Teq: 200, rotH: 4 });

const system = {
  id: 'testion-system', name: 'Testion', seed: 'testion-demo', epochT0: 0, age_Gyr: 4.6,
  nodes, rulePackId: 'starter-sf', rulePackVersion: '1.0', tags: [],
  toytownFactor: 0.6, isManuallyEdited: false
};
fs.writeFileSync('static/examples/Testion-System.json', JSON.stringify(system, null, 2));
console.log(`Wrote Testion with ${nodes.length - 1} bodies.`);
