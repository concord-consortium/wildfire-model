import { useEffect } from "react";
import { reaction } from "mobx";
import { useStores } from "../use-stores";
import { Interaction } from "../models/ui";
import { cancelFireLinePlacement } from "../models/fire-line-placement";

// Wires the two cancel affordances that live outside the bottom bar: the Escape key, and
// a backstop for any writer that moves ui.interaction off DrawFireLine without cancelling
// first (ui.interaction is written from a dozen places, including a hover-out handler).
export const useFireLinePlacementCancel = () => {
  const { simulation, ui } = useStores();

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // defaultPrevented lets an overlay that already handled Escape (coachmarks) win.
      if (e.key !== "Escape" || e.defaultPrevented) {
        return;
      }
      if (ui.interaction !== Interaction.DrawFireLine) {
        return;
      }
      cancelFireLinePlacement(simulation, ui, "escape");
    };
    document.addEventListener("keydown", handleKeyDown);

    const dispose = reaction(
      () => ui.interaction,
      (interaction, prevInteraction) => {
        if (prevInteraction === Interaction.DrawFireLine && ui.fireLinePlacementInProgress) {
          cancelFireLinePlacement(simulation, ui, "other");
        }
      }
    );

    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      dispose();
    };
  }, [simulation, ui]);
};
