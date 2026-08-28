const zlib = require("zlib");
const fs = require("fs");
const os = require("os");
const path = require("path");

const {
  decodePng, channelRows, mulberry32, withSeededRandom, defaultGeometry, terrainStem,
} = require("./fire-spread-harness-impl");

// Builds a real PNG in memory so the decoder is tested against bytes rather than
// against itself. `filters` picks the filter type per scanline, which is the part of
// the decoder with five branches and no other coverage.
const encodePng = (width, height, channels, pixels, filters) => {
  const colorType = channels === 4 ? 6 : 2; // 6 = RGBA, 2 = RGB (3 is palette)
  const stride = width * channels;
  const raw = Buffer.alloc((stride + 1) * height);
  const paeth = (a, b, c) => {
    const p = a + b - c;
    const pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c);
    if (pa <= pb && pa <= pc) return a;
    return pb <= pc ? b : c;
  };
  for (let y = 0; y < height; y++) {
    const filter = filters[y % filters.length];
    raw[y * (stride + 1)] = filter;
    for (let i = 0; i < stride; i++) {
      const x = pixels[y * stride + i];
      const a = i >= channels ? pixels[y * stride + i - channels] : 0;
      const b = y > 0 ? pixels[(y - 1) * stride + i] : 0;
      const c = y > 0 && i >= channels ? pixels[(y - 1) * stride + i - channels] : 0;
      let encoded;
      switch (filter) {
        case 0: encoded = x; break;
        case 1: encoded = x - a; break;
        case 2: encoded = x - b; break;
        case 3: encoded = x - ((a + b) >> 1); break;
        case 4: encoded = x - paeth(a, b, c); break;
        default: throw new Error(`bad filter ${filter}`);
      }
      raw[y * (stride + 1) + 1 + i] = encoded & 0xff;
    }
  }
  const chunk = (type, body) => {
    const out = Buffer.alloc(body.length + 12);
    out.writeUInt32BE(body.length, 0);
    out.write(type, 4, "ascii");
    body.copy(out, 8);
    out.writeInt32BE(crc(Buffer.concat([Buffer.from(type, "ascii"), body])), body.length + 8);
    return out;
  };
  const crcTable = [];
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    crcTable[n] = c >>> 0;
  }
  function crc(buf) {
    let c = 0xffffffff;
    for (const byte of buf) c = crcTable[(c ^ byte) & 0xff] ^ (c >>> 8);
    return (c ^ 0xffffffff) | 0;
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;          // bit depth
  ihdr[9] = colorType;
  ihdr[12] = 0;         // no interlace
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", zlib.deflateSync(raw)),
    chunk("IEND", Buffer.alloc(0)),
  ]);
};

const writeTempPng = (name, buf) => {
  const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "fsh-")), name);
  fs.writeFileSync(file, buf);
  return file;
};

describe("decodePng", () => {
  // Values chosen so no two channels or neighbors share a value: a decoder that
  // dropped a channel, transposed rows and columns, or lost the filter would produce
  // a different array rather than an accidentally-equal one.
  const width = 4;
  const height = 3;
  const channels = 3;
  const pixels = [];
  for (let i = 0; i < width * height * channels; i++) pixels.push((i * 7 + 11) % 251);

  it("round-trips every scanline filter type", () => {
    // One image per filter, so a broken branch cannot be masked by a working one.
    for (const filter of [0, 1, 2, 3, 4]) {
      const file = writeTempPng(`f${filter}.png`, encodePng(width, height, channels, pixels, [filter]));
      const png = decodePng(file);
      expect(png).toMatchObject({ width, height, channels });
      expect(Array.from(png.data)).toEqual(pixels);
    }
  });

  it("round-trips an image mixing filters across scanlines, as real PNGs do", () => {
    const file = writeTempPng("mixed.png", encodePng(width, height, channels, pixels, [4, 1, 3]));
    expect(Array.from(decodePng(file).data)).toEqual(pixels);
  });

  it("rejects a PNG it cannot decode rather than returning wrong pixels", () => {
    const buf = encodePng(width, height, channels, pixels, [0]);
    buf[8 + 8 + 12] = 1; // IHDR interlace byte
    const file = writeTempPng("interlaced.png", buf);
    expect(() => decodePng(file)).toThrow(/interlace 1/);
  });

  it("reads the alpha channel out of an RGBA image", () => {
    const rgba = [];
    for (let i = 0; i < width * height * 4; i++) rgba.push((i * 13 + 5) % 251);
    const file = writeTempPng("rgba.png", encodePng(width, height, 4, rgba, [2]));
    const rows = channelRows(decodePng(file), 3);
    expect(rows).toHaveLength(height);
    expect(rows[0]).toHaveLength(width);
    // Row 1, column 2, alpha is sample index (1*width + 2) * 4 + 3.
    expect(rows[1][2]).toBe(rgba[(1 * width + 2) * 4 + 3]);
  });
});

describe("channelRows", () => {
  it("returns rows top-first, which is the order populateGrid expects", () => {
    const width = 3;
    const height = 2;
    // Red ramps along the row, so a transposed reader gets different numbers.
    const pixels = [
      10, 0, 0, 20, 0, 0, 30, 0, 0,
      40, 0, 0, 50, 0, 0, 60, 0, 0,
    ];
    const file = writeTempPng("rows.png", encodePng(width, height, 3, pixels, [0]));
    expect(channelRows(decodePng(file), 0)).toEqual([[10, 20, 30], [40, 50, 60]]);
  });
});

describe("mulberry32", () => {
  it("is deterministic per seed, which is what makes a run replayable", () => {
    const draw = (seed) => Array.from({ length: 8 }, mulberry32(seed));
    expect(draw(42)).toEqual(draw(42));
    expect(draw(42)).not.toEqual(draw(43));
  });

  it("stays inside [0, 1)", () => {
    const values = Array.from({ length: 500 }, mulberry32(7));
    expect(Math.min(...values)).toBeGreaterThanOrEqual(0);
    expect(Math.max(...values)).toBeLessThan(1);
  });
});

describe("withSeededRandom", () => {
  it("restores Math.random even when the body throws", () => {
    const real = Math.random;
    expect(() => withSeededRandom(() => 0.5, () => { throw new Error("boom"); })).toThrow("boom");
    expect(Math.random).toBe(real);
  });

  it("makes Math.random deterministic inside the body", () => {
    const inside = withSeededRandom(mulberry32(3), () => [Math.random(), Math.random()]);
    expect(inside).toEqual(withSeededRandom(mulberry32(3), () => [Math.random(), Math.random()]));
  });
});

describe("terrain naming", () => {
  it("derives the heightmap stem the app derives, so the harness cannot drift from it", () => {
    const { Zone } = require("../src/models/zone");
    const { TerrainType } = require("../src/types");
    const zones = [
      new Zone({ terrainType: TerrainType.Foothills }),
      new Zone({ terrainType: TerrainType.Plains }),
    ];
    expect(terrainStem(zones)).toBe("data/foothills-plains");
    // The file the stem names has to exist, or every measurement silently reads nothing.
    expect(fs.existsSync(path.join(__dirname, "..", "src", "public", "data/foothills-plains-heightmap.png")))
      .toBe(true);
  });
});

describe("defaultGeometry", () => {
  it("takes the grid from the app config rather than hardcoding it", () => {
    const { getDefaultConfig } = require("../src/config");
    const config = getDefaultConfig();
    const geometry = defaultGeometry();
    expect(geometry.gridWidth).toBe(config.gridWidth);
    expect(geometry.gridHeight).toBe(config.gridHeight);
    expect(geometry.cellSize).toBe(config.cellSize);
  });
});
