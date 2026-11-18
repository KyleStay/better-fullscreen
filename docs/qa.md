# Verification

## Current candidate: 0.3.0

All 29 local tests pass. They cover unchanged tab/window identity, session concurrency and recovery, site overrides, reversible player styles, native controls and Escape, messaging boundaries, CDP input visibility, and rejection of missing/stale captures. These tests simulate browser APIs and DOM objects.

## Real Chrome evidence — 2026-11-18

The actual extension passed all 11 fixture observations in visible Chrome for Testing **153.0.8010.12** on **macOS 26.7.1**. The capture receipt is [store/screenshots/capture.json](../store/screenshots/capture.json). It records extension-source hashes, each image hash, checks, browser version, and zero remaining browser processes/profiles after cleanup. The demo contains project-owned animated content.

| Area | Observed result |
| --- | --- |
| Stable viewport | Same viewport dimensions, browser-window bounds, tab/window identity and tab count; player fills viewport without popup |
| Playback | Demo video remains playing and its time advances across viewport entry |
| Native control | A real input click enters native fullscreen; the toggle returns to viewport mode |
| Escape | Restores page layout after the player receives keyboard focus |
| Player exit | Player exit-fullscreen control restores the page |
| Return control | Returns to the page from both viewport and native fullscreen |
| Style restoration | Real CSSOM preserves partial longhands, priorities, variables and logical/physical declaration order; unrelated color updates survive |
| Navigation | Clears the viewport session |
| Site override | Disabled site passes media requests through to native fullscreen |
| Non-media | Slide fullscreen keeps native behavior |
| Cross-origin embed | Child video fills the parent viewport; focused-child Escape restores the page |

Captured and visually inspected three genuine **1280×800** PNGs:

- [Viewport media view](../store/screenshots/01-viewport.png)
- [Native fullscreen](../store/screenshots/02-native-fullscreen.png)
- [Returned page](../store/screenshots/03-return-to-page.png)

The first real run found a harness race: session storage clears before content-script broadcasts and main-world layout rollback finish. The shared return helper now waits for both session clearance and visible page restoration. It also waits for the toolbar position to settle before clicking during macOS native fullscreen animation. Both the standard fixture and store capture pass; extension behavior is unchanged. The window comparison excludes the focus flag changed by real test input; identical bounds, state and identity are still required.

The workspace sandbox initially denied localhost with `EPERM`. The exact repository entry point subsequently ran through automatic approval review under Kyle's updated workspace instructions. Both runs cleaned up their owned processes and profiles. No personal Chrome profile, CUA or GUI alternative was used.

`npm run store:prepare` checks the committed source and image hashes, capture success/cleanup, version and dimensions before reporting ready. Promotional artwork remains separate from genuine screenshots. Regenerate screenshots with `npm run store:capture` whenever packaged extension files change.

## Checks still required before store submission

| Area | Remaining observation |
| --- | --- |
| macOS native Escape | Exercise Escape while native fullscreen is active; fixture verifies native toggle and Return to page, not this OS-managed behavior |
| Real media playback | Audio, seeking, captions, quality and protected-media behavior on actual sites; demo evidence covers playing canvas video only |
| YouTube | Public video, captions, settings, exit and next-video navigation |
| X/Twitter | Public/signed-in video where accessible, captions and feed navigation |
| Facebook | Public/signed-in video where accessible, captions and feed navigation |
| Embeds | Broader nested/third-party frame coverage beyond the cross-origin fixture |
| Public URLs | Homepage, support and privacy URLs work while signed out |

Authentication, DRM, availability and bot checks are gates to report, not work around. Record URLs, date, access state and actual results; a fixture pass does not establish third-party compatibility.
