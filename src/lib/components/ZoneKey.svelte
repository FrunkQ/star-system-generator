<div class="zone-key-container">
	<h4>Stellar Zones Key (likely order from star to edge)</h4>
	<ul>
		<li>
			<p>
				<span class="color-box red-line"></span>
				<strong>Roche Limit (Red Line):</strong> This is the "no-fly zone" close to a star or
				giant planet. If a moon or asteroid gets this close, the host's powerful gravity will
				rip it to pieces.
			</p>
			<p class="in-game-note">
				<strong>In-Game:</strong> This is the <strong>'Shredder Zone.'</strong> Don't park your
				capital ship here, and don't expect to find any moons—just rings and a whole lot of
				gravel. Great for mining, terrible for hull integrity.
			</p>
		</li>

		<li>
			<p>
				<span class="color-box brown"></span>
				<strong>Silicate Line (Brown):</strong> The point where it's <em>just</em> cool enough
				for rock and metal (silicates) to turn from gas into solid dust. This is the starting
				line for building rocky planets.
			</p>
			<p class="in-game-note">
				<strong>In-Game:</strong> The <strong>'Foundry Zone.'</strong> Useless for mining
				ices, but the only place to find pure, high-temperature metals. Expect all planets
				here to be barren, iron-rich hellholes.
			</p>
		</li>

		<li>
			<p>
				<span class="color-box red"></span>
				<strong>Kill Zone (Red):</strong> The "death zone" where the star's raw X-ray and UV
				radiation is strong enough to cook the surface, destroy DNA, and strip atmospheres.
			</p>
			<p class="in-game-note">
				<strong>In-Game: 'Ping! You're Cooked!'</strong> Make sure your ship has good
				radiation shielding. Don't go outside, even in a vac-suit. (Note: Red Dwarfs are the
				worst—their 'Kill Zone' is often <strong>inside</strong> their 'Goldilocks Zone'!)
			</p>
		</li>

		<li>
			<p>
				<span class="color-box green"></span>
				<strong>Goldilocks Zone (Green):</strong> The "just right" region around a star where
				it's not too hot and not too cold. A planet with a good atmosphere here can have
				liquid water.
			</p>
			<p class="in-game-note">
				<strong>In-Game: 'Prime Real Estate.'</strong> This is where you'll find Earth-like
				worlds, valuable water, and complex life. It's the most contested and valuable
				territory in any star system. Expect factions to be fighting over it.
			</p>
		</li>

		<li>
			<p>
				<span class="color-box grey"></span>
				<strong>Soot Line (Grey):</strong> The line where it gets cool enough for sticky,
				complex carbon compounds (soot) to freeze from gas into solid particles.
			</p>
			<p class="in-game-note">
				<strong>In-Game: 'The Gunk Line.'</strong> Planets here are often rich in carbon and
				tholins (sticky organic gunk). A prime source for hydrocarbons and the raw polymers
				needed for 3D printing and manufacturing.
			</p>
		</li>

		<li>
			<p>
				<span class="color-box lightblue"></span>
				<strong>Frost Line (Light Blue):</strong> This is the most important line in the
				outer system. It's the point where it's finally cold enough for water to freeze into
				solid ice.
			</p>
			<p class="in-game-note">
				<strong>In-Game: 'The Ice Rink.'</strong> This is the birthplace of all Gas Giants.
				Beyond this line, every asteroid and moon is a mountain of water ice. This is the
				system's "gas station" for reaction mass and life support.
			</p>
		</li>

		<li>
			<p>
				<span class="color-box white"></span>
				<strong>CO2 Ice Line (White):</strong> The "dry ice" line. It's so cold out here that
				even carbon dioxide gas freezes solid, forming CO2 glaciers on planets.
			</p>
			<p class="in-game-note">
				<strong>In-Game: 'The Deep Freeze.'</strong> Planets and moons here have atmospheres
				that are frozen solid. A good, if inconvenient, source for the CO2 needed to
				terraform a greenhouse or put the fizz in your synth-whiskey.
			</p>
		</li>

		<li>
			<p>
				<span class="color-box blue"></span>
				<strong>CO Ice Line (Blue):</strong> The absolute coldest line in the system, where
				even toxic carbon monoxide gas (car exhaust) freezes into ice.
			</p>
			<p class="in-game-note">
				<strong>In-Game: 'The Edge of Nothing.'</strong> You're in the deep, deep cold. Only
				comets and rogue planets live out here. A good place to hide, a terrible place to run
				out of fuel. Your sensors will be unreliable.
			</p>
		</li>
	</ul>

	<div class="notes">
		<h4>Other Features</h4>
		<p>
			<strong>Lagrange Points (L1-L5):</strong> These are stable "parking spots" in space created
			by the gravity of two large bodies (like a star and a planet).
		</p>
		<p class="in-game-note">
			<strong>In-Game:</strong> The L4 and L5 points are the most stable. This is where you'll
			find shipyards, secret pirate bases, and massive trade hubs. They are the
			'crossroads' of any planet's orbit.
		</p>
	</div>
</div>

<style>
	.zone-key-container {
		border: 1px solid #444;
		border-radius: 8px;
		padding: 1em;
		background-color: #252525;
		font-size: 1.0em;
		font-family: sans-serif;
	}
	h4 {
		margin-top: 0;
		color: #ff3e00;
		border-bottom: 1px solid #444;
		padding-bottom: 0.5em;
	}
	ul {
		list-style-type: none;
		padding: 0;
	}
	li {
		margin-bottom: 1em;
		background-color: #333; /* Added card background */
		padding: 1em; /* Added padding to card */
		border-radius: 5px; /* Rounded corners for card */
	}
	li p {
		margin: 0 0 0.75em 0; /* Spacing for paragraphs */
		line-height: 1.4;
		font-size: 1em;
	}
	li p:last-child {
		margin-bottom: 0; /* Remove margin from last paragraph */
	}
	.color-box {
		display: inline-block;
		width: 1em;
		height: 1em;
		margin-right: 0.5em;
		border: 1px solid #555;
		vertical-align: middle; /* Aligns box with text */
	}

	.in-game-note {
		font-style: italic;
		color: #ff9a00; /* Bright orange for in-game notes */
		border-top: 1px dashed #555;
		padding-top: 0.75em;
		font-size: 1.1em;
	}

	.color-box.red {
		background-color: rgba(255, 0, 0, 0.2);
	}
	.color-box.green {
		background-color: rgba(0, 255, 0, 0.1);
	}
	.color-box.lightblue {
		background-color: rgba(173, 216, 230, 0.5);
	}
	.color-box.grey {
		background-color: rgba(105, 105, 105, 0.5);
	}
	.color-box.brown {
		background-color: rgba(165, 42, 42, 0.5);
	}
	.color-box.white {
		background-color: rgba(255, 255, 255, 0.5);
	}
	.color-box.blue {
		background-color: rgba(0, 0, 255, 0.5);
	}
	.color-box.red-line {
		background-color: rgba(255, 0, 0, 0.5);
	}

	.notes {
		margin-top: 2em; /* More space above the notes */
		font-size: 0.9em;
		color: #aaa;
		background-color: #333;
		padding: 1em;
		border-radius: 5px;
	}
	.notes h4 {
		margin-top: 0;
	}
	.notes p {
		margin: 0 0 0.75em 0;
		line-height: 1.4;
	}
	.notes p:last-child {
		margin-bottom: 0;
	}
</style>