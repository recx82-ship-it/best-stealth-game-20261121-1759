// The Velvet Hour — the program that hands the game in (Node 22, stdlib only).
// It copies the static game (game/) and its real screenshots (screenshots/)
// from beside this file into the output directory and writes dossier.json,
// the summary the judge reads, with the vendored make.fun library.
//
// Outside the grader, MAKEFUN_OUTPUT_DIR stands in for /output:
//   mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts

import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { extname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDossier } from './vendor/makefun-game.ts';

const repoRoot = fileURLToPath(new URL('.', import.meta.url));
const outDir = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';
const gameDir = join(repoRoot, 'game');
const shotsDir = join(repoRoot, 'screenshots');

const SCREENSHOT_LIMIT = 4;
const SCREENSHOT_MAX_BYTES = 262144;

// Fail loudly, with a readable reason, instead of handing in a broken entry.
function fail(message) {
  throw new Error(`main.ts: ${message}`);
}

if (!existsSync(join(gameDir, 'index.html'))) {
  fail('game/index.html is missing: the game is a directory of static files with its page at the root');
}

const shots = existsSync(shotsDir)
  ? readdirSync(shotsDir).filter((name) => ['.png', '.jpg', '.jpeg'].includes(extname(name).toLowerCase())).sort()
  : [];
if (shots.length < 3 || shots.length > SCREENSHOT_LIMIT) {
  fail(`screenshots/ holds ${shots.length} images, need 3 or 4`);
}
for (const name of shots) {
  const size = statSync(join(shotsDir, name)).size;
  if (size > SCREENSHOT_MAX_BYTES) fail(`screenshots/${name} is ${size} bytes, over the 256 KiB cap`);
  const head = readFileSync(join(shotsDir, name)).subarray(0, 3);
  const isJpeg = head[0] === 0xff && head[1] === 0xd8 && head[2] === 0xff;
  const isPng = head[0] === 0x89 && head[1] === 0x50 && head[2] === 0x4e;
  if (!isJpeg && !isPng) fail(`screenshots/${name} is neither a JPEG nor a PNG`);
}

mkdirSync(outDir, { recursive: true });
cpSync(gameDir, join(outDir, 'game'), { recursive: true });
mkdirSync(join(outDir, 'screenshots'), { recursive: true });
cpSync(shotsDir, join(outDir, 'screenshots'), { recursive: true });

// The scorer's own caps (the kit's gate.json): only text_max_bytes shapes the
// bytes; the others refuse an entry the scorer would refuse.
const dossier = buildDossier(outDir, {
  text_max_bytes: 163840,
  screenshots: { max: SCREENSHOT_LIMIT, max_bytes: SCREENSHOT_MAX_BYTES },
  game_max_files: 993,
  game_max_bytes: 50331648,
  game_path_max_bytes: 1000,
});
writeFileSync(join(outDir, 'dossier.json'), dossier);

// Re-read what was written and confirm it is the dossier this game made:
// the schema, the cover shot first, and every screenshot accounted for.
const written = JSON.parse(readFileSync(join(outDir, 'dossier.json'), 'utf8'));
if (written.schema !== 'makefun/dossier/v1') fail('dossier.json came back with the wrong schema');
if (written.images[0].name !== shots[0]) fail(`dossier.json lists ${written.images[0].name} first, not the cover ${shots[0]}`);
if (written.images.length !== shots.length) fail('dossier.json lists a different number of screenshots than screenshots/ holds');

const gameFiles = readdirSync(join(outDir, 'game'), { recursive: true }).length;
console.log(`The Velvet Hour handed in: ${gameFiles} game entries, ${shots.length} screenshots (${shots[0]} is the cover), dossier.json ${dossier.length} bytes -> ${outDir}`);
