import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createWorld, step, feed, analyze, render, renderSVG } from '../src/index.js';
const cli = args => spawnSync(process.execPath, ['src/cli.js', ...args], { encoding: 'utf8' });
test('seeds reproduce, incremental updates agree, and feeding is deterministic', () => {
  const a = createWorld(), b = createWorld(); step(a, 80); for (let i = 0; i < 80; i++) step(b); assert.deepEqual(a, b);
  feed(a); feed(b); step(a, 50); step(b, 50); assert.deepEqual(a, b); assert.notDeepEqual(a.food, step(createWorld({ seed: 12 }), 130).food);
});
test('food is conserved through collection, delivery, and repeated feeding', () => {
  for (const options of [{}, { seed: 0, width: 24, height: 16, ants: 500 }, { seed: 0xffffffff, width: 25, height: 17, ants: 10 }]) {
    const w = createWorld(options);
    for (let batch = 0; batch < 15; batch++) {
      if (batch === 5 || batch === 10) feed(w); step(w, 30); const r = analyze(w);
      assert.equal(r.foodRemaining + r.carrying + r.delivered, r.supplied);
      for (const a of w.ants) assert.ok(a.x >= 0 && a.x < w.width && a.y >= 0 && a.y < w.height);
      assert.ok(w.pheromone.every(n => Number.isFinite(n) && n >= 0 && n <= 30));
    }
    assert.ok(w.delivered > 0);
  }
});
test('default colony delivers its food and exhausted trails decay', () => {
  const w = createWorld(); step(w, 500); const report = analyze(w); assert.equal(report.delivered, report.supplied); assert.equal(report.carrying, 0); assert.equal(report.foodRemaining, 0);
  const trail = w.pheromone.slice(); step(w, 20); for (let i = 0; i < trail.length; i++) assert.ok(Math.abs(w.pheromone[i] - trail[i] * 0.985 ** 20) < 1e-10);
  const supplied = w.supplied; feed(w); assert.equal(w.supplied, supplied + 156); assert.equal(analyze(w).foodRemaining, 156);
});
test('validation, no-op steps, dimensions, and display toggles', () => {
  for (const o of [{ seed: -1 }, { seed: 1.5 }, { width: 0 }, { height: 100 }, { ants: 0 }, { ants: 501 }]) assert.throws(() => createWorld(o));
  const w = createWorld(); const before = structuredClone(w); step(w, 0); assert.deepEqual(w, before); for (const n of [-1, 0.1, 10001]) assert.throws(() => step(w, n));
  step(w, 100); const rows = render(w).split('\n'); assert.equal(rows.length, w.height); assert.ok(rows.every(r => r.length === w.width)); assert.ok(!render(w).includes('\x1b')); assert.notEqual(render(w), render(w, { trails: false })); assert.match(renderSVG(w), /^<svg/); assert.match(render(w, { color: true }), /\x1b\[/);
});
test('CLI arguments, piped output, and file exports', () => {
  const r = cli(['--steps', '20', '--ants', '50', '--json']); assert.equal(r.status, 0, r.stderr); assert.equal(JSON.parse(r.stdout).frame, 20); assert.equal(JSON.parse(r.stdout).ants, 50);
  const plain = cli(['--steps', '0']); assert.equal(plain.status, 0); assert.ok(!plain.stdout.includes('\x1b')); assert.equal(cli(['--help']).status, 0);
  for (const args of [['--seed'], ['--ants', '0'], ['--height', '2'], ['--seed', '-1'], ['--frames', '1', '--json'], ['--wat']]) assert.equal(cli(args).status, 2);
  const dir = mkdtempSync(join(tmpdir(), 'ants-')); try { const file = join(dir, 'out.svg'); const r = cli(['--steps', '0', '--svg', file, '--json']); assert.equal(r.status, 0, r.stderr); assert.equal(JSON.parse(r.stdout).frame, 0); assert.match(readFileSync(file, 'utf8'), /ANT COLONY/); assert.equal(cli(['--steps', '0', '--svg', join(dir, 'missing', 'out.svg')]).status, 2); } finally { rmSync(dir, { recursive: true, force: true }); }
});
