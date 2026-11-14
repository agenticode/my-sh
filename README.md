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

Each figure on the page has a framed slot that shows a gray skeleton until a screenshot exists. To fill a slot, save the screenshot under the name in the table and commit it. No HTML change is needed.

| Figure | File |
| --- | --- |
| Slot map | `site/captures/slot-map.webp` |
| Topology bars | `site/captures/topology-bars.webp` |
| Address map | `site/captures/address-map.webp` |
| Timeline | `site/captures/timeline.webp` |
| Verdict card | `site/captures/verdict-card.webp` |
| Report | `site/captures/report.webp` |

Format: WebP, 1600 x 1000 px (16:10). The widest slot is about 640 CSS px, so 1600 px covers 2x screens. An image with another ratio is fitted inside the frame without cropping.

```
cwebp -q 82 -resize 1600 0 shot.png -o site/captures/slot-map.webp
```

The slot name is the `data-capture` attribute in `site/index.html`. Until a file exists the browser logs one 404 per empty slot. The server caches images for one hour, so a replaced file can take that long to show.

## Share image and icons

```
node tools/render.mjs
```

This renders `tools/og.svg` to `site/og.png` (1200 x 630) and `site/favicon.svg` to `site/apple-touch-icon.png` and `site/favicon.ico` with a local Chrome. Set `CHROME` to the browser binary if it is not in the default macOS location. Run it after editing either SVG and commit the output.

## Fonts

SUIT Variable 2.040 and Geist Mono 1.400, both under the SIL Open Font License 1.1. The license texts are next to the files in `site/fonts/`.

The server caches `/fonts/` as immutable. The file names carry the font version for that reason: a changed font file needs a new name and a matching edit in `site/css/site.css` and the preload link in `site/index.html`.

## Deploy

<https://my.sh> serves a clone of `main`. After a merge:

```
git -C ~/mysh-live pull --ff-only
```

The server reads files on each request, so no restart is needed.
