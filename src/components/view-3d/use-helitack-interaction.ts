import { ftToViewUnit } from "./helpers";
import { Interaction } from "../../models/ui";
import { useStores } from "../../use-stores";
import { PointerEvent } from "react-three-fiber/canvas";
import { log } from "@concord-consortium/lara-interactive-api";

export const useHelitackInteraction = () => {
  const { simulation, ui } = useStores();
  return {
    active: ui.interaction === Interaction.Helitack,
    onPointerDown: (e: PointerEvent) => {
      const ratio = ftToViewUnit(simulation);
      const x = e.point.x / ratio;
      const y = e.point.y / ratio;
      simulation.setHelitackPoint(x, y);
      ui.interaction = null;
      log("Helitack", { x: x / simulation.config.modelWidth, y: y / simulation.config.modelHeight });
    }
  };
};
