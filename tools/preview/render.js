// Renders a top-down shaded preview of the rock graph.
// usage: node render.js <out.png> [centreX centreZ sizeMetres metresPerPixel seedSuffix]
const { evalNode, writePng } = require('./engine');
const { makeRock, PARAMS } = require('./graph');
const out = process.argv[2];
const cx = +(process.argv[3] || 900), cz = +(process.argv[4] || 900), size = +(process.argv[5] || 1400), res = +(process.argv[6] || 2);
const suffix = process.argv[7] || '';
const P = JSON.parse(JSON.stringify(PARAMS));
P.previewIslandAt = (process.env.ISLAND || '900,900').split(',').map(Number);
if (process.argv[8]) Object.assign(P.island, JSON.parse(process.argv[8]));
if (process.argv[9]) Object.assign(P.outcrops, JSON.parse(process.argv[9]));
const g = makeRock(P);
if (suffix) { const reseed = n => { if (n && typeof n === 'object') { if (typeof n.Seed === 'string' && n.Seed !== 'A') n.Seed += suffix; Object.values(n).forEach(reseed); } }; reseed(g.A); }

const W = Math.round(size / res), H = W;
const rockH = new Float32Array(W * H), sandH = new Float32Array(W * H);
for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) {
  const x = cx - size / 2 + i * res, z = cz - size / 2 + j * res, ctx = { x, y: 0, z };
  rockH[j * W + i] = evalNode(g.A, ctx) * g.UNIT;
  sandH[j * W + i] = evalNode(g.duneHeight, ctx) * g.UNIT;
}
const rgb = Buffer.alloc(W * H * 3);
let rockPx = 0, maxRel = 0;
const hAt = (i, j) => { i = Math.max(0, Math.min(W - 1, i)); j = Math.max(0, Math.min(H - 1, j)); const k = j * W + i; return Math.max(rockH[k], sandH[k]); };
for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) {
  const k = j * W + i, isRock = rockH[k] > sandH[k], h = hAt(i, j);
  const dx = (hAt(i + 1, j) - hAt(i - 1, j)) / (2 * res), dz = (hAt(i, j + 1) - hAt(i, j - 1)) / (2 * res);
  // light from the north-west, fairly low
  const k2 = isRock ? 0.9 : 0.35;
  let shade = (1 + k2 * dx + k2 * dz) / Math.sqrt(1 + dx * dx + dz * dz); shade = Math.max(0.25, Math.min(1.25, shade));
  // cast shadow: march toward the light
  let shadow = 1; for (let s = 1; s <= 40; s++) { const hh = hAt(i - s, j - s); if (hh > h + s * res * 1.0) { shadow = 0.6; break; } }
  let col;
  if (isRock) { rockPx++; const rel = rockH[k] - sandH[k]; if (rel > maxRel) maxRel = rel; const t = Math.min(1, rel / 110); col = [150 + 60 * t, 95 + 55 * t, 60 + 45 * t]; }
  else col = [222, 190, 128];
  for (let q = 0; q < 3; q++) rgb[k * 3 + q] = Math.max(0, Math.min(255, col[q] * shade * shadow));
}
writePng(out, W, H, rgb);
console.log(`${W}x${H}px, ${res} m/px, rock ${(100 * rockPx / (W * H)).toFixed(1)}% of view, max height above sand ${maxRel.toFixed(0)} m`);
