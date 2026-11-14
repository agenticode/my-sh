#!/usr/bin/env node
// Renders the share image and the bitmap icons with a local Chrome.
//
//   node tools/render.mjs
//
//   tools/og.svg      -> site/og.png (1200 x 630)
//   site/favicon.svg  -> site/apple-touch-icon.png (180 x 180, square corners)
//                        site/favicon.ico (32 x 32 PNG in an ICO container)
//
// Set CHROME to the browser binary if it is not in the default macOS location.

import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const chrome = process.env.CHROME || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const tmp = mkdtempSync(join(tmpdir(), 'mysh-render-'));

function shot(source, out, width, height, transparent = false) {
  const args = [
    '--headless', '--disable-gpu', '--hide-scrollbars', '--force-device-scale-factor=1',
    `--window-size=${width},${height}`, '--virtual-time-budget=4000',
    `--screenshot=${out}`,
  ];
  if (transparent) args.push('--default-background-color=00000000');
  execFileSync(chrome, [...args, pathToFileURL(source).href], { stdio: 'ignore' });
}

// PNG width and height sit at byte 16 of the file.
function pngSize(file) {
  const b = readFileSync(file);
  return [b.readUInt32BE(16), b.readUInt32BE(20)];
}

const icon = readFileSync(join(root, 'site', 'favicon.svg'), 'utf8');
const page = (svg, size) => {
  const file = join(tmp, `icon-${size}.html`);
  writeFileSync(file, `<!doctype html><style>html,body{margin:0;background:transparent}svg{display:block;width:${size}px;height:${size}px}</style>${svg}`);
  return file;
};

try {
  shot(join(root, 'tools', 'og.svg'), join(root, 'site', 'og.png'), 1200, 630);
  shot(page(icon.replace('rx="7"', 'rx="0"'), 180), join(root, 'site', 'apple-touch-icon.png'), 180, 180);

  const png32 = join(tmp, 'icon-32.png');
  shot(page(icon, 32), png32, 32, 32, true);
  const png = readFileSync(png32);
  const header = Buffer.alloc(22);
  header.writeUInt16LE(1, 2);            // type: icon
  header.writeUInt16LE(1, 4);            // one image
  header.writeUInt8(32, 6);              // width
  header.writeUInt8(32, 7);              // height
  header.writeUInt16LE(1, 10);           // color planes
  header.writeUInt16LE(32, 12);          // bits per pixel
  header.writeUInt32LE(png.length, 14);  // image size
  header.writeUInt32LE(22, 18);          // image offset
  writeFileSync(join(root, 'site', 'favicon.ico'), Buffer.concat([header, png]));

  for (const name of ['og.png', 'apple-touch-icon.png']) {
    console.log(name, pngSize(join(root, 'site', name)).join(' x '));
  }
  console.log('favicon.ico', pngSize(png32).join(' x '));
} finally {
  rmSync(tmp, { recursive: true, force: true });
}
