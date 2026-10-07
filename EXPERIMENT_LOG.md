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

Status: deployed, previewed with the tool, not yet seen in game. Done before stage 2 (channels, basins, access) because of the feedback above.

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
3. Wedges with a shared lean: yes in the preview. Which compass direction the lean points in game is unverified.
4. Size range and fade: yes in the preview: 600 m island, 150-250 m medium, 40-120 m small, none beyond about 600 m from the shore.
5. Summit heights: yes for the island; wedge crests 4-60 m, including a tall narrow stack on a small footprint.
6. Spires: no (stage 4).
7. Sand and rock interleave: partly. Low wedges (4-8 m) sit just above the sand and dunes cover their low ends.
8. Layered and weathered: no (stage 5).

Play requirements: most wedges have a walk-up side in principle, but the ramp is terraced with 3-9 m risers, so true walk-up access is still stage 2 work. Hops: sand gaps in the chain are mostly under 200 m in the preview.

Feedback: _pending_

## Dead ends

- Offline preview harness using server classes: `AssetManager` static init registers asset stores on `HytaleServer.get().getEventBus()`, which is null outside a running server.

## Docs vs vanilla field names

- None recorded yet. All field names so far were copied from vanilla `Desert1_Stacks.json`, `Desert1_Rocky.json` and `Example_PositionCell_Density_Return.json`.
