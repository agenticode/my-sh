// Tests of the install script site/get.sh.
//
//   node --test tools/
//
// Each case runs a copy of the script with its two addresses pointed at a local
// HTTPS server that holds a made-up release (v9.9.9), in a temporary HOME. The
// script reaches the server with curl over HTTPS; the server's certificate is
// made for the run with openssl and given to curl in CURL_CA_BUNDLE. The `my`
// of the made-up archives is a shell script that prints its version, so every
// platform's archive runs here. `uname` and `sysctl` are replaced by scripts
// that report the platform a case wants. The script is fed on standard input,
// as `curl ... | sh` does, to /bin/sh and, where it is installed, to dash.

import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:https';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { releaseText } from './release.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const SCRIPT = readFileSync(join(root, 'site', 'get.sh'), 'utf8');
const SITE_LINE = 'site=https://my.sh\n';
const RELEASES_LINE = 'releases=https://github.com/agenticode/my/releases/download\n';
const PLATFORMS = [['linux', 'amd64'], ['linux', 'arm64'], ['darwin', 'arm64']];

const shells = ['/bin/sh', ...['/bin/dash', '/usr/bin/dash', '/opt/homebrew/bin/dash'].filter(existsSync).slice(0, 1)];

let work, server, base, script, cert;
const files = new Map(); // path on the server -> body
const hits = [];

const sha = (b) => createHash('sha256').update(b).digest('hex');

// A release with an archive per platform; `my` prints `my <version> (test)`.
function release(version, dir) {
  const archives = [];
  const sums = [];
  for (const [os, arch] of PLATFORMS) {
    const name = `my_${version}_${os}_${arch}`;
    const stage = join(work, 'stage', name);
    mkdirSync(stage, { recursive: true });
    writeFileSync(join(stage, 'my'), `#!/bin/sh\necho "my ${version} (test)"\n`);
    chmodSync(join(stage, 'my'), 0o755);
    writeFileSync(join(stage, 'LICENSE'), 'test\n');
    const tgz = join(work, 'stage', `${name}.tar.gz`);
    execFileSync('tar', ['-czf', tgz, '-C', join(work, 'stage'), name], { env: { ...process.env, COPYFILE_DISABLE: '1' } });
    const body = readFileSync(tgz);
    files.set(`${dir}/${version}/${name}.tar.gz`, body);
    archives.push({ os, arch, file: `${name}.tar.gz`, url: `${base}${dir}/${version}/${name}.tar.gz`, size: body.length, sha256: sha(body) });
    sums.push(`${sha(body)}  ${name}.tar.gz`);
  }
  files.set(`${dir}/${version}/SHA256SUMS`, Buffer.from(`${sums.join('\n')}\n`));
  return archives;
}

function releaseJSON(version, archives) {
  return releaseText({
    name: 'MemorY', version, date: '2026-01-02', published: '2026-01-02T03:04:05Z', commit: '0'.repeat(40),
    repository: 'https://github.com/agenticode/my', notes: `${base}/notes`,
    sums: { file: 'SHA256SUMS', url: `${base}/download/${version}/SHA256SUMS`, size: 1 },
  }, archives);
}

// Runs the script on standard input. env: extra variables; uname: [s, m]; translated: sysctl answer.
// path: the PATH after the directory of the replaced uname and sysctl.
function run({ shell = '/bin/sh', env = {}, uname = ['Linux', 'x86_64'], translated = '0', home, path = '/usr/bin:/bin:/usr/sbin:/sbin' } = {}) {
  home ??= mkdtempSync(join(work, 'home-'));
  const shim = mkdtempSync(join(work, 'shim-'));
  writeFileSync(join(shim, 'uname'), `#!/bin/sh\ncase "$1" in -s) echo '${uname[0]}' ;; -m) echo '${uname[1]}' ;; *) exec /usr/bin/uname "$@" ;; esac\n`);
  writeFileSync(join(shim, 'sysctl'), `#!/bin/sh\necho '${translated}'\n`);
  chmodSync(join(shim, 'uname'), 0o755);
  chmodSync(join(shim, 'sysctl'), 0o755);
  const tmp = mkdtempSync(join(work, 'tmp-'));
  const full = {
    PATH: `${shim}:${path}`, HOME: home, TMPDIR: tmp,
    CURL_CA_BUNDLE: cert, SSL_CERT_FILE: cert, LANG: 'C', ...env,
  };
  return new Promise((resolve, reject) => {
    const child = spawn(shell, [], { env: full, stdio: ['pipe', 'pipe', 'pipe'] });
    let out = '', err = '';
    child.stdout.on('data', (c) => { out += c; });
    child.stderr.on('data', (c) => { err += c; });
    child.on('error', reject);
    child.on('close', (code) => resolve({ code, out, err, home, tmp, left: readdirSync(tmp) }));
    child.stdin.end(script);
  });
}

