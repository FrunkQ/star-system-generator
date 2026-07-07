LogLevel 0

Star	"Sun/Sol"
{
	ParentBody "Solar System"

	Class      "G2V"
	Luminosity  1.0
	LumBol      1.0
	Temperature 5778
	Age         4.57
	FeH         0.0

	MassSol     1.0
	RadSol      1.0
	Oblateness  9e-6
	
	RotationModel "IAU"
	{
		ValidRange      "Unlimited"
		Epoch			2451545	// J2000
		PoleRA			286.13	// degrees
		PoleDec			63.87	// degrees
		PrimeMeridian	84.176	// degrees
		RotationRate	14.1844	// degrees/day
	}
	
	Orbit
	{
		AnalyticModel  "Sun-DE"
		RefPlane       "Ecliptic"
	}
}

Planet	"Mercury"
{
	DateUpdated    "2023-04-04"
	ParentBody     "Sun"
	Class          "Ferria"

	Mass            0.05528
	Radius          2440

	AlbedoBond      0.088 // Mallama, 2017
	AlbedoGeom      0.142
	Brightness      1.0
	BrightnessReal  0.45 // J. Veverka et al., 1988
	
	RotationPeriod  1407.509405
	RotationOffset  291.2
	Obliquity       7.01
	EqAscendNode    48.42

	RotationModel "IAU"
	{
		ValidRange      "Unlimited"
		Epoch			2451545		// J2000
		PoleRA      	281.0097	// degrees
		PoleRARate  	-0.0328		// degrees/century
		PoleDec     	61.4143		// degrees
		PoleDecRate 	-0.0049		// degrees/century
		PrimeMeridian	329.5469	// degrees
		RotationRate	6.1385025	// degrees/day
		PeriodicTermsDiurnal		// SUM [ amp[i] * sin(phase[i] + frequency[i] * t_days + freq_rate[i] * t_days^2) ]
		{
			// PoleRA amp, PoleDec amp, PrimeMer amp, phase, freq, freq_rate
			0, 0, +0.00993822, 174.791086,  4.092335, 0,
			0, 0, -0.00104581, 349.582171,  8.184670, 0,
			0, 0, -0.00010280, 164.373257, 12.277005, 0,
			0, 0, -0.00002364, 339.164343, 16.369340, 0,
			0, 0, -0.00000532, 153.955429, 20.461675, 0,
		}
	}
	
	Interior
	{
		Composition // mass fraction, values in percent
		{
			Silicates	40
			Metals		60
		}
	}

	Surface
	{
		// Surface map authors: Sean Young "HarbingerDawn", "FarGetaNik"
		DiffMap        "Mercury/Surface-HD"
		DiffMapAlpha   "None"

		// Elevation map author: Sean Young "HarbingerDawn"
		BumpMap        "Mercury/Bump-HD"
		BumpHeight      10.289
		BumpOffset		5.889

		Hapke           1.0
		SpotWidth       0.09 // J. Veverka et al., 1988
		SpotBright      2.5 // J. Veverka et al., 1988
	}

	NoAtmosphere    true
	NoAurora        true
	NoRings         true

	Orbit
	{
		AnalyticModel  "Mercury-DE"
		RefPlane       "Ecliptic"
		Period          0.2408
		SemiMajorAxis   0.3871
		Eccentricity    0.2056
		Inclination     7.0049
		AscendingNode   48.33167
		LongOfPericen   77.456
		MeanLongitude   252.251
		ArgOfPeriPreces 227000 // period of precession in years
	}
}

Barycenter	"Earth-Moon"
{
	ParentBody     "Sun"
	Orbit
	{
		AnalyticModel "EMB-DE"
		RefPlane      "Ecliptic"
		Period         1.0          // years
		SemiMajorAxis  1.0000010178 // a.u.
		Eccentricity   0.0167086342
		Inclination    0.0          // degrees
		AscendingNode  348.739      // degrees
		LongOfPericen  102.93734808 // degrees
		MeanLongitude  100.46645683 // degrees
	}
}

