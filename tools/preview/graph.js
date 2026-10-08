// Builds the Arrakis_Rock density graph (round 2). Used by both the preview renderer and the biome writer.
const fs = require('fs');
const path = require('path');
const UNIT = 120; // density 1.0 in the A terms = 120 m above Base

const c = v => ({ Type: 'Constant', Value: v, Skip: false });
const noise2d = (scale, octaves, seed, pers = 0.5) => ({ Type: 'SimplexNoise2D', Scale: scale, Octaves: octaves, Lacunarity: 2.0, Persistence: pers, Seed: seed, Skip: false });
const node = (type, inputs, extra, comment) => Object.assign(comment ? { $Comment: comment } : {}, { Type: type }, extra || {}, { Skip: false, Inputs: inputs });
const norm = (min, max, input, comment) => node('Normalizer', [input], { FromMin: -1, FromMax: 1, ToMin: min, ToMax: max }, comment);
const curve = pts => ({ Type: 'Manual', Points: pts.map(([i, o]) => ({ In: +i.toFixed(5), Out: +o.toFixed(5) })) });
const m = metres => metres / UNIT;

// Stair-step curve in metres. levels: ascending shelf heights. ramps: indices of intervals left as plain slopes.
// On a tread the output rises only `tilt` of the interval; the rest is made up in a short riser at the end.
function terraceCurve(levels, ramps, rootCut, riser = 0.15, tilt = 0.12) {
  // Negative side: without rootCut the height passes straight through (round 2 behaviour).
  // With rootCut, heights down to -rootCut m pass through and anything lower becomes -3 units: no rock at any depth.
  const pts = rootCut ? [[-rootCut - 0.05, -3 * UNIT], [-rootCut, -rootCut], [0, 0]] : [[-UNIT, -UNIT], [0, 0]];
  for (let i = 0; i < levels.length - 1; i++) {
    const a = levels[i], b = levels[i + 1];
    if (ramps.includes(i)) { pts.push([b, b]); continue; }
    pts.push([b - (b - a) * riser, a + (b - a) * tilt]);
    pts.push([b, b]);
  }
  return curve(pts.map(([i, o]) => [m(i), m(o)]));
}

