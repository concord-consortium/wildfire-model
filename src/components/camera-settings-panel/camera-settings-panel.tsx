import React, { useState } from "react";
import { observer } from "mobx-react";
import { cameraDebugStore } from "../view-3d/camera-debug-store";
import css from "./camera-settings-panel.scss";

const fmt = (n: number) => n.toFixed(3);

const buildSnippet = (
  pos: [number, number, number],
  target: [number, number, number],
  fov: number
) =>
`cameraPos: [${fmt(pos[0])}, ${fmt(pos[1])}, ${fmt(pos[2])}]
target: [${fmt(target[0])}, ${fmt(target[1])}, ${fmt(target[2])}]
fov: ${Math.round(fov)}`;

export const CameraSettingsPanel: React.FC = observer(function CameraSettingsPanel() {
  const { position, target, fov } = cameraDebugStore;
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(buildSnippet(position, target, fov));
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
      <button
        type="button"
        className={css.center}
        onClick={() => {
          const dc = (window as unknown as { debugCamera?: { camera: { position: { x: number } }, controls: { target: { x: number }, update?: () => void } } }).debugCamera;
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
