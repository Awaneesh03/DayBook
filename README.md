# Daybook

A 3D study-room journal: a single self-contained page (`index.html`). See `CONTEXT.md` for the features, data model and code map.

- `index.html` is the built page. It needs internet access for three.js r128 (cdnjs) and Google Fonts. Open it directly in a browser; no server is needed.
- `src/` is the source, in build order: `p1_css_a.html`, `p2_css_b.html` (page head and styles), `p3_body.html` (markup), then the scripts
  `j1_core` → `j2_paint` → `j3_data` → `j4_room` → `j5_room_actions` → `j6_reader` → `j7_decor` → `j8_pops` → `j9_studio` → `j10_library` → `j12_turn` → `j11_boot`.

**Build:** edit `src/`, then run `python3 build.py`. It concatenates the parts, adds the three.js r128 script tag, wraps all the scripts in one
`(function () { 'use strict'; ... })();`, and overwrites `index.html`. Two builds of the same source are byte-identical.

**Saving:** inside Claude it saves to the viewer's private storage (`window.claude` db capability).
Opened anywhere else it falls back to the browser's localStorage, so journals stay on that device only.

**Tests:** install `playwright-core` (`npm i playwright-core`), rebuild, then run any of:

- `node tests/test_transitions.mjs`: room-to-journal transitions.
- `node tests/test_weather_audio.mjs`: weather, ambience and persistence.
- `node tests/test_stability.mjs`: room materials, hidden panels, PIN lock, custom presets, starter presets.
- `node tests/test_tour.mjs`: the guided tour bar and its controls.

They drive Google Chrome (set `CHROME=` for another path) and need internet. `ONLY="text"` runs just the tests whose name contains the text,
and passing a path tests another build instead of `index.html`.

**Known limitations** (details in `CONTEXT.md`):

- **Unresolved:** one stability run once lost a custom preset that was saved immediately before a page reload. It has not
  reproduced since, so the cause is unknown and it is not fixed; `tests/test_stability.mjs` reports the stage if it happens again.
- Drifting Clouds only dims the sky, and Starry Twilight looks like a clear night.
- Changes synced from another tab or device are stored, but the room and sound only pick them up after a reload.
- Tour stops assume the default desk layout; objects moved in arrange mode can fall outside a stop's frame.
- Tested in Google Chrome only (software rendering in headless mode).
