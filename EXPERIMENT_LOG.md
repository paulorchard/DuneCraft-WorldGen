# IslandCraft - Dunes of Arrakis

## Naming convention

- Family name `IslandCraft - <mod name>`; manifest group `IslandCraft`.
- Identifier form `<Mod_Name_With_Underscores>` (here `Dunes_of_Arrakis`) for generator types, world structures and the mod's asset folders.
- Code form `<ModNameNoSpaces>` (here `DunesOfArrakis`); package `com.paulorchard.islandcraft.<modnamelowercase>`; jar and repository `IslandCraft-<ModNameNoSpaces>`.
- In-world content is prefixed `Arrakis_` (blocks, biomes, exported densities); environments are `Env_Arrakis...`; no abbreviated asset prefixes.
- Seed keys are not asset IDs. They are left as first written, because renaming one changes the terrain.
- Projects live under `C:\Apps\IslandCraft\`.

Entries further down are left as written and use the old names. Look them up in the table below.

## Rename table (commit 973ff2f)

| Old | New | Where |
| --- | --- | --- |
| Manifest Group `Arrakis` | `IslandCraft` | `manifest.json` |
| Manifest Name `Arrakis` | `IslandCraft - Dunes of Arrakis` | `manifest.json` |
| Mod identifier `Arrakis:Arrakis` | `IslandCraft:IslandCraft - Dunes of Arrakis` | logs, save configs |
| Generator type `Arrakis` | `Dunes_of_Arrakis` | provider class, each world's config |
| World structure `Arrakis` | `Dunes_of_Arrakis` | `WorldStructures/Dunes_of_Arrakis.json`, provider default, preview tools |
| World structures `Arrakis_Mix`, `Arrakis_Showcase` | deleted | were in `WorldStructures/` |
| Biomes `AM_*` (12), `AS_*` (13) and their exports | deleted | were in `Biomes/Arrakis_Mix/`, `Biomes/Arrakis_Showcase/` |
| `tools/showcase/` | deleted | build scripts, `Use-Showcase.ps1`, two images |
| Exports `ArrakisV1` .. `ArrakisV10` | `Arrakis_V1` .. `Arrakis_V10` | main biome, `graph.js` |
| Exports `ArrakisV<n><letter>_...` | `Arrakis_V<n><letter>_...` | main biome, `graph.js` |
| Exports with an empty name (copied from vanilla recipes) | `Arrakis_V<n><letter>_Unnamed<k>` | main biome, `graph.js` |
| Folder `Biomes/Arrakis/` | `Biomes/Dunes_of_Arrakis/` | assets |
| Folder `Environments/Arrakis/` | `Environments/Dunes_of_Arrakis/` | assets |
| `Env_Arrakis` had no tags | tag `Arrakis` added | `Env_Arrakis.json` |
| Package `com.paulorchard.arrakis` | `com.paulorchard.islandcraft.dunesofarrakis` | Java |
| `ArrakisPlugin`, `ArrakisWorldGenProvider`, `ArrakisWorldGen`, `ArrakisSpawnProvider` | `DunesOfArrakisPlugin`, `DunesOfArrakisWorldGenProvider`, `DunesOfArrakisWorldGen`, `DunesOfArrakisSpawnProvider` | Java |
| Gradle group `com.paulorchard` | `com.paulorchard.islandcraft` | `build.gradle.kts` |
| Project name `DuneCraft-WorldGen` | `IslandCraft-DunesOfArrakis` | `settings.gradle.kts` |
| Jar `Arrakis-0.1.0.jar` | `IslandCraft-DunesOfArrakis-0.1.0.jar` | `build.gradle.kts`; the deploy task also removes old `Arrakis-*` files |

Unchanged: `Arrakis_Sand`, `Arrakis_Terrain`, `Env_Arrakis`, the exports `Arrakis_Rock`, `Arrakis_Pick`, `Arrakis_Pick_Start` and `Arrakis_Inside`, the language key `items.Arrakis_Sand.name`, every seed key (34 start with `Arrakis_`; 9 are `ArrakisV<n>_Patch<k>`; 23 are copied from vanilla recipes), and the vanilla export `Plains1_Caves_Terrain` that the rock recipes import.

Checked after the rename:

- Two real-generator renders (seed 42 round spawn; seed 1791463709213 at 6 km north) are byte-identical to renders made before it.
- Clean build and deploy: one jar for this mod in the Mods folder.
- Three "Duplicate export name" warnings remain. They come from the vanilla Gorges recipe using one export name twice.

Not yet checked in game: the mod-list name. It was chosen from the client's list template (`ModItem.ui`), which has a name label and an authors label and no group label, so the name alone has to carry "IslandCraft - ". Also unchecked: how worlds made before the rename fail to load.

# Experiment log (entries use the old names)

Biome file: `src/main/resources/Server/HytaleGenerator/Biomes/Arrakis/Arrakis_Terrain.json`
Server version: 0.6.8

## Iteration loop

- `gradlew deployMod`, then create a fresh world from the Create World screen (plugin from prompt 01 makes it Arrakis).
- The game locks the jar in the Mods folder while a world is open. Exit to the main menu (or quit) before `deployMod`.
- Each new world has a random seed, so island positions differ per world. Positions below are ranges, not exact.
- Live editing with `/viewport --radius 3`: not tried yet. The pack now ships as a plugin jar, not a folder in the save's mods directory.
- Preview tool (round 2): `tools/preview` is a small Node model of the density nodes this biome uses. `graph.js` builds the rock graph from parameters, `render.js` draws a shaded top-down PNG of it, `write.js` writes the same graph into the biome JSON. The noise hash differs from the game's, so exact shapes differ, but scales, ranges and graph logic are the same. Use it to judge shape before deploying: `node tools/preview/render.js out.png 900 900 1200 1.5`, then `node tools/preview/write.js <biome json>`.
- Offline preview (loading the biome with the server jar outside the game): dead end. The generator's asset stores need a live `HytaleServer` instance.

## Engine facts confirmed from the 0.6.8 server jar

- `Manual` curves clamp outside their point range (first/last `Out` is returned). No extrapolation.
- `PositionsCellNoise` with no position inside `MaxDistance` passes a huge distance to the return type, so a `Curve` return type yields the curve's last `Out`. The last curve point must be the "nothing here" value.
- `Occurrence` keeps a position when `FieldFunction` value > random [0,1). The value is a keep probability: 0.7 keeps 70%.
- `Mesh2D` / `Mesh` point generator: one point per grid cell at `cell * Scale`, displaced by a random vector times `Jitter * Scale`. With `Jitter` 0 there is a point exactly at the origin.
- `PositionsCellNoise` `Density` return type: `ChoiceDensity` is sampled at the cell position; the first delimiter with `From <= value < To` wins; otherwise `DefaultValue`. The chosen density runs with the cell position as its anchor.
- `WhiteNoise` is uniform in [-1, 1).
- `Anchor` gives its input the position relative to the cell position.
- `Ellipsoid` = `Rotator(Scale(Distance(Curve)))`: `Scale` is the semi-axis length in metres, the curve input is 1.0 at the surface, `Spin` is in degrees.
- `Distance` outside an `Anchor` measures from the world origin.
- Material `Queue` falls through to the next entry when a `FieldFunction` material has no matching delimiter.

## Stage 1 — large islands only, plain Rock_Sandstone_Red

Status: worked first time. Log clean (no Arrakis warnings, no `Took too long`).

Setup:

- Terrain density is now `Max(sand floor, dunes, Rock)`. The two dune branches are unchanged.
- `Rock = Exported "Arrakis_Rock" [ Sum(A, B) ]`
  - `A = Clamp(-3, 1) [ 8 * F ]`
  - `F = YOverride 0 > Cache 3 > Sum(radial, coast noise)`
    - radial: `PositionsCellNoise`, `MaxDistance` 450, `Curve` return 0 m -> 1.0, 450 m -> -0.5 (crosses 0 at 300 m), Euclidean.
    - positions: `Offset(900, 0, 900)` > `Occurrence(0.7)` > `Mesh2D` scale 2500, jitter 0.2.
    - coast noise: `SimplexNoise2D` scale 300, 3 octaves, normalised to +/-0.3 (shore moves about +/-90 m).
  - `B = CurveMapper(BaseHeight distance)`: -60 -> 1, 0 -> 0, 240 -> -4 (so -1 at 60 m above Base).
  - Result: plateau 60 m above Base where `F >= 0.125`, sloping to Base level at the coastline `F = 0`.
- Material: `FieldFunction(Imported "Arrakis_Rock")`, delimiter 0..100 -> `Rock_Sandstone_Red`, placed after bedrock and before sand in the `Solid` queue.

Numbers:

| Setting | Value |
| --- | --- |
| Island grid spacing | 2500 m |
| Jitter | 0.2 (centres move up to 500 m) |
| Drop rate | 30% |
| Nominal radius | 300 m (about 210–390 m with coast noise) |
| Plateau height (stage 1 only) | 60 m above Base (y = 140) |
| Grid offset | (900, 900) |

Where to look: island centres fall within 500 m of (900 + 2500 i, 900 + 2500 j). Nearest candidates to spawn: (900, 900), (-1600, 900), (900, -1600), (-1600, -1600). Each has a 30% chance of being dropped.

Spawn: the offset keeps the nearest possible island edge at least ~380 m from the origin.

Feedback (world "Arrakis Test"): plateau found and looks as described: flat top, steep sides, irregular outline, dunes untouched. No comment yet on size or spacing. User expected small outcrops already.

## Stages 2 + 3 — cliffs, uneven tops, small outcrops everywhere

Status: built, not yet deployed or seen in game. Done together because the user asked for outcrops straight after stage 1.

Setup (replaces the stage 1 `A` and `B`; density 1.0 now means 90 m):

- `Rock = Exported "Arrakis_Rock" [ Sum(A, B) ]`
- `A = YOverride 0 > Cache 3 > Min(spawnMask, Sum(Max(island, outcrop), duneHeight))`
  - `spawnMask`: `Distance` curve 0..70 m -> -3, 90 m -> 5. Keeps rock off the fixed spawn.
  - `duneHeight`: copy of the dune noise (`SimplexNoise2D` scale 400, 4 octaves, seed "A"), normalised to -0.356..0.533 and clamped 0..0.45. Rock heights are therefore measured from the local sand surface, not from Base. Assumes the same seed key gives the same noise as the dune branch — check in game: low outcrops should sit a few metres above the sand everywhere.
  - `island = Min(Clamp(-3, 2)[25 * F], top)`. `F` is unchanged from stage 1. Full height is reached about 12 m inside the coastline.
    - `top = CurveMapper(SimplexNoise2D scale 220, 2 octaves) + rough`. Stepped curve: -1 -> 0.35, -0.3 -> 0.38, -0.2 -> 0.58, 0.15 -> 0.62, 0.25 -> 0.85, 0.5 -> 0.9, 0.6 -> 1.0. Shelves at about 32, 54, 79 and 90 m.
    - `rough`: `SimplexNoise2D` scale 35, 2 octaves, +/-0.03 (about +/-3 m).
  - `outcrop`: `PositionsCellNoise`, `MaxDistance` 130, `Mesh2D` scale 200 jitter 0.4, `Density` return type, `ChoiceDensity` `WhiteNoise`, `DefaultValue` -3.
    - each variant: `Min(Clamp(-3, 2)[4 * (Anchor[Ellipsoid] + edge noise)], top + rough)`
    - `Ellipsoid` curve 0 -> 1, 1 -> 0, 4 -> -3; `Scale` (semi-major, 1, semi-minor); `NewYAxis` (0, 1, 0); `Spin` per variant.
    - edge noise: `SimplexNoise2D` scale 40, 2 octaves, +/-0.25.
- `B = CurveMapper(BaseHeight distance)`: -90 -> 1, 0 -> 0, 360 -> -4.

Outcrop variants (65% of cells get nothing):

| White noise range | Size (m) | Spin | Height above sand |
| --- | --- | --- | --- |
| -1.00 .. -0.90 | 140 x 44 | 0 | 4 m |
| -0.90 .. -0.80 | 170 x 56 | 60 | 6 m |
| -0.80 .. -0.72 | 110 x 36 | 120 | 3 m |
| -0.72 .. -0.64 | 150 x 50 | 30 | 18 m |
| -0.64 .. -0.56 | 180 x 60 | 100 | 25 m |
| -0.56 .. -0.48 | 120 x 48 | 150 | 14 m |
| -0.48 .. -0.42 | 130 x 44 | 80 | 40 m |
| -0.42 .. -0.36 | 160 x 52 | 15 | 54 m |
| -0.36 .. -0.30 | 60 x 40 | 135 | 60 m |

Where to look: outcrops are everywhere at this stage, on a 200 m grid with about one cell in three filled, so several should be visible from spawn. Large islands as in stage 1.

Feedback (world "New World"): pipeline works (positions, export/import, material, dunes untouched, spawn clear, log clean). Shape rejected: the large island is one flat-topped slab with vertical walls all round, cannot be climbed, nothing on top. Round 2 replaces the shapes.

# Round 2 — terraced clusters (targets: Dune Awakening maps)

The eight target points: 1 cluster not blob, 2 terraced, 3 lopsided wedges with a shared lean, 4 full size range fading with distance, 5 varied summit heights, 6 spire groups, 7 sand and rock interleave, 8 layered and weathered up close.

Density 1.0 in the A terms is now 120 m.

## Round 2, stage 1 — large island as a terraced cluster

Status: accepted. Log clean (world "Arrakis v2").

Setup (island branch only; outcrops, spawn mask, dune-height add and material are unchanged apart from the unit rescale):

- `F = Sum(radial, lobes, detail)`
  - radial: `PositionsCellNoise`, `MaxDistance` 600, `Curve` 0 m -> 1, 300 m -> 0, 600 m -> -1. Same island positions as round 1.
  - lobes: `SimplexNoise2D` scale 230, 2 octaves, +/-0.62. This is what breaks the outline into bays, peninsulas and detached pieces.
  - detail: `SimplexNoise2D` scale 60, 2 octaves, +/-0.05.
- `edge = F * 110 m`: height grows gently inland instead of jumping to a plateau.
- `cap = CurveMapper(SimplexNoise2D scale 210, 3 octaves)`: -1 -> 10 m, -0.35 -> 14, -0.1 -> 30, 0.15 -> 54, 0.45 -> 90, 0.7 -> 110. Low benches and separate summits.
- `preStep = Min(edge, cap) + noise(scale 28, +/-1 m)`
- `island = CurveMapper(preStep)` with a stair-step curve. Shelves at 0, 3, 8, 14, 20, 29, 35, 44, 50, 58, 67, 73, 82, 90, 98, 106, 112, 120 m. Each tread rises 12% of its step, then a riser takes the last 15% of the input range. Intervals 0-3, 35-44 and 73-82 m are left as plain slopes.

What did not work in the preview:

- `edge = F * 260 m` with lobes scale 170 +/-0.45 and detail scale 45 +/-0.12: slope about 2 m per m, so treads were about 3 m wide and the terraces vanished; the coast was a ragged fringe. Fix was a much gentler edge (110 m) and broader, stronger lobes with almost no fine detail.

Against the eight points:

1. Cluster: partly. Outline is deeply indented with peninsulas and a few detached pieces; no sand channels through the mass yet (stage 2).
2. Terraced: yes in the preview. Shelves 3-9 m high, treads wide on gentle ground and narrow on steep ground.
3. Wedges with a shared lean: no (stage 3).
4. Size range and fade with distance: no (stage 3). Outcrops are still the round 1 ellipses, everywhere.
5. Summit heights: yes in the preview. Several summits up to about 105 m with lower benches.
6. Spires: no (stage 4).
7. Sand and rock interleave: partly. Rock starts flush with the sand and dunes bank against it; no interior sand basins yet.
8. Layered and weathered: no (stage 5). Still plain Rock_Sandstone_Red.

Play requirements: access not guaranteed yet (shelf risers are 3-9 m; the three plain-slope bands are about 45 degrees). Building room: likely, wide treads on the benches. Shelter: no. Stage 2 covers these.

Feedback (world "Arrakis v2"): "the large islands are really good". The small outcrops were still the round 1 flat ellipses and read as plateaus, so stage 3 was done next, ahead of stage 2.

## Round 2, stage 3 — wedge outcrops with a shared lean, fading with distance

Status: accepted (world "Arrakis v3", log clean). Done before stage 2 (channels, basins, access) because of the feedback above.

Engine facts used (from the 0.6.8 jar):

- `XValue` returns the context position's X. Inside an `Anchor` that is the X offset from the cell position.
- `Rotator` takes `NewYAxis` and `SpinAngle` (degrees) and rotates the position passed to its input. `Ellipsoid` uses the same rotator internally, so one `Rotator` around the whole wedge keeps footprint and ramp aligned.

Setup:

- Round 1 ellipse outcrops removed. Two new `PositionsCellNoise` layers with `Density` return type:
  - Medium: `Mesh2D` scale 320, jitter 0.35, `MaxDistance` 180.
  - Small: `Mesh2D` scale 130, jitter 0.4, `MaxDistance` 80.
- Each variant: `Anchor > Rotator(SpinAngle = 30 + offset) > Min(rim, ramp)`
  - rim: `3 * crest * (Ellipsoid + edge noise)`. `Ellipsoid` curve 0 -> 1, 1 -> 0, 3 -> -2; `Scale` (semi-length, 1, semi-width). Edge noise `SimplexNoise2D` scale 0.45 * semi-length, +/-0.28. Note: this noise is sampled in the wedge's local coordinates, so two wedges of the same variant have the same outline wobble.
  - ramp: `CurveMapper(XValue)`: -1.1 * semi-length -> 0, +0.55 * semi-length -> crest. Gentle rise along local +X, then the rim cuts the far end off as a cliff.
- Shared lean: world-wide angle 30 degrees, each variant offset by -25..+25.
- Fade and chains: `ChoiceDensity = WhiteNoise + shift`, where shift is a second `PositionsCellNoise` on the island positions with a `Curve` return: 0 inside `fadeStart`, rising to the layer's total fill at `fadeEnd`, then 3. Variant ranges start at -1 with the biggest first, so as the shift grows the biggest wedges drop out first and nothing survives past `fadeEnd`. Medium: 380 -> 820 m from the island centre. Small: 350 -> 900 m.
- Terracing is now shared: `CurveMapper(stairs)[ Max(island, medium, small) + jitter ]`, so wedges get the same shelves as the island.

Variants (share of cells near the island, length x width, lean offset, crest above sand):

| Layer | Share | Size (m) | Lean offset | Crest |
| --- | --- | --- | --- | --- |
| Medium | 12% | 250 x 140 | -10 | 45 m |
| Medium | 12% | 220 x 110 | +20 | 30 m |
| Medium | 10% | 200 x 160 | 0 | 60 m |
| Medium | 10% | 180 x 90 | -25 | 22 m |
| Medium | 8% | 150 x 100 | +10 | 14 m |
| Small | 10% | 120 x 60 | +15 | 25 m |
| Small | 9% | 100 x 70 | -20 | 12 m |
| Small | 8% | 90 x 44 | 0 | 35 m |
| Small | 6% | 50 x 36 | +25 | 55 m (stack) |
| Small | 9% | 110 x 56 | -10 | 5 m |
| Small | 7% | 70 x 40 | +10 | 8 m |
| Small | 6% | 40 x 28 | 0 | 4 m |

What did not work in the preview:

- First pass wrote the variant ranges as if white noise spanned 1.0; it spans 2.0 (-1..1), so only half the intended cells were filled. Ranges are now generated from shares.
- Edge noise +/-0.15 left the outlines as clean ellipses; +/-0.28 reads as rock.

Against the eight points:

1. Cluster: partly (unchanged; wedges that land on the island add lobes).
2. Terraced: yes for islands and wedges in the preview.
3. Wedges with a shared lean: yes in the preview. WITHDRAWN in round 4: in game the wedges read as repeated single tilted planes with parallel stripes; round 4 part B replaces them with scaled-down islands and no shared lean.
4. Size range and fade: yes in the preview: 600 m island, 150-250 m medium, 40-120 m small, none beyond about 600 m from the shore.
5. Summit heights: yes for the island; wedge crests 4-60 m, including a tall narrow stack on a small footprint.
6. Spires: no (stage 4).
7. Sand and rock interleave: partly. Low wedges (4-8 m) sit just above the sand and dunes cover their low ends.
8. Layered and weathered: no (stage 5).

Play requirements: most wedges have a walk-up side in principle, but the ramp is terraced with 3-9 m risers, so true walk-up access is still stage 2 work. Hops: sand gaps in the chain are mostly under 200 m in the preview.

Feedback (world "Arrakis v3"): islands and outcrops look good above ground. Round 2 stages 2, 4 and 5 (channels, spires, strata) were not done; round 3 replaces the strata plan.

# Round 3 — rock below the sand, and what the rock is made of

No shape above the sand may change in this round.

## Round 3, part A — rock stays isolated underground

Status: accepted (world "Arrakis v4", log clean, no `Took too long`).

Confirmed cause. `Rock = A + B`. `A = terraced height + dune height` (units of 120 m); `B` is 0 at Base and keeps rising below it, to +0.67 at bedrock. Underground the rock boundary is therefore wherever `A > -B`, i.e. wherever the height field is above minus the depth. The stair-step curve passed negative heights straight through, and the height field falls away gently outside each body (island about 0.4-0.9 m per m, wedge rims 0.5-2 m per m), so every metre of depth moved the boundary 1-3 m outward and neighbouring bodies merged.

Why flattening `B` alone is not enough. Dune height is added inside `A` so that rock heights are measured from the sand. With `B` flat below Base, rock below Base would be wherever `terraced + dune > 0`, which under a 40 m dune still reaches out to where the height field is -40 m: up to about 100 m beyond the visible footprint.

Fix. One change, on the negative side of the stair-step `CurveMapper`: heights from 0 down to -4 m pass through as before; anything lower maps to -3 units, which no depth can bring back above zero. Points: `(-4.05 m, -360 m), (-4 m, -4 m), (0, 0)`, then the unchanged shelves. `B` is unchanged.

Result:

- Above the sand: identical (the curve is untouched for heights above 0).
- A body's root is the area where the height field is above -4 m, carried straight down to bedrock. Its sides are vertical, so it does not widen with depth at all.
- That area is wider than the visible footprint by 4 m divided by the local slope: about 2-8 m on wedge rims, up to about 13 m on the gentlest island shores. The strip between is a shelf buried 0-4 m under the sand.
- Bodies 40 m apart at the surface stay at least about 14 m apart underground.

Slice measurements (preview tool, 2400 x 2400 m around one island and its chain, 3 m cells):

| | Before | After |
| --- | --- | --- |
| Rock showing above the sand | 48.2 ha | 48.2 ha |
| Rock at Y = 40 | 111.3 ha (2.31 x) | 54.0 ha (1.12 x) |
| Rock at Y = 10 | 198.8 ha (4.12 x) | 54.0 ha (1.12 x) |

Images: `tools/preview/round3-underground-{before,after}_{y40,y10,vertical}.png`. Tool: `node tools/preview/slices.js <prefix> [rootCut|none]`.

Feedback: root fix accepted. Round 3 part B (white shell darkening inward) was dropped before anything was built; no `Rock_Sandstone_White` was ever added.

# Round 4 — materials by sand level, and outcrops as small islands

Accepted and frozen: large islands, dunes, island positions, chain fade, spawn mask, round 3 root fix.

## Round 4, part A — materials by sand level

Status: accepted with one change (world "Arrakis v5", log clean): the upper block was switched from `Rock_Sandstone` to `Rock_Sandstone_White` on request.

Engine fact (0.6.8 jar): `SimpleHorizontal` applies its material where `BottomY <= block Y < TopY`, each measured from its named base height. Outside that range it returns nothing and a surrounding `Queue` falls through.

Setup. The rock entry of the `Solid` queue is still `FieldFunction(Imported "Arrakis_Rock")` with delimiter 0..100, but its material is now a `Queue`:

1. `SimpleHorizontal`, `BottomY` -3 and `TopY` 1000, both on base height `Base` -> `Rock_Sandstone_White` (first deployed as `Rock_Sandstone`)
2. `Constant` -> `Rock_Sandstone_Red`

The sand floor's top block is Base - 1, so sandstone covers that block and the two below it (Y = 79, 78, 77 with Base = 80) and red starts at Y = 76. No number is hard-coded except the offsets; the rule follows `Base`.

Removed: nothing. The single `Rock_Sandstone_Red` constant was replaced by the queue above.

Feedback (world "Arrakis v5"): materials look good; change the upper sandstone to white sandstone. Done.

## Round 4, part B (medium layer) — outcrops as small islands

Status: FAILED in game (world "Arrakis v6"). Came out as 360 m discs filled edge to edge and cut along straight cell boundaries. Cause and repair are in round 5. The small layer still uses the round 2 wedges.

Problem seen in game (Screenshots/repettive outcrops.png): wedges are single tilted planes with parallel terrace stripes, same-variant wedges are identical, and the shared lean reads as a pattern.

Recipe. Same as the large island, scaled down, with the radius set per cell. No `Anchor`, no `Density` return type, no variants: every noise is sampled in world coordinates, so no two outcrops share an outline.

- Positions: `Mesh2D` scale 320 (unchanged), jitter lowered 0.35 -> 0.25 so neighbours are at least about 160 m apart and rarely clip each other along the straight cell boundary. `MaxDistance` 180.
- `v = WhiteNoise(cell) + shift(distance from island centre at the cell)`, shift 0 inside 380 m rising to 1.0 at 820 m, then 3 (same fade as round 2).
- `invRadius = CellValue[ CurveMapper(v) ]`: v from -1 to 0 maps radius 100 m down to 55 m (as 1/radius); above 0 it is 10, which empties the cell. Default 10. Half the cells near an island are filled; the biggest drop out first with distance.
- `distance`: `PositionsCellNoise` on the same positions, `Distance` return type. WRONG: this return type is not metres, see round 5.
- `F = 1 - invRadius * (distance + 2) + lobes + detail`. The +2 m stops an empty cell leaving a one-block spike at its centre.
  - lobes: `SimplexNoise2D` scale 75, 2 octaves, +/-0.4 (island: scale 230 for radius 300, ratio 0.77; here about 0.75-1.4 across the radius range).
  - detail: scale 22, +/-0.04.
- `cap = CurveMapper(SimplexNoise2D scale 60, 2 octaves)`: -1 -> 0.2, -0.2 -> 0.35, 0.2 -> 0.7, 0.6 -> 1.1. Gives one to three high points.
- `height = CellValue[ 0.36 * radius(v) * variety ]`, variety from a second white noise: -1 -> 0.4, 0 -> 0.9, 1 -> 1.5. So crests run from about 8 m to about 54 m.
- `outcrop = Min( height * Min(F, cap), 200 m * F )`. The second term only matters where `F < 0`: it makes the height fall away fast outside the footprint whatever the outcrop's height, so the round 3 root cut (-4 m) still leaves only a narrow buried shelf. Without it a low outcrop would have a shelf reaching far out.
- Then the shared `Max`, jitter and stair-step curve as before.

What did not work in the preview:

- Lobes scale 62 +/-0.5 with detail scale 16 +/-0.06: outlines crumbled into fragments. Scale 75 +/-0.4 with detail 22 +/-0.04 holds each outcrop together as one body with bays.

Limits of this recipe:

- Noise scale cannot follow the radius continuously (a noise node has one fixed scale), so it is set once per layer for the middle of the layer's radius range.
- Elongation comes only from the lobe noise; there is no deliberate stretch.
- Two filled neighbouring cells that reach each other meet along a straight cell boundary. The lower jitter makes this uncommon, not impossible.

Checks:

- Large island: the island branch of the biome JSON is byte-identical to the previous build. Outcrops that overlap the island shore differ, as they always have.
- Slices (2400 x 2400 m, 3 m cells): rock above the sand 43.7 ha, at Y = 40 49.2 ha (1.12 x), at Y = 10 49.2 ha (1.12 x).

Feedback (world "Arrakis v6"): medium outcrops are big circular discs about 350 m across with clean circular edges, some cut along dead-straight lines, filled with a busy terrace texture, crowding and overlapping the large island.

# Round 5 — outcrop repair, then a starting outcrop and a guaranteed island

Accepted and frozen: large islands, dunes away from spawn, the sand-level material rule, the underground root fix.

## Round 5, stage 1 — diagnose the discs, fix the preview, repair the medium layer

Status: loaded in game as "Arrakis v7" (log clean, no `Took too long`). No comment on the medium outcrops themselves; the feedback was that the spawn outcrop and nearby island were missing, which were later stages.

### Confirmed cause of the discs

It was not `CellValue`. From the 0.6.8 jar:

- `CellValue` does what round 4 assumed: it evaluates its `Density` with the position set to the closest cell position and returns that; with no position inside `MaxDistance` it returns `DefaultValue`.
- The `Distance` return type does NOT return metres. It returns `distance / MaxDistance * 2 - 1`, i.e. -1 at the cell position and +1 at `MaxDistance`, and 1 when there is no position.
- A `Curve` return type is the one that receives the raw distance in metres.

Round 4 computed `F = 1 - invRadius * (distance + 2)` with that normalised value, so the falloff term was about 0.01-0.05 instead of 0-2. `F` stayed near 1 across the whole lookup, and rock stopped only where the lookup stopped: a disc of radius `MaxDistance` (180 m), cut where a neighbouring cell was closer.

### Preview correction

- The Node model had the same wrong assumption; `engine.js` now normalises the `Distance` return type like the game.
- New: `tools/preview/RealPreview.java` runs the game's own generator classes from `HytaleServer.jar` outside the game. It loads the pack's biome and world structure through the real asset codecs, builds the terrain density with a real world seed, and renders a shaded top-down PNG plus underground rock areas. Run it with `tools/preview/real.sh <seed> <out.png> [centreX centreZ size metresPerPixel]`; it writes the current `graph.js` into a scratch copy of the pack first. About 2 seconds for 800 x 800 columns.
  - How it gets round the round 1 dead end: it sets the parsed options and a bare `HytaleServer` object with an event bus by reflection, which is all the asset stores need. Materials are skipped (block types are not loaded), so it follows `BasicWorldStructureAsset.build` and `BiomeAsset.build` by hand for the framework and terrain only.
  - Seed: the world's `Seed` from `universe/worlds/default/config.json`, cast to int, into `SeedBox`.
- Comparison done before asking for a look:
  - Seed of "Arrakis v6" with the round 4 biome reproduces the discs and straight cuts (`round5-discs-reproduced-v6.png`).
  - Seed of "Arrakis v4" reproduces the island in Screenshots/repettive outcrops.png feature for feature, same orientation: two holes, west peninsula, round islet to the south-west, south finger (`round5-seed-check-v4-island.png`, island centre near (1350, -1450)).
- The Node model is now only a rough sketch tool. Decisions in this round were made on the real preview.

### Repaired medium recipe

Still `CellValue` for per-cell values (it was never the fault), still all noise in world coordinates.

- Positions: `Mesh2D` scale 400, jitter 0.14, `MaxDistance` 200. Neighbouring positions are at least 288 m apart, so each cell reaches at least 144 m from its position.
- Survival: `v = WhiteNoise(cell) + shift`, shift from the distance to the nearest island centre: 3 inside 450 m (no outcrop cells on the island or against its shore), 0 at 450 m rising to 1.8 at 1000 m, then 3. A cell is filled when `v < 0.8`: 90% at 450 m, none beyond about 1000 m (about 600 m from the shore).
- Size is separate from survival (in the first repair attempt both came from `v`, so the big sizes only existed right at the inner edge): `1 / radius = CellValue[ Max(gate(v), sizeCurve(WhiteNoise "Size") * shrink) ]`, radius 50 m .. 72 m .. 97 m across the white noise range, shrinking to 0.8 x by 1000 m from the island.
- `distance`: `PositionsCellNoise` with a `Curve` return type, identity curve 0 -> 0, 200 -> 200. Metres.
- `F = Min( 1 - (distance + 2) / radius + lobes + detail, safety )`
  - lobes: `SimplexNoise2D` scale 75, 2 octaves, persistence 0.35, +/-0.45.
  - detail: scale 22, +/-0.03.
  - safety fade: `PositionsCellNoise` `Curve` return 0..128 m -> +5, 140 m -> -5. 140 m is 70% of `MaxDistance` and inside every cell, so no radius value can produce a disc or reach a cell boundary. The largest footprint the recipe itself can make is 97 * 1.48 = 144 m, so the fade only trims the extreme case.
- cap: `SimplexNoise2D` scale 85, 2 octaves, persistence 0.3, curve -1 -> 0.3, -0.2 -> 0.45, 0.2 -> 0.8, 0.6 -> 1.1.
- height: `CellValue[ 0.4 * radius * variety ]`, variety 0.4 .. 0.9 .. 1.4 from a third white noise. Crests about 8-54 m.
- `outcrop = Min( height * Min(F, cap), 200 m * F )`, then the shared `Max`, jitter and stair-step curve.

What did not work on the way (real preview):

- Radius 28-75 m with grid 320: pieces came out about 50 m across and nearly flat.
- Size and survival both from `v`: only six small pieces per island.
- Cap noise scale 45 and lobes scale 60: the busy, cramped terrace texture from the feedback. Smoother cap (scale 85, persistence 0.3) and lobes (scale 75, persistence 0.35) with height 0.4 x radius read as calm as the island.

Result on the "Arrakis v6" seed (`round5-medium-v6-wide.png`, `round5-medium-v6-zoom.png`): about 6-8 medium outcrops per island, roughly 90-190 m across, irregular outlines, closed contours, no circular arcs or straight edges seen across the two chains inspected. Underground (real generator, 2400 x 2400 m, 3 m cells): rock above the sand 44.1 ha, at Y = 40 47.9 ha (1.09 x), at Y = 10 47.9 ha (1.09 x).

Changed from what was asked to be kept: the medium position set went from scale 320 jitter 0.35 to scale 400 jitter 0.14. That is what guarantees an outcrop of up to about 250 m fits inside its own cell.

Feedback (world "Arrakis v7"): no small island at spawn and no large island close by. Correct for that build: in v7 the nearest islands were about 1.8-2.5 km west and north-west. Stages 2, 3, 4 and 5 were then done together.

## Round 5, stages 2-5 — small layer, starting outcrop and pad, routes, guaranteed island

Status: deployed, checked with the real-generator preview on seeds 1791406138722 ("Arrakis v7"), 1791405124027 ("Arrakis v6"), 42 and 7. Not yet seen in game.

### Small layer (stage 2)

Same repaired recipe as the medium layer; the round 2 wedges are no longer used.

- Positions: `Mesh2D` scale 150, jitter 0.14, `MaxDistance` 77. Safety fade to no rock by 54 m.
- Radius 14 .. 22 .. 36 m (about 30-100 m across), shrinking to 0.8 x by 1000 m from the island.
- Filled when `v < 0`: half the cells at 400 m from an island centre, none beyond 1000 m. No cells inside 400 m.
- Lobes scale 28 +/-0.45 (persistence 0.35), detail scale 9 +/-0.03, cap scale 32 (persistence 0.3).
- Height 0.45 x radius x variety; variety 0.3 .. 0.9 .. 1.3 for most cells, 3.5-4.5 for the top 7% (tall stacks, up to about 60 m on a small footprint).

### Guaranteed island (stage 5)

- Island centres are now `Union[ List[(640, 0, -480)], FieldFunction[ grid ] ]`.
  - The guaranteed centre is 800 m from spawn, to the north-east (east is +X, north is -Z). With the 300 m nominal radius its near shore is about 500 m from spawn. Fixed direction for now.
  - The grid (`Offset 900 > Occurrence 0.7 > Mesh2D 2500 jitter 0.2`, unchanged) is filtered by a `FieldFunction` position provider: a `PositionsCellNoise` on the guaranteed centre with a `Curve` return 0 below 1200 m and 1 from 1200 m, delimiter 0.5..2. Grid centres within 1200 m of the guaranteed island are dropped.
- Every use of the island positions (radial falloff, both outcrop fades) uses the union, so the guaranteed island gets a normal chain.
- Stepping stones: near spawn the small layer's survival shift is capped, so about 30% of small cells within 280 m of the origin are filled whatever the island distance. The medium layer has no cells within 350 m of spawn.

### Dune fade at spawn (stage 3)

- Dune branch noise term is now `(Clamp(noise) + 1) * t - 1`, where `t = CurveMapper(distance from origin + wobble)`, wobble `SimplexNoise2D` scale 160, +/-45 m, and the curve is 0 at 165 m, 1 at 275 m. So `t` is 0 within 120 m of the origin and exactly 1 from 320 m outwards: dunes beyond 320 m are unchanged. This is wider than the 250 m asked for; see "did not work".
- The copy of the dune height inside the rock graph uses the same nodes, so rock heights stay sand-relative.

### Starting outcrop and landing pad (stages 3 and 4)

- Not part of any position set: it is built from `Distance` (distance from the world origin), so it exists in every world.
- `F = 1 - d / 100 + lobes + detail`, lobes `SimplexNoise2D` scale 75 +/-0.3, world coordinates, so the outline differs per seed. About 140-260 m across.
- Natural height: `Min(30 m * F, cap) + lookout`
  - cap: noise scale 70 mapped to 6 .. 10 .. 15 m.
  - lookout: up to +20 m where `Abs(SimplexNoise2D scale 110)` is above 0.3, limited to where `F` is above 0.25. Measured high points on four seeds: 31-33 m above sand level, each in a different place 45-65 m from the origin.
- Not terraced. The stair-step curve has 3-9 m risers, which no route could cross; a smooth height field quantised to blocks gives steps of 1 block wherever the slope is below 1, which is nearly everywhere here.
- Pad: `height = 10 m + (natural - 10 m) * w`, `w` = 0 within 16 m of the origin and 1 from 45 m. So the pad is exactly Base + 10 in every world (top block Y = 89, standing at Y = 90), nothing inside it is higher, and the natural shape takes over smoothly.
- Other rock: islands and outcrop layers are masked out within 30 m of the origin (replaces the old 70-90 m spawn mask), then `Max` with the starting outcrop.
- Root cut applied through an identity `CurveMapper` with the same -4 m cut.
- Spawn in `WorldStructures/Arrakis.json`: (0.5, 91, 0.5), i.e. Base + pad height + 1.

Real-generator checks (`WALK=1 tools/preview/real.sh <seed> out.png 0 0 800 1` adds a flood fill from the origin that only crosses height changes of 1 block or less):

- Pad top block Y = 89 across the whole 15 m radius on all four seeds.
- Sand reached from the pad without a step over 1 block in all eight compass directions on all four seeds; about 32,000-34,000 m2 of rock is walkable from the pad.
- Underground: rock above the sand 43.9 ha, at Y = 40 and Y = 10 46.9 ha (1.07 x).
- 4-6 small outcrops within about 300 m of spawn on the v7 seed, between spawn and the guaranteed island.

What did not work:

- Dune fade by clipping the dune noise against a cone (`Min(noise, ramp)`): a clean circular scarp about 190 m from spawn. Scaling instead of clipping removed the crease but the edge was still a circle. Perturbing the distance with noise before the fade curve makes the edge wander; that needs room on both sides, hence 320 m rather than 250 m. A dune front is still visible in places as a steep bank; it is no longer an arc.
- Pad by clamping the natural height between two cones (floor and ceiling easing away from the pad): a visible disc with radial facets. The weighted blend above has no crease.

Against the play requirements: starts on rock (yes), fixed pad height (yes), two walkable routes (yes, eight), flat bench about 30 x 30 m besides the pad (not measured; the low cap gives broad gentle ground but nothing forces a flat bench), island shore about 500 m away (yes, fixed direction), 3-6 small outcrops within 300 m (yes on the seed checked).

Feedback: _pending_

# Reset to the round 5 state

Rounds 6-8 (cave networks and entrances, softened terrace profile, alcoves) were set aside. That work, with its log entries and the preview tool's cave, face and pocket surveys, is on the local branch `caves-experiment` (commit 46bd112). `main` went back to commit 2d58ca6 so caves and openings can be approached differently.

Two fixes made on top of that state (world "Arrakis V1", log clean, no `Took too long`):

- Materials: the upper rock block is `Rock_Sandstone` again instead of `Rock_Sandstone_White`. The sand-level rule is otherwise unchanged (`Rock_Sandstone` from 3 blocks below Base upwards, `Rock_Sandstone_Red` deeper).
- Spawn bug: players were appearing at (0, 140, 0), 50 blocks above the landing pad, and had been since round 5. Cause: the generator takes spawn points from a top-level `SpawnPositions` key in the world structure (vanilla: `"SpawnPositions": { "Type": "Imported", "Name": "Spawns" }`). Ours only had the framework `Positions` entry named "Spawns", which nothing reads on its own. With no spawn positions, `Handle.getSpawnPoints` falls back to a hard-coded (0, 140, 0); the server log shows "joined world 'default' at location (0, 140, 0)". Fix: added `"SpawnPositions": { "Type": "List", "Positions": [{ "X": 0.5, "Y": 91, "Z": 0.5 }] }` inline (not imported, because vanilla also exports the name "Spawns"). `write.js` now writes it too. Not yet confirmed in game.

Confirmed in game: world "Arrakis v2" log shows the player joining at (0.5, 91, 0.5). Log clean.

# Vanilla recipe showcase

Why: our rock is a height field pushed through a stair-step curve (about 470 nodes). Hytale's own World Gen V2 terrain biomes are 45-150 nodes and work differently. Before building more, look at theirs in game, in sandstone. The real Arrakis biome and world structure are untouched in this round.

## How the vanilla biomes build terrain

All of them are true 3D densities: a vertical gradient (a `CurveMapper` on `BaseHeight` distance, positive low down, negative high up) summed with noise, so the surface is wherever the sum crosses zero. None is a height field through a curve. Most end with the same wrapper: `Mix(terrain, "solid below Base", gate on height)`, which forces solid ground below Base and open air above a ceiling.

Node counts are for the terrain density only.

| Biome | Nodes | Main ingredients | Cliffs | Ledges | Meets neighbours by |
| --- | --- | --- | --- | --- | --- |
| Plains1_Mountains | 76 | Height gradient + base noise (scale 200) + texture noise (scale 50). `Max(peaks, hills)`. | A second, steeper formula (`Max` of two sums) is `Min`-ed in, and a "cliff mixer" noise (scale 150) blends between that and a constant 1 (no effect). So cliffs come in patches. | A sawtooth `CurveMapper` on (noise scale 350 + height ramp), added at +/-0.075. They wander with the noise. | `DistanceToBiomeEdge` curve 0 -> -0.75, 64 -> 0 added to the sum: height drops towards the border. |
| Taiga1_Mountains | 73 | Height gradient + base noise (scale 400) + 2D cell noise "boulders". Evaluated through `YSampled` (sample every 8 blocks vertically, interpolate). | 3D cell noise (two rotated `CellNoise3D`) multiplied in as a cliff texture: craggy, fractured faces. | None as such; the cell-noise texture gives blocky breaks. | Cliff texture switched off within about 20 m of the border. |
| Experimental/Mountains | 75 | Height gradient + squared noise (scale 500). | Slope-aware: `Angle` of the `DensityGradient` of the base terrain (steepness in degrees), normalised 30-70 degrees, mixes in the ledge and cell-noise detail only where the ground is steep. | Sawtooth curve on (height + noise scale 700), 10 teeth, limited by a Manhattan cell noise. | Nothing: no border fade at all. |
| Experimental/Plateaus | 75 | Several stacked "top noise + height gradient" layers combined with `Min`/`Max`: flat tops at a few levels. | Driven by `DistanceToBiomeEdge` (curve 0 -> -1, 48 -> 1): the mesa wall IS the biome border. | Stacked levels from the separate layers. | The cliff itself. |
| Experimental/Taiga1_Redwood_2dCliffs | 77 | Base noise (scale 500) + 2D cell noise + height gradient. | A banded texture: four copies of one height curve at different offsets, picked by `MultiMix` with a noise, applied only where a `Gradient` (slope) node says the ground is steep. | The height bands of that curve. Fixed heights, like our rejected undercuts. | No border term. |
| Plains1_Gorges | 152 | Many `PositionsCellNoise` (`Distance2Div`) layers with `AmplitudeConstant`: a network of cracks between rounded blocks. Not read in full detail. | The crack walls. | Not identified. | Not checked. |
| Experimental/Dunes | 65 | Two dune fields (noise scale 600 + 200) with a slip-face term from a stretched noise applied where a `Gradient` node finds steep ground. Heights are measured from `Bedrock` (100-180), i.e. it assumes Base = 100. | Slip faces only. | None. | None. |
| Experimental/Arches | 49 | 5 m cell lattice (`CellValue`) + noise; reads a "World-Continent-Map" export that no shipped asset provides, so it is a constant 0 in practice. | n/a | n/a | n/a. In the preview it is a low maze-like texture, not arches. |
| Generative/Generative_Arches | 43 | Anchored shapes on a regular 30 m and 60 m grid with 3D noise, `SmoothMin`. | n/a | n/a | n/a. Small repeated objects on a grid. |
| Generative/Generaitve_Boulders_Sandstone | 43 | Anchored `Distance` + tilted `Cuboid` + 3D noise on a regular 60 m grid, at absolute heights (Y 100 and 125). | n/a | n/a | n/a. Identical boulders in rows: a test pattern. |
| Desert1_Stacks | 73 | Dunes plus rock stacks from `PositionsCellNoise` with a `Curve` return. | Stack sides, via the distance curve. | 3D noise texture. | Stack positions filtered by `DistanceToBiomeEdge`. |
| Desert1_Rocky | 331 | The big one: cliffs, boulders, twists (`PositionsTwist`), many cell-noise layers. | Several mechanisms. | Several. | Biome interpolation section. Not read in full. |

Corrections to the brief's reading of Plains1_Mountains:

- "True 3D density, vertical gradient plus 2D noise": correct.
- "Ledges from a sawtooth `CurveMapper` on noise plus height at small strength": correct. The curve alternates +1/-1 about every 0.2 of input, and the result is scaled to +/-0.075.
- "A cliff mixer noise blends between a cliffy and a smooth version": nearly. The mixer blends between a cliff-limiting term and a constant 1, and the result is `Min`-ed with the smooth terrain. Where the mixer is high the limit is 1 and does nothing; where it is low the steeper formula cuts in. Same effect: cliffs in patches.
- "Fades at its border with `DistanceToBiomeEdge`": correct, over 64 m in the curve. But the vanilla zone world structures set `MaxBiomeEdgeDistance` to 32, so only the first half of that curve is ever reached.
- "Caves are one `Min` against an imported cave density": correct (`Plains1_Caves_Terrain`).
- Node count: 76 for the terrain, about 110 with materials. Not 60, but far below our 470.

## Showcase world

- World structure `Arrakis_Showcase` (`NoiseRange`). Its biome map is `CurveMapper(XValue) + CurveMapper(ZValue)`: a column index from X plus 10 x a row index from Z inside each 500 m square, a large negative number in the 200 m gaps. Each biome owns a range of width 1 around its value; the gaps fall through to the default biome `AS_Flat` (flat sand). Base 100 (the vanilla value these recipes assume), spawn (0.5, 102, 0.5), `MaxBiomeEdgeDistance` 32 and `DefaultTransitionDistance` 32 as in the vanilla zones.
- Biomes `AS_*` in `Biomes/Arrakis_Showcase/`, generated by `tools/showcase/build.js` from an extracted copy of the game's assets. Terrain densities are copied unchanged except:
  - every `ExportAs` name and the imports that refer to it get an `AS_` prefix, because export names are global across packs;
  - the "World-Continent-Map" import in Arches is replaced by the constant 0 it already resolves to;
  - node-editor metadata is dropped.
  `Plains1_Caves_Terrain` is still imported from the game, so the five biomes that use it keep their caves.
- Skin: all solid blocks `Rock_Sandstone` over a bedrock layer; Dunes and the flat filler are `Soil_Sand_White`. No soil-on-rock distinction was attempted: the vanilla material providers were dropped whole. No props, tint or creatures; environment `Env_Arrakis`.

Layout (east is +X, north is -Z; spawn at the origin on flat sand between Gorges and Dunes):

| | x -1050 (far west) | x -350 (west) | x +350 (east) | x +1050 (far east) |
| --- | --- | --- | --- | --- |
| z -700 (north) | Plains1_Mountains | Taiga1_Mountains | Experimental Mountains | Plateaus |
| z 0 | Taiga1_Redwood_2dCliffs | Plains1_Gorges | Dunes | Arches |
| z +700 (south) | Generative_Arches | Boulders_Sandstone | Desert1_Stacks | Desert1_Rocky |

How to create it: make a new world in the game with the Arrakis mod on, exit to the main menu, run `tools\showcase\Use-Showcase.ps1 -WorldName "<name>"`, load the world. The script adds `"WorldStructure": "Arrakis_Showcase"` to the world's `WorldGen` (our provider already reads it), deletes the chunks already generated and the saved player positions.

Checks:

- Real Arrakis: `Arrakis_Terrain.json` and `WorldStructures/Arrakis.json` are unchanged (no diff).
- All 13 showcase biomes and the world structure load through the game's asset codecs with no failures, and each of the 12 terrain densities builds and renders in the real-generator preview (`tools/showcase/showcase-preview.png`, each tile 500 m, previewed as if deep inside the biome). The preview can now render any biome: `BIOME=<id> WS=<structure> EXTRA_DENSITY=<game Density folder> NO_WRITE=1 tools/preview/real.sh <seed> out.png 0 0 500 1.25`.
- Not checked outside the game: the biome map itself, the borders between squares, and the log. The preview builds one biome at a time and does not run the biome-map and biome-distance stages.

Expect in game: square outlines. Plateaus in particular draws its cliff along the biome border, so it will be a square mesa. Mountain squares will slope down to their edges over about 32 m.

## Options for using a vanilla recipe on Arrakis (part 3, for after the look)

A. Rock and sand as separate biomes, our placement as the biome map.
- The world structure's `Density` is an ordinary density, so the island and outcrop footprint field could be the map: rock biome where it is positive, sand biome elsewhere. The starting outcrop and guaranteed island would move into that map.
- Gain: vanilla recipes drop in unchanged, including their `DistanceToBiomeEdge` edge behaviour, and rock and sand get separate, simple material providers.
- Risk, not verified: how the engine blends terrain across a border (`DefaultTransitionDistance` 32) and how it measures `DistanceToBiomeEdge` were not read from the jar. Vanilla mountains fade over 32-64 m from the border, so a rock body 40 m across would be all border and never reach its height. Small outcrops probably cannot be biomes of their own.
- Cost: dunes, the dune fade at spawn, the landing pad and the "rock heights measured from the sand" trick all currently live in one density and would have to be split across two biomes. The sand-level material rule stays easy (it only needs Y).

B. Keep one biome; transplant only the vanilla mountain density in place of the terraced height field.
- Keep everything that works: sand floor, dunes, positions, fade, pad, spawn, material rule on the exported rock density.
- Replace `terraced(height)` with the vanilla 3D formula, and feed it our own footprint field wherever the vanilla recipe uses `DistanceToBiomeEdge` (ours is already "how far inside the body", per body, at any size).
- Gain: works for bodies of any size including 40 m outcrops; no dependence on unverified biome-border behaviour.
- Cost: the rock is no longer a height per column, so "rock top per column" tricks (the round 3 root cut, the pad blend) need restating for a 3D density. Heights have to be rescaled per body, since vanilla mountains assume one fixed height range.

C. Hybrid: large islands as a biome (A), outcrops and the starting outcrop inside the sand biome as now (B-style or current). More moving parts; only worth it if A's border behaviour turns out to look much better than a transplanted formula.

Recommendation before seeing it in game: B, because isolated bodies down to 40 m are the core of this world and A's border blending is the unverified part. Worth reading the biome-distance stage in the jar before deciding.

## Showcase feedback (world "Arrakis shocse")

Loaded cleanly on `Arrakis_Showcase`: no `Took too long`, no load failures, spawn (0.5, 102, 0.5), 13.5 ms per chunk over 1000 chunks. One warning from our files, inherited from vanilla: "Duplicate export name for asset: AS_Plains1-Gorges-BaseTerrain" (the vanilla Gorges file uses that export name twice).

Numbering agreed: #1 at the north-west corner, counting east along each row, then down. So #1 Plains1_Mountains, #2 Taiga1_Mountains, #3 Experimental Mountains, #4 Plateaus, #5 Redwood_2dCliffs, #6 Plains1_Gorges, #7 Dunes, #8 Arches, #9 Generative_Arches, #10 Boulders_Sandstone, #11 Desert1_Stacks, #12 Desert1_Rocky.

Picks and why:

- #1 Plains1_Mountains: the sharp jagged mountains that protrude.
- #3 Experimental Mountains: the crevices and caves.
- #5 Redwood_2dCliffs: the carved look of the cliff faces.
- #6 Plains1_Gorges: the deep canyons.

Direction: give each generated island its own recipe, chosen at random from mixes of these four.

# Mixed-island showcase

Status: deployed, all twelve islands rendered with the real-generator preview (`tools/showcase/mix-preview.png`). Not yet seen in game.

World structure `Arrakis_Mix`, biomes `AM_*` in `Biomes/Arrakis_Mix/`, generated by `tools/showcase/build-mix.js`. Each biome is a 1100 m tile of flat sand with one island at its centre. Base 100, spawn (0.5, 102, 0.5).

## How an island is built

- Footprint field `F`: the Arrakis large-island recipe with the same numbers (radial falloff 0 at 300 m, lobe noise scale 230 +/-0.62, detail scale 60 +/-0.05), centred on the tile with a `List` position, different noise seeds per island.
- Vanilla terrain: the root density of each chosen biome is copied unchanged, with two substitutions: export names get a per-copy prefix, and every `DistanceToBiomeEdge` node is replaced by `Clamp(0, 2000)[300 * F]`, roughly metres inside the shore. That is the option B transplant from the section above: the recipe thinks the island shore is its biome border.
- Merge, when an island has more than one recipe: by patches. `Mix(A, B, mask)`, mask from a `SimplexNoise2D` scale 240 through a curve that gives each recipe a similar share with a blend zone 0.6 of noise range wide. Three or four recipes are chained.
- Island limit: `rock = Min(merged, coast, footprint)`.
  - coast: `3.9 * F` plus a height term falling 0.01 per metre, i.e. rock may rise 1.3 m per metre in from the shore.
  - footprint: -5 where `F < -0.012`, +5 from -0.01, so nothing exists outside the footprint at any depth and the root goes straight down.
- Terrain: `Max(flat sand floor at Base, rock)`. No dunes in this showcase.
- Material: the sand-level rule on the exported rock density (`Rock_Sandstone` from 3 blocks below Base up, `Rock_Sandstone_Red` deeper), sand elsewhere.

## Layout (east is +X, north is -Z; island centres)

| | x -1650 | x -550 | x +550 | x +1650 |
| --- | --- | --- | --- | --- |
| z -1100 | M1: recipe 1 | M2: recipe 3 | M3: recipe 5 | M4: recipe 6 |
| z 0 | M5: 1 + 3 | M6: 1 + 5 | M7: 1 + 6 | M8: 3 + 5 |
| z +1100 | M9: 3 + 6 | M10: 5 + 6 | M11: 1 + 3 + 5 | M12: 1 + 3 + 5 + 6 |

Node counts for the rock density: single recipes 108-185, pairs 188-306, the four-way mix 464.

## Seen in the preview

- All twelve build and come out island-sized with the Arrakis outline character.
- Recipe 5 (2dCliffs) leaves large sand holes and a few straight edges where its own ground sits at or below Base; islands with a lot of it (M3, M8) are thin and broken up.
- Recipe 6 (Gorges) gives the densest, most solid islands, cracked all over.
- Recipes 1 and 3 give lobed mountains with a few sand gaps.
- First attempt at the merge used a blend zone 0.24 of noise range wide and showed hard seam lines between patches; widened to 0.6.

## Known limits

- Caves from the vanilla cave density that fall below Base inside an island fill with sand, because the sand floor is solid there (the "cave air must win over sand inside rock" problem from the set-aside round 6).
- The four recipes use different density scales (their final multipliers are 2, 0.2, 0.5 and 1), so in a blend zone the surface leans towards the larger-scale recipe.
- Heights are whatever the vanilla recipe gives (up to about 150-200 m above Base); nothing ties height to island size yet.
- Preview is of one biome at a time; tile borders and the log are untested until a load.

How to create it: `tools\showcase\Use-Showcase.ps1 -WorldName "<name>" -WorldStructure Arrakis_Mix` on a fresh world.

## Mixed-island showcase, first load (world "Arrakis shocse" on Arrakis_Mix)

- Loaded: no Took too long, no load failures, no unused keys. Five "Duplicate export name" warnings, one per copy of the Gorges recipe (AM4a, AM7b, AM9b, AM10b, AM12d), inherited from the vanilla file.
- Generation time: 25.5-31.3 ms per chunk in the 100-, 500- and 1000-chunk reports (27.3 ms at 1000). That is about twice the Arrakis world (13.5-15 ms). The first chunk took 250 ms.
- An exception at shutdown ("World thread is not accepting tasks") appears after the client disconnected; it is from the world closing, not from generation.
- Feedback: the peaks are great, but too much of each island is above ground. Lower the rock 20 blocks, so the sand ocean is in effect 20 blocks higher on it.

Change: the merged vanilla terrain is wrapped in `Slider` with `SlideY` -20 (`SINK` in `build-mix.js`). `Slider` evaluates its input at position minus the slide, so the terrain is read 20 blocks higher up and the whole shape moves down 20. The coast limit, footprint, sand floor and material rule are not shifted: sand level stays at Base.

Heights after lowering (real-generator preview, sand level Y 100):

| Island | Highest top block | Average rock top |
| --- | --- | --- |
| M1 (#1) | Y 200 | Y 137 |
| M2 (#3) | Y 189 | Y 126 |
| M3 (#5) | Y 130 | Y 112 |
| M4 (#6) | Y 140 | Y 116 |
| M5 (#1 + #3) | Y 225 | Y 136 |
| M6 (#1 + #5) | Y 207 | Y 130 |
| M7 (#1 + #6) | Y 196 | Y 126 |
| M8 (#3 + #5) | Y 234 | Y 122 |
| M9 (#3 + #6) | Y 205 | Y 123 |
| M10 (#5 + #6) | Y 141 | Y 114 |
| M11 (#1 + #3 + #5) | Y 205 | Y 132 |
| M12 (all four) | Y 198 | Y 125 |

Heights before lowering were not recorded. Deployed; the world's chunks were cleared again.

## Mixed-island showcase, second pass: three sizes and the root rule

Feedback on the lowered islands: all twelve are right for large islands and should each be a possible variant; #12 (M12) has floating clusters of blocks above the main body. Next: scale the variants down for medium and small islands by lowering them further (another 20 blocks for medium, another 10 for small) and keeping what stays above the sand. And the standing rule again: once rock is below the sand surface it must fall away steeply to bedrock, so islands and their caves are not joined under the sand.

Status: deployed, rendered with the real-generator preview (seed 4242), not yet seen in game.

Each tile (1500 x 1100 m) now shows one variant as six shapes, all from the same recipe:

| Size | Lowered by | Footprint radius | Offset from tile centre |
| --- | --- | --- | --- |
| Large | 20 blocks | 300 m | (-300, 0) |
| Medium | 40 | 90 m and 60 m | (380, -230) and (400, 200) |
| Small | 50 | 36, 25 and 18 m | (610, -330), (630, -20), (600, 340) |

Tile centres: x -2250, -750, 750, 2250; z -1100, 0, 1100. Same variant order as before (M1-M4 single recipes #1 #3 #5 #6; M5 1+3, M6 1+5, M7 1+6, M8 3+5; M9 3+6, M10 5+6, M11 1+3+5, M12 all four). Spawn (0.5, 102, 550.5).

How it is built:

- The variant's recipe is exported once per tile with `SingleInstance: false`; each use is `Slider(SlideY = -sink)[Imported recipe]`, so the three size classes are the same recipe read 20, 40 or 50 blocks higher up.
- Each size class is `Mix(-5, body, inside-footprint)`. `Mix` evaluates only its first input where the influence is 0, so the recipe is not evaluated outside the footprints.
- `body = Min(lowered recipe, coast, root)`.
  - coast: rock may rise 1.3 m per metre in from the shore of its own footprint.
  - root: `CurveMapper( YOverride(Base - 4)[ Cache[ lowered recipe ] ] )`, -5 where that is not positive, +5 where it is. A column keeps rock, at every depth, only if the recipe is solid 4 blocks below sand level there. So every mass that breaks the sand has its own vertical-sided root and nothing joins up underneath.
- Biome-edge substitute: the recipes are told how far inside their shape a column is on the scale of a full-size island (`300 * F` for every shape, whatever its radius).

Measurements (1400 m view per tile, 3.5 m columns):

| Tile | Rock above the sand | Rock at Y = 40 | Rock at Y = 10 |
| --- | --- | --- | --- |
| M1 | 30.3 ha | 0.94 x | 1.01 x |
| M2 | 14.6 ha | 0.87 x | 1.05 x |
| M3 | 11.0 ha | 1.12 x | 1.12 x |
| M4 | 25.5 ha | 0.97 x | 1.09 x |
| M5 | 25.5 ha | 0.89 x | 1.03 x |
| M6 | 21.9 ha | 0.99 x | 1.02 x |
| M7 | 29.1 ha | 0.92 x | 1.04 x |
| M8 | 13.1 ha | 1.06 x | 1.07 x |
| M9 | 23.4 ha | 0.93 x | 1.06 x |
| M10 | 18.7 ha | 0.97 x | 1.11 x |
| M11 | 21.6 ha | 0.92 x | 1.04 x |
| M12 | 21.7 ha | 0.98 x | 1.06 x |

Underground area never exceeds 1.12 x what shows above the sand. Values under 1 at Y = 40 are the recipes' own caves.

Floating rock on the large island of each variant (new `FLOAT=1` mode: 2 m voxels from 4 below sand level up, flood fill from the lowest layer; pieces joined only diagonally count as floating, so this overstates):

| Variant | Pieces | Total | Biggest |
| --- | --- | --- | --- |
| M1 (#1) | 1 | 8 m3 | 8 m3 |
| M2 (#3) | 1 | 8 | 8 |
| M3 (#5) | 3 | 24 | 8 |
| M4 (#6) | 11 | 152 | 40 |
| M5 (1+3) | 14 | 168 | 24 |
| M6 (1+5) | 7 | 72 | 24 |
| M7 (1+6) | 14 | 1224 | 712 |
| M8 (3+5) | 6 | 48 | 8 |
| M9 (3+6) | 16 | 616 | 424 |
| M10 (5+6) | 13 | 200 | 72 |
| M11 (1+3+5) | 9 | 304 | 152 |
| M12 (all four) | 8 | 112 | 40 |

So floating rock is not special to M12. Single recipes #1, #3 and #5 are nearly clean; every merge and anything containing #6 (Gorges) produces some, and on this seed the worst are 1+6 and 3+6. It depends on the seed. Nothing has been done about it yet: a density cannot test whether a piece is attached, so it has to be prevented at the source (the patch blend between recipes of different scale is the likely culprit for merges; Gorges makes some on its own).

What did not work:

- Feeding the recipes real metres inside a small footprint (`radius * F`): their own border fade over 32-64 m flattened the medium outcrops to a few fragments and the small ones to nothing. Scaling every shape as a full-size island fixed that.

What the preview shows: large islands as before; medium footprints give one or two masses of 40-100 m; small footprints give a rock of 15-40 m or sometimes nothing. Outcrop peaks are about 45 m above the sand on the 1+3 tile.

Not done: variants are not yet picked at random per island in the real Arrakis world. This is still the showcase.

# Variants in the real Arrakis world

Decisions from the three-size showcase: remove the worst merges for floating rock; empty small outcrops are acceptable; put the variants into the real build and test a world; one of the island types must sit at spawn so players start on rock.

Status: deployed, checked with the real-generator preview on seeds 1791406847363, 42, 7 and 99. Not yet seen in game.

## What changed in Arrakis_Terrain

The terraced height-field rock (rounds 2-5) is replaced. Dunes, the dune fade at spawn, the sand floor, island and outcrop positions and footprints, the chain fade, the guaranteed island and the sand-level material rule are kept. `graph.js` builds the new rock when `PARAMS.variants` is set; `write.js` needs `VANILLA_GEN` pointing at an extracted copy of the game's `Server/HytaleGenerator`.

- Ten variants (1+6 and 3+6 dropped): #1, #3, #5, #6, 1+3, 1+5, 3+5, 5+6, 1+3+5, 1+3+5+6. Each is exported once as `ArrakisV<n>`, not single-instance.
- Pick: one white-noise value per large island (`CellValue` on the island positions, exported as `Arrakis_Pick`, cached per column). Medium and small outcrops read the same value, so a chain uses its island's variant. The starting island has its own pick from the origin (`Arrakis_Pick_Start`).
- Only the picked variant is evaluated: `Max` over `Mix(-5, Slider(-sink)[variant], pick-is-this-one)`; `Mix` skips its second input when the influence is 0.
- Size classes, each `Mix(-5, Min(picked variant, coast, root), inside-footprint)`:

| Class | Footprint | Lowered by |
| --- | --- | --- |
| Large island | island field, 300 m nominal radius | 20 blocks |
| Medium outcrop | medium layer field (radius 50-97 m per cell) | 40 |
| Small outcrop | small layer field | 50 |
| Starting island | radius 100 m at the origin | 30 |

- Coast: about 1.3 m of rise per metre in from the shore (nominal radius per class).
- Root: a column keeps rock at any depth only if the picked variant is solid 4 blocks below sand level (Base - 4).
- Biome-edge substitute: `Arrakis_Inside` = 300 x the largest footprint field at that column, exported single-instance and imported at every `DistanceToBiomeEdge` site.
- Islands and outcrops are cleared within 30 m of the origin.
- Landing pad: two cones around the origin. Inside 16 m both sit at Base + 10, so the pad is flat and open to the sky; outside, the lower one falls and the upper one rises at 0.6, so the ground next to the pad is walkable either way. The lower cone stops at a vertical edge 35 m out (root rule). Spawn stays (0.5, 91, 0.5).

## Checks (real generator)

- Asset loads and builds; biome file about 2.1 MB, rock graph about 3,200 nodes.
- Pad: top block Y 90 across the whole 15 m radius on all four seeds. (Round 5's pad measured Y 89; the cone formula lands exactly on zero at Y 90, so the block there is solid. Spawn Y 91 is standing height on it.)
- Routes: sand reachable from the pad without a step over 1 block in all eight directions on three seeds and in six of eight on the fourth.
- Underground, 2600 m view round spawn: rock above the sand 38.7 ha, at Y = 40 46.2 ha (1.19 x), at Y = 10 42.1 ha (1.09 x). The Y = 40 figure is above the old 1.15 target; rock hidden under dunes just above sand level and the pad's base count as "not showing".
- 7 km view (`tools/preview/variants-world-7km.png`): every large-island site has rock, but islands differ a lot in how much. The guaranteed island on that seed is a full, solid island (`variants-main-island.png`); several others are a scatter of fragments.

## Problems found

- Curves: `curve()` in `graph.js` rounds inputs to 5 decimals, so 1e-6 offsets collapsed onto their neighbours and the asset failed validation ("More than one point with Y value"). Use 1e-4.
- `Distance` is a 3D distance from the world origin. The pad cones and the 30 m clearing are evaluated per voxel, not under a `YOverride`, so at Y 85 the "distance" was already 85 and there was no pad at all. They are now wrapped in `YOverride(0)`.
- A `String.replace` with a replacement containing `$'` silently mangled the patch (JavaScript replacement pattern). Use a function replacement.

