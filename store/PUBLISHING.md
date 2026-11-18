# Publishing Better Fullscreen

## Current direction

Prepare the first Chrome Web Store release of **Better Fullscreen 0.3.0**, for **Chrome 119 or newer on macOS**. This guide was checked against the source and official Chrome documentation on **2026-11-18**.

No public store listing, publisher display name or store item ID is recorded yet. Use the existing developer account. If an item already exists in that account, record its public URL and verify its identity before uploading a replacement; do not create a duplicate. No private signing key is needed for this first-publication ZIP.

**Genuine screenshots and the local Chrome checks now pass.** On 2026-11-18, Chrome for Testing 153.0.8010.12 on macOS 26.7.1 passed all 11 fixture observations, including native fullscreen, Escape, player-style restoration and cross-origin embeds. Three 1280×800 captures and their source/image hashes are in `store/screenshots/`. See [QA](../docs/qa.md).

Store submission still requires the final source to be merged, priority-site checks, public URL verification and dashboard review. This task has not uploaded, submitted or published a store item.

## 1. Validate the release source

Use the updated primary checkout after the reviewed source is merged:

```sh
cd '/Users/kyle/Documents/ChatGPT/Better fullscreen'
git switch main
git pull --ff-only
npm test
npm run test:browser
npm run store:prepare
```

Run each command only after the preceding check succeeds. `store:prepare` validates the committed captures against all packaged extension files; it deliberately exits with status **2** if screenshots are missing or stale. To refresh screenshots after an extension change, run `npm run store:capture` before `npm run store:prepare`. During review, run these commands from the PR checkout that contains the intended extension source.

Prerequisites: Node.js 22+, Python 3 and the installed isolated Chrome for Testing runner. On another machine, set `CHROME_TEST_RUNNER_DIR` to that runner's scripts directory. There are no npm dependencies or extension build step. Included branding PNGs need no regeneration; `npm run store:assets` additionally requires `rsvg-convert`.

Capture uses an owned disposable testing profile and original project demo content. It exercises the actual extension and writes source/image hashes and cleanup results. Inspect `artifacts/qa/browser-results.json`, `store/screenshots/capture.json`, all captured images, and `artifacts/chrome-web-store/READINESS.json`. Require a successful capture, zero leftover processes/profiles, and `readyToUpload: true`. A guide checkmark does not verify these files.

The default agent sandbox denies localhost with `EPERM`. Kyle's current workspace instructions authorize retrying the exact isolated test command through automatic approval review. That route produced these real captures and verified cleanup. Do not substitute a personal Chrome profile or GUI automation. A failure remains a failure; stop if review denies the operation or requires manual approval. Headless runs alone cannot establish macOS native-window behavior.

Before submission, also test YouTube, X/Twitter and Facebook where accessible. Record date, browser/macOS version, URL, login/access state, and outcomes in `docs/qa.md`. Check entry/exit, captions, playback/audio/position, native toggle, native Escape, site override, navigation and cross-origin frames. A demo pass does not prove a third-party site passed. Report authentication/DRM/bot gates without bypassing them or claiming compatibility.

## 2. Select the upload files

`npm run store:prepare` writes these outputs **under the checkout where it runs**:

| Path | Use |
| --- | --- |
| `artifacts/better-fullscreen-0.3.0.zip` | Extension package, with `manifest.json` at its root |
| `artifacts/checksums.txt` and `artifacts/manifest.json` | Package SHA-256 and per-file provenance |
| `artifacts/chrome-web-store/` | Listing kit, package copy and readiness report |
| `artifacts/better-fullscreen-chrome-web-store-kit.zip` | Transfer bundle; extract it before using its files |

Upload **only the extension ZIP** in the kit as the item package. Never upload the listing-kit ZIP as an extension. Match its SHA-256 to `extensionSha256` in `READINESS.json`:

```sh
shasum -a 256 artifacts/chrome-web-store/better-fullscreen-0.3.0.zip
cat artifacts/chrome-web-store/READINESS.json
```

If extension files or version change after capture, rerun tests, capture and preparation. Rebuild any offline guide with embedded downloads as well: loading a new report does not replace an older embedded ZIP or listing kit. Keep one source and one package hash for the submission.

The ready flag covers package/screenshot consistency. It does not verify hosted review approval, live-site compatibility, public URLs, dashboard declarations or publication. Complete those checks separately.

## 3. Create or open the draft item

