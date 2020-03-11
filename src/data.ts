import { DataPoint } from "./models/charts/chart-data-set";

/**
 * Downsample using Largest Triangle, One Bucket method.
 * See https://blog.scottlogic.com/2015/11/16/sampling-large-data-in-d3fc.html
 */
export const downsample = (points: DataPoint[], maxSize: number) => {
  const length = points.length;
  if (maxSize >= length) return points;
  if (maxSize < 1 || length < 1) return [];

  const bucketSize = length / maxSize;

  const sampledData = [points[0]];

  for (let bucket = 1; bucket < maxSize - 1; bucket++) {
    const startIndex = Math.floor(bucket * bucketSize);
    const endIndex = Math.min(length - 1, (bucket + 1) * bucketSize);

    let maxArea = -1;
    let maxAreaIndex = -1;
    for (let j = startIndex; j < endIndex; j++) {
      const previousDataPoint = points[j - 1];
      const dataPoint = points[j];
      const nextDataPoint = points[j + 1];

      const area = calculateTriangleArea(previousDataPoint, dataPoint, nextDataPoint);
      if (area > maxArea) {
        maxArea = area;
        maxAreaIndex = j;
      }
    }

    sampledData.push(points[maxAreaIndex]);
  }

  sampledData.push(points[length - 1]);

  return sampledData;
};

const calculateTriangleArea = (a: DataPoint, b: DataPoint, c: DataPoint) => {
  return Math.abs((a.a1 - c.a1) * (b.a2 - a.a2) - (a.a1 - b.a1) * (c.a2 - a.a2)) / 2;
};

/**
 * Durstenfelt in-place shuffle
 */
export const shuffle = (arr: any[]) => {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
};
