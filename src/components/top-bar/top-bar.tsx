import * as React from "react";
import RefreshIcon from "@material-ui/icons/Refresh";
import { Dialog } from "./dialog";
import * as css from "./top-bar.scss";

interface IProps {
  projectName: string;
  aboutContent?: JSX.Element;
  shareContent?: JSX.Element;
}

export const TopBar: React.FC<IProps> = ({ projectName, aboutContent, shareContent }: IProps) => {
  const [shareOpen, setShareOpen] = React.useState<boolean>(false);
  const [aboutOpen, setAboutOpen] = React.useState<boolean>(false);

  const handleReload = () => window.location.reload();
  const handleShareOpen = () => setShareOpen(true);
  const handleAboutOpen = () => setAboutOpen(true);
  const handleShareClose = () => setShareOpen(false);
  const handleAboutClose = () => setAboutOpen(false);

  return (
    <div className={css.topBar}>
      <span className={css.textButton} data-test="reload" onClick={handleReload}><RefreshIcon /></span>
      <span>
        <span data-test="share" className={css.textButton} onClick={handleShareOpen}>Share</span>
        <span data-test="about" className={css.textButton} onClick={handleAboutOpen}>About</span>
      </span>
      <Dialog
        onClose={handleAboutClose}
        open={aboutOpen}
        title={`About: ${projectName}`}
      >
        { aboutContent }
      </Dialog>
      <Dialog
        onClose={handleShareClose}
        open={shareOpen}
        title={`Share: ${projectName}`}
      >
        { shareContent }
      </Dialog>
    </div>
  );
};
