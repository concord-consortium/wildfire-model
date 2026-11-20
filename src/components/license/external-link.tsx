import * as React from "react";
import css from "./external-link.scss";

interface IProps extends Omit<React.AnchorHTMLAttributes<HTMLAnchorElement>, "target" | "rel"> {
  href: string;
  children: React.ReactNode;
}

// A link that opens in a new tab and tells screen-reader users that it does.
export const ExternalLink = ({ href, children, ...others }: IProps) => (
  <a {...others} href={href} target="_blank" rel="noopener noreferrer">
    {children}
    <span className={css.visuallyHidden}> (opens in a new tab)</span>
  </a>
);
