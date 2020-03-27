import * as React from "react";
import { observer, inject } from "mobx-react";
import { HorizontalBar, Bar, ChartData } from "react-chartjs-2";
import { ChartDataModel } from "../models/chart-data";
import { ChartOptions, ChartType } from "chart.js";
import { ChartColors } from "../models/chart-data-set";
import { hexToRGBValue } from "../../utils";
import { draw } from "patternomaly";
import { BaseComponent } from "../../components/base";

interface IBarProps {
  chartFont?: string;
  width?: number;
  height?: number;
  barChartType: ChartType;
}
interface IBarState { }

const defaultOptions: ChartOptions = {
  plugins: {
    datalabels: {
      display: false,
    },
  },
  title: {
    display: false,
    text: "",
    fontSize: 22
  },
  legend: {
    display: true,
    position: "bottom",
    labels: {
      filter: (legendItem: any, chartData: any) => {
        // Hidden labels, like for "extra" bars, are marked with a "#"
        return legendItem.text.indexOf("#") === -1;
      },
      fontFamily: "Arial",
      fontSize: 12,
      fontColor: "#434e56",
      boxWidth: 12,
      padding: 10,
    }
  },
  layout: {
    padding: {
      left: 0,
      right: 10,
      top: 0,
      bottom: 0
    }
 },
  maintainAspectRatio: false,
  scales: {
    xAxes: [{
      ticks: {
        min: 0,
        max: 100,
        fontSize: 10
      },
      stacked: true
    }],
    yAxes: [{
      ticks: {
        min: 0,
        max: 100,
        fontSize: 10
      },
      stacked: true
    }]
  },
  tooltips: {
    enabled: false
  }
};

const barDatasetDefaults: ChartData<any> = {
  label: "",
  fill: false,
  data: [0],
  borderWidth: 0
};

const barData = (chartData: ChartDataModel) => {
  const barDatasets = [];
  for (const d of chartData.dataSets) {
    const dset = Object.assign({}, barDatasetDefaults, {
      label: d.name,
      data: d.dataA1,
    });
    const seriesOpacity = d.backgroundOpacity ? d.backgroundOpacity : 0.4;
    if (d.color) {
      // One color for all bars
      if (d.graphPattern !== undefined) {
        dset.backgroundColor = [draw(d.graphPattern, hexToRGBValue(d.color, 1.0), "#FFF", 10),
                                draw(d.graphPattern, hexToRGBValue(d.color, 1.0), "#FFF", 10),
                                draw(d.graphPattern, hexToRGBValue(d.color, 1.0), "#FFF", 10)];
      } else {
        dset.backgroundColor = hexToRGBValue(d.color, 1.0);
      }
      dset.borderColor = hexToRGBValue(d.color, 1.0);
    } else if (d.pointColors) {
      // If we have specified point colors, use those first to color each bar,
      // then if we run out of defined colors we fall back to the defaults
      const colors = d.pointColors.concat(ChartColors.map(c => c.hex));
      dset.backgroundColor = colors.map(c => hexToRGBValue(c, seriesOpacity));
      dset.borderColor = colors.map(c => hexToRGBValue(c, 1.0));
    } else {
      // Default to predefined colors
      dset.backgroundColor = ChartColors.map(c => hexToRGBValue(c.hex, seriesOpacity));
      dset.borderColor = ChartColors.map(c => hexToRGBValue(c.hex, 1.0));
    }
    dset.stack = d.stack;
    barDatasets.push(dset);
  }

  const barChartData = {
    labels: chartData.chartLabels,
    datasets: barDatasets
  };

  return barChartData;
};

@inject("stores")
@observer
export class BarChart extends BaseComponent<IBarProps, IBarState> {
  constructor(props: IBarProps) {
    super(props);
  }

  public render() {
    const { chartStore } = this.stores;
    const { chartFont, width, height, barChartType } = this.props;
    const chartDisplay = barData(chartStore.chart);
    const options: ChartOptions = Object.assign({}, defaultOptions, {
      title: {
        fontFamily: chartFont ? chartFont : undefined
      },
      scales: {
        xAxes: [{
          ticks: {
            min: 0,
            max: chartStore.chart.minMaxAll.maxA1
          },
          stacked: true
        }],
        yAxes: [{
          ticks: {
            min: 0,
            max: chartStore.chart.minMaxAll.maxA1
          },
          stacked: true
        }]
      }
    });
    const w = width ? width : 400;
    const h = height ? height : 400;
    if (barChartType === "bar") {
      return (
        <Bar
          data={chartDisplay}
          options={options}
          height={h}
          width={w}
          redraw={false}
          data-test="bar"
        />
      );
    } else {
      return (
        <HorizontalBar
          data={chartDisplay}
          options={options}
          height={h}
          width={w}
          redraw={false}
          data-test="horizontal-bar"
        />
      );
    }

  }
}

export default BarChart;
