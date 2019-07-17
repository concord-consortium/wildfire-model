import { GridCell, Fuel } from "../types";

export enum LandType {
  Grass = 0,
  Shrub = 1
}

const FuelConstants: {[key in LandType]: Fuel} = {
  [LandType.Grass]: {
    sav: 1826,
    packingRatio: 0.00154,
    netFuelLoad: 0.09871442,
    heatContent: 8000,
    moistureContent:  0.1,
    mx: 0.15,
    totalMineralContent: 0.0555,
    effectiveMineralContent: 0.01,
    fuelBedDepth: 1
  },
  [LandType.Shrub]: {
    sav: 1144,
    packingRatio: 0.00412,
    netFuelLoad: 0.183655,
    heatContent: 8000,
    moistureContent:  0.1,
    mx: 0.3,
    totalMineralContent: 0.0555,
    effectiveMineralContent: 0.01,
    fuelBedDepth: 2
  }
};

/**
 * The mathematical fire model is derived from
 *   https://www.fs.fed.us/rm/pubs_series/rmrs/gtr/rmrs_gtr371.pdf
 * and was made into a spreadsheet that can be seen at
 *   https://docs.google.com/spreadsheets/d/1ov3JUz6hXdnXChbXTz20Fo_9YoWmGukJgCaIMJeRUb4/
 *
 * Still to do:
 *  * Calculate the slope between two cells
 *  * Scale the value given the angle between these two cells and the wind
 *  * Break up this function into several curried functions which will allow us to calculate
 *    the spread times between two cells as quickly as possible. (Fuel types and magnitude of
 *    the wind can be curried, angle and slope will be calculated per pair)
 *
 * @param sourceCell Grid cell that is currently BURNING
 * @param targetCell Adjacent grid cell that is currently UNBURNT
 * @param windSpeed Magnitude of the windspeed
 */
export function getFireSpreadTime(sourceCell: GridCell, targetCell: GridCell, windSpeed: number) {
  const fuel = FuelConstants[targetCell.landType];
  const sav = fuel.sav;
  const packingRatio = fuel.packingRatio;
  const netFuelLoad = fuel.netFuelLoad;
  const heatContent = fuel.heatContent;
  const moistureContent = fuel.moistureContent;
  const mx = fuel.mx;
  const totalMineralContent = fuel.totalMineralContent;
  const effectiveMineralContent = fuel.effectiveMineralContent;
  const fuelBedDepth = fuel.fuelBedDepth;

  const slope = -0.01745329252;
  // This value leads me to believe the slope is in radians, given how it's used
  // in the formula below -- tan(slope), if slope is radians, results in 0. This
  // is used to the slopeFactor which will result in the whole slopeFactor
  // computation to be zero -- which is no slope factor between any grid cells
  // in the sim.

  const moistureContentRatio = moistureContent / mx;
  const savFactor = Math.pow(sav, 1.5);

  const a = 133 * Math.pow(sav, -0.7913);
  const b = 0.02526 * Math.pow(sav, 0.54);
  const c = 7.47 * Math.exp(-0.133 * Math.pow(sav, 0.55));
  const e = 0.715 * (-0.000359 * sav);

  const maximumReactionVelocity = savFactor * Math.pow(495 + (0.0594 * savFactor), -1);
  const optimumPackingRatio = 3.348 * Math.pow(sav, -0.8189);
  const optimumReactionVelocity = maximumReactionVelocity * Math.pow(packingRatio / optimumPackingRatio, a)
          * Math.exp(a * (1 - (packingRatio / optimumPackingRatio)));
  const moistureDampingCoefficient = 1 - (2.59 * moistureContentRatio) + (5.11 * Math.pow(moistureContentRatio, 2))
          - (3.52 * Math.pow(moistureContentRatio, 3));
  const mineralDampingCoefficient = 0.174 * Math.pow(effectiveMineralContent, -0.19);
  const reactionIntensity = optimumReactionVelocity * netFuelLoad * heatContent
          * moistureDampingCoefficient * mineralDampingCoefficient;

  const propagatingFluxRatio = Math.pow(192 + (0.2595 * sav), -1)
          * Math.exp((0.792 + (0.681 * Math.pow(sav, 0.5)) ) * (packingRatio + 0.1));

  const windFactor = c * Math.pow(windSpeed, b) * Math.pow((packingRatio / optimumPackingRatio), -e);

  const slopeFactor = 5.275 * Math.pow(packingRatio, -0.3) * Math.pow(Math.tan(slope), 2);

  const fuelLoad = netFuelLoad / (1 - totalMineralContent);
  const ovenDryBulkDensity = fuelLoad / fuelBedDepth;

  const effectiveHeatingNumber = Math.exp(-138 / sav);

  const heatOfPreIgnition = 250 + (1116 * moistureContent);

  const spreadRate = (reactionIntensity * propagatingFluxRatio * (1 + windFactor + slopeFactor))
          / (ovenDryBulkDensity * effectiveHeatingNumber * heatOfPreIgnition);

  return 1 / spreadRate;
}
