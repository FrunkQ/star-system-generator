import StarSystem from "./StarSystem.js";

export { default as StarSystem } from "./StarSystem.js";

export const generatePlanets = () => {
  const system = new StarSystem();
  return system.create().planets;
};
