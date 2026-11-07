# Releasing

Releases are tag-driven. Pushing a tag `vX.Y.Z` runs `.github/workflows/release.yml`, which creates a GitHub Release with the extension zip. Publishing to the Chrome Web Store is a separate manual step.

## Rules

- The tag must match `v*.*.*`.
- The tag minus the leading `v` must exactly equal `version` in `src/manifest.json`, or the Release job fails.
- `package.json` must have the same version as the manifest. The workflow doesn't check this itself, but it runs `npm test`, and `tests/structure.test.js` fails on a mismatch.
- Chrome requires each uploaded version to be higher than the previous one, so never reuse or lower a version.

## Steps

Replace `X.Y.Z` with the new version.

1. Branch from an up-to-date `main`.
2. Update `CHANGELOG.md`: move entries from `[Unreleased]` into a new `## [X.Y.Z]` section and update the compare links at the bottom.
3. Bump the version in both places:

   ```bash
   npm version X.Y.Z --no-git-tag-version   # updates package.json and package-lock.json
   ```

   Then edit `"version"` in `src/manifest.json` by hand to the same value.
4. Verify locally:

   ```bash
   npm test
   npm run package    # creates dist/link-hopper-vX.Y.Z.zip (dist/ is git-ignored)
   ```

   Optionally load `src/` unpacked in Chrome for a final manual check.
5. Commit, open a PR, wait for CI (Ubuntu and Windows), and merge to `main`.
6. Tag the merged commit and push the tag:

   ```bash
   git checkout main && git pull
   git tag vX.Y.Z
   git push origin vX.Y.Z
   ```

7. Watch the **Release** workflow. It runs `npm ci` and `npm test`, verifies the tag against the manifest version, runs `npm run package`, and creates the GitHub Release with `dist/link-hopper-vX.Y.Z.zip` attached and generated release notes.
8. Publish to the Chrome Web Store (not automated): in the Chrome Web Store developer dashboard, open the Link Hopper item, upload the same zip from the GitHub Release, update any listing details that changed, and submit for review.

## Permission changes

Version 1.2.0 adds the `favicon` permission (and `storage`). Adding a permission has consequences beyond the code:

- Chrome shows a permission prompt for the update, and may disable the extension for existing users until they approve it. Expect some users to need to re-enable it, and mention this in the release notes.
- The Web Store dashboard asks for a justification for each permission on the Privacy tab, and the review may take longer than usual.

Suggested short justifications:

| Permission | Justification |
|------------|---------------|
| `activeTab` | Reads the URL and title of the tab the user opens the popup on, to build the QR code. Only runs when the user clicks the icon. |
| `favicon` | Draws the site's icon on the shareable card the user downloads. Read locally from Chrome's favicon cache; nothing is sent anywhere. |
| `storage` | Remembers the user's light/dark theme choice. |

When testing a build that changes permissions, reload the extension in `chrome://extensions` and re-approve any prompt.

## If something goes wrong

- **Release workflow failed (version mismatch or tests)**: fix on `main`, then move the tag. Delete the old one (`git push origin :refs/tags/vX.Y.Z` and `git tag -d vX.Y.Z`), re-tag the fixed commit and push. If a GitHub Release was already created, delete it first.
- **Bad version already live on the Web Store**: ship a hotfix. Bump to the next patch version, never reuse a number, and follow the steps above. Rolling back means publishing the fixed code under a higher version, because the store won't accept a lower one.

## One-time repository settings (maintainer)

- Settings -> Actions -> General: enable GitHub Actions. The Release job requests `contents: write` itself.
- Settings -> Branches: add a protection rule for `main` that requires a pull request and requires the status checks **Test (ubuntu-latest)** and **Test (windows-latest)** to pass.
- Settings -> Code security: turn on Dependabot alerts (version updates are configured in `.github/dependabot.yml`).
