# Arrakis rock islands — experiment log

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

## Dead ends

- Offline preview harness using server classes: `AssetManager` static init registers asset stores on `HytaleServer.get().getEventBus()`, which is null outside a running server. SOLVED in round 5 by supplying a bare server object with an event bus (see `RealPreview.java`).
- Trusting the Node model for node semantics: it shared my wrong assumption about the `Distance` return type, so preview and game disagreed (round 4 discs).

## Docs vs vanilla field names

- None recorded yet. All field names so far were copied from vanilla `Desert1_Stacks.json`, `Desert1_Rocky.json` and `Example_PositionCell_Density_Return.json`.
