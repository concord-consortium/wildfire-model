import * as React from "react";

export const Copyright = () => (
  <p style={{ fontSize: "0.8em" }}>
    <b>Copyright © {(new Date()).getFullYear()}</b> The Concord Consortium.
    All rights reserved. This resource is licensed under a <a href="https://creativecommons.org/licenses/by-nc/4.0/" target="_blank" rel="noreferrer">Creative Commons Attribution-NonCommercial 4.0 International License (CC BY-NC 4.0)</a>.
    Please provide attribution to the Concord Consortium and the URL <a href="https://concord.org" target="_blank" rel="noreferrer">https://concord.org</a>.
    For full licensing details, see <a href="https://concord.org/licensing/" target="_blank" rel="noreferrer">concord.org/licensing</a>.
  </p>
);
