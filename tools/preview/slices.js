// Underground slice measurements and images.
// usage: node slices.js <outPrefix> [rootCut|none]
const { evalNode, writePng } = require('./engine');
const { makeRock, PARAMS } = require('./graph');
const prefix = process.argv[2], rc = process.argv[3];
const P = JSON.parse(JSON.stringify(PARAMS));
P.previewIslandAt = [900, 900];
if (rc !== undefined) P.rootCut = rc === 'none' ? 0 : +rc;
const g = makeRock(P), BASE = 80;
const bCurve = g.B.Curve.Points.map(p => [p.In, p.Out]);
const B = y => { const d = y - BASE, p = bCurve; if (d <= p[0][0]) return p[0][1]; if (d >= p[p.length - 1][0]) return p[p.length - 1][1]; let i = 0; while (p[i + 1][0] < d) i++; return p[i][1] + (p[i + 1][1] - p[i][1]) * (d - p[i][0]) / (p[i + 1][0] - p[i][0]); };

// horizontal slices over the island and its chain
const size = 2400, res = 3, W = size / res, x0 = 900 - size / 2, z0 = 900 - size / 2;
const A = new Float32Array(W * W), dune = new Float32Array(W * W);
for (let j = 0; j < W; j++) for (let i = 0; i < W; i++) { const c = { x: x0 + i * res, y: 0, z: z0 + j * res }; A[j * W + i] = evalNode(g.A, c); dune[j * W + i] = evalNode(g.duneHeight, c); }
const area = n => (n * res * res / 10000).toFixed(1) + ' ha';
let surf = 0; for (let k = 0; k < W * W; k++) if (A[k] > dune[k]) surf++;
console.log('rock showing above the sand: ' + area(surf));
for (const y of [40, 10]) {
  let n = 0; const rgb = Buffer.alloc(W * W * 3);
  for (let k = 0; k < W * W; k++) { const rock = A[k] + B(y) > 0, above = A[k] > dune[k]; if (rock) n++;
    const col = rock ? (above ? [150, 80, 50] : [215, 120, 70]) : [228, 200, 140]; rgb[k * 3] = col[0]; rgb[k * 3 + 1] = col[1]; rgb[k * 3 + 2] = col[2]; }
  writePng(`${prefix}_y${y}.png`, W, W, rgb);
  console.log(`rock at Y=${y}: ${area(n)}  (${(n / surf).toFixed(2)} x the area showing above the sand)`);
}
// vertical slice, west-east through z = 900, 1 m per pixel, Y 0..240
const VW = 1600, VH = 240, vx0 = 900 - VW / 2, rgb = Buffer.alloc(VW * VH * 3);
for (let i = 0; i < VW; i++) { const c = { x: vx0 + i, y: 0, z: +(process.env.SLICE_Z || 900) }, a = evalNode(g.A, c), d = evalNode(g.duneHeight, c) * g.UNIT;
  for (let y = 0; y < VH; y++) { const rock = a + B(y) > 0, sand = y - BASE < Math.max(d, 0) || y < BASE;
    const col = y < 2 ? [60, 60, 60] : rock ? [150, 80, 50] : sand ? [228, 200, 140] : [190, 225, 240]; const k = ((VH - 1 - y) * VW + i) * 3; rgb[k] = col[0]; rgb[k + 1] = col[1]; rgb[k + 2] = col[2]; } }
writePng(`${prefix}_vertical.png`, VW, VH, rgb);
