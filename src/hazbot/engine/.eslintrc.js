// Substrate boundary enforcement (per requirements.md Req 1).
// Verified locally on 2026-05-11 at ESLint 8.42 + eslint-plugin-import 2.27.5:
//   (a) static-import violation: caught (`Unexpected path`).
//   (b) dynamic-import violation: caught (`await import("../../log")` flagged).
//   (c) type-only-import violation: caught (`import type` is still an ImportDeclaration node).
//   (d) react-dom/client subpath: caught by `no-restricted-imports` patterns clause.
//   (e) mobx-react/lite subpath: caught by `no-restricted-imports` patterns clause.
// no-restricted-imports `paths` covers bare-name; `patterns` covers subpaths (per EXT-15).
module.exports = {
  rules: {
    // Direction note (per EXT-14): `target` = the directory whose files are SUBJECT to the rule
    // (the importer side — these files' imports get checked). `from` = paths the `target`'s files
    // CANNOT IMPORT. `except` = exceptions within `from` that ARE allowed. So this zone reads:
    // "files inside src/hazbot/engine cannot import from anywhere in src/, except other files
    // inside src/hazbot/engine itself" — i.e., engine files can only import within engine.
    // Path-resolution gotcha (per LIB-1, refined per local verification at eslint-plugin-import
    // 2.27.5): `target` and `from` are resolved against `basePath` (defaults to process.cwd() =
    // project root). `except` paths are resolved AGAINST `from` (per the rule's source —
    // `path.resolve(absoluteFrom, exceptionPath)`), so `except` is relative to `from`, not the
    // project root. Hence "./hazbot/engine" rather than "./src/hazbot/engine".
    "import/no-restricted-paths": ["error", {
      zones: [{
        target: "./src/hazbot/engine",
        from: "./src",
        except: ["./hazbot/engine"],
        message: "Substrate code may not import outside src/hazbot/engine/. See Req 1.",
      }],
    }],
    // `paths` matches exact module names; `patterns` matches subpaths (per EXT-15) —
    // catches `react-dom/client`, `mobx-react/lite`, etc.
    "no-restricted-imports": ["error", {
      paths: [
        { name: "mobx", message: "Substrate is MobX-free (Req 1)." },
        { name: "mobx-react", message: "Substrate is MobX-free (Req 1)." },
        { name: "react-dom", message: "Substrate ships no react-dom imports (LA-2 / R10-3)." },
      ],
      patterns: [
        { group: ["mobx/*", "mobx-react/*"], message: "Substrate is MobX-free (Req 1)." },
        { group: ["react-dom/*"], message: "Substrate ships no react-dom imports (LA-2 / R10-3)." },
      ],
    }],
  },
};