Planet	"Earth"
{
	DateUpdated    "2023-04-04"
	ParentBody     "Earth-Moon"
	Class          "Terra"

	Mass            1.0			// Earth's masses
	Radius          6378.14     // km, IAU 2015 value used in SE internally
	Oblateness      0.00335
	OblatenessX     0.1

	Age	            4.54        // billions years

	Color         ( 0.850 0.850 1.000 )
	AlbedoBond      0.306
	AlbedoGeom      0.367
	Brightness      1.0
	BrightnessReal  1.0

	// Simple uniform rotation parameters, used only if RotationModel is missing
	RotationPeriod  23.9344694  // hours
	Precession      25592       // period of precession in years
	Obliquity       23.4392911  // degrees
	EqAscendNode    180.0		// degrees
	RotationOffset -23.9        // degrees

	RotationModel "IAU"
	{
		ValidRange      "Unlimited"
		TidalLocked		false		// Don't fall back to a simple tidal locked solution outside of the validity range
		Epoch			2451545		// J2000
		PoleRA			0			// degrees
		PoleRARate		-0.641		// degrees/century
		PoleDec			90			// degrees
		PoleDecRate		-0.557		// degrees/century
		PrimeMeridian	190.147		// degrees
		RotationRate	360.9856235	// degrees/day
	}

	Life
	{
		Class   "Organic"
		Type    "Multicellular"
		Biome   "Marine/Terrestrial"
	}

	Interior
	{
		Composition // mass fraction, values in percent
		{
			Ices        2.444e-4
			Silicates	68
			Metals		32
		}
	}

	Surface
	{
		// Surface map author: Robert Skuridin "PBC"
		DiffMap        "Earth/Surface-PBC"
		DiffMapAlpha   "Water"

		// Elevation map author: Robert Skuridin "PBC"
		BumpMap        "Earth/Bump-PBC"
		BumpHeight      19.475 // = 10896 + 8579 meters of total elevation span
		BumpOffset      10.896 // = 10896 meters below sea level

		// City lights map author: Sean Young "HarbingerDawn", based on John van Vliet's map
		GlowMap        "Earth/Lights-HD"
		GlowMode       "Night"
		GlowColor      (1.0 1.0 1.0)	// map itself is RGB
		GlowBright      1.0

		SpecBrightIce   0.65
		SpecBrightWater 0.85
		colorSea       (0.012 0.03 0.06 1.00)
		colorShelf     (0.15 0.48 0.46 1.00)
	}

	Ocean
	{
		Height 10.896

		Composition // values in percent
		{
			H2O  96.5
			NaCl 3.5
		}
	}

	Clouds
	{
		// Clouds map author: Vladimir Romanyuk "SpaceEngineer"
		DiffMap        "Earth/Clouds-SE"

		BumpMap        "Earth/Clouds-SE"
		BumpHeight      0.5
		BumpOffset      0.0

		//DayAmbient      3.0
		Hapke           0.2
		Height          9.0 //3.5
		Velocity        0.0 // km/h
		ModulateColor  (1.0 1.0 1.0)
		ModulateBright  1.333
		Opacity         1.333
	}

	Atmosphere
	{
		Height      60		// km
		Greenhouse  33		// degrees K
		Pressure    1.0		// atm
		Density     1.2929	// kg/m^3
		Adiabat     0.28
		Model      "Earth"
		Bright      10.0
		Opacity     1.0
		SkyLight    3.0
		
		Composition // values in percent
		{
			N2  77.7729
			O2  20.8625
			Ar  0.9303
			H2O 0.4000
			CO2 0.0420
			Ne  0.00182
			He  0.00046
			CH4 0.00019
			Kr  0.000114
			H2  0.00005
			Xe  0.0000087
		}
	}

	Aurora
	{
		Height       100   // km
        TopColor    (0.5 0.5 0.5)	// multiplier
        BottomColor (0.0 1.0 0.0)	// color

		NorthLat     82    // degrees
		NorthLon    -113   // degrees
		NorthRadius  2500  // km
		NorthWidth   600   // km
		NorthRings   3     // number of rings
		NorthBright  0.3

		SouthLat    -63    // degrees
		SouthLon     138   // degrees
		SouthRadius  2000  // km
		SouthWidth   600   // km
		SouthRings   3     // number of rings
		SouthBright  0.3
	}

	NoRings     true

	Orbit
	{
		AnalyticModel  "Earth-EMB-DE"
		RefPlane       "Ecliptic"
		Period          0.07480422854	// years
		SemiMajorAxis   0.000031610219244232	// a.u.
		Eccentricity    0.0549
		Inclination     5.15		// deg
		MeanAnomaly     135.27		// deg
		AscendingNode   125.08		// deg
		ArgOfPericen    138.15		// deg
		//AscNodePreces   18.6		// years
		//ArgOfPeriPreces 5.997		// years
	}

	Climate
	{
		GlobalWindSpeed 3.3 // characteristic global windspeed in m/s, for new climate model. https://www.scientificamerican.com/article/the-worlds-winds-are-speeding-up/
		AtmoProfile     "Earth"	// name of vertical atmosphere profile
	}
}

