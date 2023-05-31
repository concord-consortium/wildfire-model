import { ftToViewUnit } from "./helpers";
import { Interaction } from "../../models/ui";
import { useStores } from "../../use-stores";
import { log } from "@concord-consortium/lara-interactive-api";
import { Event } from "three";

export const usePlaceSparkInteraction = () => {
  const { simulation, ui } = useStores();
  return {
    active: ui.interaction === Interaction.PlaceSpark,
    onPointerDown: (e: Event) => {
      const ratio = ftToViewUnit(simulation);
      const x = e.point.x / ratio;
      const y = e.point.y / ratio;
      simulation.addSpark(x, y);
      const cell = simulation.cellAt(x, y);
      ui.interaction = null;
      log("SparkPlaced", { x: x / simulation.config.modelWidth, y: y / simulation.config.modelHeight, elevation: cell.elevation });
    }
  };
};
