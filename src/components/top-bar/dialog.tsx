import * as React from "react";
import MuiDialog from "@mui/core/Dialog";
import CloseIcon from "@mui/icons/Close";
import css from "./dialog.scss";

interface IProps {
  onClose: () => void;
  open: boolean;
  title?: string;
  children?: JSX.Element | JSX.Element[];
}

export const Dialog: React.FC<IProps> = ({ onClose, open, title, children }) => (
  <MuiDialog
    onClose={onClose}
    open={open}
    maxWidth="lg"
  >
    <div className={css.dialogBody}>
      <div className={css.title}>{ title }</div>
      <CloseIcon className={css.closeButton} onClick={onClose} />
      <div className={css.content}>{ children }</div>
    </div>
  </MuiDialog>
);
