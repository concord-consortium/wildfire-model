import { APP_RULES_VERSION } from "./rules-version";

describe("APP_RULES_VERSION", () => {
  it("is a positive integer (per Req 20)", () => {
    expect(typeof APP_RULES_VERSION).toBe("number");
    expect(Number.isInteger(APP_RULES_VERSION)).toBe(true);
    expect(APP_RULES_VERSION).toBeGreaterThanOrEqual(1);
  });
});
