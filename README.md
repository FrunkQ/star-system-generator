# Star System Generator & Visualizer

A procedural generator for creating scientifically-plausible star systems, complete with a real-time orbital visualizer.

## What is it for?

This tool was primarily designed to enhance Science Fiction Tabletop Role-Playing Games (TTRPGs). While not a perfectly accurate simulation, it aims to be 'close enough' for an RPG setting, appealing to those who, like me, marvel at the wonder and complexity of the real science behind astronomy and exoplanets. It should provide a wealth of interesting environments to serve as the backdrop for your narrative.  This has been "vibe-coded" using Gemini CLI (Pro 2.5) over a few months.

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
*   **GM Editing Tools**:
    *   **Rename**: Click on any body's name to rename it.
    *   **Add**: Add a new planet or moon to any star or planet.
    *   **Delete**: Remove any planet or moon and its entire orbital system.
*   **AI-Powered Descriptions**: Integrates with OpenRouter to allow GMs to generate rich, narrative descriptions for any celestial body using customizable prompts, tags, and styles.
*   **Save & Load**: 
    *   Save your creations to your browser's local storage.
    *   Download any system as a JSON file to your computer.
    *   Upload a previously saved JSON file to continue your work.

## Usage

### Generating a System
1.  Use the dropdown on the top-left to select the type of star system you want to create (e.g., "Random", "Type G", "Type M Binary").
2.  Click **"Generate System"**.

### Exploring the System
*   Click on any celestial body in the visualizer to focus on it and view its detailed stats in the panel below.
*   Use the time controls to play, pause, and fast-forward the simulation.
*   Click "Zoom Out" to return to the parent body's view.

### Using the AI Description Generator
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
*   Use the **"Save to Browser"** and **"Load from Browser"** buttons to persist a single system across sessions.
*   Use **"Download JSON"** and **"Upload JSON"** to save and load system files.

## Getting Started (for Developers)

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
