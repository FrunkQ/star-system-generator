import StarSystem from "./StarSystem.js";
import Planetismal from "./Planetismal.js";
import * as Astro from "./Astro.js";
import * as constants from "./constants.js";

export { default as StarSystem } from "./StarSystem.js";
export { Planetismal, Astro, constants };

export const generatePlanets = () => {
  const system = new StarSystem();
  return system.create().planets;
};
