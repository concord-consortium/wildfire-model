import { inject, observer } from "mobx-react";
import React from "react";
import { BaseComponent, IBaseProps } from "./base";
import { Button } from "@material-ui/core";
import { renderZones } from "./zone-selector";
import { TerrainTypeSelector } from "./terrain-type-selector";
import { VegetationSelector } from "./vegetation-selector";
import { DroughtSelector } from "./drought-selector";
import { droughtLabels, DroughtLevel, terrainLabels, TerrainType, Vegetation, vegetationLabels } from "../types";
import { WindCircularControl } from "./wind-circular-control";
import { TerrainSummary } from "./terrain-summary";
import { log } from "@concord-consortium/lara-interactive-api";

import css from "./terrain-panel.scss";

interface IProps extends IBaseProps {}
interface IState {
  currentPanel: number;
}
const cssClasses = [css.zone1, css.zone2, css.zone3];

@inject("stores")
@observer
export class TerrainPanel extends BaseComponent<IProps, IState> {
  constructor(props: IProps) {
    super(props);
    this.state = {
      currentPanel: 1
    };
  }

  public get selectedZone() {
    return this.stores.ui.terrainUISelectedZone;
  }

  public set selectedZone(value: number) {
    this.stores.ui.terrainUISelectedZone = value;
  }

  public componentDidUpdate() {
    const { ui } = this.stores;
    if (!ui.showTerrainUI && this.state.currentPanel === 2) {
      this.setState({ currentPanel: 1 });
    }
  }

  public render() {
    const { ui, simulation, simulation: {config} } = this.stores;
    const { currentPanel } = this.state;
    const selectedZone = this.selectedZone;
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
          <div className={css.header} data-testid="terrain-header">Terrain Setup</div>
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
                    onChange={this.handleVegetationChange}
                    onChangeCommitted={this.handleVegetationChangeCommitted}
                    forestWithSuppressionAvailable={config.forestWithSuppressionAvailable}
                  />
                </div>
                <div className={css.selector}>
                  <DroughtSelector
                    droughtLevel={zone.droughtLevel}
                    onChange={this.handleDroughtChange}
                    onChangeCommitted={this.handleDroughtChangeCommitted}
                    severeDroughtAvailable={simulation.config.severeDroughtAvailable}
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
    log("TerrainPanelClosed");
  }

  public applyAndClose = () => {
    const { ui, simulation } = this.stores;
    ui.showTerrainUI = !ui.showTerrainUI;
    simulation.populateCellsData();
    log("TerrainPanelSettingsSaved");
  }

  public handleZoneChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    // Radio buttons always return string values. We're using hidden radio buttons to change selected zone
    const newZone = parseInt(event.target.value, 10);
    if (newZone !== this.selectedZone) {
      this.selectedZone = newZone;
    }
    log("TerrainPanelZoneChanged", { zone: newZone });
  }

  public showNextPanel = () => {
    this.setState({ currentPanel: 2 });
    log("TerrainPanelNextButtonClicked");
  }

  public showPreviousPanel = () => {
    this.setState({ currentPanel: 1 });
    log("TerrainPanelPreviousButtonClicked");
  }

  public handleTerrainTypeChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const { simulation } = this.stores;
    const newTerrainType = parseInt(event.target.value, 10) as TerrainType;
    const currentZone = simulation.zones[this.selectedZone];
    const logData: any = { zone: this.selectedZone };
    if (currentZone.terrainType !== newTerrainType) {
      // Switching to Mountain terrain changes land type / vegetation options
      // but keeping the min / max options the same for each range helps with slider rendering.
      // Accommodate this by manual adjustment of land types when switching to-from mountain
      if (newTerrainType !== TerrainType.Mountains && currentZone.vegetation === Vegetation.ForestWithSuppression) {
        // switching from Mountains with large forests to lower land type, reduce forest size
        simulation.updateZoneVegetation(this.selectedZone, Vegetation.Forest);
        logData.vegetation = vegetationLabels[Vegetation.Forest];
      } else if (newTerrainType === TerrainType.Mountains && currentZone.vegetation === Vegetation.Grass) {
        // no grass allowed on mountains, switch to shrubs
        simulation.updateZoneVegetation(this.selectedZone, Vegetation.Shrub);
        logData.vegetation = vegetationLabels[Vegetation.Shrub];
      }
      simulation.updateZoneTerrain(this.selectedZone, newTerrainType);
      logData.terrain = terrainLabels[newTerrainType];
      log("ZoneUpdated", logData);
    }
  }

  public handleVegetationChange = (event: React.ChangeEvent<HTMLInputElement>, value: number) => {
    const { simulation } = this.stores;
    const zone = simulation.zones[this.selectedZone];
    if (zone.vegetation !== value) {
      simulation.updateZoneVegetation(this.selectedZone, value);
    }
  }

  public handleVegetationChangeCommitted = (event: React.ChangeEvent<HTMLInputElement>, value: number) => {
    const { simulation } = this.stores;
    const zone = simulation.zones[this.selectedZone];
    log("ZoneUpdated", { zone: this.selectedZone, vegetation: vegetationLabels[value as Vegetation] });
  }

  public handleDroughtChange = (event: React.ChangeEvent<HTMLInputElement>, value: number) => {
    const { simulation } = this.stores;
    const zone = simulation.zones[this.selectedZone];
    if (zone.droughtLevel !== value) {
      simulation.updateZoneMoisture(this.selectedZone, value);
    }
  }

  public handleDroughtChangeCommitted = (event: React.ChangeEvent<HTMLInputElement>, value: number) => {
    log("ZoneUpdated", { zone: this.selectedZone, moisture: droughtLabels[value as DroughtLevel] });
  }

  private renderZoneTerrainTypeLabels = () => {
    const { simulation, simulation: { config } } = this.stores;
    const labels: any[] = [];
    simulation.zones.forEach((z, i) => {
      if (i < config.zonesCount) {
        labels.push(<div className={css.terrainTypeLabel} key={i}>{ terrainLabels[z.terrainType] }</div>);
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
