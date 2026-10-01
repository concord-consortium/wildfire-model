import React from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { LineChartControls } from "./line-chart-controls";
import { ChartDataModel } from "../models/chart-data";
import { ChartDataSet, DataPoint } from "../models/chart-data-set";

jest.mock("../../log", () => ({ log: jest.fn() }));

// Hourly samples, as the graph records them; 20 is the "Show Recent Data" window.
const chartWithHours = (hours: number) => new ChartDataModel({
  name: "",
  dataSets: [new ChartDataSet({
    name: "Zone 1",
    dataPoints: Array.from({ length: hours }, (_, hour) => new DataPoint({ a1: hour, a2: hour, label: "" })),
    display: true,
    maxPoints: 20
  })],
  defaultMaxPoints: 20,
  annotations: []
});

const slider = () => screen.getByRole("slider");

describe("LineChartControls on a run that was never played", () => {
  it("puts the handle at the latest hour", () => {
    render(<LineChartControls chartData={chartWithHours(30)} isPlaying={false} />);
    expect(slider()).toHaveAttribute("aria-valuemax", "30");
    expect(slider()).toHaveAttribute("aria-valuenow", "30");
  });

  it("lets the slider move the view back to the earliest hours", () => {
    const chart = chartWithHours(30);
    render(<LineChartControls chartData={chart} isPlaying={false} />);

    fireEvent.keyDown(slider(), { key: "Home", keyCode: 36 });

    expect(slider()).toHaveAttribute("aria-valuenow", "0");
    expect(chart.subsetIdx).toBe(0);
  });

  it("catches up when a different run's data replaces it", () => {
    const { rerender } = render(<LineChartControls chartData={chartWithHours(30)} isPlaying={false} />);
    rerender(<LineChartControls chartData={chartWithHours(45)} isPlaying={false} />);
    expect(slider()).toHaveAttribute("aria-valuemax", "45");
    expect(slider()).toHaveAttribute("aria-valuenow", "45");
  });
});
