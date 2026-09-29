import React, { useState } from "react";
import { observer } from "mobx-react";
import { cameraDebugStore } from "../view-3d/camera-debug-store";
import { MAX_POLAR_ANGLE } from "../view-3d/orbit-pivot";
import css from "./camera-settings-panel.scss";

const fmt = (n: number) => n.toFixed(3);

const MAX_TILT_DEG = Math.round(MAX_POLAR_ANGLE * 180 / Math.PI);

interface DebugCamera {
  camera: { position: { x: number } };
  controls: { target: { x: number }, update?: () => void, setPolarAngle?: (rad: number) => void };
}
const debugCamera = () => (window as unknown as { debugCamera?: DebugCamera }).debugCamera;

const buildSnippet = (
  pos: [number, number, number],
  target: [number, number, number],
  fov: number,
  centerOffsetPx: number,
  topDownMarginPx: number
) =>
`cameraPos: [${fmt(pos[0])}, ${fmt(pos[1])}, ${fmt(pos[2])}]
target: [${fmt(target[0])}, ${fmt(target[1])}, ${fmt(target[2])}]
fov: ${Math.round(fov)}
centerOffsetPx: ${centerOffsetPx}
topDownMarginPx: ${topDownMarginPx}`;

export const CameraSettingsPanel: React.FC = observer(function CameraSettingsPanel() {
  const { position, target, fov, polarDeg, centerOffsetPx, topDownMarginPx } = cameraDebugStore;
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(buildSnippet(position, target, fov, centerOffsetPx, topDownMarginPx));
      setCopied(true);
      setTimeout(() => setCopied(false), 1200);
    } catch {
      // Clipboard access may be denied; silently ignore for this dev tool.
    }
  };

  return (
    <div className={css.panel} data-testid="camera-settings-panel">
      <span className={css.value}>
        cameraPos:&nbsp;[{fmt(position[0])}, {fmt(position[1])}, {fmt(position[2])}]
      </span>
      <span className={css.value}>
        target:&nbsp;[{fmt(target[0])}, {fmt(target[1])}, {fmt(target[2])}]
      </span>
      <label className={css.fov}>
        fov:
        <input
          type="range"
          min={10}
          max={80}
          step={1}
          value={fov}
          onChange={e => cameraDebugStore.setFov(Number(e.target.value))}
        />
        <input
          type="number"
          min={10}
          max={80}
          step={1}
          value={fov}
          onChange={e => cameraDebugStore.setFov(Number(e.target.value))}
          className={css.fovNumber}
        />
      </label>
      <label className={css.fov} title="Tilt: 0 is straight down">
        tilt:
        <input
          type="range"
          min={0}
          max={MAX_TILT_DEG}
          step={1}
          value={Math.round(polarDeg)}
          onChange={e => {
            const controls = debugCamera()?.controls;
            if (!controls?.setPolarAngle) return;
            controls.setPolarAngle(Number(e.target.value) * Math.PI / 180);
            controls.update?.();
          }}
          data-testid="camera-tilt"
        />
        <span className={css.readout}>{Math.round(polarDeg)}°</span>
      </label>
      <label className={css.fov} title="Top-down center offset below the canvas center, in px. Changing it resets the view, so tilt again to see it">
        offset:
        <input
          type="number"
          step={1}
          value={centerOffsetPx}
          onChange={e => cameraDebugStore.setCenterOffsetPx(Number(e.target.value))}
          className={css.fovNumber}
          data-testid="camera-center-offset"
        />
      </label>
      <label className={css.fov} title="Top-down margin above and below the model, in px. 0 leaves the model's size alone">
        margin:
        <input
          type="number"
          min={0}
          step={1}
          value={topDownMarginPx}
          onChange={e => cameraDebugStore.setTopDownMarginPx(Number(e.target.value))}
          className={css.fovNumber}
          data-testid="camera-top-down-margin"
        />
      </label>
      <button
        type="button"
        className={css.center}
        onClick={() => {
          const dc = debugCamera();
          if (!dc) return;
          dc.camera.position.x = 0.5;
          dc.controls.target.x = 0.5;
          dc.controls.update?.();
        }}
        title="Snap camera + target x to 0.5 (centered on terrain)"
      >
        Center X
      </button>
      <button
        type="button"
        className={css.copy}
        onClick={handleCopy}
        title="Copy camera snippet to clipboard"
      >
        {copied ? "Copied" : "Copy"}
      </button>
    </div>
  );
});
