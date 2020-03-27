export const hexToRGBValue = (hex: string, alpha: number) => {
  const convertedHexValue = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  const rgb = convertedHexValue ? {
    r: parseInt(convertedHexValue[1], 16),
    g: parseInt(convertedHexValue[2], 16),
    b: parseInt(convertedHexValue[3], 16)
  } : null;

  if (rgb) {
    return `rgba(${rgb.r},${rgb.g},${rgb.b},${alpha})`;
  } else {
    return "rgba(170, 170, 170,1.0)";
  }
};
