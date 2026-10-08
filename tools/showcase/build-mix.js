// Builds the Arrakis_Mix showcase: for each rock variant (a vanilla terrain recipe or a merge of several), one tile of flat
// sand showing that variant as a large island, two medium outcrops and three small outcrops.
// usage: node tools/showcase/build-mix.js <dir containing the game's Server/HytaleGenerator> <pack's Server/HytaleGenerator>
const fs = require('fs');
const path = require('path');
const [vanillaRoot, packRoot] = process.argv.slice(2);
if (!vanillaRoot || !packRoot) throw new Error('usage: build-mix.js <vanilla HytaleGenerator dir> <pack HytaleGenerator dir>');

const SOURCES = { 1: 'Plains1/Plains1_Mountains', 3: 'Experimental/Mountains', 5: 'Experimental/Taiga1_Redwood_2dCliffs', 6: 'Plains1/Plains1_Gorges' };
const TILE_X = 1500, TILE_Z = 1100, BASE = 'Base', BASE_Y = 100;
// rows north to south, columns west to east; each entry lists the vanilla recipes merged in that variant
const LAYOUT = [
  [[1], [3], [5], [6]],
  [[1, 3], [1, 5], [1, 6], [3, 5]],
  [[3, 6], [5, 6], [1, 3, 5], [1, 3, 5, 6]]
];
// Shapes in each tile, relative to the tile centre. sink = how many blocks the vanilla terrain is lowered for that size class.
const SIZES = { large: { sink: 20 }, medium: { sink: 40 }, small: { sink: 50 } };
const SHAPES = [
  { size: 'large', dx: -300, dz: 0, radius: 300, lobeAmp: 0.62 },
  { size: 'medium', dx: 380, dz: -230, radius: 90, lobeAmp: 0.45 },
  { size: 'medium', dx: 400, dz: 200, radius: 60, lobeAmp: 0.45 },
  { size: 'small', dx: 610, dz: -330, radius: 36, lobeAmp: 0.45 },
  { size: 'small', dx: 630, dz: -20, radius: 25, lobeAmp: 0.45 },
  { size: 'small', dx: 600, dz: 340, radius: 18, lobeAmp: 0.45 }
];
const EDGE_REFERENCE = 300, COAST_SLOPE = 1.3, PATCH_SCALE = 240, ROOT_DEPTH = 4;
const colCentre = c => (c - (LAYOUT[0].length - 1) / 2) * TILE_X;
const rowCentre = r => (r - (LAYOUT.length - 1) / 2) * TILE_Z;

const c = v => ({ Type: 'Constant', Value: v, Skip: false });
const node = (type, inputs, extra, comment) => Object.assign(comment ? { $Comment: comment } : {}, { Type: type }, extra || {}, { Skip: false, Inputs: inputs });
const curve = pts => ({ Type: 'Manual', Points: pts.map(([i, o]) => ({ In: i, Out: o })) });
const noise2d = (scale, octaves, seed) => ({ Type: 'SimplexNoise2D', Scale: scale, Octaves: octaves, Lacunarity: 2.0, Persistence: 0.5, Seed: seed, Skip: false });
const norm = (min, max, input) => node('Normalizer', [input], { FromMin: -1, FromMax: 1, ToMin: min, ToMax: max });
const height = pts => node('CurveMapper', [{ Type: 'BaseHeight', BaseHeightName: BASE, Distance: true, Skip: false }], { Curve: curve(pts) });
const constant = solid => ({ Type: 'Constant', Material: { Solid: solid } });
const cache2d = n => node('YOverride', [node('Cache', [n], { Capacity: 3 })], { Value: 0 });
const step01 = (n, comment) => node('Clamp', [node('Multiplier', [c(1000000), n])], { WallA: 0, WallB: 1 }, comment);

function clean(n) {
  if (Array.isArray(n)) return n.map(clean);
  if (n && typeof n === 'object') { const o = {}; for (const [k, v] of Object.entries(n)) if (!k.startsWith('$') || k === '$Comment') o[k] = clean(v); return o; }
  return n;
}
function walk(n, fn) { if (n && typeof n === 'object') { if (!Array.isArray(n)) fn(n); for (const v of Object.values(n)) walk(v, fn); } }

const outDir = path.join(packRoot, 'Biomes', 'Arrakis_Mix');
fs.rmSync(outDir, { recursive: true, force: true });
fs.mkdirSync(outDir, { recursive: true });
const ranges = [], report = [];

