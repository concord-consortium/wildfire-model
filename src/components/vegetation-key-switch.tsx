import React from "react";
import { observer } from "mobx-react";
import Button from "@mui/material/Button";
import { useStores } from "../use-stores";
import { log } from "../log";
import css from "./vegetation-key-switch.scss";

// Purpose-built two-state toggle rather than an MUI `Switch`: the repo has no
// `Switch` anywhere, and the board draws a thumb-on-a-track, which is already
// how `wind-circular-control.scss` paints `slider-thumb-small.svg`. It is an MUI
// `Button` so it inherits the same hover and active background the rest of the
// bottom bar gets, which is what makes the white thumb highlight readable.
export const VegetationKeySwitch = observer(function WrappedComponent() {
  const { ui } = useStores();

  const handleClick = () => {
    ui.showVegetationKey = !ui.showVegetationKey;
    log(ui.showVegetationKey ? "VegetationKeyShown" : "VegetationKeyHidden");
  };

  return (
    <Button
      className={`${css.vegetationKeySwitch} ${ui.showVegetationKey ? css.on : ""}`}
      data-testid="vegetation-key-switch"
      onClick={handleClick}
      disableRipple={true}
      disableTouchRipple={true}
    >
      <span>
        {/* The newline is authored rather than wrapped, matching the board and the
            same `pre-line` treatment the Setup panel's wind label already uses. */}
        <span className={css.label}>{"Vegetation\nKey"}</span>
        <span className={css.switchGroup}>
          <span className={css.track} />
          <span className={css.thumb}>
            <span className={css.thumbHighlight} />
            <span className={css.thumbIcon} />
          </span>
        </span>
      </span>
    </Button>
  );
});
