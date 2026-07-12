# Changelog

All notable changes are listed here:

## v2.1.78-beta - 12th Jul 2026

* **Black holes render as black holes.** A black hole now shows a pure-black event horizon instead of a star surface. A quiescent hole has only a faint photon-ring glow and barely lights its surroundings; a feeding one (active / with accretion) gets a bright, hot blue-white accretion glow that flickers over time and lights the system like a real star (its accretion disc still renders as its own ring).

## v2.1.77-beta - 12th Jul 2026

* **Moons and orbiting constructs no longer sink into the planet in readable views.** The true-scale fix had let satellites fall inside a magnified globe; there's now a clearance rule that scales with the rendered globe size, so a satellite always sits just outside the parent's surface (staggered by orbital order) in readable views, while true-scale positions are preserved. Moon orbit rings follow the same rule so a moon still sits on its ring.

## v2.1.76-beta - 12th Jul 2026

* **System text-list now runs through the real filter too.** The "list" system view is drawn to a canvas and passed through the actual GPU shader (like the starmap list), retiring the CSS approximation for it. It stays interactive — a coloured body list you can scroll, and tapping a body opens its file in the shared inspector. (The inspector panel keeps its own approximated filter for now.)

## v2.1.75-beta - 12th Jul 2026

* **Monochrome starmap option.** A new "Monochrome (for tints)" toggle renders the 2D/3D starmap — stars, routes, grid and labels — in white/grey, so a colour filter tints the whole map cleanly.

## v2.1.74-beta - 12th Jul 2026

* **Starmap grid + route options.** The 2D/3D starmap grid now offers a **Hex** lattice (aligned to the map) alongside Polar and Polar+scale, and a **Glowing routes** toggle switches the emissive transit lines on or off (off = plain lines). Both starmap look controls are available for the 2D map too, since it's the same engine.

## v2.1.73-beta - 12th Jul 2026

* **Lo-poly now includes the star.** Under the lo-poly render styles the central star is faceted too (and gets glowing vector edges/points in "filled + lines"), instead of being left as a smooth sphere.
* **2D map gets the 3D look controls.** Since the 2D map is the 3D engine locked overhead, its editor now exposes the same controls that were previously 3D-only where they make sense — render style, grid, spread/scale, body size, belt detail, view orbit, label size, starfield and auroras. (The genuinely 3D-only knobs — tilt, lock-overhead, lighting, frame-whole — stay hidden for 2D.)

## v2.1.72-beta - 12th Jul 2026

