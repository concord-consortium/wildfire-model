import { ChartDataSet, ChartColors } from "./chart-data-set";
import { ChartAnnotation } from "./chart-annotation";
import { observable } from "mobx";

export interface IChartDataModel{
  name: string;
  dataSets: ChartDataSet[];
  labels?: string[];
  annotations?: ChartAnnotation[];
}

export class ChartDataModel implements IChartDataModel {
  public name: string;
  public dataSets: ChartDataSet[];
  public labels?: string[];
  public annotations?: ChartAnnotation[];

  constructor(props: IChartDataModel) {
    Object.assign(this, props);
  }

  public get visibleDataSets() {
    return this.dataSets.filter(d => d.display);
  }

  public get chartLabels() {
    if (this.labels && this.labels.length > 0) {
      return this.labels;
    } else return [];
  }

  // labels for a data point - essential for a bar graph, optional for a line
  public get dataLabels() {
    if (this.visibleDataSets && this.visibleDataSets.length > 0) {
      return this.visibleDataSets[0].dataLabels;
    } else return [];
  }
  public get dataLabelRotation() {
    if (this.visibleDataSets && this.visibleDataSets.length > 0) {
      return this.visibleDataSets[0].fixedLabelRotation;
    } else return;
  }
  public get minMaxAll() {
    const maxA1Values: number[] = [];
    const maxA2Values: number[] = [];
    const minA1Values: number[] = [];
    const minA2Values: number[] = [];

    this.visibleDataSets.forEach((d) => {
      maxA1Values.push(d.maxA1 || 100);
      maxA2Values.push(d.maxA2 || 100);
      minA1Values.push(d.minA1 || 0);
      minA2Values.push(d.minA2 || 0);
    });

    return {
      maxA1: Math.max(...maxA1Values),
      maxA2: Math.max(...maxA2Values),
      minA1: Math.min(...minA1Values),
      minA2: Math.min(...minA2Values),
    };
  }
  public get nextDataSeriesColor() {
    return ChartColors[this.dataSets.length];
  }

  public get maxPoints() {
    return this.visibleDataSets[0].maxPoints;
  }

  public get pointCount() {
    return this.visibleDataSets[0].dataPoints.length;
  }

  public get subsetIdx() {
    return this.visibleDataSets[0].dataStartIdx;
  }

  public get axisLabelA1() {
    if (this.visibleDataSets && this.visibleDataSets.length > 0) {
      return this.visibleDataSets[0].axisLabelA1;
    } else {
      return "";
    }
  }

  public get axisLabelA2() {
    if (this.visibleDataSets && this.visibleDataSets.length > 0) {
      return this.visibleDataSets[0].axisLabelA2;
    } else {
      return "";
    }
  }

  public get formattedAnnotations() {
    if (this.annotations && this.annotations.length > 0) {
      return this.annotations!.map(a => a.formatted);
    }
  }

  public addDataSet = (dataSet: ChartDataSet) => {
    this.dataSets.push(dataSet);
  }
  // If we want to scrub back and forth along a timeline of data points, but still need
  // to limit our data point quantity for performance, pass a start index and
  // the number of required points to filter the data
  public setDataSetSubset = (idx: number, maxPoints: number) => {
    this.dataSets.forEach(d => {
      d.subsetPoints(idx);
      if (this.maxPoints !== maxPoints) {
        d.setMaxDataPoints(maxPoints);
      }
    });
  }
  // To fetch all data from all datasets, remove any subset index points and set the max number of points to -1
  // to ensure all data is returned unfiltered
  public allData = () => {
    this.dataSets.forEach(d => {
      d.subsetPoints(-1);
      d.setMaxDataPoints(-1);
    });
  }

  public addAnnotation = (annotation: ChartAnnotation) => {
    this.annotations!.push(annotation);
  }

  public removeAnnotation = (annotation: ChartAnnotation) => {
    // this.annotations.remove(annotation);
  }

  public clearAnnotations = () => {
    // this.annotations.clear();
  }
}
