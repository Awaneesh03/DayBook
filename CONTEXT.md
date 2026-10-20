# Daybook: project context (for ChatGPT / any AI assistant)

Paste this whole file into a chat before asking questions or requesting changes.

## 1. What it is
Daybook is a **3D study-room journaling app** in a single, self-contained web page (`index.html`, ~275 KB). The user sits in a rendered 3D study with a desk, lamp, window and bookshelf. Each journal is a physical book on the shelf. You take one down, open it, and write in it with a choice of pens. Ink appears as if the pen is writing it.

- No build tool, no framework, no backend, no npm. Plain HTML, CSS and vanilla JS (~3,500 lines in total).
- External dependencies, loaded from CDNs: **three.js r128** (cdnjs) for the 3D room, and **Google Fonts** (Cormorant Garamond, Pinyon Script, Caveat, Kalam, Patrick Hand, Reenie Beanie, Nanum Brush Script, Dancing Script, Homemade Apple, Special Elite, Manrope). It needs internet to run.
- It was built to run as a Claude Artifact. Inside Claude it saves through `window.claude` (the `db`, `user` and `downloads` capabilities). Anywhere else it falls back to `localStorage`.

## 2. Folder layout
```
daybook-source/
├── index.html    The full built page: all CSS, markup and JS inlined. This is what gets opened or published.
├── README.md     Short build notes.
└── src/          The same code split into parts, in build order:
    ├── p1_css_a.html, p2_css_b.html   Styles
    ├── p3_body.html                   Markup (HUD, library drawer, reader, cover studio, welcome, lock screen)
    └── j1 … j12 (.js)                 Scripts, wrapped in ONE  (function(){ 'use strict'; ... })()
```
**Script concatenation order:** `j1_core → j2_paint → j3_data → j4_room → j5_room_actions → j6_reader → j7_decor → j8_pops → j9_studio → j10_library → j12_turn → j11_boot`. Note that j12 comes before j11. Everything shares one closure scope, so there are no imports or exports.
**There is no build script in the folder.** `index.html` is produced by hand-concatenating the parts: CSS, then body, then the three.js script tag, then the JS. If you change `src/`, `index.html` has to be rebuilt to match.

| File | Responsibility |
|---|---|
| `j1_core.js` | Helpers (`$`, `$$`, `h()` DOM builder, dates) and the **catalogue**: pens, inks, papers, rulings, moods, cover options, stickers, washi tapes, prompts, templates, badges. |
| `j2_paint.js` | Photo handling (compressed and stored privately with the journals). Canvas painting of covers, emblems, foil, and brush strokes for cover and page doodles. |
| `j3_data.js` | Data model, defaults, `normJ`/`normLib`, the two storage back-ends (`localStore`, `cloudStore`), debounced saving, remote-sync handlers, legacy import, and the stats (streaks, words). |
| `j4_room.js` | The three.js scene: room, desk, shelf, books, lamp, window, day/night sky, camera, pointer picking, render loop. |
| `j5_room_actions.js` | Taking books down and putting them back. **Web Audio sound** (ambience and pen sounds, all synthesised, no audio files). Confetti. |
| `j6_reader.js` | The two-page spread reader. Typing, the animated ink overlay, the pen that follows the caret, page style and render. |
| `j7_decor.js` | Page decorations (photos, stickers, washi tape, sticky notes) and doodle/highlighter drawing on pages. |
| `j8_pops.js` | The reader's pop-up panels: pens and ink, paper, decorate, templates and prompts, bookmarks / go-to-page, "more" (journal menu, export, delete). Also Markdown export. |
| `j9_studio.js` | The **cover studio** modal: style, draw, photos, text, stickers, with undo. |
| `j10_library.js` | The library drawer (Journals, Calendar, Insights, Settings tabs). PIN lock, welcome dialog, "On this day" memories. |
| `j12_turn.js` | Page-turn animation (a curling sheet that follows a finger or mouse), swipe and drag gestures, and room styling (wall, wood, lamp). Constant `MAX_PAGES = 999`. |
| `j11_boot.js` | Startup: generates paper textures procedurally, waits for fonts, wires all UI events, loads the store, starts the scene. |

