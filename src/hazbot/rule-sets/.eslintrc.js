// Generated rule-set modules contain long descriptive strings from the sheet's
// Details column (terrain/vegetation/drought defaults docstrings). max-len isn't
// useful here — re-running the extraction script would just re-produce the warning.
// Test files in this folder are not generated and stay subject to the global rules.
module.exports = {
  overrides: [
    {
      files: ["*.ts"],
      excludedFiles: ["*.test.ts", "test-helpers.ts"],
      rules: {
        "max-len": "off",
      },
    },
  ],
};
