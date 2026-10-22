# Copilot instructions: FAULTLINE

FAULTLINE is a single-player browser voxel-destruction loot hunt built with three.js and Rapier, as plain ES modules with no build step. It is an idea by Francisco and Daniel Sousa and part of Sousa Lab (portal: `jorgesousa/sousa-lab`, printer: `jorgesousa/print3d`).

**Read `README.md` (gameplay and engine) and [`docs/DESIGN.md`](../docs/DESIGN.md) (decisions and open questions) before larger changes.**

## Rules

- **Originality:** never copy code, assets, names or level designs from commercial games (e.g. Teardown). Public articles about techniques are fine as inspiration.
- Keep the `vw-*` `localStorage` keys. They hold players' saved times and settings from when the game was called Voxel Wrecker.
- Don't bring back utility poles or overhead wires. Don't change the surface patterns until the owner decides on the open question in `docs/DESIGN.md`.
- Keep the FAULTLINE identity (ink/bone/ember, fractured F, Barlow Condensed / JetBrains Mono / Inter Tight).
- **No build step.** Libraries load through the import map in `index.html` from `node_modules/`. Keep all paths relative, because the game is served from `/faultline/` on GitHub Pages.
- If a new top-level file or folder is needed at runtime, add it to the "Stage site" step in `.github/workflows/deploy.yml`.
- Keep `window.__game` hooks working, and add hooks for new features, because automated checks use them (pointer lock doesn't work headless).
- Performance matters: only rebuild changed chunks, keep debris counts bounded, and check frame rate on the Medium graphics level.

## Commands

```bash
npm install
npm start    # http://127.0.0.1:8931
```

Pushing to `main` deploys to https://jorgesousa.github.io/faultline/. There is no test suite, so use the checklist in `docs/DESIGN.md`.

## Style

- Plain ES modules, no framework, no TypeScript. Follow the existing style: compact functions and short comments where the maths or physics needs explaining.
- World units: 1 voxel = 0.25 m (`VS`), and Y is up.
- Update `README.md` (controls, features) and `docs/DESIGN.md` when behaviour changes.
