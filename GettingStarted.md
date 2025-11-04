# Getting Started with the Star System Generator

Welcome to the Star System Generator! This application is designed to help you create and visualize detailed star systems for your sci-fi stories, games, or world-building projects.

## 1. First Launch & Initial System

When you first open the application, you'll be presented with a screen asking for a name and units. You can change these later, so don't worry. Next, you'll be taken to your Starmap view with a randomly generated star system. This is your initial playground! Don't worry if it's not exactly what you envisioned; you can always regenerate it or create new ones.

## 2. Navigating the System View

Once in a system, you'll see the **System View**. This is where you can explore the star and its orbiting bodies. You can:

* **Pan:** Click and drag on the background to move the view.
* **Zoom:** Use your mouse wheel to zoom in and out.
* **Focus:** Click on any celestial body (star, planet, moon) to focus on it. This will center the view on that body and update the details panel.
* **Zoom Out:** If you're focused on a planet or moon, click the "Zoom Out" button to go back to its parent body or the main star system view.

## 3. Understanding the UI Controls

At the top of the System View, you'll find several controls:

* **System Summary:** Provides an overview of the system's planets and moons, categorized by type (Terrestrial, Gas Giants, Human-Habitable, Earth-like, Biospheres). These categories are color-coded for quick identification.
* **Regenerate Solar System:**
    * **Select Star Type:** Choose a specific star type (e.g., Type G, Type K) or keep it "Random". (Our Sun is a Type G star.)
    * **Generate System:** Creates a completely new, random system based on your selected star type.
    * **Generate Empty System:** Creates a system with just the central star, allowing you to add planets manually.
* **Play/Pause & Time Scales:** Control the simulation of planetary orbits. You can play/pause and adjust the time scale (e.g., 1s, 1h, 1d, 1y) to observe orbital mechanics.
* **Toggle Names:** A checkbox (on by default) that shows or hides the names of celestial bodies in the orbital diagram.
* **Hamburger Menu (☰):** Contains options like "Download System" (to save your system as a JSON file) and "Upload System" (to load a previously saved system).
    > **Note:** The main Starmap view also has save/load options, which you should use for normal saving. This menu option is for saving a *single system* to move it to a new starmap.

## 4. Adding Planets Manually

If you started with an empty system or want to expand an existing one, you can add planets:

1.  **Focus on the host body:** Click on the star or a planet to select it as the host for your new body.
2.  **GM Tools:** Below the map, you'll see the body's "GM Tools".
3.  **Add Planetary Body:** Select a "Planet Type" (e.g., Terrestrial, Gas Giant) and click "Add Planet".
4.  **Adding Earth-like Planets:** For specific story needs, you can add a planet designed to be Earth-like. This option will attempt to generate a planet with parameters (mass, orbit, atmosphere, magnetosphere) that align with Earth-like conditions, making it suitable for your plot. This may fail if your star is too active or cold. Adding Earth-like planets as moons around gas giants is possible, but it is very difficult and will often fail.

## 5. Detailed Information & GM Quick Notes

When a celestial body is focused, the right-hand panel also displays:

* **Scientific Data, Tags & Picture:** Provides in-depth technical data about the selected body.
* **Detailed Information:** Your hand-created or AI-generated planetary description. You can edit this information using the edit/save/cancel buttons, and it supports Markdown rendering.
    * I recommend trying to connect a free LLM from OpenRouter—sign up and get an API key (just an email is needed). I have found the free model: "DeepSeek: DeepSeek R1 0528 Qwen3 8B (free) (Free / Free)" to be very useful for this app during testing. It's slow but effective.
    * These descriptions are not designed to replace the GM, but to provide a variety of ideas to build upon. Try the different styles and settings; it is designed to be experimented with.
    * You can set up the LLM options from the **Settings** on the main StarMap page (top level). You can tweak other settings there as well.
* **GM Quick Notes:** A simple, auto-saving text area for you to jot down quick notes or plot hooks related to the selected body or the overall starmap.

## 6. Back to the Starmap & Connecting Systems

To return to the main starmap view:

* Click the "Zoom Out" button until you are no longer focused on any individual system.

From the Starmap View, you can:

* **Create New Systems:** Right-click on an empty space to add a new star system.
* **Connect Systems:** Right-click on a star system and choose the option to link it to another system, creating routes between them. You can tag these routes with distances.
* **Save & Load to Browser:** Saves to the browser's storage. If you return to this browser or refresh the page, you can get back to your starmap.
* **Save & Load to File:** Lets you download your creation for security or to move to a different PC, etc. **NB:** There is no server behind this app; it all runs on YOUR machine, so please back up your files!
* **Settings:** Set up an LLM at OpenRouter or adjust the initial settings you selected when you created the starmap (name & units).