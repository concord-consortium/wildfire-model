import { ChartAnnotation } from "./chart-annotation";
import { ChartDataModel } from "./chart-data";
import { DataPoint, ChartDataSet } from "./chart-data-set";

describe("chart annotations", () => {
  let annotation: ChartAnnotation;
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

  it("can create a vertical line annotation", () => {
    annotation = new ChartAnnotation ({
      type: "verticalLine",
      value: 10,
      label: "Test",
      dashArray: [10, 3]
    });

    expect(annotation.formatted).toEqual({
      type: "line",
      mode: "vertical",
      scaleID: "x-axis-0",
      value: 10,
      label: {
        content: "Test",
        enabled: true,
        position: "bottom",
        xAdjust: 0,
        yAdjust: 0,
        backgroundColor: "rgba(0,0,0,0.8)",
        fontColor: "white"
      },
      borderColor: "red",
      borderDash: [10, 3],
      borderWidth: 2
    });
  });

  it("can create a horizontal line annotation", () => {
    annotation = new ChartAnnotation ({
      type: "horizontalLine",
      value: 10,
      label: "Test",
      labelXOffset: 10,
      color: "blue",
      thickness: 5
    });

    expect(annotation.formatted).toEqual({
      type: "line",
      mode: "horizontal",
      scaleID: "y-axis-0",
      value: 10,
      label: {
        content: "Test",
        enabled: true,
        position: "right",
        xAdjust: 10,
        yAdjust: 0,
        backgroundColor: "rgba(0,0,0,0.8)",
        fontColor: "white"
      },
      borderColor: "blue",
      borderWidth: 5
    });
  });

  it("can create a box annotation", () => {
    annotation = new ChartAnnotation ({
      type: "box",
      xMin: 25,
      xMax: 40,
      yMax: 20,
      yMin:  15,
      color: "red"
    });

    expect(annotation.formatted).toEqual({
      type: "box",
      drawTime: "beforeDatasetsDraw",
      xScaleID: "x-axis-0",
      yScaleID: "y-axis-0",
      xMin: 25,
      xMax: 40,
      yMax: 20,
      yMin:  15,
      borderColor: "red",
      borderWidth: 2,
      backgroundColor: "red",
    });
  });

  it("can create a chart with annotations", () => {
    chart = new ChartDataModel({
      name: "Samples",
      dataSets: [],
      annotations: [new ChartAnnotation({
        type: "verticalLine",
        value: 20
      })]
    });

    expect(chart.formattedAnnotations).toEqual([{
      type: "line",
      mode: "vertical",
      scaleID: "x-axis-0",
      value: 20,
      label: {
        position: "bottom"
      },
      borderColor: "red",
      borderWidth: 2
    }]);
  });

  it("can add annotations to charts", () => {
    chart = new ChartDataModel({
      name: "Samples",
      dataSets: []
    });

    chart.addAnnotation(new ChartAnnotation({
      type: "horizontalLine",
      value: 0
    }));

    expect(chart.formattedAnnotations).toEqual([{
      type: "line",
      mode: "horizontal",
      scaleID: "y-axis-0",
      value: 0,
      label: {
        position: "right"
      },
      borderColor: "red",
      borderWidth: 2
    }]);
  });

  it("can clear annotations from charts", () => {
    chart = new ChartDataModel({
      name: "Samples",
      dataSets: []
    });

    chart.addAnnotation(new ChartAnnotation({
      type: "horizontalLine",
      value: 0
    }));
    chart.addAnnotation(new ChartAnnotation({
      type: "horizontalLine",
      value: 1
    }));

    expect(chart.formattedAnnotations.length).toBe(2);

    chart.clearAnnotations();

    expect(chart.formattedAnnotations.length).toBe(0);
  });

});
