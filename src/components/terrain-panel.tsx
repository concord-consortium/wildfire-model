import { inject, observer } from "mobx-react";
import React from "react";
import { BaseComponent, IBaseProps } from "./base";
import { Button } from "@material-ui/core";
import { renderZones } from "./zone-selector";
import { TerrainTypeSelector } from "./terrain-type-selector";
import { VegetationSelector } from "./vegetation-selector";
import { DroughtSelector } from "./drought-selector";
import { TerrainType, Vegetation } from "../models/fire-model";
import { WindCircularControl } from "./wind-circular-control";
import { TerrainSummary } from "./terrain-summary";

import css from "./terrain-panel.scss";

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
    const { ui, simulation, simulation: {config} } = this.stores;
    const { selectedZone, currentPanel } = this.state;
    const zone = simulation.zones[selectedZone];
    const displayVegetationType =
      zone.terrainType === TerrainType.Mountains ? zone.vegetation - 1 : zone.vegetation;
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
            {renderZones(
              simulation.zones,
              selectedZone,
              currentPanel === 2,
              config,
              this.handleZoneChange)}
            </div>
          {currentPanel === 1 &&
            <div className={css.panel}>
              <div className={css.terrainSelector}>
                {config.zonesCount > 2 && simulation.zones.length > 2 &&
                  <div className={css.terrainTypeLabels}>{this.renderZoneTerrainTypeLabels()}</div>
                }
                {!config.elevation && config.zonesCount === 2 &&
                  <TerrainTypeSelector
                    terrainType={zone.terrainType}
                    onChange={this.handleTerrainTypeChange} />
                }
              </div>
              <div className={css.selectors}>
                <div className={css.selector}>
                  <VegetationSelector
                    vegetation={displayVegetationType}
                    terrainType={zone.terrainType}
                    onChange={this.handleVegetationChange} />
                </div>
                <div className={css.selector}>
                  <DroughtSelector
                    droughtLevel={zone.droughtLevel}
                    onChange={this.handleDroughtChange}
                    disabled={simulation.config.droughtIndexLocked}
                  />
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
                  <WindCircularControl />
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

  public applyAndClose = () => {
    const { ui, simulation } = this.stores;
    ui.showTerrainUI = !ui.showTerrainUI;
    simulation.populateCellsData();
  }

  public handleZoneChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    // Radio buttons always return string values. We're using hidden radio buttons to change selected zone
    const newZone = parseInt(event.target.value, 10);
    if (newZone !== this.state.selectedZone) {
      this.setState({ selectedZone: newZone });
    }
  }

  public showNextPanel = () => {
    this.setState({ currentPanel: 2 });
  }

  public showPreviousPanel = () => {
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
      if (newTerrainType !== TerrainType.Mountains && currentZone.vegetation === Vegetation.ForestLargeLitter) {
        // switching from Mountains with large forests to lower land type, reduce forest size
        simulation.updateZoneVegetation(this.state.selectedZone, Vegetation.ForestSmallLitter);
      } else if (newTerrainType === TerrainType.Mountains && currentZone.vegetation === Vegetation.Grass) {
        // no grass allowed on mountains, switch to shrubs
        simulation.updateZoneVegetation(this.state.selectedZone, Vegetation.Shrub);
      }
      simulation.updateZoneTerrain(this.state.selectedZone, newTerrainType);
    }
  }

  public handleVegetationChange = (event: React.ChangeEvent<HTMLInputElement>, value: number) => {
    const { simulation } = this.stores;
    const zone = simulation.zones[this.state.selectedZone];
    const newVegetationType = zone.terrainType === TerrainType.Mountains ? value + 1 : value;
    simulation.updateZoneVegetation(this.state.selectedZone, newVegetationType);
  }

  public handleDroughtChange = (event: React.ChangeEvent<HTMLInputElement>, value: number) => {
    const { simulation } = this.stores;
    simulation.updateZoneMoisture(this.state.selectedZone, value);
  }

  private renderZoneTerrainTypeLabels = () => {
    const { simulation, simulation: { config } } = this.stores;
    const labels: any[] = [];
    const labelText = {
      0: "Plains",
      1: "Foothills",
      2: "Mountains"
    };
    simulation.zones.forEach((z, i) => {
      if (i < config.zonesCount) {
        labels.push(<div className={css.terrainTypeLabel} key={i}>{labelText[z.terrainType]}</div>);
      }
    });
    return labels;
  }

  private renderTerrainProperties = () => {
    const { simulation, simulation: { config }  } = this.stores;
    const labels: any[] = [];

    simulation.zones.forEach((z, i) => {
      if (i < config.zonesCount) {
        labels.push(
          <TerrainSummary vegetationType={z.vegetation} droughtLevel={z.droughtLevel} key={i} />
        );
      }
    });
    return labels;
  }
}
