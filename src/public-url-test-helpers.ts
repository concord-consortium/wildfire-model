// Sets webpack's runtime public path for the enclosing describe and clears it after each test.
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
