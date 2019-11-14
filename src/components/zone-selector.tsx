import React from "react";
import { Zone } from "../models/zone";
import * as css from "./zone-selector.scss";
import { TerrainType } from "../models/fire-model";
import { vegetationIcons } from "./vertical-selectors";
import { IPresetConfig } from "../presets";

interface IProps {
  zones: Zone[];
  selectedZone: number;
  readonly: boolean;
  onChange?: any;
}

const cssClasses = [css.zone1, css.zone2, css.zone3];

const getBackgroundImage = (zoneCount: number, terrainType: number, currentZone: number) => {
  const prefix = `./terrain/${zoneCount}-zone-`;
  const terrainStyle = TerrainType[terrainType].toLowerCase();
  const twoZonePosition = ["-left", "-right"];
  const threeZonePosition = ["-left", "-mid", "-right"];
  const panelPosition = zoneCount === 2 ? twoZonePosition[currentZone] : threeZonePosition[currentZone];
  return prefix + terrainStyle + panelPosition + ".png";
};
const getRiverOverlay = (zoneCount: number, currentZone: number) => {
  const prefix = `./terrain/`;
  const twoZonePosition = ["2-zone-river-left", "2-zone-river-right"];
  const threeZonePosition = ["3-zone-river-left", "3-zone-river-mid", "3-zone-river-right"];
  const panelPosition = zoneCount === 2 ? twoZonePosition[currentZone] : threeZonePosition[currentZone];
  return prefix + panelPosition + ".png";
};

const getColorFilter = (moistureContent: number, config: IPresetConfig) => {
  const scaledMoistureContent = Math.round(moistureContent / config.moistureContentScale);
  switch (scaledMoistureContent) {
    case 1:
      return css.mildDrought;
    case 2:
      return css.mediumDrought;
    case 3:
      return css.severeDrought;
    default:
      return "";
  }
};

export const renderZones = (
  zones: Zone[], selectedZone: number, readonly: boolean, config: IPresetConfig, onChange: any) => {
  const zoneUI: any[] = [];
  // handle two, three (or more) zones
  zones.forEach((z, i) => {
    // can limit the number of zones via a url parameter
    if (i < config.zonesCount) {
      // Individual zones can only be edited on the first page of the wizard
      const zoneTerrainImagePath = getBackgroundImage(config.zonesCount, z.terrainType, i);
      const zoneRiverImagePath = getRiverOverlay(config.zonesCount, i);
      const zoneStyle = readonly ? css.fixed : selectedZone === i ? css.selected : "";
      // Only apply a position change for > 0 zone index (in span rendering)
      let vegPreviewPosition = css.right;
      if (i === 1 && config.zonesCount > 2) {
        vegPreviewPosition = css.mid;
      }
      zoneUI.push(
        <div className={`${css.zone} ${cssClasses[i]} ${zoneStyle}`} key={i} >
          <label className={css.terrainPreview}>
            <input type="radio"
              className={css.zoneOption}
              value={i}
              checked={selectedZone === i}
              onChange={onChange}
              data-test="zone-option"
            />
            <div className={`${css.terrainImage} ${getColorFilter(z.moistureContent, config)}`}
              style={{ backgroundImage: `url(${zoneTerrainImagePath})` }}>
              <div className={`${css.riverOverlay}`} style={{backgroundImage: `url(${zoneRiverImagePath})`}} />
              <span className={`${css.zoneLabelBorder}`}>
                <span className={`${css.zoneLabel} ${cssClasses[i]}`}>{`Zone ${i + 1}`}</span>
              </span>
              {!readonly &&
                <span className={`${css.vegetationPreview} ${i > 0 ? vegPreviewPosition : ""}`}>
                  {vegetationIcons[z.landType]}</span>
              }
            </div>
          </label>
        </div>
      );
    }
  });
  return zoneUI;
};