## 3. Features

### The 3D room
- Interactive three.js study. Tap a book on the shelf to take it to the desk, and tap it again on the desk to open it.
- **Desk lamp** toggle. **Sky** setting: follow the user's clock, always day, or always night.
- **Room styling:** wall colour (Sage, Midnight navy, Dusty blush, Warm cream, Charcoal, Forest and others), wood for desk, shelf and floor (Walnut, Light oak, Ebony, Whitewashed, Cherry), and lamp light (Warm, Neutral, Cool, Amber).
- Fallback: a `no3d` body class exists for devices that cannot do WebGL.

### Writing
- **9 pens:** Fountain, Ballpoint, Gel, Pencil, Felt marker, Brush pen, Calligraphy, Feather quill, Typewriter. Each has its own handwriting font, size and sound.
- **12 inks**, including white, gold and silver gel pens for dark paper.
- **Animated ink:** words appear as if written, with a small pen drawn at the caret. This can be turned off.
- **Paper:** 10 colours (Fresh white, Ivory, Old parchment, Brown kraft, Rose, Sky blue, Mint, Lavender, Butter yellow, Midnight black). Rulings are Lined, Dotted, Grid or Blank. Text size is Small, Medium or Large. Paper textures are generated procedurally.
- **Per-journal defaults** for paper, ruling, pen, ink and scale, with an option to apply a page's style to the whole journal.
- **10 templates** (Daily reflection, Gratitude, Morning pages, Dream log, Travel day, Weekly review, To-do list, Letter to future me, Mood check-in, Book notes) and **20 writing prompts**.
- **Mood tracking** per page on a 5-level scale (Rough, Low, Okay, Good, Great).
- **#tags** inside text, which become clickable search chips.
- A daily **word-goal ring** in the reader.
- Up to **999 pages** per journal. Page numbers can be reached with a go-to field and slider.
- **Bookmarks** with 8 colours and a label (for example "Trip to Goa"), shown as ribbons.

### Scrapbooking a page
- Photos (compressed and stored with the journal), emoji **stickers** (56), **washi tape** (8 patterns), and notes.
- Freehand **doodle** and **highlighter** (5 colours) drawing directly on pages, with a draw toolbar.
- A page that holds too much drawing data is blocked from saving (about 245 KB per page cap), with a message.

### Cover studio (design your own journal)
- Cover colour (16), material (Leather, Linen, Velvet, Kraft card, Marbled, Canvas), pattern (Frame, Corners, Band, Stripes, Dots, Stars, Waves), emblem (Moon, Sun, Star, Heart, Leaf, Flower, Feather, Compass, Mountain), foil (Gold, Silver, Copper, Rose gold, Black ink, Cream).
- Title font (Classic, Script, Handwritten, Modern, Typewriter), plus free-form layers on the cover: drawing, photos, text boxes (8 fonts) and stickers.
- Book size (Pocket, A5, Tall), thickness (Slim, Regular, Thick) and ribbon colour. The spine is drawn too.
- Starter journals: **Daily Journal, Gratitude, Dreams, Notes & Ideas**.

### Page turning
- A real curling sheet that follows a finger. Mouse users drag a page corner. Arrow keys also work.
- Settings for speed (Slow and gentle or Natural) and paper curl on/off.

