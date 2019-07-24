/**
 * Accepts height and width of the expected grid array, as well as the image with any dimensions.
 * Returns 1D grid array populated with data from image 2D array.
 *
 * Note that there's an assumption that image origin (0, 0) is in its top-left corner, while grid
 * has its origin (0, 0) in bottom-left corner.
 *
 * When interpolate parameter is true, it will use linear interpolation to get missing values.
 */
export const populateGrid = (width: number, height: number, image: number[][], interpolate = false): number[] => {
  const arr = [];
  // Figure out the size of the image using the first row.
  const imageHeight = image.length;
  const imageWidth = image[0].length;
  const numGridCellsPerImageRowPixel = (imageHeight - 1) / (height - 1);
  const numGridCellsPerImageColPixel = (imageWidth - 1) / (width - 1);

  let imageRowIndex = imageHeight - 1;
  let imageRowAdvance = 0;
  for (let r = 0; r < height; r++) {
    let imageColIndex = 0;
    let imageColAdvance = 0;
    for (let c = 0; c < width; c++) {
      let value = image[imageRowIndex][imageColIndex];
      if (interpolate) {
        // Bi-linear interpolation.
        const bottomLeft = image[imageRowIndex][imageColIndex];
        const bottomRight = imageColIndex + 1 < imageWidth ? image[imageRowIndex][imageColIndex + 1] : bottomLeft;
        const topLeft = imageRowIndex - 1 >= 0 ? image[imageRowIndex - 1][imageColIndex] : bottomLeft;
        const topRight = imageRowIndex - 1 >= 0 ?
          (imageColIndex + 1 < imageWidth ? image[imageRowIndex - 1][imageColIndex + 1] : topLeft) : bottomRight;
        value = bottomLeft * (1 - imageColAdvance) * (1 - imageRowAdvance) +
                bottomRight * imageColAdvance * (1 - imageRowAdvance) +
                topLeft * (1 - imageColAdvance) * imageRowAdvance +
                topRight * imageColAdvance * imageRowAdvance;
      }
      arr.push(value);
      imageColAdvance += numGridCellsPerImageColPixel;
      if (imageColAdvance >= 1) {
        imageColIndex += Math.floor(imageColAdvance);
        imageColAdvance -= Math.floor(imageColAdvance);
      }
    }
    imageRowAdvance += numGridCellsPerImageRowPixel;
    if (imageRowAdvance >= 1) {
      imageRowIndex -= Math.floor(imageRowAdvance);
      imageRowAdvance -= Math.floor(imageRowAdvance);
    }
  }
  return arr;
};
