'''# Star System Generator & Visualizer

A procedural star system generator built with SvelteKit. This tool creates detailed, scientifically-plausible star systems, including single and binary stars, planets, moons, and asteroid belts. It features an interactive 2D visualizer and allows for GM-style editing and storytelling.

## Features

*   **Procedural Generation**: Creates unique star systems based on a seed and a JSON-based rulepack.
*   **Variety of Star Types**: Supports generation of various spectral types (O, B, A, F, G, K, M) as well as exotic objects like White Dwarfs, Neutron Stars, and Black Holes.
*   **Binary & Single Star Systems**: Can generate both single-star systems and complex binary systems with circumbinary planets or planets orbiting each star.
*   **Detailed Planetology**: Generates planets with a wide range of properties, including mass, radius, temperature (with equilibrium, greenhouse, and tidal heating components), atmospheric pressure, and hydrosphere coverage.
*   **Deep Classification**: Planets are classified into one of over 60 types (e.g., 'planet/ocean', 'planet/hot-jupiter', 'planet/super-earth') based on their physical characteristics.
*   **Interactive 2D Visualizer**: An orbital view of the generated system with playback controls, zoom, and focus abilities.
*   **GM Editing Tools**:
    *   **Rename**: Click on any body's name to rename it. The new name automatically propagates to its children.
    *   **Add**: Add a new planet or moon to any star or planet.
    *   **Delete**: Remove any planet or moon and its entire orbital system.
*   **Save & Load**: 
    *   Save your creations to your browser's local storage.
    *   Download any system as a JSON file to your computer.
    *   Upload a previously saved JSON file to continue your work.

## Getting Started

1.  **Install Dependencies**

    ```sh
    npm install
    ```

2.  **Run the Development Server**

    ```sh
    npm run dev
    ```

    The application will be available at `http://localhost:5173` by default.

## Building

To create a production version of the app:

```sh
npm run build
```

You can preview the production build with `npm run preview`.

## Attributions

This project uses images from several sources under Creative Commons licenses. We are grateful for their work.

*   **Planet Images**: Courtesy of **Pablo Carlos Budassi** ([thecelestialzoo](https://www.deviantart.com/pablocarlosbudassi/gallery/79413331/the-celestial-zoo-official-collection)), used under a [CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0/) license.
*   **Star Images**: Sourced from the [Beyond Universe Wiki](https://beyond-universe.fandom.com/wiki/) on Fandom, used under a [CC-BY-SA](https://creativecommons.org/licenses/by-sa/3.0/us/) license.
*   **Magnetar Image**: Courtesy of [ESO/L. Calçada](https://www.eso.org/public/images/eso1415a/), used under a [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/) license.
'''