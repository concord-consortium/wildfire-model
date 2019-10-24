import * as React from "react";
import Button from "@material-ui/core/Button";
import * as css from "./icon-button.scss";

interface IProps {
  icon: JSX.Element;
  highlightIcon: JSX.Element;
  buttonText?: string;
  onClick?: (event: React.MouseEvent<HTMLButtonElement, MouseEvent>) => void;
  disabled?: boolean;
}

export const IconButton = ({ icon, highlightIcon, onClick, disabled, buttonText }: IProps) => (
  <Button
    onClick={onClick}
    className={`${css.iconButton} ${disabled ? css.disabled : ""}`}
    data-test="icon-button"
    disableRipple={true}
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
