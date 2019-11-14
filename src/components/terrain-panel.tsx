import { inject, observer } from "mobx-react";
import React from "react";
import { BaseComponent, IBaseProps } from "./base";
import { Button } from "@material-ui/core";

import { renderZones } from "./zone-selector";
import { TerrainTypeSelector } from "./terrain-type-selector";
import { VegetationSelector } from "./vegetation-selector";
import { DroughtSelector } from "./drought-selector";
import { urlConfigWithDefaultValues } from "../config";

import css from "./terrain-panel.scss";
import { TerrainType, LandType } from "../models/fire-model";
import { WindControls } from "./wind-controls";
import { TerrainSummary } from "./terrain-summary";

interface IProps extends IBaseProps {}
interface IState {
  selectedZone: number;
  currentPanel: number;
}
const cssClasses = [css.zone1, css.zone2, css.zone3];

@inject("stores")
@observer
export class TerrainPanel extends BaseComponent<IProps, IState> {
  constructor(props: IProps) {
    super(props);
    this.state = {
      selectedZone: 0,
      currentPanel: 1
    };
  }
  public componentDidUpdate() {
    const { ui } = this.stores;
    if (!ui.showTerrainUI && this.state.currentPanel === 2) {
      this.setState({ currentPanel: 1 });
    }
  }

  public render() {
    const { ui, simulation } = this.stores;
    const { selectedZone, currentPanel } = this.state;
    const zone = simulation.zones[selectedZone];
    // Scale moisture content so the slider snaps to the preset levels
    const scaledMoistureContent = Math.round(zone.moistureContent / urlConfigWithDefaultValues.moistureContentScale);
    const displayVegetationType =
      zone.terrainType === TerrainType.Mountains ? zone.landType - 1 : zone.landType;
    const panelClass = currentPanel === 1 ? css.panel1 : css.panel2;
    const panelInstructions = currentPanel === 1 ? "Adjust variables in each zone" : "Set initial wind direction and speed";
    return (
      <div className={`${css.terrain} ${ui.showTerrainUI ? "" : css.disabled}`}>
        { ui.showTerrainUI  &&
          <div className={`${css.background} ${cssClasses[selectedZone]} ${panelClass}`}>
            <div className={css.closeButton} onClick={this.handleClose}>X</div>
          <div className={css.header} data-test="terrain-header">Terrain Setup</div>
            <div className={css.instructions}>
              <span className={css.setupStepIcon}>{currentPanel}</span>{panelInstructions}
            </div>
            <div className={css.zones}>
              {renderZones(simulation.zones, selectedZone, currentPanel === 2, this.handleZoneChange)}
            </div>
          {currentPanel === 1 &&
            <div className={css.panel}>
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
                    landType={displayVegetationType}
                    terrainType={zone.terrainType}
                    onChange={this.handleVegetationChange} />
                </div>
                <div className={css.selector}>
                  <DroughtSelector droughtIndex={scaledMoistureContent}
                    onChange={this.handleDroughtChange} />
                </div>
              </div>
              <div className={css.buttonContainer}>
                <Button className={css.continueButton} onClick={this.showNextPanel}>
                  Next</Button>
              </div>
            </div>
            }
            { currentPanel === 2 &&
              <div className={css.panel}>
                <div className={css.terrainTypeLabels}>{this.renderZoneTerrainTypeLabels()}</div>
                <div className={css.terrainProperties}>{this.renderTerrainProperties()}</div>
                <div className={css.wind}>
                  <WindControls />
                </div>
                <div className={css.buttonContainer}>
                  <Button className={css.continueButton} onClick={this.showPreviousPanel}>
                    Previous</Button>
                  <Button className={css.continueButton} onClick={this.applyAndClose}>
                    Create</Button>
                </div>
              </div>
            }
          </div>
        }
      </div>
    );
  }

  public handleClose = () => {
    const { ui } = this.stores;
    ui.showTerrainUI = !ui.showTerrainUI;
  }
  public applyAndClose = (event: React.MouseEvent<HTMLButtonElement, MouseEvent>) => {
    // trigger re-draw of terrain
    const { ui, simulation } = this.stores;
    ui.showTerrainUI = !ui.showTerrainUI;
    const prefix = "data/";
    const zoneTypes: string[] = [];
    simulation.zones.forEach((z, i) => {
      if (i < urlConfigWithDefaultValues.zonesCount) {
        zoneTypes.push(TerrainType[z.terrainType].toLowerCase());
      }
    });
    simulation.dataReady = false;
    simulation.config.elevation = prefix + zoneTypes.join("-") + "-heightmap.png";
    simulation.restart();
  }
  public handleZoneChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    // Radio buttons always return string values. We're using hidden radio buttons to change selected zone
    const newZone = parseInt(event.target.value, 10);
    if (newZone !== this.state.selectedZone) {
      this.setState({ selectedZone: newZone });
    }
  }
  public showNextPanel = (event: React.MouseEvent<HTMLButtonElement, MouseEvent>) => {
    this.setState({ currentPanel: 2 });
  }
  public showPreviousPanel = (event: React.MouseEvent<HTMLButtonElement, MouseEvent>) => {
    this.setState({ currentPanel: 1 });
  }

  public handleTerrainTypeChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const { simulation } = this.stores;
    const newTerrainType = parseInt(event.target.value, 10);
    const currentZone = simulation.zones[this.state.selectedZone];
    if (currentZone.terrainType !== newTerrainType) {
      // Switching to Mountain terrain changes land type / vegetation options
      // but keeping the min / max options the same for each range helps with slider rendering.
      // Accommodate this by manual adjustment of land types when switching to-from mountain
      if (currentZone.terrainType === TerrainType.Mountains &&
        currentZone.landType === LandType.ForestLargeLitter) {
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
    const zone = Object.assign({}, simulation.zones[this.state.selectedZone]);
    const displayVegetationType =
      zone.terrainType === TerrainType.Mountains ? zone.landType - 1 : zone.landType;

    if (displayVegetationType !== value) {
      const newVegetationType =
        zone.terrainType === TerrainType.Mountains ? value + 1 : value;
      simulation.updateZoneVegetation(this.state.selectedZone, newVegetationType);
    }
  }
  public handleDroughtChange = (event: React.ChangeEvent<HTMLInputElement>, value: number) => {
    const { simulation } = this.stores;
    const currentZone = Object.assign({}, simulation.zones[this.state.selectedZone]);
    if (currentZone.moistureContent !== value) {
      simulation.updateZoneMoisture(this.state.selectedZone, value);
    }
  }

  private renderZoneTerrainTypeLabels = () => {
    const { simulation } = this.stores;
    const labels: any[] = [];
    const labelText = {
      0: "Mountains",
      1: "Foothills",
      2: "Plains"
    };
    simulation.zones.forEach((z, i) => {
      if (i < urlConfigWithDefaultValues.zonesCount) {
        labels.push(<div className={css.terrainTypeLabel} key={i}>{labelText[z.terrainType]}</div>);
      }
    });
    return labels;
  }
  private renderTerrainProperties = () => {
    const { simulation } = this.stores;
    const labels: any[] = [];

    simulation.zones.forEach((z, i) => {
      if (i < urlConfigWithDefaultValues.zonesCount) {
        const scaledMoistureContent = Math.round(z.moistureContent / urlConfigWithDefaultValues.moistureContentScale);
        labels.push(
          <TerrainSummary vegetationType={z.landType} droughtLevel={scaledMoistureContent} key={i} />
        );
      }
    });
    return labels;
  }
}
