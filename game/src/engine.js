// Core simulation for The Velvet Hour: movement, guard patrols, vision cones,
// line of sight, suspicion, coins, loot and the exit. No DOM here — the game
// is pure state so the headless self-test can drive it without a browser.

import { LEVELS, TILE, COLS, ROWS } from './levels.js';

export const BLOCKS_MOVE = new Set(['#', 'C', 'S', 'D']);
export const BLOCKS_SIGHT = new Set(['#', 'C', 'S', 'D']);

export function tileAt(grid, x, y) {
  if (x < 0 || y < 0 || x >= COLS || y >= ROWS) return '#';
  return grid[y][x];
}

export function isWalkable(grid, x, y) {
  return !BLOCKS_MOVE.has(tileAt(grid, x, y));
}

// True when nothing vision-blocking stands between the two points.
export function hasLineOfSight(grid, ax, ay, bx, by) {
  const dx = bx - ax;
  const dy = by - ay;
  const dist = Math.hypot(dx, dy);
  const steps = Math.max(1, Math.ceil(dist / 6));
  for (let i = 1; i < steps; i++) {
    const t = i / steps;
    const tx = Math.floor((ax + dx * t) / TILE);
    const ty = Math.floor((ay + dy * t) / TILE);
    if (BLOCKS_SIGHT.has(tileAt(grid, tx, ty))) return false;
  }
  return true;
}

// Can the player at (px,py) be seen by a guard? Sneaking and shadow both help.
export function guardSeesPlayer(grid, guard, px, py, sneaking) {
  const dx = px - guard.x;
  const dy = py - guard.y;
  const dist = Math.hypot(dx, dy);
  if (dist > guard.range) return 0;
  const ang = Math.atan2(dy, dx);
  let diff = Math.abs(ang - guard.angle);
  if (diff > Math.PI) diff = Math.PI * 2 - diff;
  if (diff > guard.fov / 2) return 0;
  if (!hasLineOfSight(grid, guard.x, guard.y, px, py)) return 0;
  const tile = tileAt(grid, Math.floor(px / TILE), Math.floor(py / TILE));
  let strength = 1 - dist / guard.range; // 1 up close, 0 at the edge
  strength = 0.35 + 0.65 * strength;
  if (tile === ',') strength *= 0.45; // shadow floor hides you
  if (sneaking) strength *= 0.55;
  return strength;
}

export function buildLevel(index) {
  const def = LEVELS[index];
  const grid = def.map.map((row) => row.split(''));
  let player = { x: 0, y: 0 };
  const loot = [];
  let exit = { x: 0, y: 0 };
  for (let y = 0; y < ROWS; y++) {
    for (let x = 0; x < COLS; x++) {
      const ch = grid[y][x];
      if (ch === 'P') player = { x: x * TILE + TILE / 2, y: y * TILE + TILE / 2 };
      if (ch === 'L') loot.push({ x: x * TILE + TILE / 2, y: y * TILE + TILE / 2, taken: false });
      if (ch === 'E') exit = { x: x * TILE + TILE / 2, y: y * TILE + TILE / 2 };
    }
  }
  const guards = def.guards.map((g) => ({
    x: g.start[0] * TILE + TILE / 2,
    y: g.start[1] * TILE + TILE / 2,
    path: g.path.map(([wx, wy]) => ({ x: wx * TILE + TILE / 2, y: wy * TILE + TILE / 2 })),
    wp: 1,
    speed: g.speed,
    range: g.range,
    fov: (g.fov * Math.PI) / 180,
    angle: 0,
    state: 'patrol', // patrol | suspicious | chase | investigate
    suspicion: 0,
    loseTimer: 0,
    investigate: null,
    pause: 0,
  }));
  // Face each guard along its first patrol leg.
  for (const g of guards) {
    const t = g.path[g.wp % g.path.length];
    g.angle = Math.atan2(t.y - g.y, t.x - g.x);
  }
  return {
    index,
    def,
    grid,
    player: { ...player, r: 13, vx: 0, vy: 0, sneaking: false, face: 0 },
    guards,
    loot,
    exit,
    coins: def.coins,
    coin: null, // a thrown coin in flight / ringing on the floor
    time: 0,
    score: 0,
    caught: false,
    cleared: false,
  };
}

function moveCircle(grid, e, dx, dy) {
  // Axis-separated so the player slides along walls instead of sticking.
  const r = e.r ?? 13;
  let nx = e.x + dx;
  if (!circleHitsWall(grid, nx, e.y, r)) e.x = nx;
  let ny = e.y + dy;
  if (!circleHitsWall(grid, e.x, ny, r)) e.y = ny;
}

function circleHitsWall(grid, cx, cy, r) {
  const x0 = Math.floor((cx - r) / TILE);
  const x1 = Math.floor((cx + r) / TILE);
  const y0 = Math.floor((cy - r) / TILE);
  const y1 = Math.floor((cy + r) / TILE);
  for (let ty = y0; ty <= y1; ty++) {
    for (let tx = x0; tx <= x1; tx++) {
      if (!BLOCKS_MOVE.has(tileAt(grid, tx, ty))) continue;
      const bx = Math.max(tx * TILE, Math.min(cx, tx * TILE + TILE));
      const by = Math.max(ty * TILE, Math.min(cy, ty * TILE + TILE));
      if ((cx - bx) ** 2 + (cy - by) ** 2 < r * r) return true;
    }
  }
  return false;
}

