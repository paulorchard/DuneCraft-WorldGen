// Approximate evaluator for the HytaleGenerator density nodes used by the Arrakis biome.
// Noise values differ from the game's (different hash), but have the same scales and ranges,
// so shapes are statistically representative. Graph logic is evaluated exactly as written.
const zlib = require('zlib');
const fs = require('fs');

function hashStr(s) { let h = 2166136261 >>> 0; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; } return h; }
function hash2(seed, x, y) { let h = seed ^ Math.imul(x, 501125321) ^ Math.imul(y, 1136930381); h = Math.imul(h ^ (h >>> 15), 0x27d4eb2d); h ^= h >>> 13; h = Math.imul(h, 0x165667b1); return (h ^ (h >>> 16)) >>> 0; }
const rnd01 = (seed, x, y) => hash2(seed, x, y) / 4294967296;

// 2D simplex noise, output about [-1, 1]
const G2 = []; for (let i = 0; i < 16; i++) { const a = i / 16 * Math.PI * 2; G2.push([Math.cos(a), Math.sin(a)]); }
function simplex(seed, x, y) {
  const F = 0.3660254037844386, G = 0.21132486540518713;
  const s = (x + y) * F, i = Math.floor(x + s), j = Math.floor(y + s), t = (i + j) * G;
  const x0 = x - (i - t), y0 = y - (j - t), i1 = x0 > y0 ? 1 : 0, j1 = 1 - i1;
  const x1 = x0 - i1 + G, y1 = y0 - j1 + G, x2 = x0 - 1 + 2 * G, y2 = y0 - 1 + 2 * G;
  let n = 0;
  const c = (dx, dy, ii, jj) => { let tt = 0.5 - dx * dx - dy * dy; if (tt > 0) { const g = G2[hash2(seed, ii, jj) & 15]; tt *= tt; n += tt * tt * (g[0] * dx + g[1] * dy); } };
  c(x0, y0, i, j); c(x1, y1, i + i1, j + j1); c(x2, y2, i + 1, j + 1);
  return Math.max(-1, Math.min(1, 99.2 * n));
}
function fbm(seed, x, y, oct, lac, pers) { let a = 1, f = 1, sum = 0, norm = 0; for (let o = 0; o < oct; o++) { sum += a * simplex(seed + o * 1013, x * f, y * f); norm += a; a *= pers; f *= lac; } return sum / norm; }

function curveFn(c) { const p = c.Points.map(q => [q.In, q.Out]); return v => { if (v <= p[0][0]) return p[0][1]; const L = p[p.length - 1]; if (v >= L[0]) return L[1]; let i = 0; while (p[i + 1][0] < v) i++; const a = p[i], b = p[i + 1]; return a[1] + (b[1] - a[1]) * (v - a[0]) / (b[0] - a[0]); }; }

// ---- positions: returns [x, z] list inside a box ----
function positions(node, x0, z0, x1, z1) {
  switch (node.Type) {
    case 'Mesh2D': { const g = node.PointGenerator, S = g.ScaleX, seed = hashStr(g.Seed), out = [];
      for (let i = Math.round(x0 / S) - 1; i <= Math.round(x1 / S) + 1; i++) for (let j = Math.round(z0 / S) - 1; j <= Math.round(z1 / S) + 1; j++) {
        const a = rnd01(seed, i, j) * Math.PI * 2, px = (i + Math.cos(a) * g.Jitter) * S, pz = (j + Math.sin(a) * g.Jitter) * S;
        if (px >= x0 && px <= x1 && pz >= z0 && pz <= z1) out.push([px, pz]); }
      return out; }
    case 'Occurrence': { const seed = hashStr(node.Seed); return positions(node.Positions, x0, z0, x1, z1).filter(p => evalNode(node.FieldFunction, { x: p[0], y: 0, z: p[1] }) > rnd01(seed, Math.round(p[0] * 7), Math.round(p[1] * 7))); }
    case 'Offset': return positions(node.Positions, x0 - node.OffsetX, z0 - node.OffsetZ, x1 - node.OffsetX, z1 - node.OffsetZ).map(p => [p[0] + node.OffsetX, p[1] + node.OffsetZ]);
    case 'List': return node.Positions.map(p => [p.X, p.Z]).filter(p => p[0] >= x0 && p[0] <= x1 && p[1] >= z0 && p[1] <= z1);
    case 'FieldFunction': return positions(node.Positions, x0, z0, x1, z1).filter(p => { const v = evalNode(node.FieldFunction, { x: p[0], y: 0, z: p[1] }); return node.Delimiters.some(d => v >= d.Min && v < d.Max); });
    default: throw new Error('positions: ' + node.Type);
  }
}
const posCache = new Map();
let idc = 0;
function nearest(node, x, z, maxD) {
  if (!node.__id) Object.defineProperty(node, '__id', { value: ++idc, enumerable: false });
  const T = 512, tx = Math.floor(x / T), tz = Math.floor(z / T), key = node.__id + ':' + tx + ':' + tz;
  let list = posCache.get(key);
  if (!list) { list = positions(node, tx * T - maxD, tz * T - maxD, (tx + 1) * T + maxD, (tz + 1) * T + maxD); posCache.set(key, list); }
  let best = null, bd = Infinity; for (const p of list) { const d = (p[0] - x) ** 2 + (p[1] - z) ** 2; if (d < bd) { bd = d; best = p; } }
  bd = Math.sqrt(bd); return bd <= maxD ? { p: best, d: bd } : { p: null, d: 1e154 };
}
const memo = new WeakMap();
const cached = (n, key, make) => { let m = memo.get(n); if (!m) memo.set(n, m = {}); return m[key] || (m[key] = make()); };