LAYOUT.forEach((row, r) => row.forEach((mix, col) => {
  const index = r * row.length + col + 1, id = 'AM_' + String(index).padStart(2, '0') + '_' + mix.join('_');
  const x0 = colCentre(col), z0 = rowCentre(r), tag = 'AM' + index;

  // Footprint field of one shape: > 0 inside. Same recipe as the Arrakis islands and outcrops, noise scales in proportion to the radius.
  const F = (s, k) => node('Sum', [
    { Type: 'PositionsCellNoise', Skip: false, MaxDistance: 2 * s.radius, Positions: { Type: 'List', Skip: false, Positions: [{ X: x0 + s.dx, Y: 0, Z: z0 + s.dz }] },
      ReturnType: { Type: 'Curve', Curve: curve([[0, 1], [s.radius, 0], [2 * s.radius, -1]]) }, DistanceFunction: { Type: 'Euclidean' } },
    norm(-s.lobeAmp, s.lobeAmp, noise2d(Math.round(s.radius * 0.77), 2, tag + '_Lobes' + k)),
    norm(-0.05, 0.05, noise2d(Math.max(8, Math.round(s.radius * 0.2)), 2, tag + '_Coast' + k))
  ]);
  const shapesOf = pick => SHAPES.map((s, k) => [s, k]).filter(([s]) => pick(s));
  // Roughly metres inside the shore of whichever shape this column belongs to (negative outside all of them).
  const metresOf = pick => node('Max', shapesOf(pick).map(([s, k]) => node('Multiplier', [c(s.radius), F(s, k)])));
  // What the recipes are told in place of DistanceToBiomeEdge. Every shape is scaled as if it were a full-size island (EDGE_REFERENCE m
  // from shore to centre): fed real metres, the recipes' own border fade (32-64 m) flattened medium and small outcrops to almost nothing.
  const metresInside = () => node('Clamp', [cache2d(node('Max', SHAPES.map((sh, k) => node('Multiplier', [c(EDGE_REFERENCE), F(sh, k)]))))], { WallA: 0, WallB: 2000 },
    'Stands in for DistanceToBiomeEdge: how far inside its island or outcrop this column is, on the scale of a full-size island.');

  // The variant: vanilla terrain densities copied unchanged apart from export names and the biome-edge distance, merged by patches.
  const copies = mix.map((n, k) => {
    const terrain = clean(JSON.parse(fs.readFileSync(path.join(vanillaRoot, 'Biomes', SOURCES[n] + '.json'), 'utf8')).Terrain.Density);
    const prefix = tag + String.fromCharCode(97 + k) + '_', exported = new Set();
    walk(terrain, m => { if (typeof m.ExportAs === 'string' && m.ExportAs) exported.add(m.ExportAs); });
    walk(terrain, m => {
      if (typeof m.ExportAs === 'string' && m.ExportAs) m.ExportAs = prefix + m.ExportAs;
      if (m.Type === 'Imported' && exported.has(m.Name)) m.Name = prefix + m.Name;
      if (m.Type === 'DistanceToBiomeEdge') { for (const key of Object.keys(m)) delete m[key]; Object.assign(m, metresInside()); }
    });
    return terrain;
  });
  let variant = copies[0];
  for (let k = 1; k < copies.length; k++) {
    const share = 1 / (k + 1);
    variant = node('Mix', [variant, copies[k],
      node('CurveMapper', [noise2d(PATCH_SCALE, 1, tag + '_Patch' + k)], { Curve: curve([[-1, 0], [1 - 2 * share - 0.3, 0], [1 - 2 * share + 0.3, 1], [1, 1]]) }, 'Patch mask: 0 keeps what is already there, 1 switches to the next recipe.')
    ], null, 'Merge by patches.');
  }
  let variantNodes = 0; walk(variant, m => { if (typeof m.Type === 'string') variantNodes++; });
  // Exported once, not single-instance: every Imported below builds its own copy with its own caches.
  const terrainName = tag + '_Terrain';
  let defined = false;
  const terrain = () => { if (defined) return { Type: 'Imported', Name: terrainName, Skip: false }; defined = true;
    return { $Comment: 'The rock recipe of this variant.', Type: 'Exported', ExportAs: terrainName, SingleInstance: false, Skip: false, Inputs: [variant] }; };
  // Slider evaluates its input at (position - slide): SlideY = -sink reads the terrain `sink` blocks higher up, so the shape moves down.
  const lowered = sink => node('Slider', [terrain()], { SlideX: 0, SlideY: -sink, SlideZ: 0 }, `Recipe lowered ${sink} blocks.`);

  const sizeRock = sizeName => {
    const sink = SIZES[sizeName].sink, mine = s => s.size === sizeName;
    const body = node('Min', [
      lowered(sink),
      node('Sum', [node('Multiplier', [c(COAST_SLOPE / 100), cache2d(metresOf(mine))]), height([[-200, 2], [400, -4]])], null, `Coast: rock may rise ${COAST_SLOPE} m for every metre in from the shore.`),
      // Root rule: a column keeps its rock (at every depth) only if the recipe is solid just under sand level there.
      // So each mass that breaks the sand has its own steep-sided root and masses are not joined under the sand.
      node('CurveMapper', [node('YOverride', [node('Cache', [lowered(sink)], { Capacity: 3 })], { Value: BASE_Y - ROOT_DEPTH })], { Curve: curve([[-0.000001, -5], [0.000001, 5]]) },
        `Root: no rock at any depth in columns where the recipe is not solid ${ROOT_DEPTH} blocks below sand level.`)
    ]);
    // Mix evaluates only its first input when the influence is 0, so the recipe is not evaluated outside the footprints.
    return node('Mix', [c(-5), body, step01(node('Sum', [cache2d(node('Max', shapesOf(mine).map(([s, k]) => F(s, k)))), c(0.012)]), '1 inside the footprint of a ' + sizeName + ' shape.')],
      null, `${sizeName} shapes: recipe lowered ${sink} blocks, limited to their footprints.`);
  };
  const rock = { $Comment: 'All rock in this tile.', Type: 'Exported', ExportAs: tag + '_Rock', SingleInstance: true, Skip: false, Inputs: [node('Max', Object.keys(SIZES).map(sizeRock))] };

  const biome = {
    Name: id,
    Terrain: { Type: 'DAOTerrain', Density: node('Max', [height([[-5, 2], [5, -2]]), rock], null, 'Flat sand floor at Base, plus the rock.') },
    MaterialProvider: { Type: 'Solidity',
      Solid: { Type: 'Queue', Queue: [
        { Type: 'SimpleHorizontal', TopY: 1, TopBaseHeight: 'Bedrock', BottomY: 0, BottomBaseHeight: 'Bedrock', Material: constant('Rock_Bedrock') },
        { Type: 'FieldFunction', FieldFunction: { Type: 'Imported', Name: tag + '_Rock' }, Delimiters: [{ From: 0, To: 100000, Material: { Type: 'Queue', Queue: [
          { Type: 'SimpleHorizontal', TopY: 1000, TopBaseHeight: BASE, BottomY: -3, BottomBaseHeight: BASE, Material: constant('Rock_Sandstone') },
          constant('Rock_Sandstone_Red')] } }] },
        constant('Soil_Sand_White')] },
      Empty: { Type: 'Queue', Queue: [constant('Empty')] } },
    EnvironmentProvider: { Type: 'Constant', Environment: 'Env_Arrakis' },
    Props: []
  };
  fs.writeFileSync(path.join(outDir, id + '.json'), JSON.stringify(biome, null, 2) + '\n');
  const value = col + 10 * r;
  ranges.push({ Biome: id, Min: value - 0.5, Max: value + 0.5 });
  report.push({ index, id, mix, x: x0, z: z0, variantNodes, kb: Math.round(fs.statSync(path.join(outDir, id + '.json')).size / 1024) });
}));