export function stepLevel(level, input, dt) {
  const p = level.player;
  level.time += dt;

  // --- player ---
  let mx = (input.right ? 1 : 0) - (input.left ? 1 : 0);
  let my = (input.down ? 1 : 0) - (input.up ? 1 : 0);
  if (input.target) {
    const dx = input.target.x - p.x;
    const dy = input.target.y - p.y;
    const d = Math.hypot(dx, dy);
    if (d > 8) {
      mx = dx / d;
      my = dy / d;
    } else {
      input.target = null;
    }
  }
  const len = Math.hypot(mx, my);
  if (len > 0) {
    mx /= len;
    my /= len;
  }
  p.sneaking = !!input.sneak;
  const speed = p.sneaking ? 96 : 172;
  moveCircle(level.grid, p, mx * speed * dt, my * speed * dt);
  if (len > 0) p.face = Math.atan2(my, mx);

  // --- thrown coin ---
  if (input.toss && level.coins > 0 && !level.coin) {
    level.coins -= 1;
    const tx = input.toss.x;
    const ty = input.toss.y;
    level.coin = { x: tx, y: ty, ring: 4, heard: false };
  }
  if (level.coin) {
    level.coin.ring -= dt;
    if (level.coin.ring <= 0) level.coin = null;
  }

  // --- guards ---
  let maxSuspicion = 0;
  for (const g of level.guards) {
    const seen = guardSeesPlayer(level.grid, g, p.x, p.y, p.sneaking);
    if (seen > 0) {
      g.suspicion = Math.min(1, g.suspicion + seen * dt * 1.15);
      g.loseTimer = 0;
    } else {
      g.suspicion = Math.max(0, g.suspicion - dt * 0.45);
      if (g.state === 'chase') g.loseTimer += dt;
    }
    if (g.suspicion >= 1 && g.state !== 'chase') {
      g.state = 'chase';
      g.loseTimer = 0;
    }
    if (g.state === 'chase' && g.loseTimer > 3) {
      g.state = 'patrol';
      g.suspicion = 0.35;
    }
    // A ringing coin pulls nearby guards to investigate.
    if (level.coin && !level.coin.heard) {
      const d = Math.hypot(level.coin.x - g.x, level.coin.y - g.y);
      if (d < 280 && g.state !== 'chase') {
        g.state = 'investigate';
        g.investigate = { x: level.coin.x, y: level.coin.y, wait: 0 };
        g.suspicion = Math.max(g.suspicion, 0.4);
      }
    }
    if (level.coin) level.coin.heard = true;

    // Movement by state.
    if (g.state === 'chase') {
      const dx = p.x - g.x;
      const dy = p.y - g.y;
      const d = Math.hypot(dx, dy);
      if (d > 1) {
        const sp = 152;
        moveCircle(level.grid, g, (dx / d) * sp * dt, (dy / d) * sp * dt);
        g.angle = Math.atan2(dy, dx);
      }
      if (d < 30) level.caught = true;
    } else if (g.state === 'investigate' && g.investigate) {
      const t = g.investigate;
      const dx = t.x - g.x;
      const dy = t.y - g.y;
      const d = Math.hypot(dx, dy);
      if (d > 10) {
        moveCircle(level.grid, g, (dx / d) * g.speed * 1.15 * dt, (dy / d) * g.speed * 1.15 * dt);
        g.angle = Math.atan2(dy, dx);
      } else {
        t.wait += dt;
        g.angle += dt * 1.4; // look around
        if (t.wait > 3.5) {
          g.state = 'patrol';
          g.investigate = null;
        }
      }
    } else {
      g.state = 'patrol';
      const target = g.path[g.wp % g.path.length];
      const dx = target.x - g.x;
      const dy = target.y - g.y;
      const d = Math.hypot(dx, dy);
      if (d < 6) {
        g.wp = (g.wp + 1) % g.path.length;
        g.pause = 0.7;
      } else if (g.pause > 0) {
        g.pause -= dt;
      } else {
        moveCircle(level.grid, g, (dx / d) * g.speed * dt, (dy / d) * g.speed * dt);
        g.angle = Math.atan2(dy, dx);
      }
    }
    if (g.suspicion > maxSuspicion) maxSuspicion = g.suspicion;
  }
  level.alert = maxSuspicion;

  // --- loot ---
  for (const item of level.loot) {
    if (!item.taken && Math.hypot(item.x - p.x, item.y - p.y) < 26) {
      item.taken = true;
      level.score += 500;
    }
  }

  // --- exit ---
  const allTaken = level.loot.every((item) => item.taken);
  level.exitOpen = allTaken;
  if (allTaken && Math.hypot(level.exit.x - p.x, level.exit.y - p.y) < 30) {
    level.cleared = true;
    const bonus = Math.max(0, Math.round((level.def.par - level.time) * 10));
    level.score += bonus;
  }
}
