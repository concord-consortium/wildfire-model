// cypress/e2e/terrain-tilt-framing.cy.ts
//
// Projects the plane's ground-level corners through the live camera and compares them with the
// zone labels' and the bottom bar's boxes, so layout drift in that HTML fails here too.

import { DESIGN_CAMERA_POS, DESIGN_TARGET_POS, MAX_POLAR_ANGLE } from "../../src/components/view-3d/orbit-pivot";

interface Vec3 { x: number; y: number; z: number }
interface DebugCamera {
  camera: {
    position: Vec3 & { clone(): { set(x: number, y: number, z: number): { project(c: unknown): Vec3 } } };
    getWorldDirection(target: Vec3): Vec3;
    updateMatrixWorld(): void;
  };
  controls: { setPolarAngle(rad: number): void; update(): void };
}
interface TestWindow { debugCamera?: DebugCamera; sim: { config: { modelWidth: number; modelHeight: number } } }

const APP_URL = "/?cameraSettings=true&preset=plainsTwoZone";
// OrbitControls stops just short of straight down: exactly vertical is degenerate with up = +z.
const STRAIGHT_DOWN = 0.0001;
const MAX_TILT_DEG = Math.round(MAX_POLAR_ANGLE * 180 / Math.PI);
const DESIGN_POSITION: [number, number, number] = [DESIGN_CAMERA_POS.x, DESIGN_CAMERA_POS.y, DESIGN_CAMERA_POS.z];

const debugCamera = () =>
  cy.window().its("debugCamera").should("exist").then(() => cy.window() as unknown as Cypress.Chainable<TestWindow>);

const DESIGN_LOOK = (() => {
  const d = [DESIGN_TARGET_POS.x - DESIGN_CAMERA_POS.x, DESIGN_TARGET_POS.y - DESIGN_CAMERA_POS.y, DESIGN_TARGET_POS.z - DESIGN_CAMERA_POS.z];
  const len = Math.hypot(...d);
  return d.map(v => v / len);
})();

// Waits on the look direction as well as the position: for a few frames after mount the camera is
// already in place while drei's replacement OrbitControls still targets the origin.
const expectDefaultPose = (position: [number, number, number]) =>
  cy.window().should((win) => {
    const camera = (win as unknown as TestWindow).debugCamera?.camera;
    expect(camera, "camera").to.not.equal(undefined);
    const p = camera!.position;
    [p.x, p.y, p.z].forEach((v, i) => expect(v, "camera position").to.be.closeTo(position[i], 0.0005));
    const d = camera!.getWorldDirection(p.clone().set(0, 0, 0) as unknown as Vec3);
    [d.x, d.y, d.z].forEach((v, i) => expect(v, "camera look direction").to.be.closeTo(DESIGN_LOOK[i], 0.0005));
  });

// Tilts to `polar` radians, lets damping settle, and returns the space in CSS px between the
// projected ground rectangle and the zone labels above it and the bottom bar below it.
const marginsAt = (win: TestWindow, polar: number) => {
  const { camera, controls } = win.debugCamera!;
  controls.setPolarAngle(polar);
  for (let i = 0; i < 300; i++) controls.update();
  camera.updateMatrixWorld();
  const doc = (win as unknown as Window).document;
  const canvas = doc.querySelector("canvas")!.getBoundingClientRect();
  const labelsBottom = Math.max(...Array.from(doc.querySelectorAll('[data-testid="zone-info"]'))
    .map(el => el.getBoundingClientRect().bottom));
  const barTop = doc.querySelector('[class*="bottomBar"]')!.getBoundingClientRect().top;
  const h = win.sim.config.modelHeight / win.sim.config.modelWidth;
  const ys = [[0, 0], [1, 0], [0, h], [1, h]].map(([x, y]) =>
    canvas.top + (1 - camera.position.clone().set(x, y, 0).project(camera).y) / 2 * canvas.height);
  return { above: Math.min(...ys) - labelsBottom, below: barTop - Math.max(...ys) };
};

const expectCenteredStraightDown = (win: TestWindow) => {
  const { above, below } = marginsAt(win, STRAIGHT_DOWN);
  expect(above, "space above the model").to.be.at.least(0);
  expect(below, "space below the model").to.be.at.least(0);
  expect(Math.abs(above - below), "difference between the spaces above and below").to.be.at.most(4);
};

describe("Terrain tilt framing (WM-59)", () => {
  describe("at the target Chromebook viewport", () => {
    beforeEach(() => {
      cy.viewport(1241, 529);
      cy.visit(APP_URL);
      cy.window().its("sim.dataReady").should("eq", true);
    });

    it("opens on the PI-chosen default pose", () => {
      expectDefaultPose(DESIGN_POSITION);
    });

    it("centers the model between the zone labels and the bottom bar when tilted straight down", () => {
      expectDefaultPose(DESIGN_POSITION);
      debugCamera().then(expectCenteredStraightDown);
    });

    it("keeps the model clear of the labels and the bar through the whole tilt", () => {
      expectDefaultPose(DESIGN_POSITION);
      debugCamera().then((win) => {
        for (const deg of [0, 10, 20, 30, 40, 50, 60, 70, MAX_TILT_DEG]) {
          const { above, below } = marginsAt(win, Math.max(deg * Math.PI / 180, STRAIGHT_DOWN));
          expect(above, `space above the model at ${deg}°`).to.be.at.least(0);
          expect(below, `space below the model at ${deg}°`).to.be.at.least(0);
        }
      });
    });
  });

  // 900 x 700 rather than the Chromebook size, because here opening the graph narrows the canvas
  // enough that the fitter pulls the camera back, which the pivot has to follow.
  describe("with the graph open on a narrow window", () => {
    beforeEach(() => {
      cy.viewport(900, 700);
      cy.visit(APP_URL);
      cy.window().its("sim.dataReady").should("eq", true);
      cy.get('[data-testid="right-panel-tab"]').click();
    });

    it("keeps the default look direction at the pulled-back distance and centers the straight-down view", () => {
      expectDefaultPose([0.5, -0.675, 1.888]);
      debugCamera().then(expectCenteredStraightDown);
    });
  });
});
