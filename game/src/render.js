// Canvas drawing for The Velvet Hour. Everything is drawn from the level
// state — no images, no network — so a screenshot is always a true render.

import { TILE, COLS, ROWS } from './levels.js';
import { BLOCKS_SIGHT } from './engine.js';

const W = COLS * TILE;
const H = ROWS * TILE;

// Raycast one edge of a vision cone: march out from the guard until a
// vision-blocking tile (or the cone's range) stops the ray.
function coneRayEnd(level, g, angle) {
  const dx = Math.cos(angle);
  const dy = Math.sin(angle);
  for (let d = 8; d <= g.range; d += 8) {
    const px = g.x + dx * d;
    const py = g.y + dy * d;
    const tx = Math.floor(px / TILE);
    const ty = Math.floor(py / TILE);
    if (tx < 0 || ty < 0 || tx >= COLS || ty >= ROWS) return { x: px, y: py };
    if (BLOCKS_SIGHT.has(level.grid[ty][tx])) return { x: px, y: py };
  }
  return { x: g.x + dx * g.range, y: g.y + dy * g.range };
}

// A guard's vision cone as a polygon, clipped by walls and cover: sample
// rays across the field of view and join where each one stops.
function conePath(ctx, level, g) {
  const steps = 26;
  ctx.beginPath();
  ctx.moveTo(g.x, g.y);
  for (let i = 0; i <= steps; i++) {
    const angle = g.angle - g.fov / 2 + (g.fov * i) / steps;
    const end = coneRayEnd(level, g, angle);
    ctx.lineTo(end.x, end.y);
  }
  ctx.closePath();
}

