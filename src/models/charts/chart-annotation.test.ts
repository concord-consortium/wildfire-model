import { ChartAnnotationModel, ChartAnnotationType } from "./chart-annotation";
import { ChartDataModelType, ChartDataModel } from "./chart-data";

describe("chart annotations", () => {
  let annotation: ChartAnnotationType;
  let chart: ChartDataModelType;

  it("can create a vertical line annotation", () => {
    annotation = ChartAnnotationModel.create({
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
        yAdjust: 305,
        backgroundColor: "rgba(0,0,0,0.8)",
        fontColor: "white"
      },
      borderColor: "red",
      borderDash: [10, 3],
      borderWidth: 2
    });
  });

  it("can create a horizontal line annotation", () => {
    annotation = ChartAnnotationModel.create({
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
        yAdjust: 305,
        backgroundColor: "rgba(0,0,0,0.8)",
        fontColor: "white"
      },
      borderColor: "blue",
      borderWidth: 5
    });
  });

  it("can create a box annotation", () => {
    annotation = ChartAnnotationModel.create({
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
    chart = ChartDataModel.create({
      name: "Samples",
      annotations: [{
        type: "verticalLine",
        value: 20
      }]
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
    chart = ChartDataModel.create({
      name: "Samples"
    });

    chart.addAnnotation(ChartAnnotationModel.create({
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
    chart = ChartDataModel.create({
      name: "Samples"
    });

    chart.addAnnotation(ChartAnnotationModel.create({
      type: "horizontalLine",
      value: 0
    }));
    chart.addAnnotation(ChartAnnotationModel.create({
      type: "horizontalLine",
      value: 1
    }));

    expect(chart.formattedAnnotations.length).toBe(2);

    chart.clearAnnotations();

    expect(chart.formattedAnnotations.length).toBe(0);
  });

});
