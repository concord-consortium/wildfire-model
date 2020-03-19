import { ChartDataModel } from "./chart-data";
import { ChartDataSet, DataPoint } from "./chart-data-set";

describe("chart data model", () => {
  let chart: ChartDataModel;

  beforeEach(() => {
    const chartDataSets = [];
    const points = [];
    points.push (new DataPoint({ a1: 0, a2: 10, label: "alpha" }));
    points.push (new DataPoint({ a1: 20, a2: 20, label: "bravo" }));
    points.push(new DataPoint({ a1: 50, a2: 72, label: "charlie" }));

    chartDataSets.push(new ChartDataSet({
      name: "Sample Dataset1",
      dataPoints: points,
      color: "#ff0000",
      maxPoints: 100,
      downsample: true,
      downsampleMaxLength: 120,
      downsampleGrowWindow: 40,
      display: true,
      initialMaxA1: 20,
      fixedMinA2: 0,
      fixedMaxA2: 50,
      expandOnly: true,
      axisLabelA1: "Time",
      axisLabelA2: "Value",
      axisRoundValueA2: 10
    }));

    chart = new ChartDataModel({
      name: "",
      dataSets: chartDataSets,
      defaultAxisLabelA1: "Time",
      defaultAxisLabelA2: "Value",
      defaultMaxPoints: 20,
      defaultMaxA1: 20,
      annotations: []
    });
  });

  it("has min/max values", () => {
    expect(chart.minMaxAll.minA1).toBe(0);
    expect(chart.minMaxAll.minA2).toBe(0);

    expect(chart.minMaxAll.maxA1).toBe(20);
    // our max data point is 72, we have axisRoundValueA2 of 10
    // When we use this factor, we round up to nearest 10 and add 10
    // so we'd expect the max to be 90
    expect(chart.minMaxAll.maxA2).toBe(90);
  });

  it("has labels", () => {
    expect(chart.dataLabels).toHaveLength(3);
  });

  it("can produce coordinate data", () => {
    expect(chart.dataSets[0].dataAsXY[0]).toEqual({ x: 0, y: 10 });
  });

  it("can produce label data", () => {
    expect(chart.dataLabels).toEqual(["alpha", "bravo", "charlie"]);
  });

  it("can add new data", () => {
    chart.dataSets[0].addDataPoint(60, 75, "delta");

    expect(chart.dataSets[0].dataPoints.length).toEqual(4);
    expect(chart.dataSets[0].dataAsXY[3]).toEqual({ x: 60, y: 75 });
  });

  it("can update data", () => {
    chart.dataSets[0].updateDataPoint(0, 0, 5);
    expect(chart.dataSets[0].dataAsXY[0]).toEqual({ x: 0, y: 5 });
  });

  it("can delete data", () => {
    chart.dataSets[0].deleteDataPoint(1);

    expect(chart.dataSets[0].dataPoints.length).toEqual(2);
    expect(chart.dataSets[0].dataAsXY[1]).toEqual({ x: 50, y: 72 });
  });

  it("can store multiple data sets", () => {
    const points = [];
    points.push (new DataPoint({ a1: 0, a2: 7, label: "alpha" }));
    points.push (new DataPoint({ a1: 20, a2: 15, label: "bravo" }));
    points.push (new DataPoint({ a1: 50, a2: 35, label: "charlie" }));

    chart.addDataSet(new ChartDataSet ({
      name: "Sample Dataset2",
      dataPoints: points,
      color: "#00ff00",
      maxPoints: 100,
      display: true
    }));

    expect(chart.dataSets.length).toEqual(2);
    expect(chart.dataSets[1].dataPoints.length).toEqual(3);
    expect(chart.dataSets[1].dataAsXY[1]).toEqual({ x: 20, y: 15 });

  });

  it("can retrieve a subset of data", () => {
    chart.dataSets[0].addDataPoint(65, 75, "delta");
    chart.dataSets[0].addDataPoint(70, 85, "echo");
    chart.dataSets[0].addDataPoint(75, 80, "foxtrot");

    chart.setDataSetSubset(2, 2);

    expect(chart.dataSets[0].dataPoints.length).toEqual(6);
    expect(chart.dataSets[0].dataA1.length).toEqual(2);
    expect(chart.dataSets[0].dataA1[0]).toEqual(50);
    expect(chart.dataSets[0].dataA2[0]).toEqual(72);
    expect(chart.dataSets[0].dataA1[2]).toBeUndefined();
  });

  it("can truncate its visible data", () => {
    chart.dataSets[0].addDataPoint(65, 75, "delta");
    chart.dataSets[0].addDataPoint(70, 85, "echo");
    chart.dataSets[0].addDataPoint(75, 80, "foxtrot");

    chart.dataSets[0].setMaxDataPoints(2);

    expect(chart.dataSets[0].dataPoints.length).toEqual(6);
    expect(chart.dataSets[0].visibleDataPoints.length).toEqual(2);
    expect(chart.dataSets[0].minA1).toEqual(70);
    expect(chart.dataSets[0].maxA1).toEqual(75);
  });

  it("can show all visible data", () => {
    chart.dataSets[0].addDataPoint(65, 75, "delta");
    chart.dataSets[0].addDataPoint(70, 85, "echo");
    chart.dataSets[0].addDataPoint(75, 80, "foxtrot");

    chart.dataSets[0].setMaxDataPoints(-1);

    expect(chart.dataSets[0].dataPoints.length).toEqual(6);
    expect(chart.dataSets[0].visibleDataPoints.length).toEqual(6);
    expect(chart.dataSets[0].minA1).toEqual(0);
    expect(chart.dataSets[0].maxA1).toEqual(75);
  });

  it("can downsample its visible data", () => {
    chart.dataSets[0].setMaxDataPoints(-1);

    for (let i = 0; i < 200; i++) {
      chart.dataSets[0].addDataPoint(i, 100 + i, "");
    }

    expect(chart.dataSets[0].dataPoints.length).toEqual(203);
    expect(chart.dataSets[0].visibleDataPoints.length).toEqual(83);   // 80 downsampled points and 3 additional

    for (let i = 0; i < 36; i++) {
      chart.dataSets[0].addDataPoint(i, 300 + i, "");
    }

    expect(chart.dataSets[0].dataPoints.length).toEqual(239);
    expect(chart.dataSets[0].visibleDataPoints.length).toEqual(119);   // 80 downsampled points and 39 additional

    chart.dataSets[0].addDataPoint(0, 400, "");

    expect(chart.dataSets[0].dataPoints.length).toEqual(240);
    expect(chart.dataSets[0].visibleDataPoints.length).toEqual(80);   // 80 downsampled points
  });
});
