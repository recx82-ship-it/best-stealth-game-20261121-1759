// Bootstrap for The Velvet Hour: input, the game loop, shot staging for
// screenshots, and a headless self-test (?selftest=1) that exercises the
// simulation and reports the result in the page title and a #selftest node.

import { LEVELS, TILE, COLS, ROWS } from './levels.js';
import { buildLevel, stepLevel } from './engine.js';
import { draw } from './render.js';
import { ensureAudio, setMuted, isMuted, sfx } from './audio.js';

const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');
canvas.width = COLS * TILE;
canvas.height = ROWS * TILE;

const params = new URLSearchParams(location.search);
const seed = Number(params.get('seed') || '1');

// Deterministic tiny RNG (mulberry32) for shot staging.
function rngFrom(n) {
  let a = n >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const game = {
  state: 'title', // title | playing | paused | caught | levelclear | win
  levelIndex: 0,
  level: buildLevel(0),
  totalScore: 0,
  totalTime: 0,
};

const input = { left: false, right: false, up: false, down: false, sneak: false, target: null, toss: null };

// ---- error reporting: headless runs read the title ----
window.addEventListener('error', (event) => {
  document.title = `ERROR: ${event.message}`;
});
window.addEventListener('unhandledrejection', (event) => {
  document.title = `ERROR: ${event.reason}`;
});

function startLevel(index) {
  game.levelIndex = index;
  game.level = buildLevel(index);
  game.state = 'playing';
  input.target = null;
  input.toss = null;
  window.__velvetTarget = null;
}

function nextLevel() {
  game.totalScore += game.level.score;
  game.totalTime += game.level.time;
  if (game.levelIndex + 1 >= LEVELS.length) {
    game.state = 'win';
  } else {
    startLevel(game.levelIndex + 1);
  }
}

function beginGame() {
  game.totalScore = 0;
  game.totalTime = 0;
  startLevel(0);
}

// ---- keyboard ----
const KEYMAP = {
  ArrowLeft: 'left', KeyA: 'left',
  ArrowRight: 'right', KeyD: 'right',
  ArrowUp: 'up', KeyW: 'up',
  ArrowDown: 'down', KeyS: 'down',
  ShiftLeft: 'sneak', ShiftRight: 'sneak',
};

window.addEventListener('keydown', (event) => {
  const dir = KEYMAP[event.code];
  if (dir) {
    input[dir] = true;
    input.target = null;
    window.__velvetTarget = null;
    event.preventDefault();
  }
  if (event.code === 'Space') {
    if (game.state === 'playing' && game.level.coins > 0) {
      const rect = canvas.getBoundingClientRect();
      const mx = (window.__velvetMouse?.x ?? game.level.player.x) - rect.left;
      const my = (window.__velvetMouse?.y ?? game.level.player.y) - rect.top;
      const scale = canvas.width / rect.width;
      input.toss = { x: mx * scale, y: my * scale };
      sfx.coin();
    }
    event.preventDefault();
  }
  if (event.code === 'Enter') {
    ensureAudio();
    if (game.state === 'title') beginGame();
    else if (game.state === 'levelclear') nextLevel();
    else if (game.state === 'win') beginGame();
  }
  if (event.code === 'KeyR') {
    if (game.state === 'caught' || game.state === 'playing' || game.state === 'paused') {
      startLevel(game.levelIndex);
    }
  }
  if (event.code === 'KeyP') {
    if (game.state === 'playing') game.state = 'paused';
    else if (game.state === 'paused') game.state = 'playing';
  }
  if (event.code === 'KeyM') {
    setMuted(!isMuted());
  }
});

window.addEventListener('keyup', (event) => {
  const dir = KEYMAP[event.code];
  if (dir) input[dir] = false;
});

// ---- mouse: click to walk, right-click tosses a coin ----
function canvasPoint(event) {
  const rect = canvas.getBoundingClientRect();
  const scale = canvas.width / rect.width;
  return { x: (event.clientX - rect.left) * scale, y: (event.clientY - rect.top) * scale };
}

canvas.addEventListener('mousemove', (event) => {
  window.__velvetMouse = { x: event.clientX, y: event.clientY };
});

canvas.addEventListener('click', (event) => {
  ensureAudio();
  if (game.state === 'title') {
    beginGame();
    return;
  }
  if (game.state === 'levelclear') {
    nextLevel();
    return;
  }
  if (game.state === 'win') {
    beginGame();
    return;
  }
  if (game.state !== 'playing') return;
  const point = canvasPoint(event);
  input.target = point;
  window.__velvetTarget = point;
  sfx.click();
});

canvas.addEventListener('contextmenu', (event) => {
  event.preventDefault();
  if (game.state === 'playing' && game.level.coins > 0) {
    input.toss = canvasPoint(event);
    sfx.coin();
  }
});

// ---- touch: drag anywhere to steer, double-tap to sneak ----
let touchStart = null;
canvas.addEventListener('touchstart', (event) => {
  ensureAudio();
  const t = event.touches[0];
  touchStart = { x: t.clientX, y: t.clientY, time: performance.now() };
  event.preventDefault();
}, { passive: false });

canvas.addEventListener('touchmove', (event) => {
  if (!touchStart) return;
  const t = event.touches[0];
  const dx = t.clientX - touchStart.x;
  const dy = t.clientY - touchStart.y;
  input.left = dx < -18;
  input.right = dx > 18;
  input.up = dy < -18;
  input.down = dy > 18;
  input.target = null;
  event.preventDefault();
}, { passive: false });

canvas.addEventListener('touchend', (event) => {
  input.left = input.right = input.up = input.down = false;
  if (touchStart && performance.now() - touchStart.time < 220 && game.state === 'title') beginGame();
  touchStart = null;
  event.preventDefault();
}, { passive: false });

// ---- the loop ----
let last = performance.now();
let prevAlert = 0;
let prevTaken = 0;

function frame(now) {
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  if (game.state === 'playing') {
    const level = game.level;
    const toss = input.toss;
    input.toss = null;
    stepLevel(level, { ...input, toss }, dt);
    const taken = level.loot.filter((i) => i.taken).length;
    if (taken > prevTaken) sfx.pickup();
    prevTaken = taken;
    if ((level.alert || 0) > 0.6 && prevAlert <= 0.6) sfx.spotted();
    prevAlert = level.alert || 0;
    if (level.caught) {
      game.state = 'caught';
      sfx.caught();
    } else if (level.cleared) {
      game.state = 'levelclear';
      sfx.clear();
    }
  }
  draw(ctx, game, now);
  requestAnimationFrame(frame);
}

// ---- deterministic shot staging (?shot=start|play|end&seed=N) ----
function stageShot(kind) {
  const rand = rngFrom(seed * 7919 + 13);
  if (kind === 'start') {
    game.state = 'title';
    game.level = buildLevel(0);
    // A few seconds of patrol so the cones sit mid-room.
    for (let i = 0; i < 180; i++) stepLevel(game.level, { ...input, target: null }, 1 / 60);
    game.level.time = 0;
  } else if (kind === 'play') {
    // Mid-heist: one gem already lifted, the thief crouched by the crates
    // in the lower hall while a guard's cone sweeps toward them.
    // The seed picks the gallery: 1 shows the Gilded Wing, 2 the Vault Below.
    const levelIndex = seed === 2 ? 2 : 1;
    startLevel(levelIndex);
    game.level.loot[0].taken = true;
    game.level.score = 500;
    if (seed === 2) {
      game.level.player.x = 10 * TILE + TILE / 2;
      game.level.player.y = 12 * TILE + TILE / 2;
      game.level.player.face = Math.PI / 2;
    } else {
      game.level.player.x = 18 * TILE + TILE / 2;
      game.level.player.y = 11 * TILE + TILE / 2;
      game.level.player.face = Math.PI;
    }
    game.level.player.sneaking = true;
    for (let i = 0; i < 60 * 3; i++) stepLevel(game.level, { ...input, target: null }, 1 / 60);
    // Warm up one guard's cone after the patrol settles, so the shot
    // shows a guard closing in on the thief.
    game.level.guards[2].suspicion = 0.55;
    game.level.time = 41;
    void rand;
  } else if (kind === 'end') {
    startLevel(0);
    for (const item of game.level.loot) item.taken = true;
    game.level.exitOpen = true;
    game.level.player.x = game.level.exit.x - 60;
    game.level.player.y = game.level.exit.y;
    game.level.score = 1240;
    game.level.time = 63;
    game.state = 'levelclear';
  }
  draw(ctx, game, performance.now());
  document.title = `OK shot=${kind} state=${game.state}`;
}

const shot = params.get('shot');
if (shot) {
  // Full-bleed frame for screenshots: the canvas is exactly 1280x720,
  // the same as the capture window, so the render fills the shot.
  canvas.style.width = '100vw';
  canvas.style.height = '100vh';
  document.body.style.overflow = 'hidden';
  const mainEl = document.querySelector('main');
  if (mainEl) {
    mainEl.style.padding = '0';
    mainEl.style.gap = '0';
  }
  const help = document.getElementById('help');
  if (help) help.style.display = 'none';
  stageShot(shot);
} else {
  draw(ctx, game, performance.now());
  document.title = 'OK The Velvet Hour';
}
requestAnimationFrame(frame);

// ---- headless self-test (?selftest=1): drive the simulation, report ----
if (params.get('selftest') === '1') {
  const results = [];
  const check = (name, ok) => results.push(`${ok ? 'PASS' : 'FAIL'} ${name}`);
  try {
    for (let li = 0; li < LEVELS.length; li++) {
      const lv = buildLevel(li);
      check(`level ${li + 1} has loot`, lv.loot.length > 0);
      check(`level ${li + 1} has guards`, lv.guards.length > 0);
      // Walk right for 3s: the player must actually move.
      const x0 = lv.player.x;
      for (let i = 0; i < 180; i++) stepLevel(lv, { right: true }, 1 / 60);
      check(`level ${li + 1} player moves`, lv.player.x > x0 + 50);
      // Stand in front of guard 0 (fresh level, so it faces along its
      // first patrol leg) until it spots the player.
      const fresh = buildLevel(li);
      const g = fresh.guards[0];
      fresh.player.x = g.x + Math.cos(g.angle) * 100;
      fresh.player.y = g.y + Math.sin(g.angle) * 100;
      let spotted = false;
      for (let i = 0; i < 60 * 5 && !spotted; i++) {
        stepLevel(fresh, {}, 1 / 60);
        if (fresh.alert > 0.9) spotted = true;
      }
      check(`level ${li + 1} guard spots player`, spotted);
      // Collect every gem by teleporting, then walk to the exit.
      for (const item of lv.loot) {
        lv.player.x = item.x;
        lv.player.y = item.y;
        stepLevel(lv, {}, 1 / 60);
      }
      check(`level ${li + 1} all loot collectable`, lv.loot.every((i) => i.taken));
      lv.player.x = lv.exit.x;
      lv.player.y = lv.exit.y;
      stepLevel(lv, {}, 1 / 60);
      check(`level ${li + 1} exit clears level`, lv.cleared === true);
    }
    const failed = results.filter((r) => r.startsWith('FAIL')).length;
    const node = document.createElement('pre');
    node.id = 'selftest';
    node.textContent = results.join('\n');
    document.body.appendChild(node);
    document.title = failed === 0 ? 'SELFTEST PASS' : `SELFTEST FAIL ${failed}`;
  } catch (err) {
    document.title = `SELFTEST ERROR ${err.message}`;
  }
}
