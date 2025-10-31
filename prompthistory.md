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

------