## Known weaknesses going into the game test

- Thin islands: variants built on #5 alone or 5+6 are low (30-40 m in the showcase), so lowered 20 blocks little is left, and their medium and small outcrops are mostly empty. About three of the ten variants give weak islands.
- The pad sits in a round bowl or on a round mound where the variant's ground differs from Base + 10; the cones are visibly conical.
- Floating rock was reduced by dropping two merges, not eliminated.
- Caves from the vanilla cave density that fall below sand level inside rock fill with sand.
- Generation time is unmeasured. The showcase ran at about twice the old Arrakis time, but there every column was inside a tile of recipe; here most of the world is sand and skips the recipes.

## First game test of the variants (world "Arrakis v2 1"): whole world painted sandstone

Report: the whole world was sandstone instead of the white-sand ocean.

Cause: mine, in the integration step. To keep the definition of `Arrakis_Inside` in the tree I added `Multiplier[0, definition]` as a third input of the `Max` that forms `Arrakis_Rock`. That input is a constant 0, so outside every rock body the rock density became `Max(-5, -5, 0) = 0` instead of -5. The terrain shape did not change (0 is not solid), which is why the preview images looked right, but the material rule paints rock wherever the exported rock density is between 0 and 100, and 0 qualifies. Every solid block in the world passed that test, including all the sand. The sand, dunes and material rule themselves were not changed.

