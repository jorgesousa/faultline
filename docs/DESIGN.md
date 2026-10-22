# FAULTLINE design notes

These notes record why FAULTLINE works the way it does: the decisions, the constraints and the open questions. The README covers how to play and how the engine works. Read both before making bigger changes.

## Origin

- It is a family project, an idea by **Francisco and Daniel Sousa**, and part of [Sousa Lab](https://jorgesousa.github.io/sousa-lab/).
- It began as **"Voxel Wrecker"** and was renamed **FAULTLINE** with the new identity and start menu.
  - The `localStorage` keys still use the old `vw-` prefix (`vw-map`, `vw-env`, `vw-gfx`, `vw-detector`, `vw-minimap`, `vw-leaderboard[-<map>]`).
  - **Keep them**, so players' best times and settings survive.
- **Originality:** the game is inspired by publicly documented voxel-destruction techniques, such as acko.net's *Teardown Frame Teardown* article. It must not use any code, assets or names from commercial games. Every model, texture and sound is procedural or our own.

## Game decisions

| Decision | Notes |
|---|---|
| Single-player **loot hunt**, with no time limit | A stopwatch runs until all 11 items are found. The top 10 times per map are stored in the browser. |
| **7 weapons**, from hammer to black hole | Futuristic weapons were added on purpose so you can make big craters straight away. Sticky bombs explode after 3 s. |
| **Real places**, not buildings in an empty field | Maps are built procedurally in `src/level.js` (`MAPS`), with a low-poly backdrop beyond the edges. Riverside town came first, and Old farm is the original test map. |
| **Detailed facades and street clutter** | Buildings shouldn't look like boxes: sills, cornices, quoins, signs, chimneys, containers, pallets, bins and detailed vehicles. |
| Utility poles and overhead wires were **removed** | They didn't add anything to the game. Don't bring them back unless asked. |
| Compact hotbar and a mini-map | The mini-map shows the edge of the destructible world. |
| Start menu over a live "attract mode" | The camera circles the town and demolition charges go off. Starting a run rebuilds anything the demo destroyed. The same screen handles pause and finish. |

### Open question

Do the procedural surface patterns (brick courses, boards...) make destruction feel worse? This is still undecided. Don't change the patterns until the owner decides.

## Identity

- **Palette:** charcoal ink `#151918`, bone `#ece7dc` and ember `#f2643a` (see the variables at the top of `style.css`).
- **Mark:** a fractured "F" with a displaced ember fragment.
- **Type:** Barlow Condensed for display, JetBrains Mono for uppercase labels, Inter Tight for text. All three come from `@fontsource`.
- **Copy:** "A world that changes when you act." · "Make your own way through." · "Enter the game ↗".
- The Sousa Lab portal reuses this palette and font for the FAULTLINE card.

## Architecture

- **No build step.**
  - `index.html` uses an import map to point `three`, `three/addons/` and Rapier to `./node_modules/...`. The fonts are loaded from `node_modules/@fontsource`.
  - All paths are relative, so the game works from any sub-path, e.g. GitHub Pages at `/faultline/`.
- **Deploy:** `.github/workflows/deploy.yml` runs `npm ci` and publishes `index.html`, `style.css`, `src/`, `node_modules/` and `LICENSE`. If you add a top-level file or folder the game needs, add it to the workflow's "Stage site" step.
- **Files:**

  | File | Contents |
  |---|---|
  | `src/main.js` | Game loop, player, weapons, physics, rendering, HUD and environments |
  | `src/world.js` | Voxel grid. `VS = 0.25` m, 256×80×256 voxels, chunks of 16³ |
  | `src/mesher.js` | Chunk meshing with per-vertex AO |
  | `src/structure.js` | Structural integrity: load paths, balance, load |
  | `src/level.js` | Map builders and `MAPS` |
  | `src/loot.js` | Seeded loot placement |
  | `src/menu.js` | Start, pause and finish menu |

## Checking changes

There is no test suite. Run `npm start` and check:

1. Both maps load with no console errors and the menu attract mode runs.
2. Every weapon works. Buildings topple and crumble realistically, and debris breaks on impact.
3. Each environment works (`T`), along with the graphics levels (`G`, High/Medium/Low) and the frame rate on Medium.
4. A full hunt ends and records a time.

**Automation tips:**
- Pointer lock fails in headless browsers, so use the `window.__game` hooks instead: `play`, `menu`, `map`, `env`, `look`, `tp`, `use`, `explode`, `carve`, `items`, `hunt`, `stats`, `gfx`.
- Dispatch key events to `window`.
- For headless Chrome, use `--use-gl=angle --enable-unsafe-swiftshader --ignore-gpu-blocklist`.
