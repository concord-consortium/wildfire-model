import { FactorVariableImpl } from "../engine";
import { WildfireDefaults, WildfireReading } from "./types";

// Stubbed factor variables (per Req 6 / IMPL-4). The substrate emits a
// stub-warning at load for any referenced impl flagged isStub: true.
// Separated into its own module so the stub flag stays grep-able.

export const sawIntenseFire: FactorVariableImpl<boolean, WildfireReading, WildfireDefaults> = {
  defaultValue: false,
  isStub: true,
  compute: () => ({ value: false, witnesses: [] }),
};

// Stub — deferred to WM-28 ("Hazbot: Helitack run-window detection"). See the
// Helitack Technical Notes in the WM-18 requirements spec.
export const usedHelitack: FactorVariableImpl<boolean, WildfireReading, WildfireDefaults> = {
  defaultValue: false,
  isStub: true,
  compute: () => ({ value: false, witnesses: [] }),
};
