// Retro Sci-Fi Green CRT Filter
// Adapted for EffectComposer post-processing: tDiffuse = composited scene render target.
// All layers (map + fog) are already composited — shader sees one flat image.
#ifdef GL_ES
precision mediump float;
#endif

uniform sampler2D tDiffuse;
uniform float uScanlineIntensity;
uniform float uScanlineThickness;
uniform float uCrtWarp;
uniform float uBrightness;
uniform float uContrast;
uniform float uTint;      // phosphor tint strength 0..1
uniform vec3  uPhosphor;  // phosphor colour (green / amber / red / blue / …)
uniform float uGhostIntensity;
uniform float uGhostDistance;
uniform float uTearFrequency;
uniform float uNoiseBarWidth;
uniform float uNoiseBarSpeed;
uniform float uVignetteAmount;
uniform float uInvertColors;
uniform float uFlicker;
uniform float uPictureRoll;
uniform float uDistortion;
uniform float uInterference;
uniform float uSkew;
uniform float uChromaticAberration;
uniform float uRoundedCorners;
uniform vec2  resolution;
uniform float time;

varying vec2 vUv;

#define PI 3.1415926

float random(vec2 st) {
    return fract(sin(dot(st.xy, vec2(12.9898, 78.233))) * 43758.5453123);
}

float scanline(vec2 screenCoord, float intensity, float thickness) {
    float cycleHeight = max(thickness, 1.0);
    float lineFactor = mod(screenCoord.y, cycleHeight);
    float lineCenter = cycleHeight * 0.5;
    float darkLineHalfWidth = cycleHeight * 0.25;
    float dist = abs(lineFactor - lineCenter);
    float lineValue = step(darkLineHalfWidth, dist);
    return mix(1.0 - intensity, 1.0, lineValue);
}

float vignette(vec2 uv, float amount) {
    uv = uv - 0.5;
    float radius = 0.75 - amount * 0.4;
    float softness = 0.4;
    return smoothstep(radius + softness, radius - softness, length(uv));
}

vec2 barrelDistortion(vec2 uv, float amount) {
    vec2 centeredUv = uv * 2.0 - 1.0;
    float distSq = dot(centeredUv, centeredUv);
    vec2 warpedUv = centeredUv * (1.0 + amount * distSq);
    return (warpedUv + 1.0) / 2.0;
}

float roundedCornerSDFMask(vec2 uv, float radius) {
    vec2 p = uv - 0.5;
    vec2 b = vec2(0.5 - radius);
    float d = length(max(abs(p) - b, 0.0)) - radius;
    return 1.0 - smoothstep(-0.005, 0.005, d);
}

vec3 processColor(vec3 aberrColor, vec2 screenCoord, vec2 baseUv, bool isInsideNoiseBar, float posInBar) {
    vec3 processed = aberrColor;

    if (uInvertColors > 0.5) { processed = vec3(1.0) - processed; }

    processed = (processed - 0.5) * uContrast + 0.5;
    processed = processed * uBrightness;

    float scan = scanline(screenCoord, uScanlineIntensity, uScanlineThickness);
    processed *= scan;

    float interferenceNoise = random(baseUv * 0.6 + time * 0.05);
    float interferenceFactor = smoothstep(0.75 - uInterference * 0.2, 0.75 + uInterference * 0.2, interferenceNoise);
    processed += interferenceFactor * uInterference * vec3(0.95);

    if (isInsideNoiseBar) {
        float lineSeed = random(vec2(floor(baseUv.y * 200.0), floor(time * 30.0)));
        float intensityX = random(vec2(lineSeed, 3.3)) * 1.5 + 0.3;
        float streakNoise = random(baseUv.xy * vec2(15.0, 5.0) + vec2(lineSeed, time * 25.0));
        if (streakNoise < 0.25) {
            float blackOrWhite = random(vec2(lineSeed, 4.4));
            vec3 streakColor = (blackOrWhite > 0.5) ? vec3(1.0) : vec3(0.0);
            float mixFactor = clamp(intensityX * (1.0 - posInBar * 0.5), 0.0, 1.0);
            processed = mix(processed, streakColor, mixFactor);
        }
    }

    float flickerAmount = (random(vec2(time * 8.0)) - 0.5) * uFlicker;
    processed += flickerAmount;

    processed = clamp(processed, 0.01, 0.99);

    if (uTint > 0.0) {
        // Monochrome phosphor: map luminance onto the chosen phosphor colour, blended by strength.
        float lum = dot(processed, vec3(0.299, 0.587, 0.114));
        vec3 tinted = lum * uPhosphor * 1.6; // 1.6 keeps a lit phosphor bright, not muddy
        processed = mix(processed, clamp(tinted, 0.0, 1.0), uTint);
    }

    return processed;
}

