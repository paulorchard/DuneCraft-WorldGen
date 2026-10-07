// Builds the Arrakis_Rock density graph (round 2). Used by both the preview renderer and the biome writer.
const UNIT = 120; // density 1.0 in the A terms = 120 m above Base

const c = v => ({ Type: 'Constant', Value: v, Skip: false });
const noise2d = (scale, octaves, seed, pers = 0.5) => ({ Type: 'SimplexNoise2D', Scale: scale, Octaves: octaves, Lacunarity: 2.0, Persistence: pers, Seed: seed, Skip: false });
const node = (type, inputs, extra, comment) => Object.assign(comment ? { $Comment: comment } : {}, { Type: type }, extra || {}, { Skip: false, Inputs: inputs });
const norm = (min, max, input, comment) => node('Normalizer', [input], { FromMin: -1, FromMax: 1, ToMin: min, ToMax: max }, comment);
const curve = pts => ({ Type: 'Manual', Points: pts.map(([i, o]) => ({ In: +i.toFixed(5), Out: +o.toFixed(5) })) });
const m = metres => metres / UNIT;

// Stair-step curve in metres. levels: ascending shelf heights. ramps: indices of intervals left as plain slopes.
// On a tread the output rises only `tilt` of the interval; the rest is made up in a short riser at the end.
function terraceCurve(levels, ramps, riser = 0.15, tilt = 0.12) {
  const pts = [[-UNIT, -UNIT], [0, 0]];
  for (let i = 0; i < levels.length - 1; i++) {
    const a = levels[i], b = levels[i + 1];
    if (ramps.includes(i)) { pts.push([b, b]); continue; }
    pts.push([b - (b - a) * riser, a + (b - a) * tilt]);
    pts.push([b, b]);
  }
  return curve(pts.map(([i, o]) => [m(i), m(o)]));
}

function makeRock(P) {
  const islandPositions = {
    $Comment: 'Offset keeps island centres away from the fixed spawn at the origin.',
    Type: 'Offset', Skip: false, OffsetX: 900, OffsetY: 0, OffsetZ: 900,
    Positions: {
      $Comment: 'Randomly drop 30% of the positions.',
      Type: 'Occurrence', Skip: false, Seed: 'Arrakis_Islands_Drop', FieldFunction: c(0.7),
      Positions: { Type: 'Mesh2D', Skip: false, PointsY: 0,
        PointGenerator: { Type: 'Mesh', Jitter: 0.2, ScaleX: 2500, ScaleY: 2500, ScaleZ: 2500, Seed: 'Arrakis_Islands' } }
    }
  };
  if (P.previewIslandAt) { islandPositions.Positions = { Type: 'List', Positions: [{ X: P.previewIslandAt[0] - 900, Y: 0, Z: P.previewIslandAt[1] - 900 }] }; }

  const duneHeight = node('Clamp', [norm(m(-0.8 * 40), m(1.2 * 40), noise2d(400, 4, 'A'))], { WallA: 0, WallB: m(40) },
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
  const F = node('Sum', fieldInputs, null, 'Island field F: > 0 is rock.');
  const edge = node('Multiplier', [c(+m(I.edgeMetres).toFixed(5)), F], null, `Height available from the shore inwards: F * ${I.edgeMetres} m.`);
  const cap = node('CurveMapper', [noise2d(I.capScale, 3, 'Arrakis_Islands_Tops')], { Curve: curve(I.capCurve.map(([i, o]) => [i, m(o)])) },
    'Height cap: low benches where the noise is low, summits where it is high.');
  const islandPre = node('Min', [edge, cap], null, 'Large island height before terracing.');
  const preStepOf = shapes => node('Sum', [node('Max', shapes, null, 'Rock height above the sand before terracing.'),
    norm(m(-I.stepJitter), m(I.stepJitter), noise2d(28, 2, 'Arrakis_Rock_Rough'), 'Small noise before stepping so shelf edges are not parallel lines.')]);
  const terraced = shapes => node('CurveMapper', [preStepOf(shapes)], { Curve: terraceCurve(I.levels, I.ramps) },
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
  const outcropLayers = [layer(O.medium, 'Medium'), layer(O.small, 'Small')];

  const spawnMask = { $Comment: 'No rock within about 70 m of the fixed spawn at the origin.', Type: 'Distance', Skip: false, Curve: curve([[0, -3], [70, -3], [90, 5]]) };
  const A = node('YOverride', [node('Cache', [node('Min', [spawnMask,
    node('Sum', [terraced([islandPre, ...outcropLayers]), duneHeight])
  ])], { Capacity: 3 })], { Value: 0 }, `A: rock top height above Base in units of ${UNIT} m, per column. Negative = no rock.`);
  const B = node('CurveMapper', [{ Type: 'BaseHeight', BaseHeightName: 'Base', Distance: true, Skip: false }],
    { Curve: curve([[-UNIT, 1], [0, 0], [4 * UNIT, -4]]) }, `B: 0 at Base, -1 at ${UNIT} m above Base.`);
  return { A, B, duneHeight, UNIT,
    rock: { $Comment: `Rock. Solid where A + B > 0, i.e. up to ${UNIT} m * A above Base.`, Type: 'Exported', ExportAs: 'Arrakis_Rock', SingleInstance: true, Skip: false, Inputs: [node('Sum', [A, B])] } };
}

const PARAMS = {
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
    medium: { grid: 320, jitter: 0.35, maxDistance: 180, fadeStart: 380, fadeEnd: 820, variants: [
      [0.12, 125, 70, -10, 45], [0.12, 110, 55, 20, 30], [0.10, 100, 80, 0, 60], [0.10, 90, 45, -25, 22], [0.08, 75, 50, 10, 14]] },
    small: { grid: 130, jitter: 0.4, maxDistance: 80, fadeStart: 350, fadeEnd: 900, variants: [
      [0.10, 60, 30, 15, 25], [0.09, 50, 35, -20, 12], [0.08, 45, 22, 0, 35], [0.06, 25, 18, 25, 55],
      [0.09, 55, 28, -10, 5], [0.07, 35, 20, 10, 8], [0.06, 20, 14, 0, 4]] }
  }
};
module.exports = { makeRock, PARAMS, UNIT };
