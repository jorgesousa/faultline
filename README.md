# Voxel Wrecker

A small browser voxel-destruction game: a **loot hunt** against the clock in a fully destructible town. Built with Three.js (rendering) and Rapier (physics).

## Run

```bash
npm install
npm start          # serves on http://127.0.0.1:8931
```

## Controls

WASD move · Shift sprint · Space jump · Mouse look · Left click use tool
1–7 or wheel switch weapon · F detector sound · R new map · Esc pause

## Loot hunt

- Each map hides 11 items (`src/loot.js`, seeded so a map can be reproduced): gold bars (+1), gems (+2) and a flag (+3).
- 16 crates (planks, brick or concrete) are placed through the buildings and in the open; 7 hold loot, the rest are decoys. Crates have 2-voxel walls, so you can't grab loot through them.
- Fixed hiding places: the sealed house attic, the water tower tank, inside the chimney and a pocket in the chimney's concrete foundation.
- Loot items are physics bodies: they fall with collapsing floors, ride toppling structures and get thrown by blasts and tool hits. Lost items return to where they started.
- Walk over loot to collect it. The detector bar (and clicking sound) gets hotter near the closest item.
- No time limit: a stopwatch runs (paused while the game is paused) until every item is found. The 10 fastest times are kept in a leaderboard (saved in the browser) shown on the start and finish screens.
- The detector sound can be switched off with `F` or the button on the menu; the choice is remembered.

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

## How it works

- **World**: a 160×80×160 grid of 25 cm voxels (`src/world.js`), each storing a material id with colour, hardness and density.
- **Rendering**: the world is split into 16³ chunks. Each chunk is meshed with only exposed faces and per-vertex ambient occlusion (`src/mesher.js`). Only changed chunks are rebuilt.
- **Collision**: each chunk's solid voxels are merged into a few boxes (greedy box decomposition) and used as static Rapier colliders.
- **Destruction**: tools remove voxels in a sphere if the tool is strong enough for the material. Glass shatters over a wider radius.
- **Connectivity**: after removal, a flood fill (exploring downwards first) checks whether neighbouring voxels still reach the ground. Islands that don't become dynamic rigid bodies with their own mesh and box colliders.
- **Debris**: debris can be carved further and re-splits into separate pieces. Explosions push nearby debris.
- **Structural integrity** (`src/structure.js`): shortly after damage, each affected grounded structure is analysed:
  - *Load paths* – support spreads up from the ground for free but costs 1 per sideways step. Voxels beyond their material's `span` (e.g. a broken bridge, an overhang) sag off.
  - *Balance* – at every horizontal cut, the centre of mass of everything above must sit over the cells crossing that cut. If not, the part above topples as one body (a water tower on one leg, a chimney with a notch cut in it).
  - *Load* – the weight above each cut must not exceed the `strength` of the cells crossing it. Otherwise those supports crumble and the part above drops (e.g. legs thinned with the hammer).
- **Impact damage**: when debris changes velocity sharply, including its spin, it carves at its strongest Rapier contact points. Heavier, faster hits do more damage and can break harder materials, so falling structures smash themselves and whatever they land on.

## Level

Procedurally built in `src/level.js`: brick house, concrete tower with steel corner columns, footbridge, wooden barn, water tower on stilts, brick chimney and a ruined arch wall.

## License

MIT, see [LICENSE](LICENSE).
