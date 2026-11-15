# Verification

## Current candidate: 0.3.0

Local tests cover unchanged window/tab identity, viewport sessions, concurrent requests, navigation, service worker restart, site overrides, reversible player layout, Escape capture, native fullscreen activation/toggling, icon state and accessible labels, return from native mode, failure recovery, messaging boundaries and rejection of missing/stale store screenshots. Browser APIs and DOM objects are simulated.

The real-browser fixture harness now asserts that viewport and browser-window dimensions stay unchanged, no tabs are created, playback continues, native fullscreen toggles correctly, and Escape restores the page. It also covers player exit, Return to page from native fullscreen, navigation, native pass-through and cross-origin embeds. **This updated browser harness has not run in Chrome here.**

## Environment blocker

The 0.3.0 preparation reran the browser harness under the current environment. It stopped before launching Chrome: the sandbox rejected listening on `127.0.0.1` with `EPERM`. The current receipt is `artifacts/qa/browser-results.json`; it identifies the attempted run and failure. No alternate browser route was used, and no test browser or disposable profile was created.

The store capture mode serves `store/demo/index.html`, an original animated scene, and exercises the same actual extension. Screenshots are copied to `store/screenshots/` and receive a success receipt only after the browser checks and cleanup pass. `store:prepare` rejects missing screenshots, changed source, changed image bytes and incorrect dimensions. Promotional artwork is explicitly separate from screenshots.

## Runtime checks still required

Run `npm run test:browser` when the environment permits the isolated runner's localhost server and debugging socket. Verify the harness assumptions on its first successful run, then inspect the controls and test real sites.

| Area | Required observation | Current evidence |
| --- | --- | --- |
| Stable viewport | Same viewport, window bounds, tab and tab count through entry/exit; no popup | Simulated logic tests only |
| Escape | Restores page with focus in player controls and cross-origin frames | Simulated event tests only |
| Native button | Fresh click enters real fullscreen; toggle returns to viewport; Return to page exits both modes | Simulated API tests only |
| macOS native Escape | Native Escape follows Chrome behavior without trapping the user | Unverified |
| Playback | Audio, playback position, captions, controls and quality survive both modes | Unverified |
| YouTube | Public video, captions, settings, exit control and next-video navigation | Unverified |
| X/Twitter | Public and signed-in video where accessible, captions and feed navigation | Unverified |
| Facebook | Public and signed-in video where accessible, captions and feed navigation | Unverified |
| Embeds | Cross-origin/nested frame sizing and keyboard focus | Fixture present; runtime blocked |
| Interface | Native fullscreen/Exit native fullscreen, Return to page, errors, checkbox, help and keyboard focus | Source and simulated DOM checks only |

Authentication, DRM, availability and bot checks are gates to report, not work around. Record site URLs, date, access state and observed results; a generic adapter does not establish a site passed.
