---
status: superseded by ADR-0002
---

# Preserve the original tab for the media popup

Temporarily move the original tab into a popup and restore it when the media view ends. Keeping the live document is the strongest candidate for preserving playback, authentication, captions, and player controls across sites; cloning a video or reopening its URL cannot reliably preserve those relationships. The accepted tradeoff is that the tab temporarily leaves its original window, and restoration and uninterrupted playback must be verified in Chrome.
