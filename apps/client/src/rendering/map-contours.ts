/** Closed, interpolated height contours for the cached vector minimap. */
export function heightContours(heights: ArrayLike<number>, points: number, span: number, level: number): number[][][] {
  const step = span / (points - 1), padded = points + 2;
  const nodes = new Map<string, { point: number[]; edges: string[] }>();
  const height = (x: number, y: number) => x < 1 || y < 1 || x > points || y > points
    ? Math.min(-1000, level - 1) : heights[(x - 1) * points + points - y]!;
  const edgePoint = (a: number[], b: number[]): number[] => {
    const t = (level - a[2]!) / (b[2]! - a[2]!);
    return [a[0]! + (b[0]! - a[0]!) * t, a[1]! + (b[1]! - a[1]!) * t];
  };
  const key = (p: number[]) => `${p[0]!.toFixed(4)},${p[1]!.toFixed(4)}`;
  const connect = (a: number[], b: number[]) => {
    const ka = key(a), kb = key(b); if (ka === kb) return;
    if (!nodes.has(ka)) nodes.set(ka, { point: a, edges: [] });
    if (!nodes.has(kb)) nodes.set(kb, { point: b, edges: [] });
    nodes.get(ka)!.edges.push(kb); nodes.get(kb)!.edges.push(ka);
  };
  for (let y = 0; y < padded - 1; y++) for (let x = 0; x < padded - 1; x++) {
    const a = [(x - 1) * step, (y - 1) * step, height(x, y)];
    const b = [x * step, (y - 1) * step, height(x + 1, y)];
    const c = [x * step, y * step, height(x + 1, y + 1)];
    const d = [(x - 1) * step, y * step, height(x, y + 1)];
    // A fixed diagonal resolves saddle cells without disconnected corners.
    for (const triangle of [[a, b, c], [a, c, d]]) {
      const cuts: number[][] = [];
      for (let edge = 0; edge < 3; edge++) {
        const from = triangle[edge]!, to = triangle[(edge + 1) % 3]!;
        if ((from[2]! >= level) !== (to[2]! >= level)) cuts.push(edgePoint(from, to));
      }
      if (cuts.length === 2) connect(cuts[0]!, cuts[1]!);
    }
  }
  const rings: number[][][] = [];
  const used = new Set<string>();
  for (const [start, node] of nodes) for (const neighbor of node.edges) {
    const edgeKey = (a: string, b: string) => a < b ? `${a}/${b}` : `${b}/${a}`;
    if (used.has(edgeKey(start, neighbor))) continue;
    const ring = [node.point]; let previous = start, current = neighbor;
    for (let guard = 0; guard <= nodes.size; guard++) {
      used.add(edgeKey(previous, current));
      if (current === start) { if (ring.length > 2) rings.push(ring); break; }
      const at = nodes.get(current)!; ring.push(at.point);
      const next = at.edges.find(n => !used.has(edgeKey(current, n)));
      if (next === undefined) break;
      previous = current; current = next;
    }
  }
  return rings;
}

/** Round the sub-cell contour corners, retaining holes with even-odd fill. */
export function contourPath(rings: readonly (readonly (readonly number[])[])[]): string {
  const number = (v: number) => v.toFixed(2);
  return rings.map(ring => {
    const last = ring[ring.length - 1]!, first = ring[0]!;
    let path = `M${number((last[0]! + first[0]!) / 2)},${number((last[1]! + first[1]!) / 2)}`;
    for (let i = 0; i < ring.length; i++) {
      const a = ring[i]!, b = ring[(i + 1) % ring.length]!;
      path += `Q${number(a[0]!)},${number(a[1]!)} ${number((a[0]! + b[0]!) / 2)},${number((a[1]! + b[1]!) / 2)}`;
    }
    return path + 'Z';
  }).join('');
}
