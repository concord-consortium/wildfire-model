/**
 * Measures the terrain tiles in src/public/terrain-textures/ and reports whether
 * each one honors the authoring contract.
 *
 *   node scripts/measure-terrain-textures.mjs
 *
 * Run this after hand-editing or replacing a tile. It checks two kinds of thing.
 *
 * STRUCTURE, read straight from the file — the viewBox and the glyph stroke
 * width. Neither shows up as an error if it drifts: a tile that comes back on a
 * 512 artboard renders its glyphs at half size, and a tile drawn at the wrong
 * stroke weight quietly loses contrast. Both just look slightly wrong, with
 * nothing saying why.
 *
 * PIXELS, measured by rasterizing. Two properties matter here, and neither is
 * reliably judgeable by eye:
 *
 *   BACKGROUND (the modal value) must sit on 128. That is the tile's field, and
 *   128 is the shader's neutral point, so this is what makes each zone render as
 *   its true drought color with the glyphs sitting on top. A background off
 *   neutral tints the whole zone and corrupts the drought coding the simulation
 *   uses to communicate with students. The MEAN is reported too, but with
 *   discrete glyphs it legitimately sits below 128 and is not the thing to tune.
 *
 *   SD is the tile's contrast, and is what decides whether it reads as a surface
 *   or as flat gray once it is repeated ~40x across the terrain and viewed at a
 *   shallow angle. Below roughly 12 a tile disappears at distance.
 *
 * Measurement goes through headless Chrome because that is what actually
 * rasterizes these SVGs at runtime — a different rasterizer could disagree, and
 * Chrome's answer is the one that ships. The files are served over HTTP rather
 * than read from disk because Chrome taints a canvas drawn from a file:// image,
 * which makes getImageData throw.
 */

import { createServer } from "http";
import { readFile, readdir } from "fs/promises";
import { execFile } from "child_process";
import { join, dirname, extname } from "path";
import { fileURLToPath } from "url";
import { promisify } from "util";

const TILE_DIR = join(dirname(fileURLToPath(import.meta.url)), "..", "src", "public", "terrain-textures");
const RASTER_SIZE = 512;
const BACKGROUND_TOLERANCE = 2;
const MIN_SD = 12;

// Paired with the artwork. Every tile must be drawn on this artboard, because all
// four are rasterized into one shared texture at one shared scale — a different
// viewBox silently changes how large that tile's glyphs render.
const EXPECTED_VIEWBOX = 256;
// The authored stroke weight every tile draws its glyphs at. A tile at a different
// weight quietly loses contrast against its field.
const EXPECTED_STROKE = 3;
// Elements drawn in this ink are the glyphs; anything else (an inert group
// default, say) is ignored.
const GLYPH_INK = "#2a2a2a";

// Reads the two structural properties out of the SVG source. Done here rather
// than from the rasterized pixels because both are stated in the file, and a
// wrong value is far clearer named than inferred.
//
// stroke and stroke-width INHERIT, and editors differ on where they put them:
// the generated tiles set both on every element, while an export from Sketch
// commonly sets them once on a group and lets the shapes inherit. Walking the
// tags with a stack of inherited values reads both correctly — checking each
// element in isolation reports a perfectly good hand-drawn tile as having no
// glyphs at all.
const readStructure = (svg) => {
  const viewBox = svg.match(/viewBox="0 0 ([\d.]+) ([\d.]+)"/);
  const widths = new Set();
  const attr = (tag, name) => {
    const m = tag.match(new RegExp(`${name}="([^"]*)"`));
    return m ? m[1] : null;
  };
  const isInk = (v) => v && v.toLowerCase() === GLYPH_INK;
  // Inherited state, innermost last.
  const stack = [{ stroke: null, width: null }];
  const DRAWS = /^<(path|line|circle|ellipse|rect|polyline|polygon)\b/;
  for (const tag of svg.match(/<\/?[a-zA-Z][^>]*>/g) || []) {
    if (/^<\/g>/.test(tag)) { if (stack.length > 1) stack.pop(); continue; }
    const own = { stroke: attr(tag, "stroke"), width: attr(tag, "stroke-width") };
    const top = stack[stack.length - 1];
    const here = {
      stroke: own.stroke !== null ? own.stroke : top.stroke,
      width: own.width !== null ? own.width : top.width
    };
    if (/^<g\b/.test(tag)) {
      if (!/\/>$/.test(tag)) stack.push(here);
      continue;
    }
    if (DRAWS.test(tag) && isInk(here.stroke) && here.width !== null) {
      widths.add(parseFloat(here.width));
    }
  }
  return {
    box: viewBox ? [parseFloat(viewBox[1]), parseFloat(viewBox[2])] : null,
    strokes: [...widths].sort((a, b) => a - b)
  };
};

const CHROME_CANDIDATES = [
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  "/Applications/Chromium.app/Contents/MacOS/Chromium",
  "/usr/bin/google-chrome",
  "/usr/bin/chromium"
];

