import * as React from "react";

export const Copyright = () => (
  <p style={{ fontSize: "0.8em" }}>
    <b>Copyright © {(new Date()).getFullYear()}</b> <a href="http://concord.org" target="_blank" rel="noreferrer">The Concord
    Consortium
                                                    </a>.
    All rights reserved. The software is licensed under
    the <a href="https://github.com/concord-consortium/forestfire/blob/master/LICENSE"
            target="_blank" rel="noreferrer">MIT
        </a> license.
    The content is licensed under a <a href="https://creativecommons.org/licenses/by/4.0/" target="_blank" rel="noreferrer">
    Creative Commons Attribution 4.0 International License
                                    </a>.
    Please provide attribution to the Concord Consortium and the URL <a href="http://concord.org" rel="noreferrer" target="_blank">http://concord.org</a>.
  </p>
);