const steps = (centres, tile, scale) => {
  const pts = [];
  centres.forEach((ctr, i) => pts.push({ In: ctr - tile / 2 + 0.5, Out: i * scale }, { In: ctr + tile / 2 - 0.5, Out: i * scale }));
  return { Type: 'Manual', Points: pts };
};
fs.writeFileSync(path.join(packRoot, 'WorldStructures', 'Arrakis_Mix.json'), JSON.stringify({
  Type: 'NoiseRange',
  Biomes: ranges,
  DefaultBiome: ranges[0].Biome,
  DefaultTransitionDistance: 32,
  MaxBiomeEdgeDistance: 32,
  Density: { $Comment: 'Mix showcase biome map: a grid of tiles, one rock variant in each.', Type: 'Sum', Skip: false, Inputs: [
    { Type: 'CurveMapper', Skip: false, Curve: steps(LAYOUT[0].map((_, i) => colCentre(i)), TILE_X, 1), Inputs: [{ Type: 'XValue', Skip: false }] },
    { Type: 'CurveMapper', Skip: false, Curve: steps(LAYOUT.map((_, i) => rowCentre(i)), TILE_Z, 10), Inputs: [{ Type: 'ZValue', Skip: false }] }
  ] },
  SpawnPositions: { Type: 'List', Positions: [{ X: 0.5, Y: BASE_Y + 2, Z: TILE_Z / 2 + 0.5 }] },
  Framework: [{ Type: 'DecimalConstants', Entries: [{ Name: 'Base', Value: BASE_Y }, { Name: 'Water', Value: BASE_Y }, { Name: 'Bedrock', Value: 0 }] }]
}, null, 2) + '\n');

for (const b of report) console.log(`M${String(b.index).padEnd(2)} ${b.id.padEnd(16)} recipes ${b.mix.join('+').padEnd(8)} tile centre x ${String(b.x).padStart(6)}, z ${String(b.z).padStart(6)}  recipe nodes ${String(b.variantNodes).padStart(3)}  file ${b.kb} KB`);
console.log('shapes per tile (offset from tile centre):', SHAPES.map(s => `${s.size} r${s.radius} at (${s.dx}, ${s.dz})`).join('; '));
