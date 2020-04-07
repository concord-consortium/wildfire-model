import { useStores } from "../use-stores";
import sparkCursorImg from "../assets/interactions/spark-cursor.png";
import fireLineCursorImg from "../assets/interactions/fire-line-cursor.png";
import helitackCursorImg from "../assets/interactions/helitack-cursor.png";
import { Interaction } from "../models/ui";
import { useEffect } from "react";

const interactionCursors: {[key in Interaction]?: string} = {
  [Interaction.PlaceSpark]: `url(${sparkCursorImg}) 32 64, crosshair`,
  [Interaction.DrawFireLine]: `url(${fireLineCursorImg}) 32 64, crosshair`,
  [Interaction.HoverOverDraggable]: "grab",
  [Interaction.Helitack]: `url(${helitackCursorImg}) 50 53, crosshair`
};

export const useCustomCursor = () => {
  const { ui } = useStores();

  useEffect(() => {
    if (ui.dragging) {
      document.body.style.cursor = "move";
      return;
    }
    if (ui.interaction && interactionCursors[ui.interaction]) {
      document.body.style.cursor = interactionCursors[ui.interaction]!;
      return;
    }
    document.body.style.cursor = "default";
  }, [ui.interaction, ui.dragging]);
};
