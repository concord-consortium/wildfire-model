import { BaseReading } from "./types";

// Return the last value in `reading.temporalHistory` for the named variable, or
// undefined if the variable was never recorded in this reading's window.
// Walks the trail backwards so the most recent value wins.
export function currentTemporal<V>(reading: BaseReading, name: string): V | undefined {
  for (let i = reading.temporalHistory.length - 1; i >= 0; i--) {
    if (reading.temporalHistory[i].name === name) {
      return reading.temporalHistory[i].value as V;
    }
  }
  return undefined;
}
