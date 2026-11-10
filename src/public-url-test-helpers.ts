// Sets webpack's runtime public path for the tests in the enclosing describe, the way
// the bundle sees it in a release deploy, and removes it afterward so the rest of the
// suite sees Jest's default of none.
export const usePublicPath = (base: string) => {
  beforeEach(() => {
    (globalThis as Record<string, unknown>).__webpack_public_path__ = base;
  });
  afterEach(() => {
    delete (globalThis as Record<string, unknown>).__webpack_public_path__;
  });
};

// Unnormalized, as webpack's "auto" runtime computes it from assets/index.[contenthash].js.
export const RELEASE_PUBLIC_PATH = "https://wildfire.concord.org/version/v9.9.9/assets/../";