### Library drawer (4 tabs)
1. **Journals:** summary stats (journals, pages, words, day streak), "On this day" memory cards (entries from past months or years on today's date), **search across all journals**, top tags, and the journal list with covers.
2. **Calendar:** month view of the days written. Selecting a day shows that day's entries.
3. **Insights:** an 18-week writing heatmap, a 30-day mood chart, when you write, top tags, and **12 badges** (First page, 3-day streak, One week, One month, 1,000 words, 10,000 words, 25 pages, Cover artist, Scrapbooker, Night owl, Early bird, Collector). Streak milestones (3, 7, 14, 30, 50, 100, 200, 365) trigger confetti.
4. **Settings:** daily word goal, animated pen, pen sounds, sky mode, room styling, page turning, PIN lock, export, replay welcome tips.

### Sound (all generated with the Web Audio API)
- Ambience: Quiet, Rain on the window, Crackling fireplace, Ocean waves, Summer night (crickets), Café murmur.
- Pen sounds: scratch, smooth, pencil, felt and typewriter clack. Volume setting.

### Privacy and security
- **PIN lock:** 4 to 6 digits, stored as a hash (`pinHash`) with an optional hint. It asks for the PIN on open and after 3 minutes away, and has a manual "Lock now". This is a casual privacy feature, not strong encryption.
- Inside Claude, journals are stored per user under `data/users/<uid>/lib` and are only readable by that user.

### Data and export
- **Export** a single journal or all journals as Markdown (`.md`), including page numbers, dates and moods.
- Imports entries from an older "daybook:v1" data format into the first journal.
- Welcome dialog for new users with 4 quick tips.
- Accessibility basics are present: ARIA roles and labels, `aria-live` toasts, dialog roles, keyboard support.

## 4. Data model (in `j3_data.js`)
- `state = { lib, pages: Map, store, ready }`
- **`lib`** (version 3): `{ v:3, journals:[…], activeId, settings:{…} }`
  - Journal: `{ id, title, subtitle, order, created, size, thick, ribbon, pages(count), bookmarks:[{n,color,label}], last, cover:{color,material,pattern,emblem,foil,font}, defaults:{paper,ruling,pen,ink,scale}, art:{hideTitle,layers:[]} }`
  - Settings defaults: `sky:'auto', lamp:true, goal:250, animate:true, penSound:true, volume:.6, pinHash:null, ambient:'off', turnSpeed:'normal', curl:true, wall:'sage', wood:'walnut', …`
- **Page**, keyed `"<journalId>~<pageNumber>"`: `{ j, n, text, date (YYYY-MM-DD), mood (0–5), style?, items?[], ink?[], updatedAt }`. Empty pages are deleted, not stored.
- **Media:** photos are stored separately by id.
- **Storage adapters** share one interface: `init`, `subscribe`, `writeLib`, `writePage`, `writeMedia`, `readMedia`, `deleteMedia`.
  - `cloudStore` uses `window.claude.use('db')` with real-time snapshots, so multiple tabs and devices stay in sync.
  - `localStore` uses localStorage keys `daybook3d:v1` and `daybook3d:m:<id>`.
- **Saving:** the library is debounced by 350 ms and pages by 700 ms, through a serial promise queue. Remote updates never overwrite a page that has unsaved local edits. Save failures show a toast and "Not saved yet".

## 5. Conventions in the code
- Vanilla JS, `'use strict'`, one IIFE closure, `const`/arrow functions, compact one-line functions.
- DOM is built with a small hyperscript helper `h(tag, attrs, ...children)` plus `$`/`$$` selectors.
- Catalogues in `j1_core.js` are plain objects/arrays; add a pen, paper or sticker by adding an entry there.
- Comments are section banners (`/* ==== */`). There are no tests and no TypeScript.

## 6. Things to know before changing it
- Edit `src/` and rebuild `index.html` (concatenate in the order above), or edit `index.html` directly and keep the two in sync.
- Cover and page art is canvas-drawn. 3D textures come from canvases, so painting changes touch `j2_paint.js`, which `j4_room.js` and `j9_studio.js` consume.
- Page JSON is capped at roughly 245,000 characters, and photos are compressed to stay under storage limits.
- The `window.claude` APIs (`use('db')`, `use('user')`, `downloads.save`) exist only in Claude. Outside it, export may show "Saving files is not available in this view."
- To run locally, open `index.html` in a browser with internet access. No server is needed.

## 7. Suggested prompts to give ChatGPT after pasting this
- "Add a new pen type, 'Crayon'. Tell me which files and objects to change."
- "Write a build script that concatenates `src/` into `index.html`."
- "Add JSON backup and restore alongside the Markdown export."
- "Review `j3_data.js` for sync and race-condition bugs."
