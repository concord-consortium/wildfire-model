import * as React from "react";
import { observer, inject } from "mobx-react";
import { BarChart } from "./bar-chart";
import { LineChart } from "./line-chart";
import { BaseComponent } from "../../components/base";

export type ChartType = "line" | "bar" | "horizontalBar";

interface IChartProps {
  title: string;
  chartType: ChartType;
  width?: number;
  height?: number;
  isPlaying: boolean;
  axisLabelA1Function: any;
  axisLabelA2Function: any;
}

interface IChartState {}

@inject("stores")
@observer
export class Chart extends BaseComponent<IChartProps, IChartState> {

  public render() {
    const { chartStore } = this.stores;
    const { chartType, width, height, isPlaying, axisLabelA1Function, axisLabelA2Function } = this.props;
    const chart = chartType === "line" ?
      <LineChart
        chartFont={"'Roboto Condensed', 'Helvetica Condensed', 'Arial Narrow', 'Helvetica', 'Arial'"}
        width={this.props.width}
        height={this.props.height}
        isPlaying={isPlaying}
        data-testid="line-chart"
        axisLabelA1Function={axisLabelA1Function}
        axisLabelA2Function={axisLabelA2Function}
        key={chartStore.chartVersion}
      />
      :
      <BarChart
        chartFont={"'Roboto Condensed', 'Helvetica Condensed', 'Arial Narrow', 'Helvetica', 'Arial'"}
        width={width}
        height={height}
        barChartType={chartType}
        data-testid="bar-chart"
        key={chartStore.chartVersion}
      />;
    return (
      <div className="chart-container">
        {chart}
      </div>
    );
  }
}
