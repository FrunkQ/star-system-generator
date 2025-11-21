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
*   **Constructs & Infrastructure (NEW!)**:
    *   **Ships & Stations**: Place artificial constructs anywhere in the system—from low orbit to deep space or even on planetary surfaces.
    *   **Detailed Specs**: Every construct has tracked stats for Mass, Crew (Current/Max), Power, Fuel, Engines, and Cargo.
    *   **Template System**: Includes a rich library of pre-built templates to get you started, featuring:
        *   **Hard Sci-Fi**: Realistic near-future stations and outposts.
        *   **The Expanse**: Accurate recreations of ships and stations like the *Rocinante*, *Tycho Station*, and *Ceres*.
        *   **Aliens**: Famous vessels like the *USS Sulaco*, *Nostromo*, and *Dropship*.
        *   **Mothership RPG**: The massive pirate haven *Prospero's Dream*.
    *   **Customization**: Load any template, tweak its stats, refit its modules, and save it as a unique object in your system.
    *   **Visual Distinction**: Distinct visual icons for Ships (Triangles), Stations (Squares), and natural bodies (Circles).
*   **Orbital Mechanics & Planetology**:
    *   **Delta-V Calculations**: Automatically calculates the Delta-V budget required to land on or ascend from any planet, broken down by Propulsive vs. Aerobraking methods.
    *   **Orbital Boundaries**: Visualizes and calculates key zones like Low Orbit (LEO), Geostationary Orbit (GEO), and the Hill Sphere.
    *   **Atmospheric Modeling**: Detailed atmospheric data including composition, pressure, and scale height, influencing aerobraking feasibility.
    *   **Habitability**: Complex habitability scoring based on temperature, atmosphere, and magnetosphere protection.
*   **Interactive 2D Visualizer**: An orbital view of the generated system with playback controls, zoom, and focus abilities.
*   **Starmap**: A pan and zoomable map of multiple star systems, with enhanced usability and persistent UI settings.
    *   **Dynamic Grid/Hex Overlay**: Toggle between a square grid, a hex grid (or as some might call it, the "Traveller hex view"), or no grid.
    *   **Snap-to-Grid**: When adding new systems, coordinates snap to the center of the nearest grid or hex cell.
    *   **Toggleable Background**: Display a static, faded background image of the Milky Way.
    *   **State Persistence**: Grid type, background visibility, and mouse zoom settings are saved and loaded with your starmap data.
*   **GM Editing Tools**:
    *   **Rename**: Click on any body's name to rename it.
    *   **Add**: Add a new planet, moon, or construct to any star or planet.
    *   **Delete**: Remove any planet, moon, or construct.
*   **Projector Mode (Player View) (NEW!)**:
    *   **Dedicated Player View**: Access a clean, full screen, player-focused view of the star system by opening the Star System hamburger menu: "Open Projector View"
    *   **GM Synchronization**: The player view automatically synchronizes with the GM's view, including camera pan/zoom, time controls (play/pause, speed), and selected focus.
    *   **GM Visibility Controls**: As a GM, you can mark any celestial body or construct as hidden by clicking on the visibility icon next to its name. Hidden objects and their descendants will be completely invisible in the Player View, allowing for hidden secrets and dynamic reveals.
*   **AI-Powered Descriptions**: Integrates with OpenRouter to allow GMs to generate rich, narrative descriptions for any celestial body using customizable prompts, tags, and styles.
*   **Paper Reports (NEW!)**: Generate printable, themed PDF reports of your star system. Choose between a GM (full intel) or Player (redacted) version, with player reports respecting GM visibility settings for objects and descriptions. Select visual themes like "Retro Line Printer" or "Corporate". Reports include detailed celestial data and artificial construct traffic.
*   **Save & Load**: 
    *   Download any system or the entire starmap as a JSON file to your computer.
    *   Upload a previously saved JSON file to continue your work. This can be at the starmap level or just a single star system to allow portability.
    *   **Constructs (Ships/Stations)**: Individual constructs can be exported and imported as simple JSON text files, making it easy to share them.
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

### Adding & Editing Constructs
*   **Add New Construct**: Right-click on any celestial body (star, planet, or moon) in the visualizer and select "Add Construct". A modal will appear allowing you to:
    *   Choose from a library of pre-defined **Templates** (e.g., *Rocinante*, *Tycho Station*, *Prospero's Dream*).
    *   The construct will automatically be placed in a default mid-range orbit around the selected body.
*   **Edit Construct Details**: Click on an existing construct to focus it. Its details will appear in the right-hand panel, allowing you to modify its name, description, crew, cargo, and other technical specifications.
*   **Delete Construct**: Right-click on an existing construct and select "Delete Construct" to remove it and its associated data from the system.

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
*   Everything you do is automatically stored to the starmap (just zoom back after generating a new system to trigger)
*   Use **"Download Starmap"** and **"Upload Starmap"** to save and load starmap files on the main page.
*   Use the hamburger menu on the system view to Upload and Download individual Star Systems

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

*   **Transfer Window Planner**: Tools to calculate optimal launch windows between planets based on orbital phasing.
*   **Protoplanetary Disks**: For very young systems, generate a dense disk instead of a full set of planets.
*   **Expanded Classifications**: Add more detailed and specific planet classifications.

## Known Issues



## Attributions

This project uses images from several sources under Creative Commons licenses. We are grateful for their work.

*   **Planet Images**: Courtesy of **Pablo Carlos Budassi**, used under a [CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0/) license. Source: [pablocarlosbudassi.com](https://pablocarlosbudassi.com/2021/02/planet-types.html)
*   **Star Images**: Sourced from the [Beyond Universe Wiki](https://beyond-universe.fandom.com/wiki/) on Fandom, used under a [CC-BY-SA](https://creativecommons.org/licenses/by-sa/3.0/us/) license.
*   **Magnetar Image & Starmap Background**: Courtesy of **ESO/L. Calçada & S. Brunier**, used under a [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/) license. Sources: [ESO Magnetar](https://www.eso.org/public/images/eso1415a/), [ESO Milky Way](https://www.eso.org/public/images/eso0932a/)
*   **Black Hole Accretion Disk Image**: Courtesy of **NASA’s Goddard Space Flight Center/Jeremy Schnittman**, used under a [Public Domain](https://svs.gsfc.nasa.gov/13232) license. Source: [NASA SVS](https://svs.gsfc.nasa.gov/13232).
*   **Weyland-Yutani Logo**: Sourced from [Wikimedia Commons](https://commons.wikimedia.org/wiki/File:Weyland-Yutani_cryo-tube.jpg) by [IllaZilla](https://commons.wikimedia.org/wiki/User:IllaZilla), used under a [Creative Commons Attribution-Share Alike 3.0 Unported](https://creativecommons.org/licenses/by-sa/3.0/deed.en) license. Changes made: Logo Extracted.
*   **Sci-Fi Template Inspirations**: *The Expanse* (James S.A. Corey), *Aliens* (20th Century Studios), *Mothership RPG* (Tuesday Knight Games). Templates are included as homage/fan content.

## License

This project is licensed under the [GNU General Public License v3.0](https://www.gnu.org/licenses/gpl-3.0.en.html).