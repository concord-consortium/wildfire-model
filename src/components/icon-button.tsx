import * as React from "react";
import Button from "@mui/material/Button";
import css from "./icon-button.scss";

interface IProps {
  icon: JSX.Element;
  highlightIcon: JSX.Element;
  buttonText?: string;
  onClick?: (event: React.MouseEvent<HTMLButtonElement, MouseEvent>) => void;
  disabled?: boolean;
  // Persistent highlight for a control whose mode is currently on: a placement tool
  // that is armed, or the Setup button while its wizard is open.
  selected?: boolean;
  dataTest?: string;
}

export const IconButton = ({ icon, highlightIcon, onClick, disabled, selected, buttonText, dataTest }: IProps) => (
  <Button
    onClick={onClick}
    className={`${css.iconButton} ${disabled ? css.disabled : ""} ${selected ? css.selected : ""}`}
    disableRipple={true}
    data-testid={dataTest ? dataTest : "icon-button"}
    disableTouchRipple={true}
    disabled={disabled}
  >
        <span>
          <span className={css.iconButtonHighlightSvg}>{highlightIcon}</span>
          {icon}
          <span className={css.iconButtonText}>{buttonText}</span>
        </span>
  </Button>
);
