import { useStores } from "../use-stores";
import sparkCursorImg from "../assets/interactions/spark-cursor.png";
import fireLineCursorImg from "../assets/interactions/fire-line-cursor.png";
import helitackCursorImg from "../assets/interactions/helitack-cursor-drop.png";
import { Interaction } from "../models/ui";
import { useEffect } from "react";

const interactionCursors: {[key in Interaction]?: string} = {
  [Interaction.PlaceSpark]: `url(${sparkCursorImg}) 32 64, crosshair`,
  [Interaction.DrawFireLine]: `url(${fireLineCursorImg}) 32 64, crosshair`,
  [Interaction.HoverOverDraggable]: "grab",
  [Interaction.Helitack]: `url(${helitackCursorImg}) 32 54, crosshair`
};

export const useCustomCursor = () => {
  const { ui } = useStores();

  useEffect(() => {
    if (ui.dragging) {
      document.body.style.cursor = "move";
      return;
    }
    // The fire line marker follows the pointer between the two clicks, so the cursor
    // art would be a second copy of the same icon. The two overlap until the length
    // clamp holds the marker back, and then both are visible at once.
    if (ui.fireLinePlacementInProgress) {
      document.body.style.cursor = "crosshair";
      return;
    }
    if (ui.interaction && interactionCursors[ui.interaction]) {
      document.body.style.cursor = interactionCursors[ui.interaction] as string;
      return;
    }
    document.body.style.cursor = "default";
  }, [ui.interaction, ui.dragging, ui.fireLinePlacementInProgress]);
};