const page = (files) => `<!doctype html><meta charset="utf-8"><body><pre id="out"></pre></body><script>
const FILES = ${JSON.stringify(files)};
const load = src => new Promise((res, rej) => {
  const i = new Image(); i.onload = () => res(i); i.onerror = () => rej(new Error(src)); i.src = src;
});
(async () => {
  const rows = [];
  for (const f of FILES) {
    const img = await load(f);
    const c = document.createElement("canvas");
    c.width = c.height = ${RASTER_SIZE};
    const ctx = c.getContext("2d");
    ctx.drawImage(img, 0, 0, ${RASTER_SIZE}, ${RASTER_SIZE});
    const d = ctx.getImageData(0, 0, ${RASTER_SIZE}, ${RASTER_SIZE}).data;
    const n = ${RASTER_SIZE} * ${RASTER_SIZE};
    let sum = 0, sum2 = 0, min = 255, max = 0, colored = 0;
    const histogram = new Uint32Array(256);
    for (let i = 0; i < n; i++) {
      const r = d[i*4], g = d[i*4+1], b = d[i*4+2];
      if (Math.abs(r-g) > 2 || Math.abs(g-b) > 2) colored++;
      sum += r; sum2 += r*r;
      histogram[r]++;
      if (r < min) min = r;
      if (r > max) max = r;
    }
    const mean = sum / n;
    // The modal value is the tile's background — by far its most common tone.
    let background = 0;
    for (let v = 1; v < 256; v++) if (histogram[v] > histogram[background]) background = v;
    rows.push(JSON.stringify({
      file: f, mean, background, sd: Math.sqrt(sum2/n - mean*mean), min, max, coloredFraction: colored/n
    }));
  }
  document.getElementById("out").textContent = "@@" + rows.join("\\n") + "@@";
})().catch(e => { document.getElementById("out").textContent = "@@ERROR " + e.message + "@@"; });
</script>`;

const main = async () => {
  const files = (await readdir(TILE_DIR)).filter(f => extname(f) === ".svg").sort();
  if (!files.length) throw new Error(`no SVG tiles found in ${TILE_DIR}`);

  const structure = {};
  for (const f of files) {
    structure[f] = readStructure(await readFile(join(TILE_DIR, f), "utf8"));
  }

  const server = createServer(async (req, res) => {
    if (req.url === "/") {
      res.writeHead(200, { "Content-Type": "text/html" });
      res.end(page(files));
      return;
    }
    try {
      const body = await readFile(join(TILE_DIR, decodeURIComponent(req.url.slice(1))));
      res.writeHead(200, { "Content-Type": "image/svg+xml" });
      res.end(body);
    } catch {
      res.writeHead(404).end();
    }
  });
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
  const url = `http://127.0.0.1:${server.address().port}/`;

  let chrome;
  for (const candidate of CHROME_CANDIDATES) {
    try {
      await readFile(candidate);
      chrome = candidate;
      break;
    } catch { /* try the next one */ }
  }
  // readFile on the macOS app binary succeeds; on Linux the plain paths do too.
  if (!chrome) {
    server.close();
    throw new Error(`could not find Chrome. Looked in:\n  ${CHROME_CANDIDATES.join("\n  ")}`);
  }

  const { stdout } = await promisify(execFile)(chrome, [
    "--headless", "--disable-gpu", "--virtual-time-budget=15000", "--dump-dom", url
  ], { maxBuffer: 64 * 1024 * 1024 });
  server.close();

  const payload = stdout.match(/@@([\s\S]*?)@@/);
  if (!payload) throw new Error("no measurement produced — Chrome may have failed to render the tiles");
  if (payload[1].startsWith("ERROR")) throw new Error(payload[1]);

  const results = payload[1].trim().split("\n").map(line => JSON.parse(line));
  let failures = 0;

  // eslint-disable-next-line no-console
  console.log("\ntile                          box  stroke    bg     sd   verdict");
  // eslint-disable-next-line no-console
  console.log("-".repeat(84));
  for (const r of results) {
    const st = structure[r.file];
    const drift = r.background - 128;
    const problems = [];

    if (!st.box) {
      problems.push("no viewBox");
    } else if (st.box[0] !== EXPECTED_VIEWBOX || st.box[1] !== EXPECTED_VIEWBOX) {
      problems.push(`viewBox ${st.box[0]}x${st.box[1]}, expected ${EXPECTED_VIEWBOX}`);
    }
    if (!st.strokes.length) {
      problems.push("no glyphs in ink " + GLYPH_INK);
    } else if (st.strokes.length > 1) {
      problems.push(`mixed stroke widths ${st.strokes.join("/")}`);
    } else if (Math.abs(st.strokes[0] - EXPECTED_STROKE) > 0.001) {
      problems.push(`stroke ${st.strokes[0]}, expected ${EXPECTED_STROKE}`);
    }
    if (Math.abs(drift) > BACKGROUND_TOLERANCE) {
      problems.push(drift > 0 ? "field brightens drought color" : "field darkens drought color");
    }
    if (r.sd < MIN_SD) problems.push("too flat");
    if (r.coloredFraction > 0.01) problems.push("not grayscale");
    if (problems.length) failures++;

    // eslint-disable-next-line no-console
    console.log(
      `${r.file.padEnd(28)} ${String(st.box ? st.box[0] : "?").padStart(4)} ` +
      `${(st.strokes.join("/") || "?").padStart(7)} ${String(r.background).padStart(5)} ` +
      `${r.sd.toFixed(1).padStart(6)}   ${problems.length ? problems.join("; ") : "ok"}`
    );
  }
  // eslint-disable-next-line no-console
  console.log(`\ntarget: viewBox ${EXPECTED_VIEWBOX}, stroke ${EXPECTED_STROKE}, ` +
    `background 128 +/-${BACKGROUND_TOLERANCE}, sd >= ${MIN_SD}, grayscale\n`);
  process.exit(failures ? 1 : 0);
};

main().catch(error => {
  // eslint-disable-next-line no-console
  console.error(error.message);
  process.exit(1);
});
