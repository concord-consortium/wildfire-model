import { inject, observer } from "mobx-react";
import React from "react";
import { BaseComponent, IBaseProps } from "./base";
import { Slider } from "@material-ui/core";
import HorizontalHandle from "../assets/slider-horizontal.svg";
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

@inject("stores")
@observer
export class SparkButton extends BaseComponent<IProps, IState> {
  public render() {
    const { ui, simulation } = this.stores;
    return (
      <div className={css.terrain}>
        <div className={css.widgetGroup}>
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
        </div>
        <div className={css.widgetGroup}>
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
      </div>
    );
  }

  public handleWindDirectionChange = (event: any, value: number | number[]) => {
    this.stores.simulation.setWindDirection(value as number);
  }

  public handleWindSpeedChange = (event: any, value: number | number[]) => {
    this.stores.simulation.setWindSpeed(value as number);
  }
}
