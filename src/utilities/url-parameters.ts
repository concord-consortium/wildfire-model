import { parse } from "query-string";

interface QueryParams {
  simulationSize?: number[];
  wind?: number;
  spark?: number[];
  spark2?: number[];
}

const defaultUrlParams: QueryParams = {
  simulationSize: [100, 100],
  wind: 88,
  spark: [50, 50],
  spark2: [-1, -1]
};

const urlParams: QueryParams = parse(location.search, {arrayFormat: "comma"});

export function simulationSize(): number[] {
  if (urlParams.simulationSize === undefined) {
    return defaultUrlParams.simulationSize as number[];
  } else {
    return urlParams.simulationSize;
  }
}

export function wind(): number {
  if (urlParams.wind === undefined) {
    return defaultUrlParams.wind as number;
  } else {
    return urlParams.wind;
  }
}

export function spark(): number[] {
  if (urlParams.spark === undefined) {
    return defaultUrlParams.spark as number[];
  } else {
    return urlParams.spark;
  }
}

export function spark2(): number[] {
  if (urlParams.spark2 === undefined) {
    return defaultUrlParams.spark2 as number[];
  } else {
    return urlParams.spark2;
  }
}
