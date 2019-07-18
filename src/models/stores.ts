import { SimulationModel } from "./simulation";
import presets from "../presets";
import config from "../config";

export interface IStores {
  simulation: SimulationModel;
}

export function createStores(): IStores {
  return {
    simulation: new SimulationModel(presets[config.preset])
  };
}