Moon	"Moon/Earth I"
{
	DateUpdated    "2023-04-04"
	ParentBody     "Earth-Moon"
	Class          "Terra"

	Mass            0.012302
	Radius          1737.4
	Oblateness      0.002

	AlbedoBond      0.11
	AlbedoGeom      0.12
	Brightness      0.8
	BrightnessReal  0.33

	//Obliquity       5.15
	//EqAscendNode    125.08
	//RotationOffset -90

	RotationModel "Moon-DE"
	{
		ValidRange "AsOrbit"
	}

	/*RotationModel	"IAU"
	{
		ValidRange      "AsOrbit"
		Epoch			2451545		// J2000
		PoleRA      	269.9949	// degrees
		PoleRARate  	0.0031		// degrees/century
		PoleDec     	66.5392		// degrees
		PoleDecRate 	0.0130		// degrees/century
		PrimeMeridian	38.3213		// degrees
		RotationRate	13.17635815	// degrees/day
		RotationAccel	-0.0018677	// degrees/century^2 -- converted from -1.4e-12 degrees/day^2
		PeriodicTermsDiurnal		// SUM [ amp[i] * sin(phase[i] + frequency[i] * t_days + freq_rate[i] * t_days^2) ]
		{
			// PoleRA amp, PoleDec amp, PrimeMer amp, phase, freq, freq_rate
			-3.8787, +1.5419, +3.5610, 125.045, -0.05299210, 0,
			-0.1204, +0.0239, +0.1208, 250.089, -0.10598420, 0,
			+0.0700, -0.0278, -0.0642, 260.008, +13.0120009, 0,
			-0.0172, +0.0068, +0.0158, 176.625, +13.3407154, 0,
			 0.0000,  0.0000, +0.0252, 357.529, +0.98560030, 0,
			+0.0072, -0.0029, -0.0066, 311.589, +26.4057084, 0,
			 0.0000, +0.0009, -0.0047, 134.963, +13.0649930, 0,
			 0.0000,  0.0000, -0.0046, 276.617, +0.32871460, 0,
			 0.0000,  0.0000, +0.0028,  34.226, +1.74848770, 0,
			-0.0052, +0.0008, +0.0052,  15.134, -0.15897630, 0,
			 0.0000,  0.0000, +0.0040, 119.743, +0.00360960, 0,
			 0.0000,  0.0000, +0.0019, 239.961, +0.16435730, 0,
			+0.0043, -0.0009, -0.0044,  25.053, +12.9590088, 0,
		}
	}*/

	Interior
	{
		Composition // mass fraction, values in percent
		{
			Silicates	98
			Metals		2
		}
	}

	Surface
	{
		// Surface map author: "Klud"
		DiffMap        "Moon/Surface-KL"

		// Elevation map author: "Klud"
		BumpMap        "Moon/Bump-KL"
		BumpHeight      19.91	// 9.129 + 10.781
		BumpOffset      9.129

		Hapke           1.0
		SpotBright      1.75	// Sato et al., 2014
		SpotWidth       0.06	// Sato et al., 2014
	}

	NoAtmosphere    true
	NoAurora        true
	NoRings         true

	Orbit
	{
		AnalyticModel  "Moon-EMB-DE"
		RefPlane       "Ecliptic"
		Period          0.07480422854
		SemiMajorAxis   0.002537908496755768
		Eccentricity    0.0549
		Inclination     5.15
		MeanAnomaly     135.27
		AscendingNode   125.08
		ArgOfPericen    318.15
		//AscNodePreces   18.6		// years
		//ArgOfPeriPreces 5.997		// years
	}
}
