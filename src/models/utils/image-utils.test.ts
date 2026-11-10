import { getImageData, populateGrid } from "./image-utils";
import { RELEASE_PUBLIC_PATH, usePublicPath } from "../../public-url-test-helpers";

describe("populateGrid", () => {
  it("returns grid array from image with any dimensions without any interpolation", () => {
    expect(populateGrid(2, 2, [ [ 1 ] ])).toEqual([ 1, 1, 1, 1 ]);
    expect(populateGrid(2, 2, [
      [ 0, 0 ],
      [ 1, 1 ]
    ])).toEqual([ 1, 1, 0, 0 ]);
    expect(populateGrid(2, 1, [
      [ 0, 0 ],
      [ 1, 1 ]
    ])).toEqual([ 1, 1 ]);
    expect(populateGrid(1, 2, [
      [ 0, 0 ],
      [ 1, 1 ]
    ])).toEqual([ 1, 0 ]);
    expect(populateGrid(2, 2, [
      [ 0, 0, 0 ],
      [ 1, 1, 1 ],
      [ 1, 1, 1 ]
    ])).toEqual([ 1, 1, 1, 1 ]);
    expect(populateGrid(2, 2, [
      [ 0, 0, 0, 0 ],
      [ 0, 0, 0, 0 ],
      [ 1, 1, 1, 1 ],
      [ 1, 1, 1, 1 ]
    ])).toEqual([ 1, 1, 0, 0 ]);
    expect(populateGrid(3, 3, [
      [ 0, 0 ],
      [ 1, 1 ]
    ])).toEqual([ 1, 1, 1, 1, 1, 1, 0, 0, 0 ]);
  });

  it("returns grid array from image with any dimensions with interpolation", () => {
    expect(populateGrid(2, 2, [ [ 1 ] ], true)).toEqual([ 1, 1, 1, 1 ]);
    expect(populateGrid(2, 2, [
      [ 0, 0 ],
      [ 1, 1 ]
    ], true)).toEqual([ 1, 1, 0, 0 ]);
    expect(populateGrid(2, 2, [
      [ 0, 0, 0 ],
      [ 1, 1, 1 ],
      [ 1, 1, 1 ]
    ], true)).toEqual([ 1, 1, 0, 0 ]);
    expect(populateGrid(2, 2, [
      [ 0, 0, 0, 0 ],
      [ 0, 0, 0, 0 ],
      [ 1, 1, 1, 1 ],
      [ 1, 1, 1, 1 ]
    ], true)).toEqual([ 1, 1, 0, 0 ]);
    expect(populateGrid(5, 5, [
      [ 0, 0 ],
      [ 1, 1 ]
    ], true)).toEqual([
      1, 1, 1, 1, 1,
      0.75, 0.75, 0.75, 0.75, 0.75,
      0.5, 0.5, 0.5, 0.5, 0.5,
      0.25, 0.25, 0.25, 0.25, 0.25,
      0, 0, 0, 0, 0
    ]);
    expect(populateGrid(1, 5, [
      [ 0 ],
      [ 1 ]
    ], true)).toEqual([
      1,
      0.75,
      0.5,
      0.25,
      0
    ]);
    expect(populateGrid(1, 5, [
      [ 0, 0 ],
      [ 1, 10 ]
    ], true)).toEqual([
      1,
      0.75,
      0.5,
      0.25,
      0
    ]);
    expect(populateGrid(5, 1, [
      [ 0, 100 ],
      [ 0, 10 ]
    ], true)).toEqual([
      0, 2.5, 5, 7.5, 10
    ]);
    expect(populateGrid(2, 5, [
      [ 0, 0 ],
      [ 1, 10 ]
    ], true)).toEqual([
      1, 10,
      0.75, 7.5,
      0.5, 5,
      0.25, 2.5,
      0, 0
    ]);
  });
});

describe("getImageData", () => {
  const createElement = document.createElement.bind(document);
  let img: { src: string; complete: boolean; addEventListener: jest.Mock };

  beforeEach(() => {
    img = { src: "", complete: false, addEventListener: jest.fn() };
    jest.spyOn(document, "createElement").mockImplementation(
      (tagName: string, options?: ElementCreationOptions) =>
        tagName === "img" ? img as unknown as HTMLElement : createElement(tagName, options)
    );
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it("requests the configured path as is when there is no public path", () => {
    getImageData("data/river-texmap.png", () => 0, () => undefined);
    expect(img.src).toBe("data/river-texmap.png");
  });

  describe("with a release public path", () => {
    usePublicPath(RELEASE_PUBLIC_PATH);

    it("requests a relative path from the build's root folder", () => {
      getImageData("data/river-texmap.png", () => 0, () => undefined);
      expect(img.src).toBe("https://wildfire.concord.org/version/v9.9.9/data/river-texmap.png");
    });

    it("requests an absolute URL unchanged", () => {
      getImageData("https://other.example/x.png", () => 0, () => undefined);
      expect(img.src).toBe("https://other.example/x.png");
    });

    it("names the configured path when the image fails to load", () => {
      getImageData("data/river-texmap.png", () => 0, () => undefined);
      const onError = img.addEventListener.mock.calls.find(([type]) => type === "error")?.[1];
      expect(onError).toBeDefined();
      expect(() => onError()).toThrow("Cannot load image data/river-texmap.png");
    });
  });
});