Fix: the holder is now added (`Sum(Max(others, start), 0 * definition)`) instead of being a `Max` input, so the density outside rock is -5 again.

New preview check, because the old ones could not see this: `materials:` counts sand-surface columns where the rock density at the surface block is >= 0. Deployed build: 140,359 of 140,359. Fixed build: 0 of 140,359 (seed 42, 1600 m view).

From that world's log: no `Took too long`, no load failures; 21.5 ms per chunk over 1000 chunks (24.3 at 500, 36.6 at 100), against 13.5-15 ms for the old world.

## Second game test of the variants (world "Arakis v3", seed 1791432644696)

Sand ocean confirmed back in the preview for that seed (0 of 618,723 sand columns painted as rock). Log clean; spawn (0.5, 91, 0.5); 21-25 ms per chunk in the 500- and 1000-chunk reports. On that seed the guaranteed island drew a thin variant (a branching ridge). Verdict: thin islands look fine; keep all ten variants.

# Islands by latitude

Request: the spacing between large islands should vary north to south, as in Dune: bigger land in the north, open desert in the south. Answers to my questions:

1. About 10 km north the islands should form east-west ("latitudinal") land; by 20 km north back to the spacing at spawn, giving a belt of land. Going south over 20 km, down to medium islands only, 600-2500 m apart, and it stays like that. (The answer said "0 to 20 km closer, 20 km to 10 km further"; read as: peak at 10 km north, back to normal at 20 km north.)
2. Far north: dense large islands with sand channels, not solid continents.
3. Far south: as in 1.
4. Northern islands bigger and wider east-west.
5. One rock variant per land mass.
6. No east-west variation.
7. Spawn and the guaranteed island stay as they are.

