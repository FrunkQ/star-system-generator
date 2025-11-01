13-Oct-25
------

Add the image credit: Black Hole Accredition Disk images: NASA’s Goddard Space Flight Center/Jeremy Schnittman 

------

31-Oct-25
------

- Fix habitable planet generation. "earth-like" should not be a gas giant.
- Overhaul atmosphere generation to be more complex than single gases. Use a detailed JSON structure with composition maps, tags, and planet type constraints.
- Simplify gas composition by grouping Argon and other rare gases into "Noble Gases" and "Other Trace Gases".
- Sanity check system `seed-1761915333969` (HD75226 PII), which has a contradictory steam atmosphere at -109°C.
- Very thin atmospheres (exospheres) should be displayed as "trace" and not have a detailed composition breakdown.
- Reminder to update prompthistory.md and gemini.md as per instructions.
- Proceed with biosphere implementation. Refine the approach to use a single, unified habitability score instead of three. Implement a tiered morphology system (fauna requires flora requires microbial) and refactor the old habitability tags and scores as part of the update.
- Quick fix: Display "None" for habitability scores below the "Alien Habitable" threshold.
- Rework the "Add Habitable Planet" buttons to use a "smart search" function that validates orbits for temperature, radiation, and stability before creating a planet. Provide clear error messages if no viable orbit is found.
- Bug fix: "Add Earth-like" button causes "findHabitableOrbit is not defined" error.
- Bug fix: "Add Human-Habitable" button returns "No stable orbit found" for a K-type star, indicating the search logic is too restrictive.
- Tune habitability tiers. A score of 76.4% should be "human habitable", not "alien".
- Confirm that the system can create habitable moons and that the heat calculations are correct.
- Follow-up on "No stable orbit found" error: User provides system data for K-type star GJ33526, confirming the bug is related to collision detection being too aggressive.
- Improve error message when habitable zone is crowded, suggesting a GM can delete a planet to make room.
- Tune: Adjust target temperature ranges in findViableHabitableOrbit to compensate for greenhouse effect, making "Add Earth-like" more consistent.
- Bug fix: "Add Earth-like" planets are generating too hot (72 C) due to un-accounted for radiogenic heat.
- Add a quick system summary view at the star/barycenter level, listing counts of planets, moons, and key habitability categories.
- Bug fix: System summary does not refresh when planets are added/removed. Fix by passing the entire system object to the component.
- Bug fix: System summary shows all zeros. Fix by making the component reactive to the entire system object.
- Clarify "Terrestrial" count in summary: Now counts all non-gas-giant bodies and is labeled "Terrestrial Bodies".
- Bug fix: System summary counting logic is flawed (counting stars as terrestrial, not counting all gas giants).
- Add "Generate Empty System" button to create a system with only a star, for manual GM creation.

------


