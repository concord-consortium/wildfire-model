import * as React from "react";
import { ExternalLink } from "./external-link";
import { kLicensingEmail, kLicensingUrl, kMitLicenseUrl, kTermsOfUseUrl } from "./license-constants";
import css from "./license-copy.scss";

export const LicenseCopy = () => (
  <div className={css.licenseCopy} data-testid="license-copy">
    <p>
      <strong>Wildfire Explorer is free, open-source software.</strong> The Wildfire Explorer source code is
      released under the <ExternalLink href={kMitLicenseUrl}>MIT License</ExternalLink>, so you’re welcome to use,
      modify, and build on it.
    </p>
    <p>
      <strong>Your use of Wildfire Explorer at wildfire.concord.org</strong> is governed by
      our <ExternalLink href={kTermsOfUseUrl}>Terms of Use</ExternalLink>. The hosted version is free for
      non-commercial use; commercial use requires a separate written agreement. For more information,
      visit <ExternalLink href={kLicensingUrl}>concord.org/licensing</ExternalLink> or
      contact <a href={`mailto:${kLicensingEmail}`}>{kLicensingEmail}</a>.
    </p>
    <p className={css.copyright}>© {new Date().getFullYear()} The Concord Consortium, Inc.</p>
  </div>
);
