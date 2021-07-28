import * as React from "react";
import RefreshIcon from "@material-ui/icons/Refresh";
import { Dialog } from "./dialog";
import * as css from "./top-bar.scss";
import { log } from "@concord-consortium/lara-interactive-api";

interface IProps {
  projectName: string;
  aboutContent?: JSX.Element;
  shareContent?: JSX.Element;
}

export const TopBar: React.FC<IProps> = ({ projectName, aboutContent, shareContent }: IProps) => {
  const [shareOpen, setShareOpen] = React.useState<boolean>(false);
  const [aboutOpen, setAboutOpen] = React.useState<boolean>(false);

  const handleReload = () => {
    log("top bar reload button clicked");
    // Give some time for the log message to be delivered. Note it goes only to the parent window using postMessage,
    // so we don't have to wait for network request.
    setTimeout(() => window.location.reload(), 100);
  }
  const handleShareOpen = () => {
    setShareOpen(true);
    log("share dialog opened");
  }
  const handleAboutOpen = () => {
    setAboutOpen(true);
    log("about dialog opened");
  }
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
