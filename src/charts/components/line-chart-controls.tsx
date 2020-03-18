import * as React from "react";
import { observer } from "mobx-react";
import { ChartDataModel} from "../models/chart-data";
import { baseColors } from "../models/chart-data-set";
import Slider from "rc-slider";
import { BaseComponent } from "../../components/base";

import * as css from "./line-chart-controls.sass";
import "rc-slider/assets/index.css";

interface IChartControlProps {
  chartData: ChartDataModel;
  isPlaying: boolean;
}

interface IChartControlState {
  scrubberPosition: number;
  scrubberMin: number;
  scrubberMax: number;
}

@observer
export class LineChartControls extends BaseComponent<IChartControlProps, IChartControlState> {
  public static getDerivedStateFromProps: any = (nextProps: IChartControlProps, prevState: IChartControlState) => {
    const { chartData, isPlaying } = nextProps;
    const nextState: IChartControlState = {} as any;

    if (isPlaying) {
      nextState.scrubberPosition = chartData.pointCount;
      const maxPoints = chartData.maxPoints ? chartData.maxPoints : 100;
      if (chartData.subsetIdx !== -1) {
        chartData.setDataSetSubset(-1, maxPoints);
      }
      if (prevState.scrubberMax !== chartData.pointCount) {
        nextState.scrubberMax = chartData.pointCount;
      }
    }
    return nextState;
  }

  public state: IChartControlState = {
    scrubberPosition: 0,
    scrubberMin: 0,
    scrubberMax: 0
  };

  public render() {
    const { chartData, isPlaying } = this.props;
    const { scrubberPosition, scrubberMin, scrubberMax } = this.state;
    const pos = scrubberPosition ? scrubberPosition : 0;
    const timelineVisible = chartData.maxPoints && chartData.maxPoints > 0 &&
      chartData.pointCount > chartData.maxPoints;

    const trackStyle = { backgroundColor: baseColors.chartColor5, height: 2 };
    const handleStyle = {
      borderColor: baseColors.controlGray
    };
    const railStyle = { backgroundColor: baseColors.controlGray, height: 2 };
    const toggleShowAllOrRecent = () => {
      if (chartData) {
        if (!chartData.maxPoints || chartData.maxPoints > -1) {
          chartData.dataSets.forEach((dataSet: any) => {
            dataSet.setMaxDataPoints(-1);
          });
        } else {
          chartData.dataSets.forEach((dataSet: any) => {
            dataSet.setMaxDataPoints(20);
          });
        }
      }
    };
    const toggleButtonText = () => {
      if (chartData) {
        if (!chartData.maxPoints || chartData.maxPoints > -1) {
          return "Show All Data";
        } else {
          return "Show Recent Data";
        }
      } else {
        return "No Data Available";
      }
    };
    return (
      <div className={css.lineChartControls} id="line-chart-controls">
        <div className={css.sliderContainer}>
          {timelineVisible &&
            <Slider className={css.scrubber}
              trackStyle={trackStyle}
              handleStyle={handleStyle}
              railStyle={railStyle}
              onChange={this.handleDragChange}
              min={scrubberMin}
              max={scrubberMax}
              value={pos}
              disabled={false}
            />
          }
          </div>
        <div className={css.toggleDataSubset} onClick={toggleShowAllOrRecent}>{toggleButtonText()}</div>
      </div>
    );
  }

  private handleDragChange = (value: number) => {
    const { chartData } = this.props;

    // slider covers whole dataset
    // retrieve maxPoints for subset based on percentage along of the slider
    const sliderPercentage = value / chartData.pointCount;
    const maxPoints = chartData.maxPoints ? chartData.maxPoints : 20;
    const dataRangeMax = chartData.pointCount - maxPoints;
    if (dataRangeMax > 0) {
      const startIdx = Math.round(sliderPercentage * dataRangeMax);
      chartData.setDataSetSubset(startIdx, maxPoints);
      this.setState({
        scrubberPosition: value,
        scrubberMax: chartData.pointCount
      });
    }
  }
}