* **Body graphics options for the 2D (and 3D) view.** A new "Body graphics" choice lets a preset draw worlds as a 3D sphere (as before) or as a flat camera-facing disc in one of three styles: Photo (the body's stock image), Simple disc (the procedural true-colour disc), or Flat shape (a plain class-colour disc). Belts and rings still show around a flat world. Photos are loaded safely — if one can't be used (cross-origin), it falls back to the procedural disc rather than breaking the view.

## v2.1.71-beta - 12th Jul 2026

* **Aurora toggle.** The System look options gain an "Auroras" checkbox (on by default), so a preset can switch the emissive polar aurora glow on or off across both the 2D and 3D views.

## v2.1.70-beta - 12th Jul 2026

* **Starmap routes now glow.** Links between systems render as an emissive filament (a soft additive halo along the ground plus a bright core line) instead of a flat dim line, in both the 2D (overhead) and 3D starmap views — they read as lit hyperlanes and pick up the CRT/filter bloom.

## v2.1.69-beta - 12th Jul 2026

* **The starmap text-list now runs through the real filter, not a CSS fake.** The "list" starmap module is drawn to a canvas and passed through the same GPU shader as everything else, so the CRT/night-vision/thermal look is genuine and matched to the other stages — and it stays interactive: tap a system to enter it (the tap is warp-corrected so it hits the right row even under barrel distortion or picture-roll), drag or scroll-wheel to scroll, and guide tips ride along inside the filter. (The system "list" view is a richer interactive browser rather than a simple list, so it keeps its own treatment for now.)

## v2.1.68-beta - 11th Jul 2026

* **Surface constructs now ride the planet's surface.** A construct sitting at (or below) its parent's physical radius — a surface installation like the Ascension Heavy Lifter, as opposed to a genuine low orbiter like the ISS — is now glued to a fixed point on the rendered surface and turns with the planet's own spin, so it slides over the surface at the right rate instead of drifting on its own orbit. It also sits exactly on the rendered surface at every zoom, including true scale, fixing the mis-placement when magnified right in.

## v2.1.67-beta - 11th Jul 2026

* **Guide tips are now a preset option on every stage.** A new "Guide tips" control (Theme section) shows the funny in-universe advisories on the top edge, bottom edge, both, or off — and they now render INSIDE the filter (drawn into the holo/cover GLSL layer, so the CRT/night-vision/thermal shader warps and tints them like everything else) rather than as a plain caption on the legacy Guide skin only. A fresh line each time the view changes (moving between systems, focusing a body, or crossing to the cover). Live on the cover, the 3D system view and the 3D starmap; the text-list stages pick it up when they move to the graphics pipeline.

## v2.1.66-beta - 11th Jul 2026

* **Two new low-poly render styles.** "Lo-poly — filled" draws chunky faceted planets (respecting the colour choice — true-colour continents, flat class colour or monochrome); "Lo-poly — filled + lines" adds glowing vector edges and vertex points on top. Sit alongside the wireframe styles in the system look options.

## v2.1.65-beta - 11th Jul 2026

* **Zoom works at true scale.** Focusing a body now frames it by its actual rendered size and relaxes the minimum zoom to match, so a tiny true-scale world can be brought up large on screen just like an expanded one — no need to know the size first.
* **"White" colour is now "Monochrome (for tinting filters)"** in the editor, making its purpose clear (draw the bodies neutral so a filter colours them).

## v2.1.64-beta - 11th Jul 2026

* **Surface and low-orbit constructs now sit where they should.** Ships/stations orbiting a planet are placed just outside the planet's rendered size and ramp outward by true distance — so a surface or low-orbit construct hugs a true-scale planet instead of being flung out near the moons. (Same fix applies to moons.)

## v2.1.63-beta - 11th Jul 2026

* **The cover screen is now filtered for real too.** It's drawn to a canvas and run through the actual GPU shader on its own surface, so it warps, rolls and tints exactly like the rest of the screen — the cover graphic included. The only player-view surfaces still using the lighter CSS approximation are the plain text-list readouts.

## v2.1.62-beta - 11th Jul 2026

* **The 2D map is now a real top-down 3D view, filtered for real.** Both the 2D system map and the 2D starmap are now drawn by the holo renderer locked overhead (flat/unlit), instead of a separate flat diagram under a CSS approximation. So they go through the actual GPU filter (warp, roll, tint) and share the 3D picking — one renderer, not two.
* **Tapping works under warp/roll.** Picking now runs the cursor through the same distortion the shader applies, so a tap lands on the body you see even when the picture is barrel-warped or rolling.

## v2.1.61-beta - 11th Jul 2026

* **Moon orbits stay local to their planet.** A moon system is now sized as a fraction of its planet's own orbit radius, so it never grows into a neighbouring planet's orbit (Luna's ring no longer reaches toward Venus). Moons are still ranked by true distance.
* **You can zoom right in on a body**, even at true scale — the minimum zoom distance was relaxed so a small world can be brought up large on screen.
* **The per-screen overlay bitmap now goes through the real filter too** (3D view): it's composited into the holo render like the info card, so it warps/rolls/tints with the GPU shader.
* **White colour scheme keeps the info panel monochrome** (white/greys), so a visual filter colours it — rather than using the accent.

## v2.1.60-beta - 11th Jul 2026

* **The body info block is now part of the actual filtered picture (3D view).** Instead of a CSS approximation, the info panel is drawn once to a canvas and composited into the holo render itself, so it warps, picture-rolls and tints through the *real* GPU shader exactly like the rest of the screen — no fake. It's a static, once-per-selection draw, so it's cheap. (The panel sits inside a small bezel margin so the CRT edge-warp doesn't wrap it.)
* **Info-panel font-size slider** added to the 3D system settings, so you can scale the readout text.



## v2.1.59-beta - 11th Jul 2026

* **The body info block now clearly takes the visual filter.** Its tint was too weak to reach the text, so only the image looked filtered — the tint now recolours the whole panel, so a selected body's data reads as part of the CRT / night-vision / thermal screen.
* **The preset's font is used across the player view.** The chosen theme font now also applies to the body info block, the status bar and the system-view chrome — not just the cover, starmap and in-scene labels — so the whole view reads in one typeface.

## v2.1.58-beta - 11th Jul 2026

* **Wireframe belts are simplified to plain points.** In the vector-wireframe render styles, asteroid belts and debris now draw as small points instead of the lumpy rock silhouettes, keeping the clean vector look.
* **Wireframe auroras.** In true-colour wireframe modes, an auroral world no longer lights up its whole body — instead it shows a couple of flickering emissive arcs at its magnetic poles in the correct aurora colour (Earth green, a gas giant red-pink), like an aurora drawn on an old vector display.

## v2.1.57-beta - 11th Jul 2026

* **Wireframe worlds show rough continents.** In true-colour wireframe modes, a world with a coastline now fills its land facets with flat low-poly polygons in the land colour — chunky and indicative rather than accurate, like the continents on an 80s vector display — over the wireframe "ocean". Airless/all-ocean worlds and gas giants stay plain.

## v2.1.56-beta - 11th Jul 2026

* **Auroras in the 3D holo.** Worlds with an atmosphere, a magnetic field and enough stellar flux now glow with a flickering aurora at their (tilted) magnetic poles — coloured by the atmosphere (Earth green, a gas giant red-pink, etc.) and scaled by strength, just like the 2D disc.
* **The Sun renders correctly in wireframe modes.** In the vector-wireframe render styles the star is now drawn as a wireframe too — flat draws plain polygons, glow adds the emissive glowing vertices — instead of staying a solid photosphere.
* **No more "DON'T PANIC" flash when opening a player view.** The default Guide cover briefly appeared for a frame before the chosen preset took over; the preset is now recognised on the first paint, so it never shows.

## v2.1.55-beta - 11th Jul 2026

* **Info panel width is now set in the editor.** The body info panel's desktop width is a preset setting (System step), so you size it once per preset; mobile keeps its own layout.
* **New "Flat / no lighting" option for an efficient 2D-map look.** Ticking it (with "Lock overhead") renders the system through the 3D engine as flat, unlit discs — the clean top-down map look, but it gets the *real* GPU visual filter (CRT / night-vision / thermal), not the lighter CSS approximation. Reuses the existing renderer, so text/labels render in-scene too.
* **Fixed the starmap text-list formatting** — each system is now a single tidy row (stars · name · summary) instead of the summary wrapping onto a second line.

## v2.1.54-beta - 11th Jul 2026

* **Body "Type" now shows the classification, not the kind.** The info block's Type line reads the scientific classification (e.g. "G2V", "Ringed · Ammonia clouds gas giant", "Terrestrial") instead of just "star" / "planet".
* **The editor preview now shows true colour, matching the player view.** True-colour needs the derived colour palette that only lives on a processed system; the editor was previewing a raw example (no palette), so it fell back to flat swatches. It now previews one of the campaign's actual processed systems, so worlds render textured just as players see them.

## v2.1.53-beta - 11th Jul 2026

* **Holo labels no longer balloon as you zoom.** The in-scene labels were computed without the camera's field-of-view factor, so they rendered far too big (and drifted in size). They now hold a correct, constant on-screen size at any zoom — which also restores easy tapping, since oversized labels had been sitting over the planets and swallowing clicks.
* **Tapping a star now selects it.** Body picking is more robust: it walks up from whatever mesh the ray hits, so stars (drawn as a photosphere + corona group) and wireframe bodies are selectable, not just simple planet spheres.
* **The body info block now takes the visual filter.** In the player view, a selected body's panel (image + data) picks up the same CRT / night-vision / thermal look as the rest of the screen, instead of sitting outside it.

## v2.1.52-beta - 10th Jul 2026

* **The player view now renders what the preset actually says.** Until now, opening a preset mapped it onto a legacy skin, so a custom preset's cover never appeared and the starmap always showed as the 2D diagram regardless of the module you picked. The catalogue now deploys the preset's real layers:
  * the **cover page** you designed shows as the entry screen (tap to enter);
  * the **starmap** renders in the module you chose — text list, 2D map or 3D — and tapping a system opens it;
  * the **system view** renders in your chosen module (text list, 2D or 3D holo);
  * the preset's **theme** (font + accent), **visual filter** and **per-screen overlays** are applied throughout.
* Starmap list / 2D / 3D views gained tap-to-select so players can navigate from any of them.

## v2.1.51-beta - 10th Jul 2026

* **3D starmap labels now go through the visual filter too.** Same fix as the system holo view: system name labels were HTML over the canvas, so they stayed flat and drifted under a CRT barrel-warp. They are now rendered inside the 3D scene, so the filter tints and warps them in lockstep with the system stars, and they keep the theme accent colour.

## v2.1.50-beta - 10th Jul 2026

* **Holo labels now go through the visual filter.** Body labels used to be HTML drawn over the canvas, so under a CRT filter they stayed flat and drifted out of place as the barrel-warp bent the bodies underneath them. They are now rendered inside the 3D scene, so the filter tints, scanlines and warps them in lockstep with the bodies — they stay glued to each body and pick up the phosphor colour.

## v2.1.49-beta - 10th Jul 2026

Player Views fixes:

* **Opening a player view now shows the preset you picked.** A freshly-opened player window was falling back to a default look because it resolved the preset before the campaign map had loaded and never re-checked. It now applies the chosen preset the moment the map arrives.
* Edit preset / General: removed the Company / faction and Footer text fields (not needed); the General preview now shows a clean cover-format sample of the chosen font and accent colour.
* Occluded wireframe render styles look right: the hidden-surface sphere now matches the wireframe's faceting so it no longer bulges past the front edges — clean solid globes with the far side hidden.

## v2.1.48-beta - 10th Jul 2026

Player Views modal:

* The main action (Open / Change / Close player view) now sits on its own full-width row, with Edit / Duplicate / Delete moved to a separate row below it.
* Mobile pass: the modal goes full-screen and stacks the card grid over the detail pane in a single scrolling column; the share block stacks with a centred QR, and buttons and checkboxes get larger tap targets.

## v2.1.47-beta - 10th Jul 2026

Editor feedback fixes:

* **Rainbow shows in the editor preview.** The General-step theme sample now renders the rainbow accent as the actual spectrum gradient, instead of a flat yellow.
* **White colour greys the orbits.** With the body colour set to White, the orbit rings now draw in neutral grey (matching the bodies) rather than keeping their old per-body colours.
* **Wireframe flat vs glow are now distinct.** Flat draws just the edges; Glow adds the brighter vertex points (the vector-screen highlight). Two new render styles — Wireframe glow (solid) and flat (solid) — hide the far side of each globe so it reads as a solid vector object rather than see-through.

## v2.1.46-beta - 10th Jul 2026

* **The GM drives the players' view from one place.** The player window is now a clean display — the on-screen preset picker, look gear and quick toggles are gone. Everything moves to the "Player Views…" screen: the live view is highlighted, and one button reads **Open** (nothing running), **Change** (a different preset selected) or **Close** player view. Closing shows the players a calm "Please stand by" hold screen. The quick overrides (Follow GM, hide labels, suspend filter, pause view-orbit) live here too and push to the players instantly (rate-limited so a rapid toggle never floods the link).
* **Field Guide retired from the rail.** The old Field Guide launcher is gone — Player Views does it all now.

## v2.1.45-beta - 10th Jul 2026

* **A separate overlay per screen.** Instead of one overlay everywhere, each stage now places its own image independently: upload to the shared library on the General step, then drop any of them onto the Cover, Starmap and System stages — a different image, position, size or opacity on each screen if you like (or none). Same nine-point / size / stretch / opacity controls throughout.

## v2.1.44-beta - 10th Jul 2026

* **Image overlays on every screen.** A preset can carry an overlay image (watermark, frame, logo) shown over the cover, starmap and system views alike — with the standard placement options now shared everywhere: a nine-point anchor, size as a percentage of the screen, opacity, and a "stretch to fill" toggle for any aspect ratio. The cover graphic uses the same controls.
* **Rainbow accent.** A new theme option renders the accent as a rainbow — recreating The Guide's original colourful title look (the cover title fills with a spectrum gradient). Everything else falls back to a representative colour where a single hue is needed.

## v2.1.43-beta - 10th Jul 2026

* **Open a preset for players.** The Player Views screen now carries the Field Guide's sharing tools: a QR code and copy-link for the selected preset, and an "Open player view" button. Players scan or open the link and it launches that preset live — a 3D holo table, a projection, a guide — driven by the preset you picked. Built-in and your own custom presets both work; the campaign's presets travel with the shared map. Quick overrides (Follow GM, suspend filter, pause view-orbit) sit alongside.

## v2.1.42-beta - 10th Jul 2026

* **Starmap gets three player-view modules — including a new 3D map.** The starmap stage can now present as a **text list**, a **2D map**, or a **3D map**. The 3D map lays systems out as glowing stars on a rotatable plane, with routes, name labels, and an optional distance grid (plain, or with light-year rings labelled). The System-view look controls have starmap cousins (grid, view angle, label size).
* **Binaries look like binaries.** Multi-star systems now render as multiple stars in every starmap view (2D, 3D, and the list says "2 stars") — fixing the long-standing "shows a binary as a single star" issue, from one shared source of truth.

## v2.1.41-beta - 10th Jul 2026

The preset editor becomes a proper five-step wizard, and every stage gets a live preview:

* **General → Cover → Starmap → System → Visual filter.** Each step shows only its own controls; the filter is deliberately last so you design clean and costume at the end. Back/Next guides you through.
* **Filter sliders now bite.** Filter parameter values weren't reaching the preview at all — fixed, and slider drags now update the shader in place (no flicker). The filter step has Cover / Starmap / System preview buttons: the 3D view uses the exact shader; text and 2D screens use a lighter matched version so their content stays readable.
* **General step**: fonts (curated stacks), accent colour, company/footer, follow-GM and interactivity — plus a graphics library with a starter logo included; upload your own (PNG transparency kept, saved with the campaign).
* **Cover graphics**: place any library image on the cover with a nine-point position, size and opacity.
* **Starmap and System stages can be switched off** per preset — players simply never see navigation to a disabled stage.
* **Player Views on the rail.** New rail entry opens the preset gallery; the right-hand pane now shows the selected preset's summary with Edit / Duplicate / Delete and the quick live-session overrides (Follow GM, suspend filter, pause view-orbit). Field Guide and Projector stay until the new system reaches full parity.

## v2.1.40-beta - 9th Jul 2026

* **Cover pages.** The preset editor can now design a cover / hold screen — title, subtitle, body, a corner stamp (e.g. CONFIDENTIAL), and a company/footer line, themed by the preset's accent colour and font. A System / Cover tab in the preview shows it live, so you can recreate "DON'T PANIC" (or your own logo screen) and see exactly how it lands.

## v2.1.39-beta - 9th Jul 2026

* **Every filter knob in the editor.** Selecting a filter in the preset editor now exposes its full control set — brightness, contrast, invert, phosphor colour + strength, scanlines, barrel warp, vignette, and the collapsible Distortion / Signal-artifact groups — all driving the live preview. (Yes, you can finally crank the brightness and invert it.)

## v2.1.38-beta - 9th Jul 2026

* **Live preset look editor.** Duplicate a preset and hit "Edit look…" to open the editor: the full set of look controls on the left (filter + phosphor, colour, 3D render style, grid, spread, sizes, framing, belts, view-orbit, labels, background, accent) and a **live 3D preview** on the right that reacts as you drag. The controls a view supports are shown for that view (3D controls appear for the holo view). Save writes it to the campaign. This is the heart of the unified player-view system taking shape.

## v2.1.37-beta - 9th Jul 2026

* **Player View preset manager (early).** A first cut of the unified player-view system: a preset gallery reached from the Field Guide launcher ("Manage presets…"). It lists the shipped presets — The Guide, Datapad, Console, CRT, Holo Table, Projection — plus any you make; GM-driven ones are outlined. Duplicate a preset to get an editable copy, rename/retune its top-level settings, or delete it. Presets are saved with the campaign (and any old saved holo looks migrate in automatically). The full look editor with a live preview comes next; the existing Field Guide is untouched for now.

## v2.1.36-beta - 9th Jul 2026

* **Wireframe / vector "80s" mode.** New Render control: Filled (as before) or Wireframe — a low-poly vector globe drawn as glowing (or flat) edges with brighter vertex points, for that old-vector-display feel. Works in any colour.
* **Colour is its own choice.** The body colour dropdown is now True colour / Flat colour / **White** — and it applies to both filled and wireframe bodies. "White" replaces the old fixed blue holo-tint, so a screen filter can colour the whole scene however you like.

## v2.1.35-beta - 9th Jul 2026

* **Moon orbits appear with their moons.** In the Holo Table an orbit path now shows under exactly the same rule as the body's name — so selecting a planet reveals its moons *and* their orbit rings, on one clean rule. Moon rings are drawn in the planet's own frame with the same spread the moons use, so they sit right under them.
* **Pause the view-orbit on the fly.** When auto view-orbit is on, a quick control on the holo bar suspends it momentarily (not saved) — handy if the slow spin gets distracting.
* **Slimmer data panel by default.** The player-view body panel now opens about two-thirds of its old width, leaving the map more room; drag its edge to taste (remembered).

## v2.1.34-beta - 9th Jul 2026

* **Labels follow the CRT colour.** In-scene body labels are drawn over the 3D canvas, so the screen filter couldn't reach them and they stayed pale. They now match the CRT phosphor colour, so a green/amber terminal reads as one piece.
* **Label size + font.** Label size is a slider in the look controls, and the label font follows the preset theme (wired for the unified player view).
* **Quick GM toggles.** Two momentary controls sit on the holo bar (not saved to the preset): hide/show labels, and suspend the visual filter for a moment if it's hard to read.

## v2.1.33-beta - 9th Jul 2026

* **One CRT filter, any phosphor colour.** The separate green and amber CRT filters are replaced by a single "CRT Terminal" filter with a Phosphor Colour picker — green, amber, red, blue, whatever you like — driven live. Fewer filters, more flexibility, and it lays the groundwork for the unified player-view presets. Existing Green/Amber holo presets migrate automatically.

## v2.1.32-beta - 9th Jul 2026

* **Binary separation is editable again.** Typing a separation for a binary pair (e.g. 23.7 AU) was being transformed on every keystroke — the field bound one member's barycentric distance, so the physics pass re-split what you typed by mass ratio and overwrote the box while you were still typing. The field now genuinely edits the pair separation (both members are written with the correct mass split, which the physics pass reproduces exactly), and the panel no longer refreshes from the model while one of its inputs has focus.

## v2.1.31-beta - 8th Jul 2026

Field Guide look controls + panel polish (the look panel's full home will be the projector control window):

* **View orbit.** New slider that slowly turns the camera around the scene (a turntable) — from static (default) up to about one revolution every 15 seconds. Pauses itself while a focus shot is settling.
* **Grid dropdown.** The ground grid is now its own control: Off, a plain polar grid, or a scaled grid with round-AU distance rings labelled (1 AU, 3 AU, 10 AU…), mapped through the current spread.
* **Flat Colour is the class colour.** "Flat colour" bodies now use the standard per-class swatch (terrestrial / gas giant / ice giant / habitable), never the derived true colour — that's what True Colour is for.
* **Object picker on the left.** The body selector sits at the top-left of the view rather than centred, leaving the middle clear (and matching where the projector will put it).
* **Resizable body panel (desktop).** Drag the left edge of the right-hand data panel to make it slimmer or wider; the width is remembered.

## v2.1.30-beta - 8th Jul 2026

* **Phone body panel opens small.** On a phone, tapping a world now opens its file to just the name and type — the picture, stats and description stay tucked away until you tap the title to expand them. So a tap no longer throws a half-screen sheet over the map, and you can happily click from world to world. On desktop the full panel shows as before.

## v2.1.29-beta - 8th Jul 2026

* **Field Guide body selector is now the app's own picker.** The holo/console body list was a full-height column that ate half a phone screen. It's been replaced with the same compact command-strip picker the main app uses — a chip + search + category drill-in (Stars / Planets / Moons / Belts / Rings / …) — so it's tiny, floats out of the way, and works exactly like the rest of the app. Belts are pickable from it too.

## v2.1.28-beta - 8th Jul 2026

* **Belts are visible again.** Asteroid and Kuiper belts were rendering but so faint (a tenuous surface density plus tiny attenuated rocks) they washed out to nothing at system scale. Belts now read as a clear dust band — larger, brighter rocks with a readable opacity floor — while their real density is still carried by the rock count (so the Kuiper belt is richer than the Main Belt).
* **Holo starts moving.** The Field Guide now opens already playing at 1 second ≈ 1 hour, so a system is alive the moment you open it — inner planets visibly move and the rings shear — rather than sitting frozen until you find the play button.

## v2.1.27-beta - 8th Jul 2026

* **Planets cast a shadow across their rings.** A ringed planet's body now throws a shadow band over the arc of ring that passes behind it (anti-sunward) — the ring is bright on the sunward side and darkens where the planet blocks the star, the classic Cassini look. Runs per-particle in the ring's own tilted frame, so it tracks the star and the planet's obliquity.
* **The star responds to the body-size dial.** Like the planets, the central star now scales between its readable size and its true physical radius as you move the body-size slider, instead of staying a fixed size.

## v2.1.26-beta - 8th Jul 2026

* **Belts can be framed from the selector.** Tapping a belt (Main Belt, Kuiper Belt) in the body list now frames it: the camera keeps the star centred at the preset view angle and pulls back so the whole annulus fits — the inner belt zooms to the inner system, the Kuiper belt pulls right out to the edge. Belts were previously un-framable because they're a ring about the star rather than a single body.

## v2.1.25-beta - 8th Jul 2026

* **Belts and rings now read their density from the data.** A belt or ring's particle count follows its actual mass, and its brightness follows its surface density — so Saturn's massive rings are dense and bright, while a gossamer Jupiter or Uranus ring is sparse and faint (Uranus, spread over its wide annulus, reads correctly thin). The "belt detail" dial is now a density control that scales the whole budget, so a big belt gets proportionally more rocks than a small ring rather than a flat count.

## v2.1.24-beta - 8th Jul 2026

* **Belts orbit now too.** Asteroid and Kuiper belt debris each rock advances at its true heliocentric orbital rate, so a belt slowly revolves (inner rocks faster) rather than sitting frozen. Because belts are so far out, the motion only shows once you wind time up to years-per-second — but it's there, and consistent with the rings and planets. Cheap: just a per-particle position update.

## v2.1.23-beta - 8th Jul 2026

* **Ringed planets have rings.** Saturn, Jupiter, Uranus and Neptune now wear a particle ring disc in their tilted equatorial plane, sized from the ring's real inner and outer radius. The rings spin the way real rings do — differentially, with the inner edge orbiting faster than the outer — so as time runs you can watch them turn and shear. Particle count follows the same "belt detail" performance dial.

## v2.1.22-beta - 8th Jul 2026

* **Time slider tidies itself away.** The expanded time-rate slider now closes on its own as soon as you interact with anything else, instead of needing a close button.

## v2.1.21-beta - 8th Jul 2026

* **Rethought the player time control.** It now sits as a small play/pause icon and expands on click into a rate slider that steps through real time — 1 s per second — all the way up to 10 years per second (1 s · 1 min · 1 h · 12 h · 1 d · 2 d · 4 d · 1 wk · 2 wk · 1 mo · 2 mo · 6 mo · 1 yr · 2 yr · 5 yr · 10 yr). So you can crawl or fast-forward the orbits to taste, and it stays out of the way when you're not using it.

## v2.1.20-beta - 8th Jul 2026

* **Time controls on the player view.** The Field Guide's live view now has a pause/play button and speed (slower/faster) controls, so a player can stop the motion or speed the worlds along to watch them orbit. It's just for seeing movement — the projector will show the real in-universe clock from the GM.

## v2.1.19-beta - 8th Jul 2026

* **Body-size dial.** A new "Body size" control lets you scale planets and moons from their readable chunky size down toward their true physical scale — so on a true-scale layout the worlds become the tiny pinpoints they really are, while their labels and orbits still show where they sit. Fine-tune it to taste instead of accepting the fixed size; it's saved in your preset. (The star stays a readable anchor for now.)

## v2.1.18-beta - 8th Jul 2026

* **Sharper eclipse shadows.** An eclipse now casts a hard-edged shadow by default, as an airless world would — the umbra only softens into a fuzzy penumbra when the shadowed moon or the planet casting the shadow has a real atmosphere (gas and ice giants count).

## v2.1.17-beta - 8th Jul 2026

* **Greenscreen background for streaming.** The holo view can now sit on a flat chroma-key background (green, blue or black) instead of space, so you can key it out in OBS and float the hologram over your stream. It's in the look panel and there's a ready-made "Greenscreen (OBS)" preset (top-down, true scale, green). First piece of the coming projector mode.

## v2.1.16-beta - 8th Jul 2026

* **Moon eclipses.** A moon now falls into shadow when its planet passes between it and the star — computed analytically (a cheap ray-to-star test against the planet, no heavy shadow maps), with a soft edge to the umbra. Most visible in the true-scale and projector views, where bodies sit at their real positions.

## v2.1.15-beta - 8th Jul 2026

* **Body style control.** The look panel now lets you render worlds three ways — True colour (the procedural textured surfaces), Flat colour (solid apparent-colour spheres), or Holo tint (a monochrome blueprint look) — and it's saved with your preset. A new "Blueprint" starter shows off the tinted mode. The "Scale" slider is now labelled "Spread" (true scale ↔ readable spread) to be clearer about what it does.

## v2.1.14-beta - 8th Jul 2026

* **Belts are as dense as the data says — with a performance dial.** A belt's rock count now comes from its actual debris density (mass), and the rubble fills its real inner-to-outer width, so a rich belt looks rich and a thin ring looks thin. A new "Belt detail" control in the holo look panel scales the overall particle budget up or down for performance — turn it down on an older tablet, up on a powerful machine — and it's saved with your preset.

## v2.1.13-beta - 8th Jul 2026

* **Belt debris looks like rubble, not squares.** Asteroid and Kuiper belts now scatter irregular rock silhouettes in a few shapes, sizes and grey/brown tints, so a belt reads as chaotic debris up close instead of a grid of identical squares. Still just point clouds — cheap to draw.

## v2.1.12-beta - 8th Jul 2026

* **Holo look presets.** The whole look of the 3D view — filter, scale, camera framing, starfield — is now a single preset you pick from a dropdown. Five starters ship (Clean Hologram, Green CRT Table, Amber Terminal, Night Ops, and a top-down true-scale Projector look). A gear button opens a live control panel to tweak any of it and save your own named preset, which is then available everywhere the holo view appears.

## v2.1.11-beta - 8th Jul 2026

* **Constructs read as icons on the Holo Table.** Stations and ships now use their map icon shape (triangle, diamond, etc. in their own colour) at a fixed on-screen size instead of rendering as chunky spheres. They show full-size and named when their planet (or they) are selected, and shrink to a faint few-pixel dot otherwise, so distant traffic never blocks a world. Tapping near a tiny icon still selects it. The fan-out that keeps a busy orbit legible now eases off as you approach true scale.

## v2.1.10-beta - 8th Jul 2026

* **Stars are real suns now.** Instead of a flat glow, each star is a textured photosphere sphere — granulation and sunspots (more spots on a more active star) — turning on its own axis, wrapped in a corona halo. An active, flaring star's corona visibly pulses and brightens; a calm star stays steady. The star still lights the system, and in a binary each star casts its own light, so a planet between two suns is lit from both.

## v2.1.9-beta - 8th Jul 2026

* **GPU display filters on the Holo Table.** Real fragment-shader post-processing — a proper CRT (scanlines, barrel curvature, phosphor tint, chromatic aberration, flicker) in green or amber, plus night-vision and thermal looks. Pick one from the corner of the holo view. (Ported from the Mappadux filter engine; the shaders load only with the 3D view, so nothing else is affected. GM-tunable sliders and presets come next.)

## v2.1.8-beta - 8th Jul 2026

* **Worlds are textured and they turn.** Each planet and moon now wears a procedurally generated surface — gas-giant bands, land and ocean, cloud decks, hot glow — the same look as The Guide's discs, wrapped onto the sphere. The sphere rotates on its own axis at the body's real rotation rate (with axial tilt and oblate flattening), so at a sensible time rate you watch worlds spin under the sunlight, day rolling into night across the terminator.

## v2.1.7-beta - 8th Jul 2026

* **Holo Table worlds are lit now.** Each star casts real light, so every world shows a day/night terminator — the spheres read as solid 3D bodies instead of flat discs, even before textures arrive. Binary systems get a light per star.
* **Background starfield.** An optional static starfield sits behind the hologram (on by default; a GM-selectable skybox slot comes later).

## v2.1.6-beta - 8th Jul 2026

* **Holo Table names bodies like the main view.** You see the focused body plus its parents and siblings; a body's children (moons) name themselves only when it's selected — so focusing a planet reveals its moons by name, and the map stays uncluttered otherwise. (The rule now lives in one shared place used by both the 2D and 3D views.)
* **Two framing controls under the hood.** The camera framing is now driven by two values — tilt angle (overhead to 3/4) and whether to fit the whole system or the focused body. Overhead + whole gives a top-down plan view (the basis for the projector), while a lower angle framed to a body gives the Field Guide look. These will surface as GM controls later. Moons render smaller and fan out further so a focused moon system reads cleanly.

## v2.1.5-beta - 8th Jul 2026

* **Holo Table reads properly now.** Distances use a log "toytown" compression so a packed system like Sol spreads across the grid instead of collapsing into a central blob (this will become a GM slider). Asteroid and Kuiper belts render as debris rings rather than a single stray ball; moons fan out around their planet so a moon system is legible; and each planet carries a floating name label (moons stay unlabelled at this zoom to avoid clutter — they'll name themselves when you focus in).

## v2.1.4-beta - 8th Jul 2026

* **Holo Table is now interactive.** Tap a world in the 3D view — or pick it from the body list — and the camera eases in to frame it from just above, looking back toward the star, while its file opens alongside. Selecting a body always opens its details now, in the hologram just as in the flat console.

## v2.1.3-beta - 8th Jul 2026

* **Fix: the Holo Table skin can now actually be selected.** Picking it from the Field Guide launcher silently fell back to the standard Guide, because the config's skin whitelist didn't recognise the new key. It's on the list now, so the 3D view shows as chosen.

## v2.1.2-beta - 8th Jul 2026

* **New Field Guide skin: Holo Table (3D).** A rotatable 3D orbital hologram — a fading holographic grid with the star as a glowing billboard, worlds on their real orbit rings, and inclined orbits that genuinely tilt out of the plane. Drag to rotate, pinch/scroll to zoom. Pick it from the Field Guide launcher (or `?theme=holo`). First pass: bodies are flat-colour spheres for now; textured, lit, spinning worlds land next. The 3D engine loads only when you open this view, so the rest of the app is unaffected.

## v2.1.1-beta - 8th Jul 2026

* **V2.2 groundwork (holo view).** Added an inclination-aware 3D orbit propagator (`propagateState3D`) alongside the flat one, both now sharing a single Kepler solve so the 2D orrery and the coming 3D view can never drift. Per-frame world positions moved into one shared module used by the orrery today and the holo view next. No visible change; internal only.

## v2.1.0 - 7th Jul 2026

**Star System Explorer V2.** A ground-up rebuild. Where V1 let you sketch a system, V2 derives one from real physics and lets you live in it — fly it, share it, and bring worlds in from other tools. The headline additions since the V1 line:

* **Physics-derived worlds.** A world's interior makeup, density and radius, its oceans and ice caps, atmosphere, magnetic dynamo, geology, surface-temperature profile and true apparent colour are all *derived* from the underlying physics rather than dialled in by hand — and its classification follows from that physics. The Newton panel shows the working behind any number.
* **Live orrery and starmap.** A real-time orbital view with true-colour bodies, rings, aurorae and axial tilt, sitting under a multi-system starmap you can scale in light years, parsecs or abstract jumps.
* **Spacecraft and astrodynamics.** Model your own ships and fly them: efficient transfers or "hard burns", with fuel, time and hazard all calculated. In-system **autopilot** runs ships along resource and patrol routes indefinitely, keeping a flight log; **interstellar travel** carries relativistic time dilation.
* **The Field Guide.** A live, redacted, player-facing companion you can serve straight to your players' own devices — they see what you choose to reveal, updated as the system runs.
* **Tags, Points of Interest and Constructs of Interest.** Reasons to visit a place, surfaced across the map and driving the autopilot's route choices.
* **Import from other tools.** Bring a system in from **Universe Sandbox** (.ubox) or **SpaceEngine** (.sc) — including gas and ice giants (rendered correctly from their real composition) and dwarf planets like Pluto and Eris with their moons. The importer audits every value it derives against the source so you can see what came across.
* **Rewritten documentation.** New Getting Started, physics, tags and autopilot guides, all covering the V2 feature set.

## v2.0.337-beta - 7th Jul 2026

* **Construct logs now show incoming visits.** When an autopilot ship delivers, collects, refuels or holds station at another construct (a station, depot or tanker), that visit now appears on the *receiving* construct's log too — "Chariot delivered 120 t water-ice", "Refuelled Chariot" — in a distinct colour with an inbound marker. Derived live from the fleet's own logs, so it stays correct as you scrub time.

## v2.0.336-beta - 7th Jul 2026

* **Refreshed the opening splash for V2.** The start-screen intro was still describing V1. Two new write-ups now alternate each time the dialog opens — one physics-forward, one framed around running a system at your table.

## v2.0.335-beta - 7th Jul 2026

* **SpaceEngine import: lopsided barycentres collapse.** SpaceEngine models a planet and a big moon (Earth + Moon) as both orbiting a shared barycentre. SSG only shows a barycentre for a near-equal pair, so an imported one that's very lopsided (mass ratio < 8%, the same test SSG uses) is now dissolved — the moon simply orbits the planet directly, like everywhere else. Genuine co-orbiting pairs (Pluto-Charon, binary stars) keep their barycentre.
* **Time controls: the first "+" starts time moving.** The very first time you press the speed-up (+) button, playback begins too — so a new user immediately sees what it does, instead of just watching the rate number change while everything sits still. A one-time nudge; after that the speed buttons don't force playback.

## v2.0.334-beta - 7th Jul 2026

* **SpaceEngine import: gas/ice giants now look right.** An imported Neptune was rendering as a big cratered moon — SpaceEngine calls an ice giant's fluid mantle "Ices" (Neptune ≈ 78% ice), and SSG's visual keys off the *gas* fraction, so a low-gas makeup drew a solid icy surface. Gas/ice giants (mass > 8 M⊕, density < 2.5 g/cc) now leave their interior to SSG's own density inference — exactly like SSG's own Neptune — so they classify *and* render correctly as giants. Rocky worlds and moons still import their composition.
* Import mass slider now shows the cutoff in **Earth masses** as well as kg.

## v2.0.333-beta - 7th Jul 2026

* **Import fixes + docs.** The import mass slider had its end labels reversed (the "all bodies" end read "largest only") and its included-count was one too low at the extremes (a floating-point rounding artefact) — both fixed. The first-run V2 welcome popup now lists importing from Universe Sandbox and SpaceEngine among the new features, and the README, Getting Started guide and dev docs were refreshed to cover the importers.

## v2.0.332-beta - 7th Jul 2026

* SpaceEngine import: removed an erroneous `.se` extension — SpaceEngine exports are `.sc` (with `.pak` addons also handled). The New System text names `.sc`.

## v2.0.331-beta - 7th Jul 2026

* SpaceEngine import now also accepts `.se` as well as `.sc` and `.pak` (some exports use it), and the New System text names the SpaceEngine export formats.

## v2.0.330-beta - 7th Jul 2026

* **Import from SpaceEngine (.sc / .pak).** You can now drop a SpaceEngine catalogue straight into SSG, right alongside Universe Sandbox saves — the New System dialogue and the in-system upload accept `.sc` and `.pak` files. SpaceEngine is a close fit (it stores real orbits and an explicit parent for each body), so the import is near-1:1: stars, planets, moons, binary stars and barycentres, orbits, composition, atmospheres and oceans all come across, and SSG derives the rest. The same converter window as the Universe Sandbox import handles it — a mass slider for how many small bodies to include, and a diff afterwards showing anything SSG derived differently, with one-click copy. Tested against the real Solar System catalogue (with the Earth-Moon and Pluto-Charon barycentres), a procedurally generated system, and a life-bearing binary. Under the hood the two importers now share one modal, one archive reader and one review, so both stay consistent.

## v2.0.329-beta - 7th Jul 2026

* Universe Sandbox import diff: the "explained" rows now say *why* in a couple of words (e.g. "SSG runs it cooler", "SSG-derived field"), with the full explanation on hover. The copied-for-review text carries the short reason too.

## v2.0.328-beta - 7th Jul 2026

* Fixed: importing a `.ubox` from the New System dialogue left the New System window sitting on top of the importer, blocking it. The dialogue now hides while the importer is open (and the importer sits above everything).

## v2.0.327-beta - 7th Jul 2026

* **Fixed: real .ubox files failed to import in the browser** ("not a valid archive — Array buffer allocation failed"). Universe Sandbox writes ZIP64 archives, and the zip library's browser build mis-read the ZIP64 size marker as a 4 GB allocation and crashed. The importer now reads the archive itself — pulling out only the JSON it needs (skipping the large terrain and image blobs entirely) and resolving ZIP64 sizes correctly — so full-size saves import quickly (an 18 MB, 8,000-object save loads in about half a second).

## v2.0.326-beta - 7th Jul 2026

* New System dialogue: merged the redundant ".ubox" box into "Load saved system…" — one button now takes an SSE v1/v2 system file (.json) or a Universe Sandbox save (.ubox), with a note saying so.

## v2.0.325-beta - 7th Jul 2026

* **Universe Sandbox import is now in the app (Phase 2).** You can drop a `.ubox` save straight into SSG: the file pickers on the New System dialogue and the in-system upload now accept `.ubox`. Choosing one opens a converter window that shows what's inside, lets you set a **mass slider** — from "largest only" down to "all bodies", with a live count so you decide how many of the (often thousands of) small bodies to bring in — and then imports. Afterwards it shows a **diff against Universe Sandbox**: what was imported, what was skipped and why, the assumptions it made, and every value SSG derived differently from US, flagged as aligned, explained, or "needs a look". A one-click **Copy for review** button drops the whole report onto your clipboard so you can paste it into a document and chase down anything that didn't come across right. Only the essentials are imported (mass, radius, orbit, composition); SSG derives the physics and the review points at whatever looks off for you to tweak.

## v2.0.324-beta - 7th Jul 2026

* **Universe Sandbox (.ubox) import — Phase 1 (converter + CLI).** A new module (`src/lib/import/ubox/`) reads a Universe Sandbox save and converts it into an SSG system: it inflates the archive, resolves the simulation via the manifest (tolerating the bare NaN tokens real saves contain), turns each body's state vectors into Keplerian orbits (with a lossless round-trip check), infers the parent/child hierarchy the save doesn't store (moons→planets, planets→star) via Hill-sphere binding, and derives makeup/atmosphere/hydrosphere/obliquity from the save's mass inventory and orientation. It imports only authored inputs and lets SSG derive the rest, then AUDITS its derived results against the values it didn't import, flagging differences as aligned / explained / unexplained. A galactic-context guard skips far-field objects (e.g. Sagittarius A* in a full-galaxy save), a user mass threshold controls how many small bodies come in, and ring particles are reconstructed into ring nodes. Driveable now via `npx vite-node scripts/ubox2ssg.mjs -- <file.ubox>`; the in-app file-picker + review UI (Phase 2) is not wired yet. 21 tests against fixtures cut from two real Update 36.2.1 saves; the Sol physics baseline is untouched.

## v2.0.323-beta - 7th Jul 2026

* Dev docs only: Universe Sandbox (.ubox) import specification + implementation design (`docs/dev/ubox-import-spec.md`, `docs/dev/ubox-import-design.md`), grounded in teardowns of two real Update 36.2.1 saves. No app changes.

## v2.0.322-beta - 7th Jul 2026

* **One physics pipeline — the duplicate edit-path recompute is gone.** The app had TWO physics pipelines: the full SystemProcessor (run on load/generation) and a lighter parallel recompute (run when editing a body's atmosphere or repairing structure). The fork drifted twice in as many days — the heat-model bugs and the habitability scorer both traced to it — and it also meant an edit scored habitability with an old V1 formula (different weights, no geology/magnetism modifiers) while the breakdown panel went stale. Edits and repairs now re-run the one true pipeline, so an edit can never disagree with a reload: same temperatures, same habitability (formula AND breakdown), same classification, geology, magnetism and resonance/stability annotations. The legacy V1 habitability scorer and the whole parallel recompute module are deleted. Bonus fix found during the sweep: the Technical Details panel's min/max and day/night temperature ranges were composed without the brown-dwarf self-luminous term — they now use the shared composer, so a brown dwarf's displayed extremes include its own heat. Full suite (455 tests) and the Sol baseline are green.

## v2.0.321-beta - 7th Jul 2026

* **Habitability's liquid-solvent score is now presence-weighted, not a step.** Previously any standing surface liquid, however small, scored full marks — so a 2% sea tied a global ocean, which read like a bug. It's now a gentle ramp: presence alone earns ~60% of the solvent marks (a little water is genuinely high-value, and with a sample size of one the *amount* is a weak signal next to whether it stays liquid — which the temperature/pressure factors already carry), rising to full by ~18% coverage. A 2% sea still scores high, but no longer maximal. Non-water solvents take the same ramp at their lower quality ceiling. The Biosphere breakdown now carries a one-line rationale so the number reads as deliberate, and the physics reference explains the reasoning in full. Applied consistently across both habitability code paths; Earth (≈70% ocean) is unchanged, so the Sol baseline holds.

## v2.0.320-beta - 7th Jul 2026

* **Heating-model audit — one surface temperature, wired everywhere.** Following the radiogenic fix, a full pass over how heat reaches the surface and where that surface temperature is then used. Two reported bugs traced to the same root cause: the Temperature tab computed its own "Mean Surface Temperature" preview with a *different* albedo (a coarse heuristic) than the processor commits (derived cloud albedo), so the number shown drifted ~15+ K from the value **habitability** and **geology** actually read — which made radiogenic look "disconnected" from habitability even though it wasn't. The preview now uses the same derived albedo, so the tab, the habitability temperature score, geology and the classifier all agree on one figure. Separately, the editor's recompute paths (used when you edit the atmosphere or system structure) dropped the **brown-dwarf self-luminous** heat term and didn't re-apply the radiogenic override — so re-processing a self-heated world could appear to *cool* it, and a radiogenic override could momentarily vanish. All surface-temperature composition now flows through a single shared helper that reads every heat source (greenhouse, tidal, radiogenic, giant-internal, brown-dwarf self-luminous), so no path can silently drop one. The Sol calibration baseline is unchanged; a new test locks in that habitability reads the composed mean temperature, that more radiogenic never means less surface heat, and that the recompute paths agree with the main pipeline.
* **Newton panel now shows radiogenic heat.** The temperature trace gained an explicit **Radiogenic Δ** line (between tidal and internal heat), and — when an override is set — a note spelling out that it sums into the mean surface temperature *and* drives geological vigour. The physics reference page's surface-temperature section was updated to match (flux-space summation, radiogenic's dual role, one mean temperature feeding habitability + classification).

## v2.0.319-beta - 7th Jul 2026

* **Custom tags are now shared across the whole starmap.** A free-form tag you add on a body in one system (e.g. `faction/red-syndicate`) is now offered as a one-click **"Reuse from this starmap"** option when tagging any body in any other system — no more retyping and no drift between `red-syndicate` and `Red Syndicate`. The list is derived live from every custom tag in use across the map (and updates as you add/remove them). PoI/CoI packs and custom construct tags were already starmap-wide; this closes the gap for manual body tags.

## v2.0.318-beta - 7th Jul 2026

* **Radiogenic heating fixed — now a proper, persistent GM override that drives geology.** Three bugs, all reported and confirmed: (1) the radiogenic slider wrote to a field that was stripped on every load and never re-derived, so it **reset to 0 on reload**; (2) it was disconnected from geology, so raising it **didn't change the geology tag**; (3) there was no real override control. Radiogenic heating is now a GM **override** (like albedo) — set it in the Temperature tab (derived default is ~0, since radiogenic surface heat is negligible vs sunlight), and it now **persists across save/load** *and* **boosts the geological vigor** (~12 K ≈ +1 Earth-vigor), so cranking it can wake a dead world and change its tectonics/volcanism tag. Any radiogenic values still present in an existing save are **migrated** into the override on load (values already stripped to 0 by an earlier reload can't be recovered — you'll need to re-set those).

## v2.0.317-beta - 7th Jul 2026

* **Welcome popup: a heads-up callout.** The first-run V2 welcome now flags that a big release will have the odd bug (with a link to report them on Discord) and warns that systems saved in V2 won't open in the old V1 app — keep a backup before re-saving.

## v2.0.316-beta - 7th Jul 2026

* **Saved files are now much smaller — and carry no stale physics.** Downloads used to bake in every derived value (temperatures, radiation, colours, classification, magnetism, boundaries…); since the app re-derives all of that on load, it was pure bloat. Saves now strip derived data to a clone before writing, keeping only your authored inputs — around **80% smaller** in testing. Nothing is lost on reload: authored data that *looks* derived (a star's temperature & luminosity, a GM-pinned type, a manual tidal lock, albedo overrides, your own tags) is carefully preserved, and everything else is recomputed. A new round-trip test proves save→load reproduces the system exactly.

## v2.0.315-beta - 7th Jul 2026

* **First-run V2 welcome.** A one-time popup introduces returning V1 users (and newcomers) to V2: all V1 functionality is still there and saved starmaps still load, plus a brief bulleted tour of what's new (new interface, interstellar travel, the Field Guide, physics-derived worlds, the Newton panel, tagging/PoI/CoI, autopilot, classification & visuals) with links to Getting Started, the physics reference, and the Help menu.

## v2.0.314-beta - 7th Jul 2026

* **Fixed impossibly-dense small planets from "Add planet".** A validation sweep of all 59 add-planet types found that the smallest bodies (planetesimal, dwarf-planet, mesoplanet) drew their radius independently of their mass, crushing a 0.0015 M⊕ planetesimal into a 66 g/cc "neutron pebble". Small bodies now derive radius from mass at rock density (a planetesimal is ~3.3 g/cc), while the fingerprint radius band still applies where it's physical. (Brown-dwarf densities of tens of g/cc are correct — that's real electron degeneracy.) Added a regression test that generates *every* type and checks all stats are physical and each round-trips its class.
* **Radiation & temperature now clearly sum over all luminous sources.** The Newton panel shows a moon's self-luminous brown-dwarf host as a heat/radiation source alongside the star, with a note that flux and dose sum (Σ Lᵢ/4πdᵢ²); `/physics` spells out the summing for both equilibrium temperature and surface radiation.

## v2.0.313-beta - 7th Jul 2026

* **Brown dwarfs now visibly glow.** A self-luminous brown dwarf gets an emission halo in the disc renderer (orrery + The Guide), coloured by its effective temperature — deep red when cold (a Y/T dwarf) through orange to amber for a hot young L-dwarf. Added a showcase row to the `/discgallery` reference page. (Also a regression test locking the add-planet brown-dwarf sizing to genuine 13–79 Jupiter masses.)

## v2.0.312-beta - 7th Jul 2026

* **Brown dwarfs now self-heat — and warm & irradiate their moons.** A brown-dwarf-mass body (~8–80 Jupiter masses) is no longer treated as a cold passive planet: it radiates its own heat (gravitational contraction + deuterium burning), so its surface sits at its effective temperature (hundreds to ~2000 K), **cooling with age** (L→T→Y, floor ~250 K) rather than freezing at the distant star's equilibrium temperature. Crucially it becomes a genuine **heat and radiation source for its own moons** — a satellite of a young brown dwarf is warmed and heavily irradiated by it, like a moon of a mini-star. Tagged `thermal/self-luminous`; the effective temperature, luminosity and a full explanation show in the Newton panel and on `/physics`. (Ordinary gas giants — Jupiter included — are untouched.)

## v2.0.311-beta - 7th Jul 2026

* **Help menu no longer shows a stray horizontal scrollbar.** The guide cards were a hair too wide (padding on top of a full-width box); fixed with border-box sizing.

## v2.0.310-beta - 7th Jul 2026

* **Right-clicking a star in the orrery no longer shows starmap actions.** The in-system body menu wrongly offered "Zoom to System / Start Link / Delete System" (starmap-only) on a star; it now offers just **Add Construct**, like planets and moons.
* **About trimmed.** Removed the Getting Started, physics-reference and tutorial-video links that the new Help menu now covers; About just points to Help.

## v2.0.309-beta - 7th Jul 2026

* **Orrery labels & constructs now sit above planet discs.** Since the true-colour disc overlays are an HTML layer over the canvas, a zoomed-in planet could hide its own label ("Earth") and any ship/station in front of it. Labels, construct markers, velocity vectors and the ruler now paint on a dedicated foreground canvas layered above the discs, so they're always visible.

## v2.0.308-beta - 7th Jul 2026

* **Biosphere editor guard.** Toggling a morphology on a generated world whose biosphere had no `morphologies` list would throw — the list is now seeded on demand. (Companion to the v2.0.307 detail-panel fix.)

## v2.0.307-beta - 7th Jul 2026

* **Fixed a UI lock-up on life-bearing generated worlds.** A world with a biosphere but no `morphologies` list (the shape the new generator produces) crashed the body detail panel (`morphologies.join` on undefined), which froze the whole view and made it unclickable — and made the planet vanish when you zoomed in. Every biosphere field is now guarded. (Also the likely cause of the "deleting objects locks up" reports.)
* **Help hub.** A new **Help** entry on the rail (above About) opens a hub linking every guide — Getting Started, the physics reference, the in-app Tags and Autopilot guides, the changelog, Discord and the tutorial video. The **Tags guide** is now also reachable from the PoI and CoI editors, and **About** links Getting Started.
* **Docs:** Traveller instructions now describe the **Settings → System → Traveller mode** checkbox; user-facing links point to **https://starsystemx.com/** (with the **beta.starsystemx.com** channel noted). Removed the unused Design Review file.

## v2.0.306-beta - 6th Jul 2026

* **Documentation overhaul for the V2 drop.**
  * **README + Getting Started** rewritten around the V2 feature set — a new "What's new in V2" section (interstellar travel, the Field Guide, derived geology/composition, the tagging/PoI/CoI overhaul, autopilot, true-colour worlds, the Newton panel…) and a fuller walkthrough covering the generation wizard, tags, autopilot and interstellar travel.
  * **New Tags guide** (PoI/CoI, manual tagging, packs, Find-by-tag) opened via a **Guide** button on the Find-by-tag panel — same in-app help pattern as the Autopilot guide.
  * **/physics page** gained an **Auroras** section (colour from the emitting gas, pole-hugging shape) and a **disc visualisation** rundown (terminator, ice caps, bands, limb-glow, craters, rings, oblateness, tilt-as-final-step). Two Newton-panel deep-links fixed: the Aurora layer now lands on `#aurora`, and Orbital stability on `#resonance` (was a dead `#stability` anchor).
  * **Repo tidy** — internal dev docs moved under `docs/dev/`; superseded design proposals for now-shipped features retired.

## v2.0.305-beta - 6th Jul 2026

* **Temperature panel shows the real distance-to-star for binary members.** Like the stability layer, the Temperature & tidal heat entry used the ~0.0001 AU pair orbit as the semi-major axis (reading "0.000 AU"). It now uses the barycentre's heliocentric orbit — e.g. "Semi-major axis (to Sol, as the Pluto–Charon Barycenter): 39.5 AU" — and adds a **co-orbit partner** line ("Charon — 19,268 km apart") plus a note explaining equilibrium temperature is set by the distance to the star, not the small orbit within the pair.

## v2.0.304-beta - 6th Jul 2026

* **Stability note now spells out the resonance rescue.** The resonance driver used to read only "shepherded by mean-motion resonance", which didn't make clear the resonance is what saves an otherwise-doomed crossing. It now reads "…crosses Neptune's — which on its own would be unstable — but a locked mean-motion resonance keeps their conjunctions away from the crossing point, so it stays stable", for both binary members and ordinary sibling pairs.

## v2.0.303-beta - 6th Jul 2026

* **Binary members show the pair's real orbit in the physics panel.** For a body that orbits a barycentre (e.g. Pluto around the Pluto–Charon barycentre), the Orbital-stability entry now shows the barycentre's ~39.5 AU heliocentric orbit — labelled "as the Pluto–Charon Barycenter" — instead of the misleading ~0.0001 AU orbit within the pair, with a note explaining stability is judged on the pair's shared orbit.

## v2.0.302-beta - 6th Jul 2026

* **Mass/Radius unit button polish.** The unit cycler now sits to the right of the number box (lined up with Density's g/cc), and hovering it explains the current unit — e.g. "Earth masses (M⊕)" — with a "Click to change units" line below.

## v2.0.301-beta - 6th Jul 2026

* **Pluto is no longer flagged "Very Unstable".** A binary/barycentre's orbital-stability check (Pluto–Charon orbits a barycentre) ignored two things the ordinary planet check already handled: a protective mean-motion resonance, and that belts are distributed debris rather than a gravitational neighbour. So Pluto read as doomed for crossing Neptune and the Kuiper Belt. It now correctly reads **Marginal** — metastable, "shepherded by mean-motion resonance" — matching the 3:2 resonance the panel already showed.

## v2.0.300-beta - 6th Jul 2026

* **Pick the units when editing a planet's mass and radius.** In the Size & Composition editor there's now a little unit button in the gap next to "Mass" and "Radius" — click it to cycle Mass between Earth masses, Jupiter masses and tonnes, and Radius between Earth radii, Jupiter radii and km/miles (following your starmap's distance setting). Makes small moons and giants far easier to type in than everything-in-Earth-units. The slider is unchanged; only the number field's units switch.

## v2.0.299-beta - 6th Jul 2026

* **Fixed the Invert / background-image toggles fighting each other** in Settings → Starmap. The invert setting was being re-synced from the saved map on every little change while the panel was open, so it (and the background toggle it disables) could spontaneously flip back. It's now read once when the panel opens, so the two behave predictably: turning on invert disables the background image, turning it off restores it. Also relabelled to "Invert Starmap display (print)".

## v2.0.298-beta - 6th Jul 2026

* **Axially-tilted worlds now tip correctly — including their rings.** Previously the oblate squash stayed vertical while the bands tilted, and a planet's rings didn't tilt at all. Now the whole body — the flattening, cloud bands, polar caps, auroras and the ring system — is drawn upright and then rotated to the axial tilt as one final step, so everything stays aligned (a tipped Saturn shows a tilted, squashed disc with a matching ring). The day/night terminator still points at the star.

## v2.0.297-beta - 6th Jul 2026

* **The physics panel now explains auroras and orbital stability.** A new **Aurora** entry shows why it glows the colour it does (the atmosphere gas that's excited — oxygen green, nitrogen blue-violet, etc.) and how its strength comes from atmosphere + field + incident flux. A new **Orbital stability** entry shows the orbit's perihelion→aphelion, the assessment, and *why* — including when a mean-motion resonance (Pluto/Neptune style) shepherds a crossing orbit into stability rather than doom. Great for spotting a surprising verdict.

## v2.0.296-beta - 6th Jul 2026

* **Auroras now follow the axial tilt.** Because the magnetic poles ride with the spin axis, the auroral ovals rotate with a world's axial tilt (like the cloud banding does) instead of staying pinned to the top and bottom — so a tipped-over world shows its auroras off to the side.

## v2.0.295-beta - 6th Jul 2026

* **Self-heal a binary whose barycentre went missing.** A hand-edited (or otherwise corrupted) system where two stars orbit a barycentre that isn't in the file would fail to load — nothing had a valid root. The barycentre reconciler now recognises an orphaned node (one whose parent no longer exists) as a root, re-homes the stragglers, and rebuilds the missing barycentre, so the system loads normally.

## v2.0.294-beta - 6th Jul 2026

* **Cratered surfaces.** Old, airless, geologically dead worlds — no atmosphere to burn up impactors, no resurfacing to erase the scars — now show impact craters (Mercury, the Moon, Callisto…). Driven by the airless + geologically-inactive condition, or an explicit impact-record tag; shown in The Guide and the orrery.

## v2.0.293-beta - 6th Jul 2026

* **Auroras glow over the limb, and the far pole no longer looks "half-painted".** They now extend a touch past the planet's edge (like a real aurora above the atmosphere) instead of stopping dead at the circle, and the far (bottom) pole's oval fades softly behind the planet rather than terminating in a hard flat line. Holds up on oblate worlds too.

## v2.0.292-beta - 6th Jul 2026

* **No more clouds on airless worlds.** A body with only a tenuous exosphere — like Mercury's sputtered sodium/potassium halo at a ten-billionth of a bar — was wrongly getting a "cloud deck" (and cloud-tinted colouring), because the model looked at what the thin gas was *made of* but not how little of it there is. Clouds now require a real atmosphere (≥ ~1 µbar), so exosphere worlds render and read as the bare rock they are, while thin-but-real atmospheres (Mars, Triton, Pluto) keep their clouds.

## v2.0.291-beta - 6th Jul 2026

* **Tags keep their context in reports and the field guide.** They were being shortened to the bare last word — "Dynamo", "Oblate", "Brilliant" — losing what they meant. They now read with their category, matching the GM window: "Magnetism · Intrinsic dynamo", "Shape · Oblate", "Brilliant aurora: 0.62", "Climate · Polar ice". (The category is only added where it clarifies — no "Atmosphere · Inert atmosphere".)

## v2.0.290-beta - 6th Jul 2026

* Fixed a stray "Mostly Harmless" mark showing under Earth in the **orrery**. The Guide's Earth easter-egg stamp was riding along when the orrery started reusing The Guide's renderer; it's now Guide-only again.

## v2.0.289-beta - 6th Jul 2026

* **Aurora depth + placement.** The far (bottom) auroral oval now has its upper half hidden behind the planet, so it reads as a proper slightly-top-down view instead of floating in front. Auroras also sit closer to the poles when faint and only reach down toward the equator as they grow stronger.

## v2.0.288-beta - 6th Jul 2026

* **Gallery: the same Earth under different stars.** The rendered-world gallery now shows one Earth-like world lit by an M dwarf, a K star, the Sun and a hot A star, so you can see how starlight tints its ocean, clouds and surface — murky amber under a red dwarf, cool and bright under a blue star.

## v2.0.287-beta - 6th Jul 2026

* **A feeding black hole now looks like it's feeding.** Its accretion glow and disc scale with the material-infall (Eddington) rate — more infall makes a bigger, brighter halo and a thicker disc that heats from orange toward yellow-white. Quiescent (non-feeding) holes stay dark, as before.

## v2.0.286-beta - 6th Jul 2026

* **Auroras look like auroras now — and their colour comes from the air.** Redrawn as spiky, swirled glowing **ovals ringing each magnetic pole** (Hubble-Jupiter style) that hug the planet instead of the old floating zig-zag. Their **colour is set by the atmosphere's gas**, like real skies: atomic oxygen glows green (Earth), nitrogen blue-violet, CO₂ violet, and a hydrogen/helium giant red-pink. Strength still scales the size and brightness. Shows in both The Guide and the orrery.

## v2.0.285-beta - 6th Jul 2026

* **The orrery and The Guide now share one renderer.** The tag-driven viz (polar ice, auroras, atmosphere glow, banding + spin-axis tilt, rotational shape) was only appearing in The Guide; it now appears in the orrery too, because a body big enough on screen is drawn with the very same PlanetDisc renderer — so the two views can't drift apart. The orrery keeps its physically-correct day/night terminator (a new light-direction is passed to the disc). Performance-guarded: only on-screen bodies large enough to show detail are promoted (capped in number), each rendered once and GPU-scaled, so panning and zooming stay smooth.

## v2.0.284-beta - 6th Jul 2026

* **Red giants are now coloured like the standard stars they are.** A red giant is just a cool, swollen K/M-temperature star, so it's now tinted by its temperature (warm orange) like every other star instead of a special blood-red swatch — in the orrery and the editor swatch. (Audit confirmed they already behave as standard stars everywhere else — generation, planet counts, classification.)

## v2.0.283-beta - 6th Jul 2026

* **Phase G viz — bodies spun past break-up now render as a ring.** A world driven past ~0.8 of its break-up spin (the toroidal regime) has flown apart into a ring, so The Guide draws a true torus — a tilted annulus with a hole — instead of an ever-thinner lens. Rounds out the rotational-shape series (sphere → oblate → ellipsoid → ring), now all viewable in the rendered-world gallery.

## v2.0.282-beta - 6th Jul 2026

* **Phase G viz — auroras.** New physics driver: a world with an **atmosphere + a magnetic field + an incident ionising particle flux** now gets an aurora, graded faint → moderate → strong → brilliant (a new `aurora/*` tag, explained in the physics panel). Calibrated on the solar system — Jupiter brilliant, Earth and Saturn strong, the ice giants moderate, and no-field or airless worlds none. The Guide draws it as zig-zag polar curtains that grow from a subtle shimmer to huge blazing ovals with the strength, green with magenta tips at the top end.

## v2.0.281-beta - 6th Jul 2026

* **Phase G viz — atmosphere limb-glow.** Worlds with an atmosphere now get a soft halo hugging the limb in The Guide's disc, its strength scaled by surface pressure (wispy → faint, Earth → moderate, Venus → strong) and its colour from the atmosphere's haze. Airless worlds keep a clean edge.

## v2.0.280-beta - 6th Jul 2026

* **Phase G viz — gas-giant bands now tilt with the spin axis.** Cloud banding (its count already set by rotation) is drawn tilted by the world's axial tilt, so a planet tipped on its side like Uranus shows near-vertical bands instead of the usual horizontal stripes. Shows in the orrery and The Guide.
* **Rendered-world gallery.** The dev disc gallery is now a proper reference page (`/discgallery`), linked from **Settings → System → Appearance** — a quick look at how worlds are drawn from their physics and tags (polar ice, banding + tilt, rotational shape…).

## v2.0.279-beta - 6th Jul 2026

* **Phase G viz — polar ice caps.** Worlds that are liquid at their mean temperature but freeze at the poles (the `climate/polar-ice` tag — Earth, Mars…) now show frozen caps in The Guide's rendered disc. The caps sit on the surface, so the day/night terminator dims them, and they follow a fast rotator's oblate squash.

## v2.0.278-beta - 6th Jul 2026

* **Fixed: deleting the primary star of an imported/legacy system left it on the starmap.** Those systems store the map node under a different id from the system inside it, and the delete matched the wrong one — so it worked for freshly-created systems but silently no-op'd for loaded ones. The delete now resolves either id to the right node before removing it.

## v2.0.277-beta - 6th Jul 2026

* **Deleting the primary star now deletes the whole system — on purpose, with a warning.** Previously it silently left a broken, empty husk on the starmap. The star's delete button now reads **"Delete system"** and asks you to confirm ("this removes the whole system and everything orbiting it") before dropping the entire system and returning you to the starmap.
* **GM overrides moved to the bottom** of the read-only data panel, below the tags, where it reads as a footnote rather than a header.
* **Every tag now explains itself in the physics (!) panel.** Filled in the write-ups that were missing (origin, orbit, barycentre, hazard, runaway-greenhouse, the namespaced atmosphere tags…), gave each tag a proper source-layer instead of "Other", and added a namespace-level fallback so any future tag (auroras, bands…) is always explained rather than blank.

## v2.0.276-beta - 6th Jul 2026

* **One slider for spin.** The Day Length editor is now a single log-scaled slider running from the break-up limit (fast) to slow, its track **colour-zoned** by the shape the spin produces — spherical (green), oblate (amber), ellipsoid (orange), near break-up (red) — so you can see a world flatten as you drag. **Tidal lock is a snap-notch** on the track (drag onto it, or click the padlock) instead of a separate checkbox; drag away and it releases. **Retrograde** is its own toggle (the day-length box always shows the magnitude). A numeric box stays for precise entry, and the break-up floor is still a hard stop. **Axial Tilt** becomes a 0–180° slider with a synced value box too.

## v2.0.275-beta - 6th Jul 2026

* **Construct photos now show in the player views.** A construct's uploaded picture appears anywhere a body's picture would — the **Survey Datapad** panel and the **Starship Console** inspector. (Constructs were coded to never show a picture back when they couldn't have one.) The Guide keeps to its own procedural artwork and the CRT stays text-only, as before.

## v2.0.274-beta - 6th Jul 2026

* **F2 — custom images.** Give any body or construct its own picture. For a body it lives under **Type / Image** in the editor; for a construct it's **Add / replace image** on the **Basic** tab (constructs stay as their icon glyph until you add one). Uploads are downscaled to a compact thumbnail so they save with the system and stream to players without bloat. The custom picture shows in the detail pane and survives reloads; **Remove** reverts a body to its derived artwork and a construct to its icon.

## v2.0.273-beta - 6th Jul 2026

* **Credit your systems.** Select the main star and open the new **System Info** tab to add your name, contact, a date and a version. When anyone selects that star they see "This system was created by …" under its image, so your work travels with the system when you share it.

## v2.0.272-beta - 6th Jul 2026

* **F1** — the New System screen now has a **"Load saved system"** button beside the example loader, so you can drop a system you previously saved (or one from a shared starmap) straight onto the map at the clicked spot — no need to open it as a whole starmap first.

## v2.0.271-beta - 6th Jul 2026

* **Saturn-class gas giants now have realistically weak fields.** A cool gas-giant interior lets helium rain out and throttle the dynamo (why Saturn's field is ~20x weaker than Jupiter's). The model now captures this: a hot interior — from mass or strong insolation — keeps the field strong, so Jupiter (~4 G) and hot Jupiters stay powerful while a cool Saturn-mass giant drops to ~0.2 G. Calibrates Jupiter/Saturn/Uranus/Neptune all close to reality.

## v2.0.270-beta - 6th Jul 2026

* Fixed **Venus (and other retrograde rotators) reading a magnetosphere they should not have**. A retrograde body stores a negative rotation period, which the dynamo model mistook for "rotation unknown" and treated as a normal spin — so Venus, which really spins far too slowly for a dynamo, came out with an Earth-ish field. It now uses the rotation magnitude, so Venus correctly reads *No magnetosphere*.

## v2.0.269-beta - 6th Jul 2026

* **Planets and moons are now drawn as their actual shape** — a fast rotator shows visibly flattened (oblate), not a perfect circle — in the orrery, the projector, the printed report and The Guide's discs. The flattening comes straight from the rotational-deformation model (E4), so a world near its break-up spin draws as a thin lens. Rings keep their own plane.

## v2.0.268-beta - 6th Jul 2026

* **Magnetospheres now respond to rotation and composition.** A body's field strength is derived from its dynamo (rotation, interior makeup and core size) rather than a fixed number — spin a world up or make it metal-rich and the field grows; the GM override still wins. Calibrates to the real planets (Earth ~0.5 G, Jupiter ~4.3 G). **Mercury** now reads a **Tenuous magnetosphere** (~0.003 G) instead of "No magnetosphere" — a metal-rich body keeps a weak field even when small and slow-spinning. New *Tenuous magnetosphere* tag for real-but-negligible fields, and the field readout shows enough decimals to see them (0.003 G, not 0.00 G).

## v2.0.267-beta - 6th Jul 2026

* **Rotational deformation.** How fast a world can spin is now limited by its composition: the bulk density sets a hard **break-up spin**, and as a body approaches it it visibly flattens — spherical → oblate → ellipsoid → near-break-up → *would fly apart into a ring*. The shape is derived live from density + day length (so editing either updates it), surfaced as tags, and drives the ellipsoid/toroidal planet types (which now use the real spin limit instead of fixed hour thresholds). The Day Length editor shows the live shape and the break-up period, and won't let you spin a body past the point where it would disintegrate. Jupiter and Saturn correctly read as oblate.

## v2.0.266-beta - 6th Jul 2026

* Fixed **generated gas giants having impossible densities**. A giant's radius was drawn independently of its mass, so a heavy one could come out denser than iron (a "helium" giant read as ~21 g/cc and even mis-labelled non-gas). A giant's radius is now derived from its mass (degeneracy keeps it near one Jupiter radius across a wide mass range) plus thermal inflation, and it's explicitly gas-dominated — so densities are physical. Giant masses are also drawn log-uniformly, so most come out around a Jupiter instead of piling up at brown-dwarf mass (median dropped from ~6 to ~1.9 Jupiter masses).

## v2.0.265-beta - 6th Jul 2026

* **E1 — moons are now gated by their host's mass**, in both the "Add moon" picker and procedural generation. A terrestrial can only hold small airless / icy moons (barren, crater, ice, desert, planetesimal…) — airless rock the default — while a gas giant offers far more (Titan-like methane, Europa-like ocean/ice, bigger bodies). The "Add moon — pick a type" header now says so and the count reflects it (a terrestrial host drops from ~28 types to ~7). Also: a manually-added moon defaults to a small (not gravitationally significant) size instead of Earth-mass, and moons can no longer be gas-giant-family types (helium/puffy/ice-giant) — an old filter gap.

## v2.0.264-beta - 6th Jul 2026

* Generated gas giants now migrate into the true **hot-Jupiter zone** (down to ~0.025 AU, log-biased), so genuine hot Jupiters actually appear — puffed up by the thermal inflation and classified as hot / ultra-hot Jupiters — rather than only warm giants at the fringe. Migration is also slightly more likely.

## v2.0.263-beta - 6th Jul 2026

* Freshly-generated gas giants now **inflate at generation** too: once a giant's final (post-migration) orbit and temperature are known, a close-in one is born puffy — the same thermal-inflation model the editor uses — so a generated hot Jupiter comes out low-density and classifies as one. Cold giants are unchanged.

## v2.0.262-beta - 6th Jul 2026

* The body **data panel now surfaces GM overrides and gas-giant puffiness**. A "GM overrides" line lists which values you've pinned by hand (albedo, magnetic field, thermal inflation, a locked type) so it's clear at a glance what the physics owns vs what you've set. Gas giants also get a **Thermal inflation** readout (×factor, flagged *puffy* when inflated, *override* when hand-set).

## v2.0.261-beta - 6th Jul 2026

* **Gas giants now inflate with heat.** A gas giant's radius (and so its density) tracks its equilibrium temperature — a close-in hot Jupiter puffs up and thins out, a cold one sits near 1 Jupiter radius. This is derived by default; the Size & Composition editor shows a gas-giant-only **Thermal inflation** row (derived from Teq) that you can *override* to model a young, hot or contracted giant independent of orbit, with a *Reset to calculated* control. Terrestrials are unaffected (rock and metal don't thermally expand). Overriding at ×1.5 took Jupiter from ρ≈1.3 to ρ≈0.37 g/cc.

## v2.0.260-beta - 6th Jul 2026

* **Albedo is a GM override again** (Temperature tab). It's still derived from the surface and cloud decks by default, but you can click *override* to pin a reflectivity — it's saved and fed into the equilibrium temperature and the classification, with a *Reset to calculated* control that hands it back to the physics. Darkening a world warms it; brightening cools it. (First use of the new saved-override mechanism; temperature itself stays derived — tweak albedo or radiogenic heat to move it.)

## v2.0.259-beta - 6th Jul 2026

* New **Anomalous field** magnetosphere tag. If you give a body a magnetic field that its interior can't explain (no dynamo, not an induced ocean field), it no longer pretends to be a natural dynamo — it's tagged as an anomalous field of unknown or artificial origin (a megastructure, exotic matter, a young system…). Natural dynamos and induced fields are unchanged.

## v2.0.258-beta - 6th Jul 2026

* **Reloading an existing map now re-derives classifications** (not just tags). On load the app already re-runs the physics, but it wasn't stripping the stored classes first — so a body that already carried a (now-outdated) type kept it, and engine fixes like the moon-eyeball correction didn't show until you re-imported the file. Refresh now strips baked-in derived data and re-derives from the authored inputs, exactly like importing a file does; hand-pinned types (auto-classify off) and authored inputs are preserved. No staleness flag needed — derived data is never trusted from storage.

## v2.0.257-beta - 6th Jul 2026

* Fixed a **hand-picked body type not surviving save → reload**. When you pick a type and switch off *Auto-classify*, that choice is authored data — but on load the import fix-up wiped the class and the engine re-derived it, silently reverting your pick. Pinned types (auto-classify off) now persist across load, exactly like a star's spectral class; bodies left on auto-classify still re-derive as before.

## v2.0.256-beta - 6th Jul 2026

* The **magnetosphere tag now follows the field you set**. Editing a body's magnetic field (Atmosphere → Magnetosphere) is treated as a manual override: set it to 0 and the world reads as *No magnetosphere* (even if its interior would drive a dynamo); raise it above 0 and it gains one. An "overridden" marker and a **Reset to calculated** control appear while a manual value is in force — reset re-seeds the field from the interior model and hands the tag back to the physics. Untouched bodies keep deriving their field from the interior as before.

## v2.0.255-beta - 6th Jul 2026

* Fixed **moons being mis-classified as "eyeball" worlds**. An eyeball world needs a permanent substellar point — it has to be tidally locked to its *star*. A moon is locked to its *planet*, so its far side still turns through the star's day and night; it can never be an eyeball. The eyeball types now require star-lock, so tidally-locked moons classify by what they actually are (dwarf planet, mesoplanet, planetesimal…). Corrects several outer moons in the bundled Solar System.

## v2.0.254-beta - 6th Jul 2026

* **Size & Composition editor** (a planet/moon's Composition tab, rebuilt). Mass, radius and density are bound by one equation (ρ = M/(4/3·π·R³)), so you get three large sliders — Mass, Radius, Density — each with a typed number field and a padlock. Drag one and the physics holds the sensible quantity and derives another: drag mass → the radius follows; drag radius → the density (and interior makeup) shift; set a density → the mass follows. A padlock pins any of the three: **locking Density holds the composition**, so you can resize a world freely without recomposing it.
* **Composition presets are now gated by density**, not mass — Iron-rich, Rocky, Carbon, Ocean, Icy, Ice giant, Gas giant light up when today's density falls in their band (bands overlap, since several mixes are plausible at one density). The interior-makeup sliders are live: while density is unlocked, nudging metal or ice back-drives the density, which re-gates the presets and (with radius held) shifts the mass.
* **You can finally turn a terrestrial into a gas giant.** Drop the density toward ~1 g/cc, pick the Gas giant preset — the makeup goes gas-dominated, the gas-giant radius model kicks in and the world balloons to Jupiter scale — then dial the mass up. It reclassifies for real (a gas/ice-dominated world no longer clings to a leftover biosphere/ocean when the physics decides its type). Dial it back down and it returns to a terrestrial — nothing authored is destroyed.

* Fixed imported stars showing **0 K** — a star's effective temperature is an authored input (it sets the spectral class), but import was stripping it like a planet's derived surface temp. Loaded stars keep their real temperature now (e.g. Procyon 7,070 K).
* **System edge** setting (Settings → Starmap → System edge): choose where a coasting ship counts as having left the system — the star's Hill limit (~2 ly, default) or a tighter custom distance in AU for quicker interstellar departures.
* Tidied the Stellar Zones Key close button (was a heavy red box in the corner; now a clean × that highlights on hover).

## v2.0.252-beta - 5th Jul 2026

* A ship that coasts out past the star's Hill limit now genuinely **leaves the system** — it's removed from the system map and appears on the starmap as an adrift interstellar ship, drifting slowly onward at its real speed along the heading it left on. (The Hill limit is ~2 ly, so a flung ship takes a long time to actually get there — scrub forward to watch it cross over.)

## v2.0.251-beta - 5th Jul 2026

* Hill-sphere overlay now shows STARS too: each star's Hill boundary draws as an unshaded line with a "[Star] Hill Limit" label (like the frost line) — including the root star's own galactic Hill limit (~2 ly for a Sun, the edge of the system). Planets keep their shaded bubbles.
* The Stellar Zones Key panel now has a close (×) button; re-selecting Zones from View options brings it back.

## v2.0.250-beta - 5th Jul 2026

* Stars always show their temperature in Kelvin, whatever the temperature switch is set to (a ~5,778 K star reads oddly as °C/°F) — the °C/°F/K choice governs planet & moon temps. Fixes the report and the Companion guide showing star temps in °C/°F.

## v2.0.249-beta - 5th Jul 2026

* Temperature is now its own switch (Settings → Starmap → Temperature: **°C / °F / Kelvin**), independent of the distance units — so you can pair km with Kelvin, miles with °C, etc. The old "X K (Y °C)" dual readouts collapse to a single value in your chosen unit. Report + Companion guide carry the choice too.

## v2.0.248-beta - 5th Jul 2026

* Temperatures now follow the measurement-units choice too: metric shows °C, imperial shows °F (Kelvin stays internal, and scientific "X K" readouts stay Kelvin). Covers body surface/equilibrium temps, day/night and component ranges, the report, and the player catalogue/guide. Temperature *deltas* (greenhouse/tidal/internal offsets) read in K since a temperature difference isn't a °F value.

## v2.0.247-beta - 5th Jul 2026

* Editable distance/speed inputs now follow the measurement-units choice too: their labels show the current unit (Altitude (km)/(mi), ring radii, Max Entry Speed (km/s)/(mi/s)) and you edit in that unit — converted back to SI on save, with no round-trip drift. Caught a few more raw km/s readouts that the first pass missed (construct Δv in the technical panel, relativistic cruise speed, ring parent Hill-sphere). Belt/orbit distances stay in AU; the body Radius editor is left for the upcoming mass/radius/density rework.

## v2.0.246-beta - 5th Jul 2026

* The measurement-units choice now also drives the **printed report** and the **player Companion catalogue/guide** — radii, local-orbit distances, ascent/landing Δv all honour km/miles. The report carries the GM's current setting; the Companion guide gets it from its launch link.

## v2.0.245-beta - 5th Jul 2026

* Measurement units toggle (Settings → Starmap → "Measurement units"): switch in-system distances and speeds between **Metric (km, km/s)** and **Imperial (miles, mi/s)**. Purely a display choice — everything is still stored and computed in SI. Covers body radii/circumferences, moon & local-orbit distances, orbital-zone bands, sensor ranges, Δv and arrival/cruise speeds, and the ruler readout. Planet/star orbits stay in AU (an astronomical unit, not a km/miles thing) and the interstellar map keeps ly/pc.

## v2.0.244-beta - 5th Jul 2026

* Fixed legacy (V1) binary systems loading wrong. Two distinct bugs in the barycentre load path: (1) importing a system could crash the orrery with "Cannot read properties of undefined" when the scaled-position pass raced a just-loaded system; (2) a nested binary pair (a planet with an oversized moon that V1 had promoted to a barycentre) collapsed to the system centre / inside the star, because the import step deleted its barycentre and orphaned the pair. Both fixed — legacy binaries now load and sit where they should.

## v2.0.243-beta - 5th Jul 2026

* The Autopilot tab now has a **Guide** button (top-right) that opens the full user guide in-app — how routes are chosen for each action, the sliders, fuel/cargo, escorts and the map colours. It reads the same doc that ships in the repo, so help and docs never drift.

## v2.0.242-beta - 5th Jul 2026

* Escort formation is now capability-checked: a charge that burns harder than its escort's thrust ceiling leaves it behind — the escort coasts on from the break moment (deterministic) and commits a fresh chase at its next top-up. Cap the lead ship's Max acceleration to keep a mixed flotilla together.

## v2.0.241-beta - 5th Jul 2026

* Escorts now catch their charge ANYWHERE — in port or open space. The escort targets the construct itself (real rendezvous, velocity-matched) and then flies genuine formation, mirroring the charge through everything it does, trailing by the km standoff (replaces the host-parking approximation). Caveat: intercept aiming projects a mid-burn charge linearly; coasting/parked charges are exact.

## v2.0.240-beta - 5th Jul 2026

* Max time per leg now counts the WHOLE leg — a delayed launch window included. An over-cap waiting plan loses to a faster family instead of stranding the ship; the stuck reason reports the elapsed days when nothing fits.
* Ignore life support shown ticked + locked (supplies aren't modelled yet) so the UI reflects real capability.

## v2.0.239-beta - 5th Jul 2026

* Autopilot guide expanded: per-action "what's considered / how it's chosen / when it's reconsidered" decision procedure (incl. exactly how escorts track their charge) + how a leg becomes a flight plan (the four solver families and what Drive picks).
* Coast perf: an unbound ship already heading outward no longer encounter-checks planet bands it can never come back down to.

## v2.0.238-beta - 5th Jul 2026

* Fixed thrifty autopilot ships mis-scheduling after a delayed-launch (wait-for-alignment) leg: the wait window wasn't counted toward arrival, so following legs stacked on top of it.
* Escort standoff distance is now honoured: the escort parks at its charge's orbital radius + the km standoff (0 = formation).
* New user guide: docs/autopilot-guide.md — how routes, searching (mine/explore choose their own sources), traversals, sliders, fuel/cargo and the map colours all work.

## v2.0.237-beta - 5th Jul 2026

* Fixed the orrery dying (blank canvas + garbage tiles, `createRadialGradient non-finite` spam) after abandoning a ship mid-torch and letting it drift for years: the universal-Kepler solve overflowed on fast hyperbolic escapes over long spans → NaN positions poisoned the draw loop. Proper hyperbolic starter + overflow cap + a never-NaN fallback; energy still conserved.

## v2.0.236-beta - 5th Jul 2026

* Transfer-logic audit fixes: one shared rocket equation everywhere (de-duped copy removed), autopilot burn profile surfaced, hyperbolic-element guard on the orbit propagator, forecast-line dead code pruned.
* **Adrift ships get flung by planets again** — patched-conic coast: exact star conic between encounters, exact planet conic through each Hill sphere (deterministic, scrub-safe), capture when abandoned deep inside one. The red forecast line shows the bend too.
* Autopilot burn profile now follows the Drive slider (20/60/20 thrifty coast → 50/50 continuous burn), stepping down to a longer coast when fuel is short rather than stranding.
* Committed route lines drawn in burn colours (green accel / yellow coast / red brake), active leg bright, next leg faded; uncontrolled (adrift) coast is now orange.
* New **Hill spheres** View option — light-yellow bubbles showing each planet's gravitational grab radius (GM view + projector), exactly the boundary the coast physics uses.
* Autopilot Avoid list and explore "don't revisit" are now enforced by the planner (were capture-only).

## v2.0.235-beta - 25th Jun 2026

* Each journey in the Ship's Log now says what *kind* of trip it is next to the autopilot badge — mine / load / unload / patrol / explore / escort — instead of just "autopilot", so you can read a route at a glance.

## v2.0.234-beta - 25th Jun 2026

* Ship's Log re-ordered to read like an itinerary, per your spec. DEFAULT now shows the current/active journey at the TOP, then each upcoming planned trip downward in the order it happens (events tucked under their journey) — then a short "Recent history" section of just the **last 2 completed** journeys, then a **Show full history** button. Full history shows every trip, most-recent at the top (reverse-chronological). (Was: everything newest-first with no history limit or section.)

## v2.0.233-beta - 25th Jun 2026

* Fixed a parked ship jittering against its host at deep zoom (e.g. The Cant in low orbit around Ganymede at 1 h/s). Its position was stored as an absolute vector the reconcile only refreshes every ~150 ms, computed relative to the host's position at that tick — but the host is redrawn every frame, so the ship lagged the host by its orbital motion over those 150 ms (invisible at system scale, large at moon-surface zoom: the ship and planet effectively on different clocks). The orrery now resolves a construct's position per-frame at the render clock (transit, coast, AND post-arrival parking orbit — the last computed relative to the host body at the same instant), so ship and host stay locked in the same frame. (Regression from the autopilot reconcile storing parked positions; V1 orbit-propagated parked ships per-frame.)

## v2.0.232-beta - 25th Jun 2026

* The Ship's Log is now one **reverse-chronological timeline** instead of a journeys list with a separate flight-log section at the bottom. Journeys and the work events that happened on them (load/mine/unload/refuel) are interleaved by time, newest first, so scrubbing reads naturally and a journey's events sit right with it. Fuel % and Cargo show in a bar at the top. By default it shows the recent window (the retained journeys + their events); a **Show full history** button reveals every logged event back to the start (the flight log is kept forever even after old journey paths are trimmed).

## v2.0.231-beta - 25th Jun 2026

* Abandoned/adrift ships now coast on a deterministic Keplerian conic instead of a step-integrated drift. The old integration was sampling-dependent (scrubbing changed the step count, so the same ship reached 400 vs 1500 km/s) and injected energy through perihelion (the unphysical slingshot out of the system). The new universal-variable two-body propagator is exact and energy-conserving for ellipse / parabola / hyperbola alike, so a cut-loose ship follows one stable, repeatable path — and the forecast ("future direction") line is now a single steady curve that no longer jitters as the clock advances. Coast motion is also derived per-frame now, so it's as smooth as orbital motion.

## v2.0.230-beta - 25th Jun 2026

* Fixed jerky playback at speed. A construct in transit was drawn from a stored position the reconcile only refreshes every ~150 ms, so at e.g. 7 d/s a ship stepped ~a day per refresh (and a just-arrived ship flickered to its old spot before snapping back) — far more visible now that ships are constantly under autopilot transit. The orrery now derives a transiting ship's position from its (precomputed, deterministic) journey path at the render clock every frame, so transit motion is as smooth as orbital motion. (Coasting/adrift ships still use the stored coast vector for now.)

## v2.0.229-beta - 25th Jun 2026

* Haul amount now defaults to **"fill the hold"** (blank), not a baked free-space number — so a ship that delivers its existing cargo first then fills to *full* capacity, instead of reserving room for cargo it no longer carries. Type a number for a deliberate partial load. (Clear the fill field on existing routes to get the new behaviour.)
* The orrery no longer draws a ship's whole committed route — just its **current and next** leg, so the map stays readable when ships have many legs queued.

## v2.0.228-beta - 25th Jun 2026

* Flight-log entries are now **live, not baked**. A mine/load/unload/refuel that takes time renders against the display clock: a *planned* one reads "Mining 999 kt water ice at Ganymede (planned)"; one *underway* shows progress "Mining 0.4 / 1.0 kt … — 45%" (highlighted, and its timestamp flips to the completion time — your ETA); and a *finished* one reads "Mined 999 kt …". Scrub through a long mining run and watch it fill. Instant events read the same throughout.

## v2.0.227-beta - 24th Jun 2026

* **Escort** now flies (first cut). An escort leg rendezvous with the target construct at its current location and holds there; because the sim is deterministic from the clock, the target's position is always known, and the clock top-up re-resolves it so the escort follows its charge host-to-host as it moves. Matching velocity = formation. Escort legs are kept out of best-order/any reordering (a moving target is never a fixed waypoint). (km-precise standoff is a later refinement; this holds at the target's host.)

## v2.0.226-beta - 24th Jun 2026

* A hauler that starts a route already carrying cargo now **delivers it first**. If the route opens on a mine/load but has a drop-off, an unload of the existing cargo is prepended at that drop-off — so a ship that comes on shift full clears its hold before gathering more, rather than carting the old load around the circuit.

## v2.0.225-beta - 24th Jun 2026

* Autopilot now respects a ship's **readiness** (its worst Status blocker). A wreck, impounded, dormant or otherwise non-operational ship (readiness 0) can't be engaged — it says so plainly ("not operational — its status prevents movement") instead of silently failing. A damaged or under-construction ship (readiness 0.5) limps along at **reduced thrust** (max accel scaled by readiness), so its transfers are slower and thirstier — exactly what a half-crippled hull should manage.

## v2.0.224-beta - 24th Jun 2026

* **Totals & averages** in the Ship's Log — a collapsible panel that aggregates the flight log up to where you're looking: cargo delivered (overall + per resource), the headline **tonnes/annum** efficiency, total gathered, refuels, stops worked, and the span it's measured over. Purely derived (no stored state), so it climbs as you play and reads correctly at any scrubbed moment.

## v2.0.223-beta - 24th Jun 2026

* **Fuel over time** — the Ship's Log now shows a live "Fuel: X%" (red when ≤15%) that drains as the ship burns and climbs as it refuels, derived for free like cargo. It uses the real per-segment burn fuel, so a torch ship's tanks fall smoothly while a burn-coast-burn spends ~half on the injection burn, coasts flat, then ~half on capture — no hard-coded split needed. Refuels restore toward full (instant at a port, ramped across a frontier harvest). Especially handy for abandoned ships: the fuel they're stranded with is just the curve read at the moment they were cut loose.

## v2.0.222-beta - 24th Jun 2026

* Refuelling now distinguishes a port from the frontier. A port/depot tops the tanks up **instantly**, but harvesting fuel out in the black (gas-skimming, mining fuel-grade ice) fills at a **rate over the harvest dwell** — the refuel breadcrumb reads "Refuelled (ice) at Enceladus over 18 days" vs an instant "Refuelled at Ceres Station". This is the same continuous-over-time treatment cargo got, and the groundwork for the fuel-level curve.

## v2.0.221-beta - 24th Jun 2026

* Autopilot cargo is now a real, continuous quantity over time:
  * **Ramps instead of stepping** — cargo fills gradually across the mining/loading dwell and empties across the unload, so the "Cargo aboard" read-out climbs and falls smoothly as you scrub/play (it's derived, so it costs nothing between events).
  * **Capacity-aware** — a load or mine never overfills the hold, and an unload never delivers more than is aboard. The logged tonnage is the *actual* amount moved.
  * **A full ship mines nothing** — start the route already loaded and the mine moves 0 t, with **no idle time wasted at the source** (the dwell is sized to what's actually loaded ÷ rate × richness) — it just carries on to deliver. Starting cargo comes from the ship's current cargo.

## v2.0.220-beta - 24th Jun 2026

* Fixed two time-datum bugs (see docs/time-architecture.md):
  * **Routes & journeys panel showed dates ~13.8 billion years off** (e.g. "-13787286102 AD · 5035701601582d ago"). The in-system journey rows fed unix-seconds into the date formatter, which expects master/since-Big-Bang seconds (the interstellar unit). Now converted with `unixMsToMasterSeconds`, like the Ship's Log already does.
  * **Clear Future Plans / Cancel Active always showed (0)** so you could never delete a ship's planned journeys. `getActualTimeMs()` returned master-milliseconds instead of unix-ms (it skipped the Big-Bang→unix offset), so actual time read as ~13.8 billion years in the future and every journey counted as "already past". Fixed to unix-ms — which also corrects the autopilot past-trim cutoff and the arrival reconcile, both of which use it.

## v2.0.219-beta - 24th Jun 2026

* Autopilot can no longer silently sit there "flying its route" while going nowhere. On Engage, if the planner produces no journeys for *any* reason — including the cases that previously slipped through silently (generation returned null because of missing engine/fuel data or ship specs, or the planner threw) — the Engage banner now always turns red with a reason. Engaging now either flies, or tells you why it can't.

## v2.0.218-beta - 24th Jun 2026

* Autopilot replanning now fires once per leg-completion, not every frame. The top-up only re-solves when a ship's committed lookahead has *freshly* dropped below Planning (a leg was just consumed) — and a ship that can't be topped up (e.g. stuck on fuel) records that level and stops re-solving the same shortfall every frame. Between leg-completions nothing changes, so there's zero solving. A manual edit (refuel / route change) clears the mark so the ship gets a fresh attempt. (This was the real cause of the solver churn during playback.)

## v2.0.217-beta - 24th Jun 2026

* Killed the transit-solver console spam. The planner logged a `[TransitPlanner] Debug:` line on every single solve — and the autopilot lookahead fires hundreds of (cheap) solves per route generation, so playing time flooded the console with thousands of lines and dragged playback (console logging is slow). All per-solve traces are now behind a `DEBUG_TRANSIT` flag, off by default. No behaviour change; the genuine "corrupted orbit" warning is kept.

## v2.0.216-beta - 24th Jun 2026

* When autopilot can't plot a course, the Autopilot tab now says **why** instead of just silently sitting there. The Engage banner turns red ("Autopilot stuck") and shows the reason — "not enough fuel to reach Enceladus", "no resolvable stops — check the resource or place exists and is reachable", "no host to depart from", etc. Cleared automatically once it plots successfully. (No more needing the browser console to find out why a ship won't move.)

## v2.0.215-beta - 23rd Jun 2026

* The flight-log **history is now kept forever** (it's tiny) — only the heavy journey/path data is bounded. A repeat ship retains just its last 2 flown legs of committed journeys (plus active + future), so the orrery and journey list stay clean, while the Ship's Log flight-log keeps the full breadcrumb history.
* **Planning now means what it says.** The slider commits exactly N legs ahead of the display clock (was: at least one full circuit, then padded to ~120 days). The top-up keeps N legs committed ahead as the clock advances — so "look 4 ahead" plans 4 legs, not 7. Run-once routes still commit their whole length.

## v2.0.214-beta - 23rd Jun 2026

* Autopilot routes no longer accumulate forever. A repeat ship tops up its committed route as the clock advances, but never trimmed the flown past — so after a long run the ship's log grew to dozens of legs and the orrery filled with a spider-web of stale paths (especially obvious after scrubbing back to the start). Now the flown past of a repeat route is trimmed: completed autopilot legs that ended more than ~30 days behind actual time are dropped, along with their flight-log events. The active and future legs are untouched (the advance-planning never needs recalculating), manual journeys and adrift ships are never auto-trimmed, and it's keyed to actual time so scrubbing the display never deletes anything. The dropped past is deterministically regenerable.

## v2.0.213-beta - 23rd Jun 2026

* Routes & journeys: autopilot-flown journeys no longer clutter the "In-system journeys" list — that's now just manual/player routes. Each ship's autopilot legs live under the "Under autopilot" heading instead, tucked into a collapsible "N planned legs" section per ship (a long committed route stays out of the way until you expand it). Each leg is still clickable to jump to the ship.

## v2.0.212-beta - 23rd Jun 2026

* The **"Any · as needed"** route mode now flies. Instead of visiting every stop in some order, the ship greedily heads to whichever single stop is best right now (nearest/cheapest per the Drive setting), works it, then re-picks from its new position — with a freshness bias so a just-serviced stop is unlikely to win twice running and the others still get covered over time. It costs candidates with the same quote-backed solver the legs are committed with, and respects the max-time-per-leg cap. (Place-targeted routes for now, like best-order.)

## v2.0.211-beta - 23rd Jun 2026

* Mining dwell now reflects how rich the deposit is: time at a source = tonnes ÷ (the ship's fill rate × the source's abundance), so a fat 0.9-richness ice moon fills far faster than a lean 0.3 one. The chosen source's richness rides on the stop, and the dwell is finalised once the haul amount is known.
* **Tardiness** finally does something. The Discipline slider (or the inherited Owner-CoI value — military punctual … owner-operator sloppy) adds slack to the time a ship sits *stopped* (loading, mining, loitering) — never to transit, and never to a flyby (it doesn't stop, so it can't be late). The slack is deterministic (seeded from the ship's id + the stop time), so a given timeline replays identically every scrub. "Bob's trading run" now genuinely runs late.

## v2.0.210-beta - 23rd Jun 2026

* Autopilot ships now keep a **flight log**. As the planner commits a route it records the work that happens at the stops — loaded/unloaded/mined tonnages, refuelling, station-keeping — as timestamped breadcrumbs (e.g. "Loaded 120 t water-ice at Enceladus"), shown in the Ship's Log beneath the journeys with a click-to-jump clock on each. Cargo aboard is now shown live and is *derived* from that log (running sum of loads/mines minus unloads at the display time), so it scrubs with the clock and a route regen can't desync it. The log is pruned in step when future plans are cleared or a journey is cancelled. (Foundation for the Totals tab + cargo-precedence reordering.)

## v2.0.209-beta - 23rd Jun 2026

* Autopilot lookahead now has a `quote` tier in the transfer solver — the lightest cost estimate, for the reorder/planning search that runs many times per decision. It produces only the two families the search ranks fast-vs-thrifty on (Hohmann-family "Efficient Now" and torch "Direct Burn") and skips the expensive Most-Efficient delayed-launch-window sweep (~100 Lambert solves), the gravity-assist candidate search, and the display path. Result: ~140x faster per leg (~0.14 ms vs ~19.5 ms). Both quoted families are the *same* real solver outputs the full call commits with — a test pins the quoted torch leg's time/Δv to the full Direct Burn and checks the quoted efficiency leg is never cheaper than the real window-search optimum — so a quoted ordering can never disagree with the leg it actually flies. (Hohmann transfers were and remain a first-class option; this just makes costing them in bulk affordable.)

## v2.0.208-beta - 23rd Jun 2026

* Autopilot reorder is now cheap to run. The transfer solver gained a `costOnly` mode that computes a leg's time and Δv (the only things the reorder search needs) while skipping the dense display trajectory — direct/torch legs drop from hundreds of path points to ~24, gravity-assist legs from ~1900 to ~80. The committed legs still fly the full trajectory; a test pins the costOnly time/Δv to the full-plan values so the search can never disagree with what it commits.

## v2.0.207-beta - 19th Jun 2026

* Autopilot "All · best order" now actually reorders the route. The planner looks a few stops ahead (how many is set by the Planning slider) and picks the visiting order with the lowest total cost — time when Drive is fast, fuel when it's thrifty — honouring the max-time-per-leg cap. Crucially, it costs candidate orders with the *same* transfer solver that flies the legs (cached), so the order it chooses and the journeys it commits can never disagree. "Closest now vs later" falls out naturally as bodies move. (Place-targeted routes for now; resource/escort legs stay in listed order.)

## v2.0.206-beta - 19th Jun 2026

* Build fix: the black-hole accretion code (v2.0.204) used legacy `$:`/`let` reactivity inside a runes-mode component, which the dev server tolerated but the production build rejected — so v2.0.204 onward weren't deploying. Converted to `$derived`/`$state`. No behaviour change; the slider works as before.

## v2.0.205-beta - 19th Jun 2026

* Autopilot ships now keep flying as you scrub or play. A looping route extends itself ahead of the display clock (the view you're actually watching), so it never runs out of plan mid-circuit — and it only ever adds future legs, so rewinding is safe. A "run once" route shows "route complete · standing by" (green) once the display clock reaches its end, and the ship actually disengages for good once master/actual time catches up — using actual time purely as the backstop, the way you described it.

## v2.0.204-beta - 19th Jun 2026

* Black holes get a "material infall" accretion slider instead of a feeding on/off switch — and everything else is now derived from it by physics. Slide from a bare quiescent horizon (dark, ~0 K, no field) up to the Eddington limit, and the disc's luminosity, inner-edge temperature (Stefan–Boltzmann from the accretion rate), magnetic field, and radiation all follow, with the output hard-capped at Eddington. This fixes two bugs: a quiescent black hole no longer shows a bogus 1,000,000 K surface temperature (it's correctly dark/cold), and a feeding black hole now shines realistically (~10²–10⁵ L☉ for a stellar-mass accretor) instead of near-zero.

## v2.0.203-beta - 19th Jun 2026

* Autopilot Mine and Explore legs now fly. Instead of a fixed place, the ship finds the best body for the job — scoring sources by richness, closeness, and whether it can also refuel there (so a moon that yields ore and fuel wins over one that's just ore). Only natural bodies are ever mined (never another ship), and mining heads on to its deliver-to drop-off. So a "mine water-ice → deliver to Ceres" plan now actually picks a Saturn moon and hauls.

## v2.0.202-beta - 18th Jun 2026

* Autopilot status is now real, not just "needs setup". A ship under autopilot shows a live read-out on its panel — transiting, holding between legs, coasting, or stuck — and a ship that's engaged but couldn't plan a route (can't reach or fuel its next stop) now correctly flags red and sorts to the top of Routes, lighting the rail's notification dot. So the fleet view reflects what's actually happening.

## v2.0.201-beta - 18th Jun 2026

* Unified the autopilot symbol — the gently pulsing ship icon now comes from one shared component, so it's identical everywhere it appears: the Engage button, the locked "Under autopilot" button, the ship's-log badge, and the Routes "Under autopilot" heading.

## v2.0.200-beta - 18th Jun 2026

* The "Under autopilot" button on a ship is now clickable and opens the disengage dialog — so you can hand control back from the ship's panel, not just the Autopilot tab.
* Engage is disabled until the route has at least one stop; tapping it empty highlights the "+ add stop" button and says so, rather than engaging an empty plan. Dropped the now-redundant "build the route below" caption.
* Autopilot is represented everywhere by a gently pulsing ship icon (the little "Asteroids" ship) instead of a cog — on the Engage button, the locked button, and the ship's-log badge.

## v2.0.199-beta - 18th Jun 2026

* Turning autopilot off now asks how to stop, instead of just cutting it. A dialog offers, on the usual risk scale: End after this leg (green — finish the current hop and dock), Abandon · drift (orange — cut now, coast on momentum), Abandon · stop (red — cut now, kill velocity), and Cancel (keep flying). Drift/stop only appear when the ship's actually under way. Colours are accents on a dark dialog — clear, not alarming.

## v2.0.198-beta - 18th Jun 2026

* Autopilot visibility pass: the locked "Under autopilot" button on a ship now shows as a black-and-yellow hazard stripe (white text) so it's obvious at a glance the ship is flying itself. In Routes, ships that need attention sort to the top of "Under autopilot" (red = stuck, orange = needs setup, green = finished), so you can scan the whole fleet fast. And the Routes button on the side rail gains a coloured notification dot showing the worst current state across the fleet.

## v2.0.197-beta - 18th Jun 2026

* Autopilot-planned journeys are now badged "⚙ autopilot" in the ship's log, so you can tell self-flown legs from hand-planned ones at a glance. (Existing autopilot journeys gain the badge once regenerated — toggle Engage off/on.)

## v2.0.196-beta - 18th Jun 2026

* The autopilot Engage control is now a proper toggle instead of a tiny corner tickbox — a full-width button with a navigation icon, a clear "Engage autopilot" / "Autopilot engaged" label, and an ON/OFF pill, lighting up in the accent colour (with a gentle pulse) when engaged. Much harder to miss, and obvious whether a ship is flying itself.

## v2.0.195-beta - 18th Jun 2026

* Fixed: engaging autopilot did nothing — the construct editor's updates run through a different handler than the one that generated the journey chain, so the trigger never fired. Engaging an in-order patrol/transport ship now actually plans and flies its route. (If a ship was already engaged before this fix, toggle Engage off and on to kick it.)

## v2.0.194-beta - 18th Jun 2026

* Autopilot ships now actually fly (first cut). Engage a construct whose plan visits places in order — Patrol (loiter) and Transport (load → deliver) — and it generates the journey chain from where it is now and follows it, looping or running once. It honours Drive (fast vs thrifty), the Max-accel cap and Max-time-per-leg, and uses the harvest/depot fuel rules (a ship that can refuel where it loads will). Still to come: resource-seeking legs (Mine/Explore), live status read-out + auto-disengage, and rolling the route forward as the clock advances — right now it commits a full circuit when you engage.

## v2.0.193-beta - 18th Jun 2026

* A ship's info panel now shows "Refuels from" under Fuel Mass — the resources and refuelling contexts its fuels can be sourced from (e.g. Water ice · Gas-giant refuelling). It makes the connection obvious: a body carrying any of these is a valid top-up, and it's exactly what the autopilot's harvest-refuel will key on, so you can tell at a glance where a ship can self-fuel.

## v2.0.192-beta - 18th Jun 2026

* Groundwork (no visible change yet): the autopilot planner can now score which source to send a ship to — richer + closer wins, with a nudge toward a body that *also* refuels the ship for free (so when mining and refuelling could be the same stop, the ship prefers it and skips a detour). The nudge is small normally and much stronger when the ship is actually low on fuel. Pure + unit-tested.

## v2.0.191-beta - 18th Jun 2026

* Groundwork (no visible change yet): the autopilot planner's deterministic core — it walks a captured plan's legs in order, chains the journeys with dwell, loops or runs once, commits as far ahead as the Planning slider says, and flags a ship "stuck" if it can't reach or fuel the next hop (refuelling for free where it harvests a compatible resource). Pure + unit-tested; the wiring to actually fly ships comes next.

## v2.0.190-beta - 18th Jun 2026

* The Newton panel's classification now lets you click any candidate type to see *its* reasoning, not just the winner's. Each band shows the body's value against the type's range with a colour-coded fit bar (green = solid, amber = marginal, red = barely inside), so you can see exactly how the winning score was earned — and why a runner-up fell short. Clicking a candidate inspects it; an explicit "Pin … as the type" button commits your choice.

## v2.0.189-beta - 18th Jun 2026

* Interior makeup presets are now labelled "Composition presets" and filtered to the body's mass, so you're only offered mixes that make sense — no "Gas giant" on a moonlet or "Iron-rich" at Jupiter mass. Each preset also has a hover hint, and "Iron" is clearer as "Iron-rich".

## v2.0.188-beta - 18th Jun 2026

* Classification is now transparent and overridable. The Newton ("apple") panel gains a Classification section showing the ranked candidate types with their scores, which one won, and the bands that decided it. When two types score within 10% of each other the call is flagged borderline — the apple icon turns orange with a "!" so you spot it without opening — and you can click any candidate to pin it (e.g. force Earth to "earth-like" instead of "swamp"). A pinned type sticks (the engine won't override it) and the panel still shows what the physics would have called it, with a one-click way to hand it back to auto.

## v2.0.187-beta - 18th Jun 2026

* You can now edit a planet or moon by radius, not just mass. A "Size from: Mass | Radius" toggle on the body's Basics tab picks which you pin — the other is derived through the interior makeup (with gravitational compression). So you can set a mass and watch the radius follow, or set the radius you want and let the mass follow, fine-tuning either with the composition sliders. Gas giants stay mass-driven (their radius is fixed by mass and degeneracy, so radius can't sensibly drive mass); stars and belts/rings are unaffected.

## v2.0.186-beta - 18th Jun 2026

* New System wizard: after clicking the HR diagram you can now hand-type each star's Temperature, Luminosity and Mass to dial in a specific star. Figures that don't make physical sense turn red, and a Fix button recomputes the rest (and the star type) to be consistent — trusting the temperature/luminosity you set, or solving a main-sequence star for the mass if that's all you changed. A genuinely impossible star is just labelled "Exotic" rather than blocked — if you want it, you can have it.

## v2.0.185-beta - 18th Jun 2026

* The AI description writer now understands ships properly. Constructs were silently sending the LLM none of their details (a placeholder key mismatch) — now they pass real hull specs (dimensions, mass, crew, cargo, engines) plus all their tags (owner, purpose, hull class, drive, resources…), and no longer feed the retired free-text "class". Bodies already passed their tags; hull-class tags now flow through too. So generated ship descriptions can actually draw on what the ship is and does.

## v2.0.184-beta - 18th Jun 2026

* Scrubbed the retired construct "Class" from the printed report and the players' Field Guide, and made both show a ship's tags instead. The report's ship entries now list their tags (owner, purpose, hull class, resources…) the way body entries already do, and the Field Guide no longer prints the old "Expanse/Ship/Transport" line. Bodies keep their scientific classification (planet/ocean, spectral type) — that's not the retired field.

## v2.0.183-beta - 18th Jun 2026

* Removed the leftover read-only "Class" line (e.g. "Expanse/Ship/Transport") from the ship spec block — the editor box for it went a couple of versions ago, and a ship's class is described by its tags now.

## v2.0.182-beta - 18th Jun 2026

* Fixed the construct/body detail panel always showing a stray horizontal scrollbar and feeling a touch too narrow. The panel scrolled vertically, which quietly enabled horizontal scrolling too, so anything a few pixels wide (the scrollbar itself, a full-width input) tripped it. Horizontal overflow is now clipped, the same fix the left rail already had.

## v2.0.181-beta - 18th Jun 2026

* Fixed "+ add stop" doing nothing (and throwing) on autopilot plans created before the recent rework — the tab now repairs an older/partial autopilot object on open instead of choking on its missing route list.
* Max accel is now a slider up to the ship's best (empty-tank) acceleration, with the readout turning amber above 2 g and red above 10 g — the standard comfort/hazard limits for a human crew. Slide it to the top for full thrust.

## v2.0.180-beta - 18th Jun 2026

* The ship stat block now shows the acceleration range — e.g. "2.10 g (2.1–15.0 g full→empty)" — right next to Max Vacuum Accel, so the fuelled-vs-empty difference is always visible, not just in the autopilot tab.
* Retired the old free-text "Class" box from the construct editor. A ship's class is described by its Hull-class tag (and the other capability tags) now, picked from the tag/pill selector — the legacy box is redundant.

## v2.0.179-beta - 18th Jun 2026

* The autopilot Max accel control now shows the ship's real acceleration range — e.g. "2.1 g fully fuelled to 15.0 g empty" — so it's obvious why a high-thrust hull crawls with full tanks (all that fuel mass). Makes setting a sensible cap, or matching a slow escort, much clearer.

## v2.0.178-beta - 18th Jun 2026

* Autopilot Behaviour gains a Max accel cap (in g, blank = full thrust). Hold the ship below its engines' limit for a comfortable, economical ride — or cap a lead ship's acceleration so slower escorts don't get left behind. The Drive slider still chooses speed-vs-fuel within whatever ceiling you set.

## v2.0.177-beta - 18th Jun 2026

* Autopilot gains a Repeat-forever / Run-once choice. Run-once flies the route a single time, then finishes — it'll flag the ship green and switch autopilot off (a courier drop, a one-way relocation, a final decommission run). The "Under autopilot" marker in Routes is now colour-coded: red = stuck, orange = needs your input, green = finished.
* New Escort action — shadow another ship at a standoff distance you set in km (sit in close formation, or trail outside its sensor range as a covert tail or stand-off support vessel). It's the first action that follows a moving target rather than a fixed place. Captured for now; the trajectory-matching flight is still being built.

## v2.0.176-beta - 18th Jun 2026

* Autopilot Flyby is no longer a separate action — it's simply a Patrol or Explore leg with the loiter time set to 0. The ship doesn't stop, keeps its speed, and races past, so a patrol can be a fast sweep when you don't want it sitting around. The wizard hints this under the loiter field and the Routes summary shows it as a flyby. (The clever momentum-carrying, slingshot-when-going-the-other-way flight is still being built.)
* Clarified what Discipline does: it adds random slack to time the ship spends stopped (loading, loitering, docking), scaled by the slider — it doesn't touch transit time, and has no effect on a non-stop flyby.

## v2.0.175-beta - 18th Jun 2026

* Autopilot Explore now shows a "don't revisit logged places" switch (on by default), so you can let an explorer sweep the same rich sources again instead of always pushing into new territory.

## v2.0.174-beta - 18th Jun 2026

* Autopilot gains a fifth action, Flyby — race past a location without stopping, keeping speed for the fastest, most efficient run. For now it's captured in the wizard (pick a place to fly past) and shown in the Routes summary; the clever part — flying that keeps momentum leg-to-leg and slingshots when the next stop is the other way, rather than coming to a stop each time — is noted as still being built and banked for later.

## v2.0.173-beta - 18th Jun 2026

* Autopilot Explore gains a survey/loiter time and an optional resource target — it heads to new sources (skipping places already in its log) and dwells to scan/survey, the mirror of Patrol. The four actions now line up as two behaviour pairs: Mine/Transport gather and deliver (resource- vs place-driven), Patrol/Explore go-and-dwell (place- vs resource-driven). Under the hood that's modelled as one "don't revisit" flag (on for Explore for now, not yet shown) so the same machinery can later surface as a switch on any leg.

## v2.0.172-beta - 18th Jun 2026

* Autopilot wizard, big simplify + clarity pass. Actions cut to four distinct verbs: **Mine** (a resource only — go to the nearest source), **Transport** (a place AND cargo/people — pick up what from where, deliver onward), **Patrol** (loiter and sweep an area for a set number of days — absorbs the old Scan), and **Explore** (keep pushing outward, refuelling as able). Dock and Unload are gone — they're inferred from the deliver-to. Each stop is now a strongly-bordered "Leg" card with a Leg number and a drag handle so you can reorder the route, and there's a new **Avoid** section to list locations the ship won't visit or replenish at (e.g. politically unaligned). "Max journey time" is relabelled **Max time per leg** and now clearly means the whole leg — travel out, do the work, and return. The "+ add location" button is now "+ add stop".

## v2.0.171-beta - 18th Jun 2026

* Autopilot wizard tweaks: a resource location now takes several resources at once (go to the nearest source of any of them), the mine/load "fill" defaults to the ship's free cargo space, and Logistics is simplified — the auto-refuel/restock toggles (Planning already schedules those) are now "Ignore fuel" / "Ignore life support" switches for ships you don't want to model fuel or supplies on.

## v2.0.169-beta - 17th Jun 2026

* Fixed: a rescued ship lingered under Routes → "Stranded ships" even after a new journey had taken it home and parked it (e.g. the Rocinante safely in Uranus low orbit still showed "adrift, coasting · was bound Uranus"). The stranded list flagged any ship carrying a cancelled-drift journey without checking whether a later journey had since superseded it — the same supersession blind spot fixed earlier in the orrery position and drift-line. It now only lists a ship as stranded if no later journey has started since the drift began.

## v2.0.170-beta - 18th Jun 2026

* A ship under autopilot can't be flown by hand. While autopilot is engaged, the manual Plan Transit / Cancel controls are replaced by a greyed-out "Under autopilot" button — turn autopilot off (Autopilot tab) to take manual control back.

## v2.0.169-beta - 18th Jun 2026

* Autopilot — first cut (the wizard). A construct now has an Autopilot tab (after Tags) that builds a plan in three parts: Route (visit all in order / all best order / any as needed, with locations that are a specific place OR "the nearest source of resource X", a per-location action suggested from the ship's own capabilities — Mine/Scan/Load/Unload/Dock/Patrol — and a deliver-to for mined/loaded cargo, with the fill rate shown); Behaviour (Discipline, Planning, Drive and Max-journey-time sliders — Planning is the look-ahead that also schedules refuelling and waits for alignments when it pays off, Max-journey-time stops absurd zero-fuel crawls); and Logistics (auto-refuel with a fuel margin, auto-restock — uncheck to manage by hand). It's capture-only for now — it saves the plan and lists the ship under a new "Under autopilot" group in Routes (with a "!" when it needs attention); the planner that actually flies it is the next step.

## v2.0.168-beta - 17th Jun 2026

* A body's resource tag now tells you where it came from. Hovering it names the exact rule that seeded it and whether it was deterministic (always) or a chance roll — e.g. "Seeded by rule 'resource/oxidizer' — always seeded (deterministic). Edit it in Settings → Reasons to Visit." Makes the reasoning obvious and points you straight at the lever to change it.

## v2.0.167-beta - 17th Jun 2026

* Body resources are now **all PoI rules** — visible and tweakable in Edit Rule, nothing hidden in code. Reverted the separate atmosphere pass from v2.0.166: atmosphere resources (oxidizer from O₂, noble gases, helium-3 from gas giants, hydrocarbons from methane, volatiles from CO₂) are **deterministic rules** (chance 100% — the gas is measurably there, so the resource is). Added a "noble gas in air" rule condition. Ground/subsurface resources stay semi-random prospects, and every seeded tag records which rule produced it.
* Fixed water-ice: it was wrongly capped to frozen worlds (<250 K), so Earth's liquid oceans didn't count. Now **any liquid water or ice deterministically yields water-ice** — water always reads as a water-ice resource.
* Clarified that "auto-seeding optional" is simply a rule's existing **Chance slider + Enable checkbox** (100 % = deterministic, under 100 % = a random roll, disabled = manual-only) — not a new feature. Removed the now-superseded per-gas "Provides resources" editor.

## v2.0.166-beta - 17th Jun 2026

* Body resources reconciled into one model — no more double-adding. Atmosphere-derived resources (noble gases, oxidizer, helium-3, hydrocarbons, water from vapour, volatiles) are now seeded **deterministically** from the gas composition: if the gas is measurably there, the resource is certainly there, and the gas's % rides along as abundance (extraction time). Ground/subsurface resources (metals, fissiles, diamonds, organics…) stay **semi-random prospects** — you have to dig to find out. The old chance-rules that duplicated the atmosphere ones (O₂→oxidizer, giant→helium-3, CH₄-atmosphere→hydrocarbons) were removed, since the deterministic atmosphere pass now owns those. Every derived resource tag also records where it came from (which gas, or which rule), ready for a provenance mouseover.

## v2.0.165-beta - 17th Jun 2026

* The tag-inheritance data is now visible and editable in its editors (Settings → Technology), so it's not hidden in the JSON. Edit Fuel & Drives: each fuel has a "Can be refuelled where" tag editor (pick resource/* and frontier/* sources) plus an Availability setting (common / manufactured / exotic); each engine has a "Provides FTL drive" tag editor. Edit Atmospheres: each gas has a "Provides resources" tag editor (with a note that a body inherits these by composition, the gas % as abundance). Every option list is sourced from the data — the CoI Resources / FTL-drive categories and the PoI frontier rules — nothing hard-coded. New reusable `TagListEditor` (chips + add-dropdown).

## v2.0.164-beta - 17th Jun 2026

* Tag inheritance, body side (groundwork): atmosphere gases now declare which resource(s) they confer — O₂ → oxidizer, Argon/Krypton/Neon → noble gases, Helium → He-3, methane/ethane → hydrocarbons, water vapour → water ice, CO₂/ammonia/nitrogen → volatiles, iron vapour → heavy metals. A pure resolver reads a body's atmosphere and yields its resource tags, carrying each gas's fraction as the tag's abundance (so extraction time scales: trace gas slow, abundant gas fast). Not yet applied to bodies in the live pipeline — that's the next, baseline-checked step.

## v2.0.163-beta - 17th Jun 2026

* Tag inheritance, construct side: a ship's FTL drive is now read from its actual engines, not hand-set. A warp ship shows Warp because it carries an Alcubierre ring; torch/ion/NTR ships show no FTL (sublight). In the Create New Construct picker the inherited drive appears as a dashed "derived" chip, and the FTL Explorer's redundant hand-set Warp tag has been dropped (it comes from the engine now). New resolver functions (`constructDriveTag` / `constructRefuelTags` / `inheritedConstructTags`) also gather a construct's refuel sources from its fuel tanks — the groundwork the autopilot will use to find where each fuel can be replenished.

## v2.0.162-beta - 17th Jun 2026

* Resources, Hull class and FTL drive are now CORE construct categories — always on, can't be switched off, like Status / Owner / Purpose. (And the Resources reason-to-visit category is forced on for bodies too.)
* FTL drive cleaned up to genuine FTL methods only. Sublight is now the default (no selection means sublight), so the `sublight` tag is gone; torch and solar-sail are sublight engines (hard calc data), not FTL, so they're gone too; generation ship is a Hull class, not a drive. Jump Drive is the default FTL.
* Hull class gained Yacht, Racer and Generation ship.
* Added Noble gases + Antimatter resources so every fuel type has a source (antimatter is manual-only — never auto-generated, hand-added to a high-end port).
* Groundwork for tags-from-hardware: fuel definitions now declare where each fuel can be refuelled (a mix of `resource/` and `frontier/` tags) and an availability class (common / manufactured / exotic); engine definitions declare the FTL drive tag they confer (only the warp ring — everything else is sublight). Constructs will inherit drive + fuel-source tags from their actual engines/tanks next.

## v2.0.161-beta - 17th Jun 2026

* Killed the "Active" construct status — it was on everything by default and told you nothing. A construct is now assumed fully operational unless a status says otherwise. Each Status carries a readiness (0–1 drive capability): Derelict / Adrift / Distress / Mothballed / Impounded / Quarantined / Lost / Decommissioned / Refit / Dormant = 0 (can't move), Damaged and Under construction = 0.5 (half drive), and anything unimpaired = 1. A construct's overall readiness is its most-limiting status (lowest wins), exposed via `constructReadiness()` for the upcoming autopilot/drive work.

## v2.0.160-beta - 17th Jun 2026

* Create New Construct now filters exactly like Find by tag. Every enabled CoI category (Owner, Purpose, Resources, Hull class, FTL drive, Tech, Universe, Status) is a clickable bubble — open it to see its tags (with live counts) and click to add them to the filter; multiple tags match as "all of these". Search still spans names and tags together, so "Rocinante" finds the ship and "shipyard" finds the ports, and it composes with the tag filters.

## v2.0.159-beta - 17th Jun 2026

* Create New Construct is now a tag-filter picker instead of a folder tree. Search by name or capability (type "shipyard" and you get the four ports that build ships; "refuel" the refuelling stops), narrow by Universe (Expanse / Traveller / Aliens / …) and role (Ship / Station / …), and every construct shows its CoI tags inline — so a Class A starport reads as its bundle of capabilities at a glance. The old `Universe/Type/Subtype` class-path string (which only drove the folder tree, and was redundant once Universe, Hull class and capabilities became tags) has been dropped from every template.

## v2.0.158-beta - 17th Jun 2026

* Much richer construct vocabulary (CoIs). New Purpose tags fill gaps the first pass exposed — resupply (air/food, vs refuel), forward-base, shipyard, refining, agriculture, power-generation, customs, intelligence, beacon, government — plus a Traveller-style port-capability set (refined/unrefined fuel, shipyard jump-capable vs small-craft, drydock, brokerage, lodging, bonded warehouse, extraterritorial) so a "Class A starport" is now a bundle of capabilities rather than an opaque label. Added Owner: Government + Independent; Hull classes: dropship, pinnace, scout, battleship, colony-ship, platform; Resources: provisions, technology, alien-technology, exotic-matter, luxuries, pharmaceuticals (the finished/exotic tier is construct-only — a planet can't manufacture them); Status: distress, refit, dormant, captured.
* New Universe CoI category (Contemporary / Hard sci-fi / High sci-fi / Expanse / Aliens / Traveller / Mothership / Natural) — every starter template now carries its setting, so "show me every Expanse ship" is a tag filter.
* All starter templates re-tagged with the refined vocabulary: the Donnager is a battleship, the Nauvoo a colony-ship, Ganymede an agriculture/provisions source, Tycho a jump-capable shipyard, the Traveller starports proper capability bundles, and so on.

## v2.0.157-beta - 17th Jun 2026

* Constructs of Interest now cover resources. Added a "Resources" CoI category that deliberately shares the same `resource/` vocabulary as the physics-derived body resources (water ice, heavy metals, helium-3, …), so a body's natural deposit and a ship's cargo of the same thing read as one ledger — provenance stays clear because a construct's resource tag is hand-set, a body's is derived. Hull class, FTL drive and Tech & origin CoI categories are now on by default too.
* The starter construct templates ship pre-tagged with CoIs. Every template (asteroids → motherships → corvettes → starports) now carries a sensible Owner / Purpose / Hull class / FTL drive / Tech / Resources set, so a freshly placed Rocinante already reads as an owner-operated torch-drive corvette and an M-type asteroid already advertises its heavy metals.

## v2.0.156-beta - 17th Jun 2026

* Fixed the star editor snapping mass (and radius/temperature/radiation) back to its stored value as you typed — you couldn't enter or paste a precise figure like 0.9489222894122541 M☉. The sync that seeds those fields from the body was re-running on every render (the body re-resolves as the clock ticks) and overwriting your half-typed value. It now only pulls from the body when you actually switch to a different body; everything you edit in place sticks.

## v2.0.155-beta - 17th Jun 2026

* Fixed: the red coast/drift forecast line lingered after a stranded ship was given a new journey and established orbit — it stayed pinned to the now-parked ship, pointing at its destination. The "is it coasting?" check had the same blind spot the position resolver did: a cancelled drift counted forever once past its cancel time. It now only counts as coasting until the next journey begins, so the line clears the moment the ship is picked up.
* Ship's Log status is now live against the display clock. A journey badge reads PLANNED before it departs, IN TRANSIT mid-flight, then COMPLETED — and for an aborted trip, IN TRANSIT up to the cancel then ADRIFT · COASTING. Scrub the clock with the log open (e.g. rewind to before a transit) and the badge, the "coasting since" line, and the "originally planned route" note all update with it, instead of being frozen on the stored end-state.
* Ship's Log: a journey that set off from a drift now reads "Adrift around Sol (for N days) → Uranus" instead of just "Sol → Uranus", joining the abandoned drift and the rescue journey together at a glance.

## v2.0.154-beta - 17th Jun 2026

* Ship's Log time navigation: every logged time (Created, Window start/end, Depart, Arrive, "coasting since") now has a small clock icon beside it. Hover tells you it'll set the display time to that moment; click jumps the orrery's display clock straight there. The clock only appears on times at or after actual/master time — you can preview the present and future, but it won't offer to rewind display before the committed present (the cutoff you asked for).

## v2.0.153-beta - 17th Jun 2026

* Fixed: a stranded ship that's since been given a NEW journey stayed stuck on "Adrift — coasting" in the orrery even though its log showed the new trip. The kinematics resolver returned the moment it hit the old cancelled-drift journey (journeys are scanned oldest-first), so the later journey never got to take over — the ship's log read right but its drawn position/status didn't. The drift now only governs *until the next journey begins*; once a later journey has started it takes over, as it should. Existing saves heal themselves — just nudge the clock after updating and the ship snaps to its real state.

## v2.0.152-beta - 17th Jun 2026

* Left rail no longer shows a permanent horizontal scrollbar along its bottom. Setting `overflow-y: auto` on the rail quietly promoted `overflow-x` to auto as well, so a nav label a hair wider than the 200px cap left a scrollbar parked there at all times. The rail now clips horizontally and long labels ellipsis within it.

## v2.0.151-beta - 17th Jun 2026

* A drifting ship keeps its name and stays clickable. Free-floating constructs (in transit, deep space, or adrift/coasting) are positioned absolutely rather than by the orbital hierarchy, so the "what's visible at this focus level" set — which gates both the on-canvas label and click hit-testing — was skipping them, even though their glyph was always drawn. We never had unparented objects before drifting was a thing. They're now always nameable and selectable, matching how they're drawn.

## v2.0.150-beta - 17th Jun 2026

* Adrift forecast line now upgrades when you stop. While the clock is moving (playing or scrubbing) it stays the cheap moon-free integration; ~0.3s after the clock goes still it recomputes once as a moon-inclusive plot, so a close moon flyby in the forecast is honest when you're parked but never costs you while dragging. Fast estimate in motion, accurate path at rest. (`coastPathUnderGravity` gained an `includeMoons` flag; the live position stays moon-free for frame-to-frame consistency.)

## v2.0.149-beta - 17th Jun 2026

* The real performance fix for adrift ships. The slow part was never the throttle — it was the **maths per recompute**. Two things were grinding millions of operations on every redraw: (1) the gravity field included **every body in the system, moons and all** (~50 in Sol), and (2) the forecast line re-integrated each segment with ~40 sub-steps. Moons are negligible for a heliocentric coast (the star and the planet you're passing are what matter), so they're dropped from the field, and the faint forecast line now uses one integration step per point. Together that's ~50-100x less work per frame — adrift trajectories now refresh in well under half a second instead of ~6 seconds.
* Ship's Log, adrift entries: the planned-route block is now headed "Originally planned route (aborted)" so it's clear that section is the trip that was cancelled mid-flight, not where the ship is now. The "Ends:" line also names the destination — e.g. "In Low orbit of Uranus" / "Docked at Uranus" / "Fly-past of Uranus" — instead of just "In Low orbit".

## v2.0.148-beta - 17th Jun 2026

* Scrubbing/jogging the clock is much smoother. The orrery was re-deriving every coasting ship's position on every single jog frame; it now throttles that re-derive to ~150ms while you're moving the clock and does one exact pass the moment you settle — fast estimates while dragging, right when you let go.
* Routes panel: added a "Stranded ships" group at the bottom — constructs that are adrift/coasting (not under power, not orbiting), in-system or in interstellar space, with where they are and where they were bound. Click to jump to the ship.

## v2.0.147-beta - 17th Jun 2026

* Big performance fix for drifting ships. The orrery was re-integrating a coasting ship's whole trajectory from its cancel point every single frame — so the longer it had been adrift, the heavier each redraw (the jumpy clock and "orrery barely moves"). It now steps forward incrementally from the previous frame's state, so each frame is cheap and constant regardless of how long the ship's been coasting; the path also stops jittering (each frame extends the last instead of recomputing).
* The drift forecast line reaches a bit further ahead.
* The ship's log now reads "Adrift · coasting" for a cancelled-and-drifting journey, with when and where it was cut loose, rather than a bare "Cancelled".

## v2.0.146-beta - 17th Jun 2026

* Fixed a hard freeze (and a ship "teleporting") when a construct's journey/abort is timestamped far from the current clock — e.g. flights dated years before the active calendar's epoch. The orrery was re-integrating that ship's gravity coast over the whole gap every frame; it now bounds the integration (fixed step count, capped span) and ignores non-finite/out-of-epoch time gaps, so it resolves instantly instead of locking up.

## v2.0.145-beta - 17th Jun 2026

* Transit courses curve again. The planner solves a clean 2-body (Sun-only) transfer but was *drawing* the path re-integrated through the full n-body field; because the target was 2-body, the path drifted off it and a linear correction flattened the conic into a near-straight line. The displayed path now matches the model it solves (2-body), so transfers show their proper conic arcs. (Trade-off: the n-body-derived trajectory-correction tags are quiet until the proper n-body-aware solver lands.)

## v2.0.144-beta - 16th Jun 2026

* Transit fuel sanity: a ship with no usable main engine (zero Isp) no longer shows fabricated fuel figures (the old "Δv × 0.01" / "× 0.05" placeholders that produced things like 0.4 t and 6.5-billion-tonne flybys). Such plans are now correctly infeasible — fuel reads "—" and the planner says the engine can't make the move. No engine, no move.

## v2.0.143-beta - 16th Jun 2026

* Performance: the drifting-ship forecast path is now a solid faint line (a dashed line over a path spanning billions of metres made the canvas grind through countless dash segments), and its trajectory integration is cached per ship+clock so it no longer re-computes every frame while panning or idle.

## v2.0.142-beta - 16th Jun 2026

* A drifting/stopped in-system ship now draws a faint red dashed forecast of its path — the conic it's about to follow under gravity (a slow fall to the star, an ellipse, or a hyperbola escaping), ~40 steps ahead. Handy for sanity-checking its velocity vector.

## v2.0.141-beta - 16th Jun 2026

* Plan Transit from an adrift/stopped in-system ship now replots from where the ship actually is, carrying its current position and velocity — so the redirect-Δv cost of turning its momentum applies, matching the interstellar "Chart a new course". (Previously it replanned from the body, ignoring the drift.)

## v2.0.140-beta - 16th Jun 2026

* A ship stopped/adrift mid in-system flight no longer offers an invalid "Land on <origin>" (it isn't there). Instead it shows Plan Transit (green, plot a fresh course) and Resume journey (orange, re-fly the aborted plan). Landing/takeoff now only show when the ship is actually at a body. Plan Transit is green throughout.

## v2.0.139-beta - 16th Jun 2026

* In-system body/ship header now matches the interstellar ship panel: Edit is a toggle (click the pencil again to close — the "Done" button is gone), it highlights while active, and the sensors icon uses the same waves glyph.

## v2.0.138-beta - 16th Jun 2026

* Fixed: the in-system Cancel · drift/stop buttons now actually abort the journey at the point you're viewing (they were keyed to actual time, so on a previewed flight they did nothing). The ship strands where you see it.
* Ship's Log button restyled to yellow-on-black (captain's-log look) and added to the interstellar ship panel too, for consistency.

## v2.0.137-beta - 16th Jun 2026

* The ship sensors toggle now does something: turning it on draws that construct's sensor-range rings (and labels) around it in the orrery, from its defined sensors. Off by default; the global View → Sensors option still shows the focused ship's ranges too.

## v2.0.136-beta - 16th Jun 2026

* Ship's log: dropped the now-redundant "Leg" framing (each journey is a single hop) — entries lead with the route and add the arrival (differential) speed alongside the end state. Fixed the wildly-wrong arrival/departure year (journey times are unix-epoch; they're now converted to the calendar's master-time correctly).

## v2.0.135-beta - 16th Jun 2026

* The starmap ship panel now shows the full ship data block again (same read-only stat block as in-system), with only the transit controls swapped for the interstellar set. The visibility eye moved to the left and is joined by a sensors on/off toggle (run dark en-route); edit stays behind the pencil.
* Every ship now draws a faint line for its current/upcoming trip in the orrery, not just the one being planned.

## v2.0.134-beta - 16th Jun 2026

* Fixed: an arrived in-system ship no longer shows the Cancel · drift/stop controls (which did nothing) — they now appear only while the ship is actually under way; an arrived/orbiting/adrift ship shows Plan Transit again.
* Scheduling an in-system transit now rewinds Display Time back to the journey's start after the simulation, so no apparent time passes — the ship sits at departure with its faint transit line ahead (Actual time was never touched).

## v2.0.133-beta - 16th Jun 2026

* The construct stat block now reports its actual current state instead of always showing "Orbit / Orbital Period": In transit → destination, Adrift → coasting, Landed → surface of host, Docked → host, and only an orbiting ship shows the orbit profile + period (now labelled with the host). Driven by the ship's live kinematic state at the current clock.

## v2.0.132-beta - 16th Jun 2026

* The starmap ship panel no longer opens straight into the editor — it leads with status and controls; the editor is now behind a pencil icon. Added a player-visibility toggle (eye icon) so a GM can re-reveal a hidden interstellar ship, a fuel gauge at the top (current vs capacity, red when low) and a Refuel button.

## v2.0.131-beta - 16th Jun 2026

* The in-system ship's "Plan Transit" button is now contextual: when the ship is on a journey it's replaced by the Cancel · drift / Cancel · stop controls; when idle it shows Plan Transit. Ship's Log is always available.
* Fixed: a ship adrift in interstellar space no longer shows under its source system in the rail "Find construct…" / "Find body…" directories — it's listed under "Interstellar space" and selecting it opens its ship panel.

## v2.0.130-beta - 16th Jun 2026

* You can now abort an in-system journey straight from the selected ship — no need to dig into the ship's log. Two buttons appear when a ship has a live journey: Cancel · drift (green — coast on under gravity, the physical choice) and Cancel · stop (orange — halt, then fall toward the star). Both clear any future plans too.

## v2.0.129-beta - 16th Jun 2026

* (Transit refactor, stage 4) Retired in-system journey legs. The planner is now single-hop: plan a journey, Schedule it, and to add a stop just plan the next one — the planner re-opens from where the ship's last journey ends (its position + velocity), chaining hops on the timeline rather than bundling them as legs in one journey. Removed the "Add Next Leg"/"Cancel Previous Leg" builder and the draft-plan save.

## v2.0.128-beta - 16th Jun 2026

* (Transit refactor, stage 5) The ship's log now shows how each hop ends — Docked, In <orbit>, or Fly-past (carrying its leftover Δv) — the handoff state the next journey or autopilot picks up.

## v2.0.127-beta - 16th Jun 2026

* (Transit refactor, stage 2) Each in-system hop is now its own single journey on the timeline rather than a leg inside one multi-leg journey object. A multi-stop plan commits as several chained journeys; the ship flies the identical path (the scheduler already chains journeys in time and reconciles to the final arrival), but every hop is now independently log-able and autopilot-sequenceable. Groundwork for retiring the journey-legs machinery.

## v2.0.126-beta - 16th Jun 2026

* Starmap picker now shows Systems and Constructs as consecutive labelled sections (rather than click-to-drill), and the interstellar-ship group is renamed "Constructs".

## v2.0.125-beta - 16th Jun 2026

* Body picker now treats interstellar ships consistently with the orrery: a ship in transit or stranded no longer appears in its origin system's picker (it's left the system), and instead shows up in the starmap-level picker under its own "Interstellar" group — searchable by name, and selecting it opens its ship panel.

## v2.0.124-beta - 16th Jun 2026

* The in-system adrift coast is now full N-body: every massive body pulls on a cut-loose ship (the same perturber set the transit planner already uses), so it can be slung past a planet, not just fall round the sun. Belts and rings are excluded (distributed debris, not point masses), as are barycentres (their mass already lives on the child bodies).

## v2.0.123-beta - 16th Jun 2026

* In-system adrift ships now coast under the star's real gravity instead of drifting in a straight line: cut a ship loose mid-transit and it traces a slow conic section round the sun (a bound ellipse, or a hyperbola if it's above escape) — the same drift engine the interstellar slingshot uses, now in the orrery. (Groundwork toward unifying in-system travel onto the clock-derived model.)

## v2.0.122-beta - 16th Jun 2026

* In-transit / stranded ships (opened from the starmap) now show their tags as chips at the bottom of the panel, matching the in-system construct view and bodies.

## v2.0.121-beta - 16th Jun 2026

* The New Transit redirect now burns real propellant: the Δv to swing a coasting ship onto a new heading is charged as fuel mass (rocket equation) and drained from the tanks on departure, so the lighter ship carries into the next course's Δv. The planner shows how much propellant the turn-around costs. No affordability gate — refuelling stays the GM's manual call.

## v2.0.120-beta - 16th Jun 2026

* New Transit: replot a fresh interstellar course from where a ship currently is (e.g. once it's been refuelled), not from its origin system. The planner now takes the ship's live position and — crucially — its current velocity, charging an honest vector Δv to redirect that momentum: a destination along the current drift is nearly free, a reversal costs the whole speed. The cost (and how far off your drift the new heading is) is shown, and the journey is blocked if the ship hasn't the Δv to redirect.
* Ship-panel actions recoloured by physical honesty: green = the valid choice (Strand · drift; Chart a new course), orange = allowed-but-unphysical (Strand · stop), red = destructive / universe-breaking (Delete trip; resume from a dead stop), neutral = dismiss. Dropped the "jump to destination" option (it skewed the clock).

## v2.0.119-beta - 16th Jun 2026

* The construct tag-adder category dropdown now lists only enabled categories (disabled ones are hidden, not greyed).
* A construct's read-only detail view now shows its tags as chips at the bottom, matching how a body's detail pane does.

## v2.0.118-beta - 16th Jun 2026

* In the construct tag adder, the category dropdown now colours "Custom" and bolds the three core always-on categories (Status, Owner, Purpose) so they stand out from the optional ones.

## v2.0.117-beta - 16th Jun 2026

* The starmap measure tool now tracks a moving ship. Measure to a construct and its endpoint follows the ship as you advance time (re-derived from the clock, like the system view), so the distance stays live instead of freezing at the spot you clicked. Measuring between two stars is unchanged.

## v2.0.116-beta - 16th Jun 2026

* (Stage 3) Interstellar slingshot. A fly-by that can't stop now whips around the destination star instead of tearing straight off the map — an honest closed-form 2-body deflection from the incoming speed, the targeted body's distance from the star (the periapsis), and the star's mass. The drift track kinks at the star, shown from departure so you can see the slingshot coming. It's deliberately honest: a normal star barely bends a fast interstellar ship (so most fly-bys still look near-straight), but a slow craft — or a black hole — bends hard.

## v2.0.115-beta - 16th Jun 2026

* Unified the body (PoI) and construct (CoI) tag adders. Picking a category now shows that category's existing, not-yet-applied tags as click-to-add chips — so you can finally add a defined PoI tag to a body by hand, not only via the auto-rules. Type a custom one below as before. The construct Tags tab now lists only the tags actually on the ship (click to remove); you add from the category-first picker. Hand-added tags are always removable and never stripped by the auto-tagging pass.

## v2.0.114-beta - 16th Jun 2026

* The powered journey line is now deep yellow (the planner's yellow) instead of orange, so it reads clearly distinct from the red drift line — yellow = on course, red = drifting.

## v2.0.113-beta - 16th Jun 2026

* (Groundwork, Stage 3) Real-units in-system gravity for a drifting ship — feeds the drift integrator true G in AU, so a stationary ship falls toward its star and a fly-by slings around it (verified: a 1-AU circular orbit comes out at a ~1-year period). The orrery wiring that shows it follows.

## v2.0.112-beta - 16th Jun 2026

* (Groundwork, Stage 3) Added the deterministic drift integrator that will bend a coasting ship's path under gravity — the engine behind the upcoming fly-by slingshot and the in-system "stationary object falls toward the star". No visible change yet; the wiring follows.

## v2.0.111-beta - 16th Jun 2026

* A "Realistic" interstellar journey now actually burns its fuel: starting one drains the propellant the trip uses from the ship's tanks (the whole tank if it can't brake). So a tank-emptying overreach really does leave the ship coasting on empty.

## v2.0.110-beta - 16th Jun 2026

* The journey line now shows where a ship will end up adrift: the powered leg is orange, and the drift it can't avoid is red, projected on across the map — visible from the moment it sets off, so an under-fuelled trip reads as "orange to here, then red off into the dark".
* A construct's Tags tab gained an "Add a tag" form matching the body/PoI one (pick a category or Custom → name → live preview). Adding under a category persists it there, so it shows in the CoI editor and everywhere else.

## v2.0.109-beta - 16th Jun 2026

* You can now send a ship to the rescue: when planning an interstellar journey, the destination can be "An interstellar ship" — pick a stranded (or in-flight) vessel and the planner plots a course to it, reading the distance and feasibility just like a system trip. Arriving rendezvouses at the ship's location. (For a still-moving target you're aimed at where it is now; matching a moving ship is a later refinement.)

## v2.0.108-beta - 16th Jun 2026

* (Groundwork) Interstellar journeys can now target a point in space, not just a star system — the foundation for plotting a course to a stranded ship. Arriving at a point rendezvouses there. The destination picker for this follows next.

## v2.0.107-beta - 16th Jun 2026

* Moved the starmap measure tool onto the side rail (the same "Measure" slot as the in-system one), instead of a separate on-canvas button.

## v2.0.106-beta - 16th Jun 2026

* Measure tool on the scaled starmap: a 📏 toggle (top-right) lets you tap any two targets — stars or interstellar ships — to read the straight-line distance between them in the map's units. Tap a third to start a new measurement.

## v2.0.105-beta - 16th Jun 2026

* The three core Construct-of-Interest categories (Status, Owner, Purpose) are now properly locked: their name and their "one only" setting can't be changed (Owner stays single-choice, Status/Purpose stay multi), since autopilot relies on them. You can still add your own categories and add tags within these.
* Every construct now carries an "Active" status by default (legacy ships included), and "In transit" is split into "In transit (interstellar)" and "In transit (in-system)", both set automatically from what the ship is actually doing.
* CoI editor tags are more compact (uniform small pills).

## v2.0.104-beta - 16th Jun 2026

* Fixed: sending a ship home / cancelling an interstellar journey now actually removes it — it no longer lingers in Routes still ticking along. If the vessel has later journeys that depended on it, you're warned (with the list) and they're removed too, since the chain can't skip a leg.
* Fixed: an interstellar ship now correctly disappears from its origin system's orrery while in transit. (The hide was being evaluated in the wrong time epoch, so it never triggered.) It's display-time driven, so scrubbing back before departure brings it back.

## v2.0.103-beta - 16th Jun 2026

* A coasting fly-by (a ship that couldn't brake) now projects its dashed heading line right across the map, so you can see it tearing off and out of the edge rather than just a short stub.

## v2.0.102-beta - 16th Jun 2026

* A "Realistic" interstellar plan that reaches the destination but can't brake now plays out properly: starting it ("Start (fly-by — won't stop)") sends the ship to the destination and then coasts it on *past*, adrift with its velocity — instead of magically stopping. Forcing "At destination" on its ship panel still lets you park it there if you want.

## v2.0.101-beta - 16th Jun 2026

* Fixed: deleting one half of a binary now properly dissolves the pair — the surviving planet returns to its original orbit around the star (it used to keep orbiting the leftover, now one-body, barycentre). Same for a binary star: delete one and the survivor becomes the system centre, any circumbinary planets re-home onto it, and the changed central mass re-balances their orbital periods on the next recalculation.
* Aborting an interstellar journey now lets you choose: "Strand · drift" (keeps momentum and coasts on) or "Strand · stop" (stops dead in space).
* The Status tags the app needs — Active, plus the auto "In transit" / "Adrift" — can no longer be deleted in the CoI editor; you can still add as many of your own as you like.

## v2.0.100-beta - 16th Jun 2026

* Constructs of Interest now has three core categories — Status (now at the top), Owner and Purpose — that are always on and can't be removed (autopilot relies on them). You can still freely edit the tags inside them; only Status's "Active" is fixed.
* Status is now multi-select (a ship can be Damaged and still Active) and its "Adrift" / "In transit" tags are set automatically from the ship's actual journey state — so Find by tag (Constructs) can surface, say, every adrift ship for a rescue, without anyone tagging them by hand.

## v2.0.99-beta - 16th Jun 2026

* Aborting a journey now respects the drive. A jump/field drive interrupted just stops dead (stranded, as before). A momentum drive (relativistic, torch, sublight…) keeps coasting in a straight line at its current speed and heading — the dashed line now follows that heading, and it drifts on across the map (off the edge eventually). Fully reversible: scrub the clock and it slides back along its line. (Stage 1 of the adrift-physics plan; gravity-wobble to follow.)

## v2.0.98-beta - 16th Jun 2026

* A ship hidden from players now shows the same crossed-eye reminder on the starmap when it's interstellar (in transit, stranded or just arrived), so you can tell at a glance that the players can't see it.
* Find by tag: the system dropdown and the tag search now sit side by side, taking less vertical space.

## v2.0.97-beta - 16th Jun 2026

* Find by tag now has Bodies and Constructs tabs — search worlds by their physics/PoI tags, or ships & stations by their Constructs-of-Interest tags (Owner, Purpose, Status…). The system filter still works on both.
* Interstellar ships (in transit or stranded) show up in the Constructs tab grouped under "Interstellar" at the bottom of the system dropdown — "All systems" includes them too. Selecting one opens its starmap ship panel (where you can redirect it). So you can, say, search the "ship-repair" Purpose tag to find the nearest repair ship even if it's out crossing the void.

## v2.0.96-beta - 16th Jun 2026

* Fixed: a ship that's interstellar — in transit or stranded — no longer appears inside a system's orrery. It belongs to no system map while it's out there; it shows only at starmap level. The hide follows the clock, so a ship vanishes from its origin as it departs and reappears in its destination on arrival (scrub back and it's en route again).

## v2.0.95-beta - 16th Jun 2026

* New (Settings → System → Danger zone): "Clear all data…" wipes everything this app has stored in the browser — saved starmap, PoI/CoI packs, settings, palette, session — and reloads as a brand-new user, for testing the first-run experience. Double-confirmed.

## v2.0.94-beta - 16th Jun 2026

* Constructs of Interest now have an on/off page (Settings → CoIs), like Points of Interest: tick which categories are available on constructs. Owner, Purpose and Status are on by default; Hull class, FTL drive, Disposition and Tech & origin are off until you want them.
* Save/Load CoI packs — export your category set to a file and load it back (or share it), so you can swap genres. They still travel inside the starmap regardless.
* Turning off or deleting a category no longer loses tags already applied to ships: they stay on the construct shown greyed under "Inactive", with an ✕ to clear them if you want.
* Dropped two default categories: Profile (inferred from the ship's fitted equipment) and Cargo type (set on the construct's Cargo tab).

## v2.0.93-beta - 15th Jun 2026

* Expanded the default Constructs of Interest with more science-fiction range: more Purposes (salvage, rescue-tender, medical, diplomatic, tanker, factory/farm ship, comms relay, defence platform) plus new categories — Hull class (shuttle → dreadnought, station, habitat), FTL drive (sublight, jump, warp, hyperdrive, gate, generation, torch, sail), Status (active, damaged, derelict, mothballed…), Disposition (allied → hostile), Profile (armed, stealth, cloaked, Q-ship, AI/uncrewed, luxury…) and Cargo type (passengers, ore, hazmat, contraband…). All editable under Settings → CoIs; existing maps keep their lists (use Reset to defaults to pick up the new set).

## v2.0.92-beta - 15th Jun 2026

* New: Constructs of Interest (CoIs) — hand-applied tags for ships & stations, on a new "Tags" tab in the construct panel. Two starter sets ship: Owner (Military / Corporation / Consortium / Pirate / Owner-operator — pick one; it carries the ship's tardiness) and Purpose (Patrol, Mining, Courier, Refuel, Cargo-transport, Survey, Colony, HQ and more — pick any). Unlike Points of Interest these are never auto-derived — you choose them. The category and tag lists are editable under Settings → CoIs (add/rename/recolour, set owner tardiness, reset to defaults), and they travel inside the starmap file. This is the groundwork for autopilot.

## v2.0.91-beta - 15th Jun 2026

* The technical-details "Orbit (from …)" line now names the host, not just its type — "Orbit (from Star Sol)", "Orbit (from Planet Jupiter)", or for a barycentre "Orbit (from Pluto-Charon Barycenter — Pluto)".

## v2.0.90-beta - 15th Jun 2026

* When a body orbits a barycentre, the orbit label now names the barycentre AND its primary body, e.g. "Orbits Pluto-Charon Barycenter (Pluto)" — a barycentre is a valid orbital point even though only its primary is selectable.

## v2.0.89-beta - 15th Jun 2026

* Orbit editing now names the actual bodies instead of "partner"/"parent", so you don't lose yourself in a multi-star system. A binary body reads "Separation from {the other star/body}", and a normal orbit shows "Orbits {host}" alongside its range.

## v2.0.88-beta - 15th Jun 2026

* Re-nested the triple-star examples (Alpha Centauri, Algol, Polaris). The third star was a flat extra child of the close pair's barycentre; it now hangs off a proper outer "system barycentre", so the inner pair orbits the system centre and the distant companion orbits it too — and the inner pair now has its own editable "distance from the system centre".
* Made the binary stability checks hierarchy-aware so a nested inner pair isn't wrongly flagged. A tight pair is only flagged as it nears ~a third of its Hill radius (Alpha Cen A/B sit at ~0.15 and are rock-solid), and a distant companion no longer trips the close-neighbour spacing test across a large orbital gap.
* Fixed a binary detection edge case: a non-member companion sharing a pair's barycentre no longer shows the pair's "separation" control.

## v2.0.87-beta - 15th Jun 2026

* Unified binary editing. Barycentres are no longer selectable on their own — clicking one (or a saved/most-massive default) now selects its primary star/body. A body that's half of a binary now edits the whole pair from one panel: a "Distance from {host}" slider that moves the pair through the system, plus a "Separation from partner" slider for how far apart the two sit. For the central (root) pair the distance slider is greyed, since the pair is the system centre. Works the same for stellar and planetary binaries. (Previously you had to select the barycentre to set distance and the body to set separation — two places, inconsistent.)

## v2.0.86-beta - 15th Jun 2026

* Sirius is now a proper binary in the default starmap. It was stored as Sirius B orbiting Sirius A rather than the two sharing a barycentre, so it didn't read as a binary and its eccentricity was being flattened on load. It now has an explicit Sirius A/B barycentre and processes to a stable, correctly-phased pair on a ~51-year eccentric orbit.

## v2.0.85-beta - 15th Jun 2026

* Fixed binary stars drifting onto the same side of their barycentre. The two stars are meant to sit exactly opposite each other at all times, but the pairing offset their phase by half an orbit instead of flipping the orbit's orientation — which only lines up a circular pair. An eccentric pair (like Alpha Centauri) then swung onto the same side away from closest/farthest approach. They now stay diametrically opposite through the whole orbit; opening an affected system re-establishes the correct alignment automatically.

## v2.0.84-beta - 15th Jun 2026

* Fixed binary stars being wrongly flagged unstable. When a wide companion shared the binary's barycentre as a flat third member (e.g. Proxima at 13000 AU around the Alpha Centauri A/B pair), the stability check Hill-compared that distant companion against an individual binary star and flagged the tight 80-year pair as "flung out". The check now treats a barycentre's member stars as the inner binary and skips that meaningless cross-hierarchy comparison.
* Fixed binary stars showing two different orbital periods. Both members of a binary share one period (the pair's mutual orbit), but each was being computed from its own barycentric distance and the combined mass — so Rigil Kentaurus and Toliman read 25 and 60 years. They now correctly share the one period.

## v2.0.83-beta - 15th Jun 2026

* Fixed all stars rendering white after uploading a saved starmap. The import fix-up wipes baked-in derived data so the engine re-derives it cleanly, but the processor never re-classifies a star — its spectral class (star/G, star/M…) is authored input. Clearing it left every star colourless (→ white). Stars now keep their spectral class through import (and recover it from a class-tag in old v1 saves), so they colour correctly on reload.

## v2.0.82-beta - 15th Jun 2026

* Fixed: the "GM (Full Backup)" save (Save System Data dialog) now embeds your custom PoI packs and reasons config, like the rail's Download already does. Previously this "complete data" backup left them out, so restoring it on a fresh browser would have lost your custom packs. Player (redacted) saves still omit them by design.

## v2.0.81-beta - 14th Jun 2026

* Manual zoom is no longer overridden while an object is selected. Previously, playing time with a body selected forced the camera to keep zooming in to frame it; now a wheel/pinch zoom sticks, so you can pull back to a wider view and watch the body orbit at your chosen zoom. Selecting another body, re-clicking to step in, or Reset view re-engages auto-framing.

## v2.0.80-beta - 14th Jun 2026

* Binary pairs can now actually be moved. Editing one half of a binary only ever set the gap between the two bodies, never the pair's place in the system, so a pair could look stuck. The orbit panel for a binary body now has a "Pair distance from star" control that moves the whole pair, with the existing control relabelled "Separation from partner".
* Further hardening against binary pairs stuck at the centre: a barycentre that kept a valid parent but lost its own orbit (so it sat exactly on the star) is now repaired on recalculation, and any body whose parent no longer exists is re-homed to the system's centre body at its real distance instead of collapsing to (0,0).
* Fixed barycentres being left out of the compressed (Toytown) scale layout, so a binary on an eccentric orbit now scales consistently with everything else.

## v2.0.79-beta - 14th Jun 2026

* Fixed binary planets (and other bodies) being dragged to the middle of the system: a "ghost" barycentre left behind by an earlier demote/merge had a dangling parent, which collapses to the centre. These now get cleaned up on recalculation, so the real bodies sit at their proper orbits.
* Fixed binary planets not being selectable or labelled when viewing the system: a barycentre is now a transparent container, so its member bodies are shown/clickable whenever the barycentre is (including nested multi-star hierarchies).

## v2.0.78-beta - 14th Jun 2026

* Find by tag gained a system-scope dropdown at the top: defaults to "All systems" on the starmap (or the system you're in when inside one), and you can switch scope at any time. Tags, counts and results all follow the selected scope.

## v2.0.77-beta - 14th Jun 2026

* Routes panel journeys now show the *when*, not just the route: a date-time plus how far ahead/behind "now" it is — "Departs {date} · in 4d", "Arrived {date} · 2d ago", or, for a flight under way, "40% · departed 3d ago · arrives {date} (in 5d)". Both in-system and interstellar journeys.

## v2.0.76-beta - 14th Jun 2026

* Fixed: clicking an interstellar ship on the starmap now reliably opens its panel (the map's pan gesture was swallowing the click).
* Routes panel: clearer section names — "In-system journeys", "Interstellar journeys", and "Charted interstellar links" (the drawn system-to-system route lines, as opposed to ships actually in flight). Removed an unnecessary horizontal scrollbar.
* Selecting an in-flight ship from the Routes panel now drops you to the starmap first if you were inside a system, so the ship panel opens in the right context.

## v2.0.75-beta - 14th Jun 2026

* The "Routes…" panel's interstellar journeys are now interactive: the **ship**, its **origin** and its **destination** are each a clickable pill — tap the ship to open its panel, or a system to jump there.

## v2.0.74-beta - 14th Jun 2026

* Clicking an interstellar ship (in transit, stranded, or arrived) now opens a full **ship panel** right on the starmap — the construct's complete editor plus its in-flight controls (End at source / destination / Strand here, or Resume / Re-fly), with live status and progress. Replaces the small cancel popup, so you can inspect and edit a ship without diving into a system.

## v2.0.73-beta - 14th Jun 2026

* The interstellar ship marker now uses the construct's own assigned icon (shape + colour) instead of a generic diamond, with a state-coloured outline: black while under way, red when stranded, green when arrived.

## v2.0.72-beta - 14th Jun 2026

* Interstellar ships are now drawn from the journey log: a moving marker in transit, a grey diamond when stranded, a green diamond parked at the destination on arrival. Clicking an in-transit ship now offers End at source / End at destination / **Strand here** (left adrift in interstellar space), and stranded/arrived ships can be re-flown — all reversible, since position is derived from the log + clock (scrub back and the ship is en route again). (Persisting the construct into its new system, the in-system Transit panel, and relaunch-to-a-new-destination follow.)

## v2.0.71-beta - 14th Jun 2026

* (Internal) Groundwork for real interstellar travel: a derive-from-clock placement resolver + journey resolution model (arrive / return / strand) that mirrors the in-system transit pattern (position derived from the clock, persistent state committed only at actual time). No user-facing change yet — the journey UI rides on this next.

## v2.0.70-beta - 14th Jun 2026

* Add-a-tag form: the "Players see" preview now shows the actual friendly label players will see (e.g. "My Depot"), not the raw tag key (e.g. `frontier/my-depot`) — the key is shown as a small hint only when it differs. The name field is relabelled to make clear you're typing what players see.

## v2.0.69-beta - 14th Jun 2026

* Clicking an in-transit interstellar ship on the starmap now opens a ship popup (name, destination, % progress) with an **Open ship…** button that jumps to its construct in its origin system (where the construct still lives mid-flight), plus the existing Cancel-journey option.

## v2.0.68-beta - 14th Jun 2026

* Temporarily hid the yellow build-stamp banner on beta while real users test (still shown in local dev). Easy to re-enable.
* In the orrery, clustered body labels now draw child → parent, so a parent's name sits on top of its satellites' labels — the parent (most likely to be clicked) stays readable in a crowded group.

## v2.0.67-beta - 14th Jun 2026

* The Routes panel now lists interstellar journeys in flight. Previously it only showed in-system journeys and the static interstellar route lines, so a ship actually crossing between systems (animating on the map) didn't appear. New "Interstellar journeys" section shows each flight with its ship, from → to, live status (scheduled / active / completed) and % progress; click to jump to its destination.

## v2.0.66-beta - 14th Jun 2026

* Fixed Find-by-tag results not putting the system you're in first on diagrammatic maps (they fell back to plain A–Z, so e.g. Rigel sorted ahead of the Sol system you had open). Now the current system always leads, then nearest/alphabetical.
* Bumped the service-worker cache version so devices pick up the latest CSS/JS instead of serving a stale cached build (the cause of mobile layouts looking out of date — if a phone still looks old, reload once to let the new worker take over).

## v2.0.65-beta - 14th Jun 2026

* Find-by-tag on phones: the category pills are now much slimmer (tighter line height + padding) and the dialog uses nearly the full screen height, so the categories take a few compact rows and the results list gets the space.

## v2.0.64-beta - 14th Jun 2026

* Toggling a PoI category in Settings → PoI now re-tags the whole map when you leave Settings (close or save), so deselected categories' tags vanish and re-enabled ones reappear — no manual refresh needed.
* New users now start with **Mysteries & hooks** off and the other three categories (Resources, Scientific interest, Frontier logistics) on. Existing users keep their saved choices.

## v2.0.63-beta - 14th Jun 2026

* Mobile polish for the new tag tools. Find-by-tag's category bubbles are now compact pills in a bounded, scrollable browse area so they don't swamp a phone screen, and the results stay visible. The PoI rule-pack editor stacks its pack list above the detail (instead of side-by-side) on narrow screens, with the rule editor and condition rows going full-width and wrapping. The PoI reference page tightens up on mobile too.

## v2.0.62-beta - 14th Jun 2026

* Cleaned ~380 legacy tags out of the bundled example systems/starmap at source, so fresh loads start clean. The runtime legacy-tag check is now a tiny principled rule (anything with capitals/spaces, or a planet/star/belt class-prefix) instead of a hand-maintained list — modern tags are always lowercase-namespaced, and retired atmosphere tags are already handled by the atmosphere model.
* Added a **PoI rule reference** page (linked from the rule editor) documenting every condition operator and every data field — programmatic name, type, range and meaning — generated directly from the engine's field list so it can't drift out of date.

## v2.0.61-beta - 14th Jun 2026

* Starmaps now re-run the full physics + tagging pipeline on load, so a stored or example map picks up the current model (new tags, sharpened PoI rules, ring derivation, legacy-tag cleanup) instead of whatever was baked in when it was saved — no need to edit a body to trigger it. A "Running the physics…" progress bar (one step per star system, with a rotating joke) covers the recalc.

## v2.0.60-beta - 14th Jun 2026

* Legacy "Other" tags cleaned up. V1-era tags that the new engine already replaces — classification stored as tags (planet/ice-giant, Super Earth, White Dwarf…), display-name physics duplicates (Tidally Locked → orbit/tidally-locked, planet/ringed → ring/system, Runaway Greenhouse Effect), and retired atmosphere flavour (voice-changer, noble-gas, haze-former…) — are now stripped on load and on every recalculation. Your own hand-added tags are never touched. In practice this empties the catch-all "Other" group: every tag now sits under a proper category.

## v2.0.59-beta - 14th Jun 2026

* PoI rule builder: every condition row now has a NOT toggle, so you can negate any condition without dropping to raw JSON. (Only deeply nested all-within-any and tag-prefix matches still need raw.)
* Replaced the typed "Custom tag value…" field with a proper "Has tag…" group in the condition dropdown, listing the real tags present across your systems — pick one for a presence check (with NOT it becomes "is absent").

## v2.0.58-beta - 14th Jun 2026

* Find-by-tag rebuilt into a proper filter tool that fits the screen: categories are bubbles you expand to see their tags, clicking a tag adds it to an active filter list (or quick-add via search), and clicking an active filter removes it. Results below show every body carrying all the selected tags, with its system and location. Opened from inside a system on a scaled map, results show inter-system distance and sort nearest-first; otherwise they're alphabetical.

## v2.0.57-beta - 14th Jun 2026

* PoI rules now target body kinds: each rule has an "Applies to" set (star / planet / moon / belt / ring / construct), so a rule only fires on the kinds you choose. The default rules are sharpened accordingly — rocky resources on planets & moons, ore/rare-metals/ice/shattered-core on belts, gas-skimming & helium-3 on giants, and so on.
* The default rules were tightened to use this: belt and giant hooks no longer rely on redundant role checks inside their conditions, and a few were re-scoped (e.g. cold moons can now flag volatiles).
* Settings → System gained an **Advanced** area, and the generation-engine selector lives there again.

## v2.0.56-beta - 14th Jun 2026

* PoI rule builder now handles "any of" conditions, not just "all of" — so rules like Space Opera's spice-world open in the builder instead of falling back to raw JSON. A match-mode toggle (all of / any of) sits above the conditions, and "use builder" now either switches cleanly or explains when a condition is too complex (nested / NOT / hasTag) to show.
* PoI rules can now carry a player-facing name (label) and hover description, editable in the rule editor — so your own tags get the same friendly name + tooltip as the built-in ones (e.g. "Derelict rumour"). The example packs ship with these filled in.

## v2.0.55-beta - 14th Jun 2026

* Settings: the "Generation" section is now "PoI" and the experimental generation-engine selector is gone. It's now a clean checklist of the loaded PoI categories — each with a colour swatch, its rule count, and a tickbox to show/hide it in the current view.
* PoI editor polish: the rules list no longer overlaps its scrollbar and can grow taller; the rule editor is wider with a slimmer operator box (more room for the sliders), and the stray horizontal scrollbar while editing a rule is gone.

## v2.0.54-beta - 14th Jun 2026

* New "Find by tag…" in the rail: every tag across the whole starmap, grouped by category as coloured chips with counts. Click one to list the bodies that carry it (the current system first), then jump straight there — the fast way to find the nearest gas-giant refuelling, heavy-metal world, icy belt, biosignature, and so on.

## v2.0.53-beta - 14th Jun 2026

* The body Tags editor's "Add a tag" is now category-first: pick a category (or Custom for a free-form key), type the tag name, and see the full tag players will see as a live coloured preview. Hand-added tags are marked as yours — they survive the reasons re-tag pass even when filed under an existing category, and always read as removable.
* Belts now get their own reasons-to-visit hooks: icy/Kuiper belts flag "belt ice refuelling", warm rocky-metallic belts flag "asteroid rare metals", and dynamically excited (eccentric) belts flag a "shattered core" — the debris of a disrupted differentiated body.

## v2.0.52-beta - 14th Jun 2026

* Retired the "haze-former" tag — haze is now carried by the atmosphere/apparent-colour model, so the standalone tag was redundant. The rulepack no longer emits it and old saved data is stripped of it on load.

## v2.0.51-beta - 14th Jun 2026

* "Ringed" is now a derived physics tag, not a hand-added one. The old manual "Ringed"/"Rings" tags are stripped on load and re-derived from the geometry — a body that hosts ring children gets `ring/system` ("Ringed"), more than one gets `ring/multiple` ("Multiple rings"), and each ring's debris mass sorts it into a light/medium/heavy tier (distinct tiers surfaced, so a heavy ring beside a faint one reads as both). In Sol that gives Saturn a heavy ring and Jupiter/Uranus/Neptune light ones. Ring tags get their own "Rings" group + colour.

## v2.0.50-beta - 14th Jun 2026

* PoI rule "between" conditions now use a single dual-thumb slider (one track, two handles) with editable low/high numbers at each end — far more intuitive than the old min,max text box.

## v2.0.49-beta - 14th Jun 2026

* PoI category ids may contain spaces — everything keys/splits on the first "/", so a space is purely cosmetic and nothing breaks. Dropped the misleading "No spaces" hint; no forced sanitisation.

## v2.0.48-beta - 14th Jun 2026

* Removed the "Common:" quick-add list from the body Tags editor. Every entry was a physics-derived tag the engine owns and recomputes, so hand-adding one only produced a locked tag you couldn't remove — the custom-tag form remains for your own tags.

## v2.0.47-beta - 14th Jun 2026

* **PoI packs, round 2.** The built-in "Reasons to Visit" pack is now fully editable (with a Reset to restore it). Rules are now built category-first: pick the category (which sets the tag's prefix and colour), then type just the tag name — a live preview shows the real compound tag (e.g. `survey/geochem-sample`). Each category has its own colour pickers (chip + text) that flow through to the tags everywhere. Numeric conditions with known bounds get a slider alongside the hand-editable number, and fraction ranges read as 0.0–1.0. Categories explain id (the prefix in the tag) vs label (the heading players see).
* PoI rules can now trigger on your own custom tag **values** — e.g. a hand-added `danger`=`7` (use ≥/≤) or `faction/control`=`Empire` (use "is").
* PoI pack/rule/category edits now re-tag every system immediately when you close the editor (no more waiting for the next body edit).
* PoI packs now travel inside the `.json` starmap file — download embeds them, upload merges them back in.
* Flat atmosphere tags (corrosive, oxidizer, greenhouse…) are now grouped under Atmosphere in the body Tags list, signalling that the atmosphere data is the lever.

## v2.0.46-beta - 14th Jun 2026

* Removed the redundant lock-icon legend from the Tags editor (the meaning is in each icon's tooltip).

## v2.0.45-beta - 14th Jun 2026

* **Point-of-Interest rule packs.** The "reasons to visit" system is now fully editable: Settings → Generation → **Edit PoI rule packs** lets you manage stacked packs (enable, import, export, new, delete), add/remove categories, and create rules with a guided field → operator → value builder (with a raw-JSON mode for advanced logic). Two example packs ship — **Space Opera** and **Hard Science** — to learn from and build on. Share packs as .json files. Hard-science campaigns can drop the Intrigue category entirely; a Star Wars game can add its own.

## v2.0.44-beta - 14th Jun 2026

* Fixed a bug where your own custom tags could be wiped on recalculation. The body Tags editor now shows which tags are auto-derived (locked 🔒 — from physics or a rule) versus the ones you added (removable), so it's clear what's yours to edit.

## v2.0.43-beta - 14th Jun 2026

* The CRT white-noise now looks like real TV static (animated grain that regenerates each frame) instead of a fixed pixelly image jerking around — still in the terminal colour. The /physics page gained a "Reasons to visit" section and was brought up to date.

## v2.0.42-beta - 13th Jun 2026

* Editing a star's **temperature or radius now recomputes its luminosity** via Stefan-Boltzmann (L ∝ R²T⁴) instead of leaving it locked — a long-standing V1 complaint. (Auto-generated stars were already self-consistent; this fixes the manual editor.) Remnants keep their own radiation setting.

## v2.0.41-beta - 13th Jun 2026

* Monochrome Terminal CRT fixes: **Invert** is now a proper palette swap — the terminal colour becomes the background and the text goes black (green-on-black ↔ black-on-green greenscreen), instead of washing to white. **White noise** is now foreground-colour speckles — green specks on the black screen, black specks on the inverted greenscreen — rather than white static.

## v2.0.40-beta - 13th Jun 2026

* More "reasons to visit": **wilderness refuelling** — gas giants are now flagged as gas-giant refuelling stops (Traveller-style), and water/ice worlds as water/ice refuelling. Oxygen atmospheres add **life-support resupply** and **oxidizer** hooks. The experimental Generation Engine option is tucked to the bottom of the Generation settings and faded — it's not the point right now.

## v2.0.39-beta - 13th Jun 2026

* **"Reasons to visit"** — worlds are now tagged with RPG hooks for why a crew would go there: mineable **resources** (helium-3, deuterium, heavy/rare metals, water ice, hydrocarbons, diamonds, fissiles, asteroid ore…), **scientific** draws (biosignatures, pristine young worlds, tidal labs, rare world types, stellar-remnant proximity…), **frontier** logistics (fuel depots, gas skimming, aerobraking, gravity assists) and **mysteries** (anomalous signals, derelict rumours, legends). Inferred from the physics plus a seeded roll, so each system tags consistently but not everything-everywhere. A new **Generation** settings tab turns the whole thing on/off and toggles each category (default on), and now also holds the Generation Engine choice.

## v2.0.38-beta - 13th Jun 2026

* **CRT controls are now the GM's** — set in the Companion launcher (when the Monochrome skin is chosen), remembered, and pushed to every player's terminal (the GM can crank the noise to make them squint); players no longer have their own CRT panel. Invert is now a clean visual invert to light that keeps the terminal colour (no more green→magenta). White noise and the noise bar take the selected terminal colour. The guide's main content now fills ~the full width to match the headers. Sol_Expanse got the same ring-density + Dione/Tethys fixes as the canonical Sol.

## v2.0.37-beta - 13th Jun 2026

* Legacy duplicate tags (e.g. "Active Volcanism", "Tidally Locked") are now stripped on load — the physics re-derives the correct tags every time. The Local Neighbourhood example's Sol was refreshed: realistic ring densities (Saturn prominent, the other giants faint) and the missing moons Dione and Tethys added (so Enceladus's resonance heating works there). The canonical Sol definition is static/examples/Sol_2030-System.json.

## v2.0.36-beta - 13th Jun 2026

* On The Guide's planet discs, a ring's drawn size now reflects its density — a sparse ring is a thin faint hoop, a dense one (Saturn) a broad bright band.

## v2.0.35-beta - 13th Jun 2026

* **Tunable CRT on the Monochrome Terminal**: a "CRT" button opens a popup of sliders — brightness, contrast, invert, scanlines (intensity + width), vignette, rounded corners, picture skew, a rolling noise bar, white noise and flicker — all live and remembered. Built in the GM's chosen terminal colour.

## v2.0.34-beta - 13th Jun 2026

* **The Guide's planet discs now match the orrery**: a day/night terminator (pronounced on tidally locked worlds) and glowing equatorial volcanoes on tidally active worlds like Io.

## v2.0.33-beta - 13th Jun 2026

* **Day/night terminator and volcanoes are back.** They were silently vanishing when zoomed into a body (a canvas-gradient quirk at extreme zoom); now drawn in screen space — a tidally locked world shows a clear lit/dark divide, and Io shows glowing equatorial volcanoes.
* **Click prefers the parent.** A general click on a planet now selects the planet, not one of its moons or constructs that happens to sit under the cursor; a clearly-separated moon still selects directly.
* **The Guide:** a "back to parent" button when a moon is selected; constructs no longer show a picture; the Survey Datapad photo now fills the full image width letterboxed to the central detail (no longer over-zoomed); and the Starship Console jump list now lists belts and Pluto (the Pluto-Charon barycentre) that were previously missing.

## v2.0.32-beta - 13th Jun 2026

* **The Guide looks the part.** Planet discs now use the same renderer as the orrery, so Earth shows its oceans, land and clouds (not a flat blue ball). Belts render as a grey field of rocks that thickens with density instead of a fake planet. A barycentre is shown as its main body — "Pluto-Charon Barycenter" now reads as "Pluto (Pluto-Charon Barycenter)" with Charon listed as its companion. The Starship Console photo fills the panel width; the Survey Datapad photo is a letterboxed close-up of the central detail. And, naturally, any world called Earth earns a red "Mostly Harmless" stamp.

## v2.0.31-beta - 13th Jun 2026

* **Consistent click-to-zoom.** Clicking an object (or picking it from the browser) now frames it through a defined ladder, the same for stars, planets, moons and constructs: first click centres it with its parent near the edge; each further click steps in — to the object plus all its satellites, then to the object filling about half the screen. Levels that don't apply are skipped, and a barycentre is treated as one object until you click a member. (Back still steps up to the parent for now.)
* **Volcanic worlds** (Io and kin) now show their magma clearly — incandescent hotspots clustered around the equator, visible even on a bright sulfur surface.

## v2.0.30-beta - 13th Jun 2026

* Fixed tidally locked worlds rendering too dark: the night side was nearly black, so a world seen from its night hemisphere looked dark all over. The day side now stays fully lit with a sharp terminator, and the night side is clearly shaded but still readable.

## v2.0.29-beta - 13th Jun 2026

* **Orrery detail.** Tidally volcanic worlds (Io and kin) now show glowing magma patches in true-colour; tidally locked worlds get a pronounced fixed day/night terminator. Ring and belt opacity now follows their density — Saturn's rings read solid while Jupiter/Uranus/Neptune's are faint (as in reality), and denser belts look less transparent. New ringed/belted worlds get a randomised density.

## v2.0.28-beta - 13th Jun 2026

* **Tidal locking is now computed.** Whether a world keeps one face toward its host is derived from the despinning timescale vs the system age (the steep a⁶ law), not hand-set — every regular moon, Mercury and Pluto/Charon lock while the AU-distance planets and gas giants spin free. It shows as a dynamic "tidally locked" tag and re-derives every run; the body editor's checkbox still lets you pin it by hand (with a "Reset to auto" link).

## v2.0.27-beta - 13th Jun 2026

* **Resonance now heats moons.** A mean-motion resonance maintains a moon's eccentricity against tidal damping, so it now feeds the numeric tidal-heat model — Enceladus (pumped by the Dione 2:1) and the Galilean Laplace chain get real tidal heat (Io > Europa > Enceladus), while a coincidentally-eccentric moon (Ganymede, Luna) stays cold. Fixed the Sol dataset: all 19 major moons are now correctly flagged tidally locked.
* **Bad orbit data no longer freezes the orrery.** A negative/NaN semi-major axis (seen in a Kerbol import) used to throw and kill the render loop — a black frozen canvas. Invalid orbit ellipses are now skipped, a draw exception can't stop the loop, the orbit editor clamps the semi-major axis positive, and bad files self-heal on load.
* **Companion app:** The Guide is now the default skin and shows a procedural true-colour planet disc (with rings) matching the orrery's look; the Survey Datapad and Starship Console show artist's-impression photos; the Monochrome Terminal stays text-only.

## v2.0.25-beta - 12th Jun 2026

* **Out of alpha.** Hand-authored, imported and hand-picked worlds are now **end-state**: the engine no longer re-ages them (atmospheric escape was wiping deliberate trace exospheres — Io's SO2, Mercury's Na, Pluto's N2 — and compounding the loss on every load/edit) nor overwrites their authored types (Venus read "desert"). Aging and auto-classification are per-body opt-in switches in the body editor; generator-created worlds opt in and erode idempotently from a stored primordial baseline. The classifier now scores by mean band-fit so catch-all types can't win on barely-true sliver bands (Testion coverage 56/58, audit green). Belt/ring transit destinations park in a circular orbit at the ring's radius on the origin's side — no more Mars-to-belt plans swinging past the sun. Testion demo bodies start scattered around their orbits instead of lined up in a row. /physics documents the new scoring and the end-state model.

## v2.0.24-alpha - 12th Jun 2026

* Resonances and predicted fates surfaced in the UI: labelled tag chips (j:k resonance, Laplace, fates, stability severities), a Resonance row in the body data panel, and a new /physics section + Known-fudges entries documenting the model.

## v2.0.23-alpha - 12th Jun 2026

* **Enceladus and Triton come alive**: Dione + Tethys added to the Sol dataset (the missing 2:1 resonance partners). A resonance that keeps pumping a moon's eccentricity now drives **ice** cryovolcanism at its own ~273 K bar (the ~1000 K silicate threshold no longer gates icy moons) — Enceladus derives cryovolcanic; barely-pumped Ganymede/Dione stay quiet, and heliocentric resonances (Pluto–Neptune 3:2) shape orbits without heating. Very cold ice worlds (<60 K) get Triton-style **solar-seasonal geysers**. Higher-order resonance tagging tightened to kill coincidental near-ratios.

## v2.0.22-alpha - 10th Jun 2026

* **Interstellar transit**: speeds never read "100% c" any more — near light speed the figure floors and shows just enough decimals to reveal the gap (e.g. 99.997% c), since c is only ever approached. The relativistic energy bill is now a human-readable mass-energy equivalent (e.g. "42.9 kilotonnes" rather than "4.29e+4 tonnes"), laddered through familiar units up to Earth/Jupiter masses.

## v2.0.21-alpha - 10th Jun 2026

* **Interstellar transit planner reworked**: the ship is fixed (it's opened from that ship — no picker); the destination is two-fold (pick a star system, then a body within it). **Massless fuel** is now an honest constant-g flip-and-burn — accelerate to a midpoint peak, flip, brake to rest, no cruise. **Realistic & Massless** get a burn-acceleration slider that turns amber past ~2 g and red past ~10 g, warning that crew-survival tech is needed (it never blocks the plan). **Relativistic** gets a finer speed slider that reaches 99.999 % c, plus the kinetic-energy bill to get there expressed as a mass-energy equivalent (kg / tonnes / Earth / Jupiter). New **Start Journey** button (and **Cancel**): the ship then appears on the starmap, travelling along a line between the stars over game time — solid trail behind, dashed ahead — and selecting it lets you cancel and snap back to the start. The three physical models are greyed out on diagrammatic (unscaled) maps; the Jump drive always works.
* **Field Guide**: the view is now **GM-enforced** (set in the launcher, broadcast live; no player picker). Green/Amber merged into one **Monochrome Terminal** with a GM colour choice (Green/Amber/White/Blue/Red). The diagram shows stars + planets only — belts are wide blobs picked from the body list under the diagram; moons and constructs ("On planet" / "Orbiting") appear in the data panel. **The Guide** turned hopelessly colourful — friendly fonts, rainbow lines, a DON'T PANIC cover, and random Guide-note banners. **Starship Console** gains a star/planet jump list (planets unfold their moons/constructs) and adaptive time (the fastest visible orbit runs at ~1 orbit per 2 s). "Open Field Guide" → "Open Local Field Guide Window".
* **New Starmap modal simplified**: rulepack picker dropped; one **Distance/Scaling units** choice — Light Years (ly), Parsecs (pc) or Diagrammatic (not scaled, with a free abstract unit like J8). Settings mirrors the same control.
* **Settings**: "Starmap View" → **Starmap**; new top-level **Time** section (Date & Time + Time & Calendars). Sub-editors return to Settings on close instead of exiting. Spurious horizontal scrollbars on the Starmap & Time tabs removed.
* **Orrery**: a flaring / very active star now glows more intensely, and a feeding black hole gets a hot-orange halo.
* **Time controls**: the transport pill is ~15 % smaller and shorter; minimising now collapses it to a clock icon (no date read-out).
* Planet images get a **More information** pill linking the matching planet-type entry in Pablo Carlos Budassi's classification.
* Scaled starmaps: the distance scale bar moved to the bottom-right (matching the system map); the Description/GM-notes panel sits above it.
* Traveller import no longer forces the numbered hex map — the hex obeys the snap-grid switch, while Traveller scaling/snapping/import keep working underneath.
* Rail: **File** moved down between Measure and Settings; the Settings icon matches the others; the corner brand reads **SSE2**. The add-planet type picker scrolls properly on mobile.

## v2.0.20-alpha - 10th Jun 2026

* **Resonances + smarter stability**: the orbital model now catches mean-motion resonances (2:1, 3:2, …), Laplace chains (Io:Europa:Ganymede 1:2:4), and barycentre pairs (so Pluto–Charon's 3:2 with Neptune is found). Protective resonances spare crossing orbits (Pluto isn't flagged doomed); resonant eccentricity-pumping is flagged as the driver behind moons like Europa/Io. Unstable objects now get a predicted fate — spirals in, flung out, collision, or hierarchy inversion.

## v2.0.19-alpha - 10th Jun 2026

* **Gas giants stop looking identical**: cloud colour is now composition-driven, so the gas-mix sliders actually change the look. Methane (CH₄) absorbs red in proportion to abundance and cold — cyan (Uranus) through deep blue (Neptune); ammonia giants stay warm tan/gold with chromophore stripes (Jupiter browner and spottier than paler Saturn). Ice giants render near-featureless (low contrast, no storm); the Great-Red-Spot oval now only appears on banded ammonia giants.

## v2.0.18-alpha - 10th Jun 2026

* **True colour goes procedural**: bodies render as layered discs — land with ocean patches at the real coverage %, cloud streaks and haze on top, gas-giant latitudinal banding (with chromophore bands and the odd storm oval), incandescent glow on hot worlds. Driven by the physics palette, so editor changes (gas mix, coverage, temperature) visibly change the disc.
* Ring shadows are now parallel-sided (planet-diameter wide, soft penumbra) instead of fanning out from the centre.
* Time pill: minimise is a slim strip on the far right; the minimised state shows a clock icon.

## v2.0.17-alpha - 10th Jun 2026

* **New Starmap modal simplified**: rulepack picker dropped (only one pack exists); one **Distance/Scaling units** choice — Light Years (ly), Parsecs (pc), or Diagrammatic (not scaled) with a free abstract unit + order (e.g. J8 for Jump-8). Settings mirrors the same control. The button now creates Vast Nothingness, as is proper.
* **Settings**: "Starmap View" → **Starmap**; new top-level **Time** section (Date & Time + Time & Calendars). Sub-editors (Time & Calendars, Fuel & Drives, Sensors, Atmospheres, LLM) return to Settings on close instead of exiting.
* **Field Guide**: the view is now **GM-enforced** (set in the launcher, broadcast live; the player picker is gone). Green/Amber merged into one **Monochrome Terminal** with a GM colour choice (Green/Amber/White/Blue/Red). Diagram shows stars + planets only — belts are wide blobs picked from the new body list under the diagram; moons and constructs ("On planet" / "Orbiting") appear in the data panel. **The Guide** got hopelessly colourful: friendly fonts, rainbow lines, a once-per-session DON'T PANIC cover, and random Guide notes as banners. **Starship Console** gains a star/planet jump list (planets unfold moons/constructs) and adaptive time — the fastest visible orbit runs at ~1 orbit per 2 s with a "1 s ≈ X" read-out. "Open Field Guide" → "Open Local Field Guide Window".
* Planet images get a **More information** pill linking the matching planet-type entry in Pablo Carlos Budassi's classification (new tab), for types catalogued there.
* Starmap scale bar (scaled maps) moved to the bottom-right, styled like the system map's; the Description/GM Notes panel defaults above it.
* Mobile: the add-planet type picker scrolls properly and fills the screen; orrery View options use a sliders icon (the eye belongs to player visibility); the rail brand reads **SSE2**.

## v2.0.16-alpha - 10th Jun 2026

* Black-hole editor: radius is now **Event Horizon Radius**, locked to mass (Schwarzschild); mass range to 300 solar masses. Quiescent holes have **zero magnetic field** (no-hair) with the slider disabled; toggling **Feeding** presets a hot disc, near-Eddington output and a ~10⁶ G disc field, with the likely range shown above the slider.

## v2.0.15-alpha - 10th Jun 2026

* **Time controls**: the transport pill is now draggable (grip handle) and minimizable to just a clock — tap to expand; position and state persist. Scale bar moved to the bottom-right (it sat under the time pill).
* **True colour**: liquid shades now come from the host star's light filtered by each liquid's absorption plus a refractive-index specular share — water under a red dwarf reads murky amber, not postcard blue. The disc mixes land/liquid proportionally by coverage for ANY surface liquid, with clouds/haze on top.
* Ring shadows now match the planet's drawn disc size instead of a point-source sliver.

## v2.0.14-alpha - 9th Jun 2026

* Black holes get a **Feeding** toggle (active accretion — changes the image, orrery accretion ring, and output). Pushing a neutron star's **magnetic field past ~10¹³ G** turns it into a (purple) **magnetar**, and dropping it back reverts.

## v2.0.13-alpha - 9th Jun 2026

* Interstellar planning moved off the rail to a link in a ship's transit planner (below the destination picker); "Measure" moved to the bottom of the rail.
* Orrery: stars now glow; planets/moons are shaded on their night side. The View control is a semitransparent eye that floats on the orrery (no longer hidden behind the body picker on phone).
* Transit planner: one-button "Refuel" (fills all tanks).
* Mobile/UI: slimmer time controls on phone; the per-field info "i" links removed from the body panel (the Newton apple covers it); New Starmap modal fits/scrolls on phones; About close is a larger red cross; picking Measure closes the mobile menu.

## v2.0.12-alpha - 9th Jun 2026

* **Interstellar transit planner** (new "Interstellar…" rail tool): pick a ship and a destination system, then compare four travel models — Realistic (rocket equation; a fuel slider must escape the star AND brake at the far end, red/yellow/green), Massless fuel (free propellant), Relativistic (instant accel to a fraction of c with time dilation), and Jump drive (just set the days). Each shows crew-frame and outside-observer travel time.

## v2.0.11-alpha - 9th Jun 2026

* Hiding a whole system from the guide now keys on the system's **root** (the top barycenter in a multi-star system) — hiding an underlying star only hides that star. Hidden-system eye marker is smaller and sits closer to the star.
* Projector: the standalone "Toggle projector CRT" is gone; the projector-open button now toggles it as **"Greenscreen CRT"** (the green-CRT look, which is what was wanted).

## v2.0.10-alpha - 9th Jun 2026

* **Field Guide — diagrams + remote fix**:
  * Clickable **star map** (systems at their real positions, with route lines) → preview a system, then explore. Clickable **per-system orbital diagram** (planets by distance, moon pips) → tap a body for its full data. Map stays on top, details below.
  * **Remote (cross-device) now delivers the whole map**: large peer messages are chunked (WebRTC drops >16KB frames), and the broadcast snapshot is slimmed (no transit logs / debug). Players on their own devices now get the full starmap, not just the branding.

## v2.0.9-alpha - 9th Jun 2026

* Printed report: added a **Geology** (tectonic regime) row to every body/moon, matching the field guide's depth.

## v2.0.8-alpha - 9th Jun 2026

* **Field Guide — full detail + branding**:
  * Every tier (lo-fi browser, hi-tech console, datapad, Guide) now shows full report-depth body data — temperature range, density, radiation, magnetosphere, geology, axial tilt, tidal lock, air mix, surface liquids, ascent Δv, biosphere and feature tags.
  * GM **company / faction branding**: set a name and upload a logo in the launcher; it appears as the guide's letterhead. (Supply your own art — nothing trademarked ships by default.)

## v2.0.7-alpha - 9th Jun 2026

* **Field Guide is now campaign-wide**: it opens at the starmap level with every visible system, then drills into one (a wider cut than the old per-system report). Available from both the starmap and a system view. A system whose main star is hidden from players is dropped from the guide — and now shows a small crossed-eye on the GM's starmap as a reminder.

## v2.0.6-alpha - 8th Jun 2026

* **Companion App — now a proper app + works on players' own devices**:
  * The lo-fi / datapad / Guide skins are now diagrammatic: a clickable star/planet layout up top, tap a body to read its player-safe file in a panel below (moons drill in) — instead of one long document.
  * **Cross-device**: players can open the guide on their own phones/tablets over the internet (peer-to-peer), not just same-machine. Keep the app open while they're connected.
  * GM **"include constructs"** switch in the launcher — show or hide stations/ships in the guide, over and above the standard player redaction.
* Measuring tape moved from the orrery View menu to a dedicated left-rail **Measure** button.

## v2.0.5-alpha - 8th Jun 2026

* **Measuring tape**: a "Measure (ruler)" toggle in the orrery View popover — tap two bodies for the straight-line distance between them in AU (km when short). Ported from the wireframe; works in Toytown scale.

## v2.0.4-alpha - 8th Jun 2026

* **LLM**: connect a local OpenAI-compatible server (LM Studio / Ollama, no key) or OpenRouter — base-URL presets, optional key, and a Test &amp; list-models button. Descriptions now feed the model curated, evocative body/star summaries (constraint-grade physics + interesting tags) instead of a raw 40-field physics dump, for more imaginative results.

## v2.0.3-alpha - 8th Jun 2026

* **Companion App**: added "The Guide" skin (friendly illustrated travel companion).
* Fixes: Newton's-apple physics button is green; confirm before File > New Starmap clears the map; Display/Actual time labels no longer clipped under their values; the time transport "..." is now a red warning that confirms the destructive set-now; Traveller mode is its own toggle (not a snap-grid value); the orrery can no longer overflow its cell and occlude the detail drag-bar / push the time pill off-screen; construct location in the report no longer shows 5 decimals.

## v2.0.2-alpha - 8th Jun 2026

* **Companion App (Players' Field Guide)**: new `/catalogue?sid=` live, redacted, in-universe companion to the system you're running. Open it from the system-view rail ("Field Guide..."). Same-machine for now (a mirrored tablet, a second window, your phone on the same browser). Skins: Green Screen / Amber Terminal (lo-fi CRT report), Survey Datapad (clean), Starship Console (live orbital map, tap a world for its file). Launcher has a link + QR. Report rendering extracted into a shared `ReportDocument` so the printed report and the live guide share one document.

## v2.0.0-alpha - 12th Apr 2026

* **Evolutionary System Wizard (New Generation Engine)**:

  * Introduced a multi-phase interactive wizard for physics-driven star system generation, selectable in New Starmap and Settings.
* **Stellar Birth (Phase 1)**:

  * Interactive property selection using a calibrated Hertzsprung-Russell diagram (based on ESO data)..
  * Stellar Classifier: Identifies all stellar types (Main Sequence, Hypergiants, White Dwarfs, etc.) and remnants (Black Holes, Neutron Stars)
* **Stellar Nursery (Phase 2)**:

  * 2D nursery for spatial star placement:  Drag-and-drop
  * Green Velocity Handles: Drag vectoring with real-time speed labels (km/s).
* **Stellar Dance (Phase 3)**:

  * **4th-order Runge-Kutta (RK4)** N-body physics engine with **Swept-Sphere collision detection** to prevent high-speed tunnelling.
  * **Event-Driven Slow-Mo**: Simulation automatically slows down to a crawl during mergers and ejections.
* **Unified Evolution Timeline (Phase 4)**:

  * 100 iteration accretion disc calculation \& animation capturing snapshots on every iteration.
  * **Dust/Gas Band Visualization**: Renders the protoplanetary disk with visible "carving" as planets sweep up material. \[LIKLEY BUGGED!]
  * **The BIG Time Slider**: Slider length and tick marks now reflect the actual calculated lifespan of the star.
  * **Basic lifespan**: star brightness changes over time, stellar remnants and engulfed planets taken into consideration
  * ***This is the section I am tinkering with mostly - LOTS to add and refine to get from here into the main part of SSE***
* **Physics \& Moon Generation**:

  * Implemented **Satellite Mass Budget Model**: Moon masses are now realistic percentages of parent mass (0.01-0.025% for giants).
  * **Power-Law Distribution**: Satellite systems now favor a single large moon (Titan/Ganymede style) over identical clones.
  * **Double Planet Event**: 2% rare chance for worlds to form high-mass binary partners (Earth/Luna style).
* **Content \& Community**:

  * Added  new example systems built by the community
  * Added special credits to footer and About box for community contributors (@Athena, @Mafro, @malize) and Mitch Anderson (Accrete.js).

## v1.10.0 - 1st Apr 2026

* Data Unification \& Editor Features:

  * Unified Star and Planet data structures into a single cohesive `CelestialBody` type, simplifying physics processing and resolving TS errors.
  * High mass planets (Brown Dwarfs) can now be "Ignited" into stars directly within the UI.
  * Low mass stars can be "Doused" back into planets directly within the UI.
  * Added "Rebuild Hierarchy" button to System View. When mass edits fundamentally shift the system's center of mass (e.g. creating a massive star), this button flattens and fully rebuilds the orbital parent-child chains relative to the new heaviest body. It can be destructive so not automated.
* Transit \& Flight Dynamics Improvements:

  * Overhauled post-transit kinematic states to accurately simulate orbital aftermaths during time-scrubbing.
  * Ships arriving in generic orbits (`lo`, `mo`, `ho`) or landed on the surface now correctly lock to their target's global state, eliminating the "glued to the sky" static offset bug.
  * Ships intercepting a construct (rendezvous) now automatically enter `Deep Space` formation flying, matching the station's trajectory instead of continuing inertial drift.
  * Ships arriving at Lagrange points (L1-L5) now mathematically track the parent planet's orbital rotation rather than remaining at a static offset.
* Improved Stability Assessment:

  * Added full system hierarchy scan to catch "Massive Inversions" (orbiting body is heavier than its host) and "Stolen Children" (orbit exceeds host's stable Hill sphere).
  * Added "Consumed/Collided" checks if an orbit drops below the physical radius of its host.
  * Added "Roche Limit Violation" checks for bodies orbiting too close to their host.
  * Rebuild Hierarchy` UI warnings added to the Technical Details panel when mass inversions occur.
* Terminology \& Unit Standardization:

  * Standardized acceleration units to lowercase **"g"** (9.81 m/s²) across tech details, and hazard messages.
* Time Control System Enhancements:

  * Added **"Manual Speed"** mode (speed dial) allowing for persistent integration rates and reversible playback. Works like OLD system.
  * Added **Speed Indicator** (e.g., +1s/s to +10y/s) providing real-time feedback during scrubbing.
  * Increased scrubber precision with a 50% wider slider and unified logic across System and Starmap views.
* Printed Report Improvements (Binary Systems):

  * Implemented hierarchical **stacked rendering** for binary planets in the System Overview diagram.
  * Enclosed binary pairs within a detailed **Barycenter Info Block** in the Celestial Survey for better organization.
  * Added dynamic unit scaling: small orbital distances now automatically switch from **AU** to **km** for readability.
* Precision Orbital Editing:

  * Added "Mean Anomaly" slider and manual numeric entry to all bodies and constructs for fine-tuned positioning.
  * Set all orbital parameters (SMA, Eccentricity, etc.) to use high-precision "any" step for manual entry.
  * Construct editor now supports direct manual entry for Altitude (km) and Orbital Distance (AU).
* Binary Star Orbit Control:

  * Enabled Orbit editing tab for stars within binary systems.
  * Implemented reciprocal coupling: editing one star's position now automatically updates its partner to maintain its stable barycenter.
* Stellar Physics \& Evolution:

  * Implemented **Dual Frost Lines**: distinction between **Formation Frost Line** (170K, historical boundary for gas giant growth) and **Current Frost Line** (125K, modern vacuum ice stability).
  * Added **Spectral-Class Dependent Brightening**: stars now evolve in luminosity based on their type (O/B massive stars brighten rapidly, M-dwarfs remain stable), correctly back-calculating historical formation zones.
  * Fixed **Radiogenic Heating** persistence: manual thermal overrides are now preserved during system processing and correctly account for surface temperature even on rogue/starless bodies.
* Orbital Mechanics \& Generation:

  * Fixed **"0 AU Moon" Bug**: correctly resolved host gravitational parameters for planets orbiting barycenters, ensuring stable moon placements in binary systems.
  * UI refinement for root stellar barycenters: hidden the redundant "Edit" button to prioritize direct name/visibility editing.
* Bug Fixes \& UI Polish:

  * Fixed **Time Epoch Desynchronization** (13.8 billion year jump): ensured all initialization paths correctly offset Big Bang display time into Unix-relative physics time, preventing orbital scrambling on reload.
  * Improved flyby math to correctly calculate zero Delta-V intercepts for unpowered flypasts.
  * Unified "About" dialogs into a single, maintainable component.
  * Easter Egg :)



## v1.9.2 - 24th Mar 2026

* N-Body Gravitational Summation:

  * Transit solvers now sum gravitational forces from all massive bodies (Stars, Planets, Barycenters) for realistic ballistic drift.
  * Replaces single-body Keplerian assumptions with full integrated pathing for all mission types.
* Trajectory Correction Manoeuvres (TCM):

  * Automatic drift tracking injects discrete TCM burn points if n-body perturbations exceed 100km.
  * Compact, color-coded timeline labels and trajectory markers signal manoeuvre intensity (Blue/Orange/Red) based on Max-G.
  * TCMs now correctly consume fuel and contribute to total mission delta-V.
* Planner UI \& Stability:

  * "Transit Tags" summary box added to mission stats for better awareness of aerobraking, TCMs, and high-G status.
  * Direct Burn profile state (Accel/Coast/Brake) is now persistent and decoupled from ballistic plan states.
  * Fixed various "ReferenceError" and "Shadowing" bugs in the transit calculation engine.

## v1.9.1 - 15th Mar 2026

* Torch-Ship Kinematic Simplification:

  * Bypassed Lambert solver artifacts for high-thrust "Direct Burn" plans.
  * Eliminates "2000c" speed-of-light errors in favour of robust kinematic straight-line profiling.
* Lowest Common Ancestor (LCA) frame selection for transits:

  * ensures transfers in multi-star systems use the correct gravitational host,
  * fixes "40 AU loop" bug where binary star transits default to system barycenter.
* Smart Target Redirection:

  * Interplanetary moon transfers now automatically target the parent planet's gravity well while maintaining moon-radius capture.
  * Fixes "dive into the star" bug for local stellar constructs.
* Expanded Lagrange point support (L1-L5):

  * added L1, L2 (radial offsets) and L3 (hidden co-orbital),
  * co-orbital framing ensures L-points are tracked in the host's parent frame.
* Transit intercept accuracy and stability:

  * Fixed "missed intercept" bug: solvers now target actual $(x, y)$ node coordinates at arrival rather than just orbital radius.
  * Stability filter overhaul: removed hard 100km/s cap, increased to 10,000 km/s insanity check to support high-G ship jumps.
  * Forced direct-path (short-way only) for Speed/Direct Burn plans to prevent unrealistic looping arcs.
  * Improved station/construct state resolution: orbiting constructs correctly resolve positions even without explicit orbit objects.
* UI/UX refinements:

  * New "Major Target -> Sub-Target" dropdown workflow in Transit Planner.
  * Improved hidden-plan reason messages in the UI.
  * Added internal transit debug logging to developer console.

## v1.9.0 - 24th Feb 2026

* New time system foundations are in place:

  * Display Time and Actual Time are now separate and can be aligned/reset.
  * Time scrub/play controls now drive system visuals and orbit updates.
  * Calendar/time settings are saved with each starmap.
* Calendar system is now data-driven and extensible:

  * calendars are loaded from data,
  * new calendars can be added/edited,
  * legacy saves are migrated safely.
* Transit planner reliability pass:

  * short/local transfers (planet/moon) now use correct local reference frames,
  * Direct Burn now solves for a feasible duration instead of producing impossible spike values,
  * orbit targeting now respects selected arrival orbit level (LO/MO/HO),
  * Brake-at-arrival now targets orbital tangential velocity instead of assuming stationary capture,
  * flypast velocity now carries correctly into the next leg for all route types,
  * local launch-window search no longer suggests absurd long waits for moon transfers,
  * route label updated: `Efficient Alt` -> `Efficient Now`.
* Transit visuals improved:

  * during preview/execution, the focused construct moves along the route,
  * optional vector overlay added (single `Show Vectors` toggle) for velocity/acceleration.
* Habitable Zone model refreshed and old Goldilocks logic replaced with conservative modern HZ edges.
* Zone rendering performance improved (screen-space draw path, culling, and cheaper dash behavior).
* StarMap settings and LLM settings reorganized:

  * StarMap settings consolidated,
  * LLM/API settings moved to separate local-only config (not exported).
* Time-driven transit scheduling shipped:

  * `Schedule Journey` now writes planned routes into each construct's own ship log data,
  * planned routes persist with constructs in saved systems/starmaps,
  * multiple constructs can move concurrently from scheduled plans.
* Ship's Log shipped in System View:

  * shows journey windows and per-leg departure/destination entries,
  * includes controls to clear future plans and cancel active (+future) plans.
* Transit intercept and stability improvements:

  * moving construct targets are available in planner target lists,
  * intercept solving now uses live kinematic target state (position + velocity),
  * direct-burn sanity filters reduce unstable/crazy solutions for moving targets - these WILL happen

## v1.8.4 - 20th Feb 2026

* Temperature model refresh (cryo greenhouse behavior, improved range presentation, tidal hotspot handling).
* Printable report overhaul with compact system diagram and multi-star hierarchy fixes.
* QoL updates including invert display mode, finer atmosphere composition editing, and Traveller import edge-case fixes.

## v1.8.1 - 14th Feb 2026

* Scaled starmap mode with persistent map mode/scale controls.
* Route-based map rescaling workflow.
* Draggable systems with live route distance updates in scaled mode.
* Scale bar integration and placement consistency updates.

## v1.8.0 - 14th Feb 2026

* Orbital stability post-processing (overlap + Hill-spacing proxy) with calibrated severity tiers.
* Dedicated orbital stability technical-details UI block and tags integration.

## v1.7.2 - 14th Feb 2026

* Transit planner GM override flow (`Force Journey`) for blocked plans.
* Name filtering in system summary context menus.
* PWA install/offline support and update prompt behavior.

## v1.7.1 - 14th Feb 2026

* IndexedDB starmap persistence migration from localStorage.
* High-e orbit/camera stability improvements and Kepler propagation hardening.
* Orbit editing guardrails and Lagrange placement correction.

## v1.7.0 - 24th Jan 2026

* Traveller integration (subsector import, UWP entry, extended decoding, PBG population logic).
* Global atmosphere editor and related physics/placement integrity updates.
* Broad UI/UX polish across starmap/system flows.

## v1.6.0 - 21st Jan 2026

* Sensor suite data model/editor/overlay implementation.
* Save redaction workflow for player-safe exports.
* Habitability and Earth-temperature calibration refinements.

## v1.3.4 (14th Jan 2026)

* Brown dwarf support expansion and procedural realism upgrades.
* Binary dynamics and orbital mechanics improvements (including retrograde support).
* Multiple UI/UX stability fixes.

## v1.3.3 (13th Jan 2026)

* Documentation/tutorial improvements and sync/performance fixes.
* Critical starmap/system relink bug fix.

