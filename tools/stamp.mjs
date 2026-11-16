#!/usr/bin/env node
// Rewrites the ?v= value on local stylesheet and script URLs in the HTML pages
// of site/ and its subdirectories (site/ko, site/en).
// The value is the first 8 hex digits of the file's SHA-256, so a changed file
// gets a new URL and browsers stop using the copy they cached.
//
//   node tools/stamp.mjs          rewrite
//   node tools/stamp.mjs --check  exit 1 if any value is out of date

import { createHash } from 'node:crypto';
import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const site = join(dirname(fileURLToPath(import.meta.url)), '..', 'site');
const check = process.argv.includes('--check');
const attr = /\b(href|src)="(\/(?:css|js)\/[^"?#]+)(?:\?v=[0-9a-f]*)?"/g;

let stale = 0;
const pages = readdirSync(site, { recursive: true }).filter((f) => f.endsWith('.html')).sort();
for (const name of pages) {
  const file = join(site, name);
  const before = readFileSync(file, 'utf8');
  const after = before.replace(attr, (whole, key, path) => {
    const hash = createHash('sha256').update(readFileSync(join(site, path))).digest('hex').slice(0, 8);
    return `${key}="${path}?v=${hash}"`;
  });
  if (after === before) continue;
  stale += 1;
  if (check) console.log(`out of date: site/${name}`);
  else { writeFileSync(file, after); console.log(`stamped: site/${name}`); }
}
if (check && stale) process.exit(1);
if (!stale) console.log('up to date');