function makeRock(P) {
  const dist0 = (pts, comment) => Object.assign(comment ? { $Comment: comment } : {}, { Type: 'Distance', Skip: false, Curve: curve(pts) }); // distance from the world origin
  // ---- Latitude (north is -Z, south is +Z) ----
  const T = P.latitude;
  const byLatitude = (pts, comment) => node('CurveMapper', [{ Type: 'ZValue', Skip: false }], { Curve: curve(pts) }, comment);
  const G = P.guaranteedIsland;
  const guaranteed = { Type: 'List', Skip: false, Positions: [{ X: G.x, Y: 0, Z: G.z }] };
  const gridIslands = {
    $Comment: 'Offset keeps island centres away from the fixed spawn at the origin.',
    Type: 'Offset', Skip: false, OffsetX: 900, OffsetY: 0, OffsetZ: 900,
    Positions: {
      $Comment: 'Randomly drop 30% of the positions.',
      Type: 'Occurrence', Skip: false, Seed: 'Arrakis_Islands_Drop', FieldFunction: T ? byLatitude(T.regularKeep, 'Chance that a regular large island exists, by latitude (north is -Z).') : c(0.7),
      Positions: { Type: 'Mesh2D', Skip: false, PointsY: 0,
        PointGenerator: { Type: 'Mesh', Jitter: 0.2, ScaleX: 2500, ScaleY: 2500, ScaleZ: 2500, Seed: 'Arrakis_Islands' } }
    }
  };
  // Land masses: several sub-grids per size class, each sparse and offset from the others, so together they look irregular and can sit
  // side by side or overlap. Each sub-grid's cells are big enough to hold its largest land mass, so none is ever cut at a cell boundary.
  const masses = !T ? [] : T.masses.flatMap(M => M.offsets.map(([ox, oz], k) => {
    const tag = M.name + (k + 1);
    const positions = { $Comment: `${M.name} land masses, sub-grid ${k + 1}.`, Type: 'Offset', Skip: false, OffsetX: ox, OffsetY: 0, OffsetZ: oz,
      Positions: { Type: 'Occurrence', Skip: false, Seed: 'Arrakis_Mass_Drop_' + tag, FieldFunction: byLatitude(M.keep, `Chance that a ${M.name} land mass exists, by latitude (north is -Z).`),
        Positions: { Type: 'Mesh2D', Skip: false, PointsY: 0, PointGenerator: { Type: 'Mesh', Jitter: M.jitter, ScaleX: M.gridX, ScaleY: M.gridZ, ScaleZ: M.gridZ, Seed: 'Arrakis_Mass_' + tag } } } };
    return { M, tag, positions };
  }));
  let regularIslandPositions;
  const islandPositions = P.previewIslandAt
    ? { Type: 'List', Skip: false, Positions: [{ X: P.previewIslandAt[0], Y: 0, Z: P.previewIslandAt[1] }] }
    : { $Comment: `Large island centres: one guaranteed island at (${G.x}, ${G.z}), plus the regular grid with every centre within ${G.clear} m of it removed.`,
        Type: 'Union', Skip: false, Positions: [
          guaranteed,
          { $Comment: 'Keep only grid centres far enough from the guaranteed island.', Type: 'FieldFunction', Skip: false,
            FieldFunction: { Type: 'PositionsCellNoise', Skip: false, MaxDistance: G.clear + 100, Positions: guaranteed,
              ReturnType: { Type: 'Curve', Curve: curve([[G.clear - 1, 0], [G.clear, 1]]) }, DistanceFunction: { Type: 'Euclidean' } },
            Delimiters: [{ Min: 0.5, Max: 2 }],
            Positions: gridIslands }
        ].concat(masses.map(x => x.positions)) };
  regularIslandPositions = P.previewIslandAt ? islandPositions : Object.assign({}, islandPositions, { Positions: islandPositions.Positions.slice(0, 2) });

  const S = P.start;
  // Same node the dune branch gets: the clamped dune noise, forced down to "no dune" near the origin.
  // Dune fade at spawn. The clamped dune noise n (-1 = no dune) is scaled towards -1: n' = (n + 1) * t - 1,
  // with t = 0 near the origin and exactly 1 from duneFadeEnd outwards, so dunes beyond that are unchanged.
  // Scaling shrinks each dune in place; clipping against a cone (first attempt) left a visible circular scarp.
  const duneNoise = () => node('Sum', [c(-1), node('Multiplier', [
    node('Sum', [node('Clamp', [noise2d(400, 4, 'A')], { WallA: -1.0, WallB: 0.8 }), c(1)]),
    node('CurveMapper', [node('Sum', [
      dist0([[0, 0], [2000, 2000]], 'Distance from the origin in metres.'),
      norm(-S.duneFadeWobble, S.duneFadeWobble, noise2d(160, 2, 'Arrakis_Start_DuneFade'), 'Wobble, so the cleared area is not a circle.')
    ])], { Curve: curve([[S.duneFadeStart + S.duneFadeWobble, 0], [S.duneFadeEnd - S.duneFadeWobble, 1]]) },
      `Dune fade weight: 0 within ${S.duneFadeStart} m of the origin, exactly 1 from ${S.duneFadeEnd} m; the edge between wanders by +/-${S.duneFadeWobble} m.`)
  ])]);
  const duneHeight = node('Clamp', [norm(m(-0.8 * 40), m(1.2 * 40), duneNoise())], { WallA: 0, WallB: m(40) },
    'Local dune height above Base (copy of the dune noise), so rock heights are measured from the sand surface.');

  // ---- Large islands ----
  const I = P.island;
  const radial = {
    $Comment: `Radial falloff from the nearest large-island centre: 1 at the centre, 0 at ${I.radius} m, -1 at ${2 * I.radius} m.`,
    Type: 'PositionsCellNoise', Skip: false, MaxDistance: 2 * I.radius, Positions: islandPositions,
    ReturnType: { Type: 'Curve', Curve: curve([[0, 1], [I.radius, 0], [2 * I.radius, -1]]) },
    DistanceFunction: { Type: 'Euclidean' }
  };
  const fieldInputs = [radial,
    norm(-I.lobeAmp, I.lobeAmp, noise2d(I.lobeScale, 2, 'Arrakis_Islands_Lobes'), 'Lobes: breaks the mass into bays, peninsulas and detached pieces.'),
    norm(-I.detailAmp, I.detailAmp, noise2d(I.detailScale, 2, 'Arrakis_Islands_Coast'), 'Fine coastline detail.')];
  const regularF = node('Sum', fieldInputs, null, 'Regular island field: > 0 is rock.');
  const massField = x => { const M = x.M, n = M.sizes.length;
    return node('Sum', [
      { $Comment: `${M.name} land-mass footprint: one ellipse per land mass; size and slant picked per land mass.`,
        Type: 'PositionsCellNoise', Skip: false, MaxDistance: 2 * Math.max(...M.sizes.map(s => s[0])) + 200, Positions: x.positions,
        ReturnType: { Type: 'Density', ChoiceDensity: { Type: 'WhiteNoise', Seed: 'Arrakis_Mass_Size_' + x.tag, Skip: false },
          Delimiters: M.sizes.map(([halfEW, halfNS, spin], i) => ({ From: +(-1 + 2 * i / n).toFixed(4), To: i === n - 1 ? 1.01 : +(-1 + 2 * (i + 1) / n).toFixed(4),
            Density: node('Anchor', [{ Type: 'Ellipsoid', Skip: false, Spin: spin, Curve: curve([[0, 1], [1, 0], [2, -1]]), Scale: { X: halfEW, Y: 1, Z: halfNS }, NewYAxis: { X: 0, Y: 1, Z: 0 } }], { Reversed: false },
              `About ${2 * halfEW} m by ${2 * halfNS} m, turned ${spin} degrees.`) })), DefaultValue: -1 },
        DistanceFunction: { Type: 'Euclidean' } },
      norm(-M.lobeAmp, M.lobeAmp, noise2d(M.lobeScale, 2, 'Arrakis_Mass_Lobes_' + M.name), 'Broad lobes: bays and sand channels at the scale of the land mass.'),
      norm(-M.bayAmp, M.bayAmp, noise2d(M.bayScale, 2, 'Arrakis_Mass_Bays_' + M.name), 'Smaller bays.'),
      norm(-I.detailAmp, I.detailAmp, noise2d(I.detailScale, 2, 'Arrakis_Mass_Coast'), 'Fine coastline detail.')
    ], null, `${M.name} land-mass field (sub-grid ${x.tag}): > 0 is rock.`); };
  masses.forEach(x => { x.field = massField(x); });
  const F = masses.length ? node('Max', [regularF, ...masses.map(x => x.field)], null, 'Island field F: > 0 is rock.') : regularF;
  const edge = node('Multiplier', [c(+m(I.edgeMetres).toFixed(5)), F], null, `Height available from the shore inwards: F * ${I.edgeMetres} m.`);
  const cap = node('CurveMapper', [noise2d(I.capScale, 3, 'Arrakis_Islands_Tops')], { Curve: curve(I.capCurve.map(([i, o]) => [i, m(o)])) },
    'Height cap: low benches where the noise is low, summits where it is high.');
  const islandPre = node('Min', [edge, cap], null, 'Large island height before terracing.');
  const preStepOf = shapes => node('Sum', [node('Max', shapes, null, 'Rock height above the sand before terracing.'),
    norm(m(-I.stepJitter), m(I.stepJitter), noise2d(28, 2, 'Arrakis_Rock_Rough'), 'Small noise before stepping so shelf edges are not parallel lines.')]);
  const terraced = shapes => node('CurveMapper', [preStepOf(shapes)], { Curve: terraceCurve(I.levels, I.ramps, P.rootCut) },
    'Terraces: stair-step curve, shelves ' + I.levels.join(', ') + ' m. Negative = no rock.');

  // ---- Outcrops: terraced wedges in two size layers, thinning out away from the large islands ----
  const O = P.outcrops;
  const wedge = ([from, to, a, b, spinOffset, top]) => ({
    From: +from.toFixed(4), To: +to.toFixed(4),
    Density: node('Anchor', [node('Rotator', [node('Min', [
      node('Multiplier', [c(+(m(top) * O.rimSteepness).toFixed(5)), node('Sum', [
        { Type: 'Ellipsoid', Skip: false, Spin: 0, Curve: curve([[0, 1], [1, 0], [3, -2]]), Scale: { X: a, Y: 1, Z: b }, NewYAxis: { X: 0, Y: 1, Z: 0 } },
        norm(-O.edgeNoise, O.edgeNoise, noise2d(Math.max(18, a * 0.45), 2, 'Arrakis_Outcrops_Edge'))
      ])], null, 'Footprint: steep rim all round.'),
      node('CurveMapper', [{ Type: 'XValue', Skip: false }], { Curve: curve([[-1.1 * a, 0], [0.55 * a, m(top)]]) },
        'Ramp: rises along local +X (downwind), so the far end is cut off as a cliff by the footprint rim.')
    ])], { NewYAxis: { X: 0, Y: 1, Z: 0 }, SpinAngle: O.windAngle + spinOffset })], { Reversed: false },
      `Wedge ${2 * a} x ${2 * b} m, lean ${O.windAngle + spinOffset} deg, crest ${top} m above the sand.`)
  });
  const ranges = vs => { let at = -1; return vs.map(([w, ...rest]) => { const r = [at, at + 2 * w, ...rest]; at += 2 * w; return r; }); };
  const fillOf = L => 2 * L.variants.reduce((s, v) => s + v[0], 0);
  const layer = (L, name) => ({
    $Comment: `${name} outcrops. Each cell picks a wedge (or nothing): white noise at the cell position plus a shift that grows with distance from the nearest large island, so the biggest wedges drop out first and all are gone by ${L.fadeEnd} m from the island centre.`,
    Type: 'PositionsCellNoise', Skip: false, MaxDistance: L.maxDistance,
    Positions: { Type: 'Mesh2D', Skip: false, PointsY: 0, PointGenerator: { Type: 'Mesh', Jitter: L.jitter, ScaleX: L.grid, ScaleY: L.grid, ScaleZ: L.grid, Seed: 'Arrakis_Outcrops_' + name } },
    ReturnType: { Type: 'Density',
      ChoiceDensity: node('Sum', [
        { Type: 'WhiteNoise', Seed: 'Arrakis_Outcrops_Choice_' + name, Skip: false },
        { Type: 'PositionsCellNoise', Skip: false, MaxDistance: L.fadeEnd + 100, Positions: islandPositions,
          ReturnType: { Type: 'Curve', Curve: curve([[L.fadeStart, 0], [L.fadeEnd, fillOf(L)], [L.fadeEnd + 50, 3]]) }, DistanceFunction: { Type: 'Euclidean' } }
      ]),
      Delimiters: ranges(L.variants).map(wedge), DefaultValue: -1 },
    DistanceFunction: { Type: 'Euclidean' }
  });
  // ---- Round 4: an outcrop built like the large island, scaled down, with a radius that differs per cell ----
  // All noise is sampled in world coordinates (no Anchor), so no two outcrops share an outline.
  const islandLike = (L, name) => {
    const positions = { Type: 'Mesh2D', Skip: false, PointsY: 0, PointGenerator: { Type: 'Mesh', Jitter: L.jitter, ScaleX: L.grid, ScaleY: L.grid, ScaleZ: L.grid, Seed: 'Arrakis_Outcrops_' + name } };
    const fill = 2 * L.fill;
    // v = white noise at the cell position + a shift that grows with distance from the nearest large island.
    // v runs from -1 (biggest) to -1 + fill (smallest); above that the cell is empty.
    const islandShift = () => ({ Type: 'PositionsCellNoise', Skip: false, MaxDistance: L.fadeEnd + 100, Positions: islandPositions,
      ReturnType: { Type: 'Curve', Curve: curve([[L.fadeStart - 1, 3], [L.fadeStart, 0], [L.fadeEnd, fill], [L.fadeEnd + 50, 3]]) }, DistanceFunction: { Type: 'Euclidean' } });
    // Near spawn: either no cells at all (spawnClear), or a guaranteed share of filled cells (spawnShare within spawnRadius).
    const shift = () => L.spawnShare
      ? node('Min', [islandShift(), dist0([[L.spawnRadius, fill * (1 - L.spawnShare)], [L.spawnRadius + 80, 3]], `Near spawn about ${Math.round(L.spawnShare * 100)}% of cells are filled whatever the island distance, so there are stepping stones.`)])
      : node('Max', [islandShift(), dist0([[L.spawnClear, 3], [L.spawnClear + 1, 0]], `No cells of this layer within ${L.spawnClear} m of spawn.`)]);
    const latitudeShift = () => (T && L.aloneShare) ? node('Min', [shift(), c(+(fill * (1 - L.aloneShare / L.fill)).toFixed(5))], null, `Free-standing outcrops: about ${(L.aloneShare * 100).toFixed(1)}% of cells fill on their own, anywhere, whatever the island distance.`) : shift();
    const v = () => node('Sum', [{ Type: 'WhiteNoise', Seed: 'Arrakis_Outcrops_Choice_' + name, Skip: false }, latitudeShift()]);
    const cellValue = (density, def, comment) => Object.assign(comment ? { $Comment: comment } : {}, { Type: 'PositionsCellNoise', Skip: false, MaxDistance: L.maxDistance, Positions: positions,
      ReturnType: { Type: 'CellValue', Density: density, DefaultValue: def }, DistanceFunction: { Type: 'Euclidean' } });
    const white = tag => ({ Type: 'WhiteNoise', Seed: 'Arrakis_Outcrops_' + tag + '_' + name, Skip: false });
    // Size is independent of survival: its own white noise per cell, shrunk further from the island.
    const islandDistance = pts => ({ Type: 'PositionsCellNoise', Skip: false, MaxDistance: L.fadeEnd + 100, Positions: islandPositions,
      ReturnType: { Type: 'Curve', Curve: curve(pts) }, DistanceFunction: { Type: 'Euclidean' } });
    const invRadius = cellValue(node('Max', [
      node('CurveMapper', [v()], { Curve: curve([[-1 + fill, 0], [-1 + fill + 0.01, 10]]) }, 'Gate: 0 when the cell is filled, 10 (radius 0.1 m) when it is empty.'),
      node('Multiplier', [
        node('CurveMapper', [white('Size')], { Curve: curve(L.radiusCurve.map(([w, r]) => [w, 1 / r])) }, '1 / radius from a per-cell white noise: ' + L.radiusCurve.map(([w, r]) => r + ' m').join(' .. ') + '.'),
        islandDistance([[L.fadeStart, 1], [L.fadeEnd, 1 / L.farShrink]])
      ], null, `Radius shrinks to ${L.farShrink} x by ${L.fadeEnd} m from the island centre.`)
    ]), 10, '1 / radius for this cell.');
    const heightScale = cellValue(node('Multiplier', [
      node('CurveMapper', [white('Size')], { Curve: curve(L.radiusCurve.map(([w, r]) => [w, m(L.heightPerRadius * r)])) }),
      node('CurveMapper', [white('Height')], { Curve: curve(L.heightVariety) })
    ]), 0, `Height for this cell: ${L.heightPerRadius} x radius, times a per-cell variety factor.`);
    const cellCurve = (pts, comment) => Object.assign(comment ? { $Comment: comment } : {}, { Type: 'PositionsCellNoise', Skip: false, MaxDistance: L.maxDistance, Positions: positions,
      ReturnType: { Type: 'Curve', Curve: curve(pts) }, DistanceFunction: { Type: 'Euclidean' } });
    // Metres from the cell position. A Curve return type receives the raw distance; the Distance return type does not (it returns -1..1).
    const distance = cellCurve([[0, 0], [L.maxDistance, L.maxDistance]], 'Distance from the cell position in metres.');
    const safeRadius = 0.7 * L.maxDistance;
    const safety = () => cellCurve([[0, 5], [safeRadius - 12, 5], [safeRadius, -5]], `Safety fade: no rock beyond ${safeRadius.toFixed(0)} m from the cell position (70% of MaxDistance, and inside the cell), whatever the radius says.`);
    const rawF = node('Sum', [
      c(1), node('Multiplier', [c(-1), invRadius, node('Sum', [distance, c(2)])], null, 'Radial falloff: 1 at the cell position, 0 at the radius.'),
      norm(-L.lobeAmp, L.lobeAmp, noise2d(L.lobeScale, 2, 'Arrakis_Outcrops_Lobes_' + name, 0.35), 'Lobes, world coordinates.'),
      norm(-L.detailAmp, L.detailAmp, noise2d(L.detailScale, 2, 'Arrakis_Outcrops_Coast_' + name), 'Outline detail, world coordinates.')
    ], null, 'Outcrop field before the safety fade.');
    const copy = n => JSON.parse(JSON.stringify(n));
    const F = node('Min', [rawF, safety()], null, 'Outcrop field F: > 0 is rock.');
    if (P.variants) return F;
    const cap = node('CurveMapper', [noise2d(L.capScale, 2, 'Arrakis_Outcrops_Tops_' + name, 0.3)], { Curve: curve(L.capCurve) }, 'Cap: benches where the noise is low, high points where it is high.');
    return node('Min', [
      node('Multiplier', [heightScale, node('Min', [F, cap])], null, 'Height above the sand: the height of this cell times the capped field.'),
      node('Multiplier', [c(+m(200).toFixed(5)), copy(F)], null, 'Outside the footprint fall away at 200 m per unit of F whatever the height, so the buried shelf stays narrow (round 3 root fix).')
    ], null, `${name} outcrops: small islands.`);
  };
  const outcropLayersAll = [O.medium.islandLike ? islandLike(O.medium, 'Medium') : layer(O.medium, 'Medium'), O.small.islandLike ? islandLike(O.small, 'Small') : layer(O.small, 'Small')];
  const outcropLayers = process.env.ONLY_LAYER ? [outcropLayersAll[+process.env.ONLY_LAYER]] : outcropLayersAll; // ONLY_LAYER is a preview aid

  // ---- Starting outcrop at the origin (always present; not part of any position set) ----
  const startF = () => node('Sum', [
    dist0([[0, 1], [2 * S.radius, -1]], `Radial falloff from the origin: 0 at ${S.radius} m.`),
    norm(-S.lobeAmp, S.lobeAmp, noise2d(S.lobeScale, 2, 'Arrakis_Start_Lobes', 0.35), 'Lobes, world coordinates: the outline differs per seed.'),
    norm(-0.03, 0.03, noise2d(22, 2, 'Arrakis_Start_Coast'))
  ], null, 'Starting outcrop field: > 0 is rock.');
  const startNatural = node('Sum', [
    node('Min', [
      node('Multiplier', [c(+m(S.edgeMetres).toFixed(5)), startF()]),
      node('CurveMapper', [noise2d(70, 2, 'Arrakis_Start_Tops', 0.3)], { Curve: curve(S.capCurve.map(([i, o]) => [i, m(o)])) }, 'Low, walkable top.')
    ]),
    node('Clamp', [node('Min', [
      node('CurveMapper', [node('Abs', [noise2d(S.lookoutScale, 1, 'Arrakis_Start_Lookout')])], { Curve: curve([[S.lookoutFrom, 0], [S.lookoutFrom + 0.25, m(S.lookoutExtra)]]) }),
      node('CurveMapper', [startF()], { Curve: curve([[0.25, 0], [0.55, m(S.lookoutExtra + 2)]]) })
    ])], { WallA: 0, WallB: m(S.lookoutExtra) }, 'Lookout: an extra rise where a ridged noise is high, kept inside the outcrop.')
  ], null, 'Starting outcrop height before the pad is blended in. Not terraced, so slopes stay walkable.');
  // Pad: height = pad + (natural - pad) * w, with w = 0 inside the pad and 1 from padBlendEnd outwards.
  // A weighted blend has no crease; clamping between two cones (first attempt) left a visible disc with radial facets.
  const start = node('CurveMapper', [node('Sum', [
    c(+m(S.padHeight).toFixed(5)),
    node('Multiplier', [
      node('Sum', [startNatural, c(+m(-S.padHeight).toFixed(5))]),
      dist0([[S.padRadius, 0], [S.padRadius + 0.3 * (S.padBlendEnd - S.padRadius), 0.15], [S.padRadius + 0.7 * (S.padBlendEnd - S.padRadius), 0.85], [S.padBlendEnd, 1]],
        `Blend weight: 0 within ${S.padRadius} m of the origin, 1 from ${S.padBlendEnd} m.`)
    ])
  ])], { Curve: curve([[m(-P.rootCut - 0.05), -3], [m(-P.rootCut), m(-P.rootCut)], [2, 2]]) },
    `Starting outcrop with landing pad: flat at Base + ${S.padHeight} m within ${S.padRadius} m of the origin. The curve only applies the root cut.`);
  if (P.variants) return variantRock();

  // ---- Rock from vanilla terrain recipes ("variants"), one picked per large island and shared by its outcrop chain ----
  function variantRock() {
    const V = P.variants;
    const vanilla = process.env.VANILLA_GEN;
    if (!vanilla) throw new Error('Set VANILLA_GEN to an extracted copy of the game\'s Server/HytaleGenerator folder (the variants are built from its biomes).');
    const cache2d = n => node('YOverride', [node('Cache', [n], { Capacity: 3 })], { Value: 0 });
    const step01 = (n, comment) => node('Clamp', [node('Multiplier', [c(1000000), n])], { WallA: 0, WallB: 1 }, comment);
    const copyNode = n => JSON.parse(JSON.stringify(n));
    const height = () => node('CurveMapper', [{ Type: 'BaseHeight', BaseHeightName: 'Base', Distance: true, Skip: false }], { Curve: curve([[-200, 2], [400, -4]]) }); // -(y - Base) / 100
    const walk = (n, fn) => { if (n && typeof n === 'object') { if (!Array.isArray(n)) fn(n); for (const v of Object.values(n)) walk(v, fn); } };
    const clean = n => { if (Array.isArray(n)) return n.map(clean); if (n && typeof n === 'object') { const o = {}; for (const [k, v] of Object.entries(n)) if (!k.startsWith('$') || k === '$Comment') o[k] = clean(v); return o; } return n; };

    // Distance measures from the world origin in 3D. These uses are evaluated per voxel, so the height has to be zeroed first.
    const flatDist = (pts, comment) => node('YOverride', [dist0(pts)], { Value: 0 }, comment);
    // Footprint fields, all "1 at the centre, 0 at the shore".
    const fields = { large: masses.length ? regularF : F, medium: outcropLayersAll[0], small: outcropLayersAll[1], start: startF() };
    // Land masses are a class of their own so they can be lowered less than regular islands and stay solid.
    if (masses.length) fields.mass = node('Max', masses.map(x => x.field), null, 'All land-mass fields.');
    // What the recipes are told in place of DistanceToBiomeEdge: how far inside its island or outcrop a column is, on the scale of a full-size island.
    let insideDefined = false;
    const inside = () => { if (insideDefined) return { Type: 'Imported', Name: 'Arrakis_Inside', Skip: false }; insideDefined = true;
      return { $Comment: 'How far inside its rock body a column is, as if every body were a full-size island. Stands in for DistanceToBiomeEdge in the recipes.',
        Type: 'Exported', ExportAs: 'Arrakis_Inside', SingleInstance: true, Skip: false,
        Inputs: [cache2d(node('Max', Object.values(fields).map(f => node('Multiplier', [c(V.edgeReference), copyNode(f)]))))] }; };
    const insideDefinition = inside();

    // The recipes: vanilla terrain densities copied unchanged apart from export names and the biome-edge distance, merged by patches.
    const recipe = (mix, index) => {
      const tag = 'ArrakisV' + (index + 1);
      const copies = mix.map((n, k) => {
        const terrain = clean(JSON.parse(fs.readFileSync(path.join(vanilla, 'Biomes', V.sources[n] + '.json'), 'utf8')).Terrain.Density);
        const prefix = tag + String.fromCharCode(97 + k) + '_', exported = new Set();
        walk(terrain, x => { if (typeof x.ExportAs === 'string' && x.ExportAs) exported.add(x.ExportAs); });
        walk(terrain, x => {
          if (typeof x.ExportAs === 'string' && x.ExportAs) x.ExportAs = prefix + x.ExportAs;
          if (x.Type === 'Imported' && exported.has(x.Name)) x.Name = prefix + x.Name;
          if (x.Type === 'DistanceToBiomeEdge') { for (const key of Object.keys(x)) delete x[key]; Object.assign(x, node('Clamp', [inside()], { WallA: 0, WallB: 2000 })); }
        });
        return terrain;
      });
      let merged = copies[0];
      for (let k = 1; k < copies.length; k++) {
        const share = 1 / (k + 1);
        merged = node('Mix', [merged, copies[k], node('CurveMapper', [noise2d(V.patchScale, 1, tag + '_Patch' + k)], { Curve: curve([[-1, 0], [1 - 2 * share - 0.3, 0], [1 - 2 * share + 0.3, 1], [1, 1]]) })], null, 'Merge by patches.');
      }
      return { $Comment: `Variant ${index + 1}: vanilla recipe${mix.length > 1 ? 's' : ''} ${mix.map(n => '#' + n + ' ' + path.basename(V.sources[n])).join(' + ')}.`,
        Type: 'Exported', ExportAs: tag, SingleInstance: false, Skip: false, Inputs: [merged] };
    };
    const definitions = V.mixes.map(recipe);
    const used = new Set();
    // Exported once (not single-instance); every later use imports its own copy with its own caches.
    const variant = i => { if (used.has(i)) return { Type: 'Imported', Name: 'ArrakisV' + (i + 1), Skip: false }; used.add(i); return definitions[i]; };

    // Which variant: one white-noise value per large island, read by its whole chain. Evaluated once per column.
    const pickOf = (positions, maxDistance, name) => { let defined = false;
      return () => { if (defined) return { Type: 'Imported', Name: name, Skip: false }; defined = true;
        return { $Comment: 'Variant pick, -1..1, constant across one rock body and its chain.', Type: 'Exported', ExportAs: name, SingleInstance: true, Skip: false,
          Inputs: [cache2d({ Type: 'PositionsCellNoise', Skip: false, MaxDistance: maxDistance, Positions: positions,
            ReturnType: { Type: 'CellValue', Density: { Type: 'WhiteNoise', Seed: 'Arrakis_Variant_Pick', Skip: false }, DefaultValue: 0 }, DistanceFunction: { Type: 'Euclidean' } })] }; }; };
    const islandPick = (() => { let defined = false; return () => { if (defined) return { Type: 'Imported', Name: 'Arrakis_Pick', Skip: false }; defined = true;
      const whiteAt = (positions, maxDistance) => ({ Type: 'PositionsCellNoise', Skip: false, MaxDistance: maxDistance, Positions: positions,
        ReturnType: { Type: 'CellValue', Density: { Type: 'WhiteNoise', Seed: 'Arrakis_Variant_Pick', Skip: false }, DefaultValue: 0 }, DistanceFunction: { Type: 'Euclidean' } });
      const mediumCells = { Type: 'Mesh2D', Skip: false, PointsY: 0, PointGenerator: { Type: 'Mesh', Jitter: O.medium.jitter, ScaleX: O.medium.grid, ScaleY: O.medium.grid, ScaleZ: O.medium.grid, Seed: 'Arrakis_Outcrops_Medium' } };
      // regular islands and their chains: the nearest regular island centre within 1200 m, else the outcrop picks for itself
      let pick = node('Mix', [whiteAt(mediumCells, O.medium.maxDistance), whiteAt(regularIslandPositions, 1300),
        step01({ Type: 'PositionsCellNoise', Skip: false, MaxDistance: 1300, Positions: regularIslandPositions, ReturnType: { Type: 'Curve', Curve: curve([[1199, 1], [1200, -1]]) }, DistanceFunction: { Type: 'Euclidean' } }, '1 within 1200 m of a regular island centre.')]);
      // then each land mass claims its own footprint and a margin round it; later (larger) classes override earlier ones
      for (const x of masses) pick = node('Mix', [pick, whiteAt(x.positions, 2 * Math.max(...x.M.sizes.map(s => s[0])) + 200),
        step01(node('Sum', [copyNode(x.field), c(0.25)]), `1 on a ${x.M.name} land mass (sub-grid ${x.tag}) and a margin round it.`)]);
      return { $Comment: 'Variant pick, -1..1. One value per land mass, shared by everything on and round it.',
        Type: 'Exported', ExportAs: 'Arrakis_Pick', SingleInstance: true, Skip: false, Inputs: [cache2d(pick)] }; }; })();
    const startPick = pickOf({ Type: 'List', Skip: false, Positions: [{ X: 0, Y: 0, Z: 0 }] }, 400, 'Arrakis_Pick_Start');
    const n = V.mixes.length;
    // Slider evaluates its input at (position - slide): SlideY = -sink reads the recipe `sink` blocks higher up, so the shape moves down.
    // Mix evaluates only its first input when the influence is 0, so only the picked variant is ever evaluated.
    const picked = (sink, pick) => node('Max', V.mixes.map((_, i) => node('Mix', [c(-5),
      node('Slider', [variant(i)], { SlideX: 0, SlideY: -sink, SlideZ: 0 }),
      step01(node('CurveMapper', [pick()], { Curve: curve([[-1 + 2 * i / n - 0.0001, -1], [-1 + 2 * i / n, 1], [-1 + 2 * (i + 1) / n - 0.0001, 1], [-1 + 2 * (i + 1) / n, i === n - 1 ? 1 : -1]]) }), `1 where variant ${i + 1} is the pick.`)
    ])), null, `The picked variant, lowered ${sink} blocks.`);

    const body = (name, field, cls, pick) => node('Mix', [c(-5), node('Min', [
      picked(cls.sink, pick),
      node('Sum', [node('Multiplier', [c(+(V.coastSlope * cls.nominalRadius / 100).toFixed(4)), cache2d(copyNode(field))]), height()], null, `Coast: rock may rise about ${V.coastSlope} m for every metre in from the shore.`),
      // Root rule: a column keeps its rock (at every depth) only if the recipe is solid just under sand level there,
      // so every mass that breaks the sand has its own steep-sided root and nothing is joined under the sand.
      node('CurveMapper', [node('YOverride', [node('Cache', [picked(cls.sink, pick)], { Capacity: 3 })], { Value: P.sandLevel - V.rootDepth })], { Curve: curve([[-0.0001, -5], [0.0001, 5]]) },
        `Root: no rock at any depth in columns where the recipe is not solid ${V.rootDepth} blocks below sand level.`)
    ]), step01(node('Sum', [cache2d(copyNode(field)), c(0.012)]), '1 inside a ' + name + ' footprint.')], null, `${name}: picked variant lowered ${cls.sink} blocks, inside its footprints only.`);

    const others = node('Min', [
      node('Max', [body('Large island', fields.large, V.large, islandPick), body('Medium outcrop', fields.medium, V.medium, islandPick), body('Small outcrop', fields.small, V.small, islandPick)]
        .concat(fields.mass ? [body('Land mass', fields.mass, V.mass, islandPick)] : [])),
      flatDist([[S.othersClear, -5], [S.othersClear + 10, 5]], `Islands and outcrops stay out of the first ${S.othersClear} m around the landing pad.`)
    ]);
    // Starting island at the origin with a landing pad. Two cones hold the ground near the pad: nothing below the lower one, nothing above
    // the upper one. Inside the pad radius both sit at the pad height, so the pad is flat and open to the sky; outside they open at a walkable slope.
    const cone = (sign, comment) => node('Sum', [flatDist([[0, S.padHeight / 100], [S.padRadius, S.padHeight / 100], [S.padRadius + 200, (S.padHeight + sign * 200 * V.padSlope) / 100]]), height()], null, comment);
    const padReach = S.padRadius + Math.ceil(S.padHeight / V.padSlope) + 2;
    const start = node('Min', [
      node('Max', [
        body('Starting island', fields.start, V.start, startPick),
        node('Min', [cone(-1, `Pad floor: solid up to Base + ${S.padHeight} within ${S.padRadius} m of the origin, sloping down to the sand at ${V.padSlope} outside it.`),
          flatDist([[padReach, 5], [padReach + 1, -5]], 'The pad base stops at a vertical edge under the sand (root rule).')])
      ]),
      cone(1, `Pad ceiling: nothing above Base + ${S.padHeight} within ${S.padRadius} m of the origin; outside, the ground may rise at ${V.padSlope}.`)
    ], null, 'Starting island with landing pad.');
    const rock = { $Comment: 'Rock: > 0 is rock. Vanilla terrain recipes inside our island and outcrop footprints.', Type: 'Exported', ExportAs: 'Arrakis_Rock', SingleInstance: true, Skip: false,
      Inputs: [node('Sum', [node('Max', [others, start]), node('Multiplier', [c(0), insideDefinition], null, 'Holds the definition of Arrakis_Inside; adds exactly 0.')])] };
    return { A: null, B: null, duneHeight, duneNoise, UNIT, rock };
  }

  const others = node('Min', [terraced([islandPre, ...outcropLayers]),
    dist0([[S.othersClear, -3], [S.othersClear + 10, 5]], `Islands and outcrops stay out of the first ${S.othersClear} m around the pad.`)]);
  const A = node('YOverride', [node('Cache', [
    node('Sum', [node('Max', [others, start], null, 'Rock top above the local sand surface. Negative = no rock.'), duneHeight])
  ], { Capacity: 3 })], { Value: 0 }, `A: rock top height above Base in units of ${UNIT} m, per column. Negative = no rock.`);
  const B = node('CurveMapper', [{ Type: 'BaseHeight', BaseHeightName: 'Base', Distance: true, Skip: false }],
    { Curve: curve([[-UNIT, 1], [0, 0], [4 * UNIT, -4]]) }, `B: 0 at Base, -1 at ${UNIT} m above Base.`);
  return { A, B, duneHeight, duneNoise, UNIT,
    rock: { $Comment: `Rock. Solid where A + B > 0, i.e. up to ${UNIT} m * A above Base.`, Type: 'Exported', ExportAs: 'Arrakis_Rock', SingleInstance: true, Skip: false, Inputs: [node('Sum', [A, B])] } };
}