before(async () => {
  work = mkdtempSync(join(tmpdir(), 'get-test-'));
  execFileSync('openssl', ['req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-days', '1', '-subj', '/CN=127.0.0.1',
    '-addext', 'subjectAltName=IP:127.0.0.1', '-keyout', join(work, 'key.pem'), '-out', join(work, 'cert.pem')], { stdio: 'ignore' });
  cert = join(work, 'cert.pem');
  server = createServer({ key: readFileSync(join(work, 'key.pem')), cert: readFileSync(cert) }, (req, res) => {
    hits.push(req.url);
    const body = files.get(req.url);
    if (!body) { res.writeHead(404); res.end('not found'); return; }
    res.writeHead(200);
    res.end(body);
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  base = `https://127.0.0.1:${server.address().port}`;

  assert.equal(SCRIPT.split(SITE_LINE).length, 2, 'get.sh sets site= once');
  assert.equal(SCRIPT.split(RELEASES_LINE).length, 2, 'get.sh sets releases= once');
  script = SCRIPT.replace(SITE_LINE, `site=${base}\n`).replace(RELEASES_LINE, `releases=${base}/download\n`);

  const current = release('v9.9.9', '/download');
  files.set('/release.json', Buffer.from(releaseJSON('v9.9.9', current)));
  release('v9.9.8', '/download');
});

after(() => {
  server?.close();
  if (work) rmSync(work, { recursive: true, force: true });
});

for (const shell of shells) {
  test(`${shell}: installs the version of release.json into ~/.local/bin`, async () => {
    for (const [uname, translated, want] of [
      [['Linux', 'x86_64'], '0', 'linux/amd64'],
      [['Linux', 'aarch64'], '0', 'linux/arm64'],
      [['Darwin', 'arm64'], '0', 'darwin/arm64'],
      [['Darwin', 'x86_64'], '1', 'darwin/arm64'], // a shell under Rosetta
    ]) {
      hits.length = 0;
      const r = await run({ shell, uname, translated });
      assert.equal(r.code, 0, r.err);
      assert.match(r.out, new RegExp(`^MemorY v9\\.9\\.9 for ${want}$`, 'm'));
      assert.match(r.out, /^SHA-256 [0-9a-f]{64} matches SHA256SUMS and release\.json$/m);
      assert.match(r.out, /is not in your PATH/);
      assert.match(r.out, /^ {2}export PATH="\$HOME\/\.local\/bin:\$PATH"$/m);
      assert.match(r.out, /my v9\.9\.9 \(test\)\n$/, 'ends with the output of my version');
      const [os, arch] = want.split('/');
      assert.deepEqual(hits, ['/release.json', `/download/v9.9.9/my_v9.9.9_${os}_${arch}.tar.gz`, '/download/v9.9.9/SHA256SUMS']);
      assert.equal(execFileSync(join(r.home, '.local', 'bin', 'my'), ['version'], { encoding: 'utf8' }), 'my v9.9.9 (test)\n');
      assert.deepEqual(readdirSync(join(r.home, '.local', 'bin')), ['my']);
      assert.deepEqual(r.left, [], 'the temporary directory is removed');
    }
  });

  test(`${shell}: a wrong checksum in SHA256SUMS stops the install`, async () => {
    const key = '/download/v9.9.9/SHA256SUMS';
    const good = files.get(key);
    const text = good.toString().replace(/^[0-9a-f]{64}(?=  my_v9\.9\.9_linux_amd64)/m, (h) => (h[0] === '0' ? '1' : '0') + h.slice(1));
    files.set(key, Buffer.from(text));
    try {
      const home = mkdtempSync(join(work, 'home-'));
      mkdirSync(join(home, '.local', 'bin'), { recursive: true });
      writeFileSync(join(home, '.local', 'bin', 'my'), 'old\n');
      const r = await run({ shell, home });
      assert.equal(r.code, 1);
      assert.match(r.err, /^my install: checksum mismatch: SHA256SUMS says [0-9a-f]{64}, the downloaded my_v9\.9\.9_linux_amd64\.tar\.gz has [0-9a-f]{64}; nothing installed$/m);
      assert.doesNotMatch(r.out, /Installed/);
      assert.equal(readFileSync(join(home, '.local', 'bin', 'my'), 'utf8'), 'old\n', 'the installed my is left as it was');
      assert.deepEqual(readdirSync(join(home, '.local', 'bin')), ['my']);
      assert.deepEqual(r.left, []);
    } finally {
      files.set(key, good);
    }
  });

  test(`${shell}: a checksum that differs from release.json stops the install`, async () => {
    const good = files.get('/release.json');
    files.set('/release.json', Buffer.from(good.toString().replace(/("file":"my_v9\.9\.9_linux_arm64\.tar\.gz".*"sha256":")[0-9a-f]{64}/, `$1${'0'.repeat(64)}`)));
    try {
      const r = await run({ shell, uname: ['Linux', 'aarch64'] });
      assert.equal(r.code, 1);
      assert.match(r.err, /release\.json says 0{64}, the downloaded my_v9\.9\.9_linux_arm64\.tar\.gz has [0-9a-f]{64}; nothing installed/);
      assert.equal(existsSync(join(r.home, '.local', 'bin', 'my')), false);
      assert.deepEqual(r.left, []);
    } finally {
      files.set('/release.json', good);
    }
  });

  test(`${shell}: MY_VERSION and MY_INSTALL_DIR`, async () => {
    hits.length = 0;
    const home = mkdtempSync(join(work, 'home-'));
    const dir = join(home, 'tools', 'bin');
    const other = mkdtempSync(join(work, 'other-'));
    writeFileSync(join(other, 'my'), '#!/bin/sh\necho other\n');
    chmodSync(join(other, 'my'), 0o755);
    const r = await run({ shell, home, env: { MY_VERSION: '9.9.8', MY_INSTALL_DIR: `${dir}/` }, path: `${other}:${dir}:/usr/bin:/bin:/usr/sbin:/sbin` });
    assert.equal(r.code, 0, r.err);
    assert.ok(!hits.includes('/release.json'), 'a pinned version does not read release.json');
    assert.match(r.out, /^SHA-256 [0-9a-f]{64} matches SHA256SUMS$/m);
    assert.match(r.out, new RegExp(`^Installed ${dir.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}/my$`, 'm'));
    assert.doesNotMatch(r.out, /not in your PATH/);
    assert.match(r.out, new RegExp(`^Note: ${other.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}/my comes before`, 'm'));
    assert.match(r.out, /my v9\.9\.8 \(test\)\n$/);
  });

  test(`${shell}: refusals`, async () => {
    for (const [what, opts, code, msg] of [
      ['FreeBSD', { uname: ['FreeBSD', 'amd64'] }, 1, /^my install: no archive for FreeBSD amd64\. Archives exist for linux\/amd64, linux\/arm64 and darwin\/arm64/m],
      ['32-bit ARM', { uname: ['Linux', 'armv7l'] }, 1, /no archive for Linux armv7l/],
      ['Intel Mac', { uname: ['Darwin', 'x86_64'], translated: '0' }, 1, /no archive for Darwin x86_64/],
      ['a release that does not exist', { env: { MY_VERSION: 'v0.0.1' } }, 1, /could not download https:\/\/127\.0\.0\.1:\d+\/download\/v0\.0\.1\/my_v0\.0\.1_linux_amd64\.tar\.gz/],
      ['not a version', { env: { MY_VERSION: 'v1.0.0/../x' } }, 1, /not a version: v1\.0\.0\/\.\.\/x/],
      ['a short version', { env: { MY_VERSION: 'v1' } }, 1, /not a version: v1 \(the form is v1\.0\.0\)/],
    ]) {
      const r = await run({ shell, ...opts });
      assert.equal(r.code, code, `${what}: ${r.err}`);
      assert.match(r.err, msg, what);
      assert.equal(existsSync(join(r.home, '.local', 'bin', 'my')), false, what);
      assert.deepEqual(r.left, [], what);
    }
  });

  test(`${shell}: release.json without a usable version`, async () => {
    const good = files.get('/release.json');
    try {
      for (const [text, msg] of [
        [good.toString().replace('"version": "v9.9.9"', '"version": "v9.9.9; rm -rf ~"'), /not a version: v9\.9\.9; rm -rf ~/],
        ['{}\n', /release\.json names no version/],
      ]) {
        files.set('/release.json', Buffer.from(text));
        const r = await run({ shell });
        assert.equal(r.code, 1, r.err);
        assert.match(r.err, msg);
      }
      files.delete('/release.json');
      const r = await run({ shell });
      assert.equal(r.code, 1);
      assert.match(r.err, /could not download https:\/\/127\.0\.0\.1:\d+\/release\.json/);
    } finally {
      files.set('/release.json', good);
    }
  });
}

test('the committed release.json has the form the script reads', () => {
  const text = readFileSync(join(root, 'site', 'release.json'), 'utf8');
  const rel = JSON.parse(text);
  assert.equal(releaseText(Object.fromEntries(Object.entries(rel).filter(([k]) => k !== 'archives')), rel.archives), text,
    'site/release.json is written by tools/release.mjs');
  // the sed expressions of get.sh, run on the file
  const version = execFileSync('sed', ['-n', 's/^[[:space:]]*"version":[[:space:]]*"\\([^"]*\\)".*/\\1/p', join(root, 'site', 'release.json')], { encoding: 'utf8' }).trim();
  assert.equal(version, rel.version);
  for (const a of rel.archives) {
    const pattern = a.file.replace(/\./g, '\\.');
    const got = execFileSync('sed', ['-n', `/"file":[[:space:]]*"${pattern}"/s/.*"sha256":[[:space:]]*"\\([0-9a-f]*\\)".*/\\1/p`, join(root, 'site', 'release.json')], { encoding: 'utf8' }).trim();
    assert.equal(got, a.sha256, a.file);
    assert.equal(a.file, `my_${rel.version}_${a.os}_${a.arch}.tar.gz`);
    assert.match(a.sha256, /^[0-9a-f]{64}$/);
  }
});
