# Star System Explorer: Transit Architecture

This document outlines the engineering principles and mathematical models used by the Transit Planning system.

---

## 1. Core Solver Philosophies

The system employs three distinct solving strategies to provide a range of mission profiles.

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

### **C. Gravity-Assist Solver (Complex Mode)**
*   **Mathematical Basis:** A two-leg Lambert chain through an intermediate flyby body (`assist.ts`), with a coarse 8×8 search over the two transfer durations.
*   **Scope:** Only attempted for interplanetary transfers (start separation > 0.5 AU, no local frame parent). Skipped entirely under the `quote` cost tier (see §5).
*   **Output:** A single `Complex` plan named e.g. *"Flyby Assist (Jupiter)"*.

---

## 2. Plan Families Emitted

A single `calculateTransitPlan` call returns **up to four named plans**, so the caller (or the autopilot Drive setting) can choose along the speed–efficiency axis. They are then sorted and filtered (§4).

| Plan | `planType` | Solver | Notes |
| :--- | :--- | :--- | :--- |
| **Most Efficient** | `Efficiency` | Lambert (A) | Hohmann-family, **plus a delayed-launch-window search** — sweeps departure delay (0→1000 days interplanetary in 10-day steps; ~1 target orbit locally) and keeps the cheapest window. Tags `DELAYED-DEPARTURE` and records `initialDelay_days`. This is the "wait for alignment" search. |
| **Efficient Now** | `Efficiency` | Lambert (A) | Same Lambert family, depart-now (no delay sweep). May be re-tagged `Sundiver`/`Assist` if the solved path dives sunward. |
| **Direct Burn** | `Speed` | Kinematic (B) | Torch / flip-and-burn. Time and Δv are computed analytically from the burn profile *before* the display path is integrated. |
| **Flyby Assist** | `Complex` | Gravity-Assist (C) | Interplanetary only; see §1.C. |

Emergent behaviour worth noting: because **Most Efficient** already searches departure windows, "wait until the geometry is favourable" falls out of the cost search rather than being a coded rule.

---

## 3. Cost Tiers (full · costOnly · quote)

The same solver runs at three weights. **Time and Δv are identical across tiers** for a given plan family — only the work spent generating the *display trajectory* and the *number of candidate plans* changes. This lets long-running planning (the autopilot reorder/lookahead) cost legs cheaply **without a parallel cost model that could silently disagree with the leg actually flown.**

| Tier | What runs | Display path | Cost | Used by |
| :--- | :--- | :--- | :--- | :--- |
| **full** (default) | All four families | Dense (hundreds–thousands of points) | ~19.5 ms/call (Sol legs) | Manual planner; the committed autopilot leg. |
| **`costOnly`** | All four families | Clamped to ~24 points (direct, torch, **and** assist legs) | Cheaper to render | When the cost is needed but the full plan set still matters. |
| **`quote`** | **Only** Efficient Now (Lambert) + Direct Burn (torch) — skips the Most-Efficient delay sweep *and* the gravity-assist search; implies `costOnly` | Minimal | **~0.14 ms/call (~140× faster)** | The autopilot reorder/lookahead search, which runs many times per decision. |

**Faithfulness guarantee:** the two families a `quote` returns are the *same real solver outputs* the `full` call commits with. A unit test (`calculator.test.ts`) pins the quoted Direct Burn's time/Δv to the full Direct Burn, and checks the quoted Efficient Now is never cheaper than the full Most-Efficient window optimum (i.e. `quote` is a conservative estimate, never an over-promise). So an ordering chosen on quoted costs can never disagree with the leg the ship actually flies.

---

## 4. Frames of Reference & Normalization

To maintain precision across scales (from 100 AU systems to 1,000 km moon orbits), the system uses **Dynamic Frame Normalization**.

*   **Global Frame (Solar):** Used for interplanetary transfers. The origin and target are resolved to their total heliocentric positions/velocities.
*   **Local Frame (Planetary/Stellar):** Automatically selected using **Lowest Common Ancestor (LCA)** logic. The solver walks up the hierarchy to find the first shared host body (Planet, Star, or Barycenter).
    *   **Sub-Metre Precision:** The solver switches internal units to **Meters** to prevent floating-point jitter.
    *   **Gravity Swap:** The host's gravity is used; external gravity is ignored during the transit phase.
*   **Smart Target Redirection:** When targeting a moon from an interplanetary distance, the solver automatically targets the parent planet's SOI while maintaining the moon's radius for capture. This stabilizes solutions and provides accurate capture $\Delta v$.
*   **Frame Re-Anchoring:** When planning multi-leg journeys (chains), the end-state of Leg 1 (Global) is automatically normalized into the Local frame of Leg 2 if the reference frame changes.

---

## 5. Arrival & Capture Models

The system distinguishes between "Rendezvous" and "Capture" based on target type.

| Target Type | Target Velocity ($V_{target}$) | Rationale |
| :--- | :--- | :--- |
| **Celestial Body** | Circular Orbital Velocity | Assumes capture into a stable parking orbit ($V = \sqrt{GM/r}$). |
| **Lagrange Point** | Relative Zero ($V = 0$) | Treated as co-orbital rendezvous in the host's parent frame. |
| **Construct** | Relative Zero ($V = 0$) | Assumes docking/station-keeping. Gravity is considered negligible. |
| **Flyby Mode** | Residual Velocity | No arrival burn is calculated; the ship coasts past the target. |

---

## 6. Current Constraints & Known Issues

### **Stability & Insanity Checks**
The planner applies several filters to prevent numerical artifacts from cluttering the UI:
*   **Numerical Divergence:** Plans exceeding 10,000 km/s total $\Delta v$ are hidden as likely solver failures.
*   **Dynamic Stability:** Speed plans are suppressed if they exceed 5x-10x the baseline duration, preventing non-physical "loop-back" paths.
*   **High-G Support:** Filters are calibrated to support ships with 15G+ acceleration, allowing expensive but fast "torch ship" jumps.

### **Construct Gravity**
Constructs (ships/stations) are currently treated as massless.
*   **Limitation:** Players cannot "orbit" a massive construct; they can only rendezvous ($V=0$).
