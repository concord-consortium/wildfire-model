import { inject, observer } from "mobx-react";
import React from "react";
import { BaseComponent, IBaseProps } from "./base";
import { Button} from "@material-ui/core";
import { TerrainTypeSelector } from "./terrain-type-selector";
import { VegetationSelector } from "./vegetation-selector";
import { DroughtSelector } from "./drought-selector";
import { urlConfigWithDefaultValues } from "../config";

import css from "./terrain-panel.scss";
import { TerrainType, LandType } from "../models/fire-model";

interface IProps extends IBaseProps {}
interface IState {
  selectedZone: number;
}

const cssClasses = [css.zone1, css.zone2, css.zone3];

const backgroundImage: { [key: number]: string } = {
  0: "./mountains_sample.jpg",
  1: "./foothills_sample.jpg",
  2: "./plains_sample.jpg"
};

@inject("stores")
@observer
export class TerrainPanel extends BaseComponent<IProps, IState> {
  constructor(props: IProps) {
    super(props);
    this.state = {
      selectedZone: 0
    };
  }

  public render() {
    const { ui, simulation } = this.stores;
    const { selectedZone } = this.state;
    const zone = simulation.zones[selectedZone];
    // Scale moisture content so the slider snaps to the preset levels
    const scaledMoistureContent = Math.round(zone.moistureContent / urlConfigWithDefaultValues.moistureContentScale);
    return (
      <div className={`${css.terrain} ${ui.showTerrainUI ? "" : css.disabled}`}>
        { ui.showTerrainUI  &&
          <div className={`${css.background} ${cssClasses[selectedZone]}`}>
            <div className={css.closeButton} onClick={this.handleClose}>X</div>
            <div className={css.header} data-test="terrain-header">Terrain Setup</div>
              <div className={css.instructions}>
                <span className={css.setupStepIcon}>1</span>Adjust variables in each zone
              </div>
              <div className={css.zones}>
                {this.renderZones()}
              </div>
          <div className={css.terrainSelector}>
            {urlConfigWithDefaultValues.zonesCount > 2 && simulation.zones.length > 2 &&
              <div className={css.terrainTypeLabels}>{this.renderZoneTerrainTypeLabels()}</div>
            }
            {urlConfigWithDefaultValues.zonesCount === 2 &&
              <TerrainTypeSelector
                terrainType={zone.terrainType}
                onChange={this.handleTerrainTypeChange} />
            }
            </div>
            <div className={css.selectors}>
              <div className={css.selector}>
              <VegetationSelector
                vegetationType={zone.landType}
                terrainType={zone.terrainType}
                onChange={this.handleVegetationChange} />
              </div>
              <div className={css.selector}>
              <DroughtSelector droughtIndex={scaledMoistureContent}
                onChange={this.handleDroughtChange} />
              </div>
            </div>
            <div className={css.buttonContainer}><Button className={css.continueButton}>Next</Button></div>
          </div>
        }
      </div>
    );
  }

  public handleClose = () => {
    const { ui } = this.stores;
    ui.showTerrainUI = !ui.showTerrainUI;
  }
  public handleZoneChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    // Radio buttons always return string values. We're using hidden radio buttons to change selected zone
    const newZone = parseInt(event.target.value, 10);
    if (newZone !== this.state.selectedZone) {
      this.setState({ selectedZone: newZone });
    }
  }

  public handleTerrainTypeChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const { simulation } = this.stores;
    const newTerrainType = parseInt(event.target.value, 10);
    const currentZone = simulation.zones[this.state.selectedZone];
    if (currentZone.terrainType !== newTerrainType) {
      // Switching to Mountain terrain changes land type / vegetation options
      // but keeping the min / max options the same for each range helps with slider rendering.
      // Accommodate this by manual adjustment of land types when switching to-from mountain
      if (currentZone.terrainType === TerrainType.Mountains && currentZone.landType === LandType.ForestLargeLitter) {
        // switching from Mountains with large forests to lower land type, reduce forest size
        simulation.updateZoneVegetation(this.state.selectedZone, LandType.ForestSmallLitter);
      }
      else if (newTerrainType === TerrainType.Mountains && currentZone.landType === LandType.Grass) {
        // no grass allowed on mountains, switch to shrubs
        simulation.updateZoneVegetation(this.state.selectedZone, LandType.Shrub);
      }
      simulation.updateZoneTerrain(this.state.selectedZone, newTerrainType);
    }
  }
  public handleVegetationChange = (event: React.ChangeEvent<HTMLInputElement>, value: number) => {
    const { simulation } = this.stores;
    const currentZone = Object.assign({}, simulation.zones[this.state.selectedZone]);
    if (currentZone.landType !== value) {
      simulation.updateZoneVegetation(this.state.selectedZone, value);
    }
  }
  public handleDroughtChange = (event: React.ChangeEvent<HTMLInputElement>, value: number) => {
    const { simulation } = this.stores;
    const currentZone = Object.assign({}, simulation.zones[this.state.selectedZone]);
    if (currentZone.moistureContent !== value) {
      simulation.updateZoneMoisture(this.state.selectedZone, value);
    }
  }

  private renderZones = () => {
    const { simulation } = this.stores;
    const { selectedZone } = this.state;
    let i = 0;
    const zoneUI = [];
    // handle two, three (or more) zones
    for (const z of simulation.zones) {
      // can limit the number of zones via a url parameter
      if (i < urlConfigWithDefaultValues.zonesCount) {
        zoneUI.push(
          <div className={`${css.zone} ${cssClasses[i]} ${selectedZone === i ? css.selected : ""}`} key={i} >
            <label className={css.terrainPreview}>
              <input type="radio"
                className={css.zoneOption}
                value={i}
                checked={selectedZone === i}
                onChange={this.handleZoneChange}
                data-test="zone-option"
              />
              <div className={css.terrainImage}
                style={{ backgroundImage: `url(${backgroundImage[z.terrainType]})` }}>
                <span className={`${css.zoneLabel} ${cssClasses[i]}`}>{`Zone ${i + 1}`}</span>
              </div>
            </label>
          </div>
        );
      }
      i++;
    }
    return zoneUI;
  }
  private renderZoneTerrainTypeLabels = () => {
    const { simulation } = this.stores;
    const labels = [];
    const labelText = {
      0: "Mountains",
      1: "Foothills",
      2: "Plains"
    };
    let i = 0;
    for (const z of simulation.zones) {
      if (i < urlConfigWithDefaultValues.zonesCount) {
        labels.push(<div className={css.terrainTypeLabel}>{labelText[z.terrainType]}</div>);
      }
      i++;
    }
    return labels;
  }
}
