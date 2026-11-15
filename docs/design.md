# Better Fullscreen

## Current direction

Build a Chrome extension for macOS that replaces website media fullscreen requests with a media view filling the **current browser viewport**. Keep the tab, browser window, and its dimensions unchanged. Enable replacement across permitted websites by default with a per-site off switch. Leave non-media requests alone.

Priority websites are YouTube, X/Twitter, and Facebook. Aim for broad compatibility across mainstream video websites, verify priority sites first, and report actual coverage. A fixed thirty-site acceptance list is not required.

## Controls and lifecycle

Escape ends viewport mode and restores the original page layout, including when a player or embedded frame has keyboard focus. Also provide **Return to page** and support compatible player exit controls.

Provide **Native fullscreen** beside the return control. Invoke the genuine browser API directly from the click, bypassing the website hook. It fullscreens the root document so the media view, embedded players, and return controls remain visible. While native fullscreen is active, relabel the button **Exit native fullscreen** and allow Chrome to handle Escape. The return control leaves both modes. A failed native request keeps the viewport view and displays an error.

Show these as compact icon buttons: four outward corners for Native fullscreen, inward corners for Exit native fullscreen, and an × for Return to page. Keep action names as tooltips and accessible labels, with a visible keyboard-focus indicator and 44-pixel click targets.

Keep the original live document rather than duplicating media. There are no popup windows or placeholder tabs. Navigation or closing the tab clears its session. Site overrides and unsupported requests retain native behavior.

If viewport setup fails, restore the original layout and attempt native fullscreen when activation permits it; otherwise offer **Use browser fullscreen** for a fresh click. Do not report success when neither view opened.

## Acceptance checks

- Media fills the current viewport with identical window dimensions and tab placement.
- No popup, placeholder, display maximization or new macOS Space is created by the default mode.
- Escape, Return to page and compatible player exit controls restore layout and keyboard focus.
- Native fullscreen uses the real API from a fresh click; its toggle returns to viewport mode, and Return to page exits both modes.
- Native failure preserves the current media view with usable controls.
- Playback, captions and controls survive mode changes on verified sites.
- Site overrides, unsupported players, navigation and embedded frame coordination work as documented.
- Record actual live-site and browser verification separately from simulated tests.

## Accepted scope

The original popup design was approved on November 12, 2026. The user subsequently requested stable browser-viewport sizing, explicitly chose **Fill the current tab**, and requested a native fullscreen button. This supersedes the popup sizing, window movement and placeholder decisions. See [ADR 0002](adr/0002-fill-the-current-viewport.md) and [QA](qa.md).

## Platform constraints

A viewport replacement does not create genuine browser fullscreen state or its native CSS top layer. It uses reversible layout changes and compatible page events. Native fullscreen remains a separate explicit action. See the [Fullscreen standard](https://fullscreen.spec.whatwg.org/) and [Chrome content scripts](https://developer.chrome.com/docs/extensions/reference/manifest/content-scripts).

Native fallback after an asynchronous failure is best effort: activation may expire. See the [HTML activation model](https://html.spec.whatwg.org/multipage/interaction.html#transient-activation).
