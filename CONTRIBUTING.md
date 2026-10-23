# Contributing to Daybook

Thanks for helping. Daybook is a small vanilla JavaScript project with no framework and no bundler, so changes are
easiest to review when they are small and follow the code around them.

## Set up

You need Python 3 (for the build), Node.js 18 or newer and Google Chrome (for the tests), and an internet connection
(the app loads three.js and Google Fonts from CDNs).

```sh
git clone https://github.com/Awaneesh03/DayBook.git
cd DayBook
npm ci              # installs playwright-core, used only by the tests
python3 build.py    # writes index.html from src/
```

Open `index.html` in a browser, or serve the folder (`python3 -m http.server 8000`, then <http://localhost:8000>).

## Making a change

1. Create a branch: `git checkout -b fix-short-description`.
2. Edit the files in `src/`, never `index.html` directly. `build.py` overwrites it.
3. Rebuild with `python3 build.py` and commit the rebuilt `index.html` with your change. CI checks that it matches the
   sources.
4. Run the tests: `npm test` runs every suite. While working on one area, run a single suite, for example
   `node tests/test_planner.mjs`, or a few tests with `ONLY="part of a test name" node tests/test_planner.mjs`.
   On a machine where Chrome is not at the macOS default path, set `CHROME=/path/to/chrome`.
5. Open a pull request that says what changed, why, and how you checked it.

## Style

- Plain JavaScript in one closure: `const`, arrow functions, the `h()` DOM helper and `$`/`$$` selectors from
  `src/j1_core.js`. Put text into the page with `text:` or text nodes, never as HTML.
- Comments explain why, not what. Keep them short.
- No new runtime dependencies or services. The app is meant to work from one static file.
- Do not weaken or delete a test to make it pass. If a test is wrong, fix the test and say so in the pull request.

`CONTEXT.md` describes the architecture, the data model and the things that are easy to break.
