# FAULTLINE

*A world that changes when you act.*

A small browser voxel-destruction game: a **loot hunt** against the clock in a fully destructible town. Built with Three.js (rendering) and Rapier (physics).

## Run

```bash
npm install
npm start          # serves on http://127.0.0.1:8931
```

## Controls

WASD move · Shift sprint · Space jump · Mouse look · Left click use tool
1–7 or wheel switch weapon · F detector sound · T environment · L flashlight · M mini-map · G graphics quality · R restart · Esc pause · Enter play (on the menu)

## Menu

- The title screen sits over a live view of the town: the camera circles it and demolition charges go off every few seconds. Starting a run rebuilds anything the demo knocked down.
- From the menu you can pick the map, light and weather, graphics quality and detector sound, see the best times and read how to play.
- The same screen is used for pause (with time, loot and destruction so far, and Restart) and for the finish screen (your result and the leaderboard).
- Identity: charcoal and bone with an ember accent, a fractured "F" mark, Barlow Condensed for display type, JetBrains Mono for labels and Inter Tight for text (fonts come from `@fontsource`, installed by `npm install`). Code: `index.html`, `style.css`, `src/menu.js`.

## Loot hunt

- Each map hides 11 items (`src/loot.js`, seeded so a map can be reproduced): gold bars (+1), gems (+2) and a flag (+3).
- Crates (planks, brick or concrete) are placed through the buildings and in the open; 7 hold loot, the rest are decoys. Crates have 2-voxel walls, so you can't grab loot through them.
- Each map also has fixed hiding places (e.g. the church bell tower, a car boot, a statue plinth, a sealed attic, the water tower tank).
- Loot items are physics bodies: they fall with collapsing floors, ride toppling structures and get thrown by blasts and tool hits. Lost items return to where they started.
- Walk over loot to collect it. The detector bar (and clicking sound) gets hotter near the closest item.
- No time limit: a stopwatch runs (paused while the game is paused) until every item is found. The 10 fastest times per map are kept in a leaderboard (saved in the browser) shown in the menu under Best times.
- The detector sound can be switched off with `F` or the Detector chip on the menu; the choice is remembered.

## Weapons

| Key | Weapon | What it does |
|---|---|---|
| 1 | Sledgehammer | Close range. Glass, wood, plaster, brick |
| 2 | Blaster | Long range, small holes |
| 3 | Bomb | Thrown, bounces, 2.6 s fuse |
| 4 | Sticky bomb | Sticks to walls, floors or moving debris, blinks, explodes after 3 s. Chain-reacts |
| 5 | Plasma cannon | Fast straight energy bolt, opens a big crater on impact |
| 6 | Railgun | Instant beam that bores a 30 m tunnel, even through steel |
| 7 | Black hole | Sticks where it lands, pulls in debris, loot and you for 2 s, then erases a 4 m sphere |

## Environments

Press `T` (or use the buttons in the menu) to change the time of day and weather. The choice is remembered.

- **Day**, **Sunset** (low sun, long shadows through the holes you make), **Night** (moon, stars, flashlight on), **Foggy dawn**, **Storm** (rain and lightning with thunder) and **Day cycle** (the sun moves across the sky, a full day every 4 minutes).
- Buildings have ceiling lamps that light the rooms and spill out through holes. A lamp goes out with a spark when the ceiling it hangs from is destroyed, and lamps flicker when blasts shake them.
- **HUD**: a compact hotbar (the weapon name shows briefly when you switch, and the slot fills while the weapon recharges) and a mini-map of the destructible area that warns you near the edge of the world.
- `L` toggles a flashlight that casts its own shadows. It switches on by itself when it gets dark.
- Rain stops on roofs and floors and only gets inside through holes.

## How it works

- **World**: a 256×80×256 grid (64×20×64 m) of 25 cm voxels (`src/world.js`), each storing a material id with colour, hardness and density.
- **Rendering**: the world is split into 16³ chunks. Each chunk is meshed with only exposed faces and per-vertex ambient occlusion (`src/mesher.js`). Only changed chunks are rebuilt.
- **Surface detail**: each material has a procedural pattern drawn in the fragment shader (brick courses, stone blocks, roof tiles, boards, paving, window bars), plus grime and rain streaks low on walls. Buildings are dressed with voxel sills, lintels, string courses, quoins, door hoods, bay windows, dormers, gutters, chimneys, signs and awnings, so every detail can be blown off too.
- **Street clutter**: shipping containers (corrugated, some open), pallet stacks, wheelie bins, and detailed cars and vans (lights, plates, bumpers, mirrors, seats, tapered cabins).
- **Collision**: each chunk's solid voxels are merged into a few boxes (greedy box decomposition) and used as static Rapier colliders.
- **Destruction**: tools remove voxels in a sphere if the tool is strong enough for the material. Glass shatters over a wider radius.
- **Connectivity**: after removal, a flood fill (exploring downwards first) checks whether neighbouring voxels still reach the ground. Islands that don't become dynamic rigid bodies with their own mesh and box colliders.
- **Debris**: debris can be carved further and re-splits into separate pieces. Explosions push nearby debris.
- **Structural integrity** (`src/structure.js`): shortly after damage, each affected grounded structure is analysed:
  - *Load paths* – support spreads up from the ground for free but costs 1 per sideways step. Voxels beyond their material's `span` (e.g. a broken bridge, an overhang) sag off.
  - *Balance* – at every horizontal cut, the centre of mass of everything above must sit over the cells crossing that cut. If not, the part above topples as one body (a water tower on one leg, a chimney with a notch cut in it).
  - *Load* – the weight above each cut must not exceed the `strength` of the cells crossing it. Otherwise those supports crumble and the part above drops (e.g. legs thinned with the hammer).
- **Sky occlusion**: a copy of the world lives on the GPU as a mipmapped 3D texture (one byte per voxel; glass and leaves are partly see-through). Lit surfaces cone-trace it towards the sky, so interiors and alleys darken and daylight floods in through holes you blast. Edited chunks are re-uploaded as 16³ sub-blocks.
- **Scorch marks**: explosions char exposed voxels within line of sight of the blast. The soot is stored per voxel, so it stays on chunks that later break off as debris.
- **Post-processing**: screen-space ambient occlusion (GTAO, ignoring smoke, water and beams), bloom on the sun, moon, lamps, sparks and weapon glow, then ACES tone mapping. `G` cycles High (all), Medium (no SSAO) and Low (plain render, no sky occlusion) and is remembered.
- **Impact damage**: when debris changes velocity sharply, including its spin, it carves at its strongest Rapier contact points. Heavier, faster hits do more damage and can break harder materials, so falling structures smash themselves and whatever they land on.

## Maps

Pick a map on the start menu (remembered between visits). Maps are built procedurally in `src/level.js` and registered in `MAPS` with their spawn, lamps, water, loot spots and backdrop.

- **Riverside town**: a high street with terraced houses, back gardens, a corner shop, a church with a bell tower, a pub, a café and parked cars. A stone bridge crosses the river to a boathouse, a fishing pier and a park. A low-poly town continues beyond the edges.
- **Old farm**: the original brick house, concrete tower with steel columns, footbridge, wooden barn, water tower on stilts, brick chimney and ruined arch wall, now with a country road, fences and trees.

To add a map, write a `build(w)` function and add an entry to `MAPS`.

## License

MIT, see [LICENSE](LICENSE).
