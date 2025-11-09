# Star System Generator & Visualizer

A procedural generator for creating scientifically-plausible star systems, complete with a real-time orbital visualizer and starmap.

## Table of Contents

*   [What is it for?](#what-is-it-for)
*   [Features](#features)
*   [Usage](#usage)
*   [Getting Started](#getting-started)
*   [Building](#building)
*   [Planned Features](#planned-features)
*   [Known Issues](#known-issues)
*   [Attributions](#attributions)
*   [License](#license)

## What is it for?

This tool was primarily designed to enhance Science Fiction Tabletop Role-Playing Games (TTRPGs). While not a perfectly accurate simulation, it aims to be 'close enough' for an RPG setting, appealing to those who, like me, marvel at the wonder and complexity of the real science behind astronomy and exoplanets. It should provide a wealth of interesting environments to serve as the backdrop for your narrative. This has been "vibe-coded" using Gemini CLI (Pro 2.5) over a few months.

A quick note on data: This application runs entirely in your browser. Your generated systems are not saved on a remote server; they reside solely within your local browser storage. If you wish to access your systems on a different browser or device, remember to download your files.

## Features

*   **Procedural Generation**: Creates unique star systems based on a seed and a JSON-based rulepack.
*   **Variety of Star Types**: Supports generation of various spectral types (O, B, A, F, G, K, M) as well as exotic objects like White Dwarfs, Neutron Stars, and Black Holes.
*   **Binary & Single Star Systems**: Can generate both single-star systems and complex binary systems with circumbinary planets or planets orbiting each star.
*   **Detailed Planetology**: Generates planets with a wide range of properties, including mass, radius, temperature (with equilibrium, greenhouse, and tidal heating components), atmospheric pressure, and hydrosphere coverage.
*   **Deep Classification**: Planets are classified into one of over 60 types (e.g., 'planet/ocean', 'planet/hot-jupiter', 'planet/super-earth') based on their physical characteristics.
*   **Environmental Simulation**: Models stellar radiation output and surface radiation on planets, including the effects of magnetic fields.
*   **Habitability & Biospheres**: A habitability score is calculated based on multiple factors. Qualifying planets can develop unique, procedurally generated biospheres.
*   **Interactive 2D Visualizer**: An orbital view of the generated system with playback controls, zoom, and focus abilities.
*   **Starmap**: A pan and zoomable map of multiple star systems, with enhanced usability and persistent UI settings.
    *   **Dynamic Grid/Hex Overlay**: Toggle between a square grid, a hex grid (or as some might call it, the "Traveller hex view"), or no grid. The grid dynamically renders only the visible portion.
    *   **Snap-to-Grid**: When adding new systems, coordinates snap to the center of the nearest grid or hex cell.
    *   **Toggleable Background**: Display a static, faded background image of the Milky Way.
    *   **Mouse Zoom Control**: Enable or disable mouse wheel zooming.
    *   **State Persistence**: Grid type, background visibility, and mouse zoom settings are saved and loaded with your starmap data.
*   **GM Editing Tools**:
    *   **Rename**: Click on any body's name to rename it.
    *   **Add**: Add a new planet or moon to any star or planet.
    *   **Delete**: Remove any planet or moon and its entire orbital system.
*   **AI-Powered Descriptions**: Integrates with OpenRouter to allow GMs to generate rich, narrative descriptions for any celestial body using customizable prompts, tags, and styles.
*   **Save & Load**: 
    *   Save your creations to your browser's local storage.
    *   Download any system or the entire starmap as a JSON file to your computer.
    *   Upload a previously saved JSON file to continue your work.

## Usage

### Generating a System
1.  On first load, you will be prompted to create a new starmap.
2.  Give your starmap a name and click "Create".

### Interacting with the Starmap
*   **Pan and Zoom**: Use the mouse wheel to zoom (if enabled) and click and drag to pan the starmap.
*   **Reset View**: Click the "Reset View" button to reset the pan and zoom to fit all systems.
*   **Add System**: Right-click on any empty space on the starmap and select "Add System". If a grid is active, the new system will snap to the nearest grid/hex cell center.
*   **View System**: Click on a star system to view its details.
*   **Link Systems**: Right-click on a star and select "Link System". Then right-click on another star to create a route between them.
*   **Edit Route**: Click on a route line or its label to open the route editor.
*   **Delete System**: Right-click on a star and select "Delete System".
*   **UI Controls**: Use the dropdown to select 'No Grid', 'Grid', or 'Hex' view. Use the checkboxes to 'Disable Mouse Zoom' or 'Show Background'. These settings persist with your starmap.

### Exploring the System
*   Click on any celestial body in the visualizer to focus on it and view its detailed stats in the panel below.
*   Use the time controls to play, pause, and fast-forward the simulation.
*   Click "Zoom Out" to return to the parent body's view.

### Using the AI Description Generator
This is not complex LLM use and you can probably enable these features without cost by using a free model off OpenRouter. Just sign up to OpenRouter - don't buy any credits (unless you want to use some of the more advanced models) and create an API key for yourself (save it somewhere secure!). 
1.  **Setup**:
    *   Click the **"Settings"** button in the top-right.
    *   Enter your [OpenRouter](https://openrouter.ai/) API Key.
    *   Select a model from the dropdown. Free models are listed at the top.
    *   Click **"Close"**.
2.  **Generation**:
    *   Select a planet or star.
    *   In the "Description & Notes" section, click **"✨ Expand with AI"**.
    *   In the modal window, you can:
        *   Add your own notes or seed text.
        *   Select a report style (e.g., "Formal Science Survey", "Pirate's Scuttlebutt").
        *   Choose tags to guide the generation (e.g., "Alien Ruins", "Mining Outpost").
        *   Select the desired length of the response.
    *   Click **"Generate"**.
    *   Once you are happy with the result, click **"Accept & Close"**.

### Saving and Loading
*   Use the **"Save to Browser"** and **"Load from Browser"** buttons to persist the starmap across sessions.
*   Use **"Download Starmap"** and **"Upload Starmap"** to save and load starmap files.

## Getting Started

### For Users
Just click here: https://star-system-generator.vercel.app/ This will be the latest working version; automatically built off the code here. NB: while in dev-mode there are no guarantees saves will be forward compatible.

### For Developers (who want to install it locally)

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

## Planned Features

*   **Orbital Mechanics**: Implementation of Delta-V and burn planning for spacecraft.
*   **Protoplanetary Disks**: For very young systems, generate a dense disk instead of a full set of planets.
*   **Expanded Classifications**: Add more detailed and specific planet classifications.

## Known Issues

*   **"Player View"**: The player view functionality is currently hidden and marked as a future enhancement. It will be revisited for further development. 

## Attributions

This project uses images from several sources under Creative Commons licenses. We are grateful for their work.

*   **Planet Images**: Courtesy of **Pablo Carlos Budassi**, used under a [CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0/) license. Source: [thecelestialzoo on DeviantArt](https://www.deviantart.com/pablocarlosbudassi/gallery/79413331/the-celestial-zoo-official-collection)
*   **Star Images**: Sourced from the [Beyond Universe Wiki](https://beyond-universe.fandom.com/wiki/) on Fandom, used under a [CC-BY-SA](https://creativecommons.org/licenses/by-sa/3.0/us/) license.
*   **Magnetar Image & Starmap Background**: Courtesy of **ESO/L. Calçada & S. Brunier**, used under a [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/) license. Sources: [ESO Magnetar](https://www.eso.org/public/images/eso1415a/), [ESO Milky Way](https://www.eso.org/public/images/eso0932a/)
*   **Black Hole Accretion Disk Image**: Courtesy of **NASA’s Goddard Space Flight Center/Jeremy Schnittman**, used under a [Public Domain](https://svs.gsfc.nasa.gov/13232) license. Source: [NASA SVS](https://svs.gsfc.nasa.gov/13232).
*   **Weyland-Yutani Logo**: Courtesy of **Bagera3005**, used under a [CC BY 3.0](https://creativecommons.org/licenses/by/3.0/) license. Source: [DeviantArt](https://www.deviantart.com/bagera3005/art/Weyland-Yutani-corp-155128785)

## License

This project is licensed under the [GNU General Public License v3.0](https://www.gnu.org/licenses/gpl-3.0.en.html).