import { SimulationModel } from "../../models/simulation";

export const PLANE_WIDTH = 1;

export const planeHeight = (simulation: SimulationModel) =>
  simulation.config.modelHeight * PLANE_WIDTH / simulation.config.modelWidth;
