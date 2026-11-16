# my.sh

Source of <https://my.sh>, the project site for [MemorY](https://github.com/agenticode/my).

The site is one static page in `site/`. There is no build step and no framework. The page makes no requests to other hosts: fonts, styles and scripts are all served from `site/`.

## Preview

Serve `site/` as the web root. Asset paths are absolute (`/css/site.css`, `/fonts/...`), so opening `index.html` from disk does not work.

```
python3 -m http.server -d site 8599
```

Then open <http://127.0.0.1:8599/>.

The production server sends `script-src 'self'`, so scripts go in files under `site/js/`. Inline `<script>` blocks do not run.

## After editing CSS or JS

```
node tools/stamp.mjs
```

The server lets browsers cache `site/css/` and `site/js/` for one hour. The script rewrites the `?v=` value on the link and script tags in `site/*.html` from each file's content, so an edited file is fetched again right away. `node tools/stamp.mjs --check` exits with 1 when a value is out of date.

## Logo motion

On the first visit in a tab the page opens with MemorY in the center, folds it to MY.sh and moves it into the banner in about 3.2 s. Any scroll, click or key press ends it at once. It runs once per tab session (`sessionStorage` key `my.intro`), and it is skipped for links with a `#hash` and under `prefers-reduced-motion: reduce`.

The banner logo loops between MemorY and MY.sh every 7.2 s. It animates only `transform` and `opacity`, pauses on hover and stands still as MY.sh under reduced motion. Timings are in `site/css/site.css` (`lp-*` keyframes) and at the top of the intro code in `site/js/site.js`.

## Captures

Every terminal screen on the page is output of MemorY: the figure images in `site/captures/` and the two text blocks (the `my verify` run in the lab section and the first screen of the quick start). One command makes all of them:

```
node tools/captures.mjs --repo ../my
```

The script clones the MemorY repository at `origin/main` (`--ref` picks another commit), builds it with `make build`, and runs each command on the lab captures in its `testdata/real`. Every command runs in a pseudo-terminal of a fixed width with a Korean locale (`tools/ptyrun.py`), so the tool picks its colours, width and language as it does at a terminal. The output is used as printed; a figure may leave out whole lines (`keep` of a run in the script). Then the script

- renders each figure with Chrome and writes `site/captures/<name>.webp`, 1600 px wide;
- writes the width and height of each image into its `<figure>` in `site/index.html`, and the ratio of the frame when it is not 16:10;
- replaces the `<pre>` between `<!-- run:NAME -->` and `<!-- /run:NAME -->` in `site/index.html`;
- writes nothing when an output holds a path of the machine it ran on.

`--shots DIR` keeps the PNG of each figure and the raw output of each run. It needs git, make, Go, python3, cwebp and Chrome (`CHROME` if Chrome is not in the default macOS location).

| Figure | File | Commands, in `testdata/real` unless named |
| --- | --- | --- |
| Slot map | `slot-map.webp` | `my scan --root 6.19.10-ghes-multi` |
| Topology bars | `dimm.webp` | `my dimm --root 6.19.10-ghes-multi CPU0_B1` |
| Address map | `address-map.webp` | `my map --root 6.19.10-ghes-multi` for CPU0_A1, CPU0_D1, CPU0_B1 and CPU0_E1 |
| Same cell | `boots-same.webp` | in `6.19.10-bert-loop`: `my open var/lib/my/ledger.db boots 'DIMM 0'` |
| Another DIMM each boot | `boots-spread.webp` | in `6.19.10-ghes-loop-spread`: `my open var/lib/my/ledger.db boots`, then `... why --oneline \| tail -n 1` |
| Verdict card | `verdict-card.webp` | in `6.19.10-bert-loop`: `my open var/lib/my/ledger.db why 'DIMM 0'` |
| Preflight | `preflight.webp` | `my preflight --root 6.19.10-bert-loop` |
| Report | `report.webp` | `my import 6.19.10-ghes-multi 6.19.10-ghes-multi/journal-all.json`, then `my report` of that bundle |

Until an image loads, its frame shows a gray skeleton. The server caches images for one hour, so a replaced file can take that long to show.

The text blocks keep the colours of the run as classes (`b` bold, `d` dim, `c31` to `c36` for the colours). A terminal column is one `ch` of Geist Mono. Box and block characters come from a subset of JetBrains Mono that has the same advance. Hangul comes from the reader's system font (`Term Ko` in `site/css/site.css`, `size-adjust: 118%`); `site/js/site.js` measures it and spaces each character to two columns. The figure pages of `tools/captures.mjs` use the same fonts and the same measurement.

## Share image and icons

```
node tools/render.mjs
```

This renders `tools/og.svg` to `site/og.png` (1200 x 630) and `site/favicon.svg` to `site/apple-touch-icon.png` and `site/favicon.ico` with a local Chrome. Set `CHROME` to the browser binary if it is not in the default macOS location. Run it after editing either SVG and commit the output.

## Fonts

SUIT Variable 2.040, Geist Mono 1.400 and a subset of JetBrains Mono 2.304, all under the SIL Open Font License 1.1. The license texts are next to the files in `site/fonts/`.

The JetBrains Mono file holds the 160 characters of U+2500 to U+259F (box drawing and block elements), which Geist Mono lacks. It was cut from `JetBrainsMono-Regular.ttf` of the release archive `JetBrainsMono-2.304.zip` with fontTools 4.68:

```
pyftsubset JetBrainsMono-Regular.ttf --unicodes=U+2500-259F --flavor=woff2 \
  --layout-features='' --no-hinting --desubroutinize --name-IDs='*' \
  --output-file=JetBrainsMono-Blocks-2.304.woff2
```

The server caches `/fonts/` as immutable. The file names carry the font version for that reason: a changed font file needs a new name and a matching edit in `site/css/site.css` and the preload link in `site/index.html`.

## Deploy

<https://my.sh> serves a clone of `main`. After a merge:

```
git -C ~/mysh-live pull --ff-only
```

The server reads files on each request, so no restart is needed.
