# Verification

## Current candidate: 0.2.0

All 21 local tests pass. They cover unchanged window/tab identity, viewport sessions, concurrent requests, navigation, service worker restart, site overrides, reversible player layout, Escape capture, native fullscreen activation/toggling, return from native mode, failure recovery and messaging boundaries. Browser APIs and DOM objects are simulated.

The real-browser fixture harness now asserts that viewport and browser-window dimensions stay unchanged, no tabs are created, playback continues, native fullscreen toggles correctly, and Escape restores the page. It also covers player exit, Return to page from native fullscreen, navigation, native pass-through and cross-origin embeds. **This updated browser harness has not run in Chrome here.**

## Environment blocker

The earlier 0.1.0 browser attempt on November 12, 2026 stopped before launching Chrome: the sandbox rejected listening on `127.0.0.1` with `EPERM`. The original receipt is `artifacts/qa/browser-results.json`. It is historical environment evidence, not a 0.2.0 runtime test. No repeated browser attempt or alternate route was used for this change. No test browser or disposable profile was created.

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
