# ATMO — The World's Weather OS

A futuristic weather-forecasting interface: a morphing 3D atmosphere orb, a holographic forecast timeline, and a 14-day AI outlook — built as a self-contained front-end prototype with no framework and no build step.

Everything is vanilla HTML, CSS and JavaScript. The orb is shaded per-pixel in a canvas, the clouds come from a seamless noise field, and the whole thing runs from `file://`.

## Highlights

- **Morphing atmosphere orb** — a per-pixel sphere shader that re-lights and re-textures itself per state: a glowing star (clear), a cloud marble (cloudy), liquid glass with ripples (rain), and drifting plasma filaments (storm).
- **Volumetric cloud field** — seamless equirectangular noise maps sampled on the sphere, so the clouds scroll and tile without seams or pole pinching.
- **Live weather effects** — rain streaks, procedural lightning with forked branches and a screen flash, composited at device resolution.
- **Holographic forecast** — a scroll-snapped timeline whose cards tilt in 3D, with floating icons and spring easing.
- **Instrument widgets** — a fluid AQI meter, a vector-field wind map, and glowing UV/humidity rings.
- **AI prediction timeline** — 14 days of confidence, temperature range and precipitation probability.
- **AR sky view** — a full-screen sky scene with cloud layers, horizon ticks, a reticle and lightning flashes during storms.
- **Voice console** — an animated waveform with canned query/answer pairs.
- **City picker** — swap stations and the whole app follows that city's weather.

## Run it

No install, no build, no dependencies:

```bash
# just open the file
open index.html          # macOS
start index.html         # Windows

# or serve it, if you prefer
python -m http.server 8000
```

The app deliberately uses classic `<script>` tags rather than ES modules so that opening `index.html` directly from disk works.

## Controls

- **Orb / `Space`** — cycle weather states: clear → cloudy → rain → storm
- **Location (top left)** — open the city picker and switch station
- **Header buttons** — AR sky view, voice console
- **Dock** — Home, Layers, AI, AR
- **`Esc`** — close any open panel
- **Drag the forecast** — scroll the holographic timeline

## Structure

```
index.html         markup + SVG icon sprite
css/styles.css     design tokens, glass/neumorphic surfaces, layout, animation
js/noise.js        3D value noise, fBm, equirectangular cloud maps, lightning generator
js/orb.js          sphere shader, state palettes, particles, adaptive quality
js/effects.js      starfield, screen-rain overlay, wind vector field
js/widgets.js      AQI meter, rings, forecast, AI chart, voice waveform, data model
js/app.js          boot sequence, state machine, interactions, AR, city picker
```

## Performance notes

- The shader refreshes at 30 Hz — the cloud field evolves slowly — while the vector overlays stay at 60 Hz.
- Sphere geometry (normal, UV, grid latitude) is precomputed once per resolution, so per-frame work is lighting plus bilinear texture fetches.
- An adaptive ladder (340 → 300 → 264 → 232 px) samples shader cost and steps resolution down or up to hold the frame budget.
- Parallax and float animations use individual CSS properties (`translate`, `rotate`, `scale`) so they never fight the inline transforms.

## Notes

- Space Grotesk and JetBrains Mono load from Google Fonts; offline the app falls back to the system font stack.
- All weather data is fictional and hard-coded per state — this is a UI prototype, not a data product.
- Developed against Chromium-based browsers.
