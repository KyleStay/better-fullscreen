# Chrome Web Store submission

## Current direction

Prepare the first store listing of Better Fullscreen 0.3.0 for Chrome on macOS. There is no existing Chrome Web Store listing or item ID. Keep the publisher identity in the user's existing developer account. No private signing key is needed or requested.

The user authorized making `KyleStay/better-fullscreen` public so its issues and privacy policy can serve customers. Public URLs:

- Support: https://github.com/KyleStay/better-fullscreen/issues
- Privacy: https://github.com/KyleStay/better-fullscreen/blob/main/PRIVACY.md
- Homepage: https://github.com/KyleStay/better-fullscreen#readme

After first publication, record the canonical store URL, publisher display name, public item ID and published version here. Never claim same-ID replacement without that evidence.

## Prepared inputs

Run `npm run store:prepare` to populate `artifacts/chrome-web-store/`. Upload the extension ZIP inside that directory as the item package; do not upload the entire listing-kit directory as an extension.

| Dashboard field | File or value |
| --- | --- |
| Name | Better Fullscreen |
| Short description | `listing.json` → `summary` |
| Detailed description | `description.txt` |
| Language | English |
| Category | Closest current dashboard category for Productivity / Tools; confirm its actual label in the account |
| Price / audience | Free; not mature content; Chrome on macOS |
| Icon | `assets/icon-128.png` |
| Small promotional tile | `assets/promo-small.png` (440×280) |
| Optional marquee | `assets/promo-marquee.png` (1400×560) |
| Screenshots | Three genuine 1280×800 captures under `screenshots/`, once generated and verified |
| Single purpose | `listing.json` → `singlePurpose` |
| Storage permission | `listing.json` → `storageJustification` |
| Host permissions | `listing.json` → `hostPermissionsJustification` |
| Remote code | No; all executable code is packaged |
| Test instructions | `review-instructions.txt`; reviewer must use macOS |

## Privacy practices

Disclose **Web history** and **Website content** for the limited local processing described in the policy: the current address/hostname, saved disabled-site hostnames, and player elements/styles. Do not select a blanket “does not collect or use any data” declaration: Google says local-only handling still needs disclosure. The extension sends none of those values to the developer or another server.

It does not collect personal identifiers, health, payment/financial, authentication, personal communications or precise location information. It does not log clicks, scrolls or keystrokes for analytics. Escape is handled only as the immediate control needed to exit the media view. Certify the limited-use statements only after checking they match the actual final package.

## Genuine screenshots and runtime verification

The in-app source is instrumented only through normal user actions by `npm run store:capture`. It serves the original, project-owned video demo and loads the actual unpacked extension in an isolated Chrome for Testing profile. The demo contains no third-party branding or copyrighted media. No generated image is presented as a product screenshot.

From a regular Terminal on the Mac:

```sh
cd '/Users/kyle/Documents/ChatGPT/Better fullscreen'
npm run store:capture && npm run store:prepare
```

This command has not completed in the agent sandbox: localhost `listen` is denied with `EPERM` before Chrome launches. The existing policy forbids escalation or substituting a permission-gated GUI route. The capture script is prepared and syntax-checked; its browser assumptions and the extension still require a successful real run. It records source hashes, screenshot hashes, test observations and cleanup. A failed run cannot mark screenshots verified. Do not upload while `READINESS.json` says `readyToUpload: false`.

Before release, also exercise real priority sites and document access/login gates and outcomes. A fixture run does not prove YouTube, X/Twitter or Facebook compatibility.

## Submit with the existing developer account

1. Open the [Chrome Developer Dashboard](https://chrome.google.com/webstore/devconsole) and sign in to the existing publisher. Do not create or pay for another account.
2. Add a new item and upload `better-fullscreen-0.3.0.zip`.
3. Fill Store listing, Privacy, Distribution and Test instructions using the prepared files.
4. Inspect every image and verify the support/privacy URLs open without authentication.
5. Once runtime checks and readiness pass, submit for review. Deferred publishing is available if you want to review the approved listing before making it live.

No dashboard upload, review submission or publication has been performed by this preparation workflow. No GitHub-hosted CI is used; do not create Pages workflows, hosted validation or runners for this kit.

## Official requirements checked

- [Prepare your extension](https://developer.chrome.com/docs/webstore/prepare): test locally and keep `manifest.json` at the ZIP root.
- [Listing information](https://developer.chrome.com/docs/webstore/cws-dashboard-listing): store icon and at least one screenshot are required; promotional tiles are optional.
- [Images](https://developer.chrome.com/docs/webstore/images): 128px PNG icon with normalized artwork; screenshots 1280×800 or 640×400; promo 440×280 and optional marquee 1400×560.
- [Privacy fields](https://developer.chrome.com/docs/webstore/cws-dashboard-privacy) and [user-data FAQ](https://developer.chrome.com/docs/webstore/program-policies/user-data-faq): local-only processing still needs accurate disclosure and a privacy policy.
- [Publish](https://developer.chrome.com/docs/webstore/publish): upload, complete metadata, submit for review, and optionally defer publication.
