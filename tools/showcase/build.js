// Builds the Arrakis_Showcase world: re-skinned copies of vanilla terrain biomes laid out in a grid around spawn.
// usage: node tools/showcase/build.js <dir containing the game's Server/HytaleGenerator> <pack's Server/HytaleGenerator>
// The first argument is an extracted copy of Server/HytaleGenerator from the game's Assets.zip.
const fs = require('fs');
const path = require('path');
const [vanillaRoot, packRoot] = process.argv.slice(2);
if (!vanillaRoot || !packRoot) throw new Error('usage: build.js <vanilla HytaleGenerator dir> <pack HytaleGenerator dir>');

const PREFIX = 'AS_';
const TILE = 700, REGION = 500; // one biome per 500 m square, 200 m of flat sand between squares
// rows from north (-Z) to south, columns from west (-X) to east
const LAYOUT = [
  ['Plains1/Plains1_Mountains', 'Taiga1/Taiga1_Mountains', 'Experimental/Mountains', 'Experimental/Plateaus'],
  ['Experimental/Taiga1_Redwood_2dCliffs', 'Plains1/Plains1_Gorges', 'Experimental/Dunes', 'Experimental/Arches'],
  ['Generative/Generative_Arches', 'Generative/Generaitve_Boulders_Sandstone', 'Desert1/Desert1_Stacks', 'Desert1/Desert1_Rocky']
];
const SAND_BIOMES = new Set(['Experimental/Dunes']); // everything else is skinned as rock
const colCentre = c => (c - (LAYOUT[0].length - 1) / 2) * TILE;
const rowCentre = r => (r - (LAYOUT.length - 1) / 2) * TILE;

const constant = solid => ({ Type: 'Constant', Material: { Solid: solid } });
const material = solid => ({
  Type: 'Solidity',
  Solid: { Type: 'Queue', Queue: [
    { Type: 'SimpleHorizontal', TopY: 1, TopBaseHeight: 'Bedrock', BottomY: 0, BottomBaseHeight: 'Bedrock', Material: constant('Rock_Bedrock') },
    constant(solid)
  ] },
  Empty: { Type: 'Queue', Queue: [constant('Empty')] }
});

// Drop node-editor metadata; keep comments.
function clean(n) {
  if (Array.isArray(n)) return n.map(clean);
  if (n && typeof n === 'object') { const o = {}; for (const [k, v] of Object.entries(n)) if (!k.startsWith('$') || k === '$Comment') o[k] = clean(v); return o; }
  return n;
}
function walk(n, fn) { if (n && typeof n === 'object') { if (!Array.isArray(n)) fn(n); for (const v of Object.values(n)) walk(v, fn); } }

const outDir = path.join(packRoot, 'Biomes', 'Arrakis_Showcase');
fs.rmSync(outDir, { recursive: true, force: true });
fs.mkdirSync(outDir, { recursive: true });
const ranges = [], report = [];

LAYOUT.forEach((row, r) => row.forEach((rel, c) => {
  const src = JSON.parse(fs.readFileSync(path.join(vanillaRoot, 'Biomes', rel + '.json'), 'utf8'));
  const id = PREFIX + path.basename(rel);
  const terrain = clean(src.Terrain);
  // Exported names are global across packs: give this copy's exports their own names and point its imports at them.
  const exported = new Set();
  walk(terrain, n => { if (typeof n.ExportAs === 'string' && n.ExportAs) exported.add(n.ExportAs); });
  const external = new Set();
  walk(terrain, n => {
    if (typeof n.ExportAs === 'string' && n.ExportAs) n.ExportAs = PREFIX + n.ExportAs;
    if (n.Type === 'Imported' && typeof n.Name === 'string') { if (exported.has(n.Name)) n.Name = PREFIX + n.Name; else external.add(n.Name); }
  });
  // World-Continent-Map is not exported by any shipped asset, so in the game it already resolves to a constant 0.
  walk(terrain, n => { if (n.Type === 'Imported' && n.Name === 'World-Continent-Map') { for (const k of Object.keys(n)) delete n[k]; Object.assign(n, { Type: 'Constant', Value: 0, Skip: false }); external.delete('World-Continent-Map'); } });
  let nodes = 0; walk(terrain, n => { if (typeof n.Type === 'string') nodes++; });
  const biome = {
    Name: id,
    Terrain: terrain,
    MaterialProvider: material(SAND_BIOMES.has(rel) ? 'Soil_Sand_White' : 'Rock_Sandstone'),
    EnvironmentProvider: { Type: 'Constant', Environment: 'Env_Arrakis' },
    Props: []
  };
  fs.writeFileSync(path.join(outDir, id + '.json'), JSON.stringify(biome, null, 2) + '\n');
  const value = c + 10 * r;
  ranges.push({ Biome: id, Min: value - 0.5, Max: value + 0.5 });
  report.push({ id, from: rel, x: colCentre(c), z: rowCentre(r), nodes, external: [...external] });
}));

