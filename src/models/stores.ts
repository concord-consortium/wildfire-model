import { SimulationModel } from "./simulation";
import { UIModel } from "./ui";
import presets from "../presets";
import { defaultConfig, urlConfig } from "../config";

export interface IStores {
  simulation: SimulationModel;
  ui: UIModel;
}

export const createStores = (): IStores => {
  return {
    simulation: new SimulationModel(presets[urlConfig.preset || defaultConfig.preset]),
    ui: new UIModel()
  };
};
