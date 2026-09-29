import React from "react";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { CameraSettingsPanel } from "./camera-settings-panel";
import { cameraDebugStore } from "../view-3d/camera-debug-store";
import { TOP_DOWN_CENTER_OFFSET_PX, TOP_DOWN_MARGIN_PX } from "../view-3d/orbit-pivot";

type DebugWindow = { debugCamera?: unknown };

describe("CameraSettingsPanel", () => {
  afterEach(() => {
    cleanup();
    cameraDebugStore.setCenterOffsetPx(TOP_DOWN_CENTER_OFFSET_PX);
    cameraDebugStore.setTopDownMarginPx(TOP_DOWN_MARGIN_PX);
    cameraDebugStore.setPolarDeg(0);
    cameraDebugStore.setPose([0, 0, 0], [0, 0, 0]);
    cameraDebugStore.setDesignTarget([0, 0, 0]);
    delete (window as unknown as DebugWindow).debugCamera;
  });

  it("writes the center offset and top-down margin into the store", () => {
    render(<CameraSettingsPanel/>);
    fireEvent.change(screen.getByTestId("camera-center-offset"), { target: { value: "31" } });
    fireEvent.change(screen.getByTestId("camera-top-down-margin"), { target: { value: "12" } });
    expect(cameraDebugStore.centerOffsetPx).toBe(31);
    expect(cameraDebugStore.topDownMarginPx).toBe(12);
  });

  it("tilts the live controls to the slider's angle", () => {
    const controls = { target: { x: 0 }, setPolarAngle: jest.fn(), update: jest.fn() };
    (window as unknown as DebugWindow).debugCamera = { camera: { position: { x: 0 } }, controls };
    render(<CameraSettingsPanel/>);
    fireEvent.change(screen.getByTestId("camera-tilt"), { target: { value: "45" } });
    expect(controls.setPolarAngle).toHaveBeenCalledWith(Math.PI / 4);
    expect(controls.update).toHaveBeenCalled();
  });

  it("shows the live polar angle in degrees", () => {
    render(<CameraSettingsPanel/>);
    act(() => cameraDebugStore.setPolarDeg(17.4));
    expect(screen.getByText("17°")).toBeInTheDocument();
  });

  it("includes the center offset and top-down margin in the copied snippet", async () => {
    const writeText = jest.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true });
    cameraDebugStore.setCenterOffsetPx(31);
    cameraDebugStore.setTopDownMarginPx(12);
    render(<CameraSettingsPanel/>);
    fireEvent.click(screen.getByText("Copy"));
    await screen.findByText("Copied");
    expect(writeText).toHaveBeenCalledTimes(1);
    const snippet = writeText.mock.calls[0][0] as string;
    expect(snippet).toContain("\ncenterOffsetPx: 31\n");
    expect(snippet).toMatch(/\ntopDownMarginPx: 12$/);
  });

  it("copies the design target and the orbit pivot as separate lines", async () => {
    const writeText = jest.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true });
    cameraDebugStore.setDesignTarget([0.5, 0.263, 0.15]);
    cameraDebugStore.setPose([0.5, -0.35, 1.285], [0.5, 0.4, -0.1]);
    render(<CameraSettingsPanel/>);
    fireEvent.click(screen.getByText("Copy"));
    await screen.findByText("Copied");
    const snippet = writeText.mock.calls[0][0] as string;
    expect(snippet).toContain("\ndesignTarget: [0.500, 0.263, 0.150]\n");
    expect(snippet).toContain("\norbitPivot: [0.500, 0.400, -0.100]\n");
    expect(snippet).not.toMatch(/^target:/m);
  });
});
