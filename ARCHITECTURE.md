# Star System Explorer Architecture

This document provides a high-level overview of the application's architecture, key services, and data flow. It serves as a map for developers (and AI agents) to understand how the system is structured.

## Core Architecture

The application is built on a modular "Factory-Generator-Processor" pipeline, designed to separate structural generation from physical simulation.

### 1. The Core Pipeline (`src/lib/core/`)

*   **`BodyFactory` (`BodyFactory.ts`)**:
    *   **Role**: The central service for instantiating `CelestialBody` objects.
    *   **Responsibility**: Creates valid, initialized objects with unique IDs and default properties. Ensures consistency between procedurally generated bodies and manually added ones.
    *   **Usage**: Used by `Generator` and `Modifiers`.

*   **`SystemGenerator` (Interface in `interfaces.ts`)**:
    *   **Role**: Defines the contract for any system generation algorithm.
    *   **Responsibility**: Takes a Seed and a RulePack and returns a `System` structure (stars, planets, orbits). It *does not* calculate derived physics (temp, zones).
    *   **Implementation**: Currently `src/lib/generation/system.ts` (functional approach).

*   **`SystemProcessor` (`SystemProcessor.ts`)**:
    *   **Role**: The physics engine and post-processing service.
    *   **Responsibility**: "Breathes life" into the system. Calculates derived properties based on the structure:
        *   **Physics**: Gravity, Orbital Periods, Tidal Heating.
        *   **Environment**: Equilibrium Temperature, Greenhouse Effect, Surface Radiation.
        *   **Habitability**: Scores, Zones, Biosphere potential.
        *   **Classification**: Assigns classes (e.g., "planet/terrestrial") based on calculated stats.
    *   **Usage**: Called immediately after Generation and after *any* manual edit (e.g., moving a planet).

### 2. Data Models (`src/lib/types.ts`)

*   **`System`**: The root object containing metadata (seed, age) and a flat list of `nodes`.
*   **`CelestialBody`**: The primary entity. Contains:
    *   `orbit`: Keplerian elements.
    *   `atmosphere`, `hydrosphere`, `biosphere`: Compositional data.
    *   `physics`: Calculated values (temp, radiation).
*   **`RulePack`**: A JSON-based configuration object defining probabilities, templates, and physics constants.

### 3. State Management (`src/lib/stores.ts`, `src/lib/timeStore.ts`)

*   **`systemStore`**: Holds the *currently active* Star System. All UI components react to this.
*   **`starmapStore`**: Holds the Galaxy Map data (list of systems and routes).
*   **`timeStore`**: Global mission clock (`currentTime`, `timeScale`, `isPaused`).
*   **`viewportStore`**: Camera state (pan/zoom) for the System View.

## Interaction Flow

### System Generation
1.  User clicks "Generate".
2.  `generateSystem` (Generator) is called.
3.  It calls `BodyFactory` to create Stars and Planets.
4.  It places them in orbits (structural layout).
5.  **Critically**: It calls `systemProcessor.process(system)` to calculate physics.
6.  The result is set to `systemStore`.

### Smart Editing
1.  User modifies a body (e.g., changes Orbit Radius) in `BodySidePanel`.
2.  `SystemView` receives the update event.
3.  It updates the `systemStore`.
4.  It calls `systemProcessor.process(system)` on the updated system.
5.  Physics (Temperature, Habitability) update automatically based on the new distance.

## Directory Structure

*   `src/lib/core/`: Core services (Factory, Processor, Interfaces).
*   `src/lib/generation/`: Procedural generation logic (Star placement, Planet composition).
*   `src/lib/physics/`: Pure functions for physical calculations (Orbits, Radiation, Atmosphere). used by Processor.
*   `src/lib/system/`: System-level utilities (Modifiers, Serialization).
*   `src/lib/traveller/`: **Traveller Map Integration Module**.
    *   **`importer.ts`**: Orchestrates the import of subsector data from the TravellerMap API. It maps UWP codes to physical parameters and uses the Core Pipeline to generate consistent, deterministic star systems.
    *   **`decoder.ts`**: Handles the parsing of Universal World Profiles (UWP), trade codes, and system strings.
    *   **`rng.ts`**: Provides a strictly deterministic seeded RNG based on world names/UWP to ensure consistent results across all users.
*   `src/lib/components/`: Svelte UI components.
    *   `SystemView.svelte`: Main controller for the system view.
    *   `SystemVisualizer.svelte`: Canvas/SVG renderer for the orbital view.
        *   **Rendering Strategy**: Employs a **Floating Origin (Relative Camera)** pattern. All drawing coordinates are calculated in 64-bit JavaScript relative to the current camera focus before being passed to the Canvas API. This prevents floating-point precision loss (jitter) that occurs when using large absolute AU coordinates in the browser's 32-bit rendering matrix.
*   `static/rulepacks/`: JSON configuration files.

## Future Extensibility

*   **New Generators**: To add a "Hard Sci-Fi" generator, implement `ISystemGenerator` and swap it in the UI. The `SystemProcessor` ensures physics remain consistent.
*   **Placement Strategies**: Orbital spacing logic can be extracted from `system.ts` into "Strategy" classes (e.g., `TitiusBodeStrategy`, `RandomSpacingStrategy`).

## Physics Simplifications & Assumptions

To maintain real-time performance and gameplay relevance, the engine employs several physical simplifications:

*   **Gas Giant "Surface" Temperature**: 
    *   **The Problem**: Gas Giants (Jupiter, Neptune) have no solid surface and atmospheric pressures exceeding 100,000 bar. A naive radiative greenhouse model would calculate temperatures in the thousands of degrees due to logarithmic pressure scaling.
    *   **The Simplification**: For bodies with pressure > 1000 bar, the radiative greenhouse effect is calculated using an **effective pressure of 1 bar**.
    *   **Justification**: This simulates the temperature at the **visible cloud tops** (the 1-bar level), which is the standard reference for "surface temperature" in planetary science. It accounts for radiative balance with the star while ignoring deep adiabatic heating (which is physically real but irrelevant for surface-level gameplay and habitability stats).
*   **Logarithmic Radiation Shielding**: Employs a simplified exponential decay model ($T = e^{-kP}$) which accurately captures the rapid initial drop in radiation with pressure but assumes a uniform shielding coefficient across all wavelengths.
