import * as React from "react";
import { Scatter, ChartData } from "react-chartjs-2";
import { observer, inject } from "mobx-react";
import { ChartDataModel } from "../models/chart-data";
import { ChartOptions } from "chart.js";
import * as ChartAnnotation from "chartjs-plugin-annotation";
import { ChartColors } from "../models/chart-data-set";
import { hexToRGBValue } from "../../utils";
import { LineChartControls } from "./line-chart-controls";
import { BaseComponent } from "../../components/base";

interface ILineProps {
  chartFont?: string;
  width?: number;
  height?: number;
  isPlaying: boolean;
  axisLabelA1Function: any;
  axisLabelA2Function: any;
  key: number;
}

interface ILineState { }

const defaultOptions: ChartOptions = {
  plugins: {
    datalabels: {
      display: false,
    },
  },
  annotation: {
    drawTime: "afterDraw",
    events: ["click", "mouseenter", "mouseleave"],
    annotations: []
  },
  animation: {
    duration: 0
  },
  title: {
    display: true,
    text: "Data",
    fontSize: 22
  },
  legend: {
    display: true,
    position: "bottom",
  },
  maintainAspectRatio: false,
  scales: {
    display: false,
    yAxes: [{
      id: "y-axis-0",
      ticks: {
        min: 0,
        max: 100
      },
      scaleLabel: {
        display: true,
        fontSize: 12
      }
    }],
    xAxes: [{
      id: "x-axis-0",
      display: true,
      ticks: {
        min: 0,
        max: 100
      }
    }]
  },
  elements: { point: { radius: 0 } }
} as ChartOptions;

const lineDatasetDefaults: ChartData<any> = {
  label: "",
  fill: false,
  lineTension: 0.2,
  pointBorderWidth: 1,
  pointHoverRadius: 5,
  pointHoverBorderWidth: 2,
  pointRadius: 1,
  pointHitRadius: 10,
  data: [0],
  backgroundColor: ChartColors.map(c => hexToRGBValue(c.hex, 0.4)),
  pointBackgroundColor: ChartColors.map(c => hexToRGBValue(c.hex, 0.4)),
  borderColor: ChartColors.map(c => hexToRGBValue(c.hex, 1.0)),
  pointBorderColor: ChartColors.map(c => hexToRGBValue(c.hex, 1.0)),
  pointHoverBackgroundColor: ChartColors.map(c => hexToRGBValue(c.hex, 1.0)),
  pointHoverBorderColor: ChartColors.map(c => hexToRGBValue(c.hex, 1.0)),
  showLine: true
};

const lineData = (chartData: ChartDataModel) => {
  const lineDatasets = [];
  if (chartData.visibleDataSets) {
    for (const d of chartData.visibleDataSets) {
      const dset = Object.assign({}, lineDatasetDefaults, {
        label: d.name,
        data: d.timeSeriesXY
      });
      if (d.color) {
        // backgroundColor is the color under the line, if we decide to fill that area
        dset.backgroundColor = hexToRGBValue(d.color, 0.4);
        // borderColor is the color of the line
        dset.borderColor = hexToRGBValue(d.color, 1);
        dset.pointBorderColor = hexToRGBValue(d.color, 1);
        dset.pointHoverBackgroundColor = hexToRGBValue(d.color, 1);
        dset.pointHoverBorderColor = hexToRGBValue(d.color, 1);
      }
      if (d.pointColors) {
        // If we have specified point colors, use those first,
        // then if we run out of colors we fall back to the defaults
        const colors = d.pointColors.concat(ChartColors.map(c => c.hex));
        dset.pointBackgroundColor = colors.map(c => hexToRGBValue(c, 0.4));
        dset.pointBorderColor = colors.map(c => hexToRGBValue(c, 1.0));
        dset.pointHoverBackgroundColor = colors.map(c => hexToRGBValue(c, 1.0));
        dset.pointHoverBorderColor = colors.map(c => hexToRGBValue(c, 1.0));
      }
      if (d.dashStyle) {
        dset.borderDash = d.dashStyle;
      }
      if (d.fixedLabelRotation) {
        dset.minRotation = d.fixedLabelRotation;
        dset.maxRotation = d.fixedLabelRotation;
      }
      // optimize rendering
      if (d.visibleDataPoints.length >= 80) {
        dset.lineTension = 0;
      }

      dset.dataPoints = d.visibleDataPoints;

      lineDatasets.push(dset);
    }
  }
  const linePlotData = {
    labels: chartData.dataLabels,
    datasets: lineDatasets
  };

  return linePlotData;
};

@inject("stores")
@observer
export class LineChart extends BaseComponent<ILineProps, ILineState> {
  constructor(props: ILineProps) {
    super(props);
  }

  public render() {
    const { chartStore: { chart } } = this.stores;
    const {
      chartFont,
      width,
      height,
      isPlaying,
      axisLabelA1Function,
      axisLabelA2Function,
      key } = this.props;
    const chartDisplay = lineData(chart);
    const minMaxValues = chart.minMaxAll;
    const options: ChartOptions = Object.assign({}, defaultOptions, {
      title: {
        display: (chart.name && chart.name.length > 0),
        text: chart.name,
        fontFamily: chartFont,
        fontSize: 15
      },
      scales: {
        yAxes: [{
          id: "y-axis-0",
          ticks: {
            min: minMaxValues.minA2,
            max: minMaxValues.maxA2,
            fontFamily: chartFont,
            userCallback: axisLabelA2Function
          },
          scaleLabel: {
            display: !!chart.axisLabelA2,
            labelString: chart.axisLabelA2,
            fontFamily: chartFont
          }
        }],
        xAxes: [{
          id: "x-axis-0",
          ticks: {
            beginAtZero: minMaxValues.minA1 === 0,
            precision: 0,
            min: minMaxValues.minA1,
            max: minMaxValues.maxA1,
            minRotation: chart.dataLabelRotation,
            maxRotation: chart.dataLabelRotation,
            fontFamily: chartFont,
            userCallback: axisLabelA1Function
          },
          scaleLabel: {
            display: !!chart.axisLabelA1,
            labelString: chart.axisLabelA1,
            fontFamily: chartFont
          }
        }]
      },
      legend: {
        display: true,
        position: "bottom",
        labels: {
          fontFamily: chartFont
        }
      },
      annotation: {
        drawTime: "afterDraw",
        events: ["click", "mouseenter", "mouseleave"],
        annotations: chart.formattedAnnotations
      }
    });
    const w = width ? width : 400;
    const h = height ? height : 400;
    const graph: JSX.Element =
      <Scatter
        key={key}
        data={chartDisplay}
        options={options}
        height={h}
        width={w}
        redraw={true}
        plugins={[ChartAnnotation]}
      />;
    return (
      <div className="line-chart-container">
        <div className="line-chart-container" data-test="line-chart">
          {graph}
        </div>
        <LineChartControls chartData={chart} isPlaying={isPlaying} />
      </div>
    );
  }
}

export default LineChart;
