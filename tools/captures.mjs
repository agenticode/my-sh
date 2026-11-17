#!/usr/bin/env node
// Makes every terminal screen of the page from real runs of MemorY.
//
//   node tools/captures.mjs [--repo DIR] [--ref REF] [--no-fetch] [--shots DIR]
//
// It clones the MemorY repository at REF (default origin/main of ../my), builds
// it with `make build`, and runs the commands listed below on the lab captures
// in its testdata/real, once for each page language. Every command runs in a
// pseudo-terminal of a fixed width with the locale of that language
// (tools/ptyrun.py), so the tool chooses colours, width and language as it does
// for a person at a terminal. What it printed is used as it is; a figure may
// leave out whole lines (the `keep` of a run).
//
//   figures   site/captures/<lang>/<name>.webp, 1600 px wide, one per figure slot
//   blocks    the <pre> between <!-- run:NAME --> and <!-- /run:NAME --> in
//             site/<lang>/index.html, as text with the colours of the run
//
// A run may also leave out lines by pattern (`drop`), start at a line
// (`from`), and a pane may show no prompt (`prompt: false`). A figure marked
// `inline` is an image the page shows without a figure frame; the page gives
// its size, and the run does not touch the page for it.
//
// The crops of the report (CROPS) are taken with Playwright and its Chromium,
// because a card of the board opens only under the pointer.
//
// --lang ko or --lang en makes one language only; the default is both.
//
// Needs git, make, Go, python3, cwebp, Chrome (set CHROME if it is not in
// the default macOS location) and Playwright (local or global npm package). With --shots DIR the PNG of each figure and the
// raw output of each run are kept in DIR for review.

import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync, copyFileSync } from 'node:fs';
import { homedir, tmpdir, userInfo } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const site = join(root, 'site');

// ---- what the page shows ----------------------------------------------------

const MULTI = '6.19.10-ghes-multi'; // six DIMMs, four fault shapes
const REPAIR = '7.3.0-cxl-repair'; // two CXL devices, a soft PPR of one row each
const LOOP = '6.19.10-bert-loop'; // the same cell in three boots
const SPREAD = '6.19.10-ghes-loop-spread'; // every boot another DIMM
const POPULATION = 'population-demo'; // in testdata/explorer: two modules in slots the vendor's table leaves empty
const SPD = 'demo'; // in testdata/spd: eight DDR5 modules with public SPD dumps

// The page languages and the locale their runs get.
const LANGS = { ko: 'ko_KR.UTF-8', en: 'en_US.UTF-8' };

// keep: which lines of the output a figure shows. Lines are counted from 1,
// as the command printed them (before the terminal wraps a long line). A keep
// that depends on the words of the output is given per language.
const before = (re) => (lines) => { const i = lines.findIndex((l) => re.test(l)); return i < 0 ? lines.length : i; };
const each = (ko, en) => ({ ko, en });
const hint = /^ ?my (open |dimm |boots |why |help)|: (이 DIMM|판정 근거|판독법|examination of)/;

// A map ends before the sentence about its fault.
function mapKeep(ko) { return each(before(ko), before(/^ \S+ fault at /)); }