function evalNode(n, c) {
  if (n.Skip) throw new Error('Skip not modelled');
  const I = n.Inputs || [];
  const in0 = () => evalNode(I[0], c);
  switch (n.Type) {
    case 'Constant': return n.Value;
    case 'Sum': { let s = 0; for (const i of I) s += evalNode(i, c); return s; }
    case 'Multiplier': { let s = 1; for (const i of I) s *= evalNode(i, c); return s; }
    case 'Max': { let s = -Infinity; for (const i of I) s = Math.max(s, evalNode(i, c)); return s; }
    case 'Min': { let s = Infinity; for (const i of I) s = Math.min(s, evalNode(i, c)); return s; }
    case 'Clamp': { const a = Math.min(n.WallA, n.WallB), b = Math.max(n.WallA, n.WallB); return Math.max(a, Math.min(b, in0())); }
    case 'Abs': return Math.abs(in0());
    case 'Inverter': return -in0();
    case 'Normalizer': return n.ToMin + (in0() - n.FromMin) * (n.ToMax - n.ToMin) / (n.FromMax - n.FromMin);
    case 'CurveMapper': return cached(n, 'f', () => curveFn(n.Curve))(in0());
    case 'SimplexNoise2D': return fbm(cached(n, 's', () => ({ v: hashStr(n.Seed) })).v, c.x / n.Scale, c.z / n.Scale, n.Octaves, n.Lacunarity, n.Persistence);
    case 'YOverride': return evalNode(I[0], Object.assign({}, c, { y: n.Value }));
    case 'Cache': case 'Exported': return in0();
    case 'Distance': return cached(n, 'f', () => curveFn(n.Curve))(Math.hypot(c.x, c.y, c.z));
    case 'XValue': return c.x;
    case 'ZValue': return c.z;
    case 'YValue': return c.y;
    case 'Anchor': { if (!c.anchor) return in0(); return evalNode(I[0], Object.assign({}, c, { x: c.x - c.anchor[0], z: c.z - c.anchor[1] })); }
    case 'Rotator': { const a = -n.SpinAngle * Math.PI / 180, cs = Math.cos(a), sn = Math.sin(a); return evalNode(I[0], Object.assign({}, c, { x: c.x * cs - c.z * sn, z: c.x * sn + c.z * cs })); }
    case 'Ellipsoid': { const a = -n.Spin * Math.PI / 180, cs = Math.cos(a), sn = Math.sin(a), x = (c.x * cs - c.z * sn) / n.Scale.X, z = (c.x * sn + c.z * cs) / n.Scale.Z, y = c.y / n.Scale.Y; return cached(n, 'f', () => curveFn(n.Curve))(Math.hypot(x, y, z)); }
    case 'WhiteNoise': return rnd01(cached(n, 's', () => ({ v: hashStr(n.Seed) })).v, Math.round(c.x * 16), Math.round(c.z * 16)) * 2 - 1;
    case 'PositionsCellNoise': {
      const r = nearest(n.Positions, c.x, c.z, n.MaxDistance), rt = n.ReturnType;
      if (rt.Type === 'Curve') return cached(rt, 'f', () => curveFn(rt.Curve))(r.d);
      if (rt.Type === 'Distance') return r.d;
      if (rt.Type === 'CellValue') { if (!r.p) return rt.DefaultValue; return evalNode(rt.Density, { x: r.p[0], y: 0, z: r.p[1] }); }
      if (rt.Type === 'Density') { if (!r.p) return rt.DefaultValue; const v = evalNode(rt.ChoiceDensity, { x: r.p[0], y: 0, z: r.p[1] });
        for (const d of rt.Delimiters) if (v >= d.From && v < d.To) return evalNode(d.Density, Object.assign({}, c, { anchor: r.p })); return rt.DefaultValue; }
      throw new Error('ReturnType ' + rt.Type); }
    default: throw new Error('eval: ' + n.Type);
  }
}

function writePng(file, w, h, rgb) {
  const raw = Buffer.alloc((w * 3 + 1) * h); for (let y = 0; y < h; y++) { raw[y * (w * 3 + 1)] = 0; rgb.copy(raw, y * (w * 3 + 1) + 1, y * w * 3, (y + 1) * w * 3); }
  const crcT = []; for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; crcT[n] = c >>> 0; }
  const crc = b => { let c = 0xffffffff; for (const x of b) c = crcT[(c ^ x) & 255] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
  const chunk = (t, d) => { const l = Buffer.alloc(4); l.writeUInt32BE(d.length); const td = Buffer.concat([Buffer.from(t), d]); const cr = Buffer.alloc(4); cr.writeUInt32BE(crc(td)); return Buffer.concat([l, td, cr]); };
  const ih = Buffer.alloc(13); ih.writeUInt32BE(w, 0); ih.writeUInt32BE(h, 4); ih[8] = 8; ih[9] = 2;
  fs.writeFileSync(file, Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ih), chunk('IDAT', zlib.deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]));
}
module.exports = { evalNode, positions, writePng, hashStr };
