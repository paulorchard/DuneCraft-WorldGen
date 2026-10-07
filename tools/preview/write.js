// Writes the generated Arrakis_Rock graph into the biome file: node write.js <Arrakis_Terrain.json>
const fs = require('fs');
const { makeRock, PARAMS } = require('./graph');
const file = process.argv[2];
const biome = JSON.parse(fs.readFileSync(file, 'utf8'));
const inputs = biome.Terrain.Density.Inputs;
const i = inputs.findIndex(n => n.ExportAs === 'Arrakis_Rock');
if (i < 0) throw new Error('Arrakis_Rock node not found');
inputs[i] = makeRock(PARAMS).rock;
fs.writeFileSync(file, JSON.stringify(biome, null, 2) + '\n');
console.log('wrote', file);