void main() {
    vec2 warpedUv = barrelDistortion(vUv, uCrtWarp);
    vec2 finalUv = warpedUv;
    finalUv.y = fract(finalUv.y + time * uPictureRoll);
    finalUv.x += (finalUv.y - 0.5) * uSkew;
    float distortionOffset = (random(vec2(finalUv.y * 15.0, time * 0.4)) - 0.5) * uDistortion;
    finalUv.x += distortionOffset;

    bool tearActive = false;
    if (uTearFrequency > 0.01) {
        float cycleNum = floor(time / uTearFrequency);
        float randomOffset = (random(vec2(cycleNum)) - 0.5) * uTearFrequency;
        float triggerTime = (cycleNum * uTearFrequency) + randomOffset + (uTearFrequency * 0.5);
        if (abs(time - triggerTime) < 0.1) { tearActive = true; }
    }
    if (tearActive) {
        float yPos = finalUv.y + fract(time * 5.0);
        float v_pow = pow(0.5 - 0.5 * cos(2.0 * PI * yPos * 15.0), 40.0);
        finalUv.x += v_pow * sin(2.0 * PI * yPos * 15.0) * 0.08;
    }

    bool isInsideNoiseBar = false;
    float posInBar = 0.0;
    if (uNoiseBarWidth > 0.0) {
        float barHeightUv = uNoiseBarWidth / 100.0;
        float effectY = finalUv.y + time * uNoiseBarSpeed * 0.5;
        float cyclePos = fract(effectY);
        float edgeNoise = (random(vec2(finalUv.x * 40.0, floor(time * 3.0))) - 0.5) * 0.3;
        float effectiveBarHeight = max(barHeightUv + edgeNoise * barHeightUv, 0.0);
        if (cyclePos < effectiveBarHeight) {
            isInsideNoiseBar = true;
            posInBar = cyclePos / max(effectiveBarHeight, 0.01);
            float skewFactor = pow(1.0 - posInBar, 2.0);
            float randomShift = (random(vec2(finalUv.y * 5.0, floor(time * 8.0))) - 0.5) * 2.0;
            finalUv.x += skewFactor * -0.3 * randomShift;
        }
    }

    vec2 sampleUv = fract(finalUv);
    vec2 ghostOffset = vec2(uGhostDistance / resolution.x, 0.0);
    vec2 ghostSampleUv = fract(finalUv + ghostOffset);

    vec2 centerOffs = vUv - 0.5;
    float aberrDist = length(centerOffs);
    vec2 aberrDir = (aberrDist > 0.0001) ? normalize(centerOffs) : vec2(0.0);
    vec2 aberrOffs = aberrDir * uChromaticAberration * aberrDist;

    float r_main = texture2D(tDiffuse, fract(sampleUv + aberrOffs)).r;
    float g_main = texture2D(tDiffuse, fract(sampleUv)).g;
    float b_main = texture2D(tDiffuse, fract(sampleUv - aberrOffs)).b;
    vec3 mainColor = vec3(r_main, g_main, b_main);

    vec3 ghostColor = vec3(0.0);
    if (uGhostIntensity > 0.0) {
        float r_g = texture2D(tDiffuse, fract(ghostSampleUv + aberrOffs)).r;
        float g_g = texture2D(tDiffuse, fract(ghostSampleUv)).g;
        float b_g = texture2D(tDiffuse, fract(ghostSampleUv - aberrOffs)).b;
        ghostColor = vec3(r_g, g_g, b_g);
    }

    vec3 blended = mix(mainColor, ghostColor, uGhostIntensity);
    vec3 result = processColor(blended, gl_FragCoord.xy, vUv, isInsideNoiseBar, posInBar);

    result *= vignette(vUv, uVignetteAmount);
    float cornerMask = roundedCornerSDFMask(vUv, uRoundedCorners);
    result *= cornerMask;

    gl_FragColor = vec4(clamp(result, 0.0, 1.0), 1.0);
}
