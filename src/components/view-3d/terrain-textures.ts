import { useEffect, useState } from "react";
import { useThree } from "@react-three/fiber";
import * as THREE from "three";
import { Vegetation } from "../../types";

// The tiles live in src/public, which CopyWebpackPlugin copies to the build root
// verbatim. They are fetched by URL at runtime rather than imported, for two
// reasons: the webpack `.svg` rule pipes every SVG imported from a .tsx through
// SVGR (which yields a React component, not a URL), and — more importantly —
// serving them as static files means an artist can edit a tile and reload the
// page, with no rebuild and no import to update. The path is relative so it
// resolves correctly under a branch deploy path.
export const TILE_DIR = "terrain-textures/";

// Rasterization size per tile. A tile covers a fixed 18,000 ft of ground, so it
// repeats 6.7x across the default 120,000 ft model; on a 1200px-wide viewport
// each repeat covers roughly 180px. 512 leaves headroom for zooming in with
// OrbitControls, and mipmaps handle the minified case.
const RASTER_SIZE = 512;

// The tiles draw their glyphs on a transparent field so the Setup panel can use
// one as a CSS mask and paint its own ink through it. The shader instead wants
// those glyphs on a neutral field, 128 being the luminance it reads as
// "unchanged", so the field is painted here rather than in the file.
const TILE_FIELD = "#808080";

// The four vegetation tiles are packed into the four channels of one texture, in
// Vegetation enum order. GLSL forbids indexing an array of samplers by a value
// that varies per fragment, so the alternative to packing would be sampling all
// four tiles and discarding three. Packing makes it a single fetch plus a dot
// product, which matters on the Chromebooks this sim targets.
export const VEGETATION_TILE_FILES: Record<Vegetation, string> = {
  [Vegetation.Grass]: "grass.svg",
  [Vegetation.Shrub]: "shrub.svg",
  [Vegetation.Forest]: "forest.svg",
  [Vegetation.ForestWithSuppression]: "forest-with-suppression.svg"
};

export interface TerrainTextures {
  // RGBA, one vegetation tile's luminance per channel, in Vegetation enum order.
  //
  // There is deliberately no separate burnt-ground tile. Burnt terrain samples
  // these same tiles and recolors them, so a burnt cell keeps the glyph of the
  // vegetation that used to grow there and the two can never fall out of sync.
  vegetationTiles: THREE.DataTexture;
}

// Draws an SVG to a canvas and returns its pixels. Rasterizing through <img>
// keeps the SVG the editable source of truth while handing the GPU a bitmap.
const rasterizeSvg = (url: string, size: number): Promise<Uint8ClampedArray> =>
  new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = size;
      canvas.height = size;
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        reject(new Error("2d context unavailable while rasterizing terrain tile"));
        return;
      }
      ctx.fillStyle = TILE_FIELD;
      ctx.fillRect(0, 0, size, size);
      ctx.drawImage(img, 0, 0, size, size);
      resolve(ctx.getImageData(0, 0, size, size).data);
    };
    img.onerror = () => reject(new Error(`failed to load terrain tile: ${url}`));
    img.src = url;
  });

const configureTiling = (texture: THREE.Texture, maxAnisotropy: number) => {
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  // These tiles are luminance DATA, not color: the shader reads them as a mask
  // that selects between the terrain color and a derived glyph ink, with 50% gray
  // meaning "unchanged". Tagging them sRGB would apply a transfer function and
  // shift every threshold in that mapping.
  texture.colorSpace = THREE.NoColorSpace;
  texture.generateMipmaps = true;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.magFilter = THREE.LinearFilter;
  // The terrain is viewed at a shallow angle, so without anisotropic filtering
  // the tiles smear into mush toward the far edge.
  texture.anisotropy = maxAnisotropy;
};

const loadTerrainTextures = async (maxAnisotropy: number): Promise<TerrainTextures> => {
  const vegetationOrder = [
    Vegetation.Grass, Vegetation.Shrub, Vegetation.Forest, Vegetation.ForestWithSuppression
  ];

  const vegetationPixels = await Promise.all(
    vegetationOrder.map(v => rasterizeSvg(TILE_DIR + VEGETATION_TILE_FILES[v], RASTER_SIZE))
  );

  const texelCount = RASTER_SIZE * RASTER_SIZE;
  const packed = new Uint8Array(texelCount * 4);
  for (let channel = 0; channel < 4; channel++) {
    const source = vegetationPixels[channel];
    for (let i = 0; i < texelCount; i++) {
      // Tiles are grayscale, so the red channel is the luminance.
      packed[i * 4 + channel] = source[i * 4];
    }
  }
  const vegetationTiles = new THREE.DataTexture(packed, RASTER_SIZE, RASTER_SIZE, THREE.RGBAFormat);
  configureTiling(vegetationTiles, maxAnisotropy);
  vegetationTiles.needsUpdate = true;

  return { vegetationTiles };
};

/**
 * Loads and packs the terrain tiles once. Returns null until they are ready, so
 * the caller can render the untextured terrain in the meantime rather than
 * flashing an empty plane.
 */
export const useTerrainTextures = (enabled: boolean): TerrainTextures | null => {
  const { gl } = useThree();
  const [textures, setTextures] = useState<TerrainTextures | null>(null);

  // The tiles are loaded on first use and then kept for the life of the page: the
  // switch gates whether the textured material renders, not whether the tiles
  // exist. Keying the load on the live switch value instead disposes the texture
  // on every switch-off while this hook keeps returning it, so the next switch-on
  // renders a frame against a disposed texture and re-fetches and re-rasterizes
  // all four tiles.
  useEffect(() => {
    if (!enabled || textures) return;
    let cancelled = false;
    loadTerrainTextures(gl.capabilities.getMaxAnisotropy()).then(result => {
      if (cancelled) {
        result.vegetationTiles.dispose();
        return;
      }
      setTextures(result);
    }).catch(error => {
      // Falling back to the untextured terrain is the right failure mode here:
      // the sim stays fully usable and only loses the surface detail. The message
      // carries the URL that failed, which is what makes a bad deployment path a
      // glance rather than an investigation.
      // eslint-disable-next-line no-console
      console.error("[terrain-textures] disabled:", error);
    });
    return () => { cancelled = true; };
  }, [enabled, gl, textures]);

  // Disposal is tied to the texture's own lifetime rather than the switch's, so
  // it happens on unmount and never on a toggle.
  useEffect(() => () => {
    textures?.vegetationTiles.dispose();
  }, [textures]);

  return textures;
};
