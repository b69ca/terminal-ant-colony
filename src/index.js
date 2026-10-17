const directions = [[1, 0], [0, 1], [-1, 0], [0, -1]];
function random(world) { world.randomState = (Math.imul(world.randomState, 1664525) + 1013904223) >>> 0; return world.randomState / 4294967296; }
export function createWorld({ seed = 42, width = 80, height = 36, ants = 140 } = {}) {
  if (!Number.isInteger(seed) || seed < 0 || seed > 0xffffffff) throw new Error('seed must be unsigned 32-bit');
  if (!Number.isInteger(width) || width < 24 || width > 120 || !Number.isInteger(height) || height < 16 || height > 60) throw new Error('width must be 24–120 and height 16–60');
  if (!Number.isInteger(ants) || ants < 10 || ants > 500) throw new Error('ants must be 10–500');
  const nest = { x: Math.floor(width / 2), y: Math.floor(height / 2) };
  const world = { seed, randomState: seed, width, height, nest, frame: 0, delivered: 0, supplied: 0, food: new Uint32Array(width * height), pheromone: new Float64Array(width * height), patches: [], ants: [] };
  // Place one patch in each quadrant, outside the central nest area.
  for (const [sx, sy] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
    const x = Math.round(nest.x + sx * width * (0.22 + random(world) * 0.1)), y = Math.round(nest.y + sy * height * (0.22 + random(world) * 0.1));
    for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) if (dx * dx + dy * dy <= 4) world.patches.push((y + dy) * width + x + dx);
  }
  world.patches = [...new Set(world.patches)]; feed(world);
  world.ants = Array.from({ length: ants }, () => ({ ...nest, heading: Math.floor(random(world) * 4), carrying: false }));
  return world;
}
export function feed(world) {
  for (const i of world.patches) if (world.food[i] > 0xffffffff - 3) throw new Error('food capacity exceeded');
  for (const i of world.patches) world.food[i] += 3;
  world.supplied += world.patches.length * 3; return world;
}
export function step(world, count = 1) {
  if (!Number.isInteger(count) || count < 0 || count > 10000) throw new Error('step count must be 0–10000');
  const { width: w, height: h, nest } = world;
  for (let tick = 0; tick < count; tick++) {
    for (let i = 0; i < world.pheromone.length; i++) world.pheromone[i] *= 0.985;
    for (const ant of world.ants) {
      let heading;
      if (ant.carrying) {
        const i = ant.y * w + ant.x; world.pheromone[i] = Math.min(30, world.pheromone[i] + 1);
        const choices = []; if (ant.x !== nest.x) choices.push(ant.x < nest.x ? 0 : 2); if (ant.y !== nest.y) choices.push(ant.y < nest.y ? 1 : 3);
        heading = choices.length ? choices[Math.floor(random(world) * choices.length)] : ant.heading;
      } else {
        let target = null, nearest = 7;
        for (const i of world.patches) if (world.food[i]) { const x = i % w, y = Math.floor(i / w), distance = Math.abs(x - ant.x) + Math.abs(y - ant.y); if (distance < nearest) { nearest = distance; target = { x, y }; } }
        const weights = directions.map(([dx, dy], d) => {
          const x = ant.x + dx, y = ant.y + dy;
          if (x < 0 || y < 0 || x >= w || y >= h) return 0;
          const towardFood = target && Math.abs(target.x - x) + Math.abs(target.y - y) < nearest;
          return (d === ant.heading ? 3 : d === (ant.heading + 2) % 4 ? 0.2 : 1) * (1 + Math.sqrt(world.pheromone[y * w + x]) * 2) * (towardFood ? 12 : 1);
        });
        let pick = random(world) * weights.reduce((a, b) => a + b, 0); heading = weights.findIndex(weight => { pick -= weight; return weight > 0 && pick < 0; });
        if (heading < 0) heading = weights.findLastIndex(weight => weight > 0);
      }
      const [dx, dy] = directions[heading]; ant.x += dx; ant.y += dy; ant.heading = heading;
      const i = ant.y * w + ant.x;
      if (ant.carrying && ant.x === nest.x && ant.y === nest.y) { ant.carrying = false; world.delivered++; ant.heading = Math.floor(random(world) * 4); }
      else if (!ant.carrying && world.food[i]) { world.food[i]--; ant.carrying = true; ant.heading = (heading + 2) % 4; }
    }
    world.frame++;
  }
  return world;
}
export function analyze(world) {
  let foodRemaining = 0, trailCells = 0, maxPheromone = 0;
  for (let i = 0; i < world.food.length; i++) { foodRemaining += world.food[i]; if (world.pheromone[i] > 0.1) trailCells++; maxPheromone = Math.max(maxPheromone, world.pheromone[i]); }
  return { seed: world.seed, width: world.width, height: world.height, frame: world.frame, ants: world.ants.length, supplied: world.supplied, foodRemaining, carrying: world.ants.filter(a => a.carrying).length, delivered: world.delivered, trailCells, maxPheromone };
}
export function render(world, { color = false, trails = true } = {}) {
  const { width: w, height: h } = world, rows = Array.from({ length: h }, () => Array(w).fill(' '));
  const glyph = (ch, code) => color ? `\x1b[${code}m${ch}\x1b[0m` : ch;
  if (trails) world.pheromone.forEach((v, i) => { if (v > 0.1) rows[Math.floor(i / w)][i % w] = glyph(v > 3 ? ':' : '.', 33); });
  world.food.forEach((v, i) => { if (v) rows[Math.floor(i / w)][i % w] = glyph('F', 32); });
  for (const ant of world.ants) rows[ant.y][ant.x] = glyph(ant.carrying ? '@' : 'a', ant.carrying ? 93 : 36);
  rows[world.nest.y][world.nest.x] = glyph('N', 97); return rows.map(row => row.join('')).join('\n');
}
export function renderSVG(world) {
  const { width: w, height: h } = world, vw = w * 9 + 64, vh = h * 10 + 122; let marks = '';
  world.pheromone.forEach((v, i) => { if (v > 0.1) marks += `<rect x="${32 + i % w * 9}" y="${86 + Math.floor(i / w) * 10}" width="9" height="10" rx="3" fill="#dfa54d" opacity="${Math.min(0.8, v / 12).toFixed(3)}"/>`; });
  world.food.forEach((v, i) => { if (v) marks += `<rect x="${33 + i % w * 9}" y="${87 + Math.floor(i / w) * 10}" width="7" height="8" rx="2" fill="#69d19d"/>`; });
  for (const ant of world.ants) marks += `<ellipse cx="${36.5 + ant.x * 9}" cy="${91 + ant.y * 10}" rx="2.4" ry="1.3" transform="rotate(${ant.heading * 90} ${36.5 + ant.x * 9} ${91 + ant.y * 10})" fill="${ant.carrying ? '#ffe29a' : '#70bfe6'}"/>`;
  const report = analyze(world);
  return `<svg xmlns="http://www.w3.org/2000/svg" width="800" height="${Math.round(vh * 800 / vw)}" viewBox="0 0 ${vw} ${vh}"><rect width="${vw}" height="${vh}" rx="18" fill="#0d1525"/><g font-family="monospace"><text x="32" y="36" font-size="24" fill="#eff5ff">TERMINAL ANT COLONY</text><text x="32" y="64" fill="#93a4bc">seed ${world.seed} / ${world.ants.length} ants / frame ${world.frame} / delivered ${world.delivered}</text>${marks}<circle cx="${36.5 + world.nest.x * 9}" cy="${91 + world.nest.y * 10}" r="7" fill="#eff5ff"/><text x="32" y="${vh - 12}" font-size="12" fill="#93a4bc">${report.foodRemaining} food remaining / gold trails / blue explorers / f feed t trails p pause q quit</text></g></svg>\n`;
}
