// CINDERLINE — hand-in for make.fun threejs-fps-02 (Node 22, stdlib only).
// The game is the static game/ folder beside this file; the screenshots in
// screenshots/ are the frames the judge looks at first (the first by name is
// the cover). This program copies both into the output directory and writes
// dossier.json with the vendored make.fun library — the same library the
// scorer rebuilds the dossier with, so the bytes must match exactly.
// Outside the grader, MAKEFUN_OUTPUT_DIR stands in for /output:
//   mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts

import { cpSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDossier } from './vendor/makefun-threejs.ts';

const here = fileURLToPath(new URL('.', import.meta.url));
const out = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';
const shots = join(here, 'screenshots');

if (!existsSync(shots)) {
  throw new Error('screenshots/ is missing — the judge needs 3–4 frames of the game');
}

mkdirSync(out, { recursive: true });
cpSync(join(here, 'game'), join(out, 'game'), { recursive: true });
mkdirSync(join(out, 'screenshots'), { recursive: true });
cpSync(shots, join(out, 'screenshots'), { recursive: true });

// The scorer's caps, as the reference gate states them: the dossier's source
// text is cut at 160 KiB, at most 4 screenshots of 256 KiB each, and game/
// holds at most 993 files totalling 48 MiB.
const dossier = buildDossier(out, {
  text_max_bytes: 163840,
  screenshots: { max: 4, max_bytes: 262144 },
  game_max_files: 993,
  game_max_bytes: 50331648,
});
writeFileSync(join(out, 'dossier.json'), dossier);
