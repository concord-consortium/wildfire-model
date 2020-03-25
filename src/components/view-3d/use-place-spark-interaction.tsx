import { ftToViewUnit } from "./helpers";
import { Interaction } from "../../models/ui";
import { InteractionHandler } from "./interaction-handler";
import { useStores } from "../../use-stores";
import { PointerEvent } from "react-three-fiber/canvas";

export const usePlaceSparkInteraction: () => InteractionHandler = () => {
  const { simulation, ui } = useStores();
  return {
    active: ui.interaction === Interaction.PlaceSpark,
    onClick: (e: PointerEvent) => {
      const ratio = ftToViewUnit(simulation);
      const x = e.point.x / ratio;
      const y = e.point.y / ratio;
      simulation.addSpark(x, y);
      ui.interaction = null;
    }
  };
};
