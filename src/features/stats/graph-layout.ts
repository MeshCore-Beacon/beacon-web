// The big mesh's force layout, run in graph-layout.worker.ts so it never blocks the page. A port of
// ECharts' own force step (echarts/lib/chart/graph/forceHelper.js) onto flat arrays: the same forces,
// order and cooling, so the mesh settles as the in-chart layout did. The start is seeded, so the same
// mesh always lands the same way. Kept free of imports so the worker bundle stays tiny.

export interface ForceLayoutInput {
  count: number; // nodes
  source: Int32Array; // edge i joins nodes source[i] and target[i]
  target: Int32Array;
  repulsion: number;
  edgeLength: number;
  gravity: number;
  friction: number; // starting value; cools by 0.992 a step and stops below 0.01, as in ECharts
  rect: { x: number; y: number; width: number; height: number }; // random start box; gravity pulls to its centre
  seed: number;
}

// mulberry32: small, fast and good enough to scatter the start positions
export function seededRandom(seed: number): () => number {
  let a = seed | 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Returns positions as [x0, y0, x1, y1, ...].
export function forceLayout({ count: n, source, target, repulsion, edgeLength, gravity, friction: startFriction, rect, seed }: ForceLayoutInput): Float64Array {
  const random = seededRandom(seed);
  const cx = rect.x + rect.width / 2;
  const cy = rect.y + rect.height / 2;
  // p = position, q = previous position (ECharts' n.p / n.pp)
  const px = new Float64Array(n), py = new Float64Array(n), qx = new Float64Array(n), qy = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    px[i] = rect.width * (random() - 0.5) + cx;
    py[i] = rect.height * (random() - 0.5) + cy;
    qx[i] = px[i]!;
    qy[i] = py[i]!;
  }
  // every node has the same repulsion and edge, so ECharts' per-edge weight is always one half
  const pairRepulsion = repulsion + repulsion;
  let friction = startFriction;
  for (;;) {
    // edges pull (or push) their ends toward edgeLength
    for (let e = 0; e < source.length; e++) {
      const a = source[e]!, b = target[e]!;
      let vx = px[b]! - px[a]!, vy = py[b]! - py[a]!;
      const len = Math.sqrt(vx * vx + vy * vy);
      const d = len - edgeLength;
      if (len === 0) {
        vx = 0;
        vy = 0;
      } else {
        vx = vx / len;
        vy = vy / len;
      }
      const sa = 0.5 * d * friction;
      px[a] = px[a]! + vx * sa;
      py[a] = py[a]! + vy * sa;
      const sb = -0.5 * d * friction;
      px[b] = px[b]! + vx * sb;
      py[b] = py[b]! + vy * sb;
    }
    const g = gravity * friction;
    for (let i = 0; i < n; i++) {
      px[i] = px[i]! + (cx - px[i]!) * g;
      py[i] = py[i]! + (cy - py[i]!) * g;
    }
    // every pair repels; applied to the previous position, so it lands as velocity below
    for (let i = 0; i < n; i++) {
      const x = px[i]!, y = py[i]!;
      let ax = qx[i]!, ay = qy[i]!;
      for (let j = i + 1; j < n; j++) {
        let vx = px[j]! - x, vy = py[j]! - y;
        let d = Math.sqrt(vx * vx + vy * vy);
        if (d === 0) {
          vx = random() - 0.5;
          vy = random() - 0.5;
          d = 1;
        }
        const r = pairRepulsion / d / d;
        ax = ax + vx * r;
        ay = ay + vy * r;
        qx[j] = qx[j]! + vx * -r;
        qy[j] = qy[j]! + vy * -r;
      }
      qx[i] = ax;
      qy[i] = ay;
    }
    for (let i = 0; i < n; i++) {
      px[i] = px[i]! + (px[i]! - qx[i]!) * friction;
      py[i] = py[i]! + (py[i]! - qy[i]!) * friction;
      qx[i] = px[i]!;
      qy[i] = py[i]!;
    }
    friction = friction * 0.992;
    if (friction < 0.01) break;
  }
  const xy = new Float64Array(2 * n);
  for (let i = 0; i < n; i++) {
    xy[2 * i] = px[i]!;
    xy[2 * i + 1] = py[i]!;
  }
  return xy;
}
