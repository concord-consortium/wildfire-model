import { inject, observer } from "mobx-react";
import React from "react";
import { BaseComponent, IBaseProps } from "./base";
import { Slider, Button } from "@material-ui/core";
import HorizontalHandle from "../assets/slider-horizontal.svg";
import { TerrainTypeSelector } from "./terrain-type-selector";
import { VegetationSelector } from "./vegetation-selector";
import { DroughtSelector } from "./drought-selector";

import foothillsImage from "../assets/terrain/foothills_sample.png";
import mountainsImage from "../assets/terrain/mountains_sample.png";
import plainsImage from "../assets/terrain/plains_sample.png";

import css from "./terrain-panel.scss";

interface IProps extends IBaseProps {}
interface IState {}

const windDirectionMarks = [
  {
    value: 0,
    label: "0"
  },
  {
    value: 90,
    label: "90"
  },
  {
    value: 180,
    label: "180"
  },
  {
    value: 270,
    label: "270"
  },
  {
    value: 360,
    label: "360"
  },
];

const windSpeedMarks = [
  {
    value: 0,
    label: "0"
  },
  {
    value: 5,
    label: "5"
  },
  {
    value: 10,
    label: "10"
  }
];

const backgroundImage: { [key: string]: string } = {
  mountain: mountainsImage,
  foothills: foothillsImage,
  plains: plainsImage
};

@inject("stores")
@observer
export class TerrainPanel extends BaseComponent<IProps, IState> {
  public render() {
    const { ui, simulation } = this.stores;
    return (
      <div className={`${css.terrain} ${ui.showTerrainUI ? "" : css.disabled}`}>
        <div className={css.background}>
          <div className={css.header}>Terrain Setup</div>
          <div className={css.instructions}>(1) Adjust variables in each zone</div>
          <div className={css.zones}>
            <div className={css.zone}>
              <div className={css.terrainPreview} style={{ backgroundImage: `url(${backgroundImage.mountain})` }}>
                <span className={`${css.zoneLabel} ${css.zone1}`}>Zone 1</span>
              </div>
            </div>
            <div className={css.zone}>
                <div className={css.terrainPreview} style={{ backgroundImage: `url(${backgroundImage.plains})` }}>
                <span className={`${css.zoneLabel} ${css.zone2}`}>Zone 2</span>
                </div>
            </div>
          </div>
          <div className={css.terrainSelector}>
            <TerrainTypeSelector zone="1" terrainType="plains" onChange={this.handleTerrainTypeChange} />
          </div>
          <div className={css.selectors}>
            <div className={css.selector}>
              <VegetationSelector zone="1" vegetationType="shrub" onChange={this.handleVegetationChange} />
            </div>
            <div className={css.selector}>
              <DroughtSelector zone="1" droughtIndex="mild" onChange={this.handleDroughtChange}/>
            </div>
          </div>
          <div className={css.windControls}>
            <div className={`${css.slider} ${css.windDirection}`}>
              <div>Wind Direction (° from North)</div>
              <Slider
                classes={{ thumb: css.thumb }}
                min={0}
                max={360}
                disabled={simulation.simulationStarted}
                value={simulation.wind.direction}
                step={1}
                marks={windDirectionMarks}
                onChange={this.handleWindDirectionChange}
                ThumbComponent={HorizontalHandle}
              />
            </div>
            <div className={css.slider}>
              <div>Wind Speed (mph)</div>
              <Slider
                classes={{ thumb: css.thumb }}
                min={0}
                max={10}
                disabled={simulation.simulationStarted}
                value={simulation.wind.speed}
                step={0.1}
                marks={windSpeedMarks}
                onChange={this.handleWindSpeedChange}
                ThumbComponent={HorizontalHandle}
              />
            </div>
          </div>
          <div className={css.buttonContainer}><Button className={css.continueButton}>Next</Button></div>
        </div>
      </div>
    );
  }

  public handleWindDirectionChange = (event: any, value: number | number[]) => {
    this.stores.simulation.setWindDirection(value as number);
  }

  public handleWindSpeedChange = (event: any, value: number | number[]) => {
    this.stores.simulation.setWindSpeed(value as number);
  }

  public handleTerrainTypeChange = (event: React.ChangeEvent<HTMLInputElement>, value: string) => {

    // something like this.stores.simulation.setZoneParams()
  }
  public handleVegetationChange = (event: React.ChangeEvent<HTMLInputElement>, value: string) => {

    // something like this.stores.simulation.setZoneParams()
  }
  public handleDroughtChange = (event: React.ChangeEvent<HTMLInputElement>, value: string) => {

    // something like this.stores.simulation.setZoneParams()
  }
}
