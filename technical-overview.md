# Star System Explorer: Technical Overview

This document provides a comprehensive map of the application's architecture, layering, and core simulation logic.

---

## 1. Core Architecture Layers

The system is built as a **Layered Simulation Pipeline**, separating data-driven rules from physical calculations and gameplay orchestration.

### Layer 1: Data Schema & Configuration (The Blueprint)
*   **Core Types (`src/lib/types.ts`)**: The fundamental interfaces (`System`, `CelestialBody`, `Orbit`, `RulePack`).
*   **RulePacks (`static/rulepacks/`)**: The "DNA" of the simulation. JSON-based configurations defining:
    *   **Physics Constants**: Atmospheric molar masses, shielding coefficients, greenhouse response scales.
    *   **Generation Logic**: Probability distributions for star types and planetary compositions.
    *   **Templates**: Pre-defined construct (ship/station) blueprints with specific engine and fuel stats.

### Layer 2: Atomic Physics & Temporal Logic (The Laws)
*   **Physics Services (`src/lib/physics/`)**: Pure, stateless functions for individual calculations.
    *   `orbits.ts`: Keplerian state propagation and SOI (Sphere of Influence) boundary logic.
    *   `temperature.ts`: Multi-component flux composition (Solar + Greenhouse + Tidal + Internal).
    *   `atmosphere.ts`: Gas-specific attenuation, scale height, and pressure-based greenhouse effects.
*   **Temporal System (`src/lib/temporal/`)**: A high-precision `BigInt`-based engine.
    *   **BigInt Precision**: Uses `BigInt` total-seconds to maintain accuracy across galactic timescales (millions of years), preventing the floating-point drift inherent in standard JavaScript numbers.
    *   **Dual-Clock Model**: Decouples **Master Time** (authoritative sim state) from **Display Time** (UI scrubbing/preview). This allows users to "time travel" to check future launch windows without affecting persistent ship logs or fuel states.
    *   **Calendar Registry**: A data-driven system supporting Gregorian, "Bucket-Drain" (hierarchical units), and "Ratio-Linear" (stardate) timekeeping.

### Layer 3: Core Orchestration (The Engine)
*   **`SystemProcessor.ts`**: The central coordinator that "hydrates" raw data into a simulated system via a multi-pass pipeline:
    1.  **Barycenter Reconcile**: Adjusts binary/trinary system centers based on mass ratios.
    2.  **Physical Basics**: Gravity, orbital periods, and rotation periods.
    3.  **Environment**: Multi-star radiation flux, surface temperature, and atmospheric retention.
    4.  **Classification**: Habitability scoring and auto-tagging.
    5.  **Flight Dynamics**: Calculating $\Delta v$ budgets and docking/landing feasibility.
*   **`BodyFactory.ts`**: Handles instantiation and hydration of new entities from templates or procedural configs.

### Layer 4: Specialized Modules (The Gameplay)
*   **Transit System (`src/lib/transit/`)**:
    *   `calculator.ts`: Solves the **Lambert Problem** for efficient orbits and **Kinematic Paths** for direct burns.
    *   `scheduler.ts**: Interpolates `ScheduledJourneyLog` paths against the mission clock to provide live positions for moving constructs.
*   **Transit Feasibility & Sanity**: 
    To maintain a responsive and realistic UI, the planner applies several filters:
    *   **Impractical Delta-V Cap**: Solutions exceeding 10,000 km/s (Numerical Divergence) are hidden.
    *   **Dynamic Stability**: For moving target intercepts, Speed plans are suppressed if they exceed 5x-10x the baseline duration to prevent non-physical "loop-back" paths.
    *   **Lowest Common Ancestor (LCA) Framing**: Transits automatically select the closest shared host body as the gravitational reference frame, ensuring co-orbital synchronization.
*   **Traveller Integration (`src/lib/traveller/`)**: Decodes RPG-style UWP codes into physical parameters required by the Engine.

### Layer 5: State & Persistence (The Memory)
*   **Stores (`src/lib/stores.ts`, `src/lib/timeStore.ts`)**: Global Svelte stores managing the `systemStore` (active system), `starmapStore` (the galaxy), and simulation clock.
*   **Storage (`src/lib/starmapStorage.ts`)**: Persistence layer using **IndexedDB** for large starmaps to bypass browser localStorage quotas.

### Layer 6: Visualization & UI (The View)
*   **`SystemVisualizer.svelte`**: A canvas renderer using a **Floating Origin (Relative Camera)** pattern. It translates massive AU coordinates into local 64-bit space to prevent floating-point jitter during zoom.
*   **`Starmap.svelte`**: A strategic map supporting both diagrammatic (clean layout) and scaled (actual distance) coordinate modes.

---

## 2. Critical Data Flows

### The Update Loop (Edit -> Recalculate)
1.  User modifies a property in the UI (e.g., changes Orbit Radius).
2.  The UI updates the `CelestialBody` object in the `systemStore`.
3.  `SystemProcessor.process()` is triggered, running the multi-pass physics engine.
4.  Derived properties (Atmosphere scale height, Temperature, Habitability) are re-evaluated.
5.  The UI reacts to the updated store, refreshing technical details and visual scales.

### The Transit Cycle (Plan -> Schedule -> Execute)
1.  **Plan**: The `TransitPlanner` uses the Physics layer to solve for a valid route.
2.  **Schedule**: The resulting `TransitPlan` is pushed into the construct's `scheduled_journeys` log.
3.  **Execute**: As time advances, `scheduler.ts` samples the log to update the construct's visual position and status (Orbiting -> Transit -> Arrived).

---

## 3. Key Mathematical Models

*   **Atmospheric Greenhouse**: Uses a saturating log response for high-pressure worlds (Venus-style) and cryogenic attenuation for cold worlds (Titan-style).
*   **Habitable Zones**: Implements a Kopparapu-style model (Runaway Greenhouse inner edge / Maximum Greenhouse outer edge) with multi-star flux coupling.
*   **Relative Rendering**: To prevent jitter, all objects are rendered relative to the camera's focus point: `ScreenPos = (WorldPos - CameraFocus) * Zoom`.
