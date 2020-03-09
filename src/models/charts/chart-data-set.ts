import { types, Instance } from "mobx-state-tree";
import { downsample } from "../../data";
import css from "../../components/common.scss";

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
  colorChartYellow: css.chartYellow
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

export const DataPoint = types
  .model("DataPoint", {
    label: types.string,
    a1: types.number,
    a2: types.number
  });
export type DataPointType = typeof DataPoint.Type;

export const GraphPatternTypeEnum = types.enumeration("type", ["diagonal", "diagonal-right-left"]);
export type GraphPatternType = typeof GraphPatternTypeEnum.Type;

export const ChartDataSetModel = types
  .model("ChartDataSet", {
    name: types.string,
    dataPoints: types.array(DataPoint),
    // A single color will apply to a whole dataset (a line on a line graph, or all bars on a bar chart)
    color: types.maybe(types.string),
    // An array will vary each point's color
    // useful for bar charts with different color bars or scatter plots with each point a different color
    pointColors: types.maybe(types.array(types.string)),
    // For bars, can vary opacity of the bar by dataset to show a second dataset with less opacity
    backgroundOpacity: types.maybe(types.number),
    graphPattern: types.maybe(GraphPatternTypeEnum),
    // If maxPoints is 0 we will always work with the entire data set
    maxPoints: types.optional(types.number, -1),
    fixedMinA1: types.maybe(types.number),
    fixedMaxA1: types.maybe(types.number),
    fixedMinA2: types.maybe(types.number),
    fixedMaxA2: types.maybe(types.number),
    // if x data points are not sequential 1,2,3..., and we are setting maxPoints, we need to have an
    // initial maximum which is not simply the value of maxPoints, which is otherwise the default.
    initialMaxA1: types.maybe(types.number),
    // expandOnly is used for y-axis scaling. When requesting min/max point values,
    // if this is set the a2 / y axis max returns the max of the full data set, not just the visiblePoints
    expandOnly: false,
    fixedLabelRotation: types.maybe(types.number),
    dataStartIdx: types.maybe(types.number),
    stack: types.maybe(types.string),
    axisLabelA1: types.maybe(types.string),
    axisLabelA2: types.maybe(types.string),
    // Sets whether we start downsampling the data after a certain number of points, for performant live data
    downsample: true,
    // The maximum points the visible data will ever contain, if we downsample
    downsampleMaxLength: 120,
    // For live data, we may not want to downsample the data every step, or we'll see the past data points constantly
    // changing. Rather, we downsample all the data up to a certain point, then add growWindow more points as-is,
    // and then resample the entire set and start again.
    // In order to always downsample the entire dataset (e.g. for static data), set downsampleGrowWindow: 1.
    downsampleGrowWindow: 40,
    display: true
  })
  .views(self => ({
    get visibleDataPoints() {
      let points: DataPointType[];
      if (self.maxPoints && self.maxPoints > 0 && self.dataPoints.length >= self.maxPoints) {
        if (self.dataStartIdx !== undefined && self.dataStartIdx > -1) {
          points = self.dataPoints.slice(self.dataStartIdx, self.dataStartIdx + self.maxPoints);
        } else {
          // just get the tail of most recent data
          points = self.dataPoints.slice(-self.maxPoints);
        }
      } else {
        // If we don't set a max, don't use filtering
        points = self.dataPoints;
      }

      // Downsample current data, using a method that tries to keep features intact.
      // We could just always downsample to MAX_TOTAL_POINTS, but that results in the points changing every
      // tick, which is visually annoying, so instead we downsample up to MAX_TOTAL_POINTS - GROW_WINDOW, and
      // then add on the remainder as-is, and then downsample again when we grow past our window
      const {downsampleMaxLength: max, downsampleGrowWindow: growWindow} = self;
      if (self.downsample && points.length > (max - growWindow)) {
        const tailLength = points.length % growWindow;
        const dataToSample = self.dataPoints.slice(0, points.length - tailLength);
        const sampledData = downsample(dataToSample, (max - growWindow));
        points = tailLength ? sampledData.concat(points.slice(-tailLength)) : sampledData;
      }
      return points;
    }
  }))
  .views(self => ({
    // labels for a data point - essential for a bar graph, optional for a line
    get dataLabels() {
      return self.visibleDataPoints.map(p => p.label);
    },
    // Axis 1 data, for a line will be point x value, for bar will be quantity
    get dataA1() {
      return self.visibleDataPoints.map(p => p.a1);
    },
    // Axis 2 data for a line will be y value, for a bar will be label
    get dataA2() {
      if (self.visibleDataPoints.length > 0 && self.visibleDataPoints[0].a2) {
        return self.visibleDataPoints.map(p => p.a2);
      } else {
        return self.visibleDataPoints.map(p => p.label);
      }
    },
    // Determine minimum and maximum values on each axis
    get maxA1(): number | undefined {
      if (self.fixedMaxA1 !== undefined && self.dataPoints.length <= self.fixedMaxA1) {
        return self.fixedMaxA1;
      } else if (!self.visibleDataPoints || self.visibleDataPoints.length === 0) {
        if (self.initialMaxA1){
          return self.initialMaxA1;
        } else if (self.maxPoints) {
          return self.maxPoints;
        } else {
          return defaultMax;
        }
      } else if (self.visibleDataPoints && self.visibleDataPoints.length > 0 &&
        self.maxPoints && self.visibleDataPoints.length < self.maxPoints) {
          if (self.initialMaxA1){
            return self.initialMaxA1;
          } else {
            return self.maxPoints;
          }
      } else {
        return Math.max(...self.visibleDataPoints.map(p => p.a1));
      }
    },
    get maxA2(): number | undefined {
      if (self.fixedMaxA2 !== undefined && !self.expandOnly) {
        return self.fixedMaxA2;
      } else if (!self.visibleDataPoints || self.visibleDataPoints.length === 0) {
        return defaultMax;
      } else if (self.expandOnly) {
        // always return max from all points so y axis only scales up, never down
        if (self.fixedMaxA2) {
          // use fixedMax as a minimum value for max
          const dataMax = Math.max(...self.dataPoints.map(p => p.a2));
          return self.fixedMaxA2 > dataMax ? self.fixedMaxA2 : dataMax;
        } else {
          return Math.max(...self.dataPoints.map(p => p.a2));
        }
      } else {
        // only return max of visible subset of data
        return Math.max(...self.visibleDataPoints.map(p => p.a2));
      }
    },
    get minA1(): number | undefined {
      if (self.fixedMinA1 !== undefined) {
        return self.fixedMinA1;
      } else if (!self.visibleDataPoints || self.visibleDataPoints.length === 0) {
        return defaultMin;
      } else {
        return Math.min(...self.visibleDataPoints.map(p => p.a1));
      }
    },
    get minA2(): number | undefined {
      if (self.fixedMinA2 !== undefined) {
        return self.fixedMinA2;
      } else if (!self.visibleDataPoints || self.visibleDataPoints.length === 0) {
        return defaultMin;
      } else {
        return Math.min(...self.visibleDataPoints.map(p => p.a2));
      }
    },
    // Lines and scatter plots require X and Y coordinates
    get dataAsXY() {
      return self.visibleDataPoints.map(d => ({x: d.a1, y: d.a2}));
    },
    // Sort lines in increasing order of X for time-based plots
    get timeSeriesXY() {
      const xyData = self.visibleDataPoints.map(d => ({ x: d.a1, y: d.a2 }));
      xyData.sort(timeSeriesSort);
      return xyData;
    }
  }))
  .extend(self => {
    // actions
    // fetching a subset of points is designed for scrubbing back and forth along a large set of data
    // starting from a specified index. Set to -1 to remove the filter.
    const subsetPoints = (idx: number) => {
      self.dataStartIdx = idx;
    };

    const addDataPoint = (a1: number, a2: number, label: string) => {
      self.dataPoints.push({ a1, a2, label });
    };

    const updateDataPoint = (pointIdx: number, newValA1: number, newValA2: number) => {
      if (self.dataPoints[pointIdx]) {
        self.dataPoints[pointIdx].a1 = newValA1;
        self.dataPoints[pointIdx].a2 = newValA2;
      }
    };

    const deleteDataPoint = (pointIdx: number) => {
      if (self.dataPoints.length > pointIdx) {
        self.dataPoints.splice(pointIdx, 1);
      }
    };

    const changeColor = (newColor: string) => {
      self.color = newColor;
    };

    const clearDataPoints = () => {
      self.dataPoints.splice(0, self.dataPoints.length);
    };

    // used to filter data to a fixed number of points, or returns all points if set to -1
    const setMaxDataPoints = (maxPoints: number) => {
      self.maxPoints = maxPoints;
    };

    return {
      actions: {
        addDataPoint,
        updateDataPoint,
        deleteDataPoint,
        changeColor,
        clearDataPoints,
        subsetPoints,
        setMaxDataPoints
      }
    };
  });

export type ChartDataSetModelType = Instance<typeof ChartDataSetModel>;