Status: deployed, rendered with the real-generator preview on seed 1791432644696. Not yet seen in game.

## How it is built (north is -Z)

All curves are `CurveMapper(ZValue)` and hold their end values beyond the last point.

- Regular large islands (2500 m grid, 300 m radius): the keep-chance in `Occurrence` is now a curve instead of 0.7: 0.7 at 20 km north, 0.15 at 10 km north, 0.7 from 2.5 km north to spawn, falling to 0 at 20 km south.
- Belt islands, new: their own `Mesh2D` grid, 4000 m east-west by 1800 m north-south, jitter 0.12, kept with a chance of 0 at 2.5 km north, 0.9 at 10 km north, 0 at 20 km north.
  - Footprint: `PositionsCellNoise` with a `Density` return type; the choice is the belt strength at the island centre (0 at the belt's edges, 1 at its core) and picks one of four anchored `Ellipsoid` sizes, half-axes east-west x north-south: 500 x 330, 750 x 400, 1050 x 470, 1350 x 520 m.
  - Plus broad lobes (`SimplexNoise2D` scale 520, +/-0.45), smaller bays (scale 150, +/-0.14) and the usual coast detail. The lobes are what cut sand channels into them.
- Island field = `Max(regular field, belt field)`. Island positions = `Union(guaranteed, filtered regular grid, belt)`, so chains, the variant pick and the biome-edge substitute all see belt islands.
- South: the medium outcrop layer's survival shift gets a second term by latitude, so cells fill on their own whatever the island distance: none at spawn, 15% of cells by 20 km south (400 m grid, so of the order of 1 km apart). The small layer has no such term, so with no large islands there are no small outcrops.
- Variant pick: `Mix(white noise at the medium cell, white noise at the nearest island centre, near-an-island)`, where near-an-island is 1 on a large-island footprint or within 1200 m of an island centre. So a land mass and its chain share one variant, and a free-standing southern medium island picks its own.

## Preview, 10 km views down the centre line

| Centre | Rock share of the view |
| --- | --- |
| 20 km north | 2.5% |
| 15 km north | 8.2% |
| 10 km north | 12.9% |
| 5 km north | 7.6% |
| spawn | 1.9% |
| 5 km south | 1.5% |
| 10 km south | 1.1% |
| 20 km south | 0.2% |

Images: `tools/preview/latitude-series.png` (the eight views) and `latitude-belt-zoom.png` (3.6 km at the belt core: one belt island about 2.7 km by 1 km, laced with sand channels, and one that drew a thin variant and is a scatter of pieces).

Other checks: pad top block Y 90 and sand reachable in all eight directions (unchanged); 0 sand columns painted as rock. Biome file about 2.5 MB.

## Known weaknesses

- First belt grid was 5000 x 2500 m with islands up to 1500 x 550: rows 1.4 km apart and 2 km gaps, more "big islands" than "belt". Tightened to 4000 x 1800 with islands up to 1350 x 520.
- Underground at the belt core: rock above the sand 169 ha, at Y = 40 240 ha (1.42 x). Well over the 1.15 target. Belt islands have a lot of rock just under dune level that counts as "not showing"; roots are still vertical per mass, but one belt island is one mass.
- Southern medium islands are small: at 20 km south the view has about 23 ha of rock in total. Medium outcrops are the recipe lowered 40 blocks, and for the lower variants little survives.
- Outcrop chains are placed 450-1000 m from an island centre, which for a belt island is inside the island, so belt islands have almost no chain round them.
- Belt islands and regular islands can overlap where both exist; they then have different variants and the rock changes along the line between their centres.
- Generation time in the belt is unmeasured and will be higher: rock chunks cost about twice sand chunks.

## Islands by latitude, second pass: mixed-size land masses

Feedback on the belt: a sketch drawn over the preview series (`tools/preview/Suggested Island spacing and size by Z axis.png`). Read from it, each panel being 10 km across:

- North (20 km to 5 km north): large, medium and small islands mixed at every latitude, placed irregularly, no rows. A few very large ovals of about 4-5 km by 2-2.5 km, many of 1.5-2.5 km by 1 km, smaller ones of 0.5-1 km, and scattered dots.
- Spawn and south: a couple of 1.5 km ovals near spawn, one of about 2 km at 5 km south, only 1 km ovals and dots at 10 km south, one 1.5-2 km outline and dots at 20 km south.

Answers: each outline is a solid land mass with sand channels and bays; north of 20 km it thins out to the same as the far south; all the sizes read off the sketch are to be halved, so the island at spawn stays 400-700 m; the dots are free-standing outcrops, several small ones or one or two medium ones.

Status: deployed, rendered with the real-generator preview on seed 1791432644696. Not yet seen in game.

### What replaced the belt

The single belt grid is gone. Land masses now come from sub-grids: each size class has two sparse grids offset from each other, with jitter, and a keep-chance by latitude. Two sparse offset grids look irregular together and can sit side by side or overlap, while each grid's cells stay large enough that no land mass is ever cut at a cell boundary. The island field is the `Max` of the regular island field and every sub-grid's field.

| Class | Sub-grid cell | Sizes (east-west x north-south) | Keep-chance |
| --- | --- | --- | --- |
| Regular island | 2500 m grid | about 600 m | 0.1 beyond 27 km north, 0.6-0.7 from 21 km north to 3 km south, 0.3 at 12 km south, 0.1 from 20 km south |
| Large | 2800 x 1900 m, two grids | 750 x 500 to 1250 x 640 m, turned -35 to +25 degrees | 0.05 beyond 27 km north, 0.45-0.5 from 21 km to 5 km north, 0.12 round spawn, 0.07 at 12 km south, 0.05 from 20 km south |
| Huge | 5500 x 3500 m, two grids | 2000 x 1000 to 2500 x 1240 m, turned -10 to +20 degrees | 0 beyond 22 km north, 0.35 at 17 km, 0.5 at 12 km, 0.45 at 6 km, 0 from 3 km north southwards |

- Each land mass is one anchored `Ellipsoid` (size and turn picked per land mass by white noise) plus broad lobes and bays at its own scale (Large: scales 300 and 90; Huge: 600 and 170).
- Land masses are a rock class of their own, lowered 8 blocks instead of 20, so they stay solid. First render with them at 20 was full of sand holes on most variants.
- Free-standing outcrops everywhere: 3% of medium cells and 0.4% of small cells fill on their own whatever the island distance (replaces the south-only rule).
- Variant pick, one per land mass: regular islands and their chains use the nearest regular centre within 1200 m (a lone outcrop picks for itself); then each land-mass sub-grid claims its own footprint plus a margin, larger classes overriding smaller ones.

### Preview, 10 km views down the centre line

| Centre | Rock share |
| --- | --- |
| 25 km north | 2.0% |
| 15 km north | 13.0% |
| 10 km north | 17.3% |
| 5 km north | 14.6% |
| spawn | 5.9% |
| 5 km south | 4.5% |
| 10 km south | 2.3% |
| 20 km south | 2.1% |

Images: `latitude-series-v2.png`, and `latitude-landmass-zoom-v2.png` (one Huge land mass about 3 km by 1.3 km, solid, with bays; underground 1.04 x at Y = 40 and 1.10 x at Y = 10 in that 3.6 km view).

Other checks: pad top block Y 90 on three seeds, sand reachable in eight, eight and six of eight directions; 0 sand columns painted as rock. Biome file about 3.4 MB.

### Differences from the request, and limits

- Rock round spawn went up (5.9% of the 10 km view against 1.9% before), because Large land masses now exist round spawn at a 12% chance per cell.
- The series has no view at 20 km north; the thinning there is by the curves (regular 0.6 at 21 km falling to 0.1 at 27 km; Large 0.45 to 0.05; Huge 0 by 22 km), so the north is still fairly busy at 20 km and thin by 25-27 km.
- Where two land masses overlap they join smoothly in shape, but the smaller class's variant is overridden only inside the larger one's margin; a change of rock along the join is still possible.
- Outcrop chains are still placed by distance from a centre, so Huge land masses have almost no chain.
- Generation time in the north is unmeasured.

## Land masses accepted; spawn terrain removed

World "Arrakis v20" (seed 1791436655886): placement accepted as "perfect". A 10 km by 50 km map of that seed was rendered at 5 blocks per pixel (`tools/preview/arrakis-v20-map-10km-x-50km.png`, not committed, 18 MB). Rock share by band on that seed: 25-15 km north 10.7%, 15-5 km north 11.5%, 5 km north to 5 km south 6.8%, 5-15 km south 2.2%, 15-25 km south 0.0%. Log clean; about 27 ms per chunk over 1000 chunks round spawn.

Request: remove the "sphere" generated under spawn (the round mound or bowl from the landing-pad cones); an island nearby is enough, players may spawn on sand. And can spawn height be dynamic, at the first solid block, so new players take no fall damage?

Status: deployed, spawn area rendered with the real-generator preview. The spawn height itself can only be confirmed in game.

### Dynamic spawn height

From the 0.6.8 jar: when a world has no spawn provider of its own, `IWorldGen.getDefaultSpawnProvider` returns `FitToHeightMapSpawnProvider(IndividualSpawnProvider(spawn points from the world structure))`. `FitToHeightMap.getSpawnPoint` takes the point and, if its Y is below 0 and the chunk at that column is available (`World.getNonTickingChunk`), sets Y to `chunk.getHeight(x, z) + 1`. A Y of 0 or more is used as given, which is why the fixed spawn Y values never moved.

So spawn is now (0.5, -1, 0.5) in both `SpawnPositions` and the framework entry. Not verified: whether `getNonTickingChunk` always has the spawn chunk at that moment. If it ever returns nothing the point keeps Y = -1 and the player would start below the world.

### Removed

`start.enabled: false` in `graph.js` switches off, together: the starting island and its variant pick, the two landing-pad cones, the 30 m clearing of other rock round the origin, and the dune fade at spawn (the dune branch is back to the plain clamped noise). The guaranteed island 500 m north-east stays. The stepping-stone rule for small outcrops near spawn and the "no medium cells within 350 m of spawn" rule were left as they are.

## Spawn snap confirmed; starting island back, without the pad

World "Arrakis v21" (seed 1791438024806): with spawn Y = -1 the player joined at (0.5, 95, 0.5), i.e. the game fitted the spawn point to the surface. Confirms the reading of `FitToHeightMapSpawnProvider`. Log clean; about 16 ms per chunk round spawn (less rock there without the starting island).

Feedback: bring the starting island back, but not the landing pad; the island that generated round spawn was good, and with the snap-to-surface rule it should be fine for most spawns.

Change: `start.island: true`, `start.enabled: false`. The starting island (footprint radius 100 m at the origin, its own variant pick, recipe lowered 30 blocks) is back as one more rock body. Still off: the landing-pad cones, the 30 m clearing round the origin, and the dune clearing. Spawn stays (0.5, -1, 0.5).

Preview, 500 m round spawn: seed 1791436655886 has 4.1 ha of rock with its top up to 58 m above sand level; seed 42 has 2.7 ha, up to 87 m; seed 7 has 1.0 ha, up to 60 m. So how much island there is at spawn varies a lot with the variant drawn, and the player lands on top of whatever is at the origin, rock or dune.

Not checked: whether the surface block at the origin can be a spot the player cannot leave without a fall (the top of a spire, or a pit).

## Arrakis_Sand: sand that cannot be dug

Goal: the desert must never be dug away. A custom block that behaves like bedrock and looks and sounds like white sand, generated wherever the Arrakis world generated `Soil_Sand_White`. Assets only.

Status: deployed. The generator builds with it in the real-generator preview (0 errors), but the preview does not load item or block assets, so the block itself is unchecked until a world is loaded. None of the in-game checks have been run.

### What makes a block unbreakable in 0.6.8

Read from `HytaleServer.jar`, `BlockHarvestUtils`:

- Every damage path ends in `damageSingleBlock`, which returns false straight away when `BlockType.getGathering()` is null. No damage is recorded and no break follows. There is no unbreakable flag and no hardness value on the block type; the missing `Gathering` section is the whole mechanism.
- Explosions (`ExplosionUtils`) go through the same `performBlockDamage`, so they hit the same check.
- Creative: `BreakBlockInteraction` tests `GameMode.Creative` and calls `performBlockBreak` directly, skipping the gathering check. That is why bedrock breaks in Creative.
- Physics: `BlockPhysicsUtil` removes a block when its `Support` requirement is no longer met. No `Support` section, nothing to fail.
- Paths that skip the check for any block, bedrock included: `DestroyBlockInteraction`, `CarryBlockInteraction`, `BlockPlaceUtils`, and anything that sets blocks directly (commands, builder tools). Not traced further.

### The block

`Server/Item/Items/Soil/Sand/Arrakis_Sand.json`: a copy of vanilla `Soil_Sand_White.json` with three things removed, `BlockType.Gathering`, `BlockType.Support` and `ResourceTypes`, and the translation key changed to `server.items.Arrakis_Sand.name`. Everything else is as white sand: textures and transition texture referenced from vanilla, icon `Icons/ItemsGenerated/Soil_Sand_White.png`, `Group: Sand`, `TransitionToGroups`, `BlockSoundSetId: Sand`, `BlockParticleSetId: Sand`, `ParticleColor`, `PhysicalMaterialId: Dirt`, `TextureComputedColor`, `ItemSoundSetId: ISS_Blocks_Gravel`, category `Blocks.Soils` / `GrassAndDirt`, tags Soil and Sand.

### Translation

`I18nModule.loadMessagesFromPack` runs once per asset pack and merges `Server/Languages/<locale>/*.lang`; the file name is the key prefix. So the mod ships its own `Server/Languages/en-US/server.lang` with one line, `items.Arrakis_Sand.name = Arrakis Sand`, and the vanilla file is untouched. Another installed mod (BetterMap) does the same. English only.

### Files changed

- added `src/main/resources/Server/Item/Items/Soil/Sand/Arrakis_Sand.json`
- added `src/main/resources/Server/Languages/en-US/server.lang`
- `src/main/resources/Server/HytaleGenerator/Biomes/Arrakis/Arrakis_Terrain.json`: the one `Soil_Sand_White` (the fallback material of the terrain material provider) is now `Arrakis_Sand`. It is the only biome the Arrakis world structure uses. The showcase biomes keep white sand.

### Expected, not tested

- Survival: hits do nothing on the server. What the client shows while trying (crack overlay, particles) is unknown.
- A world created before this change keeps white sand in chunks already generated; chunks generated afterwards get `Arrakis_Sand`. The two look the same, so there should be no visible seam, but old chunks stay diggable.
- Shovelling for sand without removing the block: nothing asset-only found. Every gathering route (`Breaking`, `Soft`, `Harvest`) ends by removing the block.

## Starting island missing (world "Arrakis v23")

World "Arrakis v23" (seed 1791462514960): no rock island at spawn; player joined at (11.2, 105.4, -9.2) on a dune. Log: no `Took too long`, and no warnings or errors naming `Arrakis_Sand`, an unknown block or a missing asset.

Reproduced in the real-generator preview: 0 rock columns within 250 m of spawn on that seed.

Two causes, both from removing the landing pad:

- The starting island was only a vanilla recipe lowered 30 blocks inside a 100 m footprint. The root rule keeps it only where the recipe is solid 4 blocks below sand level, and on some variant draws the recipe's ground is below the sand across the whole footprint. Lowering it less did not help on this seed (rock in a 300 m view at 2 m per pixel, of 22500 pixels: 0 at 30 blocks, 203 at 15, 344 at 8).
- The dune clearing round spawn was switched off with the pad, so dunes up to about 25 m high buried whatever low rock there was.

Fix:

- Starting island floor: the old natural starting outcrop height (low walkable top 6-15 blocks above sand level, lookout rise up to 20, shaped by the lobed starting footprint, no pad and no cones) is added as a rock body, limited to the starting footprint at every depth so its root goes straight down. Rock = `Max(everything else, variant starting island, floor)`.
- The dune clearing round spawn is back on (dunes fade out between 320 m and 120 m from the origin).

Rock pixels in the same 300 m view on eight seeds, before then after: 0 / 3267, 261 / 4235, 5144 / 9192, 6285 / 7325, 2441 / 6086, 2110 / 5367, 4513 / 5739, 2474 / 5650.

On the v23 seed: 1.3 ha of rock above the sand, top block Y 81-89, sand reachable in all eight directions without a step over one block; 0 sand columns painted as rock. Underground the footprint is 3.4 ha (2.6 times what shows), a single isolated column.

Status: deployed, not yet seen in game.

## Spawn found by the plugin, on a plain medium island at the origin

Direction: stop forcing rock under spawn. Generate an ordinary medium island at (0, 0) and have the game find exposed rock nearby to spawn on.

Status: deployed and compiles; the generator builds in the real-generator preview. The spawn search itself has not been run in game.

### Terrain

`start: { island: true, cls: 'medium', floor: false, duneClear: false, radius: 75 }`. The island at the origin is now built as the medium class (recipe lowered 40 blocks, 75 m footprint, its own variant pick). The guaranteed rock base and the dune clearing from the previous section are off again. Medium grid cells still stay 350 m away from the origin so they do not overlap it.

Exposed rock in a 320 m view round the origin, at 2 m per pixel, of 25600 pixels, on ten seeds: 0, 109, 5167, 3687, 728, 433, 2071, 1163, 1643, 266. So about one seed in ten has no rock showing within 160 m of the origin, and several have very little.

### Plugin

- `WorldConfig` holds a transient default spawn provider taken from `IWorldGen.getDefaultSpawnProvider(seed)`; it is not saved in the world's config.
- `ArrakisWorldGen` wraps the built-in generator and returns `ArrakisSpawnProvider` from that method. Everything else is passed straight through.
- `ArrakisSpawnProvider`, on the first spawn request of a world load: walks columns outwards from the origin in square rings, up to 320 blocks. A column counts when its top block's id starts with `Rock_`. It takes the first such column whose four neighbours are also rock within one block of its height; if none turns up within 24 blocks beyond the first rock seen, it takes that first rock. Spawn is one block above the top block. With no rock at all it uses the surface at the origin and logs a warning. The result is logged ("Arrakis spawn set on ...") and kept until the world unloads.
- Side effect of the wrapper: the built-in generator plugin's `RemoveWorldEvent` handler checks for its own handle type and will not recognise the wrapped generator. `shutdown()` is still forwarded.

Not checked: how long the search takes when it has to go far (each new chunk it touches is generated on the spot; 320 blocks out is up to about 440 chunks), and whether a long search on first join causes any trouble.

## Dead ends

- Offline preview harness using server classes: `AssetManager` static init registers asset stores on `HytaleServer.get().getEventBus()`, which is null outside a running server. SOLVED in round 5 by supplying a bare server object with an event bus (see `RealPreview.java`).
- Trusting the Node model for node semantics: it shared my wrong assumption about the `Distance` return type, so preview and game disagreed (round 4 discs).

## Docs vs vanilla field names

- None recorded yet. All field names so far were copied from vanilla `Desert1_Stacks.json`, `Desert1_Rocky.json` and `Example_PositionCell_Density_Return.json`.
