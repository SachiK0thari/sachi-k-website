#!/usr/bin/env node
// Run this after every fresh export of index.html from the site builder.
// It re-applies the fixes the builder doesn't know about:
//
//   1. Portrait: stops blinking when the visitor's OS asks for reduced motion
//   2. Portrait: converts the PNG to WebP (about 1.4 MB -> 125 KB)
//   3. Footer: points the "Hugging Face" link at the real profile
//   4. <head>: viewport, page description and link-preview tags
//   5. No-JavaScript copy of the page (via scripts/sync-nojs.mjs)
//
//   node scripts/fix-export.mjs            fix index.html in place
//   node scripts/fix-export.mjs other.html fix another file
//
// Safe to run any number of times: each step skips itself if already applied.

import fs from 'fs';
import os from 'os';
import path from 'path';
import { spawnSync } from 'child_process';
import { fileURLToPath } from 'url';

// ---- Settings: change these if your details change -------------------------
const HUGGING_FACE_URL = 'https://huggingface.co/SachiK';
const PAGE_TITLE = 'Sachi Kothari · Generative AI Engineer';
const DESCRIPTION = 'Generative AI engineer in the Bay Area. I build AI for work where a wrong answer costs something: health triage, company purchasing, medical literature. Projects with code, demos and published evaluation numbers.';
const WEBP_QUALITY = 90;
// ----------------------------------------------------------------------------

const HERE = path.dirname(fileURLToPath(import.meta.url));
const FILE = path.resolve(process.argv[2] || path.join(HERE, '..', 'index.html'));
let html = fs.readFileSync(FILE, 'utf8');
const original = html;
const report = [];
const done = msg => report.push('  fixed    ' + msg);
const skip = msg => report.push('  ok       ' + msg);
const warn = msg => report.push('  WARNING  ' + msg);

// Bundle blocks are JSON inside <script> tags. Encode '<' so no '</script>'
// can ever appear in them; JSON.parse in the loader reads it back unchanged.
const enc = v => JSON.stringify(v).replace(/</g, '\\u003C')
  .replace(/\u2028/g, '\\u2028').replace(/\u2029/g, '\\u2029');
const blockRe = type => new RegExp(`(<script type="__bundler/${type}">)([\\s\\S]*?)(</script>)`);
function readBlock(type) {
  const m = html.match(blockRe(type));
  if (!m) fail(`This doesn't look like a site-builder export (no __bundler/${type} block).`);
  return JSON.parse(m[2]);
}
function writeBlock(type, value) {
  html = html.replace(blockRe(type), (_, a, __, c) => a + enc(value) + c);
}

// ---- 1 & 3: edits to the page template --------------------------------------
let tpl = readBlock('template');
const tplBefore = tpl;
function tplEdit(label, alreadyDone, anchor, replacement) {
  if (alreadyDone) return skip(label);
  if (!tpl.includes(anchor)) return warn(`${label}: couldn't find where to apply it; the builder's code may have changed.`);
  tpl = tpl.replace(anchor, replacement);
  done(label);
}

{
  const label = 'reduced motion: stop blinking';
  const mqLine = "this.mq = window.matchMedia('(prefers-color-scheme: dark)');";
  const blinkIf = 'if (now >= this.nextBlink) {';
  if (tpl.includes('this.rm.matches')) skip(label);
  else if (!tpl.includes(mqLine) || !tpl.includes(blinkIf)) warn(`${label}: couldn't find the portrait animation code; the builder's code may have changed.`);
  else {
    tpl = tpl.replace(mqLine, mqLine + "\n    this.rm = window.matchMedia('(prefers-reduced-motion: reduce)');")
             .replace(blinkIf, 'if (now >= this.nextBlink && !(this.rm && this.rm.matches)) {');
    done(label);
  }
}
tplEdit('reduced motion: stop CSS animations',
  tpl.includes('@media (prefers-reduced-motion: reduce){'),
  '@keyframes pulse{0%,100%{opacity:1}50%{opacity:.35}}',
  '@keyframes pulse{0%,100%{opacity:1}50%{opacity:.35}}\n@media (prefers-reduced-motion: reduce){*{animation:none!important}}');
{
  const label = 'Hugging Face footer link';
  const re = /<a href="#"([^>]*)>Hugging Face<\/a>/;
  if (re.test(tpl)) { tpl = tpl.replace(re, `<a href="${HUGGING_FACE_URL}" target="_blank" rel="noopener"$1>Hugging Face</a>`); done(label); }
  else if (tpl.includes(`href="${HUGGING_FACE_URL}"`)) skip(label);
  else warn(`${label}: couldn't find it in the footer.`);
}
if (/full SDLC|robust, maintainable software|fast-paced, client-facing/.test(tpl))
  warn('Experience still has the old résumé-style bullets. Update them in the site builder (see scripts/README.md).');
if (tpl !== tplBefore) writeBlock('template', tpl);

