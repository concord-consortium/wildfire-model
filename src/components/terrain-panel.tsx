import { inject, observer } from "mobx-react";
import React from "react";
import { BaseComponent, IBaseProps } from "./base";
import { Slider, Button} from "@material-ui/core";
import HorizontalHandle from "../assets/slider-horizontal.svg";
import { TerrainTypeSelector } from "./terrain-type-selector";
import { VegetationSelector } from "./vegetation-selector";
import { DroughtSelector } from "./drought-selector";
import { LandType } from "../models/fire-model";

import css from "./terrain-panel.scss";
import { Zone } from "../models/zone";
import { TerrainType } from "../types";

interface IProps extends IBaseProps {}
interface IState {
  selectedZone: number;
}

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
const cssClasses = [css.zone1, css.zone2, css.zone3];

const backgroundImage: { [key: string]: string } = {
  mountains: "./mountains_sample.jpg",
  foothills: "./foothills_sample.jpg",
  plains: "./plains_sample.jpg"
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
    const zoneUI = this.renderZones(simulation.zones);
    return (
      <div className={`${css.terrain} ${ui.showTerrainUI ? "" : css.disabled}`}>
        <div className={`${css.background} ${cssClasses[selectedZone]}`}>
          <div className={css.header}>Terrain Setup</div>
          <div className={css.instructions}>
            <span className={css.setupStepIcon}>1</span>Adjust variables in each zone</div>
          {ui.showTerrainUI && zoneUI &&
            <div className={css.zones}>
              {zoneUI}
            </div>
          }
          <div className={css.terrainSelector}>
            <TerrainTypeSelector zone={selectedZone} onChange={this.handleTerrainTypeChange} />
          </div>
          <div className={css.selectors}>
            <div className={css.selector}>
              <VegetationSelector zone={selectedZone} vegetationType="shrub" onChange={this.handleVegetationChange} />
            </div>
            <div className={css.selector}>
              <DroughtSelector zone={selectedZone} droughtIndex="mild" onChange={this.handleDroughtChange}/>
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

  public handleZoneChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const newZone = parseInt(event.target.value, 10);
    this.setState({ selectedZone: newZone });
  }

  public handleTerrainTypeChange = (event: React.ChangeEvent<HTMLInputElement>, value: string) => {
    const { ui, simulation } = this.stores;
    simulation.zones[this.state.selectedZone].terrainType = value as TerrainType;
    // console.log(value);
  }
  public handleVegetationChange = (event: React.ChangeEvent<HTMLInputElement>, value: string) => {
    // console.log(value);
    // something like this.stores.simulation.setZoneParams()
  }
  public handleDroughtChange = (event: React.ChangeEvent<HTMLInputElement>, value: string) => {
    // console.log(value);
    // something like this.stores.simulation.setZoneParams()
  }

  private renderZones = (zones: Zone[]) => {
    const { selectedZone } = this.state;
    let i = 0;
    const zoneUI = [];
    for (const z of zones) {
      zoneUI.push(
        <div className={`${ css.zone } ${cssClasses[i]} ${selectedZone === i ? css.selected : ""}`} key={i} >
          <label className={css.terrainPreview}>
            <input type="radio"
              className={css.zoneOption}
              value={i}
              checked={selectedZone === i}
              onChange={this.handleZoneChange}/>
            <div className={css.terrainImage}
                style={{ backgroundImage: `url(${backgroundImage[z.terrainType]})` }}>
              <span className={`${css.zoneLabel} ${cssClasses[i]}`}>{`Zone ${i + 1}`}</span>
            </div>
          </label>
        </div>
      );
      i++;
    }
    return zoneUI;
  }
}
