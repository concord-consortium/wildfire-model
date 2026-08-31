import React from "react";
import { Zone } from "../models/zone";
import css from "./zone-selector.scss";
import { TerrainType } from "../types";
import { vegetationIcons } from "./vertical-selectors";
import { TILE_DIR, VEGETATION_TILE_FILES } from "./view-3d/terrain-textures";
import { droughtGlyphInkHex, droughtTerrainHex } from "./view-3d/terrain-colors";

const cssClasses = [css.zone1, css.zone2, css.zone3];

// The thumbnail files are named for what the UI calls each terrain, so Foothills
// reads as "hills" here. The heightmap data files still spell it "foothills"
// (data-loaders.ts derives those straight off the enum), so the two cannot share
// a derivation.
const terrainArtNames: Record<TerrainType, string> = {
  [TerrainType.Plains]: "plains",
  [TerrainType.Foothills]: "hills",
  [TerrainType.Mountains]: "mountains",
};

export const getBackgroundImage = (zoneCount: number, terrainType: TerrainType, currentZone: number) => {
  const prefix = `./terrain/${zoneCount}-zone-`;
  const terrainStyle = terrainArtNames[terrainType];
  const twoZonePosition = ["-left", "-right"];
  const threeZonePosition = ["-left", "-mid", "-right"];
  const panelPosition = zoneCount === 2 ? twoZonePosition[currentZone] : threeZonePosition[currentZone];
  return prefix + terrainStyle + panelPosition + ".png";
};
export const getRiverOverlay = (zoneCount: number, currentZone: number) => {
  const prefix = `./terrain/`;
  const twoZonePosition = ["2-zone-river-left", "2-zone-river-right"];
  const threeZonePosition = ["3-zone-river-left", "3-zone-river-mid", "3-zone-river-right"];
  const panelPosition = zoneCount === 2 ? twoZonePosition[currentZone] : threeZonePosition[currentZone];
  return prefix + panelPosition + ".png";
};

interface IRenderZonesOptions {
  zones: Zone[];
  selectedZone: number;
  readonly: boolean;
  zonesCount: number;
  showVegetationKey: boolean;
  glyphContrast: readonly number[];
  onChange: any;
}

export const renderZones = (options: IRenderZonesOptions) => {
  const { zones, selectedZone, readonly, zonesCount, showVegetationKey, glyphContrast, onChange } = options;
  const zoneUI: any[] = [];
  const countClass = zonesCount > 2 ? css.threeZone : css.twoZone;
  // handle two, three (or more) zones
  zones.forEach((z, i) => {
    // can limit the number of zones via a url parameter
    if (i < zonesCount) {
      // Individual zones can only be edited on the first page of the wizard
      const zoneTerrainImagePath = getBackgroundImage(zonesCount, z.terrainType, i);
      const zoneRiverImagePath = getRiverOverlay(zonesCount, i);
      const tileUrl = `url(${TILE_DIR}${VEGETATION_TILE_FILES[z.vegetation]})`;
      const zoneStyle = readonly ? css.fixed : selectedZone === i ? css.selected : "";
      // Only apply a position change for > 0 zone index (in span rendering)
      let vegPreviewPosition = css.right;
      if (i === 1 && zonesCount > 2) {
        vegPreviewPosition = css.mid;
      }
      zoneUI.push(
        <div className={`${css.zone} ${countClass} ${cssClasses[i]} ${zoneStyle}`} key={i} >
          <label className={css.terrainPreview}>
            <input type="radio"
              className={css.zoneOption}
              value={i}
              checked={selectedZone === i}
              onChange={onChange}
              data-testid="zone-option"
            />
            <span className={`${css.zoneLabelBorder}`}>
                <span className={`${css.zoneLabel} ${cssClasses[i]} ${readonly ? css.noZoneLabelBorder : ""}`}>{`Zone ${i + 1}`}</span>
            </span>
            <div className={css.terrainLayers}>
              <div className={css.terrainImage}
                style={{
                  backgroundImage: `url(${zoneTerrainImagePath})`,
                  // Multiplied with the art by .terrainImage's blend mode; see the SCSS.
                  backgroundColor: droughtTerrainHex(z.droughtLevel)
                }}>
                <div className={`${css.riverOverlay}`} style={{backgroundImage: `url(${zoneRiverImagePath})`}} />
              </div>
              {showVegetationKey &&
                // Ordered after .terrainImage, because .riverOverlay lives inside it
                // and two absolutely positioned layers at z-index auto paint in tree
                // order. Ordered before, the river would cover the glyphs; the board
                // draws them crossing it.
                <div
                  className={css.vegetationTexture}
                  data-testid="vegetation-texture"
                  style={{
                    backgroundColor: droughtGlyphInkHex(z.droughtLevel, glyphContrast),
                    // Inline styles never reach autoprefixer, which handles the SCSS half
                    // of these properties, so the prefixed copy is written out here.
                    maskImage: tileUrl,
                    WebkitMaskImage: tileUrl
                  }}
                />
              }
              {!readonly &&
                // Inside .terrainLayers so it keeps fading with its zone, and after the
                // texture so the glyphs do not draw over it.
                <span className={`${css.vegetationPreview} ${i > 0 ? vegPreviewPosition : ""}`}>
                  {vegetationIcons[z.vegetation]}
                </span>
              }
            </div>
          </label>
        </div>
      );
    }
  });
  return zoneUI;
};
