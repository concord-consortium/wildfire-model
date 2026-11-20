import * as React from "react";
import MuiDialog from "@mui/material/Dialog";
import CloseIcon from "@mui/icons-material/Close";
import css from "./dialog.scss";

interface IProps {
  onClose: () => void;
  open: boolean;
  title: string;
  children?: JSX.Element | JSX.Element[];
}

export const Dialog: React.FC<IProps> = ({ onClose, open, title, children }) => {
  const titleId = React.useId();
  const closeRef = React.useRef<HTMLButtonElement>(null);
  const focusClose = () => closeRef.current?.focus();
  return (
    <MuiDialog
      onClose={onClose}
      open={open}
      maxWidth="lg"
      aria-labelledby={titleId}
      TransitionProps={{ onEnter: focusClose }}
      sx={{ zIndex: "calc(var(--coachmarks-z-index) + 1)" }}
    >
      <div className={css.dialogBody}>
        <h2 id={titleId} className={css.title}>{ title }</h2>
        <button type="button" aria-label="Close" className={css.closeButton} onClick={onClose} ref={closeRef}>
          <CloseIcon />
        </button>
        <div className={css.content}>{ children }</div>
      </div>
    </MuiDialog>
  );
};
