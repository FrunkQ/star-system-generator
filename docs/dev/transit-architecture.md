# Star System Explorer: Transit Architecture

This document outlines the engineering principles and mathematical models used by the Transit Planning system.

---

## 1. Core Solver Philosophies

The system employs two distinct solving strategies to provide a range of mission profiles.

### **A. Lambert Solver (Efficiency Mode)**
*   **Mathematical Basis:** Solves the Lambert Problem (finding an orbit between two points over a fixed time).
*   **Assumptions:** Assumes **Impulsive Thrust** (burns are instantaneous at the start and end) and **Ballistic Coasting** for the majority of the duration.
*   **Gravity Awareness:** High. It follows Keplerian paths and respects the primary body's gravitational parameter ($\mu$).
*   **Thrust Blind:** It does not know the ship's maximum acceleration until *after* the path is solved, at which point it checks if the required burn fits within the duration.

### **B. Kinematic Solver (Direct Burn / Speed Mode)**
*   **Mathematical Basis:** A profile-first solver using continuous or high-thrust acceleration/braking segments.
*   **Assumptions:** Assumes the ship's acceleration is high enough to treat gravity as a minor perturbation (though it still integrates the path).
*   **Thrust Awareness:** High. It solves for the **Earliest Feasible Time** based on the ship's specific $G$ capability.
*   **Gravity Blind:** In its initial guess phase, it treats the path as a straight line, then refines it using ballistic integration.

---

## 2. Frames of Reference & Normalization

To maintain precision across scales (from 100 AU systems to 1,000 km moon orbits), the system uses **Dynamic Frame Normalization**.

*   **Global Frame (Solar):** Used for interplanetary transfers. The origin and target are resolved to their total heliocentric positions/velocities.
*   **Local Frame (Planetary/Stellar):** Automatically selected using **Lowest Common Ancestor (LCA)** logic. The solver walks up the hierarchy to find the first shared host body (Planet, Star, or Barycenter).
    *   **Sub-Metre Precision:** The solver switches internal units to **Meters** to prevent floating-point jitter.
    *   **Gravity Swap:** The host's gravity is used; external gravity is ignored during the transit phase.
*   **Smart Target Redirection:** When targeting a moon from an interplanetary distance, the solver automatically targets the parent planet's SOI while maintaining the moon's radius for capture. This stabilizes solutions and provides accurate capture $\Delta v$.
*   **Frame Re-Anchoring:** When planning multi-leg journeys (chains), the end-state of Leg 1 (Global) is automatically normalized into the Local frame of Leg 2 if the reference frame changes.

---

## 3. Arrival & Capture Models

The system distinguishes between "Rendezvous" and "Capture" based on target type.

| Target Type | Target Velocity ($V_{target}$) | Rationale |
| :--- | :--- | :--- |
| **Celestial Body** | Circular Orbital Velocity | Assumes capture into a stable parking orbit ($V = \sqrt{GM/r}$). |
| **Lagrange Point** | Relative Zero ($V = 0$) | Treated as co-orbital rendezvous in the host's parent frame. |
| **Construct** | Relative Zero ($V = 0$) | Assumes docking/station-keeping. Gravity is considered negligible. |
| **Flyby Mode** | Residual Velocity | No arrival burn is calculated; the ship coasts past the target. |

---

## 4. Construct Interaction Logging (`constructInteractions.ts`)

When an autopilot ship visits another construct — unloads cargo, loads, refuels, or holds station —
that visit is shown on the **visited** construct's log too, not only the ship's. It is NOT mirror-persisted:
the visiting ship's `flight_log` is the single source of truth (each event carries the `placeId` it happened
at), and `deriveIncomingVisits(system, targetId)` scans the fleet's logs on demand to produce a target
construct's incoming visits. Because it is derived, it stays correct through time-scrubbing (the log pane's
own past/future split filters by the display clock) and never needs its own dedup or prune. Consumed by
`ShipLogPane.svelte`, rendered from the receiver's side with the visiting ship named.

**See also** (transit surface beyond the core solver): `interstellar.ts` (relativistic interstellar travel),
`autopilotPlanner.ts`/`autopilotAdapter.ts` (route generation + flight log), `assist.ts` (gravity assists),
`twoBodyCoast.ts` (adrift/coast conics), `scheduler.ts` (live sampling against the clock).

## 5. Current Constraints & Known Issues

### **Stability & Insanity Checks**
The planner applies several filters to prevent numerical artifacts from cluttering the UI:
*   **Numerical Divergence:** Plans exceeding 10,000 km/s total $\Delta v$ are hidden as likely solver failures.
*   **Dynamic Stability:** Speed plans are suppressed if they exceed 5x-10x the baseline duration, preventing non-physical "loop-back" paths.
*   **High-G Support:** Filters are calibrated to support ships with 15G+ acceleration, allowing expensive but fast "torch ship" jumps.

### **Construct Gravity**
Constructs (ships/stations) are currently treated as massless.
*   **Limitation:** Players cannot "orbit" a massive construct; they can only rendezvous ($V=0$).
