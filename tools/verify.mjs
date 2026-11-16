// The entry's own pre-flight: the same seven rows the sealed scorer reads, checked here from out/.
//
//   node tools/verify.mjs           check the last run's out/
//
// It also checks the two things the scorer cannot see: that the model's arithmetic reproduces every
// implied value from the snapshot's own fields, and that a second run writes the same bytes.

import { execFileSync } from 'node:child_process';
import { mkdtempSync, readdirSync, readFileSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { buildDossier } from '../vendor/makefun-board.ts';
import { parseSnapshot, FAMILIES, CATEGORY_MULTIPLE, UNKNOWN_MULTIPLE } from '../lib/model.ts';

const ROOT = new URL('..', import.meta.url).pathname;
const OUT = join(ROOT, 'out');
const SNAPSHOT = process.argv[2] ?? join(ROOT, '..', 'token-radar-01-kit', 'input', 'snapshot.json');

const problems = [];
const notes = [];
const fail = (row, detail) => problems.push(`${row}: ${detail}`);
const ok = (row, detail) => notes.push(`${row}: ${detail}`);

const PLAY_IMAGE = /^[A-Za-z0-9_][A-Za-z0-9._-]{0,127}$/;
const TEXT_FILE = /\.(?:html|css|js|json|mjs|svg|md|txt)$/;
const URL_ANYWHERE = /https?:\/\//i;

// ---------------------------------------------------------------- board_file, sorted_by_value, coverage, farm_steps
const board = JSON.parse(readFileSync(join(OUT, 'board.json'), 'utf8'));
const rows = Array.isArray(board) ? board : board.rows;
const snapshot = parseSnapshot(readFileSync(SNAPSHOT, 'utf8'));
const slugs = new Set(snapshot.protocols.map((p) => p.slug));
const watchlist = new Set(snapshot.watchlist);

if (!Array.isArray(rows)) fail('board_file', 'rows is not an array');
else {
  if (rows.length < 100 || rows.length > 4000) fail('board_file', `${rows.length} rows, outside 100..4000`);
  const seen = new Set();
  for (const r of rows) {
    if (typeof r.slug !== 'string' || !slugs.has(r.slug)) fail('board_file', `slug ${JSON.stringify(r.slug)} is not in the snapshot`);
    if (typeof r.name !== 'string' || r.name.trim() === '') fail('board_file', `${r.slug} has no name`);
    if (!Number.isSafeInteger(r.rank) || r.rank <= 0) fail('board_file', `${r.slug} has rank ${r.rank}`);
    if (!Number.isSafeInteger(r.implied_value_usd) || r.implied_value_usd <= 0 || r.implied_value_usd > 100_000_000_000_000) {
      fail('board_file', `${r.slug} has implied value ${r.implied_value_usd}`);
    }
    if (!Array.isArray(r.farm_steps) || r.farm_steps.length < 3 || r.farm_steps.length > 12) fail('farm_steps', `${r.slug} has ${r.farm_steps?.length} steps`);
    else if (!r.farm_steps.every((s) => typeof s === 'string' && s.trim().length >= 20 && s.trim().length <= 600)) {
      fail('farm_steps', `${r.slug} has a step outside 20..600 characters`);
    }
    if (seen.has(r.slug)) fail('board_file', `${r.slug} appears twice`);
    seen.add(r.slug);
  }
  const sorted = [...rows].sort((a, b) => a.rank - b.rank);
  if (!sorted.every((r, i) => r.rank === i + 1)) fail('sorted_by_value', 'ranks are not exactly 1..N');
  if (!sorted.every((r, i) => i === 0 || sorted[i - 1].implied_value_usd >= r.implied_value_usd)) fail('sorted_by_value', 'implied value rises with rank');
  if (new Set(rows.map((r) => r.implied_value_usd)).size === 1) fail('sorted_by_value', 'every row carries the same implied value');
  const missing = [...watchlist].filter((s) => !seen.has(s));
  if (missing.length) fail('coverage', `${missing.length} watchlist slugs missing: ${missing.slice(0, 4).join(', ')}`);
  const outside = rows.filter((r) => !watchlist.has(r.slug)).length;
  if (outside < 60) fail('coverage', `only ${outside} rows outside the watchlist`);
  ok('board_file', `${rows.length} rows, ${watchlist.size} watchlist slugs covered, ${outside} rows outside it`);
}

// ---------------------------------------------------------------- the model's own arithmetic
for (const r of rows) {
  const exact = Math.round(r.tvl_usd * r.model.category_multiple * r.model.momentum * r.model.age_discount);
  if (exact !== r.implied_value_usd) fail('model', `${r.slug}: ${r.tvl_usd} x ${r.model.category_multiple} x ${r.model.momentum} x ${r.model.age_discount} = ${exact}, board says ${r.implied_value_usd}`);
  const family = FAMILIES.find((f) => f.key === r.family);
  if (!family) fail('model', `${r.slug} has family ${r.family}`);
  else if (r.model.category_multiple < family.band_lo || r.model.category_multiple > family.band_hi) fail('model', `${r.slug} multiple ${r.model.category_multiple} outside ${family.key}'s band`);
  if (r.category !== null && CATEGORY_MULTIPLE[r.category] === undefined && r.model.category_multiple !== UNKNOWN_MULTIPLE) {
    fail('model', `${r.slug} has an unlisted category with multiple ${r.model.category_multiple}`);
  }
  if (!(r.model.momentum >= 0.7 - 1e-9 && r.model.momentum <= 1.25 + 1e-9)) fail('model', `${r.slug} momentum ${r.model.momentum} outside 0.70..1.25`);
}
if (!problems.some((p) => p.startsWith('model:'))) ok('model', `all ${rows.length} implied values recompute from tvl, category, momentum and age`);

// ---------------------------------------------------------------- the page states the model's own table
{
  const html = readFileSync(join(OUT, 'dashboard', 'index.html'), 'utf8');
  const stated = new Map();
  for (const m of html.matchAll(/<span data-cat="([^"]+)" data-mult="([0-9.]+)">/g)) stated.set(m[1], Number(m[2]));
  for (const [category, entry] of Object.entries(CATEGORY_MULTIPLE)) {
    if (stated.get(category) !== entry.multiple) fail('dashboard_model', `index.html states ${category} at ${stated.get(category)}, the model says ${entry.multiple}`);
  }
  for (const category of stated.keys()) if (CATEGORY_MULTIPLE[category] === undefined) fail('dashboard_model', `index.html names ${category}, which the model does not map`);
  if (!problems.some((p) => p.startsWith('dashboard_model:'))) ok('dashboard_model', `index.html states all ${stated.size} category multiples, matching lib/model.ts`);
}

// ---------------------------------------------------------------- dashboard_files
const dash = readdirSync(join(OUT, 'dashboard'));
let dashBytes = 0;
for (const name of dash) {
  const path = join(OUT, 'dashboard', name);
  const st = statSync(path);
  if (!st.isFile()) fail('dashboard_files', `${name} is not a regular file`);
  if (!PLAY_IMAGE.test(name)) fail('dashboard_files', `${name} is not a plain name`);
  dashBytes += st.size;
}
if (dash.length > 400) fail('dashboard_files', `${dash.length} files`);
if (dashBytes > 4 * 1024 * 1024) fail('dashboard_files', `${dashBytes} bytes`);
for (const ext of ['.html', '.css', '.js']) if (!dash.some((n) => n.endsWith(ext))) fail('dashboard_files', `no ${ext} file`);
for (const name of dash) {
  const text = readFileSync(join(OUT, 'dashboard', name), 'utf8');
  if (!TEXT_FILE.test(name)) continue;
  if (name.endsWith('.html')) {
    // every attribute value and every <style> body
    for (const attr of text.matchAll(/=\s*["']([^"']*)["']/g)) if (URL_ANYWHERE.test(attr[1])) fail('dashboard_files', `${name} attribute names a URL`);
    for (const style of text.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/gi)) if (URL_ANYWHERE.test(style[1])) fail('dashboard_files', `${name} style body names a URL`);
    for (const imp of text.matchAll(/(?:import|from)\s+["']([^"']*)["']/g)) if (URL_ANYWHERE.test(imp[1])) fail('dashboard_files', `${name} imports a URL`);
  } else if (name.endsWith('.css')) {
    if (URL_ANYWHERE.test(text)) fail('dashboard_files', `${name} names a URL`);
  } else if (name.endsWith('.js') || name.endsWith('.mjs')) {
    for (const spec of text.matchAll(/(?:import\s*\(?\s*|export\s+from\s+|require\s*\(\s*|from\s+)["']([^"']*)["']/g)) {
      if (URL_ANYWHERE.test(spec[1])) fail('dashboard_files', `${name} imports a URL`);
    }
  }
}
if (!problems.some((p) => p.startsWith('dashboard_files:'))) ok('dashboard_files', `${dash.length} files, ${dashBytes} bytes, no network address`);

// ---------------------------------------------------------------- screenshots
const shots = readdirSync(join(OUT, 'screenshots')).filter((n) => !n.startsWith('.')).sort();
if (shots.length < 3 || shots.length > 4) fail('screenshots', `${shots.length} images`);
for (const name of shots) {
  const buf = readFileSync(join(OUT, 'screenshots', name));
  if (!PLAY_IMAGE.test(name)) fail('screenshots', `${name} is not a plain name`);
  if (buf.length > 512 * 1024) fail('screenshots', `${name} is ${buf.length} bytes`);
  const png = buf[0] === 0x89 && buf.toString('latin1', 1, 4) === 'PNG';
  const jpeg = buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff;
  if (!png && !jpeg) { fail('screenshots', `${name} is neither PNG nor JPEG`); continue; }
  if (png) {
    const w = buf.readUInt32BE(16);
    const h = buf.readUInt32BE(20);
    if (Math.max(w, h) > 1440) fail('screenshots', `${name} is ${w}x${h}: long side over 1440`);
    if (Math.min(w, h) < 800) fail('screenshots', `${name} is ${w}x${h}: short side under 800`);
    ok('screenshots', `${name} ${w}x${h} ${buf.length} bytes`);
  }
}
if (!problems.some((p) => p.startsWith('screenshots:'))) ok('screenshots', `${shots.length} images, all within 512 KiB, 1440/800`);

// ---------------------------------------------------------------- dossier_matches
const rebuilt = buildDossier(OUT, { text_max_bytes: 65_536, screenshots: { max: 4, max_bytes: 524_288 }, dashboard: { max_files: 400, max_bytes: 4_194_304 } });
const written = readFileSync(join(OUT, 'dossier.json'));
if (!written.equals(Buffer.from(rebuilt))) fail('dossier_matches', 'dossier.json differs from what buildDossier writes');
if (written.length > 1.5 * 1024 * 1024) fail('dossier_matches', `dossier is ${written.length} bytes`);
const dossier = JSON.parse(written.toString('utf8'));
const textBytes = Buffer.byteLength(dossier.text, 'utf8');
if (textBytes > 65_536) fail('dossier_matches', `text is ${textBytes} bytes`);
if (/\[Cut at .*left out\.\]|of this file's \d+ lines not shown/.test(dossier.text)) fail('dossier_matches', 'the dossier text cut a source file: trim dashboard/ under 64 KB');
if (!problems.some((p) => p.startsWith('dossier_matches:'))) ok('dossier_matches', `${written.length} bytes, text ${textBytes} bytes of 65,536, every source file shown whole`);

// ---------------------------------------------------------------- two runs, one byte
const a = readFileSync(join(OUT, 'board.json'));
const b = readFileSync(join(OUT, 'data.js'));
const scratch = mkdtempSync(join(tmpdir(), 'radar-'));
try {
  execFileSync(process.execPath, [join(ROOT, 'main.ts'), '--input', SNAPSHOT], { env: { ...process.env, MAKEFUN_OUTPUT_DIR: scratch }, stdio: 'pipe' });
  const sameBoard = readFileSync(join(scratch, 'board.json')).equals(a);
  const sameData = readFileSync(join(scratch, 'data.js')).equals(b);
  const sameDossier = readFileSync(join(scratch, 'dossier.json')).equals(written);
  if (!sameBoard || !sameData || !sameDossier) fail('deterministic', `second run differs (board ${sameBoard}, data ${sameData}, dossier ${sameDossier})`);
  else ok('deterministic', 'a second run writes the same board, data and dossier');
} finally {
  rmSync(scratch, { recursive: true, force: true });
}

// ---------------------------------------------------------------- report
for (const note of notes) console.log(`ok   ${note}`);
for (const problem of problems) console.log(`FAIL ${problem}`);
console.log(problems.length === 0 ? '\nvalid: every row of the gate passes' : `\n${problems.length} problem(s)`);
process.exit(problems.length === 0 ? 0 : 1);
