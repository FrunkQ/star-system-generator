<script lang="ts">
	import { createEventDispatcher } from 'svelte';
	const dispatch = createEventDispatcher();
</script>

<div class="zone-key-container">
	<button class="zk-close" title="Close key (re-select Zones to show it again)" aria-label="Close zones key" on:click={() => dispatch('close')}>×</button>
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
				<strong>Rock Line (Brown):</strong> The point where it's <em>just</em> cool enough
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
				<strong>Kill Zone (Red):</strong> The "Sterilization Zone." Radiation is so intense
				that it would prevent complex organic molecules like DNA from forming or surviving.
			</p>
			<p class="in-game-note">
				<strong>In-Game: 'Ping! You're Cooked!'</strong> This is the 'Campfire Zone.'
				Forget radiation shielding; you'll be vaporized. No life, not even microbes, can
				start here.
			</p>
		</li>

		<li>
			<p>
				<span class="color-box orange"></span>
				<strong>Danger Zone (Orange):</strong> The "Complex Life Hazard Zone." Radiation is
				too high for complex life (like humans) to survive long-term without heavy shielding.
			</p>
			<p class="in-game-note">
				<strong>In-Game: 'The Slow-Burn.'</strong> You won't die in seconds, but you'll get
				cancer in weeks. Planets here are a trap; they might be in the Goldilocks Zone, but
				they're sterile on the surface and have probably had their atmospheres stripped away.
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
				<strong>Soot Line (Grey):</strong> The line is when it gets cool enough where 
				carbon-rich compounds start to condense and polymerize into sticky solids.
			</p>
			<p class="in-game-note">
				<strong>In-Game: 'The Gunk Line.'</strong> Planets here are often rich in carbon and
				tholins (sticky organic gunk). A prime source for hydrocarbons and the raw polymers
				needed for 3D printing and manufacturing.
			</p>
		</li>

		<li>
			<p>
				<span class="color-box lightblue dashed"></span>
				<strong>Frost Line (Formation) (Dashed):</strong> The point where water ice was stable 
				during the system's birth. This boundary determined where rocky planets ended and 
				gas giants could begin to grow.
			</p>
			<p class="in-game-note">
				<strong>In-Game: 'The Fossil Line.'</strong> This is the ancient boundary of the 
				outer system. It explains why your inner planets are dry rocks and your outer ones 
				are massive gas giants. It's a historical marker of the system's evolution.
			</p>
		</li>

		<li>
			<p>
				<span class="color-box lightblue"></span>
				<strong>Frost Line (Current) (Solid):</strong> The point where it's <em>currently</em> 
				cold enough for water to freeze into solid ice. As stars age and brighten, this 
				line recedes further into the system.
			</p>
			<p class="in-game-note">
				<strong>In-Game: 'The Modern Ice Line.'</strong> Everything beyond this line is a 
				mountain of water ice today. This is where you go for reaction mass and life support. 
				Planets between the Formation and Current lines may be "thawing" out.
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
			  <strong>Lagrange Points (L1–L5):</strong> These are the five spots where the gravity of two large bodies—like a star and a planet—balances out a spacecraft’s orbital motion. 
			  The L1, L2, and L3 points are useful for observation or transit routes but aren’t naturally stable, while 
			  L4 and L5 form the only true "parking zones," where objects can remain for millennia.
			</p>
			<p class="in-game-note">
			  <strong>In-Game:</strong> L4 and L5 are the system’s sweet spots—stable enough for shipyards, pirate bases, and trade hubs. 
			  The others are waypoints or ambush points: handy for quick access, not for putting down roots.
			</p>
	</div>
</div>

<style>
	.zone-key-container {
		position: relative;
		border: 1px solid var(--border);
		border-radius: 8px;
		padding: 1em;
		background-color: #252525;
		font-size: 1em; /* You had this set to 1.0em, just tidied it */
		font-family: sans-serif;
	}
	.zk-close {
		position: absolute;
		top: 6px;
		right: 6px;
		width: 26px;
		height: 26px;
		border: 1px solid var(--status-bad, #e0484d);
		border-radius: 6px;
		background: color-mix(in srgb, var(--status-bad, #e0484d) 16%, var(--bg-control, #333));
		color: var(--status-bad, #e0484d);
		cursor: pointer;
		line-height: 1;
		font-size: 1.1rem;
		font-weight: 700;
	}
	.zk-close:hover { background: color-mix(in srgb, var(--status-bad, #e0484d) 30%, var(--bg-control, #333)); }
	h4 {
		margin-top: 0;
		color: var(--accent);
		border-bottom: 1px solid var(--border);
		padding-bottom: 0.5em;
	}
	ul {
		list-style-type: none;
		padding: 0;
	}
	li {
		margin-bottom: 1em;
		background-color: var(--bg-panel); /* Added card background */
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
		border: 1px solid var(--border);
		vertical-align: middle; /* Aligns box with text */
	}
	.color-box.dashed {
		border: 1px dashed #fff;
	}

	.in-game-note {
		font-style: italic;
		color: #ff9a00; /* Bright orange for in-game notes */
		border-top: 1px dashed var(--border);
		padding-top: 0.75em;
		font-size: 1.1em;
	}

	/* Legend swatches use the solid --zone-* tokens (clearer key + reskins with /palette). */
	.color-box.red {
		background-color: var(--zone-kill);
	}
	.color-box.orange {
		background-color: var(--zone-danger);
	}
	.color-box.green {
		background-color: var(--zone-habitable);
	}
	.color-box.lightblue {
		background-color: var(--zone-frost-line);
	}
	.color-box.grey {
		background-color: var(--zone-soot-line);
	}
	.color-box.brown {
		background-color: var(--zone-rock-line);
	}
	.color-box.white {
		background-color: var(--zone-co2-ice);
	}
	.color-box.blue {
		background-color: var(--zone-co-ice);
	}
	.color-box.red-line {
		background-color: var(--zone-roche);
	}

	.notes {
		margin-top: 2em; /* More space above the notes */
		font-size: 0.9em;
		color: var(--text-muted);
		background-color: var(--bg-panel);
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