Open the [Chrome Developer Dashboard](https://chrome.google.com/webstore/devconsole) and sign in to the existing publisher account. Confirm its identity. For a genuinely new item, choose **Add new item**, select `better-fullscreen-0.3.0.zip`, then upload. Creating a draft is separate from submitting for review. See Google's [first-publication procedure](https://developer.chrome.com/docs/webstore/publish).

Keep the assigned draft item ID in the release record so the next session opens the same item. Do not register, pay for, or switch to another publisher account for this preparation.

## 4. Complete the dashboard fields

Use files from the freshly generated `artifacts/chrome-web-store/` directory. Name and short description come from the manifest; check their displayed values. Dashboard category labels can change; choose the closest offered category.

| Dashboard field | File or value |
| --- | --- |
| Name | Better Fullscreen |
| Short description | `listing.json` → `summary` |
| Detailed description | Entire `description.txt` |
| Language | English |
| Category | Closest current option to Productivity / Tools |
| Price / mature content | Free / No |
| Platform in listing and review notes | Chrome 119+ on macOS; replacement is disabled on other operating systems |
| Homepage | `listing.json` → `homepageUrl` |
| Support | `listing.json` → `supportUrl` |
| Privacy policy | `listing.json` → `privacyPolicyUrl` |
| Single purpose | `listing.json` → `singlePurpose` |
| Storage justification | `listing.json` → `storageJustification` |
| HTTP/HTTPS host-access justification | `listing.json` → `hostPermissionsJustification` |
| Remote code | No; use `remoteCodeExplanation` for any explanation field |
| Reviewer instructions | Entire `review-instructions.txt` |

Public project URLs are [support](https://github.com/KyleStay/better-fullscreen/issues), [privacy](https://github.com/KyleStay/better-fullscreen/blob/main/PRIVACY.md), and [homepage](https://github.com/KyleStay/better-fullscreen#readme). Verify all three open while signed out. Source repository visibility alone does not verify every URL.

The reviewer instructions include an original-content demo served with `python3 -m http.server 8000 --directory store/demo` from the repository root. Reviewers need no extension account or credentials. Do not put personal account credentials into the kit.

See Google's [listing fields](https://developer.chrome.com/docs/webstore/cws-dashboard-listing) and [privacy fields](https://developer.chrome.com/docs/webstore/cws-dashboard-privacy).

### Images

| Image | Kit file | Size |
| --- | --- | --- |
| Required store icon | `assets/icon-128.png` | 128×128 PNG |
| Required genuine screenshot(s) | Validated files listed by `READINESS.json`, under `screenshots/` | This project captures three at 1280×800; Google allows one to five |
| Optional small promotional tile | `assets/promo-small.png` | 440×280 |
| Optional marquee | `assets/promo-marquee.png` | 1400×560 |

Inspect every image before upload. Promotional artwork is not a product screenshot. Never substitute generated or mock UI for genuine screenshots. Only use screenshots named in the current verified report; older files may remain from earlier attempts. Google's [image requirements](https://developer.chrome.com/docs/webstore/images) also allow 640×400 screenshots.

### Privacy practices

For this implementation, disclose **Web history** and **Website content** for its limited local handling: current address/hostname and saved disabled-site hostnames, plus player elements/styles and frame/fullscreen state. This is the project's classification based on the code; verify it against the dashboard's current definitions. It sends none of those values to the developer or another server. Local processing still requires an accurate [privacy policy](https://developer.chrome.com/docs/webstore/program-policies/user-data-faq).

Do not select a blanket “does not collect or use any data” declaration. Do not mark personal identifiers, health, payment/financial, authentication, personal communications or precise location data as handled by this extension. It does not log clicks, scrolls or keystrokes for analytics; Escape is only an immediate exit control. Review and certify each limited-use statement against the final package and public policy. All executable JavaScript is packaged; no remote code is fetched.

### Distribution

Review the dashboard's visibility and countries explicitly. Use Public for the intended public listing; choose only the intended regions. Record that choice. Chrome on macOS is the supported environment; do not imply that selecting countries restricts the extension to macOS. Confirm any account-verification requirements shown by the dashboard in the existing account.

## 5. Submit and publish

Before **Submit for review**, confirm:

- The intended source is merged, its local tests pass, and the required visible Chrome run and live-site checks are recorded.
- The exact upload ZIP matches the successful readiness report; screenshot hashes/source and zero-resource cleanup were verified.
- Genuine screenshots and all listing/privacy/reviewer fields describe that package, including the macOS limitation.
- Support and privacy URLs open without authentication; distribution and publisher identity are correct.

Submit through the dashboard only when those conditions hold. Deferred publishing lets you inspect the approved item before making it live; Google currently gives an approved deferred item **30 days** to publish before it returns to draft. Check the actual dashboard status and deadline. A submitted or approved draft is not a live listing. See [submission and deferred publication](https://developer.chrome.com/docs/webstore/publish).

After publication, install from the public store and repeat entry/exit, native fullscreen and site-override checks. Record the canonical store URL, publisher display name, item ID, observed published version, release source SHA, upload ZIP SHA-256, publication date and QA evidence here. Verify the public listing rather than inferring it from a local unpacked extension ID. Record the matching public manifest/key evidence before claiming a future package is a same-ID replacement. Never request or store a private signing key.

## 6. Future updates and recovery

Open the **existing verified item**, increment the version above the published version in both `extension/manifest.json` and `package.json`, refresh versioned docs, and rerun local tests/capture/preparation. On **Package → Upload New Package**, upload the complete new extension ZIP, update changed metadata and declarations, then submit again. Updates retain the existing item identity; do not choose Add new item. See Google's [update procedure](https://developer.chrome.com/docs/webstore/update).

If review reports a defect, preserve the submission details, fix the source, rerun the affected checks and upload the corrected package. If a live release regresses, inspect the dashboard's available rollback options and Google's [update/rollback guidance](https://developer.chrome.com/docs/webstore/update); do not assume an older version number can be uploaded. Keep the last verified package and its checksums as a recovery reference.

All checks run locally. Never add or dispatch GitHub-hosted workflows, create runners/CI credentials, or weaken branch protection to clear a gate. Browser verification, hosted review approval and store submission remain separate gates.
