// Webpack's runtime public path: the build's root folder, derived from the bundle
// script's own URL (its folder plus "../", since the bundle sits in assets/) because
// output.publicPath is left at "auto". Declared here because the project does not
// depend on @types/webpack-env.
declare let __webpack_public_path__: string | undefined;

// The typeof guard keeps this callable under Jest, where the identifier is not
// defined. In the bundle webpack replaces the identifier with its runtime value.
export const getPublicPath = (): string | undefined =>
  typeof __webpack_public_path__ === "string" && __webpack_public_path__ ? __webpack_public_path__ : undefined;

/**
 * Resolves a path to a file in src/public, which CopyWebpackPlugin copies to the build's
 * root folder, against that folder rather than the page. The two differ for the
 * released index.html, which is a copy of the build's index-top.html placed above
 * `version/<tag>/`. An absolute URL, a root-relative path and a `data:`
 * or `blob:` URL come back pointing where they already did.
 */
export const publicUrl = (path: string, base = getPublicPath()): string =>
  base ? new URL(path, base).href : path;