function drawTiles(ctx, level) {
  for (let y = 0; y < ROWS; y++) {
    for (let x = 0; x < COLS; x++) {
      const ch = level.grid[y][x];
      const px = x * TILE;
      const py = y * TILE;
      if (ch === '#') {
        ctx.fillStyle = '#232a3d';
        ctx.fillRect(px, py, TILE, TILE);
        ctx.fillStyle = '#2e3850';
        ctx.fillRect(px, py, TILE, 6);
        ctx.fillStyle = '#1a2030';
        ctx.fillRect(px, py + TILE - 4, TILE, 4);
        continue;
      }
      // Floor: faint checker so the room reads at a glance.
      ctx.fillStyle = (x + y) % 2 === 0 ? '#171a24' : '#191d29';
      ctx.fillRect(px, py, TILE, TILE);
      if (ch === ',') {
        // Shadow floor: deep blue dark, with a diagonal hatch.
        ctx.fillStyle = 'rgba(8, 12, 26, 0.72)';
        ctx.fillRect(px, py, TILE, TILE);
        ctx.strokeStyle = 'rgba(90, 120, 200, 0.16)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(px + 6, py + TILE - 6);
        ctx.lineTo(px + TILE - 6, py + 6);
        ctx.stroke();
      }
      if (ch === 'C') {
        ctx.fillStyle = '#6b4a26';
        ctx.fillRect(px + 4, py + 4, TILE - 8, TILE - 8);
        ctx.strokeStyle = '#8a6136';
        ctx.lineWidth = 2;
        ctx.strokeRect(px + 4, py + 4, TILE - 8, TILE - 8);
        ctx.beginPath();
        ctx.moveTo(px + 4, py + 4);
        ctx.lineTo(px + TILE - 4, py + TILE - 4);
        ctx.moveTo(px + TILE - 4, py + 4);
        ctx.lineTo(px + 4, py + TILE - 4);
        ctx.stroke();
      }
      if (ch === 'S') {
        ctx.fillStyle = '#3a4152';
        ctx.fillRect(px + 8, py + 6, TILE - 16, TILE - 12);
        ctx.fillStyle = '#565e73';
        ctx.beginPath();
        ctx.arc(px + TILE / 2, py + TILE / 2, 9, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#7c86a0';
        ctx.beginPath();
        ctx.arc(px + TILE / 2 - 2, py + TILE / 2 - 2, 3, 0, Math.PI * 2);
        ctx.fill();
      }
      if (ch === 'D') {
        ctx.fillStyle = '#243447';
        ctx.fillRect(px + 5, py + 5, TILE - 10, TILE - 10);
        ctx.fillStyle = 'rgba(140, 200, 255, 0.25)';
        ctx.fillRect(px + 8, py + 8, TILE - 16, TILE - 16);
        ctx.strokeStyle = '#7fb2e5';
        ctx.lineWidth = 1.5;
        ctx.strokeRect(px + 5, py + 5, TILE - 10, TILE - 10);
      }
    }
  }
}

function drawExit(ctx, level) {
  const e = level.exit;
  const open = level.exitOpen;
  ctx.save();
  ctx.translate(e.x, e.y);
  ctx.fillStyle = open ? '#1f7a3d' : '#274a33';
  ctx.fillRect(-TILE / 2 + 3, -TILE / 2 + 3, TILE - 6, TILE - 6);
  ctx.strokeStyle = open ? '#39d67a' : '#4a7a5c';
  ctx.lineWidth = 3;
  ctx.strokeRect(-TILE / 2 + 3, -TILE / 2 + 3, TILE - 6, TILE - 6);
  ctx.fillStyle = open ? '#b6ffd4' : '#8fb89e';
  ctx.font = 'bold 15px system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(open ? 'EXIT' : 'LOCKED', 0, 0);
  if (open) {
    // Pulsing glow so the open exit is impossible to miss.
    const pulse = 0.5 + 0.5 * Math.sin(performance.now() / 280);
    ctx.strokeStyle = `rgba(57, 214, 122, ${0.25 + 0.35 * pulse})`;
    ctx.lineWidth = 4;
    ctx.strokeRect(-TILE / 2 - 4, -TILE / 2 - 4, TILE + 8, TILE + 8);
  }
  ctx.restore();
}

function drawLoot(ctx, level, now) {
  for (const item of level.loot) {
    if (item.taken) continue;
    const bob = Math.sin(now / 320 + item.x) * 3;
    ctx.save();
    ctx.translate(item.x, item.y + bob);
    ctx.fillStyle = 'rgba(255, 214, 90, 0.22)';
    ctx.beginPath();
    ctx.arc(0, 0, 17, 0, Math.PI * 2);
    ctx.fill();
    // A cut gem.
    ctx.fillStyle = '#ffd65a';
    ctx.beginPath();
    ctx.moveTo(0, -11);
    ctx.lineTo(9, 0);
    ctx.lineTo(0, 11);
    ctx.lineTo(-9, 0);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = '#fff3c4';
    ctx.beginPath();
    ctx.moveTo(0, -11);
    ctx.lineTo(5, -3);
    ctx.lineTo(-5, -3);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }
}

function drawGuards(ctx, level) {
  for (const g of level.guards) {
    // Vision cone, drawn under the guard, clipped by walls and cover.
    const hot = g.state === 'chase';
    const warm = g.state !== 'patrol' || g.suspicion > 0.05;
    ctx.save();
    conePath(ctx, level, g);
    ctx.fillStyle = hot
      ? 'rgba(255, 64, 64, 0.30)'
      : warm
        ? 'rgba(255, 176, 32, 0.22)'
        : 'rgba(255, 200, 80, 0.13)';
    ctx.fill();
    ctx.strokeStyle = hot ? 'rgba(255, 80, 80, 0.5)' : 'rgba(255, 200, 80, 0.28)';
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.restore();

    // Guard body: a watchman in a navy coat with a torch beam.
    ctx.save();
    ctx.translate(g.x, g.y);
    ctx.fillStyle = hot ? '#a83232' : '#33507a';
    ctx.beginPath();
    ctx.arc(0, 0, 14, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#d7e2f5';
    ctx.lineWidth = 2;
    ctx.stroke();
    // Facing tick + torch dot.
    ctx.rotate(g.angle);
    ctx.fillStyle = '#ffe9a8';
    ctx.beginPath();
    ctx.arc(14, 0, 4, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#1b2436';
    ctx.beginPath();
    ctx.arc(3, -4, 2.5, 0, Math.PI * 2);
    ctx.arc(3, 4, 2.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    // Suspicion: a rising "!" and a thin meter over the guard.
    if (g.suspicion > 0.05) {
      ctx.save();
      ctx.translate(g.x, g.y - 24);
      ctx.fillStyle = 'rgba(10, 10, 16, 0.7)';
      ctx.fillRect(-16, -7, 32, 9);
      ctx.fillStyle = g.suspicion > 0.6 ? '#ff5a5a' : '#ffb020';
      ctx.fillRect(-15, -6, 30 * g.suspicion, 7);
      ctx.fillStyle = g.suspicion > 0.6 ? '#ff5a5a' : '#ffd65a';
      ctx.font = 'bold 16px system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('!', 0, -12);
      ctx.restore();
    }
  }
}

function drawPlayer(ctx, level, now) {
  const p = level.player;
  ctx.save();
  ctx.translate(p.x, p.y);
  // Soft shadow blob.
  ctx.fillStyle = 'rgba(0, 0, 0, 0.35)';
  ctx.beginPath();
  ctx.ellipse(0, 9, 12, 5, 0, 0, Math.PI * 2);
  ctx.fill();
  // The thief: dark hooded figure, lighter when sneaking is off.
  ctx.fillStyle = p.sneaking ? '#232733' : '#3b4358';
  ctx.beginPath();
  ctx.arc(0, 0, p.r, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = '#c8d2e8';
  ctx.lineWidth = 2;
  ctx.stroke();
  ctx.rotate(p.face);
  ctx.fillStyle = '#e8ecf5';
  ctx.beginPath();
  ctx.arc(p.r - 3, 0, 3.5, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  // Click-to-move target marker.
  if (window.__velvetTarget) {
    const t = window.__velvetTarget;
    ctx.save();
    ctx.strokeStyle = 'rgba(200, 220, 255, 0.7)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(t.x, t.y, 8 + Math.sin(now / 150) * 2, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }
}

function drawCoin(ctx, level) {
  if (!level.coin) return;
  ctx.save();
  ctx.translate(level.coin.x, level.coin.y);
  const alpha = Math.min(1, level.coin.ring / 1.5);
  ctx.strokeStyle = `rgba(255, 220, 120, ${alpha})`;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(0, 0, 10 + (4 - level.coin.ring) * 14, 0, Math.PI * 2);
  ctx.stroke();
  ctx.fillStyle = '#ffd65a';
  ctx.beginPath();
  ctx.arc(0, 0, 5, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

export function drawHud(ctx, game) {
  const level = game.level;
  ctx.save();
  ctx.fillStyle = 'rgba(8, 10, 18, 0.82)';
  ctx.fillRect(0, 0, W, 34);
  ctx.fillStyle = '#e8ecf5';
  ctx.font = 'bold 15px system-ui, sans-serif';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.fillText(`${level.def.name}`, 12, 18);
  const taken = level.loot.filter((i) => i.taken).length;
  ctx.fillStyle = '#ffd65a';
  ctx.fillText(`◆ ${taken}/${level.loot.length}`, 220, 18);
  ctx.fillStyle = '#e8ecf5';
  ctx.fillText(`◷ ${Math.floor(level.time)}s`, 320, 18);
  ctx.fillText(`◉ ${level.coins} coins`, 420, 18);
  ctx.fillText(`★ ${level.score}`, 540, 18);
  // Alert bar on the right.
  const alert = level.alert || 0;
  ctx.fillStyle = '#2a2f42';
  ctx.fillRect(W - 240, 12, 160, 10);
  ctx.fillStyle = alert > 0.6 ? '#ff5a5a' : alert > 0.05 ? '#ffb020' : '#3a7a52';
  ctx.fillRect(W - 240, 12, 160 * alert, 10);
  ctx.fillStyle = '#e8ecf5';
  ctx.font = '13px system-ui, sans-serif';
  ctx.textAlign = 'right';
  ctx.fillText(alert > 0.6 ? 'SPOTTED!' : alert > 0.05 ? 'Suspicious…' : 'Unseen', W - 66, 18);
  ctx.textAlign = 'left';
  ctx.restore();
}

function overlay(ctx, title, lines, accent) {
  ctx.save();
  ctx.fillStyle = 'rgba(6, 8, 16, 0.78)';
  ctx.fillRect(0, 0, W, H);
  ctx.textAlign = 'center';
  ctx.fillStyle = accent || '#e8ecf5';
  ctx.font = 'bold 44px Georgia, serif';
  ctx.fillText(title, W / 2, H / 2 - 70);
  ctx.fillStyle = '#c8d2e8';
  ctx.font = '18px system-ui, sans-serif';
  lines.forEach((line, i) => ctx.fillText(line, W / 2, H / 2 - 10 + i * 30));
  ctx.restore();
}

export function draw(ctx, game, now) {
  const level = game.level;
  ctx.clearRect(0, 0, W, H);
  drawTiles(ctx, level);
  drawExit(ctx, level);
  drawLoot(ctx, level, now);
  drawCoin(ctx, level);
  drawGuards(ctx, level);
  drawPlayer(ctx, level, now);

  if (game.state === 'title') {
    overlay(ctx, 'THE VELVET HOUR', [
      'A museum heist in three galleries. Lift every gem, then slip out the exit — unseen.',
      'WASD / arrows to move · click to walk there · Shift to sneak · Space tosses a coin to distract',
      'Crates, statues and cases block a guard’s sight. Shadow floors hide you. Don’t get caught.',
      '',
      'Press Enter or click to begin — M mutes, P pauses, R restarts the level.',
    ], '#ffd65a');
  } else if (game.state === 'caught') {
    overlay(ctx, 'CAUGHT!', [
      `The guards found you in ${level.def.name}.`,
      'The velvet rope snaps shut. The night is over — for now.',
      '',
      'Press R to try the gallery again.',
    ], '#ff5a5a');
  } else if (game.state === 'levelclear') {
    overlay(ctx, 'GALLERY CLEARED', [
      `${level.def.name} — every gem lifted, exit reached unseen.`,
      `Time ${Math.floor(level.time)}s · Score ${level.score}`,
      '',
      'Press Enter for the next gallery.',
    ], '#39d67a');
  } else if (game.state === 'win') {
    overlay(ctx, 'THE CLEAN GETAWAY', [
      'Three galleries, every gem, never once caught. The Velvet Hour is yours.',
      `Final score ${game.totalScore} · Total time ${Math.floor(game.totalTime)}s`,
      '',
      'Press Enter to run it all again.',
    ], '#ffd65a');
  } else if (game.state === 'paused') {
    overlay(ctx, 'PAUSED', ['Press P to keep sneaking.'], '#c8d2e8');
  }

  if (game.state === 'playing' || game.state === 'paused') drawHud(ctx, game);

  // Alarm vignette while chased.
  if (game.state === 'playing' && (level.alert || 0) > 0.6) {
    const grad = ctx.createRadialGradient(W / 2, H / 2, H * 0.35, W / 2, H / 2, H * 0.75);
    grad.addColorStop(0, 'rgba(255, 40, 40, 0)');
    grad.addColorStop(1, `rgba(255, 40, 40, ${0.25 * (level.alert || 0)})`);
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, W, H);
  }
}
