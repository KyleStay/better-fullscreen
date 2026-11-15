# Better Fullscreen

A Chrome extension for macOS that fills the **current browser viewport** with a website's video player. The tab stays in its window without resizing it. Choose **Native fullscreen** when you want the whole display.

## Install or update locally

1. Open `chrome://extensions` in Chrome and enable **Developer mode**.
2. Choose **Load unpacked** and select this repository's `extension` folder. If already installed from that folder, exit any media view and click its **Reload** button instead.
3. Reload open video pages.
4. Use the video's fullscreen button. Press **Esc** or choose **Return to page** to go back.

The ZIP in `artifacts` contains the same extension files. Extract it and select the extracted folder if installing from the ZIP.

Click the extension's toolbar icon to turn replacement off for the current site. Overrides apply to the displayed hostname (with `www.` treated as the same host); other subdomains have separate settings.

## Media view

- Website media fullscreen fills the current tab without moving it, creating a popup, or resizing its window.
- **Escape** and **Return to page** restore the page layout. Compatible player exit controls also restore it.
- **Native fullscreen** enters Chrome's real fullscreen using the current view. The button changes to **Exit native fullscreen** to return to viewport mode. Chrome handles Escape while native fullscreen is active.
- **Return to page** also leaves native fullscreen if active.
- Media-view controls use corner icons for entering/leaving native fullscreen and **×** for Return to page. Hover for action names; keyboard and screen-reader labels remain available.
- Navigating away ends the view. The original player document stays alive while changing modes.

## Compatibility and current status

Version 0.3.0 prepares the in-tab viewport extension for its first store listing, with icon controls, packaged privacy information and store artwork. It passes local logic tests. **Chrome rendering, actual native fullscreen, and live YouTube, X/Twitter, and Facebook playback remain unverified until the capture/runtime checks succeed.** The isolated browser attempt is blocked because this workspace's sandbox rejects localhost sockets (`EPERM`). See [QA](docs/qa.md).

The extension wraps website JavaScript Fullscreen API calls and recognizes video players. It expands the requested element, mirrors readable fullscreen CSS, and notifies page controls. Embedded players are supported when Chrome grants content-script access to the frames.

Compatibility is best effort. Browser-provided video controls, protected/internal Chrome pages, inaccessible frames, closed shadow-root players, and players requiring genuine fullscreen may use native fullscreen or need the site override. Chrome's fullscreen command and the macOS green window button retain their normal behavior.

Known unsupported requests pass through immediately. If the media view cannot start, the extension attempts native fullscreen; Chrome may require another click on **Use browser fullscreen**. No claim of thirty verified sites is made.

## Local development

No build step or runtime dependencies are required. Chrome loads `extension/manifest.json` directly. Node.js 22 or newer and Python 3 are needed for the local tools.

```sh
npm test
npm run test:browser
npm run package
```

`npm test` checks viewport sessions, unchanged tabs/windows, failure recovery, the page hook, Escape, native fullscreen button activation, and trust boundaries using simulated browser APIs and DOM objects. It does not replace a real-browser check.

`npm run test:browser` uses Kyle's permission-free Chrome for Testing runner in an owned disposable profile. Override `CHROME_TEST_RUNNER_DIR` to point to its scripts directory on another machine. The fixtures cover playing video, transformed ancestors, unchanged viewport/window dimensions, native fullscreen toggling, return controls, navigation, pass-through and cross-origin embeds. Its cleanup closes owned Chrome through CDP, verifies process shutdown, and removes its disposable profile. `HEADLESS=1` is available; validate macOS native fullscreen in a visible run.

All checks are local. There are no hosted CI workflows.

## Permissions and privacy

HTTP and HTTPS site access installs the fullscreen hook before player scripts, including in permitted frames. `storage` keeps site overrides and temporary session tokens. Display and tab-group permissions are no longer requested. The extension makes no network requests, collects no analytics, and sends no browsing data to a server.

Read the [privacy policy](PRIVACY.md) or [open an issue](https://github.com/KyleStay/better-fullscreen/issues) for support.

## Chrome Web Store preparation

No Chrome Web Store listing exists yet. The package is for first publication. The repository is public at the owner's request so support and the privacy policy are accessible without an invitation.

`npm run store:prepare` writes the package, listing copy, privacy instructions, icons and promotional images into `artifacts/chrome-web-store/`. It exits with a clear not-ready result until authentic screenshots pass validation.

On a Mac that permits the isolated browser's localhost connections, run `npm run store:capture && npm run store:prepare` to exercise the real extension and generate three 1280×800 screenshots from original demo content. `store:assets` regenerates vector branding through `rsvg-convert`; the ready PNGs are already included. See [publishing instructions](store/PUBLISHING.md). No hosted CI, Pages build, developer credentials or account registration is needed for preparation.

See the [design](docs/design.md), [glossary](GLOSSARY.md), and [viewport decision](docs/adr/0002-fill-the-current-viewport.md).
