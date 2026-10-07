import type { Engine } from "../engine";
import type { WildfireDefaults, WildfireReading } from "./types";

// Whether the Hazbot Analysis button exists. Question gating depends on it too: Wildfire may declare
// that it can unlock questions only when the button that unlocks them is there.
export const hazbotAvailable = (engine: Engine<WildfireReading, WildfireDefaults> | undefined, readOnly: boolean) =>
  !!engine?.ruleSet && !readOnly;
