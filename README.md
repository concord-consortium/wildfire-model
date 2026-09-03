# Wildfire Model

Latest **stable** version:

https://wildfire.concord.org

A particular model can be loaded using `preset` URL parameter, e.g.:

https://wildfire.concord.org/index.html?preset=defaultThreeZone

Latest **development** version:

https://wildfire.concord.org/branch/master/index.html

## Configuration

Available presets:

https://github.com/concord-consortium/wildfire-model/blob/master/src/presets.ts

All the available options can be seen here (including default values):

https://github.com/concord-consortium/wildfire-model/blob/master/src/config.ts

These point at `master`. Replace `master` with a branch name to read that branch's values.

The final configuration is build using default configuration, preset options and URL parameters.
URL parameters have higher priority than preset options (so it's possible to customize a preset).

## Testing a preset

It's possible to dynamically load a new preset in the browser. Open browser console (e.g. in Chrome: Ctrl Shift J on 
Windows or Ctrl Option J on Mac) and type:

```
sim.load({
  modelWidth: 120000,
  modelHeight: 80000,
  gridWidth: 240,
  heightmapMaxElevation: 20000,
  zones: [
    { terrainType: TerrainType.Foothills, vegetation: Vegetation.Grass, droughtLevel: DroughtLevel.SevereDrought },
    { terrainType: TerrainType.Foothills, vegetation: Vegetation.Shrub, droughtLevel: DroughtLevel.MediumDrought },
  ],
  zoneIndex: [
    [ 0, 1 ]
  ]
})
```

This will load set of provided options. You can use examples from preset.ts file (see section above). It can be useful
to test new presets before modifying `preset.ts` file.

## Logged Events

See [LOGGED-EVENTS.md](LOGGED-EVENTS.md) for a complete reference of all logged events, their parameters, and trigger conditions.

### Development

1. Clone this repo and `cd` into it
2. Run `npm install` to pull dependencies
3. Run `npm start` to run `webpack-dev-server` in development mode with hot module replacement

### Building

If you want to build a local version run `npm build`, it will create the files in the `dist` folder.
You *do not* need to build to deploy the code, that is automatic.  See more info in the Deployment section below.

## Deployment

S3 deployment is handled by GitHub Actions using OIDC for AWS authentication. The `s3-deploy` job in
[`ci.yml`](.github/workflows/ci.yml) runs on every push and writes to `models-resources/wildfire-model/`.
You do not need to build locally to deploy.

Each branch is published at `https://models-resources.concord.org/wildfire-model/branch/<name>/index.html`.
`https://wildfire.concord.org/` is the same content under a friendlier name, so the URLs at the top
of this README and the ones here serve the same builds.

Note that `<name>` is not always the branch name: the deploy action strips a leading
*letters-digits-* pair, matching `^[A-Za-z]{2,}-[0-9]+-`. So `WM-30-model-controls` publishes to
`/branch/model-controls/` and `sprint-24-review-feedback` to `/branch/review-feedback/`, while
`hazbot-content-updates` keeps its full name, because `content` is not a number. Check the
deployment's URL rather than assuming.

See [doc/deploy.md](doc/deploy.md) for how deploys work in this repo, and
[deploy-setup.md in starter-projects](https://github.com/concord-consortium/starter-projects/blob/main/doc/deploy-setup.md)
for how the AWS side is set up.

## Releasing

Four steps. The release notes live in the [GitHub releases](https://github.com/concord-consortium/wildfire-model/releases);
`CHANGELOG.md` is an unused template and is not part of this process.

1. Bump the version in `package.json` and `package-lock.json`, and commit to `master`:

   ```sh
   npm version <version> --no-git-tag-version
   git commit package.json package-lock.json -m "build: Update to v<version>"
   git push origin master
   ```

   The commit message is a bare subject with no body and no ticket id.

2. Tag that commit, annotated, and push the tag:

   ```sh
   git tag -a v<version> <sha> -m "Version v<version>"
   git push origin v<version>
   ```

   Create the tag locally rather than from the GitHub releases UI, which produces a lightweight tag.

3. Generate the release notes with
   [`release-notes-jira.mjs`](https://github.com/concord-consortium/dev-templates/blob/main/scripts/release-notes-jira.mjs)
   from [dev-templates](https://github.com/concord-consortium/dev-templates), rather than by hand:

   ```sh
   # in a dev-templates checkout: cd scripts, npm install, and put JIRA_USER and
   # JIRA_TOKEN in scripts/.env (the dependencies and the .env both live there,
   # not at the repo root)
   npm run release-notes-jira WM "<version>"
   ```

   The fix version is the bare number, e.g. `1.6.0`. The WM project names its versions that way;
   the `LARA v5.0.0` shape in the script's own usage message is LARA's convention, and passing it
   here matches nothing.

   Stories become *Features & Improvements*, bugs become *Bug Fixes*, and chores, tasks and anything
   labeled `under-the-hood` become *Under the Hood*.

   This selects on Jira fix version, so the release's stories need theirs set before you run it.
   Read the output before pasting it: everything the query misses is dropped silently, with no
   warning. It takes only issues that are Done or Closed *and* typed Story, Bug, Chore or Task, so
   an unfinished story, or one filed as a Design Task or a Release, is simply absent.

   Paste the output into a new GitHub release on the tag, titled
   `Version <version> - released <Month> <D>, <YYYY>`. Pass `slack` as a third argument for a
   Slack-formatted version to share.

4. Publish it. Pushing the tag in step 2 triggered a second CI run, because
   [`ci.yml`](.github/workflows/ci.yml) is `on: push` and that matches tags, and that run deployed
   the build to `.../wildfire-model/version/<tag>/`. **Nothing is live yet**: promoting that build to
   the top-level `index.html` is a separate manual step.

   From the CLI:

   ```sh
   gh workflow run release.yml -f version=v<version>
   ```

   Or from the web UI: **Actions** tab, **Release** workflow in the left sidebar, **Run workflow**,
   enter the tag (e.g. `v1.6.0`) in the *version* field, **Run workflow**.

   Either way it copies `s3://models-resources/wildfire-model/version/<tag>/index-top.html` over
   `s3://models-resources/wildfire-model/index.html`, so the tag's CI run must have finished first or
   there is nothing to copy.

## Testing

Run `npm test` to run jest tests. Run `npm run test:full` to run jest and Cypress tests.

##### Cypress Run Options

Inside of your `package.json` file:
1. `--browser browser-name`: define browser for running tests
2. `--group group-name`: assign a group name for tests running
3. `--spec`: define the spec files to run
4. `--headed`: show cypress test runner GUI while running test (will exit by default when done)
5. `--no-exit`: keep cypress test runner GUI open when done running
6. `--record`: decide whether or not tests will have video recordings
7. `--key`: specify your secret record key
8. `--reporter`: specify a mocha reporter

##### Cypress Run Examples

1. `cypress run --browser chrome` will run cypress in a chrome browser
2. `cypress run --headed --no-exit` will open cypress test runner when tests begin to run, and it will remain open when tests are finished running.
3. `cypress run --spec 'cypress/integration/examples/smoke-test.js'` will point to a smoke-test file rather than running all of the test files for a project.

## License

Starter Projects are Copyright 2020 (c) by the Concord Consortium and is distributed under the [MIT license](http://www.opensource.org/licenses/MIT).

See license.md for the complete license text.
