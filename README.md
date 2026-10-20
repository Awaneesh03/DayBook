# Daybook

A 3D study-room journal: a single self-contained page (`index.html`).

- `index.html` is the full, built page. It needs internet access for three.js (cdnjs) and Google Fonts.
- `src/` holds the same code split into parts, in build order:
  `p1_css_a.html`, `p2_css_b.html` (styles), `p3_body.html` (markup), then the scripts
  `j1_core` → `j2_paint` → `j3_data` → `j4_room` → `j5_room_actions` → `j6_reader` → `j7_decor`
  → `j8_pops` → `j9_studio` → `j10_library` → `j12_turn` → `j11_boot`, all wrapped in one
  `(function(){ 'use strict'; ... })()` after the three.js r128 script tag.

Saving: inside Claude it saves to the viewer's private storage (`window.claude` db capability).
Opened anywhere else it falls back to the browser's localStorage, so journals stay on that device only.

Tests: `npm i playwright-core`, then `node tests/test_transitions.mjs` (needs Google Chrome and internet; set CHROME= for another path).
