import assert from 'node:assert/strict';
import test from 'node:test';
import { createDeskProjection } from '../src/desk-projection.js';

const corners = [[0, 0], [1, 0], [1, 1], [0, 1]];

function assertRoundTrip(forward) {
  const width = 640;
  const height = 240;
  const project = createDeskProjection(corners.map(([u, v]) => forward(u, v)), width, height);
  assert.ok(project);

  for (const [u, v] of [...corners, [0.43, 0.71], [0.9, 0.14], [-0.1, 1.12]]) {
    const screen = forward(u, v);
    const local = project(screen.x, screen.y);
    assert.ok(Math.abs(local.x - u * width) < 1e-7);
    assert.ok(Math.abs(local.y - v * height) < 1e-7);
  }
}

test('inverts a perspective-tilted desk including a pointer just outside its borders', () => {
  assertRoundTrip((u, v) => {
    const depth = 1 - 0.16 * u + 0.23 * v;
    return { x: (89 + 440 * u + 65 * v) / depth, y: (230 - 42 * u + 138 * v) / depth };
  });
});

test('inverts a stage rotated ninety degrees without swapping local axes', () => {
  assertRoundTrip((u, v) => ({ x: 682 - 156 * v, y: 24 + 416 * u }));
});

test('returns no projection for missing or collapsed desk corners', () => {
  assert.equal(createDeskProjection(null, 640, 240), null);
  assert.equal(createDeskProjection(corners.map(([u]) => ({ x: u * 100, y: 40 })), 640, 240), null);
});
