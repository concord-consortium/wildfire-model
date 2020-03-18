import { downsample } from "../downsample-data";
import { observable } from "mobx";
import css from "../chart-colors.scss";

const MAX_TOTAL_POINTS = 120;
const GROW_WINDOW = 40;

export interface Color {
  name: string;
  hex: string;
}

interface XYPoint {
  x: number;
  y: number;
}
export const baseColors = {
  chartDataColor1: css.color7,
  chartDataColor2: css.color8,
  chartDataColor3: css.color9,
  chartDataColor4: css.color10,
  chartDataColor5: css.color1a,
  chartDataColor6: css.color2a,
  chartDataColor7: css.color3a,
  chartDataColor8: css.color4a,
  chartDataColor9: css.color5a,
  chartDataColor10: css.color6a,

  chartColor5: css.color1,
  chartColor6: css.color2,
  chartColor7: css.color3,
  chartColor8: css.color4,
  chartColor9: css.color5,
  chartColor10: css.color6,

  colorChartRed: css.chartRed,
  colorChartYellow: css.chartYellow,

  controlGray: css.controlGray
};

export const ChartColors: Color[] = [
  // bars
  { name: "blue", hex: baseColors.chartDataColor1},
  { name: "orange", hex: baseColors.chartDataColor2},
  { name: "purple", hex: baseColors.chartDataColor3},
  { name: "green", hex: baseColors.chartDataColor4},
  { name: "sage", hex: baseColors.chartDataColor5},
  { name: "rust", hex: baseColors.chartDataColor6},
  { name: "cloud", hex: baseColors.chartDataColor7},
  { name: "gold", hex: baseColors.chartDataColor8},
  { name: "terra", hex: baseColors.chartDataColor9},
  { name: "sky", hex: baseColors.chartDataColor10},

  // backgrounds
  { name: "sage", hex: baseColors.chartColor5},
  { name: "rust", hex: baseColors.chartColor6},
  { name: "cloud", hex: baseColors.chartColor7},
  { name: "gold", hex: baseColors.chartColor8},
  { name: "terra", hex: baseColors.chartColor9},
  { name: "sky", hex: baseColors.chartColor10}
];

const timeSeriesSort = (a: XYPoint, b: XYPoint) => {
  if (a.x < b.x) {
    return -1;
  }
  if (a.x > b.x) {
    return 1;
  }
  return 0;
};

const defaultMax = 100;
const defaultMin = 0;

export interface IDataPoint{
  label: string;
  a1: number;
  a2: number;
}
export class DataPoint implements IDataPoint{
  public label: string;
  public a1: number;
  public a2: number;

  constructor(props: IDataPoint) {
    Object.assign(this, props);
  }
}
export interface IChartDataSet{
  name: string;
  dataPoints: IDataPoint[];
  display: boolean;
  // optional properties
  color?: string;
  pointColors?: string[];
  backgroundOpacity?: number;
  graphPattern?: GraphPatternType;
  maxPoints?: number;
  fixedMinA1?: number;
  fixedMaxA1?: number;
  fixedMinA2?: number;
  fixedMaxA2?: number;
  initialMaxA1?: number;
  fixedLabelRotation?: number;
  dataStartIdx?: number;
  stack?: string;
  axisLabelA1?: string;
  axisLabelA2?: string;
  expandOnly?: boolean;
  dashStyle?: number[];
  downsample?: boolean;
  downsampleMaxLength?: number;
  downsampleGrowWindow?: number;
  axisRoundValueA2?: number;
}

export type GraphPatternType = "diagonal" | "diagonal-right-left";

export class ChartDataSet implements IChartDataSet {
  public name: string;
  @observable public dataPoints: IDataPoint[];

  // optional properties
  public color?: string;
  public pointColors?: string[];
  public backgroundOpacity?: number;
  public graphPattern?: GraphPatternType;
  @observable public maxPoints: number = -1;
  public fixedMinA1?: number;
  public fixedMaxA1?: number;
  public fixedMinA2?: number;
  public fixedMaxA2?: number;
  public initialMaxA1?: number;
  public fixedLabelRotation?: number;
  @observable public dataStartIdx?: number;
  public stack?: string;
  public axisLabelA1?: string = "";
  public axisLabelA2?: string = "";
  public expandOnly?: boolean = false;
  public display: boolean = true;
  public dashStyle?: number[];
  public downsample?: boolean;
  public downsampleMaxLength?: number;
  public downsampleGrowWindow?: number;
  public axisRoundValueA2?: number;

  constructor(props: IChartDataSet) {
    Object.assign(this, props);
  }

  public get visibleDataPoints(): IDataPoint[]{
    let points: IDataPoint[];
    if (this.maxPoints && this.maxPoints > 0 &&
      this.dataPoints.length >= this.maxPoints) {
      if (this.dataStartIdx !== undefined && this.dataStartIdx > -1) {
        points = this.dataPoints.slice(this.dataStartIdx, this.dataStartIdx + this.maxPoints);
      } else {
        // just get the tail of most recent data
        points = this.dataPoints.slice(-this.maxPoints);
      }
    } else {
      // If we don't set a max, don't use filtering
      points = this.dataPoints;
    }

    // Downsample current data, using a method that tries to keep features intact.
    // We could just always downsample to MAX_TOTAL_POINTS, but that results in the points changing every
    // tick, which is visually annoying, so instead we downsample up to MAX_TOTAL_POINTS - GROW_WINDOW, and
    // then add on the remainder as-is, and then downsample again when we grow past our window
    const { downsampleMaxLength: max, downsampleGrowWindow: growWindow } = this;
    if (this.downsample && points.length > (max! - growWindow!)) {
      const tailLength = points.length % growWindow!;
      const dataToSample = this.dataPoints.slice(0, points.length - tailLength);
      const sampledData = downsample(dataToSample, (max! - growWindow!));
      points = tailLength ? sampledData.concat(points.slice(-tailLength)) : sampledData;
    }
    return points;
  }