// The page shows the figures one under another at its full width. Every figure of one
// pane is taken at 80 columns, so the text of each comes out at the same size.
const FIGURES = [
  {
    // Where each DIMM sits: the CPU, the banks beside it, every slot by socket and channel.
    name: 'board', dir: 'testdata/real', cols: 80, size: 'auto',
    panes: [[{ runs: [{ argv: ['my', 'board', '--root', MULTI] }] }]],
  },
  {
    name: 'dimm', dir: 'testdata/real', cols: 80, size: 'auto',
    panes: [[{ runs: [{ argv: ['my', 'dimm', '--root', MULTI, 'CPU0_B1'], keep: each(before(/row x column/), before(/row by column/)) }] }]],
  },
  {
    // In English the head of a map over one row is 59 columns wide.
    name: 'address-map', dir: 'testdata/real', cols: each(58, 60), size: 'auto',
    panes: [
      [{ runs: [{ argv: ['my', 'map', '--root', MULTI, 'CPU0_A1'], keep: mapKeep(/고장\(/) }] },
        { runs: [{ argv: ['my', 'map', '--root', MULTI, 'CPU0_D1'], keep: mapKeep(/고장\(/) }] }],
      [{ runs: [{ argv: ['my', 'map', '--root', MULTI, 'CPU0_B1'], keep: mapKeep(/^ \S+ 고장\(/) }] },
        { runs: [{ argv: ['my', 'map', '--root', MULTI, 'CPU0_E1'], keep: mapKeep(/^ \S+ 고장\(/) }] }],
    ],
  },
  {
    name: 'boots-same', dir: `testdata/real/${LOOP}`, cols: 80, size: 'auto',
    panes: [[{ runs: [{ argv: ['my', 'open', 'var/lib/my/ledger.db', 'boots', 'DIMM 0'], keep: before(hint) }] }]],
  },
  {
    name: 'boots-spread', dir: `testdata/real/${SPREAD}`, cols: 80, size: 'auto',
    panes: [[{ runs: [
      { argv: ['my', 'open', 'var/lib/my/ledger.db', 'boots'], keep: before(/^ · /) },
      { shell: 'my open var/lib/my/ledger.db why --oneline | tail -n 1' },
    ] }]],
  },
  {
    name: 'verdict-card', dir: `testdata/real/${LOOP}`, cols: 80, size: 'auto',
    panes: [[{ runs: [{ argv: ['my', 'open', 'var/lib/my/ledger.db', 'why', 'DIMM 0'] }] }]],
  },
  {
    name: 'preflight', dir: 'testdata/real', cols: 80, size: 'auto',
    panes: [[{ runs: [{ argv: ['my', 'preflight', '--root', LOOP] }] }]],
  },
  {
    // A repair that held and one that did not: the card of each CXL device.
    name: 'repair', dir: 'testdata/real', cols: 80, size: 'auto',
    panes: [
      [{ runs: [{ argv: ['my', 'dimm', '--root', REPAIR, 'cxl:mem1'], keep: each(before(/안에서 오류가 몰린/), before(/^ where the errors sit/)) }] }],
      [{ runs: [{ argv: ['my', 'dimm', '--root', REPAIR, 'cxl:mem0'], keep: each(before(/안에서 오류가 몰린/), before(/^ where the errors sit/)) }] }],
    ],
  },
  {
    // What each module says in its SPD: the demo case replays public SPD dumps, no server was read.
    name: 'spd', dir: 'testdata/spd', cols: 80, size: 'auto',
    panes: [[{ runs: [{ argv: ['my', 'spd', '--root', SPD] }] }]],
  },
];

// The report: the first screen of the HTML file, at 1280 x 800 CSS pixels. The case is the copy of
// the host with the kernel messages of all three boots its journal kept.
const REPORT = {
  name: 'report', dir: 'testdata/real',
  import: ['my', 'import', MULTI, `${MULTI}/journal-all.json`, '-o'],
  argv: ['my', 'report'],
};

// Parts of a report as a reader sees them in a browser 1280 CSS pixels wide, the
// window of the report capture: section 2 from its heading (without the rule
// above it) to the end of the board, cut 24 px outside what it shows. `hover` puts the
// pointer on the stick of a slot, so the card of that module is open; `block`
// also keeps the block of population findings under the board, up to that many
// findings. Each crop is taken at the scale that makes it 1600 px wide.
const CROPS = [
  { name: 'report-board', dir: 'testdata/real', root: MULTI, hover: 'CPU0_D1' },
  { name: 'population', dir: 'testdata/explorer', root: POPULATION, block: 3 },
];

// Blocks of text on the page.
const BLOCKS = [
  // The hero: which DIMM, what shape, what to do, in as few columns as the
  // table takes.
  // The legend of the slot map is left out: the table names the grade of
  // each DIMM in the colour of its slot.
  { name: 'hero', dir: 'testdata/real', cols: each(52, 53), cls: 'term-hero', label: each('my 실행 결과: 슬롯 맵과 DIMM 표', 'Output of my: slot map and DIMM table'),
    runs: [{ argv: ['my', '--root', MULTI], from: /^(호스트 소견|host finding)/, drop: /^ [▓▒░█]{2} |^ \d+ slots?, \d+ DIMMs?$/,
      keep: each(before(/^ 오류 없는 DIMM/), before(/^ \d+ DIMMs? without errors/)) }] },
];

// The look of a terminal block; site/css/site.css has the same rules for the page.
// Hangul comes from a Korean font of the reader's system, a little larger than
// its own size so that it fills more of its two columns.
const KO_RANGE = 'unicode-range:U+1100-11FF,U+3130-318F,U+AC00-D7A3';
const TERM_KO = `@font-face{font-family:"Term Ko";font-weight:400;size-adjust:118%;${KO_RANGE};src:local("AppleSDGothicNeo-Regular"),local("Apple SD Gothic Neo"),local("NotoSansKR-Regular"),local("Noto Sans KR"),local("NotoSansCJKkr-Regular"),local("Malgun Gothic")}
@font-face{font-family:"Term Ko";font-weight:700;size-adjust:118%;${KO_RANGE};src:local("AppleSDGothicNeo-Bold"),local("NotoSansKR-Bold"),local("NotoSansCJKkr-Bold"),local("Malgun Gothic Bold")}`;
const TERM_CSS = `.term{font-family:"Term Blocks","Geist Mono","Term Ko",ui-monospace,SFMono-Regular,Menlo,Consolas,"Apple SD Gothic Neo","Noto Sans KR","Malgun Gothic",monospace;color:#E6E8EC;font-weight:460}
.term pre{margin:0;font:inherit;line-height:1.42;white-space:pre}
.term .ps{color:#F58025}
.term .w{letter-spacing:var(--kls,.16em);margin-inline:calc(var(--kls,.16em) / 2) calc(var(--kls,.16em) / -2)}
.term .b{font-weight:700}
.term .b .w{letter-spacing:var(--klsb,.16em);margin-inline:calc(var(--klsb,.16em) / 2) calc(var(--klsb,.16em) / -2)}
.term .d{opacity:.55}
.term .c31{color:#FF6B6E}.term .c32{color:#5FD38A}.term .c33{color:#F5A35C}.term .c35{color:#D98CF0}.term .c36{color:#5FC8D9}`;

// Measures how wide Hangul comes out in the font the browser picked and spaces
// it to two columns; site/js/site.js does the same on the page.
const TERM_JS = `function koSpacing(el) {
  const probe = (text, bold) => { const s = document.createElement('span'); s.textContent = text; s.style.cssText = 'position:absolute;visibility:hidden;white-space:pre;font-size:100px;font-weight:' + (bold ? 700 : 460); el.appendChild(s); const w = s.getBoundingClientRect().width; s.remove(); return w; };
  const zero = probe('0000000000') / 10;
  for (const [name, bold] of [['--kls', false], ['--klsb', true]]) el.style.setProperty(name, ((2 * zero - probe('가나다라마바사아자차', bold) / 10) / 100) + 'em');
}`;

// ---- options ----------------------------------------------------------------

const args = process.argv.slice(2);
const opt = (name) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : undefined; };
const repo = resolve(opt('--repo') || process.env.MY_REPO || join(root, '..', 'my'));
const ref = opt('--ref') || 'origin/main';
const shots = opt('--shots') ? resolve(opt('--shots')) : '';
const langs = opt('--lang') ? [opt('--lang')] : Object.keys(LANGS);
for (const l of langs) if (!LANGS[l]) throw new Error(`--lang ${l}: the page languages are ${Object.keys(LANGS).join(', ')}`);
const chrome = process.env.CHROME || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const cwebp = process.env.CWEBP || 'cwebp';

const sh = (cmd, argv, o = {}) => execFileSync(cmd, argv, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'inherit'], ...o });

// One Chromium of Playwright for all crops, started when the first one needs it.
let chromium = null;
const browser = () => (chromium ||= playwright().chromium.launch());

if (!args.includes('--no-fetch')) sh('git', ['-C', repo, 'fetch', '-q', 'origin']);
const sha = sh('git', ['-C', repo, 'rev-parse', '--verify', `${ref}^{commit}`]).trim();
const tmp = mkdtempSync(join(tmpdir(), 'mysh-cap-'));
const src = join(tmp, 'my');
const work = join(tmp, 'work');
mkdirSync(work);
if (shots) mkdirSync(shots, { recursive: true });

try {
  console.log(`MemorY ${sha.slice(0, 12)} (${ref})`);
  sh('git', ['clone', '-q', '--shared', '--no-checkout', repo, src]);
  sh('git', ['-C', src, 'checkout', '-q', '--detach', sha]);
  sh('make', ['-C', src, 'build'], { stdio: ['ignore', 'ignore', 'inherit'] });
  mkdirSync(join(tmp, 'bin'));
  symlinkSync(join(src, 'bin', 'my'), join(tmp, 'bin', 'my'));
  console.log(sh(join(src, 'bin', 'my'), ['version']).trim());

  const outputs = [];
  const pages = {};
  const written = [];
  let seq = 0;

  for (const lang of langs) {
    const env = { PATH: `${join(tmp, 'bin')}:/usr/bin:/bin`, HOME: work, LANG: LANGS[lang], TERM: 'xterm-256color', TZ: 'UTC' };
    const out = join(work, lang);
    mkdirSync(out);
    const sizes = { [REPORT.name]: [1600, 1000] };
    const inline = new Set(FIGURES.filter((f) => f.inline).map((f) => f.name));

    // Runs one command in a terminal of `cols` columns; returns its lines.
    const run = (dir, cols, r) => {
      const argv = r.shell ? ['/bin/sh', '-c', r.shell] : r.argv;
      const file = join(work, `run-${++seq}.ansi`);
      const code = Number(sh('python3', [join(root, 'tools', 'ptyrun.py'), String(cols), file, ...argv], { cwd: join(src, dir), env }).trim());
      const text = readFileSync(file, 'utf8').replace(/\r\n/g, '\n').replace(/\r/g, '');
      if (code < 0 || code >= 64) throw new Error(`${prompt(r)} in ${dir} (${lang}): exit ${code}\n${text}`);
      if (!r.quiet) outputs.push(text);
      if (shots) writeFileSync(join(shots, `run-${seq}.ansi`), `# ${lang} ${dir}$ ${prompt(r)}\n${text}`);
      let lines = text.replace(/\n+$/, '').split('\n');
      const keep = typeof r.keep === 'function' ? r.keep : r.keep?.[lang];
      if (keep) lines = lines.slice(0, keep(lines.map(plain)));
      if (r.from) {
        const a = lines.map(plain).findIndex((l) => r.from.test(l));
        if (a < 0) throw new Error(`${prompt(r)} (${lang}): no line matches ${r.from}`);
        lines = lines.slice(a);
      }
      if (r.crop) {
        const [a, b] = r.crop(lines.map(plain));
        lines = lines.slice(a, b);
      }
      if (r.drop) lines = lines.filter((l) => !r.drop.test(plain(l)));
      // Leaving lines out may put two empty lines together: one is enough.
      lines = lines.filter((l, i) => plain(l).trim() !== '' || i === 0 || plain(lines[i - 1]).trim() !== '');
      while (lines.length && plain(lines[lines.length - 1]).trim() === '') lines.pop();
      return lines;
    };

    // A pane is the prompt and the output of each of its runs.
    const pane = (dir, cols, p) => {
      const rows = [];
      for (const r of p.runs) {
        if (p.prompt !== false) rows.push(`<span class="ps">$ </span>${esc(prompt(r))}`);
        for (const line of run(dir, cols, r)) rows.push(...wrap(cells(line), cols).map(html));
      }
      return rows;
    };

    for (const f of FIGURES) {
      const cols = typeof f.cols === 'object' ? f.cols[lang] : f.cols;
      const panes = f.panes.map((row) => row.map((p) => pane(f.dir, cols, p)));
      const page = join(out, `${f.name}.html`);
      writeFileSync(page, figurePage(f, panes, lang, cols));
      const png = join(out, `${f.name}.png`);
      const [w, h] = f.size === 'auto' ? [1600, autoHeight(page)] : f.size || [1600, 1000];
      sizes[f.name] = [w, h];
      screenshot(page, png, w, h, 1);
      webp(png, join(out, `${f.name}.webp`));
    }

    const report = join(out, 'report.html');
    const bundle = join(out, 'case.mycase');
    run(REPORT.dir, 100, { argv: [...REPORT.import, bundle], quiet: true }); // these print the paths of their files
    run(REPORT.dir, 100, { argv: [...REPORT.argv, bundle, '-o', report], quiet: true });
    outputs.push(readFileSync(report, 'utf8'));
    const rpng = join(out, 'report.png');
    screenshot(report, rpng, 1280, 800, 1.25);
    webp(rpng, join(out, `${REPORT.name}.webp`));

    for (const c of CROPS) {
      const html = join(out, `${c.name}-report.html`);
      run(c.dir, 100, { argv: ['my', 'report', '--root', c.root, '-o', html], quiet: true });
      const png = join(out, `${c.name}.png`);
      const r = await reportCrop(browser(), html, png, c);
      outputs.push(r.text);
      sizes[c.name] = [r.width, r.height];
      webp(png, join(out, `${c.name}.webp`));
    }

    const file = `site/${lang}/index.html`;
    let index = readFileSync(join(root, file), 'utf8');
    for (const b of BLOCKS) {
      const cols = typeof b.cols === 'object' ? b.cols[lang] : b.cols;
      const rows = [];
      for (const r of b.runs) {
        rows.push(`<span class="ps">$ </span>${esc(prompt(r))}`);
        for (const line of run(b.dir, cols, r)) rows.push(...wrap(cells(line), cols).map(html));
      }
      const open = `<!-- run:${b.name} -->`, close = `<!-- /run:${b.name} -->`;
      const a = index.indexOf(open), z = index.indexOf(close);
      if (a < 0 || z < a) throw new Error(`${file} has no ${open} ... ${close}`);
      const block = `<pre class="term term-out${b.cls ? ' ' + b.cls : ''}" tabindex="0" role="region" aria-label="${b.label[lang]}" style="--cols:${cols}"><code>${rows.join('\n')}</code></pre>`;
      index = index.slice(0, a + open.length) + block + index.slice(z);
    }

    // Each figure shows the image of its language, and its frame takes the shape of that image.
    for (const [name, [w, h]] of Object.entries(sizes)) {
      if (inline.has(name)) {
        if (!index.includes(`/captures/${lang}/${name}.webp`)) throw new Error(`${file} does not show captures/${lang}/${name}.webp`);
        continue;
      }
      const at = index.indexOf(`data-capture="${name}"`);
      const end = index.indexOf('</figure>', at);
      if (at < 0 || end < 0) throw new Error(`${file} has no figure data-capture="${name}"`);
      const fig = index.slice(at, end)
        .replace(/<div class="capture-frame"[^>]*>/, w * 10 === h * 16 ? '<div class="capture-frame">' : `<div class="capture-frame" style="--ar:${w} / ${h}">`)
        .replace(/(<img [^>]*?)src="[^"]*"/, `$1src="/captures/${lang}/${name}.webp"`)
        .replace(/(<img [^>]*?)width="\d+" height="\d+"/, `$1width="${w}" height="${h}"`);
      index = index.slice(0, at) + fig + index.slice(end);
    }
    pages[file] = index;
  }

  // Nothing of the machine that made the screens may reach the page.
  const private_ = [tmp, homedir(), `/${userInfo().username}/`].filter((s) => s && s.length > 3);
  for (const text of [...outputs, ...Object.values(pages)]) {
    for (const s of private_) if (text.includes(s)) throw new Error(`output holds "${s}"; nothing written`);
  }
  for (const [file, index] of Object.entries(pages)) writeFileSync(join(root, file), index);
  for (const lang of langs) {
    mkdirSync(join(site, 'captures', lang), { recursive: true });
    if (shots) mkdirSync(join(shots, lang), { recursive: true });
    for (const f of [...FIGURES, REPORT, ...CROPS]) {
      copyFileSync(join(work, lang, `${f.name}.webp`), join(site, 'captures', lang, `${f.name}.webp`));
      if (shots) copyFileSync(join(work, lang, `${f.name}.png`), join(shots, lang, `${f.name}.png`));
      written.push(`captures/${lang}/${f.name}.webp`);
    }
  }
  console.log(`written: ${written.join(', ')}; ${BLOCKS.length} blocks in ${Object.keys(pages).join(', ')}`);
} finally {
  if (chromium) await chromium.then((b) => b.close(), () => {});
  rmSync(tmp, { recursive: true, force: true });
}

// ---- terminal text ----------------------------------------------------------

function plain(s) { return s.replace(/\x1b\[[0-9;]*m/g, ''); }

function esc(s) { return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }

// The command line as a person types it.
function prompt(r) {
  if (r.shell) return r.shell;
  return r.argv.map((a) => (/^[\w./:=@%+-]+$/.test(a) ? a : `'${a.replace(/'/g, `'\\''`)}'`)).join(' ');
}

// Columns a character takes, as MemorY counts them (internal/term/text.go).
function width(cp) {
  if (cp < 0x20 || (cp >= 0x7f && cp < 0xa0)) return 0;
  if (cp >= 0x300 && cp <= 0x36f) return 0;
  if ((cp >= 0x1100 && cp <= 0x115f) || (cp >= 0x2e80 && cp <= 0xa4cf) || (cp >= 0xac00 && cp <= 0xd7a3) ||
      (cp >= 0xf900 && cp <= 0xfaff) || (cp >= 0xfe30 && cp <= 0xfe4f) || (cp >= 0xff00 && cp <= 0xff60) ||
      (cp >= 0xffe0 && cp <= 0xffe6) || (cp >= 0x1f300 && cp <= 0x1faff) || (cp >= 0x20000 && cp <= 0x3fffd)) return 2;
  return 1;
}

// One line of output as cells: a character, its columns and its style.
function cells(line) {
  // Escape sequences other than colours (titles, cursor moves) are not text.
  line = line.replace(/\x1b\][^\x07\x1b]*(\x07|\x1b\\)/g, '').replace(/\x1b\[[0-9;?]*[A-Za-ln-z]/g, '');
  const out = [];
  let bold = false, dim = false, fg = 0;
  for (const tok of line.split(/(\x1b\[[0-9;]*m)/)) {
    const m = /^\x1b\[([0-9;]*)m$/.exec(tok);
    if (m) {
      for (const c of (m[1] || '0').split(';').map(Number)) {
        if (c === 0) { bold = false; dim = false; fg = 0; }
        else if (c === 1) bold = true;
        else if (c === 2) dim = true;
        else if (c === 22) { bold = false; dim = false; }
        else if (c >= 30 && c <= 37) fg = c;
        else if (c === 39) fg = 0;
      }
      continue;
    }
    for (const ch of tok) {
      const w = width(ch.codePointAt(0));
      if (w === 0) continue;
      out.push({ ch, w, st: [bold && 'b', dim && 'd', fg && `c${fg}`].filter(Boolean).join(' ') });
    }
  }
  return out;
}

// A line longer than the terminal continues on the next row, as a terminal shows it.
function wrap(cs, cols) {
  const rows = [[]];
  let n = 0;
  for (const c of cs) {
    if (n + c.w > cols) { rows.push([]); n = 0; }
    rows[rows.length - 1].push(c);
    n += c.w;
  }
  return rows;
}

// Cells as HTML: a span per style, Hangul in its own span so the page can give
// each wide character exactly two columns.
function html(cs) {
  let out = '';
  let i = 0;
  while (i < cs.length) {
    const st = cs[i].st;
    let j = i;
    while (j < cs.length && cs[j].st === st) j++;
    let body = '';
    let k = i;
    while (k < j) {
      const wide = cs[k].w === 2;
      let m = k;
      while (m < j && (cs[m].w === 2) === wide) m++;
      const text = esc(cs.slice(k, m).map((c) => c.ch).join(''));
      body += wide ? `<span class="w">${text}</span>` : text;
      k = m;
    }
    out += st ? `<span class="${st}">${body}</span>` : body;
    i = j;
  }
  return out.replace(/\s+$/, '');
}

// ---- figures ----------------------------------------------------------------

function dataURL(file) { return `data:font/woff2;base64,${readFileSync(file).toString('base64')}`; }

function figurePage(f, panes, lang, cols) {
  const title = `my/${f.dir === '.' ? '' : f.dir}`;
  const grid = panes.map((row) => `<div class="row">${row.map((p) => `<pre style="--cols:${cols}">${p.join('\n')}</pre>`).join('')}</div>`).join('');
  return `<!doctype html><html lang="${lang}"><meta charset="utf-8"><style>
@font-face{font-family:"Term Blocks";src:url(${dataURL(join(site, 'fonts', 'JetBrainsMono-Blocks-2.304.woff2'))}) format("woff2");unicode-range:U+2500-259F}
@font-face{font-family:"Geist Mono";src:url(${dataURL(join(site, 'fonts', 'GeistMono-Variable-1.400.woff2'))}) format("woff2");font-weight:100 900}
${TERM_KO}
${TERM_CSS}
html,body{margin:0;width:100vw;height:100vh;overflow:hidden;background:#16181D}
.bar{height:60px;display:flex;align-items:center;gap:10px;padding:0 26px;background:#1E2128;border-bottom:1px solid #2B2F38;font:480 21px/1 "Geist Mono",monospace;color:#8B909C}
.bar i{width:14px;height:14px;border-radius:50%;background:#3A3E48}
.bar span{margin-left:16px}
.area{position:absolute;inset:61px 0 0 0;padding:34px 46px}
.grid{display:inline-flex;flex-direction:column;font-size:30px}
.row{display:flex}
.row + .row{border-top:1px solid #2B2F38;margin-top:.9em;padding-top:.9em}
pre{width:calc(var(--cols) * 1ch)}
pre + pre{border-left:1px solid #2B2F38;margin-left:1.6ch;padding-left:1.6ch}
</style>
${f.bar === false ? '' : `<div class="bar"><i></i><i></i><i></i><span>${esc(title)}</span></div>`}
<div class="area"${f.bar === false ? ' style="inset:0;display:flex;align-items:center;justify-content:center"' : ''}><div class="grid term">${grid}</div></div>
<script>${TERM_JS}
document.fonts.ready.then(() => {
  koSpacing(document.querySelector('.grid'));
  const g = document.querySelector('.grid'), a = document.querySelector('.area');
  const W = a.clientWidth - 92, H = a.clientHeight - 68;
  let lo = 8, hi = 60;
  for (let i = 0; i < 24; i++) {
    const m = (lo + hi) / 2; g.style.fontSize = m + 'px';
    if (g.scrollWidth > W || g.scrollHeight > H) hi = m; else lo = m;
  }
  g.style.fontSize = lo + 'px';
  // The height at which the text fills the width: 'auto' figures are taken at that height.
  g.style.fontSize = (W / g.scrollWidth * lo) + 'px';
  document.body.dataset.h = Math.ceil(61 + 68 + g.scrollHeight);
  g.style.fontSize = lo + 'px';
});
</script></html>`;
}

function screenshot(page, png, w, h, scale) {
  execFileSync(chrome, ['--headless', '--disable-gpu', '--hide-scrollbars', `--force-device-scale-factor=${scale}`,
    `--window-size=${w},${h}`, '--virtual-time-budget=6000', '--allow-file-access-from-files', `--screenshot=${png}`, pathToFileURL(page).href], { stdio: 'ignore' });
  if (!existsSync(png)) throw new Error(`no screenshot of ${page}`);
}

// The height of an 'auto' figure, clamped between 2.4:1 and 1:1.
function autoHeight(page) {
  const dom = execFileSync(chrome, ['--headless', '--disable-gpu', '--window-size=1600,1000', '--virtual-time-budget=6000',
    '--dump-dom', pathToFileURL(page).href], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], maxBuffer: 64 << 20 });
  const m = /data-h="(\d+)"/.exec(dom);
  if (!m) throw new Error(`no height from ${page}`);
  return Math.min(1600, Math.max(Math.round(1600 / 2.4), Number(m[1])));
}

function webp(png, out) {
  execFileSync(cwebp, ['-quiet', '-q', '90', '-m', '6', png, '-o', out]);
}

// ---- crops of the report ----------------------------------------------------

function playwright() {
  const reqs = [createRequire(import.meta.url)];
  try { reqs.push(createRequire(join(sh('npm', ['root', '-g']).trim(), 'noop.js'))); } catch { /* no npm */ }
  for (const req of reqs) {
    for (const name of ['playwright', '@playwright/test']) {
      try { return req(name); } catch { /* next */ }
    }
  }
  throw new Error('the crops of the report need Playwright: npm install -g playwright, then npx playwright install chromium');
}

// Takes a crop of section 2 of a report (see CROPS) into png; returns its size
// in pixels and the text it shows.
async function reportCrop(launched, html, png, c) {
  const b = await launched;
  // Measured once at scale 1, then taken at the scale that makes the crop 1600 px wide.
  let clip = null;
  for (const scale of [1, 0]) {
    const ctx = await b.newContext({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: scale || 1600 / clip.width });
    try {
      const page = await ctx.newPage();
      const errors = [];
      page.on('pageerror', (e) => errors.push(String(e)));
      page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
      await page.goto(pathToFileURL(html).href);
      await page.evaluate(() => document.fonts.ready);
      // The heading of the section at the top of the window.
      const found = await page.evaluate(() => {
        const fig = document.querySelector('figure.board');
        const h = fig && fig.closest('section') && fig.closest('section').querySelector('h2');
        if (!h) return false;
        window.scrollTo(0, h.getBoundingClientRect().top + window.scrollY - 16);
        return true;
      });
      if (!found) throw new Error(`${c.name}: the report has no board in a section with a heading`);
      if (c.hover) {
        // The pointer on the right edge of the stick, a quarter down: the card opens
        // beside the stick and below the marks of its neighbours.
        const stick = page.locator(`[data-card][aria-label^="${c.hover}:"] rect.cell`).first();
        const s = await stick.boundingBox();
        if (!s) throw new Error(`${c.name}: no stick of ${c.hover} on the board`);
        await page.mouse.move(s.x + s.width - 3, s.y + s.height / 4);
        await page.waitForTimeout(300);
      }
      const box = await page.evaluate(({ hover, block }) => {
        const r = (e) => { const b = e.getBoundingClientRect(); return { top: b.top, bottom: b.bottom, left: b.left, right: b.right }; };
        const fig = document.querySelector('figure.board');
        const sec = fig.closest('section');
        const h = sec.querySelector('h2');
        const parts = [r(fig)];
        const shown = [h, fig];
        let last = fig;
        if (hover) {
          const card = document.getElementById('mx-hover');
          if (!card || card.hidden) return { error: `no card under the pointer on ${hover}` };
          parts.push(r(card));
          shown.push(card);
        }
        if (block) {
          const pop = sec.querySelector('div.population');
          if (!pop) return { error: 'no block of population findings under the board' };
          const items = pop.querySelectorAll('li');
          const end = items.length > block ? r(items[block - 1]).bottom : r(pop).bottom;
          parts.push({ ...r(pop), bottom: end });
          shown.push(pop);
          last = pop;
          for (let e = fig.nextElementSibling; e && e !== pop; e = e.nextElementSibling) shown.push(e);
        }
        // The crop ends half way to what follows, so nothing of the next part shows.
        let next = last.nextElementSibling;
        while (next && (next.hidden || next.getBoundingClientRect().height === 0)) next = next.nextElementSibling;
        const bottom = Math.max(...parts.map((p) => p.bottom));
        const gap = next ? Math.min(16, Math.max(0, (r(next).top - bottom) / 2)) : 16;
        const box = {
          left: Math.min(...parts.map((p) => p.left)) - 24, right: Math.max(...parts.map((p) => p.right)) + 24,
          // From just below the rule above the heading.
          top: r(h).top + parseFloat(getComputedStyle(h).borderTopWidth) + Math.max(0, parseFloat(getComputedStyle(h).paddingTop) - 12),
          bottom: bottom + gap,
        };
        const text = shown.map((e) => e.innerText).join('\n');
        return { box, text, inner: [window.innerWidth, window.innerHeight] };
      }, { hover: c.hover || '', block: c.block || 0 });
      if (box.error) throw new Error(`${c.name}: ${box.error}`);
      if (errors.length) throw new Error(`${c.name}: the report logs errors: ${errors.join('; ')}`);
      const { left, right, top, bottom } = box.box;
      if (left < 0 || top < 0 || right > box.inner[0] || bottom > box.inner[1]) throw new Error(`${c.name}: the crop ${JSON.stringify(box.box)} is not inside the window`);
      if (scale) { clip = { x: left, y: top, width: right - left, height: bottom - top }; continue; }
      await page.screenshot({ path: png, clip });
      const head = readFileSync(png); // the size of a PNG is in its IHDR chunk
      return { width: head.readUInt32BE(16), height: head.readUInt32BE(20), text: box.text };
    } finally {
      await ctx.close();
    }
  }
}