// ---- 2: portrait PNG -> WebP ---------------------------------------------------
{
  const label = 'portrait as WebP';
  const ext = readBlock('ext_resources');
  const cutout = ext.find(r => r.id === 'cutout');
  const manifest = readBlock('manifest');
  const entry = cutout && manifest[cutout.uuid];
  if (!entry) warn(`${label}: couldn't find the portrait in the bundle.`);
  else if (entry.mime === 'image/webp') skip(label);
  else if (entry.mime !== 'image/png' || entry.compressed) warn(`${label}: portrait is ${entry.mime}, not a plain PNG; left as is.`);
  else {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'fix-export-'));
    const png = path.join(dir, 'p.png'), webp = path.join(dir, 'p.webp');
    fs.writeFileSync(png, Buffer.from(entry.data, 'base64'));
    const ok = convertToWebp(png, webp);
    if (!ok) warn(`${label}: no converter found. Install one with "brew install webp" (or "pip3 install pillow") and run again.`);
    else {
      const before = Buffer.from(entry.data, 'base64').length, out = fs.readFileSync(webp);
      entry.mime = 'image/webp';
      entry.data = out.toString('base64');
      writeBlock('manifest', manifest);
      done(`${label} (${Math.round(before / 1024)} KB -> ${Math.round(out.length / 1024)} KB, using ${ok})`);
    }
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

function convertToWebp(src, dst) {
  const q = String(WEBP_QUALITY);
  const cw = spawnSync('cwebp', ['-quiet', '-q', q, '-m', '6', '-alpha_q', '100', '-exact', src, '-o', dst]);
  if (cw.status === 0 && fs.existsSync(dst)) return 'cwebp';
  const py = spawnSync('python3', ['-I', '-c',
    'import sys;from PIL import Image;Image.open(sys.argv[1]).save(sys.argv[2],"WEBP",quality=int(sys.argv[3]),method=6,alpha_quality=100,exact=True)',
    src, dst, q]);
  if (py.status === 0 && fs.existsSync(dst)) return 'Pillow';
  return null;
}

// ---- 4: <head> tags --------------------------------------------------------------
{
  const label = 'head: viewport, description, link-preview tags';
  const headEnd = html.indexOf('</head>');
  const head = html.slice(0, headEnd);
  if (head.includes('name="description"')) skip(label);
  else if (!head.includes('<meta charset="utf-8">')) warn(`${label}: couldn't find <meta charset> in the head.`);
  else {
    const attr = s => s.replace(/&/g, '&amp;').replace(/"/g, '&quot;');
    const tags = [
      '  <meta charset="utf-8">',
      head.includes('name="viewport"') ? null : '  <meta name="viewport" content="width=device-width, initial-scale=1">',
      `  <meta name="description" content="${attr(DESCRIPTION)}">`,
      '  <meta property="og:type" content="website">',
      `  <meta property="og:title" content="${attr(PAGE_TITLE)}">`,
      `  <meta property="og:description" content="${attr(DESCRIPTION)}">`,
      '  <meta name="twitter:card" content="summary">',
    ].filter(Boolean).join('\n');
    let newHead = head.replace(/ *<meta charset="utf-8">/, tags)
                      .replace(/<title>[^<]*<\/title>/, `<title>${attr(PAGE_TITLE)}</title>`);
    html = newHead + html.slice(headEnd);
    done(label);
  }
}

// ---- 5a: styles for the no-JavaScript copy -----------------------------------------
{
  const label = 'head: styles for the no-JavaScript copy';
  const NOJS_STYLE = `  <noscript>
    <style>
      #__bundler_loading, #__bundler_thumbnail { display: none; }
      body { display: block; background: #171615; color: #ece5da; }
      .nojs { max-width: 720px; margin: 0 auto; padding: 48px 24px; font: 17px/1.55 -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; }
      .nojs h1 { font: 400 44px/1.05 Georgia, serif; margin: 12px 0 20px; }
      .nojs h2 { font: 400 28px/1.2 Georgia, serif; margin: 44px 0 12px; padding-bottom: 8px; border-bottom: 1px solid rgba(236,229,218,.25); }
      .nojs h3 { font-size: 18px; margin: 20px 0 4px; }
      .nojs p { margin: 0 0 10px; color: #c9c2b7; }
      .nojs ul { margin: 0 0 10px; padding-left: 20px; color: #c9c2b7; }
      .nojs li { margin-bottom: 6px; }
      .nojs a { color: #ece5da; }
      .nojs small { color: #a9b5c1; font-size: 13px; letter-spacing: .04em; text-transform: uppercase; }
    </style>
  </noscript>`;
  const headEnd = html.indexOf('</head>');
  const head = html.slice(0, headEnd);
  const builderNoscript = /  <noscript>\s*<style>#__bundler_loading \{ display: none; \}<\/style>[\s\S]*?<\/noscript>/;
  if (head.includes('.nojs {')) skip(label);
  else if (builderNoscript.test(head)) { html = head.replace(builderNoscript, () => NOJS_STYLE) + html.slice(headEnd); done(label); }
  else { html = head.replace(/\n?$/, '\n' + NOJS_STYLE + '\n') + html.slice(headEnd); done(label); }
}

// ---- Save, then rebuild the no-JavaScript copy -----------------------------------
if (html !== original) fs.writeFileSync(FILE, html);
console.log(`fix-export: ${path.basename(FILE)}`);
console.log(report.join('\n'));
const sync = spawnSync(process.execPath, [path.join(HERE, 'sync-nojs.mjs'), FILE], { stdio: 'inherit' });
process.exit(sync.status || (report.some(r => r.includes('WARNING')) ? 1 : 0));

function fail(msg) { console.error('fix-export: ' + msg); process.exit(2); }