  public get dataLabels() {
    return this.visibleDataPoints.map(p => p.label);
  }

  // Axis 1 data, for a line will be point x value, for bar will be quantity
  public get dataA1() {
    return this.visibleDataPoints.map(p => p.a1);
  }
  // Axis 2 data for a line will be y value, for a bar will be label
  public get dataA2() {
    const visiblePoints = this.visibleDataPoints;
    if (visiblePoints.length > 0 && visiblePoints[0].a2) {
      return visiblePoints.map(p => p.a2);
    } else {
      return visiblePoints.map(p => p.label);
    }
  }

  // Determine minimum and maximum values on each axis
  public get maxA1(): number | undefined {
    const visiblePoints: IDataPoint[] = this.visibleDataPoints;
    if (this.fixedMaxA1 !== undefined && this.dataPoints.length <= this.fixedMaxA1) {
      return this.fixedMaxA1;
    } else if (!visiblePoints || visiblePoints.length === 0) {
      if (this.initialMaxA1){
        return this.initialMaxA1;
      } else if (this.maxPoints) {
        return this.maxPoints;
      } else {
        return defaultMax;
      }
    } else if (visiblePoints && visiblePoints.length > 0 &&
      this.maxPoints && visiblePoints.length < this.maxPoints) {
        if (this.initialMaxA1){
          return this.initialMaxA1;
        } else {
          return this.maxPoints;
        }
    } else {
      return Math.max(...visiblePoints.map(p => p.a1));
    }
  }

  public get maxA2(): number | undefined {
    if (this.fixedMaxA2 !== undefined && !this.expandOnly) {
      return this.fixedMaxA2;
    } else if (!this.visibleDataPoints || this.visibleDataPoints.length === 0) {
      return defaultMax;
    } else if (this.expandOnly) {
      // always return max from all points so y axis only scales up, never down
      if (this.fixedMaxA2) {
        // use fixedMax as a minimum value for max
        let dataMax = Math.max(...this.dataPoints.map(p => p.a2));
        // if we want the axis value to round up to nearest 10, or 100, use the axisRoundValueA2
        if (this.axisRoundValueA2) {
          dataMax = (Math.ceil(dataMax / this.axisRoundValueA2) * this.axisRoundValueA2) + this.axisRoundValueA2;
        }
        return this.fixedMaxA2 > dataMax ? this.fixedMaxA2 : dataMax;
      } else {
        return Math.max(...this.dataPoints.map(p => p.a2));
      }
    } else {
      // only return max of visible subset of data
      return Math.max(...this.visibleDataPoints.map(p => p.a2));
    }
  }
  public get minA1(): number | undefined {
    if (this.fixedMinA1 !== undefined) {
      return this.fixedMinA1;
    } else if (!this.visibleDataPoints || this.visibleDataPoints.length === 0) {
      return defaultMin;
    } else {
      return Math.min(...this.visibleDataPoints.map(p => p.a1));
    }
  }
  public get minA2(): number | undefined {
    if (this.fixedMinA2 !== undefined) {
      return this.fixedMinA2;
    } else if (!this.visibleDataPoints || this.visibleDataPoints.length === 0) {
      return defaultMin;
    } else {
      return Math.min(...this.visibleDataPoints.map(p => p.a2));
    }
  }
  // Lines and scatter plots require X and Y coordinates
  public get dataAsXY() {
    return this.visibleDataPoints.map(d => ({x: d.a1, y: d.a2}));
  }
  // Sort lines in increasing order of X for time-based plots
  public get timeSeriesXY() {
    const xyData = this.visibleDataPoints.map(d => ({ x: d.a1, y: d.a2 }));
    xyData.sort(timeSeriesSort);
    return xyData;
  }

  // actions
  // fetching a subset of points is designed for scrubbing back and forth along a large set of data
  // starting from a specified index. Set to -1 to remove the filter.
  public subsetPoints = (idx: number) => {
    this.dataStartIdx = idx;
  }

  public addDataPoint = (a1: number, a2: number, label: string) => {
    this.dataPoints.push({ a1, a2, label });
  }

  public updateDataPoint = (pointIdx: number, newValA1: number, newValA2: number, newLabel?: string) => {
    if (this.dataPoints[pointIdx]) {
      this.dataPoints[pointIdx].a1 = newValA1;
      this.dataPoints[pointIdx].a2 = newValA2;
      if (newLabel) this.dataPoints[pointIdx].label = newLabel;
    }
  }
  public addOrUpdateDataPoint = (newValA1: number, newValA2: number, label?: string) => {
    const pointIdx = this.dataPoints.findIndex(p => p.a1 === newValA1);
    if (pointIdx > -1 && this.dataPoints[pointIdx]) {
      this.updateDataPoint(pointIdx, newValA1, newValA2, label);
    } else {
      this.addDataPoint(newValA1, newValA2, label ? label : "");
    }
  }

  public deleteDataPoint = (pointIdx: number) => {
    if (this.dataPoints.length > pointIdx) {
      this.dataPoints.splice(pointIdx, 1);
    }
  }

  public changeColor = (newColor: string) => {
    this.color = newColor;
  }

  public clearDataPoints = () => {
    this.dataPoints.splice(0, this.dataPoints.length);
  }

  // used to filter data to a fixed number of points, or returns all points if set to -1
  public setMaxDataPoints = (maxPoints: number) => {
    this.maxPoints = maxPoints;
  }
}