const PARAMS = {
  // North is -Z. A belt of large east-west islands peaks 10 km north of spawn and is back to normal by 20 km north.
  // Going south, large islands thin out and by 20 km south only free-standing medium islands remain.
  latitude: {
    // [z, value] points; curves hold their end values beyond the last point. North is -Z.
    // Regular islands (about 600 m): common from spawn to 20 km north, thinning to 10% far north and far south.
    regularKeep: [[-27000, 0.1], [-21000, 0.6], [-1000, 0.7], [3000, 0.6], [12000, 0.3], [20000, 0.1]],
    // Land masses, smallest class first (the variant pick lets later classes override earlier ones where they overlap).
    // sizes: [half east-west, half north-south, turn in degrees]
    masses: [
      { name: 'Large', gridX: 2800, gridZ: 1900, jitter: 0.2, offsets: [[0, 0], [1400, 950]],
        keep: [[-27000, 0.05], [-21000, 0.45], [-5000, 0.5], [-1500, 0.12], [4000, 0.12], [12000, 0.07], [20000, 0.05]],
        sizes: [[375, 250, 0], [480, 270, 25], [560, 300, -20], [625, 320, 10], [450, 300, -35]],
        lobeAmp: 0.4, lobeScale: 300, bayAmp: 0.1, bayScale: 90 },
      { name: 'Huge', gridX: 5500, gridZ: 3500, jitter: 0.18, offsets: [[700, 400], [3450, 2150]],
        keep: [[-22000, 0], [-17000, 0.35], [-12000, 0.5], [-6000, 0.45], [-3000, 0]],
        sizes: [[1000, 500, 0], [1100, 560, 12], [1250, 620, -10], [1150, 520, 20]],
        lobeAmp: 0.35, lobeScale: 600, bayAmp: 0.12, bayScale: 170 }
    ]
  },
  // Rock variants: vanilla terrain recipes, alone or merged. One is picked per large island and used by its whole outcrop chain.
  variants: {
    sources: { 1: 'Plains1/Plains1_Mountains', 3: 'Experimental/Mountains', 5: 'Experimental/Taiga1_Redwood_2dCliffs', 6: 'Plains1/Plains1_Gorges' },
    // 1+6 and 3+6 were dropped: most floating rock in the showcase.
    mixes: [[1], [3], [5], [6], [1, 3], [1, 5], [3, 5], [5, 6], [1, 3, 5], [1, 3, 5, 6]],
    edgeReference: 300, patchScale: 240, coastSlope: 1.3, rootDepth: 4, padSlope: 0.6,
    mass: { sink: 8, nominalRadius: 400 }, large: { sink: 20, nominalRadius: 300 }, medium: { sink: 40, nominalRadius: 75 }, small: { sink: 50, nominalRadius: 28 }, start: { sink: 30, nominalRadius: 100 }
  },
  sandLevel: 80, // must equal Base in WorldStructures/Arrakis.json; write.js checks it
  // Rock more than this many metres below the sand surface height field is removed, so roots go straight down.
  rootCut: 4,
  guaranteedIsland: { x: 640, z: -480, clear: 1200 },
  start: { radius: 100, lobeAmp: 0.3, lobeScale: 75, edgeMetres: 30, capCurve: [[-1, 6], [0, 10], [1, 15]],
    lookoutScale: 110, lookoutFrom: 0.3, lookoutExtra: 20,
    padRadius: 16, padHeight: 10, padBlendEnd: 45, othersClear: 30, duneFadeStart: 120, duneFadeEnd: 320, duneFadeWobble: 45 },
  island: {
    radius: 300, lobeAmp: 0.62, lobeScale: 230, detailAmp: 0.05, detailScale: 60,
    edgeMetres: 110, capScale: 210,
    capCurve: [[-1, 10], [-0.35, 14], [-0.1, 30], [0.15, 54], [0.45, 90], [0.7, 110], [1, 110]],
    stepJitter: 1.0,
    levels: [0, 3, 8, 14, 20, 29, 35, 44, 50, 58, 67, 73, 82, 90, 98, 106, 112, 120],
    ramps: [0, 6, 11]
  },
  outcrops: {
    windAngle: 30, rimSteepness: 3, edgeNoise: 0.28,
    // variants: [shareOfCells, semiLengthAlongLean, semiWidth, leanOffsetDeg, crestMetres]; biggest first
    medium: { islandLike: true, aloneShare: 0.03, spawnClear: 350, grid: 400, jitter: 0.14, maxDistance: 200, fadeStart: 450, fadeEnd: 1000,
      fill: 0.9, radiusCurve: [[-1, 50], [0, 72], [1, 97]], farShrink: 0.8,
      lobeAmp: 0.45, lobeScale: 75, detailAmp: 0.03, detailScale: 22, capScale: 85,
      heightPerRadius: 0.4, heightVariety: [[-1, 0.4], [0, 0.9], [1, 1.4]], capCurve: [[-1, 0.3], [-0.2, 0.45], [0.2, 0.8], [0.6, 1.1], [1, 1.1]],
      variants: [
      [0.12, 125, 70, -10, 45], [0.12, 110, 55, 20, 30], [0.10, 100, 80, 0, 60], [0.10, 90, 45, -25, 22], [0.08, 75, 50, 10, 14]] },
    small: { islandLike: true, aloneShare: 0.004, spawnShare: 0.3, spawnRadius: 280, grid: 150, jitter: 0.14, maxDistance: 77, fadeStart: 400, fadeEnd: 1000,
      fill: 0.5, radiusCurve: [[-1, 14], [0, 22], [1, 36]], farShrink: 0.8,
      lobeAmp: 0.45, lobeScale: 28, detailAmp: 0.03, detailScale: 9, capScale: 32,
      heightPerRadius: 0.45, heightVariety: [[-1, 0.3], [0.3, 0.9], [0.85, 1.3], [0.93, 3.5], [1, 4.5]], capCurve: [[-1, 0.3], [-0.2, 0.45], [0.2, 0.8], [0.6, 1.1], [1, 1.1]],
      variants: [
      [0.10, 60, 30, 15, 25], [0.09, 50, 35, -20, 12], [0.08, 45, 22, 0, 35], [0.06, 25, 18, 25, 55],
      [0.09, 55, 28, -10, 5], [0.07, 35, 20, 10, 8], [0.06, 20, 14, 0, 4]] }
  }
};
module.exports = { makeRock, PARAMS, UNIT };
