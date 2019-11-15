import React from "react";
import { observer } from "mobx-react";
import { useStores } from "../use-stores";
import {
  CircularInput,
  CircularTrack,
  CircularProgress,
  CircularThumb,
  useCircularInputContext
} from "react-circular-input";
import WindDial from "../assets/wind-dial.svg";
import WindArrow from "../assets/wind-arrow.svg";
import WindSymbol from "../assets/wind-symbol.svg";
import css from "./wind-circular-control.scss";

export const WindCircularControl = observer(() => {
  const { simulation, ui } = useStores();
  const [value, setValue] = React.useState(0.25);
  return (
    <div className={css.windContainer}>
      <div className={css.controlContainer}>
        <div className={css.windSymbolContainer} style={{transform: `rotate(${360 * value}deg)`}}>
          <WindSymbol className={css.windSymbol} />
        </div>
        <div className={css.dialContainer}>
          <WindDial className={css.dial} />
          <WindArrow className={css.arrow} style={{transform: `rotate(${360 * value}deg)`}}/>
          <CircularInput value={value} radius={35} onChange={setValue} className={css.windCircularControl}>
            <CircularTrack strokeWidth={4} stroke="rgba(255,255,255,0.5)" fill="rgba(255,255,255,0)" />
            <CircularThumb
              fill="white"
              stroke="rgb(61, 153, 255)"
              strokeWidth="1"
              r="2"
            />
          </CircularInput>
        </div>
      </div>
      <div className={css.key}>Wind Direction and Speed</div>
      <div className={css.windText}>30 MPH from the SW</div>
    </div>
  );
});
