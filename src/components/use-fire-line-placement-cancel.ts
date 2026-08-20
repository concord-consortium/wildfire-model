import { useEffect } from "react";
import { reaction } from "mobx";
import { useStores } from "../use-stores";
import { Interaction } from "../models/ui";
import { cancelFireLinePlacement } from "../models/fire-line-placement";

// Escape-to-cancel, plus a backstop for any writer that moves ui.interaction off
// DrawFireLine without cancelling first. ui.interaction is written from a dozen places
// with no common setter, one of them a hover-out handler, so the invariant cannot rely
// on each call site remembering.
export const useFireLinePlacementCancel = () => {
  const { simulation, ui } = useStores();

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key !== "Escape" || e.defaultPrevented) {
        return;
      }
      // An open coach mark owns Escape. Its own handler cannot be relied on to claim
      // the event first: it is attached on open, so this one, attached at mount, runs
      // before it and would see defaultPrevented still false.
      if (ui.showHazbotFeedback) {
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
