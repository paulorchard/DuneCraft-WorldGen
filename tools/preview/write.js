// Writes the generated rock graph, the dune fade at spawn and the spawn position into the pack.
// usage: node write.js <Arrakis_Terrain.json>   (the world structure is found next to it)
const fs = require('fs');
const path = require('path');
const { makeRock, PARAMS } = require('./graph');
const file = process.argv[2];
const biome = JSON.parse(fs.readFileSync(file, 'utf8'));
const inputs = biome.Terrain.Density.Inputs;
const built = makeRock(PARAMS);
const i = inputs.findIndex(n => n.ExportAs === 'Arrakis_Rock');
if (i < 0) throw new Error('Arrakis_Rock node not found');
inputs[i] = built.rock;
// Dune branch: Sum(noise term, height falloff). Only the noise term is replaced, by Min(the same clamped noise, spawn fade).
const dunes = inputs.find(n => n.Type === 'Sum' && n.Inputs.some(x => x.Type === 'CurveMapper'));
const k = dunes.Inputs.findIndex(x => x.Type !== 'CurveMapper');
if (k < 0) throw new Error('dune noise term not found');
dunes.Inputs[k] = built.duneNoise();
fs.writeFileSync(file, JSON.stringify(biome, null, 2) + '\n');
// Spawn: standing on the landing pad.
const wsFile = path.join(path.dirname(file), '..', '..', 'WorldStructures', 'Arrakis.json');
const ws = JSON.parse(fs.readFileSync(wsFile, 'utf8'));
const base = ws.Framework.find(f => f.Type === 'DecimalConstants').Entries.find(e => e.Name === 'Base').Value;
if (PARAMS.sandLevel !== undefined && base !== PARAMS.sandLevel) throw new Error('PARAMS.sandLevel (' + PARAMS.sandLevel + ') must equal Base (' + base + ')');
const spawns = ws.Framework.find(f => f.Type === 'Positions').Entries.find(e => e.Name === 'Spawns');
spawns.Positions.Positions = [{ X: 0.5, Y: base + PARAMS.start.padHeight + 1, Z: 0.5 }];
// The generator takes spawn points from the top-level SpawnPositions key; without it players appear at its fallback (0, 140, 0).
ws.SpawnPositions = { Type: 'List', Positions: [{ X: 0.5, Y: base + PARAMS.start.padHeight + 1, Z: 0.5 }] };
fs.writeFileSync(wsFile, JSON.stringify(ws, null, 2) + '\n');
console.log('wrote', file, 'and', wsFile);
