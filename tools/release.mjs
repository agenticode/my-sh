#!/usr/bin/env node
// Writes site/release.json from a GitHub release of MemorY.
//
//   node tools/release.mjs [TAG]      TAG defaults to the latest release
//
// The download page (site/js/download.js) and the install script (site/get.sh)
// read this file, so a new release changes only it.
//
// The script reads the release from the GitHub API, downloads SHA256SUMS and
// every archive named my_<TAG>_<os>_<arch>.tar.gz, and checks each archive
// three ways: its SHA-256 against SHA256SUMS, against the digest GitHub keeps
// for the asset, and its size against the asset's size. On any difference it
// writes nothing and exits with 1. GH_TOKEN, when set, is sent to the API.
//
// The file keeps one archive per line, so a POSIX shell can read it with sed.

import { createHash } from 'node:crypto';
import { writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const REPO = 'agenticode/my';
const out = join(dirname(fileURLToPath(import.meta.url)), '..', 'site', 'release.json');
const OS_ORDER = ['linux', 'darwin'];
const ARCH_ORDER = ['amd64', 'arm64'];

const fail = (msg) => {
  console.error(`release: ${msg}`);
  process.exit(1);
};

async function api(path) {
  const headers = { Accept: 'application/vnd.github+json', 'User-Agent': 'my-sh-release-tool', 'X-GitHub-Api-Version': '2022-11-28' };
  if (process.env.GH_TOKEN) headers.Authorization = `Bearer ${process.env.GH_TOKEN}`;
  const r = await fetch(`https://api.github.com${path}`, { headers });
  if (!r.ok) fail(`GET ${path}: HTTP ${r.status}`);
  return r.json();
}

async function download(url) {
  const r = await fetch(url, { headers: { 'User-Agent': 'my-sh-release-tool' }, redirect: 'follow' });
  if (!r.ok) fail(`GET ${url}: HTTP ${r.status}`);
  return Buffer.from(await r.arrayBuffer());
}

// The commit a tag names; an annotated tag points at a tag object first.
async function commitOf(tag) {
  let obj = (await api(`/repos/${REPO}/git/ref/tags/${encodeURIComponent(tag)}`)).object;
  for (let i = 0; obj.type === 'tag' && i < 4; i++) obj = (await api(`/repos/${REPO}/git/tags/${obj.sha}`)).object;
  if (obj.type !== 'commit') fail(`tag ${tag} does not name a commit`);
  return obj.sha;
}

// The text of release.json: one key per line, one archive per line.
export function releaseText(head, archives) {
  const lines = Object.entries(head).map(([k, v]) => `  ${JSON.stringify(k)}: ${JSON.stringify(v)},`);
  lines.push('  "archives": [');
  archives.forEach((a, i) => lines.push(`    ${JSON.stringify(a)}${i < archives.length - 1 ? ',' : ''}`));
  lines.push('  ]');
  const text = `{\n${lines.join('\n')}\n}\n`;
  JSON.parse(text); // the file must stay valid JSON
  return text;
}

async function main() {
  const tag = process.argv[2];
  if (tag && !/^v\d+\.\d+\.\d+(?:-[0-9A-Za-z.]+)?$/.test(tag)) fail(`not a version tag: ${tag}`);
  const rel = await api(`/repos/${REPO}/releases/${tag ? `tags/${tag}` : 'latest'}`);
  if (rel.draft) fail(`${rel.tag_name} is a draft`);
  if (rel.prerelease && !tag) fail(`the latest release ${rel.tag_name} is a pre-release; name it to use it`);
  const version = rel.tag_name;

  const sumsAsset = rel.assets.find((a) => a.name === 'SHA256SUMS');
  if (!sumsAsset) fail(`${version} has no SHA256SUMS`);
  const sumsText = (await download(sumsAsset.browser_download_url)).toString('utf8');
  const sums = new Map();
  for (const line of sumsText.split('\n')) {
    if (!line.trim()) continue;
    const m = /^([0-9a-f]{64}) [ *](\S+)$/.exec(line);
    if (!m) fail(`SHA256SUMS: cannot read the line ${JSON.stringify(line)}`);
    sums.set(m[2], m[1]);
  }

  const name = new RegExp(`^my_${version.replace(/\./g, '\\.')}_([a-z0-9]+)_([a-z0-9]+)\\.tar\\.gz$`);
  const archives = [];
  for (const a of rel.assets) {
    const m = name.exec(a.name);
    if (!m) continue;
    const body = await download(a.browser_download_url);
    const sha256 = createHash('sha256').update(body).digest('hex');
    if (sums.get(a.name) !== sha256) fail(`${a.name}: SHA-256 ${sha256}, SHA256SUMS says ${sums.get(a.name) ?? 'nothing'}`);
    if (a.digest && a.digest !== `sha256:${sha256}`) fail(`${a.name}: SHA-256 ${sha256}, GitHub keeps ${a.digest}`);
    if (body.length !== a.size) fail(`${a.name}: ${body.length} bytes, GitHub says ${a.size}`);
    archives.push({ os: m[1], arch: m[2], file: a.name, url: a.browser_download_url, size: a.size, sha256 });
    console.log(`checked ${a.name} ${a.size} ${sha256}`);
  }
  if (!archives.length) fail(`${version} has no archive named my_${version}_<os>_<arch>.tar.gz`);
  for (const file of sums.keys()) if (!archives.some((a) => a.file === file)) fail(`SHA256SUMS lists ${file}, which is not attached`);

  const rank = (list, v) => (list.includes(v) ? list.indexOf(v) : list.length);
  archives.sort((x, y) => rank(OS_ORDER, x.os) - rank(OS_ORDER, y.os) || x.os.localeCompare(y.os)
    || rank(ARCH_ORDER, x.arch) - rank(ARCH_ORDER, y.arch) || x.arch.localeCompare(y.arch));

  const head = {
    name: 'MemorY',
    version,
    date: rel.published_at.slice(0, 10),
    published: rel.published_at,
    commit: await commitOf(version),
    repository: `https://github.com/${REPO}`,
    notes: rel.html_url,
    sums: { file: 'SHA256SUMS', url: sumsAsset.browser_download_url, size: sumsAsset.size },
  };
  writeFileSync(out, releaseText(head, archives));
  console.log(`written site/release.json: ${version} (${head.date}), ${archives.length} archives`);
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) await main();
