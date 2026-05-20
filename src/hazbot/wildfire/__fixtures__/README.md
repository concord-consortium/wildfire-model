# Hazbot replay fixtures

These files pin the engine's classification output for ruleset 25 against a
representative event scenario. See [requirements R18c](../../../../specs/WM-10-hazbot-temporal-variables/requirements.md)
for the full contract.

## Regeneration

When `replay-fixture.test.ts` fails because behavior intentionally changed
(new category, refined factor variable, new temporal variable, expanded
scenario coverage), regenerate:

    node scripts/generate-replay-fixture.js

Then inspect the diff for both files. Only intended changes should appear.
Commit the regenerated fixture in the same PR. **Do not disable or skip the
test in lieu of regeneration** — the diff is the review surface for semantic
drift.

## Scenario coverage

The current scenario exercises:

- Pre-trigger state changes (R5b "no reading yet" — live update only)
- Within-window state changes (R5b appends)
- R18b's four sticky-OR corners across multiple `SimulationStarted` /
  `SimulationEnded` cycles

Future rule sets exercising novel substrate constructs should add their own
fixture pair under this directory (per R18c "Scope").

## sessionId note

`Engine` generates a fresh `sessionId` per instance. The fixture's
`expected.json` captures the generator-run's sessionId, but the test strips
it from both sides before comparing — the sessionId is non-deterministic by
design and asserting on it would require a deterministic session-id mock.
