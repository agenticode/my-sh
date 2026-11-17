# my.sh

Source of <https://my.sh>, the project site for [MemorY](https://github.com/agenticode/my).

The site has two pages in two languages, Korean in `site/ko/` and English in `site/en/`: the overview (`index.html`) and the download page (`download/index.html`), and a `404.html` for each language. `site/get.sh` is the install script and `site/release.json` the current release (see [Release and install script](#release-and-install-script)). There is no build step and no framework. The pages make no requests to other hosts: fonts, styles and scripts are all served from `site/`.

## Preview

Serve `site/` as the web root. Asset paths are absolute (`/css/site.css`, `/fonts/...`), so opening `index.html` from disk does not work.

```
python3 -m http.server -d site 8599
```

Then open <http://127.0.0.1:8599/ko/>, <http://127.0.0.1:8599/en/> or the download pages under them (`/ko/download/`). The page at `/` is picked by the production server (see [Languages](#languages)); a plain file server has none.

The production server sends `script-src 'self'`, so scripts go in files under `site/js/`. Inline `<script>` blocks do not run.

## Menu and text

The top menu has three entries in both languages: the overview (`/ko/`, `/en/`), the download page (`/ko/download/`, `/en/download/`) and the blog (<https://linux.io/> for Korean, <https://linux.io/en/> for English, in the same tab). The link of the page itself carries `aria-current="page"`. On phones (44rem and narrower) the menu moves to a second row of the banner.

Sentences that belong together in a short block go on a line each: the block gets the class `lines` and every sentence its own `<span>` (`<p class="lines"><span>...</span><span>...</span></p>`). Longer explanations stay paragraphs, one subject per paragraph.

## Release and install script

`site/release.json` describes the current release of MemorY: its version, date, commit and release notes, and for each archive the file name, URL, size and SHA-256. The download pages and the install script read it when they run: `site/js/download.js` fills the pages in the browser, and `site/get.sh`, served as text at `https://my.sh/get`, takes its version and checksums from it. A new release changes only this file:

```
node tools/release.mjs v1.1.0
```

The script reads the release from the GitHub API, downloads `SHA256SUMS` and every archive named `my_<version>_<os>_<arch>.tar.gz`, and writes the file only when each archive matches its line in `SHA256SUMS`, the digest GitHub keeps for it and its size. Without a tag it takes the latest release. Commit the file and deploy.

`site/get.sh` is a POSIX `sh` script. It picks the archive for linux/amd64, linux/arm64 or darwin/arm64 and stops with exit status 1 on any other system. It downloads the archive and `SHA256SUMS` from the GitHub release over HTTPS, compares the archive's SHA-256 with `SHA256SUMS` and with `release.json`, and stops on a difference. It installs `my` into `~/.local/bin` (`MY_INSTALL_DIR` picks another directory) without sudo, prints the line to add when that directory is not in `PATH`, and runs `my version`. `MY_VERSION` installs another version, checked against `SHA256SUMS` only. The download pages show the script as the server sends it.

```
node --test
shellcheck -s sh site/get.sh
```

The tests run the script under `/bin/sh` and, when it is installed, `dash`, against a local HTTPS server with a made-up release: an install for each platform, a wrong checksum in `SHA256SUMS` and in `release.json`, a pinned version and directory, systems without an archive, and a broken `release.json`. They need curl, tar and openssl.

## After editing CSS or JS

```
node tools/stamp.mjs
```

The server lets browsers cache `site/css/` and `site/js/` for one hour. The script rewrites the `?v=` value on the link and script tags of every page under `site/` from each file's content, so an edited file is fetched again right away. `node tools/stamp.mjs --check` exits with 1 when a value is out of date.

## Logo motion

On the first visit in a tab the page opens with MemorY in the center, folds it to MY.sh and moves it into the banner in about 3.2 s. Any scroll, click or key press ends it at once. It runs once per tab session (`sessionStorage` key `my.intro`), and it is skipped for links with a `#hash` and under `prefers-reduced-motion: reduce`.

The banner logo loops between MemorY and MY.sh every 7.2 s. It animates only `transform` and `opacity`, pauses on hover and stands still as MY.sh under reduced motion. Timings are in `site/css/site.css` (`lp-*` keyframes) and at the top of the intro code in `site/js/site.js`.

## Captures

The overview is the hero and then the captures, one under another at the full width of the page, in this order: board, topology bars, address map, repair, same cell, another DIMM each boot, verdict card, preflight, report, board in the report, population, SPD. On screens up to 30rem the hero screen and the captures reach both edges.

Under the hero screen and under each capture is a caption (`<figcaption class="cap">`): a title of two to five words and one line on the problem the screen solves, in small muted text. The captions are written by hand from what the screen shows. `tools/captures.mjs` leaves them as they are, so reread them when a screen changes.

Every terminal screen on the page is output of MemorY: the figure images in `site/captures/` and the text block of the hero (the slot map and DIMM table). One command makes all of them:

```
node tools/captures.mjs --repo ../my
```

The script clones the MemorY repository at `origin/main` (`--ref` picks another commit), builds it with `make build`, and runs each command on the lab captures in its `testdata/real`, once per page language. Every command runs in a pseudo-terminal of a fixed width with the locale of that language, `ko_KR.UTF-8` or `en_US.UTF-8` (`tools/ptyrun.py`), so the tool picks its colours, width and language as it does at a terminal. The output is used as printed. A figure may leave out whole lines: `keep` ends a run at a line, `from` starts it at one, `crop` keeps a range and `drop` leaves out the lines that match a pattern. Then the script

- renders each figure with Chrome and writes `site/captures/<lang>/<name>.webp`, 1600 px wide;
- writes two reports with `my report --root` and takes a crop of section 2 of each with Playwright's Chromium (see below);
- writes the path, width and height of each image into its `<figure>` in `site/<lang>/index.html`, and the ratio of the frame when it is not 16:10;
- replaces the `<pre>` between `<!-- run:NAME -->` and `<!-- /run:NAME -->` in `site/<lang>/index.html`;
- writes nothing when an output holds a path of the machine it ran on.

`--lang ko` or `--lang en` makes one language only. Every figure of one pane is taken at 80 columns, so the text of each comes out at the same size on the page. Some runs print longer lines in one language and get a wider terminal there: the address maps 60 columns in English (Korean 58), the hero 53 (Korean 52).

The hero shows `my --root 6.19.10-ghes-multi` from the line of the host finding to the end of the DIMM table, without the legend of the slot map (the table names the grade of each DIMM in the colour of its slot). Its font size follows the width of its box, so all 52 or 53 columns fit: about 11 px on a 390 px phone and 14 px from 768 px on.

The crops of a report (`CROPS` in the script) are taken in a window 1280 CSS px wide, the window of the report capture. A crop runs from the heading of section 2 to the end of the board and stands 24 px outside what it shows at the left and right; it is taken at the scale that makes it 1600 px wide. For `report-board` the pointer rests on the stick of `CPU0_D1`, on its right edge a quarter down, so the card of that module opens beside the stick. `population` keeps the block "Population" under the board, up to its third finding with the line that names the document. The script stops when the card does not open, when the block is missing or when the report logs an error. Playwright is loaded from the local or the global npm packages.

`--shots DIR` keeps the PNG of each figure (in `DIR/<lang>/`) and the raw output of each run. It needs git, make, Go, python3, cwebp, Chrome (`CHROME` if Chrome is not in the default macOS location) and Playwright with its Chromium.

| Figure | File | Commands, in `testdata/real` unless named |
| --- | --- | --- |
| Board | `board.webp` | `my board --root 6.19.10-ghes-multi` |
| Topology bars | `dimm.webp` | `my dimm --root 6.19.10-ghes-multi CPU0_B1` |
| Address map | `address-map.webp` | `my map --root 6.19.10-ghes-multi` for CPU0_A1, CPU0_D1, CPU0_B1 and CPU0_E1 |
| Same cell | `boots-same.webp` | in `6.19.10-bert-loop`: `my open var/lib/my/ledger.db boots 'DIMM 0'` |
| Another DIMM each boot | `boots-spread.webp` | in `6.19.10-ghes-loop-spread`: `my open var/lib/my/ledger.db boots`, then `... why --oneline \| tail -n 1` |
| Verdict card | `verdict-card.webp` | in `6.19.10-bert-loop`: `my open var/lib/my/ledger.db why 'DIMM 0'` |
| Preflight | `preflight.webp` | `my preflight --root 6.19.10-bert-loop` |
| Repair | `repair.webp` | `my dimm --root 7.3.0-cxl-repair` for `cxl:mem1` (quiet after its repair) and `cxl:mem0` (errors again), each up to its bars |
| Report | `report.webp` | `my import 6.19.10-ghes-multi 6.19.10-ghes-multi/journal-all.json`, then `my report` of that bundle |
| Board in the report | `report-board.webp` | `my report --root 6.19.10-ghes-multi`, section 2 with the card of `CPU0_D1` open |
| Population | `population.webp` | in `testdata/explorer`: `my report --root population-demo`, section 2 with the marks of the vendor's table and the block "Population" |
| SPD | `spd.webp` | in `testdata/spd`: `my spd --root demo` (public SPD dumps replayed with a serial number and a week per slot; no server was read) |

Until an image loads, its frame is empty; an image that fails to load is hidden. The server caches images for one hour, so a replaced file can take that long to show.

The text blocks keep the colours of the run as classes (`b` bold, `d` dim, `c31` to `c36` for the colours). A terminal column is one `ch` of Geist Mono. Box and block characters come from a subset of JetBrains Mono that has the same advance. Hangul comes from the reader's system font (`Term Ko` in `site/css/site.css`, `size-adjust: 118%`); `site/js/site.js` measures it and spaces each character to two columns. The figure pages of `tools/captures.mjs` use the same fonts and the same measurement.

## Share image and icons

```
node tools/render.mjs
```

This renders `tools/og.svg` to `site/og.png` and `tools/og-en.svg` to `site/og-en.png` (1200 x 630, the share images of the Korean and the English page), and `site/favicon.svg` to `site/apple-touch-icon.png` and `site/favicon.ico` with a local Chrome. Set `CHROME` to the browser binary if it is not in the default macOS location. Run it after editing either SVG and commit the output.

## Fonts

SUIT Variable 2.040, Geist Mono 1.400 and a subset of JetBrains Mono 2.304, all under the SIL Open Font License 1.1. The license texts are next to the files in `site/fonts/`.

The JetBrains Mono file holds the 160 characters of U+2500 to U+259F (box drawing and block elements), which Geist Mono lacks. It was cut from `JetBrainsMono-Regular.ttf` of the release archive `JetBrainsMono-2.304.zip` with fontTools 4.68:

```
pyftsubset JetBrainsMono-Regular.ttf --unicodes=U+2500-259F --flavor=woff2 \
  --layout-features='' --no-hinting --desubroutinize --name-IDs='*' \
  --output-file=JetBrainsMono-Blocks-2.304.woff2
```

The server caches `/fonts/` as immutable. The file names carry the font version for that reason: a changed font file needs a new name and a matching edit in `site/css/site.css` and the preload links in `site/ko/index.html` and `site/en/index.html`.

## Languages

Paths under `/ko/` and `/en/` always serve their language. Each page names both languages in `<link rel="alternate" hreflang>` (with `x-default` for the path without a prefix), has its own canonical URL, and has a switch in the banner: `/?lang=ko` and `/?lang=en` on the overview and the 404 page, `/download/?lang=ko` and `/download/?lang=en` on the download page.

The server picks the page for `/`, `/download/` and every other path outside `/ko/` and `/en/` (also `/404` and a missing page) in this order:

1. The `lang` cookie. `?lang=ko` or `?lang=en` on any path sets it for one year (`SameSite=Lax`) and redirects to the same path without the language prefix: `/?lang=en` goes to `/`, `/download/?lang=en` and `/ko/download/?lang=en` to `/download/`. A path with characters other than letters, digits, `.`, `_`, `~`, `-` and `/` is sent to `/`.
2. The address of the visitor. Addresses in the Korean ranges get Korean; all others get English. The ranges are the aggregated KR zones of [ipdeny](https://www.ipdeny.com/ipblocks/), IPv4 and IPv6. The server keeps a copy next to itself and downloads them once a day; a download that fails, has a line that is not a range, or is much shorter than usual (fewer than 900 IPv4 or 100 IPv6 ranges) is dropped and the last good copy stays. Addresses of the server's own network count as Korean, because the server stands in Korea and its local network reaches it through the router.
3. On any error (no list, an unreadable address, a cookie other than `ko` or `en`) the English page, and one line in the server log.

The page at `/` is sent with `Vary: Cookie`, `Cache-Control: private, no-cache` and `Content-Language`. For `/get` the server sends `site/get.sh` as `text/plain`; the script and `release.json` are revalidated on every request, as the pages are. The server behind <https://my.sh> is not part of this repository.

## Deploy

<https://my.sh> serves a clone of `main`. After a merge:

```
git -C ~/mysh-live pull --ff-only
```

The server reads files on each request, so no restart is needed.
