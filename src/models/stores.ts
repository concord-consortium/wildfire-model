import { SimulationModel } from "./simulation";

export interface IStores {
  simulation: SimulationModel;
}

export function createStores(): IStores {
  return {
    simulation: new SimulationModel()
  };
}