// Flat sand between the squares.
const flatId = PREFIX + 'Flat';
fs.writeFileSync(path.join(outDir, flatId + '.json'), JSON.stringify({
  Name: flatId,
  Terrain: { Type: 'DAOTerrain', Density: { Type: 'CurveMapper', Skip: false, Curve: { Type: 'Manual', Points: [{ In: -5, Out: 2 }, { In: 5, Out: -2 }] },
    Inputs: [{ Type: 'BaseHeight', BaseHeightName: 'Base', Distance: true, Skip: false }] } },
  MaterialProvider: material('Soil_Sand_White'),
  EnvironmentProvider: { Type: 'Constant', Environment: 'Env_Arrakis' },
  Props: []
}, null, 2) + '\n');

// Biome map: column index from X plus 10 x row index from Z; anything in a gap is far below every range and gets the default biome.
const steps = (centres, scale, gap) => {
  const pts = [{ In: centres[0] - REGION / 2 - 1, Out: gap }];
  centres.forEach((ctr, i) => { pts.push({ In: ctr - REGION / 2, Out: i * scale }, { In: ctr + REGION / 2, Out: i * scale }, { In: ctr + REGION / 2 + 1, Out: gap });
    if (i < centres.length - 1) pts.push({ In: centres[i + 1] - REGION / 2 - 1, Out: gap }); });
  return { Type: 'Manual', Points: pts };
};
const ws = {
  Type: 'NoiseRange',
  Biomes: ranges,
  DefaultBiome: flatId,
  DefaultTransitionDistance: 32,
  MaxBiomeEdgeDistance: 32,
  Density: { $Comment: 'Showcase biome map: a grid of 500 m squares, one vanilla terrain recipe in each.', Type: 'Sum', Skip: false, Inputs: [
    { Type: 'CurveMapper', Skip: false, Curve: steps(LAYOUT[0].map((_, c) => colCentre(c)), 1, -100), Inputs: [{ Type: 'XValue', Skip: false }] },
    { Type: 'CurveMapper', Skip: false, Curve: steps(LAYOUT.map((_, r) => rowCentre(r)), 10, -1000), Inputs: [{ Type: 'ZValue', Skip: false }] }
  ] },
  SpawnPositions: { Type: 'List', Positions: [{ X: 0.5, Y: 102, Z: 0.5 }] },
  Framework: [{ Type: 'DecimalConstants', Entries: [{ Name: 'Base', Value: 100 }, { Name: 'Water', Value: 100 }, { Name: 'Bedrock', Value: 0 }] }]
};
fs.writeFileSync(path.join(packRoot, 'WorldStructures', 'Arrakis_Showcase.json'), JSON.stringify(ws, null, 2) + '\n');

for (const b of report) console.log(`${b.id.padEnd(38)} centre x ${String(b.x).padStart(6)}, z ${String(b.z).padStart(5)}  nodes ${String(b.nodes).padStart(3)}  external imports: ${b.external.join(', ') || 'none'}`);
