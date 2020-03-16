import * as React from "react";
import { observer } from "mobx-react";
import { BarChart } from "./bar-chart";
import { LineChart } from "./line-chart";
import { ChartDataModel } from "../models/chart-data";

import "./chart.sass";

export type ChartType = "line" | "bar" | "horizontalBar";

interface IChartProps {
  title: string;
  chartData: ChartDataModel;
  chartType: ChartType;
  width?: number;
  height?: number;
  isPlaying: boolean;
  axisLabelConversion: any;
}

interface IChartState {}

@observer
export class Chart extends React.Component<IChartProps, IChartState> {

  public render() {
    const { chartType, chartData, width, height, isPlaying, axisLabelConversion } = this.props;
    const chart = chartType === "line" ?
      <LineChart
        chartData={chartData}
        chartFont={"'Roboto Condensed', 'Helvetica Condensed', 'Arial Narrow', 'Helvetica', 'Arial'"}
        width={this.props.width}
        height={this.props.height}
        isPlaying={isPlaying}
        data-test="line-chart"
        axisLabelConversion={axisLabelConversion}
      />
      :
      <BarChart
        chartData={chartData}
        chartFont={"'Roboto Condensed', 'Helvetica Condensed', 'Arial Narrow', 'Helvetica', 'Arial'"}
        width={width}
        height={height}
        barChartType={chartType}
        data-test="bar-chart"
      />;
    return (
      <div className="chart-container">
        {chart}
      </div>
    );
  }
}
