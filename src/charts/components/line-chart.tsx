import * as React from "react";
import { Scatter, ChartData } from "react-chartjs-2";
import { observer, inject } from "mobx-react";
import { ChartDataModel } from "../models/chart-data";
import { ChartOptions } from "chart.js";
import * as ChartAnnotation from "chartjs-plugin-annotation";
import { ChartColors } from "../models/chart-data-set";
import { hexToRGBValue } from "../utils";
import { LineChartControls } from "./line-chart-controls";
import { BaseComponent } from "../../components/base";

const LEGEND_LINE_LENGTH = 25;

// beforeDraw: Chart.js centers the legend within the (asymmetric) layout-padding box, shifting it
//   off-center — override the legend box to span the full canvas so it centers over the panel.
// afterDraw: the built-in "line" point style is capped at fontSize (getBoxWidth clamp), so the key
//   line can't exceed ~20px. The legend items suppress the default symbol (transparent fill,
//   lineWidth 0) and reserve space via boxWidth; here we draw the key line at the full length.
const legendPlugin = {
  beforeDraw(chart: any) {
    const legend = chart.legend;
    if (legend) {
      legend.left = 0;
      legend.width = chart.width;
      if (legend.minSize) {
        legend.minSize.width = chart.width;
      }
    }
  },
  afterDraw(chart: any) {
    const legend = chart.legend;
    if (!legend || !legend.legendHitBoxes) {
      return;
    }
    const ctx = chart.ctx;
    legend.legendHitBoxes.forEach((box: any, i: number) => {
      const ds = chart.data.datasets[i];
      if (!ds) {
        return;
      }
      // skip the key line for datasets hidden via the legend, so it matches the
      // struck-through label and the hidden plot line
      if (!chart.isDatasetVisible(i)) {
        return;
      }
      const y = box.top + box.height / 2;
      ctx.save();
      ctx.strokeStyle = ds.borderColor;
      ctx.lineWidth = 4;
      ctx.lineCap = "butt";
      ctx.setLineDash(ds.borderDash || []);
      ctx.beginPath();
      ctx.moveTo(box.left, y);
      ctx.lineTo(box.left + LEGEND_LINE_LENGTH, y);
      ctx.stroke();
      ctx.restore();
    });
  }
};

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
  layout: {
    padding: {
      left: 3,
      right: 19
    }
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
      const dset = { ...lineDatasetDefaults, label: d.name,
        data: d.timeSeriesXY};
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
    const options: ChartOptions = { ...defaultOptions, title: {
        // title is rendered as HTML below so it can be centered over the panel, not the plot area
        display: false
      },
      scales: {
        yAxes: [{
          id: "y-axis-0",
          ticks: {
            min: minMaxValues.minA2,
            max: minMaxValues.maxA2,
            fontFamily: chartFont,
            fontSize: 14,
            fontColor: "#434343",
            padding: 1,
            userCallback: axisLabelA2Function
          },
          scaleLabel: {
            display: !!chart.axisLabelA2,
            labelString: chart.axisLabelA2,
            fontFamily: chartFont,
            fontSize: 14,
            fontStyle: "500",
            fontColor: "#434343",
            padding: { top: 4, bottom: 3 }
          },
          gridLines: {
            color: "#dfdfdf",
            zeroLineColor: "#797979",
            drawBorder: true
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
            fontSize: 14,
            fontColor: "#434343",
            userCallback: axisLabelA1Function
          },
          scaleLabel: {
            display: !!chart.axisLabelA1,
            labelString: chart.axisLabelA1,
            fontFamily: chartFont,
            fontSize: 14,
            fontStyle: "500",
            fontColor: "#434343"
          },
          gridLines: {
            color: "#dfdfdf",
            zeroLineColor: "#797979",
            drawBorder: true
          }
        }]
      },
      legend: {
        display: true,
        position: "bottom",
        labels: {
          // key line is drawn by legendPlugin.afterDraw; suppress the built-in symbol and reserve
          // its width via boxWidth so the label sits past the drawn line
          fontFamily: chartFont,
          fontSize: 14,
          fontStyle: "normal",
          fontColor: "#434343",
          boxWidth: 24,
          padding: 14,
          generateLabels: (c: any) => c.data.datasets.map((ds: any, i: number) => ({
            text: ds.label,
            fillStyle: "transparent",
            lineWidth: 0,
            hidden: !c.isDatasetVisible(i),
            datasetIndex: i
          }))
        }
      },
      tooltips: {
        backgroundColor: "rgba(0, 0, 0, 0.8)",
        titleFontFamily: chartFont,
        titleFontSize: 14,
        bodyFontFamily: chartFont,
        bodyFontSize: 14,
        cornerRadius: 0,
        displayColors: true
      },
      annotation: {
        drawTime: "afterDraw",
        events: ["click", "mouseenter", "mouseleave"],
        annotations: chart.formattedAnnotations
      }};
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
        plugins={[ChartAnnotation, legendPlugin]}
      />;
    return (
      <div className="line-chart-container">
        {chart.name && chart.name.length > 0 &&
          <div
            className="line-chart-title"
            style={{
              textAlign: "center",
              fontFamily: chartFont,
              fontWeight: 500,
              fontSize: 16,
              color: "#434343",
              padding: "2px 0 8px"
            }}
          >
            {chart.name}
          </div>
        }
        <div className="line-chart-container" data-testid="line-chart">
          {graph}
        </div>
        <LineChartControls chartData={chart} isPlaying={isPlaying} />
      </div>
    );
  }
}

export default LineChart;
